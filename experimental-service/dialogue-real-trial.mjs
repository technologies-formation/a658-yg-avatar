// Assemblage préparé sans lanceur : désactivé par défaut, clé explicite, registre dédié.
import {isAbsolute, dirname} from 'node:path'
import { createRealSession } from './real-session.mjs'
import { createDialogueBudget } from './dialogue-budget.mjs'
import { createOpenAIDialogueProvider } from './openai-dialogue.mjs'
import { createRealDialogueTrialSession, DialogueError } from './dialogue-session.mjs'
import { createDialogueInterface } from './dialogue-interface.mjs'
import { createPilotPrivateHandler } from './pilot-private.mjs'

export function createRealDialogueTrialInterface(options = {}) {
  const { enabled = false } = options
  if (typeof enabled !== 'boolean') throw new DialogueError('configuration')
  if (!enabled) return createPilotPrivateHandler({ enabled: false })
  if (options.paidTrialAuthorized !== true) throw new DialogueError('configuration')
  const { budgetDirectory, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 30000, pathwayTrial = null, ...interfaceOptions } = options
  if (pathwayTrial && (pathwayTrial.enabled !== true || pathwayTrial.paidTrialAuthorized !== true || !isAbsolute(pathwayTrial.stateFile||'') || !isAbsolute(pathwayTrial.reportFile||'') || dirname(pathwayTrial.stateFile)!==dirname(pathwayTrial.reportFile) || pathwayTrial.stateFile===pathwayTrial.reportFile || pathwayTrial.stateFile === options.stateFile)) throw new DialogueError('configuration')
  const budget = createDialogueBudget({ directory: budgetDirectory, singleInstance: true })
  try {
    const provider = createOpenAIDialogueProvider({ enabled: true, paidTrialAuthorized: true, apiKey, budget, fetchImpl, timeoutMs })
    const gateway = createDialogueInterface({ ...interfaceOptions, enabled: true, timeoutMs }, {
      budgetStatus: budget.status,
      ...(pathwayTrial ? { pathwaySession: createRealSession({ stateFile: pathwayTrial.stateFile, reportFile: pathwayTrial.reportFile, singleInstance: true, fetchImpl: pathwayTrial.fetchImpl ?? fetchImpl }) } : {}),
      createSession: (references,restored={}) => createRealDialogueTrialSession({ enabled: true, paidTrialAuthorized: true,
        references,initialProfile:restored.profile??{},initialModality:restored.modality??'', provider, maxTurns: 10, timeoutMs, maxHistoryCharacters: 32000 }),
    })
    return { ...gateway, budgetStatus: budget.status,
      close() { gateway.close(); budget.close() },
      stop() { gateway.stop(); budget.stop() },
    }
  } catch (error) { budget.close(); throw error }
}

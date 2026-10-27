import {trackConsumption,calculatedUsage} from './consumption-ledger.mjs'
// Assemblage préparé sans lanceur : désactivé par défaut, clé explicite, registre dédié.
import {isAbsolute, dirname} from 'node:path'
import {createPathwayValidation,VALIDATION_SERIES} from './pathway-validation.mjs'
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
  const { budgetDirectory, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 30000, pathwayTrial = null, unlimited = false, ...interfaceOptions } = options
  if (typeof unlimited !== 'boolean' || (unlimited && pathwayTrial?.series)) throw new DialogueError('configuration')
  if (pathwayTrial && (pathwayTrial.enabled !== true || pathwayTrial.paidTrialAuthorized !== true || !isAbsolute(pathwayTrial.stateFile||'') || !isAbsolute(pathwayTrial.reportFile||'') || dirname(pathwayTrial.stateFile)!==dirname(pathwayTrial.reportFile) || pathwayTrial.stateFile===pathwayTrial.reportFile || pathwayTrial.stateFile === options.stateFile)) throw new DialogueError('configuration')
  const budget = createDialogueBudget({ directory: budgetDirectory, singleInstance: true, unlimited })
  try {
    const provider = createOpenAIDialogueProvider({ enabled: true, paidTrialAuthorized: true, apiKey, budget, fetchImpl, timeoutMs, unlimited })
    const observedProvider=options.consumption?{...provider,respond:(payload,context)=>trackConsumption(options.consumption.ledger,'assistant','dialogue',()=>provider.respond(payload,context),calculatedUsage)}:provider
    if(pathwayTrial?.series&&(pathwayTrial.series!==VALIDATION_SERIES||pathwayTrial.validationAuthorized!==true))throw new DialogueError('configuration')
    const validation=pathwayTrial?.series?createPathwayValidation({directory:pathwayTrial.directory,fetchImpl:pathwayTrial.fetchImpl??fetchImpl}):null
    const gateway = createDialogueInterface({ ...interfaceOptions, enabled: true, timeoutMs, unlimited }, {
      budgetStatus: budget.status,validation,
      ...(pathwayTrial ? { pathwaySession: validation?.session??createRealSession({ stateFile: pathwayTrial.stateFile, reportFile: pathwayTrial.reportFile, singleInstance: true, unlimited, fetchImpl: pathwayTrial.fetchImpl ?? fetchImpl }) } : {}),
      createSession: (references,restored={}) => createRealDialogueTrialSession({ enabled: true, paidTrialAuthorized: true,
        references,initialProfile:restored.profile??{},initialModality:restored.modality??'', provider:observedProvider, maxTurns: 10, timeoutMs, unlimited, maxHistoryCharacters: 32000 }),
    })
    return { ...gateway, budgetStatus: budget.status,
      close() { gateway.close(); budget.close() },
      stop() { gateway.stop(); budget.stop() },
    }
  } catch (error) { budget.close(); throw error }
}

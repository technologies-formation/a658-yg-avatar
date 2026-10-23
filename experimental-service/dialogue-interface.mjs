// Interface de simulation opt-in, sans lanceur ni fournisseur réel.
import { readFileSync } from 'node:fs'
import { createDialogueSession, DialogueError } from './dialogue-session.mjs'
import { PROFILE_FIELDS, validateProfileReferences, normalizePathwayProfile } from './profile-references.mjs'
import { createPilotSimulation } from './pilot-simulation.mjs'
import { createPilotPrivateHandler } from './pilot-private.mjs'
import { createPrivateResources } from './private-resources.mjs'
const fail = code => { throw new DialogueError(code) }
const template = readFileSync(new URL('./messaging-page.html', import.meta.url), 'utf8')

// Faux transport volontairement borné : démonstration de quelques formulations explicites.
// Pas d’analyse sémantique ni sélection de formations.
export function createFictitiousDialogueProvider() {
  return { mode: 'simulation', async respond({ draft, references, messages }) {
    const last = messages.at(-1), text = last.text.trim(), changes = []
    const add = (field, value) => { if (value && value !== (field === 'modality' ? draft.modality : draft.profile[field])) changes.push({ field, value,
      evidence: [{ messageId: last.id, quote: text }] }) }
    const role = text.match(/(?:métier\s*:|je suis)\s*(assistant[e]? administrati[fv]e?)[.!\s]*$/i)
    if (role) add('role', role[1])
    const objective = text.match(/^(?:objectif\s*:\s*|je voudrais\s+|j’aimerais\s+|j'aimerais\s+)(.{10,})$/i)
    if (objective) add('objective', objective[1])
    for (const name of ['personnelCategory', 'managerStatus']) {
      const match = references.pathway.fields[name].options.find(x => [x.value, x.label].some(v => v.toLowerCase() === text.toLowerCase()))
      if (match) add(name, match.value)
    }
    if (['Je débute', 'Quelques bases', 'Expérience confirmée'].includes(text)) add('existingSkills', text)
    if (['Moins d’une journée', '1 à 2 jours', '3 à 5 jours', 'À définir'].includes(text)) add('timeAvailable', text)
    if (['Présentiel', 'En ligne', 'Indifférent'].includes(text)) add('modality', text)
    return { kind: changes.length ? 'recap' : 'ask', changes,
      reply: changes.length ? 'À ajouter à votre profil :' :
        'Ce fournisseur est fictif et reconnaît quelques formulations de test. Vous pouvez écrire « Je voudrais mieux organiser mes tâches et mes priorités », « Je suis assistant administratif », ou compléter les repères dans Mon profil.' }
  } }
}
export function renderDialogueSimulationPage(references, options = {}) {
  return renderDialoguePage(references, options, false)
}
export function renderDialogueTrialPage(references, options = {}) {
  return renderDialoguePage(references, options, true)
}
function renderDialoguePage(references, { timeoutMs = 10000 } = {}, realTrial) {
  const contract = validateProfileReferences(references)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) fail('configuration')
  return template.replace('/*MESSAGING_CONFIG*/', JSON.stringify({ references: contract, timeoutMs, mode: 'simulation', dialogue: realTrial ? 'real-trial' : 'fictitious' }).replace(/</g, '\\u003c'))
    .replace('/private/messaging-client.mjs', '/private/dialogue-client.mjs')
    .replace('Pilote privé · simulation uniquement', realTrial ? 'Essai dialogue IA · parcours simulés · 10 tentatives maximum' : 'Dialogue fictif · aucun appel OpenAI')
}
export function createDialogueSimulationInterface(options = {}) {
  return createDialogueInterface(options)
}
// Assemblage serveur partagé ; aucun lanceur existant ne fournit de chemin réel.
export function createDialogueInterface(options = {}, trial = null) {
  const { enabled = false } = options
  if (typeof enabled !== 'boolean') fail('configuration')
  if (!enabled) return createPilotPrivateHandler({ enabled: false })
  const dialogueMode = trial ? 'real' : 'simulation'
  const { publicOrigin, users, isSecureRequest, stateFile, loadProfileReferences, preview, timeoutMs = 10000 } = options
  const simulation = createPilotSimulation({ stateFile, maxDailyRequests: 5, maxTotalRequests: 5, singleInstance: true, loadProfileReferences, preview })
  const sessions = new Map()
  const entry = async identity => {
    const refs = validateProfileReferences(await simulation.getReferences())
    let value = sessions.get(identity.id)
    if (value && value.references.revision !== refs.revision) fail('references_changed')
    if (!value) {
      if (sessions.size >= 8) fail('busy')
      value = { references: refs, session: trial ? trial.createSession(refs) : createDialogueSession({ enabled: true, references: refs,
        provider: createFictitiousDialogueProvider(), maxTurns: 10, timeoutMs }) }
      sessions.set(identity.id, value)
    }
    return value
  }
  const resources = createPrivateResources(simulation, trial ? renderDialogueTrialPage : renderDialogueSimulationPage, timeoutMs)
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.end(JSON.stringify(body))
  }
  const gateway = createPilotPrivateHandler({ enabled: true, publicOrigin, session: simulation, users, isSecureRequest,
    maxAttempts: 100, windowMs: 60000,
    beforePathway: async ({ identity, profile, referenceRevision }) => {
      const value = await entry(identity), draft = value.session.getDraft()
      if (referenceRevision !== value.references.revision) fail('references_changed')
      if (!draft.profile.existingSkills?.trim() || !draft.profile.timeAvailable?.trim() || !draft.modality) fail('invalid_profile')
      const accepted = value.session.getPathwayProfile({ expectedRevision: draft.revision })
      let submitted
      try { submitted = normalizePathwayProfile(profile, value.references) } catch { fail('invalid_profile') }
      if (PROFILE_FIELDS.some(k => (accepted[k] || '') !== (submitted[k] || ''))) fail('stale_profile')
    },
    serveResource: async (req, res, context) => {
      if (req.method === 'GET' && req.url === '/private/dialogue-client.mjs') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
        res.end(readFileSync(new URL('./dialogue-client.mjs', import.meta.url), 'utf8')); return true
      }
      if (req.url !== '/private/dialogue') return resources(req, res, context)
      try {
        if (!['GET', 'POST'].includes(req.method)) { send(res, 405, { error: 'Méthode refusée' }); return true }
        if (req.method === 'POST' && req.headers.origin !== publicOrigin) { send(res, 403, { error: 'Origine requise' }); return true }
        const value = await entry(context.identity), session = value.session
        if (req.method === 'GET') { send(res, 200, { mode: dialogueMode, pathwayMode: 'simulation', draft: session.getDraft(), proposal: session.getProposal(), references: value.references, ...(trial ? { usageRecords: session.getUsage(), budget: trial.budgetStatus() } : {}) }); return true }
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') { send(res, 415, { error: 'JSON requis' }); return true }
        const chunks = []; let bytes = 0
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 16000) { send(res, 413, { error: 'Requête trop volumineuse' }); return true } chunks.push(chunk) }
        let body
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { send(res, 400, { error: 'JSON invalide' }); return true }
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid_request')
        let result
        if (body.action === 'turn') result = await session.turn({ ...body, signal: context.signal })
        else if (body.action === 'accept') result = { draft: session.acceptProposal(body) }
        else if (body.action === 'reject') result = { draft: session.rejectProposal(body) }
        else if (body.action === 'edit') result = { draft: session.editProfile(body.profile, body) }
        else fail('invalid_request')
        if (!context.signal.aborted) send(res, 200, { ...result, mode: dialogueMode, pathwayMode: 'simulation', ...(trial ? { usageRecords: session.getUsage(), budget: trial.budgetStatus() } : {}) })
      } catch (error) {
        const code = error instanceof DialogueError ? error.code : 'service_unavailable'
        const status = ['stale_profile', 'stale_proposal', 'proposal_pending', 'references_changed', 'busy', 'duplicate_request'].includes(code) ? 409 : ['quota_exceeded', 'budget_stopped'].includes(code) ? 429 : code === 'timeout' ? 504 : code === 'disabled' ? 503 : 400
        if (!context.signal.aborted && !res.writableEnded) send(res, status, { code, error: 'Dialogue non abouti. Profil conservé ; aucune relance automatique.' })
      }
      return true
    },
  })
  return { handler: gateway.handler, status: simulation.status,
    close() { for (const item of sessions.values()) item.session.stop() },
    revoke(id) { sessions.get(id)?.session.stop(); return gateway.revoke(id) },
    stop() { for (const item of sessions.values()) item.session.stop(); gateway.stop() },
  }
}

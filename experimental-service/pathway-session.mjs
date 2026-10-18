// Préparation serveur : aucun import par la page, le simulateur ou une route HTTP.
// Aucun accès réseau, fichier ou environnement tant que la fabrique reste désactivée.
import { isAbsolute } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createGuard } from './server.mjs'
import { createProfileReferencesClient, normalizePathwayProfile } from './profile-references.mjs'
import { createPathwayAdapter, PathwayAdapterError } from './pathway-adapter.mjs'

const fail = (code, message, status) => { throw new PathwayAdapterError(code, message, status) }

export function createPathwaySession({
  enabled = false,
  endpoint,
  referencesEndpoint,
  allowedOrigins,
  pathwayTimeoutMs,
  referenceTimeoutMs = 5000,
  stateFile,
  singleInstance = false,
  maxDailyRequests,
  maxTotalRequests,
  isEnabled = () => true,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof enabled !== 'boolean') fail('configuration', 'Activation booleenne explicite requise')
  if (!enabled) return {
    status: () => ({ enabled: false, busy: false }),
    stop() {},
    async getReferences() { fail('disabled', 'Raccordement desactive', 503) },
    async buildPathway() { fail('disabled', 'Raccordement desactive', 503) },
  }

  let pathwayUrl, referencesUrl
  try { pathwayUrl = new URL(endpoint); referencesUrl = new URL(referencesEndpoint) }
  catch { fail('configuration', 'Destinations explicites requises') }
  if (pathwayUrl.origin !== referencesUrl.origin || !Array.isArray(allowedOrigins) ||
      !allowedOrigins.includes(pathwayUrl.origin) || singleInstance !== true ||
      typeof stateFile !== 'string' || !isAbsolute(stateFile) ||
      !Number.isInteger(pathwayTimeoutMs) || pathwayTimeoutMs < 1 || pathwayTimeoutMs > 210000 ||
      !Number.isSafeInteger(maxDailyRequests) || maxDailyRequests < 1 ||
      !Number.isSafeInteger(maxTotalRequests) || maxTotalRequests < 1 || typeof isEnabled !== 'function') {
    fail('configuration', 'Origine, instance unique, fichier prive, delai et quotas explicites requis')
  }
  const referencesClient = createProfileReferencesClient({
    endpoint: referencesEndpoint, allowedOrigins, timeoutMs: referenceTimeoutMs, fetchImpl,
  })
  // Le lecteur est revalidé une seule fois avant réservation du quota. Le cliché
  // immuable est ensuite partagé avec l'adaptateur, sans seconde lecture réseau.
  let currentReferences = null
  const adapter = createPathwayAdapter({
    enabled: true, endpoint, timeoutMs: pathwayTimeoutMs, fetchImpl,
    referencesClient: { refresh: async () => currentReferences, getCurrent: () => currentReferences },
  })
  const token = randomBytes(32).toString('hex')
  let stopped = false, active = null
  const acceptedIds = new Set()
  const allowed = () => {
    if (stopped) return false
    try { return isEnabled() === true } catch { return false }
  }
  const guard = createGuard({
    token, stateFile, maxDailyRequests, maxTotalRequests, enabled: allowed,
    getProfileReferences: () => currentReferences,
  })
  function checkEnabled() {
    if (!allowed() || guard.status().stopped) fail('disabled', 'Raccordement desactive', 503)
  }
  async function exclusive(signal, operation) {
    checkEnabled()
    if (signal?.aborted) fail('cancelled', 'Demande annulee')
    if (active) fail('busy', 'Une demande est deja en cours ; aucune mise en file', 409)
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    active = controller
    try { return await operation(controller.signal) }
    catch (error) {
      if (controller.signal.aborted) fail('cancelled', 'Demande annulee')
      throw error
    } finally { signal?.removeEventListener('abort', onAbort); active = null }
  }
  async function readReferences(signal) {
    try { return await referencesClient.refresh({ signal }) }
    catch {
      if (signal.aborted) fail('cancelled', 'Demande annulee')
      fail('references_unavailable', 'Referentiel indisponible ; brouillon conserve', 503)
    }
  }
  return {
    status() { return { enabled: allowed() && !guard.status().stopped, busy: active !== null, ...guard.status() } },
    stop() {
      stopped = true
      try { guard.stop() } finally { active?.abort() }
    },
    async getReferences({ signal } = {}) {
      return exclusive(signal, async currentSignal => {
        const references = await readReferences(currentSignal)
        checkEnabled()
        return references
      })
    },
    async buildPathway(profile, { confirmed = false, referenceRevision, requestId, signal } = {}) {
      checkEnabled()
      if (confirmed !== true) fail('unconfirmed', 'Confirmation explicite requise', 400)
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(requestId)) {
        fail('invalid_request_id', 'Identifiant de demande serveur requis', 400)
      }
      if (acceptedIds.has(requestId)) fail('duplicate_request', 'Demande deja tentee ; aucune relance automatique', 409)
      if (typeof referenceRevision !== 'string' || !/^[a-f0-9]{64}$/.test(referenceRevision)) {
        fail('references_changed', 'Choix a actualiser et confirmer', 409)
      }
      let snapshot
      try { snapshot = structuredClone(profile) }
      catch { fail('invalid_profile', 'Profil invalide', 400) }
      return exclusive(signal, async currentSignal => {
        currentReferences = await readReferences(currentSignal)
        if (currentReferences.revision !== referenceRevision) fail('references_changed', 'Choix modifies ; nouvelle confirmation requise', 409)
        let normalized
        try { normalized = normalizePathwayProfile(snapshot, currentReferences) }
        catch { fail('invalid_profile', 'Profil a corriger ; brouillon conserve', 400) }
        checkEnabled()
        if (currentSignal.aborted) fail('cancelled', 'Demande annulee')
        // Réserver durablement une tentative AVANT le POST. Aucun remboursement
        // sur erreur, délai ou annulation : le backend pourrait déjà travailler.
        const reservation = guard.check(token, { type: 'pathway', profile: normalized })
        if (reservation.status !== 200) fail(reservation.status === 429 ? 'quota_exceeded' : 'session_unavailable', 'Session indisponible ou quota atteint', reservation.status)
        acceptedIds.add(requestId)
        return adapter.buildPathway(normalized, { confirmed: true, referenceRevision, signal: currentSignal })
      })
    },
  }
}

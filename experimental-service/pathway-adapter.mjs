// Preparation serveur uniquement : aucun import par le simulateur ou le navigateur.
// L'activation et toutes les nomenclatures exigent une configuration explicite.
import { normalizePathwayProfile } from './profile-references.mjs'

export class PathwayAdapterError extends Error {
  constructor(code, message, status) {
    super(message)
    this.name = 'PathwayAdapterError'
    this.code = code
    if (status !== undefined) this.status = status
  }
}

function fail(code, message, status) {
  throw new PathwayAdapterError(code, message, status)
}

function officialLink(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'outils.ge.ch' &&
      !url.username && !url.password && !url.port && url.pathname.startsWith('/referentiel/formation/')
  } catch { return false }
}

function validateResult(data) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value)
  const text = value => typeof value === 'string' && value.trim().length > 0
  if (!object(data) || data.ok !== true || !text(data.summary) ||
      (!Array.isArray(data.recommendedSteps) && !Array.isArray(data.steps))) {
    fail('invalid_response', 'Reponse parcours non conforme')
  }
  let count = 0
  for (const category of ['recommendedSteps', 'steps', 'optionalSteps', 'informationalCourses']) {
    if (data[category] === undefined) continue
    if (!Array.isArray(data[category])) fail('invalid_response', 'Categorie de recommandations invalide')
    for (const item of data[category]) {
      if (!object(item) || !object(item.course) || !text(item.course.code) || !text(item.course.title) ||
          !Number.isInteger(item.position) || item.position < 1 || !text(item.rationale)) {
        fail('invalid_response', 'Formation retournee non conforme')
      }
      if (item.course.sourceUrl != null && !officialLink(item.course.sourceUrl)) {
        fail('invalid_response', 'Lien de formation non autorise')
      }
      if (item.course.durationHours != null &&
          (typeof item.course.durationHours !== 'number' || !Number.isFinite(item.course.durationHours) || item.course.durationHours < 0)) {
        fail('invalid_response', 'Duree de formation invalide')
      }
    }
    count += data[category].length
  }
  if (data.gaps !== undefined && (!Array.isArray(data.gaps) || data.gaps.some(gap => typeof gap !== 'string'))) {
    fail('invalid_response', 'Limites du catalogue non conformes')
  }
  if ((data.abstain !== undefined && typeof data.abstain !== 'boolean') ||
      (data.mode !== undefined && !text(data.mode)) ||
      (data.interpretedGoal !== undefined && typeof data.interpretedGoal !== 'string')) {
    fail('invalid_response', 'Metadonnees du parcours invalides')
  }
  if (data.durationSummary !== undefined) {
    const duration = data.durationSummary
    if (!object(duration)) fail('invalid_response', 'Synthese des durees invalide')
    for (const name of ['budgetHours', 'recommendedHours', 'excessHours']) {
      if (duration[name] != null && (typeof duration[name] !== 'number' || !Number.isFinite(duration[name]) || duration[name] < 0)) {
        fail('invalid_response', 'Synthese des durees invalide')
      }
    }
    for (const name of ['verified', 'durationsKnown', 'budgetVerified', 'withinBudget']) {
      if (duration[name] != null && typeof duration[name] !== 'boolean') fail('invalid_response', 'Verification des durees invalide')
    }
  }
  if (data.usage !== undefined) {
    if (!object(data.usage)) fail('invalid_response', 'Mesures de consommation invalides')
    for (const name of ['pass1', 'pass2', 'total']) {
      const usage = data.usage[name]
      if (usage == null) continue
      if (!object(usage)) fail('invalid_response', 'Mesures de consommation invalides')
      for (const field of ['input', 'output', 'cached', 'written', 'uncached', 'cost']) {
        const value = usage[field]
        if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
            (field !== 'cost' && !Number.isSafeInteger(value)))) fail('invalid_response', 'Mesures de consommation invalides')
      }
    }
  }
  // Ne pas aplatir les categories, remplacer les liens ou completer les formations.
  return { mode: 'historical-pathway', empty: count === 0, result: data }
}

async function readResult(response, maxBytes, signal) {
  const length = response.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) fail('oversized_response', 'Reponse parcours trop volumineuse')
  const reader = response.body?.getReader()
  if (!reader) fail('invalid_response', 'Corps JSON du parcours absent')
  const chunks = []; let size = 0
  const cancel = () => { reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (signal.aborted) fail('cancelled', 'Lecture du parcours annulee')
      if (done) break
      size += value.byteLength
      if (size > maxBytes) { cancel(); fail('oversized_response', 'Reponse parcours trop volumineuse') }
      chunks.push(value)
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) }
    catch { fail('invalid_response', 'Reponse historique JSON illisible ou vide') }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock() }
}

export function createPathwayAdapter({
  enabled = false,
  endpoint = '',
  referencesClient = null,
  timeoutMs = 10_000,
  maxResponseBytes = 256 * 1024,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof enabled !== 'boolean') fail('configuration', 'Activation booleenne explicite requise')
  let url
  if (enabled) {
    try { url = new URL(endpoint) } catch { fail('configuration', 'URL parcours explicite requise') }
    if (url.protocol !== 'https:' || url.pathname !== '/api/pathway' || url.username || url.password || url.search || url.hash) {
      fail('configuration', 'URL HTTPS /api/pathway sans identifiants ni parametres requise')
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 210_000 || typeof fetchImpl !== 'function' ||
        !Number.isInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 1024 * 1024) {
      fail('configuration', 'Transport ou delai invalide')
    }
    if (typeof referencesClient?.refresh !== 'function' || typeof referencesClient?.getCurrent !== 'function') {
      fail('configuration', 'Lecteur de référentiels explicite requis')
    }
  }

  return {
    enabled,
    async buildPathway(profile, { confirmed = false, referenceRevision, signal } = {}) {
      if (!enabled) fail('disabled', 'Adaptateur historique desactive')
      if (confirmed !== true) fail('unconfirmed', 'Confirmation explicite du profil requise')
      if (signal?.aborted) fail('cancelled', 'Demande annulee')
      if (typeof referenceRevision !== 'string' || !/^[a-f0-9]{64}$/.test(referenceRevision)) {
        fail('references_changed', 'Choix à actualiser et confirmer avant envoi')
      }
      let confirmedProfile
      try { confirmedProfile = structuredClone(profile) }
      catch { fail('invalid_profile', 'Profil invalide') }
      let references
      try {
        references = await referencesClient.refresh({ signal })
        if (referencesClient.getCurrent().revision !== references.revision) throw new Error('Référentiel obsolète')
      } catch {
        if (signal?.aborted) fail('cancelled', 'Demande annulee')
        fail('references_unavailable', 'Référentiel indisponible ou incompatible ; brouillon conservé')
      }
      if (signal?.aborted) fail('cancelled', 'Demande annulee')
      if (referenceRevision !== references.revision) fail('references_changed', 'Choix modifiés : nouvelle confirmation requise')
      let normalized
      try { normalized = normalizePathwayProfile(confirmedProfile, references) }
      catch (error) {
        fail(error.code === 'removed_value' ? 'unvalidated_value' : 'invalid_profile', error.message)
      }

      const controller = new AbortController()
      let timer, onAbort
      const interrupted = new Promise((_, reject) => {
        onAbort = () => {
          reject(new PathwayAdapterError('cancelled', 'Demande annulee'))
          controller.abort()
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        timer = setTimeout(() => {
          reject(new PathwayAdapterError('timeout', 'Delai du service historique depasse'))
          controller.abort()
        }, timeoutMs)
      })
      try {
        return await Promise.race([interrupted, (async () => {
          const response = await fetchImpl(url.href, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(normalized),
            redirect: 'error',
            credentials: 'omit',
            signal: controller.signal,
          })
          if (response.redirected) fail('invalid_response', 'Redirection du parcours refusee')
          if (!response.ok) fail('http_error', 'Service historique en erreur HTTP', response.status)
          if (response.status === 204) fail('empty_response', 'Reponse historique vide')
          if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
            fail('invalid_response', 'Reponse JSON attendue')
          }
          const data = await readResult(response, maxResponseBytes, controller.signal)
          return validateResult(data)
        })()])
      } catch (error) {
        if (error instanceof PathwayAdapterError) throw error
        fail('unavailable', 'Service historique indisponible')
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
    },
  }
}

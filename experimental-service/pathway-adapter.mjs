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
    }
    count += data[category].length
  }
  if (data.gaps !== undefined && (!Array.isArray(data.gaps) || data.gaps.some(gap => typeof gap !== 'string'))) {
    fail('invalid_response', 'Limites du catalogue non conformes')
  }
  // Ne pas aplatir les categories, remplacer les liens ou completer les formations.
  return { mode: 'historical-pathway', empty: count === 0, result: data }
}

export function createPathwayAdapter({
  enabled = false,
  endpoint = '',
  referencesClient = null,
  timeoutMs = 10_000,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof enabled !== 'boolean') fail('configuration', 'Activation booleenne explicite requise')
  let url
  if (enabled) {
    try { url = new URL(endpoint) } catch { fail('configuration', 'URL parcours explicite requise') }
    if (url.protocol !== 'https:' || url.pathname !== '/api/pathway' || url.username || url.password || url.search || url.hash) {
      fail('configuration', 'URL HTTPS /api/pathway sans identifiants ni parametres requise')
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000 || typeof fetchImpl !== 'function') {
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
      try { normalized = normalizePathwayProfile(profile, references) }
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
          if (!response.ok) fail('http_error', 'Service historique en erreur HTTP', response.status)
          if (response.status === 204) fail('empty_response', 'Reponse historique vide')
          if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
            fail('invalid_response', 'Reponse JSON attendue')
          }
          let data
          try { data = await response.json() }
          catch { fail('invalid_response', 'Reponse historique JSON illisible ou vide') }
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

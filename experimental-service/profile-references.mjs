// Contrat catalogue v1. Aucun moteur, catalogue de cours ou appel OpenAI.
import { createHash } from 'node:crypto'

export const PROFILE_FIELDS = Object.freeze([
  'personnelCategory', 'entity', 'managerStatus', 'role', 'objective',
  'existingSkills', 'timeAvailable', 'constraints',
])
export const MAX_REFERENCE_BYTES = 128 * 1024

export class ProfileReferencesError extends Error {
  constructor(code, message) { super(message); this.name = 'ProfileReferencesError'; this.code = code }
}
const fail = (code, message) => { throw new ProfileReferencesError(code, message) }
const object = value => value && typeof value === 'object' && !Array.isArray(value)
function freeze(value) {
  if (object(value) || Array.isArray(value)) { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}

export function validateProfileReferences(value) {
  if (!object(value) || value.schemaVersion !== 1) fail('schema', 'Version de référentiel incompatible')
  const { pathway, revision } = value
  if (!object(pathway) || pathway.scope !== 'pathway' || !object(pathway.fields) ||
      typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) {
    fail('schema', 'Référentiel de parcours invalide')
  }
  const rules = pathway.apiValidation
  if (!object(rules) || rules.trimBeforeLengthCheck !== true || rules.optionalNull !== 'omit' ||
      rules.optionalBlank !== 'omit' || rules.unknownFields !== 'ignore' || rules.enforceOptions !== false) {
    fail('schema', 'Règles de validation non prises en charge')
  }
  for (const name of PROFILE_FIELDS) {
    const field = pathway.fields[name]
    if (!object(field) || field.type !== 'string' || !Number.isSafeInteger(field.maxLength) ||
        field.maxLength < 1 || field.maxLength > 10000 || typeof field.requiredInApi !== 'boolean' ||
        typeof field.requiredInForm !== 'boolean' || (field.requiredInApi && !field.requiredInForm) ||
        !['text', 'textarea', 'select'].includes(field.formControl)) {
      fail('schema', 'Champ de référentiel invalide : ' + name)
    }
    if (name === 'personnelCategory' || name === 'managerStatus') {
      if (field.formControl !== 'select') fail('schema', 'Sélecteur attendu : ' + name)
      choices(field.options, field.maxLength, true)
    }
    if (name === 'entity') {
      if (field.allowCustom !== true) fail('schema', 'Saisie libre des entités attendue')
      choices(field.suggestions, field.maxLength, false)
    }
  }
  const actual = createHash('sha256').update(JSON.stringify({ schemaVersion: 1, pathway })).digest('hex')
  if (revision !== actual) fail('revision', 'Empreinte de référentiel incorrecte')
  return freeze(structuredClone(value))
}

function choices(values, maxLength, required) {
  if (!Array.isArray(values) || values.length > 500 || (required && !values.length)) fail('schema', 'Liste de choix invalide')
  const seen = new Set()
  for (const item of values) {
    if (!object(item) || typeof item.value !== 'string' || !item.value.trim() || item.value !== item.value.trim() ||
        item.value.length > maxLength || typeof item.label !== 'string' || !item.label.trim() ||
        item.label.length > 500 || seen.has(item.value)) fail('schema', 'Choix de référentiel invalide')
    seen.add(item.value)
  }
}

// Le mode formulaire contrôle les valeurs sélectionnées ; l'API garde ses chaînes libres.
export function normalizePathwayProfile(profile, references, { form = true } = {}) {
  const contract = validateProfileReferences(references)
  if (!object(profile)) fail('invalid_profile', 'Profil invalide')
  const normalized = {}
  for (const name of PROFILE_FIELDS) {
    const field = contract.pathway.fields[name]
    const value = profile[name]
    const required = form ? field.requiredInForm : field.requiredInApi
    if (value == null) {
      if (required) fail('invalid_profile', 'Champ obligatoire : ' + name)
      continue
    }
    if (typeof value !== 'string') fail('invalid_profile', 'Champ non textuel : ' + name)
    const text = value.trim()
    if (!text) {
      if (required) fail('invalid_profile', 'Champ obligatoire : ' + name)
      continue
    }
    if (text.length > field.maxLength) fail('invalid_profile', 'Champ trop long : ' + name)
    if (form && field.formControl === 'select' && !field.options.some(item => item.value === text)) {
      fail('removed_value', 'Valeur à sélectionner de nouveau : ' + name)
    }
    normalized[name] = text
  }
  return normalized
}

async function readJson(response, limit, signal) {
  const length = response.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) fail('size', 'Référentiel trop volumineux')
  const reader = response.body?.getReader()
  if (!reader) fail('response', 'Corps de référentiel absent')
  const chunks = []; let size = 0
  const cancel = () => { reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (signal.aborted) fail('cancelled', 'Lecture du référentiel annulée')
      if (done) break
      size += value.byteLength
      if (size > limit) { cancel(); fail('size', 'Référentiel trop volumineux') }
      chunks.push(value)
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) }
    catch { fail('response', 'Réponse JSON de référentiel invalide') }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock() }
}

export function createProfileReferencesClient({ endpoint, allowedOrigins, fetchImpl = globalThis.fetch,
  timeoutMs = 5000, maxBytes = MAX_REFERENCE_BYTES } = {}) {
  let url
  try { url = new URL(endpoint) } catch { fail('configuration', 'URL de référentiel explicite requise') }
  if (url.protocol !== 'https:' || url.pathname !== '/api/profile-references' || url.username || url.password ||
      url.search || url.hash || !Array.isArray(allowedOrigins) || !allowedOrigins.includes(url.origin) ||
      typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 ||
      !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_REFERENCE_BYTES) {
    fail('configuration', 'Configuration du lecteur de référentiels invalide')
  }
  let cached = null, etag = '', ready = false, generation = 0
  return {
    state() { return { status: ready ? 'ready' : cached ? 'stale' : 'empty', references: cached } },
    getCurrent() { if (!ready) fail('stale', 'Référentiel à revalider'); return cached },
    async refresh({ signal } = {}) {
      const current = ++generation
      ready = false
      if (signal?.aborted) fail('cancelled', 'Lecture du référentiel annulée')
      const controller = new AbortController()
      let timer, onAbort
      const interrupted = new Promise((_, reject) => {
        onAbort = () => { reject(new ProfileReferencesError('cancelled', 'Lecture du référentiel annulée')); controller.abort() }
        signal?.addEventListener('abort', onAbort, { once: true })
        timer = setTimeout(() => { reject(new ProfileReferencesError('timeout', 'Délai du référentiel dépassé')); controller.abort() }, timeoutMs)
      })
      try {
        const references = await Promise.race([interrupted, (async () => {
          const response = await fetchImpl(url.href, {
            method: 'GET',
            headers: { Accept: 'application/json', ...(etag ? { 'If-None-Match': etag } : {}) },
            redirect: 'error', credentials: 'omit', signal: controller.signal,
          })
          if (current !== generation) fail('superseded', 'Lecture remplacée par une demande plus récente')
          if (response.redirected) fail('response', 'Redirection de référentiel refusée')
          if (response.status === 304) {
            if (!cached || response.headers.get('etag') !== etag) fail('response', 'Réponse 304 sans cache compatible')
            return cached
          }
          if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
            fail('response', 'Réponse de référentiel non conforme')
          }
          const data = validateProfileReferences(await readJson(response, maxBytes, controller.signal))
          if (response.headers.get('etag') !== '"' + data.revision + '"') fail('revision', 'ETag du référentiel incohérent')
          return data
        })()])
        if (current !== generation) fail('superseded', 'Lecture remplacée par une demande plus récente')
        cached = references; etag = '"' + references.revision + '"'; ready = true
        return references
      } catch (error) {
        if (error instanceof ProfileReferencesError) throw error
        fail('unavailable', 'Référentiel indisponible')
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort) }
    },
  }
}

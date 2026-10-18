// Service de validation isole. AUCUN appel OpenAI ou backend A658-YG.
import http from 'node:http'
import { timingSafeEqual, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { validateProfileFields } from './profile-validation.mjs'
import { normalizePathwayProfile, validateProfileReferences } from './profile-references.mjs'

const MAX_BODY_BYTES = 16_000
const DAY_MS = 86_400_000
const CATEGORIES = new Set(['PAT', 'PE', 'PU Police', 'PU Prison', 'PJ'])
const REQUEST_TYPES = new Set(['search', 'pathway'])

export function validateRequest(body, { profileReferences = null } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Corps JSON invalide'
  if (!REQUEST_TYPES.has(body.type)) return 'Type de demande invalide'
  if (!body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) return 'Profil invalide'
  const profile = body.profile
  if (profileReferences) {
    try { normalizePathwayProfile(profile, profileReferences) }
    catch (error) { return error.message }
  } else {
    if (!CATEGORIES.has(profile.personnelCategory)) return 'Categorie de personnel invalide'
    const profileIssue = validateProfileFields(profile)
    if (profileIssue) return profileIssue
  }
  if (body.type === 'search' && (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 1000)) return 'Recherche invalide'
  return null
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function createGuard({ token, maxDailyRequests = 5, maxTotalRequests = 20, now = Date.now, stateFile = '', enabled = () => true, profileReferences = null } = {}) {
  const references = profileReferences === null ? null : validateProfileReferences(profileReferences)
  if (typeof token !== 'string' || token.length < 32) throw new Error('AVATAR_TEST_TOKEN doit contenir au moins 32 caracteres')
  if (!Number.isInteger(maxDailyRequests) || maxDailyRequests < 1 || !Number.isInteger(maxTotalRequests) || maxTotalRequests < 1) throw new Error('Quotas invalides')
  let state = { day: Math.floor(now() / DAY_MS), daily: 0, total: 0, stopped: false }
  if (stateFile) {
    try {
      const saved = JSON.parse(readFileSync(stateFile, 'utf8'))
      if (!Number.isInteger(saved.day) || !Number.isSafeInteger(saved.daily) || !Number.isSafeInteger(saved.total) ||
          saved.daily < 0 || saved.total < 0 || saved.daily > saved.total || typeof saved.stopped !== 'boolean') {
        throw new Error('Etat de quota invalide')
      }
      state = saved
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Etat de quota illisible : acces bloque', { cause: error })
    }
  }
  function persist(next) {
    if (!stateFile) { state = next; return }
    const temp = stateFile + '.' + randomUUID() + '.tmp'
    try {
      writeFileSync(temp, JSON.stringify(next), { mode: 0o600, flag: 'wx' })
      renameSync(temp, stateFile)
      state = next
    } catch (error) {
      try { unlinkSync(temp) } catch {}
      throw new Error('Ecriture quota impossible : acces bloque', { cause: error })
    }
  }
  return {
    stop() { persist({ ...state, stopped: true }) },
    status() { return { stopped: state.stopped, daily: state.daily, total: state.total, maxDailyRequests, maxTotalRequests } },
    check(auth, body) {
      if (state.stopped || !enabled()) return { status: 503, error: 'Service desactive' }
      if (!safeEqual(auth, token)) return { status: 401, error: 'Acces refuse' }
      const issue = validateRequest(body, { profileReferences: references })
      if (issue) return { status: 400, error: issue }
      const day = Math.floor(now() / DAY_MS)
      if ((day === state.day ? state.daily : 0) >= maxDailyRequests || state.total >= maxTotalRequests) return { status: 429, error: 'Quota atteint' }
      try { persist({ ...state, day, daily: (day === state.day ? state.daily : 0) + 1, total: state.total + 1 }) }
      catch { return { status: 503, error: 'Stockage des quotas indisponible' } }
      return { status: 200, ok: true, mode: 'simulation', message: 'Requete validee sans appel API', quota: this.status() }
    },
  }
}

export function createServer({ token, maxDailyRequests = 5, maxTotalRequests = 20, allowedOrigin = '', stateFile = '', enabled = () => true } = {}) {
  const guard = createGuard({ token, maxDailyRequests, maxTotalRequests, stateFile, enabled })
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)) }
    // Pas de CORS ouvert. Le service de test est local et necessite un jeton serveur.
    if (req.headers.origin && req.headers.origin !== allowedOrigin) return send(403, { error: 'Origine non autorisee' })
    if (req.method !== 'POST' || req.url !== '/test/request') return send(404, { error: 'Route inconnue' })
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(415, { error: 'JSON requis' })
    let bytes = 0
    const chunks = []
    try {
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > MAX_BODY_BYTES) return send(413, { error: 'Requete trop volumineuse' })
        chunks.push(chunk)
      }
      let body
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return send(400, { error: 'JSON invalide' }) }
      const header = req.headers.authorization
      const suppliedToken = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : ''
      const result = guard.check(suppliedToken, body)
      return send(result.status, result)
    } catch {
      if (!res.writableEnded) send(400, { error: 'Requete interrompue' })
    }
  })
  return { server, guard }
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const port = Number(process.env.AVATAR_TEST_PORT || 8799)
  const token = process.env.AVATAR_TEST_TOKEN
  if (!process.env.AVATAR_TEST_STATE_FILE) throw new Error('AVATAR_TEST_STATE_FILE obligatoire pour le service local')
  const { server } = createServer({ token, stateFile: process.env.AVATAR_TEST_STATE_FILE, enabled: () => process.env.AVATAR_TEST_ENABLED === 'true' })
  server.listen(port, '127.0.0.1', () => console.log('Avatar simulation locale : 127.0.0.1:' + port))
}

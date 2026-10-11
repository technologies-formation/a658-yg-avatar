// Service de validation isole. AUCUN appel OpenAI ou backend A658-YG.
import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'

const MAX_BODY_BYTES = 16_000
const DAY_MS = 86_400_000
const CATEGORIES = new Set(['PAT', 'PE', 'PU Police', 'PU Prison', 'PJ'])
const FIELD_LIMITS = { personnelCategory: 80, role: 300, objective: 1000, existingSkills: 1000, timeAvailable: 300, constraints: 1000 }
const REQUEST_TYPES = new Set(['search', 'pathway'])

export function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Corps JSON invalide'
  if (!REQUEST_TYPES.has(body.type)) return 'Type de demande invalide'
  if (!body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) return 'Profil invalide'
  const profile = body.profile
  if (!CATEGORIES.has(profile.personnelCategory)) return 'Categorie de personnel invalide'
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    if (profile[field] === undefined) continue
    if (typeof profile[field] !== 'string' || profile[field].length > limit) return 'Champ invalide : ' + field
  }
  if (!profile.role?.trim() || !profile.objective?.trim()) return 'Fonction et objectif obligatoires'
  if (body.type === 'search' && (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 1000)) return 'Recherche invalide'
  return null
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function createGuard({ token, maxDailyRequests = 5, maxTotalRequests = 20, now = Date.now } = {}) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('AVATAR_TEST_TOKEN doit contenir au moins 32 caracteres')
  if (!Number.isInteger(maxDailyRequests) || maxDailyRequests < 1 || !Number.isInteger(maxTotalRequests) || maxTotalRequests < 1) throw new Error('Quotas invalides')
  const state = { day: Math.floor(now() / DAY_MS), daily: 0, total: 0, stopped: false }
  return {
    stop() { state.stopped = true },
    status() { return { stopped: state.stopped, daily: state.daily, total: state.total, maxDailyRequests, maxTotalRequests } },
    check(auth, body) {
      if (state.stopped) return { status: 503, error: 'Service desactive' }
      if (!safeEqual(auth, token)) return { status: 401, error: 'Acces refuse' }
      const issue = validateRequest(body)
      if (issue) return { status: 400, error: issue }
      const day = Math.floor(now() / DAY_MS)
      if (day !== state.day) { state.day = day; state.daily = 0 }
      if (state.daily >= maxDailyRequests || state.total >= maxTotalRequests) return { status: 429, error: 'Quota atteint' }
      state.daily += 1
      state.total += 1
      return { status: 200, ok: true, mode: 'simulation', message: 'Requete validee sans appel API', quota: this.status() }
    },
  }
}

export function createServer({ token, maxDailyRequests = 5, maxTotalRequests = 20, allowedOrigin = '' } = {}) {
  const guard = createGuard({ token, maxDailyRequests, maxTotalRequests })
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
  const { server } = createServer({ token })
  server.listen(port, '127.0.0.1', () => console.log('Avatar simulation locale : 127.0.0.1:' + port))
}

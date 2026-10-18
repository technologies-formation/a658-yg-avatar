// Préparation uniquement : aucune écoute HTTP, destination, session ou activation implicite.
import { randomUUID } from 'node:crypto'

export function createPrivatePathwayHandler({
  enabled = false, publicOrigin, authenticate, session, now = Date.now,
} = {}) {
  if (typeof enabled !== 'boolean') throw Error('Activation booléenne requise')
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" })
    res.end(JSON.stringify(body))
  }
  if (!enabled) return { handler: async (_req, res) => send(res, 503, { error: 'Service privé désactivé' }), stop() {} }
  const origin = new URL(publicOrigin)
  if (origin.protocol !== 'https:' || origin.origin !== publicOrigin ||
      typeof authenticate !== 'function' || typeof session?.getReferences !== 'function' ||
      typeof session?.buildPathway !== 'function' || typeof session?.stop !== 'function' || typeof now !== 'function') {
    throw Error('Origine HTTPS, identité vérifiée côté serveur et session explicites requises')
  }
  let stopped = false
  const tickets = new Map()
  const prune = () => { for (const [id, ticket] of tickets) if (ticket.expires <= now()) tickets.delete(id) }
  return {
    stop() { stopped = true; tickets.clear(); session.stop() },
    async handler(req, res) {
      if (stopped) return send(res, 503, { error: 'Service privé désactivé' })
      // Ne jamais déduire l’identité d’un en-tête transmis par le navigateur.
      // authenticate est fourni par l’intégration serveur du futur hébergement.
      if (req.headers.host !== origin.host ||
          (req.headers.origin && req.headers.origin !== publicOrigin) ||
          req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Origine refusée' })
      let identity
      try { identity = await authenticate(req, res) } catch {}
      if (!identity || typeof identity.id !== 'string' || !identity.id.trim() || identity.id.length > 256) {
        return send(res, 401, { error: 'Authentification requise' })
      }
      if (stopped) return send(res, 503, { error: 'Service privé désactivé' })
      const controller = new AbortController()
      const cancel = () => { if (!res.writableEnded) controller.abort() }
      res.on('close', cancel)
      try {
        prune()
        if (req.method === 'GET' && req.url === '/private/profile-references') {
          if (tickets.size >= 32) return send(res, 429, { error: 'Trop de confirmations en attente' })
          const references = await session.getReferences({ signal: controller.signal })
          if (controller.signal.aborted) return
          if (stopped) return send(res, 503, { error: 'Service privé désactivé' })
          if (tickets.size >= 32) return send(res, 429, { error: 'Trop de confirmations en attente' })
          const requestId = randomUUID()
          tickets.set(requestId, { identity: identity.id, revision: references.revision, expires: now() + 300000 })
          return send(res, 200, { references, requestId })
        }
        if (req.method !== 'POST' || req.url !== '/private/pathway') return send(res, 404, { error: 'Route inconnue' })
        if (req.headers.origin !== publicOrigin) return send(res, 403, { error: 'Origine requise' })
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(res, 415, { error: 'JSON requis' })
        const chunks = []; let bytes = 0
        for await (const chunk of req) {
          bytes += chunk.length
          if (bytes > 16000) return send(res, 413, { error: 'Requête trop volumineuse' })
          chunks.push(chunk)
        }
        let body
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return send(res, 400, { error: 'JSON invalide' }) }
        if (!body || typeof body !== 'object' || Array.isArray(body) || body.confirmed !== true) return send(res, 400, { error: 'Confirmation explicite requise' })
        // Nouvelle vérification après la lecture du corps : expiration, arrêt ou doublon.
        prune()
        const ticket = tickets.get(body.requestId)
        if (!ticket || ticket.identity !== identity.id || ticket.revision !== body.referenceRevision) {
          return send(res, 409, { error: 'Choix et confirmation à renouveler ; brouillon conservé' })
        }
        if (stopped || controller.signal.aborted) return send(res, 503, { error: 'Service privé désactivé' })
        tickets.delete(body.requestId)
        const result = await session.buildPathway(body.profile, {
          confirmed: true, referenceRevision: ticket.revision, requestId: body.requestId, signal: controller.signal,
        })
        if (!controller.signal.aborted) send(res, 200, result)
      } catch (error) {
        const codes = { references_changed: 409, invalid_profile: 400, busy: 409, duplicate_request: 409,
          quota_exceeded: 429, disabled: 503, session_unavailable: 503, references_unavailable: 503, timeout: 504 }
        const status = codes[error.code] ?? 502
        if (!res.writableEnded && !controller.signal.aborted) send(res, status, {
          error: 'Demande non aboutie ; réponses conservées. Aucune relance automatique.',
          code: Object.hasOwn(codes, error.code) ? error.code : 'service_unavailable',
        })
      } finally { res.removeListener('close', cancel) }
    },
  }
}

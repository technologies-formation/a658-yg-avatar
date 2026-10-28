// Attestation d'un passage par l'origine HTTPS ; aucun mot de passe ni IP apprise d'un visiteur.
import https from 'node:https'
import { randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
const prefix = '/_avatar_proxy_proof/'
const normalize = value => typeof value === 'string' && value.startsWith('::ffff:') ? value.slice(7) : value

export function requestHttpsProof(publicOrigin, path, timeoutMs = 3000) {
  const origin = new URL(publicOrigin)
  if (origin.protocol !== 'https:' || origin.origin !== publicOrigin || !path.startsWith(prefix) ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw Error('Destination de preuve invalide')
  return new Promise((resolve, reject) => {
    // Pas de redirection, pas de cookie, pas de Basic, vérification TLS obligatoire.
    const req = https.request(new URL(path, origin), { method: 'GET', agent: false, rejectUnauthorized: true,
      headers: { Accept: 'text/plain', 'Cache-Control': 'no-store' } }, res => {
      let text = '', bytes = 0
      res.setEncoding('utf8')
      res.on('data', chunk => {
        bytes += Buffer.byteLength(chunk)
        if (bytes > 512) { reject(Error('Preuve trop volumineuse')); req.destroy() }
        else text += chunk
      })
      res.on('aborted', () => reject(Error('Preuve interrompue')))
      res.on('error', reject)
      res.on('end', () => res.statusCode === 200 ? resolve(text) : reject(Error('Preuve refusée')))
    })
    const timer = setTimeout(() => req.destroy(Error('Délai de preuve dépassé')), timeoutMs)
    req.on('error', reject); req.on('close', () => clearTimeout(timer)); req.end()
  })
}

export function createProxyAttestation({ publicOrigin, requestProbe = requestHttpsProof, now = Date.now,
  cooldownMs = 5000, validityMs = 600000 } = {}) {
  const origin = new URL(publicOrigin)
  if (origin.protocol !== 'https:' || origin.origin !== publicOrigin || typeof requestProbe !== 'function' ||
      typeof now !== 'function' || !Number.isInteger(cooldownMs) || cooldownMs < 1000 ||
      !Number.isInteger(validityMs) || validityMs < 1000 || validityMs > 3600000) throw Error('Attestation HTTPS explicite requise')
  const trusted = new Map(), pending = new Map()
  let inFlight = null, lastProbe = -Infinity, lastTime = -Infinity, stopped = false
  const time = () => { const value = now(); if (!Number.isFinite(value) || value < lastTime) throw Error('Horloge indisponible'); lastTime = value; return value }
  const transport = req => req.headers.host === origin.host && req.headers['x-forwarded-proto'] === 'https' &&
    typeof req.socket.remoteAddress === 'string' && isIP(normalize(req.socket.remoteAddress)) !== 0
  const secure = req => {
    try { return !stopped && transport(req) && (trusted.get(normalize(req.socket.remoteAddress)) ?? -Infinity) > time() }
    catch { return false }
  }
  const proof = async () => {
    const nonce = randomBytes(32).toString('hex'), ack = randomBytes(32).toString('hex')
    const path = prefix + nonce
    const record = { ack, peer: null }
    pending.set(path, record)
    try {
      const response = await requestProbe(publicOrigin, path, 3000)
      // L'observation entrante seule n'accorde rien : la réponse doit revenir par TLS vérifié.
      if (stopped || response !== ack || !record.peer) return false
      const current = time()
      for (const [ip, until] of trusted) if (until <= current) trusted.delete(ip)
      if (!trusted.has(record.peer) && trusted.size >= 64) return false
      trusted.set(record.peer, current + validityMs)
      return true
    } catch { return false } finally { pending.delete(path) }
  }
  const refresh = target => {
    if (stopped) return Promise.resolve(false)
    if (inFlight) return inFlight
    let current
    try { current = time() } catch { return Promise.resolve(false) }
    if (current - lastProbe < cooldownMs) return Promise.resolve(false)
    lastProbe = current
    // Au plus huit GET, quatre simultanés ; un seul lot partagé pour tous les visiteurs.
    inFlight = (async () => {
      await Promise.all(Array.from({ length: 4 }, proof))
      if (target && !secure(target) && !stopped) await Promise.all(Array.from({ length: 4 }, proof))
      return target ? secure(target) : trusted.size > 0
    })().finally(() => { inFlight = null })
    return inFlight
  }
  return {
    secure,
    refusalReason(req) {
      if (stopped) return 'stopped'
      if (req.headers.host !== origin.host) return 'host'
      if (req.headers['x-forwarded-proto'] !== 'https') return 'protocol'
      if (typeof req.socket.remoteAddress !== 'string' || !isIP(normalize(req.socket.remoteAddress))) return 'peer'
      return 'unverified_peer'
    },
    async ensure(req) {
      if (secure(req)) return true
      if (stopped || !transport(req)) return false
      await refresh(req)
      return secure(req)
    },
    refresh: () => refresh(null),
    stop() { stopped = true; trusted.clear(); pending.clear() },
    handleProof(req, res) {
      if (!req.url?.startsWith(prefix)) return false
      const record = pending.get(req.url)
      // Un code inconnu, expiré ou déjà utilisé ne peut jamais créer de confiance.
      const valid = !stopped && req.method === 'GET' && record && !record.peer && transport(req)
      res.writeHead(valid ? 200 : 404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' })
      if (valid) { record.peer = normalize(req.socket.remoteAddress); res.end(record.ack) }
      else res.end('Preuve indisponible')
      return true
    },
  }
}

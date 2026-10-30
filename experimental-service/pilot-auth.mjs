// Pilote restreint uniquement. Aucune écoute, lecture d’environnement ou activation implicite.
import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt)
// Variante OWASP à 32 Mio ; le temps réel sur l’hébergement reste à mesurer.
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const usernamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/
const passwordValid = value => typeof value === 'string' && value.length >= 16 &&
  Buffer.byteLength(value) <= 1024 && !/[\x00-\x1f\x7f]/.test(value)

export async function createPilotCredential({ id, username, password } = {}) {
  if (typeof id !== 'string' || typeof username !== 'string' || !idPattern.test(id) || !usernamePattern.test(username) || !passwordValid(password)) {
    throw Error('Identité, identifiant et mot de passe de pilote invalides')
  }
  const salt = randomBytes(16)
  const hash = await derive(password, salt, 32, parameters)
  return { id, username, scheme: 'scrypt-v1', salt: salt.toString('hex'), hash: hash.toString('hex') }
}

export function createPilotAuthenticator({
  enabled = false, users, maxAttempts, windowMs, isSecureRequest, now = Date.now,
} = {}) {
  if (typeof enabled !== 'boolean') throw Error('Activation booléenne requise')
  if (!enabled) return { authenticate: async () => null, revoke() {}, stop() {} }
  if (!Array.isArray(users) || !users.length || users.length > 10 ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100 ||
      !Number.isInteger(windowMs) || windowMs < 1000 || windowMs > 3600000 || typeof now !== 'function' || typeof isSecureRequest !== 'function') {
    throw Error('Comptes individuels et limites explicites requis')
  }
  const accounts = new Map(), identities = new Set()
  for (const user of users) {
    if (!user || typeof user.id !== 'string' || typeof user.username !== 'string' || !idPattern.test(user.id) || !usernamePattern.test(user.username) ||
        user.scheme !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(user.salt ?? '') ||
        !/^[a-f0-9]{64}$/.test(user.hash ?? '') || accounts.has(user.username) || identities.has(user.id)) {
      throw Error('Compte de pilote invalide ou dupliqué')
    }
    accounts.set(user.username, Object.freeze({ ...user }))
    identities.add(user.id)
  }
  const fallback = accounts.values().next().value
  const key = randomBytes(32), revoked = new Set(), pending = new Map()
  let running=0;const queue=[]
  const acquire=async()=>{if(running>=2)await new Promise(resolve=>queue.push(resolve));else running++}
  const release=()=>{const next=queue.shift();if(next)next();else running--}
  let stopped = false, attempts = [], lastTime = -Infinity
  const time = () => {
    const current = now()
    if (!Number.isFinite(current) || current < lastTime) throw Error('Horloge indisponible')
    lastTime = current
    return current
  }
  const challenge = res => { res?.setHeader('WWW-Authenticate', 'Basic realm="A658-YG pilote prive", charset="UTF-8"') }
  return {
    revoke(id) { if (identities.has(id)) revoked.add(id) },
    stop() { stopped = true; key.fill(0) },
    async authenticate(req, res) {
      if (stopped) return null
      // L’intégration doit attester TLS ou le proxy de confiance ; jamais le seul X-Forwarded-Proto.
      try { if (isSecureRequest(req) !== true) return null } catch { return null }
      challenge(res)
      const header = req.headers.authorization
      if (typeof header !== 'string' || header.length > 1600 || !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(header)) return null
      const encoded = header.slice(6), bytes = Buffer.from(encoded, 'base64')
      if (bytes.toString('base64') !== encoded) return null
      let decoded
      try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return null }
      const separator = decoded.indexOf(':'), username = decoded.slice(0, separator), password = decoded.slice(separator + 1)
      if (separator < 1 || !usernamePattern.test(username) || !passwordValid(password)) return null
      const account = accounts.get(username), credential = account ?? fallback
      // Mutualiser seulement les vérifications identiques actuellement en cours.
      // Aucun mot de passe ou succès n’est conservé dans un cache de session.
      const fingerprint = createHmac('sha256', key).update(header).digest('hex')
      let operation = pending.get(fingerprint)
      if (!operation) {
        let current
        try { current = time() } catch { return null }
        attempts = attempts.filter(instant => instant > current - windowMs)
        if (attempts.length >= maxAttempts || pending.size >= 8) {
          res?.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)))
          return null
        }
        attempts.push(current)
        operation = (async () => {
          await acquire()
          try {
            if(stopped)return null
            const actual = await derive(password, Buffer.from(credential.salt, 'hex'), 32, parameters)
            const valid = timingSafeEqual(actual, Buffer.from(credential.hash, 'hex'))
            actual.fill(0)
            return Boolean(account && valid) ? account.id : null
          } catch { return null } finally {release()}
        })()
        pending.set(fingerprint, operation)
        operation.finally(() => pending.delete(fingerprint))
      }
      const id = await operation
      if (!id || stopped || revoked.has(id) || req.destroyed) return null
      res?.removeHeader('WWW-Authenticate')
      return { id }
    },
  }
}

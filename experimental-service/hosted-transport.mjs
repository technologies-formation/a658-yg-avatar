// Transport privé partagé : authentification, proxy attesté et verrou exclusif.
import http from 'node:http'
import { isIP } from 'node:net'
import { mkdirSync, rmdirSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { createProxyAttestation } from './proxy-attestation.mjs'
import { createPilotPrivateHandler } from './pilot-private.mjs'
import { createPrivateResources } from './private-resources.mjs'

export const HOSTED_ORIGIN = 'https://avatar.a658yg-catalogue.ch'
const address = value => value?.startsWith('::ffff:') ? value.slice(7) : value
export function secureProxyCheck(trustedProxyAddresses) {
  if (!Array.isArray(trustedProxyAddresses) || !trustedProxyAddresses.length || trustedProxyAddresses.length > 16 ||
      trustedProxyAddresses.some(ip => typeof ip !== 'string' || !isIP(ip))) throw Error('Adresses IP exactes du proxy requises')
  const trusted = new Set(trustedProxyAddresses.map(address))
  return req => trusted.has(address(req.socket.remoteAddress)) && req.headers['x-forwarded-proto'] === 'https'
}

export function createHostedTransport({ enabled = false, publicOrigin, trustedProxyAddresses, users, stateFile,
  createSession, renderPage, responseTimeoutMs = 10000, socketTimeoutMs = 15000, proxyVerification = 'exact-addresses', requestProbe } = {}) {
  if (enabled !== true || publicOrigin !== HOSTED_ORIGIN) throw Error('Activation et origine distante explicites requises')
  if (!['exact-addresses', 'self-https'].includes(proxyVerification)) throw Error('Mode de proxy inconnu')
  const attestation = proxyVerification === 'self-https' ? createProxyAttestation({ publicOrigin, requestProbe }) : null
  const secure = attestation ? attestation.secure : secureProxyCheck(trustedProxyAddresses)
  if (typeof stateFile !== 'string' || !isAbsolute(stateFile)) throw Error('État privé absolu requis')
  // Verrou exclusif : un deuxième processus ne peut pas contourner le quota.
  const lock = stateFile + '.lock'
  mkdirSync(lock, { mode: 0o700 })
  let gateway, server, released = false
  const release = () => { if (!released) { rmdirSync(lock); released = true } }
  try {
    const simulation = createSession()
    gateway = createPilotPrivateHandler({ enabled: true, publicOrigin, session: simulation, users,
      maxAttempts: 100, windowMs: 60000, isSecureRequest: secure,
      serveResource: createPrivateResources(simulation, renderPage, responseTimeoutMs) })
    server = http.createServer((req, res) => {
      if (attestation?.handleProof(req, res)) return
      const handle = async () => {
        if (attestation) await attestation.ensure(req)
        // Rejeter avant même le challenge Basic si le transport n'est pas attesté.
        if (!secure(req)) {
          res.writeHead(403, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
          return res.end('Transport HTTPS via proxy de confiance requis')
        }
        res.setHeader('Strict-Transport-Security', 'max-age=86400')
        await gateway.handler(req, res)
      }
      handle().catch(() => {
        if (!res.headersSent) res.writeHead(503, { 'Cache-Control': 'no-store' })
        res.end()
      })
    })
    server.requestTimeout = 15000; server.headersTimeout = 10000
    server.setTimeout(socketTimeoutMs, socket => socket.destroy())
    server.on('close', () => { attestation?.stop(); release() })
    // close() est une fermeture technique ; stop() est une révocation persistante.
    return { server, attestProxy: () => attestation?.refresh() ?? Promise.resolve(true), status: simulation.status, stop: gateway.stop, revoke: gateway.revoke,
      close: () => new Promise((accept, reject) => {
        server.close(error => { if (error) reject(error); else accept() })
        server.closeAllConnections()
      }) }
  } catch (error) { release(); throw error }
}


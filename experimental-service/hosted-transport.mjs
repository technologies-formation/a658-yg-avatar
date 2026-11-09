// Transport privé partagé : authentification, proxy attesté et verrou exclusif.
import http from 'node:http'
import { isIP } from 'node:net'
import { mkdirSync, rmdirSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { createProxyAttestation } from './proxy-attestation.mjs'
import { createPilotPrivateHandler } from './pilot-private.mjs'
import { createPrivateResources } from './private-resources.mjs'

export const HOSTED_ORIGIN = 'https://avatar.a658yg-catalogue.ch'
export const HOSTED_PROXY_HOST = 'aqsvp5bhvmw.preview.hosting-ik.com'
const address = value => value?.startsWith('::ffff:') ? value.slice(7) : value
const diagnosticHost = value => {
  const text = Array.isArray(value) ? value.join(',') : value
  if (typeof text !== 'string' || !text) return 'absent'
  return text.slice(0, 255).replace(/[^A-Za-z0-9._:,\- \[\]]/g, '?')
}
export function secureProxyCheck(trustedProxyAddresses) {
  if (!Array.isArray(trustedProxyAddresses) || !trustedProxyAddresses.length || trustedProxyAddresses.length > 16 ||
      trustedProxyAddresses.some(ip => typeof ip !== 'string' || !isIP(ip))) throw Error('Adresses IP exactes du proxy requises')
  const trusted = new Set(trustedProxyAddresses.map(address))
  return req => trusted.has(address(req.socket.remoteAddress)) && req.headers['x-forwarded-proto'] === 'https'
}

export function createHostedTransport({ enabled = false, publicOrigin, trustedProxyAddresses, users, stateFile,
  createSession, renderPage, createGateway = null, responseTimeoutMs = 10000, socketTimeoutMs = 15000, proxyVerification = 'exact-addresses', requestProbe,
  reportTransportRefusal = (reason, diagnostic) => console.warn('Contrôle HTTPS refusé : ' + reason +
    (diagnostic ? ' ; host=' + diagnostic.host + ' ; x-forwarded-host=' + diagnostic.forwardedHost : '')) } = {}) {
  if (enabled !== true || publicOrigin !== HOSTED_ORIGIN) throw Error('Activation et origine distante explicites requises')
  if (createGateway !== null && typeof createGateway !== 'function') throw Error('Fabrique privée invalide')
  if (!['exact-addresses', 'self-https'].includes(proxyVerification)) throw Error('Mode de proxy inconnu')
  const attestation = proxyVerification === 'self-https' ? createProxyAttestation({ publicOrigin, requestProbe,
    proxyHosts: [HOSTED_PROXY_HOST] }) : null
  const secure = attestation ? attestation.secure : secureProxyCheck(trustedProxyAddresses)
  if (typeof stateFile !== 'string' || !isAbsolute(stateFile)) throw Error('État privé absolu requis')
  // Verrou exclusif : un deuxième processus ne peut pas contourner le quota.
  const lock = stateFile + '.lock'
  mkdirSync(lock, { mode: 0o700 })
  let renewalTimer=null
  let gateway, server, released = false
  const release = () => { if (!released) { rmdirSync(lock); released = true } }
  try {
    let status
    if (createGateway) {
      gateway = createGateway({ isSecureRequest: secure }); status = gateway.status
    } else {
      const simulation = createSession(); status = simulation.status
      gateway = createPilotPrivateHandler({ enabled: true, publicOrigin, session: simulation, users,
        maxAttempts: 100, windowMs: 60000, isSecureRequest: secure,
        serveResource: createPrivateResources(simulation, renderPage, responseTimeoutMs) })
    }
    let lastRefusalLog = -Infinity
    server = http.createServer((req, res) => {
      if (attestation?.handleProof(req, res)) return
      const handle = async () => {
        if (attestation) await attestation.ensure(req,{waitForRenewal:true})
        // Rejeter avant même le challenge Basic si le transport n'est pas attesté.
        if (!secure(req)) {
          // Diagnostic borné : Host et X-Forwarded-Host nettoyés seulement en cas d'écart ; jamais d'IP, URL, identifiant ou contenu.
          const now = Date.now()
          if (now - lastRefusalLog >= 5000) {
            lastRefusalLog = now
            const reason = attestation ? attestation.refusalReason(req) : 'exact_address_check'
            const diagnostic = reason === 'host' ? { host: diagnosticHost(req.headers.host),
              forwardedHost: diagnosticHost(req.headers['x-forwarded-host']) } : undefined
            try { reportTransportRefusal(reason, diagnostic) } catch {}
          }
          const api = ['/private/dialogue', '/private/pathway', '/private/course-search', '/private/profile-references', '/private/catalogue-status'].includes(req.url?.split('?')[0]) || req.headers.accept?.includes('application/json')
          res.writeHead(403, { 'Content-Type': api ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
          return res.end(api ? JSON.stringify({ code: 'secure_transport_required' }) : 'Transport HTTPS via proxy de confiance requis')
        }
        // Infomaniak transmet son Host de prévisualisation au backend. Après preuve HTTPS et pair attesté seulement,
        // normaliser vers l'origine publique attendue par les contrôles applicatifs de même origine.
        if (req.headers.host === HOSTED_PROXY_HOST) req.headers.host = new URL(publicOrigin).host
        res.setHeader('Strict-Transport-Security', 'max-age=86400')
        await gateway.handler(req, res)
      }
      handle().catch(() => {
        if (!res.headersSent) res.writeHead(503, { 'Cache-Control': 'no-store' })
        res.end()
      })
    })
    server.requestTimeout = 15000; server.headersTimeout = 10000
    server.setTimeout(socketTimeoutMs+(attestation?15000:0), socket => socket.destroy())
    const cleanup = () => { try { clearInterval(renewalTimer);attestation?.stop(); gateway.close?.() } finally { release() } }
    server.on('close', cleanup)
    if(attestation)server.once('listening',()=>{renewalTimer=setInterval(()=>{attestation.refresh().catch(()=>{})},120000);renewalTimer.unref()})
    // Échec avant écoute : fermer seulement les ressources de cette instance.
    const listenError = () => cleanup()
    server.once('error', listenError)
    server.once('listening', () => server.removeListener('error', listenError))
    // close() est une fermeture technique ; stop() est une révocation persistante.
    return { server, attestProxy: () => attestation?.refresh() ?? Promise.resolve(true), status, stop: gateway.stop, revoke: gateway.revoke,
      close: () => new Promise((accept, reject) => {
        server.close(error => { if (error) reject(error); else accept() })
        server.closeAllConnections()
      }) }
  } catch (error) { release(); throw error }
}


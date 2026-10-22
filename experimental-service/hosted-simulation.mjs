// HTTP interne derrière un proxy HTTPS explicitement identifié. Simulation exclusivement.
import http from 'node:http'
import { isIP } from 'node:net'
import { randomUUID } from 'node:crypto'
import { createProxyAttestation } from './proxy-attestation.mjs'
import { mkdirSync, rmdirSync, readFileSync, lstatSync, realpathSync, writeFileSync, copyFileSync, renameSync, unlinkSync, constants } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPilotSimulation } from './pilot-simulation.mjs'
import { createPilotPrivateHandler } from './pilot-private.mjs'
import { createPrivateResources } from './private-resources.mjs'
import { renderPrivatePage } from './private-page.mjs'
import { validateProfileReferences } from './profile-references.mjs'

export const HOSTED_ORIGIN = 'https://avatar.a658yg-catalogue.ch'
const address = value => value?.startsWith('::ffff:') ? value.slice(7) : value
export function secureProxyCheck(trustedProxyAddresses) {
  if (!Array.isArray(trustedProxyAddresses) || !trustedProxyAddresses.length || trustedProxyAddresses.length > 16 ||
      trustedProxyAddresses.some(ip => typeof ip !== 'string' || !isIP(ip))) throw Error('Adresses IP exactes du proxy requises')
  const trusted = new Set(trustedProxyAddresses.map(address))
  return req => trusted.has(address(req.socket.remoteAddress)) && req.headers['x-forwarded-proto'] === 'https'
}

export function createHostedSimulation({ enabled = false, publicOrigin, trustedProxyAddresses, users, stateFile,
  loadProfileReferences, preview, proxyVerification = 'exact-addresses', requestProbe } = {}) {
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
    const simulation = createPilotSimulation({ stateFile, maxDailyRequests: 5, maxTotalRequests: 5,
      singleInstance: true, loadProfileReferences, preview })
    gateway = createPilotPrivateHandler({ enabled: true, publicOrigin, session: simulation, users,
      maxAttempts: 100, windowMs: 60000, isSecureRequest: secure,
      serveResource: createPrivateResources(simulation, renderPrivatePage, 10000) })
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
    server.setTimeout(15000, socket => socket.destroy())
    server.on('close', () => { attestation?.stop(); release() })
    // close() est une fermeture technique ; stop() est une révocation persistante.
    return { server, attestProxy: () => attestation?.refresh() ?? Promise.resolve(true), status: simulation.status, stop: gateway.stop, revoke: gateway.revoke,
      close: () => new Promise((accept, reject) => {
        server.close(error => { if (error) reject(error); else accept() })
        server.closeAllConnections()
      }) }
  } catch (error) { release(); throw error }
}

export function readHostedConfig(configFile, siteDirectory) {
  if (process.platform === 'win32') throw Error('Configuration hébergée réservée à POSIX')
  if (!isAbsolute(configFile) || !isAbsolute(siteDirectory)) throw Error('Chemins absolus requis')
  const site = realpathSync(siteDirectory)
  const inside = path => { const diff = relative(site, realpathSync(path)); return !diff || (!diff.startsWith('..') && !isAbsolute(diff)) }
  const read = (path, limit) => {
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit || (stat.mode & 0o077) || inside(path)) throw Error('Fichier privé non protégé ou placé dans le site')
    return JSON.parse(readFileSync(path, 'utf8'))
  }
  const config = read(configFile, 64000)
  if (config.publicOrigin !== HOSTED_ORIGIN || config.port !== 3000 || typeof config.privateDirectory !== 'string' || !isAbsolute(config.privateDirectory)) throw Error('Configuration distante invalide')
  const directory = lstatSync(config.privateDirectory)
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) || inside(config.privateDirectory)) throw Error('Dossier privé non protégé')
  const path = name => join(config.privateDirectory, name)
  if (resolve(configFile) !== path('config.json')) throw Error('Configuration hors du dossier privé')
  // Un état existant n'est jamais réinitialisé, même s'il est invalide.
  try { read(path('quotas.json'), 64000) } catch (error) { if (error.code !== 'ENOENT') throw error }
  return { ...config, enabled: true, users: read(path('users.json'), 32000), stateFile: path('quotas.json'),
    preview: read(path('preview.json'), 256 * 1024),
    loadProfileReferences: () => validateProfileReferences(read(path('references.json'), 128 * 1024)) }
}

// Mise à niveau explicite de la seule configuration ; accès et quotas conservés.
export function enableProxyAttestation(configFile, siteDirectory) {
  readHostedConfig(configFile, siteDirectory)
  const config = JSON.parse(readFileSync(configFile, 'utf8'))
  if (config.proxyVerification === 'self-https') return false
  const backup = configFile + '.before-self-https'
  copyFileSync(configFile, backup, constants.COPYFILE_EXCL)
  const temp = configFile + '.' + randomUUID() + '.tmp'
  try {
    writeFileSync(temp, JSON.stringify({ ...config, proxyVerification: 'self-https' }, null, 2), { mode: 0o600, flag: 'wx' })
    renameSync(temp, configFile)
  } catch (error) { try { unlinkSync(temp) } catch {} throw error }
  return true
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === '--enable-proxy-attestation') {
      enableProxyAttestation(process.argv[3], process.cwd())
      console.log('Contrôle HTTPS automatique configuré. Sauvegarde privée conservée ; accès et quotas inchangés. Serveur non démarré.')
    } else {
    if (process.env.AVATAR_HOSTED_SIMULATION_ENABLED !== 'true') throw Error('Simulation hébergée non activée')
    const options = readHostedConfig(process.argv[2], process.cwd())
    const service = createHostedSimulation(options)
    for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => { service.close().catch(() => { process.exitCode = 1 }) })
    service.server.listen(3000, '0.0.0.0', async () => {
      console.log('Avatar privé : simulation uniquement, cinq confirmations maximum, port 3000.')
      if (options.proxyVerification === 'self-https') {
        const verified = await service.attestProxy()
        console.log(verified ? 'Contrôle HTTPS du proxy réussi.' : 'Contrôle HTTPS du proxy indisponible ; accès bloqué jusqu’à vérification.')
      }
    })
    }
  } catch { console.error('Démarrage refusé : vérifier la configuration privée, le proxy et le verrou.'); process.exitCode = 1 }
}

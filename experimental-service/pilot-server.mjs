// Serveur de simulation uniquement. Aucun import du transport vers le moteur réel.
import http from 'node:http'
import https from 'node:https'
import { readFileSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPilotSimulation } from './pilot-simulation.mjs'
import { createPilotPrivateHandler } from './pilot-private.mjs'
import { renderPrivatePage } from './private-page.mjs'
import { createPrivateResources } from './private-resources.mjs'
import { MAX_REFERENCE_BYTES } from './profile-references.mjs'

export function createPilotSimulationServer({ enabled = false, publicOrigin, tls, users, maxAttempts, windowMs,
  stateFile, maxDailyRequests, maxTotalRequests, singleInstance, loadProfileReferences, preview, timeoutMs = 10000 } = {}) {
  if (typeof enabled !== 'boolean') throw Error('Activation booléenne requise')
  if (!enabled) return { server: http.createServer((_req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ error: 'Simulation privée désactivée' }))
  }), stop() {}, revoke() {}, status: () => ({ enabled: false }) }
  const origin = new URL(publicOrigin)
  if (origin.origin !== publicOrigin || origin.protocol !== 'https:' || origin.hostname !== '127.0.0.1' ||
      !tls?.key || !tls?.cert || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 210000) {
    throw Error('Origine HTTPS locale, certificat et délai explicites requis')
  }
  const simulation = createPilotSimulation({ stateFile, maxDailyRequests, maxTotalRequests, singleInstance, loadProfileReferences, preview })
  const gateway = createPilotPrivateHandler({ enabled: true, publicOrigin, session: simulation, users, maxAttempts, windowMs,
    isSecureRequest: req => req.socket.encrypted === true,
    serveResource: createPrivateResources(simulation, renderPrivatePage, timeoutMs),
  })
  const server = https.createServer({ key: tls.key, cert: tls.cert }, gateway.handler)
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  server.setTimeout(timeoutMs + 5000, socket => socket.destroy())
  return { server, stop: gateway.stop, revoke: gateway.revoke, status: simulation.status }
}

function readJson(path, maxBytes) {
  if (typeof path !== 'string' || !isAbsolute(path) || statSync(path).size > maxBytes) throw Error('Fichier privé invalide')
  return JSON.parse(readFileSync(path, 'utf8'))
}

// Lancement manuel explicitement limité à la boucle locale et à la simulation.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.AVATAR_PILOT_SIMULATION_ENABLED !== 'true') throw Error('Simulation privée non activée explicitement')
  const config = readJson(process.argv[2], 64000)
  for (const field of ['keyFile', 'certFile', 'usersFile', 'referencesFile', 'previewFile', 'stateFile']) {
    if (typeof config[field] !== 'string' || !isAbsolute(config[field])) throw Error('Chemins privés absolus requis')
  }
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 ||
      config.publicOrigin !== 'https://127.0.0.1:' + config.port) throw Error('Origine et port locaux incohérents')
  const service = createPilotSimulationServer({ ...config, enabled: true,
    tls: { key: readFileSync(config.keyFile), cert: readFileSync(config.certFile) },
    users: readJson(config.usersFile, 32000),
    loadProfileReferences: () => readJson(config.referencesFile, MAX_REFERENCE_BYTES),
    preview: readJson(config.previewFile, 256 * 1024),
  })
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => {
    try { service.stop() } finally { service.server.closeAllConnections(); service.server.close() }
  })
  service.server.listen(config.port, '127.0.0.1', () => console.log('Avatar privé en simulation : ' + config.publicOrigin))
}

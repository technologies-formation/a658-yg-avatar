// Essai réel privé exclusivement local. Importer ce module n'active rien.
import http from 'node:http'
import https from 'node:https'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPathwaySession } from './pathway-session.mjs'
import { createPilotPrivateHandler } from './pilot-private.mjs'
import { createPrivateResources } from './private-resources.mjs'
import { renderRealPrivatePage } from './real-private-page.mjs'

const backend = 'https://api.a658yg-catalogue.ch'
export function createPilotRealServer({ enabled = false, publicOrigin, tls, users, maxAttempts, windowMs,
  stateFile, reportFile, singleInstance, fetchImpl = globalThis.fetch } = {}) {
  if (typeof enabled !== 'boolean') throw Error('Activation booléenne requise')
  if (!enabled) return { server: http.createServer((_req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ error: 'Essai réel désactivé' }))
  }), stop() {}, revoke() {}, status: () => ({ enabled: false }) }
  const origin = new URL(publicOrigin)
  if (origin.origin !== publicOrigin || origin.protocol !== 'https:' || origin.hostname !== '127.0.0.1' ||
      !tls?.key || !tls?.cert || typeof reportFile !== 'string' || !isAbsolute(reportFile) ||
      reportFile === stateFile || dirname(reportFile) !== dirname(stateFile)) {
    throw Error('Origine HTTPS locale, certificat et fichiers privés distincts requis')
  }
  const session = createPathwaySession({ enabled: true, singleInstance, stateFile,
    endpoint: backend + '/api/pathway', referencesEndpoint: backend + '/api/profile-references',
    allowedOrigins: [backend], pathwayTimeoutMs: 200000, referenceTimeoutMs: 5000,
    maxDailyRequests: 1, maxTotalRequests: 1, fetchImpl,
  })
  const realSession = {
    getReferences: session.getReferences, stop: session.stop,
    async buildPathway(...args) {
      const value = await session.buildPathway(...args)
      const result = value.result
      const report = { completedAt: new Date().toISOString(), mode: 'real', quota: session.status(),
        usage: result.usage ?? null,
        courseCodes: Object.fromEntries(['recommendedSteps', 'optionalSteps', 'informationalCourses'].map(key =>
          [key, (result[key] ?? (key === 'recommendedSteps' ? result.steps : null) ?? []).map(item => item.course.code)])),
      }
      // La tentative est déjà réservée. Un échec de rapport n'entraîne jamais un nouvel appel.
      let reportSaved = false
      try { writeFileSync(reportFile, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 }); reportSaved = true } catch {}
      return { mode: 'real', result, quota: session.status(), reportSaved }
    },
  }
  const gateway = createPilotPrivateHandler({ enabled: true, publicOrigin, session: realSession, users, maxAttempts, windowMs,
    isSecureRequest: req => req.socket.encrypted === true,
    serveResource: createPrivateResources(realSession, renderRealPrivatePage, 210000),
  })
  const server = https.createServer({ key: tls.key, cert: tls.cert }, gateway.handler)
  server.requestTimeout = 15000; server.headersTimeout = 10000
  server.setTimeout(215000, socket => socket.destroy())
  return { server, stop: gateway.stop, revoke: gateway.revoke, status: session.status }
}

function readJson(path, maxBytes) {
  if (typeof path !== 'string' || !isAbsolute(path) || statSync(path).size > maxBytes) throw Error('Fichier privé invalide')
  return JSON.parse(readFileSync(path, 'utf8'))
}

// Réutilise uniquement le certificat et le compte locaux ; pas le quota de simulation.
export function readRealTrialConfig(configFile) {
  const config = readJson(configFile, 64000)
  for (const field of ['keyFile', 'certFile', 'usersFile', 'stateFile']) {
    if (typeof config[field] !== 'string' || !isAbsolute(config[field])) throw Error('Chemins privés absolus requis')
  }
  const directory = dirname(configFile)
  if (['keyFile', 'certFile', 'usersFile', 'stateFile'].some(field => dirname(config[field]) !== directory) ||
      config.singleInstance !== true) throw Error('Session locale privée cohérente requise')
  const stateFile = join(directory, 'real-one-attempt-quotas.json')
  const reportFile = join(directory, 'real-one-attempt-report.json')
  if (config.stateFile === stateFile || config.stateFile === reportFile) throw Error('Compteur de simulation distinct requis')
  return { enabled: true, port: 8800, publicOrigin: 'https://127.0.0.1:8800', singleInstance: true,
    maxAttempts: 100, windowMs: 60000, stateFile, reportFile,
    tls: { key: readFileSync(config.keyFile), cert: readFileSync(config.certFile) }, users: readJson(config.usersFile, 32000) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.AVATAR_PILOT_REAL_ENABLED !== 'true') throw Error('Essai réel non activé explicitement')
  const config = readRealTrialConfig(process.argv[2])
  const service = createPilotRealServer(config)
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => {
    try { service.stop() } finally { service.server.closeAllConnections(); service.server.close() }
  })
  service.server.on('error', error => { console.error('Écoute locale refusée : ' + error.code); process.exitCode = 1 })
  service.server.listen(config.port, '127.0.0.1', () => {
    console.log('Avatar privé — une tentative réelle : ' + config.publicOrigin + '/private/')
    console.log('Confirmer dans le navigateur engage le moteur payant. Aucune relance automatique.')
    console.log('Rapport sans profil ni secret après succès : ' + config.reportFile)
  })
}

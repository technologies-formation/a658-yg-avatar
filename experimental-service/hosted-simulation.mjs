// HTTP interne derrière un proxy HTTPS explicitement identifié. Simulation exclusivement.
import { randomUUID } from 'node:crypto'
import { readFileSync, lstatSync, realpathSync, writeFileSync, copyFileSync, renameSync, unlinkSync, constants } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPilotSimulation } from './pilot-simulation.mjs'
import { createDialogueSimulationInterface } from './dialogue-interface.mjs'
import { renderMessagingPage } from './messaging-page.mjs'
import { renderPrivatePage } from './private-page.mjs'
import { validateProfileReferences } from './profile-references.mjs'

export { HOSTED_ORIGIN, secureProxyCheck } from './hosted-transport.mjs'
import { HOSTED_ORIGIN, createHostedTransport } from './hosted-transport.mjs'

export function createHostedSimulation(options = {}) {
  if (!['legacy', 'messaging', 'dialogue-fictitious'].includes(options.interface ?? 'legacy')) throw Error('Interface de simulation inconnue')
  if (options.interface === 'dialogue-fictitious') return createHostedTransport({ ...options,
    createGateway: ({ isSecureRequest }) => createDialogueSimulationInterface({ enabled: true, publicOrigin: options.publicOrigin,
      users: options.users, isSecureRequest, stateFile: options.stateFile, loadProfileReferences: options.loadProfileReferences,
      preview: options.preview, timeoutMs: options.responseTimeoutMs ?? 10000 }) })
  return createHostedTransport({ ...options, createGateway: null, renderPage: options.interface === 'messaging' ? renderMessagingPage : renderPrivatePage,
    createSession: () => createPilotSimulation({ stateFile: options.stateFile,
      maxDailyRequests: 5, maxTotalRequests: 5, singleInstance: true,
      loadProfileReferences: options.loadProfileReferences, preview: options.preview }) })
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

// Choix explicite et réversible de l’interface de simulation ; état et accès intacts.
export function setHostedSimulationInterface(configFile, siteDirectory, interfaceName) {
  if (!['messaging', 'dialogue-fictitious'].includes(interfaceName)) throw Error('Interface de simulation inconnue')
  readHostedConfig(configFile, siteDirectory)
  const config = JSON.parse(readFileSync(configFile, 'utf8'))
  if (config.interface === interfaceName) return { changed: false }
  const backup = configFile + '.before-interface-' + randomUUID()
  copyFileSync(configFile, backup, constants.COPYFILE_EXCL)
  const temp = configFile + '.' + randomUUID() + '.tmp'
  try {
    writeFileSync(temp, JSON.stringify({ ...config, interface: interfaceName }, null, 2), { mode: 0o600, flag: 'wx' })
    renameSync(temp, configFile)
  } catch (error) { try { unlinkSync(temp) } catch {} throw error }
  readHostedConfig(configFile, siteDirectory)
  return { changed: true, backup }
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
    if (['--use-fictitious-dialogue', '--use-messaging-interface'].includes(process.argv[2])) {
      const dialogue = process.argv[2] === '--use-fictitious-dialogue'
      setHostedSimulationInterface(process.argv[3], process.cwd(), dialogue ? 'dialogue-fictitious' : 'messaging')
      console.log((dialogue ? 'Dialogue fictif' : 'Messagerie guidée') + ' configuré. Sauvegarde privée conservée ; accès et quotas inchangés. Serveur non démarré.')
    } else if (process.argv[2] === '--enable-proxy-attestation') {
      enableProxyAttestation(process.argv[3], process.cwd())
      console.log('Contrôle HTTPS automatique configuré. Sauvegarde privée conservée ; accès et quotas inchangés. Serveur non démarré.')
    } else {
    if (process.env.AVATAR_HOSTED_SIMULATION_ENABLED !== 'true') throw Error('Simulation hébergée non activée')
    const options = readHostedConfig(process.argv[2], process.cwd())
    const service = createHostedSimulation(options)
    service.server.once('error', () => { console.error('Démarrage refusé : port indisponible ou écoute refusée.'); process.exitCode = 1 })
    for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => { service.close().catch(() => { process.exitCode = 1 }) })
    service.server.listen(3000, '0.0.0.0', async () => {
      console.log(options.interface === 'dialogue-fictitious' ? 'Avatar privé : dialogue fictif, simulation uniquement, aucun appel OpenAI, port 3000.' : 'Avatar privé : simulation uniquement, cinq confirmations maximum, port 3000.')
      if (options.proxyVerification === 'self-https') {
        const verified = await service.attestProxy()
        console.log(verified ? 'Contrôle HTTPS du proxy réussi.' : 'Contrôle HTTPS du proxy indisponible ; accès bloqué jusqu’à vérification.')
      }
    })
    }
  } catch { console.error('Démarrage refusé : vérifier la configuration privée, le proxy et le verrou.'); process.exitCode = 1 }
}

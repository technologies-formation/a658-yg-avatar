// Préparation seulement : activation distincte explicite, aucun effet à l'import.
import { lstatSync } from 'node:fs'
import { dirname, join, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readHostedConfig } from './hosted-simulation.mjs'
import { createHostedTransport, HOSTED_ORIGIN } from './hosted-transport.mjs'
import { createRealSession } from './real-session.mjs'
import { renderRealPrivatePage } from './real-private-page.mjs'

export function createHostedReal(options = {}) {
  const { enabled, publicOrigin, stateFile, reportFile, fetchImpl } = options
  if (enabled !== true || publicOrigin !== HOSTED_ORIGIN) throw Error('Essai réel distant non activé explicitement')
  if (typeof stateFile !== 'string' || !isAbsolute(stateFile) || typeof reportFile !== 'string' ||
      !isAbsolute(reportFile) || dirname(stateFile) !== dirname(reportFile) || stateFile === reportFile) throw Error('Fichiers privés distincts requis')
  return createHostedTransport({ ...options, responseTimeoutMs: 210000, socketTimeoutMs: 215000,
    renderPage: (references, settings) => renderRealPrivatePage(references, settings)
      .replaceAll('Essai privé local connecté au moteur.', 'Essai privé distant connecté au moteur.'),
    createSession: () => createRealSession({ stateFile, reportFile, singleInstance: true, fetchImpl }) })
}

export function readHostedRealConfig(configFile, siteDirectory) {
  const config = readHostedConfig(configFile, siteDirectory)
  const stateFile = join(config.privateDirectory, 'hosted-real-one-attempt-quotas.json')
  const reportFile = join(config.privateDirectory, 'hosted-real-one-attempt-report.json')
  // Ne jamais suivre un lien ni réinitialiser un fichier déjà présent.
  for (const path of [stateFile, reportFile]) {
    try {
      const stat = lstatSync(path)
      if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw Error('Fichier réel privé non protégé')
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return { ...config, enabled: false, stateFile, reportFile }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.env.AVATAR_HOSTED_REAL_ENABLED !== 'true') throw Error('Activation réelle distante absente')
    const options = readHostedRealConfig(process.argv[2], process.cwd())
    const service = createHostedReal({ ...options, enabled: true })
    for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => { service.close().catch(() => { process.exitCode = 1 }) })
    service.server.on('error', () => { console.error('Écoute refusée ; aucun redémarrage automatique.'); process.exitCode = 1 })
    service.server.listen(3000, '0.0.0.0', async () => {
      console.log('Avatar privé distant : UNE tentative réelle payante après confirmation explicite. Aucune relance automatique.')
      console.log(await service.attestProxy() ? 'Contrôle HTTPS du proxy réussi.' : 'Proxy non vérifié ; accès bloqué.')
    })
  } catch { console.error('Essai réel distant refusé : activation, configuration ou verrou à vérifier.'); process.exitCode = 1 }
}

// Mode privé sans plafond d’essais : activation explicite, compteurs existants conservés.
import { lstatSync, realpathSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readHostedDialogueTrialConfig, readDialogueTrialLaunch, createHostedDialogueTrial } from './hosted-dialogue-trial.mjs'

export function readPrivatePilotLaunch(configFile, siteDirectory, environment, pathwayDirectory) {
  if (environment.AVATAR_PRIVATE_UNLIMITED_ENABLED !== 'true') throw Error('Activation du pilote sans plafond absente')
  const prepared = readHostedDialogueTrialConfig(configFile, siteDirectory)
  if (!prepared.pathwayTrial?.enabled || !prepared.pathwayTrial.paidTrialAuthorized) throw Error('Parcours réel non autorisé')
  if (typeof pathwayDirectory !== 'string' || !isAbsolute(pathwayDirectory)) throw Error('Compteur existant requis')
  const scope = relative(prepared.privateDirectory, pathwayDirectory)
  const directory = lstatSync(pathwayDirectory)
  if (!scope || scope === '..' || scope.startsWith('../') || isAbsolute(scope) ||
      !directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) ||
      realpathSync(pathwayDirectory) !== pathwayDirectory) throw Error('Dossier de compteurs privé requis')
  const stateFile = join(pathwayDirectory, 'quotas.json'), reportFile = join(pathwayDirectory, 'report.json')
  // Un compteur présent est obligatoire : aucun nouveau registre ni remise à zéro.
  for (const file of [stateFile, reportFile]) {
    const info = lstatSync(file)
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) throw Error('Registre privé existant requis')
  }
  const options = readDialogueTrialLaunch(configFile, siteDirectory, environment)
  return { ...options, unlimited: true, guidedDraft: true, validationAuthorized: false,
    pathwayTrial: { enabled: true, paidTrialAuthorized: true },
    pathwayStateFile: stateFile, pathwayReportFile: reportFile }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = readPrivatePilotLaunch(process.argv[2], process.cwd(), process.env, process.argv[3])
    const service = createHostedDialogueTrial(options)
    service.server.once('error', () => {
      console.error('Pilote non démarré : écoute refusée. Compteurs conservés.')
      process.exitCode = 1
    })
    for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => {
      service.close().catch(() => { process.exitCode = 1 })
    })
    service.server.listen(3000, '0.0.0.0', async () => {
      console.log('Assistant privé : dialogue IA et recherches sans plafond d’essais. Compteurs et suivi conservés. Aucun appel payant à l’ouverture.')
      console.log(await service.attestProxy() ? 'Contrôle HTTPS du proxy réussi.' : 'Contrôle HTTPS indisponible ; accès bloqué.')
    })
  } catch {
    console.error('Pilote non démarré : vérifier l’activation et les compteurs privés existants.')
    process.exitCode = 1
  }
}

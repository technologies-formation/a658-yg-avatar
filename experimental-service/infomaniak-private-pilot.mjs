import { loadEnvFile } from 'node:process'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const environmentFiles = Object.freeze(['openai.env', 'mail.env', 'consumption.env'])
const activation = Object.freeze({
  AVATAR_DIALOGUE_TRIAL_ENABLED: 'true',
  AVATAR_PATHWAY_TRIAL_ENABLED: 'true',
  AVATAR_PATHWAY_VALIDATION_ENABLED: 'true',
  AVATAR_PRIVATE_UNLIMITED_ENABLED: 'true',
  AVATAR_MAIL_ENABLED: 'true',
  A658_DAILY_REPORT_ENABLED: 'true',
  AVATAR_DEVICE_MEMORY_ENABLED: 'true',
})

export function prepareInfomaniakPrivatePilot({ configFile, pathwayDirectory, environment = process.env,
  loadFile = path => loadEnvFile(path) } = {}) {
  if (typeof configFile !== 'string' || !isAbsolute(configFile) || basename(configFile) !== 'config.json' ||
      typeof pathwayDirectory !== 'string' || !isAbsolute(pathwayDirectory) ||
      !environment || typeof environment !== 'object' || typeof loadFile !== 'function') {
    throw Error('Paramètres absolus du lanceur court requis')
  }
  const privateDirectory = dirname(configFile)
  for (const name of environmentFiles) loadFile(join(privateDirectory, name), environment)
  Object.assign(environment, activation)
  return {
    launcher: fileURLToPath(new URL('./hosted-private-pilot.mjs', import.meta.url)),
    args: [configFile, pathwayDirectory],
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const prepared = prepareInfomaniakPrivatePilot({ configFile: process.argv[2], pathwayDirectory: process.argv[3] })
    process.argv = [process.execPath, prepared.launcher, ...prepared.args]
    await import(pathToFileURL(prepared.launcher).href)
  } catch {
    console.error('Pilote non démarré : vérifier le lanceur court et les fichiers privés.')
    process.exitCode = 1
  }
}

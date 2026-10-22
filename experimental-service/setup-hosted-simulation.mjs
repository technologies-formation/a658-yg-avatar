// Préparation ponctuelle hors du site et hors Git ; aucun serveur ni moteur lancé.
import { mkdirSync, writeFileSync, rmSync, existsSync, realpathSync, lstatSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createPilotCredential } from './pilot-auth.mjs'
import { createProfileReferencesClient } from './profile-references.mjs'
import { data } from './result-test-fixtures.mjs'
import { HOSTED_ORIGIN, secureProxyCheck } from './hosted-simulation.mjs'

export async function prepareHostedSimulation({ privateDirectory, siteDirectory, trustedProxyAddresses,
  fetchImpl = globalThis.fetch } = {}) {
  if (process.platform === 'win32') throw Error('Préparation hébergée réservée à POSIX')
  if (typeof privateDirectory !== 'string' || !isAbsolute(privateDirectory) || typeof siteDirectory !== 'string' || !isAbsolute(siteDirectory)) throw Error('Chemins absolus requis')
  secureProxyCheck(trustedProxyAddresses)
  const target = resolve(privateDirectory), site = realpathSync(siteDirectory)
  const parent = realpathSync(dirname(target))
  const diff = relative(site, join(parent, target.split('/').at(-1)))
  if (!diff || (!diff.startsWith('..') && !isAbsolute(diff))) throw Error('Dossier privé dans le site refusé')
  for (let ancestor = target; ; ancestor = dirname(ancestor)) {
    const git = join(ancestor, '.git')
    if (existsSync(git) && (lstatSync(git).isFile() || existsSync(join(git, 'HEAD')))) throw Error('Dossier privé dans Git refusé')
    if (dirname(ancestor) === ancestor) break
  }
  // Refuser toute seconde préparation, sans écraser accès ou quotas.
  if (existsSync(target)) throw Error('Dossier privé déjà présent : conserver les accès et quotas existants')
  const endpoint = 'https://api.a658yg-catalogue.ch/api/profile-references'
  const references = await createProfileReferencesClient({ endpoint, allowedOrigins: ['https://api.a658yg-catalogue.ch'], fetchImpl }).refresh()
  mkdirSync(target, { mode: 0o700 })
  try {
    if ((lstatSync(target).mode & 0o077) !== 0) throw Error('Droits privés requis')
    const username = 'pilote-avatar', password = randomBytes(24).toString('base64url')
    const user = await createPilotCredential({ id: 'pilote-avatar', username, password })
    const preview = data(); preview.summary = 'Exemple fixe de mise en page, sans analyse de ton profil.'; delete preview.usage
    for (const category of ['recommendedSteps', 'optionalSteps', 'informationalCourses']) {
      for (const item of preview[category] ?? []) delete item.course.sourceUrl
    }
    const write = (name, value) => writeFileSync(join(target, name), JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' })
    write('users.json', [user]); write('references.json', references); write('preview.json', preview)
    write('config.json', { publicOrigin: HOSTED_ORIGIN, port: 3000, privateDirectory: target, trustedProxyAddresses })
    writeFileSync(join(target, 'ACCES_PRIVE.txt'), 'Ne pas partager ni coller dans le chat.\nAdresse : ' + HOSTED_ORIGIN +
      '/private/\nIdentifiant : ' + username + '\nMot de passe : ' + password + '\nCinq simulations ; aucun appel moteur.\n', { mode: 0o600, flag: 'wx' })
    return { configFile: join(target, 'config.json'), accessFile: join(target, 'ACCES_PRIVE.txt'), referenceRevision: references.revision }
  } catch {
    rmSync(target, { recursive: true, force: true })
    throw Error('Préparation interrompue ; nouveau dossier privé retiré')
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await prepareHostedSimulation({ privateDirectory: process.argv[2], siteDirectory: process.cwd(), trustedProxyAddresses: process.argv.slice(3) })
    console.log('Configuration créée : ' + result.configFile)
    console.log('Accès privé à consulter uniquement sur le serveur : ' + result.accessFile)
    console.log('Serveur non démarré ; un GET de référentiel public, aucun appel moteur.')
  } catch { console.error('Préparation refusée : vérifier les chemins, le proxy et l’absence de configuration antérieure.'); process.exitCode = 1 }
}

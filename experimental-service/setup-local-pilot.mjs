// Mise en place locale explicite : aucun lancement, confiance TLS ou appel moteur.
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { isAbsolute, join, dirname, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createPilotCredential } from './pilot-auth.mjs'
import { createProfileReferencesClient } from './profile-references.mjs'
import { data } from './result-test-fixtures.mjs'

function protectDirectory(directory) {
  if (process.platform !== 'win32') return
  const sid = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { encoding: 'utf8', windowsHide: true }).trim()
  if (!/^S-\d+(?:-\d+)+$/.test(sid)) throw Error('Identité Windows non vérifiée')
  execFileSync('icacls.exe', [directory, '/inheritancelevel:r', '/grant:r', '*' + sid + ':(OI)(CI)F',
    '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { stdio: 'pipe', windowsHide: true })
}

export async function prepareLocalPilot({ baseDirectory, opensslPath, fetchImpl = globalThis.fetch } = {}) {
  if (typeof baseDirectory !== 'string' || !isAbsolute(baseDirectory) ||
      typeof opensslPath !== 'string' || !isAbsolute(opensslPath) || !existsSync(opensslPath)) {
    throw Error('Répertoire privé et exécutable OpenSSL absolus requis')
  }
  const base = resolve(baseDirectory)
  if (base.split(/[\\/]/).some(part => /^onedrive(?:\s*-.*)?$/i.test(part))) throw Error('Répertoire OneDrive refusé pour les accès privés')
  for (let ancestor = base; ; ancestor = dirname(ancestor)) {
    const git = join(ancestor, '.git')
    if (existsSync(git) && (statSync(git).isFile() || existsSync(join(git, 'HEAD')))) throw Error('Répertoire Git refusé pour les accès privés')
    if (dirname(ancestor) === ancestor) break
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA
    if (!local || !isAbsolute(local)) throw Error('Profil local Windows indisponible')
    const child = relative(resolve(local), base)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw Error('Utiliser un sous-dossier du profil local Windows')
  }
  // Un seul GET de contrat public. Aucune destination de parcours n’est configurée.
  const endpoint = 'https://api.a658yg-catalogue.ch/api/profile-references'
  const references = await createProfileReferencesClient({ endpoint, allowedOrigins: ['https://api.a658yg-catalogue.ch'], fetchImpl }).refresh()
  mkdirSync(base, { recursive: true, mode: 0o700 })
  const directory = mkdtempSync(join(base, 'session-'))
  try {
    protectDirectory(directory)
    const keyFile = join(directory, 'localhost.key.pem'), certFile = join(directory, 'localhost.cert.pem')
    execFileSync(opensslPath, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
      '-addext', 'basicConstraints=critical,CA:FALSE', '-keyout', keyFile, '-out', certFile],
    { stdio: 'pipe', windowsHide: true })
    const username = 'pilote-local', password = randomBytes(24).toString('base64url')
    const user = await createPilotCredential({ id: 'pilote-local', username, password })
    const usersFile = join(directory, 'users.json'), referencesFile = join(directory, 'references.json')
    const previewFile = join(directory, 'preview.json'), stateFile = join(directory, 'simulation-quotas.json')
    const configFile = join(directory, 'config.json'), accessFile = join(directory, 'ACCES_LOCAL_PRIVE.txt')
    const preview = data()
    preview.summary = 'Exemple fixe de mise en page, sans analyse de ton profil.'
    delete preview.usage
    for (const category of ['recommendedSteps', 'optionalSteps', 'informationalCourses']) {
      for (const item of preview[category] ?? []) delete item.course.sourceUrl
    }
    const config = { port: 8799, publicOrigin: 'https://127.0.0.1:8799', keyFile, certFile, usersFile, referencesFile, previewFile, stateFile,
      singleInstance: true, maxDailyRequests: 5, maxTotalRequests: 5, maxAttempts: 100, windowMs: 60000, timeoutMs: 10000 }
    const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' })
    writeJson(usersFile, [user]); writeJson(referencesFile, references); writeJson(previewFile, preview); writeJson(configFile, config)
    writeFileSync(accessFile, 'ESSAI LOCAL UNIQUEMENT — ne pas partager ni coller dans le chat.\r\n\r\n' +
      'Adresse : ' + config.publicOrigin + '/private/\r\nIdentifiant : ' + username + '\r\nMot de passe : ' + password +
      '\r\n\r\nCertificat de test local valable 24 heures, non ajouté aux certificats de confiance de Windows.\r\n' +
      'Cinq simulations maximum. Aucun appel au moteur réel ou à OpenAI.\r\n', { mode: 0o600, flag: 'wx' })
    return { configFile, accessFile, publicOrigin: config.publicOrigin, referenceRevision: references.revision }
  } catch {
    // Ce répertoire vient d’être créé par cette invocation ; aucun contenu antérieur n’y existe.
    rmSync(directory, { recursive: true, force: true })
    throw Error('Préparation locale interrompue ; aucun accès créé. Vérifier OpenSSL et les droits du dossier privé.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) throw Error('Lanceur réservé au poste Windows vérifié')
    const result = await prepareLocalPilot({ baseDirectory: join(process.env.LOCALAPPDATA, 'A658-YG', 'pilote-prive'), opensslPath: process.argv[2] })
    console.log('Configuration : ' + result.configFile)
    console.log('Fichier d’accès privé : ' + result.accessFile)
    console.log('Prêt pour cinq simulations locales ; serveur non démarré. Aucun certificat de confiance Windows modifié.')
  } catch (error) {
    console.error('Préparation refusée : ' + error.message)
    process.exitCode = 1
  }
}

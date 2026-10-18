import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { X509Certificate, createPrivateKey } from 'node:crypto'
import { prepareLocalPilot } from './setup-local-pilot.mjs'
import { references, referenceResponse } from './reference-test-fixtures.mjs'
import { createPilotAuthenticator } from './pilot-auth.mjs'
import { createPilotSimulationServer } from './pilot-server.mjs'

const opensslPath = process.platform === 'win32' ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'usr', 'bin', 'openssl.exe') : '/usr/bin/openssl'
const directory = t => {
  const privateBase = process.platform === 'win32' ? process.env.LOCALAPPDATA : tmpdir()
  const value = mkdtempSync(join(privateBase, 'avatar-setup-'))
  t.after(() => rmSync(value, { recursive: true, force: true }))
  return value
}

test('préparation : un seul GET public, comptes protégés, certificat local non-CA et aucun moteur configuré', async t => {
  const baseDirectory = directory(t), calls = []
  const result = await prepareLocalPilot({ baseDirectory, opensslPath, fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method }); return referenceResponse()
  } })
  assert.deepEqual(calls, [{ url: 'https://api.a658yg-catalogue.ch/api/profile-references', method: 'GET' }])
  const config = JSON.parse(readFileSync(result.configFile)), users = JSON.parse(readFileSync(config.usersFile))
  const access = readFileSync(result.accessFile, 'utf8'), password = access.match(/Mot de passe : (.+)\r\n/)[1]
  assert.equal(config.publicOrigin, 'https://127.0.0.1:8799')
  assert.equal(config.maxTotalRequests, 5); assert.equal(config.maxDailyRequests, 5)
  assert.equal(existsSync(config.stateFile), false)
  assert.equal(result.referenceRevision, references().revision)
  assert.equal(JSON.stringify(config).includes(password), false)
  assert.equal(JSON.stringify(users).includes(password), false)
  assert.doesNotMatch(JSON.stringify(config), /api\/pathway|OPENAI_API_KEY|endpoint/)
  const cert = new X509Certificate(readFileSync(config.certFile))
  assert.equal(cert.ca, false); assert.equal(cert.checkIP('127.0.0.1'), '127.0.0.1')
  assert.equal(cert.checkPrivateKey(createPrivateKey(readFileSync(config.keyFile))), true)
  const auth = createPilotAuthenticator({ enabled: true, users, maxAttempts: 2, windowMs: 60000, isSecureRequest: () => true })
  assert.deepEqual(await auth.authenticate({ headers: { authorization: 'Basic ' + Buffer.from('pilote-local:' + password).toString('base64') } }), { id: 'pilote-local' })
  const preview = JSON.parse(readFileSync(config.previewFile))
  assert.equal(preview.usage, undefined)
  assert.equal(preview.recommendedSteps[0].course.sourceUrl, undefined)
  const server = createPilotSimulationServer({ ...config, enabled: true, users,
    tls: { key: readFileSync(config.keyFile), cert: readFileSync(config.certFile) },
    preview, loadProfileReferences: () => JSON.parse(readFileSync(config.referencesFile)),
  })
  assert.equal(server.server.listening, false); assert.equal(server.status().enabled, true)
})

test('nouvelle préparation : session distincte, aucun compte ou compteur précédent remplacé', async t => {
  const baseDirectory = directory(t), settings = { baseDirectory, opensslPath, fetchImpl: async () => referenceResponse() }
  const first = await prepareLocalPilot(settings), before = readFileSync(first.accessFile, 'utf8')
  const second = await prepareLocalPilot(settings)
  assert.notEqual(first.configFile, second.configFile)
  assert.equal(readFileSync(first.accessFile, 'utf8'), before)
  assert.equal(readdirSync(baseDirectory).length, 2)
})

test('configuration dans Git ou OneDrive refusée avant réseau ; référentiel invalide ne crée pas d’accès', async t => {
  const base = directory(t)
  let calls = 0
  const fetchImpl = async () => { calls++; return referenceResponse() }
  mkdirSync(join(base, '.git'))
  writeFileSync(join(base, '.git', 'HEAD'), 'ref: refs/heads/test\n')
  await assert.rejects(prepareLocalPilot({ baseDirectory: join(base, 'session'), opensslPath, fetchImpl }), /Git refusé/)
  await assert.rejects(prepareLocalPilot({ baseDirectory: join(tmpdir(), 'OneDrive', 'session'), opensslPath, fetchImpl }), /OneDrive refusé/)
  assert.equal(calls, 0)
  const other = directory(t)
  await assert.rejects(prepareLocalPilot({ baseDirectory: other, opensslPath, fetchImpl: async () => Response.json({}) }))
  assert.deepEqual(readdirSync(other), [])
})

test('échec OpenSSL : la nouvelle session seule est supprimée, les fichiers précédents restent présents', async t => {
  const baseDirectory = directory(t)
  const executable = join(baseDirectory, 'not-openssl.txt')
  writeFileSync(executable, 'Ceci est un fichier de test, pas un exécutable')
  await assert.rejects(prepareLocalPilot({ baseDirectory, opensslPath: executable, fetchImpl: async () => referenceResponse() }), /Préparation locale interrompue/)
  assert.deepEqual(readdirSync(baseDirectory), ['not-openssl.txt'])
})

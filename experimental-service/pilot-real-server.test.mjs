// Aucun transport réel : tous les GET/POST sortants sont injectés.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import https from 'node:https'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createPilotRealServer, readRealTrialConfig } from './pilot-real-server.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { renderRealPrivatePage } from './real-private-page.mjs'
import { references, referenceResponse } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'

let dir, tls, user
const contract = references(), password = 'Mot-de-passe-synthetique-test-uniquement'
const profile = { personnelCategory: 'TEST-A', role: 'x', objective: 'y' }
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'avatar-real-offline-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
  tls = { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }
  user = await createPilotCredential({ id: 'tester', username: 'tester', password })
})
after(() => rmSync(dir, { recursive: true, force: true }))

function create(name, fetchImpl) {
  return createPilotRealServer({ enabled: true, publicOrigin: 'https://127.0.0.1:19877', tls, users: [user],
    maxAttempts: 100, windowMs: 60000, singleInstance: true,
    stateFile: join(dir, name + '-quota.json'), reportFile: join(dir, name + '-report.json'), fetchImpl })
}
async function start(t, service) {
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { service.server.closeAllConnections(); service.server.close(resolve) }))
  return (path = '/', { auth = true, method = 'GET', body, origin = 'https://127.0.0.1:19877' } = {}) => new Promise((resolve, reject) => {
    const req = https.request({ hostname: '127.0.0.1', port: service.server.address().port, path, method, rejectUnauthorized: false,
      headers: { Host: '127.0.0.1:19877', Origin: origin, 'Content-Type': 'application/json',
        ...(auth ? { Authorization: 'Basic ' + Buffer.from('tester:' + password).toString('base64') } : {}) } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString(), headers: res.headers }))
    }); req.on('error', reject); req.end(body && JSON.stringify(body))
  })
}
async function confirmed(send) {
  const ticket = JSON.parse((await send('/private/profile-references')).text)
  return { profile, confirmed: true, referenceRevision: ticket.references.revision, requestId: ticket.requestId }
}

test('essai réel désactivé : aucun appel ; la page distingue génération, coût et simulation', () => {
  let calls = 0
  const service = createPilotRealServer({ fetchImpl: () => { calls++ } })
  assert.equal(service.status().enabled, false); assert.equal(service.server.listening, false); assert.equal(calls, 0)
  assert.throws(() => createPilotRealServer({ enabled: 'true' }))
  assert.throws(() => createPilotRealServer({ enabled: true, publicOrigin: 'https://public.invalid', tls }))
  const page = renderRealPrivatePage(contract)
  assert.match(page, /une tentative réelle/); assert.match(page, /une seule tentative payante/i)
  assert.match(page, /Confirmer le profil et générer/); assert.match(page, /value.result,\{replay:false\}/)
  assert.match(page, /privateTimeoutMs=210000/)
  assert.doesNotMatch(page, /aucun appel au moteur|sans appel au moteur|simulation uniquement|value.preview|Confirmer le profil et simuler/)
  // Les sélecteurs de résultat communs restent cohérents lors d'une correction.
  assert.match(page, /querySelectorAll\('\.simulation'\)/)
})

test('HTTPS réel hors ligne : aucun POST avant confirmation, aucun secret transmis, quota durable de un', async t => {
  const calls = [], result = data()
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return init.method === 'GET' ? referenceResponse(contract) : Response.json(result)
  }
  const service = create('success', fetchImpl), send = await start(t, service)
  assert.equal((await send('/', { auth: false })).status, 401)
  assert.equal((await send('/', { origin: 'https://foreign.invalid' })).status, 403)
  for (const path of ['/', '/private/', '/private/pathway-result.mjs']) assert.equal((await send(path)).status, 200)
  for (const path of ['/real-one-attempt-report.json', '/private/pilot-real-server.mjs', '/.git/config']) assert.equal((await send(path)).status, 404)
  assert.equal(service.status().total, 0); assert.equal(calls.filter(x => x.init.method === 'POST').length, 0)
  const body = await confirmed(send)
  assert.equal((await send('/private/pathway', { method: 'POST', body: { ...body, confirmed: false } })).status, 400)
  const response = await send('/private/pathway', { method: 'POST', body })
  const value = JSON.parse(response.text)
  assert.equal(response.status, 200); assert.equal(value.mode, 'real'); assert.deepEqual(value.result, result)
  assert.equal(value.quota.total, 1); assert.equal(value.quota.maxTotalRequests, 1); assert.equal(value.reportSaved, true)
  assert.equal(response.headers['cache-control'], 'no-store')
  const posts = calls.filter(x => x.init.method === 'POST')
  assert.equal(posts.length, 1); assert.equal(posts[0].url, 'https://api.a658yg-catalogue.ch/api/pathway')
  assert.deepEqual(JSON.parse(posts[0].init.body), profile)
  assert.equal(posts[0].init.headers.Authorization, undefined); assert.equal(posts[0].init.redirect, 'error')
  const report = JSON.parse(readFileSync(join(dir, 'success-report.json')))
  assert.deepEqual(report.usage, result.usage); assert.equal(report.profile, undefined)
  assert.doesNotMatch(JSON.stringify(report), new RegExp(password))
  assert.equal((await send('/private/pathway', { method: 'POST', body })).status, 409)
  const secondBody = await confirmed(send)
  assert.equal((await send('/private/pathway', { method: 'POST', body: secondBody })).status, 429)
  const restarted = create('success', fetchImpl), secondSend = await start(t, restarted)
  assert.equal((await secondSend('/private/pathway', { method: 'POST', body: await confirmed(secondSend) })).status, 429)
  assert.equal(calls.filter(x => x.init.method === 'POST').length, 1)
  service.revoke('tester'); assert.equal((await send()).status, 401)
})

test('échec du moteur : une tentative conservée, aucune relance ni rapport de succès', async t => {
  let posts = 0
  const service = create('failure', async (_url, init) => {
    if (init.method === 'GET') return referenceResponse(contract)
    posts++; throw Error('Erreur transport synthétique')
  })
  const send = await start(t, service)
  assert.equal((await send('/private/pathway', { method: 'POST', body: await confirmed(send) })).status, 502)
  assert.equal(service.status().total, 1)
  assert.equal((await send('/private/pathway', { method: 'POST', body: await confirmed(send) })).status, 429)
  assert.equal(posts, 1); assert.equal(existsSync(join(dir, 'failure-report.json')), false)
})

test('rapport inaccessible après succès : résultat conservé sans répéter le POST', async t => {
  writeFileSync(join(dir, 'report-blocked-report.json'), 'préexistant')
  const service = create('report-blocked', async (_url, init) => init.method === 'GET' ? referenceResponse(contract) : Response.json(data()))
  const send = await start(t, service)
  const response = await send('/private/pathway', { method: 'POST', body: await confirmed(send) })
  assert.equal(response.status, 200); assert.equal(JSON.parse(response.text).reportSaved, false)
  assert.equal(readFileSync(join(dir, 'report-blocked-report.json'), 'utf8'), 'préexistant')
  assert.equal(service.status().total, 1)
})

test('configuration réelle : réemploi local des accès, autre port et autres fichiers, aucun écrasement', () => {
  writeFileSync(join(dir, 'users.json'), JSON.stringify([user]))
  const configFile = join(dir, 'config.json'), simulationState = join(dir, 'simulation-quotas.json')
  const config = { keyFile: join(dir, 'key.pem'), certFile: join(dir, 'cert.pem'), usersFile: join(dir, 'users.json'),
    stateFile: simulationState, singleInstance: true, port: 8799 }
  writeFileSync(configFile, JSON.stringify(config)); writeFileSync(simulationState, 'témoin')
  const real = readRealTrialConfig(configFile)
  assert.equal(real.port, 8800); assert.equal(real.publicOrigin, 'https://127.0.0.1:8800')
  assert.equal(real.stateFile, join(dir, 'real-one-attempt-quotas.json'))
  assert.equal(readFileSync(simulationState, 'utf8'), 'témoin'); assert.equal(existsSync(real.stateFile), false)
  writeFileSync(configFile, JSON.stringify({ ...config, stateFile: real.stateFile }))
  assert.throws(() => readRealTrialConfig(configFile))
})

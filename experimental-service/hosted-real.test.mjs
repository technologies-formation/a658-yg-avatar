// Tous les appels moteur sont injectés ; aucun service distant sollicité.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostedReal, readHostedRealConfig } from './hosted-real.mjs'
import { HOSTED_ORIGIN } from './hosted-transport.mjs'
import { prepareHostedSimulation } from './setup-hosted-simulation.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { references, referenceResponse } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'

const password = 'Mot-de-passe-synthetique-test-uniquement'
const contract = references(), profile = { personnelCategory: 'TEST-A', role: 'x', objective: 'y' }
function request(server, path = '/private/', { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method: body ? 'POST' : 'GET',
      headers: { host: new URL(HOSTED_ORIGIN).host, origin: HOSTED_ORIGIN, 'x-forwarded-proto': 'https',
        authorization: 'Basic ' + Buffer.from('tester:' + password).toString('base64'), 'content-type': 'application/json', ...headers } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', x => { text += x }); res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }))
    }); req.on('error', reject); req.end(body && JSON.stringify(body))
  })
}
async function body(server) {
  const ticket = JSON.parse((await request(server, '/private/profile-references')).text)
  return { profile, confirmed: true, requestId: ticket.requestId, referenceRevision: ticket.references.revision }
}

test('activation réelle distante : refus par défaut, aucun effet réseau', () => {
  let calls = 0
  assert.throws(() => createHostedReal({ fetchImpl: () => { calls++ } }))
  assert.throws(() => createHostedReal({ enabled: true, publicOrigin: 'https://foreign.invalid' }))
  assert.equal(calls, 0)
})

for (const outcome of ['success', 'error', 'timeout']) {
  test('moteur fictif distant : ' + outcome + ', une tentative conservée après redémarrage', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'avatar-hosted-real-'))
    const user = await createPilotCredential({ id: 'tester', username: 'tester', password })
    const calls = []
    const options = { enabled: true, publicOrigin: HOSTED_ORIGIN, trustedProxyAddresses: ['127.0.0.1'], users: [user],
      stateFile: join(dir, 'real-quota.json'), reportFile: join(dir, 'report.json'), fetchImpl: async (url, init) => {
        calls.push({ url, init })
        if (init.method === 'GET') return referenceResponse(contract)
        // Compteur durable écrit avant même d'entrer dans le transport sortant.
        assert.equal(JSON.parse(readFileSync(options.stateFile)).total, 1)
        if (outcome === 'error') throw Error('Transport synthétique indisponible')
        if (outcome === 'timeout') throw new DOMException('Délai synthétique', 'TimeoutError')
        return Response.json(data())
      } }
    let service
    const start = async () => {
      service = createHostedReal(options)
      await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve))
    }
    t.after(async () => { if (service?.server.listening) await service.close(); rmSync(dir, { recursive: true, force: true }) })
    await start()
    assert.throws(() => createHostedReal(options), /EEXIST/)
    assert.equal(service.server.timeout, 215000)
    const forbidden = await request(service.server, '/', { headers: { 'x-forwarded-proto': 'http' } })
    assert.equal(forbidden.status, 403); assert.equal(forbidden.headers['www-authenticate'], undefined)
    assert.equal((await request(service.server, '/', { headers: { authorization: '' } })).status, 401)
    const page = await request(service.server)
    assert.equal(page.status, 200); assert.match(page.text, /Essai privé distant connecté au moteur/)
    assert.match(page.text, /privateTimeoutMs=210000/)
    assert.equal(calls.filter(x => x.init.method === 'POST').length, 0)
    const confirmation = await body(service.server)
    assert.equal((await request(service.server, '/private/pathway', { body: { ...confirmation, confirmed: false } })).status, 400)
    const result = await request(service.server, '/private/pathway', { body: confirmation })
    assert.equal(result.status, outcome === 'success' ? 200 : 502)
    if (outcome === 'success') {
      assert.equal(JSON.parse(result.text).reportSaved, true)
      const report = readFileSync(options.reportFile, 'utf8')
      assert.deepEqual(JSON.parse(report).usage, data().usage)
      assert.doesNotMatch(report, /personnelCategory|Authorization|Mot-de-passe/)
    } else assert.equal(existsSync(options.reportFile), false)
    assert.equal(service.status().total, 1)
    await service.close(); await start()
    assert.equal(service.status().total, 1); assert.equal(service.status().stopped, false)
    assert.equal((await request(service.server, '/private/pathway', { body: await body(service.server) })).status, 429)
    const posts = calls.filter(x => x.init.method === 'POST')
    assert.equal(posts.length, 1); assert.equal(posts[0].url, 'https://api.a658yg-catalogue.ch/api/pathway')
    assert.deepEqual(JSON.parse(posts[0].init.body), profile)
    assert.equal(posts[0].init.headers.Authorization, undefined); assert.equal(posts[0].init.redirect, 'error')
  })
}

test('configuration distante : désactivée, compteur simulation intact et liens refusés', { skip: process.platform === 'win32' }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-real-config-')), site = join(dir, 'site'), privateDirectory = join(dir, 'private')
  mkdirSync(site)
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  await prepareHostedSimulation({ siteDirectory: site, privateDirectory, trustedProxyAddresses: ['127.0.0.1'], fetchImpl: async () => referenceResponse(contract) })
  const simulationState = join(privateDirectory, 'quotas.json')
  writeFileSync(simulationState, JSON.stringify({ day: 20748, daily: 2, total: 2, stopped: false }), { mode: 0o600 })
  const before = readFileSync(simulationState, 'utf8')
  const config = readHostedRealConfig(join(privateDirectory, 'config.json'), site)
  assert.equal(config.enabled, false); assert.notEqual(config.stateFile, simulationState)
  assert.equal(existsSync(config.stateFile), false); assert.equal(existsSync(config.reportFile), false)
  assert.equal(readFileSync(simulationState, 'utf8'), before)
  symlinkSync(simulationState, config.stateFile)
  assert.throws(() => readHostedRealConfig(join(privateDirectory, 'config.json'), site), /non protégé/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostedSimulation, HOSTED_ORIGIN, secureProxyCheck, readHostedConfig, enableProxyAttestation } from './hosted-simulation.mjs'
import { prepareHostedSimulation } from './setup-hosted-simulation.mjs'
import { createProxyProbe } from './probe-hosted-proxy.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { references, referenceResponse } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'

const password = 'Mot-de-passe-synthetique-pour-test-seulement'
const contract = references(), profile = { personnelCategory: 'TEST-A', role: 'x', objective: 'y' }
const auth = 'Basic ' + Buffer.from('tester:' + password).toString('base64')
const temp = () => mkdtempSync(join(tmpdir(), 'avatar-hosted-'))
function request(server, { path = '/private/', method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method,
      headers: { host: 'avatar.a658yg-catalogue.ch', 'x-forwarded-proto': 'https', authorization: auth, ...headers } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }))
    }); req.on('error', reject); req.end(body && JSON.stringify(body))
  })
}
async function start(options) {
  const service = createHostedSimulation(options)
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve))
  return service
}
const options = (dir, user) => ({ enabled: true, publicOrigin: HOSTED_ORIGIN, trustedProxyAddresses: ['127.0.0.1'],
  users: [user], stateFile: join(dir, 'quotas.json'), preview: data(), loadProfileReferences: () => contract })

test('proxy : IP exacte, IPv4 mappée, HTTPS strict ; en-têtes seuls insuffisants', () => {
  const secure = secureProxyCheck(['192.0.2.10'])
  const req = (ip, proto) => ({ socket: { remoteAddress: ip }, headers: { 'x-forwarded-proto': proto, 'x-forwarded-for': '192.0.2.10' } })
  assert.equal(secure(req('192.0.2.10', 'https')), true)
  assert.equal(secure(req('::ffff:192.0.2.10', 'https')), true)
  for (const ip of ['192.0.2.11', '127.0.0.1', undefined]) assert.equal(secure(req(ip, 'https')), false)
  for (const proto of ['http', 'https,http', 'HTTPS', undefined]) assert.equal(secure(req('192.0.2.10', proto)), false)
  for (const list of [[], ['*'], ['192.0.2.0/24'], ['proxy.invalid']]) assert.throws(() => secureProxyCheck(list))
  assert.throws(() => createHostedSimulation())
})

test('HTTP hébergé : ressources protégées, confirmation, cinq simulations, quota et arrêt persistants', { timeout: 120000 }, async t => {
  const dir = temp(t), user = await createPilotCredential({ id: 'tester', username: 'tester', password })
  let service = await start(options(dir, user))
  t.after(async () => { try { if (service.server.listening) await service.close() } finally { rmSync(dir, { recursive: true, force: true }) } })
  assert.throws(() => createHostedSimulation(options(dir, user)), /EEXIST/)
  for (const proto of ['http', 'https,http', '']) {
    const result = await request(service.server, { headers: { 'x-forwarded-proto': proto } })
    assert.equal(result.status, 403); assert.equal(result.headers['www-authenticate'], undefined)
  }
  for (const path of ['/private/', '/private/profile-references', '/private/pathway-result.mjs']) {
    const result = await request(service.server, { path, headers: { authorization: '' } })
    assert.equal(result.status, 401); assert.match(result.headers['www-authenticate'], /Basic/)
  }
  const page = await request(service.server)
  assert.equal(page.status, 200); assert.match(page.text, /simulation uniquement/)
  assert.equal(page.headers['cache-control'], 'no-store')
  for (const path of ['/config.json', '/ACCES_PRIVE.txt', '/.git/config', '/private/pilot-real-server.mjs', '/api/pathway']) {
    assert.equal((await request(service.server, { path })).status, 404)
  }
  assert.equal((await request(service.server, { headers: { host: 'other.invalid' } })).status, 403)
  assert.equal((await request(service.server, { headers: { origin: 'https://other.invalid' } })).status, 403)
  const send = body => request(service.server, { path: '/private/pathway', method: 'POST', body,
    headers: { origin: HOSTED_ORIGIN, 'content-type': 'application/json' } })
  const ticket = async () => JSON.parse((await request(service.server, { path: '/private/profile-references' })).text)
  let value = await ticket()
  const body = { profile, confirmed: true, requestId: value.requestId, referenceRevision: contract.revision }
  assert.equal((await send({ ...body, confirmed: false })).status, 400)
  assert.equal(service.status().total, 0)
  assert.equal((await send(body)).status, 200)
  assert.equal((await send(body)).status, 409)
  assert.equal(service.status().total, 1)
  await service.close()
  // Redémarrage technique : ni remise à zéro ni révocation persistante.
  service = await start(options(dir, user)); assert.equal(service.status().total, 1)
  for (let i = 2; i <= 5; i++) {
    value = await ticket()
    const result = await send({ ...body, requestId: value.requestId })
    assert.equal(result.status, 200); const json = JSON.parse(result.text)
    assert.equal(json.mode, 'simulation'); assert.equal(json.quota.total, i)
  }
  value = await ticket(); assert.equal((await send({ ...body, requestId: value.requestId })).status, 429)
  assert.equal(service.status().total, 5)
  service.stop(); await service.close()
  service = await start(options(dir, user))
  assert.equal((await request(service.server)).status, 503)
})

test('un proxy inconnu ne reçoit jamais de challenge même avec des identifiants valides', async t => {
  const dir = temp(t), user = await createPilotCredential({ id: 'tester', username: 'tester', password })
  const service = await start({ ...options(dir, user), trustedProxyAddresses: ['192.0.2.10'] })
  t.after(async () => { try { await service.close() } finally { rmSync(dir, { recursive: true, force: true }) } })
  const result = await request(service.server)
  assert.equal(result.status, 403); assert.equal(result.headers['www-authenticate'], undefined)
  assert.equal(service.status().total, 0)
})

test('préparation POSIX : un GET seulement, secrets hors site, permissions et refus des réinitialisations', { skip: process.platform === 'win32' }, async t => {
  const dir = temp(t), site = join(dir, 'site'), target = join(dir, 'private'); mkdirSync(site)
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  let calls = 0
  const prepare = privateDirectory => prepareHostedSimulation({ privateDirectory, siteDirectory: site, trustedProxyAddresses: ['192.0.2.10'],
    fetchImpl: async (url, options) => { calls++; assert.equal(String(url), 'https://api.a658yg-catalogue.ch/api/profile-references'); assert.notEqual(options?.method, 'POST'); return referenceResponse() } })
  await assert.rejects(prepare(join(site, 'private')))
  const result = await prepare(target); assert.equal(calls, 1)
  assert.equal(statSync(target).mode & 0o077, 0)
  for (const name of ['config.json', 'users.json', 'references.json', 'preview.json', 'ACCES_PRIVE.txt']) assert.equal(statSync(join(target, name)).mode & 0o077, 0)
  assert.equal(JSON.parse(readFileSync(join(target, 'preview.json'))).usage, undefined)
  assert.doesNotMatch(JSON.stringify(result), /Mot de passe|password|hash|salt/)
  assert.equal(existsSync(join(target, 'quotas.json')), false)
  const config = readHostedConfig(result.configFile, site)
  assert.equal(config.port, 3000); assert.equal(config.publicOrigin, HOSTED_ORIGIN)
  const initialConfig = readFileSync(result.configFile, 'utf8')
  const initialUsers = readFileSync(join(target, 'users.json'), 'utf8')
  const quotaText = JSON.stringify({ day: 1, daily: 2, total: 2, stopped: false })
  writeFileSync(join(target, 'quotas.json'), quotaText, { mode: 0o600 })
  assert.equal(enableProxyAttestation(result.configFile, site), true)
  assert.equal(enableProxyAttestation(result.configFile, site), false)
  assert.equal(readFileSync(result.configFile + '.before-self-https', 'utf8'), initialConfig)
  assert.equal(statSync(result.configFile).mode & 0o077, 0)
  assert.equal(readFileSync(join(target, 'quotas.json'), 'utf8'), quotaText)
  assert.equal(readHostedConfig(result.configFile, site).proxyVerification, 'self-https')
  assert.equal(readFileSync(join(target, 'users.json'), 'utf8'), initialUsers)
  assert.equal(statSync(result.configFile + '.before-self-https').mode & 0o077, 0)
  const before = readFileSync(join(target, 'users.json'), 'utf8')
  await assert.rejects(prepare(target)); assert.equal(calls, 1); assert.equal(readFileSync(join(target, 'users.json'), 'utf8'), before)
  chmodSync(join(target, 'users.json'), 0o644); assert.throws(() => readHostedConfig(result.configFile, site)); chmodSync(join(target, 'users.json'), 0o600)
  writeFileSync(join(target, 'quotas.json'), 'invalid', { mode: 0o600 })
  assert.throws(() => readHostedConfig(result.configFile, site))
})

test('diagnostic : ne demande aucun accès et ne journalise jamais les données sensibles', async t => {
  const logs = [], server = createProxyProbe(value => logs.push(value))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const result = await request(server, { path: '/proxy-check', headers: { cookie: 'secret-cookie', 'x-forwarded-for': 'secret-ip' } })
  assert.equal(result.status, 503); assert.equal(result.headers['www-authenticate'], undefined)
  assert.equal(logs.length, 1); assert.doesNotMatch(logs[0], /secret|Basic|tester/)
  assert.deepEqual(Object.keys(JSON.parse(logs[0])), ['peer', 'host', 'proto'])
})

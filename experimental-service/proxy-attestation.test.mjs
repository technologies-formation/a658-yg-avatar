import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import https from 'node:https'
import http from 'node:http'
import { createProxyAttestation, requestHttpsProof } from './proxy-attestation.mjs'
import { createHostedSimulation, HOSTED_ORIGIN } from './hosted-simulation.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { references } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'
import { createAttestationProbe } from './probe-proxy-attestation.mjs'

const origin = 'https://proof.invalid'
const request = (peer, proto = 'https', host = 'proof.invalid', path = '/') => ({ method: 'GET', url: path,
  socket: { remoteAddress: peer }, headers: { host, 'x-forwarded-proto': proto } })
function response() {
  return { status: null, headers: {}, text: '', writeHead(status, headers) { this.status = status; this.headers = headers }, end(text = '') { this.text = text } }
}
function fixture({ peer = '192.0.2.10', ...changes } = {}) {
  let clock = 10000, currentPeer = peer, calls = 0, lastPath, alter = text => text
  let gate
  gate = createProxyAttestation({ publicOrigin: origin, now: () => clock, ...changes,
    requestProbe: changes.requestProbe ?? (async (destination, path) => {
      calls++; lastPath = path; assert.equal(destination, origin)
      const res = response(); gate.handleProof(request(currentPeer, 'https', 'proof.invalid', path), res)
      assert.equal(res.status, 200); return alter(res.text)
    }) })
  return { gate, calls: () => calls, path: () => lastPath, time: value => { clock = value },
    peer: value => { currentPeer = value }, alter: value => { alter = value } }
}

test('preuve HTTPS : pair appris uniquement après retour vérifié, rotation sans IP fixe', async () => {
  const f = fixture(), first = request('192.0.2.10'), other = request('192.0.2.11')
  assert.equal(f.gate.secure(first), false)
  assert.equal(await f.gate.ensure(first), true); assert.equal(f.calls(), 4)
  assert.equal(f.gate.secure(other), false)
  f.peer('192.0.2.11'); f.time(16000)
  assert.equal(await f.gate.ensure(other), true); assert.equal(f.calls(), 8)
  assert.equal(f.gate.secure(first), true)
  assert.equal(f.gate.secure(request('::ffff:192.0.2.11')), true)
  const replay = response(); assert.equal(f.gate.handleProof(request('192.0.2.99', 'https', 'proof.invalid', f.path()), replay), true)
  assert.equal(replay.status, 404); assert.equal(f.gate.secure(request('192.0.2.99')), false)
  f.gate.stop(); assert.equal(f.gate.secure(other), false)
})

test('aucune confiance à partir d’un visiteur, d’un nonce inconnu ou d’un accusé falsifié', async () => {
  const f = fixture(), attacker = request('192.0.2.99')
  assert.equal(await f.gate.ensure(attacker), false)
  assert.equal(f.calls(), 8); assert.equal(f.gate.secure(attacker), false)
  assert.equal(f.gate.secure(request('192.0.2.10')), true)
  const unknown = response(); f.gate.handleProof(request('192.0.2.99', 'https', 'proof.invalid', '/_avatar_proxy_proof/' + 'a'.repeat(64)), unknown)
  assert.equal(unknown.status, 404)
  const tampered = fixture(); tampered.alter(() => 'faux accusé')
  assert.equal(await tampered.gate.ensure(request('192.0.2.10')), false)
  assert.equal(tampered.gate.secure(request('192.0.2.10')), false)
  const failed = fixture({ requestProbe: async () => { throw Error('TLS invalide') } })
  assert.equal(await failed.gate.ensure(request('192.0.2.10')), false)
})

test('refus HTTP, Host et en-têtes ambigus avant toute attestation ; lots bornés et partagés', async () => {
  const f = fixture()
  for (const req of [request('192.0.2.10', 'http'), request('192.0.2.10', 'https,http'),
    request('192.0.2.10', 'https', 'evil.invalid'), request('pas-une-ip')]) assert.equal(await f.gate.ensure(req), false)
  assert.equal(f.calls(), 0)
  assert.deepEqual(await Promise.all(Array.from({ length: 20 }, () => f.gate.ensure(request('192.0.2.10')))), Array(20).fill(true))
  assert.equal(f.calls(), 4)
  assert.equal(await f.gate.ensure(request('192.0.2.99')), false); assert.equal(f.calls(), 4)
  f.time(610001); assert.equal(f.gate.secure(request('192.0.2.10')), false)
  assert.equal(await f.gate.ensure(request('192.0.2.10')), true)
  f.time(1); assert.equal(f.gate.secure(request('192.0.2.10')), false)
})

test('preuve à usage unique : chemin consommé, mauvais transport et arrêt pendant vérification', async () => {
  let gate, release
  gate = createProxyAttestation({ publicOrigin: origin, requestProbe: async (_origin, path) => {
    const bad = response(); gate.handleProof(request('192.0.2.10', 'http', 'proof.invalid', path), bad)
    assert.equal(bad.status, 404)
    const good = response(); gate.handleProof(request('192.0.2.10', 'https', 'proof.invalid', path), good)
    assert.equal(good.status, 200)
    const duplicate = response(); gate.handleProof(request('192.0.2.11', 'https', 'proof.invalid', path), duplicate)
    assert.equal(duplicate.status, 404)
    return new Promise(resolve => { (release ??= []).push(() => resolve(good.text)) })
  } })
  const pending = gate.ensure(request('192.0.2.10'))
  gate.stop(); for (const finish of release) finish()
  assert.equal(await pending, false); assert.equal(gate.secure(request('192.0.2.10')), false)
})

test('transport natif : TLS non approuvé refusé même si une réponse de preuve est proposée', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-proof-tls-'))
  let server
  t.after(async () => { if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections() }); rmSync(dir, { recursive: true, force: true }) })
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(dir, 'key'), '-out', join(dir, 'cert')], { stdio: 'ignore' })
  server = https.createServer({ key: readFileSync(join(dir, 'key')), cert: readFileSync(join(dir, 'cert')) }, (_req, res) => res.end('fake'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  await assert.rejects(requestHttpsProof('https://127.0.0.1:' + server.address().port, '/_avatar_proxy_proof/test'))
  assert.throws(() => requestHttpsProof('http://proof.invalid', '/_avatar_proxy_proof/test'))
  assert.throws(() => requestHttpsProof(origin, '/api/pathway'))
})

test('intégration : preuve indépendante avant challenge Basic, accès et quota existant conservés', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-proof-service-'))
  const password = 'Mot-de-passe-synthetique-test-uniquement'
  const user = await createPilotCredential({ id: 'tester', username: 'tester', password })
  const stateFile = join(dir, 'quotas.json')
  writeFileSync(stateFile, JSON.stringify({ day: Math.floor(Date.now() / 86400000), daily: 2, total: 2, stopped: false }), { mode: 0o600 })
  let service
  const send = (path, auth = '', proto = 'https') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: service.server.address().port, path,
      headers: { host: 'avatar.a658yg-catalogue.ch', 'x-forwarded-proto': proto, authorization: auth } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }))
    }); req.on('error', reject); req.end()
  })
  service = createHostedSimulation({ enabled: true, publicOrigin: HOSTED_ORIGIN, proxyVerification: 'self-https',
    users: [user], stateFile, loadProfileReferences: () => references(), preview: data(),
    requestProbe: async (_origin, path) => { const res = await send(path); assert.equal(res.status, 200); return res.text } })
  t.after(async () => { try { await service.close() } finally { rmSync(dir, { recursive: true, force: true }) } })
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve))
  const before = await send('/private/', '', 'http'); assert.equal(before.status, 403); assert.equal(before.headers['www-authenticate'], undefined)
  const challenge = await send('/private/'); assert.equal(challenge.status, 401); assert.match(challenge.headers['www-authenticate'], /Basic/)
  const page = await send('/private/', 'Basic ' + Buffer.from('tester:' + password).toString('base64'))
  assert.equal(page.status, 200); assert.match(page.text, /simulation uniquement/)
  assert.equal(service.status().total, 2)
  assert.equal((await send('/_avatar_proxy_proof/guess')).status, 404)
})

 test('diagnostic autonome : aucune authentification ni donnée privée, preuve avant succès', async t => {
  const logs = []; let diagnostic
  const send = path => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: diagnostic.server.address().port, path,
      headers: { host: 'proof.invalid', 'x-forwarded-proto': 'https' } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }))
    }); req.on('error', reject); req.end()
  })
  diagnostic = createAttestationProbe({ publicOrigin: origin, log: value => logs.push(value),
    requestProbe: async (_origin, path) => (await send(path)).text })
  await new Promise(resolve => diagnostic.server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { diagnostic.server.close(resolve); diagnostic.server.closeAllConnections() }))
  const result = await send('/proxy-attestation-check')
  assert.equal(result.status, 200); assert.equal(result.headers['www-authenticate'], undefined)
  assert.match(result.text, /Aucun accès privé activé/)
  assert.equal((await send('/private/')).status, 503)
  assert.equal((await send('/_avatar_proxy_proof/unknown')).status, 404)
  assert.deepEqual(logs, ['Contrôle HTTPS automatique réussi.'])
})

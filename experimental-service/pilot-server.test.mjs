import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import https from 'node:https'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createPilotSimulationServer } from './pilot-server.mjs'
import { createPilotSimulation } from './pilot-simulation.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { references } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'
import { renderPrivatePage } from './private-page.mjs'

let dir, tls, user
const password = 'Secret-synthetique-du-test-prive-uniquement'
const profile = { personnelCategory: 'TEST-A', role: 'x', objective: 'y' }
const contract = references()
const options = id => ({ confirmed: true, requestId: 'simulation-request-' + id, referenceRevision: contract.revision })
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'avatar-private-server-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
  tls = { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }
  user = await createPilotCredential({ id: 'tester', username: 'tester', password })
})
after(() => rmSync(dir, { recursive: true, force: true }))
const simulation = (name, changes) => createPilotSimulation({ stateFile: join(dir, name + '.json'), maxDailyRequests: 2,
  maxTotalRequests: 2, singleInstance: true, loadProfileReferences: () => contract, preview: data(), ...changes })

test('simulation privée : profil invalide ou non confirmé refusé, aperçu isolé et quota persistant', async () => {
  const service = simulation('quota')
  await assert.rejects(service.buildPathway(profile, { ...options('1'), confirmed: false }))
  await assert.rejects(service.buildPathway({ ...profile, role: '' }, options('1')))
  assert.equal(service.status().total, 0)
  const result = await service.buildPathway(profile, options('1'))
  assert.equal(result.mode, 'simulation'); assert.equal(result.quota.total, 1)
  result.preview.summary = 'Mutation du consommateur'
  await assert.rejects(service.buildPathway(profile, options('1')), error => error.code === 'duplicate_request')
  const restarted = simulation('quota')
  const second = await restarted.buildPathway(profile, options('2'))
  assert.equal(second.preview.summary, 'Synthèse de test'); assert.equal(second.quota.total, 2)
  await assert.rejects(restarted.buildPathway(profile, options('3')), error => error.code === 'quota_exceeded')
})

test('simulation : référentiel modifié ou illisible, arrêt et stockage inaccessible bloquent sans quota', async () => {
  let current = contract
  const service = simulation('references', { loadProfileReferences: () => current })
  current = references(value => { value.pathway.fields.role.maxLength = 12 })
  await assert.rejects(service.buildPathway(profile, options('1')), error => error.code === 'references_changed')
  current = null
  await assert.rejects(service.getReferences(), error => error.code === 'references_unavailable')
  assert.equal(service.status().total, 0)
  const inaccessible = simulation('inaccessible', { stateFile: join(dir, 'absent', 'quota.json') })
  await assert.rejects(inaccessible.buildPathway(profile, options('1')), error => error.code === 'session_unavailable')
  const stopped = simulation('stop'); stopped.stop()
  await assert.rejects(stopped.getReferences(), error => error.code === 'disabled')
  await assert.rejects(simulation('stop').buildPathway(profile, options('1')), error => error.code === 'disabled')
})

test('profil figé avant attente, concurrence et annulation avant réservation', async () => {
  let release
  const service = simulation('concurrency', { loadProfileReferences: () => new Promise(resolve => { release = resolve }) })
  const value = { ...profile }, pending = service.buildPathway(value, options('1'))
  value.role = ''
  await assert.rejects(service.buildPathway(profile, options('2')), error => error.code === 'busy')
  release(contract); assert.equal((await pending).quota.total, 1)
  const controller = new AbortController(), aborted = service.buildPathway(profile, { ...options('3'), signal: controller.signal })
  controller.abort(); release(contract)
  await assert.rejects(aborted, error => error.code === 'cancelled')
  assert.equal(service.status().total, 1)
})

test('page privée : choix du contrat échappés, aucune clé et chemins privés uniquement', () => {
  const hostile = references(value => { value.pathway.fields.personnelCategory.options[0].label = '</script><img src=x>' })
  const page = renderPrivatePage(hostile)
  assert.doesNotMatch(page, /<\/script><img src=x>/)
  assert.match(page, /Pilote privé · simulation uniquement/)
  assert.match(page, /\/private\/pathway/)
  assert.doesNotMatch(page, /fetch\(['"]https?:|\/local\/validate|OPENAI_API_KEY|Secret-synthetique/)
  assert.throws(() => renderPrivatePage(contract, { timeoutMs: 0 }))
})

test('serveur désactivé ou incomplet : aucun état privé créé ; origine distante refusée', () => {
  const service = createPilotSimulationServer()
  assert.equal(service.status().enabled, false); assert.equal(service.server.listening, false)
  assert.throws(() => createPilotSimulationServer({ enabled: 'true' }))
  assert.throws(() => createPilotSimulationServer({ enabled: true, publicOrigin: 'https://public.invalid', tls }))
})

test('HTTPS : page, modules et API protégés ; aucun fichier privé exposé ; simulation confirmée seulement', async t => {
  const origin = 'https://127.0.0.1:19876'
  const service = createPilotSimulationServer({ enabled: true, publicOrigin: origin, tls, users: [user], maxAttempts: 100, windowMs: 60000,
    stateFile: join(dir, 'http.json'), maxDailyRequests: 1, maxTotalRequests: 1, singleInstance: true,
    loadProfileReferences: () => contract, preview: data(),
  })
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { service.server.closeAllConnections(); service.server.close(resolve) }))
  const send = (path = '/', { auth = true, method = 'GET', body, headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = https.request({ hostname: '127.0.0.1', port: service.server.address().port, path, method, rejectUnauthorized: false,
      headers: { Host: '127.0.0.1:19876', Origin: origin, 'Content-Type': 'application/json', ...headers,
        ...(auth ? { Authorization: 'Basic ' + Buffer.from('tester:' + password).toString('base64') } : {}) } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }))
    }); req.on('error', reject); req.end(body && JSON.stringify(body))
  })
  for (const path of ['/', '/private/', '/private/pathway-result.mjs', '/private/pathway-result-view.mjs', '/private/profile-references']) {
    assert.equal((await send(path, { auth: false })).status, 401)
  }
  assert.equal(service.status().total, 0)
  const page = await send()
  assert.equal(page.status, 200); assert.match(page.text, /Pilote privé/)
  assert.equal(page.headers['cache-control'], 'no-store')
  for (const path of ['/private/pathway-result-view.mjs', '/private/pathway-result.mjs']) {
    const response = await send(path); assert.equal(response.status, 200); assert.match(response.headers['content-type'], /javascript/)
  }
  for (const path of ['/private/pilot-auth.mjs', '/.git/config', '/private/../pilot-auth.mjs', '/local/validate', '/private/?secret=1']) {
    assert.equal((await send(path)).status, 404)
  }
  const ticket = JSON.parse((await send('/private/profile-references')).text)
  const body = { profile, confirmed: true, referenceRevision: contract.revision, requestId: ticket.requestId }
  assert.equal((await send('/private/pathway', { method: 'POST', body: { ...body, confirmed: false } })).status, 400)
  const result = await send('/private/pathway', { method: 'POST', body })
  assert.equal(result.status, 200); assert.equal(JSON.parse(result.text).mode, 'simulation')
  assert.equal((await send('/private/pathway', { method: 'POST', body })).status, 409)
  const next = JSON.parse((await send('/private/profile-references')).text)
  assert.equal((await send('/private/pathway', { method: 'POST', body: { ...body, requestId: next.requestId } })).status, 429)
  assert.equal(service.status().total, 1)
  service.revoke('tester'); assert.equal((await send()).status, 401)
  service.stop(); assert.equal((await send()).status, 503)
})

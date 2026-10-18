import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createPrivatePathwayHandler } from './private-pathway-handler.mjs'
import { references } from './reference-test-fixtures.mjs'
import { referenceResponse } from './reference-test-fixtures.mjs'
import { createPathwaySession } from './pathway-session.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const origin = 'https://avatar.example.invalid'
const contract = references()
async function setup(t, options = {}) {
  const calls = []; let identity = { id: 'testeur-verifie' }, clock = 0
  const session = {
    async getReferences() { calls.push('references'); return contract },
    async buildPathway(profile, metadata) { calls.push({ profile, metadata }); return { mode: 'historical-pathway', result: { ok: true, summary: 'Test', recommendedSteps: [] } } },
    stop() { calls.push('stop') }, ...options.session,
  }
  const { handler, stop } = createPrivatePathwayHandler({ enabled: true, publicOrigin: origin,
    authenticate: () => identity, session, now: () => clock, ...options.config })
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const url = 'http://127.0.0.1:' + server.address().port
  const request = (path = '/private/profile-references', init = {}) => new Promise((resolve, reject) => {
    const req = http.request(url + path, { method: init.method ?? 'GET',
      headers: { Host: 'avatar.example.invalid', Origin: origin, ...init.headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })))
    })
    req.on('error', reject); req.end(init.body)
  })
  const ticket = async () => (await request()).json()
  const post = (ticket, changes = {}) => request('/private/pathway', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    profile: { role: 'x', objective: 'y' }, confirmed: true, referenceRevision: contract.revision, requestId: ticket.requestId, ...changes,
  }) })
  return { calls, request, ticket, post, stop, setIdentity: value => { identity = value }, advance: value => { clock += value } }
}

test('accès privé désactivé : aucune authentification ni session ; configuration explicite', async t => {
  const { request, calls } = await setup(t, { config: { enabled: false, authenticate: () => { throw Error('Ne doit pas être appelé') } } })
  assert.equal((await request()).status, 503); assert.equal(calls.length, 0)
  for (const config of [{ enabled: 'true' }, { enabled: true }, { enabled: true, publicOrigin: origin, authenticate: () => null }]) {
    assert.throws(() => createPrivatePathwayHandler(config))
  }
})

test('identité vérifiée et origine : refus avant référentiel, quota ou moteur, en-têtes usurpés inutiles', async t => {
  const app = await setup(t)
  app.setIdentity(null)
  assert.equal((await app.request(undefined, { headers: { 'X-User': 'administrateur', Authorization: 'Bearer inventé' } })).status, 401)
  app.setIdentity({ id: 'testeur' })
  assert.equal((await app.request(undefined, { headers: { Origin: 'https://autre.invalid' } })).status, 403)
  assert.equal((await app.request(undefined, { headers: { Host: 'autre.invalid' } })).status, 403)
  assert.equal((await app.request(undefined, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403)
  assert.equal(app.calls.length, 0)
})

test('ticket serveur lié à identité/révision, confirmation obligatoire et usage unique', async t => {
  const app = await setup(t), ticket = await app.ticket()
  assert.match(ticket.requestId, /^[a-z0-9-]{36}$/)
  assert.equal((await app.post(ticket, { confirmed: false })).status, 400)
  assert.equal((await app.post(ticket, { referenceRevision: 'a'.repeat(64) })).status, 409)
  app.setIdentity({ id: 'autre' })
  assert.equal((await app.post(ticket)).status, 409)
  app.setIdentity({ id: 'testeur-verifie' })
  const response = await app.post(ticket)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  assert.equal((await app.post(ticket)).status, 409)
  assert.equal(app.calls.filter(x => typeof x === 'object').length, 1)
  assert.equal(app.calls[1].metadata.requestId, ticket.requestId)
})

test('expiration et capacité bornée des confirmations, arrêt définitif', async t => {
  const app = await setup(t), expired = await app.ticket()
  app.advance(300000)
  assert.equal((await app.post(expired)).status, 409)
  for (let i = 0; i < 32; i++) assert.equal((await app.request()).status, 200)
  assert.equal((await app.request()).status, 429)
  app.stop()
  assert.equal((await app.request()).status, 503)
  assert.equal(app.calls.filter(x => x === 'stop').length, 1)
})

test('échec privé masqué, aucune relance automatique ni réutilisation après délai', async t => {
  const app = await setup(t, { session: { async buildPathway() { throw Object.assign(Error('Détail secret'), { code: 'timeout' }) } } })
  const ticket = await app.ticket(), response = await app.post(ticket)
  assert.equal(response.status, 504)
  assert.doesNotMatch(await response.text(), /secret/)
  assert.equal((await app.post(ticket)).status, 409)
})

test('validation HTTP : JSON, taille, routes et origine POST avant traitement', async t => {
  const app = await setup(t)
  assert.equal((await app.request('/api/pathway')).status, 404)
  assert.equal((await app.request('/private/pathway', { method: 'POST', headers: { Origin: '' } })).status, 403)
  assert.equal((await app.request('/private/pathway', { method: 'POST', body: '{}' })).status, 415)
  for (const [body, status] of [['{', 400], ['null', 400], ['x'.repeat(16001), 413]]) {
    assert.equal((await app.request('/private/pathway', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, status)
  }
  assert.equal(app.calls.length, 0)
})

test('arrêt pendant authentification ou référentiel : aucun ticket émis', async t => {
  let release
  const app = await setup(t, { session: { getReferences: () => new Promise(resolve => { release = resolve }) } })
  const pending = app.request()
  for (let i = 0; !release && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(release, 'Référentiel en attente atteint')
  app.stop(); release(contract)
  assert.equal((await pending).status, 503)
})

test('intégration HTTP/session réelle hors ligne : refus sans quota, réservation unique et plafond persistant', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-private-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  let posts = 0
  const session = createPathwaySession({ enabled: true, singleInstance: true,
    endpoint: 'https://catalogue.example.invalid/api/pathway', referencesEndpoint: 'https://catalogue.example.invalid/api/profile-references',
    allowedOrigins: ['https://catalogue.example.invalid'], pathwayTimeoutMs: 1000,
    stateFile: join(dir, 'quota.json'), maxDailyRequests: 1, maxTotalRequests: 1,
    fetchImpl: async (_url, init) => {
      if (init.method === 'GET') return referenceResponse(contract)
      posts++; return Response.json({ ok: true, summary: 'Réponse synthétique', recommendedSteps: [] })
    },
  })
  const app = await setup(t, { config: { session } })
  const ticket = await app.ticket()
  const profile = { personnelCategory: 'TEST-A', role: 'x', objective: 'y' }
  assert.equal(session.status().total, 0)
  assert.equal((await app.post(ticket, { profile, confirmed: false })).status, 400)
  assert.equal((await app.post(ticket, { profile })).status, 200)
  assert.equal((await app.post(ticket, { profile })).status, 409)
  const another = await app.ticket()
  assert.equal((await app.post(another, { profile })).status, 429)
  assert.equal(posts, 1)
  assert.equal(session.status().total, 1)
})

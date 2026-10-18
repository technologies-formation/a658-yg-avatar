import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createPilotAuthenticator, createPilotCredential } from './pilot-auth.mjs'
import { createPilotPrivateHandler } from './pilot-private.mjs'
import { references } from './reference-test-fixtures.mjs'

// Identifiants synthétiques exclusivement ; aucun compte de déploiement créé.
const password = 'Mot-de-passe-fictif-pour-tests-uniquement'
let user
before(async () => { user = await createPilotCredential({ id: 'testeur-1', username: 'pilote-test', password }) })
const authHeader = (name = 'pilote-test', secret = password) => 'Basic ' + Buffer.from(name + ':' + secret).toString('base64')
const request = (authorization = authHeader()) => ({ headers: { authorization } })
const response = () => ({ headers: {}, setHeader(name, value) { this.headers[name] = value }, removeHeader(name) { delete this.headers[name] } })
// TLS est simulé dans ces essais locaux ; ce prédicat ne doit pas être déployé tel quel.
const create = changes => createPilotAuthenticator({ enabled: true, users: [user], maxAttempts: 10, windowMs: 60000, isSecureRequest: () => true, ...changes })

test('authentification désactivée et configuration refusée sans comptes individuels valides', async () => {
  assert.equal(await createPilotAuthenticator().authenticate(request()), null)
  for (const changes of [{ enabled: 'true' }, { users: [] }, { users: [user, user] }, { users: [{ ...user, hash: 'court' }] },
    { users: [{ ...user, scheme: 'inconnu' }] }, { maxAttempts: undefined }, { windowMs: 0 }, { isSecureRequest: undefined }]) {
    assert.throws(() => create(changes))
  }
  for (const config of [{ id: 'a', username: 'u', password: 'court' }, { id: 'a', username: 'avec:deuxpoints', password }]) {
    await assert.rejects(createPilotCredential(config))
  }
})

test('empreinte salée, compte figé, mot de passe absent du résultat de provisionnement', async () => {
  const other = await createPilotCredential({ id: 'testeur-1', username: 'pilote-test', password })
  assert.notEqual(user.salt, other.salt); assert.notEqual(user.hash, other.hash)
  assert.equal(user.scheme, 'scrypt-v1')
  assert.equal(JSON.stringify(user).includes(password), false)
  const input = { ...user }, access = create({ users: [input] })
  input.hash = '0'.repeat(64)
  assert.deepEqual(await access.authenticate(request(), response()), { id: 'testeur-1' })
})

test('bon compte vérifié ; mauvais mot de passe et compte inconnu refusés sans identité devinée', async () => {
  const access = create(), res = response()
  assert.deepEqual(await access.authenticate(request(), res), { id: 'testeur-1' })
  assert.equal(res.headers['WWW-Authenticate'], undefined)
  for (const header of [authHeader('inconnu'), authHeader('pilote-test', 'Autre-mot-de-passe-fictif-invalide')]) {
    const refused = response()
    assert.equal(await access.authenticate(request(header), refused), null)
    assert.match(refused.headers['WWW-Authenticate'], /^Basic realm=/)
  }
})

test('formats ambigus, UTF-8 invalide, contrôles et tailles excessives refusés', async () => {
  const access = create()
  for (const header of [['Basic aaa='], 'Bearer invente', 'Basic !!!!', 'Basic YQ==', 'Basic /w==',
    authHeader('pilote-test', 'court'), authHeader('pilote-test', password + '\n'), authHeader('pilote-test', 'x'.repeat(1500))]) {
    assert.equal(await access.authenticate(request(header)), null)
  }
  const req = request(); delete req.headers.authorization
  req.headers['X-User'] = 'testeur-1'
  assert.equal(await access.authenticate(req), null)
})

test('TLS attesté explicitement : en-tête de protocole usurpé ou vérificateur en erreur refusés', async () => {
  const access = create({ isSecureRequest: req => req.socket?.encrypted === true })
  const req = request(); req.headers['x-forwarded-proto'] = 'https'
  assert.equal(await access.authenticate(req), null)
  req.socket = { encrypted: true }
  assert.deepEqual(await access.authenticate(req), { id: 'testeur-1' })
  assert.equal(await create({ isSecureRequest: () => { throw Error('Erreur privée') } }).authenticate(request()), null)
})

test('limite globale sans confiance dans les IP transmises ; réouverture à l’échéance', async () => {
  let clock = 0
  const access = create({ maxAttempts: 1, windowMs: 1000, now: () => clock })
  assert.equal(await access.authenticate(request(authHeader('inconnu'))), null)
  const denied = response(), req = request(); req.headers['x-forwarded-for'] = '127.0.0.1'
  assert.equal(await access.authenticate(req, denied), null)
  assert.equal(denied.headers['Retry-After'], '1')
  clock = 1000
  assert.deepEqual(await access.authenticate(request()), { id: 'testeur-1' })
  clock = -1
  assert.equal(await access.authenticate(request()), null)
})

test('vérifications simultanées identiques mutualisées, autres vérifications sans file d’attente', async () => {
  const access = create({ maxAttempts: 1 })
  const first = access.authenticate(request()), same = access.authenticate(request())
  assert.equal(await access.authenticate(request(authHeader('inconnu'))), null)
  assert.deepEqual(await first, { id: 'testeur-1' }); assert.deepEqual(await same, { id: 'testeur-1' })
  assert.equal(await access.authenticate(request()), null) // aucun cache de succès ni remise à zéro du compteur
})

test('révocation ou arrêt pendant vérification : aucun succès tardif, connexion détruite refusée', async () => {
  const revoked = create(), pending = revoked.authenticate(request())
  revoked.revoke('testeur-1')
  assert.equal(await pending, null)
  assert.equal(await revoked.authenticate(request()), null)
  const stopped = create(), active = stopped.authenticate(request())
  stopped.stop()
  assert.equal(await active, null); assert.equal(await stopped.authenticate(request()), null)
  const destroyed = request(); destroyed.destroyed = true
  assert.equal(await create().authenticate(destroyed), null)
})

test('assemblage HTTP pilote : défi navigateur, identité liée à la confirmation, révocation et refus sans moteur', async t => {
  let reads = 0, builds = 0, stops = 0
  const contract = references()
  const gateway = createPilotPrivateHandler({ enabled: true, publicOrigin: 'https://avatar.example.invalid', users: [user],
    maxAttempts: 10, windowMs: 60000, isSecureRequest: () => true, session: {
      async getReferences() { reads++; return contract },
      async buildPathway(_profile, options) { builds++; assert.equal(options.confirmed, true); return { mode: 'historical-pathway', result: { ok: true, summary: 'Simulation', recommendedSteps: [] } } },
      stop() { stops++ },
    },
  })
  const server = http.createServer(gateway.handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const send = (path = '/private/profile-references', { authorized = false, method = 'GET', body } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method,
      headers: { Host: 'avatar.example.invalid', Origin: 'https://avatar.example.invalid', 'Content-Type': 'application/json',
        ...(authorized ? { Authorization: authHeader() } : {}) } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks)) }))
    }); req.on('error', reject); req.end(body && JSON.stringify(body))
  })
  const challenge = await send()
  assert.equal(challenge.status, 401); assert.match(challenge.headers['www-authenticate'], /^Basic /)
  assert.equal(reads, 0); assert.equal(builds, 0)
  const ticket = await send(undefined, { authorized: true })
  assert.equal(ticket.status, 200); assert.equal(ticket.headers['www-authenticate'], undefined)
  const built = await send('/private/pathway', { authorized: true, method: 'POST', body: {
    confirmed: true, requestId: ticket.body.requestId, referenceRevision: contract.revision, profile: { role: 'x', objective: 'y' },
  } })
  assert.equal(built.status, 200); assert.equal(builds, 1)
  gateway.revoke('testeur-1')
  assert.equal((await send(undefined, { authorized: true })).status, 401)
  assert.equal(reads, 1)
  gateway.stop(); assert.equal(stops, 1)
  assert.equal((await send(undefined, { authorized: true })).status, 503)
})

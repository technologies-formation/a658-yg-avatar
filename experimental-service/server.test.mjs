import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGuard, createServer, validateRequest } from './server.mjs'

const token = 'abcdefghijklmnopqrstuvwxyz1234567890'
const body = { type: 'pathway', profile: { personnelCategory: 'PAT', role: 'Chef de projet', objective: 'Renforcer mes competences' } }
test('validation du profil', () => {
  assert.equal(validateRequest(body), null)
  assert.match(validateRequest({ ...body, profile: { ...body.profile, personnelCategory: 'autre' } }), /Categorie/)
  assert.match(validateRequest({ ...body, profile: { ...body.profile, role: 'x'.repeat(301) } }), /role/)
  assert.match(validateRequest({ ...body, type: 'search' }), /Recherche/)
})
test('authentification, quota quotidien et quota total', () => {
  let clock = 0
  const guard = createGuard({ token, maxDailyRequests: 2, maxTotalRequests: 3, now: () => clock })
  assert.equal(guard.check('bad', body).status, 401)
  assert.equal(guard.check(token, body).status, 200)
  assert.equal(guard.check(token, body).status, 200)
  assert.equal(guard.check(token, body).status, 429)
  clock = 86_400_000
  assert.equal(guard.check(token, body).status, 200)
  assert.equal(guard.check(token, body).status, 429)
  guard.stop()
  assert.equal(guard.check(token, body).status, 503)
})
test('HTTP : aucune route externe et aucun appel moteur', async () => {
  const { server } = createServer({ token })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const base = 'http://127.0.0.1:' + server.address().port
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }
    const ok = await fetch(base + '/test/request', options)
    assert.equal(ok.status, 200)
    assert.equal((await ok.json()).mode, 'simulation')
    assert.equal((await fetch(base + '/api/pathway', options)).status, 404)
    assert.equal((await fetch(base + '/test/request', { ...options, headers: { ...options.headers, Origin: 'https://example.com' } })).status, 403)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('persistance apres redemarrage et arret durable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-guard-'))
  const stateFile = join(dir, 'quota.json')
  try {
    const first = createGuard({ token, stateFile, maxDailyRequests: 1 })
    assert.equal(first.check(token, body).status, 200)
    const restarted = createGuard({ token, stateFile, maxDailyRequests: 1 })
    assert.equal(restarted.check(token, body).status, 429)
    restarted.stop()
    assert.equal(createGuard({ token, stateFile }).check(token, body).status, 503)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('stockage corrompu refuse et interrupteur externe', () => {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-guard-'))
  const stateFile = join(dir, 'quota.json')
  try {
    writeFileSync(stateFile, 'invalide')
    assert.throws(() => createGuard({ token, stateFile }), /illisible/)
    rmSync(stateFile)
    let enabled = false
    const guard = createGuard({ token, stateFile, enabled: () => enabled })
    assert.equal(guard.check(token, body).status, 503)
    enabled = true
    assert.equal(guard.check(token, body).status, 200)
    enabled = false
    assert.equal(guard.check(token, body).status, 503)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

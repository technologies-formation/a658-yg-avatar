import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { acquireInstanceLock, InstanceLockError } from './instance-lock.mjs'

const TOKENS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
]
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'avatar-instance-lock-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, path: join(root, 'service.lock') }
}

test('propriétaire explicite, renouvellement et libération sans effacer un verrou étranger', t => {
  const f = fixture(t); let clock = Date.parse('2026-11-24T08:00:00Z')
  const lock = acquireInstanceLock({ path: f.path, pid: 123, host: 'current-host', token: TOKENS[0],
    now: () => clock, heartbeatMs: 0, isProcessAlive: () => true })
  let owner = JSON.parse(readFileSync(join(f.path, 'owner.json'), 'utf8'))
  assert.deepEqual(owner, { version: 1, token: TOKENS[0], pid: 123, host: 'current-host',
    createdAt: '2026-11-24T08:00:00.000Z', renewedAt: '2026-11-24T08:00:00.000Z' })
  assert.throws(() => acquireInstanceLock({ path: f.path, pid: 456, host: 'current-host', token: TOKENS[1],
    now: () => clock, heartbeatMs: 0, isProcessAlive: () => true }),
  error => error instanceof InstanceLockError && error.reason === 'actif')
  clock += 31000; assert.equal(lock.refresh(), true)
  owner = JSON.parse(readFileSync(join(f.path, 'owner.json'), 'utf8'))
  assert.equal(owner.renewedAt, '2026-11-24T08:00:31.000Z')
  assert.equal(lock.release(), true); assert.equal(existsSync(f.path), false); assert.equal(lock.release(), false)
})

test('arrêt brutal : récupérer atomiquement un propriétaire mort sans toucher aux autres données', t => {
  const f = fixture(t), unrelated = join(f.root, 'quotas.json')
  writeFileSync(unrelated, '{"total":7}', { mode: 0o600 })
  const abandoned = acquireInstanceLock({ path: f.path, pid: 123, host: 'same-host', token: TOKENS[0],
    now: () => Date.parse('2026-11-24T07:00:00Z'), heartbeatMs: 0, isProcessAlive: () => true })
  let recovered
  const current = acquireInstanceLock({ path: f.path, pid: 456, host: 'same-host', token: TOKENS[1],
    now: () => Date.parse('2026-11-24T08:00:00Z'), heartbeatMs: 0, isProcessAlive: pid => pid === 456,
    onRecovered: value => { recovered = value } })
  assert.equal(recovered.previousPid, 123); assert.equal(recovered.previousHost, 'same-host')
  assert.equal(recovered.ageMs, 3600000); assert.equal(readFileSync(unrelated, 'utf8'), '{"total":7}')
  assert.equal(abandoned.release(), false); assert.equal(current.release(), true)
})

test('nouvel hôte : récupérer un verrou de l’ancien conteneur même si son PID a été réutilisé', t => {
  const f = fixture(t)
  acquireInstanceLock({ path: f.path, pid: 123, host: 'old-container', token: TOKENS[0],
    now: () => 1000, heartbeatMs: 0, isProcessAlive: () => true })
  const current = acquireInstanceLock({ path: f.path, pid: 123, host: 'new-container', token: TOKENS[1],
    now: () => 2000, heartbeatMs: 0, isProcessAlive: () => true })
  assert.equal(current.recovered.previousHost, 'old-container'); current.release()
})

test('ancien verrou vide ou contenu inattendu : échec sûr, aucune suppression automatique', t => {
  const f = fixture(t)
  mkdirSync(f.path, { mode: 0o700 })
  assert.throws(() => acquireInstanceLock({ path: f.path, token: TOKENS[0], heartbeatMs: 0 }),
    error => error instanceof InstanceLockError && error.reason === 'ancien-sans-proprietaire')
  assert.equal(existsSync(f.path), true)
  writeFileSync(join(f.path, 'inconnu'), '', { mode: 0o600 })
  assert.throws(() => acquireInstanceLock({ path: f.path, token: TOKENS[1], heartbeatMs: 0 }),
    error => error instanceof InstanceLockError && error.reason === 'corrompu')
  assert.equal(existsSync(join(f.path, 'inconnu')), true)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createPeerMonitor } from './peer-monitor.mjs'

test('surveillance croisee : alerte au troisieme echec, sans doublon, puis retablissement', async () => {
  let healthy = false
  const notifications = []
  const monitor = createPeerMonitor({
    peerName: 'Service test',
    probe: async () => { if (!healthy) throw new Error('secret technique') },
    notify: async (event) => notifications.push(event),
    now: () => new Date('2026-11-25T08:00:00.000Z'),
  })

  assert.equal((await monitor.tick()).failures, 1)
  assert.equal((await monitor.tick()).failures, 2)
  assert.equal((await monitor.tick()).notified, 'alert')
  assert.equal((await monitor.tick()).notified, undefined)
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].type, 'alert')

  healthy = true
  assert.equal((await monitor.tick()).notified, 'recovery')
  assert.equal((await monitor.tick()).notified, undefined)
  assert.deepEqual(notifications.map(({ type }) => type), ['alert', 'recovery'])
  assert.deepEqual(monitor.status(), { failures: 0, alertActive: false, running: false })
})

test('surveillance croisee : demarrage differe et arret du minuteur', () => {
  let callback
  let delay
  let unref = false
  let cleared = false
  const timer = { unref() { unref = true } }
  const monitor = createPeerMonitor({
    peerName: 'Service test',
    probe: async () => {},
    notify: async () => {},
    setIntervalImpl(fn, ms) { callback = fn; delay = ms; return timer },
    clearIntervalImpl(value) { assert.equal(value, timer); cleared = true },
  })
  monitor.start()
  assert.equal(typeof callback, 'function')
  assert.equal(delay, 300_000)
  assert.equal(unref, true)
  monitor.stop()
  assert.equal(cleared, true)
})

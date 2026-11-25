import test from 'node:test'
import assert from 'node:assert/strict'
import { createAssistantPeerMonitoring } from './peer-monitoring.mjs'

test('assistant : surveillance desactivee sans lire le courriel', () => {
  const mail = { get sendReport() { throw new Error('secret lu') } }
  assert.equal(createAssistantPeerMonitoring({ enabled: false, mail }), null)
})

test('assistant : controle public du catalogue et courriel de transition', async () => {
  let settings
  let sent
  const version = { snapshotDate: '2026-11-25', snapshotHash: 'a'.repeat(64) }
  const monitor = { start() {}, stop() {} }
  assert.equal(createAssistantPeerMonitoring({
    enabled: true,
    recipient: 'recipient@example.test',
    mail: { async sendReport(message) { sent = message; return { accepted: true } } },
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.a658yg-catalogue.ch/api/health')
      assert.equal(init.method, 'GET')
      return new Response(JSON.stringify({ ok: true, catalogue: version }), { headers: { 'Content-Type': 'application/json' } })
    },
    createMonitor(value) { settings = value; return monitor },
  }), monitor)
  assert.deepEqual(await settings.probe(), version)
  await settings.notify({ type: 'alert', peerName: settings.peerName, occurredAt: new Date('2026-11-25T08:00:00Z'), failures: 3 })
  assert.equal(sent.recipient, 'recipient@example.test')
  assert.match(sent.subject, /ALERTE.*Catalogue A658-YG/)
  assert.doesNotMatch(sent.text, /secret/)
})

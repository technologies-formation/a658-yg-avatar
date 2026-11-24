import test from 'node:test'
import assert from 'node:assert/strict'
import { checkPrivateAvailability } from './check-private-availability.mjs'

const response = (status, headers = {}) => new Response('', { status, headers })
const healthy = () => response(401, { 'WWW-Authenticate': 'Basic realm="A658-YG pilote prive", charset="UTF-8"',
  'Strict-Transport-Security': 'max-age=86400', 'Content-Type': 'application/json; charset=utf-8' })

test('disponibilité : exiger le challenge privé et HTTPS, sans identifiant ni appel métier', async () => {
  let request
  const result = await checkPrivateAvailability({ fetchImpl: async (url, init) => { request = { url, init }; return healthy() } })
  assert.deepEqual(result, { ok: true, status: 401, authentication: 'basic', transport: 'https' })
  assert.equal(request.url, 'https://avatar.a658yg-catalogue.ch/private/')
  assert.equal(request.init.credentials, 'omit'); assert.equal(request.init.headers.Authorization, undefined)
})

test('disponibilité : refuser la page de maintenance 200 et les réponses ambiguës', async () => {
  for (const candidate of [response(200, { 'Content-Type': 'text/html' }), response(401),
    response(403, { 'Strict-Transport-Security': 'max-age=86400' }),
    response(401, { 'WWW-Authenticate': 'Basic realm="Autre"', 'Strict-Transport-Security': 'max-age=86400', 'Content-Type': 'application/json' })]) {
    await assert.rejects(checkPrivateAvailability({ fetchImpl: async () => candidate }), /Assistant privé indisponible/)
  }
})

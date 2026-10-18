import test from 'node:test'
import assert from 'node:assert/strict'
import { createProfileReferencesClient, validateProfileReferences, normalizePathwayProfile } from './profile-references.mjs'
import { references, referenceResponse } from './reference-test-fixtures.mjs'

const settings = { endpoint: 'https://catalogue.example.invalid/api/profile-references', allowedOrigins: ['https://catalogue.example.invalid'] }
const hasCode = code => error => error.code === code

test('contrat : empreinte, version, règles, champs et valeurs incohérents sont refusés', () => {
  const original = references()
  for (const value of [null, [], { ...original, schemaVersion: 2 }, { ...original, revision: 'a'.repeat(64) },
    references(x => { delete x.pathway.fields.objective }),
    references(x => { x.pathway.apiValidation.enforceOptions = true }),
    references(x => { x.pathway.fields.entity.allowCustom = false }),
    references(x => { x.pathway.fields.role.maxLength = -1 }),
    references(x => { x.pathway.fields.personnelCategory.options.push(x.pathway.fields.personnelCategory.options[0]) }),
  ]) assert.throws(() => validateProfileReferences(value))
  const compatible = references(x => { x.pathway.extra = { ignored: true }; x.extra = 'propriété additive' })
  assert.equal(validateProfileReferences(compatible).pathway.extra.ignored, true)
  const frozen = validateProfileReferences(original)
  assert.throws(() => { frozen.pathway.fields.role.maxLength = 5 }, TypeError)
  assert.equal(original.pathway.fields.role.maxLength, 300)
})

test('profil : trim avant longueur, chaînes courtes, entités libres et champs optionnels omis', () => {
  const contract = references()
  const input = { personnelCategory: ' TEST-A ', entity: ' Service libre ', role: ' x ', objective: ' y ', existingSkills: null, constraints: ' ', ignored: 'valeur' }
  assert.deepEqual(normalizePathwayProfile(input, contract), { personnelCategory: 'TEST-A', entity: 'Service libre', role: 'x', objective: 'y' })
  assert.equal(input.role, ' x ')
  assert.doesNotThrow(() => normalizePathwayProfile({ ...input, role: ' ' + 'x'.repeat(300) + ' ' }, contract))
  assert.throws(() => normalizePathwayProfile({ ...input, role: 'x'.repeat(301) }, contract), hasCode('invalid_profile'))
  assert.throws(() => normalizePathwayProfile({ ...input, objective: ' ' }, contract), hasCode('invalid_profile'))
  assert.throws(() => normalizePathwayProfile({ ...input, entity: 42 }, contract), hasCode('invalid_profile'))
})

test('profil : les options du formulaire ne deviennent pas des valeurs fermées pour l’API', () => {
  const contract = references()
  const profile = { role: 'x', objective: 'y', personnelCategory: 'AUTRE', managerStatus: 'Situation libre' }
  assert.throws(() => normalizePathwayProfile(profile, contract), hasCode('removed_value'))
  assert.deepEqual(normalizePathwayProfile(profile, contract, { form: false }), profile)
  assert.doesNotThrow(() => normalizePathwayProfile({ role: 'x', objective: 'y' }, contract, { form: false }))
  assert.throws(() => normalizePathwayProfile({ role: 'x', objective: 'y' }, contract), hasCode('invalid_profile'))
  const removed = references(x => { x.pathway.fields.personnelCategory.options.shift() })
  assert.throws(() => normalizePathwayProfile({ ...profile, personnelCategory: 'TEST-A' }, removed), hasCode('removed_value'))
})

test('lecteur : configuration explicite, origine autorisée, chemin fixe et aucun transport à l’import', () => {
  for (const options of [{ endpoint: undefined }, { endpoint: 'http://catalogue.example.invalid/api/profile-references' },
    { allowedOrigins: [] }, { endpoint: settings.endpoint + '?key=hidden' },
    { endpoint: 'https://user:pass@catalogue.example.invalid/api/profile-references' },
    { endpoint: 'https://catalogue.example.invalid/api/search' }, { timeoutMs: 0 }, { maxBytes: 999999 },
  ]) assert.throws(() => createProfileReferencesClient({ ...settings, ...options }), hasCode('configuration'))
  let calls = 0
  createProfileReferencesClient({ ...settings, fetchImpl: () => { calls++ } })
  assert.equal(calls, 0)
})

test('lecteur : 200 puis 304 revalident un cache immuable avec ETag, sans identifiants ni redirection', async () => {
  const data = references(); let calls = 0
  const client = createProfileReferencesClient({ ...settings, fetchImpl: async (url, options) => {
    assert.equal(url, settings.endpoint)
    assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit')
    assert.equal(options.headers.Authorization, undefined)
    calls++
    if (calls === 1) { assert.equal(options.headers['If-None-Match'], undefined); return referenceResponse(data) }
    assert.equal(options.headers['If-None-Match'], '"' + data.revision + '"')
    return new Response(null, { status: 304, headers: { ETag: '"' + data.revision + '"' } })
  } })
  assert.throws(() => client.getCurrent(), hasCode('stale'))
  const first = await client.refresh()
  assert.equal(await client.refresh(), first)
  assert.equal(client.getCurrent(), first)
  assert.equal(client.state().status, 'ready'); assert.equal(calls, 2)
})

test('lecteur : échec ou version incompatible bloque le cache sans effacer le brouillon du client', async () => {
  const data = references(); let calls = 0
  const client = createProfileReferencesClient({ ...settings, fetchImpl: async () => {
    calls++; return calls === 1 ? referenceResponse(data) : referenceResponse(references(x => { x.schemaVersion = 2 }))
  } })
  const draft = { personnelCategory: 'TEST-A', role: 'x', objective: 'y' }
  await client.refresh()
  await assert.rejects(client.refresh(), hasCode('schema'))
  assert.equal(client.state().status, 'stale')
  assert.equal(client.state().references.revision, data.revision)
  assert.throws(() => client.getCurrent(), hasCode('stale'))
  assert.equal(draft.role, 'x')
})

test('lecteur : corps et ETag incohérents, erreurs HTTP, non JSON et 304 sans cache refusés', async () => {
  for (const response of [new Response(null, { status: 304 }), new Response('Erreur interne privée', { status: 500 }),
    new Response('<html>'), new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify(references()), { headers: { 'Content-Type': 'application/json', ETag: '"faux"' } }),
  ]) {
    const client = createProfileReferencesClient({ ...settings, fetchImpl: async () => response })
    await assert.rejects(client.refresh(), error => !error.message.includes('privée'))
    assert.equal(client.state().status, 'empty')
  }
})

test('lecteur : limite de taille réelle y compris sans Content-Length', async () => {
  const client = createProfileReferencesClient({ ...settings, maxBytes: 50, fetchImpl: async () => referenceResponse() })
  await assert.rejects(client.refresh(), hasCode('size'))
  const declared = createProfileReferencesClient({ ...settings, fetchImpl: async () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '999999' } }) })
  await assert.rejects(declared.refresh(), hasCode('size'))
})

test('lecteur : délai couvre aussi un transport qui ignore AbortSignal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const client = createProfileReferencesClient({ ...settings, timeoutMs: 10, fetchImpl: () => new Promise(() => {}) })
  const pending = client.refresh(); const rejected = assert.rejects(pending, hasCode('timeout'))
  t.mock.timers.tick(11); await rejected
  assert.equal(client.state().status, 'empty')
})

test('lecteur : une ancienne réponse ne remplace pas la révision récente', async () => {
  const waiting = []
  const client = createProfileReferencesClient({ ...settings, fetchImpl: () => new Promise(resolve => waiting.push(resolve)) })
  const old = client.refresh(); const rejected = assert.rejects(old, hasCode('superseded'))
  const latest = client.refresh()
  const data = references(x => { x.pathway.fields.role.maxLength = 299 })
  waiting[1](referenceResponse(data)); await latest
  waiting[0](referenceResponse()); await rejected
  assert.equal(client.getCurrent().revision, data.revision)
})

test('lecteur : annulation avant transport et pendant réception sans livraison tardive', async () => {
  const waiting = []; let calls = 0
  const client = createProfileReferencesClient({ ...settings, fetchImpl: () => {
    calls++; return new Promise(resolve => waiting.push(resolve))
  } })
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(client.refresh({ signal: aborted.signal }), hasCode('cancelled'))
  assert.equal(calls, 0)
  const active = new AbortController()
  const pending = client.refresh({ signal: active.signal })
  const rejected = assert.rejects(pending, hasCode('cancelled'))
  active.abort(); waiting[0](referenceResponse())
  await rejected
  assert.throws(() => client.getCurrent(), hasCode('stale'))
})

test('lecteur : délai total pendant un flux JSON bloqué, annulation du flux', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let cancelled = false
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')) }, cancel() { cancelled = true } })
  const client = createProfileReferencesClient({ ...settings, timeoutMs: 10, fetchImpl: async () =>
    new Response(body, { headers: { 'Content-Type': 'application/json' } }),
  })
  const pending = client.refresh(); const rejected = assert.rejects(pending, hasCode('timeout'))
  await new Promise(resolve => setImmediate(resolve))
  t.mock.timers.tick(11); await rejected
  assert.equal(cancelled, true)
  assert.equal(client.state().status, 'empty')
})

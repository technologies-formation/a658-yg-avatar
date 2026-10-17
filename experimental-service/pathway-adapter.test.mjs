// Fixtures synthetiques : aucun cours reel ni aucun acces au backend historique.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPathwayAdapter, PathwayAdapterError } from './pathway-adapter.mjs'
import { PROFILE_FIELD_LIMITS } from './profile-validation.mjs'
import { validateRequest } from './server.mjs'

const profile = {
  personnelCategory: 'PAT', entity: 'OPE', managerStatus: 'Nouveau manager',
  role: 'Conseiller', objective: 'Developper mes competences', existingSkills: 'Bases',
  timeAvailable: 'Deux jours', constraints: 'Aucune',
}
const settings = {
  enabled: true,
  endpoint: 'https://catalogue.example.invalid/api/pathway',
  allowedPersonnelCategories: ['PAT', 'PE'],
  allowedEntities: ['OPE'],
  allowedManagerStatuses: ['Nouveau manager'],
}
function step(code) {
  return {
    position: 1, rationale: 'Justification de test',
    course: { code, title: 'Formation fictive de test', duration: '1 jour', public: 'PAT',
      sourceUrl: 'https://outils.ge.ch/referentiel/formation/CatalogueDescription/' + code },
  }
}
function result() {
  return {
    ok: true, summary: 'Synthese de test', recommendedSteps: [step('TEST-001')],
    optionalSteps: [step('TEST-002')], informationalCourses: [step('TEST-003')],
    gaps: ['Limite de test'], durationSummary: { recommendedHours: 7, budgetHours: 14, excessHours: 0 },
  }
}
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
const hasCode = code => error => error instanceof PathwayAdapterError && error.code === code

test('adaptateur desactive par defaut : aucun transport, aucune URL requise', async () => {
  let calls = 0
  const adapter = createPathwayAdapter({ fetchImpl: () => { calls++; throw Error('Envoi interdit') } })
  assert.equal(adapter.enabled, false)
  await assert.rejects(adapter.buildPathway(profile, { confirmed: true }), hasCode('disabled'))
  assert.equal(calls, 0)
})

test('activation explicite : URL fixe HTTPS, delai et politiques obligatoires', () => {
  const transport = () => { throw Error('Envoi interdit') }
  for (const override of [
    { enabled: 'true' }, { endpoint: '' }, { endpoint: 'http://catalogue.example.invalid/api/pathway' },
    { endpoint: 'https://catalogue.example.invalid/api/search' },
    { endpoint: 'https://user:secret@catalogue.example.invalid/api/pathway' },
    { endpoint: settings.endpoint + '?token=test' }, { endpoint: settings.endpoint + '#fragment' },
    { allowedPersonnelCategories: [] }, { allowedEntities: [' OPE'] },
    { allowedManagerStatuses: null }, { timeoutMs: 0 }, { timeoutMs: 120001 }, { fetchImpl: null },
  ]) {
    assert.throws(() => createPathwayAdapter({ ...settings, fetchImpl: transport, ...override }), hasCode('configuration'))
  }
})

test('profil non confirme : aucun appel meme avec une configuration valide', async () => {
  let calls = 0
  const adapter = createPathwayAdapter({ ...settings, fetchImpl: () => { calls++ } })
  for (const options of [undefined, { confirmed: false }, { confirmed: 'true' }]) {
    await assert.rejects(adapter.buildPathway(profile, options), hasCode('unconfirmed'))
  }
  assert.equal(calls, 0)
})

test('contrat HTTP : profil seul, huit champs, aucun secret ni redirection', async () => {
  let calls = 0
  const expected = result()
  const adapter = createPathwayAdapter({ ...settings, fetchImpl: async (url, options) => {
    calls++
    assert.equal(url, settings.endpoint)
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), profile)
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json', Accept: 'application/json' })
    assert.equal(options.redirect, 'error')
    assert.equal(options.credentials, 'omit')
    assert.equal(options.signal.aborted, false)
    return json(expected)
  } })
  const actual = await adapter.buildPathway(profile, { confirmed: true })
  assert.equal(actual.mode, 'historical-pathway')
  assert.equal(actual.empty, false)
  assert.deepEqual(actual.result, expected)
  assert.equal(calls, 1)
})

test('champs optionnels absents et espaces : profil normalise sans mutation', async () => {
  const input = { personnelCategory: 'PAT', role: ' Conseiller ', objective: ' Apprendre la gestion ', constraints: ' ' }
  const saved = { ...input }
  const adapter = createPathwayAdapter({ ...settings, fetchImpl: async (_, options) => {
    assert.deepEqual(JSON.parse(options.body), { personnelCategory: 'PAT', role: 'Conseiller', objective: 'Apprendre la gestion' })
    return json(result())
  } })
  await adapter.buildPathway(input, { confirmed: true })
  assert.deepEqual(input, saved)
})

test('validation des huit champs, des obligatoires et refus des enveloppes', async () => {
  let calls = 0
  const adapter = createPathwayAdapter({ ...settings, fetchImpl: () => { calls++ } })
  const invalidProfiles = [null, [], {}, { type: 'pathway', profile }, { ...profile, unexpected: 'valeur' },
    { ...profile, role: 'x' }, { ...profile, objective: 'court' }, { ...profile, role: ' ' }]
  for (const [field, limit] of Object.entries(PROFILE_FIELD_LIMITS)) {
    invalidProfiles.push({ ...profile, [field]: 42 }, { ...profile, [field]: 'x'.repeat(limit + 1) })
  }
  for (const input of invalidProfiles) {
    await assert.rejects(adapter.buildPathway(input, { confirmed: true }), hasCode('invalid_profile'))
  }
  assert.equal(calls, 0)
  assert.match(validateRequest({ type: 'pathway', profile: { ...profile, entity: 'x'.repeat(121) } }), /entity/)
  assert.match(validateRequest({ type: 'pathway', profile: { ...profile, managerStatus: 42 } }), /managerStatus/)
})

test('nomenclatures non validees : blocage sans conversion ni appel', async () => {
  let calls = 0
  const adapter = createPathwayAdapter({ ...settings, fetchImpl: () => { calls++ } })
  for (const changes of [
    { personnelCategory: 'PU Police' }, { personnelCategory: 'POL' }, { personnelCategory: '' },
    { personnelCategory: undefined }, { entity: 'DIP' }, { managerStatus: 'Manager experimente' },
  ]) {
    await assert.rejects(adapter.buildPathway({ ...profile, ...changes }, { confirmed: true }), hasCode('unvalidated_value'))
  }
  assert.equal(calls, 0)
})

test('HTTP en erreur : statut conserve sans exposer le corps ni relancer', async () => {
  for (const status of [400, 401, 403, 422, 429, 500, 503]) {
    let calls = 0
    const adapter = createPathwayAdapter({ ...settings, fetchImpl: async () => {
      calls++
      return new Response('Contenu prive a ne pas exposer', { status })
    } })
    await assert.rejects(adapter.buildPathway(profile, { confirmed: true }), error =>
      hasCode('http_error')(error) && error.status === status && !error.message.includes('prive'))
    assert.equal(calls, 1)
  }
})

test('indisponibilite du transport : erreur generique sans fuite du profil', async () => {
  const adapter = createPathwayAdapter({ ...settings, fetchImpl: async () => { throw Error('Secret reseau') } })
  await assert.rejects(adapter.buildPathway(profile, { confirmed: true }), error =>
    hasCode('unavailable')(error) && !error.message.includes('Secret'))
})

test('reponses absentes, non JSON ou mal formees refusees', async () => {
  for (const response of [
    new Response(null, { status: 204 }),
    new Response('', { headers: { 'Content-Type': 'application/json' } }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    new Response('<html>Erreur</html>'), json(null), json({}), json([]),
  ]) {
    const adapter = createPathwayAdapter({ ...settings, fetchImpl: async () => response })
    await assert.rejects(adapter.buildPathway(profile, { confirmed: true }), error =>
      error.code === 'empty_response' || error.code === 'invalid_response')
  }
})

test('parcours sans recommandation : vide explicite, limites conservees, aucun cours invente', async () => {
  const empty = { ok: true, summary: 'Aucune correspondance', recommendedSteps: [], optionalSteps: [], informationalCourses: [], gaps: ['Catalogue insuffisant'] }
  const adapter = createPathwayAdapter({ ...settings, fetchImpl: async () => json(empty) })
  const actual = await adapter.buildPathway(profile, { confirmed: true })
  assert.equal(actual.empty, true)
  assert.deepEqual(actual.result, empty)
})

test('compatibilite steps : les anciennes categories et liens restent inchanges', async () => {
  const legacy = { ok: true, summary: 'Parcours historique', steps: [step('TEST-004')] }
  const adapter = createPathwayAdapter({ ...settings, fetchImpl: async () => json(legacy) })
  assert.deepEqual((await adapter.buildPathway(profile, { confirmed: true })).result, legacy)
})

test('formations, categories et liens dangereux non conformes refuses', async () => {
  for (const bad of [
    { ...result(), recommendedSteps: {} }, { ...result(), summary: '' }, { ...result(), gaps: [42] },
    { ...result(), optionalSteps: [{ ...step('TEST-001'), position: 0 }] },
    { ...result(), informationalCourses: [{ ...step('TEST-001'), rationale: '' }] },
    ...['javascript:alert(1)', 'https://example.invalid/formation', 'https://outils.ge.ch.evil.invalid/referentiel/formation/test',
      'http://outils.ge.ch/referentiel/formation/test', 'https://outils.ge.ch/ailleurs',
      'https://user:pass@outils.ge.ch/referentiel/formation/test'].map(sourceUrl => ({
      ...result(), recommendedSteps: [{ ...step('TEST-001'), course: { ...step('TEST-001').course, sourceUrl } }],
    })),
    { ...result(), recommendedSteps: [{ ...step('TEST-001'), course: { title: 'Sans code' } }] },
  ]) {
    const adapter = createPathwayAdapter({ ...settings, fetchImpl: async () => json(bad) })
    await assert.rejects(adapter.buildPathway(profile, { confirmed: true }), hasCode('invalid_response'))
  }
})

test('delai total borne y compris si le transport ignore AbortSignal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let transportSignal
  const adapter = createPathwayAdapter({ ...settings, timeoutMs: 100, fetchImpl: (_, options) => {
    transportSignal = options.signal
    return new Promise(() => {})
  } })
  const pending = adapter.buildPathway(profile, { confirmed: true })
  const rejected = assert.rejects(pending, hasCode('timeout'))
  t.mock.timers.tick(100)
  await rejected
  assert.equal(transportSignal.aborted, true)
  const abortingTransport = createPathwayAdapter({ ...settings, timeoutMs: 100, fetchImpl: (_, options) =>
    new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Error('Transport annule')), { once: true })),
  })
  const abortingRequest = assert.rejects(abortingTransport.buildPathway(profile, { confirmed: true }), hasCode('timeout'))
  t.mock.timers.tick(100)
  await abortingRequest
})

test('delai total couvre aussi un corps de reponse qui reste en attente', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const adapter = createPathwayAdapter({ ...settings, timeoutMs: 100, fetchImpl: async () => ({
    ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), json: () => new Promise(() => {}),
  }) })
  const pending = adapter.buildPathway(profile, { confirmed: true })
  const rejected = assert.rejects(pending, hasCode('timeout'))
  await Promise.resolve()
  t.mock.timers.tick(100)
  await rejected
})

test('annulation : aucun appel si deja annule et aucune reponse tardive livree', async () => {
  let calls = 0, reply, transportSignal
  const adapter = createPathwayAdapter({ ...settings, fetchImpl: (_, options) => {
    calls++; transportSignal = options.signal
    return new Promise((resolve, reject) => {
      reply = resolve
      options.signal.addEventListener('abort', () => reject(Error('Transport annule')), { once: true })
    })
  } })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(adapter.buildPathway(profile, { confirmed: true, signal: controller.signal }), hasCode('cancelled'))
  assert.equal(calls, 0)
  const current = new AbortController()
  const pending = adapter.buildPathway(profile, { confirmed: true, signal: current.signal })
  const rejected = assert.rejects(pending, hasCode('cancelled'))
  current.abort()
  reply(json(result()))
  await rejected
  assert.equal(transportSignal.aborted, true)
  assert.equal(calls, 1)
})

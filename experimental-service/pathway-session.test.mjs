// Transports injectés exclusivement ; aucun backend, cours ou appel OpenAI réel.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPathwaySession } from './pathway-session.mjs'
import { references, referenceResponse } from './reference-test-fixtures.mjs'

const contract = references()
const profile = { personnelCategory: 'TEST-A', entity: 'Mon service libre', role: ' x ', objective: ' y ' }
const result = { ok: true, summary: 'Synthèse simulée', recommendedSteps: [], optionalSteps: [], informationalCourses: [], gaps: ['Aucun cours fictif inventé'] }
const options = id => ({ confirmed: true, referenceRevision: contract.revision, requestId: 'request-0000000000-' + id })
const hasCode = code => error => error.code === code
const tick = () => new Promise(resolve => setImmediate(resolve))
function setup(t, override = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-session-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const calls = []
  const config = {
    enabled: true, singleInstance: true,
    endpoint: 'https://catalogue.example.invalid/api/pathway',
    referencesEndpoint: 'https://catalogue.example.invalid/api/profile-references',
    allowedOrigins: ['https://catalogue.example.invalid'],
    pathwayTimeoutMs: 1000, referenceTimeoutMs: 100,
    stateFile: join(dir, 'attempts.json'), maxDailyRequests: 3, maxTotalRequests: 3,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return init.method === 'GET' ? referenceResponse(contract) : Response.json(result)
    }, ...override,
  }
  return { dir, config, calls, create: changes => createPathwaySession({ ...config, ...changes }) }
}

test('session désactivée : aucun transport ni lecture de fichier, configuration active explicite', async t => {
  let calls = 0
  const disabled = createPathwaySession({ stateFile: '/inexistant/prive', fetchImpl: () => { calls++ } })
  await assert.rejects(disabled.getReferences(), hasCode('disabled'))
  await assert.rejects(disabled.buildPathway(profile, options('a')), hasCode('disabled'))
  assert.equal(calls, 0)
  const { create } = setup(t)
  for (const changes of [
    { enabled: 'true' }, { singleInstance: false }, { stateFile: '' }, { stateFile: 'relatif.json' },
    { maxDailyRequests: undefined }, { maxTotalRequests: 0 }, { pathwayTimeoutMs: undefined },
    { pathwayTimeoutMs: 210001 }, { allowedOrigins: [] }, { isEnabled: false },
    { endpoint: 'https://autre.example.invalid/api/pathway' },
    { endpoint: 'https://catalogue.example.invalid/api/search' },
  ]) assert.throws(() => create(changes), hasCode('configuration'))
})

test('référentiels puis confirmation : profil seul figé, un GET par tentative et aucun secret transmis', async t => {
  const { create, calls } = setup(t)
  const session = create()
  assert.equal((await session.getReferences()).revision, contract.revision)
  assert.equal(session.status().total, 0)
  await assert.rejects(session.buildPathway(profile, { ...options('a'), confirmed: false }), hasCode('unconfirmed'))
  await assert.rejects(session.buildPathway(profile, { ...options('a'), requestId: '' }), hasCode('invalid_request_id'))
  assert.equal(calls.length, 1)
  const input = { ...profile }
  const pending = session.buildPathway(input, options('a'))
  input.objective = 'Modification non confirmée'
  const actual = await pending
  assert.deepEqual(actual.result, result)
  assert.equal(calls.length, 3)
  const post = calls[2]
  assert.equal(post.url, 'https://catalogue.example.invalid/api/pathway')
  assert.deepEqual(JSON.parse(post.init.body), { personnelCategory: 'TEST-A', entity: 'Mon service libre', role: 'x', objective: 'y' })
  assert.equal(post.init.headers.Authorization, undefined)
  assert.equal(post.init.redirect, 'error')
  assert.equal(session.status().total, 1)
  await assert.rejects(session.buildPathway(profile, options('a')), hasCode('duplicate_request'))
  assert.equal(calls.length, 3)
})

test('révision changée, profil invalide ou référentiel indisponible : aucun POST ni quota', async t => {
  let current = contract, unavailable = false, posts = 0
  const { create } = setup(t, { fetchImpl: async (_, init) => {
    if (init.method === 'POST') { posts++; return Response.json(result) }
    if (unavailable) throw Error('Détail réseau privé')
    return referenceResponse(current)
  } })
  const session = create()
  await assert.rejects(session.buildPathway({ ...profile, role: '' }, options('a')), hasCode('invalid_profile'))
  current = references(x => { x.pathway.fields.role.maxLength = 100 })
  await assert.rejects(session.buildPathway(profile, options('b')), hasCode('references_changed'))
  unavailable = true
  await assert.rejects(session.buildPathway(profile, options('c')), error => hasCode('references_unavailable')(error) && !error.message.includes('privé'))
  assert.equal(posts, 0)
  assert.equal(session.status().total, 0)
})

test('une demande à la fois : ni file d’attente, ni double POST', async t => {
  let release, posts = 0
  const { create } = setup(t, { fetchImpl: async (_, init) => {
    if (init.method === 'GET') return referenceResponse(contract)
    posts++; return new Promise(resolve => { release = resolve })
  } })
  const session = create(), pending = session.buildPathway(profile, options('a'))
  while (!release) await tick()
  assert.equal(session.status().busy, true)
  await assert.rejects(session.buildPathway(profile, options('b')), hasCode('busy'))
  await assert.rejects(session.getReferences(), hasCode('busy'))
  assert.equal(posts, 1)
  release(Response.json(result)); await pending
  assert.equal(session.status().busy, false)
  assert.equal(session.status().total, 1)
})

test('tentative réservée sur échec HTTP, plafond et redémarrage sans remise à zéro', async t => {
  let posts = 0
  const { create } = setup(t, { maxDailyRequests: 2, maxTotalRequests: 2, fetchImpl: async (_, init) => {
    if (init.method === 'GET') return referenceResponse(contract)
    posts++
    return posts === 1 ? new Response('Erreur privée', { status: 503 }) : Response.json(result)
  } })
  const session = create()
  await assert.rejects(session.buildPathway(profile, options('a')), error => hasCode('http_error')(error) && error.status === 503)
  assert.equal(session.status().total, 1)
  await assert.rejects(session.buildPathway(profile, options('a')), hasCode('duplicate_request'))
  const restarted = create()
  assert.equal(restarted.status().total, 1)
  await restarted.buildPathway(profile, options('b'))
  await assert.rejects(restarted.buildPathway(profile, options('c')), hasCode('quota_exceeded'))
  assert.equal(posts, 2)
  assert.equal(restarted.status().total, 2)
})

test('annulation et arrêt durable : réservation conservée, réponse tardive ignorée', async t => {
  let release, transportSignal
  const { create } = setup(t, { fetchImpl: async (_, init) => {
    if (init.method === 'GET') return referenceResponse(contract)
    transportSignal = init.signal
    return new Promise(resolve => { release = resolve })
  } })
  const session = create()
  const pending = session.buildPathway(profile, options('a'))
  const rejected = assert.rejects(pending, hasCode('cancelled'))
  while (!release) await tick()
  session.stop(); await rejected
  release(Response.json(result)); await tick()
  assert.equal(transportSignal.aborted, true)
  assert.equal(session.status().total, 1)
  assert.equal(session.status().enabled, false)
  assert.equal(session.status().busy, false)
  const restarted = create()
  assert.equal(restarted.status().stopped, true)
  assert.equal(restarted.status().enabled, false)
  await assert.rejects(restarted.buildPathway(profile, options('b')), hasCode('disabled'))
})

test('annulation avant envoi et stockage impossible : aucun POST', async t => {
  const { create, calls, dir } = setup(t)
  const session = create(), controller = new AbortController()
  controller.abort()
  await assert.rejects(session.buildPathway(profile, { ...options('a'), signal: controller.signal }), hasCode('cancelled'))
  assert.equal(calls.length, 0)
  const noStorage = create({ stateFile: join(dir, 'parent-absent', 'attempts.json') })
  await assert.rejects(noStorage.buildPathway(profile, options('b')), hasCode('session_unavailable'))
  assert.equal(calls.filter(call => call.init.method === 'POST').length, 0)
  assert.equal(noStorage.status().total, 0)
  writeFileSync(join(dir, 'corrompu.json'), 'invalide')
  assert.throws(() => create({ stateFile: join(dir, 'corrompu.json') }), /Etat de quota illisible/)
})

test('délai de réponse : pas de relance et pas de remboursement d’une tentative incertaine', async t => {
  let posts = 0
  const { create } = setup(t, { pathwayTimeoutMs: 10, fetchImpl: async (_, init) => {
    if (init.method === 'GET') return referenceResponse(contract)
    posts++; return new Promise(() => {})
  } })
  const session = create()
  await assert.rejects(session.buildPathway(profile, options('a')), hasCode('timeout'))
  assert.equal(posts, 1)
  assert.equal(session.status().total, 1)
  assert.equal(session.status().busy, false)
  await assert.rejects(session.buildPathway(profile, options('a')), hasCode('duplicate_request'))
})

test('interrupteur changé pendant la revalidation ou illisible : blocage avant réservation', async t => {
 let allowed=true, release
 const {create}=setup(t,{isEnabled:()=>{if(allowed===null)throw Error('Configuration privée');return allowed},fetchImpl:()=>new Promise(resolve=>{release=resolve})})
 const session=create(), pending=session.buildPathway(profile,options('a'))
 const rejected=assert.rejects(pending,hasCode('disabled'))
 while(!release)await tick()
 allowed=false;release(referenceResponse(contract));await rejected
 assert.equal(session.status().total,0)
 allowed=null
 assert.equal(session.status().enabled,false)
 await assert.rejects(session.getReferences(),hasCode('disabled'))
})

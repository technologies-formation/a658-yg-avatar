import test from 'node:test'
import assert from 'node:assert/strict'
import { createDialogueSession, createScriptedDialogueProvider } from './dialogue-session.mjs'
import { references } from './reference-test-fixtures.mjs'
const refs = references()
const text = 'Je voudrais mieux organiser mes tâches et mes priorités.'
const firstId = 'dialogue_request_0001'
const profile = { personnelCategory: 'TEST-A', role: 'Assistant de test', objective: 'Organiser les tâches de test', constraints: 'Disponibilité le matin' }
const answer = changes => ({ kind: 'ask', reply: 'Combien de temps pouvez-vous consacrer à cette formation ?', changes })
const change = (field = 'objective', value = 'Mieux organiser mes tâches et mes priorités', quote = text, messageId = firstId) => ({ field, value, evidence: [{ messageId, quote }] })
function setup(replies = [answer([change()])], options = {}) {
  return createDialogueSession({ enabled: true, provider: createScriptedDialogueProvider(replies), references: refs,
    initialProfile: profile, maxTurns: 3, timeoutMs: 1000, ...options })
}
const request = (extra = {}) => ({ requestId: firstId, message: text, expectedRevision: 0, referenceRevision: refs.revision, ...extra })
const code = value => error => error.code === value

test('désactivé par défaut, sans consulter fournisseur ou contrat', async () => {
  let calls = 0
  const session = createDialogueSession({ get provider() { calls++; throw Error('ne pas lire') } })
  assert.equal(session.status().enabled, false)
  await assert.rejects(session.turn(), code('disabled'))
  assert.equal(calls, 0)
})

test('fournisseur réel refusé, limites et référentiel obligatoires', () => {
  assert.throws(() => setup([], { provider: { mode: 'real', respond() {} } }), code('configuration'))
  assert.throws(() => setup([], { maxTurns: undefined }), code('configuration'))
  assert.throws(() => setup([], { references: {} }))
})

test('proposition avec preuve, brouillon intact avant acceptation explicite', async () => {
  const s = setup(); const result = await s.turn(request())
  assert.equal(s.getDraft().profile.objective, profile.objective)
  assert.equal(result.proposal.changes[0].field, 'objective')
  assert.throws(() => s.acceptProposal({ proposalId: firstId, expectedRevision: 0 }), code('unconfirmed'))
  const applied = s.acceptProposal({ proposalId: firstId, expectedRevision: 0, confirmed: true })
  assert.equal(applied.profile.objective, change().value); assert.equal(applied.revision, 1)
  assert.throws(() => s.acceptProposal({ proposalId: firstId, expectedRevision: 1, confirmed: true }), code('stale_proposal'))
  assert.equal(result.usage.apiCalls, 0)
  assert.ok(Object.isFrozen(result.proposal.changes))
})

test('aucun défaut supposé pour le niveau, le public ou la modalité', async () => {
  const s = setup([answer([])], { initialProfile: {} }); await s.turn(request())
  assert.deepEqual(s.getDraft().profile, {}); assert.equal(s.getDraft().modality, '')
  assert.throws(() => s.getPathwayProfile({ expectedRevision: 0 }))
})

test('sortie de cours ou de génération rejetée par le contrat', async () => {
  for (const bad of [{ ...answer([]), courses: ['FAUX-1'] }, { ...answer([]), kind: 'generate' }]) {
    const s = setup([bad]); await assert.rejects(s.turn(request()), code('invalid_response'))
    assert.equal(s.getDraft().profile.objective, profile.objective)
  }
})

test('preuves inventées, champs inconnus et valeurs hors référentiel rejetés', async () => {
  for (const bad of [change('objective', 'Nouvel objectif', 'extrait inventé'), change('objective', 'Nouvel objectif', text, 'absent'),
    change('personnelCategory', 'PUBLIC-INVENTÉ'), change('modality', 'Tout en ligne garanti'), change('courses', 'FAUX'), change('role', 'a'.repeat(301))]) {
    const s = setup([answer([bad])]); await assert.rejects(s.turn(request()), code('invalid_response'))
  }
})

test('mise à jour humaine invalide la proposition ; pas de recherche automatique', async () => {
  const s = setup(); await s.turn(request())
  assert.throws(() => s.getPathwayProfile({ expectedRevision: 0 }), code('proposal_pending'))
  const edited = s.editProfile({ ...profile, role: 'Autre rôle' }, { expectedRevision: 0, modality: 'En ligne' })
  assert.equal(edited.revision, 1)
  assert.throws(() => s.acceptProposal({ proposalId: firstId, expectedRevision: 0, confirmed: true }), code('stale_proposal'))
  const exported = s.getPathwayProfile({ expectedRevision: 1 })
  assert.equal(exported.constraints, 'Modalité souhaitée : en ligne\nDisponibilité le matin')
  assert.equal(s.status().attemptedTurns, 1)
})

test('révision de profil ou référentiel périmé refusée avant fournisseur', async () => {
  const s = setup()
  await assert.rejects(s.turn(request({ expectedRevision: 4 })), code('stale_profile'))
  await assert.rejects(s.turn(request({ referenceRevision: 'a'.repeat(64) })), code('references_changed'))
  assert.equal(s.status().attemptedTurns, 0)
})

test('doublon et quota sans relance, même après réponse invalide', async () => {
  const s = setup([{}], { maxTurns: 1 })
  await assert.rejects(s.turn(request()), code('invalid_response'))
  await assert.rejects(s.turn(request()), code('duplicate_request'))
  await assert.rejects(s.turn(request({ requestId: 'dialogue_request_0002' })), code('quota_exceeded'))
  assert.equal(s.status().attemptedTurns, 1)
})

test('délai borné même si le fournisseur ignore le signal', async () => {
  const s = setup([], { timeoutMs: 10, provider: { mode: 'simulation', respond: () => new Promise(() => {}) } })
  await assert.rejects(s.turn(request()), code('timeout')); assert.equal(s.status().busy, false)
})

test('concurrence, annulation et arrêt refusent toute réponse tardive', async () => {
  let finish
  const s = setup([], { provider: { mode: 'simulation', respond: () => new Promise(resolve => { finish = resolve }) } })
  const controller = new AbortController(), pending = s.turn(request({ signal: controller.signal }))
  await Promise.resolve()
  await assert.rejects(s.turn(request({ requestId: 'dialogue_request_0002' })), code('busy'))
  controller.abort(); await assert.rejects(pending, code('cancelled'))
  finish(answer([change()])); await Promise.resolve()
  assert.equal(s.getDraft().revision, 0)
  s.stop(); await assert.rejects(s.turn(request()), code('disabled'))
})

test('longueur et historique bornés sans nouveau fournisseur', async () => {
  const s = setup([answer([])], { maxHistoryCharacters: 4100 })
  await assert.rejects(s.turn(request({ message: 'x'.repeat(1501) })), code('invalid_request'))
  await s.turn(request())
  await assert.rejects(s.turn(request({ requestId: 'dialogue_request_0002' })), code('history_limit'))
  assert.equal(s.status().attemptedTurns, 1)
})

test('arrêt immédiat empêche même le lancement du faux fournisseur', async () => {
  let calls = 0
  const s = setup([], { provider: { mode: 'simulation', respond() { calls++; return answer([]) } } })
  const attempt = s.turn(request()); s.stop()
  await assert.rejects(attempt, code('disabled')); assert.equal(calls, 0)
})

test('signal invalide et valeurs incorrectes ne bloquent pas la session', async () => {
  const s = setup()
  await assert.rejects(s.turn(request({ signal: {} })), code('invalid_request'))
  assert.equal(s.status().attemptedTurns, 0); assert.equal(s.status().busy, false)
  assert.throws(() => s.editProfile({ ...profile, personnelCategory: 'inventé' }, { expectedRevision: 0 }), code('invalid_profile'))
  await s.turn(request()); assert.equal(s.status().attemptedTurns, 1)
})

test('nouvelle demande confirmée : ancien contexte retiré, quotas, usage et anti-doublons conservés',async()=>{
 const contexts=[]
 const s=setup([], {provider:{mode:'simulation',async respond({messages}){contexts.push(messages.map(m=>m.text));return contexts.length===1?answer([change()]):answer([])}}})
 await s.turn(request());const before=s.getDraft(),proposal=s.getProposal(),usage=s.getUsage()
 assert.throws(()=>s.restart({expectedRevision:0}),code('unconfirmed'));assert.deepEqual(s.getDraft(),before);assert.deepEqual(s.getProposal(),proposal)
 assert.throws(()=>s.restart({expectedRevision:99,confirmed:true}),code('stale_profile'))
 const restarted=s.restart({expectedRevision:0,confirmed:true});assert.deepEqual(restarted.profile,{});assert.equal(restarted.modality,'');assert.equal(restarted.revision,1);assert.equal(s.getProposal(),null);assert.equal(s.status().attemptedTurns,1);assert.deepEqual(s.getUsage(),usage)
 await assert.rejects(s.turn(request({expectedRevision:1})),code('duplicate_request'))
 const fresh='Je voudrais progresser sur un tout autre sujet.'
 await s.turn(request({requestId:'dialogue_request_0002',message:fresh,expectedRevision:1}))
 assert.deepEqual(contexts[1],[fresh]);assert.equal(s.status().attemptedTurns,2)
})


test('reprise explicite : ancien contexte retiré sans remettre les tentatives ni identifiants à zéro',async()=>{
 const seen=[]
 const session=setup([], {provider:{mode:'simulation',async respond(value){seen.push(value.messages);return answer([])}}})
 await session.turn(request())
 const draft=session.editProfile(profile,{expectedRevision:0,clearConversation:true})
 assert.equal(session.status().attemptedTurns,1)
 await assert.rejects(session.turn(request({expectedRevision:draft.revision})),code('duplicate_request'))
 await session.turn(request({requestId:'dialogue_request_0002',expectedRevision:draft.revision}))
 assert.equal(seen[1].length,1);assert.equal(session.status().attemptedTurns,2)
})

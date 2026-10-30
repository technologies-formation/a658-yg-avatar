import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDialogueBudget } from './dialogue-budget.mjs'
import { createOpenAIDialogueProvider } from './openai-dialogue.mjs'
import { createDialogueSession } from './dialogue-session.mjs'
import { references } from './reference-test-fixtures.mjs'
const refs = references(), id = n => 'dialogue_trial_' + String(n).padStart(4, '0')
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
const output = { kind: 'ask', reply: 'Quel temps pouvez-vous consacrer à cette formation ?', changes: [] }
const response = () => ({ status: 'completed', model: 'gpt-6-luna', usage: { input_tokens: 1000, output_tokens: 100 },
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] })
const payload = (n = 1) => ({ references: refs, draft: { profile: {}, modality: '', revision: 0, referenceRevision: refs.revision },
  messages: [{ id: id(n), role: 'user', text: 'Je voudrais mieux organiser mon travail.' }] })
const code = c => e => e.code === c
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-dialogue-budget-'))
  let budget = createDialogueBudget({ directory: dir, singleInstance: true })
  t.after(() => { budget.close(); rmSync(dir, { recursive: true, force: true }) })
  return { dir, get budget() { return budget }, reopen() { budget.close(); budget = createDialogueBudget({ directory: dir, singleInstance: true }); return budget } }
}
const provider = (budget, fetchImpl, options = {}) => createOpenAIDialogueProvider({ enabled: true, paidTrialAuthorized: true,
  apiKey: 'TOKEN_TEST_ONLY', budget, fetchImpl, ...options })

test('connecteur désactivé ne consulte pas clé, registre ou transport', async () => {
  const p = createOpenAIDialogueProvider({ get apiKey() { throw Error('secret à ne pas lire') }, get budget() { throw Error('aucun fichier') } })
  await assert.rejects(p.respond(), code('disabled'))
  assert.equal(p.mode, 'disabled')
})

test('autorisation distincte et registre explicites avant configuration', t => {
  const f = fixture(t)
  assert.throws(() => provider(f.budget, async () => {}, { paidTrialAuthorized: false }), code('configuration'))
  assert.throws(() => provider(f.budget, async () => {}, { apiKey: '' }), code('configuration'))
  const real = provider(f.budget, async () => {})
  assert.throws(() => createDialogueSession({ enabled: true, provider: real }), code('configuration'))
})

test('réservation durable avant tout transport ; schéma, destination et absence de stockage', async t => {
  const f = fixture(t), calls = []
  const p = provider(f.budget, async (url, init) => {
    assert.equal(f.budget.status().attempts, 1)
    const saved = readFileSync(join(f.dir, 'attempt-01.json'), 'utf8')
    assert.ok(!saved.includes(id(1))); assert.ok(!saved.includes('TOKEN_TEST_ONLY'))
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit')
    assert.equal(init.headers.Authorization, 'Bearer TOKEN_TEST_ONLY')
    const body = JSON.parse(init.body); calls.push({ url, body })
    assert.ok(!init.body.includes('TOKEN_TEST_ONLY'))
    return json(url.endsWith('/input_tokens') ? { object: 'response.input_tokens', input_tokens: 1000 } : response())
  })
  const value = await p.respond(payload())
  assert.deepEqual(value.result, output); assert.equal(value.usage.inputTokens, 1000)
  assert.equal(value.usage.reservedUsd, 0.01)
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses/input_tokens')
  assert.equal(calls[1].url, 'https://api.openai.com/v1/responses')
  assert.equal(calls[1].body.store, false); assert.equal(calls[1].body.service_tier, 'default')
  assert.equal(calls[1].body.max_output_tokens, 2000); assert.equal(calls[1].body.tools, undefined)
  assert.equal(calls[1].body.text.format.strict, true)
  assert.equal(calls[1].body.text.format.schema.additionalProperties, false)
  assert.deepEqual(calls[0].body.input, calls[1].body.input)
})

test('dix tentatives et 0,10 USD réservés, persistants après réouverture', t => {
  const f = fixture(t)
  for (let n = 1; n <= 5; n++) f.budget.reserve(id(n))
  f.reopen()
  assert.throws(() => f.budget.reserve(id(1)), code('duplicate_request'))
  for (let n = 6; n <= 10; n++) f.budget.reserve(id(n))
  assert.equal(f.budget.status().reservedMicroUsd, 100000)
  assert.throws(() => f.budget.reserve(id(11)), code('quota_exceeded'))
})

test('instance concurrente, état corrompu et lien symbolique bloqués', t => {
  const f = fixture(t)
  assert.throws(() => createDialogueBudget({ directory: f.dir, singleInstance: true }), code('budget_locked'))
  f.budget.close(); writeFileSync(join(f.dir, 'attempt-01.json'), '{', { mode: 0o600 })
  assert.throws(() => createDialogueBudget({ directory: f.dir, singleInstance: true }), code('budget_corrupt'))
  unlinkSync(join(f.dir, 'attempt-01.json'))
  const target = join(f.dir, 'target.json'); writeFileSync(target, '{}', { mode: 0o600 }); symlinkSync(target, join(f.dir, 'attempt-01.json'))
  assert.throws(() => createDialogueBudget({ directory: f.dir, singleInstance: true }), code('budget_corrupt'))
})

test('entrée trop grande ou compteur invalide bloque la génération', async t => {
  const f = fixture(t); let calls = 0
  const p = provider(f.budget, async () => { calls++; return json({ object: 'response.input_tokens', input_tokens: 60001 }) })
  await assert.rejects(p.respond(payload()), code('input_token_limit'))
  assert.equal(calls, 1); assert.equal(f.budget.status().attempts, 1)
  const bad = payload(2); bad.messages[0].text = 'x'.repeat(4001)
  await assert.rejects(p.respond(bad), code('invalid_request')); assert.equal(calls, 1)
})

test('erreur HTTP ne relance pas et ne libère pas la réservation', async t => {
  const f = fixture(t); let calls = 0
  const p = provider(f.budget, async () => { calls++; return new Response('SECRET_TEST', { status: 429 }) })
  await assert.rejects(p.respond(payload()), e => e.code === 'api_unavailable' && !e.message.includes('SECRET_TEST'))
  await assert.rejects(p.respond(payload()), code('duplicate_request'))
  assert.equal(calls, 1); assert.equal(f.budget.status().reservedMicroUsd, 10000)
})

test('usage non vérifiable ou modèle incorrect impose un arrêt durable', async t => {
  for (const mutate of [r => { delete r.usage }, r => { r.model = 'autre-modele' }]) {
    const dir = mkdtempSync(join(tmpdir(), 'avatar-dialogue-stop-'))
    let budget = createDialogueBudget({ directory: dir, singleInstance: true })
    try {
      const p = provider(budget, async url => { if (url.endsWith('/input_tokens')) return json({ object: 'response.input_tokens', input_tokens: 1000 }); const r = response(); mutate(r); return json(r) })
      await assert.rejects(p.respond(payload())); assert.equal(budget.status().stopped, true)
      budget.close(); budget = createDialogueBudget({ directory: dir, singleInstance: true })
      assert.throws(() => budget.reserve(id(2)), code('budget_stopped'))
    } finally { budget.close(); rmSync(dir, { recursive: true, force: true }) }
  }
})

test('refus, sortie tronquée et JSON invalide ne sont pas interprétés comme réponse', async t => {
  const f = fixture(t)
  for (let n = 1; n <= 3; n++) {
    const p = provider(f.budget, async url => {
      if (url.endsWith('/input_tokens')) return json({ object: 'response.input_tokens', input_tokens: 1000 })
      const r = response()
      if (n === 1) r.status = 'incomplete'
      if (n === 2) r.output[0].content[0] = { type: 'refusal', refusal: 'Non' }
      if (n === 3) r.output[0].content[0].text = '{'
      return json(r)
    })
    await assert.rejects(p.respond(payload(n)), code('api_response_invalid'))
  }
  assert.equal(f.budget.status().attempts, 3)
})

test('délai et annulation : aucune génération après un comptage tardif', async t => {
  const f = fixture(t); let finish, calls = 0
  const p = provider(f.budget, () => { calls++; return new Promise(resolve => { finish = resolve }) }, { timeoutMs: 10 })
  await assert.rejects(p.respond(payload()), code('timeout'))
  finish(json({ object: 'response.input_tokens', input_tokens: 1000 })); await new Promise(r => setImmediate(r))
  assert.equal(calls, 1); assert.equal(f.budget.status().attempts, 1)
  const cancel = new AbortController(); cancel.abort()
  await assert.rejects(p.respond(payload(2), { signal: cancel.signal }), code('cancelled'))
  assert.equal(f.budget.status().attempts, 1)
})


test('question guidée transmise au modèle réel et contexte de suivi distinct du questionnaire',async t=>{
 const f=fixture(t),calls=[];
 const p=provider(f.budget,async(url,init)=>{calls.push(JSON.parse(init.body));return json(url.endsWith('/input_tokens')?{object:'response.input_tokens',input_tokens:1000}:response())},{guidedDraft:true});
 await p.respond({...payload(),questionField:'role'});
 const input=JSON.parse(calls.at(-1).input[0].content);
 assert.deepEqual(input.currentQuestion,{field:'role',text:'Quel est votre métier ou votre fonction ?'});
 calls.length=0;
 await p.respond({...payload(2),researchContext:{number:1,summary:'Cockpit RH',profile:{objective:'Cockpits'}}});
 const body=calls.at(-1),context=JSON.parse(body.input[0].content);
 assert.equal(context.researchContext.summary,'Cockpit RH');assert.equal(context.currentQuestion,undefined);
 assert.match(body.instructions,/rédiger un courriel complet/);assert.match(body.instructions,/changes doit rester vide/);
 assert.doesNotMatch(body.instructions,/Ne fournissez ni cours/);
 await assert.rejects(p.respond({...payload(3),questionField:'inventé'}),code('invalid_request'));
});

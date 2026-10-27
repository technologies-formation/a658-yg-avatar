// Aucun réseau réel : transport de dialogue et moteur injectés dans tous les tests.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDialogueBudget } from './dialogue-budget.mjs'
import { createOpenAIDialogueProvider } from './openai-dialogue.mjs'
import { createRealDialogueTrialSession } from './dialogue-session.mjs'
import { createRealSession } from './real-session.mjs'
import { readPrivatePilotLaunch } from './hosted-private-pilot.mjs'
import { HOSTED_ORIGIN } from './hosted-transport.mjs'
import { references, referenceResponse } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'

function directory(t, cleanup = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-unlimited-'))
  t.after(() => { cleanup(); rmSync(dir, { recursive: true, force: true }) })
  return dir
}
const hasCode = code => error => error.code === code

test('pilote : plus de cent réservations, tri numérique au redémarrage, dédoublonnage et retour au plafond sans effacer', t => {
  const dir = directory(t)
  let budget = createDialogueBudget({ directory: dir, singleInstance: true, unlimited: true })
  for (let n = 1; n <= 105; n++) budget.reserve('unlimited_request_' + n)
  assert.equal(budget.status().maxAttempts, null)
  assert.equal(budget.status().reservedMicroUsd, 1050000)
  const first = readFileSync(join(dir, 'attempt-01.json'), 'utf8')
  budget.close()
  budget = createDialogueBudget({ directory: dir, singleInstance: true, unlimited: true })
  assert.equal(budget.status().attempts, 105)
  assert.throws(() => budget.reserve('unlimited_request_1'), hasCode('duplicate_request'))
  budget.reserve('unlimited_request_106'); budget.close()
  budget = createDialogueBudget({ directory: dir, singleInstance: true })
  assert.equal(budget.status().attempts, 106)
  assert.throws(() => budget.reserve('unlimited_request_107'), hasCode('quota_exceeded'))
  assert.equal(readFileSync(join(dir, 'attempt-01.json'), 'utf8'), first)
  budget.close()
})

test('pilote : dialogue au-delà de dix tours et contexte borné, profil accepté conservé, aucun contournement implicite', async t => {
  let budget
  const dir = directory(t, () => budget?.close()), refs = references()
  budget = createDialogueBudget({ directory: dir, singleInstance: true, unlimited: true })
  let calls = 0, trimmed = false
  const provider = createOpenAIDialogueProvider({ enabled: true, paidTrialAuthorized: true, unlimited: true,
    apiKey: 'FAKE_ONLY', budget, fetchImpl: async (url, init) => {
      calls++
      if (url.endsWith('/input_tokens')) return Response.json({ object: 'response.input_tokens', input_tokens: 1000 })
      const input = JSON.parse(JSON.parse(init.body).input[0].content)
      assert.ok(input.messages.length <= 39)
      assert.ok(input.messages.reduce((sum, x) => sum + x.text.length, 0) < 10000)
      assert.equal(input.draft.profile.objective, 'Objectif déjà accepté')
      if (calls > 30 && !input.messages.some(x => x.id === 'unlimited_dialogue_1')) trimmed = true
      return Response.json({ status: 'completed', model: 'gpt-6-luna', usage: { input_tokens: 1000, output_tokens: 100 },
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ kind: 'ask', reply: 'Réponse de contrôle. '.repeat(50), changes: [] }) }] }] })
    } })
  assert.throws(() => createOpenAIDialogueProvider({ enabled: true, paidTrialAuthorized: true, apiKey: 'FAKE_ONLY', budget }), hasCode('configuration'))
  const session = createRealDialogueTrialSession({ enabled: true, paidTrialAuthorized: true, unlimited: true,
    provider, references: refs, initialProfile: { objective: 'Objectif déjà accepté' }, maxTurns: 10, timeoutMs: 1000, maxHistoryCharacters: 10000 })
  for (let n = 1; n <= 25; n++) await session.turn({ requestId: 'unlimited_dialogue_' + n,
    message: 'Message fictif. '.repeat(70), expectedRevision: 0, referenceRevision: refs.revision, paidTrialConfirmed: true })
  assert.equal(session.status().attemptedTurns, 25)
  assert.equal(session.status().maxTurns, null)
  assert.equal(budget.status().attempts, 25)
  assert.equal(calls, 50); assert.equal(trimmed, true)
  await assert.rejects(session.turn({ requestId: 'unlimited_dialogue_unconfirmed', message: 'Test sans confirmation', expectedRevision: 0, referenceRevision: refs.revision }), hasCode('unconfirmed'))
  assert.equal(calls, 50)
})

test('pilote : compteur réel déjà consommé poursuivi, rapports distincts et confirmation toujours requise', async t => {
  const dir = directory(t), refs = references(), stateFile = join(dir, 'quotas.json'), reportFile = join(dir, 'report.json')
  writeFileSync(stateFile, JSON.stringify({ day: Math.floor(Date.now() / 86400000), daily: 1, total: 1, stopped: false }), { mode: 0o600 })
  writeFileSync(reportFile, '{"previous":true}', { mode: 0o600 })
  let calls = 0
  const create = unlimited => createRealSession({ stateFile, reportFile, singleInstance: true, unlimited,
    fetchImpl: async (url) => {
      if (url.endsWith('/api/profile-references')) return referenceResponse(refs)
      calls++; return Response.json(data())
    } })
  let session = create(true)
  const profile = { personnelCategory: 'TEST-A', role: 'Assistant', objective: 'Organiser les tâches' }
  await assert.rejects(session.buildPathway(profile), hasCode('unconfirmed'))
  assert.equal(calls, 0)
  for (let n = 2; n <= 4; n++) await session.buildPathway(profile, { confirmed: true, referenceRevision: refs.revision, requestId: 'unlimited_pathway_' + n })
  assert.equal(session.status().total, 4); assert.equal(session.status().maxTotalRequests, null)
  assert.equal(calls, 3); assert.equal(readFileSync(reportFile, 'utf8'), '{"previous":true}')
  assert.equal(JSON.parse(readFileSync(join(dir, 'report-4.json'), 'utf8')).quota.total, 4)
  session = create(false)
  await assert.rejects(session.buildPathway(profile, { confirmed: true, referenceRevision: refs.revision, requestId: 'unlimited_pathway_refused' }), hasCode('quota_exceeded'))
  assert.equal(session.status().total, 4); assert.equal(calls, 3)
})

test('pilote : activation de lancement explicite avant clé, compteurs et configuration jamais réinitialisés', t => {
  const root = directory(t), site = join(root, 'site'), dir = join(root, 'private'), counter = join(dir, 'review')
  mkdirSync(site); mkdirSync(dir, { mode: 0o700 }); mkdirSync(counter, { mode: 0o700 }); mkdirSync(join(dir, 'dialogue-budget'), { mode: 0o700 })
  const config = { publicOrigin: HOSTED_ORIGIN, port: 3000, privateDirectory: dir, interface: 'dialogue-real-trial', proxyVerification: 'self-https',
    dialogueTrial: { enabled: true, paidTrialAuthorized: true, billingReviewed: true, model: 'gpt-6-luna' }, pathwayTrial: { enabled: true, paidTrialAuthorized: true } }
  for (const [name, value] of [['config.json', config], ['users.json', []], ['preview.json', data()], ['references.json', references()]])
    writeFileSync(join(dir, name), JSON.stringify(value), { mode: 0o600 })
  writeFileSync(join(counter, 'quotas.json'), '{"day":20753,"daily":1,"total":1,"stopped":false}', { mode: 0o600 })
  writeFileSync(join(counter, 'report.json'), '{}', { mode: 0o600 })
  const file = join(dir, 'config.json'), before = readFileSync(file, 'utf8'), quota = readFileSync(join(counter, 'quotas.json'), 'utf8')
  assert.throws(() => readPrivatePilotLaunch(file, site, { get AVATAR_DIALOGUE_OPENAI_API_KEY() { throw Error('ne pas lire') } }, counter), /Activation/)
  const env = { AVATAR_PRIVATE_UNLIMITED_ENABLED: 'true', AVATAR_DIALOGUE_TRIAL_ENABLED: 'true', AVATAR_PATHWAY_TRIAL_ENABLED: 'true', AVATAR_DIALOGUE_OPENAI_API_KEY: 'FAKE_ONLY' }
  const options = readPrivatePilotLaunch(file, site, env, counter)
  assert.equal(options.unlimited, true); assert.equal(options.pathwayStateFile, join(counter, 'quotas.json'))
  assert.equal(options.validationAuthorized, false); assert.equal(options.pathwayTrial.series, undefined)
  assert.throws(() => readPrivatePilotLaunch(file, site, env, site), /privé/)
  assert.equal(readFileSync(file, 'utf8'), before)
  assert.equal(readFileSync(join(counter, 'quotas.json'), 'utf8'), quota)
})

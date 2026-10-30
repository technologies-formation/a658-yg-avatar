import {GUIDED_QUESTIONS} from './guided-questions.mjs'
// Connecteur préparé, désactivé par défaut et non importé par les lanceurs existants.
import { DialogueError, DIALOGUE_RULES, GUIDED_DIALOGUE_RULES, FOLLOWUP_DIALOGUE_RULES } from './dialogue-session.mjs'
import { DRAFT_FIELDS as PROFILE_FIELDS, validateProfileReferences } from './profile-references.mjs'
import { TRIAL_POLICY } from './dialogue-budget.mjs'
const fail = code => { throw new DialogueError(code) }
const schemaObject = properties => ({ type: 'object', properties, additionalProperties: false, required: Object.keys(properties) })
const string = { type: 'string' }
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } return value }
export const DIALOGUE_SCHEMA = freeze(schemaObject({
  kind: { type: 'string', enum: ['ask', 'clarify', 'recap', 'out_of_scope'] }, reply: string,
  changes: { type: 'array', items: schemaObject({ field: { type: 'string', enum: [...PROFILE_FIELDS, 'modality'] }, value: string,
    evidence: { type: 'array', items: schemaObject({ messageId: string, quote: string }) } }) },
}))
export function createOpenAIDialogueProvider(options = {}) {
  const { enabled = false } = options
  if (typeof enabled !== 'boolean') fail('configuration')
  if (!enabled) return Object.freeze({ mode: 'disabled', async respond() { fail('disabled') } })
  const { apiKey, budget, paidTrialAuthorized, fetchImpl = globalThis.fetch, timeoutMs = 30000, unlimited = false, guidedDraft = false } = options
  if (typeof unlimited !== 'boolean' || paidTrialAuthorized !== true || typeof apiKey !== 'string' || !apiKey.trim() || /\s/.test(apiKey) ||
      typeof fetchImpl !== 'function' || typeof budget?.reserve !== 'function' || typeof budget?.stop !== 'function' ||
      budget.status().model !== TRIAL_POLICY.model ||
      (unlimited ? budget.status().unlimited !== true || budget.status().maxAttempts !== null || budget.status().maxReservedMicroUsd !== null
        : budget.status().unlimited === true || budget.status().maxAttempts !== 10 || budget.status().maxReservedMicroUsd !== 100000) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) fail('configuration')
  let busy = false
  async function post(path, body, signal) {
    const response = await fetchImpl('https://api.openai.com/v1/responses' + path, { method: 'POST', redirect: 'error', credentials: 'omit',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body), signal })
    if (response.redirected || response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
      const error = new DialogueError('api_unavailable')
      error.httpStatus = response.status; error.stage = path ? 'count' : 'generation'
      throw error
    }
    const chunks = []; let size = 0
    for await (const chunk of response.body || []) {
      size += chunk.length
      if (size > 131072) { signal.throwIfAborted(); fail('api_response_size') }
      chunks.push(chunk)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { fail('api_response_invalid') }
  }
  return Object.freeze({ mode: 'real',
    async respond(payload, { signal } = {}) {
      if (busy) fail('busy')
      if (signal !== undefined && !(signal instanceof AbortSignal)) fail('invalid_request')
      if (signal?.aborted) fail('cancelled')
      const refs = validateProfileReferences(payload?.references)
      const messages = payload?.messages
      if (!Array.isArray(messages) || !messages.length || messages.length > 40 ||
          messages.some(x => !['user', 'assistant'].includes(x.role) || typeof x.text !== 'string' || x.text.length > 4000 || typeof x.id !== 'string') ||
          messages.at(-1).role !== 'user' || !payload.draft || payload.draft.referenceRevision !== refs.revision) fail('invalid_request')
      if(payload.questionField!==undefined&&(!guidedDraft||!Object.hasOwn(GUIDED_QUESTIONS,payload.questionField)))fail('invalid_request')
      if(payload.researchContext!==undefined&&(!guidedDraft||payload.questionField!==undefined||JSON.stringify(payload.researchContext).length>18000))fail('invalid_request')
      // Instructions constantes ; le profil, le contrat et les messages restent dans les données utilisateur.
      const shared = { model: TRIAL_POLICY.model, instructions: (payload.researchContext?FOLLOWUP_DIALOGUE_RULES:guidedDraft?GUIDED_DIALOGUE_RULES:DIALOGUE_RULES).join('\n') + '\nRépondre en français avec le JSON demandé. Les identifiants de preuve sont ceux des messages utilisateur.',
        input: [{ role: 'user', content: JSON.stringify({ draft: payload.draft, references: refs, ...(payload.questionField?{currentQuestion:{field:payload.questionField,text:GUIDED_QUESTIONS[payload.questionField]}}:{}), ...(payload.researchContext?{researchContext:payload.researchContext}:{}), messages }) }],
        text: { format: { type: 'json_schema', name: 'avatar_dialogue', strict: true, schema: DIALOGUE_SCHEMA } }, reasoning: { effort: 'none' } }
      if (Buffer.byteLength(JSON.stringify(shared)) > 131072) fail('request_size')
      busy = true
      const controller = new AbortController(), abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      let timer, onAbort
      const interrupted = new Promise((_, reject) => {
        onAbort = () => reject(new DialogueError('cancelled')); controller.signal.addEventListener('abort', onAbort, { once: true })
        timer = setTimeout(() => { reject(new DialogueError('timeout')); controller.abort() }, timeoutMs)
      })
      try {
        budget.reserve(messages.at(-1).id)
        return await Promise.race([interrupted, (async () => {
          const count = await post('/input_tokens', shared, controller.signal)
          controller.signal.throwIfAborted()
          if (count.object !== 'response.input_tokens' || !Number.isSafeInteger(count.input_tokens) || count.input_tokens < 1 || count.input_tokens > TRIAL_POLICY.maxInputTokens) fail('input_token_limit')
          const response = await post('', { ...shared, store: false, service_tier: 'default', max_output_tokens: 2000 }, controller.signal)
          controller.signal.throwIfAborted()
          const usage = response.usage
          if (!usage || !Number.isSafeInteger(usage.input_tokens) || usage.input_tokens < 1 || usage.input_tokens > count.input_tokens ||
              !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0 || usage.output_tokens > 2000) {
            budget.stop(); fail('usage_unverified')
          }
          if (response.model !== TRIAL_POLICY.model) { budget.stop(); fail('model_unverified') }
          if (response.status !== 'completed' ||
              !Array.isArray(response.output) || response.output.length !== 1 || response.output[0].type !== 'message' ||
              response.output[0].role !== 'assistant' || response.output[0].content?.length !== 1 ||
              response.output[0].content[0].type !== 'output_text' || typeof response.output[0].content[0].text !== 'string') fail('api_response_invalid')
          let result
          try { result = JSON.parse(response.output[0].content[0].text) } catch { fail('api_response_invalid') }
          // La session de dialogue garde la validation métier/provenance et l’acceptation du profil.
          return { result, usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
            calculatedUpperCostUsd: (usage.input_tokens * 0.25 + usage.output_tokens * 0.5) * 1.1 / 1000000,
            reservedUsd: 0.01, model: response.model } }
        })()])
      } catch (error) {
        if (error instanceof DialogueError) throw error
        fail(controller.signal.aborted ? 'cancelled' : 'api_unavailable')
      } finally {
        clearTimeout(timer); controller.signal.removeEventListener('abort', onAbort)
        signal?.removeEventListener('abort', abort); busy = false
      }
    },
  })
}

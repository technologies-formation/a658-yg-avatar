// Un seul appel de génération. Aucun comptage distant, outil ou relance.
import {DialogueError,GUIDED_DIALOGUE_RULES} from './dialogue-session.mjs'
import {validateProfileReferences} from './profile-references.mjs'
import {DIALOGUE_SCHEMA} from './openai-dialogue.mjs'
import {PUBLIC_COST_POLICY,publicCostUpper,requirePublicCostPolicy} from './public-cost-policy.mjs'
const fail=code=>{throw new DialogueError(code)}
export function createPublicOpenAIDialogueProvider(options={}){
 if(options.enabled!==true)return {mode:'disabled',async respond(){fail('disabled')}}
 const {apiKey,budget,fetchImpl=globalThis.fetch,timeoutMs=30000,now=Date.now}=options,rule=PUBLIC_COST_POLICY.dialogue
 if(options.paidTrialAuthorized!==true||typeof apiKey!=='string'||!apiKey.trim()||/\s/.test(apiKey)||typeof budget?.reserve!=='function'||typeof budget?.stop!=='function'||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)fail('configuration')
 let busy=false
 return {mode:'real',async respond(payload,{signal}={}){
  if(busy)fail('busy');if(signal?.aborted)fail('cancelled');requirePublicCostPolicy(now())
  const references=validateProfileReferences(payload?.references),messages=payload?.messages
  if(!Array.isArray(messages)||!messages.length||messages.length>40||messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.text!=='string'||m.text.length>4000||typeof m.id!=='string')||messages.at(-1).role!=='user'||payload.draft?.referenceRevision!==references.revision)fail('invalid_request')
  const body={model:rule.model,instructions:GUIDED_DIALOGUE_RULES.join('\n')+'\nRépondre en français avec le JSON demandé. Les identifiants de preuve sont ceux des messages utilisateur.',
   input:[{role:'user',content:JSON.stringify({draft:payload.draft,references,messages})}],text:{format:{type:'json_schema',name:'avatar_dialogue',strict:true,schema:DIALOGUE_SCHEMA}},
   reasoning:{effort:'none'},store:false,service_tier:'default',prompt_cache_options:{mode:'implicit',ttl:'30m'},max_output_tokens:rule.maxOutputTokens}
  if(Buffer.byteLength(JSON.stringify(body))>131072)fail('request_size')
  busy=true
  try{
   budget.reserve(messages.at(-1).id)
   const combined=AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(timeoutMs)])
   const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',credentials:'omit',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:combined})
   if(response.status!==200||response.redirected||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))fail('api_unavailable')
   const chunks=[];let bytes=0
   for await(const chunk of response.body??[]){bytes+=chunk.length;if(bytes>131072)fail('api_response_size');chunks.push(chunk)}
   let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail('api_response_invalid')}
   combined.throwIfAborted()
   if(value.model!==rule.model||value.service_tier!=='default'){budget.stop();fail('model_unverified')}
   let upper
   try{upper=publicCostUpper('dialogue',value.usage?.input_tokens,value.usage?.output_tokens)}catch{budget.stop();fail('usage_unverified')}
   if(upper>rule.reserveMicroUsd){budget.stop();fail('usage_unverified')}
   if(value.status!=='completed'||value.output?.length!==1||value.output[0].type!=='message'||value.output[0].role!=='assistant'||value.output[0].content?.length!==1||value.output[0].content[0].type!=='output_text')fail('api_response_invalid')
   let result;try{result=JSON.parse(value.output[0].content[0].text)}catch{fail('api_response_invalid')}
   return {result,usage:{inputTokens:value.usage.input_tokens,outputTokens:value.usage.output_tokens,calculatedUpperCostUsd:upper/1e6,reservedUsd:rule.reserveMicroUsd/1e6,model:rule.model}}
  }catch(error){if(error instanceof DialogueError)throw error;fail(signal?.aborted?'cancelled':error.name==='TimeoutError'?'timeout':'api_unavailable')}
  finally{busy=false}
 }}
}

import test from 'node:test'
import assert from 'node:assert/strict'
import {createPublicOpenAIDialogueProvider} from './public-openai-dialogue.mjs'
import {PUBLIC_COST_POLICY} from './public-cost-policy.mjs'
import {references} from './reference-test-fixtures.mjs'
const now=()=>Date.parse('2026-10-28T12:00:00Z'),refs=references(),payload={references:refs,draft:{referenceRevision:refs.revision},messages:[{id:'public_dialogue_0001',role:'user',text:'Un objectif fictif'}]}
function fixture(changes={}){
 let count=0,stopped=false;const requests=[],budget={reserve(){if(stopped)throw Error('stopped');count++},stop(){stopped=true}}
 const provider=createPublicOpenAIDialogueProvider({enabled:true,paidTrialAuthorized:true,apiKey:'SYNTHETIC_KEY',budget,now,fetchImpl:async(url,init)=>{
  requests.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({model:'gpt-6-luna',service_tier:'default',status:'completed',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({kind:'ask',reply:'Quel objectif ?',changes:[]})}]}],...changes}),{headers:{'Content-Type':'application/json'}})
 }})
 return {provider,requests,count:()=>count,stopped:()=>stopped}
}
test('public : une génération seulement, Standard et cache 30m imposés, usage majoré sous la réservation',async()=>{
 const f=fixture(),value=await f.provider.respond(payload)
 assert.equal(f.count(),1);assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'https://api.openai.com/v1/responses')
 const b=f.requests[0].body;assert.equal(b.service_tier,'default');assert.equal(b.prompt_cache_options.ttl,'30m');assert.equal(b.max_output_tokens,2000);assert.equal(b.store,false);assert.equal(b.tools,undefined)
 assert.deepEqual(value.usage,{inputTokens:1000,outputTokens:100,calculatedUpperCostUsd:0.000358,reservedUsd:0.3,model:'gpt-6-luna'})
})
test('réponse au contexte maximal, autre modèle, autre niveau de service ou usage manquant',async()=>{
 const f=fixture({usage:{input_tokens:1050000,output_tokens:2000}});assert.equal((await f.provider.respond(payload)).usage.calculatedUpperCostUsd,0.2904)
 for(const changes of [{model:'other'},{service_tier:'priority'},{usage:{}},{usage:{input_tokens:1050001,output_tokens:1}}]){
  const f=fixture(changes);await assert.rejects(f.provider.respond(payload));assert.equal(f.requests.length,1);assert.equal(f.stopped(),true)
 }
})
test('public désactivé, requête trop grosse ou politique expirée : aucun départ réseau',async()=>{
 const off=createPublicOpenAIDialogueProvider({get apiKey(){throw Error('do not read')}});assert.equal(off.mode,'disabled')
 const f=fixture();await assert.rejects(f.provider.respond({...payload,messages:[{...payload.messages[0],text:'x'.repeat(4001)}]}));assert.equal(f.requests.length,0)
 let calls=0;const expired=createPublicOpenAIDialogueProvider({enabled:true,paidTrialAuthorized:true,apiKey:'SYNTHETIC_KEY',budget:{reserve(){calls++},stop(){}},now:()=>Date.parse(PUBLIC_COST_POLICY.validUntil),fetchImpl:async()=>{calls++}})
 await assert.rejects(expired.respond(payload));assert.equal(calls,0)
})

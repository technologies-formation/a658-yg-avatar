import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRealDialogueTrialInterface } from './dialogue-real-trial.mjs'
import { createRealDialogueTrialSession, createDialogueSession } from './dialogue-session.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { references } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'
const origin='https://dialogue-real-test.invalid',refs=references(),password='TEST_PASSWORD_ONLY'
const text='Je voudrais mieux organiser mes tâches.',id='real_dialogue_request_0001'
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
async function fixture(t,{invalid=false,httpError=false,resume=false}={}) {
 const dir=mkdtempSync(join(tmpdir(),'avatar-real-wiring-')),budgetDirectory=join(dir,'budget');mkdirSync(budgetDirectory,{mode:0o700})
 const users=await Promise.all(['alice','bob'].map(id=>createPilotCredential({id,username:id,password})))
 let calls=0
 const options={enabled:true,paidTrialAuthorized:true,apiKey:'FAKE_KEY_ONLY',budgetDirectory,publicOrigin:origin,users,
  ...(resume?{resumeDirectory:join(dir,'resume')}:{}),stateFile:join(dir,'quotas.json'),loadProfileReferences:()=>refs,preview:data(),isSecureRequest:req=>req.headers['x-test-secure']==='true',
  fetchImpl:async(url,init)=>{
   calls++
   if(url.endsWith('/input_tokens'))return json({object:'response.input_tokens',input_tokens:1000})
   if(httpError)return new Response('DO_NOT_EXPOSE_TEST_SECRET_OR_BODY',{status:429,headers:{'Content-Type':'application/json'}})
   const input=JSON.parse(JSON.parse(init.body).input[0].content),last=input.messages.at(-1)
   return json({status:'completed',model:'gpt-6-luna',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({kind:'ask',reply:'Quel est votre métier ?',changes:[{field:'objective',value:'Mieux organiser les tâches',evidence:[{messageId:last.id,quote:invalid?'Preuve inventée':last.text}]}]})}]}]})
  }}
 let service=createRealDialogueTrialInterface(options)
 const server=http.createServer((req,res)=>service.handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 t.after(async()=>{service.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})})
 const request=(path,{body,auth=true,source=origin,secure=true,user='alice'}={})=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:server.address().port,path,method:body?'POST':'GET',headers:{host:new URL(origin).host,
   'content-type':'application/json','x-test-secure':String(secure),...(source?{origin:source}:{}),...(auth?{authorization:'Basic '+Buffer.from(user+':'+password).toString('base64')}:{})}},res=>{
   let text='';res.on('data',x=>text+=x);res.on('end',()=>{let value;try{value=JSON.parse(text)}catch{}resolve({status:res.statusCode,text,value})})})
  req.on('error',reject);req.end(body?JSON.stringify(body):undefined)
 })
 return {request,get service(){return service},get calls(){return calls},reopen(){service.close();service=createRealDialogueTrialInterface(options)}}
}
const turn=(n=1,revision=0)=>({action:'turn',paidTrialConfirmed:true,requestId:n===1?id:'real_dialogue_request_'+String(n).padStart(4,'0'),message:text,expectedRevision:revision,referenceRevision:refs.revision})
test('assemblage réel désactivé par défaut sans lire clé, dossier, autorisation ni réseau',()=>{
 const disabled=createRealDialogueTrialInterface({get apiKey(){throw Error('clé')},get budgetDirectory(){throw Error('dossier')},get paidTrialAuthorized(){throw Error('autorisation')}})
 assert.equal(typeof disabled.handler,'function')
 assert.throws(()=>createRealDialogueTrialInterface({enabled:true,get apiKey(){throw Error('ne pas lire')}}),e=>e.code==='configuration')
 assert.throws(()=>createDialogueSession({enabled:true,provider:{mode:'real',respond(){}},references:refs,maxTurns:10,timeoutMs:1000}),e=>e.code==='configuration')
 assert.throws(()=>createRealDialogueTrialSession({enabled:true}),e=>e.code==='configuration')
})
test('authentification, HTTPS et origine refusent avant tout transport ; aucune clé ou ressource serveur dans la page',async t=>{
 const f=await fixture(t)
 for(const options of [{auth:false},{secure:false},{source:'https://other.invalid'}])assert.notEqual((await f.request('/private/dialogue',{...options,body:turn()})).status,200)
 assert.equal((await f.request('/private/dialogue',{source:'',body:turn()})).status,403)
 const page=await f.request('/private/');assert.match(page.text,/"dialogue":"real-trial"/);assert.doesNotMatch(page.text,/FAKE_KEY_ONLY/)
 assert.equal((await f.request('/private/dialogue-real-trial.mjs')).status,404)
 assert.equal((await f.request('/private/openai-dialogue.mjs')).status,404)
 assert.equal((await f.request('/private/dialogue',{body:{...turn(),paidTrialConfirmed:false}})).value.code,'unconfirmed')
 assert.equal(f.calls,0);assert.equal(f.service.budgetStatus().attempts,0)
})
test('sortie du connecteur validée, usage conservé, correction explicitement acceptée, parcours encore simulé',async t=>{
 const f=await fixture(t),result=await f.request('/private/dialogue',{body:turn()})
 assert.equal(result.status,200);assert.equal(result.value.mode,'real');assert.equal(result.value.pathwayMode,'simulation')
 assert.deepEqual(result.value.draft.profile,{});assert.equal(result.value.usageRecords.length,1);assert.equal(result.value.usage.inputTokens,1000)
 assert.equal(f.calls,2);assert.equal(f.service.status().total,0)
 assert.deepEqual((await f.request('/private/dialogue',{user:'bob'})).value.usageRecords,[])
 assert.equal((await f.request('/private/dialogue',{body:{action:'accept',proposalId:id,expectedRevision:0}})).status,400)
 const accepted=await f.request('/private/dialogue',{body:{action:'accept',proposalId:id,expectedRevision:0,confirmed:true}})
 assert.equal(accepted.value.draft.profile.objective,'Mieux organiser les tâches');assert.equal(f.calls,2)
 const profile={...accepted.value.draft.profile,personnelCategory:'TEST-A',role:'Assistant',existingSkills:'Je débute',timeAvailable:'1 à 2 jours'}
 await f.request('/private/dialogue',{body:{action:'edit',profile,modality:'En ligne',expectedRevision:1}})
 const ticket=(await f.request('/private/profile-references')).value
 const p=await f.request('/private/pathway',{body:{confirmed:true,profile:{...profile,constraints:'Modalité souhaitée : en ligne'},requestId:ticket.requestId,referenceRevision:refs.revision}})
 assert.equal(p.status,200);assert.equal(p.value.mode,'simulation');assert.equal(f.calls,2)
})
test('preuve invalide refusée sans perte du coût vérifié ni remboursement de tentative',async t=>{
 const f=await fixture(t,{invalid:true}),failure=(await f.request('/private/dialogue',{body:turn()})).value;assert.equal(failure.code,'invalid_response');assert.equal(failure.validation,'evidence');assert.doesNotMatch(JSON.stringify(failure),/Preuve inventée|FAKE_KEY_ONLY/)
 const state=(await f.request('/private/dialogue')).value
 assert.deepEqual(state.draft.profile,{});assert.equal(state.proposal,null);assert.equal(state.usageRecords.length,1);assert.equal(state.budget.attempts,1)
 assert.equal((await f.request('/private/dialogue',{body:turn()})).value.code,'duplicate_request');assert.equal(f.calls,2)
})
test('budget commun aux identités et conservé au redémarrage ; ni édition ni refus ne le réinitialisent',async t=>{
 const f=await fixture(t)
 for(let n=1;n<=5;n++)assert.equal((await f.request('/private/dialogue',{body:turn(n)})).status,200)
 f.reopen()
 for(let n=6;n<=10;n++)assert.equal((await f.request('/private/dialogue',{user:'bob',body:turn(n)})).status,200)
 const state=(await f.request('/private/dialogue')).value
 assert.equal(state.budget.attempts,10);assert.equal(state.budget.reservedMicroUsd,100000)
 assert.equal((await f.request('/private/dialogue',{body:turn(11)})).value.code,'quota_exceeded')
 assert.equal(f.calls,20)
})

test('session réelle : confirmation avant fournisseur et refus des usages invérifiables',async()=>{
 let calls=0
 const options={enabled:true,paidTrialAuthorized:true,references:refs,maxTurns:10,timeoutMs:1000,provider:{mode:'real',async respond(){calls++;return {result:{kind:'ask',reply:'Quel est votre métier ?',changes:[]},usage:{inputTokens:1000,outputTokens:100,reservedUsd:0.01,model:'autre-modele',calculatedUpperCostUsd:0.001}}}}}
 const session=createRealDialogueTrialSession(options)
 const body={requestId:id,message:text,expectedRevision:0,referenceRevision:refs.revision}
 await assert.rejects(session.turn(body),e=>e.code==='unconfirmed');assert.equal(calls,0)
 await assert.rejects(session.turn({...body,paidTrialConfirmed:true}),e=>e.code==='usage_unverified')
 assert.deepEqual(session.getDraft().profile,{});assert.equal(session.getProposal(),null);assert.deepEqual(session.getUsage(),[])
})

test('annulation réelle : aucune proposition tardive et aucune relance',async()=>{
 let finish,calls=0
 const session=createRealDialogueTrialSession({enabled:true,paidTrialAuthorized:true,references:refs,maxTurns:10,timeoutMs:1000,
  provider:{mode:'real',respond(){calls++;return new Promise(resolve=>{finish=resolve})}}})
 const abort=new AbortController(),pending=session.turn({requestId:id,message:text,expectedRevision:0,referenceRevision:refs.revision,paidTrialConfirmed:true,signal:abort.signal})
 await Promise.resolve();abort.abort();await assert.rejects(pending,e=>e.code==='cancelled')
 finish({result:{kind:'ask',reply:'Réponse tardive',changes:[]},usage:{inputTokens:1000,outputTokens:100,model:'gpt-6-luna',reservedUsd:0.01,calculatedUpperCostUsd:0.001}})
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.equal(session.getProposal(),null);assert.deepEqual(session.getDraft().profile,{})
})


test('échec API : code, étape et budget immédiats, diagnostic conservé pour le seul compte concerné',async t=>{
 const f=await fixture(t,{httpError:true})
 const result=await f.request('/private/dialogue',{body:turn()})
 assert.equal(result.value.code,'api_unavailable');assert.equal(result.value.httpStatus,429);assert.equal(result.value.stage,'generation')
 assert.equal(result.value.budget.attempts,1);assert.deepEqual(result.value.usageRecords,[])
 assert.doesNotMatch(result.text,/DO_NOT_EXPOSE_TEST_SECRET_OR_BODY|FAKE_KEY_ONLY/)
 assert.equal(f.calls,2)
 const state=(await f.request('/private/dialogue')).value
 assert.equal(state.lastError.code,'api_unavailable');assert.equal(state.lastError.httpStatus,429);assert.equal(state.budget.attempts,1)
 assert.equal((await f.request('/private/dialogue',{user:'bob'})).value.lastError,null);assert.equal(f.calls,2)
})


test('reprise du dialogue : seules les corrections acceptées sont conservées, sans messages bruts ni réinitialisation du budget',async t=>{
 const f=await fixture(t,{resume:true})
 assert.equal((await f.request('/private/dialogue',{body:turn()})).status,200)
 f.reopen();let state=(await f.request('/private/dialogue')).value
 assert.deepEqual(state.draft.profile,{});assert.equal(state.proposal,null);assert.deepEqual(state.usageRecords,[]);assert.equal(state.budget.attempts,1)
 const second=await f.request('/private/dialogue',{body:turn(2)})
 const accepted=await f.request('/private/dialogue',{body:{action:'accept',proposalId:second.value.proposal.id,expectedRevision:0,confirmed:true}})
 assert.equal(accepted.value.resumeSaved,true)
 f.reopen();state=(await f.request('/private/dialogue')).value
 assert.equal(state.draft.profile.objective,'Mieux organiser les tâches');assert.equal(state.proposal,null);assert.deepEqual(state.usageRecords,[]);assert.equal(state.budget.attempts,2);assert.equal(f.calls,4)
})

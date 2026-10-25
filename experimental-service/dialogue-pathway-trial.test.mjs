// Intégration de bout en bout avec deux transports fictifs ; aucune requête externe.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRealDialogueTrialInterface} from './dialogue-real-trial.mjs'
import {createPilotCredential} from './pilot-auth.mjs'
import {references} from './reference-test-fixtures.mjs'
import {data} from './result-test-fixtures.mjs'
const origin='https://dialogue-pathway.invalid',refs=references(),password='FAKE_TEST_PASSWORD_ONLY'
const profile={personnelCategory:'TEST-A',role:'Assistant',objective:'Organiser mes tâches',existingSkills:'Je débute',timeAvailable:'1 à 2 jours'}
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}})
async function fixture(t,{failure=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'avatar-pathway-wiring-')),budgetDirectory=join(dir,'budget');mkdirSync(budgetDirectory,{mode:0o700})
 const users=await Promise.all(['alice','bob'].map(id=>createPilotCredential({id,username:id,password})))
 const calls=[],result=data();let dialogueCalls=0
 const options={enabled:true,paidTrialAuthorized:true,apiKey:'FAKE_KEY_ONLY',budgetDirectory,publicOrigin:origin,users,
  stateFile:join(dir,'simulation-quotas.json'),isSecureRequest:req=>req.headers['x-test-secure']==='true',
  fetchImpl:async()=>{dialogueCalls++;throw Error('Aucun appel de dialogue attendu')},
  pathwayTrial:{enabled:true,paidTrialAuthorized:true,stateFile:join(dir,'real-quotas.json'),reportFile:join(dir,'real-report.json'),fetchImpl:async(url,init)=>{
   calls.push({url,method:init?.method||'GET',body:init?.body&&JSON.parse(init.body)})
   assert.ok(url.startsWith('https://api.a658yg-catalogue.ch/'))
   if(url.endsWith('/api/profile-references'))return new Response(JSON.stringify(refs),{headers:{'Content-Type':'application/json',ETag:'"'+refs.revision+'"'}})
   if(failure)return new Response('{}',{status:503,headers:{'Content-Type':'application/json'}})
   assert.equal(url,'https://api.a658yg-catalogue.ch/api/pathway');return json(result)
  }}}
 let service=createRealDialogueTrialInterface(options)
 const server=http.createServer((req,res)=>service.handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r))
 t.after(async()=>{service.close();server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})})
 const request=(path,{body,user='alice',secure=true,source=origin,auth=true}={})=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:server.address().port,path,method:body?'POST':'GET',headers:{host:new URL(origin).host,origin:source,'content-type':'application/json','x-test-secure':String(secure),...(auth?{authorization:'Basic '+Buffer.from(user+':'+password).toString('base64')}:{})}},res=>{
   let text='';res.on('data',x=>text+=x);res.on('end',()=>{let value;try{value=JSON.parse(text)}catch{}resolve({status:res.statusCode,text,value})})
  });req.on('error',reject);req.end(body&&JSON.stringify(body))
 })
 const edit=async(user='alice')=>request('/private/dialogue',{user,body:{action:'edit',profile,modality:'En ligne',expectedRevision:0}})
 const ticket=async(user='alice')=>(await request('/private/profile-references',{user})).value
 const build=(ticket,overrides={})=>request('/private/pathway',{body:{confirmed:true,profile:{...profile,constraints:'Modalité souhaitée : en ligne'},requestId:ticket.requestId,referenceRevision:refs.revision,...overrides}})
 return {request,edit,ticket,build,calls,result,dir,get service(){return service},get dialogueCalls(){return dialogueCalls},reopen(){service.close();service=createRealDialogueTrialInterface(options)}}
}
test('parcours réel : mode explicite, profil accepté exact, une tentative globale, rapport sans profil et budget dialogue conservé',async t=>{
 const f=await fixture(t)
 const page=await f.request('/private/');assert.match(page.text,/"mode":"real"/);assert.match(page.text,/un parcours réel maximum/);assert.doesNotMatch(page.text,/FAKE_KEY_ONLY/)
 assert.equal(f.calls.filter(x=>x.method==='POST').length,0)
 const state=(await f.request('/private/dialogue')).value;assert.equal(state.pathwayMode,'real');assert.equal(state.budget.attempts,0);assert.equal(state.pathwayQuota.total,0);assert.equal(state.pathwayQuota.maxTotalRequests,1)
 await f.edit();const ticket=await f.ticket()
 assert.equal((await f.build(ticket,{profile:{...profile,objective:'Profil falsifié'}})).status,409)
 assert.equal(f.calls.filter(x=>x.method==='POST').length,0)
 const good=await f.ticket(),response=await f.build(good)
 assert.equal(response.status,200);assert.equal(response.value.mode,'real');assert.deepEqual(response.value.result,f.result);assert.equal(response.value.quota.total,1)
 const sent=f.calls.find(x=>x.method==='POST').body;assert.equal(sent.constraints,'Modalité souhaitée : en ligne');assert.equal(sent.timeAvailable,'1 à 2 jours');assert.equal(sent.objective,profile.objective)
 assert.equal((await f.build(good)).status,409);assert.equal(f.calls.filter(x=>x.method==='POST').length,1)
 const report=JSON.parse(readFileSync(join(f.dir,'real-report.json')));assert.deepEqual(report.courseCodes.recommendedSteps,['TEST-1']);assert.equal(report.profile,undefined)
 f.reopen();await f.edit('bob');const bob=await f.ticket('bob')
 const denied=await f.request('/private/pathway',{user:'bob',body:{confirmed:true,profile:{...profile,constraints:'Modalité souhaitée : en ligne'},requestId:bob.requestId,referenceRevision:refs.revision}})
 assert.equal(denied.status,429);assert.equal(f.calls.filter(x=>x.method==='POST').length,1)
 const restored=(await f.request('/private/dialogue')).value;assert.equal(restored.budget.attempts,0);assert.equal(restored.pathwayQuota.total,1);assert.equal(restored.pathwayQuota.maxTotalRequests,1);assert.equal(f.dialogueCalls,0)
})
test('parcours réel : authentification, origine, HTTPS et confirmation protègent le moteur',async t=>{
 const f=await fixture(t)
 for(const options of [{auth:false},{secure:false},{source:'https://other.invalid'}])assert.notEqual((await f.request('/private/',options)).status,200)
 assert.equal(f.calls.length,0)
 await f.edit();const ticket=await f.ticket()
 assert.equal((await f.build(ticket,{confirmed:false})).status,400)
 assert.equal(f.calls.filter(x=>x.method==='POST').length,0)
 assert.equal((await f.build(ticket)).status,200)
})
test('parcours réel : erreur moteur réserve la tentative durablement, aucune relance à la lecture ou au redémarrage',async t=>{
 const f=await fixture(t,{failure:true});await f.edit()
 const failed=await f.build(await f.ticket());assert.equal(failed.status,502);assert.equal(failed.value.quota.total,1)
 assert.equal(f.service.status().total,1)
 await f.request('/private/dialogue');await f.request('/private/');f.reopen();await f.edit()
 assert.equal((await f.build(await f.ticket())).status,429)
 assert.equal(f.calls.filter(x=>x.method==='POST').length,1);assert.equal(f.dialogueCalls,0)
})

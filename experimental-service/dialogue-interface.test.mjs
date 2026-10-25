import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDialogueSimulationInterface } from './dialogue-interface.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { references } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'
const origin = 'https://dialogue-test.invalid'
const r = references()
const profile = { personnelCategory: 'TEST-A', role: 'Assistant', objective: 'Organiser les tâches de test', existingSkills: 'Je débute', timeAvailable: '1 à 2 jours' }
async function fixture(t,{resume=false}={}) {
 const dir = mkdtempSync(join(tmpdir(),'avatar-dialogue-interface-')), password = 'TEST_LOCAL_PASSWORD_ONLY'
 const users = await Promise.all(['alice','bob'].map(id=>createPilotCredential({id,username:id,password})))
 const options = { enabled:true, publicOrigin:origin, users, stateFile:join(dir,'quotas.json'),
  isSecureRequest:req=>req.headers['x-test-secure']==='true', loadProfileReferences:()=>r, preview:data(),...(resume?{resumeDirectory:join(dir,'resume')}:{}) };let service=createDialogueSimulationInterface(options)
 const server = http.createServer((req,res)=>service.handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})})
 const request = (path,{body,user='alice',auth=true,source=origin,secure=true,raw}={})=>new Promise((resolve,reject)=>{
  const req = http.request({host:'127.0.0.1',port:server.address().port,path,method:body||raw?'POST':'GET',headers:{host:new URL(origin).host,
   ...(source?{origin:source}:{}),'content-type':'application/json','x-test-secure':String(secure),...(auth?{authorization:'Basic '+Buffer.from(user+':'+password).toString('base64')}:{})}},res=>{
   let text='';res.on('data',x=>text+=x);res.on('end',()=>{let value;try{value=JSON.parse(text)}catch{}resolve({status:res.statusCode,text,value,headers:res.headers})})})
  req.on('error',reject);req.end(raw||body&&JSON.stringify(body))
 })
 return {get service(){return service},request,reopen(){service.close();service=createDialogueSimulationInterface(options)}}
}

test('interface fictive protégée et fermée aux ressources serveur',async t=>{
 const {request,service}=await fixture(t)
 assert.equal((await request('/private/',{auth:false})).status,401)
 assert.equal((await request('/private/dialogue',{secure:false})).status,401)
 assert.equal((await request('/private/dialogue',{source:'https://autre.invalid'})).status,403)
 const page=await request('/private/');assert.match(page.text,/"dialogue":"fictitious"/);assert.match(page.text,/\/private\/dialogue-client.mjs/)
 assert.equal((await request('/private/dialogue-client.mjs',{auth:false})).status,401)
 assert.equal((await request('/private/dialogue-client.mjs')).status,200)
 assert.equal((await request('/private/openai-dialogue.mjs')).status,404)
 assert.equal((await request('/private/dialogue',{body:{action:'turn'},source:''})).status,403)
 assert.equal(service.status().total,0)
})

test('proposition non appliquée, confirmation, isolation et parcours lié au profil accepté',async t=>{
 const {request,service}=await fixture(t)
 let result=await request('/private/dialogue',{body:{action:'edit',profile,modality:'En ligne',expectedRevision:0}})
 assert.equal(result.status,200)
 const message='Je voudrais mieux organiser mes tâches et mes priorités.'
 const turn={action:'turn',requestId:'dialogue_request_1234',message,expectedRevision:1,referenceRevision:r.revision}
 result=await request('/private/dialogue',{body:turn});assert.equal(result.status,200)
 assert.equal(result.value.draft.profile.objective,profile.objective)
 assert.ok(result.value.proposal.changes.length);const proposalId=result.value.proposal.id
 assert.equal((await request('/private/dialogue')).value.proposal.id,proposalId)
 assert.deepEqual((await request('/private/dialogue',{user:'bob'})).value.draft.profile,{})
 const ticket=async()=> (await request('/private/profile-references')).value
 const pathway=async submitted=>request('/private/pathway',{body:{profile:submitted,confirmed:true,referenceRevision:r.revision,requestId:(await ticket()).requestId}})
 const old={...profile,constraints:'Modalité souhaitée : en ligne'}
 assert.equal((await pathway(old)).value.code,'proposal_pending');assert.equal(service.status().total,0)
 assert.equal((await request('/private/dialogue',{body:{action:'accept',proposalId,expectedRevision:1}})).status,400)
 result=await request('/private/dialogue',{body:{action:'accept',proposalId,expectedRevision:1,confirmed:true}})
 assert.equal(result.status,200);assert.equal(result.value.draft.revision,2)
 assert.equal((await pathway(old)).value.code,'stale_profile');assert.equal(service.status().total,0)
 const accepted={...result.value.draft.profile,constraints:'Modalité souhaitée : en ligne'}
 assert.equal((await pathway(accepted)).status,200);assert.equal(service.status().total,1)
 assert.equal((await request('/private/dialogue',{body:{action:'accept',proposalId,expectedRevision:2,confirmed:true}})).status,409)
})

test('refus conserve le profil et une correction invalide la proposition',async t=>{
 const {request}=await fixture(t)
 const make=()=>request('/private/dialogue',{body:{action:'turn',message:'Je voudrais progresser sur Word dans mes rapports.',requestId:crypto.randomUUID(),expectedRevision:0,referenceRevision:r.revision}})
 let value=(await make()).value
 assert.equal((await request('/private/dialogue',{body:{action:'reject',proposalId:value.proposal.id,expectedRevision:0}})).status,200)
 assert.deepEqual((await request('/private/dialogue')).value.draft.profile,{})
 value=(await make()).value
 assert.equal((await request('/private/dialogue',{body:{action:'edit',profile:{role:'Autre métier'},expectedRevision:0}})).status,200)
 assert.equal((await request('/private/dialogue',{body:{action:'accept',proposalId:value.proposal.id,expectedRevision:0,confirmed:true}})).status,409)
 assert.equal((await request('/private/dialogue',{raw:'x'.repeat(16001)})).status,413)
})

test('interface désactivée par défaut, aucune configuration consultée',async()=>{
 const value=createDialogueSimulationInterface({get stateFile(){throw Error('ne pas lire')}})
 assert.equal(typeof value.handler,'function')
})

test('onglets : deux recherches exactes, nouvelle demande, sélection et fermeture durables sans simulation supplémentaire',async t=>{
 const f=await fixture(t,{resume:true})
 const build=async(p,revision)=>{
  const edited=await f.request('/private/dialogue',{body:{action:'edit',profile:p,modality:'En ligne',expectedRevision:revision}});assert.equal(edited.status,200)
  const ticket=(await f.request('/private/profile-references')).value
  const response=await f.request('/private/pathway',{body:{profile:{...p,constraints:'Modalité souhaitée : en ligne'},confirmed:true,referenceRevision:r.revision,requestId:ticket.requestId}})
  assert.equal(response.status,200);return response.value
 }
 const first=await build(profile,0),secondProfile={...profile,objective:'Rédiger des documents de test'}
 const second=await build(secondProfile,1)
 assert.deepEqual(second.savedPathways.map(p=>p.number),[1,2]);assert.deepEqual(second.savedPathways[0],first.savedPathway)
 f.reopen()
 let state=(await f.request('/private/dialogue')).value;assert.equal(state.savedPathway.number,2);assert.equal(state.pathwayQuota.total,2)
 assert.deepEqual((await f.request('/private/dialogue',{user:'bob'})).value.savedPathways,[])
 // Opening a new request clears the draft, keeping the frozen results.
 await f.request('/private/dialogue',{body:{action:'edit',profile:{},modality:'',expectedRevision:0}})
 let response=await f.request('/private/dialogue',{body:{action:'select-research',number:1}})
 assert.equal(response.status,200);assert.deepEqual(response.value.savedPathway,first.savedPathway)
 assert.equal((await f.request('/private/dialogue')).value.draft.profile.objective,undefined)
 assert.equal((await f.request('/private/dialogue',{body:{action:'close-research',number:1},source:'https://other.invalid'})).status,403)
 assert.equal((await f.request('/private/dialogue',{body:{action:'close-research',number:1},user:'bob'})).status,400)
 response=await f.request('/private/dialogue',{body:{action:'close-research',number:2}})
 assert.equal(response.value.savedPathway.number,1);assert.deepEqual(response.value.savedPathways.map(p=>p.number),[1])
 f.reopen();state=(await f.request('/private/dialogue')).value;assert.deepEqual(state.savedPathway,first.savedPathway);assert.equal(state.savedPathways.length,1)
 response=await f.request('/private/dialogue',{body:{action:'close-research',number:1}})
 assert.deepEqual(response.value.savedPathways,[]);assert.equal(response.value.savedPathway,null)
 f.reopen();state=(await f.request('/private/dialogue')).value;assert.equal(state.savedPathway,null);assert.equal(state.pathwayQuota.total,2)
 const third=await build(profile,0);assert.equal(third.savedPathway.number,3);assert.equal(third.quota.total,3)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDialogueSimulationInterface } from './dialogue-interface.mjs'
import {createRealDialogueTrialInterface} from './dialogue-real-trial.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { references } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'
const origin = 'https://dialogue-test.invalid'
const r = references()
const profile = { personnelCategory: 'TEST-A', role: 'Assistant', objective: 'Organiser les tâches de test', existingSkills: 'Je débute', timeAvailable: '1 à 2 jours' }
async function fixture(t,{resume=false,mail=null,deviceMemoryEnabled=false,deviceMemoryNow=Date.now,loadCatalogueStatus,guidedDraft=false,courseSearchFetchImpl,dialogueFetchImpl,tester=false}={}) {
 const dir = mkdtempSync(join(tmpdir(),'avatar-dialogue-interface-')), password = 'TEST_LOCAL_PASSWORD_ONLY'
 const users = await Promise.all(['alice','bob'].map(id=>createPilotCredential({id,username:id,password})))
 if(tester)users[0].pilotTester=true;
 const options = { participantDirectory:join(dir,'participants'),guidedDraft,courseSearchDirectory:guidedDraft?join(dir,'search'):undefined,courseSearchFetchImpl,mail, loadCatalogueStatus, deviceMemoryEnabled,deviceMemoryNow, enabled:true, publicOrigin:origin, users, stateFile:join(dir,'quotas.json'),
  isSecureRequest:req=>req.headers['x-test-secure']==='true', loadProfileReferences:()=>r, preview:data(),...(resume?{resumeDirectory:join(dir,'resume')}:{}) };
 const make=()=>{if(!guidedDraft)return createDialogueSimulationInterface(options);mkdirSync(join(dir,'budget'),{recursive:true,mode:0o700});return createRealDialogueTrialInterface({...options,paidTrialAuthorized:true,apiKey:'FAKE_TEST_KEY_ONLY',budgetDirectory:join(dir,'budget'),fetchImpl:dialogueFetchImpl??(()=>{throw Error('Aucun appel dialogue attendu')})})};let service=make()
 const server = http.createServer((req,res)=>service.handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 t.after(async()=>{service.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})})
 const request = (path,{body,user='alice',auth=true,source=origin,secure=true,raw}={})=>new Promise((resolve,reject)=>{
  const req = http.request({host:'127.0.0.1',port:server.address().port,path,method:body||raw?'POST':'GET',headers:{host:new URL(origin).host,
   ...(source?{origin:source}:{}),'content-type':'application/json','x-test-secure':String(secure),...(auth?{authorization:'Basic '+Buffer.from(user+':'+password).toString('base64')}:{})}},res=>{
   let text='';res.on('data',x=>text+=x);res.on('end',()=>{let value;try{value=JSON.parse(text)}catch{}resolve({status:res.statusCode,text,value,headers:res.headers})})})
  req.on('error',reject);req.end(raw||body&&JSON.stringify(body))
 })
 return {dir,get service(){return service},request,reopen(){service.close();service=make()}}
}

test('interface fictive protégée et fermée aux ressources serveur',async t=>{
 const {request,service}=await fixture(t)
 assert.equal((await request('/private/',{auth:false})).status,401)
 assert.equal((await request('/private/dialogue',{secure:false})).status,401)
 assert.equal((await request('/private/dialogue',{source:'https://autre.invalid'})).status,403)
 const page=await request('/private/');assert.match(page.text,/"dialogue":"fictitious"/);assert.match(page.text,/\/private\/dialogue-client.mjs/)
 assert.equal((await request('/private/dialogue-client.mjs',{auth:false})).status,401)
 assert.equal((await request('/private/dialogue-client.mjs')).status,200)
 assert.equal((await request('/private/private-response.mjs',{auth:false})).status,401)
 assert.equal((await request('/private/private-response.mjs')).status,200)
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

test('courriel HTTP : recherche de l’identité seulement, confirmation, origine et aucun appel au moteur',async t=>{
 const sends=[],mail={enabled:true,async send(value){if(!value.confirmed)throw Object.assign(new Error(),{code:'invalid_email_request'});sends.push(value);return {accepted:true}}}
 const {request,service}=await fixture(t,{mail})
 const page=await request('/private/');assert.match(page.text,/"emailEnabled":true/)
 const edit=await request('/private/dialogue',{body:{action:'edit',profile,modality:'En ligne',expectedRevision:0}})
 const ticket=(await request('/private/profile-references')).value
 const generated=await request('/private/pathway',{body:{profile:{...edit.value.draft.profile,constraints:'Modalité souhaitée : en ligne'},confirmed:true,referenceRevision:r.revision,requestId:ticket.requestId}})
 assert.equal(generated.status,200);const number=generated.value.savedPathway.number,body={number,recipient:'reader@example.invalid',requestId:'5c040b48-7359-4ee5-9099-260462fb50d7',confirmed:true}
 assert.equal((await request('/private/research-email',{body,auth:false})).status,401)
 assert.equal((await request('/private/research-email',{body,secure:false})).status,401)
 assert.equal((await request('/private/research-email',{body,source:''})).status,403)
 assert.equal((await request('/private/research-email',{body,user:'bob'})).status,404)
 assert.equal((await request('/private/research-email',{body:{...body,snapshot:{}}})).status,400)
 await request('/private/dialogue',{body:{action:'edit',profile:{...profile,objective:'Un nouveau brouillon distinct'},modality:'Présentiel',expectedRevision:edit.value.draft.revision}})
 const result=await request('/private/research-email',{body});assert.equal(result.status,200);assert.equal(sends.length,1);assert.equal(sends[0].snapshot.profile.objective,profile.objective);assert.equal(sends[0].snapshot.modality,'En ligne');assert.equal(service.status().total,1)
 assert.equal((await request('/private/research-email-client.mjs',{auth:false})).status,401)
 assert.equal((await request('/private/research-email.mjs')).status,404)
})


test('copie sur appareil : accès authentifié, confirmation, restauration signée et quotas conservés',async t=>{
 let clock=Date.parse('2026-10-26T12:00:00Z')
 const f=await fixture(t,{resume:true,deviceMemoryEnabled:true,deviceMemoryNow:()=>clock}),request=f.request
 let initial=await request('/private/dialogue');assert.match(initial.value.deviceMemory.scope,/^[a-f0-9]{64}$/)
 assert.equal((await request('/private/dialogue',{body:{action:'device-save'}})).status,400)
 let edited=await request('/private/dialogue',{body:{action:'edit',profile,modality:'En ligne',expectedRevision:0}})
 const ticket=await request('/private/profile-references')
 assert.equal((await request('/private/pathway',{body:{profile:{...edited.value.draft.profile,constraints:'Modalité souhaitée : en ligne'},confirmed:true,referenceRevision:r.revision,requestId:ticket.value.requestId}})).status,200)
 const saved=await request('/private/dialogue',{body:{action:'device-save',confirmed:true}})
 assert.equal(saved.status,200);assert.equal(saved.value.deviceCopy.state.pathways.length,1)
 const copy=saved.value.deviceCopy
 assert.equal(saved.headers['set-cookie'],undefined)
 edited=await request('/private/dialogue',{body:{action:'edit',profile:{...profile,objective:'Une autre demande de test'},modality:'Présentiel',expectedRevision:edited.value.draft.revision}})
 const body={action:'device-restore',copy,confirmed:true,expectedStateToken:edited.value.deviceMemory.stateToken,expectedRevision:edited.value.draft.revision}
 assert.equal((await request('/private/dialogue',{body:{...body,confirmed:false}})).status,400)
 assert.equal((await request('/private/dialogue',{body:{...body,expectedStateToken:saved.value.deviceMemory.stateToken}})).status,400)
 assert.equal((await request('/private/dialogue',{body:{...body,copy:{...copy,state:{...copy.state,profile:{...profile,objective:"Altération de la copie"}}}}})).status,400)
 const bob=await request('/private/dialogue',{user:'bob'})
 assert.equal((await request('/private/dialogue',{user:'bob',body:{...body,expectedRevision:0,expectedStateToken:bob.value.deviceMemory.stateToken}})).status,400)
 assert.equal((await request('/private/dialogue',{body,source:'https://autre.invalid'})).status,403)
 const restored=await request('/private/dialogue',{body});assert.equal(restored.status,200)
 assert.equal(restored.value.draft.profile.objective,profile.objective);assert.deepEqual(restored.value.savedPathways,copy.state.pathways)
 assert.equal(f.service.status().total,1)
 f.reopen();const reopened=await request('/private/dialogue');assert.equal(reopened.value.draft.profile.objective,profile.objective)
 assert.equal((await request('/private/dialogue',{body:{...body,expectedRevision:reopened.value.draft.revision,expectedStateToken:reopened.value.deviceMemory.stateToken}})).status,200)
 clock=copy.expiresAt
 const current=await request('/private/dialogue')
 assert.equal((await request('/private/dialogue',{body:{...body,expectedRevision:current.value.draft.revision,expectedStateToken:current.value.deviceMemory.stateToken}})).status,400)
 assert.equal(f.service.status().total,1)
})


test('date du catalogue : lecture privée seule, repli explicite et aucun quota consommé',async t=>{
 const version={snapshotDate:'2026-10-27',snapshotHash:'a'.repeat(64)};let unavailable=false
 const f=await fixture(t,{loadCatalogueStatus:async()=>{if(unavailable)throw Error();return version}})
 assert.equal((await f.request('/private/catalogue-status',{auth:false})).status,401)
 assert.deepEqual((await f.request('/private/catalogue-status')).value,{catalogue:version})
 assert.equal((await f.request('/private/catalogue-status',{body:{}})).status,405)
 unavailable=true;assert.equal((await f.request('/private/catalogue-status')).status,503)
 assert.equal(f.service.status().total,0)
})


test('recherche vers parcours : objectif conservé, nouvelle recherche vide et archives durables sans appel supplémentaire',async t=>{
 let calls=0;
 const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 const f=await fixture(t,{resume:true,guidedDraft:true,courseSearchFetchImpl:async url=>{
  if(url.endsWith('/api/catalogue'))return json({catalogue:{snapshotDate:'2026-10-27',snapshotHash:'a'.repeat(64)},courses:[]});
  calls++;return json({ok:true,catalogue:{snapshotDate:'2026-10-27',snapshotHash:'a'.repeat(64)},results:[],recommendedResults:[],complementaryResults:[],relatedResults:[],reason:'Aucun résultat fictif'});
 }});
 const mode=body=>f.request('/private/dialogue',{body:{action:'request-mode',confirmed:true,intent:'start',...body}});
 let response=await mode({requestMode:'search',expectedRevision:0});assert.equal(response.status,200,JSON.stringify(response.value));let state=response.value;
 const searched=await f.request('/private/course-search',{body:{query:'Cockpit',confirmed:true,requestId:crypto.randomUUID(),expectedRevision:state.draft.revision}});
 assert.equal(searched.status,200,JSON.stringify(searched.value));assert.equal(calls,1);const number=searched.value.savedPathway.number;
 const invalid=await mode({requestMode:'pathway',fromResearch:number+1,expectedRevision:state.draft.revision});assert.equal(invalid.status,400);
 state=(await mode({requestMode:'pathway',fromResearch:number,expectedRevision:state.draft.revision})).value;
 assert.deepEqual(state.draft.profile,{objective:'Cockpit'});assert.equal(state.draft.modality,'');assert.equal(state.savedPathways.length,1);assert.equal(calls,1);
 const stale=await mode({requestMode:'search',expectedRevision:0});assert.equal(stale.status,409);
 state=(await mode({requestMode:'search',expectedRevision:state.draft.revision})).value;
 assert.deepEqual(state.draft.profile,{});assert.equal(state.savedPathway,null);assert.equal(state.savedPathways[0].result.searchQuery,'Cockpit');
 f.reopen();state=(await f.request('/private/dialogue')).value;
 assert.deepEqual(state.draft.profile,{});assert.equal(state.savedPathway,null);assert.equal(state.savedPathways.length,1);assert.equal(calls,1);
 state=(await mode({requestMode:'pathway',fromResearch:number,expectedRevision:state.draft.revision})).value;
 assert.deepEqual(state.draft.profile,{objective:'Cockpit'});assert.equal(calls,1);
});


test('suivi HTTP : contexte issu des archives du compte, courriel sans retour au questionnaire ni recherche',async t=>{
 let paid=0,dialogue=0;const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}}),version={snapshotDate:'2026-10-29',snapshotHash:'b'.repeat(64)};
 const f=await fixture(t,{resume:true,guidedDraft:true,courseSearchFetchImpl:async url=>{if(url.endsWith('/api/catalogue'))return json({catalogue:version,courses:[{code:'TRT450',sourceUrl:'https://outils.ge.ch/referentiel/formation/CatalogueDescription/TRT450.html',catalogueOffers:['OPE'],organizingEntity:'Centre officiel',officialData:{titleRaw:'Cockpit RH'}}]});paid++;return json({ok:true,catalogue:version,results:[{code:'TRT450'}],recommendedResults:[{code:'TRT450',relevance:{level:'partial',reason:'Cockpit à préciser'}}],reason:'Un cours Cockpit'});},dialogueFetchImpl:async(url,init)=>{
 if(url.endsWith('/input_tokens'))return json({object:'response.input_tokens',input_tokens:1000});dialogue++;const body=JSON.parse(init.body),input=JSON.parse(body.input[0].content);
 assert.equal(input.researchContext.recommendedSteps[0].code,'TRT450');assert.equal(input.researchContext.recommendedSteps[0].organizingEntity,'Centre officiel');assert.equal(input.researchContext.summary,'Un cours Cockpit');assert.equal(input.currentQuestion,undefined);assert.match(body.instructions,/courriel complet/);
 return json({status:'completed',model:'gpt-6-luna',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({kind:'recap',reply:'Objet : demande de formation Cockpit RH pour mes objectifs EEDP',changes:[]})}]}]});}});
 let state=(await f.request('/private/dialogue',{body:{action:'request-mode',requestMode:'search',intent:'start',confirmed:true,expectedRevision:0}})).value;
 const search=await f.request('/private/course-search',{body:{query:'Cockpits',confirmed:true,requestId:crypto.randomUUID(),expectedRevision:state.draft.revision}});assert.equal(search.status,200);const number=search.value.savedPathway.number;
 assert.deepEqual(search.value.savedPathway.result.recommendedSteps[0].course.catalogueOffers,['OPE']);assert.equal(search.value.savedPathway.result.recommendedSteps[0].relevance.level,'partial');
 const turn={action:'turn',requestId:crypto.randomUUID(),message:'Rédigez un mail pour mon EEDP',paidTrialConfirmed:true,researchNumber:number,expectedRevision:state.draft.revision,referenceRevision:r.revision,researchContext:{summary:'FAUX contexte injecté'}};
 const reply=await f.request('/private/dialogue',{body:turn});assert.equal(reply.status,200,JSON.stringify(reply.value));assert.match(reply.value.reply,/Objet/);assert.deepEqual(reply.value.draft.profile,{});assert.equal(paid,1);assert.equal(dialogue,1);assert.equal(f.service.status().total,0);
 const other=await f.request('/private/dialogue',{user:'bob',body:{...turn,requestId:crypto.randomUUID(),expectedRevision:0}});assert.equal(other.status,400);assert.equal(dialogue,1);
 const missing=await f.request('/private/dialogue',{body:{...turn,requestId:crypto.randomUUID(),researchNumber:999}});assert.equal(missing.status,400);assert.equal(dialogue,1);
});


test('quatre accès : quota individuel avant recherche IA, administrateur indépendant, compteurs persistants',async t=>{
 let searches=0;const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}}),version={snapshotDate:'2026-10-29',snapshotHash:'c'.repeat(64)};
 const f=await fixture(t,{resume:true,guidedDraft:true,tester:true,courseSearchFetchImpl:async url=>{if(url.endsWith('/api/catalogue'))return json({catalogue:version,courses:[]});searches++;return json({ok:true,catalogue:version,results:[],recommendedResults:[],reason:'Aucun cours'});}});
 let state=(await f.request('/private/dialogue')).value;assert.equal(state.participantQuota.research,0);
 state=(await f.request('/private/dialogue',{body:{action:'request-mode',intent:'start',requestMode:'search',confirmed:true,expectedRevision:state.draft.revision}})).value;
 const search=()=>f.request('/private/course-search',{body:{query:'Cockpits',requestId:crypto.randomUUID(),confirmed:true,expectedRevision:state.draft.revision}});
 for(let i=0;i<3;i++)assert.equal((await search()).status,200);
 const denied=await search();assert.equal(denied.status,429);assert.equal(denied.value.code,'participant_daily_limit');assert.equal(searches,3);
 f.reopen();state=(await f.request('/private/dialogue')).value;assert.equal(state.participantQuota.research,3);assert.equal(state.savedPathways.length,3);
 const bob=(await f.request('/private/dialogue',{user:'bob'})).value;assert.equal(bob.participantQuota,undefined);assert.deepEqual(bob.savedPathways,[]);
});

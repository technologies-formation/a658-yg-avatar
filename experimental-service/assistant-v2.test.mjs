import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readdirSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {references} from './reference-test-fixtures.mjs'
import {createDialogueSession} from './dialogue-session.mjs'
import {normalizePathwayProfile} from './profile-references.mjs'
import {validateResume} from './private-resume-store.mjs'
import {createCourseSearch} from './course-search.mjs'
const refs=()=>references(value=>{
 const f=value.pathway.fields,field=(options,formControl='textarea')=>({type:'string',maxLength:4000,requiredInApi:false,requiredInForm:false,formControl,options:options.map(value=>({value,label:value}))})
 f.professionalEnvironment=field(['Police','Autre'],'select');f.trainingOffers=field(['Offre A','Offre B']);f.trainingOrganizers=field(['Centre A','Centre B'])
})
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
const version={snapshotDate:'2026-10-27',snapshotHash:'a'.repeat(64)}
const catalogue={catalogue:version,courses:[{code:'TEST-1',sourceUrl:'https://outils.ge.ch/referentiel/formation/CatalogueDescription/TEST-1.html',officialData:{titleRaw:'Formation de test',durationRaw:'2 jours',publicRaw:'Tout public',hasOpenSession:true,hasScheduledSession:false,sourceSnapshotDate:'2026-10-27'}}]}
function directory(t){const d=mkdtempSync(join(tmpdir(),'assistant-v2-'));t.after(()=>rmSync(d,{recursive:true,force:true}));return d}
test('brouillon guidé : preuves validées, champs ajoutés sans confirmation répétitive, mode et historique conservés',async()=>{
 const contract=refs();let calls=0
 const session=createDialogueSession({enabled:true,guidedDraft:true,references:contract,initialProfile:{entity:'Service historique'},maxTurns:10,timeoutMs:1000,provider:{mode:'simulation',async respond(p){calls++;assert.match(p.rules.join('\n'),/une personne PAT peut travailler à la police/i);const m=p.messages.at(-1);return {kind:'ask',reply:'À quel groupe de personnel appartenez-vous ?',changes:[{field:'professionalEnvironment',value:'Police',evidence:[{messageId:m.id,quote:'Police'}]}]}}}})
 assert.equal(session.getDraft().requestMode,'')
 session.setRequestMode('pathway',{expectedRevision:0});assert.equal(session.getDraft().profile.entity,undefined)
 const out=await session.turn({message:'Police',requestId:'test-request-0000001',expectedRevision:1,referenceRevision:contract.revision})
 assert.equal(out.proposal,null);assert.equal(out.draft.profile.professionalEnvironment,'Police');assert.equal(out.draft.profile.personnelCategory,undefined);assert.equal(calls,1)
 const revision=out.draft.revision;session.setRequestMode('search',{expectedRevision:revision});assert.equal(session.getDraft().profile.professionalEnvironment,'Police')
 const saved=validateResume({version:2,profile:session.getDraft().profile,modality:'',referenceRevision:contract.revision,pathway:null,pathways:[],nextNumber:1,requestMode:'search'})
 assert.equal(saved.requestMode,'search');assert.equal(saved.profile.professionalEnvironment,'Police')
 session.restart({confirmed:true,expectedRevision:session.getDraft().revision});assert.equal(session.getDraft().requestMode,'');assert.equal(session.status().attemptedTurns,1)
})
test('références évolutives : choix retiré conservé dans le brouillon, refusé à la génération, puis corrigible',()=>{
 const contract=refs();const session=createDialogueSession({enabled:true,guidedDraft:true,references:contract,initialProfile:{role:'Assistant',objective:'Apprendre un sujet précis',personnelCategory:'TEST-A',trainingOffers:'Offre A'},maxTurns:10,timeoutMs:1000,provider:{mode:'simulation',respond(){throw Error('aucun appel')}}})
 const changed=refs();changed // références gelées : fabriquer une autre révision via la fixture
 const next=references(v=>{Object.assign(v.pathway.fields,contract.pathway.fields);v.pathway.fields.trainingOffers={...v.pathway.fields.trainingOffers,options:[{value:'Offre B',label:'Offre B'}]}})
 session.refreshReferences(next);assert.equal(session.getDraft().profile.trainingOffers,'Offre A');assert.throws(()=>session.getPathwayProfile({expectedRevision:1}))
 session.editProfile({...session.getDraft().profile,trainingOffers:'Offre B'},{expectedRevision:1});assert.equal(session.getPathwayProfile({expectedRevision:2}).trainingOffers,'Offre B')
 assert.throws(()=>normalizePathwayProfile({...session.getDraft().profile,trainingOffers:'Offre B\nHors liste'},next))
})
test('recherche directe sans profil : même endpoint Catalogue, catégories, date et preuves conservées, doublon durable',async t=>{
 const d=directory(t);let paid=0;const fetchImpl=async(url,init)=>{assert.equal(init.redirect,'error');if(url.endsWith('/api/catalogue'))return json(catalogue);paid++;assert.equal(url,'https://api.a658yg-catalogue.ch/api/search');assert.deepEqual(JSON.parse(init.body),{query:'Word'});return json({ok:true,catalogue:version,results:[{code:'TEST-1'}],recommendedResults:[{code:'TEST-1'}],complementaryResults:[],relatedResults:[],reason:'Formation trouvée'})}
 const make=()=>createCourseSearch({directory:d,fetchImpl})
 let service=make();const req={query:'Word',identity:'compte-test',confirmed:true,requestId:'test-search-0000001'}
 const result=await service.search(req);assert.equal(result.recommendedSteps[0].course.duration,'2 jours');assert.equal(result.recommendedSteps[0].course.sessionAvailability.hasOpenSession,true);assert.equal(result.searchQuery,'Word');assert.equal(paid,1)
 service=make();await assert.rejects(service.search(req),e=>e.code==='duplicate_request');assert.equal(paid,1);assert.equal(readdirSync(d).length,1)
 await assert.rejects(service.search({...req,confirmed:false,requestId:'test-search-0000002'}));assert.equal(paid,1)
})
test('recherche en erreur : réservation conservée, aucune relance ni résultat inventé',async t=>{
 const d=directory(t);let paid=0;const service=createCourseSearch({directory:d,fetchImpl:async url=>{if(url.endsWith('/api/catalogue'))return json(catalogue);paid++;return new Response('FAIL',{status:503})}})
 const req={query:'Word',identity:'test',confirmed:true,requestId:'test-search-0000003'}
 await assert.rejects(service.search(req));await assert.rejects(service.search(req),e=>e.code==='duplicate_request');assert.equal(paid,1)
})

test('le seul environnement Police ne peut pas transformer un PAT en personnel en uniforme',async()=>{
 const contract=references(v=>{v.pathway.fields.personnelCategory.options=[{value:'PAT',label:'Personnel administratif'},{value:'PU Police',label:'Personnel en uniforme Police'}]})
 const session=createDialogueSession({enabled:true,guidedDraft:true,references:contract,initialProfile:{personnelCategory:'PAT'},maxTurns:10,timeoutMs:1000,provider:{mode:'simulation',async respond(p){const m=p.messages.at(-1);return {kind:'ask',reply:'Quelle est votre fonction ?',changes:[{field:'personnelCategory',value:'PU Police',evidence:[{messageId:m.id,quote:'Police'}]}]}}}})
 const value=await session.turn({message:'Police',requestId:'test-category-0000001',expectedRevision:0,referenceRevision:contract.revision})
 assert.equal(value.draft.profile.personnelCategory,'PAT');assert.equal(value.proposal,null)
})

test('nouveau besoin : uniquement l’objectif explicite, aucun ancien critère ou niveau, compteurs inchangés',async()=>{
 const contract=refs(),old={professionalEnvironment:'Police',personnelCategory:'TEST-A',role:'Chef cockpit',managerStatus:'TEST-MANAGER',objective:'Ancien objectif cockpit',existingSkills:'Débutant cockpit',timeAvailable:'6 jours',constraints:'Le matin',trainingOffers:'Offre A',trainingOrganizers:'Centre A'}
 const session=createDialogueSession({enabled:true,guidedDraft:true,references:contract,initialProfile:old,initialModality:'En ligne',initialRequestMode:'pathway',maxTurns:10,timeoutMs:1000,provider:{mode:'simulation',async respond(){throw Error('Aucun appel attendu')}}})
 assert.throws(()=>session.startRequestMode('pathway',{expectedRevision:0}),e=>e.code==='unconfirmed');assert.deepEqual(session.getDraft().profile,old)
 assert.throws(()=>session.startRequestMode('pathway',{expectedRevision:99,confirmed:true}),e=>e.code==='stale_profile');assert.deepEqual(session.getDraft().profile,old)
 const status=session.status(),draft=session.startRequestMode('pathway',{expectedRevision:0,confirmed:true,objective:'Word : styles et table des matières'})
 assert.deepEqual(draft.profile,{objective:'Word : styles et table des matières'});assert.equal(draft.modality,'');assert.equal(draft.requestMode,'pathway');assert.deepEqual(session.status(),status)
 const next=session.startRequestMode('pathway',{expectedRevision:draft.revision,confirmed:true});assert.deepEqual(next.profile,{});assert.equal(next.modality,'')
 session.editProfile(old,{expectedRevision:next.revision,modality:'Présentiel'});const before=session.getDraft();session.setRequestMode('pathway',{expectedRevision:before.revision});assert.deepEqual(session.getDraft().profile,old);assert.equal(session.getDraft().modality,'Présentiel')
})


test('préférence souple : modalité canonique séparée de la souplesse, preuves exactes et espace final toléré',async()=>{
 const contract=refs(),message='Je préfère une formation en ligne, mais je reste ouvert au présentiel si elle répond mieux à mon besoin.'
 const session=createDialogueSession({enabled:true,guidedDraft:true,references:contract,maxTurns:10,timeoutMs:1000,provider:{mode:'simulation',async respond(p){
  assert.match(p.rules.join(' '),/valeurs exactes Présentiel, En ligne ou Indifférent/)
  assert.match(p.rules.join(' '),/Une difficulté métier ou technique appartient à objective ou existingSkills/)
  const m=p.messages.at(-1),evidence=[{messageId:m.id,quote:m.text}]
  return {kind:'ask',reply:'Avez-vous d’autres contraintes ?',changes:[{field:'modality',value:'En ligne ',evidence},{field:'constraints',value:'Présentiel accepté si plus adapté.',evidence}]}
 }}})
 const result=await session.turn({message,requestId:'soft-preference-00001',expectedRevision:0,referenceRevision:contract.revision})
 assert.equal(result.draft.modality,'En ligne');assert.equal(result.draft.profile.constraints,'Présentiel accepté si plus adapté.');assert.equal(result.draft.profile.existingSkills,undefined)
})

test('modalité composée invalide : diagnostic borné sans texte utilisateur, brouillon entier conservé',async()=>{
 const contract=refs(),initialProfile={objective:'Structurer mes rapports Word',constraints:'Le lundi'},message='Je préfère en ligne, présentiel accepté.'
 const session=createDialogueSession({enabled:true,guidedDraft:true,references:contract,initialProfile,initialModality:'Présentiel',maxTurns:10,timeoutMs:1000,provider:{mode:'simulation',async respond(p){const m=p.messages.at(-1),evidence=[{messageId:m.id,quote:m.text}];return {kind:'ask',reply:'Suite',changes:[{field:'objective',value:'Objectif changé',evidence},{field:'modality',value:'En ligne ou présentiel',evidence}]}}}})
 const before=session.getDraft()
 await assert.rejects(session.turn({message,requestId:'bad-preference-00001',expectedRevision:0,referenceRevision:contract.revision}),e=>e.code==='invalid_response'&&e.validation==='modality'&&!e.message.includes(message))
 assert.deepEqual(session.getDraft(),before);assert.equal(session.status().attemptedTurns,1)
})

test('effacement d’une contrainte uniquement avec demande explicite et preuve exacte',async()=>{
 for(const [message,allowed] of [['Je n’ai aucune autre contrainte.',true],['Je préfère en ligne.',false]]){
  const contract=refs(),session=createDialogueSession({enabled:true,guidedDraft:true,references:contract,initialProfile:{constraints:'Le lundi'},maxTurns:10,timeoutMs:1000,provider:{mode:'simulation',async respond(p){const m=p.messages.at(-1);return {kind:'ask',reply:'Suite',changes:[{field:'constraints',value:'',evidence:[{messageId:m.id,quote:m.text}]}]}}}})
  const operation=session.turn({message,requestId:'clear-constraints-001',expectedRevision:0,referenceRevision:contract.revision})
  if(allowed)assert.equal((await operation).draft.profile.constraints,undefined)
  else{await assert.rejects(operation,e=>e.code==='invalid_response'&&e.validation==='change');assert.equal(session.getDraft().profile.constraints,'Le lundi')}
 }
})


test('responsabilité libre ambiguë : pas de faux statut, brouillon conservé et clarification possible',async()=>{
 const contract=refs(),initialProfile={professionalEnvironment:'Police',personnelCategory:'TEST-A',role:'Chef',objective:'Cockpits'};
 const session=createDialogueSession({enabled:true,guidedDraft:true,references:contract,initialProfile,maxTurns:10,timeoutMs:1000,provider:{mode:'simulation',async respond(p){
  assert.match(p.rules.join(' '),/Question actuellement affichée.*situation managériale/);
  const m=p.messages.at(-1);return {kind:'clarify',reply:'Quelle situation souhaitez-vous préciser ?',changes:[{field:'managerStatus',value:'Manager',evidence:[{messageId:m.id,quote:m.text}]}]};
 }}});
 const result=await session.turn({message:'Manager',questionField:'managerStatus',requestId:'manager-ambiguous-0001',expectedRevision:0,referenceRevision:contract.revision});
 assert.deepEqual(result.draft.profile,initialProfile);assert.equal(result.proposal,null);
 await assert.rejects(session.turn({message:'Chef',questionField:'champ-invente',requestId:'invalid-question-0001',expectedRevision:0,referenceRevision:contract.revision}),e=>e.code==='invalid_request');
 assert.equal(session.status().attemptedTurns,1);
});

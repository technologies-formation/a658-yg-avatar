import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createPreparedPublicPilot} from './public-pilot.mjs'
import {publicPilotFixture as fixture} from './public-pilot-test-fixtures.mjs'

test('préparation désactivée : aucune configuration, clé, route privée ou fichier consulté',()=>{
 const p=createPreparedPublicPilot({get apiKey(){throw Error('do not read')},get directory(){throw Error('do not read')}})
 assert.equal(p.enabled,false);p.close()
 assert.throws(()=>createPreparedPublicPilot({enabled:true,billingReviewed:false}),e=>e.code==='public_configuration')
})
test('HTTPS et origine avant session ; cookie opaque sécurisé ; aucun appel IA à l’ouverture',async t=>{
 const f=await fixture(t)
 for(const params of [{secure:false},{source:'https://attacker.invalid'},{headers:{'sec-fetch-site':'cross-site'}}]){const r=await f.request('/public/',params);assert.equal(r.status,403);assert.equal(r.headers['set-cookie'],undefined)}
 const page=await f.request('/public/');assert.equal(page.status,200);assert.match(page.headers['set-cookie'][0],/; Path=\/; Secure; HttpOnly; SameSite=Strict;/)
 assert.equal(page.headers['www-authenticate'],undefined);assert.match(page.text,/"publicPilot":true/);assert.doesNotMatch(page.text,/sans plafond|\/private\//)
 assert.equal(f.calls.length,0);assert.equal((await f.request('/private/')).status,404)
 assert.equal((await f.request('/public/dialogue',{cookie:'__Host-a658_public_pilot=forged'})).status,401)
 assert.equal((await f.request('/public/dialogue',{body:{action:'turn'}})).status,401)
})
test('deux visiteurs : brouillons, recherches et reprise isolés, même après redémarrage',async t=>{
 const f=await fixture(t),a=await f.enter(),b=await f.enter();assert.notEqual(a,b)
 await f.mode(a);const v=await f.get(a)
 const edit=await f.request('/public/dialogue',{cookie:a,body:{action:'edit',profile:{professionalEnvironment:'Police',objective:'Objectif fictif A'},expectedRevision:v.draft.revision,modality:'En ligne'}});assert.equal(edit.status,200)
 assert.deepEqual((await f.get(b)).draft.profile,{})
 await f.reopen();assert.equal((await f.get(a)).draft.profile.objective,'Objectif fictif A');assert.deepEqual((await f.get(b)).draft.profile,{})
 assert.equal(f.calls.length,0)
})
test('réservation avant départ, cadence, refus d’un deuxième départ concurrent et échec sans remboursement',async t=>{
 const f=await fixture(t),a=await f.enter();await f.mode(a);f.fail()
 const failed=await f.turn(a);assert.equal(f.calls.length,1);assert.notEqual(failed.status,200)
 assert.equal((await f.get(a)).publicQuota.dialogue,1);assert.equal((await f.turn(a)).value.code,'public_cadence');assert.equal(f.calls.length,1)
 f.tick();await f.reopen();assert.equal((await f.get(a)).publicQuota.dialogue,1)
 let release;f.setHold(new Promise(resolve=>{release=resolve}));const pending=f.turn(a)
 while(f.calls.length<2)await new Promise(resolve=>setTimeout(resolve,10))
 const second=await f.turn(a);assert.equal(second.status,409);assert.equal(second.value.code,'public_busy')
 f.setHold(null);release();assert.equal((await pending).status,200);assert.equal((await f.get(a)).publicQuota.dialogue,2)
})
test('courriels : seul un résultat de la session vers une adresse autorisée ; aucun nouvel appel IA',async t=>{
 const f=await fixture(t),a=await f.enter(),b=await f.enter();await f.mode(a,'search');const d=await f.get(a)
 const found=await f.request('/public/course-search',{cookie:a,body:{query:'Word',requestId:randomUUID(),confirmed:true,expectedRevision:d.draft.revision}});assert.equal(found.status,200)
 const before=f.calls.length,mail={number:1,recipient:'tester@example.invalid',requestId:randomUUID(),confirmed:true}
 const blocked=await f.request('/public/research-email',{cookie:a,body:{...mail,recipient:'outsider@example.invalid'}});assert.equal(blocked.status,403);assert.equal(f.emails.length,0)
 const wrongSession=await f.request('/public/research-email',{cookie:b,body:mail});assert.notEqual(wrongSession.status,200);assert.equal(f.emails.length,0)
 const sent=await f.request('/public/research-email',{cookie:a,body:mail});assert.equal(sent.status,200);assert.equal(f.emails.length,1);assert.equal(f.emails[0].to.address,'tester@example.invalid')
 const duplicate=await f.request('/public/research-email',{cookie:a,body:mail});assert.notEqual(duplicate.status,200);assert.equal(f.emails.length,1);assert.equal(f.calls.length,before)
 await f.reopen();assert.notEqual((await f.request('/public/research-email',{cookie:a,body:mail})).status,200);assert.equal(f.emails.length,1)
})
test('plafond global au départ du transport : nouveau cookie et redémarrage ne permettent pas un cinquième appel Catalogue',async t=>{
 const f=await fixture(t),a=await f.enter(),b=await f.enter();await f.mode(a,'search');await f.mode(b,'search')
 for(const cookie of [a,a,a,b]){
  const d=await f.get(cookie),r=await f.request('/public/course-search',{cookie,body:{query:'Word',requestId:randomUUID(),confirmed:true,expectedRevision:d.draft.revision}})
  assert.equal(r.status,200);f.tick()
 }
 const before=f.calls.length;assert.equal(before,4);await f.reopen();const c=await f.enter();await f.mode(c,'search')
 const d=await f.get(c),blocked=await f.request('/public/course-search',{cookie:c,body:{query:'Word',requestId:randomUUID(),confirmed:true,expectedRevision:d.draft.revision}})
 assert.equal(blocked.status,429);assert.equal(blocked.value.code,'public_budget_limit');assert.equal(f.calls.length,before)
 assert.equal((await f.get(a)).savedPathways.length,3);assert.equal((await f.get(b)).savedPathways.length,1)
})
test('corps malformés, absence de confirmation et adresses à en-têtes injectés ne déclenchent aucun effet externe',async t=>{
 const f=await fixture(t),a=await f.enter();await f.mode(a)
 assert.equal((await f.request('/public/dialogue',{cookie:a,raw:'{malformed'})).status,400)
 assert.equal((await f.request('/public/dialogue',{cookie:a,raw:'x'.repeat(16001)})).status,413)
 const d=await f.get(a)
 await f.request('/public/dialogue',{cookie:a,body:{action:'turn',message:'fictif',paidTrialConfirmed:false,requestId:randomUUID(),expectedRevision:d.draft.revision,referenceRevision:d.references.revision}})
 await f.request('/public/research-email',{cookie:a,body:{confirmed:true,recipient:'tester@example.invalid\r\nBcc:other@example.invalid',number:1,requestId:randomUUID()}})
 assert.equal(f.calls.length,0);assert.equal(f.emails.length,0);assert.equal((await f.get(a)).publicQuota.dialogue,0)
})
test('arrêt pendant le comptage : aucune génération ultérieure, réservation conservée et résultats toujours lisibles',async t=>{
 const f=await fixture(t),a=await f.enter();await f.mode(a)
 let release;f.setHold(new Promise(resolve=>{release=resolve}));const pending=f.turn(a)
 for(let n=0;f.calls.length<1&&n<500;n++)await new Promise(resolve=>setTimeout(resolve,10))
 assert.equal(f.calls.length,1);f.stop();f.setHold(null);release();assert.notEqual((await pending).status,200)
 assert.equal(f.calls.length,1);assert.equal((await f.get(a)).publicQuota.dialogue,1)
 await f.reopen();assert.notEqual((await f.turn(a)).status,200);assert.equal(f.calls.length,1)
})
test('suivi agrégé : un dialogue attribué une fois à l’Assistant sans question, réponse ni adresse',async t=>{
 const f=await fixture(t),a=await f.enter();await f.mode(a);assert.equal((await f.turn(a)).status,200)
 assert.equal(f.events.length,1);assert.equal(f.events[0].app,'assistant');assert.equal(f.events[0].action,'dialogue');assert.equal(f.events[0].outcome,'success')
 assert.deepEqual(f.events[0].usage,{costMicroUsd:330,inputTokens:1000,outputTokens:100})
 assert.doesNotMatch(JSON.stringify(f.events),/Un besoin fictif|Quel est|tester@|cookie|apiKey/)
})

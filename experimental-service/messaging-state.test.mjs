import test from 'node:test';import assert from 'node:assert/strict';
import {composeConstraints,validateMessagingProfile,createMessagingSnapshot,snapshotIsStale} from './messaging-state.mjs';
import {references} from './reference-test-fixtures.mjs';import {data} from './result-test-fixtures.mjs';
import {renderMessagingPage} from './messaging-page.mjs';
test('modalité et autres contraintes restent indépendantes sans perte de préférences',()=>{
 assert.equal(composeConstraints('Indifférent','Le matin uniquement'),'Aucune préférence de modalité\nLe matin uniquement');
 assert.equal(composeConstraints('En ligne','Mobilité limitée'),'Modalité souhaitée : en ligne\nMobilité limitée');assert.throws(()=>composeConstraints('Inconnu'));
});
test('les valeurs métier viennent du référentiel ; aucun niveau ou groupe implicite',()=>{
 const r=references();assert.throws(()=>validateMessagingProfile({role:'Assistant',objective:'Organiser mes tâches'},r));
 const p=validateMessagingProfile({personnelCategory:'TEST-A',role:'Assistant',objective:'Organiser mes tâches'},r);
 assert.equal(p.existingSkills,undefined);assert.throws(()=>validateMessagingProfile({...p,managerStatus:'Manager inventé'},r));
 assert.equal(validateMessagingProfile({...p,entity:'Service libre'},r).entity,'Service libre');
});
test('le résultat conservé garde ses rubriques, positions, liens, justifications et usage',()=>{
 const p={personnelCategory:'TEST-A',role:'Assistant',objective:'Organiser les tâches'},r=references(),result=data(),s=createMessagingSnapshot(p,result,r.revision,1);
 assert.deepEqual(s.result,result);result.recommendedSteps[0].rationale='Modifié';p.objective='Autre besoin';
 assert.notEqual(s.result.recommendedSteps[0].rationale,'Modifié');assert.equal(snapshotIsStale(s,p,r.revision),true);
 assert.equal(snapshotIsStale(s,s.profile,'a'.repeat(64)),true);assert.throws(()=>s.result.recommendedSteps.push({}));
});
test('la page est explicitement en simulation, contrat sérialisé sans injection HTML',()=>{
 const r=references(x=>{x.pathway.fields.entity.suggestions[0].label='</script><img src=x onerror=alert(1)>';});
 const html=renderMessagingPage(r);assert.match(html,/simulation uniquement/);assert.match(html,/messaging-client.mjs/);assert.doesNotMatch(html,/<img src=x/);assert.match(html,/\\u003c\/script/);
 assert.throws(()=>renderMessagingPage(r,{timeoutMs:0}));
});

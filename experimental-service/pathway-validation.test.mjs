import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createPathwayValidation} from './pathway-validation.mjs'
import {references as fixtureReferences} from './reference-test-fixtures.mjs'
import {data} from './result-test-fixtures.mjs'
import {composeConstraints} from './messaging-state.mjs'
const validationReferences=()=>fixtureReferences(x=>{x.pathway.fields.personnelCategory.options=[{value:'PAT',label:'PAT'}];x.pathway.fields.managerStatus.options=['Sans responsabilité managériale','Nouveau manager'].map(value=>({value,label:value}))})
test('trois cas fixes : chargement gratuit, réservation unique même après erreur ou réouverture, rapports séparés',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'avatar-validation-series-'));t.after(()=>rmSync(dir,{recursive:true,force:true}))
 const refs=validationReferences();let posts=0
 const options={directory:dir,fetchImpl:async(url,init)=>{
  if(url.endsWith('/api/profile-references'))return new Response(JSON.stringify(refs),{headers:{'Content-Type':'application/json',ETag:'"'+refs.revision+'"'}})
  posts++;const p=JSON.parse(init.body)
  if(p.role==='Responsable d’une équipe administrative')throw Error('Erreur fictive après réservation')
  return new Response(JSON.stringify(data()),{headers:{'Content-Type':'application/json'}})
 }}
 let service=createPathwayValidation(options)
 const profile=id=>{const c=service.load(id,refs);return {...c.profile,constraints:composeConstraints(c.modality)}}
 const send=(p,n)=>service.session.buildPathway(p,{confirmed:true,referenceRevision:refs.revision,requestId:'validation_request_'+n})
 const p1=profile('V1');assert.equal(posts,0)
 await assert.rejects(send({...p1,objective:'Une autre demande'},'invalid_000'),e=>e.code==='invalid_profile');assert.equal(posts,0)
 assert.equal((await send(p1,'first_0001')).quota.total,1)
 await assert.rejects(send(p1,'repeat_001'),e=>e.code==='duplicate_request');assert.equal(service.session.status().total,1);assert.equal(posts,1)
 service=createPathwayValidation(options);assert.throws(()=>service.load('V1',refs),e=>e.code==='duplicate_request')
 await assert.rejects(send(profile('V2'),'second_001'));assert.equal(service.session.status().total,2);assert.equal(posts,2)
 service=createPathwayValidation(options);assert.throws(()=>service.load('V2',refs),e=>e.code==='duplicate_request')
 assert.equal((await send(profile('V3'),'third_0001')).quota.total,3);assert.equal(posts,3);assert.ok(service.cases().every(c=>c.attempted))
 const saved=JSON.parse(readFileSync(join(dir,'V1.result.json'),'utf8'));assert.equal(saved.caseId,'V1');assert.equal(saved.result.summary,data().summary)
 service=createPathwayValidation(options);assert.equal(service.session.status().total,3);assert.ok(service.cases().every(c=>c.attempted));assert.equal(posts,3)
})

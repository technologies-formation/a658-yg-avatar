import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {createParticipantUsage} from './participant-usage.mjs'
test('70 tentatives communes, catégories distinctes, isolation et persistance sans expiration',t=>{
 const directory=mkdtempSync(join(tmpdir(),'participant-usage-'));t.after(()=>rmSync(directory,{recursive:true,force:true}))
 let at=Date.parse('2026-10-30T12:00:00Z')
 const make=()=>createParticipantUsage({directory,ids:['pilote-01','pilote-02'],now:()=>at})
 let service=make()
 for(let i=0;i<70;i++){
  service.reserve('pilote-01',['dialogue','search','pathway'][i%3],'mixed_request_000'+i)
  if(i===20){at+=86400000;service=make()}
 }
 const q=service.status('pilote-01');assert.equal(q.totalUsed,70);assert.equal(q.remaining,0)
 assert.equal(q.totalDialogue,24);assert.equal(q.totalSearches,23);assert.equal(q.totalPathways,23)
 for(const action of ['dialogue','search','pathway'])assert.throws(()=>service.reserve('pilote-01',action,'denied_request_001'),e=>e.code==='participant_credit_exhausted')
 at+=86400000*365;service=make();assert.equal(service.status('pilote-01').remaining,0)
 service.reserve('pilote-02','dialogue','second_request_001');assert.equal(service.status('pilote-02').remaining,69)
 assert.equal(service.status('admin'),null);service.reserve('admin','dialogue','admin_request_001')
 service.visit('pilote-01');assert.ok(service.report('pilote-01').lastConnection)
 const name=readdirSync(directory).find(x=>x.endsWith('.attempt.json'));writeFileSync(join(directory,name),'{',{mode:0o600});assert.throws(()=>service.status('pilote-02'))
})
test('les événements historiques version 1 réduisent le crédit, doublons sans double débit',t=>{
 const directory=mkdtempSync(join(tmpdir(),'participant-migration-'));t.after(()=>rmSync(directory,{recursive:true,force:true}))
 const actor=createHash('sha256').update('pilote-01').digest('hex')
 writeFileSync(join(directory,'a'.repeat(64)+'.attempt.json'),JSON.stringify({version:1,actor,action:'pathway',at:'2026-10-30T12:00:00.000Z'}),{mode:0o600})
 const service=createParticipantUsage({directory,ids:['pilote-01']});assert.equal(service.status('pilote-01').remaining,69);assert.equal(service.status('pilote-01').totalPathways,1)
 service.reserve('pilote-01','search','duplicate_request_01')
 assert.throws(()=>service.reserve('pilote-01','search','duplicate_request_01'),e=>e.code==='duplicate_request')
 assert.equal(service.status('pilote-01').totalUsed,2)
})

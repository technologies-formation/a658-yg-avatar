import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readFileSync,readdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createParticipantUsage} from './participant-usage.mjs'
test('limites par testeur et jour Paris, réservations durables et absence de remise à zéro pour l’administrateur',t=>{
 const directory=mkdtempSync(join(tmpdir(),'participant-usage-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));let at=Date.parse('2026-10-30T12:00:00Z');const make=()=>createParticipantUsage({directory,ids:['pilote-01','pilote-02'],now:()=>at});let service=make();for(let i=0;i<10;i++)service.reserve('pilote-01','dialogue','dialogue_request_'+i);assert.throws(()=>service.reserve('pilote-01','dialogue','dialogue_request_x'),e=>e.code==='participant_daily_limit');service.reserve('pilote-02','dialogue','dialogue_request_a');assert.equal(service.status('pilote-02').dialogue,1);assert.equal(service.status('admin'),null);service.reserve('admin','dialogue','admin_request_001');
 for(let i=0;i<3;i++)service.reserve('pilote-01',i%2?'search':'pathway','research_request_'+i);assert.throws(()=>service.reserve('pilote-01','search','research_request_x'),e=>e.code==='participant_daily_limit');service.visit('pilote-01');service=make();assert.equal(service.status('pilote-01').research,3);assert.ok(service.report('pilote-01').lastConnection);at+=86400000;assert.equal(service.status('pilote-01').dialogue,0);assert.equal(service.report('pilote-01').totalDialogue,10);const name=readdirSync(directory).find(x=>x.endsWith('.attempt.json'));writeFileSync(join(directory,name),'{',{mode:0o600});assert.throws(()=>service.status('pilote-02'))
})

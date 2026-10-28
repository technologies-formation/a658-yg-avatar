import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createPublicPilotSessions} from './public-pilot-sessions.mjs'
test('cookies imprévisibles, pas de fixation ni de renouvellement implicite, expiration fixe et admissions bornées',t=>{
 const directory=mkdtempSync(join(tmpdir(),'public-sessions-'));t.after(()=>rmSync(directory,{recursive:true,force:true}))
 let at=Date.parse('2026-10-28T12:00:00Z'),sessions=createPublicPilotSessions({directory,now:()=>at}),header
 const response={setHeader(name,value){assert.equal(name,'Set-Cookie');header=value}},request=cookie=>({headers:{cookie}})
 assert.throws(()=>sessions.identify(request(''),response),e=>e.code==='public_session')
 const a=sessions.identify(request(''),response,{create:true}),cookie=header.split(';')[0]
 assert.match(header,/Secure; HttpOnly; SameSite=Strict/);assert.doesNotMatch(cookie,new RegExp(a.actor))
 sessions=createPublicPilotSessions({directory,now:()=>at});assert.deepEqual(sessions.identify(request(cookie),response),a)
 for(const invalid of [cookie+'; '+cookie,'__Host-a658_public_pilot='+'0'.repeat(64),'__Host-a658_public_pilot=forged'])assert.throws(()=>sessions.identify(request(invalid),response,{create:true}),e=>e.code==='public_session')
 for(let i=1;i<20;i++)sessions.identify(request(''),response,{create:true})
 assert.throws(()=>sessions.identify(request(''),response,{create:true}),e=>e.code==='public_admission_limit')
 at+=7*86400000;assert.throws(()=>sessions.identify(request(cookie),response,{create:true}),e=>e.code==='public_session')
 assert.equal(readdirSync(directory).length,20)
 for(const name of readdirSync(directory))assert.doesNotMatch(readFileSync(join(directory,name),'utf8'),/__Host|[a-f0-9]{64}|@/)
})

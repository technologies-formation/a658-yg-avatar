import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readdirSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createConsumptionLedger,trackConsumption,calculatedUsage,consumptionDay,reportingTokenMatches,readConsumptionEnvironment} from './consumption-ledger.mjs'
const dir=t=>{const d=mkdtempSync(join(tmpdir(),'consumption-test-'));t.after(()=>rmSync(d,{recursive:true,force:true}));return d}
test('suivi : une action utilisateur, coût multi-passes une fois, conservation et aucun contenu personnel',async t=>{
 const directory=dir(t),now=()=>Date.parse('2026-10-25T23:30:00Z'),ledger=createConsumptionLedger({directory,now});let calls=0
 const value={usage:{total:{cost:.0230041,input:90040,output:412}}}
 assert.equal(await trackConsumption(ledger,'assistant','pathway',async()=>{calls++;return value},calculatedUsage),value)
 const s=createConsumptionLedger({directory,now}).snapshot({since:'2026-10-25T23:00:00.000Z'})
 assert.equal(calls,1);assert.equal(s.rows.length,1);assert.equal(s.rows[0].requests,1);assert.equal(s.rows[0].day,'2026-10-26');assert.equal(s.knownMicroUsd,23005);assert.equal(s.unknown,0)
 const raw=readdirSync(directory).map(p=>readFileSync(join(directory,p),'utf8')).join('');assert.doesNotMatch(raw,/profile|recipient|apiKey|messages|password/)
})
test('suivi : erreur ou coupure reste inconnue, jamais zéro inventé ni relance',async t=>{
 const ledger=createConsumptionLedger({directory:dir(t)});let calls=0
 await assert.rejects(trackConsumption(ledger,'catalogue','search',async()=>{calls++;throw Error('TEST_ERROR')},calculatedUsage))
 ledger.begin('assistant','dialogue')
 const s=ledger.snapshot();assert.equal(calls,1);assert.equal(s.unknown,2);assert.equal(s.knownMicroUsd,0);assert.equal(s.rows.reduce((n,r)=>n+r.requests,0),2)
})
test('suivi : activation explicite, jeton protégé, fuseau et archive corrompue refusée',async t=>{
 assert.equal(readConsumptionEnvironment({get A658_REPORT_TOKEN(){throw Error('must not read')}}),null)
 const token='a'.repeat(43);assert.equal(reportingTokenMatches(token,token),true);assert.equal(reportingTokenMatches('b'.repeat(43),token),false)
 assert.equal(consumptionDay('2026-10-24T22:30:00Z'),'2026-10-25');assert.equal(consumptionDay('2026-10-25T22:30:00Z'),'2026-10-25')
 const directory=dir(t),ledger=createConsumptionLedger({directory});ledger.begin('catalogue','search');const p=readdirSync(directory).find(n=>n.endsWith('.event.json'));writeFileSync(join(directory,p),'BROKEN');assert.throws(()=>ledger.snapshot())
})
test('suivi privé : jeton requis, GET uniquement et aucune donnée personnelle exposée',async t=>{
 const {handleConsumptionRequest}=await import('./consumption-ledger.mjs')
 const ledger=createConsumptionLedger({directory:dir(t)}),token='a'.repeat(43),url=new URL('https://example.invalid/api/private/consumption')
 const call=(headers={},method='GET')=>{let status,body;const response={writeHead(value){status=value},end(value){body=JSON.parse(value)}};assert.equal(handleConsumptionRequest({ledger,token},{headers,method},response,url),true);return {status,body}}
 assert.equal(call().status,404);assert.equal(call({authorization:'Bearer '+'b'.repeat(43)}).status,404);assert.equal(call({authorization:token}).status,404);assert.equal(call({authorization:'Bearer '+token},'POST').status,405)
 const value=call({authorization:'Bearer '+token});assert.equal(value.status,200);assert.equal(value.body.version,1);assert.equal('token' in value.body,false)
})

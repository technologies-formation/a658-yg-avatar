import test from 'node:test'
import assert from 'node:assert/strict'
import {requestPathwayTicket} from './pathway-ticket.mjs'
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
const good={references:{pathway:{fields:{}},revision:'revision'},requestId:'ticket'}
test('403 HTTPS transitoire : un seul GET repris après refroidissement, jamais de POST',async()=>{
 let reads=0,waits=0,notices=0
 const result=await requestPathwayTicket({fetchImpl:async(url,init)=>{assert.equal(url,'/private/profile-references');assert.equal(init.method,undefined);reads++;return reads===1?json({code:'secure_transport_required'},403):json(good)},waitImpl:async ms=>{assert.ok(ms>5000);waits++},onRecovery:()=>notices++})
 assert.deepEqual(result,good);assert.equal(reads,2);assert.equal(waits,1);assert.equal(notices,1)
})
test('refus persistant, authentification et panne réseau : arrêt borné sans recherche ni relance payante',async()=>{
 let reads=0
 await assert.rejects(requestPathwayTicket({fetchImpl:async()=>{reads++;return json({code:'secure_transport_required'},403)},waitImpl:async()=>{}}),e=>e.code==='secure_transport_required');assert.equal(reads,2)
 reads=0;await assert.rejects(requestPathwayTicket({fetchImpl:async()=>{reads++;return json({},401)},waitImpl:async()=>assert.fail()}),e=>e.code==='private_auth_required');assert.equal(reads,1)
 reads=0;await assert.rejects(requestPathwayTicket({fetchImpl:async()=>{reads++;throw Error('Réseau absent')},waitImpl:async()=>assert.fail()}));assert.equal(reads,1)
})
test('annulation pendant la reprise gratuite : aucun second appel',async()=>{
 const controller=new AbortController();let reads=0
 await assert.rejects(requestPathwayTicket({signal:controller.signal,fetchImpl:async()=>{reads++;return json({code:'secure_transport_required'},403)},waitImpl:async()=>controller.abort()}),e=>e.name==='AbortError');assert.equal(reads,1)
})

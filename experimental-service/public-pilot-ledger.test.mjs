import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readdirSync,readFileSync,writeFileSync,symlinkSync,unlinkSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createPublicPilotLedger,PUBLIC_POLICY} from './public-pilot-ledger.mjs'
const actor='a'.repeat(64),other='b'.repeat(64)
function fixture(t){const directory=mkdtempSync(join(tmpdir(),'public-ledger-'));let at=Date.parse('2026-10-28T12:00:00Z'),ledger=createPublicPilotLedger({directory,now:()=>at});t.after(()=>{ledger.close();rmSync(directory,{recursive:true,force:true})});return {directory,get ledger(){return ledger},tick(ms=11000){at+=ms},reopen(){ledger.close();ledger=createPublicPilotLedger({directory,now:()=>at})}}}
const reserve=(f,id,action='dialogue',who=actor)=>f.ledger.reserve({actor:who,action,requestId:'request_public_'+id})

test('enveloppe commune de cinq dollars : redémarrage, nouvel acteur et nouveau jour ne la renouvellent pas',t=>{
 const f=fixture(t)
 reserve(f,'0001','search');f.tick();reserve(f,'0002','pathway');f.reopen();f.tick();reserve(f,'0003','search',other);f.tick(86400000);reserve(f,'0004','pathway',other)
 assert.equal(f.ledger.status(actor).reservedMicroUsd,5_000_000)
 f.reopen();f.tick();assert.throws(()=>reserve(f,'0005','dialogue','c'.repeat(64)),e=>e.code==='public_budget_limit')
 assert.equal(readdirSync(f.directory).filter(n=>n.startsWith('reservation-')).length,4)
 // Les résultats déjà obtenus peuvent toujours être partagés sans nouvelle génération.
 reserve(f,'mail01','mail');assert.equal(f.ledger.status(actor).mail,1)
})
test('limites quotidiennes, cadence et doublons durables, sans remboursement après un échec',t=>{
 const f=fixture(t);reserve(f,'0001');assert.throws(()=>reserve(f,'0002'),e=>e.code==='public_cadence');f.tick()
 assert.throws(()=>reserve(f,'0001'),e=>e.code==='public_duplicate')
 for(let i=2;i<=10;i++){reserve(f,String(i).padStart(4,'0'));f.tick()}
 f.reopen();assert.throws(()=>reserve(f,'0011'),e=>e.code==='public_daily_limit');assert.equal(f.ledger.status(actor).dialogue,10)
 f.tick(86400000);reserve(f,'0012');assert.equal(f.ledger.status(actor).dialogue,1);assert.equal(f.ledger.status(actor).reservedMicroUsd,110000)
})
test('recherche et parcours partagent trois tentatives quotidiennes ; deux courriels par visiteur',t=>{
 const f=fixture(t);reserve(f,'0001','search');f.tick();reserve(f,'0002','pathway');f.tick();reserve(f,'0003','search');f.tick()
 assert.throws(()=>reserve(f,'0004','pathway'),e=>e.code==='public_daily_limit')
 reserve(f,'mail01','mail');reserve(f,'mail02','mail');assert.throws(()=>reserve(f,'mail03','mail'),e=>e.code==='public_mail_limit')
 assert.equal(f.ledger.status(actor).reservedMicroUsd,3750000)
})
test('échec d’écriture et arrêt persistent bloquent les prochains départs ; aucune donnée métier dans le registre',t=>{
 const f=fixture(t);reserve(f,'0001');f.ledger.stop();f.reopen();f.tick();assert.throws(()=>reserve(f,'0002'),e=>e.code==='public_stopped')
 const text=readdirSync(f.directory).filter(n=>n.endsWith('.json')).map(n=>readFileSync(join(f.directory,n),'utf8')).join('')
 assert.doesNotMatch(text,/@|Police|objectif|password|recipient|request_public_/)
})
test('instance concurrente, archive corrompue, politique changée et liens symboliques : refus fermé',t=>{
 const f=fixture(t);assert.throws(()=>createPublicPilotLedger({directory:f.directory}),e=>e.code==='public_locked')
 assert.throws(()=>createPublicPilotLedger({directory:f.directory,policy:{...PUBLIC_POLICY,limitMicroUsd:10_000_000}}),e=>e.code==='public_policy')
 reserve(f,'0001');f.ledger.close();writeFileSync(join(f.directory,'reservation-000001.json'),'{}',{mode:0o600});assert.throws(()=>f.reopen())
 const link=join(f.directory,'linked');symlinkSync(f.directory,link);assert.throws(()=>createPublicPilotLedger({directory:link}))
})
test('un échec de persistance avant réservation ne permet aucun nouveau départ',t=>{
 const f=fixture(t);writeFileSync(join(f.directory,'reservation-000001.json'),'occupied',{mode:0o600})
 assert.throws(()=>reserve(f,'0001'),e=>e.code==='public_storage');assert.throws(()=>reserve(f,'0002'),e=>e.code==='public_stopped')
})
test('suppression d’une réservation en fin de journal : refus plutôt qu’une baisse de l’enveloppe',t=>{
 const f=fixture(t);reserve(f,'0001');f.ledger.close();unlinkSync(join(f.directory,'reservation-000001.json'));assert.throws(()=>f.reopen(),e=>e.code==='public_storage')
})

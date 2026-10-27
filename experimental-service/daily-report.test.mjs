import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createConsumptionLedger} from './consumption-ledger.mjs'
import {createDailyReportModel,renderDailyReport} from './daily-report-model.mjs'
import {createDailyReporter,prepareDailyReport,readDailyReportEnvironment} from './daily-report.mjs'
const temp=t=>{const d=mkdtempSync(join(tmpdir(),'daily-report-test-'));t.after(()=>rmSync(d,{recursive:true,force:true}));return d}
const baseline={at:'2026-10-24T08:00:00.000Z',balanceMicroUsd:9160000},now=()=>Date.parse('2026-10-26T07:00:00Z')
function sources(t){const root=temp(t),catalogue=createConsumptionLedger({directory:join(root,'catalogue'),now:()=>Date.parse('2026-09-01T07:00:00Z')}),assistant=createConsumptionLedger({directory:join(root,'assistant'),now:()=>Date.parse('2026-09-01T07:00:00Z')});return {root,catalogue,assistant}}
test('récapitulatif : quinze jours, mois précédents, solde théorique et critères de non-double comptage',t=>{
 const {catalogue,assistant}=sources(t)
 const c=catalogue.snapshot({since:baseline.at}),a=assistant.snapshot({since:baseline.at})
 c.rows=[{day:'2026-09-30',app:'catalogue',action:'search',requests:3,errors:0,unknown:0,knownMicroUsd:30000,inputTokens:500,outputTokens:100}]
 c.knownMicroUsd=7200000;c.observedAt='2026-10-26T07:00:00.000Z';a.observedAt=c.observedAt
 const model=createDailyReportModel({catalogue:c,assistant:a,baseline,now:new Date(now()),configurationFile:'/private/config.json'})
 assert.equal(model.days.length,15);assert.equal(model.days[0].day,'2026-10-25');assert.equal(model.days.at(-1).day,'2026-10-11');assert.equal(model.days.at(-1).available,true);assert.equal(model.previousMonths[0].month,'2026-09');assert.equal(model.balanceMicroUsd,1960000);assert.equal(model.low,true)
 const mail=renderDailyReport(model);assert.match(mail.subject,/OpenAI.*≤ 2/);assert.match(mail.text,/Modifier le destinataire/);assert.match(mail.html,/recipient/);const late={...c,startedAt:'2026-10-24T07:00:00.000Z',rows:[]},lateAssistant={...a,startedAt:late.startedAt};const partial=createDailyReportModel({catalogue:late,assistant:lateAssistant,baseline,now:new Date(now())});assert.equal(partial.days.at(-1).available,false);assert.match(renderDailyReport(partial).text,/Non collecté/);assert.match(mail.text,/solde OpenAI reste la référence/)
 assert.doesNotMatch(mail.html,/NaN|undefined/)
})
test('récapitulatif : coût inconnu ou repère antérieur interdit un faux solde rassurant',t=>{
 const {catalogue,assistant}=sources(t);catalogue.begin('catalogue','search')
 const c=catalogue.snapshot({since:baseline.at}),a=assistant.snapshot({since:baseline.at});c.unknown=1;c.observedAt=a.observedAt='2026-10-26T07:00:00.000Z'
 const model=createDailyReportModel({catalogue:c,assistant:a,baseline,now:new Date(now())});assert.equal(model.balanceMicroUsd,null);assert.match(renderDailyReport(model).text,/Solde non calculable/)
 a.rows=[{...c.rows[0],app:'assistant',action:'pathway'}];assert.throws(()=>createDailyReportModel({catalogue:c,assistant:a,baseline,now:new Date(now())}))
})
test('récapitulatif : un seul envoi même après redémarrage, jours manqués sans rafale, aucune IA',async t=>{
 const {root,catalogue,assistant}=sources(t),directory=join(root,'reports');let sends=0,reads=0
 const config={directory,configurationFile:'/private/config.json',recipient:'report@example.invalid',hour:8,baseline,thresholdMicroUsd:2000000}
 const options={config,now,consumption:{ledger:assistant,token:'a'.repeat(43)},mail:{async sendReport(message){sends++;assert.equal(message.recipient,config.recipient);return {accepted:true}}},fetchImpl:async(url,init)=>{reads++;assert.match(url,/^https:\/\/api\.a658yg-catalogue\.ch\/api\/private\/consumption\?/);assert.equal(init.method,'GET');return new Response(JSON.stringify(catalogue.snapshot({since:baseline.at})),{headers:{'content-type':'application/json'}})}}
 const worker=createDailyReporter(options);assert.deepEqual(await worker.tick(),{sent:true});assert.equal((await createDailyReporter(options).tick()).alreadyAttempted,true);assert.equal(sends,1);assert.equal(reads,1)
 assert.equal(readdirSync(directory).filter(n=>n.endsWith('.attempt.json')).length,1)
})
test('récapitulatif : panne de collecte ou SMTP incertaine sans fausse valeur ni second courriel',async t=>{
 const {root,assistant}=sources(t);let sends=0
 const options={config:{directory:join(root,'reports'),configurationFile:'/private/config.json',recipient:'report@example.invalid',hour:8,baseline},now,consumption:{ledger:assistant,token:'a'.repeat(43)},fetchImpl:async()=>{throw Error('FAKE_SECRET')},mail:{async sendReport(message){sends++;assert.match(message.text,/Aucun solde théorique fiable/);assert.doesNotMatch(message.text,/FAKE_SECRET/);throw Error('FAKE_SMTP_SECRET')}}}
 assert.equal((await createDailyReporter(options).tick()).uncertain,true);assert.equal((await createDailyReporter(options).tick()).alreadyAttempted,true);assert.equal(sends,1)
})
test('récapitulatif : préparation désactivée, destinataire modifiable, aucun ancien compteur remplacé',t=>{
 const root=temp(t),file=prepareDailyReport(root,'report@example.invalid');const c=JSON.parse(readFileSync(file));assert.equal(c.enabled,false);assert.equal(c.hour,8);assert.equal(c.recipient,'report@example.invalid');assert.throws(()=>prepareDailyReport(root,'other@example.invalid'));assert.equal(readDailyReportEnvironment({},root),null)
})
test('récapitulatif : 08 h Paris, changement d’heure et absence de rattrapages multiples',async t=>{
 const {root,assistant,catalogue}=sources(t);let current=Date.parse('2026-10-24T05:59:00Z'),sends=0
 const options={config:{directory:join(root,'clock'),configurationFile:'/private/config.json',recipient:'report@example.invalid',hour:8,baseline},now:()=>current,consumption:{ledger:assistant,token:'a'.repeat(43)},fetchImpl:async()=>new Response(JSON.stringify(catalogue.snapshot({since:baseline.at})),{headers:{'content-type':'application/json'}}),mail:{async sendReport(){sends++;return {accepted:true}}}}
 const w=createDailyReporter(options);await w.tick();assert.equal(sends,0)
 current=Date.parse('2026-10-24T06:00:00Z');await w.tick();assert.equal(sends,1)
 current=Date.parse('2026-10-25T06:59:00Z');await w.tick();assert.equal(sends,1)
 current=Date.parse('2026-10-25T07:00:00Z');await w.tick();assert.equal(sends,2)
 current=Date.parse('2026-10-29T12:00:00Z');await w.tick();assert.equal(sends,3)
 await w.tick();assert.equal(sends,3)
})

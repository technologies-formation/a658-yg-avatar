// Présentation du courriel avec données synthétiques uniquement ; aucun envoi ni accès distant.
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createDailyReportModel,renderDailyReport} from './daily-report-model.mjs'
const {chromium}=await import(process.env.AVATAR_PLAYWRIGHT_MODULE||'playwright')
const baseline={at:'2026-09-01T12:00:00.000Z',balanceMicroUsd:10000000}
const source=()=>({version:1,startedAt:'2026-09-01T10:00:00.000Z',observedAt:'2026-10-26T07:00:00.000Z',since:baseline.at,knownMicroUsd:0,unknown:0,rows:[]})
const catalogue=source(),assistant=source()
for(let i=0;i<15;i++)catalogue.rows.push({day:'2026-10-'+String(25-i).padStart(2,'0'),app:i%2?'catalogue':'assistant',action:i%2?'search':'pathway',requests:2,errors:0,unknown:0,knownMicroUsd:20000,inputTokens:1000,outputTokens:100})
assistant.rows.push({day:'2026-10-25',app:'assistant',action:'dialogue',requests:4,errors:0,unknown:0,knownMicroUsd:2000,inputTokens:300,outputTokens:100})
catalogue.knownMicroUsd=8200000
catalogue.unknown=1
const message=renderDailyReport(createDailyReportModel({catalogue,assistant,baseline,now:new Date('2026-10-26T07:00:00Z'),configurationFile:'/private/daily-report/config.json'}))
const browser=await chromium.launch({headless:true});mkdirSync('visual-check',{recursive:true})
try{for(const [name,width]of [['desktop',900],['mobile',390],['small-mobile',320]]){
 const page=await browser.newPage({viewport:{width,height:900}}),requests=[],errors=[]
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort()});page.on('pageerror',error=>errors.push(error.message))
 await page.setContent('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">'+message.html+'</body></html>')
 assert.equal(await page.locator('table').first().locator('tbody tr').count(),15)
 assert.match(await page.locator('body').innerText(),/Solde théorique \(à vérifier\)/)
 assert.match(await page.locator('body').innerText(),/Modifier le destinataire/)
 assert.match(await page.locator('body').innerText(),/peut surestimer/)
 assert.match(message.subject,/Solde théorique \(à vérifier\).*coûts incomplets/)
 assert.equal(await page.getByRole('link',{name:'Vérifier mon solde réel OpenAI',exact:true}).getAttribute('href'),'https://platform.openai.com/settings/organization/billing/overview')
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 assert.deepEqual(requests,[]);assert.deepEqual(errors,[])
 await page.screenshot({path:'visual-check/daily-report-'+name+'.png',fullPage:true});await page.close()
}writeFileSync('visual-check/daily-report-synthetic.html',message.html)}finally{await browser.close()}

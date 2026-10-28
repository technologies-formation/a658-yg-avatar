import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs'
import {join,resolve,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {tmpdir} from 'node:os'
import {publicPilotFixture} from './public-pilot-test-fixtures.mjs'

test('contrat public réel entre les deux services, avec IA fictive et journal avant départ', {skip:!process.env.AVATAR_PUBLIC_CATALOGUE_MODULE},async t=>{
 const modulePath=resolve(process.env.AVATAR_PUBLIC_CATALOGUE_MODULE)
 const {createPublicCatalogueApi}=await import(pathToFileURL(modulePath))
 assert.equal(readFileSync(join(dirname(modulePath),'publicCostPolicy.mjs'),'utf8'),readFileSync(new URL('./public-cost-policy.mjs',import.meta.url),'utf8'))
 const directory=mkdtempSync(join(tmpdir(),'public-contract-')),paid=[]
 const course={code:'PUBLIC-TEST',title:'Word — fiche fictive',officialData:{titleRaw:'Word — fiche fictive',publicRaw:'Public de test'},sourceUrl:'https://outils.ge.ch/referentiel/formation/CatalogueDescription/PUBLIC-TEST.html'}
 const active={metadata:{snapshotDate:'2026-10-27',snapshotHash:'a'.repeat(64)},search:{courses:[course],ultraCompactCatalogue:[['PUBLIC-TEST',course.title]],officialCodes:['PUBLIC-TEST'],detailedByCode:new Map([['PUBLIC-TEST',course]]),courseByCode:new Map([['PUBLIC-TEST',course]])}}
 const handler=createPublicCatalogueApi({enabled:true,token:'b'.repeat(43),directory,getCatalogue:()=>active,apiKey:'FAKE_KEY',now:()=>Date.parse('2026-10-28T12:00:00Z'),fetchImpl:async(_url,init)=>{
  assert.equal(readdirSync(directory).filter(n=>n.endsWith('.json')).length,1)
  const body=JSON.parse(init.body);paid.push(body)
  const result=paid.length===1?{codes:['PUBLIC-TEST'],interpretedGoal:'Word'}:{recommendedCodes:['PUBLIC-TEST'],complementaryCodes:[],relatedCodes:[],reason:'Résultat fictif',abstain:false}
  return new Response(JSON.stringify({status:'completed',model:'gpt-5.6-luna',service_tier:'default',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(result)}]}]}),{headers:{'Content-Type':'application/json'}})
 }})
 const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'https://catalogue.invalid')))
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true})})
 const f=await publicPilotFixture(t),base=f.options.fetchImpl
 f.options.fetchImpl=(url,init)=>new URL(url).pathname.startsWith('/api/public/')?fetch('http://127.0.0.1:'+server.address().port+new URL(url).pathname,init):base(url,init)
 await f.reopen()
 const cookie=await f.enter();await f.mode(cookie,'search');const draft=await f.get(cookie)
 const result=await f.request('/public/course-search',{cookie,body:{query:'Word',requestId:'public-contract-request-1',confirmed:true,expectedRevision:draft.draft.revision}})
 assert.equal(result.status,200,result.text)
 assert.equal(paid.length,2);assert.ok(paid.every(b=>b.service_tier==='default'&&b.max_output_tokens<=1200&&b.prompt_cache_options.ttl==='30m'))
 const state=await f.get(cookie);assert.equal(state.publicQuota.research,1);assert.equal(state.savedPathways.length,1)
 assert.equal(f.emails.length,0)
})

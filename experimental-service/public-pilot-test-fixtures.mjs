import {PUBLIC_COST_POLICY,publicCostUpper} from './public-cost-policy.mjs'
import assert from 'node:assert/strict'
import http from 'node:http'
import {mkdtempSync,mkdirSync,rmSync,readdirSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {createPreparedPublicPilot} from './public-pilot.mjs'
import {references} from './reference-test-fixtures.mjs'
import {data} from './result-test-fixtures.mjs'
const origin='https://public-test.invalid',json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
export async function publicPilotFixture(t,{mailPending=false}={}){
 const root=mkdtempSync(join(tmpdir(),'public-gateway-')),privateDirectory=join(root,'private'),directory=join(root,'public');mkdirSync(privateDirectory,{mode:0o700})
 writeFileSync(join(privateDirectory,'private-sentinel.txt'),'PRIVATE_STATE_MUST_NOT_CHANGE',{mode:0o600})
 const refs=references(v=>{v.pathway.fields.professionalEnvironment={type:'string',maxLength:4000,requiredInApi:false,requiredInForm:false,formControl:'select',options:[{value:'Police',label:'Police'}]}}),version={snapshotDate:'2026-10-27',snapshotHash:'a'.repeat(64)}
 let at=Date.parse('2026-10-28T12:00:00Z'),calls=[],emails=[],events=[],failNext=false,hold=null,policyReady=true
 const options={enabled:true,billingReviewed:true,backendBoundsReviewed:true,directory,privateDirectory,publicOrigin:origin,now:()=>at,apiKey:'SYNTHETIC_PUBLIC_TEST_KEY',backendToken:'b'.repeat(43),allowedRecipients:['tester@example.invalid'],
  isSecureRequest:req=>req.headers['x-test-secure']==='true',loadProfileReferences:()=>refs,loadCatalogueStatus:()=>version,preview:data(),
  consumption:{token:'t'.repeat(43),ledger:{begin(app,action){const event={app,action};events.push(event);return(outcome,usage)=>Object.assign(event,{outcome,usage})}}},
  mail:{from:'sender@example.invalid',transport:{sendMail:async message=>{emails.push(message);return {accepted:[message.to.address],rejected:[]}}},buildPdf:()=>({model:{title:'Résultat fictif',filename:'test.pdf',simulation:false},content:Buffer.from('FAKE_PDF')})},
  fetchImpl:async(url,init)=>{
   const paid=init.method==='POST';if(paid){calls.push(url);assert.ok(readdirSync(join(directory,'ledger')).some(n=>n.startsWith('reservation-')));if(url.startsWith('https://api.a658yg-catalogue.ch/'))assert.equal(init.headers['X-A658-Report-Token'],'t'.repeat(43));if(hold)await hold;if(failNext){failNext=false;throw Error('synthetic ambiguous failure')}}
   if(url.endsWith('/api/public/policy')){assert.equal(init.headers.Authorization,'Bearer '+'b'.repeat(43));return json({policy:policyReady?PUBLIC_COST_POLICY.id:'unverified'})}
   const publicCostProof={policy:PUBLIC_COST_POLICY.id,model:'gpt-5.6-luna',serviceTier:'default',cacheTtl:'30m',calls:[{inputTokens:1000,outputTokens:100}],upperMicroUsd:publicCostUpper('research',1000,100)}
   if(url==='https://api.openai.com/v1/responses')return json({status:'completed',model:'gpt-6-luna',service_tier:'default',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({kind:'ask',reply:'Quel est votre objectif ?',changes:[]})}]}]})
   if(url.endsWith('/api/profile-references'))return new Response(JSON.stringify(refs),{headers:{'Content-Type':'application/json',ETag:'"'+refs.revision+'"'}})
   if(url.endsWith('/api/catalogue'))return json({catalogue:version,courses:[{code:'PUBLIC-TEST',sourceUrl:'https://outils.ge.ch/referentiel/formation/CatalogueDescription/PUBLIC-TEST.html',officialData:{titleRaw:'Word — fiche fictive',durationRaw:'1 jour',publicRaw:'Public de test'}}]})
   if(url.endsWith('/api/public/search'))return json({ok:true,publicCostProof,catalogue:version,results:[{code:'PUBLIC-TEST'}],reason:'Résultat fictif'})
   if(url.endsWith('/api/public/pathway'))return json({...data(),publicCostProof})
   throw Error('unexpected synthetic destination')
  }}
 const configuredMail=options.mail
 if(mailPending){delete options.allowedRecipients;Object.defineProperty(options,'mail',{configurable:true,get(){throw Error('Pending recipients must not load SMTP configuration')}})}
 let service=createPreparedPublicPilot(options)
 const server=http.createServer((req,res)=>service.handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();assert.equal(readFileSync(join(privateDirectory,'private-sentinel.txt'),'utf8'),'PRIVATE_STATE_MUST_NOT_CHANGE');rmSync(root,{recursive:true,force:true})})
 const request=(path,{body,raw,cookie='',secure=true,source=origin,headers={}}={})=>new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method:body||raw?'POST':'GET',headers:{host:new URL(origin).host,origin:source,'x-test-secure':String(secure),'content-type':'application/json',...(cookie?{cookie}:{}),...headers}},res=>{
   let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>{let value;try{value=JSON.parse(text)}catch{}resolve({status:res.statusCode,headers:res.headers,text,value})})
  });req.on('error',reject);req.end(raw??(body?JSON.stringify(body):undefined))
 })
 const enter=async()=>{const r=await request('/public/');assert.equal(r.status,200);return r.headers['set-cookie'][0].split(';')[0]}
 const get=async cookie=>{const result=await request('/public/dialogue',{cookie});assert.equal(result.status,200,result.text);return result.value}
 const mode=async(cookie,requestMode='pathway')=>request('/public/dialogue',{cookie,body:{action:'request-mode',requestMode,intent:'start',confirmed:true,expectedRevision:(await get(cookie)).draft.revision}})
 const turn=async(cookie,requestId=randomUUID())=>request('/public/dialogue',{cookie,body:{action:'turn',message:'Un besoin fictif',paidTrialConfirmed:true,requestId,expectedRevision:(await get(cookie)).draft.revision,referenceRevision:refs.revision}})
 return {root,directory,privateDirectory,options,configuredMail,request,enter,get,mode,turn,calls,emails,events,port:server.address().port,setPolicy(value){policyReady=value},stop(){service.stop()},tick(ms=11000){at+=ms},fail(){failNext=true},setHold(value){hold=value},async reopen(){await service.close();service=createPreparedPublicPilot(options)}}
}

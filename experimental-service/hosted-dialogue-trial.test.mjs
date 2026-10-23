import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareHostedDialogueTrial,readHostedDialogueTrialConfig,createHostedDialogueTrial,readDialogueTrialLaunch } from './hosted-dialogue-trial.mjs'
import { HOSTED_ORIGIN } from './hosted-transport.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { references } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'avatar-hosted-real-dialogue-')),site=join(root,'site'),directory=join(root,'private')
 let cleanup=()=>{};mkdirSync(site);mkdirSync(directory,{mode:0o700});t.after(async()=>{await cleanup();rmSync(root,{recursive:true,force:true})})
 const write=(name,value)=>writeFileSync(join(directory,name),JSON.stringify(value),{mode:0o600})
 write('config.json',{publicOrigin:HOSTED_ORIGIN,port:3000,privateDirectory:directory,proxyVerification:'self-https',interface:'dialogue-fictitious',unrelatedSecret:'FAKE_MUST_NOT_COPY'})
 write('users.json',[]);write('references.json',references());write('preview.json',data());write('quotas.json',{day:20749,daily:4,total:4,stopped:false})
 write('hosted-real-one-attempt-quotas.json',{daily:1,total:1})
 return {root,site,directory,file:join(directory,'config.json'),setCleanup(fn){cleanup=fn}}
}
test('préparation hors ligne exclusive : configuration désactivée, permissions privées et anciens compteurs intacts',t=>{
 const f=fixture(t),names=['config.json','users.json','references.json','preview.json','quotas.json','hosted-real-one-attempt-quotas.json'],before=names.map(n=>readFileSync(join(f.directory,n),'utf8'))
 const prepared=prepareHostedDialogueTrial(f.file,f.site),options=readHostedDialogueTrialConfig(prepared.configFile,f.site)
 assert.equal(options.enabled,false);assert.equal(options.billingReviewed,false);assert.equal(options.paidTrialAuthorized,false)
 assert.equal(options.privateDirectory,f.directory+'.dialogue-trial');assert.equal(statSync(options.privateDirectory).mode&0o077,0)
 assert.equal(statSync(prepared.configFile).mode&0o077,0);assert.equal(statSync(options.budgetDirectory).mode&0o077,0)
 assert.doesNotMatch(readFileSync(prepared.configFile,'utf8'),/FAKE_MUST_NOT_COPY/)
 assert.equal(existsSync(options.stateFile),false);assert.equal(existsSync(join(options.privateDirectory,'hosted-real-one-attempt-quotas.json')),false)
 assert.throws(()=>prepareHostedDialogueTrial(f.file,f.site));assert.deepEqual(names.map(n=>readFileSync(join(f.directory,n),'utf8')),before)
})
test('lancement refusé avant lecture de clé et avant création de verrou ou registre',t=>{
 const f=fixture(t),prepared=prepareHostedDialogueTrial(f.file,f.site),options=readHostedDialogueTrialConfig(prepared.configFile,f.site)
 const env={AVATAR_DIALOGUE_TRIAL_ENABLED:'true',get AVATAR_DIALOGUE_OPENAI_API_KEY(){throw Error('clé non consultable')}}
 assert.throws(()=>readDialogueTrialLaunch(prepared.configFile,f.site,env),/non activée/)
 assert.throws(()=>readDialogueTrialLaunch(prepared.configFile,f.site,{}),/environnement/)
 assert.throws(()=>createHostedDialogueTrial({...options,get apiKey(){throw Error('ne pas lire')}}),/désactivé/)
 assert.equal(existsSync(options.stateFile+'.lock'),false);assert.equal(existsSync(join(options.budgetDirectory,'.dialogue-lock')),false)
 const raw=JSON.parse(readFileSync(prepared.configFile,'utf8'));raw.dialogueTrial.enabled=true;raw.dialogueTrial.paidTrialAuthorized=true
 writeFileSync(prepared.configFile,JSON.stringify(raw));assert.throws(()=>readDialogueTrialLaunch(prepared.configFile,f.site,env),/non activée/)
})
test('transport hébergé réel injecté : HTTPS, zéro appel à l’ouverture, confirmation requise et budget persistant',async t=>{
 const f=fixture(t),prepared=prepareHostedDialogueTrial(f.file,f.site),options=readHostedDialogueTrialConfig(prepared.configFile,f.site),password='FAKE_HOSTED_TRIAL_PASSWORD',refs=references()
 const user=await createPilotCredential({id:'tester',username:'tester',password});let calls=0
 const active={...options,enabled:true,paidTrialAuthorized:true,billingReviewed:true,apiKey:'FAKE_HOSTED_KEY',proxyVerification:'exact-addresses',trustedProxyAddresses:['127.0.0.1'],users:[user],fetchImpl:async(url)=>{
  calls++;return new Response(JSON.stringify(url.endsWith('/input_tokens')?{object:'response.input_tokens',input_tokens:1000}:{status:'completed',model:'gpt-6-luna',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({kind:'ask',reply:'Quel est votre métier ?',changes:[]})}]}]}),{headers:{'Content-Type':'application/json'}})
 }}
 let service=createHostedDialogueTrial(active);await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve))
 f.setCleanup(async()=>{if(service.server.listening)await service.close()})
 const request=(path,body,proto='https')=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:service.server.address().port,path,method:body?'POST':'GET',headers:{host:new URL(HOSTED_ORIGIN).host,origin:HOSTED_ORIGIN,'x-forwarded-proto':proto,'content-type':'application/json',authorization:'Basic '+Buffer.from('tester:'+password).toString('base64')}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>{let value;try{value=JSON.parse(text)}catch{}resolve({status:res.statusCode,text,value,headers:res.headers})})});req.on('error',reject);req.end(body&&JSON.stringify(body))
 })
 assert.equal((await request('/private/',undefined,'http')).status,403)
 assert.equal((await request('/private/')).status,200);assert.equal(calls,0)
 const body={action:'turn',requestId:'hosted_real_dialogue_0001',message:'Je voudrais progresser sur Word.',expectedRevision:0,referenceRevision:refs.revision}
 assert.equal((await request('/private/dialogue',body)).value.code,'unconfirmed');assert.equal(calls,0)
 assert.equal((await request('/private/dialogue',{...body,paidTrialConfirmed:true})).status,200);assert.equal(calls,2)
 assert.equal((await request('/private/dialogue')).value.budget.attempts,1)
 await service.close();service=createHostedDialogueTrial(active);await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve))
 assert.equal((await request('/private/dialogue')).value.budget.attempts,1);assert.equal(calls,2)
})

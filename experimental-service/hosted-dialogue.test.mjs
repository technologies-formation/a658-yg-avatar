import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHostedSimulation, HOSTED_ORIGIN, readHostedConfig, setHostedSimulationInterface } from './hosted-simulation.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { references } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'
const password='SYNTHETIC_HOSTED_DIALOGUE_PASSWORD'

test('dialogue hébergé opt-in : proxy et authentification, compteur partagé et conservé après fermeture',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'avatar-hosted-dialogue-')),user=await createPilotCredential({id:'tester',username:'tester',password}),refs=references()
 const options={enabled:true,interface:'dialogue-fictitious',publicOrigin:HOSTED_ORIGIN,trustedProxyAddresses:['127.0.0.1'],users:[user],stateFile:join(directory,'quotas.json'),loadProfileReferences:()=>refs,preview:data()}
 let service=createHostedSimulation(options)
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve))
 t.after(async()=>{if(service.server.listening)await service.close();rmSync(directory,{recursive:true,force:true})})
 const request=(path,{body,auth=true,proto='https'}={})=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:service.server.address().port,path,method:body?'POST':'GET',headers:{host:new URL(HOSTED_ORIGIN).host,origin:HOSTED_ORIGIN,'x-forwarded-proto':proto,'content-type':'application/json',...(auth?{authorization:'Basic '+Buffer.from('tester:'+password).toString('base64')}:{})}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>{let value;try{value=JSON.parse(text)}catch{}resolve({status:res.statusCode,text,value,headers:res.headers})})})
  req.on('error',reject);req.end(body&&JSON.stringify(body))
 })
 assert.equal((await request('/private/',{auth:false})).status,401)
 const insecure=await request('/private/',{proto:'http'});assert.equal(insecure.status,403);assert.equal(insecure.headers['www-authenticate'],undefined)
 const page=await request('/private/');assert.match(page.text,/"dialogue":"fictitious"/);assert.equal(page.headers['strict-transport-security'],'max-age=86400')
 assert.equal((await request('/private/openai-dialogue.mjs')).status,404)
 const profile={personnelCategory:'TEST-A',role:'Assistant',objective:'Organiser les tâches de test',existingSkills:'Je débute',timeAvailable:'1 à 2 jours'}
 assert.equal((await request('/private/dialogue',{body:{action:'edit',profile,modality:'En ligne',expectedRevision:0}})).status,200)
 const ticket=(await request('/private/profile-references')).value
 const generated=await request('/private/pathway',{body:{profile:{...profile,constraints:'Modalité souhaitée : en ligne'},confirmed:true,requestId:ticket.requestId,referenceRevision:refs.revision}})
 assert.equal(generated.status,200);assert.equal(service.status().total,1)
 const saved=readFileSync(options.stateFile,'utf8')
 await service.close();assert.equal(readFileSync(options.stateFile,'utf8'),saved)
 service=createHostedSimulation(options);await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve))
 assert.equal(service.status().total,1);assert.equal((await request('/private/dialogue')).value.mode,'simulation')
})

test('sélection et retour messagerie : sauvegarde, identité et quotas préservés',()=>{
 const root=mkdtempSync(join(tmpdir(),'avatar-interface-config-')),site=join(root,'site'),directory=join(root,'private')
 mkdirSync(site);mkdirSync(directory,{mode:0o700})
 const file=join(directory,'config.json'),config={publicOrigin:HOSTED_ORIGIN,port:3000,privateDirectory:directory,proxyVerification:'self-https',interface:'messaging'}
 const write=(name,value)=>writeFileSync(join(directory,name),JSON.stringify(value),{mode:0o600})
 write('config.json',config);write('users.json',[]);write('references.json',references());write('preview.json',data());write('quotas.json',{day:20749,daily:3,total:3,stopped:false})
 const protectedFiles=['users.json','references.json','preview.json','quotas.json'],before=protectedFiles.map(n=>readFileSync(join(directory,n),'utf8'))
 try{
  const result=setHostedSimulationInterface(file,site,'dialogue-fictitious');assert.equal(result.changed,true)
  assert.deepEqual(JSON.parse(readFileSync(result.backup,'utf8')),config)
  assert.equal(readHostedConfig(file,site).interface,'dialogue-fictitious');assert.equal(statSync(file).mode&0o077,0)
  assert.equal(setHostedSimulationInterface(file,site,'dialogue-fictitious').changed,false)
  setHostedSimulationInterface(file,site,'messaging');assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),config)
  assert.deepEqual(protectedFiles.map(n=>readFileSync(join(directory,n),'utf8')),before)
  assert.throws(()=>setHostedSimulationInterface(file,site,'real'))
 }finally{rmSync(root,{recursive:true,force:true})}
})

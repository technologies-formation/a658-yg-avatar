import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalDemo } from './local-demo.mjs'
import { references } from './reference-test-fixtures.mjs'

test('interface interactive locale : aucune cle dans la page, validation et quotas', async()=>{
 const dir=mkdtempSync(join(tmpdir(),'avatar-local-'))
 const port=19000+Math.floor(Math.random()*20000)
 const {server,guard,origin}=createLocalDemo({port,stateFile:join(dir,'quota.json')})
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  const page=await fetch(origin+'/')
  assert.equal(page.status,200)
  const html=await page.text()
  assert.match(html,/\/local\/validate/)
  assert.match(html,/Ton assistant formation/)
  assert.doesNotMatch(html,/Bearer /)
  const body={type:'pathway',profile:{personnelCategory:'PAT',role:'Conseiller',objective:'Suivre une formation'}}
  const request=(headers={})=>fetch(origin+'/local/validate',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(body)})
  assert.equal((await request({Origin:'https://example.com'})).status,403)
  assert.equal((await request({Origin:''})).status,403)
  assert.equal(guard.status().total,0)
  const response=await request()
  assert.equal(response.status,200)
  assert.equal((await response.json()).mode,'simulation')
  assert.equal(guard.status().total,1)
  assert.equal((await fetch(origin+'/local/validate',{method:'GET'})).status,404)
 }finally{
  await new Promise(resolve=>server.close(resolve))
  rmSync(dir,{recursive:true,force:true})
 }
})

test('simulation référencée : révision périmée refusée avant quota et libellés échappés', async () => {
 const contract=references(x=>{x.pathway.fields.personnelCategory.options[0].label='</script><script>alerte</script>'})
 const port=19000+Math.floor(Math.random()*20000)
 const {server,guard,origin}=createLocalDemo({port,stateFile:'',profileReferences:contract})
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  const page=await(await fetch(origin)).text()
  assert.doesNotMatch(page,/<\/script><script>alerte/)
  assert.equal((page.match(/<script>/g)||[]).length,1)
  const body={type:'pathway',profile:{personnelCategory:'TEST-A',role:'x',objective:'y'},referenceRevision:'ancienne',confirmed:true}
  const request=()=>fetch(origin+'/local/validate',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)})
  assert.equal((await request()).status,409)
  assert.equal(guard.status().total,0)
  body.referenceRevision=contract.revision
  assert.equal((await request()).status,200)
  assert.equal(guard.status().total,1)
 }finally{await new Promise(resolve=>server.close(resolve))}
})

test('quotas locaux personnalisables et valeurs invalides', async()=>{
 const dir=mkdtempSync(join(tmpdir(),'avatar-quota-'))
 const port=19000+Math.floor(Math.random()*20000)
 const stateFile=join(dir,'quota.json')
 assert.throws(()=>createLocalDemo({port,stateFile,maxDailyRequests:0}),/Quotas invalides/)
 assert.throws(()=>createLocalDemo({port,stateFile,maxTotalRequests:1.5}),/Quotas invalides/)
 const {server,guard,origin}=createLocalDemo({port,stateFile,maxDailyRequests:2,maxTotalRequests:3})
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  const body={type:'pathway',profile:{personnelCategory:'PAT',role:'Conseiller',objective:'Suivre une formation'}}
  const request=()=>fetch(origin+'/local/validate',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)})
  assert.equal(guard.status().maxDailyRequests,2)
  assert.equal(guard.status().maxTotalRequests,3)
  assert.equal((await request()).status,200)
  assert.equal((await request()).status,200)
  assert.equal((await request()).status,429)
  assert.equal(guard.status().total,2)
  const secondDir=mkdtempSync(join(tmpdir(),'avatar-total-'))
  const secondPort=port+1
  const {server:secondServer,origin:secondOrigin}=createLocalDemo({port:secondPort,stateFile:join(secondDir,'quota.json'),maxDailyRequests:5,maxTotalRequests:2})
  try{
   await new Promise((resolve,reject)=>{secondServer.once('error',reject);secondServer.listen(secondPort,'127.0.0.1',resolve)})
   const send=()=>fetch(secondOrigin+'/local/validate',{method:'POST',headers:{'Content-Type':'application/json',Origin:secondOrigin},body:JSON.stringify(body)})
   assert.equal((await send()).status,200)
   assert.equal((await send()).status,200)
   assert.equal((await send()).status,429)
  }finally{
   await new Promise(resolve=>secondServer.close(resolve))
   rmSync(secondDir,{recursive:true,force:true})
  }
 }finally{
  await new Promise(resolve=>server.close(resolve))
  rmSync(dir,{recursive:true,force:true})
 }
})

test('actualisation locale : confirmation et révision courantes avant quota, aucune remise à zéro', async () => {
 let current = references(), unavailable = false
 const port = 19000 + Math.floor(Math.random()*20000)
 const {server,guard,origin} = createLocalDemo({port,stateFile:'',loadProfileReferences:()=>{
  if(unavailable)throw Error('Fichier invalide')
  return current
 }})
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve))
 const body={type:'pathway',profile:{personnelCategory:'TEST-A',role:'x',objective:'y'},referenceRevision:current.revision}
 const send=()=>fetch(origin+'/local/validate',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
 try{
  assert.equal((await send()).status,400)
  assert.equal(guard.status().total,0)
  body.confirmed=true;assert.equal((await send()).status,200)
  current=references(x=>{x.pathway.fields.personnelCategory.options=[{value:'NEW',label:'Nouveau groupe'}]})
  assert.equal((await send()).status,409)
  assert.equal(guard.status().total,1)
  const refreshed=await fetch(origin+'/local/profile-references')
  assert.equal(refreshed.status,200);assert.deepEqual(await refreshed.json(),current)
  body.referenceRevision=current.revision;body.profile.personnelCategory='NEW'
  assert.equal((await send()).status,200)
  assert.equal(guard.status().total,2)
  unavailable=true
  assert.equal((await fetch(origin+'/local/profile-references')).status,503)
  assert.equal((await send()).status,503)
  assert.equal(guard.status().total,2)
  unavailable=false
  assert.equal((await fetch(origin+'/local/profile-references',{headers:{Origin:'https://example.invalid'}})).status,403)
  assert.equal((await send()).status,200)
  assert.equal(guard.status().total,3)
 }finally{await new Promise(resolve=>server.close(resolve))}
})

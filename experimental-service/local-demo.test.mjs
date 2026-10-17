import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalDemo } from './local-demo.mjs'

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

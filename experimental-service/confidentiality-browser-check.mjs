// Quatre identités fictives, serveur local injecté, aucun appel modèle ou SMTP.
import assert from 'node:assert/strict'
import {createServer,request} from 'node:http'
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createDialogueSimulationInterface} from './dialogue-interface.mjs'
import {createPilotCredential} from './pilot-auth.mjs'
import {references} from './reference-test-fixtures.mjs'
import {data} from './result-test-fixtures.mjs'
const {chromium}=await import(process.env.AVATAR_PLAYWRIGHT_MODULE||'playwright')
const directory=mkdtempSync(join(tmpdir(),'confidentiality-browser-')),origin='https://consent-test.invalid',password='FAKE_BROWSER_PASSWORD_ONLY'
const names=['pilote-01','pilote-02','pilote-03','pilote-04']
const users=await Promise.all([...names,'admin'].map(async id=>({...await createPilotCredential({id,username:id,password}),...(id==='admin'?{}:{pilotTester:true})})))
const service=createDialogueSimulationInterface({enabled:true,publicOrigin:origin,users,isSecureRequest:()=>true,stateFile:join(directory,'state.json'),participantDirectory:join(directory,'participants'),loadProfileReferences:()=>references(),preview:data(),guidedDraft:true})
const server=createServer(service.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true});mkdirSync('visual-check',{recursive:true})
const query=(user,path,method,body)=>new Promise((resolve,reject)=>{
 const req=request({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{host:'consent-test.invalid',origin,authorization:'Basic '+Buffer.from(user+':'+password).toString('base64'),'content-type':'application/json'}},res=>{
  const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))
 });req.on('error',reject);req.end(body)
})
try{
 for(const [index,user] of names.entries()){
  const page=await browser.newPage({viewport:{width:index%2?390:1100,height:900}})
  if(index%2)await page.addInitScript(()=>localStorage.setItem('a658yg-appearance','night'))
  let rejectOnce=index===0,accepts=0
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin)
   if(req.method()==='POST'&&req.postData()?.includes('accept-confidentiality')){
    accepts++;if(rejectOnce){rejectOnce=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'confidentiality_storage'})})}
   }
   const result=await query(user,url.pathname,req.method(),req.postData());await route.fulfill({status:result.status,contentType:String(result.headers['content-type']||'application/octet-stream'),body:result.body})
  })
  await page.goto(origin+'/private/')
  const dialog=page.getByRole('dialog',{name:'Avant de commencer'}),button=dialog.getByRole('button',{name:'Commencer',exact:true})
  await dialog.waitFor();assert.equal(await button.isEnabled(),false)
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true)
  assert.match(await dialog.innerText(),/besoins réels de formation/);assert.match(await dialog.innerText(),/API OpenAI/)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:'visual-check/confidentiality-'+user+'.png',fullPage:true})
  await dialog.getByRole('checkbox').check();await button.click()
  if(index===0){await dialog.getByRole('alert').getByText(/échanges restent bloqués/).waitFor();assert.equal(await dialog.isVisible(),true);await button.click()}
  await dialog.waitFor({state:'detached'})
  await page.getByRole('button',{name:'Rechercher des formations',exact:true}).waitFor()
  assert.match(await page.locator('#thread').innerText(),/sans données confidentielles/)
  await page.reload();await page.getByRole('button',{name:'Rechercher des formations',exact:true}).waitFor()
  assert.equal(await page.locator('#confidentiality-dialog').count(),0);assert.equal(accepts,index===0?2:1)
  const state=JSON.parse((await query(user,'/private/dialogue','GET')).body.toString())
  assert.equal(state.confidentiality.accepted,true);assert.equal(state.participantQuota.dialogue,0);assert.equal(state.participantQuota.research,0)
  await page.close()
 }
 console.log('Quatre comptes : consigne obligatoire, clavier, jour/nuit, erreur conservée, acceptation et reprise sans quota IA.')
}finally{await browser.close();service.close();server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(directory,{recursive:true,force:true})}

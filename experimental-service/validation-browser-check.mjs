// Contrôle de la série préparée : profils et moteur fictifs uniquement.
import {createServer,request as httpRequest} from 'node:http'
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import assert from 'node:assert/strict'
import {createRealDialogueTrialInterface} from './dialogue-real-trial.mjs'
import {createPilotCredential} from './pilot-auth.mjs'
import {createDialogueBudget} from './dialogue-budget.mjs'
import {references} from './reference-test-fixtures.mjs'
import {data} from './result-test-fixtures.mjs'
const {chromium}=await import(process.env.AVATAR_PLAYWRIGHT_MODULE||'playwright')
const root=mkdtempSync(join(tmpdir(),'avatar-three-browser-')),directory=join(root,'validation'),budgetDirectory=join(root,'budget'),origin='https://validation-test.invalid',password='FAKE_VALIDATION_PASSWORD'
mkdirSync(directory,{mode:0o700});mkdirSync(budgetDirectory,{mode:0o700})
const old=join(root,'old-one-quotas.json');writeFileSync(old,'OLD_QUOTA_MUST_REMAIN',{mode:0o600})
const budget=createDialogueBudget({directory:budgetDirectory,singleInstance:true});for(let n=0;n<7;n++)budget.reserve('existing_browser_request_'+n);budget.close()
const refs=references(x=>{x.pathway.fields.personnelCategory.options=[{value:'PAT',label:'PAT'}];x.pathway.fields.managerStatus.options=['Sans responsabilité managériale','Nouveau manager'].map(value=>({value,label:value}))})
let engineCalls=0,dialogueCalls=0,postRoutes=0
const user=await createPilotCredential({id:'validation-browser',username:'tester',password})
const service=createRealDialogueTrialInterface({enabled:true,paidTrialAuthorized:true,apiKey:'FAKE_KEY_ONLY',budgetDirectory,publicOrigin:origin,users:[user],isSecureRequest:()=>true,stateFile:join(root,'transport.json'),resumeDirectory:join(root,'resume'),
 fetchImpl:async()=>{dialogueCalls++;throw Error('Aucun dialogue IA attendu')},pathwayTrial:{enabled:true,paidTrialAuthorized:true,validationAuthorized:true,series:'pilot-2026-10-25',directory,stateFile:join(directory,'quotas.json'),reportFile:join(directory,'report.json'),fetchImpl:async(url)=>{
  if(url.endsWith('/api/profile-references'))return new Response(JSON.stringify(refs),{headers:{'Content-Type':'application/json',ETag:'"'+refs.revision+'"'}})
  engineCalls++;return new Response(JSON.stringify(data()),{headers:{'Content-Type':'application/json'}})
 }}})
const server=createServer(service.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser
try{
 mkdirSync('visual-check',{recursive:true});browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],external=[]
 page.on('pageerror',error=>errors.push(error.message))
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin){external.push(req.url());await route.abort();return}
  if(url.pathname==='/private/pathway'&&req.method()==='POST')postRoutes++
  const source=req.headers(),result=await new Promise((resolve,reject)=>{
   const outgoing=httpRequest({hostname:'127.0.0.1',port:server.address().port,path:url.pathname,method:req.method(),headers:{host:url.host,authorization:'Basic '+Buffer.from('tester:'+password).toString('base64'),...(source.origin?{origin:source.origin}:{}),...(source['content-type']?{'content-type':source['content-type']}:{})}},res=>{
    const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))
   });outgoing.on('error',reject);outgoing.end(req.postDataBuffer()||undefined)
  });await route.fulfill(result)
 })
 await page.goto(origin+'/private/');await page.locator('[data-validation-case=V1]').waitFor();assert.equal(engineCalls,0);assert.equal(dialogueCalls,0)
 assert.equal(await page.locator('#composer').isVisible(),false)
 const refused=await page.evaluate(async revision=>{const response=await fetch('/private/dialogue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'turn',paidTrialConfirmed:true,requestId:'forbidden_validation_turn_0001',message:'Je voudrais progresser',expectedRevision:0,referenceRevision:revision})});return response.status},refs.revision);assert.equal(refused,503);assert.equal(dialogueCalls,0)
 for(const [index,id]of ['V1','V2','V3'].entries()){
  if(index===1)await page.setViewportSize({width:390,height:844})
  await page.locator('#tab-discussion').click()
  await page.locator('[data-validation-case='+id+']').click()
  const confirm=page.getByRole('button',{name:'Confirmer le profil et générer — essai payant',exact:true});await confirm.waitFor()
  assert.equal(engineCalls,index);assert.equal(dialogueCalls,0)
  await confirm.click();await page.locator('#status').filter({hasText:new RegExp('Parcours réel reçu. Tentatives : '+(index+1)+'/3')}).waitFor()
  assert.equal(engineCalls,index+1);assert.equal(postRoutes,index+1);assert.equal(await page.locator('[data-validation-case='+id+']').isDisabled(),true)
  assert.equal(await confirm.count(),0);assert.match(await page.locator('#dialogue-budget').textContent(),/7\/10 tentatives/)
  const record=JSON.parse(readFileSync(join(directory,id+'.result.json'),'utf8'));assert.equal(record.caseId,id)
  await page.locator('#tab-courses').click();await page.screenshot({path:'visual-check/validation-'+id+'-courses.png',fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  if(index===0){await page.reload();await page.locator('#thread .pathway-course').first().waitFor();assert.equal(engineCalls,1);assert.equal(await page.locator('[data-validation-case=V1]').isDisabled(),true)}
 }
 await page.reload();await page.locator('#pathway-quota').filter({hasText:/3\/3 utilisé/}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Confirmer le profil et générer — essai payant',exact:true}).count(),0)
 for(const id of ['V1','V2','V3'])assert.equal(await page.locator('[data-validation-case='+id+']').isDisabled(),true)
 assert.equal(engineCalls,3);assert.equal(postRoutes,3);assert.equal(dialogueCalls,0);assert.equal(readFileSync(old,'utf8'),'OLD_QUOTA_MUST_REMAIN');assert.deepEqual(errors,[]);assert.deepEqual(external,[])
 await page.screenshot({path:'visual-check/validation-completed.png',fullPage:true})
 writeFileSync('visual-check/validation-check.json',JSON.stringify({engineCalls,postRoutes,dialogueCalls,oldQuotaUnchanged:true,dialogueReservations:7,transport:'fake'}))
 await context.close()
}finally{service.close();await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true})}

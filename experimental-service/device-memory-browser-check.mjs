// Navigation réelle, serveur local et données fictives ; aucune IA ni messagerie.
import {createServer,request as httpRequest} from 'node:http'
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import assert from 'node:assert/strict'
import {createDialogueSimulationInterface} from './dialogue-interface.mjs'
import {createPilotCredential} from './pilot-auth.mjs'
import {references} from './reference-test-fixtures.mjs'
import {data} from './result-test-fixtures.mjs'
import {clickNavigation} from './browser-navigation-fixtures.mjs'
const {chromium}=await import(process.env.AVATAR_PLAYWRIGHT_MODULE||'playwright')
const bounded=promise=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Délai du scénario dépassé')),30000)})]).finally(()=>clearTimeout(timer))}
const origin='https://device-test.invalid',password='FAKE_DEVICE_BROWSER_ONLY',dir=mkdtempSync(join(tmpdir(),'device-browser-'))
const users=await Promise.all(['alice','bob'].map(id=>createPilotCredential({id,username:id,password})))
const service=createDialogueSimulationInterface({enabled:true,deviceMemoryEnabled:true,loadCatalogueStatus:async()=>({snapshotDate:'2026-10-27',snapshotHash:'a'.repeat(64)}),resumeDirectory:join(dir,'resume'),stateFile:join(dir,'quota.json'),publicOrigin:origin,users,isSecureRequest:()=>true,loadProfileReferences:()=>references(),preview:data()})
const server=createServer(service.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser,user='alice',paid=0,holdCopies=false,releaseCopy,copyStarted,copyFinished;const external=[],errors=[],staticCache=new Map()
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage()
 page.on('pageerror',error=>errors.push(error.message))
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),headers=req.headers()
  if(url.origin!==origin){external.push(req.url());await route.abort();return}
  if(staticCache.has(url.pathname)){await route.fulfill(staticCache.get(url.pathname));return}
  if(url.pathname==='/private/pathway'||req.postData()?.includes('"action":"turn"'))paid++
  const result=await new Promise((resolve,reject)=>{
   const request=httpRequest({hostname:'127.0.0.1',port:server.address().port,path:url.pathname+url.search,method:req.method(),headers:{host:url.host,authorization:'Basic '+Buffer.from(user+':'+password).toString('base64'),...(headers.origin?{origin:headers.origin}:{}),...(headers['content-type']?{'content-type':headers['content-type']}:{})}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))})
   request.on('error',reject);request.end(req.postDataBuffer()||undefined)
  });if(holdCopies&&req.postData()?.includes('"action":"device-save"')){holdCopies=false;copyStarted?.();await new Promise(resolve=>{releaseCopy=resolve});await route.fulfill(result);copyFinished?.();return}
  if(result.status===200&&/\.(?:mjs|webp)$/.test(url.pathname))staticCache.set(url.pathname,result);await route.fulfill(result)
 })
 const api=body=>page.evaluate(async body=>{const response=await fetch('/private/dialogue',{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!response.ok)throw Error('HTTP '+response.status);return response.json()},body)
 const copies=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('a658yg-device-copy-v1:')))
 await page.goto(origin+'/private/');await page.locator('#thread').waitFor()
 await page.waitForFunction(()=>document.querySelector('#thread .message'))
 await page.waitForFunction(()=>document.querySelector('#courses-content > .catalogue-freshness')?.textContent==='Catalogue actualisé le 27.10.2026.')
 assert.deepEqual(await copies(),[])
 assert.equal(await page.locator('.simulation-label').textContent(),'Votre assistant formation')
 assert.equal(await page.locator('#pilot-details').isVisible(),false)
 const profile={personnelCategory:'TEST-A',role:'Assistant fictif',objective:'Préparer les rapports de test',existingSkills:'Je débute',timeAvailable:'1 à 2 jours'}
 await api({action:'edit',profile,modality:'En ligne',expectedRevision:0});await page.reload();await page.waitForFunction(()=>document.querySelector('#thread .message'))
 await clickNavigation(page,'#open-profile')
 assert.equal(await page.locator('#profile-title').textContent(),'Ma demande')
 assert.equal(await page.locator('#profile-dialog .eyebrow').count(),0)
 assert.equal(await page.locator('#device-memory-settings h3').count(),0)
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.profile-fields-grid')).gridTemplateColumns.split(' ').length),2)
 assert.equal(await page.evaluate(()=>{const button=document.querySelector('#profile-form button[type=submit]').getBoundingClientRect(),dialog=document.querySelector('#profile-dialog').getBoundingClientRect();return button.bottom<=dialog.bottom&&button.top>=dialog.top}),true)
 await page.locator('#remember-device').check();await page.locator('#device-memory-status').filter({hasText:'Copie enregistrée'}).waitFor()
 assert.equal((await copies()).length,1)
 mkdirSync('visual-check',{recursive:true});await page.screenshot({path:'visual-check/device-memory-desktop.png',fullPage:true,animations:'disabled'})
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.profile-fields-grid')).gridTemplateColumns.split(' ').length),1);await page.locator('#device-memory-settings').scrollIntoViewIfNeeded();await page.screenshot({path:'visual-check/device-memory-mobile.png',fullPage:true,animations:'disabled'})
 assert.equal(await page.evaluate(()=>document.querySelector('#profile-dialog').scrollWidth<=document.querySelector('#profile-dialog').clientWidth+1),true)
 await page.locator('#close-profile').click()
 user='bob';await page.reload();await page.waitForFunction(()=>document.querySelector('#thread .message'));assert.equal(await page.locator('#device-copy-notice').count(),0)
 await clickNavigation(page,'#open-profile');assert.equal(await page.locator('#remember-device').isChecked(),false);await page.locator('#close-profile').click()
 user='alice';await page.reload();await page.waitForFunction(()=>document.querySelector('#thread .message'))
 const current=await api();await api({action:'edit',profile:{...profile,objective:'Une autre demande de test'},modality:'Présentiel',expectedRevision:current.draft.revision})
 await page.reload();await page.locator('#resume-device-copy').waitFor()
 assert.equal((await api()).draft.profile.objective,'Une autre demande de test')
 await page.locator('#resume-device-copy').click();await page.locator('#cancel-device-restore').click();assert.equal((await api()).draft.profile.objective,'Une autre demande de test')
 await page.locator('#resume-device-copy').click();await page.locator('#confirm-device-restore').click();await page.locator('#status').filter({hasText:'Copie reprise'}).waitFor()
 assert.equal((await api()).draft.profile.objective,profile.objective);assert.equal(service.status().total,0)
 const started=new Promise(resolve=>{copyStarted=resolve}),finished=new Promise(resolve=>{copyFinished=resolve});holdCopies=true
 await clickNavigation(page,'#open-profile');await page.locator('[name=objective]').fill('Une dernière demande avant effacement');await page.locator('#profile-form button[type=submit]').click();await bounded(started)
 await clickNavigation(page,'#open-profile');await page.locator('#forget-device').click();releaseCopy();await bounded(finished);await page.waitForFunction(()=>!document.querySelector('#remember-device').disabled)
 assert.deepEqual(await copies(),[]);assert.equal((await api()).draft.profile.objective,'Une dernière demande avant effacement')
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Blocked','QuotaExceededError')}})
 await page.locator('#remember-device').check();await page.locator('#device-memory-status').filter({hasText:'n’a pas pu'}).waitFor();assert.equal(await page.locator('#remember-device').isChecked(),false)
 assert.equal(paid,0);assert.deepEqual(external,[]);assert.deepEqual(errors,[])
 console.log(JSON.stringify({ok:true,paidCalls:paid,checks:['opt-in','30-day-copy','account-isolation','explicit-resume','cancel','forget','blocked-storage','desktop-mobile']}))
 await context.close()
}catch(error){mkdirSync('visual-check',{recursive:true});await browser?.contexts()[0]?.pages()[0]?.screenshot({path:'visual-check/device-memory-failure.png',fullPage:true}).catch(()=>{});throw error}finally{releaseCopy?.();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));service.close();rmSync(dir,{recursive:true,force:true})}

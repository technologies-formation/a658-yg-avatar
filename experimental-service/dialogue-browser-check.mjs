import {openNavigation,clickNavigation,checkMobileNavigation} from './browser-navigation-fixtures.mjs';
// Vérification de l’interface fictive : serveur local, authentification réelle, aucun moteur externe.
import { createServer, request as httpRequest } from 'node:http'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { createDialogueSimulationInterface } from './dialogue-interface.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { references } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'
const { chromium } = await import(process.env.AVATAR_PLAYWRIGHT_MODULE || 'playwright')
const origin='https://dialogue-test.invalid',password='FAKE_BROWSER_TEST_PASSWORD_ONLY'
const dir=mkdtempSync(join(tmpdir(),'avatar-dialogue-browser-'))
const users=await Promise.all(['desktop','mobile'].map(name=>createPilotCredential({id:'browser-'+name,username:'browser-'+name,password})))
const service=createDialogueSimulationInterface({enabled:true,publicOrigin:origin,users,stateFile:join(dir,'quotas.json'),resumeDirectory:join(dir,'resume'),
 isSecureRequest:req=>['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress),loadProfileReferences:()=>references(),preview:data()})
const server=createServer(service.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser;const results=[]
try{
 browser=await chromium.launch({headless:true});mkdirSync('visual-check',{recursive:true})
 for(const [name,viewport]of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
  // Un compte synthétique par écran ; les quotas restent actifs pour chaque session.
  const context=await browser.newContext({viewport,colorScheme:'light'}),page=await context.newPage(),errors=[],external=[];let pathways=0,newRequests=0,businessPosts=0
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url())
   if(url.origin!==origin){external.push(req.url());await route.abort();return;}
   if(req.method()==='POST')businessPosts++
   if(url.pathname==='/private/dialogue'&&req.method()==='POST'&&req.postDataJSON().action==='turn')await new Promise(resolve=>setTimeout(resolve,500))
   if(url.pathname==='/private/pathway'&&req.method()==='POST')pathways++
   if(url.pathname==='/private/dialogue'&&req.method()==='POST'&&req.postDataJSON().action==='new-request')newRequests++
   const source=req.headers()
   const result=await new Promise((resolve,reject)=>{
    const request=httpRequest({hostname:'127.0.0.1',port:server.address().port,path:url.pathname+url.search,method:req.method(),headers:{host:url.host,
     authorization:'Basic '+Buffer.from('browser-'+name+':'+password).toString('base64'),...(source.origin?{origin:source.origin}:{}),...(source['content-type']?{'content-type':source['content-type']}:{})}},res=>{
     const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))})
    request.on('error',reject);request.end(req.postDataBuffer()||undefined)
   });await route.fulfill(result)
  })
  await page.goto(origin+'/private/');await page.getByRole('button',{name:'Progresser sur Word',exact:true}).waitFor();await checkMobileNavigation(page)
  assert.equal(await page.locator('#pilot-details').isVisible(),false)
  assert.equal(await page.locator('#refresh-references').isVisible(),false)
  assert.equal(await page.locator('.simulation-label').textContent(),'Votre assistant formation')
  await page.screenshot({path:'visual-check/pilot-details-'+name+'.png',fullPage:true})
  const postsBeforeAppearance=businessPosts
  assert.equal(await page.locator('html').getAttribute('data-appearance'),'day')
  assert.equal(await page.locator('#thread .sender').count(),0)
  assert.equal(await page.locator('.subbrand').count(),0)
  await page.emulateMedia({colorScheme:'dark'})
  await page.waitForFunction(()=>document.documentElement.dataset.appearance==='night')
  await page.screenshot({path:'visual-check/assistant-night-'+name+'.png',fullPage:true,animations:'disabled'})
  await openNavigation(page);await page.locator('#appearance-toggle').focus();await page.keyboard.press('Space')
  assert.equal(await page.locator('html').getAttribute('data-appearance'),'day')
  if(name==='mobile')await page.locator('#close-menu').click()
  await page.emulateMedia({colorScheme:'light'});await page.emulateMedia({colorScheme:'dark'})
  assert.equal(await page.locator('html').getAttribute('data-appearance'),'day')
  await page.reload();await page.getByRole('button',{name:'Progresser sur Word',exact:true}).waitFor()
  assert.equal(await page.locator('html').getAttribute('data-appearance'),'day')
  assert.equal(businessPosts,postsBeforeAppearance)
  assert.equal(await page.locator('#thread .assistant-working').count(),0)
  await page.screenshot({path:'visual-check/assistant-day-'+name+'.png',fullPage:true,animations:'disabled'})
  const accept=async()=>{await page.getByRole('button',{name:'Appliquer ces corrections',exact:true}).click()}
  const oldExpressions=await page.locator('#thread .assistant-robot').evaluateAll(items=>items.map(e=>e.dataset.expression))
  await page.getByRole('button',{name:'Progresser sur Word',exact:true}).click()
  await page.locator('#assistant-working').waitFor()
  assert.equal(await page.locator('#assistant-working [data-expression=thinking]').count(),1)
  await page.screenshot({path:'visual-check/assistant-thinking-'+name+'.png',fullPage:true,animations:'disabled'})
  await page.getByRole('button',{name:'Appliquer ces corrections',exact:true}).waitFor()
  assert.equal(await page.locator('#assistant-working').count(),0)
  assert.deepEqual((await page.locator('#thread .assistant-robot').evaluateAll(items=>items.map(e=>e.dataset.expression))).slice(0,oldExpressions.length),oldExpressions)
  await clickNavigation(page,'#open-profile')
  assert.equal(await page.locator('[name=objective]').inputValue(),'')
  await page.getByRole('button',{name:'Fermer',exact:true}).click();await accept()
  await page.getByRole('button',{name:'Assistant administratif',exact:true}).waitFor()
  assert.equal(await page.locator('#status').textContent(),'Demande mise à jour. Aucune recherche lancée.')
  assert.equal(await page.locator('[data-proposal-id] .bubble').first().evaluate(el=>el.firstChild.textContent),'Repère enregistré dans votre demande.')
  assert.equal(await page.getByText('Ces corrections sont appliquées à votre profil. Aucune recherche n’a été lancée.',{exact:true}).count(),0)
  await page.getByRole('button',{name:'Assistant administratif',exact:true}).click();await accept()
  await page.getByRole('button',{name:'Groupe de test A',exact:true}).click();await accept()
  await page.getByRole('button',{name:'Je débute',exact:true}).click();await accept()
  await page.getByRole('button',{name:'1 à 2 jours',exact:true}).click();await accept()
  await page.getByRole('button',{name:'En ligne',exact:true}).click();await accept()
  await page.getByRole('button',{name:'Confirmer ma demande et simuler',exact:true}).waitFor();assert.equal(pathways,0)
  await page.getByRole('button',{name:'Confirmer ma demande et simuler',exact:true}).click();await page.locator('#thread .pathway-course').first().waitFor()
  assert.equal(pathways,1)
  assert.equal(await page.locator('#sidebar .tab-count').count(),0);assert.equal(await page.locator('#thread .result-count').last().innerText(),'3 cours présentés')
  const cards=await page.locator('#thread .pathway-course').allTextContents()
  await clickNavigation(page,'#tab-courses');assert.equal(await page.locator('#courses-content h1').count(),1);assert.deepEqual(await page.locator('#courses-content .pathway-course').allTextContents(),cards)
  // Cancellation and Escape keep the draft, the unsent text and the exact reading position.
  await clickNavigation(page,'#tab-discussion');await page.locator('#message').fill('Un message encore non envoyé')
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const beforeThread=await page.locator('#thread').innerHTML()
  await page.locator('#conversation').evaluate(e=>e.scrollTop=Math.max(0,e.scrollHeight-e.clientHeight-80))
  const beforeScroll=await page.locator('#conversation').evaluate(e=>e.scrollTop)
  await clickNavigation(page,'#restart');await page.locator('#new-request-dialog').waitFor()
  assert.equal(await page.evaluate(()=>document.activeElement.id),'keep-request');assert.equal(newRequests,0)
  await page.screenshot({path:'visual-check/new-request-confirmation-'+name+'.png',fullPage:true,animations:'disabled'})
  await page.locator('#keep-request').click()
  assert.equal(await page.locator('#thread').innerHTML(),beforeThread);assert.equal(await page.locator('#message').inputValue(),'Un message encore non envoyé');assert.equal(await page.locator('#conversation').evaluate(e=>e.scrollTop),beforeScroll);assert.equal(newRequests,0);assert.equal(pathways,1)
  await clickNavigation(page,'#restart');await page.locator('#new-request-dialog').waitFor();await page.keyboard.press('Escape')
  await page.waitForFunction(()=>!document.getElementById('new-request-dialog').open)
  assert.equal(await page.locator('#thread').innerHTML(),beforeThread);assert.equal(await page.locator('#message').inputValue(),'Un message encore non envoyé');assert.equal(newRequests,0)
  await clickNavigation(page,'#open-profile');await page.locator('[name=modality]').selectOption('Présentiel')
  await page.getByRole('button',{name:'Enregistrer ma demande',exact:true}).click();await clickNavigation(page,'#tab-courses')
  await page.locator('#courses-content').getByText(/La demande a changé ; ces résultats restent/).waitFor()
  assert.deepEqual(await page.locator('#courses-content .pathway-course').allTextContents(),cards);assert.equal(pathways,1)
  assert.equal(await page.locator('#tab-courses').getAttribute('aria-selected'),'true')
  await page.screenshot({path:'visual-check/dialogue-'+name+'-courses.png',fullPage:true,animations:'disabled'})
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
  assert.equal(overflow,false);assert.deepEqual(errors,[]);assert.deepEqual(external,[])
  // Two frozen searches, keyboard selection, refresh and closure: only explicit simulation clicks build results.
  await clickNavigation(page,'#tab-discussion')
  await page.getByRole('button',{name:'Confirmer ma demande et simuler',exact:true}).click()
  await page.waitForFunction(()=>document.querySelectorAll('#research-tabs [role=tab]').length===2)
  await clickNavigation(page,'#tab-courses')
  assert.equal(pathways,2);assert.doesNotMatch(await page.locator('#research-list').innerText(),/Recherche n°/);assert.doesNotMatch(await page.locator('#courses-content h1').innerText(),/Recherche n°/);assert.equal(await page.locator('#research-tabs .research-tab-number').count(),0)
  assert.deepEqual(await page.locator('#research-tabs [role=tab]').evaluateAll(tabs=>tabs.map(tab=>Number(tab.dataset.researchNumber))),[2,1])
  await clickNavigation(page,'[data-research-number="1"]')
  await page.waitForFunction(()=>document.querySelector('[data-research-number="1"]')?.getAttribute('aria-selected')==='true')
  assert.match(await page.locator('#courses-content .need-summary').textContent(),/Modalité souhaitée : en ligne/)
  await openNavigation(page);await page.locator('[data-research-number="1"]').focus();await page.keyboard.press('ArrowDown')
  await page.waitForFunction(()=>document.querySelector('[data-research-number="2"]')?.getAttribute('aria-selected')==='true')
  assert.match(await page.locator('#courses-content .need-summary').textContent(),/Modalité souhaitée : présentiel/)
  await clickNavigation(page,'[data-research-number="1"]')
  await page.waitForFunction(()=>document.querySelector('[data-research-number="1"]')?.getAttribute('aria-selected')==='true')
  assert.deepEqual(await page.locator('#courses-content .pathway-course').allTextContents(),cards)
  await page.screenshot({path:'visual-check/research-tabs-'+name+'.png',fullPage:true,animations:'disabled'})
  await openNavigation(page);await page.screenshot({path:'visual-check/sidebar-'+name+'-researches.png',fullPage:true,animations:'disabled'})
  // Only the explicit confirmation starts a fresh discussion; the two result snapshots stay available.
  await clickNavigation(page,'#restart');await page.locator('#new-request-dialog').waitFor();await page.locator('#confirm-new-request').click()
  await page.locator('#thread').getByText('Commençons une nouvelle demande. Vos recherches précédentes restent disponibles à gauche.',{exact:true}).waitFor()
  assert.equal(newRequests,1);assert.equal(pathways,2);assert.equal(await page.locator('#message').inputValue(),'');assert.equal(await page.locator('#research-tabs [role=tab]').count(),2)
  await clickNavigation(page,'#open-profile');assert.equal(await page.locator('[name=objective]').inputValue(),'');assert.equal(await page.locator('[name=role]').inputValue(),'');await page.getByRole('button',{name:'Fermer',exact:true}).click()
  await page.reload();await page.locator('#thread .pathway-result').waitFor();await clickNavigation(page,'#tab-courses')
  assert.equal(await page.locator('#research-tabs [role=tab]').count(),2);assert.match(await page.locator('#courses-content h1').innerText(),/^Progresser sur Word/);assert.equal(await page.locator('[data-research-number="1"]').getAttribute('aria-selected'),'true')
  await openNavigation(page);await page.locator('.research-tab-group:has([data-research-number="2"]) .research-close').click()
  await page.waitForFunction(()=>document.querySelectorAll('#research-tabs [role=tab]').length===1)
  await page.reload();await page.locator('#thread .pathway-result').waitFor();await clickNavigation(page,'#tab-courses')
  assert.equal(await page.locator('#research-tabs [role=tab]').count(),1)
  await openNavigation(page);await page.locator('.research-tab-group:has([data-research-number="1"]) .research-close').click()
  await page.locator('#courses-content .view-empty').waitFor()
  assert.equal(await page.locator('#courses-content .pathway-result').count(),0);assert.equal(pathways,2)
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  results.push({name,pathways,proposalRequiresAcceptance:true,resultPreserved:true,researchTabsRestored:true,closePreservesQuota:true,noExternalRequests:true})
  await context.close()
 }
 writeFileSync('visual-check/dialogue-check.json',JSON.stringify(results,null,2))
}finally{
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})
}

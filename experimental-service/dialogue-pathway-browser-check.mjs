import {createResearchEmailService} from './research-email.mjs'
import {openNavigation,clickNavigation} from './browser-navigation-fixtures.mjs';
// Vérification de l’interface fictive : serveur local, authentification réelle, aucun moteur externe.
import { createServer, request as httpRequest } from 'node:http'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { createRealDialogueTrialInterface } from './dialogue-real-trial.mjs'
import { createPilotCredential } from './pilot-auth.mjs'
import { references } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'
const { chromium } = await import(process.env.AVATAR_PLAYWRIGHT_MODULE || 'playwright')
const origin='https://dialogue-test.invalid',password='FAKE_BROWSER_TEST_PASSWORD_ONLY'
const dir=mkdtempSync(join(tmpdir(),'avatar-dialogue-browser-'))
const users=await Promise.all(['desktop'].map(name=>createPilotCredential({id:'browser-'+name,username:'browser-'+name,password})))
const budgetDirectory=join(dir,'budget');mkdirSync(budgetDirectory,{mode:0o700});let apiCalls=0,engineCalls=0;const engineRequests=[];const engineResult=data();engineResult.catalogue={snapshotDate:'2026-10-26',snapshotHash:'a'.repeat(64)};engineResult.recommendedSteps[0].course.sessionAvailability={hasOpenSession:true,hasScheduledSession:false,observedOn:'2026-10-23',source:'official-session-icons'};engineResult.optionalSteps[0].course.sessionAvailability={hasOpenSession:true,hasScheduledSession:true,observedOn:'2026-10-23',source:'official-session-icons'};engineResult.optionalSteps[0].course.sessionAvailability.scheduledOpeningDates=['2998-11-03'];engineResult.optionalSteps[0].course.deliveryMode={value:'in_person',sourceField:'titleRaw',evidence:engineResult.optionalSteps[0].course.title};engineResult.informationalCourses[0].course.deliveryMode={value:'online',sourceField:'titleRaw',evidence:engineResult.informationalCourses[0].course.title};engineResult.durationSummary={budgetHours:16,recommendedHours:16,excessHours:0,withinBudget:true}
const emails=[],mail=createResearchEmailService({directory:join(dir,'mail'),from:'sender@example.invalid',transport:{async sendMail(message){emails.push(message);return {accepted:[message.to.address],rejected:[]}}}})
const service=createRealDialogueTrialInterface({mail,enabled:true,paidTrialAuthorized:true,apiKey:'FAKE_BROWSER_KEY_ONLY',budgetDirectory,fetchImpl:async(url,init)=>{
 apiCalls++;if(url.endsWith('/input_tokens'))return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:1000}),{headers:{'Content-Type':'application/json'}});
 const last=JSON.parse(JSON.parse(init.body).input[0].content).messages.at(-1);if(last.text==='TEST erreur transport')return new Response('DO_NOT_EXPOSE_TEST_SECRET_OR_BODY',{status:429,headers:{'Content-Type':'application/json'}});return new Response(JSON.stringify({status:'completed',model:'gpt-6-luna',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({kind:'ask',reply:'Quels documents rédigez-vous au quotidien ?',changes:[{field:'objective',value:'Progresser sur Word pour mes rapports',evidence:[{messageId:last.id,quote:last.text}]}]})}]}]}),{headers:{'Content-Type':'application/json'}});
 },pathwayTrial:{enabled:true,paidTrialAuthorized:true,stateFile:join(dir,'engine-quotas.json'),reportFile:join(dir,'engine-report.json'),fetchImpl:async(url,init)=>{if(url.endsWith('/api/profile-references'))return new Response(JSON.stringify(references()),{headers:{'Content-Type':'application/json',ETag:'"'+references().revision+'"'}});engineCalls++;engineRequests.push(JSON.parse(init.body));return new Response(JSON.stringify(engineResult),{headers:{'Content-Type':'application/json'}})}},resumeDirectory:join(dir,'resume'),publicOrigin:origin,users,stateFile:join(dir,'quotas.json'),
 isSecureRequest:req=>['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress),loadProfileReferences:()=>references(),preview:data()})
const server=createServer(service.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser;const results=[]
try{
 browser=await chromium.launch({headless:true});mkdirSync('visual-check',{recursive:true})
 for(const [name,viewport]of [['desktop',{width:1280,height:900}]]){
  // Un compte synthétique par écran ; les quotas restent actifs pour chaque session.
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],external=[];let pathways=0
  page.on('pageerror',e=>errors.push(e.message))
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url())
   if(url.origin!==origin){external.push(req.url());await route.abort();return;}
   if(url.pathname==='/private/pathway'&&req.method()==='POST')pathways++
   const source=req.headers()
   const result=await new Promise((resolve,reject)=>{
    const request=httpRequest({hostname:'127.0.0.1',port:server.address().port,path:url.pathname+url.search,method:req.method(),headers:{host:url.host,
     authorization:'Basic '+Buffer.from('browser-'+name+':'+password).toString('base64'),...(source.origin?{origin:source.origin}:{}),...(source['content-type']?{'content-type':source['content-type']}:{})}},res=>{
     const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))})
    request.on('error',reject);request.end(req.postDataBuffer()||undefined)
   });await route.fulfill(result)
  })
  await page.goto(origin+'/private/');await page.locator('#dialogue-budget').waitFor({state:'attached',timeout:5000}).catch(async error=>{console.log(JSON.stringify({name,errors,status:await page.locator('#status').count()?await page.locator('#status').textContent():'no status element'}));await page.screenshot({path:'visual-check/dialogue-pathway-'+name+'-startup-error.png',fullPage:true});throw error})
  await page.waitForFunction(()=>document.querySelector('link[data-assistant-icon]')?.href.startsWith('data:image/png;base64,'))
  const iconUrl=await page.locator('link[data-assistant-icon]').getAttribute('href');writeFileSync('visual-check/assistant-tab-icon.png',Buffer.from(iconUrl.split(',')[1],'base64'))
  assert.equal(await page.locator('#status').textContent(),'Dialogue IA : chaque message envoyé peut être payant. Aucun appel OpenAI à l’ouverture.')
  await page.locator('#message').fill('Je voudrais progresser sur Word pour mes rapports.')
  await page.getByRole('button',{name:'Envoyer un message — essai payant',exact:true}).click()
  await page.getByRole('button',{name:'Appliquer ces corrections',exact:true}).waitFor()
  await clickNavigation(page,'#open-profile')
  assert.equal(await page.locator('[name=objective]').inputValue(),'')
  await page.getByRole('button',{name:'Fermer',exact:true}).click()
  await page.getByRole('button',{name:'Appliquer ces corrections',exact:true}).click()
  await page.getByText('Repère enregistré dans votre demande.',{exact:true}).waitFor()
  await clickNavigation(page,'#open-profile')
  assert.equal(await page.locator('[name=objective]').inputValue(),'Progresser sur Word pour mes rapports')
  await page.locator('[name=role]').fill('Assistant administratif')
  await page.locator('[name=personnelCategory]').selectOption('TEST-A')
  await page.locator('[name=existingSkills]').fill('Je débute')
  await page.locator('[name=timeAvailable]').fill('1 à 2 jours')
  await page.locator('[name=modality]').selectOption('En ligne')
  await page.getByRole('button',{name:'Enregistrer ma demande',exact:true}).click()
  assert.match(await page.locator('#dialogue-budget').textContent(),/1000 tokens entrants, 100 sortants/)
  await page.getByRole('button',{name:'Confirmer ma demande et générer — essai payant',exact:true}).waitFor();assert.equal(pathways,0)
  await page.getByRole('button',{name:'Confirmer ma demande et générer — essai payant',exact:true}).click();await page.locator('#thread .pathway-course').first().waitFor()
  assert.equal(pathways,1)
  assert.match(await page.locator('#pathway-quota').textContent(),/1\/1 utilisé/);assert.equal(await page.getByRole('button',{name:'Confirmer ma demande et générer — essai payant',exact:true}).count(),0)
  assert.equal(engineCalls,1);assert.equal(engineRequests[0].timeAvailable,'1 à 2 jours');assert.equal(engineRequests[0].constraints,'Modalité souhaitée : en ligne')
  const discussionResult=await page.locator('#thread .pathway-result').innerText()
  assert.equal(await page.locator('#thread .pathway-result h3 svg[aria-hidden=true]').count(),await page.locator('#thread .pathway-result h3').count())
  assert.match(discussionResult,/Votre disponibilité\s+16 h/);assert.match(discussionResult,/Durée du parcours\s+16 h/);assert.doesNotMatch(discussionResult,/Le parcours dépasse|Dépassement\s+\+/)
  assert.doesNotMatch(discussionResult,/Exemple fictif|Aperçu hors ligne/)
  assert.match(discussionResult,/Modalité du cours : non renseignée/);assert.match(discussionResult,/Compatibilité avec votre préférence : non établie/);assert.match(discussionResult,/Écart avec votre préférence/);assert.match(discussionResult,/Modalité conforme à votre préférence/)
  const researchHeading=await page.locator('#thread .plan-status strong').last().textContent();assert.match(researchHeading,/^Progresser sur Word/);assert.equal(await page.locator('#view-caption').textContent(),'Votre échange avec l’assistant');assert.equal(await page.locator('#open-profile').count(),1)
  assert.equal(await page.locator('#thread .session-badge:not(.unknown)').count(),3);assert.match(discussionResult,/Inscriptions ouvertes/);assert.match(discussionResult,/Ouverture des inscriptions prévue le 3 novembre 2998/);assert.match(discussionResult,/Indicateurs relevés le 23\/10\/2026/);
  assert.match(await page.locator('#thread .plan-status').first().innerText(),/Résultats basés sur le catalogue du 26.10.2026/);
  const cards=await page.locator('#thread .pathway-course').allTextContents()
  await clickNavigation(page,'#tab-courses');assert.equal(await page.locator('#courses-content h1').count(),1);assert.deepEqual(await page.locator('#courses-content .pathway-course').allTextContents(),cards)
  assert.equal(await page.locator('#courses-content .pathway-result').innerText(),discussionResult)
  assert.equal(await page.locator('#courses-content .plan-status h1').textContent(),researchHeading)
  assert.equal(await page.locator('#courses-content').evaluate(e=>e.querySelector('[data-research-summary]').compareDocumentPosition(e.querySelector('.need-summary'))&Node.DOCUMENT_POSITION_FOLLOWING),4)
  assert.match(await page.locator('#courses-content').innerText(),/1 à 2 jours/)
  assert.equal(await page.locator('#courses-content details.research-criteria').getAttribute('open'),null)
  await page.locator('#courses-content .research-criteria > summary').click()
  await page.locator('#courses-content .criteria-content').waitFor()
  assert.match(await page.locator('#courses-content .criteria-content').innerText(),/Word/)
  await page.locator('#courses-content .research-criteria > summary').click()
  await page.locator('[data-email-export]').click();await page.locator('#research-email-dialog').waitFor()
  assert.equal(emails.length,0)
  await page.locator('#research-email-dialog').getByRole('button',{name:'Annuler',exact:true}).click()
  await page.locator('#research-email-dialog').waitFor({state:'detached'})
  assert.equal(emails.length,0);assert.equal(await page.locator('#research-email-dialog').count(),0)
  const downloadReady=page.waitForEvent('download')
  await page.locator('[data-pdf-export]').click()
  const pdf=await downloadReady;assert.match(pdf.suggestedFilename(),/^a658yg-recherche-.*\.pdf$/)
  await pdf.saveAs('visual-check/pathway-summary-'+name+'.pdf')
  await page.locator('#courses-content [role=status]').filter({hasText:/PDF préparé/}).waitFor()
  assert.equal(engineCalls,1);assert.equal(pathways,1)

  await openNavigation(page);await page.locator('#appearance-toggle').check()
  if(await page.locator('#menu-toggle').getAttribute('aria-expanded')==='true')await page.locator('#close-menu').click()
  assert.equal(await page.locator('html').getAttribute('data-appearance'),'night')
  await page.locator('#courses-content .need-summary').scrollIntoViewIfNeeded()
  await page.screenshot({path:'visual-check/assistant-night-criteria-'+name+'.png',fullPage:true,animations:'disabled'})
  assert.deepEqual(await page.locator('#courses-content .pathway-course').allTextContents(),cards);assert.equal(engineCalls,1)
  await page.locator('#courses-content .session-availability').first().scrollIntoViewIfNeeded();await page.screenshot({path:'visual-check/session-indicators-desktop.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await page.locator('#courses-content .session-availability').first().scrollIntoViewIfNeeded();await page.screenshot({path:'visual-check/session-indicators-mobile.png',fullPage:true,animations:'disabled'});await page.screenshot({path:'visual-check/dialogue-pathway-mobile-courses.png',fullPage:true,animations:'disabled'});assert.deepEqual(await page.locator('#courses-content .pathway-course').allTextContents(),cards);assert.equal(engineCalls,1)
  await clickNavigation(page,'#open-profile');await page.screenshot({path:'visual-check/assistant-night-profile-'+name+'.png',fullPage:true,animations:'disabled'});await page.locator('[name=modality]').selectOption('Présentiel')
  await page.getByRole('button',{name:'Enregistrer ma demande',exact:true}).click();await clickNavigation(page,'#tab-courses')
  await page.locator('#courses-content').getByText(/La demande a changé ; ces résultats restent/).waitFor()
  assert.deepEqual(await page.locator('#courses-content .pathway-course').allTextContents(),cards);assert.equal(pathways,1)
  const historicalDownload=page.waitForEvent('download');await page.locator('[data-pdf-export]').click()
  await (await historicalDownload).saveAs('visual-check/pathway-summary-historical-'+name+'.pdf')
  assert.equal(engineCalls,1);assert.equal(pathways,1)
  await page.locator('[data-email-export]').click()
  await page.locator('#research-email-address').fill('reader@example.invalid')
  assert.equal(emails.length,0)
  await page.screenshot({path:'visual-check/research-email-mobile-night.png',fullPage:true,animations:'disabled'})
  await page.locator('#research-email-dialog').getByRole('button',{name:'Envoyer ma synthèse',exact:true}).click()
  await page.locator('.email-status').filter({hasText:/prise en charge/}).waitFor()
  assert.equal(emails.length,1);assert.equal(emails[0].to.address,'reader@example.invalid');assert.equal(emails[0].attachments.length,1)
  assert.ok(emails[0].attachments[0].content.length>10000)
  assert.match(emails[0].text,/L’assistant IA peut faire des erreurs/)
  await page.locator('#research-email-dialog').getByRole('button',{name:'Fermer',exact:true}).click()
  await page.locator('#research-email-dialog').waitFor({state:'detached'})
  await page.locator('[data-email-export]').click();await page.setViewportSize({width:1280,height:900})
  await page.screenshot({path:'visual-check/research-email-desktop-night.png',fullPage:true,animations:'disabled'})
  await page.locator('#research-email-dialog').getByRole('button',{name:'Annuler',exact:true}).click()
  await page.setViewportSize({width:390,height:844});assert.equal(emails.length,1);assert.equal(engineCalls,1);assert.equal(pathways,1)

  assert.equal(await page.locator('#tab-courses').getAttribute('aria-selected'),'true')
  await page.screenshot({path:'visual-check/dialogue-pathway-'+name+'-courses.png',fullPage:true,animations:'disabled'})
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
  assert.equal(overflow,false);assert.deepEqual(errors,[]);assert.deepEqual(external,[])
  results.push({name,pathways,proposalRequiresAcceptance:true,resultPreserved:true,noExternalRequests:true,transport:'fake'})
  await clickNavigation(page,'#tab-discussion')
  await page.locator('#message').fill('TEST erreur transport')
  await page.getByRole('button',{name:'Envoyer un message — essai payant',exact:true}).click()
  await page.locator('#status').filter({hasText:/api_unavailable.*API HTTP 429.*génération/}).waitFor()
  assert.equal(await page.locator('#assistant-working').count(),0)
  assert.match(await page.locator('#dialogue-budget').textContent(),new RegExp((name==='desktop'?'2':'4')+'/10 tentatives'))
  assert.equal((await page.locator('body').textContent()).includes('DO_NOT_EXPOSE_TEST_SECRET_OR_BODY'),false)
  const refreshed=page.waitForResponse(response=>response.url()===origin+'/private/dialogue'&&response.request().method()==='GET')
  await page.evaluate(()=>document.getElementById('refresh-references').click())
  await (await refreshed).finished()
  await page.locator('#status').filter({hasText:/api_unavailable.*API HTTP 429/}).waitFor()
  assert.equal(pathways,1)
  assert.deepEqual(await page.locator('#courses-content .pathway-course').allTextContents(),cards)
  await page.screenshot({path:'visual-check/dialogue-pathway-'+name+'-failure.png',fullPage:true,animations:'disabled'})
  assert.deepEqual(errors,[]);assert.deepEqual(external,[])
  // Un nouvel onglet et un rechargement ne doivent pas reproposer l’essai consommé.
  const fresh=await context.newPage()
  for(const size of [{width:1280,height:900},{width:390,height:844}]){
   await fresh.setViewportSize(size);await fresh.goto(origin+'/private/')
   await fresh.locator('#pathway-quota').filter({hasText:/1\/1 utilisé/}).waitFor({state:'attached'})
   assert.equal(await fresh.getByRole('button',{name:'Confirmer ma demande et générer — essai payant',exact:true}).count(),0)
   assert.match(await fresh.locator('#dialogue-budget').textContent(),/2\/10 tentatives/)
   await fresh.locator('#thread .pathway-course').first().waitFor()
   assert.deepEqual(await fresh.locator('#thread .pathway-course').allTextContents(),cards)
   assert.equal(await fresh.locator('#thread .plan-status strong').last().textContent(),researchHeading)
   await clickNavigation(fresh,'#tab-courses');assert.deepEqual(await fresh.locator('#courses-content .pathway-course').allTextContents(),cards)
   await clickNavigation(fresh,'#open-profile');assert.equal(await fresh.locator('[name=modality]').inputValue(),'Présentiel');await fresh.getByRole('button',{name:'Fermer',exact:true}).click()
   assert.equal(engineCalls,1);assert.equal(apiCalls,4)
   await fresh.screenshot({path:'visual-check/pathway-quota-'+size.width+'.png',fullPage:true})
  }
  await fresh.close()
  await context.close()
 }
 assert.equal(apiCalls,4);assert.equal(engineCalls,1)
 writeFileSync('visual-check/dialogue-pathway-check.json',JSON.stringify(results,null,2))
}finally{
 service.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})
}

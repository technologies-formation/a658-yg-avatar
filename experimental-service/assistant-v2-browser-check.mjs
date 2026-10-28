// Navigateur local authentifié, moteurs et réseau distant simulés exclusivement.
import {createServer,request as httpRequest} from 'node:http'
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import assert from 'node:assert/strict'
import {createRealDialogueTrialInterface} from './dialogue-real-trial.mjs'
import {createPilotCredential} from './pilot-auth.mjs'
import {references} from './reference-test-fixtures.mjs'
import {data} from './result-test-fixtures.mjs'
import {clickNavigation,openNavigation} from './browser-navigation-fixtures.mjs'
const {chromium}=await import(process.env.AVATAR_PLAYWRIGHT_MODULE||'playwright')
async function checkHeaderAppearance(page,name){
 await openNavigation(page)
 const toggle=page.getByRole('switch',{name:'Mode nuit',exact:true})
 assert.equal(await page.locator('.appearance-control').count(),1)
 assert.equal(await page.locator('.sidebar-header .appearance-control').count(),1)
 const bounds=await page.locator('.sidebar-header').evaluate(header=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}}
  return {header:rect(header),brand:rect(header.querySelector('.brand')),control:rect(header.querySelector('.appearance-switch')),close:getComputedStyle(header.querySelector('#close-menu')).display==='none'?null:rect(header.querySelector('#close-menu'))}
 })
 assert.ok(bounds.control.width>=44&&bounds.control.height>=44)
 assert.ok(bounds.control.left>=bounds.brand.right-.5&&bounds.control.right<=bounds.header.right+.5)
 assert.ok(bounds.control.top>=bounds.header.top-.5&&bounds.control.bottom<=bounds.header.bottom+.5)
 if(bounds.close)assert.ok(bounds.close.bottom<=bounds.control.top+.5)
 const before=await page.locator('html').getAttribute('data-appearance'),target=before==='day'?'night':'day'
 await toggle.focus();await page.keyboard.press('Space')
 await page.waitForFunction(value=>document.documentElement.dataset.appearance===value,target)
 assert.equal(await toggle.isChecked(),target==='night')
 assert.equal(await toggle.locator('..').getAttribute('title'),target==='night'?'Passer au mode jour':'Passer au mode nuit')
 await page.locator('.sidebar-header').screenshot({path:'visual-check/appearance-header-'+name+'.png',animations:'disabled'})
 await page.reload();await page.getByRole('button',{name:'Rechercher des formations',exact:true}).waitFor()
 assert.equal(await page.locator('html').getAttribute('data-appearance'),target)
 await openNavigation(page)
 await page.evaluate(()=>{
  const fixture=document.createElement('div');fixture.id='appearance-long-list-test'
  for(let i=0;i<18;i++){
   const row=document.createElement('div');row.className='research-tab-group'
   const button=document.createElement('button');button.className='research-tab';button.textContent='Recherche fictive '+(i+1)+' : formation et perfectionnement dans un domaine professionnel'
   row.append(button);fixture.append(row)
  }
  document.getElementById('research-list').append(fixture)
 })
 assert.equal(await page.locator('#sidebar').evaluate(e=>e.scrollHeight>e.clientHeight),true)
 const overlap=()=>page.evaluate(()=>{
  const control=document.querySelector('.appearance-control').getBoundingClientRect()
  return [...document.querySelectorAll('#appearance-long-list-test .research-tab-group')].some(e=>{const r=e.getBoundingClientRect();return r.top<control.bottom&&r.bottom>control.top})
 })
 assert.equal(await overlap(),false)
 await page.locator('#sidebar').evaluate(e=>e.scrollTop=e.scrollHeight)
 assert.equal(await overlap(),false)
 await page.locator('#sidebar').screenshot({path:'visual-check/appearance-long-list-'+name+'.png',animations:'disabled'})
 await page.evaluate(()=>{document.getElementById('appearance-long-list-test').remove();document.getElementById('sidebar').scrollTop=0})
 await toggle.focus();await page.keyboard.press('Space')
 assert.equal(await page.locator('html').getAttribute('data-appearance'),before)
 if(name==='mobile')await page.locator('#close-menu').click()
}
const origin='https://assistant-v2-test.invalid',password='FAKE_V2_PASSWORD_ONLY',dir=mkdtempSync(join(tmpdir(),'assistant-v2-browser-'))
const refs=references(v=>{const field=(options,formControl='textarea')=>({type:'string',maxLength:4000,requiredInApi:false,requiredInForm:false,formControl,options:options.map(value=>({value,label:value}))});Object.assign(v.pathway.fields,{professionalEnvironment:field(['Police','Autre'],'select'),trainingOffers:field(['Offre A','Offre B']),trainingOrganizers:field(['Centre A','Centre B'])})})
function qualityResult(){const result=data();result.recommendedSteps[0].course.deliveryMode={value:'in_person',sourceField:'catalogue-default',evidence:null};result.optionalSteps[0].course.deliveryMode={value:'online',sourceField:'generalInformation',evidence:'Cette formation est en ligne.'};return result}
let currentRefs=refs
const users=await Promise.all(['desktop','mobile'].map(id=>createPilotCredential({id,username:id,password})))
let dialogueCalls=0,searchCalls=0,pathwayCalls=0;const submitted=[],version={snapshotDate:'2026-10-27',snapshotHash:'a'.repeat(64)},json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
const budgetDirectory=join(dir,'budget');mkdirSync(budgetDirectory,{mode:0o700})
const service=createRealDialogueTrialInterface({enabled:true,paidTrialAuthorized:true,unlimited:true,guidedDraft:true,apiKey:'FAKE_V2_KEY_ONLY',budgetDirectory,courseSearchDirectory:join(dir,'search'),
 courseSearchFetchImpl:async(url)=>{if(url.endsWith('/api/catalogue'))return json({catalogue:version,courses:[{code:'TEST-SEARCH',sourceUrl:'https://outils.ge.ch/referentiel/formation/CatalogueDescription/TEST-SEARCH.html',officialData:{titleRaw:'Word — Formation fictive de recherche',durationRaw:'1 jour',publicRaw:'Public de test',hasOpenSession:true,hasScheduledSession:false,sourceSnapshotDate:'2026-10-27'}}]});searchCalls++;return json({ok:true,catalogue:version,results:[{code:'TEST-SEARCH'}],recommendedResults:[{code:'TEST-SEARCH'}],complementaryResults:[],relatedResults:[],reason:'Résultat fictif du moteur de recherche'})},
 fetchImpl:async(url,init)=>{if(url.endsWith('/input_tokens'))return json({object:'response.input_tokens',input_tokens:1000});dialogueCalls++;const m=JSON.parse(JSON.parse(init.body).input[0].content).messages.at(-1);return json({status:'completed',model:'gpt-6-luna',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({kind:'ask',reply:'À quel groupe de personnel appartenez-vous ?',changes:[{field:m.text==='Je préfère en ligne, présentiel accepté.'?'modality':'professionalEnvironment',value:m.text==='Je préfère en ligne, présentiel accepté.'?'En ligne ou présentiel':'Police',evidence:[{messageId:m.id,quote:m.text}]}]})}]}]})},
 pathwayTrial:{enabled:true,paidTrialAuthorized:true,stateFile:join(dir,'pathway-quotas.json'),reportFile:join(dir,'pathway-report.json'),fetchImpl:async(url,init)=>{if(url.endsWith('/api/profile-references'))return new Response(JSON.stringify(currentRefs),{headers:{'Content-Type':'application/json',ETag:'"'+currentRefs.revision+'"'}});pathwayCalls++;submitted.push(JSON.parse(init.body));return json(qualityResult())}},
 resumeDirectory:join(dir,'resume'),publicOrigin:origin,users,stateFile:join(dir,'quotas.json'),isSecureRequest:()=>true,loadProfileReferences:()=>currentRefs,loadCatalogueStatus:()=>version,preview:data()})
const server=createServer(service.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser
try{
 browser=await chromium.launch({headless:true});mkdirSync('visual-check',{recursive:true})
 for(const [name,viewport]of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
  currentRefs=refs;
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  let deniedResponse=null,blockedTurns=0;
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);if(deniedResponse&&url.pathname==='/private/dialogue'&&req.method()==='POST'&&JSON.parse(req.postData()).action==='turn'){const denied=deniedResponse;deniedResponse=null;blockedTurns++;await route.fulfill(denied);return;}const source=req.headers();const result=await new Promise((resolve,reject)=>{const request=httpRequest({hostname:'127.0.0.1',port:server.address().port,path:url.pathname+url.search,method:req.method(),headers:{host:url.host,authorization:'Basic '+Buffer.from(name+':'+password).toString('base64'),...(source.origin?{origin:source.origin}:{}),...(source['content-type']?{'content-type':source['content-type']}:{})}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))});request.on('error',reject);request.end(req.postDataBuffer()||undefined)});await route.fulfill(result)})
  const oldSearch=searchCalls,oldDialogue=dialogueCalls,oldPathway=pathwayCalls
  await page.goto(origin+'/private/');await page.getByRole('button',{name:'Rechercher des formations',exact:true}).waitFor();assert.equal(searchCalls,oldSearch);assert.equal(dialogueCalls,oldDialogue)
  await page.screenshot({path:'visual-check/v2-welcome-'+name+'.png',animations:'disabled'})
  await checkHeaderAppearance(page,name);assert.equal(searchCalls,oldSearch);assert.equal(dialogueCalls,oldDialogue);assert.equal(pathwayCalls,oldPathway)
  const readDraft=()=>page.evaluate(async()=>{const r=await fetch('/private/dialogue');return (await r.json()).draft})
  await page.evaluate(async()=>{const r=await fetch('/private/dialogue'),v=await r.json();await fetch('/private/dialogue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'edit',expectedRevision:v.draft.revision,profile:{professionalEnvironment:'Police',personnelCategory:'TEST-A',role:'Chef cockpit',managerStatus:'TEST-MANAGER',objective:'Ancien objectif cockpit',existingSkills:'Débutant cockpit',timeAvailable:'6 jours',constraints:'Le matin',trainingOffers:'Offre A',trainingOrganizers:'Centre A'},modality:'En ligne'})})})
  await page.reload();await page.getByRole('button',{name:'Reprendre ma demande existante',exact:true}).waitFor();
  const oldDraft=await readDraft();await clickNavigation(page,'#open-profile');await page.getByText('Une demande existe déjà. Souhaitez-vous la reprendre avec ses critères enregistrés, ou commencer une demande vide ?',{exact:false}).waitFor();await clickNavigation(page,'#open-profile');await clickNavigation(page,'#open-profile');assert.equal(await page.locator('[data-resume-choice]').count(),1);assert.equal(await page.locator('#profile-dialog').evaluate(e=>e.open),false);await page.getByRole('button',{name:'Commencer une demande vide',exact:true}).click();await page.locator('#keep-request').click();assert.deepEqual(await readDraft(),oldDraft)
  await page.getByRole('button',{name:'Reprendre ma demande existante',exact:true}).click();await page.locator('#profile-dialog').waitFor({state:'visible'});assert.equal(await page.locator('[data-resume-choice]').count(),0);assert.equal(await page.locator('#edit-role').inputValue(),'Chef cockpit');assert.equal(await page.locator('#edit-existingSkills').inputValue(),'Débutant cockpit');await page.locator('#close-profile').click()
  await clickNavigation(page,'#restart');await page.locator('#confirm-new-request').click();await page.getByRole('button',{name:'Rechercher des formations',exact:true}).waitFor();assert.deepEqual((await readDraft()).profile,{})
  await page.getByRole('button',{name:'Rechercher des formations',exact:true}).click();await page.locator('#message').fill('Word');await page.locator('#send-message').click();await page.locator('#thread [data-course-code="TEST-SEARCH"]').waitFor();await page.getByText('J’ai trouvé 1 formation',{exact:false}).waitFor();assert.equal(searchCalls,oldSearch+1);assert.equal(dialogueCalls,oldDialogue);assert.equal(pathwayCalls,oldPathway)
  assert.equal(await page.locator('#thread .course-category').count(),0);assert.equal(await page.locator('#thread .course-rationale').count(),0)
  await page.getByRole('button',{name:'Construire un parcours à partir de ces pistes',exact:true}).click();await page.locator('#confirm-new-request').click();await page.getByRole('button',{name:'Police',exact:true}).waitFor();
  const fresh=await readDraft();assert.deepEqual(fresh.profile,{objective:'Word'});assert.equal(fresh.modality,'');assert.equal(await page.getByRole('button',{name:'Vérifier ma demande et préparer le parcours',exact:true}).count(),0)
  await clickNavigation(page,'#open-profile');await page.locator('#profile-dialog').waitFor({state:'visible'});for(const id of ['personnelCategory','role','managerStatus','existingSkills','timeAvailable','modality','professionalEnvironment','other'])assert.equal(await page.locator('#edit-'+id).inputValue(),'');assert.equal(await page.locator('#edit-objective').inputValue(),'Word');assert.equal(await page.getByRole('checkbox',{checked:true}).count(),0);await page.locator('#profile-dialog').getByText('Catalogue actualisé le 27.10.2026.',{exact:true}).waitFor();await page.screenshot({path:'visual-check/v2-fresh-from-search-'+name+'.png',animations:'disabled'});await page.locator('#close-profile').click()
  await page.getByRole('button',{name:'Police',exact:true}).click();await page.getByText('À quel groupe de personnel appartenez-vous ?', {exact:true}).waitFor();assert.equal(dialogueCalls,oldDialogue+1);assert.equal(await page.getByRole('button',{name:'Appliquer ces corrections'}).count(),0)
  const beforeTransport=await readDraft(),callsBeforeTransport=dialogueCalls,historyBeforeTransport=await page.locator('#research-tabs .research-tab').count();
  for(const [status,contentType,body]of [[403,'text/plain','Transport HTTPS via proxy de confiance requis'],[403,'application/json',JSON.stringify({code:'secure_transport_required'})],[502,'text/html','<html>PRIVATE_SENTINEL</html>']]){
   deniedResponse={status,contentType,body};const blockedBefore=blockedTurns;
   await page.locator('#message').fill('Je préfère en ligne, présentiel accepté.');await page.locator('#send-message').click();
   await page.locator('#status').filter({hasText:status===403?'La connexion sécurisée':'La réponse du serveur'}).waitFor({state:'attached'});
   await page.waitForFunction(()=>!document.getElementById('send-message').disabled);assert.equal(await page.locator('#send-message').isEnabled(),true);assert.equal(blockedTurns,blockedBefore+1);
   await page.getByRole('button',{name:'Vérifier ma demande',exact:true}).last().click();await page.locator('#profile-dialog').waitFor({state:'visible'});
   assert.equal(await page.locator('#edit-professionalEnvironment').inputValue(),'Police');await page.locator('#close-profile').click();
   assert.deepEqual(await readDraft(),beforeTransport);assert.equal(dialogueCalls,callsBeforeTransport);assert.equal(searchCalls,oldSearch+1);assert.equal(pathwayCalls,oldPathway);assert.equal(await page.locator('#research-tabs .research-tab').count(),historyBeforeTransport);
   assert.doesNotMatch(await page.locator('#status').innerText(),/PRIVATE_SENTINEL|Unexpected|not valid JSON/);
   await page.screenshot({path:'visual-check/v2-transport-'+status+'-'+(contentType==='application/json'?'json':'text')+'-'+name+'.png',animations:'disabled'});
  }
  const beforeInvalid=await readDraft(),callsBeforeInvalid=dialogueCalls;await page.locator('#message').fill('Je préfère en ligne, présentiel accepté.');await page.locator('#send-message').click();await page.locator('#status').filter({hasText:'Je n’ai pas pu mettre à jour votre demande'}).waitFor({state:'attached'});assert.equal(dialogueCalls,callsBeforeInvalid+1);assert.deepEqual(await readDraft(),beforeInvalid);assert.doesNotMatch(await page.locator('#status').innerText(),/invalid_response|HTTP/);await page.getByRole('button',{name:'Vérifier ma demande',exact:true}).last().waitFor();await page.screenshot({path:'visual-check/v2-dialogue-recovery-'+name+'.png',animations:'disabled'});
  await clickNavigation(page,'#open-profile');await page.locator('#profile-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#edit-professionalEnvironment').inputValue(),'Police');assert.equal(await page.locator('#edit-personnelCategory').inputValue(),'');assert.equal(await page.locator('#edit-entity').count(),0)
  assert.equal(await page.locator('.request-section-title').count(),4)
  await page.locator('#edit-personnelCategory').selectOption('TEST-A');await page.locator('#edit-role').fill('Assistant administratif');await page.locator('#edit-objective').fill('Mieux organiser mes tâches et priorités');await page.locator('#edit-existingSkills').fill('Je débute');await page.locator('#edit-timeAvailable').fill('5 heures sur les six prochains mois');await page.locator('#edit-modality').selectOption('Indifférent');await page.getByRole('checkbox',{name:'Offre A',exact:true}).check();await page.getByRole('checkbox',{name:'Centre B',exact:true}).check();
  currentRefs=references(v=>{Object.assign(v.pathway.fields,refs.pathway.fields);v.pathway.fields.trainingOffers={...v.pathway.fields.trainingOffers,options:[{value:'Offre B',label:'Offre B'},{value:'Offre C',label:'Offre C'}]}})
  await page.getByRole('button',{name:'Enregistrer ma demande',exact:true}).click();await page.getByRole('button',{name:'Actualiser les choix en gardant mes saisies',exact:true}).click();await page.getByRole('checkbox',{name:'Offre C',exact:true}).waitFor();assert.equal(await page.locator('#edit-role').inputValue(),'Assistant administratif');assert.equal(await page.getByRole('checkbox',{name:/Offre A/}).isChecked(),true)
  await page.getByRole('button',{name:'Enregistrer ma demande',exact:true}).click();await page.locator('#profile-error').filter({hasText:'Un choix du catalogue a été retiré'}).waitFor();await page.getByRole('checkbox',{name:/Offre A/}).uncheck();await page.getByRole('checkbox',{name:'Offre C',exact:true}).check();
  await page.screenshot({path:'visual-check/v2-form-'+name+'.png',animations:'disabled'})
  await page.getByRole('button',{name:'Enregistrer ma demande',exact:true}).click();await page.getByRole('button',{name:'Confirmer ma demande et générer — essai payant',exact:true}).click();await page.locator('#status').filter({hasText:'Parcours réel reçu'}).waitFor({state:'attached'});assert.equal(pathwayCalls,oldPathway+1);assert.equal(submitted.at(-1).trainingOffers,'Offre C');assert.equal(submitted.at(-1).trainingOrganizers,'Centre B');assert.equal(submitted.at(-1).professionalEnvironment,'Police')
  await clickNavigation(page,'#tab-courses');await page.waitForFunction(()=>document.getElementById('tab-courses').getAttribute('aria-selected')==='true'&&document.getElementById('conversation').hidden===true);if(viewport.width<=760)await page.waitForFunction(()=>document.getElementById('sidebar').inert);await page.locator('#courses-content').getByText('Présentiel présumé',{exact:true}).waitFor();await page.locator('#courses-content').getByText('Modalité indiquée dans le descriptif : en ligne.',{exact:true}).waitFor();await page.locator('#courses-content').getByText('Ce parcours pourrait nécessiter plus de temps',{exact:false}).waitFor();await page.screenshot({path:'visual-check/v2-results-'+name+'.png',animations:'disabled'});const metrics=page.locator('#courses-content .duration-metrics');await metrics.scrollIntoViewIfNeeded();const boxes=await metrics.locator('.duration-metric').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {y:r.y,right:r.right,width:r.width,overflow:node.scrollWidth>node.clientWidth}}));assert.equal(boxes.length,3);assert.ok(boxes.every(box=>Math.abs(box.y-boxes[0].y)<1&&!box.overflow&&box.width>0&&box.right<=viewport.width));await metrics.screenshot({path:'visual-check/v2-duration-row-'+name+'.png',animations:'disabled'});if(name==='mobile'){await page.setViewportSize({width:320,height:844});const small=await metrics.locator('.duration-metric').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {y:r.y,right:r.right,overflow:node.scrollWidth>node.clientWidth}}));assert.ok(small.every(box=>Math.abs(box.y-small[0].y)<1&&!box.overflow&&box.right<=320));assert.equal(await metrics.locator('.duration-metric:last-child p').evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);return range.getClientRects().length}),1);await metrics.screenshot({path:'visual-check/v2-duration-row-small-mobile.png',animations:'disabled'});await page.setViewportSize(viewport);}assert.equal(await page.locator('#research-tabs .research-tab').count(),2);assert.deepEqual(errors,[]);await page.reload();await page.getByRole('button',{name:'Reprendre ma demande existante',exact:true}).waitFor();assert.equal((await readDraft()).profile.trainingOffers,'Offre C');assert.equal(searchCalls,oldSearch+1);assert.equal(pathwayCalls,oldPathway+1)
  await context.close()
 }
 console.log(JSON.stringify({ok:true,dialogueCalls,searchCalls,pathwayCalls,externalPaidCalls:0}))
}catch(error){if(browser)for(const context of browser.contexts())for(const page of context.pages()){console.log(JSON.stringify({status:await page.locator('#status').textContent(),profileError:await page.locator('#profile-error').count()?await page.locator('#profile-error').textContent():null}));await page.screenshot({path:'visual-check/v2-failure.png',animations:'disabled'}).catch(()=>{})}throw error;}finally{await browser?.close();service.close();service.stop();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}

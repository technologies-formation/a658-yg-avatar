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
import {clickNavigation} from './browser-navigation-fixtures.mjs'
const {chromium}=await import(process.env.AVATAR_PLAYWRIGHT_MODULE||'playwright')
const origin='https://assistant-v2-test.invalid',password='FAKE_V2_PASSWORD_ONLY',dir=mkdtempSync(join(tmpdir(),'assistant-v2-browser-'))
const refs=references(v=>{const field=(options,formControl='textarea')=>({type:'string',maxLength:4000,requiredInApi:false,requiredInForm:false,formControl,options:options.map(value=>({value,label:value}))});Object.assign(v.pathway.fields,{professionalEnvironment:field(['Police','Autre'],'select'),trainingOffers:field(['Offre A','Offre B']),trainingOrganizers:field(['Centre A','Centre B'])})})
const users=await Promise.all(['desktop','mobile'].map(id=>createPilotCredential({id,username:id,password})))
let dialogueCalls=0,searchCalls=0,pathwayCalls=0;const submitted=[],version={snapshotDate:'2026-10-27',snapshotHash:'a'.repeat(64)},json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
const budgetDirectory=join(dir,'budget');mkdirSync(budgetDirectory,{mode:0o700})
const service=createRealDialogueTrialInterface({enabled:true,paidTrialAuthorized:true,unlimited:true,guidedDraft:true,apiKey:'FAKE_V2_KEY_ONLY',budgetDirectory,courseSearchDirectory:join(dir,'search'),
 courseSearchFetchImpl:async(url)=>{if(url.endsWith('/api/catalogue'))return json({catalogue:version,courses:[{code:'TEST-SEARCH',sourceUrl:'https://outils.ge.ch/referentiel/formation/CatalogueDescription/TEST-SEARCH.html',officialData:{titleRaw:'Word — Formation fictive de recherche',durationRaw:'1 jour',publicRaw:'Public de test',hasOpenSession:true,hasScheduledSession:false,sourceSnapshotDate:'2026-10-27'}}]});searchCalls++;return json({ok:true,catalogue:version,results:[{code:'TEST-SEARCH'}],recommendedResults:[{code:'TEST-SEARCH'}],complementaryResults:[],relatedResults:[],reason:'Résultat fictif du moteur de recherche'})},
 fetchImpl:async(url,init)=>{if(url.endsWith('/input_tokens'))return json({object:'response.input_tokens',input_tokens:1000});dialogueCalls++;const m=JSON.parse(JSON.parse(init.body).input[0].content).messages.at(-1);return json({status:'completed',model:'gpt-6-luna',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({kind:'ask',reply:'À quel groupe de personnel appartenez-vous ?',changes:[{field:'professionalEnvironment',value:'Police',evidence:[{messageId:m.id,quote:m.text}]}]})}]}]})},
 pathwayTrial:{enabled:true,paidTrialAuthorized:true,stateFile:join(dir,'pathway-quotas.json'),reportFile:join(dir,'pathway-report.json'),fetchImpl:async(url,init)=>{if(url.endsWith('/api/profile-references'))return new Response(JSON.stringify(refs),{headers:{'Content-Type':'application/json',ETag:'"'+refs.revision+'"'}});pathwayCalls++;submitted.push(JSON.parse(init.body));return json(data())}},
 resumeDirectory:join(dir,'resume'),publicOrigin:origin,users,stateFile:join(dir,'quotas.json'),isSecureRequest:()=>true,loadProfileReferences:()=>refs,preview:data()})
const server=createServer(service.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser
try{
 browser=await chromium.launch({headless:true});mkdirSync('visual-check',{recursive:true})
 for(const [name,viewport]of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);const source=req.headers();const result=await new Promise((resolve,reject)=>{const request=httpRequest({hostname:'127.0.0.1',port:server.address().port,path:url.pathname+url.search,method:req.method(),headers:{host:url.host,authorization:'Basic '+Buffer.from(name+':'+password).toString('base64'),...(source.origin?{origin:source.origin}:{}),...(source['content-type']?{'content-type':source['content-type']}:{})}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))});request.on('error',reject);request.end(req.postDataBuffer()||undefined)});await route.fulfill(result)})
  const oldSearch=searchCalls,oldDialogue=dialogueCalls,oldPathway=pathwayCalls
  await page.goto(origin+'/private/');await page.getByRole('button',{name:'Rechercher des formations',exact:true}).waitFor();assert.equal(searchCalls,oldSearch);assert.equal(dialogueCalls,oldDialogue)
  await page.screenshot({path:'visual-check/v2-welcome-'+name+'.png'})
  await page.getByRole('button',{name:'Rechercher des formations',exact:true}).click();await page.locator('#message').fill('Word');await page.locator('#send-message').click();await page.locator('#thread [data-course-code="TEST-SEARCH"]').waitFor();assert.equal(searchCalls,oldSearch+1);assert.equal(dialogueCalls,oldDialogue);assert.equal(pathwayCalls,oldPathway)
  await page.reload();await page.locator('#thread [data-course-code="TEST-SEARCH"]').waitFor();assert.equal(searchCalls,oldSearch+1)
  await page.getByRole('button',{name:'Construire mon parcours',exact:true}).click();await page.getByRole('button',{name:'Police',exact:true}).click();await page.getByText('À quel groupe de personnel appartenez-vous ?', {exact:true}).waitFor();assert.equal(dialogueCalls,oldDialogue+1);assert.equal(await page.getByRole('button',{name:'Appliquer ces corrections'}).count(),0)
  await clickNavigation(page,'#open-profile');assert.equal(await page.locator('#edit-professionalEnvironment').inputValue(),'Police');assert.equal(await page.locator('#edit-personnelCategory').inputValue(),'');assert.equal(await page.locator('#edit-entity').count(),0)
  assert.equal(await page.locator('.request-section-title').count(),4)
  await page.locator('#edit-personnelCategory').selectOption('TEST-A');await page.locator('#edit-role').fill('Assistant administratif');await page.locator('#edit-objective').fill('Mieux organiser mes tâches et priorités');await page.locator('#edit-existingSkills').fill('Je débute');await page.locator('#edit-timeAvailable').fill('5 heures sur les six prochains mois');await page.locator('#edit-modality').selectOption('Indifférent');await page.getByRole('checkbox',{name:'Offre A',exact:true}).check();await page.getByRole('checkbox',{name:'Centre B',exact:true}).check();
  await page.screenshot({path:'visual-check/v2-form-'+name+'.png'})
  await page.getByRole('button',{name:'Enregistrer ma demande',exact:true}).click();await page.getByRole('button',{name:'Confirmer ma demande et générer — essai payant',exact:true}).click();await page.locator('#status').filter({hasText:'Parcours réel reçu'}).waitFor({state:'attached'});assert.equal(pathwayCalls,oldPathway+1);assert.equal(submitted.at(-1).trainingOffers,'Offre A');assert.equal(submitted.at(-1).trainingOrganizers,'Centre B');assert.equal(submitted.at(-1).professionalEnvironment,'Police')
  await clickNavigation(page,'#tab-courses');await page.screenshot({path:'visual-check/v2-results-'+name+'.png'});assert.equal(await page.locator('#research-tabs .research-tab').count(),2);assert.deepEqual(errors,[])
  await context.close()
 }
 console.log(JSON.stringify({ok:true,dialogueCalls,searchCalls,pathwayCalls,externalPaidCalls:0}))
}finally{await browser?.close();service.close();service.stop();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}

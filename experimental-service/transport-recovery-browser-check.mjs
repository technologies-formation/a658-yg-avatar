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
// Une instance indépendante par format : aucune modification des limites réelles.
for(const [name,viewport]of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
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
 browser=await chromium.launch({headless:true});mkdirSync('visual-check',{recursive:true});
 const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let deniedResponse=null,blockedTurns=0;
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);
  if(deniedResponse&&url.pathname==='/private/dialogue'&&req.method()==='POST'&&JSON.parse(req.postData()).action==='turn'){
   const denied=deniedResponse;deniedResponse=null;blockedTurns++;await route.fulfill(denied);return;
  }
  const source=req.headers(),result=await new Promise((resolve,reject)=>{
   const request=httpRequest({hostname:'127.0.0.1',port:server.address().port,path:url.pathname+url.search,method:req.method(),headers:{host:url.host,authorization:'Basic '+Buffer.from(name+':'+password).toString('base64'),...(source.origin?{origin:source.origin}:{}),...(source['content-type']?{'content-type':source['content-type']}:{})}},res=>{
    const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
   });request.on('error',reject);request.end(req.postDataBuffer()||undefined);
  });await route.fulfill(result);
 });
 const readState=()=>page.evaluate(async()=>{const r=await fetch('/private/dialogue');if(!r.ok)throw Error('Fixture GET HTTP '+r.status);const v=await r.json();return {draft:v.draft,history:v.savedPathways,budget:v.budget};});
 await page.goto(origin+'/private/');await page.getByRole('button',{name:'Rechercher des formations',exact:true}).click();
 await page.locator('#message').fill('Word');await page.locator('#send-message').click();await page.getByText('J’ai trouvé 1 formation',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Affiner cette recherche et construire mon parcours',exact:true}).first().click();await page.getByRole('button',{name:'Police',exact:true}).waitFor();assert.equal(await page.locator('#profile-dialog').evaluate(e=>e.open),false);
 await page.getByRole('button',{name:'Police',exact:true}).click();await page.getByText('À quel groupe de personnel appartenez-vous ?', {exact:true}).waitFor();
 const before=await readState(),callsBefore=dialogueCalls;
 assert.equal(before.history.length,1);assert.equal(before.draft.profile.professionalEnvironment,'Police');
 for(const [status,contentType,body]of [[403,'text/plain','Transport HTTPS via proxy de confiance requis'],[403,'application/json',JSON.stringify({code:'secure_transport_required'})],[502,'text/html','<html>PRIVATE_SENTINEL</html>']]){
  deniedResponse={status,contentType,body};const blockedBefore=blockedTurns;
  await page.locator('#message').fill('Je préfère en ligne, présentiel accepté.');await page.locator('#send-message').click();
  await page.locator('#status').filter({hasText:status===403?'La connexion sécurisée':'La réponse du serveur'}).waitFor({state:'attached'});
  await page.waitForFunction(()=>!document.getElementById('send-message').disabled);assert.equal(blockedTurns,blockedBefore+1);
  await page.getByRole('button',{name:'Vérifier ma demande',exact:true}).last().click();await page.locator('#profile-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#edit-professionalEnvironment').inputValue(),'Police');await page.locator('#close-profile').click();
  assert.deepEqual(await readState(),before);assert.equal(dialogueCalls,callsBefore);assert.equal(searchCalls,1);assert.equal(pathwayCalls,0);
  assert.doesNotMatch(await page.locator('#status').innerText(),/PRIVATE_SENTINEL|Unexpected|not valid JSON/);
  await page.screenshot({path:'visual-check/v2-transport-'+status+'-'+(contentType==='application/json'?'json':'text')+'-'+name+'.png',animations:'disabled'});
 }
 assert.deepEqual(errors,[]);assert.equal(blockedTurns,3);await context.close();
 console.log(JSON.stringify({name,blockedTurns,dialogueCalls,searchCalls,pathwayCalls,historyPreserved:true,externalPaidCalls:0}));
}finally{await browser?.close();service.close();service.stop();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
}

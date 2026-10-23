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
const users=await Promise.all(['desktop','mobile'].map(name=>createPilotCredential({id:'browser-'+name,username:'browser-'+name,password})))
const budgetDirectory=join(dir,'budget');mkdirSync(budgetDirectory,{mode:0o700});let apiCalls=0
const service=createRealDialogueTrialInterface({enabled:true,paidTrialAuthorized:true,apiKey:'FAKE_BROWSER_KEY_ONLY',budgetDirectory,fetchImpl:async(url,init)=>{
 apiCalls++;if(url.endsWith('/input_tokens'))return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:1000}),{headers:{'Content-Type':'application/json'}});
 const last=JSON.parse(JSON.parse(init.body).input[0].content).messages.at(-1);return new Response(JSON.stringify({status:'completed',model:'gpt-6-luna',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({kind:'ask',reply:'Quels documents rédigez-vous au quotidien ?',changes:[{field:'objective',value:'Progresser sur Word pour mes rapports',evidence:[{messageId:last.id,quote:last.text}]}]})}]}]}),{headers:{'Content-Type':'application/json'}});
 },publicOrigin:origin,users,stateFile:join(dir,'quotas.json'),
 isSecureRequest:req=>['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress),loadProfileReferences:()=>references(),preview:data()})
const server=createServer(service.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser;const results=[]
try{
 browser=await chromium.launch({headless:true});mkdirSync('visual-check',{recursive:true})
 for(const [name,viewport]of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
  // Un compte synthétique par écran ; les quotas restent actifs pour chaque session.
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],external=[];let pathways=0
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',async route=>{
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
  await page.goto(origin+'/private/');await page.locator('#dialogue-budget').waitFor()
  await page.locator('#message').fill('Je voudrais progresser sur Word pour mes rapports.')
  await page.getByRole('button',{name:'Envoyer un message — essai payant',exact:true}).click()
  await page.getByRole('button',{name:'Appliquer ces corrections',exact:true}).waitFor()
  await page.getByRole('button',{name:'Mon profil',exact:true}).click()
  assert.equal(await page.locator('[name=objective]').inputValue(),'')
  await page.getByRole('button',{name:'Fermer',exact:true}).click()
  await page.getByRole('button',{name:'Appliquer ces corrections',exact:true}).click()
  await page.getByText('Repère enregistré dans votre profil.',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Mon profil',exact:true}).click()
  assert.equal(await page.locator('[name=objective]').inputValue(),'Progresser sur Word pour mes rapports')
  await page.locator('[name=role]').fill('Assistant administratif')
  await page.locator('[name=personnelCategory]').selectOption('TEST-A')
  await page.locator('[name=existingSkills]').fill('Je débute')
  await page.locator('[name=timeAvailable]').fill('1 à 2 jours')
  await page.locator('[name=modality]').selectOption('En ligne')
  await page.getByRole('button',{name:'Enregistrer le profil',exact:true}).click()
  assert.match(await page.locator('#dialogue-budget').textContent(),/1000 tokens entrants, 100 sortants/)
  await page.getByRole('button',{name:'Confirmer le profil et simuler',exact:true}).waitFor();assert.equal(pathways,0)
  await page.getByRole('button',{name:'Confirmer le profil et simuler',exact:true}).click();await page.locator('#thread .pathway-course').first().waitFor()
  assert.equal(pathways,1)
  assert.equal(await page.locator('#thread').getByText('Exemple fixe pour tester l’affichage, sans recherche de cours. Le dialogue IA est distinct et peut consommer des appels OpenAI.',{exact:true}).count(),1)
  const cards=await page.locator('#thread .pathway-course').allTextContents()
  await page.locator('#tab-courses').click();assert.equal(await page.getByText('La synthèse de votre parcours',{exact:true}).count(),1);assert.deepEqual(await page.locator('#courses-content .pathway-course').allTextContents(),cards)
  await page.getByRole('button',{name:'Mon profil',exact:true}).click();await page.locator('[name=modality]').selectOption('Présentiel')
  await page.getByRole('button',{name:'Enregistrer le profil',exact:true}).click();await page.locator('#tab-courses').click()
  await page.locator('#courses-content').getByText('Parcours n° 1 · Parcours à actualiser',{exact:true}).waitFor()
  assert.deepEqual(await page.locator('#courses-content .pathway-course').allTextContents(),cards);assert.equal(pathways,1)
  assert.equal(await page.locator('#tab-courses').getAttribute('aria-selected'),'true')
  await page.screenshot({path:'visual-check/dialogue-real-'+name+'-courses.png',fullPage:true,animations:'disabled'})
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
  assert.equal(overflow,false);assert.deepEqual(errors,[]);assert.deepEqual(external,[])
  results.push({name,pathways,proposalRequiresAcceptance:true,resultPreserved:true,noExternalRequests:true,transport:'fake'})
  await context.close()
 }
 assert.equal(apiCalls,4)
 writeFileSync('visual-check/dialogue-real-check.json',JSON.stringify(results,null,2))
}finally{
 service.close();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})
}

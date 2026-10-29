// Navigateur de test uniquement. Origine, IA et SMTP fictifs ; aucune activation.
import assert from 'node:assert/strict'
import {request as httpRequest} from 'node:http'
import {mkdirSync,readFileSync} from 'node:fs'
import {publicPilotFixture} from './public-pilot-test-fixtures.mjs'
import {clickNavigation} from './browser-navigation-fixtures.mjs'
const {chromium}=await import(process.env.AVATAR_PLAYWRIGHT_MODULE||'playwright')
const origin='https://public-test.invalid',browser=await chromium.launch({headless:true})
try{
 mkdirSync('visual-check',{recursive:true})
 for(const [name,viewport,mailPending]of [['desktop',{width:1280,height:900},false],['mobile',{width:390,height:844},false],['pending-desktop',{width:1280,height:900},true],['pending-mobile',{width:390,height:844},true]]){
  const cleanup=[],f=await publicPilotFixture({after:fn=>cleanup.push(fn)},{mailPending}),context=await browser.newContext({viewport}),errors=[]
  try{
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());assert.equal(url.origin,origin);if(url.pathname==='/favicon.ico'){await route.fulfill({status:404,body:''});return;}assert.ok(url.pathname.startsWith('/public/'))
    const headers=await req.allHeaders(),result=await new Promise((resolve,reject)=>{
     const request=httpRequest({hostname:'127.0.0.1',port:f.port,path:url.pathname,method:req.method(),headers:{host:url.host,'x-test-secure':'true',...(headers.cookie?{cookie:headers.cookie}:{}),...(headers.origin?{origin:headers.origin}:{}),...(headers['content-type']?{'content-type':headers['content-type']}:{})}},res=>{
      const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:Object.fromEntries(Object.entries(res.headers).map(([key,value])=>[key,Array.isArray(value)?value.join('\n'):String(value)])),body:Buffer.concat(chunks)}))
     });request.on('error',reject);request.end(req.postDataBuffer()||undefined)
    });await route.fulfill(result)
   })
   await page.goto(origin+'/public/');await page.getByRole('button',{name:'Rechercher des formations',exact:true}).waitFor()
   assert.match(await page.locator('#messaging-config').textContent(),/"publicPilot":true/);assert.equal(f.calls.length,0)
   assert.match(await page.locator('#dialogue-budget').textContent(),/0\/10 messages/);assert.equal(await page.locator('#dialogue-budget').isVisible(),true)
   await page.screenshot({path:'visual-check/public-welcome-'+name+'.png',animations:'disabled'})
   await page.getByRole('button',{name:'Rechercher des formations',exact:true}).click();await page.locator('#message').fill('Word');await page.locator('#send-message').click()
   await page.getByText('J’ai trouvé 1 formation',{exact:false}).waitFor();assert.equal(f.calls.length,1)
   assert.match(await page.locator('#dialogue-budget').textContent(),/1\/3 recherches/)
   await clickNavigation(page,'#tab-courses');await page.getByRole('button',{name:'Télécharger la synthèse en PDF',exact:true}).waitFor()
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger la synthèse en PDF',exact:true}).click();const pdf=await download;assert.match(pdf.suggestedFilename(),/\.pdf$/);assert.match(readFileSync(await pdf.path()).toString('latin1',0,8),/^%PDF-/)
   if(mailPending){
    const notice=page.locator('.public-mail-pending');await notice.waitFor();assert.equal(await notice.isVisible(),true);assert.match(await notice.textContent(),/liste des testeurs autorisés/)
    assert.equal(await page.getByRole('button',{name:'Recevoir par courriel',exact:true}).count(),0);assert.equal(await page.locator('#research-email-address').count(),0)
    assert.equal(f.emails.length,0);await page.screenshot({path:'visual-check/public-mail-'+name+'.png',animations:'disabled'})
    await page.reload();await page.getByRole('button',{name:'Rechercher des formations',exact:true}).waitFor();await clickNavigation(page,'#tab-courses')
    await page.locator('.public-mail-pending').waitFor();await page.getByRole('button',{name:'Télécharger la synthèse en PDF',exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Recevoir par courriel',exact:true}).count(),0);assert.equal(f.emails.length,0)
   }else{
   await page.getByRole('button',{name:'Recevoir par courriel',exact:true}).click();await page.getByLabel('Mon adresse de courriel').fill('outsider@example.invalid')
   await page.getByRole('button',{name:'Envoyer ma synthèse',exact:true}).click();await page.locator('.email-status').filter({hasText:'Cette adresse n’est pas autorisée'}).waitFor()
   assert.equal(f.emails.length,0);await page.screenshot({path:'visual-check/public-mail-refusal-'+name+'.png',animations:'disabled'});await page.getByRole('button',{name:'Fermer',exact:true}).click()
   await page.getByRole('button',{name:'Recevoir par courriel',exact:true}).click();await page.getByLabel('Mon adresse de courriel').fill('tester@example.invalid')
   await page.getByRole('button',{name:'Envoyer ma synthèse',exact:true}).click();await page.locator('.email-status').filter({hasText:'a été prise en charge'}).waitFor();assert.equal(f.emails.length,1)
   }
   assert.equal(f.calls.length,1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[])
   console.log(JSON.stringify({name,publicIsolation:true,pdf:true,allowlist:!mailPending,mailPending,paidExternalCalls:0,realSmtpConnections:0}))
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();for(const close of cleanup.reverse())await close()}
 }
}finally{await browser.close()}

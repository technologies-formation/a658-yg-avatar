import {openNavigation,clickNavigation} from './browser-navigation-fixtures.mjs';
// Contrat navigateur uniquement : chaque route est interceptée, aucun moteur externe.
import assert from 'node:assert/strict';import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';
import {renderMessagingPage} from './messaging-page.mjs';import {references} from './reference-test-fixtures.mjs';import {data} from './result-test-fixtures.mjs';
if(!process.env.AVATAR_PLAYWRIGHT_MODULE)throw Error('Playwright explicite requis');const {chromium}=await import(pathToFileURL(resolve(process.env.AVATAR_PLAYWRIGHT_MODULE)).href);
const browser=await chromium.launch({headless:true}),output=resolve('visual-check');mkdirSync(output,{recursive:true});const reports=[];
try{for(const [name,width,height]of [['desktop',1280,900],['mobile',390,844]]){
 const context=await browser.newContext({viewport:{width,height}}),r=references(),result=data(),origin='https://messaging-test.invalid';let posts=0;const errors=[],unexpected=[],payloads=[];
 try{await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(url.origin!==origin){unexpected.push(request.url());return route.abort();}
  if(path==='/')return route.fulfill({contentType:'text/html',body:renderMessagingPage(r)});
  if(['/private/messaging-client.mjs','/private/messaging-state.mjs','/private/research-tabs.mjs','/private/messaging-navigation.mjs','/private/pathway-result-view.mjs','/private/pathway-result.mjs'].includes(path))return route.fulfill({contentType:'text/javascript',body:readFileSync(new URL('.'+path.replace('/private',''),import.meta.url),'utf8')});
  if(path==='/private/profile-references')return route.fulfill({json:{references:r,requestId:'synthetic-ticket-'+posts}});
  if(path==='/private/pathway'&&request.method()==='POST'){const body=request.postDataJSON();assert.equal(body.confirmed,true);assert.equal(body.referenceRevision,r.revision);payloads.push(body);posts++;return route.fulfill({json:{mode:'simulation',preview:result,quota:{total:posts,maxTotalRequests:5}}});}
  unexpected.push(path);return route.abort();
 });const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 const send=async text=>{await page.locator('#message').fill(text);await page.getByRole('button',{name:'Envoyer',exact:true}).click();};
 await page.getByRole('button',{name:'Groupe de test A',exact:true}).click();await send('Service libre');await page.getByRole('button',{name:'Situation de test',exact:true}).click();await send('Assistant de test');await send('Organiser mes tâches de test');
 await page.getByRole('button',{name:'Quelques bases',exact:true}).click();await page.getByRole('button',{name:'1 à 2 jours',exact:true}).click();
 await page.getByRole('button',{name:'En ligne',exact:true}).click();await send('Le matin uniquement');assert.equal(posts,0);
 await page.getByRole('button',{name:'Confirmer ma demande et simuler',exact:true}).click();await page.locator('#conversation .pathway-result').waitFor();assert.equal(posts,1);
 assert.equal(payloads[0].profile.existingSkills,'Quelques bases');assert.equal(payloads[0].profile.entity,'Service libre');assert.equal(payloads[0].profile.managerStatus,'TEST-MANAGER');assert.equal(payloads[0].profile.constraints,'Modalité souhaitée : en ligne\nLe matin uniquement');
 const cards=await page.locator('#conversation .pathway-course h4').allTextContents();await clickNavigation(page,'#tab-courses');
 assert.deepEqual(await page.locator('#courses-content .pathway-course h4').allTextContents(),cards);assert.match(await page.locator('#courses-content').innerText(),/Exemple fictif : les durées des cours ne sont pas comparées/);assert.doesNotMatch(await page.locator('#courses-content').innerText(),/Le parcours dépasse le temps disponible|Dépassement :/);
 assert.match(await page.locator('#courses-content').innerText(),/Disponibilité des sessions : à vérifier/);assert.doesNotMatch(await page.locator('#courses-content').innerText(),/Inscriptions ouvertes/);
 await page.locator('#courses-content .course-discuss').first().click();await page.waitForFunction(()=>document.getElementById('conversation').hidden===false);assert.match(await page.locator('#thread').innerText(),/TEST-1/);assert.equal(posts,1);
 await clickNavigation(page,'#open-profile');await page.locator('#edit-objective').fill('Rédiger des documents de test');await page.getByRole('button',{name:'Enregistrer ma demande',exact:true}).click();assert.equal(posts,1);
 await clickNavigation(page,'#tab-courses');assert.match(await page.locator('#courses-content').innerText(),/La demande a changé ; ces résultats restent/);assert.deepEqual(await page.locator('#courses-content .pathway-course h4').allTextContents(),cards);
 assert.equal(await page.locator('#tab-courses').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#tab-discussion').getAttribute('aria-selected'),'false');
 await page.waitForFunction(()=>getComputedStyle(document.getElementById('tab-courses')).color==='rgb(255, 255, 255)');
 await page.screenshot({path:join(output,'messaging-'+name+'-courses.png'),fullPage:true,animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.reload();await page.locator('#thread').getByText(/Vos réponses ont été restaurées/).waitFor();assert.equal(posts,1);assert.equal(await page.locator('#conversation .pathway-result').count(),0);
 await clickNavigation(page,'#tab-courses');assert.equal(await page.locator('#research-tabs [role=tab]').count(),1);assert.deepEqual(await page.locator('#courses-content .pathway-course h4').allTextContents(),cards);assert.equal(posts,1);
 await page.screenshot({path:join(output,'messaging-'+name+'-restored.png'),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);reports.push({name,posts,sharedResult:true,stalePreservesResult:true,draftRestored:true,noExternalRequests:true});
 }finally{await context.close();}
}}finally{await browser.close();}
writeFileSync(join(output,'messaging-check.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));

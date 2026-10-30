// Contrôle DOM du parcours complet ; HTTP authentifié local et fournisseurs fictifs.
// Ce contrôle ne remplace pas une vérification visuelle en navigateur.
import {createServer,request as httpRequest} from 'node:http'
import {readFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import {createRealDialogueTrialInterface} from './dialogue-real-trial.mjs'
import {createPilotCredential} from './pilot-auth.mjs'
import {references} from './reference-test-fixtures.mjs'
import {data} from './result-test-fixtures.mjs'
const {JSDOM}=await import(process.env.AVATAR_JSDOM_MODULE||'jsdom')
const origin='https://dialogue-dom.invalid',dir=mkdtempSync(join(tmpdir(),'avatar-dom-')),password='FAKE_DOM_PASSWORD_TEST_ONLY'
const refs=references(v=>{const f=(options,control='textarea')=>({type:'string',maxLength:4000,requiredInApi:false,requiredInForm:false,formControl:control,options:options.map(value=>({value,label:value}))});Object.assign(v.pathway.fields,{professionalEnvironment:f(['Pouvoir judiciaire'],'select'),trainingOffers:f(['OPE']),trainingOrganizers:f(['Centre officiel'])})})
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}})
const version={snapshotDate:'2026-10-29',snapshotHash:'a'.repeat(64)}
const result=data();result.recommendedSteps[0].course.catalogueOffers=['OPE'];result.recommendedSteps[0].course.organizingEntity='Centre officiel';result.recommendedSteps[0].relevance={level:'partial',reason:'Quel cockpit utilisez-vous ?'}
let searches=0,generations=0,turns=0,ticketReads=0,denyTicket=true;const captured=[]
mkdirSync(join(dir,'budget'),{mode:0o700})
const service=createRealDialogueTrialInterface({enabled:true,paidTrialAuthorized:true,unlimited:true,guidedDraft:true,apiKey:'FAKE_ONLY',budgetDirectory:join(dir,'budget'),courseSearchDirectory:join(dir,'search'),
 publicOrigin:origin,users:[await createPilotCredential({id:'dom',username:'dom',password})],stateFile:join(dir,'state.json'),resumeDirectory:join(dir,'resume'),loadProfileReferences:()=>refs,isSecureRequest:()=>true,preview:data(),
 courseSearchFetchImpl:async url=>{if(url.endsWith('/api/catalogue'))return json({catalogue:version,courses:[{code:'TRT450',sourceUrl:'https://outils.ge.ch/referentiel/formation/CatalogueDescription/TRT450.html',catalogueOffers:['OPE'],organizingEntity:'Centre officiel',officialData:{titleRaw:'Cockpit RH'}}]});searches++;return json({ok:true,catalogue:version,results:[{code:'TRT450'}],recommendedResults:[{code:'TRT450',relevance:{level:'partial',reason:'Quel cockpit utilisez-vous ?'}}],reason:'Cockpits à comparer'});},
 fetchImpl:async(url,init)=>{if(url.endsWith('/input_tokens'))return json({object:'response.input_tokens',input_tokens:1000});turns++;const payload=JSON.parse(JSON.parse(init.body).input[0].content);captured.push(payload);const m=payload.messages.at(-1);const output=payload.researchContext&&m.text==='Je veux suivre les absences dans le Cockpit RH'?{kind:'recap',reply:'Je propose de préciser votre objectif sur **Cockpit RH** pour le suivi des absences.',changes:[{field:'objective',value:'Cockpit RH : suivre les absences et faire des tableaux pour mon staff',evidence:[{messageId:m.id,quote:m.text}]}]}:payload.researchContext?{kind:'recap',reply:'Objet : demande de formation pour mes objectifs EEDP\nBonjour, je souhaite suivre les cours proposés avant fin 2026.',changes:[]}:{kind:'ask',reply:'Merci. Quel est votre niveau ?',changes:[{field:'objective',value:'Cockpits — faire des tableaux pour mon staff',evidence:[{messageId:m.id,quote:m.text}]}]};return json({status:'completed',model:'gpt-6-luna',usage:{input_tokens:1000,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(output)}]}]});},
 pathwayTrial:{enabled:true,paidTrialAuthorized:true,stateFile:join(dir,'pathway-state.json'),reportFile:join(dir,'report.json'),fetchImpl:async url=>{if(url.endsWith('/api/profile-references'))return new Response(JSON.stringify(refs),{headers:{'Content-Type':'application/json',ETag:'"'+refs.revision+'"'}});generations++;return json(result);}}})
const server=createServer(service.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const request=(path,init={})=>new Promise((resolve,reject)=>{
 if(path==='/private/profile-references'){ticketReads++;if(denyTicket){denyTicket=false;resolve(json({code:'secure_transport_required'},403));return;}}
 const req=httpRequest({hostname:'127.0.0.1',port:server.address().port,path,method:init.method||'GET',headers:{host:new URL(origin).host,origin,authorization:'Basic '+Buffer.from('dom:'+password).toString('base64'),...(init.headers||{})}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})))});req.on('error',reject);req.end(init.body)
})
let dom
try{
 const html=await (await request('/private/')).text();dom=new JSDOM(html,{url:origin+'/private/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window
 w.fetch=(url,init)=>request(String(url),init);w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.Headers=Headers;w.Response=Response;w.structuredClone=structuredClone;w.crypto.randomUUID=()=>crypto.randomUUID();w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.ResizeObserver=class{observe(){}disconnect(){}};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 const modules=new Map(),context=dom.getInternalVMContext()
 function load(url){if(modules.has(url))return modules.get(url);const file=new URL(url).pathname.split('/').at(-1),module=new vm.SourceTextModule(readFileSync(new URL(file,import.meta.url),'utf8'),{context,identifier:url});modules.set(url,module);return module}
 const entry=load(origin+'/private/dialogue-client.mjs');await entry.link((spec,ref)=>load(new URL(spec,ref.identifier).href));await entry.evaluate()
 const wait=async(fn,label)=>{const end=Date.now()+12000;while(!fn()){if(Date.now()>end)throw Error('Timeout: '+label+' | '+w.document.getElementById('status').textContent);await new Promise(r=>setTimeout(r,20));}}
 const button=label=>[...w.document.querySelectorAll('button')].find(e=>e.textContent.trim()===label||e.getAttribute('aria-label')===label)
 const click=async(label,ready)=>{assert.ok(button(label),'Bouton absent : '+label);button(label).click();if(ready)await wait(ready,label)}
 const send=async(text,ready)=>{w.document.getElementById('message').value=text;w.document.getElementById('composer').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(ready,text)}
 const question=field=>()=>Boolean(w.document.querySelector('[data-guided-question="'+field+'"]'))
 await click('Rechercher des formations',()=>w.document.getElementById('message').placeholder.startsWith('Un titre'))
 await send('cockpits',()=>Boolean(button('Affiner cette recherche et construire mon parcours')));assert.equal(searches,1);assert.equal(turns,0)
 assert.match(w.document.getElementById('thread').textContent,/Correspondance partielle/);assert.match(w.document.getElementById('thread').textContent,/Centre officiel/)
 await click('Affiner cette recherche et construire mon parcours',question('professionalEnvironment'))
 assert.equal(button('Je préfère compléter directement Ma demande'),undefined);assert.equal(button('Ouvrir le formulaire Ma demande'),undefined)
 await click('Pouvoir judiciaire',question('personnelCategory'));await click('Groupe de test A',question('role'));await send('chef',question('managerStatus'));assert.equal(turns,0)
 await click('Je préfère ne pas préciser',question('objective'));await send('faire des tableaux pour mon staff',question('existingSkills'));assert.equal(turns,1);assert.equal(captured[0].currentQuestion.field,'objective')
 await send("je n'ai jamais utiliser ces cockpits",question('timeAvailable'));assert.equal(turns,1)
 await send("j'ai 10 jours",question('modality'));assert.equal(turns,1)
 await click('En ligne',()=>Boolean(button('Choisir les offres et vérifier ma demande')));await click('Choisir les offres et vérifier ma demande',()=>Boolean(w.document.querySelector('.scope-review-form')||button('Enregistrer le périmètre et vérifier ma demande')))
 const scopeButton=[...w.document.querySelectorAll('button')].find(e=>/périmètre.*vérifier|Continuer sans|Valider.*vérifier/i.test(e.textContent));assert.ok(scopeButton,'Validation du périmètre');scopeButton.click()
 await wait(()=>Boolean(button('Confirmer ma demande et générer — essai payant')),'confirmation');await click('Confirmer ma demande et générer — essai payant',()=>generations===1&&/Parcours réel reçu/.test(w.document.getElementById('status').textContent));assert.equal(ticketReads,2)
 const questions=w.document.querySelectorAll('[data-guided-question]').length
 await send('Aidez-moi à rédiger un mail pour mon EEDP',()=>turns===2&&/Objet : demande/.test(w.document.getElementById('thread').textContent))
 assert.equal(w.document.querySelectorAll('[data-guided-question]').length,questions);assert.equal(generations,1);assert.equal(searches,1);assert.ok(captured.at(-1).researchContext)
 await send('Précisez trois cours avant fin 2026',()=>turns===3&&/Réponse IA reçue/.test(w.document.getElementById('status').textContent));assert.equal(generations,1)
 assert.equal(captured.at(-1).messages.filter(x=>x.role==='user').length,3)
 await send('Je veux suivre les absences dans le Cockpit RH',()=>Boolean(button('Appliquer ces corrections')))
 let state=await (await request('/private/dialogue')).json();assert.equal(state.draft.profile.objective,'Cockpits — faire des tableaux pour mon staff');assert.equal(generations,1)
 // Le résultat de test principal est synthétique ; le cours officiel vient de la recherche simple.
 assert.ok(w.document.querySelector('.dialogue-reply strong'))
 await click('Appliquer ces corrections',()=>Boolean(button('Confirmer ma demande et générer — essai payant')))
 state=await (await request('/private/dialogue')).json();assert.match(state.draft.profile.objective,/suivre les absences/);assert.equal(generations,1);assert.equal(state.savedPathways.length,2)
 assert.match(w.document.getElementById('thread').textContent,/Cockpit RH : suivre les absences/)
 console.log(JSON.stringify({ok:true,checks:'Cockpit, réponses libres au premier essai, boutons retirés, métadonnées, appréciation, 403 GET repris, courriel et suivi',searches,generations,dialogueTurns:turns,ticketReads}))
}finally{dom?.window.close();service.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}

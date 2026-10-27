import {readCatalogueVersion,catalogueVersionLabel} from './catalogue-version.mjs';
import {initDeviceMemory} from './device-memory-client.mjs';
import {appendResearchEmail} from './research-email-client.mjs';
import {AI_GUIDANCE,appendPdfExport} from './pathway-pdf.mjs';
import {createAssistantAvatar,initAssistantPresentation,createResearchCriteria} from './assistant-presentation.mjs';
import {initMessagingNavigation,confirmNewRequest} from './messaging-navigation.mjs';
import {renderResearchTabs} from './research-tabs.mjs';
// Client privé : dialogue fictif ou essai IA explicite ; uniquement des routes du serveur.
import {fields,composeConstraints,validateMessagingProfile,createMessagingSnapshot,snapshotIsStale,researchLabel} from './messaging-state.mjs';
import {renderPathwayResult} from './pathway-result-view.mjs';
const $=id=>document.getElementById(id),config=JSON.parse($('messaging-config').textContent);
if(!['simulation','real'].includes(config.mode)||!['fictitious','real-trial'].includes(config.dialogue))throw Error('Mode de dialogue explicite requis');
const realTrial=config.dialogue==='real-trial',realPathway=config.mode==='real',realValidation=Boolean(config.validationSeries),unlimitedTrial=config.unlimited===true;
if(realPathway&&!realTrial)throw Error('Dialogue réel requis pour cet essai de parcours');
let references=config.references,profile={},modality='',other='',busy=false,controller=null,epoch=0,current=null,history=[],active='discussion',draftRevision=0,proposal=null,pathwayQuota=null,validationCases=null,validationCaseId=null;
let deviceMemory=null;
let catalogueStatus=null;
const scrolls={discussion:0,courses:0};
const labels={personnelCategory:'Groupe de personnel',entity:'Entité ou service',managerStatus:'Situation managériale',role:'Métier ou fonction',objective:'Objectif',existingSkills:'Compétences actuelles',timeAvailable:'Temps disponible',constraints:'Autres contraintes',modality:'Modalité souhaitée'};
document.title='A658-YG — Assistant formation';$('open-profile').lastChild.textContent='Ma demande';$('profile-title').textContent='Ma demande';$('view-caption').textContent='Votre échange avec l’assistant';
const navigation=initMessagingNavigation(document);
const presentation=initAssistantPresentation(document);
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function action(label,fn,parent,primary=false){const b=node('button',label,primary?'primary':'');b.type='button';b.addEventListener('click',fn);parent.append(b);return b;}
function say(text,user=false){const row=node('section',undefined,'message'+(user?' user':'')),body=node('div',undefined,'message-body');row.setAttribute('role','group');row.setAttribute('aria-label',user?'Votre message':'Message de l’assistant');const bubble=node('div',text,'bubble');body.append(bubble);if(!user)row.append(createAssistantAvatar(document,'answer'));row.append(body);$('thread').append(row);return row;}
function focusStart(el){requestAnimationFrame(()=>{if(active!=='discussion'||!el.isConnected)return;const box=$('conversation');box.scrollTop=Math.max(0,box.scrollTop+el.getBoundingClientRect().top-box.getBoundingClientRect().top-20);});}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function setBusy(value,activity=''){busy=value;presentation.activity(value?activity:'');$('send-message').disabled=value;$('message').disabled=value;document.querySelectorAll('[data-confirm],[data-validation-case],#profile-form button[type=submit],#research-tabs button').forEach(b=>b.disabled=value||(b.dataset.validationCase&&validationCases?.find(c=>c.id===b.dataset.validationCase)?.attempted));if(!value)deviceMemory?.flush();}
function invalidate(){epoch++;controller?.abort();controller=null;setBusy(false);}
function display(name,value){const f=references.pathway.fields[name];return f?.options?.find(x=>x.value===value)?.label||value||'Non renseigné';}
function validateField(name,value){if(name==='modality'){if(!['Présentiel','En ligne','Indifférent'].includes(value))throw Error('Choisissez une modalité proposée.');return;}
 const key=name==='other'?'constraints':name,f=references.pathway.fields[key];if(value.length>f.maxLength)throw Error('Réponse trop longue.');if(f.requiredInForm&&!value)throw Error('Merci de renseigner '+labels[key].toLowerCase()+'.');if(value&&f.formControl==='select'&&!f.options.some(x=>x.value===value))throw Error('Choisissez une valeur du référentiel.');
}
function choices(name){const f=references.pathway.fields[name];if(f?.options)return f.options.map(x=>[x.label,x.value]);if(name==='existingSkills')return [['Je débute','Je débute'],['Quelques bases','Quelques bases'],['Expérience confirmée','Expérience confirmée']];if(name==='timeAvailable')return ['Moins d’une journée','1 à 2 jours','3 à 5 jours','À définir'].map(x=>[x,x]);if(name==='modality')return ['Présentiel','En ligne','Indifférent'].map(x=>[x,x]);return [];}
function clearChoices(){document.querySelectorAll('.question-actions').forEach(e=>e.remove());}
function profileList(p,parent){const dl=node('dl',undefined,'need-grid');for(const key of fields){const group=node('div');group.append(node('dt',labels[key]),node('dd',display(key,p[key])));dl.append(group);}parent.append(dl);}
async function ticket(){const response=await fetch('/private/profile-references',{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:controller?.signal});if(!response.ok)throw Error('Choix indisponibles ('+response.status+'). Actualisez la page avant de confirmer.');const t=await response.json();if(!t.references?.pathway?.fields||typeof t.references.revision!=='string'||typeof t.requestId!=='string')throw Error('Référentiel invalide');return t;}
async function simulatePathway(){if(busy)return;if(history.length>=20){status('Fermez une recherche avant d’en créer une nouvelle (20 maximum).',true);return;}if(pathwayBlocked()){status(pathwayNotice(),true);return;}let submitted;try{submitted=validateMessagingProfile(profile,references);}catch(e){status(e.message,true);openProfile();return;}
 invalidate();const attempt=epoch,referenceRevision=references.revision;controller=new AbortController();const abort=controller;setBusy(true,'Recherche en cours…');status(realPathway?'Génération en cours : une tentative payante. Ne confirmez pas de nouveau.':'Simulation en cours. Aucune relance automatique.');const timer=setTimeout(()=>abort.abort(),config.pathwayTimeoutMs??config.timeoutMs);
 try{const t=await ticket();if(attempt!==epoch)return;if(t.references.revision!==referenceRevision)throw Error('Les choix du catalogue ont changé. Actualisez la page et confirmez de nouveau.');
  if(realPathway)updatePathwayQuota(null);
  const response=await fetch('/private/pathway',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({profile:submitted,confirmed:true,referenceRevision,requestId:t.requestId})});
  if(attempt!==epoch)return;const value=await response.json();if(attempt!==epoch)return;if(realPathway)updatePathwayQuota(value.quota);if(!response.ok)throw Error((realPathway?'Génération':'Simulation')+' non aboutie ('+response.status+'). Réponses conservées ; aucune relance automatique.');
  showResumeNotice(value);showValidationCases(value);
  if(value.mode!==config.mode||!(realPathway?value.result:value.preview)||!value.quota)throw Error('Mode ou résultat du parcours inattendu.');
  current=value.savedPathway?readSavedPathway(value.savedPathway):createMessagingSnapshot(submitted,realPathway?value.result:value.preview,referenceRevision,history.length+1,modality,config.mode);history=value.savedPathways?value.savedPathways.map(readSavedPathway):[...history.filter(p=>p.number!==current.number),current];clearChoices();const generated=current;const el=say('');el.classList.add('result-message');el.querySelector('.bubble').append(renderSnapshot(current));const row=node('div',undefined,'action-row');action('Voir la synthèse de ma recherche',()=>{selectResearch(generated.number);switchView('courses',true);},row);action('Modifier ma demande',openProfile,row);el.querySelector('.bubble').append(row);sync();focusStart(el);status(value.quota.unlimited?'Parcours réel reçu. Recherches effectuées : '+value.quota.total+'.':(realPathway?'Parcours réel reçu. Tentatives : ':'Simulation terminée, sans appel au moteur. Tentatives : ')+value.quota.total+'/'+value.quota.maxTotalRequests+'.');if(realValidation&&value.caseReportSaved===false)status('Parcours reçu, mais son archive privée n’a pas pu être enregistrée. Gardez cet onglet ouvert ; aucune relance autorisée.',true);
 }catch(e){if(attempt===epoch)status(e.name==='AbortError'?(realPathway?'Génération':'Simulation')+' interrompue ou délai dépassé. Réponses et ancien parcours conservés ; aucune relance automatique.':e.message,true);}
 finally{clearTimeout(timer);if(attempt===epoch){controller=null;setBusy(false);}}
}
function readSavedPathway(value){
 if(!value||!['real','simulation'].includes(value.mode)||!Number.isSafeInteger(value.number)||value.number<1||typeof value.referenceRevision!=='string')throw Error('Parcours sauvegardé invalide');
 return createMessagingSnapshot(value.profile,value.result,value.referenceRevision,value.number,value.modality,value.mode);
}
function restorePathway(value,values){
 const previous=current;
 if(Array.isArray(values))history=values.map(readSavedPathway);
 else if(value&&!history.some(p=>p.number===value.number))history.push(readSavedPathway(value));
 current=value?history.find(p=>p.number===value.number)??readSavedPathway(value):null;
 sync();if(!current||JSON.stringify(previous)===JSON.stringify(current))return;
 const snapshot=current;
 const el=say('Derniers résultats retrouvés. Ils reprennent la recherche enregistrée, sans nouvelle génération.');el.classList.add('result-message');el.querySelector('.bubble').append(renderSnapshot(snapshot));
 action('Voir la synthèse de ma recherche',()=>{selectResearch(snapshot.number);switchView('courses',true);},el.querySelector('.bubble'));sync();focusStart(el);
}
async function researchAction(actionName,number){
 if(busy)return;
 try{const value=await dialogueRequest({action:actionName,number});
  history=value.savedPathways.map(readSavedPathway);current=value.savedPathway?history.find(p=>p.number===value.savedPathway.number):null;
  sync();$('courses-view').scrollTop=0;scrolls.courses=0;updateResearchTabs(current?.number);
  if(value.resumeSaved===false){const warning=node('p','Modification conservée dans cette page uniquement : la sauvegarde privée est indisponible. Gardez cet onglet ouvert.','source-note');warning.setAttribute('role','alert');$('courses-content').prepend(warning);}
  if(!current)requestAnimationFrame(()=>$('tab-courses').focus());
  status(actionName==='close-research'?'Recherche fermée. Les autres recherches et les compteurs restent inchangés.':'Recherche enregistrée affichée, sans appel IA.');return true;
 }catch(error){status(error.message,true);return false;}
}
const selectResearch=async number=>{if(await researchAction('select-research',number))switchView('courses',true);};
const closeResearch=number=>researchAction('close-research',number);
function showResumeNotice(value){
 if(config.deviceMemoryEnabled&&value.deviceMemory){
  if(!deviceMemory)deviceMemory=initDeviceMemory({document,meta:value.deviceMemory,getRevision:()=>draftRevision,isBusy:()=>busy,onBusy:value=>setBusy(value,value?'Reprise de votre demande…':''),request:async body=>{const response=await fetch('/private/dialogue',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json',Accept:'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error('Copie indisponible');return value},onRestore:value=>{showResumeNotice(value);proposal=null;$('message').value='';$('thread').replaceChildren();applyDraft(value.draft);restorePathway(value.savedPathway,value.savedPathways);switchView('discussion',true);say('Votre demande mémorisée a été reprise. Vérifiez ses critères avant toute nouvelle recherche.');offerNext();status('Copie reprise sans appel IA ; quotas inchangés.');}})
  deviceMemory.observe(value)
 }
 if(!value.resumeEnabled)return;
 let meter=$('resume-status');if(!meter){meter=node('p','','source-note');meter.id='resume-status';meter.setAttribute('role','status');$('pilot-details-content').append(meter);}
 let warning=$('resume-warning');
 if(value.resumeSaved===false){if(!warning){warning=node('p','Sauvegarde privée indisponible : gardez cet onglet ouvert. Aucune recherche ne sera relancée automatiquement.','need-summary');warning.id='resume-warning';warning.setAttribute('role','alert');$('workspace').prepend(warning)}}else warning?.remove();
 meter.textContent=value.resumeSaved===false?'Sauvegarde privée indisponible : gardez cet onglet ouvert. Aucune nouvelle génération ne sera lancée automatiquement.':'Reprise privée active : critères de la demande et recherches ouvertes conservés sur le serveur.';
}
function stateNotice(snapshot,summary=false){const stale=snapshotIsStale(snapshot,profile,references.revision),old=snapshot.number!==current?.number;const box=node('div',undefined,'plan-status'+(stale?' stale':''));const text=node('div'),title=node(summary?'h1':'strong',researchLabel(snapshot));if(summary){title.style.fontSize='22px';title.style.lineHeight='1.35';title.style.margin='0 0 8px';}text.append(title,node('span',(old?'Proposition précédente. ':'')+(stale?'La demande a changé ; ces résultats restent ceux de la recherche enregistrée.':'Les résultats correspondent aux repères confirmés pour cette recherche.')));text.append(node('p',catalogueVersionLabel(snapshot.result.catalogue,{results:true,simulation:snapshot.mode!=='real'}),'catalogue-freshness'));box.append(text);return box;}
function renderSnapshot(snapshot){const root=node('div');const marker=node('div');marker.dataset.snapshotNotice=snapshot.number;marker.append(stateNotice(snapshot));root.append(marker);const view=renderPathwayResult(document,snapshot.result,{replay:snapshot.mode!=='real',preferredModality:snapshot.modality,objective:snapshot.profile.objective});if(realTrial&&snapshot.mode!=='real')view.querySelector('h2 + p').textContent='Exemple fixe pour tester l’affichage, sans recherche de cours. Le dialogue IA est distinct et peut consommer des appels OpenAI.';
 const total=(snapshot.result.recommendedSteps??snapshot.result.steps??[]).length+(snapshot.result.optionalSteps??[]).length+(snapshot.result.informationalCourses??[]).length;view.querySelector('h2').after(node('p',total?total+' cours présenté'+(total>1?'s':''):'Aucun cours adapté trouvé','result-count'));
 // Le rendu existant conserve positions, catégories, gaps, durées et liens validés.
 const items=[...(snapshot.result.recommendedSteps??snapshot.result.steps??[]),...(snapshot.result.optionalSteps??[]),...(snapshot.result.informationalCourses??[])];
 [...view.querySelectorAll('.pathway-course')].forEach((card,i)=>{const item=items[i];action('En discuter avec l’assistant',()=>discuss(snapshot,item),card.querySelector('.course-actions')||card).className='course-discuss';});root.append(view);return root;}
function discuss(snapshot,item){switchView('discussion');say('Parlons de '+item.course.code+' — '+item.course.title+' (recherche « '+researchLabel(snapshot)+' »).',true);const reply=say(item.rationale+'\n\nCette explication reprend uniquement la justification reçue et ne déclenche aucun nouvel appel IA.');if((snapshot.result.informationalCourses??[]).includes(item))reply.querySelector('.bubble').append(node('p','Cette formation reste pour information : vérifiez ses conditions d’accès.'));focusStart(reply);}
function updateResearchTabs(focusNumber){
 const bar=renderResearchTabs(document,{history,current,busy,view:active,select:selectResearch,close:closeResearch});
 bar.hidden=!history.length;
 const list=$('research-list');list.replaceChildren();if(history.length)list.append(node('p','Mes recherches','research-list-heading'));list.append(bar);
 if(focusNumber!==undefined)requestAnimationFrame(()=>{if($('sidebar').inert)(active==='courses'?$('courses-view'):$('conversation')).focus({preventScroll:true});else document.querySelector('[data-research-number="'+focusNumber+'"]')?.focus({preventScroll:true});});
}
function sync(){updateResearchTabs();const panel=$('courses-content'),y=$('courses-view').scrollTop;const previousCriteria=panel.querySelector('details.research-criteria'),criteriaOpen=Boolean(previousCriteria?.open&&previousCriteria.dataset.criteriaResearchNumber===String(current?.number));panel.replaceChildren();if(config.catalogueStatusEnabled)panel.append(node('p',catalogueVersionLabel(catalogueStatus),'catalogue-freshness'));if(!current){const empty=node('div',undefined,'view-empty');empty.append(node('h2','Vos cours apparaîtront ici'),node('p',realPathway?'Complétez et vérifiez les repères de la demande, puis confirmez explicitement la génération payante du parcours.':'Complétez les repères de la demande dans la discussion, puis confirmez la simulation. Le résultat reste un exemple fixe, sans analyse de votre besoin.'));action('Revenir à la discussion',()=>switchView('discussion'),empty,true);panel.append(empty);}
 else{const result=renderSnapshot(current),marker=result.firstElementChild;marker.dataset.researchSummary='true';marker.replaceChildren(stateNotice(current,true));const need=createResearchCriteria(document,current,profileList,criteriaOpen);const caution=node('p',AI_GUIDANCE,'ai-caution');caution.style.cssText='font-size:13px;line-height:1.65;color:#50685a;border-left:3px solid #c8d9be;padding:10px 14px;margin:0 0 22px';panel.append(marker,need,result);appendPdfExport(document,panel,current,references);if(config.emailEnabled)appendResearchEmail(document,panel.querySelector('.pdf-export'),current);panel.append(caution);}
 $('courses-view').scrollTop=y;
 document.querySelectorAll('[data-snapshot-notice]').forEach(e=>{const snapshot=history.find(x=>x.number===Number(e.dataset.snapshotNotice));if(snapshot)e.replaceChildren(stateNotice(snapshot,e.dataset.researchSummary==='true'));});
}
function switchView(view,start=false){const old=active==='discussion'?$('conversation'):$('courses-view');scrolls[active]=old.scrollTop;active=view;updateResearchTabs();$('conversation').hidden=view!=='discussion';$('courses-view').hidden=view!=='courses';$('composer-zone').hidden=view!=='discussion';for(const b of document.querySelectorAll('[data-view]')){b.setAttribute('aria-selected',String(b.dataset.view===view));b.tabIndex=b.dataset.view===view?0:-1;}$('view-caption').textContent=view==='discussion'?'Votre échange avec l’assistant':'Vos cours et les repères de votre demande';requestAnimationFrame(()=>{const panel=view==='discussion'?$('conversation'):$('courses-view');panel.scrollTop=start?0:scrolls[view];});}
function requiredProfileFields(){return [...new Set(['objective','role','personnelCategory','existingSkills','timeAvailable','modality',...fields.filter(key=>references.pathway.fields[key].requiredInForm)])];}
function profileIssues(){
 const required=requiredProfileFields(),issues=[];
 for(const name of [...required,...fields.filter(key=>!required.includes(key))]){
  const value=String((name==='modality'?modality:profile[name])??'').trim();
  if(!value&&required.includes(name)){issues.push({name,missing:true,message:'À compléter pour obtenir des propositions.'});continue;}
  if(value)try{validateField(name,value);}catch(error){issues.push({name,message:error.message});}
 }
 return issues;
}
function showIncompleteProfile(saved=false){
 const issues=profileIssues(),first=issues[0]?.name;
 let message=issues.length===1&&first==='objective'&&issues[0].missing?'Complétez votre objectif pour obtenir des propositions.':issues.length?'Complétez ou vérifiez les critères suivants pour obtenir des propositions : '+issues.map(issue=>labels[issue.name]).join(', ')+'.':'Vérifiez les critères de votre demande pour obtenir des propositions.';
 if(saved)message='Demande enregistrée. '+message;
 clearChoices();const el=say(message),row=node('div',undefined,'action-row question-actions');
 action('Compléter ma demande',()=>openProfile(first),row,true);el.querySelector('.bubble').append(row);status(message);focusStart(el);
}
function openProfile(focusField){const form=$('profile-form');form.replaceChildren();const content=node('div',undefined,'profile-fields-grid');form.append(content);const issues=profileIssues(),required=requiredProfileFields();if(issues.length)content.append(node('p','Vous pouvez enregistrer une demande incomplète. Les critères signalés sont nécessaires pour obtenir des propositions.','profile-completion-note'));for(const name of ['personnelCategory','managerStatus','entity','role','objective','existingSkills','timeAvailable','modality','other']){const key=name==='other'?'constraints':name,f=references.pathway.fields[key],group=node('div',undefined,'field'+(['entity','role','objective','existingSkills','other'].includes(name)?' field-wide':'')),label=node('label',name==='modality'?'Modalité souhaitée':labels[key]);label.htmlFor='edit-'+name;let input;
 if(f?.formControl==='select'||name==='modality'){input=node('select');input.append(new Option('Non renseigné',''));for(const [text,value]of choices(name))input.append(new Option(text,value));}
 else{input=node(f.formControl==='textarea'?'textarea':'input');input.maxLength=f.maxLength;if(name==='entity'){const list=node('datalist');list.id='entity-options';for(const x of f.suggestions){const o=node('option');o.value=x.value;o.label=x.label;list.append(o);}content.append(list);input.setAttribute('list',list.id);}}
 input.id='edit-'+name;input.name=name;input.value=name==='modality'?modality:name==='other'?other:profile[name]||'';input.required=false;
 const hint=node('p','', 'field-completion-hint');hint.id=input.id+'-hint';group.dataset.profileField=name;
 const markIssue=issue=>{hint.textContent=issue?.message||'';hint.hidden=!issue;group.classList.toggle('field-incomplete',Boolean(issue));if(issue){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',hint.id);}else{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');}};
 markIssue(issues.find(issue=>issue.name===(name==='other'?'constraints':name)));
 const refresh=()=>{const value=input.value.trim();let issue;if(!value&&required.includes(name==='other'?'constraints':name))issue={message:'À compléter pour obtenir des propositions.'};else if(value)try{validateField(name==='other'?'constraints':name,value);}catch(error){issue={message:error.message};}markIssue(issue);};
 input.addEventListener('input',refresh);input.addEventListener('change',refresh);group.append(label,input,hint);content.append(group);}
 const error=node('p','', 'status-line error');error.id='profile-error';error.setAttribute('role','alert');const footer=node('div',undefined,'profile-actions');footer.append(error);const submit=node('button','Enregistrer ma demande','primary');submit.type='submit';submit.disabled=busy;deviceMemory?.mount(content);footer.append(submit);form.append(footer);$('profile-dialog').showModal();if(typeof focusField==='string')requestAnimationFrame(()=>{const input=$('edit-'+focusField);if(input){input.focus({preventScroll:true});input.scrollIntoView({block:'center'});}});}

function applyDraft(draft){
 if(!draft||!Number.isSafeInteger(draft.revision)||draft.referenceRevision!==references.revision||!draft.profile||typeof draft.modality!=='string')throw Error('Brouillon de dialogue invalide');
 draftRevision=draft.revision;other=draft.profile.constraints||'';modality=draft.modality;profile={...draft.profile,constraints:composeConstraints(modality,other)};sync();
}
function nextField(){const basic=['objective','role','personnelCategory','existingSkills','timeAvailable','modality'];return [...basic,...fields.filter(k=>!basic.includes(k)&&references.pathway.fields[k].requiredInForm)].find(k=>!(k==='modality'?modality:profile[k])?.trim());}
function ready(){try{return !nextField()&&Boolean(validateMessagingProfile(profile,references));}catch{return false;}}
function save(){}
function showValidationCases(value){
 if(!realValidation)return;
 if(!Array.isArray(value.validationCases))return;
 validationCases=value.validationCases;validationCaseId=value.validationCaseId??null;
 let panel=$('validation-cases');if(!panel){panel=node('section',undefined,'need-summary');panel.id='validation-cases';$('thread').prepend(panel);}
 panel.replaceChildren(node('strong','Trois scénarios fictifs — chargement sans appel IA'));
 for(const c of validationCases??[]){const b=action(c.id+' · '+c.label+(c.attempted?' · déjà tenté':''),async()=>{
  if(busy)return;
  try{const data=await dialogueRequest({action:'load-case',caseId:c.id,expectedRevision:draftRevision});proposal=null;applyDraft(data.draft);switchView('discussion');status('Demande fictive chargée. Vérifiez-le avant la génération payante.');confirmProfile();}catch(error){status(error.message,true);}
 },panel);b.dataset.validationCase=c.id;b.disabled=busy||c.attempted;}
}
function pathwayBlocked(){return realPathway&&(!pathwayQuota||!pathwayQuota.enabled||pathwayQuota.stopped||pathwayQuota.busy||(!pathwayQuota.unlimited&&(pathwayQuota.total>=pathwayQuota.maxTotalRequests||pathwayQuota.daily>=pathwayQuota.maxDailyRequests))||(realValidation&&(!validationCases||!validationCaseId||validationCases.find(c=>c.id===validationCaseId)?.attempted)));}
function pathwayNotice(){
 if(pathwayQuota&&!pathwayQuota.unlimited&&pathwayQuota.total>=pathwayQuota.maxTotalRequests)return 'Essai de parcours terminé : '+pathwayQuota.total+'/'+pathwayQuota.maxTotalRequests+' utilisé. Aucune nouvelle génération autorisée.';
 if(realValidation&&validationCases?.length===3&&validationCases.every(c=>c.attempted))return 'Les trois scénarios ont déjà été tentés. Aucune nouvelle génération autorisée.';
 if(realValidation&&!validationCaseId)return 'Choisissez un scénario fictif pour préparer sa confirmation.';
 if(realValidation&&validationCases?.find(c=>c.id===validationCaseId)?.attempted)return 'Scénario '+validationCaseId+' déjà tenté. Aucune relance autorisée ; choisissez un autre scénario disponible.';
 if(!pathwayQuota)return 'État de l’essai de parcours indisponible. Actualisez les choix avant toute confirmation.';
 if(!pathwayQuota.unlimited&&pathwayQuota.total>=pathwayQuota.maxTotalRequests)return 'Essai de parcours terminé : '+pathwayQuota.total+'/'+pathwayQuota.maxTotalRequests+' utilisé. Aucune nouvelle génération autorisée.';
 if(!pathwayQuota.unlimited&&pathwayQuota.daily>=pathwayQuota.maxDailyRequests)return 'Limite quotidienne de parcours atteinte. Aucune nouvelle génération disponible.';
 return 'Essai de parcours indisponible. Aucune nouvelle génération autorisée.';
}
function updatePathwayQuota(quota){
 if(!realPathway)return;
 const valid=quota&&['total','daily'].every(k=>Number.isSafeInteger(quota[k])&&quota[k]>=0)&&((unlimitedTrial&&quota.unlimited===true&&quota.maxTotalRequests===null&&quota.maxDailyRequests===null)||(['maxTotalRequests','maxDailyRequests'].every(k=>Number.isSafeInteger(quota[k])&&quota[k]>0)&&quota.unlimited!==true))&&typeof quota.stopped==='boolean'&&typeof quota.enabled==='boolean';
 pathwayQuota=valid?{...quota}:null;
 const meter=$('pathway-quota');if(meter)meter.textContent=pathwayBlocked()?pathwayNotice():quota.unlimited?'Parcours réel : '+quota.total+' recherches effectuées · sans plafond d’essais.':'Parcours réel : '+quota.total+'/'+quota.maxTotalRequests+' tentative utilisée. Génération payante après confirmation.';
 if(pathwayBlocked())document.querySelectorAll('[data-confirm]').forEach(button=>button.closest('.question-actions')?.remove());
}
function updateDialogueBudget(value){if(realTrial&&value.budget){$('dialogue-budget').textContent=value.budget.unlimited?'Dialogue IA : '+value.budget.attempts+' tentatives · sans plafond d’essais.':'Dialogue IA : '+value.budget.attempts+'/10 tentatives · '+(value.budget.reservedMicroUsd/1000000).toFixed(2)+' USD réservés (plafond de réservations : 0,10 USD).';const records=value.usageRecords||[];if(records.length){const total=records.reduce((a,u)=>({input:a.input+u.inputTokens,output:a.output+u.outputTokens,cost:a.cost+u.calculatedUpperCostUsd}),{input:0,output:0,cost:0});$('dialogue-budget').append(node('span',' Usage vérifié de cet échange : '+total.input+' tokens entrants, '+total.output+' sortants ; majoration calculée '+total.cost.toFixed(6)+' USD (hors comptage, taxes et tentatives sans usage vérifiable).'));}}}
function failureMessage(value,statusCode){const code=typeof value.code==='string'&&/^[a-z_]{1,60}$/.test(value.code)?value.code:'unknown';const upstream=Number.isInteger(value.httpStatus)?' · API HTTP '+value.httpStatus+' · '+(value.stage==='count'?'comptage':'génération'):'';return 'Dialogue non abouti — '+code+' · HTTP '+statusCode+upstream+'. Demande conservée ; aucune relance automatique.';}
async function dialogueRequest(body){
 if(busy)throw Error('Une demande est déjà en cours.');
 invalidate();const attempt=epoch,abort=new AbortController();controller=abort;setBusy(true,body?.action==='turn'?'Réflexion en cours…':'');const timer=setTimeout(()=>abort.abort(),config.timeoutMs);
 try{
  const response=await fetch('/private/dialogue',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal,
   headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(attempt!==epoch)throw Error('Réponse remplacée.');
  const value=await response.json();showResumeNotice(value);showValidationCases(value);if(realPathway)updatePathwayQuota(value.pathwayQuota);if(!response.ok){if(realTrial&&value.mode==='real')updateDialogueBudget(value);const error=Error(failureMessage(value,response.status));error.budgetRefreshed=Boolean(realTrial&&value.mode==='real'&&value.budget);throw error;}
  if(value.mode!==(realTrial?'real':'simulation')||value.pathwayMode!==config.mode)throw Error('Mode de dialogue ou parcours inattendu.');updateDialogueBudget(value);return value;
 }finally{clearTimeout(timer);if(attempt===epoch){controller=null;setBusy(false);}}
}
function offerNext(){
 clearChoices();$('composer').hidden=realValidation;
 if(realTrial){if(ready()||pathwayBlocked())confirmProfile();else if(modality||Object.values(profile).some(value=>String(value??'').trim()))showIncompleteProfile();return;}
 const key=nextField();if(!key){if(ready()){confirmProfile();return;}const row=say('Certains repères doivent être corrigés dans Ma demande avant la simulation.');action('Corriger ma demande',openProfile,row.querySelector('.bubble'));focusStart(row);return;}
 const prompts={objective:'Qu’aimeriez-vous mieux faire ou apprendre ?',role:'Quel est votre métier ou votre fonction ?',personnelCategory:'À quel groupe de personnel appartenez-vous ?',existingSkills:'Quelle expérience avez-vous sur ce sujet ?',timeAvailable:'Combien de temps pouvez-vous consacrer à cette formation ?',modality:'Quelle modalité préférez-vous ?'};
 const el=say(prompts[key]||'Complétez ce repère : '+labels[key]),row=node('div',undefined,'action-row question-actions');
 let suggestions=choices(key);
 if(key==='objective')suggestions=[['Mieux organiser mon travail','Je voudrais mieux organiser mes tâches et mes priorités.'],['Progresser sur Word','Je voudrais progresser sur Word pour mes rapports.']];
 if(key==='role')suggestions=[['Assistant administratif','Je suis assistant administratif.']];
 for(const [label,value]of suggestions.slice(0,8))action(label,()=>send(value),row);
 action('Compléter dans Ma demande',openProfile,row);$('thread').append(row);focusStart(el);
}
function confirmProfile(){
 clearChoices();$('composer').hidden=realValidation;
 if(proposal){status('Acceptez ou refusez d’abord la proposition en attente.',true);return;}
 if(pathwayBlocked()){const el=say(pathwayNotice());if(ready())profileList(profile,el.querySelector('.bubble'));focusStart(el);return;}
 if(!ready()){showIncompleteProfile();return;}
 const el=say(realPathway?'Voici les repères de votre demande. Confirmer enverra ces informations au moteur A658-YG qui utilise OpenAI. '+(unlimitedTrial?'Chaque génération confirmée est payante. Aucune relance automatique.':realValidation?'Une seule tentative payante est autorisée pour ce scénario, dans la limite de trois scénarios.':'Une seule tentative payante de parcours est autorisée, sans relance automatique.')+'':'Voici les repères de votre demande. Souhaitez-vous simuler un parcours avec ces informations ?');profileList(profile,el.querySelector('.bubble'));
 const row=node('div',undefined,'action-row question-actions');const b=action(realPathway?'Confirmer ma demande et générer — essai payant':'Confirmer ma demande et simuler',simulate,row,true);b.dataset.confirm='true';action('Modifier ma demande',openProfile,row);$('thread').append(row);focusStart(el);
}
function simulate(){if(pathwayBlocked()){status(pathwayNotice(),true);return;}if(proposal||!ready()){status('Validez les corrections et complétez les repères avant de confirmer.',true);return;}return simulatePathway();}
async function decide(accept){
 if(busy||!proposal)return;const currentProposal=proposal;
 try{const value=await dialogueRequest({action:accept?'accept':'reject',proposalId:currentProposal.id,expectedRevision:draftRevision,confirmed:accept});
  proposal=null;clearChoices();applyDraft(value.draft);const pending=[...document.querySelectorAll('[data-proposal-id]')].find(el=>el.dataset.proposalId===currentProposal.id);
  if(pending){const text=accept?'Repère enregistré dans votre demande.':'Proposition écartée ; votre demande reste inchangée.';if(realTrial)pending.querySelector('.bubble').append(node('p',text));else pending.querySelector('.bubble').firstChild.textContent=text;}
  status(accept?'Demande mise à jour. Aucune recherche lancée.':'Proposition écartée. Demande inchangée.');offerNext();
 }catch(error){status(error.message,true);}
}
function showPending(reply='Une proposition précédente attend votre décision. La demande reste inchangée.'){
 clearChoices();const el=say(reply);el.dataset.proposalId=proposal.id;focusStart(el);
 const list=node('dl',undefined,'need-grid');for(const item of proposal.changes){const group=node('div');group.append(node('dt',labels[item.field]),node('dd',item.field==='modality'?item.value:display(item.field,item.value)));list.append(group);}el.querySelector('.bubble').append(list);
 const row=node('div',undefined,'action-row question-actions');action('Appliquer ces corrections',()=>decide(true),row,true);action('Garder ma demande actuelle',()=>decide(false),row);el.querySelector('.bubble').append(row);
 status('Proposition en attente : demande inchangée, aucune recherche lancée.');
}
async function send(text){
 if(realValidation){status('Utilisez les boutons de scénarios ; aucun tour de dialogue IA dans cette validation.');return;}
 text=text.trim();if(!text||busy)return;if(proposal){status('Acceptez ou refusez d’abord la proposition en attente.',true);return;}clearChoices();$('message').value='';say(text,true);proposal=null;
 try{const value=await dialogueRequest({action:'turn',requestId:crypto.randomUUID(),message:text,expectedRevision:draftRevision,referenceRevision:references.revision,...(realTrial?{paidTrialConfirmed:true}:{})});
  applyDraft(value.draft);proposal=value.proposal;
  if(proposal)showPending(value.reply);
  else{const el=say(value.reply);status(realTrial?'Réponse IA reçue. Aucun parcours réel lancé.':'Réponse d’un fournisseur fictif. Aucun appel OpenAI.');offerNext();focusStart(el);}
 }catch(error){if(realTrial&&!error.budgetRefreshed){try{await dialogueRequest();}catch{}}status(error.name==='AbortError'?'Dialogue interrompu. Demande et résultats conservés ; aucune relance automatique.':error.message,true);}
}
$('profile-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;const values=Object.fromEntries(new FormData(event.target)),next={};
 try{for(const k of fields)if(k!=='constraints'){if(values[k]?.trim())validateField(k,values[k]);next[k]=values[k]||'';}if(values.modality)validateField('modality',values.modality);const constraints=composeConstraints(values.modality,values.other);if(constraints)validateField('constraints',constraints);next.constraints=values.other;
  const value=await dialogueRequest({action:'edit',profile:next,modality:values.modality,expectedRevision:draftRevision});proposal=null;applyDraft(value.draft);$('profile-dialog').close();clearChoices();switchView('discussion');if(!ready()){showIncompleteProfile(true);return;}status('Demande enregistrée ; le parcours précédent reste conservé.');confirmProfile();
 }catch(error){$('profile-error').textContent=error.message;}
});
$('composer').addEventListener('submit',event=>{event.preventDefault();send($('message').value);});
$('message').maxLength=1500;$('message').placeholder='Décrivez votre besoin…';
$('open-profile').addEventListener('click',openProfile);$('close-profile').addEventListener('click',()=>$('profile-dialog').close());
$('restart').addEventListener('click',async()=>{
 if(busy)return;
 if((Object.values(profile).some(v=>String(v??'').trim())||modality||other||$('message').value.trim()||document.querySelector('#thread .message.user,#thread .result-message'))&&!await confirmNewRequest(document))return;
 if(busy)return;
 try{const value=await dialogueRequest({action:'new-request',confirmed:true,expectedRevision:draftRevision});proposal=null;$('message').value='';$('thread').replaceChildren();applyDraft(value.draft);switchView('discussion',true);say('Commençons une nouvelle demande. Vos recherches précédentes restent disponibles à gauche.');offerNext();status('Nouvelle demande commencée. Recherches conservées ; compteurs inchangés.');}catch(error){status(error.message,true);}
});
$('refresh-references').addEventListener('click',async()=>{
 if(busy)return;try{const value=await dialogueRequest();references=value.references;proposal=value.proposal;applyDraft(value.draft);clearChoices();status(value.lastError?failureMessage(value.lastError,value.lastError.status):'Brouillon accepté rechargé. Le résultat précédent reste conservé ; aucune recherche automatique.',Boolean(value.lastError));if(proposal)showPending();else offerNext();restorePathway(value.savedPathway,value.savedPathways);}catch(error){status(error.message,true);}
});
document.querySelectorAll('[data-view]').forEach(b=>{b.addEventListener('click',()=>switchView(b.dataset.view));b.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const v=event.key==='Home'?'discussion':event.key==='End'?'courses':active==='discussion'?'courses':'discussion';switchView(v);$('tab-'+v).focus();}});});
if(realTrial){$('send-message').setAttribute('aria-label','Envoyer un message — essai payant');$('send-message').title='Envoyer un message — essai payant';const meter=node('p','','source-note');meter.id='dialogue-budget';$('pilot-details-content').prepend(meter);}
if(realTrial)status(realValidation?'Validation de parcours : chargement gratuit ; génération payante après confirmation.':'Dialogue IA : chaque message envoyé peut être payant. Aucun appel OpenAI à l’ouverture.');
if(realPathway){const meter=node('p','','source-note');meter.id='pathway-quota';meter.setAttribute('role','status');$('pilot-details-content').prepend(meter);updatePathwayQuota(null);}
try{const value=await dialogueRequest();references=value.references;applyDraft(value.draft);say(realValidation?'Validation privée : chargez un des trois profils fictifs. Le chargement ne lance aucun appel IA. Chaque génération nécessite votre confirmation payante ; chaque scénario peut être tenté une fois.':realTrial?'Cet essai envoie les repères de votre demande et cet échange à OpenAI. Utilisez uniquement des données fictives. Chaque message envoyé peut consommer une tentative payante, sans relance automatique. '+(realPathway?'Le parcours réel nécessite une confirmation payante distincte.':'Les parcours restent des exemples simulés.')+' Qu’aimeriez-vous mieux faire ou apprendre ?':'Bonjour ! Ce mode de test utilise un fournisseur fictif. Chaque correction proposée attend votre acceptation ; aucun appel OpenAI.');proposal=value.proposal;if(proposal)showPending();else offerNext();restorePathway(value.savedPathway,value.savedPathways);deviceMemory?.offer($('thread'));}catch(error){status(error.message,true);}

if(config.catalogueStatusEnabled){
 fetch('/private/catalogue-status',{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)})
 .then(async response=>{if(!response.ok)throw Error();const value=await response.json();catalogueStatus=readCatalogueVersion(value.catalogue);sync()}).catch(()=>{catalogueStatus=null;sync()})
}

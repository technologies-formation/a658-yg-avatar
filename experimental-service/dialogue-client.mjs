import {renderDialogueReply} from './dialogue-reply.mjs';
import {requestPathwayTicket} from './pathway-ticket.mjs';
import {GUIDED_QUESTIONS,nextGuidedField,directGuidedAnswer} from './guided-questions.mjs';
import {readPrivateResponse} from './private-response.mjs';
import {readCatalogueVersion,catalogueVersionLabel} from './catalogue-version.mjs';
import {initDeviceMemory} from './device-memory-client.mjs';
import {appendResearchEmail} from './research-email-client.mjs';
import {AI_GUIDANCE,appendPdfExport} from './pathway-pdf.mjs';
import {createAssistantAvatar,initAssistantPresentation,createResearchCriteria} from './assistant-presentation.mjs';
import {initMessagingNavigation,confirmNewRequest} from './messaging-navigation.mjs';
import {renderResearchTabs} from './research-tabs.mjs';
// Client privé : dialogue fictif ou essai IA explicite ; uniquement des routes du serveur.
import {extendedFields as fields,composeConstraints,validateMessagingProfile,createMessagingSnapshot,snapshotIsStale,researchLabel} from './messaging-state.mjs';
import {renderPathwayResult} from './pathway-result-view.mjs';
const $=id=>document.getElementById(id),config=JSON.parse($('messaging-config').textContent);
if(!['simulation','real'].includes(config.mode)||!['fictitious','real-trial'].includes(config.dialogue))throw Error('Mode de dialogue explicite requis');
const guidedDraft=config.guidedDraft===true;let requestMode='';
const realTrial=config.dialogue==='real-trial',realPathway=config.mode==='real',realValidation=Boolean(config.validationSeries),unlimitedTrial=config.unlimited===true;
if(realPathway&&!realTrial)throw Error('Dialogue réel requis pour cet essai de parcours');
let references=config.references,profile={},modality='',other='',busy=false,controller=null,epoch=0,current=null,history=[],active='discussion',draftRevision=0,proposal=null,pathwayQuota=null,validationCases=null,validationCaseId=null;
let deviceMemory=null;
let resumeChoicePending=false;
let completedSearch=null;let followupResearch=null,followupCourse=null;
let currentGuidedField=null,clarifyObjective=false;const skippedGuidedFields=new Set();
let catalogueStatus=null;
const scrolls={discussion:0,courses:0};
const labels={personnelCategory:'Groupe de personnel',entity:'Entité ou service',managerStatus:'Situation managériale',role:'Métier ou fonction',objective:'Objectif',existingSkills:'Compétences actuelles',timeAvailable:'Temps disponible',constraints:'Autres contraintes',professionalEnvironment:'Environnement professionnel',trainingOffers:'Offres de formation à explorer',trainingOrganizers:'Entités de formation organisatrices',modality:'Modalité souhaitée'};
if(guidedDraft)Object.assign(labels,{existingSkills:'Compétences et expérience actuelles',constraints:'Autres contraintes ou préférences',managerStatus:'Responsabilité managériale',objective:'Objectif de formation'});
document.title='A658-YG — Assistant formation';$('open-profile').lastChild.textContent='Ma demande';$('profile-title').textContent='Ma demande';$('view-caption').textContent='Votre échange avec l’assistant';
const navigation=initMessagingNavigation(document);
const presentation=initAssistantPresentation(document);
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function action(label,fn,parent,primary=false){const b=node('button',label,primary?'primary':'');b.type='button';b.addEventListener('click',fn);parent.append(b);return b;}
function say(text,user=false){const row=node('section',undefined,'message'+(user?' user':'')),body=node('div',undefined,'message-body');row.setAttribute('role','group');row.setAttribute('aria-label',user?'Votre message':'Message de l’assistant');const bubble=node('div',text,'bubble');body.append(bubble);if(!user)row.append(createAssistantAvatar(document,'answer'));row.append(body);$('thread').append(row);return row;}
function replyCourses(){const selected=history.find(x=>x.number===followupResearch)??current;return history.filter(x=>x.number===selected?.number||x.profile.objective===selected?.profile.objective).flatMap(x=>['recommendedSteps','steps','optionalSteps','informationalCourses'].flatMap(k=>(x.result[k]??[]).map(i=>i.course)));}
function sayReply(text){const el=say('');renderDialogueReply(document,el.querySelector('.bubble'),text,replyCourses());return el;}
function focusStart(el){requestAnimationFrame(()=>{if(active!=='discussion'||!el.isConnected)return;const box=$('conversation');box.scrollTop=Math.max(0,box.scrollTop+el.getBoundingClientRect().top-box.getBoundingClientRect().top-20);});}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function setBusy(value,activity=''){busy=value;if(guidedDraft)$('open-profile').disabled=value;presentation.activity(value?activity:'');$('send-message').disabled=value;$('message').disabled=value;document.querySelectorAll('[data-confirm],[data-validation-case],#profile-form button[type=submit],#research-tabs button').forEach(b=>b.disabled=value||(b.dataset.validationCase&&validationCases?.find(c=>c.id===b.dataset.validationCase)?.attempted));if(!value)deviceMemory?.flush();}
function invalidate(){epoch++;controller?.abort();controller=null;setBusy(false);}
function display(name,value){const f=references.pathway.fields[name];return f?.options?.find(x=>x.value===value)?.label||value||'Non renseigné';}
function validateField(name,value){if(name==='modality'){if(!['Présentiel','En ligne','Indifférent'].includes(value))throw Error('Choisissez une modalité proposée.');return;}
 const key=name==='other'?'constraints':name,f=references.pathway.fields[key];if(!f)throw Error('Les critères du catalogue sont à actualiser.');if(value.length>f.maxLength)throw Error('Réponse trop longue.');if(f.requiredInForm&&!value)throw Error('Merci de renseigner '+labels[key].toLowerCase()+'.');if(value&&['trainingOffers','trainingOrganizers'].includes(key)&&value.split('\n').some(x=>!f.options.some(o=>o.value===x)))throw Error('Un choix du catalogue a été retiré. Vérifiez votre sélection.');if(value&&f.formControl==='select'&&!f.options.some(x=>x.value===value))throw Error('Choisissez une valeur du référentiel.');
}
function choices(name){const f=references.pathway.fields[name];if(f?.options)return f.options.map(x=>[x.label,x.value]);if(name==='existingSkills')return [['Je débute','Je débute'],['Quelques bases','Quelques bases'],['Expérience confirmée','Expérience confirmée']];if(name==='timeAvailable')return ['Moins d’une journée','1 à 2 jours','3 à 5 jours','À définir'].map(x=>[x,x]);if(name==='modality')return [['Présentiel','Présentiel'],['En ligne','En ligne'],['Sans préférence','Indifférent']];return [];}
function clearChoices(){document.querySelectorAll('.question-actions').forEach(e=>e.remove());}
function profileList(p,parent){const dl=node('dl',undefined,'need-grid');for(const key of fields){if(guidedDraft&&key==='entity')continue;if(!references.pathway.fields[key]&&!p[key])continue;const group=node('div');group.append(node('dt',labels[key]),node('dd',['trainingOffers','trainingOrganizers'].includes(key)&&p[key]?p[key].split('\n').map(value=>display(key,value)).join(' ; '):display(key,p[key])));dl.append(group);}parent.append(dl);}
async function ticket(){return requestPathwayTicket({signal:controller?.signal,onRecovery:()=>status('Vérification de la connexion sécurisée… Vos critères sont conservés. Aucune génération lancée.')});}
async function simulatePathway(){if(busy)return;if(history.length>=20){status('Fermez une recherche avant d’en créer une nouvelle (20 maximum).',true);return;}if(pathwayBlocked()){status(pathwayNotice(),true);return;}let submitted;try{submitted=validateMessagingProfile(profile,references);}catch(e){status(e.message,true);openProfile();return;}
 invalidate();const attempt=epoch,referenceRevision=references.revision;controller=new AbortController();const abort=controller;setBusy(true,'Recherche en cours…');status(realPathway?'Génération en cours : une tentative payante. Ne confirmez pas de nouveau.':'Simulation en cours. Aucune relance automatique.');const timer=setTimeout(()=>abort.abort(),config.pathwayTimeoutMs??config.timeoutMs);
 try{const t=await ticket();if(attempt!==epoch)return;if(t.references.revision!==referenceRevision)throw Error('Les choix du catalogue ont changé. Actualisez la page et confirmez de nouveau.');
  if(realPathway)updatePathwayQuota(null);
  const response=await fetch('/private/pathway',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({profile:submitted,confirmed:true,referenceRevision,requestId:t.requestId})});
  if(attempt!==epoch)return;const value=await readPrivateResponse(response);if(attempt!==epoch)return;if(realPathway)updatePathwayQuota(value.quota);if(!response.ok)throw Error((realPathway?'Génération':'Simulation')+' non aboutie ('+response.status+'). Réponses conservées ; aucune relance automatique.');
  showResumeNotice(value);showValidationCases(value);
  if(value.mode!==config.mode||!(realPathway?value.result:value.preview)||!value.quota)throw Error('Mode ou résultat du parcours inattendu.');
  current=value.savedPathway?readSavedPathway(value.savedPathway):createMessagingSnapshot(submitted,realPathway?value.result:value.preview,referenceRevision,history.length+1,modality,config.mode);history=value.savedPathways?value.savedPathways.map(readSavedPathway):[...history.filter(p=>p.number!==current.number),current];clearChoices();currentGuidedField=null;followupResearch=current.number;followupCourse=null;const generated=current;const el=say('');el.classList.add('result-message');el.querySelector('.bubble').append(renderSnapshot(current));const row=node('div',undefined,'action-row');action('Voir la synthèse de ma recherche',()=>{selectResearch(generated.number);switchView('courses',true);},row);action('Modifier ma demande',openProfile,row);el.querySelector('.bubble').append(row);sync();focusStart(el);status(value.quota.unlimited?'Parcours réel reçu. Recherches effectuées : '+value.quota.total+'.':(realPathway?'Parcours réel reçu. Tentatives : ':'Simulation terminée, sans appel au moteur. Tentatives : ')+value.quota.total+'/'+value.quota.maxTotalRequests+'.');if(realValidation&&value.caseReportSaved===false)status('Parcours reçu, mais son archive privée n’a pas pu être enregistrée. Gardez cet onglet ouvert ; aucune relance autorisée.',true);
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
 if(guidedDraft&&requestMode==='search'){completedSearch=current?.result.searchQuery?current.number:null;updateSearchComposer();}
 if(current&&!currentGuidedField)followupResearch=current.number;
 sync();if(!current||JSON.stringify(previous)===JSON.stringify(current))return;
 const snapshot=current;
 const el=say('Derniers résultats retrouvés. Ils reprennent la recherche enregistrée, sans nouvelle génération.');el.classList.add('result-message');el.querySelector('.bubble').append(renderSnapshot(snapshot));
 action('Voir la synthèse de ma recherche',()=>{selectResearch(snapshot.number);switchView('courses',true);},el.querySelector('.bubble'));sync();focusStart(el);
}
async function researchAction(actionName,number){
 if(busy)return;
 try{const value=await dialogueRequest({action:actionName,number});
  history=value.savedPathways.map(readSavedPathway);current=value.savedPathway?history.find(p=>p.number===value.savedPathway.number):null;
  followupResearch=current?.number??null;followupCourse=null;currentGuidedField=null;sync();$('courses-view').scrollTop=0;scrolls.courses=0;updateResearchTabs(current?.number);
  if(value.resumeSaved===false){const warning=node('p','Modification conservée dans cette page uniquement : la sauvegarde privée est indisponible. Gardez cet onglet ouvert.','source-note');warning.setAttribute('role','alert');$('courses-content').prepend(warning);}
  if(!current)requestAnimationFrame(()=>$('tab-courses').focus());
  status(actionName==='close-research'?'Recherche fermée. Les autres recherches et les compteurs restent inchangés.':'Recherche enregistrée affichée, sans appel IA.');return true;
 }catch(error){status(error.message,true);return false;}
}
const selectResearch=async number=>{if(await researchAction('select-research',number))switchView('courses',true);};
const closeResearch=number=>researchAction('close-research',number);
function showResumeNotice(value){
 if(config.deviceMemoryEnabled&&value.deviceMemory){
  if(!deviceMemory)deviceMemory=initDeviceMemory({document,meta:value.deviceMemory,getRevision:()=>draftRevision,isBusy:()=>busy,onBusy:value=>setBusy(value,value?'Reprise de votre demande…':''),request:async body=>{const response=await fetch('/private/dialogue',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json',Accept:'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify(body)});const value=await readPrivateResponse(response);if(!response.ok)throw Error('Copie indisponible');return value},onRestore:value=>{resumeChoicePending=false;showResumeNotice(value);proposal=null;$('message').value='';$('thread').replaceChildren();applyDraft(value.draft);restorePathway(value.savedPathway,value.savedPathways);switchView('discussion',true);say('Votre demande mémorisée a été reprise. Vérifiez ses critères avant toute nouvelle recherche.');offerNext();status('Copie reprise sans appel IA ; quotas inchangés.');}})
  deviceMemory.observe(value)
 }
 if(!value.resumeEnabled)return;
 let meter=$('resume-status');if(!meter){meter=node('p','','source-note');meter.id='resume-status';meter.setAttribute('role','status');$('pilot-details-content').append(meter);}
 let warning=$('resume-warning');
 if(value.resumeSaved===false){if(!warning){warning=node('p','Sauvegarde privée indisponible : gardez cet onglet ouvert. Aucune recherche ne sera relancée automatiquement.','need-summary');warning.id='resume-warning';warning.setAttribute('role','alert');$('workspace').prepend(warning)}}else warning?.remove();
 meter.textContent=value.resumeSaved===false?'Sauvegarde privée indisponible : gardez cet onglet ouvert. Aucune nouvelle génération ne sera lancée automatiquement.':'Reprise privée active : critères de la demande et recherches ouvertes conservés sur le serveur.';
}
function stateNotice(snapshot,summary=false){const stale=snapshot.result.searchQuery?false:snapshotIsStale(snapshot,profile,references.revision),old=snapshot.number!==current?.number;const box=node('div',undefined,'plan-status'+(stale?' stale':''));const text=node('div'),title=node(summary?'h1':'strong',researchLabel(snapshot));if(summary){title.style.fontSize='22px';title.style.lineHeight='1.35';title.style.margin='0 0 8px';}text.append(title,node('span',(old?'Proposition précédente. ':'')+(stale?'La demande a changé ; ces résultats restent ceux de la recherche enregistrée.':'Les résultats correspondent aux repères confirmés pour cette recherche.')));text.append(node('p',catalogueVersionLabel(snapshot.result.catalogue,{results:true,simulation:snapshot.mode!=='real'}),'catalogue-freshness'));box.append(text);return box;}
function renderSnapshot(snapshot){const root=node('div');const marker=node('div');marker.dataset.snapshotNotice=snapshot.number;marker.append(stateNotice(snapshot));root.append(marker);const view=renderPathwayResult(document,snapshot.result,{replay:snapshot.mode!=='real',preferredModality:snapshot.modality,objective:snapshot.profile.objective,trainingOffers:snapshot.profile.trainingOffers,trainingOrganizers:snapshot.profile.trainingOrganizers});if(realTrial&&snapshot.mode!=='real')view.querySelector('h2 + p').textContent='Exemple fixe pour tester l’affichage, sans recherche de cours. Le dialogue IA est distinct et peut consommer des appels OpenAI.';

 const total=(snapshot.result.recommendedSteps??snapshot.result.steps??[]).length+(snapshot.result.optionalSteps??[]).length+(snapshot.result.informationalCourses??[]).length;view.querySelector('h2').after(node('p',total?total+' cours présenté'+(total>1?'s':''):'Aucun cours adapté trouvé','result-count'));
 // Le rendu existant conserve positions, catégories, gaps, durées et liens validés.
 const items=[...(snapshot.result.recommendedSteps??snapshot.result.steps??[]),...(snapshot.result.optionalSteps??[]),...(snapshot.result.informationalCourses??[])];
 [...view.querySelectorAll('.pathway-course')].forEach((card,i)=>{const item=items[i];action('En discuter avec l’assistant',()=>discuss(snapshot,item),card.querySelector('.course-actions')||card).className='course-discuss';});root.append(view);return root;}
function discuss(snapshot,item){followupResearch=snapshot.number;followupCourse=item.course.code;clearChoices();currentGuidedField=null;switchView('discussion');say('Parlons de '+item.course.code+' — '+item.course.title+' (recherche « '+researchLabel(snapshot)+' »).',true);const reply=say(item.rationale+'\n\nCette explication reprend uniquement la justification reçue et ne déclenche aucun nouvel appel IA.');if((snapshot.result.informationalCourses??[]).includes(item))reply.querySelector('.bubble').append(node('p','Cette formation reste pour information : vérifiez ses conditions d’accès.'));focusStart(reply);}
function updateResearchTabs(focusNumber){
 const bar=renderResearchTabs(document,{history,current,busy,view:active,select:selectResearch,close:closeResearch});
 bar.hidden=!history.length;
 const list=$('research-list');list.replaceChildren();if(history.length)list.append(node('p','Mes recherches','research-list-heading'));list.append(bar);
 if(focusNumber!==undefined)requestAnimationFrame(()=>{if($('sidebar').inert)(active==='courses'?$('courses-view'):$('conversation')).focus({preventScroll:true});else document.querySelector('[data-research-number="'+focusNumber+'"]')?.focus({preventScroll:true});});
}
function sync(){updateResearchTabs();const panel=$('courses-content'),y=$('courses-view').scrollTop;const previousCriteria=panel.querySelector('details.research-criteria'),criteriaOpen=Boolean(previousCriteria?.open&&previousCriteria.dataset.criteriaResearchNumber===String(current?.number));panel.replaceChildren();if(config.catalogueStatusEnabled)panel.append(node('p',catalogueVersionLabel(catalogueStatus),'catalogue-freshness'));if(!current){const empty=node('div',undefined,'view-empty');empty.append(node('h2','Vos cours apparaîtront ici'),node('p',realPathway?'Complétez et vérifiez les repères de la demande, puis confirmez explicitement la génération payante du parcours.':'Complétez les repères de la demande dans la discussion, puis confirmez la simulation. Le résultat reste un exemple fixe, sans analyse de votre besoin.'));action('Revenir à la discussion',()=>switchView('discussion'),empty,true);panel.append(empty);}
 else{const result=renderSnapshot(current),marker=result.firstElementChild;marker.dataset.researchSummary='true';marker.replaceChildren(stateNotice(current,true));const need=createResearchCriteria(document,current,current.result.searchQuery?(p,parent)=>{const dl=node('dl',undefined,'need-grid');dl.append(node('dt','Recherche'),node('dd',current.result.searchQuery));parent.append(dl);}:profileList,criteriaOpen);const caution=node('p',AI_GUIDANCE,'ai-caution');caution.style.cssText='font-size:13px;line-height:1.65;color:#50685a;border-left:3px solid #c8d9be;padding:10px 14px;margin:0 0 22px';panel.append(marker,need,result);appendPdfExport(document,panel,current,references);if(config.emailEnabled)appendResearchEmail(document,panel.querySelector('.pdf-export'),current);panel.append(caution);if(guidedDraft&&current.result.searchQuery)appendSearchChoices(panel,current.number);}
 $('courses-view').scrollTop=y;
 document.querySelectorAll('[data-snapshot-notice]').forEach(e=>{const snapshot=history.find(x=>x.number===Number(e.dataset.snapshotNotice));if(snapshot)e.replaceChildren(stateNotice(snapshot,e.dataset.researchSummary==='true'));});
}
function switchView(view,start=false){const old=active==='discussion'?$('conversation'):$('courses-view');scrolls[active]=old.scrollTop;active=view;updateResearchTabs();$('conversation').hidden=view!=='discussion';$('courses-view').hidden=view!=='courses';$('composer-zone').hidden=view!=='discussion';for(const b of document.querySelectorAll('[data-view]')){b.setAttribute('aria-selected',String(b.dataset.view===view));b.tabIndex=b.dataset.view===view?0:-1;}$('view-caption').textContent=view==='discussion'?'Votre échange avec l’assistant':'Vos cours et les repères de votre demande';requestAnimationFrame(()=>{const panel=view==='discussion'?$('conversation'):$('courses-view');panel.scrollTop=start?0:scrolls[view];});}
function requiredProfileFields(){return [...new Set(['objective','role','personnelCategory','existingSkills','timeAvailable','modality',...fields.filter(key=>references.pathway.fields[key]?.requiredInForm)])];}
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
function scopeOptions(name,value=''){
 const f=references.pathway.fields[name];
  const wrapper=node('fieldset');wrapper.className='scope-options';wrapper.dataset.scopeField=name;const legend=node('legend',labels[name]);wrapper.append(legend);const selected=value.split('\n');
  const unrestricted=node('p','Sans sélection : fonctionnement habituel à partir de votre profil.');wrapper.append(unrestricted);
  for(const opt of f.options){const row=node('label'),check=node('input');check.type='checkbox';check.name=name;check.value=opt.value;check.checked=selected.includes(opt.value);row.append(check,document.createTextNode(opt.label));wrapper.append(row);}
  for(const value of selected.filter(x=>x&&!f.options.some(o=>o.value===x))){const row=node('label'),check=node('input');check.type='checkbox';check.name=name;check.value=value;check.checked=true;row.append(check,document.createTextNode(value+' — choix retiré, à vérifier'));wrapper.append(row);}
  if(selected.some(x=>x&&!f.options.some(o=>o.value===x)))wrapper.append(node('p','Une sélection n’est plus disponible. Choisissez une autre valeur ou décochez explicitement ce choix avant d’enregistrer.','error'));
 return wrapper;
}
function renderProfile(focusField){const form=$('profile-form');form.replaceChildren();const content=node('div',undefined,'profile-fields-grid');form.append(content);const issues=profileIssues(),required=requiredProfileFields();if(guidedDraft){content.append(node('p',catalogueVersionLabel(catalogueStatus),'catalogue-freshness'));}if(issues.length)content.append(node('p','Vous pouvez enregistrer une demande incomplète. Les critères signalés sont nécessaires pour obtenir des propositions.','profile-completion-note'));for(const name of (guidedDraft?['professionalEnvironment','personnelCategory','role','managerStatus','objective','existingSkills','timeAvailable','modality','other','trainingOffers','trainingOrganizers']:['personnelCategory','managerStatus','entity','role','objective','existingSkills','timeAvailable','modality','other'])){const key=name==='other'?'constraints':name,f=references.pathway.fields[key],group=node('div',undefined,'field'+(['entity','role','objective','existingSkills','other'].includes(name)?' field-wide':'')),label=node('label',name==='modality'?'Modalité souhaitée':labels[key]);label.htmlFor='edit-'+name;let input;
 if(guidedDraft){const sections={professionalEnvironment:'Votre situation professionnelle',objective:'Votre besoin de formation',timeAvailable:'Vos disponibilités et préférences',trainingOffers:'Le périmètre de recherche'};if(sections[name])content.append(node('h3',sections[name],'request-section-title'));if(name==='trainingOffers')content.append(node('p','Ces choix limitent les cours explorés sans garantir leur accessibilité. Vérifiez les publics visés et les prérequis dans les résultats.','profile-completion-note'));}
 if(!f&&name!=='modality'){group.append(node('p','Les choix du catalogue sont indisponibles. Actualisez-les avant de renseigner ce critère.'));content.append(group);continue;}

 if(guidedDraft&&['trainingOffers','trainingOrganizers'].includes(name)){
  const wrapper=scopeOptions(name,profile[name]||'');
  content.append(wrapper);continue;
 }
 if(f?.formControl==='select'||name==='modality'){input=node('select');input.append(new Option('Non renseigné',''));for(const [text,value]of choices(name))input.append(new Option(text,value));}
 else{input=node(f.formControl==='textarea'?'textarea':'input');input.maxLength=f.maxLength;if(name==='entity'){const list=node('datalist');list.id='entity-options';for(const x of f.suggestions){const o=node('option');o.value=x.value;o.label=x.label;list.append(o);}content.append(list);input.setAttribute('list',list.id);}}
 if(guidedDraft&&f?.formControl==='select'&&profile[name]&&!f.options.some(o=>o.value===profile[name]))input.append(new Option(profile[name]+' — choix retiré, à vérifier',profile[name]));
 input.id='edit-'+name;input.name=name;input.value=name==='modality'?modality:name==='other'?other:profile[name]||'';input.required=false;if(guidedDraft&&name==='timeAvailable')input.placeholder='Par exemple : 5 heures sur les six prochains mois';
 const hint=node('p','', 'field-completion-hint');hint.id=input.id+'-hint';group.dataset.profileField=name;
 const markIssue=issue=>{hint.textContent=issue?.message||'';hint.hidden=!issue;group.classList.toggle('field-incomplete',Boolean(issue));if(issue){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',hint.id);}else{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');}};
 markIssue(issues.find(issue=>issue.name===(name==='other'?'constraints':name)));
 const refresh=()=>{const value=input.value.trim();let issue;if(!value&&required.includes(name==='other'?'constraints':name))issue={message:'À compléter pour obtenir des propositions.'};else if(value)try{validateField(name==='other'?'constraints':name,value);}catch(error){issue={message:error.message};}markIssue(issue);};
 input.addEventListener('input',refresh);input.addEventListener('change',refresh);group.append(label,input,hint);content.append(group);}
 const error=node('p','', 'status-line error');error.id='profile-error';error.setAttribute('role','alert');const footer=node('div',undefined,'profile-actions');footer.append(error);const submit=node('button','Enregistrer ma demande','primary');submit.type='submit';submit.disabled=busy;deviceMemory?.mount(content);footer.append(submit);form.append(footer);if(!$('profile-dialog').open)$('profile-dialog').showModal();if(typeof focusField==='string')requestAnimationFrame(()=>{const input=$('edit-'+focusField);if(input){input.focus({preventScroll:true});input.scrollIntoView({block:'center'});}});}

function applyDraft(draft){
 if(!draft||!Number.isSafeInteger(draft.revision)||draft.referenceRevision!==references.revision||!draft.profile||typeof draft.modality!=='string')throw Error('Brouillon de dialogue invalide');
 draftRevision=draft.revision;if(guidedDraft)requestMode=draft.requestMode||'';other=draft.profile.constraints||'';modality=draft.modality;profile={...draft.profile,constraints:composeConstraints(modality,other)};sync();
}
function nextField(){const basic=['objective','role','personnelCategory','existingSkills','timeAvailable','modality'];return [...basic,...fields.filter(k=>!basic.includes(k)&&references.pathway.fields[k]?.requiredInForm)].find(k=>!(k==='modality'?modality:profile[k])?.trim());}
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
function failureMessage(value,statusCode){if(value.code==='invalid_response')return 'Je n’ai pas pu mettre à jour votre demande à partir de cette réponse. Vos critères enregistrés sont conservés. Vous pouvez les vérifier dans « Ma demande ». Aucune relance automatique.';const code=typeof value.code==='string'&&/^[a-z_]{1,60}$/.test(value.code)?value.code:'unknown';const upstream=Number.isInteger(value.httpStatus)?' · API HTTP '+value.httpStatus+' · '+(value.stage==='count'?'comptage':'génération'):'';return 'Dialogue non abouti — '+code+' · HTTP '+statusCode+upstream+'. Demande conservée ; aucune relance automatique.';}
async function dialogueRequest(body){
 if(busy)throw Error('Une demande est déjà en cours.');
 invalidate();const attempt=epoch,abort=new AbortController();controller=abort;setBusy(true,body?.action==='turn'?'Réflexion en cours…':'');const timer=setTimeout(()=>abort.abort(),config.timeoutMs+15000);
 try{
  const response=await fetch('/private/dialogue',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal,
   headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(attempt!==epoch)throw Error('Réponse remplacée.');
  const value=await readPrivateResponse(response);if(value.references)references=value.references;showResumeNotice(value);showValidationCases(value);if(realPathway)updatePathwayQuota(value.pathwayQuota);if(!response.ok){if(realTrial&&value.mode==='real')updateDialogueBudget(value);const error=Error(failureMessage(value,response.status));error.code=value.code;error.budgetRefreshed=Boolean(realTrial&&value.mode==='real'&&value.budget);throw error;}
  if(value.mode!==(realTrial?'real':'simulation')||value.pathwayMode!==config.mode)throw Error('Mode de dialogue ou parcours inattendu.');updateDialogueBudget(value);return value;
 }finally{clearTimeout(timer);if(attempt===epoch){controller=null;setBusy(false);}}
}
function offerNext(){
 if(guidedDraft){guidedNext();return;}
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
async function offerResearchScope(selections){
 if(busy)return;
 try{
  const value=await dialogueRequest();references=value.references;applyDraft(value.draft);
  if(!ready()){guidedNext();return;}
  document.querySelectorAll('[data-scope-review]').forEach(el=>el.remove());clearChoices();
  const revision=draftRevision,baseProfile={...profile,constraints:other},baseModality=modality;
  const el=say('Avant de construire votre parcours, souhaitez-vous préciser une ou plusieurs offres de formation, une ou plusieurs entités organisatrices, ou les deux ? Ce choix est facultatif. En laissant ces deux critères vides, la recherche fonctionnera comme d’habitude à partir de votre profil.');el.dataset.scopeReview='true';
  const bubble=el.querySelector('.bubble'),form=node('form');form.className='scope-review-form';form.style.cssText='display:grid;gap:14px;margin-top:18px';
  for(const name of ['trainingOffers','trainingOrganizers'])form.append(scopeOptions(name,selections?.[name]??profile[name]??''));
  form.append(node('p','Ces critères précisent les cours explorés. Les conditions d’accès et les prérequis restent à vérifier.','source-note'));
  const error=node('p','','status-line error');error.setAttribute('role','alert');form.append(error);
  const submit=node('button','','primary');submit.type='submit';submit.style.cssText='white-space:normal;line-height:1.5';form.append(submit);
  const chosen=()=>Object.fromEntries(['trainingOffers','trainingOrganizers'].map(name=>[name,new FormData(form).getAll(name).join('\n')]));
  const updateLabel=()=>{submit.textContent=Object.values(chosen()).some(Boolean)?'Continuer avec ces choix':'Continuer sans préciser ces critères';};form.addEventListener('change',updateLabel);updateLabel();
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(busy)return;submit.disabled=true;error.textContent='';
   try{
    const selected=chosen();for(const [name,text]of Object.entries(selected))validateField(name,text);
    const saved=await dialogueRequest({action:'edit',profile:{...baseProfile,...selected},modality:baseModality,expectedRevision:revision});
    applyDraft(saved.draft);form.remove();bubble.append(node('p','Périmètre enregistré dans Ma demande. Vérifiez maintenant le récapitulatif avant de lancer la recherche.'));confirmProfile(true);
   }catch(e){error.textContent=e.message;if(!form.querySelector('[data-refresh-scope]')){const refresh=action('Actualiser les choix en gardant ma sélection',()=>offerResearchScope(chosen()),form);refresh.dataset.refreshScope='true';}}finally{submit.disabled=false;}
  });
  bubble.append(form);focusStart(el);
 }catch(error){status('Les offres et entités n’ont pas pu être actualisées. Votre demande est conservée. '+error.message,true);}
}
function confirmProfile(scopeReviewed=false){
 if(guidedDraft&&requestMode!=='pathway'){chooseMode('pathway');return;}
 clearChoices();$('composer').hidden=realValidation;
 if(proposal){status('Acceptez ou refusez d’abord la proposition en attente.',true);return;}
 if(pathwayBlocked()){const el=say(pathwayNotice());if(ready())profileList(profile,el.querySelector('.bubble'));focusStart(el);return;}
 if(!ready()){showIncompleteProfile();return;}
 if(guidedDraft&&!realValidation&&scopeReviewed!==true){offerResearchScope();return;}
 const el=say(realPathway?'Voici les repères de votre demande. Confirmer enverra ces informations au moteur A658-YG qui utilise OpenAI. '+(unlimitedTrial?'Chaque génération confirmée est payante. Aucune relance automatique.':realValidation?'Une seule tentative payante est autorisée pour ce scénario, dans la limite de trois scénarios.':'Une seule tentative payante de parcours est autorisée, sans relance automatique.')+'':'Voici les repères de votre demande. Souhaitez-vous simuler un parcours avec ces informations ?');profileList(profile,el.querySelector('.bubble'));
 const row=node('div',undefined,'action-row question-actions');const b=action(realPathway?'Confirmer ma demande et générer — essai payant':'Confirmer ma demande et simuler',simulate,row,true);b.dataset.confirm='true';action('Modifier ma demande',openProfile,row);if(guidedDraft&&!realValidation)action('Modifier les offres et entités',()=>offerResearchScope(),row);$('thread').append(row);focusStart(el);
}
function simulate(){if(pathwayBlocked()){status(pathwayNotice(),true);return;}if(proposal||!ready()){status('Validez les corrections et complétez les repères avant de confirmer.',true);return;}return simulatePathway();}
async function decide(accept){
 if(busy||!proposal)return;const currentProposal=proposal;
 try{const value=await dialogueRequest({action:accept?'accept':'reject',proposalId:currentProposal.id,expectedRevision:draftRevision,confirmed:accept});
  proposal=null;clearChoices();applyDraft(value.draft);const pending=[...document.querySelectorAll('[data-proposal-id]')].find(el=>el.dataset.proposalId===currentProposal.id);
  if(pending){const text=accept?'Repère enregistré dans votre demande.':'Informations non ajoutées. Votre demande reste inchangée.';if(realTrial)pending.querySelector('.bubble').append(node('p',text));else pending.querySelector('.bubble').firstChild.textContent=text;}
  status(accept?'Demande mise à jour. Aucune recherche lancée.':'Informations non ajoutées. Votre demande reste inchangée.');
  if(guidedDraft&&followupResearch!==null){
   if(accept&&requestMode==='pathway'&&ready())confirmProfile(true);
   else{const el=say(accept?'Les précisions ont été ajoutées à Ma demande. Les résultats enregistrés restent inchangés.':'Nous poursuivons le dialogue avec votre demande actuelle.');focusStart(el);}
  }else offerNext();
 }catch(error){status(error.message,true);}
}
function showPending(reply='Une proposition précédente attend votre décision. La demande reste inchangée.'){
 clearChoices();const el=sayReply(reply);el.dataset.proposalId=proposal.id;focusStart(el);
 const list=node('dl',undefined,'need-grid');for(const item of proposal.changes){const group=node('div');group.append(node('dt',labels[item.field]),node('dd',item.field==='modality'?item.value:display(item.field,item.value)));list.append(group);}el.querySelector('.bubble').append(list);
 const row=node('div',undefined,'action-row question-actions');action('Appliquer ces corrections',()=>decide(true),row,true);action('Garder ma demande actuelle',()=>decide(false),row);el.querySelector('.bubble').append(row);
 status('Proposition en attente : demande inchangée, aucune recherche lancée.');
}
async function send(text){
 if(realValidation){status('Utilisez les boutons de scénarios ; aucun tour de dialogue IA dans cette validation.');return;}
 text=text.trim();if(!text||busy)return;if(guidedDraft&&!requestMode){status('Choisissez Rechercher des formations ou Construire mon parcours pour poursuivre.');return;}if(guidedDraft&&requestMode==='search'&&followupResearch===null){if(completedSearch!==null){$('message').value='';say(text,true);const el=say('Pour compléter votre recherche, choisissez « Affiner cette recherche et construire mon parcours ». Votre recherche initiale sera reprise dans Ma demande. Pour un autre sujet, choisissez « Faire une nouvelle recherche ».');appendSearchChoices(el.querySelector('.bubble'),completedSearch);focusStart(el);status('Demande conservée. Aucun appel IA ni nouvelle recherche lancé.');return;}return searchCourses(text);}if(guidedDraft&&followupResearch===null&&currentGuidedField){const answer=directGuidedAnswer(currentGuidedField,text);if(answer!==null){$('message').value='';return chooseGuidedValue(currentGuidedField,answer);}}if(proposal){status('Acceptez ou refusez d’abord la proposition en attente.',true);return;}const profileBeforeTurn={...profile};clearChoices();$('message').value='';say(text,true);proposal=null;
 try{const value=await dialogueRequest({action:'turn',requestId:crypto.randomUUID(),message:text,...(guidedDraft&&followupResearch!==null?{researchNumber:followupResearch,...(followupCourse?{courseCode:followupCourse}:{})}:guidedDraft&&currentGuidedField?{questionField:currentGuidedField}:{}),expectedRevision:draftRevision,referenceRevision:references.revision,...(realTrial?{paidTrialConfirmed:true}:{})});
  applyDraft(value.draft);proposal=value.proposal;
  if(proposal)showPending(value.reply);
  else{if(guidedDraft&&followupResearch!==null){const el=sayReply(value.reply);focusStart(el);}else if(guidedDraft&&value.kind!=='out_of_scope'){if(currentGuidedField==='objective'&&value.draft.profile.objective!==profileBeforeTurn.objective)clarifyObjective=false;const next=nextGuidedField(profile,modality,{skipped:[...skippedGuidedFields],clarifyObjective});if(next===currentGuidedField){const el=say(value.reply);focusStart(el);}else guidedNext();}else{const el=say(value.reply);if(!guidedDraft)offerNext();focusStart(el);}status(realTrial?'Réponse IA reçue. Aucun parcours réel lancé.':'Réponse d’un fournisseur fictif. Aucun appel OpenAI.');}
 }catch(error){if(realTrial&&!error.budgetRefreshed&&error.code!=='secure_transport_required'&&error.code!=='private_auth_required'){try{await dialogueRequest();}catch{}}if(['invalid_response','secure_transport_required','private_response_unavailable'].includes(error.code)){const el=say(error.message);action('Vérifier ma demande',openProfile,el.querySelector('.bubble'));focusStart(el);}status(error.name==='AbortError'?'Dialogue interrompu. Demande et résultats conservés ; aucune relance automatique.':error.message,true);}
}
$('profile-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;const values=Object.fromEntries(new FormData(event.target)),next={};
 try{for(const k of fields)if(k!=='constraints'){if(guidedDraft&&k==='entity'){next[k]='';continue;}if(guidedDraft&&['trainingOffers','trainingOrganizers'].includes(k)){next[k]=new FormData(event.target).getAll(k).join('\n');validateField(k,next[k]);continue;}if(!references.pathway.fields[k])continue;if(values[k]?.trim())validateField(k,values[k]);next[k]=values[k]||'';}if(values.modality)validateField('modality',values.modality);const constraints=composeConstraints(values.modality,values.other);if(constraints)validateField('constraints',constraints);next.constraints=values.other;
  const value=await dialogueRequest({action:'edit',profile:next,modality:values.modality,expectedRevision:draftRevision});proposal=null;applyDraft(value.draft);$('profile-dialog').close();clearChoices();switchView('discussion');if(guidedDraft){followupResearch=null;followupCourse=null;status('Demande enregistrée. Les recherches précédentes restent conservées.');if(requestMode==='pathway'&&ready()){clarifyObjective=false;confirmProfile(true);}else guidedNext();return;}if(!ready()){showIncompleteProfile(true);return;}status('Demande enregistrée ; le parcours précédent reste conservé.');confirmProfile();
 }catch(error){$('profile-error').textContent=error.message;if(guidedDraft&&['stale_profile','references_changed'].includes(error.code)){
 $('profile-error').textContent='Les choix ou votre demande ont changé. Vos saisies restent affichées. Actualisez les choix puis vérifiez-les avant d’enregistrer.';
 if(!$('refresh-profile-options')){const b=action('Actualiser les choix en gardant mes saisies',()=>openProfile(undefined,true),$('profile-error').parentElement);b.id='refresh-profile-options';}
 }}
});
$('composer').addEventListener('submit',event=>{event.preventDefault();send($('message').value);});
$('message').maxLength=1500;$('message').placeholder='Décrivez votre besoin…';
$('open-profile').addEventListener('click',openProfile);$('close-profile').addEventListener('click',()=>$('profile-dialog').close());
$('restart').addEventListener('click',async()=>{
 if(busy)return;
 if((Object.values(profile).some(v=>String(v??'').trim())||modality||other||$('message').value.trim()||document.querySelector('#thread .message.user,#thread .result-message'))&&!await confirmNewRequest(document))return;
 if(busy)return;
 try{const value=await dialogueRequest({action:'new-request',confirmed:true,expectedRevision:draftRevision});proposal=null;$('message').value='';$('thread').replaceChildren();applyDraft(value.draft);switchView('discussion',true);if(guidedDraft){resumeChoicePending=false;completedSearch=null;followupResearch=null;currentGuidedField=null;skippedGuidedFields.clear();clarifyObjective=false;welcome();}else{say('Commençons une nouvelle demande. Vos recherches précédentes restent disponibles à gauche.');offerNext();}status('Nouvelle demande commencée. Recherches conservées ; compteurs inchangés.');}catch(error){status(error.message,true);}
});
$('refresh-references').addEventListener('click',async()=>{
 if(busy)return;try{const value=await dialogueRequest();references=value.references;proposal=value.proposal;applyDraft(value.draft);clearChoices();status(value.lastError?failureMessage(value.lastError,value.lastError.status):'Brouillon accepté rechargé. Le résultat précédent reste conservé ; aucune recherche automatique.',Boolean(value.lastError));if(proposal)showPending();else offerNext();restorePathway(value.savedPathway,value.savedPathways);}catch(error){status(error.message,true);}
});
document.querySelectorAll('[data-view]').forEach(b=>{b.addEventListener('click',()=>switchView(b.dataset.view));b.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const v=event.key==='Home'?'discussion':event.key==='End'?'courses':active==='discussion'?'courses':'discussion';switchView(v);$('tab-'+v).focus();}});});
if(realTrial){$('send-message').setAttribute('aria-label','Envoyer un message — essai payant');$('send-message').title='Envoyer un message — essai payant';const meter=node('p','','source-note');meter.id='dialogue-budget';$('pilot-details-content').prepend(meter);}
if(realTrial)status(realValidation?'Validation de parcours : chargement gratuit ; génération payante après confirmation.':'Dialogue IA : chaque message envoyé peut être payant. Aucun appel OpenAI à l’ouverture.');
if(realPathway){const meter=node('p','','source-note');meter.id='pathway-quota';meter.setAttribute('role','status');$('pilot-details-content').prepend(meter);updatePathwayQuota(null);}
try{const value=await dialogueRequest();references=value.references;applyDraft(value.draft);if(guidedDraft){resumeChoicePending=Boolean(modality||Object.values(profile).some(x=>String(x??'').trim()));welcome();}else say(realValidation?'Validation privée : chargez un des trois profils fictifs. Le chargement ne lance aucun appel IA. Chaque génération nécessite votre confirmation payante ; chaque scénario peut être tenté une fois.':realTrial?'Cet essai envoie les repères de votre demande et cet échange à OpenAI. Utilisez uniquement des données fictives. Chaque message envoyé peut consommer une tentative payante, sans relance automatique. '+(realPathway?'Le parcours réel nécessite une confirmation payante distincte.':'Les parcours restent des exemples simulés.')+' Qu’aimeriez-vous mieux faire ou apprendre ?':'Bonjour ! Ce mode de test utilise un fournisseur fictif. Chaque correction proposée attend votre acceptation ; aucun appel OpenAI.');proposal=value.proposal;if(proposal)showPending();else if(!guidedDraft)offerNext();restorePathway(value.savedPathway,value.savedPathways);deviceMemory?.offer($('thread'));}catch(error){status(error.message,true);}

if(config.catalogueStatusEnabled){
 fetch('/private/catalogue-status',{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)})
 .then(async response=>{if(!response.ok)throw Error();const value=await readPrivateResponse(response);catalogueStatus=readCatalogueVersion(value.catalogue);sync()}).catch(()=>{catalogueStatus=null;sync()})
}

function welcome(){
 const el=say('Comment puis-je vous aider ? Vous cherchez des formations, ou souhaitez-vous construire un parcours adapté à votre situation ?'),row=node('div',undefined,'action-row question-actions');
 action('Rechercher des formations',()=>chooseMode('search'),row,true);action('Construire mon parcours',()=>chooseMode('pathway'),row);el.querySelector('.bubble').append(row);if(realTrial)el.querySelector('.bubble').append(node('p','Pour ce pilote privé, utilisez uniquement des données fictives. Les messages et recherches envoyés à l’IA peuvent être payants.','source-note'));
 if(requestMode||modality||Object.values(profile).some(x=>String(x??'').trim())){const resume=node('div',undefined,'action-row question-actions');action('Reprendre ma demande existante',()=>chooseMode(requestMode||'pathway',undefined,true),resume);el.querySelector('.bubble').append(resume);}
 focusStart(el);
}
async function chooseMode(mode,fromResearch,resume=false,explicitNewSearch=false){
 if(busy)return;
 const hasDraft=modality||Object.values(profile).some(x=>String(x??'').trim())||$('message').value.trim()||document.querySelector('#thread .message.user');
 if(!resume&&!explicitNewSearch&&fromResearch===undefined&&hasDraft&&!await confirmNewRequest(document))return;
 if(busy)return;
 try{const value=await dialogueRequest({action:'request-mode',requestMode:mode,intent:resume?'resume':'start',confirmed:!resume,expectedRevision:draftRevision,...(fromResearch!==undefined?{fromResearch}:{})});proposal=null;resumeChoicePending=false;document.querySelectorAll('[data-resume-choice]').forEach(el=>el.remove());if(!resume){$('thread').replaceChildren();$('message').value='';}if(!resume&&mode==='search')current=null;applyDraft(value.draft);if(!resume){completedSearch=null;skippedGuidedFields.clear();clarifyObjective=fromResearch!==undefined;}clearChoices();switchView('discussion');if(resume)say('Votre demande existante a été reprise avec ses critères enregistrés. Vérifiez-les avant de poursuivre.');
 const text=mode==='pathway'&&fromResearch!==undefined?'Reprenons votre recherche « '+profile.objective+' ». Je vais vous poser quelques questions pour construire un parcours adapté à votre situation. Vos réponses compléteront Ma demande au fil de notre échange.':mode==='search'?'Quelle formation recherchez-vous ? Donnez-moi un titre, un code, quelques mots-clés ou décrivez ce que vous souhaitez apprendre. La recherche utilise l’IA du catalogue et peut être payante. Aucun formulaire complet à remplir.':'Je vais vous aider à préciser votre besoin. Nous compléterons progressivement le formulaire « Ma demande », que vous pourrez modifier avant de lancer la recherche. Chaque message envoyé peut consommer un appel IA payant.';
 const el=say(text);$('message').placeholder=mode==='search'?'Un titre, un code ou ce que vous souhaitez apprendre…':'Décrivez votre besoin…';$('message').maxLength=mode==='search'?1000:1500;$('send-message').setAttribute('aria-label',mode==='search'?'Rechercher des formations — IA payante':'Envoyer un message — IA payante');
 if(mode==='search')updateSearchComposer();
 followupResearch=null;followupCourse=null;if(mode==='pathway')guidedNext();focusStart(el);$('message').focus({preventScroll:true});
 }catch(error){status(error.message,true);}
}
async function chooseGuidedValue(field,value){
 if(busy)return;
 try{
  if(value)validateField(field,value);
  const next={...profile,constraints:other};if(field!=='modality')next[field]=value;
  const saved=await dialogueRequest({action:'edit',profile:next,modality:field==='modality'?value:modality,expectedRevision:draftRevision});
  if(!value)skippedGuidedFields.add(field);else skippedGuidedFields.delete(field);
  say(value?display(field,value):'Je préfère ne pas préciser.',true);applyDraft(saved.draft);guidedNext();status('Réponse enregistrée. Aucun appel IA ni recherche lancé.');
 }catch(error){status(error.message,true);}
}
function guidedNext(){
 followupResearch=null;followupCourse=null;clearChoices();if(!requestMode||requestMode==='search')return;
 currentGuidedField=nextGuidedField(profile,modality,{skipped:[...skippedGuidedFields],clarifyObjective});
 if(currentGuidedField){
  const field=currentGuidedField,el=say(GUIDED_QUESTIONS[field]);el.dataset.guidedQuestion=field;
  const row=node('div',undefined,'action-row question-actions');
  for(const [label,value]of choices(field))action(label,()=>chooseGuidedValue(field,value),row);
  if(['managerStatus','professionalEnvironment'].includes(field))action('Je préfère ne pas préciser',()=>chooseGuidedValue(field,''),row);
  if(row.childNodes.length)el.querySelector('.bubble').append(row);focusStart(el);
 }else{
  const el=say('Les repères essentiels sont renseignés. Vous pouvez choisir les offres et entités facultatives, puis vérifier votre demande avant de lancer le parcours.');
  const row=node('div',undefined,'action-row question-actions');
  if(ready())action('Choisir les offres et vérifier ma demande',confirmProfile,row,true);
  el.querySelector('.bubble').append(row);focusStart(el);
 }

}
function updateSearchComposer(){
 const followup=completedSearch!==null;
 $('message').placeholder=followup?'Une question sur ces cours ?':'Un titre, un code ou ce que vous souhaitez apprendre…';
 const label=followup?'Discuter des résultats — IA payante':'Rechercher des formations — IA payante';
 $('send-message').setAttribute('aria-label',label);$('send-message').title=label;
}
function appendSearchChoices(parent,number){
 const row=node('div',undefined,'search-next-choices');
 const choice=(title,description,fn)=>{const button=action('',fn,row);button.setAttribute('aria-label',title);button.append(node('strong',title),node('span',description));};
 choice('Faire une nouvelle recherche','Repartir avec une demande vide. Vos recherches enregistrées restent disponibles.',()=>chooseMode('search',undefined,false,true));
 choice('Affiner cette recherche et construire mon parcours','Conserver ce besoin et compléter Ma demande avant de générer le parcours.',()=>chooseMode('pathway',number));
 parent.append(row);
}
async function searchCourses(query){
 if(busy)return;if(history.length>=20){status('Fermez une recherche avant d’en créer une nouvelle (20 maximum).',true);return;}
 clearChoices();$('message').value='';say(query,true);invalidate();const attempt=epoch;controller=new AbortController();const abort=controller;setBusy(true,'Recherche de formations en cours…');status('Recherche IA du catalogue en cours. Aucune relance automatique.');
 const timer=setTimeout(()=>abort.abort(),210000);
 try{const response=await fetch('/private/course-search',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json','Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({query,requestId:crypto.randomUUID(),confirmed:true,expectedRevision:draftRevision})});const value=await readPrivateResponse(response);if(attempt!==epoch)return;if(!response.ok)throw Error('Recherche non aboutie. Vos recherches précédentes sont conservées. Aucune relance automatique.');
 showResumeNotice(value);history=value.savedPathways.map(readSavedPathway);current=history.find(x=>x.number===value.savedPathway.number);completedSearch=current.number;followupResearch=current.number;currentGuidedField=null;const found=current,el=say('');el.classList.add('result-message');el.querySelector('.bubble').append(renderSnapshot(current));const total=(found.result.recommendedSteps??[]).length+(found.result.optionalSteps??[]).length+(found.result.informationalCourses??[]).length;const transition=say(total?'J’ai trouvé '+total+' formation'+(total>1?'s':'')+' correspondant à votre recherche. Retrouvez-les dans « Cours proposés » et « Mes recherches ». Quelle suite souhaitez-vous donner ?':'Je n’ai pas trouvé de formation correspondante. Vous pouvez commencer une nouvelle recherche ou compléter Ma demande pour affiner votre besoin.');action('Voir les cours proposés',()=>selectResearch(found.number),transition.querySelector('.bubble'));appendSearchChoices(transition.querySelector('.bubble'),found.number);updateSearchComposer();sync();focusStart(el);status('Recherche terminée. Choisissez une nouvelle recherche ou complétez Ma demande pour construire votre parcours.');
 }catch(error){if(attempt===epoch)status(error.name==='AbortError'?'Recherche interrompue. Aucune relance automatique.':error.message,true);}
 finally{clearTimeout(timer);if(attempt===epoch){controller=null;setBusy(false);}}
}

let profileOpening=false;
async function refreshCatalogueDate(){
 if(!config.catalogueStatusEnabled)return;
 try{const response=await fetch('/private/catalogue-status',{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)});if(!response.ok)throw Error();const value=await readPrivateResponse(response);catalogueStatus=readCatalogueVersion(value.catalogue);}catch{catalogueStatus=null;}
}
async function openProfile(focusField,preserveEdits=false){
 if(!guidedDraft){renderProfile(focusField);return;}
 if(busy||profileOpening)return;
 if(resumeChoicePending&&!preserveEdits){
  const existing=document.querySelector('[data-resume-choice]');if(existing){switchView('discussion');focusStart(existing);existing.querySelector('button')?.focus({preventScroll:true});return;}
  clearChoices();switchView('discussion');const el=say('Une demande existe déjà. Souhaitez-vous la reprendre avec ses critères enregistrés, ou commencer une demande vide ?'),row=node('div',undefined,'action-row');
  el.dataset.resumeChoice='true';
  action('Commencer une demande vide',async()=>{await chooseMode('pathway');if(!resumeChoicePending)openProfile(focusField);},row,true);
  action('Reprendre ma demande existante',async()=>{await chooseMode(requestMode||'pathway',undefined,true);if(!resumeChoicePending)openProfile(focusField);},row);el.querySelector('.bubble').append(row);focusStart(el);return;
 }
 profileOpening=true;
 const saved=preserveEdits?new FormData($('profile-form')):null;
 try{const value=await dialogueRequest();references=value.references;applyDraft(value.draft);await refreshCatalogueDate();renderProfile(focusField);
  if(saved){
   for(const name of ['professionalEnvironment','personnelCategory','role','managerStatus','objective','existingSkills','timeAvailable','modality','other']){
    const input=$('edit-'+name);if(!input||!saved.has(name))continue;const value=String(saved.get(name));
    if(input.tagName==='SELECT'&&value&&![...input.options].some(o=>o.value===value))input.append(new Option(value+' — choix retiré, à vérifier',value));input.value=value;input.dispatchEvent(new Event('input'));
   }
   for(const name of ['trainingOffers','trainingOrganizers']){
    const selected=saved.getAll(name),wrapper=document.querySelector('[data-scope-field="'+name+'"]');if(!wrapper)continue;
    for(const input of wrapper.querySelectorAll('input'))input.checked=selected.includes(input.value);
    for(const value of selected)if(![...wrapper.querySelectorAll('input')].some(x=>x.value===value)){const row=node('label'),input=node('input');input.type='checkbox';input.name=name;input.value=value;input.checked=true;row.append(input,document.createTextNode(value+' — choix retiré, à vérifier'));wrapper.append(row);}
   }
   $('profile-error').textContent='Choix actualisés. Vos saisies sont conservées ; vérifiez les sélections avant d’enregistrer.';
  }
 }catch(error){status('Ma demande n’a pas été actualisée. Vos critères sont conservés. '+error.message,true);}finally{profileOpening=false;}
}

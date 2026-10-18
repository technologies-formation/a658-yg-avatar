import { readFileSync } from 'node:fs'
import { validateProfileReferences } from './profile-references.mjs'

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const start = source.indexOf('function previewRequest(){')
const end = source.indexOf('\nfunction summary(){', start)
if (start < 0 || end < 0) throw Error('Interface du questionnaire modifiée : adaptation requise')

const submit = `async function previewRequest(){
 privateSucceeded=false;
 if(intent!=='Parcours de formation'){bubble('Ce pilote permet uniquement de construire un parcours. Modifie le type de demande.');return}
 if(!canSimulate()||validateDraft().length){bubble('Vérifie et confirme le profil avant la simulation privée.');return}
 const profile=pathwayPayload();
 invalidateSimulation();const revision=requestRevision;
 const controller=new AbortController();privateAbort=controller;
 const timer=setTimeout(()=>controller.abort(),privateTimeoutMs);
 const options={signal:controller.signal,credentials:'same-origin',cache:'no-store',redirect:'error'};
 const failStatus=status=>{
  if(matchMedia('(max-width:750px)').matches)document.getElementById('details').open=false;
  if(status===401){referencesReady=false;setReferenceStatus('Accès privé refusé. Tes réponses sont conservées. Reconnecte-toi avant de confirmer.');}
  else if(status===409||status===503){referencesReady=false;setReferenceStatus('Choix ou service à revalider. Tes réponses sont conservées : actualise les choix avant de confirmer.');}
  else if(status===429)setReferenceStatus('Plafond de simulation atteint. Tes réponses sont conservées. Aucune relance automatique.');
  else setReferenceStatus('Simulation privée non aboutie. Tes réponses sont conservées. Aucune relance automatique.');
  showSimulation(status===429?'Plafond de simulation atteint. Aucune relance automatique.':'Simulation privée non aboutie ('+status+'). Tes réponses sont conservées. Aucune relance automatique.',revision);
 };
 try{
  const referenceResponse=await fetch('/private/profile-references',{...options,headers:{Accept:'application/json'}});
  if(revision!==requestRevision)return;
  if(!referenceResponse.ok){failStatus(referenceResponse.status);return}
  const ticket=await referenceResponse.json();
  if(revision!==requestRevision)return;
  if(ticket.references?.revision!==referenceRevision){failStatus(409);return}
  if(typeof ticket.requestId!=='string'||!ticket.requestId)throw Error('Confirmation indisponible');
  const response=await fetch('/private/pathway',{...options,method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({profile,confirmed:true,referenceRevision,requestId:ticket.requestId})});
  if(revision!==requestRevision)return;
  if(!response.ok){failStatus(response.status);return}
  const value=await response.json();
  if(value.mode!=='simulation'||!value.preview||!value.quota)throw Error('Résultat de simulation attendu');
  const {renderPathwayResult}=await import('/private/pathway-result-view.mjs');
  if(revision!==requestRevision)return;
  chat.append(renderPathwayResult(document,value.preview,{replay:true}));
  privateSucceeded=true;
  if(matchMedia('(max-width:750px)').matches)document.getElementById('details').open=false;
  setReferenceStatus('Simulation privée terminée. Tu peux revoir le profil ou commencer une nouvelle demande.');
  showSimulation('Simulation privée terminée, sans appel au moteur. Tentatives : '+value.quota.total+'/'+value.quota.maxTotalRequests+'.',revision);
 }catch{if(revision===requestRevision){setReferenceStatus('Simulation privée interrompue ou indisponible. Tes réponses sont conservées ; aucune relance automatique.');showSimulation('Simulation privée interrompue ou indisponible. Tes réponses sont conservées ; aucune relance automatique.',revision)}}
 finally{clearTimeout(timer);if(privateAbort===controller)privateAbort=null}
}`

export function renderPrivatePage(references, { timeoutMs = 10000 } = {}) {
  const contract = validateProfileReferences(references)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 210000) throw Error('Délai navigateur invalide')
  const fields = JSON.stringify(contract.pathway.fields).replace(/</g, '\\u003c')
  return (source.slice(0, start) + submit + source.slice(end))
    .replace('/*PROFILE_REFERENCES*/null', 'JSON.parse(' + JSON.stringify(fields) + ')')
    .replace('/*REFERENCE_REVISION*/null', JSON.stringify(contract.revision))
    .replace('/*LOCAL_REFERENCES*/false', 'true')
    .replace("let editing=null,", 'let privateAbort=null,privateSucceeded=false;const privateTimeoutMs=' + timeoutMs + ';let editing=null,')
    .replace("step==='confirm'&&referencesReady)step='done'", "step==='confirm'&&referencesReady&&privateSucceeded)step='done'")
    .replace("function invalidateSimulation(){", 'function invalidateSimulation(){privateAbort?.abort();privateAbort=null;')
    .replace("function beginEdit(key){", "function beginEdit(key){if(confirming)invalidateSimulation();")
    .replace("const contract=await response.json();", "const envelope=await response.json();const contract=envelope.references;")
    .replace("'/local/profile-references'", "'/private/profile-references'")
    .replace('configureReferences();\nconst order=', "configureReferences();questions.intent.options=['Construire un parcours'];\nconst order=")
    .replace('Merci de choisir un des deux types de demande proposés.', 'Ce pilote permet uniquement de construire un parcours.')
    .replace('Démonstration · aucun appel API', 'Pilote privé · simulation uniquement')
    .replace('V5 renforcée : validation locale des données API, sans connexion au moteur.', 'Essai privé en simulation : aucun appel au moteur réel ni à OpenAI.')
    .replace("<title>A658-YG | Avatar formation - démonstration</title>", '<title>A658-YG | Avatar — simulation privée</title>')
}

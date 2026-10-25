// État navigateur sans réseau ; le résultat reçu n'est jamais reclassé ni complété.
import { validatePathwayResult } from './pathway-result.mjs'
export const fields=['personnelCategory','entity','managerStatus','role','objective','existingSkills','timeAvailable','constraints'];
const fingerprint=p=>JSON.stringify(fields.map(k=>String(p[k]??'').trim()));
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
export function composeConstraints(modality,other=''){
 if(!['','Présentiel','En ligne','Indifférent'].includes(modality))throw Error('Modalité inconnue');
 return [modality==='En ligne'?'Modalité souhaitée : en ligne':modality==='Présentiel'?'Modalité souhaitée : présentiel':modality==='Indifférent'?'Aucune préférence de modalité':'',other.trim()].filter(Boolean).join('\n');
}
export function validateMessagingProfile(profile,contract){
 const out={};for(const name of fields){const f=contract.pathway.fields[name],v=profile[name]??'';
  if(typeof v!=='string'||v.trim().length>f.maxLength)throw Error('Champ invalide : '+name);
  const text=v.trim();if(f.requiredInForm&&!text)throw Error('Champ obligatoire : '+name);
  if(text&&f.formControl==='select'&&!f.options.some(x=>x.value===text))throw Error('Choix à revalider : '+name);
  if(text)out[name]=text;
 }return out;
}
export function createMessagingSnapshot(profile,result,referenceRevision,number,modality='',mode='simulation'){if(!['real','simulation'].includes(mode))throw Error('Mode de parcours inconnu');if(!['','Présentiel','En ligne','Indifférent'].includes(modality))throw Error('Modalité inconnue');validatePathwayResult(result);return freeze({mode,modality,profile:structuredClone(profile),result:structuredClone(result),referenceRevision,number,fingerprint:fingerprint(profile)});}
export const snapshotIsStale=(snapshot,profile,revision)=>Boolean(snapshot&&(snapshot.fingerprint!==fingerprint(profile)||snapshot.referenceRevision!==revision));

// Extrait court de l’objectif confirmé ; l’objectif complet reste dans les repères.
// Aucune interprétation sémantique, requête IA ou modification du résultat enregistré.
export function researchLabel(snapshot){
 const objective=String(snapshot.profile?.objective??'').trim();
 let title=objective.replace(/^(?:je (?:souhaite|voudrais|veux)\s+|j['’]aimerais\s+|apprendre à\s+)/iu,'').replace(/[.!?]+$/u,'').trim();
 if(!title)title='Votre besoin de formation';
 const words=title.split(/\s+/u);let shortened=false;
 while(words.length>1&&(words.length>8||words.join(' ').length>72)){words.pop();shortened=true;}
 while(shortened&&words.length>1&&/^(?:avec|pour|de|des|du|et|en|à|au|aux|sous|le|la|les|un|une|mes|mon|ma)$/iu.test(words.at(-1)))words.pop();
 let excerpt=words.join(' ');if(excerpt.length>72){excerpt=excerpt.slice(0,69).trimEnd();shortened=true;}
 excerpt=excerpt.charAt(0).toLocaleUpperCase('fr')+excerpt.slice(1);
 return 'Recherche n° '+snapshot.number+' — '+excerpt+(shortened?'…':'');
}

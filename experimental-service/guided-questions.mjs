// Questions affichées : les choix structurés et le texte libre suivent le même ordre.
export const GUIDED_QUESTIONS = Object.freeze({
 professionalEnvironment:'Dans quel environnement professionnel travaillez-vous ?',
 personnelCategory:'À quel groupe de personnel appartenez-vous ?',
 role:'Quel est votre métier ou votre fonction ?',
 managerStatus:'Quelle est votre situation managériale ? Vous pouvez la laisser non précisée.',
 objective:'Que souhaitez-vous apprendre ou mieux faire concernant votre recherche initiale ?',
 existingSkills:'Quel est votre niveau actuel dans ce domaine ? Vous pouvez choisir un repère ou décrire vos acquis.',
 timeAvailable:'De combien de temps disposez-vous pour vous former, et sur quelle période si vous la connaissez ?',
 modality:'Quelle modalité de formation préférez-vous ?'
})
export function nextGuidedField(profile,modality,{skipped=[],clarifyObjective=false}={}) {
 for(const field of ['professionalEnvironment','personnelCategory','role','managerStatus','objective','existingSkills','timeAvailable','modality']) {
  if(skipped.includes(field)&&['professionalEnvironment','managerStatus'].includes(field))continue
  if(field==='objective'&&clarifyObjective)return field
  if(!(field==='modality'?modality:profile[field])?.trim())return field
 }
 return null
}

// Réponses explicites conservées mot pour mot, sans interprétation de niveau ou de statut.
// Les questions et demandes d'aide restent confiées au dialogue.
export function directGuidedAnswer(field,text) {
 const value=String(text).trim();
 if(!value||/[?\n]/u.test(value)||/^(?:pourquoi|comment|quel|quelle|quels|quelles|est.ce|peux|pouvez|aide|je (?:voudrais|souhaite|veux|ne sais)|j['’]aimerais)\b/iu.test(value))return null;
 if(field==='role'&&/^[\p{L}\p{N} '’().-]{1,60}$/u.test(value))return value;
 if(field==='existingSkills'&&/^(?:je (?:n['’]ai jamais|n['’]utilise jamais|débute|debute)|aucune expérience|jamais utilis)/iu.test(value))return value;
 if(field==='timeAvailable'&&/^(?:j['’]ai\s+|je dispose de\s+)?\d+(?:[,.]\d+)?\s*(?:heures?|jours?|demi.journées?)\b/iu.test(value))return value;
 return null;
}

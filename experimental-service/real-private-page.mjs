// Même questionnaire et même contrôle de révision ; libellés et enveloppe du moteur réel.
import { renderPrivatePage } from './private-page.mjs'

export function renderRealPrivatePage(references, { timeoutMs = 210000 } = {}) {
  let page = renderPrivatePage(references, { timeoutMs })
  const replacements = [
    ["if(value.mode!=='simulation'||!value.preview||!value.quota)throw Error('Résultat de simulation attendu');", "if(value.mode!=='real'||!value.result||!value.quota)throw Error('Résultat réel attendu');"],
    ['value.preview,{replay:true}', 'value.result,{replay:false}'],
    ['Pilote privé · simulation uniquement', 'Pilote privé · une tentative réelle'],
    ['Avatar — simulation privée', 'Avatar — parcours réel privé'],
    ['Mode de simulation : aucun appel au moteur A658-YG ni à OpenAI.', 'Essai réel : ton profil confirmé est envoyé au moteur A658-YG qui utilise OpenAI. Une seule tentative payante autorisée.'],
    ["Essai privé en simulation : aucun appel au moteur réel ni à OpenAI. La mise en service réelle fera l'objet d'une validation distincte.", 'Essai privé local connecté au moteur. Utilise uniquement le profil fictif convenu. Aucun nouvel essai après erreur ou délai dépassé.'],
    ['Confirmer le profil et simuler', 'Confirmer le profil et générer'],
    ['Simulation privée terminée, sans appel au moteur.', 'Parcours réel reçu.'],
    ['Plafond de simulation atteint', 'Tentative réelle déjà utilisée'],
    ['Simulation privée', 'Génération privée'],
    ['Simulation terminée', 'Génération terminée'],
    ['nouvelle simulation', 'nouvelle génération'],
    ['la simulation privée', 'la génération privée'],
    ['La simulation se lance', 'La génération se lance'],
    ['résultat de simulation', 'résultat de parcours'],
    ['actualiser la simulation', 'actualiser le parcours'],
    ['Actualiser la simulation', 'Actualiser le parcours'],
  ]
  for (const [before, after] of replacements) page = page.replaceAll(before, after)
  page = page.replace(" const profile=pathwayPayload();", " setReferenceStatus('Génération en cours : une tentative payante. Attends le résultat sans recharger ni confirmer à nouveau.');\n const profile=pathwayPayload();")
  return page
}

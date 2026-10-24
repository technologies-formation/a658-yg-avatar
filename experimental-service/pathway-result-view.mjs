// Affichage seul : aucune requête, aucun stockage, aucun HTML issu du résultat.
import { validatePathwayResult } from './pathway-result.mjs'

export function renderPathwayResult(document, data, { replay = false, preferredModality = '' } = {}) {
  const { empty } = validatePathwayResult(data)
  if (!['','Présentiel','En ligne','Indifférent'].includes(preferredModality)) throw Error('Modalité souhaitée invalide')
  const root = document.createElement('section')
  root.className = 'simulation pathway-result'
  root.setAttribute('aria-label', 'Résultat du parcours')
  const add = (parent, tag, text) => {
    const element = document.createElement(tag)
    element.textContent = text
    parent.append(element)
    return element
  }
  add(root, 'h2', replay ? 'Aperçu hors ligne du parcours' : 'Ton parcours de formation')
  if (replay) add(root, 'p', 'Données de test pour vérifier l’affichage ; elles ne répondent pas à ton profil. Aucun appel au moteur ni à OpenAI.')
  add(root, 'p', data.summary)
  if (data.interpretedGoal) add(root, 'p', 'Objectif interprété : ' + data.interpretedGoal)
  if (data.abstain) add(root, 'p', 'Le moteur ne propose pas de parcours adapté à cette demande.')
  else if (empty) add(root, 'p', 'Aucune formation proposée dans ce résultat.')
  for (const [label, items] of [
    ['Étapes recommandées', data.recommendedSteps ?? data.steps ?? []],
    ['Compléments', data.optionalSteps ?? []],
    ['Pour information', data.informationalCourses ?? []],
  ]) {
    if (!items.length) continue
    add(root, 'h3', label)
    // L’ordre reçu et les positions du moteur restent inchangés.
    for (const item of items) {
      const card = document.createElement('article')
      card.className = 'pathway-course'
      root.append(card)
      add(card, 'h4', item.position + '. ' + item.course.code + ' — ' + item.course.title)
      add(card, 'p', item.rationale)
      add(card, 'p', item.course.duration ? 'Durée : ' + item.course.duration : item.course.durationHours == null ? 'Durée non renseignée' : 'Durée : ' + item.course.durationHours + ' h')
      if (item.course.public) add(card, 'p', 'Public : ' + item.course.public)
      const mode = item.course.deliveryMode
      const modeLabels = {online:'en ligne',in_person:'en présentiel',hybrid:'hybride'}
      const known = mode && mode.value !== 'unknown'
      add(card, 'p', known ? 'Modalité indiquée dans l’intitulé : ' + modeLabels[mode.value] + '.'
        : 'Modalité du cours : non renseignée dans les données transmises.')
      if (preferredModality) add(card, 'p', 'Votre préférence : ' + preferredModality + '.')
      if (preferredModality && preferredModality !== 'Indifférent') {
        const preferred = preferredModality === 'En ligne' ? 'online' : 'in_person'
        add(card, 'p', !known ? 'Compatibilité avec votre préférence : non établie. Vérifiez la modalité sur la fiche officielle.'
          : mode.value === 'hybrid' ? 'Compatibilité à vérifier : une formation hybride peut comporter des séances en ligne et en présentiel.'
          : mode.value === preferred ? 'Modalité conforme à votre préférence selon l’intitulé ; vérifiez les conditions sur la fiche officielle.'
          : 'Écart avec votre préférence : la modalité indiquée pour ce cours est différente. Cette piste reste à comparer.')
      }
      if (item.course.sourceUrl) {
        const link = add(card, 'a', 'Consulter la fiche officielle')
        link.href = item.course.sourceUrl
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
      }
    }
  }
  if (data.gaps?.length) {
    add(root, 'h3', 'Limites du catalogue')
    const list = document.createElement('ul'); root.append(list)
    for (const gap of data.gaps) add(list, 'li', gap)
  }
  if (data.durationSummary) {
    add(root, 'h3', 'Temps de formation')
    if (replay) {
      add(root, 'p', 'Exemple fictif : les durées des cours ne sont pas comparées à votre temps disponible. Consultez le profil confirmé pour retrouver votre disponibilité.')
    } else {
      const duration = data.durationSummary
      for (const [field, label] of [['budgetHours', 'Temps disponible'], ['recommendedHours', 'Étapes recommandées'], ['excessHours', 'Dépassement']]) {
        if (duration[field] != null) add(root, 'p', label + ' : ' + duration[field] + ' h')
      }
      if (duration.withinBudget === false) add(root, 'p', 'Le parcours dépasse le temps disponible.')
      if (duration.durationsKnown === false || duration.verified === false || duration.budgetVerified === false) {
        add(root, 'p', 'La vérification des durées est incomplète.')
      }
    }
  }
  const usage = data.usage?.total
  if (usage) {
    add(root, 'h3', replay ? 'Consommation figurant dans les données de test' : 'Consommation renvoyée par le moteur')
    if (usage.input !== undefined) add(root, 'p', 'Tokens d’entrée : ' + usage.input)
    if (usage.output !== undefined) add(root, 'p', 'Tokens de sortie : ' + usage.output)
    if (usage.cost !== undefined) add(root, 'p', 'Coût calculé par le backend : ' + usage.cost + ' USD')
    else add(root, 'p', 'Coût non disponible.')
  }
  add(root, 'p', 'Vérifie les conditions d’accès et les prérequis sur la fiche officielle. La pertinence d’une formation ne garantit pas son accessibilité.')
  return root
}

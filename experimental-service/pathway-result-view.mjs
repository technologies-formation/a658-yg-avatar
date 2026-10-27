// Affichage seul : aucune requête, aucun stockage, aucun HTML issu du résultat.
import { validatePathwayResult, courseDisplayDetails } from './pathway-result.mjs'

export function renderPathwayResult(document, data, { replay = false, preferredModality = '', objective = '' } = {}) {
  const { empty } = validatePathwayResult(data)
  if (!['','Présentiel','En ligne','Indifférent'].includes(preferredModality)) throw Error('Modalité souhaitée invalide')
  const root = document.createElement('section')
  root.className = 'simulation pathway-result'
  root.setAttribute('aria-label', 'Résultat du parcours')
  const add = (parent, tag, text) => {
    const element = document.createElement(tag)
    element.textContent = text
    const icons = {
      'Étapes recommandées': 'M3 5h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3z M12 7v15',
      'Compléments': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 8v8 M8 12h8',
      'Pour information': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 8h.01 M12 11v6',
      'Limites du catalogue': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 8h.01 M12 11v6',
      'Temps de formation': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
      'Consommation renvoyée par le moteur': 'M4 20h16 M7 16v-5 M12 16V5 M17 16V8',
      'Consommation figurant dans les données de test': 'M4 20h16 M7 16v-5 M12 16V5 M17 16V8',
    }
    if (tag === 'h3' && icons[text] && typeof document.createElementNS === 'function') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false')
      svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6')
      svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round')
      svg.style.width = '16px'; svg.style.height = '16px'; svg.style.flexShrink = '0'; svg.style.color = '#6e8178'
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', icons[text]); svg.append(path)
      element.prepend(svg); element.style.display = 'flex'; element.style.alignItems = 'center'; element.style.gap = '8px'
    }
    parent.append(element)
    return element
  }
  add(root, 'h2', replay ? 'Aperçu hors ligne du parcours' : data.abstain || empty ? 'Résultat de votre recherche' : 'Votre parcours de formation')
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
      const presentation = courseDisplayDetails(item.course, { replay, objective })
      card.setAttribute('data-course-code', item.course.code)
      if (label === 'Étapes recommandées') add(card, 'span', 'ÉTAPE ' + item.position).className = 'step-marker'
      const body = add(card, 'div', ''); body.className = 'course-body'
      const header = add(body, 'div', ''); header.className = 'course-header'
      if (typeof document.createElementNS === 'function') {
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('width', '25'); icon.setAttribute('height', '30'); icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('class', 'course-document-icon')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 15h6 M9 18h4')
        icon.append(path); header.append(icon)
      }
      const identity = add(header, 'div', ''); identity.className = 'course-identity'
      add(identity, 'span', item.course.code).className = 'course-code'
      add(identity, 'h4', item.course.title)
      if (label !== 'Étapes recommandées') add(identity, 'span', label === 'Pour information' ? 'Pour information · accès à vérifier' : 'Piste facultative').className = 'course-category'
      const metadata = add(body, 'div', ''); metadata.className = 'course-metadata'
      add(metadata, 'span', presentation.duration === 'Non renseignée' ? 'Durée non renseignée' : 'Durée : ' + presentation.duration)
      if (item.course.public) add(metadata, 'span', 'Public : ' + item.course.public)
      add(metadata, 'span', presentation.modality)
      const footer = add(body, 'div', ''); footer.className = 'course-footer'
      const rationale = add(footer, 'div', ''); rationale.className = 'course-rationale'
      add(rationale, 'strong', 'Pourquoi ce cours ?')
      add(rationale, 'p', item.rationale)
      const actions = add(footer, 'div', ''); actions.className = 'course-actions'
      if (presentation.versionNote) add(body, 'p', presentation.versionNote).className = 'course-version-note'
      const delivery = add(body, 'div', ''); delivery.className = 'course-delivery-notes'
      const mode = item.course.deliveryMode
      const modeLabels = {online:'en ligne',in_person:'en présentiel',hybrid:'hybride'}
      const known = mode && mode.value !== 'unknown'
      add(delivery, 'p', known ? 'Modalité indiquée dans l’intitulé : ' + modeLabels[mode.value] + '.'
        : 'Modalité du cours : non renseignée dans les données transmises.')
      if (preferredModality) add(delivery, 'p', 'Votre préférence : ' + preferredModality + '.')
      if (preferredModality && preferredModality !== 'Indifférent') {
        const preferred = preferredModality === 'En ligne' ? 'online' : 'in_person'
        add(delivery, 'p', !known ? 'Compatibilité avec votre préférence : non établie. Vérifiez la modalité sur la fiche officielle.'
          : mode.value === 'hybrid' ? 'Compatibilité à vérifier : une formation hybride peut comporter des séances en ligne et en présentiel.'
          : mode.value === preferred ? 'Modalité conforme à votre préférence selon l’intitulé ; vérifiez les conditions sur la fiche officielle.'
          : 'Écart avec votre préférence : la modalité indiquée pour ce cours est différente. Cette piste reste à comparer.')
      }
      const sessions = add(header, 'div', ''); sessions.className = 'session-availability'
      for (const status of presentation.statuses) {
        const badge = add(sessions, 'span', status.label)
        badge.className = 'session-badge ' + status.kind
        badge.setAttribute('data-session-kind', status.kind)
      }
      add(body, 'p', presentation.sessionNote).className = 'session-observed-on'
      if (item.course.sourceUrl) {
        const link = add(actions, 'a', 'Voir la fiche'); link.className = 'course-official-link'
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
      const metrics = add(root, 'div', '')
      metrics.className = 'duration-metrics'
      const metric = (label, value, tone = 'neutral') => {
        const card = add(metrics, 'div', '')
        card.className = 'duration-metric ' + tone
        add(card, 'p', label)
        add(card, 'strong', value)
      }
      if (duration.budgetHours != null) metric('Votre disponibilité', duration.budgetHours + ' h')
      const recommended = data.recommendedSteps ?? data.steps ?? []
      if (data.abstain || !recommended.length) {
        add(root, 'p', 'Aucun parcours proposé : durée non calculée.')
      } else {
        metric('Durée du parcours', duration.recommendedHours == null ? 'Non renseignée' : duration.recommendedHours + ' h')
        if (duration.excessHours > 0) {
          metric('Dépassement', '+ ' + duration.excessHours + ' h', 'warning')
          const warning = add(root, 'p', 'Le parcours dépasse le temps disponible.')
          warning.className = 'duration-notice warning'
        } else if (duration.withinBudget === true && duration.durationsKnown === true && duration.verified === true && duration.budgetVerified === true) {
          metric('Dépassement', 'Aucun', 'success')
          const notice = add(root, 'p', 'Le parcours respecte votre temps disponible.')
          notice.className = 'duration-notice success'
        }
      }
      if (duration.durationsKnown === false || duration.verified === false || duration.budgetVerified === false) {
        add(root, 'p', 'La vérification des durées est incomplète.')
      }
    }
  }
  const usage = data.usage?.total
  if (usage) {
    const diagnostics = add(root, 'details', ''); diagnostics.className = 'result-diagnostics'; diagnostics.hidden = true
    add(diagnostics, 'summary', 'Détails techniques du résultat')
    add(diagnostics, 'h3', replay ? 'Consommation figurant dans les données de test' : 'Consommation renvoyée par le moteur')
    if (usage.input !== undefined) add(diagnostics, 'p', 'Tokens d’entrée : ' + usage.input)
    if (usage.output !== undefined) add(diagnostics, 'p', 'Tokens de sortie : ' + usage.output)
    if (usage.cost !== undefined) add(diagnostics, 'p', 'Coût calculé par le backend : ' + usage.cost + ' USD')
    else add(diagnostics, 'p', 'Coût non disponible.')
  }
  add(root, 'p', 'Vérifie les conditions d’accès et les prérequis sur la fiche officielle. La pertinence d’une formation ne garantit pas son accessibilité.')
  return root
}

export const SEARCH_RESULT_NOTE='Formation retenue par la recherche du catalogue. Consultez la fiche officielle pour vérifier son contenu et ses conditions d’accès.'
import {readCatalogueVersion} from './catalogue-version.mjs'
// Contrat de résultat partagé entre le transport serveur et l’affichage. Aucun accès réseau.
export class PathwayAdapterError extends Error {
  constructor(code, message, status) {
    super(message)
    this.name = 'PathwayAdapterError'
    this.code = code
    if (status !== undefined) this.status = status
  }
}

function fail(code, message, status) {
  throw new PathwayAdapterError(code, message, status)
}

function officialLink(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'outils.ge.ch' &&
      !url.username && !url.password && !url.port && url.pathname.startsWith('/referentiel/formation/')
  } catch { return false }
}

export function validatePathwayResult(data) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value)
  const text = value => typeof value === 'string' && value.trim().length > 0
  if (!object(data) || data.ok !== true || !text(data.summary) ||
      (!Array.isArray(data.recommendedSteps) && !Array.isArray(data.steps))) {
    fail('invalid_response', 'Reponse parcours non conforme')
  }
  if(data.catalogue!==undefined&&!readCatalogueVersion(data.catalogue))fail('invalid_response','Version du catalogue invalide')
  let count = 0
  for (const category of ['recommendedSteps', 'steps', 'optionalSteps', 'informationalCourses']) {
    if (data[category] === undefined) continue
    if (!Array.isArray(data[category])) fail('invalid_response', 'Categorie de recommandations invalide')
    for (const item of data[category]) {
      if (!object(item) || !object(item.course) || !text(item.course.code) || !text(item.course.title) ||
          !Number.isInteger(item.position) || item.position < 1 || !text(item.rationale)) {
        fail('invalid_response', 'Formation retournee non conforme')
      }
      if (item.course.sourceUrl != null && !officialLink(item.course.sourceUrl)) {
        fail('invalid_response', 'Lien de formation non autorise')
      }
      if (item.course.deliveryMode !== undefined) {
        const mode = item.course.deliveryMode
        if (!object(mode) || !['online','in_person','hybrid','unknown'].includes(mode.value) ||
            (mode.value === 'unknown' ? mode.sourceField !== null || mode.evidence !== null
              : mode.sourceField !== 'titleRaw' || mode.evidence !== item.course.title)) {
          fail('invalid_response', 'Preuve de modalite invalide')
        }
      }
      if (item.course.sessionAvailability !== undefined) {
        const availability = item.course.sessionAvailability
        const date = availability?.observedOn
        const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
          Number.isFinite(Date.parse(date + 'T12:00:00Z')) && new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) === date
        const known = object(availability) && availability.source === 'official-session-icons' && validDate &&
          typeof availability.hasOpenSession === 'boolean' && typeof availability.hasScheduledSession === 'boolean'
        const unknown = object(availability) && availability.source === null && date === null &&
          availability.hasOpenSession === null && availability.hasScheduledSession === null
        if (!known && !unknown) fail('invalid_response', 'Indicateurs de sessions invalides')
        if (availability.scheduledOpeningDates !== undefined) {
          const dates = availability.scheduledOpeningDates
          if (!known || !availability.hasScheduledSession || !Array.isArray(dates) || dates.length > 100 || dates.some((value, index) =>
            typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(Date.parse(value + 'T12:00:00Z')) || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value ||
            value <= date || (index > 0 && dates[index - 1] >= value))) {
            fail('invalid_response', 'Dates d’ouverture invalides')
          }
        }

      }
      for (const field of ['duration', 'public']) {
        if (item.course[field] != null && typeof item.course[field] !== 'string') {
          fail('invalid_response', 'Description de formation invalide')
        }
      }
      if (item.course.durationHours != null &&
          (typeof item.course.durationHours !== 'number' || !Number.isFinite(item.course.durationHours) || item.course.durationHours < 0)) {
        fail('invalid_response', 'Duree de formation invalide')
      }
    }
    count += data[category].length
  }
  if (data.gaps !== undefined && (!Array.isArray(data.gaps) || data.gaps.some(gap => typeof gap !== 'string'))) {
    fail('invalid_response', 'Limites du catalogue non conformes')
  }
  if ((data.abstain !== undefined && typeof data.abstain !== 'boolean') ||
      (data.mode !== undefined && !text(data.mode)) ||
      (data.interpretedGoal !== undefined && typeof data.interpretedGoal !== 'string')) {
    fail('invalid_response', 'Metadonnees du parcours invalides')
  }
  if (data.durationSummary !== undefined) {
    const duration = data.durationSummary
    if (!object(duration)) fail('invalid_response', 'Synthese des durees invalide')
    for (const name of ['budgetHours', 'recommendedHours', 'excessHours']) {
      if (duration[name] != null && (typeof duration[name] !== 'number' || !Number.isFinite(duration[name]) || duration[name] < 0)) {
        fail('invalid_response', 'Synthese des durees invalide')
      }
    }
    for (const name of ['verified', 'durationsKnown', 'budgetVerified', 'withinBudget']) {
      if (duration[name] != null && typeof duration[name] !== 'boolean') fail('invalid_response', 'Verification des durees invalide')
    }
  }
  if (data.usage !== undefined) {
    if (!object(data.usage)) fail('invalid_response', 'Mesures de consommation invalides')
    for (const name of ['pass1', 'pass2', 'total']) {
      const usage = data.usage[name]
      if (usage == null) continue
      if (!object(usage)) fail('invalid_response', 'Mesures de consommation invalides')
      for (const field of ['input', 'output', 'cached', 'written', 'uncached', 'cost']) {
        const value = usage[field]
        if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
            (field !== 'cost' && !Number.isSafeInteger(value)))) fail('invalid_response', 'Mesures de consommation invalides')
      }
    }
  }
  // Ne pas aplatir les categories, remplacer les liens ou completer les formations.
  return { mode: 'historical-pathway', empty: count === 0, result: data }
}



// Call only after validatePathwayResult; these dates are official metadata, never model prose.
export function scheduledOpeningLabel(availability, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const next = availability?.scheduledOpeningDates?.find(date => date >= today)
  if (!next) return 'Ouverture programmée signalée'
  const date = new Intl.DateTimeFormat('fr-CH', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(next + 'T12:00:00Z'))
  return 'Ouverture des inscriptions prévue le ' + date
}

// Présentation partagée écran/PDF, sans ajout ni classement de formations.
export function courseDisplayDetails(course, { replay = false, now = new Date(), objective = '' } = {}) {
  const modes = { online: 'En ligne', in_person: 'Présentiel', hybrid: 'Hybride' }
  const availability = course.sessionAvailability
  const known = !replay && availability?.source === 'official-session-icons' && availability.observedOn <= now.toISOString().slice(0, 10)
  const statuses = []
  if (known && availability.hasOpenSession) statuses.push({ kind: 'open', label: 'Inscriptions ouvertes' })
  if (known && availability.hasScheduledSession) {
    const full = scheduledOpeningLabel(availability, now)
    statuses.push({ kind: 'scheduled', label: full === 'Ouverture programmée signalée' ? 'Ouverture programmée' : full })
  }
  if (!statuses.length) statuses.push({ kind: 'unknown', label: 'Disponibilité à vérifier' })
  const sessionNote = known
    ? 'Indicateurs relevés le ' + availability.observedOn.split('-').reverse().join('/') + '. Vérifiez la situation actuelle et les conditions sur la fiche officielle.'
    : 'Disponibilité des sessions : à vérifier sur la fiche officielle.'
  let versionNote = ''
  const products = ['Word', 'Excel', 'PowerPoint', 'Outlook', 'Access']
  for (const product of products) {
    const expression = new RegExp('\\b' + product + '(?:\\s+version)?\\s+(2010|2013|2016|2019|2021|2024|365)\\b', 'ig')
    const requested = [...String(objective).matchAll(expression)].map(match => match[1])
    const offered = [...course.title.matchAll(expression)].map(match => match[1])
    if (new Set(requested).size === 1 && new Set(offered).size === 1 && requested[0] !== offered[0]) {
      versionNote = 'Version différente : ' + product + ' ' + offered[0] + '. Votre demande mentionne ' + product + ' ' + requested[0] + '. Vérifiez les écarts sur la fiche officielle.'
      break
    }
  }
  return {
    duration: course.duration || (course.durationHours == null ? 'Non renseignée' : course.durationHours + ' h'),
    modality: modes[course.deliveryMode?.value] || 'Modalité à vérifier',
    statuses, sessionNote, versionNote,
  }
}

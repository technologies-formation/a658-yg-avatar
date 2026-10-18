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


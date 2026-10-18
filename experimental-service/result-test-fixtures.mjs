// Données synthétiques pour les tests et le contrôle visuel. Aucun cours réel recommandé.
export const item = (code, position = 1) => ({ position, rationale: 'Justification de test', course: {
  code, title: 'Formation synthétique — test d’affichage', duration: '2 jours', durationHours: 16,
  public: 'Public de test', sourceUrl: 'https://outils.ge.ch/referentiel/formation/test-affichage',
} })
export const data = () => ({ ok: true, summary: 'Synthèse de test', recommendedSteps: [item('TEST-1')],
  optionalSteps: [item('TEST-2')], informationalCourses: [item('TEST-3')], gaps: ['Limite de test'],
  durationSummary: { budgetHours: 8, recommendedHours: 16, excessHours: 8, withinBudget: false },
  usage: { total: { input: 100, output: 20, cost: 0.00123 } },
})


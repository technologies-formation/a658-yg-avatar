// Limites partagees avec le simulateur. Aucune conversion de nomenclature.
export const PROFILE_FIELD_LIMITS = Object.freeze({
  personnelCategory: 80,
  entity: 120,
  managerStatus: 120,
  role: 300,
  objective: 1000,
  existingSkills: 1000,
  timeAvailable: 300,
  constraints: 1000,
})

export function validateProfileFields(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return 'Profil invalide'
  for (const [field, limit] of Object.entries(PROFILE_FIELD_LIMITS)) {
    if (profile[field] === undefined) continue
    if (typeof profile[field] !== 'string' || profile[field].length > limit) return 'Champ invalide : ' + field
  }
  if (!profile.role?.trim() || !profile.objective?.trim()) return 'Fonction et objectif obligatoires'
  if (profile.role.trim().length < 2) return 'Fonction trop courte'
  if (profile.objective.trim().length < 10) return 'Objectif trop court'
  return null
}

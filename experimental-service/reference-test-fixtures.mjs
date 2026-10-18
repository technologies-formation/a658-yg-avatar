// Données synthétiques de contrat, jamais un référentiel métier de remplacement.
import { createHash } from 'node:crypto'

export function references(change = () => {}) {
  const text = maxLength => ({ type: 'string', maxLength, requiredInApi: false, requiredInForm: false, formControl: 'text' })
  const fields = {
    personnelCategory: { ...text(80), requiredInForm: true, formControl: 'select', options: [
      { value: 'TEST-A', label: 'Groupe de test A' }, { value: 'TEST-B', label: 'Groupe de test B' },
    ] },
    entity: { ...text(120), allowCustom: true, suggestions: [{ value: 'TEST-ENTITY', label: 'Entité de test' }] },
    managerStatus: { ...text(120), formControl: 'select', options: [{ value: 'TEST-MANAGER', label: 'Situation de test' }] },
    role: { ...text(300), requiredInApi: true, requiredInForm: true, formControl: 'textarea' },
    objective: { ...text(1000), requiredInApi: true, requiredInForm: true, formControl: 'textarea' },
    existingSkills: { ...text(1000), formControl: 'textarea' }, timeAvailable: text(300),
    constraints: { ...text(1000), formControl: 'textarea' },
  }
  const value = { schemaVersion: 1, pathway: { scope: 'pathway', apiValidation: {
    trimBeforeLengthCheck: true, optionalNull: 'omit', optionalBlank: 'omit',
    unknownFields: 'ignore', enforceOptions: false,
  }, fields } }
  change(value)
  value.revision = createHash('sha256').update(JSON.stringify({ schemaVersion: value.schemaVersion, pathway: value.pathway })).digest('hex')
  return value
}

export function referenceResponse(value = references()) {
  return new Response(JSON.stringify(value), { headers: {
    'Content-Type': 'application/json', ETag: '"' + value.revision + '"',
  } })
}

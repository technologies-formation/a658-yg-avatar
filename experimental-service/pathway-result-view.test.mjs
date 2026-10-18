import test from 'node:test'
import assert from 'node:assert/strict'
import { renderPathwayResult } from './pathway-result-view.mjs'
import { createLocalDemo } from './local-demo.mjs'
import { data, item } from './result-test-fixtures.mjs'
import { references } from './reference-test-fixtures.mjs'

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = '' }
  append(child) { this.children.push(child) }
  setAttribute(key, value) { this[key] = value }
}
const document = { createElement: tag => new Element(tag) }
const descendants = root => [root, ...root.children.flatMap(descendants)]
const text = root => descendants(root).map(x => x.textContent).join('\n')

test('affichage : rubriques distinctes, ordre, durées, public et mesures sans modification', () => {
  const value = data(), before = structuredClone(value)
  const view = renderPathwayResult(document, value, { replay: true })
  const content = text(view)
  assert.deepEqual(value, before)
  assert.match(content, /Données de test/)
  assert.match(content, /elles ne répondent pas à ton profil/)
  assert.deepEqual(descendants(view).filter(x => x.tag === 'h3').slice(0, 3).map(x => x.textContent),
    ['Étapes recommandées', 'Compléments', 'Pour information'])
  assert.match(content, /Durée : 2 jours/)
  assert.match(content, /Public : Public de test/)
  assert.match(content, /Dépassement : 8 h/)
  assert.match(content, /Tokens d’entrée : 100/)
  assert.match(content, /0.00123 USD/)
  assert.match(content, /ne garantit pas son accessibilité/)
  const link = descendants(view).find(x => x.tag === 'a')
  assert.equal(link.rel, 'noopener noreferrer')
  assert.equal(link.href, value.recommendedSteps[0].course.sourceUrl)
})

test('affichage : anciens steps, abstention, résultat vide, valeurs inconnues et coût absent', () => {
  const value = { ok: true, summary: 'Vide', steps: [], abstain: true, gaps: ['Pas de correspondance'], usage: { total: {} }, durationSummary: { verified: false } }
  assert.match(text(renderPathwayResult(document, value)), /ne propose pas de parcours adapté/)
  assert.match(text(renderPathwayResult(document, value)), /Coût non disponible/)
  assert.match(text(renderPathwayResult(document, value)), /vérification des durées est incomplète/)
  const unknown = item('TEST-4'); delete unknown.course.duration; delete unknown.course.durationHours
  assert.match(text(renderPathwayResult(document, { ok: true, summary: 'Ancien format', steps: [unknown] })), /Durée non renseignée/)
  assert.match(text(renderPathwayResult(document, { ...value, abstain: false })), /Aucune formation proposée/)
})

test('affichage : texte hostile littéral et liens ou mesures invalides refusés avant rendu', () => {
  const value = data(); value.summary = '<img src=x onerror=alert(1)>'
  assert.match(text(renderPathwayResult(document, value)), /<img src=x onerror=alert\(1\)>/)
  assert.equal(descendants(renderPathwayResult(document, value)).some(x => x.tag === 'img'), false)
  for (const link of ['javascript:alert(1)', 'https://outils.ge.ch.evil.invalid/referentiel/formation/a', 'https://evil.invalid/']) {
    value.recommendedSteps[0].course.sourceUrl = link
    assert.throws(() => renderPathwayResult(document, value), error => error.code === 'invalid_response')
  }
  value.recommendedSteps[0] = item('TEST-5'); value.usage.total.cost = -1
  assert.throws(() => renderPathwayResult(document, value), error => error.code === 'invalid_response')
})

test('aperçu local explicitement configuré : uniquement après validation parcours, jamais en recherche', async t => {
  const contract = references(), preview = data()
  const port = 19000 + Math.floor(Math.random() * 20000)
  const { server, origin } = createLocalDemo({ port, stateFile: '', profileReferences: contract, pathwayPreview: preview })
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const body = { type: 'pathway', profile: { personnelCategory: 'TEST-A', role: 'x', objective: 'y' }, confirmed: true, referenceRevision: contract.revision }
  const post = value => fetch(origin + '/local/validate', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  preview.summary = 'Mutation externe'
  const result = await (await post(body)).json()
  assert.equal(result.preview.summary, 'Synthèse de test')
  assert.equal((await (await post({ ...body, type: 'search', query: 'x' })).json()).preview, undefined)
  assert.equal((await (await post({ ...body, confirmed: false })).json()).preview, undefined)
  assert.equal((await fetch(origin + '/local/pathway-result-view.mjs')).status, 200)
  assert.equal((await fetch(origin + '/local/pathway-result.mjs')).status, 200)
  assert.match(await (await fetch(origin)).text(), /renderPathwayResult/)
})

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
  assert.match(content, /Exemple fictif : les durées des cours ne sont pas comparées/)
  assert.doesNotMatch(content, /Temps disponible :|Dépassement :|Le parcours dépasse/)
  const real = text(renderPathwayResult(document, value))
  assert.match(real, /Votre disponibilité\n8 h/)
  assert.match(real, /Dépassement\n\+ 8 h/)
  assert.match(real, /Ce parcours pourrait nécessiter plus de temps/)
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
  assert.equal((await fetch(origin + '/local/catalogue-version.mjs')).status, 200)
  assert.match(await (await fetch(origin)).text(), /renderPathwayResult/)
})


test('modalité du cours distincte de la préférence : inconnue, conforme, différente et hybride', () => {
  for (const [mode, message] of [
    [undefined,/Compatibilité avec votre préférence : non établie/],
    [{value:'unknown',sourceField:null,evidence:null},/Compatibilité avec votre préférence : non établie/],
    [{value:'online',sourceField:'titleRaw'},/Modalité conforme à votre préférence/],
    [{value:'in_person',sourceField:'titleRaw'},/Écart avec votre préférence/],
    [{value:'hybrid',sourceField:'titleRaw'},/une formation hybride peut comporter/],
  ]) {
    const value=data(),course=value.recommendedSteps[0].course
    if(mode)course.deliveryMode={...mode,...(mode.value==='unknown'?{}:{evidence:course.title})}
    const before=structuredClone(value)
    const content=text(renderPathwayResult(document,value,{preferredModality:'En ligne'}))
    assert.match(content,/Votre préférence : En ligne/);assert.match(content,message);assert.deepEqual(value,before)
    if(!mode||mode.value==='unknown')assert.match(content,/Modalité du cours : non renseignée/)
  }
  const indifferent=text(renderPathwayResult(document,data(),{preferredModality:'Indifférent'}))
  assert.doesNotMatch(indifferent,/Compatibilité avec votre préférence|Écart avec votre préférence/)
  const invalid=data();invalid.recommendedSteps[0].course.deliveryMode={value:'online',sourceField:'model',evidence:'Sans preuve'}
  assert.throws(()=>renderPathwayResult(document,invalid),e=>e.code==='invalid_response')
})

test('sessions : indicateurs officiels datés, deux statuts simultanés, aucune affirmation en simulation ou sans preuve',()=>{
 const value=data(),availability={hasOpenSession:true,hasScheduledSession:true,observedOn:'2026-10-23',source:'official-session-icons'}
 value.recommendedSteps[0].course.sessionAvailability=availability
 const before=structuredClone(value),view=renderPathwayResult(document,value),content=text(view)
 assert.match(content,/Inscriptions ouvertes/);assert.match(content,/Ouverture programmée/);assert.match(content,/Indicateurs relevés le 23\/10\/2026/);assert.match(content,/Vérifiez la situation actuelle/)
 assert.equal(descendants(view).filter(e=>e.className==='session-badge open'||e.className==='session-badge scheduled').length,2);assert.deepEqual(value,before)
 const replay=text(renderPathwayResult(document,value,{replay:true}));assert.doesNotMatch(replay,/Inscriptions ouvertes|Ouverture programmée/);assert.match(replay,/Disponibilité des sessions : à vérifier/)
 for(const source of [undefined,{...availability,hasOpenSession:false,hasScheduledSession:false},{hasOpenSession:null,hasScheduledSession:null,observedOn:null,source:null},{...availability,observedOn:'2999-01-01'}]){
  const result=data();if(source)result.recommendedSteps[0].course.sessionAvailability=source
  const rendered=text(renderPathwayResult(document,result));assert.doesNotMatch(rendered,/Inscriptions ouvertes|Ouverture programmée/);assert.match(rendered,/Disponibilité des sessions : à vérifier/)
 }
})
test('sessions : types, provenance et dates incohérentes refusés sans afficher un statut inventé',()=>{
 for(const availability of [{hasOpenSession:true,hasScheduledSession:false,observedOn:'2026-02-30',source:'official-session-icons'},{hasOpenSession:'true',hasScheduledSession:false,observedOn:'2026-10-23',source:'official-session-icons'},{hasOpenSession:true,hasScheduledSession:false,observedOn:'2026-10-23',source:'model'},null]){
  const value=data();value.recommendedSteps[0].course.sessionAvailability=availability
  assert.throws(()=>renderPathwayResult(document,value),e=>e.code==='invalid_response')
 }
})


test('durée : absence de parcours, dépassement et conformité vérifiée restent distincts', () => {
  const value = data()
  value.durationSummary = { budgetHours: 40, recommendedHours: 0, excessHours: 0, withinBudget: true, durationsKnown: true, verified: true, budgetVerified: true }
  const absent = { ...value, recommendedSteps: [], optionalSteps: [], informationalCourses: [], abstain: true }
  const content = text(renderPathwayResult(document, absent))
  assert.match(content, /Votre disponibilité\n40 h/)
  assert.match(content, /Aucun parcours proposé : durée non calculée/)
  assert.doesNotMatch(content, /Durée du parcours|Dépassement|respecte votre temps/)
  value.durationSummary.recommendedHours = 16
  assert.match(text(renderPathwayResult(document, value)), /Le parcours respecte votre temps disponible/)
  value.durationSummary.verified = false
  assert.doesNotMatch(text(renderPathwayResult(document, value)), /Le parcours respecte votre temps disponible/)
  assert.match(text(renderPathwayResult(document, value)), /vérification des durées est incomplète/)
})


test('sessions : date d’ouverture future distincte du début, conservée et ignorée en simulation',()=>{
 const value=data()
 value.recommendedSteps[0].course.sessionAvailability={hasOpenSession:true,hasScheduledSession:true,observedOn:'2026-10-23',source:'official-session-icons',scheduledOpeningDates:['2998-11-03']}
 const before=structuredClone(value)
 const result=text(renderPathwayResult(document,value))
 assert.match(result,/Inscriptions ouvertes/)
 assert.match(result,/Ouverture des inscriptions prévue le 3 novembre 2998/)
 assert.deepEqual(value,before)
 assert.doesNotMatch(text(renderPathwayResult(document,value,{replay:true})),/3 novembre 2998/)
 for(const dates of [['2026-02-30'],['2026-10-22'],['2998-11-03','2998-11-03'],['2999-01-01','2998-11-03'],['<script>'],null]){
  value.recommendedSteps[0].course.sessionAvailability.scheduledOpeningDates=dates
  assert.throws(()=>renderPathwayResult(document,value))
 }
})

test('versions : écart explicite du même logiciel, sans équivalence ni exclusion et sans déduction ambiguë', async () => {
  const {courseDisplayDetails}=await import('./pathway-result.mjs')
  const course={...item('TEST-VERSION').course,title:'Word 365 Longs documents'}
  const before=structuredClone(course)
  const notice=courseDisplayDetails(course,{objective:'Structurer mes rapports Word 2016'}).versionNote
  assert.match(notice,/Version différente : Word 365/)
  assert.match(notice,/Vérifiez les écarts/)
  assert.doesNotMatch(notice,/équivalent|incompatible|exclu/)
  for(const objective of ['Structurer mes rapports','Excel 2016','Word 365','Word 2016 ou Word 365'])assert.equal(courseDisplayDetails(course,{objective}).versionNote,'')
  assert.deepEqual(course,before)
})


test('le présentiel présumé est distinct de la preuve et ne confirme pas la préférence',()=>{
  const value=data(),before=structuredClone(value)
  value.recommendedSteps[0].course.deliveryMode={value:'in_person',sourceField:'catalogue-default',evidence:null}
  const content=text(renderPathwayResult(document,value,{preferredModality:'Présentiel'}))
  assert.match(content,/Présentiel présumé/)
  assert.match(content,/en l’absence de mention de modalité dans le titre ou le descriptif/)
  assert.doesNotMatch(content,/Modalité conforme|indiquée dans l’intitulé/)
  assert.deepEqual(value.recommendedSteps[0].course.code,before.recommendedSteps[0].course.code)
  const bad=data();bad.recommendedSteps[0].course.deliveryMode={value:'online',sourceField:'catalogue-default',evidence:null}
  assert.throws(()=>renderPathwayResult(document,bad),error=>error.code==='invalid_response')
})

test('modalité explicitée dans le descriptif et temps de planification : aucun cours retiré',()=>{
  const value=data()
  value.recommendedSteps[0].course.deliveryMode={value:'online',sourceField:'generalInformation',evidence:'Cette formation est en ligne'}
  const before=structuredClone(value)
  const content=text(renderPathwayResult(document,value,{preferredModality:'En ligne'}))
  assert.match(content,/Modalité indiquée dans le descriptif : en ligne/)
  assert.match(content,/repère de planification/)
  assert.match(content,/étaler le parcours/)
  assert.match(content,/votre hiérarchie/)
  assert.deepEqual(value,before)
})


test('fiches : appréciation expliquée, offre et organisateur officiels, anciens résultats sans score inventé',()=>{
 const value=data(),item=value.recommendedSteps[0];item.relevance={level:'partial',reason:'Le type de cockpit reste à préciser.'};item.course.catalogueOffers=['OPE'];item.course.organizingEntity='Centre officiel de test';
 const before=structuredClone(value),rendered=text(renderPathwayResult(document,value));
 for(const label of ['Correspondance partielle','Le type de cockpit reste à préciser.','Offre de formation','OPE','Entité organisatrice','Centre officiel de test'])assert.ok(rendered.includes(label));
 assert.deepEqual(value,before);assert.doesNotMatch(rendered,/87 %/);
 delete item.relevance;delete item.course.catalogueOffers;delete item.course.organizingEntity;
 const old=text(renderPathwayResult(document,value));assert.match(old,/Correspondance à préciser/);assert.match(old,/Non renseignée/);
 item.relevance={level:'direct',reason:''};assert.throws(()=>renderPathwayResult(document,value),e=>e.code==='invalid_response');
});

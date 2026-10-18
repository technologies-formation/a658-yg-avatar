// Execute le vrai script dans un DOM minimal, sans dependance ni navigateur.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createLocalDemo } from './local-demo.mjs'
import { createGuard } from './server.mjs'
import { references } from './reference-test-fixtures.mjs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.className = ''; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; this.listeners = {} }
  append(child) { child.parentElement = this; this.children.push(child) }
  replaceChildren() { for (const child of [...this.children]) child.remove() }
  remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this) }
  setAttribute(name, value) { this[name] = value }
  addEventListener(name, callback) { this.listeners[name] = callback }
  focus() { this.focused = true }
  querySelectorAll(selector) {
    const matches = child => selector.startsWith('.') ? child.className.split(' ').includes(selector.slice(1)) : selector === '[type="submit"]' ? child.type === 'submit' : child.tag === selector
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)])
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
  click() { if (!this.disabled && !this.hidden) this.onclick?.() }
}

function questionnaire(page = html, fetch = () => { throw new Error('Envoi inattendu') }, storage = new Map()) {
  const ids = Object.fromEntries(['chat', 'form', 'input', 'reset', 'details'].map(id => [id, new Element()]))
  const root = new Element(); root.append(ids.form);
  const send = new Element('button'); send.type = 'submit'; ids.form.append(ids.input); ids.form.append(send)
  for (const key of ['profile', 'entity', 'manager', 'intent', 'role', 'objective', 'skills', 'time', 'constraints']) {
    const fact = new Element(), label = new Element('span'), value = new Element('strong')
    label.textContent = key; fact.append(label); fact.append(value); ids['sum-' + key] = value; ids['fact-' + key] = fact
  }
  const document = { querySelector: selector => ids[selector.slice(1)], getElementById: id => ids[id], createElement: tag => new Element(tag) }
  runInNewContext(page.match(/<script>([\s\S]*?)<\/script>/)[1], { document, matchMedia: () => ({ matches: false }), fetch, AbortSignal, sessionStorage: {getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key)} })
  const buttons = () => ids.chat.querySelectorAll('.choices').flatMap(row => row.children)
  return {
    ids, send, buttons, storage,
    refreshChoices: () => root.querySelectorAll('button').find(button => button.textContent === 'Actualiser les choix').onclick(),
    referenceStatus: () => root.querySelector('p').textContent,
    value: key => ids['sum-' + key].textContent,
    edit: key => ids['sum-' + key].parentElement.querySelector('button').click(),
    submit: value => { ids.input.value = value; ids.form.listeners.submit({ preventDefault() {} }) },
    cancel: () => ids.form.children.find(child => child.textContent === 'Annuler').click(),
    choose: text => { const button = buttons().find(button => button.textContent === text); assert.ok(button, text); button.click() },
    messages: () => ids.chat.children.map(child => child.textContent).join('\n'),
    results: () => ids.chat.querySelectorAll('.simulation'),
  }
}

function begin(app) { app.buttons()[0].click(); app.choose('Construire un parcours'); app.submit('Conseiller') }
function complete(app) { begin(app); app.submit('Apprendre la gestion de projet'); app.choose('Quelques bases'); app.choose('1 à 2 jours'); app.choose('Aucune') }

test('correction en cours : pre remplissage, conservation et reprise avec le brouillon', () => {
  const app = questionnaire(); begin(app)
  app.ids.input.value = 'Mon objectif en cours'
  app.edit('role')
  assert.equal(app.ids.input.value, 'Conseiller')
  assert.equal(app.send.textContent, 'Enregistrer')
  app.edit('profile') // Une seule correction a la fois.
  assert.equal(app.ids.input.value, 'Conseiller')
  app.submit('Responsable formation')
  assert.equal(app.value('role'), 'Responsable formation')
  assert.equal(app.value('intent'), 'Parcours de formation')
  assert.equal(app.ids.input.value, 'Mon objectif en cours')
  assert.match(app.messages(), /Quel objectif souhaites-tu atteindre \?$/)
  app.submit('Apprendre la gestion de projet')
  assert.equal(app.value('objective'), 'Apprendre la gestion de projet')
})

test('questionnaire référencé : choix du contrat, huit champs et corrections sans nouvel envoi', async () => {
  const contract = references()
  const port = 19000 + Math.floor(Math.random() * 20000)
  const { server, origin, guard } = createLocalDemo({ port, stateFile: '', profileReferences: contract })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  try {
    const page = await (await fetch(origin)).text()
    const payloads = [], requests = []
    const localFetch = (url, options) => {
      payloads.push(JSON.parse(options.body))
      const request = fetch(origin + url, { ...options, headers: { ...options.headers, Origin: origin } })
      requests.push(request)
      return request
    }
    const app = questionnaire(page, localFetch)
    app.choose('Groupe de test A')
    app.choose('Entité de test'); app.choose('Situation de test'); app.choose('Construire un parcours')
    app.submit('x'); app.submit('y')
    app.choose('Quelques bases'); app.choose('1 à 2 jours'); app.choose('Aucune')
    assert.equal(payloads.length, 0)
    app.choose('Confirmer le profil et simuler')
    assert.equal(payloads.length, 1)
    assert.equal((await requests[0]).status, 200)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(payloads[0].referenceRevision, contract.revision)
    assert.deepEqual(payloads[0].profile, {
      personnelCategory: 'TEST-A', entity: 'TEST-ENTITY', managerStatus: 'TEST-MANAGER',
      role: 'x', objective: 'y', existingSkills: 'Quelques bases', timeAvailable: '1 à 2 jours', constraints: 'Aucune',
    })
    app.edit('entity'); app.submit('Mon service libre')
    assert.equal(app.value('role'), 'x')
    assert.equal(payloads.length, 1)
    app.choose('Confirmer le profil et simuler')
    assert.equal(payloads[1].profile.entity, 'Mon service libre')
    assert.equal((await requests[1]).status, 200)
    assert.equal(guard.status().total, 2)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('questionnaire référencé : champs facultatifs laissés vides, champs courts et limites dynamiques', async () => {
  const contract = references(x => { x.pathway.fields.role.maxLength = 5 })
  const port = 19000 + Math.floor(Math.random() * 20000)
  const { server, origin } = createLocalDemo({ port, stateFile: '', profileReferences: contract })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  try {
    const page = await (await fetch(origin)).text()
    let payload
    const app = questionnaire(page, async (_url, options) => {
      payload = JSON.parse(options.body)
      return { ok: true, json: async () => ({ message: 'Simulation', quota: { total: 1, maxTotalRequests: 20 } }) }
    })
    app.choose('Groupe de test B')
    assert.equal(app.ids.input.required, false)
    app.submit(''); app.submit(''); app.choose('Construire un parcours')
    app.submit('x'); app.submit('y'); app.submit(''); app.submit(''); app.submit('')
    assert.equal(payload, undefined)
    app.choose('Confirmer le profil et simuler')
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(payload.profile, { personnelCategory: 'TEST-B', role: 'x', objective: 'y' })
    app.edit('role'); assert.equal(app.ids.input.maxLength, 5)
    app.submit('123456'); assert.equal(app.value('role'), 'x'); app.cancel()
    assert.equal(app.value('objective'), 'y')
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('annulation et correction invalide conservent la reponse et la simulation', () => {
  const app = questionnaire(); complete(app)
  const result = app.results()[0]
  app.edit('role'); app.submit('x')
  assert.equal(app.value('role'), 'Conseiller')
  assert.equal(app.send.textContent, 'Enregistrer')
  app.cancel()
  assert.equal(app.value('role'), 'Conseiller')
  assert.equal(app.results()[0], result)
  assert.equal(app.send.textContent, 'Envoyer')
  assert.ok(app.buttons().some(button => button.textContent === 'Nouvelle demande'))
})

test('correction apres la fin : autres reponses conservees, ancien resultat invalide', () => {
  const app = questionnaire(); complete(app)
  const keys = ['profile', 'intent', 'role', 'skills', 'time', 'constraints']
  const before = keys.map(key => app.value(key))
  app.edit('objective'); app.submit('Approfondir la communication en equipe')
  assert.deepEqual(keys.map(key => app.value(key)), before)
  assert.equal(app.results().length, 0)
  assert.equal(app.value('objective'), 'Approfondir la communication en equipe')
  app.choose('Actualiser la simulation')
  assert.match(app.results()[0].textContent, /Approfondir la communication en equipe/)
})

test('les choix en correction pre remplissent sans enregistrer ; groupe et type corrigibles', () => {
  const app = questionnaire(); complete(app)
  const profile = app.value('profile')
  app.edit('profile'); app.buttons()[1].click()
  assert.equal(app.value('profile'), profile)
  app.submit(app.ids.input.value)
  assert.match(app.value('profile'), /Personnel enseignant/)
  app.edit('intent'); app.submit('n importe quoi')
  assert.equal(app.value('intent'), 'Parcours de formation')
  app.choose('Trouver une formation'); app.submit(app.ids.input.value)
  assert.equal(app.value('intent'), 'Recherche de formation')
  app.choose('Actualiser la simulation')
  assert.match(app.results()[0].textContent, /"query": "PE/)
})

test('limites de validation partagees entre saisie et correction', () => {
  const app = questionnaire(); complete(app)
  for (const [key, invalid] of [['role', 'x'.repeat(301)], ['objective', 'court'], ['time', 'x'.repeat(301)], ['skills', 'x'.repeat(1001)], ['constraints', '']]) {
    const previous = app.value(key)
    app.edit(key); app.submit(invalid)
    assert.equal(app.value(key), previous)
    assert.equal(app.send.textContent, 'Enregistrer')
    app.cancel()
  }
})

test('reinitialisation pendant une correction efface les reponses et le mode edition', () => {
  const app = questionnaire(); complete(app); app.edit('objective'); app.ids.reset.click()
  for (const key of ['profile', 'intent', 'role', 'objective', 'skills', 'time', 'constraints']) {
    assert.equal(app.value(key), 'À préciser')
    assert.equal(app.ids['sum-' + key].parentElement.querySelector('button').hidden, true)
  }
  assert.equal(app.ids.input.value, '')
  assert.equal(app.send.textContent, 'Envoyer')
  assert.equal(app.results().length, 0)
  complete(app)
  assert.equal(app.results().length, 1)
})

test('mode local : aucun envoi ni quota en correction ; reponses tardives ignorees', async () => {
  // Serveur et quotas uniquement en memoire, aucune ecriture dans le profil utilisateur.
  const port = 19000 + Math.floor(Math.random() * 20000)
  const { server, origin } = createLocalDemo({ port, stateFile: '' })
  const token = 'questionnaire-test-token-at-least-32-characters'
  const guard = createGuard({ token })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  try {
    const page = await (await fetch(origin)).text()
    const pending = [], payloads = []
    const localFetch = (url, options) => {
      assert.equal(url, '/local/validate')
      payloads.push(JSON.parse(options.body))
      const result = guard.check(token, payloads.at(-1))
      assert.equal(result.status, 200)
      return new Promise(resolve => pending.push(() => resolve({ ok: true, json: async () => result })))
    }
    const reply = async () => {
      pending.shift()()
      await new Promise(resolve => setImmediate(resolve))
    }
    const app = questionnaire(page, localFetch); complete(app)
    assert.equal(payloads.length, 1)
    app.edit('role'); app.submit('Responsable'); app.edit('objective'); app.cancel()
    assert.equal(payloads.length, 1)
    assert.equal(guard.status().total, 1)
    await reply()
    assert.equal(app.results().length, 0)
    app.choose('Actualiser la simulation')
    assert.equal(payloads.length, 2)
    assert.equal(guard.status().total, 2)
    assert.equal(payloads[1].profile.role, 'Responsable')
    await reply()
    assert.equal(app.results().length, 1)
    app.choose('Actualiser la simulation'); app.ids.reset.click(); await reply()
    assert.equal(app.results().length, 0)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

function referencedPage(contract) {
  return html.replace('/*PROFILE_REFERENCES*/null', 'JSON.parse(' + JSON.stringify(JSON.stringify(contract.pathway.fields)) + ')')
    .replace('/*REFERENCE_REVISION*/null', JSON.stringify(contract.revision))
    .replace('/*LOCAL_REFERENCES*/false', 'true')
}
function completeReferenced(app) {
  app.choose('Groupe de test A'); app.submit('Mon service libre'); app.submit('')
  app.choose('Construire un parcours'); app.submit('Conseiller'); app.submit('Organiser mes projets')
  app.submit(''); app.submit(''); app.submit('')
}
const tick = () => new Promise(resolve => setImmediate(resolve))

test('confirmation explicite : aucune simulation avant confirmation, champs facultatifs corrigibles', async () => {
  const app = questionnaire(referencedPage(references()))
  completeReferenced(app)
  assert.equal(app.results().length, 0)
  app.choose('Confirmer le profil et simuler'); await tick()
  assert.equal(app.results().length, 1)
  app.edit('manager'); app.submit('Situation de test')
  assert.equal(app.results().length, 0)
  assert.equal(app.value('role'), 'Conseiller')
  app.choose('Confirmer le profil et simuler'); await tick()
  assert.match(app.results()[0].textContent, /TEST-MANAGER/)
})

test('actualisation : codes conservés si les libellés changent, brouillon de saisie préservé', async () => {
  const updated = references(x => { x.pathway.fields.personnelCategory.options[0].label = 'Nouveau libellé A' })
  const app = questionnaire(referencedPage(references()), async url => {
    assert.equal(url, '/local/profile-references')
    return { ok: true, json: async () => updated }
  })
  completeReferenced(app); app.choose('Confirmer le profil et simuler'); await tick()
  app.ids.input.value = 'Texte en cours'
  await app.refreshChoices()
  assert.equal(app.value('profile'), 'Nouveau libellé A')
  assert.equal(app.value('entity'), 'Mon service libre')
  assert.equal(app.ids.input.value, 'Texte en cours')
  assert.equal(app.results().length, 0)
  app.choose('Confirmer le profil et simuler'); await tick()
  assert.match(app.results()[0].textContent, /"personnelCategory": "TEST-A"/)
})

test('choix retiré et limite réduite : réponses visibles, confirmation bloquée puis corrections ciblées', async () => {
  const updated = references(x => { x.pathway.fields.personnelCategory.options.shift(); x.pathway.fields.role.maxLength = 3 })
  const app = questionnaire(referencedPage(references()), async () => ({ ok: true, json: async () => updated }))
  completeReferenced(app); await app.refreshChoices()
  assert.match(app.value('profile'), /TEST-A.*À revérifier/)
  assert.match(app.value('role'), /Conseiller.*À revérifier/)
  app.choose('Confirmer le profil et simuler'); await tick()
  assert.equal(app.results().length, 0)
  app.edit('profile'); app.submit('Groupe de test B')
  app.edit('role'); assert.equal(app.ids.input.value, 'Conseiller'); app.submit('RH')
  assert.equal(app.value('entity'), 'Mon service libre')
  assert.equal(app.value('objective'), 'Organiser mes projets')
  app.choose('Confirmer le profil et simuler'); await tick()
  assert.equal(app.results().length, 1)
})

test('échec d’actualisation : aucune confirmation ni perte de données, reprise après nouvel essai', async () => {
  let available = false
  const app = questionnaire(referencedPage(references()), async () => {
    if (!available) throw Error('Hors ligne')
    return { ok: true, json: async () => references() }
  })
  completeReferenced(app); app.ids.input.value = 'Brouillon en cours'; await app.refreshChoices()
  assert.match(app.referenceStatus(), /impossible/)
  assert.equal(app.value('role'), 'Conseiller')
  assert.equal(app.ids.input.value, 'Brouillon en cours')
  app.choose('Confirmer le profil et simuler'); await tick()
  assert.equal(app.results().length, 0)
  available = true; await app.refreshChoices()
  app.choose('Confirmer le profil et simuler'); await tick()
  assert.equal(app.results().length, 1)
})

test('rechargement : brouillon et saisie restaurés, résultats et confirmation jamais restaurés', async () => {
  const storage = new Map(), page = referencedPage(references())
  const app = questionnaire(page, undefined, storage)
  completeReferenced(app); app.choose('Confirmer le profil et simuler'); await tick()
  assert.equal(app.results().length, 1)
  const restored = questionnaire(page, undefined, storage)
  assert.equal(restored.value('role'), 'Conseiller')
  assert.equal(restored.value('entity'), 'Mon service libre')
  assert.equal(restored.results().length, 0)
  assert.match(restored.referenceStatus(), /confirmation précédente n’est pas conservée/)
  restored.choose('Confirmer le profil et simuler'); await tick()
  assert.equal(restored.results().length, 1)
  restored.ids.reset.click()
  assert.equal(storage.size, 0)
  const empty = questionnaire(page, undefined, storage)
  assert.equal(empty.value('role'), 'À préciser')
  empty.choose('Groupe de test A')
  empty.ids.input.value = 'Service en cours'; empty.ids.input.listeners.input()
  const partial = questionnaire(page, undefined, storage)
  assert.equal(partial.ids.input.value, 'Service en cours')
  assert.match(partial.messages(), /À quelle entité/)
})

test('stockage de brouillon corrompu ou indisponible : formulaire utilisable sans envoi automatique', () => {
  const page = referencedPage(references())
  const corrupt = questionnaire(page, undefined, new Map([['a658-avatar-draft-v1','{"version":1}']]))
  assert.equal(corrupt.value('profile'), 'À préciser')
  const unavailable = { get() { throw Error('bloqué') }, set() { throw Error('bloqué') }, delete() { throw Error('bloqué') } }
  const app = questionnaire(page, undefined, unavailable)
  completeReferenced(app)
  assert.equal(app.value('role'), 'Conseiller')
  assert.match(app.referenceStatus(), /indisponible/)
  assert.equal(app.results().length, 0)
})

test('réponse locale tardive après correction ignorée, 409 exige actualisation et nouvelle confirmation', async () => {
 const contract=references(), port=19000+Math.floor(Math.random()*20000)
 const {server,origin}=createLocalDemo({port,stateFile:'',profileReferences:contract})
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve))
 try{
  const page=await(await fetch(origin)).text(), payloads=[], pending=[]
  const transport=async(url,options)=>{
   if(url==='/local/profile-references')return {ok:true,json:async()=>contract}
   payloads.push(JSON.parse(options.body))
   return new Promise(resolve=>pending.push(resolve))
  }
  const app=questionnaire(page,transport)
  completeReferenced(app);app.choose('Confirmer le profil et simuler')
  assert.equal(payloads.length,1)
  app.edit('role');app.submit('Responsable')
  pending.shift()({ok:true,status:200,json:async()=>({message:'Simulation',quota:{total:1,maxTotalRequests:20}})})
  await tick();assert.equal(app.results().length,0)
  app.choose('Confirmer le profil et simuler')
  assert.equal(payloads.length,2)
  pending.shift()({ok:false,status:409,json:async()=>({error:'Référentiel modifié'})})
  await tick()
  assert.match(app.referenceStatus(),/doivent être revalidés/)
  app.choose('Confirmer le profil et simuler');await tick()
  assert.equal(payloads.length,2)
  assert.equal(app.value('role'),'Responsable')
  await app.refreshChoices()
  assert.equal(payloads.length,2)
  app.choose('Confirmer le profil et simuler')
  assert.equal(payloads.length,3)
  assert.equal(payloads[2].profile.role,'Responsable')
  pending.shift()({ok:true,status:200,json:async()=>({message:'Simulation',quota:{total:2,maxTotalRequests:20}})})
  await tick();assert.equal(app.results().length,1)
 }finally{await new Promise(resolve=>server.close(resolve))}
})

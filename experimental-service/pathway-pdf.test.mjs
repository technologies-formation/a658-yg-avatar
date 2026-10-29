import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createPdfModel,renderPathwayPdf,AI_GUIDANCE} from './pathway-pdf.mjs'
import {createMessagingSnapshot} from './messaging-state.mjs'
import {data} from './result-test-fixtures.mjs'
import {scheduledOpeningLabel} from './pathway-result.mjs'
const {jsPDF}=createRequire(import.meta.url)('./vendor/jspdf.umd.min.js')
const fonts={regular:readFileSync(new URL('./vendor/DejaVuSans.ttf',import.meta.url)).toString('base64'),bold:readFileSync(new URL('./vendor/DejaVuSans-Bold.ttf',import.meta.url)).toString('base64')}
const profile={personnelCategory:'PAT',role:'Assistante administrative',objective:'Rédiger mes rapports : modèles et efficacité',existingSkills:'Quelques bases',timeAvailable:'1 à 2 jours',constraints:'Modalité souhaitée : en ligne\nLe lundi uniquement'}
const snapshot=(result=data(),mode='real')=>createMessagingSnapshot(profile,result,'old-reference',3,'En ligne',mode)

test('PDF : critères de la recherche figés, catégories et ordre exacts, sans budget technique ni préférence déduite',()=>{
  const saved=snapshot(),before=structuredClone(saved)
  const model=createPdfModel(saved,{references:{revision:'new-reference',pathway:{fields:{personnelCategory:{options:[{value:'PAT',label:'Libellé modifié'}]}}}},now:new Date('2026-10-25T12:00:00Z')})
  assert.deepEqual(saved,before)
  assert.deepEqual(model.criteria.find(x=>x[0]==='Groupe de personnel'),['Groupe de personnel','PAT'])
  assert.deepEqual(model.criteria.find(x=>x[0]==='Modalité souhaitée'),['Modalité souhaitée','En ligne'])
  assert.deepEqual(model.criteria.find(x=>x[0]==='Autres contraintes'),['Autres contraintes','Le lundi uniquement'])
  assert.deepEqual(model.groups.map(([,items])=>items.map(x=>x.course.code)),[['TEST-1'],['TEST-2'],['TEST-3']])
  assert.equal(model.guidance,AI_GUIDANCE)
  assert.equal('usage' in model,false)
  assert.equal(model.simulation,false)
  assert.match(model.filename,/^a658yg-recherche-[a-z0-9-]+\.pdf$/)
  assert.doesNotMatch(model.filename,/recherche-3/)
})

test('PDF : simulation explicitement distincte du résultat réel, abstention conservée et URL malveillante refusée',()=>{
  assert.equal(createPdfModel(snapshot(data(),'simulation')).simulation,true)
  const empty={ok:true,abstain:true,summary:'Aucune sélection pertinente.',recommendedSteps:[],optionalSteps:[],informationalCourses:[],gaps:['Pas de fiche adaptée.'],durationSummary:{budgetHours:40,recommendedHours:0,excessHours:0}}
  assert.equal(createPdfModel(snapshot(empty)).noPathway,true)
  const hostile=data();hostile.recommendedSteps[0].course.sourceUrl='javascript:alert(1)'
  assert.throws(()=>createPdfModel({profile,result:hostile,number:1,mode:'real',modality:'En ligne'}))
})

test('PDF : document téléchargeable, polices embarquées, liens officiels et pages pour les longs résultats',()=>{
  const saved=snapshot(),model=createPdfModel(saved)
  const doc=renderPathwayPdf(model,{jsPDF,fonts})
  assert.match(doc.output(),/^%PDF-/)
  assert.match(doc.output(),/\/FontFile2/)
  assert.match(doc.output(),/https:\/\/outils\.ge\.ch\/referentiel\/formation\/test-affichage/)
  assert.doesNotMatch(doc.output(),/\/S\s*\/JavaScript|\/JS\s*\(/)
  const long=data();long.recommendedSteps[0].rationale='Évaluer les priorités, organiser les tâches et vérifier les modèles. '.repeat(400)
  const result=renderPathwayPdf(createPdfModel(snapshot(long)),{jsPDF,fonts})
  assert.ok(result.getNumberOfPages()>1)
  assert.ok(result.getNumberOfPages()<100)
  assert.deepEqual(saved.profile,profile)
})


test('sessions PDF : ouverture datée figée et repli si la date est passée',()=>{
 const result=data()
 const availability={hasOpenSession:true,hasScheduledSession:true,observedOn:'2026-10-26',source:'official-session-icons',scheduledOpeningDates:['2026-11-03','2026-12-09']}
 result.recommendedSteps[0].course.sessionAvailability=availability
 const model=createPdfModel(snapshot(result),{now:new Date('2026-10-26T12:00:00Z')})
 assert.deepEqual(model.groups[0][1][0].course.sessionAvailability,availability)
 assert.equal(scheduledOpeningLabel(availability,model.date),'Ouverture des inscriptions prévue le 3 novembre 2026')
 assert.equal(scheduledOpeningLabel(availability,new Date('2026-11-04T12:00:00Z')),'Ouverture des inscriptions prévue le 9 décembre 2026')
 assert.equal(scheduledOpeningLabel(availability,new Date('2027-01-01T12:00:00Z')),'Ouverture programmée signalée')
 const doc=renderPathwayPdf(model,{jsPDF,fonts})
 const output=doc.output()
 assert.ok(output.startsWith('%PDF-'))
})


test('PDF : titre complet, hypothèse de présentiel et repère de temps conservés sans modifier la recherche',()=>{
  const objective='Mieux structurer mes rapports dans Word, notamment en automatisant les titres et la table des matières.'
  const result=data();result.recommendedSteps[0].course.deliveryMode={value:'in_person',sourceField:'catalogue-default',evidence:null}
  const saved=createMessagingSnapshot({...profile,objective},result,'old-reference',3,'En ligne','real')
  const before=structuredClone(saved),model=createPdfModel(saved)
  assert.equal(model.title,objective)
  const doc=renderPathwayPdf(model,{jsPDF,fonts})
  assert.ok(doc.getNumberOfPages()>0)
  assert.deepEqual(saved,before)
})

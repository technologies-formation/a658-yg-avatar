import test from 'node:test'
import assert from 'node:assert/strict'
import {nextGuidedField,GUIDED_QUESTIONS} from './guided-questions.mjs'
test('un choix d’environnement enregistré mène au groupe de personnel sans répéter la question',()=>{
 assert.equal(nextGuidedField({},''),'professionalEnvironment')
 assert.equal(nextGuidedField({professionalEnvironment:'Pouvoir judiciaire'},''),'personnelCategory')
 assert.equal(nextGuidedField({professionalEnvironment:'Pouvoir judiciaire',personnelCategory:'PAT'},''),'role')
 assert.doesNotMatch(GUIDED_QUESTIONS.personnelCategory,/\bPAT\b|\bPE\b/)
})
test('la responsabilité peut rester vide ; la précision du besoin conserve sa place',()=>{
 const p={professionalEnvironment:'Pouvoir judiciaire',personnelCategory:'PAT',role:'Chef',objective:'Cockpits'}
 assert.equal(nextGuidedField(p,''),'managerStatus')
 assert.equal(nextGuidedField(p,'',{skipped:['managerStatus'],clarifyObjective:true}),'objective')
 assert.equal(nextGuidedField(p,'',{skipped:['managerStatus']}),'existingSkills')
 assert.equal(nextGuidedField({...p,existingSkills:'Débutant',timeAvailable:'5 jours'},'Indifférent',{skipped:['managerStatus']}),null)
})

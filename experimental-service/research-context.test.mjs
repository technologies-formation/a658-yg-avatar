import test from 'node:test'
import assert from 'node:assert/strict'
import {createResearchContext} from './research-context.mjs'
const snapshot=(number,objective,offers='',organizers='',code='TRT450')=>({number,profile:{objective,trainingOffers:offers,trainingOrganizers:organizers},result:{summary:'Résultat',recommendedSteps:code?[{rationale:'Explication',course:{code,title:'Cockpit RH',catalogueOffers:['OPE'],organizingEntity:'Centre OPE'}}]:[],optionalSteps:[],informationalCourses:[]}})
test('contexte : comparaison des périmètres de la même demande, sans mélange avec un autre besoin',()=>{
 const a=snapshot(1,'Cockpits','OPE'),b=snapshot(2,'Cockpits','','DIP-SEM',''),other=snapshot(3,'Apprendre Word');const c=createResearchContext(b,[a,b,other]);assert.equal(c.previousSearches.length,1);assert.equal(c.previousSearches[0].trainingOffers,'OPE');assert.equal(c.profile.trainingOrganizers,'DIP-SEM');assert.equal(c.previousSearches[0].courses[0].code,'TRT450');assert.equal(c.conversationKey,'Cockpits')
})

// Série fixe approuvée : trois scénarios fictifs, aucun quota antérieur modifié.
import {existsSync,lstatSync,readFileSync,writeFileSync,realpathSync} from 'node:fs'
import {join,isAbsolute,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {createRealSession} from './real-session.mjs'
import {composeConstraints} from './messaging-state.mjs'
import {PROFILE_FIELDS,normalizePathwayProfile} from './profile-references.mjs'
export const VALIDATION_SERIES='pilot-2026-10-25'
const fail=code=>{throw Object.assign(Error('Validation privée indisponible'),{code})}
const cases=[
 {id:'V1',label:'Word 2016 en ligne',modality:'En ligne',profile:{personnelCategory:'PAT',managerStatus:'Sans responsabilité managériale',role:'Assistant administratif',objective:'Structurer mes rapports longs sous Word 2016 avec des styles, une table des matières et des modèles réutilisables.',existingSkills:'Quelques bases de saisie et de mise en page dans Word.',timeAvailable:'3 à 5 jours'}},
 {id:'V2',label:'Entretiens du nouveau manager',modality:'Indifférent',profile:{personnelCategory:'PAT',managerStatus:'Nouveau manager',role:'Responsable d’une équipe administrative',objective:'Préparer et conduire les entretiens managériaux avec les membres de mon équipe dans ma nouvelle fonction.',existingSkills:'Je débute dans la conduite d’entretiens managériaux.',timeAvailable:'1 à 2 jours'}},
 {id:'V3',label:'Demande hors périmètre',modality:'Indifférent',profile:{personnelCategory:'PAT',managerStatus:'Sans responsabilité managériale',role:'Assistant administratif',objective:'Apprendre à fabriquer et ajuster des prothèses dentaires en céramique dans un laboratoire dentaire.',existingSkills:'Je débute sur ce sujet.',timeAvailable:'3 à 5 jours'}},
]
const fingerprint=p=>JSON.stringify(PROFILE_FIELDS.map(k=>(p[k]??'').trim()))
export function createPathwayValidation({directory,fetchImpl}={}){
 if(typeof directory!=='string'||!isAbsolute(directory))fail('configuration')
 const checkDirectory=()=>{const info=lstatSync(directory);if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)||realpathSync(directory)!==resolve(directory))fail('configuration')}
 checkDirectory()
 const record=id=>join(directory,id+'.attempt.json')
 const attempted=id=>{
  checkDirectory();const path=record(id);if(!existsSync(path))return false
  const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o077)||stat.size>2048)fail('session_unavailable')
  let data;try{data=JSON.parse(readFileSync(path,'utf8'))}catch{fail('session_unavailable')}
  if(!data||typeof data!=='object'||data.caseId!==id||data.series!==VALIDATION_SERIES||typeof data.profileHash!=='string'||!/^[a-f0-9]{64}$/.test(data.profileHash))fail('session_unavailable')
  return true
 }
 const normalizedCase=c=>({...c.profile,constraints:composeConstraints(c.modality)})
 const match=p=>cases.find(c=>fingerprint(p)===fingerprint(normalizedCase(c)))
 const validation={
  cases:()=>cases.map(c=>({id:c.id,label:c.label,attempted:attempted(c.id)})),
  identify(profile,modality){return match({...profile,constraints:composeConstraints(modality,profile.constraints||'')})?.id??null},
  load(id,references){const c=cases.find(c=>c.id===id);if(!c)fail('invalid_profile');if(attempted(id))fail('duplicate_request');try{normalizePathwayProfile(normalizedCase(c),references)}catch{fail('references_changed')}return structuredClone(c)},
 }
 validation.cases()
 const session=createRealSession({stateFile:join(directory,'quotas.json'),reportFile:join(directory,'report.json'),singleInstance:true,maxRequests:3,fetchImpl,
  beforeReserve:profile=>{const c=match(profile);if(!c)fail('invalid_profile');if(attempted(c.id))fail('duplicate_request');try{writeFileSync(record(c.id),JSON.stringify({series:VALIDATION_SERIES,caseId:c.id,attemptedAt:new Date().toISOString(),profileHash:createHash('sha256').update(fingerprint(profile)).digest('hex')}),{flag:'wx',mode:0o600})}catch{fail('session_unavailable')}}})
 return {...validation,session:{...session,async buildPathway(profile,options){
  if(!match(profile))fail('invalid_profile')
  const value=await session.buildPathway(profile,options),c=match(profile)
  let caseReportSaved=false
  try{checkDirectory();writeFileSync(join(directory,c.id+'.result.json'),JSON.stringify({series:VALIDATION_SERIES,caseId:c.id,profile:normalizedCase(c),result:value.result,quota:value.quota}),{mode:0o600,flag:'wx'});caseReportSaved=true}catch{}
  return {...value,caseId:c.id,caseReportSaved}
 }}}
}

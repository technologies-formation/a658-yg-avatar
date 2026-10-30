// Tentatives par compte testeur, sans messages, adresses, secrets ni coûts inventés.
import {readPrivateJson,protectedDirectory,consumptionDay} from './consumption-ledger.mjs'
import {createHash,randomUUID} from 'node:crypto'
import {join} from 'node:path'
import {readdirSync,writeFileSync,renameSync} from 'node:fs'
const hash=value=>createHash('sha256').update(value).digest('hex')
const fail=code=>{throw Object.assign(Error(code),{code})}
export function createParticipantUsage({directory,ids,now=Date.now,dialoguePerDay=10,researchPerDay=3}={}){
 protectedDirectory(directory)
 if(!Array.isArray(ids)||!ids.length||ids.some(x=>typeof x!=='string'||!x)||new Set(ids).size!==ids.length||![dialoguePerDay,researchPerDay].every(x=>Number.isSafeInteger(x)&&x>0&&x<=100))fail('participant_configuration')
 const actors=new Set(ids.map(hash));let last=-Infinity
 const clock=()=>{const at=now();if(!Number.isSafeInteger(at)||at<last)fail('participant_storage');last=at;return new Date(at).toISOString()}
 const events=()=>readdirSync(directory).filter(x=>/^[a-f0-9]{64}\.attempt\.json$/.test(x)).map(name=>{const e=readPrivateJson(join(directory,name));if(e.version!==1||!actors.has(e.actor)&&! /^[a-f0-9]{64}$/.test(e.actor)||!['dialogue','search','pathway'].includes(e.action)||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at)))fail('participant_storage');return e})
 const snapshot=(id)=>{const actor=hash(id),at=clock(),day=consumptionDay(at),all=events().filter(e=>e.actor===actor),today=all.filter(e=>consumptionDay(e.at)===day);return {day,dialogue:today.filter(e=>e.action==='dialogue').length,research:today.filter(e=>e.action!=='dialogue').length,totalDialogue:all.filter(e=>e.action==='dialogue').length,totalResearch:all.filter(e=>e.action!=='dialogue').length,lastAttempt:all.map(e=>e.at).sort().at(-1)??null,dialoguePerDay,researchPerDay}}
 return {status(id){return actors.has(hash(id))?snapshot(id):null},reserve(id,action,requestId){
  if(!actors.has(hash(id)))return
  if(!['dialogue','search','pathway'].includes(action)||typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,128}$/.test(requestId))fail('invalid_request')
  const status=snapshot(id);if(action==='dialogue'?status.dialogue>=dialoguePerDay:status.research>=researchPerDay)fail('participant_daily_limit')
  const file=join(directory,hash(id+'\n'+requestId)+'.attempt.json'),record={version:1,actor:hash(id),action,at:clock()}
  try{writeFileSync(file,JSON.stringify(record),{mode:0o600,flag:'wx'})}catch(e){if(e.code==='EEXIST')fail('duplicate_request');throw e}
 },visit(id){if(!actors.has(hash(id)))return;const file=join(directory,hash(id)+'.visit.json'),temp=file+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify({version:1,at:clock()}),{mode:0o600,flag:'wx'});renameSync(temp,file)},report(id){const result=snapshot(id);try{result.lastConnection=readPrivateJson(join(directory,hash(id)+'.visit.json')).at}catch(e){if(e.code!=='ENOENT')throw e}return result}}
}

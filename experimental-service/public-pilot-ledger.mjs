// Préparation hors ligne : réservations conservatrices, jamais un relevé de facture.
import {openSync,closeSync,writeFileSync,fsyncSync,readdirSync,unlinkSync,existsSync,renameSync} from 'node:fs'
import {join} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {protectedDirectory,readPrivateJson,consumptionDay} from './consumption-ledger.mjs'
import {PUBLIC_COST_POLICY,requirePublicCostPolicy} from './public-cost-policy.mjs'

export const PUBLIC_POLICY=Object.freeze({version:2,costPolicy:PUBLIC_COST_POLICY.id,limitMicroUsd:5_000_000,dialoguePerDay:10,researchPerDay:3,mailPerDay:2,globalMailPerDay:10,cadenceMs:10_000,
  reserveMicroUsd:Object.freeze({dialogue:PUBLIC_COST_POLICY.dialogue.reserveMicroUsd,search:PUBLIC_COST_POLICY.research.reserveMicroUsd,pathway:PUBLIC_COST_POLICY.research.reserveMicroUsd,mail:0})})
export class PublicPilotError extends Error{constructor(code,status=429){super(code);this.code=code;this.status=status}}
const fail=(code,status)=>{throw new PublicPilotError(code,status)}
const hash=value=>createHash('sha256').update(value).digest('hex')
const actorValid=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
export function createPublicPilotLedger({directory,now=Date.now,policy=PUBLIC_POLICY}={}){
  if(typeof now!=='function'||JSON.stringify(policy)!==JSON.stringify(PUBLIC_POLICY))fail('public_policy',503)
  protectedDirectory(directory)
  const lock=join(directory,'.public-lock');let fd,closed=false,blocked=false,last=-Infinity
  try{fd=openSync(lock,'wx',0o600)}catch{fail('public_locked',503)}
  const release=()=>{if(!closed){closed=true;closeSync(fd);unlinkSync(lock)}}
  const persist=(name,value)=>{
    let out
    try{out=openSync(join(directory,name),'wx',0o600);writeFileSync(out,JSON.stringify(value));fsyncSync(out);closeSync(out);out=undefined;
      const parent=openSync(directory,'r');try{fsyncSync(parent)}finally{closeSync(parent)}}
    catch{if(out!==undefined)closeSync(out);blocked=true;fail('public_storage',503)}
  }
  const records=[]
  const checkpoint=()=>{
    const name='head-'+randomUUID()+'.tmp'
    persist(name,{version:1,count:records.length,reservedMicroUsd:records.reduce((sum,r)=>sum+r.reservedMicroUsd,0),last:records.at(-1)?.request??null})
    try{renameSync(join(directory,name),join(directory,'head.json'));const parent=openSync(directory,'r');try{fsyncSync(parent)}finally{closeSync(parent)}}catch{blocked=true;fail('public_storage',503)}
  }
  try{
    const path=join(directory,'policy.json')
    if(!existsSync(path)){
      if(readdirSync(directory).some(n=>n!=='.public-lock'))fail('public_storage',503)
      persist('policy.json',policy);checkpoint()
    }
    if(JSON.stringify(readPrivateJson(path))!==JSON.stringify(policy))fail('public_policy',503)
    const names=readdirSync(directory).filter(n=>n.startsWith('reservation-')).sort()
    if(names.length>20000)fail('public_storage',503)
    const seen=new Set()
    for(const [index,name]of names.entries()){
      if(name!=='reservation-'+String(index+1).padStart(6,'0')+'.json')fail('public_storage',503)
      const r=readPrivateJson(join(directory,name))
      if(Object.keys(r).sort().join(',')!=='action,actor,at,day,request,reservedMicroUsd,version'||r.version!==1||!actorValid(r.actor)||!actorValid(r.request)||
        !Object.hasOwn(policy.reserveMicroUsd,r.action)||r.reservedMicroUsd!==policy.reserveMicroUsd[r.action]||!Number.isSafeInteger(r.at)||r.at<0||r.at<last||
        r.day!==consumptionDay(r.at)||seen.has(r.request))fail('public_storage',503)
      last=r.at;seen.add(r.request);records.push(r)
    }
    if(existsSync(join(directory,'stopped.json'))){const s=readPrivateJson(join(directory,'stopped.json'));if(s.stopped!==true)fail('public_storage',503);blocked=true}
    if(records.reduce((sum,r)=>sum+r.reservedMicroUsd,0)>policy.limitMicroUsd)fail('public_storage',503)
    const head=readPrivateJson(join(directory,'head.json'))
    if(Object.keys(head).sort().join(',')!=='count,last,reservedMicroUsd,version'||head.version!==1||!Number.isSafeInteger(head.count)||head.count<0||head.count>records.length||
      head.reservedMicroUsd!==records.slice(0,head.count).reduce((sum,r)=>sum+r.reservedMicroUsd,0)||head.last!==(records[head.count-1]?.request??null))fail('public_storage',503)
    // Une écriture interrompue peut ajouter une réservation, jamais en soustraire.
    if(head.count<records.length)checkpoint()
  }catch(error){release();throw error}
  const time=()=>{const at=now();if(!Number.isSafeInteger(at)||at<0||at<last){blocked=true;fail('public_clock',503)}return at}
  const reserved=()=>records.reduce((sum,r)=>sum+r.reservedMicroUsd,0)
  return {
    status(actor){
      if(!actorValid(actor))fail('public_identity',401)
      const day=consumptionDay(time()),daily=records.filter(r=>r.actor===actor&&r.day===day)
      return {limitMicroUsd:policy.limitMicroUsd,reservedMicroUsd:reserved(),stopped:blocked||closed,
        dialogue:daily.filter(r=>r.action==='dialogue').length,research:daily.filter(r=>['search','pathway'].includes(r.action)).length,
        mail:daily.filter(r=>r.action==='mail').length,dialoguePerDay:policy.dialoguePerDay,researchPerDay:policy.researchPerDay}
    },
    reserve({actor,action,requestId}){
      if(blocked||closed)fail('public_stopped',503)
      if(!actorValid(actor)||!Object.hasOwn(policy.reserveMicroUsd,action)||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(requestId))fail('public_request',400)
      const request=hash(actor+'\n'+requestId)
      if(records.some(r=>r.request===request))fail('public_duplicate',409)
      const at=time(),day=consumptionDay(at),daily=records.filter(r=>r.day===day),own=daily.filter(r=>r.actor===actor)
      if(action==='mail'){
        if(own.filter(r=>r.action==='mail').length>=policy.mailPerDay||daily.filter(r=>r.action==='mail').length>=policy.globalMailPerDay)fail('public_mail_limit')
      }else{
        try{requirePublicCostPolicy(at)}catch{fail('public_cost_review_expired',503)}
        const paid=own.filter(r=>r.action!=='mail')
        if(paid.length&&at-paid.at(-1).at<policy.cadenceMs)fail('public_cadence')
        if(action==='dialogue'&&paid.filter(r=>r.action==='dialogue').length>=policy.dialoguePerDay)fail('public_daily_limit')
        if(['search','pathway'].includes(action)&&paid.filter(r=>['search','pathway'].includes(r.action)).length>=policy.researchPerDay)fail('public_daily_limit')
        if(reserved()+policy.reserveMicroUsd[action]>policy.limitMicroUsd)fail('public_budget_limit')
      }
      if(records.length>=20000)fail('public_storage',503)
      const record={version:1,actor,action,request,at,day,reservedMicroUsd:policy.reserveMicroUsd[action]}
      persist('reservation-'+String(records.length+1).padStart(6,'0')+'.json',record);last=at;records.push(record);checkpoint()
      return this.status(actor)
    },
    stop(){if(!blocked&&!closed)persist('stopped.json',{stopped:true});blocked=true},
    close:release,
  }
}

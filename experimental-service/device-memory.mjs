// Copie locale volontaire, authentifiée et signée ; aucune autorisation de génération.
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {protectedDirectory,readPrivateJson} from './consumption-ledger.mjs'
import {validateResume} from './private-resume-store.mjs'
export const DEVICE_MEMORY_TTL=30*24*60*60*1000
const fail=()=>{throw Error('Copie locale invalide, expirée ou liée à un autre accès privé.')}
export function createDeviceMemory({directory,origin,now=Date.now}={}){
 if(typeof directory!=='string'||typeof origin!=='string'||!origin.startsWith('https://'))fail()
 // Le dossier et la clé ne sont créés qu’à la première sauvegarde volontaire.
 const key=()=>{
  protectedDirectory(directory)
  const file=join(directory,'device-copy-key.json')
  try{writeFileSync(file,JSON.stringify({version:1,key:randomBytes(32).toString('hex')}),{mode:0o600,flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error}
  const value=readPrivateJson(file)
  if(value.version!==1||!/^[a-f0-9]{64}$/.test(value.key))fail()
  return Buffer.from(value.key,'hex')
 }
 const scope=id=>createHash('sha256').update(JSON.stringify(['a658-device-copy-v1',origin,id])).digest('hex')
 const signature=value=>createHmac('sha256',key()).update(JSON.stringify(value)).digest('hex')
 return {
  scope,
  stateToken:state=>createHash('sha256').update(JSON.stringify(validateResume(state))).digest('hex'),
  issue(id,state,expiresAt){
   const issuedAt=now(),limit=issuedAt+DEVICE_MEMORY_TTL
   expiresAt=expiresAt??limit
   if(!Number.isSafeInteger(expiresAt)||expiresAt<=issuedAt||expiresAt>limit)fail()
   const value={version:1,scope:scope(id),issuedAt,expiresAt,state:validateResume(state)}
   if(Buffer.byteLength(JSON.stringify(value))>1024*1024)fail()
   const copy={...value,signature:signature(value)}
   if(Buffer.byteLength(JSON.stringify(copy))>1024*1024)fail()
   return copy
  },
  verify(id,copy){
   if(!copy||Object.keys(copy).sort().join(',')!=='expiresAt,issuedAt,scope,signature,state,version'||copy.version!==1||copy.scope!==scope(id)||!Number.isSafeInteger(copy.issuedAt)||!Number.isSafeInteger(copy.expiresAt)||copy.issuedAt>now()||copy.expiresAt<=now()||copy.expiresAt-copy.issuedAt>DEVICE_MEMORY_TTL||copy.expiresAt<=copy.issuedAt||!/^[a-f0-9]{64}$/.test(copy.signature)||Buffer.byteLength(JSON.stringify(copy))>1024*1024)fail()
   const {signature:actual,...value}=copy,expected=signature(value)
   if(!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex')))fail()
   return validateResume(copy.state)
  }
 }
}

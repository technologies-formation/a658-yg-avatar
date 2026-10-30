// Consigne du pilote : acceptation privée par identité, sans contenu d’échange.
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {protectedDirectory,readPrivateJson} from './consumption-ledger.mjs'
export const CONFIDENTIALITY_VERSION='confidentiality-2026-10-30-v1'
const fail=code=>{throw Object.assign(Error(code),{code})}
export function createParticipantConsent({directory,ids,now=Date.now}){
 protectedDirectory(directory)
 const participants=new Set(ids)
 const file=id=>join(directory,createHash('sha256').update(id).digest('hex')+'.json')
 const status=id=>{
  if(!participants.has(id))return {required:false}
  try{
   const record=readPrivateJson(file(id))
   if(record.version!==1||typeof record.noticeVersion!=='string'||typeof record.acceptedAt!=='string'||!Number.isFinite(Date.parse(record.acceptedAt)))fail('confidentiality_storage')
   return {required:true,version:CONFIDENTIALITY_VERSION,accepted:record.noticeVersion===CONFIDENTIALITY_VERSION}
  }catch(error){if(error.code==='ENOENT')return {required:true,version:CONFIDENTIALITY_VERSION,accepted:false};fail('confidentiality_storage')}
 }
 return {status,accept(id,{accepted,version}={}){
  const current=status(id)
  if(!current.required)return current
  if(accepted!==true||version!==CONFIDENTIALITY_VERSION)fail('confidentiality_required')
  if(current.accepted)return current
  // Une version différente nécessite une intervention explicite, pas un écrasement.
  try{writeFileSync(file(id),JSON.stringify({version:1,noticeVersion:version,acceptedAt:new Date(now()).toISOString()}),{mode:0o600,flag:'wx'})}
  catch(error){if(error.code!=='EEXIST')fail('confidentiality_storage')}
  const saved=status(id);if(!saved.accepted)fail('confidentiality_storage');return saved
 }}
}

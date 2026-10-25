// Sauvegarde privée de données acceptées ; ni clé, ni messages bruts, ni compteur.
import {mkdirSync,lstatSync,realpathSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs'
import {isAbsolute,resolve,join} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {PROFILE_FIELDS} from './profile-references.mjs'
import {createMessagingSnapshot} from './messaging-state.mjs'
const fail=()=>{throw Object.assign(Error('Reprise privée indisponible'),{code:'resume_unavailable'})}
const object=x=>x&&typeof x==='object'&&!Array.isArray(x)
const profileValid=p=>object(p)&&Object.keys(p).every(k=>PROFILE_FIELDS.includes(k)&&typeof p[k]==='string'&&p[k].length<=8000)
export function validateResume(value){
 if(!object(value)||value.version!==1||!profileValid(value.profile)||!['','Présentiel','En ligne','Indifférent'].includes(value.modality)||!/^([a-f0-9]{64})$/.test(value.referenceRevision))fail()
 if(value.pathway!==null){
  const p=value.pathway
  if(!object(p)||!profileValid(p.profile)||!Number.isSafeInteger(p.number)||p.number<1||!/^([a-f0-9]{64})$/.test(p.referenceRevision)||!['real','simulation'].includes(p.mode))fail()
  try{value={...value,pathway:createMessagingSnapshot(p.profile,p.result,p.referenceRevision,p.number,p.modality,p.mode)}}catch{fail()}
 }
 return structuredClone({version:1,profile:value.profile,modality:value.modality,referenceRevision:value.referenceRevision,pathway:value.pathway})
}
export function createPrivateResumeStore(directory){
 if(typeof directory!=='string'||!isAbsolute(directory))fail()
 try{mkdirSync(directory,{mode:0o700})}catch(error){if(error.code!=='EEXIST')fail()}
 const checkDirectory=()=>{const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)||realpathSync(directory)!==resolve(directory))fail()}
 const pathFor=id=>{if(typeof id!=='string'||!id.trim()||id.length>256)fail();return join(directory,createHash('sha256').update(id).digest('hex')+'.json')}
 const checkFile=path=>{const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o077)||stat.size>1024*1024)fail()}
 checkDirectory()
 return {
  read(id){try{checkDirectory();const path=pathFor(id);try{checkFile(path)}catch(error){if(error.code==='ENOENT')return null;throw error}return validateResume(JSON.parse(readFileSync(path,'utf8')))}catch{fail()}},
  write(id,value){let temp,created=false;try{
   checkDirectory();const path=pathFor(id),clean=validateResume(value),body=JSON.stringify(clean)
   if(Buffer.byteLength(body)>1024*1024)fail()
   try{checkFile(path)}catch(error){if(error.code!=='ENOENT')throw error}
   temp=path+'.'+randomUUID()+'.tmp';writeFileSync(temp,body,{mode:0o600,flag:'wx'});created=true;renameSync(temp,path)
  }catch{if(created)try{unlinkSync(temp)}catch{}fail()}}
 }
}

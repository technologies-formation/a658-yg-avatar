import {randomBytes,createHash} from 'node:crypto'
import {writeFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {protectedDirectory,readPrivateJson} from './consumption-ledger.mjs'
import {PublicPilotError} from './public-pilot-ledger.mjs'
const cookieName='__Host-a658_public_pilot',lifetimeMs=7*86400000
const hash=value=>createHash('sha256').update(value).digest('hex')
const fail=(code,status=401)=>{throw new PublicPilotError(code,status)}
export function createPublicPilotSessions({directory,now=Date.now}={}){
  protectedDirectory(directory)
  return {identify(request,response,{create=false}={}){
    const at=now();if(!Number.isSafeInteger(at)||at<0)fail('public_clock',503)
    const raw=request.headers.cookie??''
    if(typeof raw!=='string'||raw.length>8192)fail('public_session')
    const matches=raw.split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='))
    if(matches.length>1)fail('public_session')
    if(matches.length){
      const token=matches[0].slice(cookieName.length+1);if(!/^[a-f0-9]{64}$/.test(token))fail('public_session')
      const actor=hash(token);let record
      try{record=readPrivateJson(join(directory,actor+'.json'))}catch{fail('public_session')}
      if(Object.keys(record).sort().join(',')!=='createdAt,expiresAt,version'||record.version!==1||!Number.isSafeInteger(record.createdAt)||record.expiresAt!==record.createdAt+lifetimeMs||at<record.createdAt||at>=record.expiresAt)fail('public_session')
      return {actor,expiresAt:record.expiresAt}
    }
    if(!create)fail('public_session')
    const files=readdirSync(directory)
    if(files.some(n=>! /^[a-f0-9]{64}\.json$/.test(n)))fail('public_storage',503)
    // Vingt admissions pour ce premier pilote, même après effacement des cookies.
    if(files.length>=20)fail('public_admission_limit',429)
    const token=randomBytes(32).toString('hex'),actor=hash(token)
    writeFileSync(join(directory,actor+'.json'),JSON.stringify({version:1,createdAt:at,expiresAt:at+lifetimeMs}),{mode:0o600,flag:'wx'})
    response.setHeader('Set-Cookie',cookieName+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+lifetimeMs/1000)
    return {actor,expiresAt:at+lifetimeMs}
  }}
}

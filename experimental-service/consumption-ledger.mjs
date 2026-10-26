// Registre technique privé : aucune question, réponse, adresse, identité ou clé enregistrée.
import {mkdirSync,lstatSync,realpathSync,writeFileSync,readFileSync,readdirSync,renameSync,openSync,closeSync,fstatSync,constants,existsSync} from 'node:fs'
import {join,isAbsolute,relative,dirname} from 'node:path'
import {randomUUID,createHash,timingSafeEqual} from 'node:crypto'
export const consumptionDay=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))
const validTime=value=>typeof value==='string'&&new Date(value).toISOString()===value
export function protectedDirectory(directory){
 if(!isAbsolute(directory))throw Error('Dossier de suivi absolu requis')
 for(let parent=directory;;parent=dirname(parent)){const git=join(parent,'.git');if(existsSync(git)&&(lstatSync(git).isFile()||existsSync(join(git,'HEAD'))))throw Error('Suivi interdit dans Git');if(dirname(parent)===parent)break}
 mkdirSync(directory,{recursive:true,mode:0o700});const s=lstatSync(directory)
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)||realpathSync(directory)!==directory)throw Error('Dossier de suivi non protégé')
 return directory
}
export function readPrivateJson(path,max=4096){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW)
 try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||(s.mode&0o077)||s.size>max)throw Error('Fichier de suivi invalide');return JSON.parse(readFileSync(fd,'utf8'))}finally{closeSync(fd)}
}
const validEvent=e=>e&&e.version===1&&['catalogue','assistant'].includes(e.app)&&['search','dialogue','pathway'].includes(e.action)&&validTime(e.at)&&['pending','success','error'].includes(e.outcome)&&(e.costMicroUsd===null||Number.isSafeInteger(e.costMicroUsd)&&e.costMicroUsd>=0)&&(e.inputTokens===null||Number.isSafeInteger(e.inputTokens)&&e.inputTokens>=0)&&(e.outputTokens===null||Number.isSafeInteger(e.outputTokens)&&e.outputTokens>=0)
export function createConsumptionLedger({directory,now=Date.now}={}){
 protectedDirectory(directory);const metaPath=join(directory,'coverage.json')
 try{writeFileSync(metaPath,JSON.stringify({version:1,startedAt:new Date(now()).toISOString()}),{mode:0o600,flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error}
 const meta=readPrivateJson(metaPath);if(meta.version!==1||!validTime(meta.startedAt))throw Error('Couverture de suivi invalide')
 return {directory,startedAt:meta.startedAt,
  begin(app,action){
   const event={version:1,app,action,at:new Date(now()).toISOString(),outcome:'pending',costMicroUsd:null,inputTokens:null,outputTokens:null}
   if(!validEvent(event))throw Error('Événement de suivi invalide')
   const file=join(directory,randomUUID()+'.event.json');writeFileSync(file,JSON.stringify(event),{mode:0o600,flag:'wx'})
   let done=false
   return (outcome,usage=null)=>{
    if(done)throw Error('Événement de suivi déjà clôturé')
    const updated={...event,outcome,costMicroUsd:usage?.costMicroUsd??null,inputTokens:usage?.inputTokens??null,outputTokens:usage?.outputTokens??null}
    if(!validEvent(updated))throw Error('Usage de suivi invalide')
    const temporary=file+'.'+randomUUID()+'.tmp';writeFileSync(temporary,JSON.stringify(updated),{mode:0o600,flag:'wx'});renameSync(temporary,file);done=true
   }
  },
  snapshot({since=null}={}){
   if(since!==null&&!validTime(since))throw Error('Repère temporel invalide')
   const names=readdirSync(directory).filter(n=>/^[a-f0-9-]{36}\.event\.json$/.test(n));if(names.length>100000)throw Error('Archive de suivi trop volumineuse')
   const rows=new Map();let knownMicroUsd=0,unknown=0
   for(const name of names){const e=readPrivateJson(join(directory,name));if(!validEvent(e))throw Error('Événement de suivi illisible')
    const day=consumptionDay(e.at),key=[day,e.app,e.action].join('/');let r=rows.get(key)
    if(!r){r={day,app:e.app,action:e.action,requests:0,errors:0,unknown:0,knownMicroUsd:0,inputTokens:0,outputTokens:0};rows.set(key,r)}
    r.requests++;if(e.outcome==='error')r.errors++;if(e.costMicroUsd===null)r.unknown++;else r.knownMicroUsd+=e.costMicroUsd
    r.inputTokens+=e.inputTokens??0;r.outputTokens+=e.outputTokens??0
    if(since===null||e.at>=since){if(e.costMicroUsd===null)unknown++;else knownMicroUsd+=e.costMicroUsd}
   }
   return {version:1,startedAt:meta.startedAt,observedAt:new Date(now()).toISOString(),rows:[...rows.values()].sort((a,b)=>a.day.localeCompare(b.day)),since,knownMicroUsd,unknown}
  }
 }
}
export async function trackConsumption(ledger,app,action,operation,readUsage){
 if(!ledger)return operation()
 const finish=ledger.begin(app,action)
 let value
 try{value=await operation()}catch(error){try{finish('error',null)}catch{};throw error}
 try{finish('success',readUsage(value))}catch{console.error('Suivi consommation incomplet ; aucune relance de la demande.')}
 return value
}
export function calculatedUsage(value){
 const u=value?.usage?.total??value?.usage,cost=u?.cost??u?.calculatedUpperCostUsd
 if(typeof cost!=='number'||!Number.isFinite(cost)||cost<0)return null
 const micro=Math.ceil(cost*1000000);if(!Number.isSafeInteger(micro))return null
 return {costMicroUsd:micro,inputTokens:Number.isSafeInteger(u.input??u.inputTokens)?u.input??u.inputTokens:null,outputTokens:Number.isSafeInteger(u.output??u.outputTokens)?u.output??u.outputTokens:null}
}
export function reportingTokenMatches(actual,expected){
 if(typeof actual!=='string'||typeof expected!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(expected))return false
 return timingSafeEqual(createHash('sha256').update(actual).digest(),createHash('sha256').update(expected).digest())
}
export function readConsumptionEnvironment(environment,{defaultDirectory,siteDirectory=process.cwd()}={}){
 if(environment.A658_CONSUMPTION_ENABLED!=='true')return null
 const directory=environment.A658_CONSUMPTION_DIRECTORY||defaultDirectory,token=environment.A658_REPORT_TOKEN
 if(!directory||!reportingTokenMatches(token,token))throw Error('Configuration de suivi incomplète')
 const r=relative(realpathSync(siteDirectory),directory);if(!r||!r.startsWith('..')&&!isAbsolute(r))throw Error('Suivi interdit dans le site')
 const ledger=createConsumptionLedger({directory})
 return {ledger,token}
}
export function handleConsumptionRequest(consumption,request,response,url){
 if(url.pathname!=='/api/private/consumption')return false
 const send=(status,body)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(body))}
 const auth=request.headers.authorization
 if(!consumption||typeof auth!=='string'||!auth.startsWith('Bearer ')||!reportingTokenMatches(auth.slice(7),consumption.token)){send(404,{error:'Not found'});return true}
 if(request.method!=='GET'){send(405,{error:'GET requis'});return true}
 try{send(200,consumption.ledger.snapshot({since:url.searchParams.get('since')}))}catch{send(503,{error:'Suivi indisponible'})}
 return true
}

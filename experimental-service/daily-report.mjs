// Récapitulatif quotidien indépendant des quotas IA ; aucun appel modèle.
import {join} from 'node:path'
import {writeFileSync,renameSync} from 'node:fs'
import {randomUUID,randomBytes} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {protectedDirectory,readPrivateJson,consumptionDay,reportingTokenMatches} from './consumption-ledger.mjs'
import {emailAddress} from './research-email.mjs'
import {createDailyReportModel,renderDailyReport,BILLING_URL,reportRecipientInstructions} from './daily-report-model.mjs'
const origin='https://api.a658yg-catalogue.ch'
export function prepareDailyReport(privateDirectory,recipient){
 emailAddress(recipient);protectedDirectory(privateDirectory)
 const directory=join(privateDirectory,'daily-report');protectedDirectory(directory)
 writeFileSync(join(directory,'config.json'),JSON.stringify({version:1,enabled:false,recipient,hour:8,timeZone:'Europe/Paris',thresholdMicroUsd:2000000,baseline:null},null,2),{mode:0o600,flag:'wx'})
 return join(directory,'config.json')
}
export function prepareConsumptionEnvironment(privateDirectory){
 protectedDirectory(privateDirectory)
 const path=join(privateDirectory,'consumption.env')
 writeFileSync(path,'A658_CONSUMPTION_ENABLED=true\nA658_CONSUMPTION_DIRECTORY='+join(privateDirectory,'consumption')+'\nA658_REPORT_TOKEN='+randomBytes(32).toString('base64url')+'\n',{mode:0o600,flag:'wx'})
 return path
}
export function readDailyReportEnvironment(environment,privateDirectory){
 if(environment.A658_DAILY_REPORT_ENABLED!=='true')return null
 const directory=join(privateDirectory,'daily-report'),configurationFile=join(directory,'config.json'),config=readPrivateJson(configurationFile)
 if(Object.keys(config).sort().join(',')!=='baseline,enabled,hour,recipient,thresholdMicroUsd,timeZone,version'||config.version!==1||config.enabled!==true||config.hour!==8||config.timeZone!=='Europe/Paris'||config.thresholdMicroUsd!==2000000||!config.baseline||!Number.isSafeInteger(config.baseline.balanceMicroUsd)||config.baseline.balanceMicroUsd<0||typeof config.baseline.at!=='string'||new Date(config.baseline.at).toISOString()!==config.baseline.at)throw Error('Configuration du récapitulatif non activée ou invalide')
 emailAddress(config.recipient)
 return {directory,configurationFile,...config}
}
export async function collectCatalogueConsumption({token,since,fetchImpl=globalThis.fetch,signal}={}){
 if(!reportingTokenMatches(token,token))throw Error('Jeton de collecte absent')
 const response=await fetchImpl(origin+'/api/private/consumption?since='+encodeURIComponent(since),{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',credentials:'omit',signal})
 if(!response.ok||response.redirected||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('Relevé catalogue indisponible')
 const chunks=[];let bytes=0
 for await(const chunk of response.body??[]){bytes+=chunk.length;if(bytes>2*1024*1024)throw Error('Relevé trop volumineux');chunks.push(chunk)}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export function createDailyReporter({config,mail,consumption,fetchImpl,now=Date.now,setIntervalImpl=setInterval,clearIntervalImpl=clearInterval}={}){
 if(!config||!mail?.sendReport||!consumption?.ledger||!reportingTokenMatches(consumption.token,consumption.token))throw Error('Assemblage du récapitulatif incomplet')
 protectedDirectory(config.directory);let busy=false,timer=null,stopped=false
 async function tick(){
  if(stopped||busy)return {sent:false}
  const instant=new Date(now()),day=consumptionDay(instant),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',hourCycle:'h23'}).format(instant))
  if(hour<config.hour)return {sent:false}
  const file=join(config.directory,day+'.attempt.json')
  // Aucun rattrapage en rafale : un seul essai pour la date locale en cours.
  try{writeFileSync(file,JSON.stringify({version:1,day,state:'reserved'}),{mode:0o600,flag:'wx'})}catch(error){if(error.code==='EEXIST')return {sent:false,alreadyAttempted:true};throw error}
  busy=true;let state='unknown'
  try{
   let message
   try{
    const since=config.baseline.at,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000)
    try{
     const catalogue=await collectCatalogueConsumption({token:consumption.token,since,fetchImpl,signal:controller.signal}),assistant=consumption.ledger.snapshot({since})
     message=renderDailyReport(createDailyReportModel({catalogue,assistant,baseline:config.baseline,now:instant,thresholdMicroUsd:config.thresholdMicroUsd,configurationFile:config.configurationFile}))
    }finally{clearTimeout(timeout)}
   }catch{
    message={subject:'A658-YG · Suivi quotidien OpenAI — relevé indisponible',text:'Le relevé de consommation n’a pas pu être établi. Aucun solde théorique fiable ne peut être annoncé. Vérifiez le solde réel : '+BILLING_URL+'. Aucun nouvel appel IA n’a été lancé pour ce suivi.\n\n'+reportRecipientInstructions(config.configurationFile),html:'<p>Le relevé de consommation est indisponible. Aucun solde théorique ne peut être annoncé.</p><p><a href="'+BILLING_URL+'">Vérifier le solde réel OpenAI</a></p><p>'+reportRecipientInstructions('le fichier privé daily-report/config.json')+'</p>'}
   }
   const result=await mail.sendReport({recipient:config.recipient,...message})
   if(result?.accepted!==true)throw Error('Prise en charge non confirmée')
   state='accepted';return {sent:true}
  }catch{console.error('Récapitulatif quotidien non confirmé ; aucune relance automatique pour cette date.');return {sent:false,uncertain:true}}
  finally{
   try{const temp=file+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify({version:1,day,state}),{mode:0o600,flag:'wx'});renameSync(temp,file)}catch{}
   busy=false
  }
 }
 return {tick,start(){if(timer||stopped)return;timer=setIntervalImpl(()=>{tick().catch(()=>console.error('Récapitulatif quotidien indisponible.'))},60000);timer.unref?.();tick().catch(()=>console.error('Récapitulatif quotidien indisponible.'))},stop(){stopped=true;if(timer)clearIntervalImpl(timer);timer=null}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv[2]==='--prepare'){const file=prepareDailyReport(process.argv[3],process.argv[4]);console.log('Suivi quotidien préparé et désactivé : '+file+'. Aucun courriel envoyé.')}
  else if(process.argv[2]==='--prepare-consumption'){const file=prepareConsumptionEnvironment(process.argv[3]);console.log('Collecte préparée : '+file+'. Jeton non affiché. Aucun appel IA ni courriel.')}
  else throw Error('Commande de préparation requise')
 }catch{console.error('Préparation refusée : vérifier le dossier privé et l’absence de fichier existant. Aucun remplacement effectué.');process.exitCode=1}
}

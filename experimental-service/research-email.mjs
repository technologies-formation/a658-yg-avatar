// Courriels privés : résultat enregistré uniquement ; aucun moteur IA, aucune relance.
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,lstatSync,realpathSync,readdirSync,readFileSync,writeFileSync,renameSync,rmdirSync,constants,openSync,closeSync} from 'node:fs'
import {join,isAbsolute} from 'node:path'
import {createRequire} from 'node:module'
import {createPdfModel,renderPathwayPdf,AI_GUIDANCE} from './pathway-pdf.mjs'

export class EmailError extends Error{constructor(code){super(code);this.code=code}}
const fail=code=>{throw new EmailError(code)}
const hash=value=>createHash('sha256').update(value).digest('hex')
export function emailAddress(value){
 if(typeof value!=='string'||value.length>254||value!==value.trim()||! /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value)||value.split('@')[0].length>64||value.includes('..')||value.startsWith('.')||value.includes('.@'))fail('invalid_email')
 return value
}
function privateDirectory(directory){
 if(!isAbsolute(directory))fail('mail_configuration')
 mkdirSync(directory,{mode:0o700,recursive:true})
 const stat=lstatSync(directory)
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)||realpathSync(directory)!==directory)fail('mail_configuration')
}
function readRecord(path){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW)
 try{const stat=lstatSync(path);if(!stat.isFile()||(stat.mode&0o077)||stat.size>2048)fail('mail_unavailable');return JSON.parse(readFileSync(fd,'utf8'))}finally{closeSync(fd)}
}
function makePdf(snapshot,references){
 const require=createRequire(import.meta.url),{jsPDF}=require('./vendor/jspdf.umd.min.js')
 const fonts={regular:readFileSync(new URL('./vendor/DejaVuSans.ttf',import.meta.url)).toString('base64'),bold:readFileSync(new URL('./vendor/DejaVuSans-Bold.ttf',import.meta.url)).toString('base64')}
 const model=createPdfModel(snapshot,{references})
 return {model,content:Buffer.from(renderPathwayPdf(model,{jsPDF,fonts}).output('arraybuffer'))}
}
export function createResearchEmailService({directory,from,transport,now=Date.now,buildPdf=makePdf}={}){
 emailAddress(from);if(typeof transport?.sendMail!=='function')fail('mail_configuration');privateDirectory(directory)
 const lock=join(directory,'reservation.lock');let sending=false
 return {enabled:true,async send({identity,snapshot,references,recipient,requestId,confirmed,signal}={}){
  recipient=emailAddress(recipient)
  if(confirmed!==true||typeof identity!=='string'||!identity||!snapshot||!Number.isSafeInteger(snapshot.number)||typeof requestId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))fail('invalid_email_request')
  if(signal?.aborted)fail('mail_cancelled')
  if(sending)fail('mail_busy')
  // Le modèle est construit avant toute réservation ou connexion SMTP.
  const {model,content}=buildPdf(structuredClone(snapshot),references)
  if(!Buffer.isBuffer(content)||content.length>5*1024*1024)fail('mail_attachment')
  const today=new Date(now()).toISOString().slice(0,10),actor=hash(identity),attempt=hash(identity+'\n'+requestId),duplicate=hash(identity+'\n'+snapshot.number+'\n'+recipient.toLowerCase())
  const filename=join(directory,attempt+'.json');let record
  try{mkdirSync(lock,{mode:0o700})}catch{fail('mail_busy')}
  try{
   const paths=readdirSync(directory).filter(name=>/^[a-f0-9]{64}\.json$/.test(name));if(paths.length>20000)fail('mail_unavailable')
   const records=paths.map(name=>readRecord(join(directory,name)))
   for(const r of records)if(r?.version!==1||!/^\d{4}-\d{2}-\d{2}$/.test(r.day)||! /^[a-f0-9]{64}$/.test(r.actor)||! /^[a-f0-9]{64}$/.test(r.duplicate)||!['reserved','accepted','unknown'].includes(r.state))fail('mail_unavailable')
   if(paths.includes(attempt+'.json')||records.some(r=>r.day===today&&r.duplicate===duplicate))fail('mail_duplicate')
   const daily=records.filter(r=>r.day===today)
   if(daily.length>=20||daily.filter(r=>r.actor===actor).length>=5)fail('mail_limit')
   record={version:1,day:today,actor,duplicate,state:'reserved'}
   writeFileSync(filename,JSON.stringify(record),{mode:0o600,flag:'wx'})
  }finally{rmdirSync(lock)}
  sending=true
  try{
   if(signal?.aborted)fail('mail_cancelled')
   const info=await transport.sendMail({from:{name:'A658-YG · Assistant formation',address:from},to:{address:recipient},
    subject:'A658-YG — Votre synthèse de formation',
    text:'Bonjour,\n\nVoici la synthèse de votre recherche « '+model.title+' », avec ses critères confirmés et les résultats enregistrés.\n\n'+(model.simulation?'Ce document contient un exemple de parcours simulé, sans personnalisation.\n\n':'')+'Le PDF est joint à ce courriel.\n\n'+AI_GUIDANCE+'\n\nVotre assistant formation A658-YG',
    attachments:[{filename:model.filename,content,contentType:'application/pdf'}],disableFileAccess:true,disableUrlAccess:true})
   if(!Array.isArray(info?.accepted)||!info.accepted.some(x=>String(x).toLowerCase()===recipient.toLowerCase())||info.rejected?.length)fail('mail_unconfirmed')
   record.state='accepted'
   return {accepted:true}
  }catch{record.state='unknown';fail('mail_unconfirmed')}
  finally{
   // Une réservation survit à une coupure : ni remboursement ni nouvel envoi implicite.
   try{const temp=filename+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(record),{mode:0o600,flag:'wx'});renameSync(temp,filename)}catch{}
   sending=false
  }
 }}
}

// Chargement explicite du compte expéditeur ; fournisseurs autorisés et aucun réseau à l’ouverture.
export function readHostedEmail(environment,privateDirectoryPath,{loadNodemailer}={}){
 if(environment.AVATAR_MAIL_ENABLED!=='true')return null
 const provider=environment.AVATAR_MAIL_PROVIDER??'infomaniak'
 const hosts={infomaniak:'mail.infomaniak.com',gmail:'smtp.gmail.com'}
 if(!Object.hasOwn(hosts,provider))fail('mail_configuration')
 const from=emailAddress(environment.AVATAR_MAIL_FROM),rawPassword=environment.AVATAR_MAIL_PASSWORD
 const password=provider==='gmail'&&typeof rawPassword==='string'?rawPassword.replace(/ /g,''):rawPassword
 if(provider==='gmail'&&(!/^[A-Za-z0-9]{16}$/.test(password??'')||!/@gmail\.com$/i.test(from)))fail('mail_configuration')
 if(typeof password!=='string'||!password||/[\r\n\0]/.test(password))fail('mail_configuration')
 const require=createRequire(import.meta.url)
 const nodemailer=loadNodemailer?loadNodemailer():require(join(privateDirectoryPath,'mail-runtime/node_modules/nodemailer'))
 const transport=nodemailer.createTransport({host:hosts[provider],port:465,secure:true,pool:false,
  auth:{user:from,pass:password},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
  logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,maxRecipients:1})
 const service=createResearchEmailService({directory:join(privateDirectoryPath,'mail-outbox'),from,transport})
 return {...service,async sendReport({recipient,subject,text,html}){
  emailAddress(recipient)
  if(typeof subject!=='string'||/[\r\n]/.test(subject)||subject.length>200||typeof text!=='string'||typeof html!=='string')fail('invalid_email_request')
  const info=await transport.sendMail({from:{name:'A658-YG · Suivi OpenAI',address:from},to:{address:recipient},subject,text,html,disableFileAccess:true,disableUrlAccess:true})
  if(!info?.accepted?.some(x=>String(x).toLowerCase()===recipient.toLowerCase())||info.rejected?.length)fail('mail_unconfirmed')
  return {accepted:true}
 }}
}

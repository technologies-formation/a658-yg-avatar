// Création locale sur l'hébergement. Aucun réseau, activation publique ou remise à zéro.
import {readHostedDialogueTrialConfig} from './hosted-dialogue-trial.mjs'
import {createPilotCredential,createPilotAuthenticator} from './pilot-auth.mjs'
import {createParticipantUsage} from './participant-usage.mjs'
import {protectedDirectory,readPrivateJson} from './consumption-ledger.mjs'
import {randomBytes,randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync,openSync,fstatSync,closeSync,constants,mkdtempSync,chmodSync,renameSync,unlinkSync,existsSync} from 'node:fs'
import {join,dirname,basename,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
function privateText(path){const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||(s.mode&0o077)||s.size>32000)throw Error('Fichier privé non protégé');return readFileSync(fd,'utf8')}finally{closeSync(fd)}}
const testerNames=Array.from({length:4},(_,i)=>'pilote-'+String(i+1).padStart(2,'0'))
function load(configFile,siteDirectory){const options=readHostedDialogueTrialConfig(configFile,siteDirectory);createPilotAuthenticator({enabled:true,users:options.users,maxAttempts:100,windowMs:60000,isSecureRequest:()=>false}).stop();return options}
function replace(file,before,after){const temp=file+'.'+randomUUID()+'.tmp';try{if(privateText(file)!==before)throw Error('Accès modifiés pendant la préparation');writeFileSync(temp,after,{mode:0o600,flag:'wx'});if(privateText(file)!==before)throw Error('Accès modifiés pendant la préparation');renameSync(temp,file)}finally{if(existsSync(temp))unlinkSync(temp)}}
export async function provisionFourTesters({configFile,siteDirectory}={}){
 const options=load(configFile,siteDirectory);protectedDirectory(options.privateDirectory);const file=join(options.privateDirectory,'users.json'),before=privateText(file)
 if(existsSync(join(options.privateDirectory,'tester-batch.json')))throw Error('Une préparation existe déjà ; aucun mot de passe remplacé')
 if(options.users.length+4>8||options.users.some(u=>testerNames.includes(u.username)||testerNames.includes(u.id)))throw Error('Quatre accès déjà présents ou capacité insuffisante ; aucun accès remplacé')
 const credentials=[],access=[]
 for(const username of testerNames){const password=randomBytes(24).toString('base64url');credentials.push({...await createPilotCredential({id:username,username,password}),pilotTester:true});access.push({username,password})}
 const backup=mkdtempSync(join(dirname(options.privateDirectory),'a658-quatre-acces-'));chmodSync(backup,0o700)
 writeFileSync(join(backup,'users-before.json'),before,{mode:0o600,flag:'wx'});if(privateText(join(backup,'users-before.json'))!==before)throw Error('Sauvegarde des accès non vérifiée')
 for(const x of access)writeFileSync(join(backup,x.username+'.txt'),'A658-YG — Pilote individuel\nAdresse : '+options.publicOrigin+'/private/\nIdentifiant : '+x.username+'\nMot de passe : '+x.password+'\nLimites : 10 messages IA et 3 recherches/parcours par jour.\n',{mode:0o600,flag:'wx'})
 const after=JSON.stringify([...options.users,...credentials],null,2)+'\n'
 writeFileSync(join(backup,'users-after.json'),after,{mode:0o600,flag:'wx'});
 writeFileSync(join(options.privateDirectory,'tester-batch.json'),JSON.stringify({version:1,directory:backup}),{mode:0o600,flag:'wx'});
 return {backup,created:testerNames,files:testerNames.map(name=>join(backup,name+'.txt'))}
}
export function activateTesterBatch({configFile,siteDirectory}={}){
 const options=load(configFile,siteDirectory),manifest=readPrivateJson(join(options.privateDirectory,'tester-batch.json'))
 if(manifest.version!==1||typeof manifest.directory!=='string'||dirname(manifest.directory)!==dirname(options.privateDirectory)||!basename(manifest.directory).startsWith('a658-quatre-acces-'))throw Error('Préparation privée invalide')
 protectedDirectory(manifest.directory)
 const file=join(options.privateDirectory,'users.json'),before=privateText(join(manifest.directory,'users-before.json')),after=privateText(join(manifest.directory,'users-after.json')),next=readPrivateJson(join(manifest.directory,'users-after.json'),32000)
 const created=next.filter(x=>!JSON.parse(before).some(old=>old.id===x.id))
 if(created.length!==4||created.some(x=>!x.pilotTester||!testerNames.includes(x.username)||x.id!==x.username)||JSON.parse(before).some(old=>JSON.stringify(next.find(x=>x.id===old.id))!==JSON.stringify(old)))throw Error('Préparation incohérente')
 createPilotAuthenticator({enabled:true,users:next,maxAttempts:100,windowMs:60000,isSecureRequest:()=>false}).stop()
 if(privateText(file)===after)return {changed:false}
 replace(file,before,after);try{load(configFile,siteDirectory)}catch(error){replace(file,after,before);throw error}
 return {changed:true}
}
export function disableTester({configFile,siteDirectory,username}={}){
 const options=load(configFile,siteDirectory),user=options.users.find(x=>x.username===username)
 if(!user?.pilotTester)throw Error('Compte testeur requis ; accès administrateur conservé')
 const file=join(options.privateDirectory,'users.json'),before=privateText(file),backup=file+'.before-disable-'+randomUUID()
 writeFileSync(backup,before,{mode:0o600,flag:'wx'});replace(file,before,JSON.stringify(options.users.filter(x=>x.username!==username),null,2)+'\n');return {backup}
}
export function testerReport({configFile,siteDirectory}={}){
 const options=load(configFile,siteDirectory),users=options.users.filter(x=>x.pilotTester===true),directory=join(options.privateDirectory,'participant-usage')
 if(!users.length)return []
 if(!existsSync(directory))return users.map(u=>({username:u.username,status:'Pas encore utilisé'}))
 const usage=createParticipantUsage({directory,ids:testerNames,...(options.participantLimits??{})})
 return testerNames.map(username=>({username,active:users.some(u=>u.username===username),...usage.report(username)}))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [action,configFile,username]=process.argv.slice(2),args={configFile,siteDirectory:process.cwd(),username}
  if(action==='--create'){const result=await provisionFourTesters(args);console.log('Quatre accès préparés et NON activés. Accès existants conservés.\nDossier privé : '+result.backup);console.log(result.files.join('\n'));console.log('Activation distincte après le jalon du pilote. Aucun appel IA lancé.')}
  else if(action==='--activate'){const result=activateTesterBatch(args);console.log(result.changed?'Quatre accès activés dans la configuration. Redémarrage nécessaire.':'Quatre accès déjà présents ; aucun changement.')}
  else if(action==='--report')console.log(JSON.stringify(testerReport(args),null,2))
  else if(action==='--disable'){console.log('Accès testeur retiré. Sauvegarde : '+disableTester(args).backup);console.log('Redémarrage nécessaire. Recherches et compteurs conservés.')}
  else throw Error('Utiliser --create, --activate, --report ou --disable avec le fichier de configuration privé')
 }catch(error){console.error(error.message);process.exitCode=1}
}

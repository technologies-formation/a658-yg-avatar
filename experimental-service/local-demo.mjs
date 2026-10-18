// Essai interactif local, sans connexion a Luna ou a OpenAI.
import http from 'node:http'
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createGuard } from './server.mjs'
import { validateProfileReferences, MAX_REFERENCE_BYTES } from './profile-references.mjs'

const source = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')
const start = source.indexOf('function previewRequest(){')
const end = source.indexOf('\nfunction summary(){', start)
if (start < 0 || end < 0) throw new Error('Interface V5 modifiee : adaptation necessaire')
const replacement = `async function previewRequest(){
 const issues=validateDraft();
 if(issues.length){bubble('Demande invalide : '+issues.join(', '));return}
 if(referenceFields&&!canSimulate()){bubble('Actualise les choix et confirme le profil avant la simulation.');return}
 invalidateSimulation();
 const revision=requestRevision;
 const type=intent==='Parcours de formation'?'pathway':'search';
 const profile=pathwayPayload();
 const payload=type==='search'?{type,profile,query:searchDraft().query}:{type,profile};
 try{
  const response=await fetch('/local/validate',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,referenceRevision,confirmed:referenceFields?true:undefined})});
  const result=await response.json();
  if(revision!==requestRevision)return;
  if(response.status===409||response.status===503){referencesReady=false;confirmedRevision=null;setReferenceStatus('Les choix doivent être revalidés. Tes réponses sont conservées : actualise les choix, puis vérifie et confirme le profil.');}
  showSimulation(response.ok?'Service local : '+result.message+' ('+result.quota.total+'/'+result.quota.maxTotalRequests+')':'Simulation refusee ('+response.status+') : '+result.error,revision);
 }catch{showSimulation('Service local indisponible. Aucun appel distant effectue.',revision)}
}`
const page = (source.slice(0,start)+replacement+source.slice(end))
 .replace('Démonstration · aucun appel API','Simulation locale · aucun appel OpenAI')
 .replace('V5 renforcée : validation locale des données API, sans connexion au moteur.','Simulation interactive locale, sans connexion au moteur.')
 .replace('Prototype de démonstration indépendant :','Mode de test local indépendant :')

export function createLocalDemo({ port=8799, stateFile=join(homedir(),'.a658-yg-avatar-local-quotas.json'), enabled=()=>true, maxDailyRequests=5, maxTotalRequests=20, profileReferences=null, loadProfileReferences=null }={}) {
 if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Port invalide')
 const origin='http://127.0.0.1:'+port
 const token=randomBytes(32).toString('hex')
 let references=loadProfileReferences?validateProfileReferences(loadProfileReferences()):profileReferences===null?null:validateProfileReferences(profileReferences)
 const readReferences=()=>{if(loadProfileReferences)references=validateProfileReferences(loadProfileReferences());return references}
 // Échapper '<' empêche un libellé de fermer la balise script. Le DOM utilise textContent.
 const renderPage=()=>{
  const serialized=references?JSON.stringify(references.pathway.fields).replace(/</g,'\\u003c'):null
  return page.replace('/*PROFILE_REFERENCES*/null',serialized?'JSON.parse('+JSON.stringify(serialized)+')':'null')
   .replace('/*REFERENCE_REVISION*/null',JSON.stringify(references?.revision??null))
   .replace('/*LOCAL_REFERENCES*/false',JSON.stringify(Boolean(references)))
 }
 const guard=createGuard({token,stateFile,enabled,maxDailyRequests,maxTotalRequests,profileReferences:references,getProfileReferences:references?()=>references:null})
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))}
  if(req.headers.host!=='127.0.0.1:'+port) return json(403,{error:'Hote interdit'})
  if(req.method==='GET'&&(req.url==='/'||req.url==='/local/profile-references')){
   if(req.headers.origin&&req.headers.origin!==origin)return json(403,{error:'Origine interdite'})
   try{readReferences()}catch{return json(503,{error:'Référentiel indisponible : brouillon conservé.'})}
   if(req.url==='/local/profile-references')return references?json(200,references):json(404,{error:'Mode sans référentiel'})
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(renderPage());return
  }
  if(req.method!=='POST'||req.url!=='/local/validate') return json(404,{error:'Route inconnue'})
  if(req.headers.origin!==origin) return json(403,{error:'Origine interdite'})
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json') return json(415,{error:'JSON requis'})
  let length=0;const chunks=[]
  try{
   for await(const chunk of req){length+=chunk.length;if(length>16000)return json(413,{error:'Requete trop volumineuse'});chunks.push(chunk)}
   let body
   try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return json(400,{error:'JSON invalide'})}
   if(!body||typeof body!=='object'||Array.isArray(body))return json(400,{error:'Corps JSON invalide'})
   try{readReferences()}catch{return json(503,{error:'Référentiel indisponible : brouillon conservé.'})}
   if(references&&body?.referenceRevision!==references.revision)return json(409,{error:'Référentiel modifié : conserver le brouillon et recharger les choix.'})
   if(references&&body.confirmed!==true)return json(400,{error:'Confirmation du profil requise.'})
   const result=guard.check(token,body)
   return json(result.status,result)
  }catch{if(!res.writableEnded)json(400,{error:'Requete interrompue'})}
 })
 return {server,guard,origin}
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const port=Number(process.env.AVATAR_LOCAL_PORT||8799)
 const maxDailyRequests=Number(process.env.AVATAR_MAX_DAILY_REQUESTS||5)
 const maxTotalRequests=Number(process.env.AVATAR_MAX_TOTAL_REQUESTS||20)
 let loadProfileReferences=null
 if(process.env.AVATAR_PROFILE_REFERENCES_FILE){
  const path=process.env.AVATAR_PROFILE_REFERENCES_FILE
  loadProfileReferences=()=>{
   if(statSync(path).size>MAX_REFERENCE_BYTES)throw new Error('Fichier de référentiels trop volumineux')
   return validateProfileReferences(JSON.parse(readFileSync(path,'utf8')))
  }
 }
 const {server,origin}=createLocalDemo({port,maxDailyRequests,maxTotalRequests,loadProfileReferences,enabled:()=>process.env.AVATAR_TEST_ENABLED==='true'})
 server.listen(port,'127.0.0.1',()=>console.log('Avatar local : '+origin))
}

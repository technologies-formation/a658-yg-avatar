// Essai interactif local, sans connexion a Luna ou a OpenAI.
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createGuard } from './server.mjs'

const source = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')
const start = source.indexOf('function previewRequest(){')
const end = source.indexOf('\nfunction summary(){', start)
if (start < 0 || end < 0) throw new Error('Interface V5 modifiee : adaptation necessaire')
const replacement = `async function previewRequest(){
 const issues=validateDraft();
 if(issues.length){bubble('Demande invalide : '+issues.join(', '));return}
 const type=intent==='Parcours de formation'?'pathway':'search';
 const profile=pathwayPayload();
 const payload=type==='search'?{type,profile,query:searchDraft().query}:{type,profile};
 try{
  const response=await fetch('/local/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json();
  bubble(response.ok?'Service local : '+result.message+' ('+result.quota.total+'/'+result.quota.maxTotalRequests+')':'Simulation refusee ('+response.status+') : '+result.error);
 }catch{bubble('Service local indisponible. Aucun appel distant effectue.')}
}`
const page = (source.slice(0,start)+replacement+source.slice(end))
 .replace('Démonstration · aucun appel API','Simulation locale · aucun appel OpenAI')
 .replace('V5 renforcée : validation locale des données API, sans connexion au moteur.','Simulation interactive locale, sans connexion au moteur.')
 .replace('Prototype de démonstration indépendant :','Mode de test local indépendant :')

export function createLocalDemo({ port=8799, stateFile=join(homedir(),'.a658-yg-avatar-local-quotas.json'), enabled=()=>true }={}) {
 if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Port invalide')
 const origin='http://127.0.0.1:'+port
 const token=randomBytes(32).toString('hex')
 const guard=createGuard({token,stateFile,enabled})
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))}
  if(req.headers.host!=='127.0.0.1:'+port) return json(403,{error:'Hote interdit'})
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(page);return}
  if(req.method!=='POST'||req.url!=='/local/validate') return json(404,{error:'Route inconnue'})
  if(req.headers.origin!==origin) return json(403,{error:'Origine interdite'})
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json') return json(415,{error:'JSON requis'})
  let length=0;const chunks=[]
  try{
   for await(const chunk of req){length+=chunk.length;if(length>16000)return json(413,{error:'Requete trop volumineuse'});chunks.push(chunk)}
   let body
   try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return json(400,{error:'JSON invalide'})}
   const result=guard.check(token,body)
   return json(result.status,result)
  }catch{if(!res.writableEnded)json(400,{error:'Requete interrompue'})}
 })
 return {server,guard,origin}
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const port=Number(process.env.AVATAR_LOCAL_PORT||8799)
 const {server,origin}=createLocalDemo({port,enabled:()=>process.env.AVATAR_TEST_ENABLED==='true'})
 server.listen(port,'127.0.0.1',()=>console.log('Avatar local : '+origin))
}

import {EmailError} from './research-email.mjs'
export function createResearchEmailHandler({mail,entry,publicOrigin}){
 const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))}
 return async(req,res,context)=>{
  if(req.url!=='/private/research-email')return false
  if(!mail?.enabled){send(res,503,{error:'Envoi par courriel indisponible.'});return true}
  if(req.method!=='POST'){send(res,405,{error:'Méthode refusée'});return true}
  if(req.headers.origin!==publicOrigin){send(res,403,{error:'Origine requise'});return true}
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json'){send(res,415,{error:'JSON requis'});return true}
  try{
   const chunks=[];let bytes=0
   for await(const chunk of req){bytes+=chunk.length;if(bytes>2048){send(res,413,{error:'Requête trop volumineuse'});return true}chunks.push(chunk)}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new EmailError('invalid_email_request')}
   if(!body||Array.isArray(body)||Object.keys(body).sort().join(',')!=='confirmed,number,recipient,requestId'||!Number.isSafeInteger(body.number))throw new EmailError('invalid_email_request')
   const value=await entry(context.identity),snapshot=value.pathways.find(x=>x.number===body.number)
   if(!snapshot){send(res,404,{error:'Cette recherche n’est plus disponible.'});return true}
   const result=await mail.send({identity:context.identity.id,snapshot,references:value.references,...body,signal:context.signal})
   if(!context.signal.aborted)send(res,200,result)
  }catch(error){
   const messages={invalid_email:'Saisissez une adresse de courriel valide.',invalid_email_request:'Confirmez l’envoi depuis la recherche sélectionnée.',mail_busy:'Un envoi est en cours. Aucun nouvel envoi lancé.',mail_limit:'La limite quotidienne des envois est atteinte.',mail_duplicate:'Un envoi de cette recherche à cette adresse a déjà été tenté aujourd’hui. Vérifiez votre messagerie avant toute autre démarche.',mail_unconfirmed:'L’envoi n’a pas pu être confirmé. Il peut néanmoins avoir été transmis. Vérifiez votre messagerie ; aucune relance automatique.'}
   const code=error instanceof EmailError?error.code:'mail_unavailable'
   if(!context.signal.aborted&&!res.writableEnded)send(res,code==='mail_limit'?429:['mail_duplicate','mail_busy'].includes(code)?409:['invalid_email','invalid_email_request'].includes(code)?400:503,{code,error:messages[code]??'L’envoi est indisponible. Votre recherche reste conservée.'})
  }
  return true
 }
}

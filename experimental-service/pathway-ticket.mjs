// Récupération bornée d'une lecture gratuite. Aucun POST ni transport moteur ici.
import {readPrivateResponse} from './private-response.mjs'
const wait=(ms,signal)=>new Promise((resolve,reject)=>{
 const cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(new DOMException('Interrompu','AbortError'))}
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve()},ms)
 signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel()
})
export async function requestPathwayTicket({fetchImpl=globalThis.fetch,signal,onRecovery=()=>{},waitImpl=wait}={}){
 for(let attempt=0;attempt<2;attempt++){
  signal?.throwIfAborted()
  const response=await fetchImpl('/private/profile-references',{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal})
  let value
  try{value=await readPrivateResponse(response)}catch(error){
   if(attempt!==0||error.code!=='secure_transport_required')throw error
   onRecovery();await waitImpl(5100,signal);continue
  }
  if(!response.ok)throw Error('Choix indisponibles ('+response.status+'). Vos critères sont conservés ; aucune génération lancée.')
  if(!value.references?.pathway?.fields||typeof value.references.revision!=='string'||typeof value.requestId!=='string')throw Error('Référentiel invalide')
  return value
 }
}

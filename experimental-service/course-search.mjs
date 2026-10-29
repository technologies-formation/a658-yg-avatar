// Recherche Catalogue réutilisée sans dialogue IA supplémentaire ni profil inventé.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { protectedDirectory } from './consumption-ledger.mjs'
import { readCatalogueVersion } from './catalogue-version.mjs'
import { validatePathwayResult, SEARCH_RESULT_NOTE } from './pathway-result.mjs'
const origin='https://api.a658yg-catalogue.ch'
const fail=code=>{throw Object.assign(Error(code),{code})}
export async function readBoundedJson(response,limit=4*1024*1024){
 if(!response.ok||response.redirected||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))fail('catalogue_unavailable')
 let bytes=0;const chunks=[]
 for await(const chunk of response.body??[]){bytes+=chunk.length;if(bytes>limit)fail('response_size');chunks.push(chunk)}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export function createCourseSearch({directory,fetchImpl=globalThis.fetch,reportingToken}={}){
 protectedDirectory(directory)
 let busy=false,stopped=false;const shutdown=new AbortController()
 return {stop(){stopped=true;shutdown.abort()},async search({query,requestId,confirmed,identity,signal}){
  if(stopped)fail('disabled')
  if(busy)fail('busy')
  if(confirmed!==true)fail('unconfirmed')
  if(typeof query!=='string'||!query.trim()||query.length>1000||typeof identity!=='string'||!identity||typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,128}$/.test(requestId))fail('invalid_request')
  busy=true
  const combined=AbortSignal.any([shutdown.signal,signal??new AbortController().signal,AbortSignal.timeout(200000)])
  try{
   const catalogue=await readBoundedJson(await fetchImpl(origin+'/api/catalogue',{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/json'},signal:combined}))
   if(!Array.isArray(catalogue.courses)||catalogue.courses.length>10000||!readCatalogueVersion(catalogue.catalogue))fail('catalogue_unavailable')
   combined.throwIfAborted()
   // Réservation durable avant le POST. Aucun remboursement ni relance après erreur.
   const id=createHash('sha256').update(JSON.stringify([identity,requestId])).digest('hex')
   try{writeFileSync(join(directory,id+'.json'),JSON.stringify({version:1,at:new Date().toISOString()}),{flag:'wx',mode:0o600})}catch(error){if(error.code==='EEXIST')fail('duplicate_request');throw error}
   const value=await readBoundedJson(await fetchImpl(origin+'/api/search',{method:'POST',redirect:'error',credentials:'omit',headers:{Accept:'application/json','Content-Type':'application/json',...(reportingToken?{'X-A658-Report-Token':reportingToken}:{})},body:JSON.stringify({query:query.trim()}),signal:combined}),512*1024)
   if(value.ok!==true||!Array.isArray(value.results))fail('invalid_response')
   const version=readCatalogueVersion(value.catalogue)
   if(!version||version.snapshotHash!==catalogue.catalogue.snapshotHash)fail('catalogue_changed')
   const byCode=new Map(catalogue.courses.map(c=>[c.code,c])),seen=new Set()
   const map=items=>{if(!Array.isArray(items)||items.length>100)fail('invalid_response');return items.map((item,index)=>{
    const c=byCode.get(item.code);if(!c||seen.has(c.code))fail('invalid_response');seen.add(c.code)
    const raw=c.officialData??{}
    return {position:index+1,rationale:SEARCH_RESULT_NOTE,course:{code:c.code,title:raw.titleRaw??c.title,sourceUrl:c.sourceUrl,duration:raw.durationRaw??c.duration??'',public:raw.publicRaw??c.public??'',...(typeof raw.hasOpenSession==='boolean'?{sessionAvailability:{source:'official-session-icons',observedOn:raw.sourceSnapshotDate??version.snapshotDate,hasOpenSession:raw.hasOpenSession,hasScheduledSession:raw.hasScheduledSession===true,...(raw.scheduledOpeningDates?.length?{scheduledOpeningDates:raw.scheduledOpeningDates}:{})}}:{})}}
   })}
   const result={ok:true,searchQuery:query.trim(),summary:typeof value.reason==='string'&&value.reason.trim()?value.reason:'Voici les formations trouvées pour votre recherche.',recommendedSteps:map(value.recommendedResults??value.results),optionalSteps:map(value.complementaryResults??[]),informationalCourses:map(value.relatedResults??[]),catalogue:version,abstain:value.abstain===true}
   validatePathwayResult(result)
   return result
  }finally{busy=false}
 }}
}

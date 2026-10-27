import test from 'node:test'
import assert from 'node:assert/strict'
import {readCatalogueVersion,catalogueVersionLabel} from './catalogue-version.mjs'
import {fetchCatalogueStatus} from './catalogue-status.mjs'
import {validatePathwayResult} from './pathway-result.mjs'
import {createPdfModel} from './pathway-pdf.mjs'
import {createMessagingSnapshot} from './messaging-state.mjs'
import {data} from './result-test-fixtures.mjs'
const version={snapshotDate:'2026-10-26',snapshotHash:'a'.repeat(64)}
test('provenance : anciennes recherches, date figée, PDF et simulation sans date inventée',()=>{
 const result=data();result.catalogue=version
 validatePathwayResult(result)
 const saved=createMessagingSnapshot({objective:'Test'},result,'a'.repeat(64),1,'Indifférent','real')
 const model=createPdfModel(saved,{now:new Date('2026-10-27T12:00:00Z')})
 assert.equal(model.catalogueLabel,'Résultats basés sur le catalogue du 26.10.2026.')
 assert.match(catalogueVersionLabel(undefined,{results:true}),/non renseignée/)
 assert.match(catalogueVersionLabel(version,{simulation:true}),/Exemple simulé/)
 for(const invalid of [{...version,snapshotDate:'2026-02-30'},{...version,snapshotHash:'incorrect'},null]){
  assert.equal(readCatalogueVersion(invalid),null);assert.throws(()=>validatePathwayResult({...result,catalogue:invalid}))
 }
})
test('date disponible : lecture bornée de la seule santé publique, sans clé ni appel IA',async()=>{
 let calls=0
 const value=await fetchCatalogueStatus({fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://api.a658yg-catalogue.ch/api/health');assert.equal(options.method,'GET');assert.deepEqual(options.headers,{Accept:'application/json'});assert.equal(options.redirect,'error');return new Response(JSON.stringify({ok:true,catalogue:version}),{headers:{'Content-Type':'application/json'}})}})
 assert.deepEqual(value,version);assert.equal(calls,1)
 for(const body of ['x'.repeat(32769),JSON.stringify({ok:true,catalogue:{snapshotDate:'hier'}})])await assert.rejects(fetchCatalogueStatus({fetchImpl:async()=>new Response(body,{headers:{'Content-Type':'application/json'}})}))
})

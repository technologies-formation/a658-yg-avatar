import {readCatalogueVersion} from './catalogue-version.mjs'
// Lecture publique bornée ; ni clé, ni jeton de collecte, ni appel au moteur.
export async function fetchCatalogueStatus({fetchImpl=globalThis.fetch}={}){
 const response=await fetchImpl('https://api.a658yg-catalogue.ch/api/health',{method:'GET',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)})
 if(!response.ok||response.redirected||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('Date du catalogue indisponible')
 let length=0;const parts=[]
 for await(const part of response.body??[]){length+=part.length;if(length>32768)throw Error('Relevé trop volumineux');parts.push(part)}
 const value=JSON.parse(Buffer.concat(parts).toString('utf8')),version=readCatalogueVersion(value.catalogue)
 if(value.ok!==true||!version)throw Error('Relevé du catalogue invalide')
 return version
}

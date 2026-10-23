import {readFileSync} from 'node:fs';
import {validateProfileReferences} from './profile-references.mjs';
const page=readFileSync(new URL('./messaging-page.html',import.meta.url),'utf8');
export function renderMessagingPage(references,{timeoutMs=10000}={}){
 const contract=validateProfileReferences(references);
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>210000)throw Error('Délai invalide');
 return page.replace('/*MESSAGING_CONFIG*/',JSON.stringify({references:contract,timeoutMs,mode:'simulation'}).replace(/</g,'\\u003c'));
}

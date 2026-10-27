import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,existsSync,statSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createDeviceMemory,DEVICE_MEMORY_TTL} from './device-memory.mjs'
import {createDeviceCopyStore} from './device-memory-client.mjs'
import {references} from './reference-test-fixtures.mjs'
import {createMessagingSnapshot} from './messaging-state.mjs'
import {data} from './result-test-fixtures.mjs'
const state=()=>{const r=references(),profile={personnelCategory:'TEST-A',role:'Assistant fictif',objective:'Préparer les rapports de test'},pathway=createMessagingSnapshot(profile,data(),r.revision,1,'En ligne','simulation');return {version:2,profile,modality:'En ligne',referenceRevision:r.revision,pathway,pathways:[pathway],nextNumber:2}}
test('copie : choix explicite, signature persistante, trente jours fixes et isolation des accès',t=>{
 const root=mkdtempSync(join(tmpdir(),'device-memory-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const directory=join(root,'memory');let clock=Date.parse('2026-10-26T12:00:00Z')
 const options={directory,origin:'https://test.invalid',now:()=>clock},memory=createDeviceMemory(options),saved=state()
 assert.equal(existsSync(directory),false)
 const copy=memory.issue('alice',saved)
 assert.equal(copy.expiresAt-clock,DEVICE_MEMORY_TTL);assert.equal(statSync(join(directory,'device-copy-key.json')).mode&0o777,0o600)
 assert.deepEqual(createDeviceMemory(options).verify('alice',copy),saved)
 assert.throws(()=>memory.verify('bob',copy));assert.throws(()=>memory.verify('alice',{...copy,state:{...saved,profile:{role:'Altération'}}}))
 clock+=1000
 assert.equal(memory.issue('alice',saved,copy.expiresAt).expiresAt,copy.expiresAt)
 assert.throws(()=>memory.issue('alice',saved,clock+DEVICE_MEMORY_TTL+1))
 clock=copy.expiresAt;assert.throws(()=>memory.verify('alice',copy))
 assert.equal(JSON.stringify(copy).includes('signature'),true);assert.equal(JSON.stringify(copy).includes('apiKey'),false)
})
test('copie locale : aucune écriture avant consentement, expiration, effacement et accès séparés',()=>{
 let clock=1000;const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}
 const scope='a'.repeat(64),copy={issuedAt:clock,expiresAt:clock+DEVICE_MEMORY_TTL,scope,signature:'b'.repeat(64)},record={version:1,scope,copy,stateToken:'c'.repeat(64)}
 const a=createDeviceCopyStore({storage,scope,now:()=>clock}),b=createDeviceCopyStore({storage,scope:'d'.repeat(64),now:()=>clock})
 assert.equal(a.read(),null);assert.equal(values.size,0);a.write(record);assert.deepEqual(a.read(),record);assert.equal(b.read(),null)
 assert.throws(()=>b.write(record));assert.equal(values.size,1)
 a.forget();assert.equal(values.size,0);a.write(record);clock=copy.expiresAt;assert.equal(a.read(),null);assert.equal(values.size,0)
 storage.setItem(a.key,'<script>');assert.equal(a.read(),null);assert.equal(values.size,0)
})

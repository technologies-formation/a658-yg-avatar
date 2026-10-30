import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readdirSync,writeFileSync,chmodSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createParticipantConsent,CONFIDENTIALITY_VERSION} from './participant-consent.mjs'
test('consigne : quatre identités indépendantes, accord explicite, persistance, aucun message enregistré',t=>{
 const directory=mkdtempSync(join(tmpdir(),'consent-'));t.after(()=>rmSync(directory,{recursive:true,force:true}))
 const ids=['one','two','three','four'],store=createParticipantConsent({directory,ids})
 for(const id of ids)assert.equal(store.status(id).accepted,false)
 assert.deepEqual(store.status('admin'),{required:false})
 assert.throws(()=>store.accept('one',{accepted:false,version:CONFIDENTIALITY_VERSION}))
 assert.throws(()=>store.accept('one',{accepted:true,version:'old'}))
 assert.equal(store.accept('one',{accepted:true,version:CONFIDENTIALITY_VERSION}).accepted,true)
 assert.equal(store.accept('one',{accepted:true,version:CONFIDENTIALITY_VERSION}).accepted,true)
 assert.equal(readdirSync(directory).length,1)
 const reopened=createParticipantConsent({directory,ids});assert.equal(reopened.status('one').accepted,true)
 for(const id of ids.slice(1))assert.equal(reopened.status(id).accepted,false)
})
test('consigne : stockage corrompu ou non protégé refuse les échanges',t=>{
 const directory=mkdtempSync(join(tmpdir(),'consent-'));t.after(()=>rmSync(directory,{recursive:true,force:true}))
 const store=createParticipantConsent({directory,ids:['one']});store.accept('one',{accepted:true,version:CONFIDENTIALITY_VERSION})
 const file=join(directory,readdirSync(directory)[0]);writeFileSync(file,'{}');assert.throws(()=>store.status('one'),{code:'confidentiality_storage'})
 chmodSync(file,0o644);assert.throws(()=>store.status('one'),{code:'confidentiality_storage'})
})

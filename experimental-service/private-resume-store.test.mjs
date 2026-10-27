import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readdirSync,statSync,readFileSync,writeFileSync,chmodSync,symlinkSync,unlinkSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createPrivateResumeStore} from './private-resume-store.mjs'
import {createMessagingSnapshot} from './messaging-state.mjs'
import {references} from './reference-test-fixtures.mjs'
import {data} from './result-test-fixtures.mjs'
const state=()=>({version:1,profile:{role:'Assistant',objective:'Organiser les tâches'},modality:'En ligne',referenceRevision:references().revision,pathway:createMessagingSnapshot({role:'Assistant',objective:'Organiser les tâches'},data(),references().revision,1,'En ligne','real')})
function fixture(t){const root=mkdtempSync(join(tmpdir(),'avatar-resume-store-')),dir=join(root,'resume');t.after(()=>rmSync(root,{recursive:true,force:true}));return {root,dir,store:createPrivateResumeStore(dir)}}
test('reprise privée : fichiers protégés, identités isolées, cliché exact et copie indépendante',t=>{
 const f=fixture(t),value=state();assert.equal(f.store.read('alice'),null);f.store.write('alice',value)
 assert.equal(f.store.read('bob'),null);assert.deepEqual(f.store.read('alice'),value)
 value.profile.role='Modifié';assert.equal(f.store.read('alice').profile.role,'Assistant')
 const [name]=readdirSync(f.dir);assert.match(name,/^[a-f0-9]{64}\.json$/);assert.equal(statSync(join(f.dir,name)).mode&0o077,0);assert.equal(statSync(f.dir).mode&0o077,0)
 assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(f.dir,name),'utf8'))).sort(),['modality','pathway','profile','referenceRevision','version'])
 assert.deepEqual(createPrivateResumeStore(f.dir).read('alice'),f.store.read('alice'))
})
test('corruption ou lien symbolique : refus sans écraser une sauvegarde ni sa cible',t=>{
 const f=fixture(t);f.store.write('alice',state());const path=join(f.dir,readdirSync(f.dir)[0]);writeFileSync(path,'invalide')
 assert.throws(()=>f.store.read('alice'),e=>e.code==='resume_unavailable');assert.equal(readFileSync(path,'utf8'),'invalide')
 unlinkSync(path);const target=join(f.root,'target');writeFileSync(target,'NE PAS MODIFIER',{mode:0o600});symlinkSync(target,path)
 assert.throws(()=>f.store.read('alice'));assert.throws(()=>f.store.write('alice',state()));assert.equal(readFileSync(target,'utf8'),'NE PAS MODIFIER')
})
test('dossier trop ouvert ou données invalides : refus, sauvegarde précédente conservée',t=>{
 const f=fixture(t);f.store.write('alice',state());const before=f.store.read('alice')
 for(const value of [{...state(),profile:{secret:'non autorisé'}},{...state(),modality:'Inventée'},{...state(),pathway:{...state().pathway,mode:'inventé'}}])assert.throws(()=>f.store.write('alice',value))
 assert.deepEqual(f.store.read('alice'),before)
 chmodSync(f.dir,0o755);assert.throws(()=>f.store.read('alice'));assert.throws(()=>createPrivateResumeStore(f.dir))
})

test('historique v2 : migration v1 sans perte, fermeture sans réutiliser un numéro, sélection exacte et refus des doublons',t=>{
 const f=fixture(t),legacy=state();f.store.write('alice',legacy)
 assert.deepEqual(f.store.read('alice'),legacy)
 const second=createMessagingSnapshot({...legacy.profile,objective:'Deuxième besoin'},data(),references().revision,2,'Présentiel','simulation')
 const value={...legacy,version:2,pathways:[legacy.pathway,second],pathway:legacy.pathway,nextNumber:3}
 f.store.write('alice',value);assert.deepEqual(createPrivateResumeStore(f.dir).read('alice'),value)
 for(const invalid of [{...value,pathways:[second,second]},{...value,nextNumber:2},{...value,pathways:[second]},{...value,pathway:null},{...value,pathways:Array(21).fill(second)}])assert.throws(()=>f.store.write('alice',invalid))
 assert.deepEqual(f.store.read('alice'),value)
 const closed={...value,pathways:[],pathway:null};f.store.write('alice',closed);assert.equal(f.store.read('alice').nextNumber,3)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,statSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {provisionFourTesters,activateTesterBatch,disableTester,testerReport} from './provision-testers.mjs'
import {createPilotCredential,createPilotAuthenticator} from './pilot-auth.mjs'
import {references} from './reference-test-fixtures.mjs'
import {data} from './result-test-fixtures.mjs'
const password='ADMIN_TEST_PASSWORD_FICTITIOUS_ONLY'
async function fixture(t){const root=mkdtempSync(join(tmpdir(),'four-testers-')),siteDirectory=join(root,'site'),privateDirectory=join(root,'private');mkdirSync(siteDirectory);mkdirSync(privateDirectory,{mode:0o700});mkdirSync(join(privateDirectory,'dialogue-budget'),{mode:0o700});const admin=await createPilotCredential({id:'admin',username:'admin',password});const configFile=join(privateDirectory,'config.json');for(const [name,value]of Object.entries({'users.json':[admin],'references.json':references(),'preview.json':data(),'config.json':{publicOrigin:'https://avatar.a658yg-catalogue.ch',port:3000,privateDirectory,proxyVerification:'self-https',interface:'dialogue-real-trial',dialogueTrial:{enabled:true,paidTrialAuthorized:true,billingReviewed:true,model:'gpt-6-luna'}}}))writeFileSync(join(privateDirectory,name),JSON.stringify(value),{mode:0o600});writeFileSync(join(privateDirectory,'quotas.json'),'{}',{mode:0o600});t.after(()=>rmSync(root,{recursive:true,force:true}));return {configFile,siteDirectory,privateDirectory,admin}}
test('quatre accès individuels, originaux et compteurs conservés, fichiers privés et authentification simultanée',async t=>{
 const f=await fixture(t),before=readFileSync(join(f.privateDirectory,'users.json'),'utf8');const result=await provisionFourTesters(f);assert.equal(result.created.length,4);assert.equal(readFileSync(join(f.privateDirectory,'users.json'),'utf8'),before);assert.equal(activateTesterBatch(f).changed,true);assert.equal(activateTesterBatch(f).changed,false);const users=JSON.parse(readFileSync(join(f.privateDirectory,'users.json'),'utf8'));assert.equal(users.length,5);assert.deepEqual(users[0],f.admin);assert.equal(readFileSync(join(result.backup,'users-before.json'),'utf8'),before);assert.equal(statSync(result.backup).mode&0o077,0);assert.equal(readFileSync(join(f.privateDirectory,'quotas.json'),'utf8'),'{}');assert.equal(readdirSync(f.siteDirectory).length,0);
 const secrets=result.files.map(file=>{assert.equal(statSync(file).mode&0o077,0);return readFileSync(file,'utf8').match(/Mot de passe : (\S+)/)[1]});assert.equal(new Set(secrets).size,4);assert.ok(secrets.every(x=>!readFileSync(join(f.privateDirectory,'users.json'),'utf8').includes(x)));
 const auth=createPilotAuthenticator({enabled:true,users,maxAttempts:100,windowMs:60000,isSecureRequest:()=>true});const identities=await Promise.all([{username:'admin',password},...result.created.map((username,i)=>({username,password:secrets[i]}))].map(x=>auth.authenticate({headers:{authorization:'Basic '+Buffer.from(x.username+':'+x.password).toString('base64')}})));assert.deepEqual(identities.map(x=>x.id),['admin',...result.created]);auth.stop();
 const installed=readFileSync(join(f.privateDirectory,'users.json'),'utf8');await assert.rejects(provisionFourTesters(f));assert.equal(readFileSync(join(f.privateDirectory,'users.json'),'utf8'),installed);assert.equal(testerReport(f).length,4);
 assert.throws(()=>disableTester({...f,username:'admin'}));disableTester({...f,username:'pilote-02'});assert.equal(JSON.parse(readFileSync(join(f.privateDirectory,'users.json'),'utf8')).length,4);assert.equal(readFileSync(join(f.privateDirectory,'quotas.json'),'utf8'),'{}')
})

test('activation : une modification concurrente des accès ne peut pas être écrasée par la préparation',async t=>{
 const f=await fixture(t);await provisionFourTesters(f);const file=join(f.privateDirectory,'users.json'),current=JSON.stringify([{...f.admin,username:'admin-renamed'}]);writeFileSync(file,current,{mode:0o600});assert.throws(()=>activateTesterBatch(f));assert.equal(readFileSync(file,'utf8'),current)
});

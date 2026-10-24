import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createHostedSimulation,HOSTED_ORIGIN} from './hosted-simulation.mjs';
import {createPilotCredential} from './pilot-auth.mjs';import {references} from './reference-test-fixtures.mjs';import {data} from './result-test-fixtures.mjs';
test('messagerie protégée : interface optionnelle, ticket, confirmation, quota et ressources explicites',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'avatar-messaging-')),password='Mot-de-passe-test-synthetique-uniquement';
 const user=await createPilotCredential({id:'tester',username:'tester',password}),r=references();
 const service=createHostedSimulation({enabled:true,interface:'messaging',publicOrigin:HOSTED_ORIGIN,trustedProxyAddresses:['127.0.0.1'],users:[user],stateFile:join(dir,'quotas.json'),loadProfileReferences:()=>r,preview:data()});
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await service.close();rmSync(dir,{recursive:true,force:true});});
 const request=(path,{body,auth=true,proto='https'}={})=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:service.server.address().port,path,method:body?'POST':'GET',headers:{host:new URL(HOSTED_ORIGIN).host,origin:HOSTED_ORIGIN,'x-forwarded-proto':proto,'content-type':'application/json',...(auth?{authorization:'Basic '+Buffer.from('tester:'+password).toString('base64')}:{})}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}));});req.on('error',reject);req.end(body&&JSON.stringify(body));});
 assert.equal((await request('/private/',{auth:false})).status,401);assert.equal((await request('/private/',{proto:'http'})).status,403);
 const page=await request('/private/');assert.match(page.text,/messaging-config/);assert.match(page.headers['content-security-policy'],/connect-src 'self'/);
 for(const path of ['/private/messaging-client.mjs','/private/messaging-state.mjs','/private/pathway-result.mjs']){assert.equal((await request(path,{auth:false})).status,401);assert.equal((await request(path)).status,200);}
 assert.equal((await request('/private/messaging-page.html')).status,404);assert.equal(service.status().total,0);
 const ticket=JSON.parse((await request('/private/profile-references')).text);const body={profile:{personnelCategory:'TEST-A',role:'Assistant',objective:'Organiser les tâches'},confirmed:true,referenceRevision:r.revision,requestId:ticket.requestId};
 assert.equal((await request('/private/pathway',{body:{...body,confirmed:false}})).status,400);assert.equal(service.status().total,0);
 const response=await request('/private/pathway',{body});assert.equal(response.status,200);assert.equal(JSON.parse(response.text).mode,'simulation');assert.equal(service.status().total,1);assert.equal((await request('/private/pathway',{body})).status,409);
});

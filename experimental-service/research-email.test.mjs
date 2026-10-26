import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID} from 'node:crypto'
import {createResearchEmailService,emailAddress,readHostedEmail} from './research-email.mjs'
import {createMessagingSnapshot} from './messaging-state.mjs'
import {data} from './result-test-fixtures.mjs'
import {AI_GUIDANCE} from './pathway-pdf.mjs'
const from='sender@example.invalid',recipient='reader@example.invalid'
const profile={personnelCategory:'TEST-A',role:'Assistant',objective:'Organiser les tâches de test',existingSkills:'Je débute',timeAvailable:'1 à 2 jours',constraints:'Modalité souhaitée : en ligne'}
const snapshot=createMessagingSnapshot(profile,data(),'test-revision',1,'En ligne','real')
function directory(t){const dir=mkdtempSync(join(tmpdir(),'avatar-email-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir}
const request=()=>({identity:'test-alice',snapshot,recipient,requestId:randomUUID(),confirmed:true})

test('courriel : une adresse seulement, ni nom ni injection d’en-tête',()=>{
 assert.equal(emailAddress(recipient),recipient)
 for(const value of ['',' x@example.invalid','Nom <x@example.invalid>','a@example.invalid,b@example.invalid','a@example.invalid\r\nBcc: b@example.invalid','a..b@example.invalid','a@localhost'])assert.throws(()=>emailAddress(value))
})
test('courriel : PDF du cliché, mention IA/RH et aucune adresse conservée dans le registre',async t=>{
 const dir=directory(t),messages=[],service=createResearchEmailService({directory:dir,from,transport:{async sendMail(message){messages.push(message);return {accepted:[recipient],rejected:[]}}}})
 const before=structuredClone(snapshot),body=request();assert.deepEqual(await service.send(body),{accepted:true})
 assert.equal(messages.length,1);const mail=messages[0];assert.equal(mail.to.address,recipient);assert.equal(mail.from.address,from);assert.ok(mail.text.includes(AI_GUIDANCE));assert.equal(mail.attachments.length,1);assert.ok(mail.attachments[0].content.length>10000);assert.match(mail.attachments[0].content.toString('ascii',0,8),/^%PDF-/);assert.equal(mail.disableFileAccess,true);assert.equal(mail.disableUrlAccess,true);assert.deepEqual(snapshot,before)
 const registry=readdirSync(dir).map(name=>readFileSync(join(dir,name),'utf8')).join('');assert.doesNotMatch(registry,/reader@|sender@|Organiser|Assistant/);assert.match(registry,/accepted/)
 await assert.rejects(service.send(body),{code:'mail_duplicate'})
 await assert.rejects(service.send(request()),{code:'mail_duplicate'})
 assert.equal(messages.length,1)
})
test('courriel : les réservations et doublons survivent à une réouverture et à une issue incertaine',async t=>{
 const dir=directory(t);let calls=0;const transport={async sendMail(){calls++;throw Error('SECRET_SMTP_DETAIL')}}
 const buildPdf=()=>({model:{title:'Exemple',filename:'synthese.pdf'},content:Buffer.from('%PDF-test')})
 const service=()=>createResearchEmailService({directory:dir,from,transport,buildPdf})
 await assert.rejects(service().send(request()),{code:'mail_unconfirmed'})
 await assert.rejects(service().send(request()),{code:'mail_duplicate'})
 assert.equal(calls,1)
})
test('courriel : annulation, confirmation, plafond quotidien et doublons concurrents',async t=>{
 const dir=directory(t);let calls=0,release
 const transport={async sendMail(message){calls++;if(calls===1)await new Promise(resolve=>{release=resolve});return {accepted:[message.to.address],rejected:[]}}}
 const service=createResearchEmailService({directory:dir,from,transport,buildPdf:()=>({model:{title:'Test',filename:'test.pdf'},content:Buffer.from('%PDF-test')})})
 await assert.rejects(service.send({...request(),confirmed:false}),{code:'invalid_email_request'})
 await assert.rejects(service.send({...request(),signal:AbortSignal.abort()}),{code:'mail_cancelled'})
 const pending=service.send(request());await assert.rejects(service.send(request()),{code:'mail_busy'});release();await pending
 for(let i=1;i<5;i++)await service.send({...request(),recipient:'test'+i+'@example.invalid'})
 await assert.rejects(service.send({...request(),recipient:'other@example.invalid'}),{code:'mail_limit'});assert.equal(calls,5)
})
test('courriel : activation absente ne lit aucun secret et activation SMTP force TLS et absence de journaux',t=>{
 const environment={get AVATAR_MAIL_FROM(){throw Error('secret read')}};assert.equal(readHostedEmail(environment,'/unused'),null)
 let settings;const dir=directory(t)
 assert.ok(readHostedEmail({AVATAR_MAIL_ENABLED:'true',AVATAR_MAIL_FROM:from,AVATAR_MAIL_PASSWORD:'FAKE_LOCAL_ONLY'},dir,{loadNodemailer:()=>({createTransport(value){settings=value;return {sendMail(){throw Error('must not send at startup')}}}})}).enabled)
 assert.equal(settings.host,'mail.infomaniak.com');assert.equal(settings.secure,true);assert.equal(settings.tls.rejectUnauthorized,true);assert.equal(settings.logger,false);assert.equal(settings.debug,false);assert.equal(settings.maxRecipients,1)
})

test('courriel : limite globale persistante, indépendante des identités et des quotas IA',async t=>{
 const dir=directory(t);let calls=0
 const options={directory:dir,from,transport:{async sendMail(message){calls++;return {accepted:[message.to.address]}}},buildPdf:()=>({model:{title:'Test',filename:'test.pdf'},content:Buffer.from('%PDF-test')})}
 for(let i=0;i<20;i++)await createResearchEmailService(options).send({...request(),identity:'user-'+Math.floor(i/5),recipient:'reader'+i+'@example.invalid'})
 await assert.rejects(createResearchEmailService(options).send({...request(),identity:'new-user'}),{code:'mail_limit'})
 assert.equal(calls,20)
})

// Vérification MIME avec Nodemailer réel et transport mémoire : aucune connexion SMTP.
import {createRequire} from 'node:module'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import assert from 'node:assert/strict'
import {createResearchEmailService} from './research-email.mjs'
import {createMessagingSnapshot} from './messaging-state.mjs'
import {data} from './result-test-fixtures.mjs'
const require=createRequire(import.meta.url),nodemailer=require(process.env.AVATAR_NODEMAILER_MODULE)
const directory=mkdtempSync(join(tmpdir(),'avatar-email-mime-'))
try{
 const mime=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows',disableFileAccess:true,disableUrlAccess:true});let message
 const service=createResearchEmailService({directory,from:'sender@example.invalid',transport:{async sendMail(value){const info=await mime.sendMail(value);message=info.message;return {accepted:info.envelope.to,rejected:[]}}}})
 const profile={personnelCategory:'TEST-A',role:'Assistant',objective:'Structurer les documents de test',existingSkills:'Je débute',timeAvailable:'1 à 2 jours',constraints:'Modalité souhaitée : en ligne'}
 const snapshot=createMessagingSnapshot(profile,data(),'test-revision',1,'En ligne','real')
 await service.send({identity:'mime-test',snapshot,recipient:'reader@example.invalid',requestId:'11aabbee-22cc-4ddd-8eee-99aabbccddee',confirmed:true})
 const raw=message.toString('utf8');assert.match(raw,/Content-Type: multipart\/mixed/);assert.match(raw,/Content-Type: application\/pdf/);assert.match(raw,/Content-Disposition: attachment/);assert.match(raw,/To: reader@example.invalid/);assert.doesNotMatch(raw,/Bcc:/)
 console.log('Message MIME et PDF vérifiés en mémoire ; aucune connexion SMTP.')
}finally{rmSync(directory,{recursive:true,force:true})}

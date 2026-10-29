// Aucun lanceur ne monte cette préparation. Désactivée par défaut, sans accès au privé.
import {Readable} from 'node:stream'
import {randomBytes,createHash} from 'node:crypto'
import {mkdirSync,realpathSync} from 'node:fs'
import {join,relative,isAbsolute} from 'node:path'
import {createPublicPilotLedger,PublicPilotError,PUBLIC_POLICY} from './public-pilot-ledger.mjs'
import {createPublicPilotSessions} from './public-pilot-sessions.mjs'
import {createRealDialogueTrialInterface} from './dialogue-real-trial.mjs'
import {createPilotCredential} from './pilot-auth.mjs'
import {createResearchEmailService,emailAddress} from './research-email.mjs'
import {protectedDirectory} from './consumption-ledger.mjs'
import {readBoundedJson} from './course-search.mjs'
import {PUBLIC_COST_POLICY,verifyPublicCostProof,requirePublicCostPolicy} from './public-cost-policy.mjs'
import {createPublicOpenAIDialogueProvider} from './public-openai-dialogue.mjs'

const messages={
  public_budget_limit:'L’enveloppe de ce test est atteinte. Aucun nouvel appel IA n’a été lancé. Vos recherches restent consultables.',
  public_daily_limit:'Votre limite quotidienne est atteinte. Vos recherches restent consultables.',
  public_cadence:'Merci de patienter quelques secondes avant une nouvelle demande. Aucun nouvel appel IA n’a été lancé.',
  public_busy:'Une demande est déjà en cours. Aucun nouvel appel n’a été lancé ; aucune relance automatique.',
  public_duplicate:'Cette demande a déjà été tentée. Aucune relance automatique.',
  public_mail_recipient:'Cette adresse n’est pas autorisée pour le test. Aucun courriel n’a été envoyé.',
  public_mail_pending:'L’envoi par courriel est en attente de la liste des testeurs autorisés. Le PDF reste disponible.',
  public_mail_limit:'La limite des courriels de ce test est atteinte. Le PDF reste téléchargeable.',
  public_session:'Votre session de test est absente ou expirée. Revenez à la page d’accueil du test.',
  public_bounds_unverified:'Le moteur de ce test n’a pas pu être vérifié. Aucune relance automatique.',
  public_cost_review_expired:'La période de ce test est terminée. Vos recherches restent consultables.',
}
const errorValue=error=>{const message=messages[error.code]??'Le test est indisponible. Aucune relance automatique.';return {code:error instanceof PublicPilotError?error.code:'public_unavailable',publicMessage:message,error:message}}
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))}
const catalogueOrigin='https://api.a658yg-catalogue.ch',openaiOrigin='https://api.openai.com'
const canonicalEmail=value=>{const address=emailAddress(value),at=address.lastIndexOf('@');return address.slice(0,at)+'@'+address.slice(at+1).toLowerCase()}

export function createPreparedPublicPilot(options={}){
  if(options.enabled!==true)return {enabled:false,handler:async(_req,res)=>send(res,503,{code:'public_disabled',publicMessage:'Le test public n’est pas activé.'}),close(){}}
  // Attestations opérateur, pas vérifications automatiques de facturation ou du moteur.
  if(options.billingReviewed!==true||options.backendBoundsReviewed!==true||typeof options.isSecureRequest!=='function')throw new PublicPilotError('public_configuration',503)
  const origin=new URL(options.publicOrigin)
  const recipients=options.allowedRecipients===undefined?[]:options.allowedRecipients
  if(origin.protocol!=='https:'||origin.origin!==options.publicOrigin||typeof options.apiKey!=='string'||!options.apiKey.trim()||
    !Array.isArray(recipients)||recipients.length>2||typeof options.backendToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(options.backendToken))throw new PublicPilotError('public_configuration',503)
  const allowedRecipients=new Set(recipients.map(canonicalEmail))
  if(allowedRecipients.size!==recipients.length)throw new PublicPilotError('public_configuration',503)
  const root=protectedDirectory(options.directory),privateRoot=realpathSync(options.privateDirectory)
  const inside=(a,b)=>{const r=relative(a,b);return !r||(!r.startsWith('..')&&!isAbsolute(r))}
  if(inside(root,privateRoot)||inside(privateRoot,root))throw new PublicPilotError('public_configuration',503)
  const now=options.now??Date.now,fetchImpl=options.fetchImpl??globalThis.fetch
  const ledger=createPublicPilotLedger({directory:join(root,'ledger'),now})
  let sessions,mail
  try{
    sessions=createPublicPilotSessions({directory:join(root,'sessions'),now})
    // Sans destinataire confirmé, ne lire ni compte expéditeur ni transport SMTP.
    mail=allowedRecipients.size?createResearchEmailService({directory:join(root,'mail-outbox'),from:options.mail?.from,transport:options.mail?.transport,now,...(options.mail?.buildPdf?{buildPdf:options.mail.buildPdf}:{})}):null
  }catch(error){ledger.close();throw error}
  const visitors=new Map(),shutdown=new AbortController();let closed=false,active=false
  const quota=actor=>{
    const s=ledger.status(actor),remaining=s.limitMicroUsd-s.reservedMicroUsd
    if(now()>=Date.parse(PUBLIC_COST_POLICY.validUntil))s.stopped=true
    return {publicQuota:{dialogue:s.dialogue,research:s.research,dialoguePerDay:10,researchPerDay:3},
      pathwayQuota:{total:s.research,daily:s.research,maxTotalRequests:3,maxDailyRequests:3,unlimited:false,stopped:s.stopped,enabled:!s.stopped&&remaining>=PUBLIC_POLICY.reserveMicroUsd.pathway,busy:false},
      budget:{model:'gpt-6-luna',attempts:s.dialogue,maxAttempts:10,reservedMicroUsd:s.dialogue*PUBLIC_COST_POLICY.dialogue.reserveMicroUsd,stopped:s.stopped,unlimited:false}}
  }
  async function visitor(actor){
    if(closed)throw new PublicPilotError('public_stopped',503)
    if(visitors.has(actor))return visitors.get(actor)
    const pending=(async()=>{
      const directory=join(root,'visitors',actor);protectedDirectory(directory)
      const budgetDirectory=join(directory,'dialogue-budget');mkdirSync(budgetDirectory,{mode:0o700,recursive:true})
      const password=randomBytes(32).toString('hex'),user=await createPilotCredential({id:'visitor',username:'visitor',password})
      if(closed)throw new PublicPilotError('public_stopped',503)
      let operation=null
      const meteredFetch=async(destination,init={})=>{
        const url=new URL(destination),method=init.method??'GET'
        const isDialogue=url.origin===openaiOrigin&&url.pathname==='/v1/responses'&&method==='POST'
        const isResearch=url.origin===catalogueOrigin&&['/api/search','/api/pathway'].includes(url.pathname)&&method==='POST'
        const isRead=url.origin===catalogueOrigin&&['/api/catalogue','/api/profile-references','/api/health'].includes(url.pathname)&&method==='GET'
        if(!isDialogue&&!isResearch&&!isRead)throw new PublicPilotError('public_destination',503)
        if(!isRead){
          const expected=isDialogue?'dialogue':url.pathname==='/api/search'?'search':'pathway'
          if(!operation||operation.action!==expected)throw new PublicPilotError('public_request',400)
          if(operation.paths.has(url.pathname))throw new PublicPilotError('public_duplicate',409)
          try{
            requirePublicCostPolicy(now())
            if(isResearch&&!operation.policyVerified){
              const preflight=await fetchImpl(catalogueOrigin+'/api/public/policy',{method:'GET',credentials:'omit',redirect:'error',headers:{Authorization:'Bearer '+options.backendToken,Accept:'application/json'},signal:AbortSignal.any([shutdown.signal,init.signal??new AbortController().signal,AbortSignal.timeout(5000)])})
              const proof=await readBoundedJson(preflight,4096)
              if(proof.policy!==PUBLIC_COST_POLICY.id)throw new PublicPilotError('public_bounds_unverified',503)
              operation.policyVerified=true
            }
            if(ledger.status(actor).stopped)throw new PublicPilotError('public_stopped',503);if(!operation.reserved){ledger.reserve({actor,action:expected,requestId:operation.requestId});operation.reserved=true}
          }
          catch(error){operation.failure=error instanceof PublicPilotError?error:new PublicPilotError(error.code==='public_cost_review_expired'?error.code:'public_bounds_unverified',503);throw operation.failure}
          operation.paths.add(url.pathname)
        }
        const headers=isResearch?{...init.headers,Authorization:'Bearer '+options.backendToken,'X-A658-Public-Request':createHash('sha256').update(actor+'\n'+operation.requestId).digest('hex'),...(options.consumption?{'X-A658-Report-Token':options.consumption.token}:{})}:init.headers
        const signal=!isRead?AbortSignal.any([shutdown.signal,init.signal??new AbortController().signal]):init.signal
        signal?.throwIfAborted()
        const response=await fetchImpl(isResearch?catalogueOrigin+'/api/public/'+operation.action:destination,{...init,headers,redirect:'error',...(signal?{signal}:{})})
        signal?.throwIfAborted()
        if(isResearch){
          try{const result=await readBoundedJson(response.clone(),4*1024*1024);verifyPublicCostProof(result.publicCostProof)}
          catch{operation.failure=new PublicPilotError('public_bounds_unverified',503);throw operation.failure}
        }
        return response
      }
      const restrictedMail={enabled:Boolean(mail),async send(payload){
        if(!mail)throw new PublicPilotError('public_mail_pending',503)
        const recipient=canonicalEmail(payload.recipient)
        if(!allowedRecipients.has(recipient))throw new PublicPilotError('public_mail_recipient',403)
        if(!operation||operation.action!=='mail'||operation.requestId!==payload.requestId)throw new PublicPilotError('public_request',400)
        try{ledger.reserve({actor,action:'mail',requestId:payload.requestId});return await mail.send({...payload,recipient,identity:actor})}
        catch(error){if(error instanceof PublicPilotError)operation.failure=error;throw error}
      }}
      const gateway=createRealDialogueTrialInterface({enabled:true,paidTrialAuthorized:true,unlimited:true,guidedDraft:true,
        providerFactory:settings=>createPublicOpenAIDialogueProvider({...settings,now}),usagePolicy:'public-generation-only',
        apiKey:options.apiKey,budgetDirectory,fetchImpl:meteredFetch,courseSearchFetchImpl:meteredFetch,courseSearchDirectory:join(directory,'course-search'),
        pathwayTrial:{enabled:true,paidTrialAuthorized:true,stateFile:join(directory,'pathway-quotas.json'),reportFile:join(directory,'pathway-report.json'),fetchImpl:meteredFetch},
        resumeDirectory:join(directory,'resume'),deviceMemoryEnabled:false,publicOrigin:options.publicOrigin,users:[user],stateFile:join(directory,'quotas.json'),
        isSecureRequest:options.isSecureRequest,loadProfileReferences:options.loadProfileReferences,loadCatalogueStatus:options.loadCatalogueStatus,
        preview:options.preview,mail:mail?restrictedMail:null,consumption:options.consumption,reportingToken:options.consumption?.token})
      return {gateway,authorization:'Basic '+Buffer.from('visitor:'+password).toString('base64'),setOperation:value=>{operation=value}}
    })()
    visitors.set(actor,pending)
    try{return await pending}catch(error){visitors.delete(actor);throw error}
  }
  return {enabled:true,
    async handler(req,res){
      if(closed)return send(res,503,errorValue(new PublicPilotError('public_stopped',503)))
      const originalUrl=req.url
      if(!originalUrl?.startsWith('/public/'))return send(res,404,{code:'not_found'})
      let verified=false;try{verified=options.isSecureRequest(req)===true}catch{}
      if(!verified||req.headers.host!==origin.host||req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==options.publicOrigin))return send(res,403,{code:'secure_transport_required'})
      if(!['GET','POST'].includes(req.method))return send(res,405,{code:'public_method'})
      let inner,end=res.end,writeHead=res.writeHead,ownsActive=false
      try{
        // Une session nouvelle ne peut provenir que de la page, pas d'un POST coûteux.
        const {actor}=sessions.identify(req,res,{create:req.method==='GET'&&originalUrl==='/public/'})
        let body,operation=null,buffer
        if(req.method==='POST'){
          if(req.headers.origin!==options.publicOrigin)return send(res,403,{code:'public_origin'})
          if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')return send(res,415,{code:'public_json'})
          const chunks=[];let bytes=0
          for await(const chunk of req){bytes+=chunk.length;if(bytes>16000)throw new PublicPilotError('public_size',413);chunks.push(chunk)}
          buffer=Buffer.concat(chunks);try{body=JSON.parse(buffer.toString('utf8'))}catch{throw new PublicPilotError('public_request',400)}
          if(!body||typeof body!=='object'||Array.isArray(body))throw new PublicPilotError('public_request',400)
          const action=originalUrl==='/public/dialogue'&&body.action==='turn'?'dialogue':originalUrl==='/public/course-search'?'search':originalUrl==='/public/pathway'?'pathway':originalUrl==='/public/research-email'?'mail':null
          if(action){
            if(action==='mail'&&!mail)throw new PublicPilotError('public_mail_pending',503)
            if(action==='mail'&&!allowedRecipients.has(canonicalEmail(body.recipient)))throw new PublicPilotError('public_mail_recipient',403)
            if(active)throw new PublicPilotError('public_busy',409)
            active=true;ownsActive=true;operation={action,requestId:body.requestId,reserved:false,paths:new Set(),failure:null}
          }
        }
        inner=await visitor(actor);if(operation)inner.setOperation(operation)
        // Le client ne choisit jamais son identité interne ni un compte du pilote privé.
        const forwarded=buffer?Readable.from([buffer]):req
        const oldHeaders=req.headers,oldUrl=req.url
        forwarded.headers={...req.headers,authorization:inner.authorization};forwarded.url=originalUrl.replace(/^\/public\//,'/private/');forwarded.method=req.method;forwarded.socket=req.socket
        res.writeHead=function(status,...args){this.removeHeader('WWW-Authenticate');return writeHead.call(this,operation?.failure?.status??status,...args)}
        res.end=function(value,...args){
          const type=String(this.getHeader('Content-Type')??'');let output=value
          if(typeof value==='string'&&/application\/json/.test(type)){
            try{const data=JSON.parse(value),q=quota(actor)
              if(operation?.failure){Object.assign(data,errorValue(operation.failure));this.statusCode=operation.failure.status??503}
              Object.assign(data,q);if(data.quota)data.quota=q.pathwayQuota
              if(data.code?.startsWith('public_'))data.publicMessage=messages[data.code]??'Le test est indisponible. Aucune relance automatique.'
              output=JSON.stringify(data)
            }catch{}
          }else if(typeof value==='string'&&/text\/(?:html|javascript)/.test(type)){
            output=value.replaceAll('/private/','/public/').replaceAll('Votre accès privé','Votre session de test')
            if(type.includes('text/html'))output=output.replace('"unlimited":true','"unlimited":false,"publicPilot":true,"publicMailPending":'+!mail)
              .replace('Pilote privé · dialogue IA et recherches sans plafond d’essais','Test public · 10 messages et 3 recherches par jour')
          }
          return end.call(this,output,...args)
        }
        try{await inner.gateway.handler(forwarded,res)}finally{if(forwarded===req){req.headers=oldHeaders;req.url=oldUrl}}
      }catch(error){if(!res.writableEnded&&!res.headersSent)send(res,error.status??503,errorValue(error));else if(!res.writableEnded)end.call(res)}
      finally{res.end=end;res.writeHead=writeHead;if(ownsActive){inner?.setOperation(null);active=false}}
    },
    async close(){
      if(closed)return;closed=true;shutdown.abort()
      const entries=await Promise.allSettled([...visitors.values()])
      for(const entry of entries)if(entry.status==='fulfilled'){try{await entry.value.gateway.close()}catch{}}
      ledger.close()
    },
    stop(){ledger.stop();shutdown.abort()},
  }
}

import {createCourseSearch} from './course-search.mjs'
import {readCatalogueVersion} from './catalogue-version.mjs'
import {createDeviceMemory} from './device-memory.mjs'
import {join} from 'node:path'
// Interface privée partagée : simulation par défaut, assemblage réel explicitement fourni.
import {createResearchEmailHandler} from './research-email-handler.mjs'
import {createPrivateResumeStore} from './private-resume-store.mjs'
import {createMessagingSnapshot} from './messaging-state.mjs'
import { readFileSync } from 'node:fs'
import { createDialogueSession, DialogueError } from './dialogue-session.mjs'
import { DRAFT_FIELDS as PROFILE_FIELDS, validateProfileReferences, normalizePathwayProfile } from './profile-references.mjs'
import { createPilotSimulation } from './pilot-simulation.mjs'
import { createPilotPrivateHandler } from './pilot-private.mjs'
import { createPrivateResources } from './private-resources.mjs'
const fail = code => { throw new DialogueError(code) }
const template = readFileSync(new URL('./messaging-page.html', import.meta.url), 'utf8')

// Faux transport volontairement borné : démonstration de quelques formulations explicites.
// Pas d’analyse sémantique ni sélection de formations.
export function createFictitiousDialogueProvider() {
  return { mode: 'simulation', async respond({ draft, references, messages }) {
    const last = messages.at(-1), text = last.text.trim(), changes = []
    const add = (field, value) => { if (value && value !== (field === 'modality' ? draft.modality : draft.profile[field])) changes.push({ field, value,
      evidence: [{ messageId: last.id, quote: text }] }) }
    const role = text.match(/(?:métier\s*:|je suis)\s*(assistant[e]? administrati[fv]e?)[.!\s]*$/i)
    if (role) add('role', role[1])
    const objective = text.match(/^(?:objectif\s*:\s*|je voudrais\s+|j’aimerais\s+|j'aimerais\s+)(.{10,})$/i)
    if (objective) add('objective', objective[1])
    for (const name of ['personnelCategory', 'managerStatus']) {
      const match = references.pathway.fields[name].options.find(x => [x.value, x.label].some(v => v.toLowerCase() === text.toLowerCase()))
      if (match) add(name, match.value)
    }
    if (['Je débute', 'Quelques bases', 'Expérience confirmée'].includes(text)) add('existingSkills', text)
    if (['Moins d’une journée', '1 à 2 jours', '3 à 5 jours', 'À définir'].includes(text)) add('timeAvailable', text)
    if (['Présentiel', 'En ligne', 'Indifférent'].includes(text)) add('modality', text)
    return { kind: changes.length ? 'recap' : 'ask', changes,
      reply: changes.length ? 'À ajouter à votre demande :' :
        'Ce fournisseur est fictif et reconnaît quelques formulations de test. Vous pouvez écrire « Je voudrais mieux organiser mes tâches et mes priorités », « Je suis assistant administratif », ou compléter les repères dans Ma demande.' }
  } }
}
export function renderDialogueSimulationPage(references, options = {}) {
  return renderDialoguePage(references, options, false)
}
export function renderDialogueTrialPage(references, options = {}) {
  return renderDialoguePage(references, options, true)
}
function renderDialoguePage(references, { timeoutMs = 10000, pathwayMode = 'simulation', validationSeries = false, emailEnabled = false, deviceMemoryEnabled = false, catalogueStatusEnabled = false, unlimited = false, guidedDraft = false } = {}, realTrial) {
  const contract = validateProfileReferences(references)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) fail('configuration')
  return template.replace('/*MESSAGING_CONFIG*/', JSON.stringify({ references: contract, guidedDraft, timeoutMs, mode: pathwayMode, validationSeries, emailEnabled, deviceMemoryEnabled, catalogueStatusEnabled, unlimited: realTrial && unlimited, pathwayTimeoutMs: pathwayMode === 'real' ? 210000 : timeoutMs, dialogue: realTrial ? 'real-trial' : 'fictitious' }).replace(/</g, '\\u003c'))
    .replace('/private/messaging-client.mjs', '/private/dialogue-client.mjs')
    .replace('Simulation : aucun appel au moteur ni à OpenAI.', realTrial ? 'Dialogue IA : chaque message envoyé peut être payant. Aucun appel OpenAI à l’ouverture.' : 'Simulation : aucun appel au moteur ni à OpenAI.')
    .replace('Pilote privé · simulation uniquement', realTrial ? (unlimited ? 'Pilote privé · dialogue IA et recherches sans plafond d’essais' : pathwayMode === 'real' ? (validationSeries?'Validation privée · trois scénarios, une tentative chacun':'Essai privé · dialogue IA · un parcours réel maximum') : 'Essai dialogue IA · parcours simulés · 10 tentatives maximum') : 'Dialogue fictif · aucun appel OpenAI')
}
export function createDialogueSimulationInterface(options = {}) {
  return createDialogueInterface(options)
}
// Assemblage serveur partagé ; le chemin réel nécessite une session explicitement autorisée.
export function createDialogueInterface(options = {}, trial = null) {
  const { enabled = false } = options
  if (typeof enabled !== 'boolean') fail('configuration')
  if (!enabled) return createPilotPrivateHandler({ enabled: false })
  const dialogueMode = trial ? 'real' : 'simulation'
  const courseSearch=options.guidedDraft&&options.courseSearchDirectory?createCourseSearch({directory:options.courseSearchDirectory,fetchImpl:options.courseSearchFetchImpl,reportingToken:options.reportingToken}):null
  const { publicOrigin, users, isSecureRequest, stateFile, loadProfileReferences, preview, timeoutMs = 10000 } = options
  const pathwayMode = trial?.pathwaySession ? 'real' : 'simulation'
  const simulation = trial?.pathwaySession ?? createPilotSimulation({ stateFile, maxDailyRequests: 5, maxTotalRequests: 5, singleInstance: true, loadProfileReferences, preview })
  const resume = options.resumeDirectory ? createPrivateResumeStore(options.resumeDirectory) : null
  if(options.deviceMemoryEnabled!==undefined&&typeof options.deviceMemoryEnabled!=='boolean')fail('configuration')
  if(options.deviceMemoryEnabled&&!options.resumeDirectory)fail('configuration')
  const memory=options.deviceMemoryEnabled?createDeviceMemory({directory:join(options.resumeDirectory,'device-memory'),origin:publicOrigin,now:options.deviceMemoryNow??Date.now}):null
  const savedState=value=>{const draft=value.session.getDraft();return {version:2,profile:draft.profile,modality:draft.modality,referenceRevision:draft.referenceRevision,...(draft.requestMode?{requestMode:draft.requestMode}:{}),pathway:value.pathway??null,pathways:value.pathways,nextNumber:value.nextNumber}}
  const memoryMeta=(identity,value)=>memory?{deviceMemory:{scope:memory.scope(identity.id),stateToken:memory.stateToken(savedState(value))}}:{}
  const sessions = new Map()
  const persist = (identity,value) => {
    if(!resume)return true
    const draft=value.session.getDraft()
    try{resume.write(identity.id,{version:2,profile:draft.profile,modality:draft.modality,referenceRevision:draft.referenceRevision,...(draft.requestMode?{requestMode:draft.requestMode}:{}),pathway:value.pathway??null,pathways:value.pathways,nextNumber:value.nextNumber});value.resumeSaved=true;return true}
    catch{value.resumeSaved=false;return false}
  }
  const entry = async identity => {
    const refs = validateProfileReferences(await simulation.getReferences())
    let value = sessions.get(identity.id)
    if (value && value.references.revision !== refs.revision){if(!options.guidedDraft)fail('references_changed');value.session.refreshReferences(refs);value.references=refs;persist(identity,value)}
    if (!value) {
      if (sessions.size >= 8) fail('busy')
      const restored=resume?.read(identity.id)
      value = { references: refs, pathway:restored?.pathway??null,pathways:restored?.pathways??(restored?.pathway?[restored.pathway]:[]),nextNumber:restored?.nextNumber??((restored?.pathway?.number??0)+1),resumeSaved:true, session: trial ? trial.createSession(refs,restored??{}) : createDialogueSession({ enabled: true, references: refs,initialProfile:restored?.profile??{},initialModality:restored?.modality??'',
        provider: createFictitiousDialogueProvider(), maxTurns: 10, timeoutMs }) }
      sessions.set(identity.id, value)
    }
    return value
  }
  const validationState=value=>trial?.validation?{validationCases:trial.validation.cases(),validationCaseId:trial.validation.identify(value.session.getDraft().profile,value.session.getDraft().modality)}:{}
  const emailHandler=createResearchEmailHandler({mail:options.mail,entry,publicOrigin})
  const resources = createPrivateResources(simulation, trial ? (refs, settings) => renderDialogueTrialPage(refs, { ...settings, pathwayMode,validationSeries:Boolean(trial.validation),emailEnabled:Boolean(options.mail?.enabled),deviceMemoryEnabled:Boolean(memory),guidedDraft:options.guidedDraft===true,catalogueStatusEnabled:typeof options.loadCatalogueStatus==='function',unlimited:options.unlimited===true }) : (refs,settings)=>renderDialogueSimulationPage(refs,{...settings,emailEnabled:Boolean(options.mail?.enabled),deviceMemoryEnabled:Boolean(memory),guidedDraft:options.guidedDraft===true,catalogueStatusEnabled:typeof options.loadCatalogueStatus==='function'}), timeoutMs)
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.end(JSON.stringify(body))
  }
  const gateway = createPilotPrivateHandler({ enabled: true, publicOrigin, session: simulation, users, isSecureRequest,
    maxAttempts: 100, windowMs: 60000,
    beforePathway: async ({ identity, profile, referenceRevision }) => {
      const value = await entry(identity), draft = value.session.getDraft()
      if(value.pathways.length>=20)fail('invalid_request')
      if(options.guidedDraft&&draft.requestMode!=='pathway')fail('invalid_request')
      if (referenceRevision !== value.references.revision) fail('references_changed')
      if (!draft.profile.existingSkills?.trim() || !draft.profile.timeAvailable?.trim() || !draft.modality) fail('invalid_profile')
      const accepted = value.session.getPathwayProfile({ expectedRevision: draft.revision })
      let submitted
      try { submitted = normalizePathwayProfile(profile, value.references) } catch { fail('invalid_profile') }
      if (PROFILE_FIELDS.some(k => (accepted[k] || '') !== (submitted[k] || ''))) fail('stale_profile')
      return {modality:draft.modality,profile:accepted}
    },
    afterPathway: ({identity,profile,referenceRevision,result,confirmedContext}) => {
      const metadata=validationState(sessions.get(identity.id))
      const value=sessions.get(identity.id)
      value.pathway=createMessagingSnapshot(confirmedContext.profile,result.mode==='real'?result.result:result.preview,referenceRevision,value.nextNumber++,confirmedContext.modality,result.mode)
      value.pathways.push(value.pathway)
      return {...metadata,...memoryMeta(identity,value),resumeEnabled:Boolean(resume),resumeSaved:persist(identity,value),savedPathway:value.pathway,savedPathways:value.pathways}
    },
    serveResource: async (req, res, context) => {
      if(await emailHandler(req,res,context))return true
      if(req.url==='/private/catalogue-status'&&typeof options.loadCatalogueStatus==='function'){
        if(req.method!=='GET'){send(res,405,{error:'Méthode refusée'});return true}
        try{const catalogue=readCatalogueVersion(await options.loadCatalogueStatus());if(!catalogue)throw Error();send(res,200,{catalogue})}catch{send(res,503,{error:'Date du catalogue indisponible'})}
        return true
      }
      if (req.method === 'GET' && req.url === '/private/dialogue-client.mjs') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
        res.end(readFileSync(new URL('./dialogue-client.mjs', import.meta.url), 'utf8')); return true
      }
      if (req.url !== '/private/dialogue' && !(courseSearch&&req.url==='/private/course-search')) return resources(req, res, context)
      let currentEntry = null
      try {
        if (!['GET', 'POST'].includes(req.method)) { send(res, 405, { error: 'Méthode refusée' }); return true }
        if (req.method === 'POST' && req.headers.origin !== publicOrigin) { send(res, 403, { error: 'Origine requise' }); return true }
        const value = await entry(context.identity), session = value.session
        currentEntry = value
        if (req.method === 'GET') { send(res, 200, { mode: dialogueMode, pathwayMode,...memoryMeta(context.identity,value),...validationState(value), pathwayQuota: simulation.status(), resumeEnabled:Boolean(resume),resumeSaved:value.resumeSaved,savedPathway:value.pathway??null,savedPathways:value.pathways,draft: session.getDraft(), proposal: session.getProposal(), references: value.references, ...(trial ? { usageRecords: session.getUsage(), budget: trial.budgetStatus(), lastError: value.lastError ?? null } : {}) }); return true }
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') { send(res, 415, { error: 'JSON requis' }); return true }
        const chunks = []; let bytes = 0
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 1024*1024+4096) { send(res, 413, { error: 'Requête trop volumineuse' }); return true } chunks.push(chunk) }
        let body
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { send(res, bytes>16000?413:400, { error: 'JSON invalide' }); return true }
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid_request')
        if(bytes>16000&&body.action!=='device-restore'){send(res,413,{error:'Requête trop volumineuse'});return true}
        let result
        if(req.url==='/private/course-search'){
          if(value.session.getDraft().requestMode!=='search'||body.expectedRevision!==value.session.getDraft().revision||simulation.status().busy)fail('stale_profile')
          if(value.pathways.length>=20)fail('invalid_request')
          const found=await courseSearch.search({...body,identity:context.identity.id,signal:context.signal})
          value.pathway=createMessagingSnapshot({objective:body.query.trim()},found,value.references.revision,value.nextNumber++,'','real')
          value.pathways.push(value.pathway)
          const saved=persist(context.identity,value)
          if(!context.signal.aborted)send(res,200,{savedPathway:value.pathway,savedPathways:value.pathways,resumeSaved:saved,resumeEnabled:Boolean(resume),...memoryMeta(context.identity,value)})
          return true
        }
        if(body.action==='device-save'&&memory){
          if(body.confirmed!==true)fail('invalid_request')
          result={deviceCopy:memory.issue(context.identity.id,savedState(value),body.expiresAt)}
        }
        else if(body.action==='device-restore'&&memory){
          if(body.confirmed!==true||body.expectedStateToken!==memory.stateToken(savedState(value))||simulation.status().busy)fail('invalid_request')
          let restored
          try{restored=memory.verify(context.identity.id,body.copy)}catch{fail('invalid_request')}
          result={draft:session.editProfile(restored.profile,{expectedRevision:body.expectedRevision,modality:restored.modality,clearConversation:true})}
          value.pathways=restored.pathways;value.pathway=restored.pathway;value.nextNumber=Math.max(value.nextNumber,restored.nextNumber)
          persist(context.identity,value)
          result.savedPathways=value.pathways;result.savedPathway=value.pathway
        }
        else if (body.action === 'turn') { if(options.guidedDraft&&session.getDraft().requestMode!=='pathway')fail('invalid_request');if(trial?.validation)fail('disabled');result = await session.turn({ ...body, signal: context.signal }); value.lastError = null }
        else if(body.action==='load-case'&&trial?.validation){const c=trial.validation.load(body.caseId,value.references);result={draft:session.editProfile(c.profile,{expectedRevision:body.expectedRevision,modality:c.modality})}}
        else if(body.action==='request-mode'&&options.guidedDraft){
          let research
          if(body.fromResearch!==undefined){research=value.pathways.find(x=>x.number===body.fromResearch);if(body.requestMode!=='pathway'||!research?.result.searchQuery)fail('invalid_request')}
          const intent=body.intent??'start'
          if(!['start','resume'].includes(intent)||(research&&intent==='resume'))fail('invalid_request')
          if(intent==='resume'&&session.getDraft().requestMode&&session.getDraft().requestMode!==body.requestMode)fail('invalid_request')
          const draft=intent==='resume'?session.setRequestMode(body.requestMode,body):session.startRequestMode(body.requestMode,{...body,objective:research?.result.searchQuery??''})
          result={draft}
        }
        else if (body.action === 'new-request') { result = { draft: session.restart(body) }; value.lastError = null }
        else if (body.action === 'accept') result = { draft: session.acceptProposal(body) }
        else if (body.action === 'reject') result = { draft: session.rejectProposal(body) }
        else if (body.action === 'edit') { result = { draft: session.editProfile(body.profile, body) };if(body.clearPathway===true){value.pathway=null;value.pathways=[]} }
        else if(['select-research','close-research'].includes(body.action)){
          if(!Number.isSafeInteger(body.number)||!value.pathways.some(p=>p.number===body.number))fail('invalid_request')
          if(body.action==='select-research')value.pathway=value.pathways.find(p=>p.number===body.number)
          else{const index=value.pathways.findIndex(p=>p.number===body.number);value.pathways.splice(index,1);if(value.pathway?.number===body.number)value.pathway=value.pathways[Math.max(0,index-1)]??null}
          result={savedPathway:value.pathway,savedPathways:value.pathways}
        }
        else fail('invalid_request')
        if(['turn','request-mode','accept','edit','new-request','load-case','select-research','close-research'].includes(body.action))persist(context.identity,value)
        if (!context.signal.aborted) send(res, 200, {...memoryMeta(context.identity,value),resumeEnabled:Boolean(resume),resumeSaved:value.resumeSaved, ...result, references:value.references, mode: dialogueMode, pathwayMode,...validationState(value), pathwayQuota: simulation.status(), ...(trial ? { usageRecords: session.getUsage(), budget: trial.budgetStatus() } : {}) })
      } catch (error) {
        const code = error instanceof DialogueError || error.code==='resume_unavailable' ? error.code : 'service_unavailable'
        const status = ['stale_profile', 'stale_proposal', 'proposal_pending', 'references_changed', 'busy', 'duplicate_request'].includes(code) ? 409 : ['quota_exceeded', 'budget_stopped'].includes(code) ? 429 : code === 'timeout' ? 504 : ['disabled','resume_unavailable'].includes(code) ? 503 : 400
        const diagnostic = { code, status,
          ...(Number.isInteger(error.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599 && ['count','generation'].includes(error.stage)
            ? { httpStatus: error.httpStatus, stage: error.stage } : {}) }
        if (currentEntry) currentEntry.lastError = diagnostic
        let usageRecords
        try { if (trial && currentEntry) usageRecords = currentEntry.session.getUsage() } catch {}
        if (!context.signal.aborted && !res.writableEnded) send(res, status, { code,
          error: code==='resume_unavailable'?'Reprise privée indisponible. Données conservées ; aucune génération lancée.':'Dialogue non abouti. Profil conservé ; aucune relance automatique.', ...diagnostic,
          ...(trial ? { mode: dialogueMode, pathwayQuota: simulation.status(), budget: trial.budgetStatus(), ...(usageRecords ? { usageRecords } : {}) } : {}) })
      }
      return true
    },
  })
  return { handler: gateway.handler, status: simulation.status,
    close() { courseSearch?.stop();for (const item of sessions.values()) item.session.stop() },
    revoke(id) { sessions.get(id)?.session.stop(); return gateway.revoke(id) },
    stop() { courseSearch?.stop();for (const item of sessions.values()) item.session.stop(); gateway.stop() },
  }
}

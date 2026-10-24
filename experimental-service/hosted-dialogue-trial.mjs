// Lanceur distinct : préparation sans réseau, activation explicitement verrouillée.
import { writeFileSync, mkdirSync, copyFileSync, chmodSync, rmSync, existsSync, lstatSync, realpathSync, readFileSync, renameSync, constants } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readHostedConfig } from './hosted-simulation.mjs'
import { createHostedTransport } from './hosted-transport.mjs'
import { createRealDialogueTrialInterface } from './dialogue-real-trial.mjs'
import { TRIAL_POLICY } from './dialogue-budget.mjs'

export function readHostedDialogueTrialConfig(configFile, siteDirectory) {
  const options = readHostedConfig(configFile, siteDirectory)
  const trial = options.dialogueTrial
  if (options.interface !== 'dialogue-real-trial' || !trial ||
      Object.keys(trial).sort().join(',') !== 'billingReviewed,enabled,model,paidTrialAuthorized' ||
      ['enabled','paidTrialAuthorized','billingReviewed'].some(key => typeof trial[key] !== 'boolean') ||
      trial.model !== TRIAL_POLICY.model || options.proxyVerification !== 'self-https') throw Error('Configuration d’essai distincte requise')
  const budgetDirectory = join(options.privateDirectory, 'dialogue-budget'), info = lstatSync(budgetDirectory)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) || realpathSync(budgetDirectory) !== budgetDirectory) throw Error('Registre privé distinct requis')
  const pathway = options.pathwayTrial
  if (pathway && (Object.keys(pathway).sort().join(',') !== 'enabled,paidTrialAuthorized' || typeof pathway.enabled !== 'boolean' || typeof pathway.paidTrialAuthorized !== 'boolean')) throw Error('Autorisation de parcours invalide')
  const pathwayStateFile = join(options.privateDirectory, 'messaging-real-one-attempt-quotas.json')
  const pathwayReportFile = join(options.privateDirectory, 'messaging-real-one-attempt-report.json')
  for (const file of [pathwayStateFile, pathwayReportFile]) {
    try { const stat = lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw Error('Fichier de parcours non protégé') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return { ...options, pathwayStateFile, pathwayReportFile, enabled: trial.enabled, paidTrialAuthorized: trial.paidTrialAuthorized, billingReviewed: trial.billingReviewed, budgetDirectory }
}

export function prepareHostedDialogueTrial(configFile, siteDirectory) {
  const source = readHostedConfig(configFile, siteDirectory)
  if (source.interface === 'dialogue-real-trial' || source.proxyVerification !== 'self-https') throw Error('Source fictive avec proxy attesté requise')
  source.loadProfileReferences()
  const directory = realpathSync(source.privateDirectory)
  const target = join(dirname(directory), basename(directory) + '.dialogue-trial')
  // Une destination déterministe et exclusive empêche une remise à zéro accidentelle.
  for (let ancestor = target; ; ancestor = dirname(ancestor)) {
    const git=join(ancestor,'.git')
    if (existsSync(git) && (lstatSync(git).isFile() || existsSync(join(git,'HEAD')))) throw Error('Préparation dans Git refusée')
    if (dirname(ancestor) === ancestor) break
  }
  mkdirSync(target, { mode: 0o700 })
  try {
    for (const name of ['users.json','references.json','preview.json']) {
      copyFileSync(join(directory,name),join(target,name));chmodSync(join(target,name),0o600)
    }
    mkdirSync(join(target,'dialogue-budget'),{mode:0o700})
    writeFileSync(join(target,'config.json'),JSON.stringify({publicOrigin:source.publicOrigin,port:source.port,
      privateDirectory:target,interface:'dialogue-real-trial',proxyVerification:'self-https',
      dialogueTrial:{enabled:false,paidTrialAuthorized:false,billingReviewed:false,model:TRIAL_POLICY.model}},null,2),{mode:0o600,flag:'wx'})
    const prepared = join(target,'config.json')
    readHostedDialogueTrialConfig(prepared,siteDirectory)
    return {configFile:prepared,enabled:false}
  } catch (error) { rmSync(target,{recursive:true,force:true});throw error }
}

// Même dossier et même budget de dialogue ; aucun quota préexistant n’est copié ou remis à zéro.
export function prepareHostedDialoguePathwayTrial(configFile, siteDirectory) {
  readHostedDialogueTrialConfig(configFile, siteDirectory)
  const raw = JSON.parse(readFileSync(configFile, 'utf8'))
  if (raw.pathwayTrial) throw Error('Préparation de parcours déjà présente ; aucun remplacement')
  const backup = configFile + '.before-real-pathway', temp = configFile + '.pathway.tmp'
  copyFileSync(configFile, backup, constants.COPYFILE_EXCL)
  let temporaryCreated = false
  try {
    writeFileSync(temp, JSON.stringify({ ...raw, pathwayTrial: { enabled: false, paidTrialAuthorized: false } }, null, 2), {mode:0o600,flag:'wx'})
    temporaryCreated = true
    renameSync(temp, configFile)
  } catch (error) { if (temporaryCreated && existsSync(temp)) rmSync(temp); throw error }
  return {enabled:false}
}

export function createHostedDialogueTrial(options = {}) {
  // Ne pas consulter la clé avant les trois autorisations du lancement concret.
  if (options.enabled !== true || options.paidTrialAuthorized !== true || options.billingReviewed !== true) throw Error('Essai désactivé ou facturation non vérifiée')
  const pathway = options.pathwayTrial?.enabled ? options.pathwayTrial : null
  if (pathway && pathway.paidTrialAuthorized !== true) throw Error('Essai de parcours non activé explicitement')
  return createHostedTransport({...options,responseTimeoutMs:pathway?210000:35000,socketTimeoutMs:pathway?215000:40000,
    createGateway:({isSecureRequest})=>createRealDialogueTrialInterface({enabled:true,paidTrialAuthorized:true,
      publicOrigin:options.publicOrigin,users:options.users,isSecureRequest,stateFile:options.stateFile,
      loadProfileReferences:options.loadProfileReferences,preview:options.preview,budgetDirectory:options.budgetDirectory,
      apiKey:options.apiKey,fetchImpl:options.fetchImpl,timeoutMs:30000,
      ...(pathway?{pathwayTrial:{...pathway,stateFile:options.pathwayStateFile,reportFile:options.pathwayReportFile,fetchImpl:options.pathwayFetchImpl??options.fetchImpl}}:{})})})
}

// Séparer la lecture d’environnement afin de tester qu’un lancement refusé ne lit pas la clé.
export function readDialogueTrialLaunch(configFile,siteDirectory,environment) {
  if (environment.AVATAR_DIALOGUE_TRIAL_ENABLED !== 'true') throw Error('Activation d’environnement absente')
  const options=readHostedDialogueTrialConfig(configFile,siteDirectory)
  if (!options.enabled || !options.paidTrialAuthorized || !options.billingReviewed) throw Error('Configuration d’essai non activée')
  if (options.pathwayTrial?.enabled && (options.pathwayTrial.paidTrialAuthorized !== true || environment.AVATAR_PATHWAY_TRIAL_ENABLED !== 'true')) throw Error('Activation distincte du parcours absente')
  const apiKey=environment.AVATAR_DIALOGUE_OPENAI_API_KEY
  if (typeof apiKey !== 'string' || !apiKey.trim() || /\s/.test(apiKey)) throw Error('Clé serveur distincte absente')
  return {...options,apiKey}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === '--prepare-pathway') {
      prepareHostedDialoguePathwayTrial(process.argv[3],process.cwd())
      console.log('Raccordement de parcours préparé et désactivé. Sauvegarde conservée ; accès et compteurs inchangés. Aucun appel lancé.')
    } else if (process.argv[2] === '--prepare') {
      const prepared=prepareHostedDialogueTrial(process.argv[3],process.cwd())
      console.log('Session distincte préparée et désactivée : '+prepared.configFile)
      console.log('Aucune clé lue, aucun réseau, aucun serveur démarré. Accès et quotas précédents conservés.')
    } else if (process.argv[2] === '--check') {
      const options=readHostedDialogueTrialConfig(process.argv[3],process.cwd())
      console.log('Configuration vérifiée. Activation : '+options.enabled+'. Facturation validée : '+options.billingReviewed+'. Aucune clé lue ni requête envoyée.')
    } else {
      const options=readDialogueTrialLaunch(process.argv[2],process.cwd(),process.env)
      const service=createHostedDialogueTrial(options)
      service.server.once('error',()=>{console.error('Essai non démarré : port indisponible ou écoute refusée. Verrous de cette instance libérés ; compteurs conservés.');process.exitCode=1})
      for (const event of ['SIGINT','SIGTERM']) process.once(event,()=>{service.close().catch(()=>{process.exitCode=1})})
      service.server.listen(3000,'0.0.0.0',async()=>{
        console.log(options.pathwayTrial?.enabled?'Essai privé : dialogue IA payant ; UN parcours réel après confirmation explicite. Aucun appel payant à l’ouverture.':'Essai privé : dialogue IA payant, dix tentatives maximum ; parcours simulés. Aucun appel à l’ouverture.')
        console.log(await service.attestProxy()?'Contrôle HTTPS du proxy réussi.':'Contrôle HTTPS indisponible ; accès bloqué.')
      })
    }
  } catch { console.error('Essai non démarré : vérifier la préparation, les autorisations, la facturation et les verrous.');process.exitCode=1 }
}

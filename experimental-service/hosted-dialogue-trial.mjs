// Lanceur distinct : préparation sans réseau, activation explicitement verrouillée.
import { writeFileSync, mkdirSync, copyFileSync, chmodSync, rmSync, existsSync, lstatSync, realpathSync } from 'node:fs'
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
  return { ...options, enabled: trial.enabled, paidTrialAuthorized: trial.paidTrialAuthorized, billingReviewed: trial.billingReviewed, budgetDirectory }
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

export function createHostedDialogueTrial(options = {}) {
  // Ne pas consulter la clé avant les trois autorisations du lancement concret.
  if (options.enabled !== true || options.paidTrialAuthorized !== true || options.billingReviewed !== true) throw Error('Essai désactivé ou facturation non vérifiée')
  return createHostedTransport({...options,responseTimeoutMs:35000,socketTimeoutMs:40000,
    createGateway:({isSecureRequest})=>createRealDialogueTrialInterface({enabled:true,paidTrialAuthorized:true,
      publicOrigin:options.publicOrigin,users:options.users,isSecureRequest,stateFile:options.stateFile,
      loadProfileReferences:options.loadProfileReferences,preview:options.preview,budgetDirectory:options.budgetDirectory,
      apiKey:options.apiKey,fetchImpl:options.fetchImpl,timeoutMs:30000})})
}

// Séparer la lecture d’environnement afin de tester qu’un lancement refusé ne lit pas la clé.
export function readDialogueTrialLaunch(configFile,siteDirectory,environment) {
  if (environment.AVATAR_DIALOGUE_TRIAL_ENABLED !== 'true') throw Error('Activation d’environnement absente')
  const options=readHostedDialogueTrialConfig(configFile,siteDirectory)
  if (!options.enabled || !options.paidTrialAuthorized || !options.billingReviewed) throw Error('Configuration d’essai non activée')
  const apiKey=environment.AVATAR_DIALOGUE_OPENAI_API_KEY
  if (typeof apiKey !== 'string' || !apiKey.trim() || /\s/.test(apiKey)) throw Error('Clé serveur distincte absente')
  return {...options,apiKey}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === '--prepare') {
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
        console.log('Essai privé : dialogue IA payant, dix tentatives maximum ; parcours simulés. Aucun appel à l’ouverture.')
        console.log(await service.attestProxy()?'Contrôle HTTPS du proxy réussi.':'Contrôle HTTPS indisponible ; accès bloqué.')
      })
    }
  } catch { console.error('Essai non démarré : vérifier la préparation, les autorisations, la facturation et les verrous.');process.exitCode=1 }
}

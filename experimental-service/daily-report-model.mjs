// Construction déterministe d’un seul récapitulatif ; aucune lecture distante ni donnée personnelle.
import {consumptionDay} from './consumption-ledger.mjs'
export const BILLING_URL='https://platform.openai.com/settings/organization/billing/overview'
const shifted=(day,offset)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}
const validIso=s=>typeof s==='string'&&new Date(s).toISOString()===s
const integer=n=>Number.isSafeInteger(n)&&n>=0
const validDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
export const reportRecipientInstructions=file=>'Modifier le destinataire : 1. Ouvrir '+file+' sur le serveur ASSISTANT. 2. Remplacer uniquement le champ recipient par la nouvelle adresse. 3. Redémarrer ASSISTANT dans le Manager Infomaniak. Le prochain récapitulatif utilisera cette adresse.'
const currency=micro=>micro===null?'Non calculable':(micro/1e6).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:4})+' $'
const escaped=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function verify(source,scope){
 if(!source||source.version!==1||!validIso(source.startedAt)||!validIso(source.observedAt)||source.startedAt>source.observedAt||!Array.isArray(source.rows)||source.rows.length>20000||!integer(source.knownMicroUsd)||!integer(source.unknown))throw Error('Relevé de consommation invalide')
 const keys=new Set()
 for(const r of source.rows){
  if(!validDay(r.day)||!['catalogue','assistant'].includes(r.app)||!['search','dialogue','pathway'].includes(r.action)||scope==='assistant'&&(r.app!=='assistant'||r.action!=='dialogue')||scope==='catalogue'&&r.action==='dialogue'||!['requests','errors','unknown','knownMicroUsd','inputTokens','outputTokens'].every(k=>integer(r[k]))||r.errors>r.requests||r.unknown>r.requests)throw Error('Ligne de consommation invalide')
  const key=[r.day,r.app,r.action].join('/');if(keys.has(key))throw Error('Relevé dupliqué');keys.add(key)
 }
}
function aggregate(rows){const v={requests:0,searches:0,dialogues:0,pathways:0,errors:0,unknown:0,knownMicroUsd:0,inputTokens:0,outputTokens:0};for(const r of rows){for(const k of ['requests','errors','unknown','knownMicroUsd','inputTokens','outputTokens'])v[k]+=r[k];v[{search:'searches',dialogue:'dialogues',pathway:'pathways'}[r.action]]+=r.requests}if(!Object.values(v).every(integer))throw Error('Total de suivi invalide');return v}
export function createDailyReportModel({catalogue,assistant,baseline,now=new Date(),thresholdMicroUsd=2000000,configurationFile='configuration privée du suivi'}={}){
 verify(catalogue,'catalogue');verify(assistant,'assistant')
 if(!baseline||!integer(baseline.balanceMicroUsd)||!validIso(baseline.at)||!integer(thresholdMicroUsd))throw Error('Repère de solde invalide')
 if(catalogue.since!==baseline.at||assistant.since!==baseline.at)throw Error('Périmètre temporel du relevé incohérent')
 const today=consumptionDay(now),through=shifted(today,-1),rows=[...catalogue.rows,...assistant.rows]
 const coverageStart=catalogue.startedAt>assistant.startedAt?catalogue.startedAt:assistant.startedAt
 const coverageDay=consumptionDay(coverageStart)
 const day=label=>{const matching=rows.filter(r=>r.day===label);return {day:label,available:label>=coverageDay,partial:label===coverageDay,catalogue:aggregate(matching.filter(r=>r.app==='catalogue')),assistant:aggregate(matching.filter(r=>r.app==='assistant')),total:aggregate(matching)}}
 const days=Array.from({length:15},(_,i)=>day(shifted(through,-i)))
 const closed=rows.filter(r=>r.day<=through),month=through.slice(0,7)
 const previousMonths=[]
 const firstMonth=(catalogue.startedAt<assistant.startedAt?catalogue.startedAt:assistant.startedAt).slice(0,7)
 for(let label=firstMonth;label<month;){
  if(previousMonths.length>=360)throw Error('Historique mensuel trop long')
  previousMonths.push({month:label+(label<coverageDay.slice(0,7)||label===coverageDay.slice(0,7)&&coverageDay>label+'-01'?' (partiel)':''),catalogue:aggregate(closed.filter(r=>r.day.startsWith(label)&&r.app==='catalogue')),assistant:aggregate(closed.filter(r=>r.day.startsWith(label)&&r.app==='assistant')),total:aggregate(closed.filter(r=>r.day.startsWith(label)))})
  const d=new Date(label+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);label=d.toISOString().slice(0,7)
 }
 previousMonths.reverse()
 const unknown=catalogue.unknown+assistant.unknown
 if(!integer(catalogue.knownMicroUsd+assistant.knownMicroUsd))throw Error('Coût total invalide')
 const balanceReady=baseline.at>=coverageStart&&baseline.at<=catalogue.observedAt&&baseline.at<=assistant.observedAt&&!unknown
 const balanceMicroUsd=balanceReady?baseline.balanceMicroUsd-catalogue.knownMicroUsd-assistant.knownMicroUsd:null
 const low=balanceMicroUsd!==null&&balanceMicroUsd<=thresholdMicroUsd
 return {today,through,days,previousMonths,month,monthSummary:aggregate(closed.filter(r=>r.day.startsWith(month))),yesterday:days[0],baseline,balanceMicroUsd,unknown,low,coverageStart,configurationFile,
  subject:low?'⚠ A658-YG · Suivi OpenAI — solde théorique ≤ 2 $':balanceMicroUsd===null?'A658-YG · Suivi quotidien OpenAI — données à vérifier':'A658-YG · Suivi quotidien OpenAI — consommation IA et solde théorique'}
}
export function renderDailyReport(model){
 const value=r=>r.unknown?currency(r.knownMicroUsd)+' + coût inconnu':currency(r.knownMicroUsd)
 const counts=(r,app)=>(app==='catalogue'?r.searches+' recherches':r.dialogues+' messages'+(r.searches?' · '+r.searches+' recherches':''))+' · '+r.pathways+' parcours'+(r.errors?' ('+r.errors+' en erreur)':'')
 const dayRows=model.days.map(d=>[d.day+(d.partial?' (partiel)':''),d.available?value(d.catalogue)+' / '+counts(d.catalogue,'catalogue'):'Non collecté',d.available?value(d.assistant)+' / '+counts(d.assistant,'assistant'):'Non collecté',d.available?value(d.total):'—'])
 const previous=model.previousMonths.map(m=>[m.month,value(m.catalogue)+' / '+counts(m.catalogue,'catalogue'),value(m.assistant)+' / '+counts(m.assistant,'assistant'),value(m.total)])
 const note='Les coûts sont calculés par les applications, pas vérifiés sur une facture OpenAI. Le dialogue utilise une estimation haute de son coût ; les réservations ne sont pas comptées comme des dépenses. Retards, autres usages et crédits expirés peuvent créer un écart. Le solde OpenAI reste la référence.'
 const balance='Solde théorique restant : '+currency(model.balanceMicroUsd)+(model.low?' — seuil de vigilance de 2 $ atteint.':'')
 const unavailable=model.balanceMicroUsd===null?'Solde non calculable : repère antérieur à la collecte, relevé indisponible ou coût de tentative inconnu. Vérifiez le solde réel.':''
 const instructions=reportRecipientInstructions(model.configurationFile)
 const intro='Suivi au '+model.through+' inclus · heure de Paris. Un seul courriel quotidien pour CATALOGUE et ASSISTANT.'
 const yesterday=model.yesterday.available?value(model.yesterday.total)+' · '+model.yesterday.total.requests+' sollicitations'+(model.yesterday.partial?' (journée partiellement collectée)':''):'Aucune collecte disponible pour cette journée.'
 const monthValue=model.through<model.coverageStart.slice(0,10)?'Non collecté':value(model.monthSummary)+' · '+model.monthSummary.requests+' sollicitations (collecte '+(model.coverageStart.slice(0,10)>model.month+'-01'?'partielle':'disponible')+'). Ce total inclut les jours ci-dessus.'
 const headers=['Date / période','CATALOGUE','ASSISTANT','Total USD']
 const sections=[intro,balance,unavailable,'Hier : '+yesterday,'Les 15 derniers jours',headers.join(' | '),...dayRows.map(r=>r.join(' | ')),'Mois en cours ('+model.month+') : '+monthValue,'Mois précédents',...previous.map(r=>r.join(' | '))]
 if(!previous.length)sections.push('Pas encore de mois précédent collecté. Aucun historique antérieur n’a été reconstitué.')
 sections.push('Collecte commune depuis '+model.coverageStart+'. Les jours antérieurs sont indiqués comme non collectés.','Les recherches et parcours demandés depuis l’Assistant lui sont attribués une seule fois ; les appels techniques internes ne sont pas ajoutés aux sollicitations. Les tentatives en erreur sont comptées.','Repère de solde : '+currency(model.baseline.balanceMicroUsd)+' relevés le '+model.baseline.at+'. Une recharge nécessite un nouveau repère de solde ; le relevé inclut les dépenses collectées depuis ce repère, y compris celles de la journée en cours.','Vérifier mon solde réel : '+BILLING_URL,'Acheter des crédits : '+BILLING_URL+' (choisir Acheter des crédits, puis confirmer soi-même).',note,instructions)
 const table=rows=>'<table class="a658-report-table" role="table" style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'+headers.map(h=>'<th scope="col" style="padding:9px 5px;text-align:left;border-bottom:1px solid #d7e3dc">'+escaped(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map((c,i)=>'<td style="padding:9px 5px;vertical-align:top;border-bottom:1px solid #e6ece7;overflow-wrap:anywhere"><span class="a658-mobile-label" style="display:none">'+escaped(headers[i])+' : </span>'+escaped(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'
 const html='<style>@media only screen and (max-width:520px){.a658-report-table thead{display:none!important}.a658-report-table tr{display:block!important;border-bottom:1px solid #d7e3dc}.a658-report-table td{display:block!important;width:100%!important;border:0!important;padding:5px 0!important}.a658-report-table td:first-child{font-weight:bold;padding-top:12px!important}.a658-report-table td:last-child{padding-bottom:12px!important}.a658-report-table .a658-mobile-label{display:inline!important;font-weight:bold}.a658-report-table td:first-child .a658-mobile-label{display:none!important}}</style><div lang="fr" style="font:15px/1.6 Arial,sans-serif;color:#203c35;max-width:720px;margin:auto;padding:24px"><p style="color:#236851;font-weight:bold">A658-YG · SUIVI OPENAI</p><h1 style="font-size:26px">Votre point quotidien</h1><p>'+escaped(intro)+'</p><div style="background:'+(model.low?'#fff4df':'#edf4ef')+';padding:18px;border-radius:10px"><strong>'+escaped(balance)+'</strong><p>'+escaped(unavailable)+'</p></div><p><a href="'+BILLING_URL+'">Vérifier mon solde réel</a> · <a href="'+BILLING_URL+'">Acheter des crédits</a></p><p>L’achat se confirme sur la page OpenAI, jamais à l’ouverture de ce courriel.</p><h2>Hier</h2><p>'+escaped(yesterday)+'</p><h2>Les 15 derniers jours</h2>'+table(dayRows)+'<h2>Le mois en cours</h2><p>'+escaped(model.month)+' : '+escaped(monthValue)+'</p><h2>Les mois précédents</h2>'+(previous.length?table(previous):'<p>Pas encore de mois précédent collecté. Aucun historique antérieur n’a été reconstitué.</p>')+'<h2>Comment lire ce suivi ?</h2>'+sections.slice(sections.indexOf('Collecte commune depuis '+model.coverageStart+'. Les jours antérieurs sont indiqués comme non collectés.'),sections.indexOf('Collecte commune depuis '+model.coverageStart+'. Les jours antérieurs sont indiqués comme non collectés.')+3).map(p=>'<p>'+escaped(p)+'</p>').join('')+'<p style="font-size:12px">'+escaped(note)+'</p><h2>Modifier le destinataire</h2><p style="font-size:12px;overflow-wrap:anywhere">'+escaped(instructions)+'</p></div>'
 return {subject:model.subject,text:sections.filter(Boolean).join('\n\n'),html}
}

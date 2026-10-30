// Complète seulement des intentions explicites, à partir des valeurs du référentiel et des messages conservés.
const normalize=x=>String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const escape=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
function names(value,parts=true){const name=value.split(/\s+(?:-|\/)\s+/)[0];return [name,...(parts?name.split('-').filter(x=>x.length>=3):[])]}
function named(value,text,parts=true){return names(value,parts).some(x=>new RegExp('(?:^|[^a-z0-9])'+escape(normalize(x))+'(?:$|[^a-z0-9])').test(normalize(text)))}
export function completeRefinementProposal({output,messages,profile,references}){
 const last=messages.filter(x=>x.role==='user').at(-1),text=last?.text??'',changes=new Map(output.changes.map(x=>[x.field,x]));let completed=false
 const add=(field,value,message)=>{if(value===(profile[field]??''))return;changes.set(field,{field,value,evidence:[{messageId:message.id,quote:message.text}]});completed=true}
 const updating=/\b(?:precis\w*|modifi\w*|actualis\w*|mettre\s+a\s+jour)\b[^.!?]{0,45}\b(?:ma|la) demande\b/.test(normalize(text))
 if(updating&&!/\b(?:ne pas|sans modifier|sans preciser|ne modifi|ne precis)/.test(normalize(text))){
  const source=messages.filter(x=>x.role==='user'&&/\bcockpit\s+(?:rh|paie|formation)\b/.test(normalize(x.text))&&/\b(?:je souhaite|je veux|je voudrais|je dois)\b/.test(normalize(x.text))).at(-1)
  const goal=source?.text.replace(/^[\s«"“]+/,'').split(/[.!?]/)[0].trim()
  if(goal&&!changes.has('objective')&&goal.length<=references.pathway.fields.objective.maxLength)add('objective',goal,source)
 }
 const replacing=/\bremplac\w*\b[^.!?]{0,180}\bpar\b/.test(normalize(text))&&!/\b(?:ne pas|sans remplacer|ne remplace|pas remplacer)/.test(normalize(text))
 if(replacing){
  const selected=(profile.trainingOrganizers??'').split('\n').filter(Boolean),removed=selected.filter(value=>named(value,text,false))
  const targets=(references.pathway.fields.trainingOffers?.options??[]).filter(x=>named(x.value,normalize(text).split(/\bpar\b/).at(-1)))
  if(removed.length&&targets.length===1){add('trainingOrganizers',selected.filter(x=>!removed.includes(x)).join('\n'),last);add('trainingOffers',targets[0].value,last)}
 }
 if(!completed)return output
 return {...output,kind:'recap',reply:'Je propose de mettre à jour Ma demande avec les critères ci-dessous. Les résultats enregistrés restent inchangés. Confirmez-vous ces modifications ?',changes:[...changes.values()]}
}

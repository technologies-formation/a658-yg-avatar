// localStorage est utilisé seulement après un choix explicite ; aucune génération IA.
const TTL=30*24*60*60*1000,MAX=1024*1024+2048
export function createDeviceCopyStore({storage,scope,now=Date.now}){
 if(!/^[a-f0-9]{64}$/.test(scope))throw Error('Accès privé invalide.')
 const key='a658yg-device-copy-v1:'+scope
 const clean=value=>{
  if(!value||value.version!==1||value.scope!==scope||!/^[a-f0-9]{64}$/.test(value.stateToken)||value.copy?.scope!==scope||!Number.isSafeInteger(value.copy?.issuedAt)||!Number.isSafeInteger(value.copy?.expiresAt)||value.copy.issuedAt>now()||value.copy.expiresAt<=now()||value.copy.expiresAt-value.copy.issuedAt>TTL||value.copy.expiresAt<=value.copy.issuedAt||!/^[a-f0-9]{64}$/.test(value.copy.signature)||JSON.stringify(value).length>MAX)throw Error('Copie locale invalide ou expirée.')
  return value
 }
 return {key,
  read(){const raw=storage.getItem(key);if(raw===null)return null;try{if(raw.length>MAX)throw Error();return clean(JSON.parse(raw))}catch{storage.removeItem(key);return null}},
  write(value){clean(value);storage.setItem(key,JSON.stringify(value))},
  forget(){storage.removeItem(key)}
 }
}
export function initDeviceMemory({document,meta,request,getRevision,isBusy,onBusy,onRestore}){
 const scope=meta.scope
 let store,record=null,enabled=false,pending=false,changed=false,saving=false,generation=0,timer=null,notice=null,host=null,dead=false,latest=meta.stateToken,message='La mémorisation sur cet appareil est désactivée.'
 try{store=createDeviceCopyStore({storage:document.defaultView.localStorage,scope});record=store.read();enabled=Boolean(record);pending=enabled&&record.stateToken!==latest}catch{message='Le stockage de cet appareil est indisponible. La reprise privée du pilote reste indépendante.'}
 const make=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el}
 function render(){
  if(!host)return
  host.replaceChildren()
  const title=make('h3','Retrouver ma demande'),label=make('label'),toggle=make('input')
  title.style.cssText='font-size:17px;margin:0 0 12px'
  toggle.type='checkbox';toggle.id='remember-device';toggle.checked=enabled;toggle.disabled=!store||dead||saving||isBusy();toggle.style.cssText='width:22px;min-width:22px;height:22px;min-height:22px;margin:0;flex-shrink:0';label.htmlFor=toggle.id;label.style.cssText='display:flex;align-items:center;gap:10px;line-height:1.5';label.append(toggle,make('span','Conserver ma demande sur cet appareil pendant 30 jours'))
  toggle.addEventListener('change',()=>toggle.checked?enable():forget())
  const help=make('p','Une copie des critères confirmés et des recherches, sans le texte de la discussion. À éviter sur un ordinateur partagé. La copie expire après 30 jours ; elle est supprimée à la prochaine ouverture.');help.style.cssText='font-size:13px;line-height:1.6'
  const line=make('p',message);line.id='device-memory-status';line.setAttribute('role','status');line.style.cssText='font-size:13px;line-height:1.6'
  host.append(title,label,help,line)
  if(enabled){
   const button=make('button','Oublier ma demande sur cet appareil');button.type='button';button.id='forget-device';button.disabled=dead||isBusy();button.addEventListener('click',forget);host.append(button)
   const note=make('p','Cette action efface la copie locale. Elle ne supprime pas les recherches conservées par votre accès privé au pilote.');note.style.cssText='font-size:12px;line-height:1.5';host.append(note)
  }
 }
 function checkExpiry(){if(enabled&&record&&record.copy.expiresAt<=Date.now()){generation++;enabled=false;record=null;pending=false;store?.forget();notice?.remove();notice=null;message='La copie de cet appareil a expiré. Vous pouvez choisir de mémoriser à nouveau votre demande.';render();return false}return enabled}
 async function save(){
  if(!checkExpiry()||dead||saving||pending||isBusy()||!changed)return
  changed=false;saving=true;const attempt=generation,expiresAt=record?.copy.expiresAt
  render()
  try{
   const value=await request({action:'device-save',confirmed:true,...(expiresAt?{expiresAt}:{})})
   if(attempt!==generation||!enabled)return
   if(value.deviceMemory?.scope!==scope||value.deviceCopy?.scope!==scope)throw Error('Accès privé changé. Rechargez la page avant de mémoriser.')
   const next={version:1,scope,stateToken:value.deviceMemory.stateToken,copy:value.deviceCopy};store.write(next);record=next
   message='Copie enregistrée jusqu’au '+new Date(record.copy.expiresAt).toLocaleDateString('fr-CH')+'.';latest=value.deviceMemory.stateToken
  }catch{message=record?'La copie n’a pas pu être mise à jour. La dernière copie enregistrée est conservée.':'La copie n’a pas pu être enregistrée. Aucune copie locale n’a été créée.';if(!record)enabled=false}
  finally{saving=false;render();if(changed)schedule()}
 }
 function schedule(){clearTimeout(timer);if(enabled&&!pending&&!dead)timer=setTimeout(()=>{save().catch(()=>{})},300)}
 async function enable(){if(dead||isBusy()||!store)return;generation++;enabled=true;pending=false;changed=true;message='Enregistrement de la copie…';render();await save()}
 function forget(){generation++;clearTimeout(timer);enabled=false;pending=false;changed=false;record=null;notice?.remove();notice=null;try{store?.forget();message='Copie effacée sur cet appareil. La demande ouverte et les recherches de votre accès privé sont conservées.'}catch{message='Effacement impossible : supprimez les données de ce site dans les réglages du navigateur.'}render()}
 function confirmRestore(){
  const dialog=make('dialog');dialog.id='device-restore-dialog';dialog.setAttribute('aria-labelledby','device-restore-title');dialog.style.cssText='max-width:calc(100vw - 32px);width:500px;border-radius:16px;padding:24px;border:1px solid #b8cdb4'
  const title=make('h2','Reprendre la copie de cet appareil ?');title.id='device-restore-title'
  const text=make('p','Les critères et la liste des recherches de cet accès privé seront remplacés par cette copie. Aucun appel IA ne sera lancé et les quotas resteront inchangés.');text.style.lineHeight='1.6'
  const actions=make('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:12px'
  for(const [id,label,value]of [['cancel-device-restore','Annuler','cancel'],['confirm-device-restore','Reprendre cette copie','restore']]){const button=make('button',label);button.id=id;button.type='button';button.style.minHeight='44px';button.addEventListener('click',()=>dialog.close(value));actions.append(button)}
  dialog.append(title,text,actions);document.body.append(dialog)
  return new Promise(resolve=>{dialog.addEventListener('close',()=>{const yes=dialog.returnValue==='restore';dialog.remove();resolve(yes)},{once:true});dialog.showModal();dialog.querySelector('#cancel-device-restore').focus()})
 }
 function offer(parent){
  if(!checkExpiry()||!pending||dead||notice)return
  notice=make('section');notice.className='need-summary';notice.id='device-copy-notice'
  notice.append(make('strong','Une demande est mémorisée sur cet appareil'),make('p','Vous pouvez reprendre cette copie ou continuer avec la demande actuellement affichée. Aucune recherche ne sera lancée automatiquement.'))
  const resume=make('button','Reprendre la copie'),keep=make('button','Continuer ici');resume.type=keep.type='button';resume.id='resume-device-copy';keep.id='keep-current-request'
  resume.addEventListener('click',async()=>{
   if(isBusy()||dead||!checkExpiry())return
   if(!await confirmRestore())return
   if(isBusy()||dead||!checkExpiry())return
   const attempt=++generation;onBusy(true);resume.disabled=true;render()
   try{const value=await request({action:'device-restore',confirmed:true,expectedRevision:getRevision(),expectedStateToken:latest,copy:record.copy});if(attempt!==generation)return;pending=false;latest=value.deviceMemory.stateToken;notice?.remove();notice=null;onRestore(value);message='Copie reprise sans appel IA. Les quotas sont inchangés.';changed=true;schedule()}catch{message='La reprise a été refusée. La demande actuelle et la copie sont conservées ; rechargez la page pour vérifier.'}finally{onBusy(false);resume.disabled=false;render()}
  })
  keep.addEventListener('click',()=>{if(isBusy())return;pending=false;notice?.remove();notice=null;changed=true;message='La demande actuelle remplacera la copie de cet appareil.';render();schedule()})
  notice.append(resume,keep);parent.append(notice)
 }
 document.defaultView.addEventListener('storage',event=>{if(!store||event.key!==store.key&&event.key!==null)return;generation++;clearTimeout(timer);try{record=store.read();enabled=Boolean(record);pending=enabled&&record.stateToken!==latest;if(!enabled){notice?.remove();notice=null;message='La mémorisation a été désactivée dans un autre onglet.'}}catch{enabled=false}render()})
 return {
  mount(parent){host=document.getElementById('device-memory-settings');if(!host){host=make('section');host.id='device-memory-settings';host.style.cssText='border-top:1px solid #b8cdb4;margin-top:24px;padding-top:18px';parent.append(host)}checkExpiry();render()},
  observe(value){const next=value.deviceMemory;if(!next)return;if(next.scope!==scope){generation++;dead=true;enabled=false;clearTimeout(timer);message='Accès privé changé. Rechargez la page.';notice?.remove();render();return}if(next.stateToken!==latest){latest=next.stateToken;changed=true;schedule()}},
  offer,
  flush(){if(enabled&&changed)schedule()},
 }
}

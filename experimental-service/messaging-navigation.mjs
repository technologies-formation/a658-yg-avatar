// Menu de navigation : uniquement des interactions locales, aucun minuteur de disparition.
export function initMessagingNavigation(document){
 const $=id=>document.getElementById(id),app=$('assistant-app'),sidebar=$('sidebar'),workspace=$('workspace'),toggle=$('menu-toggle');
 const zone=$('composer-zone');
 if(!$('pilot-details')){
  const details=document.createElement('details');details.id='pilot-details';details.className='pilot-details';
  const summary=document.createElement('summary');summary.textContent='Détails du test';
  const content=document.createElement('div');content.id='pilot-details-content';content.className='pilot-details-content';
  details.append(summary,content);zone.append(details);content.append($('refresh-references'));
 }
 const media=document.defaultView.matchMedia('(max-width:760px)');let opened=false
 function focusContent(){const panel=$('conversation').hidden?$('courses-view'):$('conversation');panel.focus({preventScroll:true})}
 function close(restoreFocus=false){
  opened=false;app.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Ouvrir le menu');workspace.inert=false;
  sidebar.inert=media.matches;sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');
  if(restoreFocus&&media.matches)toggle.focus({preventScroll:true})
 }
 function open(){
  if(!media.matches)return;opened=true;sidebar.inert=false;sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');app.classList.add('menu-open');toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Fermer le menu');workspace.inert=true;$('close-menu').focus({preventScroll:true})
 }
 toggle.addEventListener('click',()=>opened?close(true):open());$('close-menu').addEventListener('click',()=>close(true));$('sidebar-backdrop').addEventListener('click',()=>close(true));
 sidebar.addEventListener('click',event=>{
  if(!media.matches)return;
  if(!event.target.closest('[data-view],#open-profile,#restart,[data-research-number]'))return;
  close();if(!document.querySelector('dialog[open]'))focusContent()
 });
 document.addEventListener('keydown',event=>{
  if(!opened||!media.matches)return;
  if(event.key==='Escape'){event.preventDefault();close(true);return}
  if(event.key!=='Tab')return;
  const list=[...sidebar.querySelectorAll('button:not([disabled]),[tabindex]')].filter(e=>e.tabIndex>=0&&e.getClientRects().length);
  const first=list[0],last=list.at(-1);if(!first)return;
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 });
 $('profile-dialog').addEventListener('close',()=>{if(media.matches)toggle.focus({preventScroll:true})});
 media.addEventListener('change',()=>close());close();
 return {close,get isMobile(){return media.matches},get isOpen(){return opened}};
}

// Confirmation locale : rien n’est effacé et aucune requête n’est envoyée avant le choix explicite.
export function confirmNewRequest(document){
 let dialog=document.getElementById('new-request-dialog')
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='new-request-dialog';dialog.setAttribute('aria-labelledby','new-request-title');dialog.setAttribute('aria-describedby','new-request-description')
  dialog.style.cssText='width:520px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow:auto;border:1px solid #d5e0d0;border-radius:16px;padding:24px'
  const title=document.createElement('h2');title.id='new-request-title';title.textContent='Commencer une nouvelle demande ?';title.style.cssText='font-size:22px;line-height:1.35;margin:0 0 16px'
  const description=document.createElement('p');description.id='new-request-description';description.textContent='Votre discussion actuelle et les critères de « Ma demande » seront effacés. Vos recherches enregistrées resteront disponibles à gauche.';description.style.cssText='font-size:15px;line-height:1.65;margin:0 0 12px'
  const help=document.createElement('p');help.textContent='Pour conserver votre échange et poursuivre votre demande actuelle, choisissez « Continuer ma demande actuelle ».';help.style.cssText='font-size:14px;line-height:1.65;margin:0 0 22px;color:#526a5e'
  const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:10px'
  for(const [id,label,value]of [['keep-request','Continuer ma demande actuelle','continue'],['confirm-new-request','Commencer une nouvelle demande','new']]){
   const button=document.createElement('button');button.id=id;button.type='button';button.textContent=label;button.style.cssText='flex:1 1 210px;min-height:44px;border:1px solid #b8cdb4;border-radius:9px;padding:11px 13px;font-size:14px;line-height:1.5;background:'+(value==='new'?'#236851;color:white':'white;color:#355c32');if(value==='continue')button.autofocus=true;
   button.addEventListener('click',()=>dialog.close(value));actions.append(button)
  }
  dialog.append(title,description,help,actions);document.body.append(dialog)
 }
 if(dialog.open)return Promise.resolve(false)
 const opener=document.activeElement
 dialog.returnValue='continue'
 return new Promise(resolve=>{
  dialog.addEventListener('close',()=>{
   const target=opener?.isConnected&&!opener.closest('[inert]')?opener:document.getElementById('menu-toggle')
   target?.focus({preventScroll:true});resolve(dialog.returnValue==='new')
  },{once:true})
  dialog.showModal();document.getElementById('keep-request').focus({preventScroll:true})
 })
}

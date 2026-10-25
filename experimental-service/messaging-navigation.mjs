// Menu de navigation : uniquement des interactions locales, aucun minuteur de disparition.
export function initMessagingNavigation(document){
 const $=id=>document.getElementById(id),app=$('assistant-app'),sidebar=$('sidebar'),workspace=$('workspace'),toggle=$('menu-toggle');
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

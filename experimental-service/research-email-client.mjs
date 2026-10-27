import {researchLabel} from './messaging-state.mjs'
// Fenêtre locale : aucune requête avant le clic explicite « Envoyer ma synthèse ».
export function appendResearchEmail(document,row,snapshot){
 const opener=document.createElement('button');opener.type='button';opener.textContent='Recevoir par courriel';opener.dataset.emailExport='true';row.append(opener)
 opener.addEventListener('click',()=>{
  if(document.getElementById('research-email-dialog'))return
  const saved=structuredClone(snapshot),requestId=crypto.randomUUID(),dialog=document.createElement('dialog');dialog.id='research-email-dialog';dialog.className='email-dialog';dialog.setAttribute('aria-labelledby','research-email-title')
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
  const title=el('h2','Recevoir ma synthèse par courriel');title.id='research-email-title'
  const description=el('p','Retrouvez les critères de votre recherche et les cours proposés dans un PDF.')
  const selected=el('div',undefined,'email-research');selected.append(el('span','Recherche sélectionnée'),el('strong',researchLabel(saved)))
  const form=el('form'),label=el('label','Mon adresse de courriel'),input=el('input');label.htmlFor='research-email-address';input.id=label.htmlFor;input.type='email';input.autocomplete='email';input.required=true;input.maxLength=254;input.setAttribute('aria-describedby','research-email-help')
  const help=el('p','Vérifiez votre adresse avant de confirmer l’envoi.','email-help');help.id='research-email-help'
  const attachment=el('p','Pièce jointe : la synthèse de cette recherche, ses critères confirmés et les liens officiels.','email-help')
  const status=el('p','','email-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite')
  const actions=el('div',undefined,'action-row'),cancel=el('button','Annuler'),submit=el('button','Envoyer ma synthèse','primary');cancel.type='button';submit.type='submit';actions.append(cancel,submit)
  form.append(label,input,help,attachment,status,actions);dialog.append(title,description,selected,form);document.body.append(dialog)
  let sending=false
  cancel.addEventListener('click',()=>dialog.close());dialog.addEventListener('cancel',event=>{if(sending)event.preventDefault()})
  dialog.addEventListener('close',()=>{dialog.remove();if(opener.isConnected)opener.focus({preventScroll:true})},{once:true})
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(sending||submit.disabled||!form.reportValidity())return
   sending=true;submit.disabled=true;cancel.disabled=true;input.disabled=true;status.textContent='Envoi en cours…'
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000)
   try{
    const response=await fetch('/private/research-email',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({number:saved.number,recipient:input.value.trim(),requestId,confirmed:true})})
    const value=await response.json()
    if(response.ok&&value.accepted===true){status.textContent='Votre synthèse a été prise en charge pour envoi à '+input.value.trim()+'. Si elle n’arrive pas, vérifiez aussi les courriers indésirables.';cancel.textContent='Fermer'}
    else{status.textContent=value.error||'Envoi indisponible. Votre recherche reste conservée.';if(value.code==='invalid_email'){input.disabled=false;submit.disabled=false}else cancel.textContent='Fermer'}
   }catch{status.textContent='L’envoi n’a pas pu être confirmé. Vérifiez votre messagerie ; aucune relance automatique.';cancel.textContent='Fermer'}
   finally{clearTimeout(timer);sending=false;cancel.disabled=false}
  })
  dialog.showModal();input.focus()
 })
}

// Navigation locale des résultats reçus ; aucune génération ni appel réseau ici.
import {researchLabel} from './messaging-state.mjs'
export function renderResearchTabs(document,{history,current,busy=false,select,close}){
 const bar=document.createElement('div');bar.id='research-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Recherches enregistrées')
 bar.style.cssText='display:flex;gap:8px;overflow-x:auto;flex-shrink:0;padding:10px 24px;background:#f8faf6;border-bottom:1px solid #dce6d5;max-width:100%;box-sizing:border-box'
 const buttons=[]
 for(const snapshot of history){
  const selected=snapshot.number===current?.number,full='Recherche n° '+snapshot.number+' — '+snapshot.profile.objective
  const group=document.createElement('div');group.style.cssText='display:flex;flex:0 0 auto;border:1px solid '+(selected?'#194c50':'#cfdbca')+';border-radius:9px;background:'+(selected?'#194c50':'#fff')
  const tab=document.createElement('button');tab.type='button';tab.id='research-tab-'+snapshot.number;tab.dataset.researchNumber=snapshot.number;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(selected));tab.setAttribute('aria-controls','courses-content');tab.setAttribute('aria-label',full);tab.title=full;tab.tabIndex=selected?0:-1;tab.disabled=busy
  tab.textContent=researchLabel(snapshot);tab.style.cssText='border:0;background:transparent;color:'+(selected?'#fff':'#365a47')+';font:inherit;font-size:13px;max-width:230px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:10px 8px 10px 12px;border-radius:8px'
  tab.addEventListener('click',()=>select(snapshot.number));buttons.push(tab)
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='×';dismiss.setAttribute('aria-label','Fermer '+full);dismiss.title='Fermer cette recherche';dismiss.disabled=busy;dismiss.style.cssText='border:0;background:transparent;color:'+(selected?'#fff':'#365a47')+';font-size:20px;padding:4px 10px;border-radius:8px';dismiss.addEventListener('click',()=>close(snapshot.number))
  group.append(tab,dismiss);bar.append(group)
  tab.addEventListener('keydown',event=>{
   const i=buttons.indexOf(tab);let index
   if(event.key==='ArrowRight')index=(i+1)%buttons.length
   else if(event.key==='ArrowLeft')index=(i+buttons.length-1)%buttons.length
   else if(event.key==='Home')index=0
   else if(event.key==='End')index=buttons.length-1
   else return
   event.preventDefault();buttons[index].focus();buttons[index].click()
  })
 }
 const panel=document.getElementById('courses-content');panel.setAttribute('role','tabpanel');if(current)panel.setAttribute('aria-labelledby','research-tab-'+current.number);else panel.removeAttribute('aria-labelledby')
 return bar
}

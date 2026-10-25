// Navigation locale des résultats reçus ; aucune génération ni appel réseau ici.
import {researchLabel} from './messaging-state.mjs'
export function renderResearchTabs(document,{history,current,busy=false,view='courses',select,close}){
 const bar=document.createElement('div');bar.id='research-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Recherches enregistrées');bar.setAttribute('aria-orientation','vertical')

 const buttons=[]
 for(const snapshot of history){
  const selected=view==='courses'&&snapshot.number===current?.number,full='Recherche n° '+snapshot.number+' — '+snapshot.profile.objective
  const group=document.createElement('div');group.className='research-tab-group'+(selected?' selected':'')
  const tab=document.createElement('button');tab.type='button';tab.id='research-tab-'+snapshot.number;tab.dataset.researchNumber=snapshot.number;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(selected));tab.setAttribute('aria-controls','courses-content');tab.setAttribute('aria-label',full);tab.title=full;tab.tabIndex=snapshot.number===current?.number?0:-1;tab.disabled=busy
  tab.className='research-tab';const number=document.createElement('span');number.className='research-tab-number';number.textContent='Recherche n° '+snapshot.number;const title=document.createElement('span');title.className='research-tab-title';title.textContent=researchLabel(snapshot).split(' — ').slice(1).join(' — ');tab.append(number,title)
  tab.addEventListener('click',()=>select(snapshot.number));buttons.push(tab)
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='×';dismiss.setAttribute('aria-label','Fermer '+full);dismiss.title='Fermer cette recherche';dismiss.disabled=busy;dismiss.className='research-close';dismiss.addEventListener('click',()=>close(snapshot.number))
  group.append(tab,dismiss);bar.append(group)
  tab.addEventListener('keydown',event=>{
   const i=buttons.indexOf(tab);let index
   if(['ArrowRight','ArrowDown'].includes(event.key))index=(i+1)%buttons.length
   else if(['ArrowLeft','ArrowUp'].includes(event.key))index=(i+buttons.length-1)%buttons.length
   else if(event.key==='Home')index=0
   else if(event.key==='End')index=buttons.length-1
   else return
   event.preventDefault();buttons[index].focus();buttons[index].click()
  })
 }
 const panel=document.getElementById('courses-content');panel.setAttribute('role','tabpanel');if(current)panel.setAttribute('aria-labelledby','research-tab-'+current.number);else panel.removeAttribute('aria-labelledby')
 return bar
}

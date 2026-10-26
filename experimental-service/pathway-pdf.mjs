import {scheduledOpeningLabel} from './pathway-result.mjs'
import {createMessagingSnapshot,researchLabel,composeConstraints} from './messaging-state.mjs'

export const AI_GUIDANCE='L’assistant IA peut faire des erreurs. Vérifiez les informations et les conditions d’accès sur les fiches officielles. En cas de doute, rapprochez-vous de votre service RH ou de votre hiérarchie.'
const labels={personnelCategory:'Groupe de personnel',entity:'Entité ou service',managerStatus:'Situation managériale',role:'Métier ou fonction',objective:'Objectif',existingSkills:'Compétences actuelles',timeAvailable:'Temps disponible'}

// Le PDF reprend le résultat sélectionné, jamais le brouillon actuel ni une réponse IA supplémentaire.
export function createPdfModel(snapshot,{references,now=new Date()}={}){
  if(!snapshot||JSON.stringify(snapshot).length>1024*1024)throw Error('Recherche indisponible pour l’export.')
  const saved=createMessagingSnapshot(snapshot.profile,snapshot.result,snapshot.referenceRevision,snapshot.number,snapshot.modality,snapshot.mode)
  const simulation=saved.mode!=='real',result=saved.result
  const criteria=Object.entries(labels).map(([key,label])=>{
    const value=saved.profile[key]??''
    const option=references?.revision===saved.referenceRevision?references.pathway?.fields?.[key]?.options?.find(x=>x.value===value):null
    return [label,option?.label||value||'Non renseigné']
  })
  criteria.push(['Modalité souhaitée',saved.modality||'Non renseignée'])
  let constraints=saved.profile.constraints??''
  const prefix=composeConstraints(saved.modality)
  if(prefix&&(constraints===prefix||constraints.startsWith(prefix+'\n')))constraints=constraints.slice(prefix.length).trim()
  criteria.push(['Autres contraintes',constraints||'Non renseignées'])
  const groups=[['Votre parcours recommandé',result.recommendedSteps??result.steps??[]],['Compléments et alternatives - facultatifs',result.optionalSteps??[]],['Pour information - accès à vérifier',result.informationalCourses??[]]]
  const noPathway=Boolean(result.abstain||!groups[0][1].length)
  const date=new Date(now)
  if(!Number.isFinite(date.getTime()))throw Error('Date d’export invalide.')
  const slug=saved.profile.objective?.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'formation'
  return {title:researchLabel(saved),criteria,groups,summary:result.summary,interpretedGoal:result.interpretedGoal||'',gaps:result.gaps??[],duration:result.durationSummary??null,
    simulation,noPathway,guidance:AI_GUIDANCE,date,filename:'a658yg-recherche-'+slug+'.pdf'}
}

export function renderPathwayPdf(model,{jsPDF,fonts,logo}={}){
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true})
  for(const [style,name]of [['normal','regular'],['bold','bold']]){
    doc.addFileToVFS('A658-'+name+'.ttf',fonts[name]);doc.addFont('A658-'+name+'.ttf','A658',style)
  }
  doc.setProperties({title:model.title,subject:'Synthèse de recherche de formation',author:'A658-YG'})
  doc.setCreationDate(model.date)
  const ink='#173f49',muted='#526a61',line='#d9e4de',pale='#f3f7f3'
  const left=14,right=196,bottom=279;let y=36,x=left,width=right-left
  const font=(size=9.5,style='normal',color=ink)=>{doc.setFont('A658',style);doc.setFontSize(size);doc.setTextColor(color)}
  const header=()=>{
    if(logo)doc.addImage(logo,'PNG',left,8,12,13.5)
    font(12,'bold');doc.text('A658-YG',logo?30:left,14)
    font(8,'normal',muted);doc.text('Votre assistant formation',logo?30:left,19)
    const date=new Intl.DateTimeFormat('fr-CH',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric'}).format(model.date)
    doc.text('Export du '+date,right,14,{align:'right'})
    doc.setDrawColor(line);doc.line(left,26,right,26)
    y=36
  }
  const ensure=h=>{if(y+h>bottom){if(doc.getNumberOfPages()>=100)throw Error('Recherche trop longue pour cet export.');doc.addPage();header()}}
  const linesFor=(text,size=9.5,style='normal',w=width)=>{font(size,style);return String(text??'').split('\n').flatMap(part=>part?doc.splitTextToSize(part,w):[''])}
  const write=(text,{size=9.5,style='normal',color=ink,after=2}={})=>{
    const height=size*.352778*1.42
    for(const content of linesFor(text,size,style)){
      ensure(height);font(size,style,color);doc.text(content,x,y);y+=height
    }
    y+=after
  }
  const heading=text=>{ensure(17);y+=3;write(text,{size:11,style:'bold',after:3})}
  header();write(model.title,{size:19,style:'bold',after:3})
  write(model.simulation?'PARCOURS SIMULÉ - exemple fixe, sans personnalisation':'La synthèse de ma recherche',{size:9,color:muted,after:4})
  heading('Les critères de ma recherche')
  const objective=model.criteria.find(([label])=>label==='Objectif')
  if(objective)write(objective[0]+' : '+objective[1],{size:9,after:3})
  const others=model.criteria.filter(([label])=>label!=='Objectif')
  for(let index=0;index<others.length;index+=2){
    const pair=others.slice(index,index+2),columnWidth=(right-left-8)/2
    const cells=pair.map(([label,value])=>({label,lines:linesFor(value,8.5,'normal',columnWidth)}))
    const height=Math.max(...cells.map(cell=>cell.lines.length*4.1+6))
    if(height>60){for(const [label,value]of pair)write(label+' : '+value,{size:9,after:2});continue}
    ensure(height)
    for(const [column,cell]of cells.entries()){
      const cellX=left+column*(columnWidth+8);font(8.2,'bold',muted);doc.text(cell.label,cellX,y)
      font(8.5);doc.text(cell.lines,cellX,y+4,{lineHeightFactor:1.42})
    }
    y+=height
  }
  heading('Temps de formation')
  const duration=model.duration
  if(model.simulation)write('Les durées de cet exemple fictif ne sont pas comparées à votre disponibilité. Le temps que vous avez indiqué figure dans les critères ci-dessus.')
  else{
    if(duration?.budgetHours!=null)write('Votre disponibilité : '+duration.budgetHours+' h',{style:'bold'})
    if(model.noPathway)write('Aucun parcours proposé : durée non calculée.')
    else if(duration){
      write('Durée du parcours recommandé : '+(duration.recommendedHours==null?'non renseignée':duration.recommendedHours+' h'),{style:'bold'})
      if(duration.excessHours>0)write('Dépassement : '+duration.excessHours+' h. Le parcours dépasse le temps disponible.',{color:'#795015'})
      if(duration.durationsKnown===false||duration.verified===false||duration.budgetVerified===false)write('La vérification des durées est incomplète.',{color:muted})
    }else write('Durée totale non renseignée dans ce résultat.')
  }
  heading(model.noPathway?'Résultat de votre recherche':'Votre parcours de formation')
  write(model.summary)
  if(model.interpretedGoal)write('Objectif interprété : '+model.interpretedGoal,{size:9,color:muted})
  if(model.noPathway)write('Aucun parcours adapté n’a été proposé dans ce résultat.')
  for(const [label,items]of model.groups){
    if(!items.length)continue
    let first=true
    for(const item of items){
      const course=item.course
      const mode={online:'en ligne',in_person:'en présentiel',hybrid:'hybride'}[course.deliveryMode?.value]||'à vérifier sur la fiche officielle'
      const durationText=course.duration|| (course.durationHours==null?'non renseignée':course.durationHours+' h')
      const parts=[{text:item.position+'. '+course.code+' - '+course.title,size:10,style:'bold'},
        {text:'Durée : '+durationText+' | Public : '+(course.public||'non renseigné'),size:8.5,color:muted},
        {text:'Modalité : '+mode,size:8.5,color:muted},{text:item.rationale,size:9.5}]
      const available=course.sessionAvailability
      const known=!model.simulation&&available?.source==='official-session-icons'&&available.observedOn<=model.date.toISOString().slice(0,10)
      const statuses=[]
      if(known&&available.hasOpenSession)statuses.push('Inscriptions ouvertes lors du relevé')
      if(known&&available.hasScheduledSession)statuses.push(scheduledOpeningLabel(available,model.date))
      parts.push({text:statuses.length?statuses.join(' ; ')+' - relevé du '+available.observedOn.split('-').reverse().join('/')+'. Situation actuelle à vérifier.':'Sessions : à vérifier sur la fiche officielle.',size:8.5,color:muted})
      const cardWidth=right-left-8
      const height=parts.reduce((h,p)=>h+linesFor(p.text,p.size,p.style||'normal',cardWidth).length*p.size*.352778*1.42+1,0)+(course.sourceUrl?8:2)+3
      const boxed=height<bottom-50
      if(first){ensure(boxed?height+14:49);heading(label);first=false}
      ensure(Math.min(height,35))
      if(boxed){ensure(height);doc.setFillColor(pale);doc.setDrawColor(line);doc.roundedRect(left,y-4,right-left,height,2,2,'FD')}
      x=left+4;width=cardWidth
      for(const part of parts)write(part.text,{after:1,...part})
      if(course.sourceUrl){
        ensure(6);font(8.5,'normal','#21644f');doc.text('Consulter la fiche officielle',x,y)
        doc.link(x,y-3,52,5,{url:course.sourceUrl});y+=6
      }
      y+=3;x=left;width=right-left
    }
  }
  if(model.gaps.length){heading('Limites des fiches examinées');for(const gap of model.gaps)write('- '+gap)}
  y+=4
  const warningHeight=linesFor(model.guidance,9.5,'normal',right-left-8).length*9.5*.352778*1.42+9
  ensure(warningHeight);doc.setFillColor('#edf2ed');doc.rect(left,y-4,right-left,warningHeight,'F');x=left+4;width=right-left-8
  write(model.guidance,{size:9.5});x=left;width=right-left
  const count=doc.getNumberOfPages()
  for(let page=1;page<=count;page++){
    doc.setPage(page);doc.setDrawColor(line);doc.line(left,286,right,286);font(8,'normal',muted)
    doc.text('A658-YG - '+(model.simulation?'Exemple de parcours simulé':'Synthèse de recherche'),left,291)
    doc.text(page+' / '+count,right,291,{align:'right'})
  }
  return doc
}

let resources
function base64(buffer){const bytes=new Uint8Array(buffer);let value='';for(let offset=0;offset<bytes.length;offset+=16384)value+=String.fromCharCode(...bytes.subarray(offset,offset+16384));return btoa(value)}
async function loadResources(){
  if(!resources)resources=(async()=>{
    await import('./vendor/jspdf.umd.min.js')
    const fonts={}
    for(const [name,file]of [['regular','DejaVuSans.ttf'],['bold','DejaVuSans-Bold.ttf']]){
      const response=await fetch('/private/pdf-font-'+name+'.ttf',{credentials:'same-origin',cache:'force-cache',redirect:'error'})
      if(!response.ok)throw Error('Police PDF indisponible.')
      fonts[name]=base64(await response.arrayBuffer())
    }
    return {jsPDF:globalThis.jspdf.jsPDF,fonts}
  })().catch(error=>{resources=null;throw error})
  return resources
}
async function logoData(){
  try{return await new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=135;const context=canvas.getContext('2d');context.drawImage(image,0,0,image.width/3,image.height,0,0,120,135);resolve(canvas.toDataURL('image/png'))};image.onerror=reject;image.src='/private/assistant-robot.webp'
  })}catch{return undefined}
}
export async function downloadPathwayPdf(snapshot,{references}={}){
  const model=createPdfModel(snapshot,{references})
  const [loaded,logo]=await Promise.all([loadResources(),logoData()])
  const doc=renderPathwayPdf(model,{...loaded,logo})
  await doc.save(model.filename,{returnPromise:true})
  return model.filename
}

export function appendPdfExport(document,parent,snapshot,references){
  const row=document.createElement('div');row.className='action-row pdf-export'
  const button=document.createElement('button');button.type='button';button.className='primary';button.textContent='Télécharger la synthèse en PDF';button.dataset.pdfExport='true'
  const notice=document.createElement('p');notice.className='source-note';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.textContent='Le PDF reprend cette recherche et ses critères confirmés.'
  button.addEventListener('click',async()=>{
    if(button.disabled)return;button.disabled=true;notice.textContent='Préparation du PDF…'
    try{await downloadPathwayPdf(snapshot,{references});notice.textContent='PDF préparé. Retrouvez-le dans les téléchargements de votre navigateur.'}
    catch{notice.textContent='Le PDF n’a pas pu être préparé. Votre recherche reste disponible ; vous pouvez réessayer.'}
    finally{button.disabled=false}
  })
  row.append(button);parent.append(row,notice)
}

import {catalogueVersionLabel} from './catalogue-version.mjs'
import {courseDisplayDetails,SEARCH_RESULT_NOTE,TIME_PLANNING_NOTICE,TIME_EXCESS_NOTICE} from './pathway-result.mjs'
import {createMessagingSnapshot,researchLabel,composeConstraints} from './messaging-state.mjs'

export const AI_GUIDANCE='L’assistant IA peut faire des erreurs. Vérifiez les informations et les conditions d’accès sur les fiches officielles. En cas de doute, rapprochez-vous de votre service RH ou de votre hiérarchie.'
const labels={personnelCategory:'Groupe de personnel',entity:'Entité ou service',managerStatus:'Situation managériale',role:'Métier ou fonction',objective:'Objectif',existingSkills:'Compétences actuelles',timeAvailable:'Temps disponible'}

// Le PDF reprend le résultat sélectionné, jamais le brouillon actuel ni une réponse IA supplémentaire.
export function createPdfModel(snapshot,{references,now=new Date()}={}){
  if(!snapshot||JSON.stringify(snapshot).length>1024*1024)throw Error('Recherche indisponible pour l’export.')
  const saved=createMessagingSnapshot(snapshot.profile,snapshot.result,snapshot.referenceRevision,snapshot.number,snapshot.modality,snapshot.mode)
  const simulation=saved.mode!=='real',result=saved.result
  const criterionLabels={...labels,...(saved.profile.professionalEnvironment?{professionalEnvironment:'Environnement professionnel'}:{}),...(saved.profile.trainingOffers?{trainingOffers:'Offres de formation'}:{}),...(saved.profile.trainingOrganizers?{trainingOrganizers:'Entités de formation'}:{})};if(saved.profile.professionalEnvironment||result.searchQuery)delete criterionLabels.entity;
  const criteria=result.searchQuery?[['Recherche',result.searchQuery]]:Object.entries(criterionLabels).map(([key,label])=>{
    const value=saved.profile[key]??''
    const option=references?.revision===saved.referenceRevision?references.pathway?.fields?.[key]?.options?.find(x=>x.value===value):null
    return [label,option?.label||value||'Non renseigné']
  })
  if(!result.searchQuery){
  criteria.push(['Modalité souhaitée',saved.modality==='Indifférent'?'Sans préférence de modalité':saved.modality||'Non renseignée'])
  let constraints=saved.profile.constraints??''
  const prefix=composeConstraints(saved.modality)
  if(prefix&&(constraints===prefix||constraints.startsWith(prefix+'\n')))constraints=constraints.slice(prefix.length).trim()
  criteria.push(['Autres contraintes',constraints||'Non renseignées'])
  }
  const groups=[[(result.searchQuery?'Formations proposées':'Votre parcours recommandé'),result.recommendedSteps??result.steps??[]],[(result.searchQuery?'Formations complémentaires':'Compléments et alternatives - facultatifs'),result.optionalSteps??[]],[(result.searchQuery?'Autres pistes - accès à vérifier':'Pour information - accès à vérifier'),result.informationalCourses??[]]]
  const noPathway=Boolean(result.abstain||!groups[0][1].length)
  const date=new Date(now)
  if(!Number.isFinite(date.getTime()))throw Error('Date d’export invalide.')
  const slug=saved.profile.objective?.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'formation'
  return {title:(result.searchQuery||saved.profile.objective||researchLabel(saved)).trim(),catalogueLabel:catalogueVersionLabel(result.catalogue,{results:true,simulation}),criteria,groups,summary:result.summary,interpretedGoal:result.interpretedGoal||'',gaps:result.gaps??[],duration:result.durationSummary??null,
    simulation,noPathway,searchOnly:Boolean(result.searchQuery),objective:saved.profile.objective||'',preferredModality:saved.modality||'',guidance:AI_GUIDANCE,date,filename:'a658yg-recherche-'+slug+'.pdf'}
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
  const write=(text,{size=9.5,style='normal',color=ink,after=2,leading=1.42}={})=>{
    const height=size*.352778*leading
    for(const content of linesFor(text,size,style)){
      ensure(height);font(size,style,color);doc.text(content,x,y);y+=height
    }
    y+=after
  }
  const heading=text=>{ensure(17);y+=3;write(text,{size:11,style:'bold',after:3})}
  header();write(model.title,{size:19,style:'bold',after:3})
  write(model.simulation?'PARCOURS SIMULÉ - exemple fixe, sans personnalisation':'La synthèse de ma recherche',{size:9,color:muted,after:4})
  write(model.catalogueLabel,{size:8.5,color:muted,after:4})
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
  heading(model.searchOnly||model.noPathway?'Résultat de votre recherche':'Votre parcours de formation')
  write(model.summary)
  if(model.interpretedGoal)write('Objectif interprété : '+model.interpretedGoal,{size:9,color:muted})
  if(model.noPathway&&!model.searchOnly)write('Aucun parcours adapté n’a été proposé dans ce résultat.')
  for(const [label,items]of model.groups){
    if(!items.length)continue
    let first=true
    for(const item of items){
      const course=item.course
      const presentation=courseDisplayDetails(course,{replay:model.simulation,now:model.date,objective:model.objective})
      const primary=label==='Votre parcours recommandé'
      const parts=[
        {text:(primary?'ÉTAPE '+item.position+' - ':'')+course.code+' - '+course.title,size:10,style:'bold'},
        ...(!primary&&!model.searchOnly?[{text:label.startsWith('Pour information')?'Pour information - accès à vérifier':'Piste facultative',size:8.5,color:muted}]:[]),
        {text:'Durée : '+presentation.duration+' | Public : '+(course.public||'non renseigné')+' | '+presentation.modality,size:8.5,color:muted},
        ...presentation.statuses.map(status=>({text:status.label,size:8.5,style:'bold',badge:status.kind})),
        ...(!model.searchOnly||item.rationale!==SEARCH_RESULT_NOTE?[{text:'Pourquoi ce cours ?',size:8.5,style:'bold'},{text:item.rationale,size:9.5}]:[]),
        ...(presentation.modalityNote?[{text:presentation.modalityNote,size:8,color:muted}]:[]),
        ...(presentation.versionNote?[{text:presentation.versionNote,size:8.5,color:'#795015'}]:[]),
        {text:presentation.sessionNote,size:8,color:muted},
      ]
      const cardWidth=right-left-12
      const linkLines=course.sourceUrl?linesFor(course.sourceUrl,7.5,'normal',cardWidth):[]
      const height=parts.reduce((h,p)=>h+linesFor(p.text,p.size,p.style||'normal',cardWidth).length*p.size*.352778*1.25+(p.badge?5:1.5),0)+(course.sourceUrl?linkLines.length*3.8+4.5:0)+8
      const boxed=height<bottom-50
      if(first){ensure(boxed?height+14:49);heading(label);first=false}
      ensure(Math.min(height,35))
      if(boxed)ensure(height)
      const cardStart=y
      if(boxed){
        doc.setFillColor('#ffffff');doc.setDrawColor(line);doc.roundedRect(left,y-4,right-left,height,2,2,'FD')
        if(primary){doc.setFillColor('#e6f2ea');doc.rect(left,y-4,2,height,'F')}
      }
      x=left+6;width=cardWidth
      for(const part of parts){
        if(part.badge){
          const lines=linesFor(part.text,part.size,'bold',cardWidth-6)
          const h=lines.length*part.size*.352778*1.25+3
          ensure(h+2)
          const color=part.badge==='open'?'#edf7ef':part.badge==='scheduled'?'#eff3f8':'#f2f5f5'
          const border=part.badge==='open'?'#8db39a':'#a7b7c4'
          const w=Math.min(cardWidth,Math.max(...lines.map(line=>doc.getTextWidth(line)))+8)
          doc.setFillColor(color);doc.setDrawColor(border);doc.roundedRect(x,y-3,w,h,1,1,'FD')
          const previousX=x,previousWidth=width;x+=3;width=cardWidth-6
          write(part.text,{size:part.size,style:'bold',color:part.badge==='open'?'#246244':ink,after:5,leading:1.25})
          x=previousX;width=previousWidth
        }else write(part.text,{after:1.5,leading:1.25,...part})
      }
      if(course.sourceUrl){
        ensure(8+linkLines.length*3.8)
        font(8.5,'bold','#21644f');doc.text('Fiche officielle - '+course.code,x,y)
        doc.link(x,y-3,Math.min(cardWidth,doc.getTextWidth('Fiche officielle - '+course.code)),5,{url:course.sourceUrl});y+=4.5
        for(const line of linkLines){font(7.5,'normal','#21644f');doc.text(line,x,y);doc.link(x,y-2.5,Math.min(cardWidth,doc.getTextWidth(line)),4,{url:course.sourceUrl});y+=3.8}
      }
      y=Math.max(y+7,boxed?cardStart-4+height+6:0);x=left;width=right-left

    }
  }
  if(!model.searchOnly){
  heading('Temps de formation')
  const duration=model.duration
  if(model.simulation)write('Les durées de cet exemple fictif ne sont pas comparées à votre disponibilité. Le temps que vous avez indiqué figure dans les critères ci-dessus.')
  else{
    const metrics=[]
    if(duration?.budgetHours!=null)metrics.push(['Temps disponible',duration.budgetHours+' h'])
    if(!model.noPathway&&duration){
      metrics.push(['Parcours recommandé',duration.recommendedHours==null?'Non renseigné':duration.recommendedHours+' h'])
      if(duration.excessHours>0)metrics.push(['Dépassement','+ '+duration.excessHours+' h'])
      else if(duration.withinBudget===true&&duration.durationsKnown===true&&duration.verified===true&&duration.budgetVerified===true)metrics.push(['Dépassement','Aucun'])
    }
    if(metrics.length){
      ensure(22);const metricWidth=(right-left-(metrics.length-1)*4)/metrics.length
      for(const [index,[label,value]]of metrics.entries()){
        const metricX=left+index*(metricWidth+4)
        doc.setFillColor(pale);doc.setDrawColor(line);doc.roundedRect(metricX,y-3,metricWidth,18,2,2,'FD')
        font(8,'normal',muted);doc.text(label,metricX+3,y+2)
        font(13,'bold');doc.text(value,metricX+3,y+9)
      }
      y+=21
    }
    if(model.noPathway)write('Aucun parcours proposé : durée non calculée.')
    else if(duration){
      if(duration.excessHours>0)write('Dépassement : '+duration.excessHours+' h. '+TIME_EXCESS_NOTICE+' '+TIME_PLANNING_NOTICE,{color:'#795015'})
      if(duration.durationsKnown===false||duration.verified===false||duration.budgetVerified===false)write('La vérification des durées est incomplète.',{color:muted})
    }else write('Durée totale non renseignée dans ce résultat.')
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

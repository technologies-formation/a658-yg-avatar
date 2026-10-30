// Texte IA présenté sans HTML interprété. Les liens viennent seulement des cours reçus.
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
function official(url){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='outils.ge.ch'&&!u.username&&!u.password&&!u.port&&u.pathname.startsWith('/referentiel/formation/')}catch{return false}}
export function renderDialogueReply(document,parent,text,courses=[]) {
 const names=new Map()
 for(const c of courses){if(!official(c.sourceUrl)||!c.code||!c.title)continue;for(const name of [c.title,c.code,`${c.code} – ${c.title}`,`${c.code} — ${c.title}`,`${c.code} - ${c.title}`])if(!names.has(name.toLocaleLowerCase('fr')))names.set(name.toLocaleLowerCase('fr'),{name,url:c.sourceUrl})}
 const expression=names.size?new RegExp('(?<![\\p{L}\\p{N}])('+[...names.values()].map(x=>x.name).sort((a,b)=>b.length-a.length).map(escape).join('|')+')(?![\\p{L}\\p{N}])','giu'):null
 const append=(target,value)=>{if(!expression){target.append(document.createTextNode(value));return}let start=0;for(const match of value.matchAll(expression)){target.append(document.createTextNode(value.slice(start,match.index)));const a=document.createElement('a'),strong=document.createElement('strong');a.href=names.get(match[0].toLocaleLowerCase('fr')).url;a.target='_blank';a.rel='noopener noreferrer';strong.textContent=match[0];a.append(strong);target.append(a);start=match.index+match[0].length}target.append(document.createTextNode(value.slice(start)))}
 const inline=(target,value)=>{let start=0;for(const m of value.matchAll(/\*\*([^*\n]+)\*\*/g)){append(target,value.slice(start,m.index));const strong=document.createElement('strong');append(strong,m[1]);target.append(strong);start=m.index+m[0].length}append(target,value.slice(start))}
 // Les URL générées ne deviennent jamais cliquables. Le libellé peut être lié à une fiche vérifiée.
 const clean=String(text).replace(/\[([^\]\n]+)\]\([^\n)]*\)/g,'$1')
 parent.replaceChildren();parent.classList.add('dialogue-reply');let list=null
 for(const line of clean.split(/\r?\n/)){if(!line.trim()){list=null;continue}const bullet=line.match(/^\s*(?:[-*]|\d+[.)])\s+(.+)$/);if(bullet){if(!list){list=document.createElement('ul');parent.append(list)}const li=document.createElement('li');inline(li,bullet[1]);list.append(li)}else{list=null;const p=document.createElement('p');inline(p,line);parent.append(p)}}
}

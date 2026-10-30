import test from 'node:test'
import assert from 'node:assert/strict'
import {renderDialogueReply} from './dialogue-reply.mjs'
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.value='';this.classList={add(){}}}
 set textContent(value){this.children=[];this.value=value}get textContent(){return this.value+this.children.map(x=>x.textContent).join('')}
 append(...nodes){this.children.push(...nodes)}replaceChildren(...nodes){this.children=nodes;this.value=''}
 set innerHTML(_value){assert.fail('HTML non autorisé')}
}
const document={createElement:tag=>new Element(tag),createTextNode:text=>{const e=new Element('#text');e.textContent=text;return e}}
const descendants=root=>[root,...root.children.flatMap(descendants)]
const courses=[{code:'TRT450',title:'Cockpit RH',sourceUrl:'https://outils.ge.ch/referentiel/formation/CatalogueDescription/TRT450.html'}]
test('dialogue : cours en gras et liens vérifiés, paragraphes et listes lisibles sans HTML interprété',()=>{
 const root=new Element('div');renderDialogueReply(document,root,'Pour les absences :\n- **TRT450 – Cockpit RH** : atelier métier.\n\nQuel est votre niveau sur Excel ?',courses)
 const nodes=descendants(root),links=nodes.filter(x=>x.tag==='a');assert.equal(links.length,1);assert.equal(links[0].href,courses[0].sourceUrl);assert.equal(links[0].rel,'noopener noreferrer');assert.equal(links[0].children[0].tag,'strong');assert.equal(nodes.filter(x=>x.tag==='ul').length,1);assert.doesNotMatch(root.textContent,/\*\*/)
})
test('dialogue : URL modèle et HTML hostiles ne deviennent jamais des destinations ou éléments exécutables',()=>{
 const root=new Element('div');renderDialogueReply(document,root,'<img src=x onerror=alert(1)>\n[Cockpit RH](javascript:evil) et [inconnu](https://evil.invalid)',[...courses,{code:'BAD',title:'inconnu',sourceUrl:'https://evil.invalid'}]);const nodes=descendants(root),links=nodes.filter(x=>x.tag==='a');assert.equal(links.length,1);assert.equal(links[0].href,courses[0].sourceUrl);assert.ok(root.textContent.includes('<img'));assert.equal(nodes.filter(x=>x.tag==='img').length,0)
})

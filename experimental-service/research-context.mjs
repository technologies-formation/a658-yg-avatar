// Contexte borné, exclusivement issu des recherches de l'identité authentifiée.
export function createResearchContext(research,pathways,{courseCode}={}) {
 const trim=(x,n=400)=>typeof x==='string'?x.slice(0,n):''
 const categories=['recommendedSteps','optionalSteps','informationalCourses']
 const items=(value,key)=>((value.result[key]??(key==='recommendedSteps'?value.result.steps:[])??[]).slice(0,12)).map(x=>({code:x.course.code,title:trim(x.course.title,160),rationale:trim(x.rationale),duration:trim(x.course.duration,80),public:trim(x.course.public,160),catalogueOffers:x.course.catalogueOffers,organizingEntity:trim(x.course.organizingEntity,160),deliveryMode:x.course.deliveryMode?{value:x.course.deliveryMode.value,sourceField:x.course.deliveryMode.sourceField}:undefined,relevance:x.relevance?{level:x.relevance.level,reason:trim(x.relevance.reason,180)}:undefined}))
 const key=String(research.profile.objective??'').trim()
 const related=pathways.filter(x=>x.number!==research.number&&String(x.profile.objective??'').trim()===key).slice(-3)
 return {number:research.number,conversationKey:key,...(courseCode?{selectedCourse:courseCode}:{}),profile:research.profile,modality:research.modality,summary:trim(research.result.summary,600),gaps:(research.result.gaps??[]).slice(0,3).map(x=>trim(x)),...Object.fromEntries(categories.map(k=>[k,items(research,k)])),previousSearches:related.map(x=>({number:x.number,trainingOffers:x.profile.trainingOffers??'',trainingOrganizers:x.profile.trainingOrganizers??'',summary:trim(x.result.summary,220),courses:categories.flatMap(k=>items(x,k)).map(c=>({code:c.code,title:c.title,catalogueOffers:c.catalogueOffers,organizingEntity:c.organizingEntity})).slice(0,8)}))}
}

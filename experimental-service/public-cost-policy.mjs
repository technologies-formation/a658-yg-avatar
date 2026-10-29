// Bornes conservatrices du pilote, pas une facture. Prix revus le 28/10/2026.
// Sources : docs/models/gpt-6-luna, docs/models/gpt-5.6-luna, docs/guides/prompt-caching.
export const PUBLIC_COST_POLICY=Object.freeze({id:'a658-public-cost-20261028-v2',validUntil:'2026-11-04T23:00:00.000Z',
  maxInputTokens:1_050_000,serviceTier:'default',cacheTtl:'30m',
  dialogue:Object.freeze({model:'gpt-6-luna',calls:1,maxOutputTokens:2000,reserveMicroUsd:300_000,inputRateHundredths:25,outputRateHundredths:75}),
  research:Object.freeze({model:'gpt-5.6-luna',calls:2,maxOutputTokens:1200,reserveMicroUsd:1_250_000,inputRateHundredths:50,outputRateHundredths:180})})
export class PublicCostError extends Error{constructor(code){super(code);this.code=code}}
export function requirePublicCostPolicy(now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0||now>=Date.parse(PUBLIC_COST_POLICY.validUntil))throw new PublicCostError('public_cost_review_expired')
}
export function publicCostUpper(kind,input,output){
 const rule=PUBLIC_COST_POLICY[kind]
 if(!rule||!Number.isSafeInteger(input)||input<1||input>PUBLIC_COST_POLICY.maxInputTokens||!Number.isSafeInteger(output)||output<0||output>rule.maxOutputTokens)throw new PublicCostError('public_usage_unverified')
 // Toutes les entrées au tarif long-contexte d'écriture 30m, toutes les sorties
 // au tarif long-contexte, puis marge régionale de 10 %. Aucun gain de cache supposé.
 return Math.ceil((input*rule.inputRateHundredths+output*rule.outputRateHundredths)*11/1000)
}
export function verifyPublicCostProof(value,kind='research'){
 const rule=PUBLIC_COST_POLICY[kind]
 if(!value||value.policy!==PUBLIC_COST_POLICY.id||value.model!==rule.model||value.serviceTier!=='default'||value.cacheTtl!=='30m'||
  !Array.isArray(value.calls)||value.calls.length>rule.calls)throw new PublicCostError('public_bounds_unverified')
 let upper=0
 for(const call of value.calls)upper+=publicCostUpper(kind,call.inputTokens,call.outputTokens)
 if(value.upperMicroUsd!==upper||upper>rule.reserveMicroUsd)throw new PublicCostError('public_bounds_unverified')
 return upper
}

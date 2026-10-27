// Métadonnées de provenance ; ne jamais remplacer une date absente par la date du jour.
export function readCatalogueVersion(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.snapshotDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.snapshotDate)||typeof value.snapshotHash!=='string'||!/^[a-f0-9]{64}$/.test(value.snapshotHash))return null
 const date=new Date(value.snapshotDate+'T12:00:00Z')
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value.snapshotDate)return null
 return {snapshotDate:value.snapshotDate,snapshotHash:value.snapshotHash}
}
export function catalogueVersionLabel(value,{results=false,simulation=false}={}){
 if(simulation)return 'Exemple simulé : aucun catalogue consulté pour ces résultats.'
 const version=readCatalogueVersion(value)
 if(!version)return results?'Date du catalogue non renseignée pour cette recherche.':'Date du catalogue indisponible pour le moment.'
 const date=version.snapshotDate.split('-').reverse().join('.')
 return results?'Résultats basés sur le catalogue du '+date+'.':'Catalogue actualisé le '+date+'.'
}

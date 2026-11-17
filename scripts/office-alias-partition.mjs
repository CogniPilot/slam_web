// Partition an already frozen membership; never select or replace candidates.
export function aliasPartition(input,manifestSha256,totalCases){
  if(!input||Object.keys(input).sort().join(',')!=='ordinals,schemaVersion,selectionManifestSha256'
      ||input.schemaVersion!==1||input.selectionManifestSha256!==manifestSha256
      ||!Array.isArray(input.ordinals)||input.ordinals.length<1||input.ordinals.length>totalCases)
    throw Error('Invalid alias partition envelope or frozen manifest binding');
  let previous=-1;
  for(const ordinal of input.ordinals){
    if(!Number.isSafeInteger(ordinal)||ordinal<=previous||ordinal>=totalCases)
      throw Error('Alias partition ordinals must be unique, increasing and within frozen membership');
    previous=ordinal;
  }
  return new Set(input.ordinals);
}

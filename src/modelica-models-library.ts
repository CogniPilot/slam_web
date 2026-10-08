// Exact local library text is shipped with the static app and saved projects.
const files=import.meta.glob<string>('../models/Libraries/CogniPilot/**/*.mo',{
  eager:true,query:'?raw',import:'default',
});
export const modelicaModelsSources:Readonly<Record<string,string>>=Object.freeze(
  Object.fromEntries(Object.entries(files).map(([path,source])=>[path.slice(3),source])));

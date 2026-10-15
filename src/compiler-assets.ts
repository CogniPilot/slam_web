import pinText from '../rumoca-package.json?raw';
const revision:string=JSON.parse(pinText).revision;
/** Version both files together so a new app build bypasses cached compilers. */
export function compilerAsset(base:string|URL,kind:'js'|'wasm'){
  const url=new URL(`vendor/rumoca/rumoca_bind_wasm${kind==='wasm'?'_bg.wasm':'.js'}`,base);
  url.searchParams.set('revision',revision);return url.href;
}

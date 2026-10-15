import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {compilerAsset} from '../src/compiler-assets';
it('versions the compiler pair with the exact pin and preserves the deployed base path',()=>{
 const pin=JSON.parse(readFileSync('rumoca-package.json','utf8'));
 for(const kind of ['js','wasm'] as const){
  const url=new URL(compilerAsset('https://example.com/slam_web/',kind));
  expect(url.origin).toBe('https://example.com');
  expect(url.pathname).toBe(`/slam_web/vendor/rumoca/rumoca_bind_wasm${kind==='js'?'.js':'_bg.wasm'}`);
  expect(url.searchParams.get('revision')).toBe(pin.revision);
 }
});

import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import init,* as compiler from '@cognipilot/rumoca';

it('uses the same pinned main compiler package in Node and browser assets',async()=>{
  const pin=JSON.parse(readFileSync('rumoca-package.json','utf8'));
  for(const [name,sha] of Object.entries(pin.files)){
    for(const root of ['node_modules/@cognipilot/rumoca','public/vendor/rumoca'])expect(createHash('sha256').update(readFileSync(`${root}/${name}`)).digest('hex')).toBe(sha);
  }
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  expect(compiler.get_git_commit()).toBe(pin.revision.slice(0,12));
});

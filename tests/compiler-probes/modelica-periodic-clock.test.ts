import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import init,* as pinned from '@cognipilot/rumoca';

it('continues periodic controller events beyond the initial simulation horizon',async()=>{
  const directory=process.env.RUMOCA_BRANCH_PKG;
  const compiler:typeof pinned=directory?await import(/* @vite-ignore */ pathToFileURL(resolve(directory,'rumoca_bind_wasm.js')).href):pinned;
  await (directory?compiler.default:init)({module_or_path:readFileSync(directory
    ?resolve(directory,'rumoca_bind_wasm_bg.wasm'):'public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const source=readFileSync('tests/compiler-probes/fixtures/PeriodicControllerClock.mo','utf8');
  const session=compiler.WasmSimulationSession.withInteractiveOptions(
    source,'PeriodicControllerClock',.005,'rk-like',1e-8,1e-6,'[]');
  try{
    expect(session.get('ticks')).toBe(1);
    for(const time of [.1,.5,1,1.1,2,3]){
      session.advance_to(time);
      expect(session.get('ticks'),`periodic events through ${time}s`).toBe(Math.round(time/.01)+1);
    }
    session.reset();session.advance_to(3);
    expect(session.get('ticks'),'reset and a single long advance').toBe(301);
  }finally{session.free();}
},20_000);

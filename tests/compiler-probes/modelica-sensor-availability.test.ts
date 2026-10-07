import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type * as Rumoca from '@cognipilot/rumoca';

const directory=process.env.RUMOCA_BRANCH_PKG;
it.skipIf(!directory)('actual Modelica standalone GPS gate preserves inclusive roof faces, edits and disabled-volume behavior before draws',async()=>{
  const compiler:typeof Rumoca=await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  await compiler.default({module_or_path:readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'))});
  const session=compiler.WasmSimulationSession.withInteractiveOptions(readFileSync('models/SensorAvailability.mo','utf8'),'SensorAvailability',1/90,'rk-like',1e-12,1e-12,'[]');
  let tick=0;
  const check=(position:number[],enabled:number,minimum=[35.8,-5.2,0],maximum=[48.2,5.2,3.8])=>{
    const inputs=[['roofEnabled',enabled],...position.map((v,i)=>[`positionTruth[${i+1}]`,v]),...minimum.map((v,i)=>[`roofMinimum[${i+1}]`,v]),...maximum.map((v,i)=>[`roofMaximum[${i+1}]`,v])];
    session.set_inputs(JSON.stringify(inputs));session.advance_to(++tick/90);
    const values=JSON.parse(session.state_json()).values as Record<string,number>;
    const inside=position.every((v,i)=>v>=minimum[i]&&v<=maximum[i]);
    expect(values.gpsAvailable,JSON.stringify({position,enabled,minimum,maximum})).toBe(enabled>.5&&inside?0:1);
  };
  try{
    for(const enabled of [0,1])for(let axis=0;axis<3;axis++)for(const side of [0,1])for(const delta of [-1e-8,0,1e-8]){
      const p=[42,0,1.5];p[axis]=(side?[48.2,5.2,3.8]:[35.8,-5.2,0])[axis]+delta;check(p,enabled);
    }
    check([42,0,1.5],1,[40,-1,1],[41,1,2]);
    check([42,0,1.5],1); // recovery after changed geometry
    check([35.8,-5.2,0],1);check([48.2,5.2,3.8],1);
  }finally{session.free();}
},30_000);

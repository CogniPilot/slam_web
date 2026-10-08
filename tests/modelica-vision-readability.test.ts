import {modelicaSourcePath} from '../src/modelica-source-locations.mjs';
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import init,* as rumoca from '@cognipilot/rumoca';

const preimages={
  native:{path:'tests/fixtures/modelica-harris-before-refactor.mo',sha:'18e456247e415add38f7ffdb509d5bf22e0b818ee27bacc24372244867dcf46a'},
};
function original(key:keyof typeof preimages){
  const entry=preimages[key],bytes=readFileSync(entry.path);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha);
  return bytes.toString();
}
function open(source:string,model:string,modifications:string){
  const text=`${source}\nmodel ReadabilityFixture extends ${model}(${modifications}); end ReadabilityFixture;`;
  return rumoca.WasmSimulationSession.withInteractiveOptions(text,'ReadabilityFixture',.1,'rk-like',1e-10,1e-10,'[]');
}
function compare(before:string,after:string,model:string,modifications:string,height:number,width:number,mask=false){
  const reference=open(before,model,modifications),current=open(after,model,modifications);
  try{
    const names=JSON.parse(current.input_names()) as string[];
    expect(names).toHaveLength(height*width*3);
    expect(JSON.parse(reference.input_names()).slice().sort()).toEqual(names.slice().sort());
    for(let frame=0;frame<3;frame++){
      const inputs=JSON.stringify(names.map(name=>{
        const coordinates=name.match(/rgb\[(\d+),(\d+),(\d+)\]/);if(!coordinates)throw Error('Unexpected image input: '+name);
        const [,y,x,c]=coordinates.map(Number);
        return [name,frame===0?0:frame===1?(x*73+y*19+c*31)%256:255*((Math.floor(x/4)+Math.floor(y/3)+c)%2)];
      }));
      reference.set_inputs(inputs);current.set_inputs(inputs);
      reference.advance_to((frame+1)/10);current.advance_to((frame+1)/10);
      const expected=JSON.parse(reference.state_json()).values,actual=JSON.parse(current.state_json()).values;
      const keys=Object.keys(expected).filter(name=>/^score\[/.test(name)||mask&&/^selected\[/.test(name)).sort();
      expect(keys.length).toBeGreaterThan(0);
      expect(Object.keys(actual).filter(name=>/^score\[/.test(name)||mask&&/^selected\[/.test(name)).sort()).toEqual(keys);
      const oldValues=Float64Array.from(keys,name=>expected[name]),newValues=Float64Array.from(keys,name=>actual[name]);
      expect(Buffer.from(newValues.buffer).equals(Buffer.from(oldValues.buffer)),`${model} ${height}×${width} frame${frame}`).toBe(true);
    }
  }finally{reference.free();current.free();}
}

it('compact full-frame tensor kernels preserve all original output bits at different rectangular sizes',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  for(const [key,model] of [['native','HarrisNativeFrame']] as const){
    const before=original(key),after=readFileSync(modelicaSourcePath(model),'utf8');
    for(const [height,width] of [[13,17],[17,23]])
      compare(before,after,model,`height=${height},width=${width},harris_k=0.07`,height,width);
  }
},60_000);


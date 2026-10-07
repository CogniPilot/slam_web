import {beforeAll,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as installed from '@cognipilot/rumoca';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';

const original=readFileSync('tests/compiler-probes/fixtures/RGBDFeatureMatchingDenseReference.mo','utf8');
const current=readFileSync('models/Vision/Matching/RGBDFeatureMatching.mo','utf8');
const capacity=5;
let compiler:typeof installed & {prepare_native_program?:(source:string,model:string)=>string}=installed;
beforeAll(async()=>{
  expect(createHash('sha256').update(original).digest('hex')).toBe('c2007359260543f725df3d297c920b1cdfd89ef36a48b11decc9c15ca0371446');
  const directory=process.env.RUMOCA_BRANCH_PKG;
  if(directory)compiler=await import(/* @vite-ignore */pathToFileURL(resolve(directory,'rumoca_bind_wasm.js')).href);
  await compiler.default({module_or_path:readFileSync(directory
    ?resolve(directory,'rumoca_bind_wasm_bg.wasm'):'public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
});

function model(height:number,width:number,channels:number){
  return `\nmodel DescriptorGatherControl
    input Real rgb[${height},${width},${channels}] = fill(0.0,${height},${width},${channels});
    input Real depth[${height},${width}] = fill(2.0,${height},${width});
    input Real pixels[${capacity},2] = zeros(${capacity},2);
    input Real activeCount = ${capacity}; input Real depthUnits = 1.0;
    input Boolean imageEnabled = true;
    output Real descriptor[${capacity},49]; output Real point[${capacity},3];
    output Real enabled[${capacity}]; output Real invalidCount;
  equation
    (descriptor,point,enabled,invalidCount) = DescribeRGBDFrame(rgb,depth,pixels,activeCount,
      {100.0,110.0,${(width-1)/2},${(height-1)/2}},
      {100.0,110.0,${(width-1)/2},${(height-1)/2}},0.08,84.3,0.05,0.28,10.0,1e-6,
      imageEnabled,depthUnits=depthUnits);
  end DescriptorGatherControl;`;
}

it.each([[13,17,3],[9,11,4]])('actual Modelica WASM sparse RGB patches preserve every public bit at %ix%ix%i',
async(height,width,channels)=>{
  const open=async(source:string)=>{
    try{
      if(!compiler.prepare_native_program)throw Error('Compiler lacks prepare_native_program');
      const completeSource=source+model(height,width,channels);
      const artifact:NativeProgramArtifact=JSON.parse(compiler.prepare_native_program(completeSource,'DescriptorGatherControl'));
      return await NativeProgram.instantiate(artifact,completeSource);
    }
    catch(error){throw Error(`${source===original?'Frozen dense reference':'Sparse patch source'}: ${String(error)}`);}
  };
  const reference=await open(original);
  const optimized=await open(current);
  const cx=Math.floor(width/2),cy=Math.floor(height/2);
  const pixels=[[cx,cy],[cx+1,cy],[3.5,3],[2,2],[width-4,height-4]];
  const names=['invalidCount',...Array.from({length:capacity},(_,i)=>[
    `enabled[${i+1}]`,...Array.from({length:3},(_,j)=>`point[${i+1},${j+1}]`),
    ...Array.from({length:49},(_,j)=>`descriptor[${i+1},${j+1}]`)]).flat()];
  let tick=0;
  const run=(label:string,changes:Record<string,number>={})=>{
    for(const [name,value] of Object.entries(changes)){
      // These are scalar views into the actual compiler-issued raw inputs.
      if(name==='imageEnabled'){
        reference.booleanInput(name)[0]=value;optimized.booleanInput(name)[0]=value;
      }else{
        reference.input(name)[0]=value;optimized.input(name)[0]=value;
      }
    }
    reference.evaluate(++tick/10);optimized.evaluate(tick/10);
    const read=(program:NativeProgram,name:string)=>{
      const value=program.output(name)[0];if(value===undefined)throw Error('Missing public output: '+name);return value;
    };
    const expected=Float64Array.from(names,name=>read(reference,name));
    const actual=Float64Array.from(names,name=>read(optimized,name));
    expect([...actual].every(Number.isFinite),label).toBe(true);
    expect(Buffer.from(actual.buffer).equals(Buffer.from(expected.buffer)),label).toBe(true);
    return actual;
  };
  {
    const inputs:Record<string,number>={};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      inputs[`depth[${y+1},${x+1}]`]=2;
      for(let c=0;c<channels;c++)inputs[`rgb[${y+1},${x+1},${c+1}]`]=(x*31+y*17+c*11)%255+.125;
    }
    pixels.forEach((p,i)=>p.forEach((v,j)=>inputs[`pixels[${i+1},${j+1}]`]=v));
    const baseline=run('fractional RGB, sparse invalid slots and final active feature',inputs);
    expect(baseline[0]).toBe(2);expect(optimized.output('enabled[5]')[0]).toBe(1);
    run('opaque RGB outside every active patch',{'rgb[1,1,1]':NaN});
    if(channels===4)run('alpha never contributes',{'rgb[5,5,4]':Infinity});
    run('nonfinite active patch rejects its descriptor',{[`rgb[${cy+1},${cx+1},2]`]:NaN});
    run('exact recovery',inputs);
    for(const count of [0,.5,1.5,-1,capacity+1,NaN,Infinity])run(`count ${count}`,{activeCount:count});
    run('disabled image ignores poisoned inputs',{activeCount:Infinity,imageEnabled:0,'pixels[1,1]':NaN});
    run('restore camera image',{...inputs,activeCount:capacity,imageEnabled:1});
    const raw:Record<string,number>={depthUnits:.001};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)raw[`depth[${y+1},${x+1}]`]=2000;
    run('raw Z16 codes preserve calibrated points',raw);
    run('positive-weight invalid depth rejects the feature',{[`depth[${cy+1},${cx+1}]`]:NaN});
  }
},60_000);

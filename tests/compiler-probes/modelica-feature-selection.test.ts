import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type * as Rumoca from '@cognipilot/rumoca';

type Settings=[number,number,number,number,number,number,number,number];
type Feature=[number,number,number];
type Input=[string,number];
const directory=process.env.RUMOCA_BRANCH_PKG;
// JSON.stringify alone loses signed zero before the compiler receives it.
const encode=(inputs:Input[])=>'['+inputs.map(([name,value])=>`[${JSON.stringify(name)},${Object.is(value,-0)?'-0':JSON.stringify(value)}]`).join(',')+']';
// Test-only independent direct sort/set implementation. Production executes
// the editable Modelica heap/occupancy algorithm or reports unsupported.
function reference(scores:number[],width:number,height:number,p:Settings,grid=false):Feature[]{
  const [absolute,relative,scale,radius,cap,spacing,border,start]=p;
  const candidates:{x:number;y:number;index:number;rank:number}[]=[];
  const finite=(x:number)=>{if(!Number.isFinite(x))throw new Error('nonfinite score');};
  let maximum=0;
  if(!grid)for(const score of scores){finite(score);if(Math.abs(score*scale)>Number.MAX_SAFE_INTEGER)throw new Error('unsafe rank');maximum=Math.max(maximum,score);}
  const threshold=Math.max(absolute,maximum*relative),guard=Math.floor(threshold*scale)-1;
  const output:Feature[]=[];
  for(let y=start;y<height-border;y+=spacing)for(let x=start;x<width-border;x+=spacing){
    const index=y*width+x;
    if(grid){finite(scores[index]);output.push([x,y,scores[index]]);if(output.length===cap)return output;continue;}
    const value=scores[index]*scale,floor=Math.floor(value),fraction=value-floor;
    const rank=fraction<.5?floor:fraction>.5?floor+1:floor%2===0?floor:floor+1;
    if(rank>=guard)candidates.push({x,y,index,rank});
  }
  if(grid)return output;
  candidates.sort((a,b)=>b.rank-a.rank||a.index-b.index);
  for(const c of candidates){
    if(scores[c.index]<threshold)break;
    // Independent geometric neighborhood test instead of occupancy writes.
    if(output.some(p=>Math.abs(p[0]-c.x)<=radius&&Math.abs(p[1]-c.y)<=radius))continue;
    output.push([c.x,c.y,scores[c.index]]);if(output.length===cap)break;
  }
  return output;
}

const fixtures=()=>{
  const width=6,height=4,n=width*height;
  const allEqual=Array(n).fill(2),mixed=Array.from({length:n},(_,i)=>(i*17%23)/10);
  const rounding=Array(n).fill(0);rounding[0]=2.5;rounding[1]=3.5;rounding[2]=2.49;rounding[3]=2.51;rounding[4]=3.49;
  const earlyStop=Array(n).fill(0);earlyStop[0]=2.99;earlyStop[1]=3.01;
  const outsideMaximum=Array(n).fill(2);outsideMaximum[0]=100;
  return [
    {name:'stable ties and cap',scores:allEqual,p:[0,0,1,0,4,1,0,0] as Settings},
    {name:'square suppression clipped at image edges',scores:mixed,p:[0,0,10,1,24,1,0,0] as Settings},
    {name:'ties to even ranks and deterministic raster ties',scores:rounding,p:[0,0,1,0,24,1,0,0] as Settings},
    {name:'raw threshold early stop within quantized rank tie',scores:earlyStop,p:[3,0,1,0,24,1,0,0] as Settings},
    {name:'whole-frame maximum outside candidate border',scores:outsideMaximum,p:[0,.1,1,0,24,1,1,1] as Settings},
    {name:'negative scores and signed zero',scores:Array.from({length:n},(_,i)=>i===0?-0:-i*.5),p:[0,0,1,0,24,1,0,0] as Settings},
    {name:'spacing start border and cap',scores:mixed,p:[0,0,10,0,3,2,1,1] as Settings},
    {name:'empty threshold recovery',scores:Array(n).fill(0),p:[1e-9,.01,1e12,3,24,1,0,0] as Settings},
  ];
};

it('independent selection fixtures expose exact rank, early-stop, suppression and grid contracts',()=>{
  const cases=fixtures();
  expect(reference(cases[0].scores,6,4,cases[0].p)).toEqual([[0,0,2],[1,0,2],[2,0,2],[3,0,2]]);
  expect(reference(cases[2].scores,6,4,cases[2].p).slice(0,5).map(p=>p[0])).toEqual([1,3,4,0,2]);
  expect(reference(cases[3].scores,6,4,cases[3].p)).toEqual([]);
  expect(reference(cases[4].scores,6,4,cases[4].p)).toEqual([]);
  expect(reference(cases[7].scores,6,4,cases[7].p)).toEqual([]);
  expect(reference(Array(24).fill(1),6,4,[0,0,1,0,3,2,1,1],true)).toEqual([[1,1,1],[3,1,1]]);
  const hidden=Array(24).fill(1);hidden[0]=NaN;
  expect(reference(hidden,6,4,[0,0,1,0,3,2,1,1],true)).toHaveLength(2);
  expect(()=>reference(hidden,6,4,[0,0,1,0,3,2,1,1])).toThrow('nonfinite');
  expect(()=>reference(Array(24).fill(9007199254740992),6,4,[0,0,1,0,3,1,0,0])).toThrow('unsafe');
  const fullGrid=reference(Array(14400).fill(1),160,90,[0,0,1,0,14400,6,5,5],true);
  expect(fullGrid).toHaveLength(350);expect(fullGrid[0]).toEqual([5,5,1]);expect(fullGrid.at(-1)).toEqual([149,83,1]);
});

it.skipIf(!directory)('actual Modelica selection matches bounded independent fixtures without claiming full-frame admission',async()=>{
  const compiler:typeof Rumoca=await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  await compiler.default({module_or_path:readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'))});
  const source=readFileSync('models/Vision/Features/FeatureSelection.mo','utf8')+`\nmodel SelectionControl
    extends FeatureSelection(width=6,height=4,capacity=24,settings={0,0,1,0,24,1,0,0});
    end SelectionControl;
    model GridSelectionControl
    extends FeatureSelection(width=6,height=4,capacity=24,grid=true,settings={0,0,1,0,24,1,0,0});
    end GridSelectionControl;`;
  const make=(model:string)=>compiler.WasmSimulationSession.withInteractiveOptions(source,model,1/90,'rk-like',1e-12,1e-12,'[]');
  const selection=make('SelectionControl'),grid=make('GridSelectionControl');let tick=0;
  const check=(session:typeof selection,scores:number[],p:Settings,isGrid=false)=>{
    const input:Input[]=[...scores.map((v,i):Input=>[`scores[${i+1}]`,v]),...p.map((v,i):Input=>[`settings[${i+1}]`,v])];
    session.set_inputs(encode(input));session.advance_to(++tick/90);
    const values=JSON.parse(session.state_json()).values as Record<string,number>,expected=reference(scores,6,4,p,isGrid);
    expect(values.valid).toBe(1);expect(values.count).toBe(expected.length);
    for(let i=0;i<24;i++)for(let j=0;j<3;j++)expect(values[`features[${i+1},${j+1}]`]).toBe(expected[i]?.[j]??0);
  };
  try{
    for(const c of fixtures())check(selection,c.scores,c.p);
    check(selection,fixtures()[0].scores,fixtures()[0].p); // recovery after empty
    check(grid,Array(24).fill(1),[0,0,1,0,3,2,1,1],true);
  }finally{selection.free();grid.free();}
},45_000);

it.skipIf(!directory)('complete14400 Modelica grid selection retains uncapped350-point raster traversal',async()=>{
  const compiler:typeof Rumoca=await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  await compiler.default({module_or_path:readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'))});
  const session=compiler.WasmSimulationSession.withInteractiveOptions(readFileSync('models/Vision/Features/FeatureSelection.mo','utf8'),'GridFeatureSelection',1/90,'rk-like',1e-12,1e-12,'[]');
  const scores=Array.from({length:14400},(_,i)=>i/14400),p:Settings=[0,0,1,0,14400,6,5,5];
  try{
    session.set_inputs(JSON.stringify(scores.map((v,i)=>[`scores[${i+1}]`,v])));session.advance_to(1/90);
    const values=JSON.parse(session.state_json()).values as Record<string,number>,expected=reference(scores,160,90,p,true);
    expect(values.valid).toBe(1);expect(values.count).toBe(350);
    for(let i=0;i<14400;i++)for(let j=0;j<3;j++)expect(values[`features[${i+1},${j+1}]`]).toBe(expected[i]?.[j]??0);
  }finally{session.free();}
},45_000);

it.skipIf(!directory)('complete14400 Modelica raster selection preserves full input geometry and240-feature cap',async()=>{
  const compiler:typeof Rumoca=await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  await compiler.default({module_or_path:readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'))});
  const source=readFileSync('models/Vision/Features/FeatureSelection.mo','utf8');
  const session=compiler.WasmSimulationSession.withInteractiveOptions(source,'FeatureSelection',1/90,'rk-like',1e-12,1e-12,'[]');
  const scores=Array.from({length:14400},(_,i)=>((i*8191)%32749)/1000),p:Settings=[1e-9,.01,1e12,3,240,1,0,0];
  try{
    session.set_inputs(JSON.stringify(scores.map((v,i)=>[`scores[${i+1}]`,v])));session.advance_to(1/90);
    const values=JSON.parse(session.state_json()).values as Record<string,number>,expected=reference(scores,160,90,p);
    expect(values.valid).toBe(1);expect(values.count).toBe(expected.length);
    for(let i=0;i<14400;i++)for(let j=0;j<3;j++)expect(values[`features[${i+1},${j+1}]`]).toBe(expected[i]?.[j]??0);
  }finally{session.free();}
},45_000);

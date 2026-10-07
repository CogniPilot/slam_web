import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Opt-in compiler-branch gate. The default application remains pinned until
// browser evidence and its existing integration tests pass on a new package.
const packageDirectory=process.env.RUMOCA_BRANCH_PKG;
for(const pixels of [16,160*90])test(`branch compiler executes source-owned portable assignments for ${pixels} pixels`,async({page})=>{
  test.skip(!packageDirectory,'Set RUMOCA_BRANCH_PKG to the full-web wasm-pack output');
  test.setTimeout(180_000);
  await page.route('**/__rumoca-branch/*',async route=>{
    const file=new URL(route.request().url()).pathname.split('/').at(-1)!;
    if(!['rumoca_bind_wasm.js','rumoca_bind_wasm_bg.wasm'].includes(file))return route.abort();
    await route.fulfill({body:await readFile(resolve(packageDirectory!,file)),
      contentType:file.endsWith('.wasm')?'application/wasm':'text/javascript'});
  });
  await page.route('**/__rumoca-native-check',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Rumoca compiler numerical gate</title>'}));
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/__rumoca-native-check');
  const report=await page.evaluate(async(pixels)=>{
    const compilerUrl='/__rumoca-branch/rumoca_bind_wasm.js';
    const compiler:any=await import(/* @vite-ignore */ compilerUrl);
    await compiler.default({module_or_path:'/__rumoca-branch/rumoca_bind_wasm_bg.wasm'});
    const source=`model NativeImage
      input Real rgb[${pixels*3}]=fill(0.0,${pixels*3}); Real gray[${pixels}]; output Real score[${pixels}];
      equation
      for i in 1:${pixels} loop gray[i]=(rgb[3*i-2]+rgb[3*i-1]+rgb[3*i])/3; end for;
      for i in 1:${pixels} loop score[i]=gray[i]*gray[i]+2; end for;
      end NativeImage;`;
    const prepare=(text:string)=>JSON.parse(compiler.prepare_native_assignments(text,'NativeImage'));
    const started=performance.now(),artifact=prepare(source),coldMs=performance.now()-started;
    const editedSource=source.replace('+2;','+3;'),edited=prepare(editedSource);
    const sha=async(bytes:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const execute=async(a:any,constant:number)=>{
      const abi=a.abi,memory=new WebAssembly.Memory({initial:abi.memory_pages,maximum:abi.memory_pages});
      const view=new Float64Array(memory.buffer),stages=[];
      view.set(a.parameters,abi.p_offset/8);
      for(const stage of a.stages){
        const bytes=new Uint8Array(stage.module_bytes);
        if(await sha(bytes)!==stage.module_sha256)throw new Error('Module digest mismatch');
        const module=await WebAssembly.compile(bytes),env:Record<string,any>={memory};
        for(const input of WebAssembly.Module.imports(module)){
          if(input.module!=='env')throw new Error('Unexpected import namespace');
          if(input.kind==='memory'){if(input.name!=='memory')throw new Error('Unexpected memory import');}
          else if(input.kind==='function'&&typeof (Math as any)[input.name]==='function')env[input.name]=(Math as any)[input.name];
          else throw new Error('Unexpected portable module import');
        }
        stages.push({stage,instance:await WebAssembly.instantiate(module,{env})});
      }
      let exact=true;
      for(let frame=0;frame<8;frame++){
        const rgb=Array.from({length:pixels*3},(_,i)=>((i*7+frame*13)%255)/255);
        view.fill(NaN,abi.y_offset/8,abi.y_offset/8+abi.y_count);
        for(let i=0;i<rgb.length;i++)view[abi.p_offset/8+a.var_layout.bindings[`rgb[${i+1}]`].P.index]=rgb[i];
        for(const {stage,instance} of stages){
          (instance.exports.eval_residual as Function)(abi.y_offset,abi.p_offset,frame/90,abi.seed_offset,abi.output_offset);
          view.copyWithin(abi.y_offset/8+stage.target_start,abi.output_offset/8,abi.output_offset/8+stage.target_count);
        }
        for(let i=0;i<pixels;i++){
          const gray=(rgb[3*i]+rgb[3*i+1]+rgb[3*i+2])/3;
          exact&&=Object.is(view[abi.y_offset/8+a.var_layout.bindings.gray.Y.index+i],gray);
          exact&&=Object.is(view[abi.y_offset/8+a.var_layout.bindings.score.Y.index+i],gray*gray+constant);
        }
      }
      return {exact,moduleBytes:a.stages.reduce((sum:number,stage:any)=>sum+stage.module_bytes.length,0),memoryBytes:memory.buffer.byteLength};
    };
    let refusedState=false,refusedScalar=false;
    for(const [name,text] of [['State','model State Real x(start=0); equation der(x)=1; end State;'],
      ['Scalar','model Scalar output Real y; equation y=2; end Scalar;']]){
      try{compiler.prepare_native_assignments(text,name);}catch{if(name==='State')refusedState=true;else refusedScalar=true;}
    }
    return {profile:artifact.profile,compiler:artifact.compiler,coldMs,stages:artifact.stages.length,
      sourceDigestValid:artifact.source_sha256===await sha(new TextEncoder().encode(source)),
      sourceChanged:artifact.source_sha256!==edited.source_sha256,moduleChanged:artifact.stages[1].module_sha256!==edited.stages[1].module_sha256,
      initial:await execute(artifact,2),edited:await execute(edited,3),refusedState,refusedScalar};
  },pixels);
  console.log('RUMOCA NATIVE BROWSER',report);
  expect(report.profile).toBe('native-direct-assignments-f64-v1');expect(report.stages).toBe(2);
  expect(report.sourceDigestValid).toBe(true);expect(report.sourceChanged).toBe(true);expect(report.moduleChanged).toBe(true);
  expect(report.initial.exact).toBe(true);expect(report.edited.exact).toBe(true);
  expect(report.refusedState).toBe(true);expect(report.refusedScalar).toBe(true);expect(errors).toEqual([]);
});

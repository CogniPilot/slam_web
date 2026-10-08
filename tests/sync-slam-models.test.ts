import {it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const script=path.resolve('scripts/sync-slam-models.mjs');
const hash=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
  const root=path.join(process.env.HOME!,'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
  const directory=fs.mkdtempSync(path.join(root,'source-sync-test-'));
  const upstream=path.join(directory,'upstream'),consumer=path.join(directory,'consumer'),snapshot=path.join(directory,'snapshot');
  const write=(file:string,text:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
  fs.mkdirSync(upstream);fs.mkdirSync(consumer);
  execFileSync('git',['init','-b','main',upstream],{stdio:'ignore'});
  const classes=[{source:'models/Example.mo',destination:'SLAM/Example.mo',qualified_name:'SLAM.Example'}];
  write(path.join(upstream,'tools/slam/source-manifest.json'),JSON.stringify({classes}));
  execFileSync('git',['-C',upstream,'add','.']);
  execFileSync('git',['-C',upstream,'-c','commit.gpgsign=false','commit','-s','-m','Add source manifest'],{stdio:'ignore',env:{...process.env,GIT_AUTHOR_NAME:'James Goppert',GIT_AUTHOR_EMAIL:'james.goppert@gmail.com',GIT_COMMITTER_NAME:'James Goppert',GIT_COMMITTER_EMAIL:'james.goppert@gmail.com'}});
  const revision=execFileSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const source=`// Generated from CogniPilot/modelica_models ${revision}\nmodel Example end Example;\n`;
  const receipt={repository:'https://github.com/CogniPilot/modelica_models',revision,generated:true,license:'Apache-2.0',sources:{'models/Example.mo':hash(source)},canonical_classes:classes};
  write(path.join(snapshot,'models/Example.mo'),source);write(path.join(snapshot,'slam-provenance.json'),JSON.stringify(receipt));
  write(path.join(consumer,'models/Example.mo'),'previous source');
  write(path.join(consumer,'models/slam-provenance.json'),JSON.stringify({sources:{'models/Example.mo':hash('previous source')}}));
  const sync=()=>execFileSync(process.execPath,[script,upstream,revision,snapshot],{cwd:consumer,stdio:'pipe'});
  return {directory,consumer,snapshot,source,receipt,sync,write};
}

it('consumes a verified upstream export without a Python or compiler dependency',()=>{
  const f=fixture();try{
    f.sync();expect(fs.readFileSync(path.join(f.consumer,'models/Example.mo'),'utf8')).toBe(f.source);
    expect(JSON.parse(fs.readFileSync(path.join(f.consumer,'models/slam-provenance.json'),'utf8'))).toEqual(f.receipt);
  }finally{fs.rmSync(f.directory,{recursive:true,force:true});}
});

it('refuses mismatched exports and local source edits before replacing any consumer file',()=>{
  const f=fixture();try{
    const target=path.join(f.consumer,'models/Example.mo');
    f.write(path.join(f.snapshot,'models/Example.mo'),'tampered export');
    expect(f.sync).toThrow();expect(fs.readFileSync(target,'utf8')).toBe('previous source');
    f.write(path.join(f.snapshot,'models/Example.mo'),f.source);
    f.write(path.join(f.snapshot,'slam-provenance.json'),JSON.stringify({...f.receipt,revision:'0'.repeat(40)}));
    expect(f.sync).toThrow();expect(fs.readFileSync(target,'utf8')).toBe('previous source');
    f.write(path.join(f.snapshot,'slam-provenance.json'),JSON.stringify(f.receipt));f.write(target,'student edit');
    expect(f.sync).toThrow();expect(fs.readFileSync(target,'utf8')).toBe('student edit');
  }finally{fs.rmSync(f.directory,{recursive:true,force:true});}
});

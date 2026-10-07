// Test-only analytic ray/plane comparison of the actual World depth pipeline.
// Oracle math is evidence only. No estimator, replacement sensor or physics.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const self=fileURLToPath(import.meta.url),repo=path.resolve(path.dirname(self),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const walk=root=>fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(root,e.name)):[path.join(root,e.name)]).sort();
if(process.argv.length===2){
  const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
  const run=fs.realpathSync(fs.mkdtempSync(path.join(scratch,'grazing-depth-')));
  fs.cpSync(path.join(repo,'src'),path.join(run,'src'),{recursive:true});
  fs.symlinkSync(path.join(repo,'node_modules'),path.join(run,'node_modules'),'dir');
  const sources=[self,...walk(path.join(repo,'src'))].map(file=>({path:path.relative(repo,file),sha256:sha(fs.readFileSync(file))}));
  json(path.join(run,'plan.json'),{sources,repo,hardwareRequested:process.env.SLAM_BROWSER_GPU==='1'});
  const result=spawnSync(process.execPath,[path.join(repo,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384','--log',path.join(run,'probe.log'),'--','env','OMP_NUM_THREADS=1',`TMPDIR=${run}`,'nice','-n','15','taskset','-c','6,7',process.execPath,self,'--execute',run],{encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(run,'resources.json'),result.stdout??'');
  fs.writeFileSync(path.join(run,'guardian-stderr.log'),result.stderr??'');
  const durable=path.join(repo,'dev/artifacts/grazing-depth-plane',path.basename(run));fs.mkdirSync(durable,{recursive:true});
  for(const name of fs.readdirSync(run))if(fs.statSync(path.join(run,name)).isFile())fs.copyFileSync(path.join(run,name),path.join(durable,name));
  fs.mkdirSync(path.join(durable,'sources/dev'),{recursive:true});fs.copyFileSync(self,path.join(durable,'sources/dev',path.basename(self)));
  fs.cpSync(path.join(run,'src'),path.join(durable,'sources/src'),{recursive:true});
  const bookendsEqual=sources.every(entry=>sha(fs.readFileSync(path.join(repo,entry.path)))===entry.sha256);
  json(path.join(durable,'terminal.json'),{processStatus:result.status,signal:result.signal,bookendsEqual,scope:'Analytic GPU capture comparison only, no SLAM or hardware throughput claim'});
  console.log(JSON.stringify({directory:path.relative(repo,durable),processStatus:result.status,bookendsEqual}));
  process.exitCode=result.status===0&&bookendsEqual?0:1;
}else if(process.argv.length===4&&process.argv[2]==='--execute'){
  const run=path.resolve(process.argv[3]),plan=JSON.parse(fs.readFileSync(path.join(run,'plan.json')));
  for(const entry of plan.sources)if(entry.path.startsWith('src/')&&sha(fs.readFileSync(path.join(run,entry.path)))!==entry.sha256)throw Error('Frozen source mismatch');
  const entry="import * as THREE from 'three';import {World,D435} from './src/world';globalThis.depthPlaneFixture={THREE,World,D435};";
  fs.writeFileSync(path.join(run,'entry.js'),entry);
  const bundle=await build({absWorkingDir:run,stdin:{contents:entry,resolveDir:run},bundle:true,write:false,format:'iife',metafile:true,define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
  const bundleBytes=bundle.outputFiles[0].contents;fs.writeFileSync(path.join(run,'bundle.js'),bundleBytes);
  const modules=Object.keys(bundle.metafile.inputs).map(name=>({path:name,sha256:sha(name==='<stdin>'?Buffer.from(entry):fs.readFileSync(path.resolve(run,name)))}));
  const served=[];
  const server=http.createServer((request,response)=>{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if(pathname==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Grazing depth plane</title>');return;}
    if(pathname==='/bundle.js'){response.setHeader('Content-Type','text/javascript');response.end(bundleBytes);return;}
    const root=path.join(plan.repo,'public'),file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.statusCode=404;response.end();return;}
    const bytes=fs.readFileSync(file);served.push({path:path.relative(plan.repo,file),sha256:sha(bytes)});
    response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'application/octet-stream');response.end(bytes);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    const launchArgs=['--no-sandbox',...(plan.hardwareRequested?['--enable-gpu','--use-gl=angle','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader'])];
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:launchArgs});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.addScriptTag({url:'/bundle.js'});
    const report=await page.evaluate(async()=>{
      const {THREE,World,D435:c}=globalThis.depthPlaneFixture;
      const world=new World({canvas:new OffscreenCanvas(640,400),width:640,height:400,pixelRatio:1,base:location.origin+'/'});
      await world.ready;world.configureActors(false,false);world.actors.group.visible=false;world.navigation.group.visible=false;
      world.sensorGeometryBatches.clear();world.environment.clear();world.scene.fog=null;world.renderer.shadowMap.enabled=false;
      const road=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0x808080}));
      world.environment.add(road);
      const geometries=[['box120',new THREE.BoxGeometry(1,1,1),[0,.006,0],[120,.012,11.4],0],
        ['box20',new THREE.BoxGeometry(1,1,1),[8,.006,0],[20,.012,11.4],0],
        ['plane120',new THREE.PlaneGeometry(120,11.4),[0,.012,0],[1,1,1],-Math.PI/2],
        ['plane120Subdivided',new THREE.PlaneGeometry(120,11.4,120,12),[0,.012,0],[1,1,1],-Math.PI/2]];
      const material=world.depthMaterial,reciprocal=material.clone();
      if(!material.fragmentShader.includes('void main(){uint bits='))throw Error('Unexpected depth shader preimage');
      reciprocal.fragmentShader=material.fragmentShader.replace('void main(){uint bits=','void main(){float z=1.0/gl_FragCoord.w;uint bits=');
      const poses=[{time:0,x:0,y:0,z:1.5,quaternion:[1,0,0,0]},
        {time:1/30,x:1.7657960575e-7,y:0,z:1.4963891250693067,quaternion:[.9999999702429412,0,.00024395505878260852,0]}];
      const captures=[];
      for(const [geometryName,geometry,position,scale,rotationX] of geometries){
      road.geometry=geometry;road.position.fromArray(position);road.scale.fromArray(scale);road.rotation.set(rotationX,0,0);
      for(let poseIndex=0;poseIndex<poses.length;poseIndex++)for(const [name,shader] of [['varying',material],['reciprocal',reciprocal]]){
        world.depthMaterial=shader;world.update(poses[poseIndex]);const frame=await world.captureAsync('sync');
        const camera=world.sensor,rotation=new THREE.Matrix4().extractRotation(camera.matrixWorld),origin=new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
        const points=[];
        for(const [column,row] of [[65,60],[100,60],[60,75],[100,75],[50,83],[110,83]]){
          const optical=new THREE.Vector3((column-c.cx)/c.fx,-(row-c.cy)/c.fy,-1).applyMatrix4(rotation);
          const expected=(.012-origin.y)/optical.y,actual=frame.depth[row*c.width+column];
          points.push({column,row,expected,actual,error:actual-expected,reconstructedHeight:origin.y+actual*optical.y});
        }
        captures.push({geometry:geometryName,poseIndex,shader:name,points,cameraWorld:camera.matrixWorld.toArray(),cameraInverse:camera.matrixWorldInverse.toArray(),projection:camera.projectionMatrix.toArray(),roadWorld:road.matrixWorld.toArray(),glError:world.renderer.getContext().getError()});
      }
      }
      world.depthMaterial=material;reciprocal.dispose();
      const gl=world.renderer.getContext(),programs=world.renderer.info.programs.map(p=>({vertex:gl.getShaderSource(p.vertexShader),fragment:gl.getShaderSource(p.fragmentShader)}));
      const result={scope:'Standalone actual World pipeline; two diagnostic poses and two shader variants; no estimator',calibration:c,graphics:world.graphics,subpixelBits:gl.getParameter(gl.SUBPIXEL_BITS),captures,programs};
      for(const item of geometries)item[1].dispose();road.material.dispose();world.renderer.dispose();return result;
    });
    if(errors.length)throw Error(errors.join('\n'));
    const bookendsEqual=plan.sources.every(e=>sha(fs.readFileSync(path.join(plan.repo,e.path)))===e.sha256)&&served.every(e=>sha(fs.readFileSync(path.join(plan.repo,e.path)))===e.sha256);
    if(!bookendsEqual||report.captures.some(c=>c.glError!==0))throw Error('Source/assets changed or GPU error');
    if(plan.hardwareRequested&&report.graphics.acceleration!=='hardware-reported')throw Error('Requested hardware was not reported: '+JSON.stringify(report.graphics));
    json(path.join(run,'report.json'),{status:'PLANE_COMPARISON_EXECUTED',...report,hardwareRequested:plan.hardwareRequested,launchArgs,bookendsEqual,modules,served,errors,browserVersion:browser.version()});
    console.log(JSON.stringify({status:'PLANE_COMPARISON_EXECUTED',graphics:report.graphics,subpixelBits:report.subpixelBits,captures:report.captures.map(c=>({geometry:c.geometry,pose:c.poseIndex,shader:c.shader,points:c.points}))}));
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}else throw Error('Usage: node dev/probe-grazing-depth-plane.mjs');

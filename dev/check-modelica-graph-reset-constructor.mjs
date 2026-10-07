import {modelicaSourcePath} from '../src/modelica-source-locations.mjs';
// Bounded reference probe of the actual fresh-state constructor assertion.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scenarios=['ValidSeed','InvalidCovariance','InvalidRotation'];
const sha=value=>createHash('sha256').update(value).digest('hex');
if(process.argv[2]==='--worker'){
  const output=process.argv[3];
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'source-manifest.json'),'utf8'));
  for(const scenario of scenarios){
    const work=path.join(output,scenario); fs.mkdirSync(work,{recursive:true});
    const script=path.join(work,'probe.mos');
    fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
      +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
      +manifest.sources.filter(item=>item.path.endsWith('.mo')).map(item=>`loadFile(${JSON.stringify(path.join(output,'sources',item.path))});`).join('\n')
      +'\ngetErrorString();\n'
      +`simulate(RGBDGraphResetConstructorProbe.${scenario},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="marker");\ngetErrorString();\n`);
    const result=spawnSync(process.env.OMC_BIN??'omc',['--numProcs=2','--vectorizationLimit=1',script],
      {cwd:work,encoding:'utf8',env:{...process.env,TMPDIR:work},maxBuffer:8*1024*1024});
    fs.writeFileSync(path.join(work,'omc.log'),(result.stdout??'')+(result.stderr??''));
    fs.writeFileSync(path.join(work,'process.json'),JSON.stringify({status:result.status,signal:result.signal,error:result.error?.message},null,2)+'\n');
    console.log(JSON.stringify({scenario,processStatus:result.status}));
  }
}else{
  if(process.argv.length!==2)throw Error('Usage: check-modelica-graph-reset-constructor.mjs');
  const names=[
    'RGBDRegistrationUncertainty','RGBDKeyframes','RGBDBagOfWords','RGBDVisualVocabulary',
    'RGBDKeyframeRetrieval','RGBDFeatureMatching','RigidPointRegistration','RGBDBodyRelativeEdge',
    'RGBDLoopVerification','ModelicaPoseGraph','RGBDCatalogLoopVerification','RGBDGraphMeasurements',
    'RGBDCatalogGraphCapture','RGBDSpatialIndex','RGBDLandmarkMap','RGBDMapAnchors',
    'RGBDMapAnchorAssignment','RGBDAnchoredLandmarkMap','RGBDLandmarkCatalog','RGBDLandmarkProjection',
    'RGBDCatalogMapping','RGBDKeyframeLandmarks','RGBDCatalogObservation','RGBDKeyframePolicy',
    'RGBDCatalogFrame','SchmidtReferenceState','SchmidtRelativePoseCorrection',
    'RGBDLocalizationFrame','RGBDLocalizationCatalog','GraphGaugeUncertainty',
    'SchmidtGraphPoseCorrection','RGBDGraphEstimatorCommit','ModelicaPoseGraphCovariance',
    'RGBDGraphCaptureLedger','RGBDGraphAnchorBound','RGBDGraphSelectedGauge','RGBDGraphProcessing'
  ].map(name=>modelicaSourcePath(name));
  names.push('tests/modelica/RGBDGraphResetConstructorProbe.mo','dev/check-modelica-graph-reset-constructor.mjs','dev/rumoca-bounded-run.mjs');
  const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
  const output=fs.mkdtempSync(path.join(root,'graph-reset-constructor-'));
  const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
  for(const item of sources){const target=path.join(output,'sources',item.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,item.path),target);}
  fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify({sources},null,2)+'\n');
  const omc=process.env.OMC_BIN??'omc';
  const version=spawnSync(omc,['--version'],{encoding:'utf8'});
  if(version.error||version.status!==0)throw version.error??Error(version.stderr);
  const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
    '--log',path.join(output,'worker.log'),'--','nice','-n','15','taskset','-c','4,5','env','OMP_NUM_THREADS=1',
    `TMPDIR=${output}`,process.execPath,path.join(app,'dev/check-modelica-graph-reset-constructor.mjs'),'--worker',output];
  fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
  const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
  const evidence=scenarios.map(scenario=>{
    const work=path.join(output,scenario);const logFile=path.join(work,'omc.log');
    const log=fs.existsSync(logFile)?fs.readFileSync(logFile,'utf8'):'';
    const processFile=path.join(work,'process.json');const processResult=fs.existsSync(processFile)?JSON.parse(fs.readFileSync(processFile,'utf8')):{};
    const csvFiles=fs.existsSync(work)?fs.readdirSync(work).filter(name=>name.endsWith('_res.csv')):[];
    const csv=csvFiles.length===1?fs.readFileSync(path.join(work,csvFiles[0]),'utf8'):null;
    const rows=csv?.trim().split(/\r?\n/);const header=rows?.[0].split(',').map(value=>value.replace(/^"|"$/g,''));
    const values=rows?.slice(1).map(row=>row.split(',').map(Number));
    const validCsv=header?.length===2&&header[0]==='time'&&header[1]==='marker'&&values.length>=2
      &&values.every(row=>row.length===2&&Number.isFinite(row[0])&&row[1]===1)&&values[0][0]===0&&values.at(-1)[0]===0.001;
    const constructorMessage=log.includes('GraphProcessing.Empty requires a fresh empty localization owner');
    const assertionFailure=constructorMessage&&/assert|Assertion/.test(log)&&/terminated|failed|Failed/.test(log);
    const success=log.includes('The simulation finished successfully.');
    const generated=[];
    for(const name of fs.existsSync(work)?fs.readdirSync(work).filter(name=>name.endsWith('.c')||name.endsWith('.h')):[]){
      const body=fs.readFileSync(path.join(work,name),'utf8');
      const needles=['omc_RGBDGraphResetConstructorProbe_Run','omc_RGBDGraphProcessing_Empty','GraphProcessing.Empty requires a fresh empty localization owner'];
      const hits=needles.filter(needle=>body.includes(needle));
      if(hits.length)generated.push({file:name,sha256:sha(body),hits,excerpts:hits.flatMap(needle=>{
        const indices=[...body.matchAll(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))].map(match=>match.index);
        return indices.slice(0,4).map(at=>body.slice(Math.max(0,at-100),at+needle.length+240));
      })});
    }
    const runtimeCall=generated.some(item=>item.hits.includes('omc_RGBDGraphResetConstructorProbe_Run'))
      &&generated.some(item=>item.hits.includes('omc_RGBDGraphProcessing_Empty'))
      &&generated.some(item=>item.hits.includes('GraphProcessing.Empty requires a fresh empty localization owner'));
    const pass=processResult.status===0&&runtimeCall&&(scenario==='ValidSeed'?validCsv&&success:assertionFailure&&!success);
    return {scenario,pass,process:processResult,success,assertionFailure,constructorMessage,runtimeCall,
      csv:csv===null?null:{file:csvFiles[0],sha256:sha(csv),validCsv},logSha256:sha(log),generated};
  });
  const bookendsEqual=sources.every(item=>sha(fs.readFileSync(path.join(app,item.path)))===item.sha256);
  const pass=result.status===0&&bookendsEqual&&evidence.length===3&&evidence.every(item=>item.pass);
  const report={status:pass?'CONSTRUCTOR_ASSERTION_PROBE_PASS':'FAILED_OR_INCOMPLETE',compilerVersion:version.stdout.trim(),
    scope:'Actual full production fresh-state constructors: valid seed accepts, negative covariance and improper rotation reject at the constructor assertion. Reference-only OMC, no Rumoca/WASM/browser qualification.',
    sources,bookendsEqual,processStatus:result.status,signal:result.signal,evidence,rumocaArtifactIssued:false};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  const durable=path.join(app,'dev/artifacts/modelica-graph-reset-constructor',path.basename(output));fs.mkdirSync(durable,{recursive:true});
  fs.cpSync(path.join(output,'sources'),path.join(durable,'sources'),{recursive:true});
  for(const name of ['report.json','source-manifest.json','resources.json','command.json','worker.log'])if(fs.existsSync(path.join(output,name)))fs.copyFileSync(path.join(output,name),path.join(durable,name));
  for(const scenario of scenarios){const work=path.join(output,scenario);const target=path.join(durable,scenario);fs.mkdirSync(target,{recursive:true});
    for(const name of fs.existsSync(work)?fs.readdirSync(work).filter(name=>['probe.mos','omc.log','process.json'].includes(name)||name.endsWith('_res.csv')):[])fs.copyFileSync(path.join(work,name),path.join(target,name));}
  console.log(JSON.stringify({directory:output,durable,status:report.status,bookendsEqual,processStatus:result.status,evidence:evidence.map(({scenario,pass,success,assertionFailure,runtimeCall})=>({scenario,pass,success,assertionFailure,runtimeCall}))}));
  process.exitCode=pass?0:1;
}

import{spawn}from'node:child_process';import{mkdir,writeFile,readFile,copyFile,chmod}from'node:fs/promises';import{createWriteStream}from'node:fs';import{resolve,join}from'node:path';import{createHash}from'node:crypto';
import{OFFICE_NATIVE_FEATURES,verifyGamepadOnlyDelta}from'./office-native-features.mjs';
const[workArg,outputArg]=process.argv.slice(2);if(!outputArg||process.argv.length!==4)throw Error('Usage: build-office-native-step.mjs NEW_WORK NEW_RECEIPTS');
const output=resolve(outputArg),work=resolve(workArg);await mkdir(output);await mkdir(work);
const features=OFFICE_NATIVE_FEATURES;
const revision='278475ff0d39f648f7b98c76abdc4da9a712ee62',source=join(work,'source');await mkdir(source);
const env={...process.env,CARGO_BUILD_JOBS:'4',CARGO_TARGET_DIR:join(work,'target'),CARGO_HOME:join(work,'cargo-home'),RUSTFLAGS:'-C linker-features=-lld'};
const report={status:'running',revision,features,jobs:4,scope:'Internal CI exporter build only; baseline exported-byte parity is mandatory before use.'};
const save=()=>writeFile(join(output,'provenance.json'),JSON.stringify(report,null,2)+'\n');await save();
async function run(command,args,{cwd=source,log,capture=true}={}){
 const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
 const stream=log?createWriteStream(join(output,log)):null;let truncated=false;
 child.stdout.on('data',b=>{stream?.write(b);if(capture){stdout+=b;if(stdout.length>4*1024**2){stdout=stdout.slice(-4*1024**2);truncated=true;}}});
 child.stderr.on('data',b=>{stream?.write(b);stderr=(stderr+String(b)).slice(-4096);});
 let code;try{code=await new Promise((ok,fail)=>{child.on('error',fail);child.on('close',ok);});}
 finally{if(stream)await new Promise(ok=>stream.end(ok));}
 if(code!==0)throw Error(command+' exited '+code+': '+stderr);if(truncated)throw Error('Command text exceeded capture bound');return stdout.trim();
}
try{
 await run('git',['init']);await run('git',['remote','add','origin','https://github.com/CogniPilot/rumoca.git']);
 await run('git',['fetch','--depth','1','origin',revision],{log:'fetch.log'});await run('git',['checkout','--detach',revision]);
 report.sourceHead=await run('git',['rev-parse','HEAD']);if(report.sourceHead!==revision||await run('git',['status','--porcelain']))throw Error('Compiler source identity/cleanliness differs');report.sourceCleanBefore=true;
 report.rustc=await run('rustc',['-vV']);report.cargo=await run('cargo',['--version']);
 if(!report.rustc.includes('commit-hash: 6a979b3e32522049d0acb4a47f7ae44b7c8abfd5')||!report.rustc.includes('release: 1.95.0-nightly')||!report.rustc.includes('host: x86_64-unknown-linux-gnu')||!report.cargo.includes('f298b8c82'))throw Error('Pinned nightly toolchain differs');
 const treeArgs=['tree','--locked','-p','rumoca','--edges','normal,build','--prefix','none','--format','{p} [{f}]'];
 const normal=await run('cargo',treeArgs,{log:'feature-tree-default.txt'}),deviated=await run('cargo',[...treeArgs,'--no-default-features','--features',features.join(',')],{log:'feature-tree-deviated.txt'});
 Object.assign(report,verifyGamepadOnlyDelta(normal,deviated));
 report.phase='cargo-build';await save();
 await run('cargo',['build','--locked','--release','-p','rumoca','--example','native_step','--no-default-features','--features',features.join(','),'--jobs','4'],{log:'cargo.log',capture:false});
 if(await run('git',['status','--porcelain']))throw Error('Compiler source changed during build');report.sourceCleanAfter=true;
 report.binary=join(output,'native_step');await copyFile(join(env.CARGO_TARGET_DIR,'release/examples/native_step'),report.binary);await chmod(report.binary,0o700);const binary=await readFile(report.binary);report.binaryBytes=binary.length;report.binarySha256=createHash('sha256').update(binary).digest('hex');report.status='built-unqualified';report.phase='complete';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{await save();console.log(JSON.stringify(report));}

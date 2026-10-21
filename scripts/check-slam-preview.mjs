// Verify a static preview under a directory prefix before console integration.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
const [directory,output]=process.argv.slice(2);
if(!output)throw Error('Usage: check-slam-preview.mjs STATIC_BUILD OUTPUT_PREFIX');
const root=resolve(directory),files=new Set();
async function inventory(path=''){
 for(const entry of await readdir(join(root,path),{withFileTypes:true})){
  const name=path?path+'/'+entry.name:entry.name;
  if(entry.isDirectory())await inventory(name);else if(entry.isFile())files.add(name);
 }
}
await inventory();
const prefix='/preview-test/hallway/',types={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 const name=path.startsWith(prefix)?decodeURIComponent(path.slice(prefix.length))||'index.html':'';
 if(!files.has(name)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',types[extname(name)]??'application/octet-stream');res.end(await readFile(join(root,name)));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;const errors=[];
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}${prefix}hallway.html`);
 await page.waitForFunction(()=>window.__slamLab?.ready&&window.__slamLab.runtime.world.viewerCamera.mode==='free',undefined,{timeout:120000});
 const result=await page.evaluate(()=>({path:location.pathname,environment:window.__slamLab.runtime.project.environment,backend:window.__slamLab.runtime.project.slamBackend,
  camera:window.__slamLab.runtime.world.view.position.toArray(),physics:window.__slamLab.runtime.project.physics.includes('HallwayProfile.Position(time)')}));
 if(!result.path.startsWith(prefix)||result.environment!=='hallway'||result.backend!=='inertial'||!result.physics||errors.length)throw Error('Preview gate failed '+JSON.stringify({result,errors}));
 await page.screenshot({path:output+'.png'});await writeFile(output+'.json',JSON.stringify({status:'pass',result,errors,scope:'Local prefix-routing/preview smoke. Does not establish access from user device or console auth integration.'},null,2)+'\n');
 console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(done=>server.close(done));}

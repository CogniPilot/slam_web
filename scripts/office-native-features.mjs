export const OFFICE_NATIVE_FEATURES=Object.freeze(['scheduled-sim','scenario-config','input-keyboard','transport-udp','transport-zenoh','viewer-web','process-control','native-allocator','fmu-packaging','component-build']);
const removedPackages=new Set(['rumoca-input-gamepad v0.10.3','gilrs v0.11.2','gilrs-core v0.6.8','libudev-sys v0.1.4','inotify v0.11.2','inotify-sys v0.1.7','nix v0.31.3']);
function parse(text){
 const result=new Map();for(const line of text.trim().split(/\r?\n/)){
  const m=/^(.*?) \[([^\]]*)\](?: \(\*\))?$/.exec(line);if(!m)throw Error('Unrecognized feature tree row');
  result.set(m[1],[...new Set([...(result.get(m[1])??[]),...m[2].split(',').map(x=>x.trim()).filter(Boolean)])].sort());
 }return result;
}
export function verifyGamepadOnlyDelta(normal,deviated){
 const before=parse(normal),after=parse(deviated),result={removed:[],changed:[]};
 for(const[pkg,set]of before){
  const name=pkg.split(' ')[0],next=after.get(pkg);
  if(!next){const identity=pkg.match(/^\S+ v\S+/)?.[0];if(!removedPackages.has(identity))throw Error('Unexpected removed package: '+pkg);result.removed.push(identity);continue;}
  const removed=set.filter(x=>!next.includes(x)),added=next.filter(x=>!set.includes(x));
  if(added.length||removed.some(x=>!(name==='rumoca'&&['default','input-gamepad'].includes(x)||name==='rumoca-sim'&&x==='input-gamepad')))throw Error('Unexpected feature change: '+pkg);
  if(removed.length)result.changed.push({package:pkg,removed});
 }
 for(const pkg of after.keys())if(!before.has(pkg))throw Error('Unexpected added package: '+pkg);
 if(result.removed.length!==removedPackages.size||result.removed.some(x=>!removedPackages.has(x)))throw Error('Gamepad package delta is incomplete');
 const root=result.changed.find(x=>x.package.startsWith('rumoca ')),sim=result.changed.find(x=>x.package.startsWith('rumoca-sim '));
 if(JSON.stringify(root?.removed)!==JSON.stringify(['default','input-gamepad'])||JSON.stringify(sim?.removed)!==JSON.stringify(['input-gamepad'])||result.changed.length!==2)throw Error('Expected exact gamepad feature delta missing');
 return result;
}

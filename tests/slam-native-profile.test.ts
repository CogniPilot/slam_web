import {afterEach,expect,it,vi} from 'vitest';
import {fetchNativeManifest} from '../src/slam-native-program';

afterEach(()=>vi.unstubAllGlobals());
const models=(width:number,height:number)=>Object.fromEntries(['initialize','step'].map(key=>[key,{model:key,inputs:{rgb:{count:width*height*3},depth:{count:width*height}}}]));
it('selects the compiler-exported raster profile and rejects missing sizes without resampling',async()=>{
  const manifest={schemaVersion:1,sourceSha256:'legacy',models:models(848,480),profiles:{'424x240':{sourceSha256:'small',models:models(424,240)}}};
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>manifest})));
  const base=new URL('https://slam.example/app/');
  const small=await fetchNativeManifest(base,'424x240');expect(small.sourceSha256).toBe('small');expect(small.models.step.inputs.rgb.count).toBe(424*240*3);
  expect((await fetchNativeManifest(base,'848x480')).sourceSha256).toBe('legacy');
  await expect(fetchNativeManifest(base,'640x360')).rejects.toThrow('not published');
});

import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {describe,it,expect,vi,afterEach} from 'vitest';
import * as THREE from 'three';
import {daylightState} from '../src/world-lighting';
import {WorldMaterials,createWorldCanvas} from '../src/world-materials';

const directory=new URL('../public/textures/pbr/',import.meta.url);
function jpegSize(bytes:Buffer){
  expect(bytes.readUInt16BE(0)).toBe(0xffd8);
  for(let offset=2;offset+8<bytes.length;){
    while(bytes[offset]===255)offset++;
    const marker=bytes[offset++];
    if(marker===0xd9||marker===0xda)break;
    const length=bytes.readUInt16BE(offset);
    if(marker===0xc0||marker===0xc2)return [bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)];
    offset+=length;
  }
  throw new Error('JPEG did not contain a baseline/progressive size header');
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('photographic surfaces and deterministic atmosphere',()=>{
  it('pins economical local CC0 maps, physical scale, author credits and an outdoor HDR',async()=>{
    const manifest=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8'));
    expect(manifest.license).toBe('CC0-1.0');expect(manifest.assets).toHaveLength(6);
    let total=0;
    for(const asset of manifest.assets){
      expect(asset.source).toMatch(/^https:\/\/polyhaven.com\/a\//);expect(Object.keys(asset.authors).length).toBeGreaterThan(0);
      expect(asset.metres[0]).toBeGreaterThan(1);expect(asset.metres[0]).toBeCloseTo(asset.metres[1],2);
      expect(asset.files.map((f:any)=>f.role)).toEqual(['color','normal','arm']);
      for(const file of asset.files){
        const bytes=await readFile(new URL(file.file,directory));total+=bytes.length;
        expect(jpegSize(bytes)).toEqual([512,512]);expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
        expect(file.originalSha256).toMatch(/^[a-f0-9]{64}$/);expect(file.url).toMatch(/^https:\/\/dl.polyhaven.org\//);
      }
    }
    const hdr=await readFile(new URL(manifest.environment.file,directory));total+=hdr.length;
    expect(hdr.subarray(0,500).toString()).toContain('FORMAT=32-bit_rle_rgbe');expect(hdr.subarray(0,500).toString()).toContain('-Y 512 +X 1024');
    expect(createHash('sha256').update(hdr).digest('hex')).toBe(manifest.environment.sha256);
    expect(total).toBeLessThan(3.2*1024*1024);
    expect(await readFile(new URL('LICENSE-CC0-1.0.html',directory),'utf8')).toContain('CC0 1.0 Universal');
  });
  it('derives sun, moon and night visibility from phase with reproducible wrapping',()=>{
    const noon=daylightState(.5),midnight=daylightState(0);
    expect(noon.day).toBe(1);expect(noon.night).toBe(0);expect(midnight.day).toBe(0);expect(midnight.night).toBe(1);
    for(const phase of [-.1,0,.25,.5,.75,1,1.1]){
      const state=daylightState(phase);expect(state.sun.length()).toBeCloseTo(1,12);expect(state.sun.dot(state.moon)).toBeCloseTo(-1,12);
      expect(state.sun.distanceTo(daylightState(phase+3).sun)).toBeLessThan(2e-14);
    }
    expect(()=>daylightState(NaN)).toThrow(/finite/);
  });
  it('loads and shares linear ARM/normal and sRGB color maps without document in a worker',async()=>{
    vi.stubGlobal('document',undefined);vi.stubGlobal('createImageBitmap',()=>{});
    class Canvas {constructor(readonly width:number,readonly height:number){}getContext(){return {createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}};}}
    vi.stubGlobal('OffscreenCanvas',Canvas);
    expect(createWorldCanvas(20,10)).toBeInstanceOf(Canvas);
    const bitmaps=Array.from({length:18},()=>({width:512,height:512,close:vi.fn()} as unknown as ImageBitmap));let next=0;
    const load=vi.spyOn(THREE.ImageBitmapLoader.prototype,'loadAsync').mockImplementation(async()=>bitmaps[next++]);
    const materials=new WorldMaterials(4,'https://example.test/lab/');
    const before=materials.surface('brick',0xba7253);await materials.ready;
    const after=materials.surface('brick',0xba7253),other=materials.surface('brick',0xc6b997);
    expect(after).toBe(before);expect(after.map).toBe(other.map);expect(load).toHaveBeenCalledTimes(18);
    expect(load.mock.calls.every(([url])=>String(url).startsWith('https://example.test/lab/textures/pbr/'))).toBe(true);
    expect(after.map?.colorSpace).toBe(THREE.SRGBColorSpace);expect(after.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(after.roughnessMap?.colorSpace).toBe(THREE.NoColorSpace);expect(after.aoMap).toBe(after.roughnessMap);
    expect(after.map?.repeat.x).toBeCloseTo(1/3,12);expect(after.metalness).toBe(0);
    materials.dispose();expect(bitmaps.every(b=>(b.close as ReturnType<typeof vi.fn>).mock.calls.length===1)).toBe(true);
  });
});

import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {bakeCityGeometry,CITY_ASSET_CREDITS} from '../src/world-city-assets';

const directory=new URL('../public/models/city/',import.meta.url);
describe('bundled Poly Pizza architecture',()=>{
  it('keeps creator proportions, feet at ground and outward mirrored faces when baked for instancing',async()=>{
    let mirroredModels=0;
    for(const asset of CITY_ASSET_CREDITS) {
      const bytes=await readFile(new URL(asset.file,directory));
      const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
      scene.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3()),centre=bounds.getCenter(new THREE.Vector3());centre.y=bounds.min.y;
      const scale=4.6/size.x,resultBounds=new THREE.Box3();let triangles=0,mirrored=false;
      scene.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        mirrored||=object.matrixWorld.determinant()<0;
        const baked=bakeCityGeometry(object,centre,scale),positions=baked.getAttribute('position'),normals=baked.getAttribute('normal');
        resultBounds.union(baked.boundingBox!);
        for(let i=0;i<positions.count;i+=3) {
          const a=new THREE.Vector3().fromBufferAttribute(positions,i),b=new THREE.Vector3().fromBufferAttribute(positions,i+1),c=new THREE.Vector3().fromBufferAttribute(positions,i+2);
          const face=b.sub(a).cross(c.sub(a));if(face.lengthSq()<1e-12)continue;
          const normal=new THREE.Vector3().fromBufferAttribute(normals,i);
          // Front-face winding must agree with the actual outward shading
          // normal, including the original model's negative FBX node scale.
          expect(face.normalize().dot(normal)).toBeGreaterThan(-1e-5);
          triangles++;
        }
        // The same transformed vertices must be retained; baking must not
        // silently flatten roofs, move glass, or introduce a second scale.
        const original=object.geometry.getAttribute('position'),index=object.geometry.index;
        for(let i=0;i<positions.count;i+=Math.max(3,Math.floor(positions.count/30/3)*3)) {
          const source=index?index.getX(i):i;
          const expected=new THREE.Vector3().fromBufferAttribute(original,source).applyMatrix4(object.matrixWorld).sub(centre).multiplyScalar(scale);
          expect(new THREE.Vector3().fromBufferAttribute(positions,i).distanceTo(expected)).toBeLessThan(2e-6);
        }
        baked.dispose();
      });
      if(mirrored)mirroredModels++;
      expect(triangles).toBeGreaterThan(500);
      const resultSize=resultBounds.getSize(new THREE.Vector3());
      expect(resultSize.x).toBeCloseTo(4.6,5);expect(resultBounds.min.y).toBeCloseTo(0,5);
      expect(resultSize.y/resultSize.x).toBeCloseTo(size.y/size.x,5);
      expect(resultSize.z/resultSize.x).toBeCloseTo(size.z/size.x,5);
    }
    expect(mirroredModels).toBe(1);
  });
  it('ships per-asset authors, source links, license text and exact download hashes',async()=>{
    const manifest=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8'));
    const license=await readFile(new URL('LICENSE-CC-BY-3.0.txt',directory),'utf8');
    expect(license).toContain('Attribution 3.0 Unported');
    expect(manifest.assets).toHaveLength(CITY_ASSET_CREDITS.length);
    for(const asset of CITY_ASSET_CREDITS) {
      const record=manifest.assets.find((entry:any)=>entry.file===asset.file),bytes=await readFile(fileURLToPath(new URL(asset.file,directory)));
      expect(record.creator).toBe(asset.creator);expect(record.source).toBe(asset.source);expect(record.licenseUrl).toBe(asset.licenseUrl);
      expect(record.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));expect(record.bytes).toBe(bytes.length);
    }
  });
});

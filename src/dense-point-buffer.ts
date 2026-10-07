import * as THREE from 'three';

/** Bind the unmodified GPU sample array. Stable shapes reuse the geometry and
 * GL allocation; Three.js uploads the new array when the viewer next draws. */
export function setDensePointBuffer(points:THREE.Points,samples:Float32Array,radius:number){
  const position=points.geometry.getAttribute('position');
  if(position instanceof THREE.InterleavedBufferAttribute&&position.data.array instanceof Float32Array&&position.data.stride===4&&position.data.count===samples.length/4){
    position.data.array=samples;position.data.needsUpdate=true;
    points.geometry.boundingSphere!.radius=radius;
    return;
  }
  const geometry=new THREE.BufferGeometry(),buffer=new THREE.InterleavedBuffer(samples,4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(buffer,3,0));
  geometry.setAttribute('returnDepth',new THREE.InterleavedBufferAttribute(buffer,1,3));
  geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),radius);
  points.geometry.dispose();points.geometry=geometry;
}

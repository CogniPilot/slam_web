import * as THREE from 'three';
import type {Calibration} from './types';
import type {DepthCloud} from './depth-cloud';

/** Presentation view of the original top-down Z16 image. No XYZ buffer is
 * constructed on the host. Placement remains renderer-only metadata. */
export interface DepthCloudRaster extends Omit<DepthCloud,'samples'> {
  encoding:'Z16';
  samples:Uint16Array;
  strideBytes:number;
  unitsMeters:number;
  calibration:Pick<Calibration,'fx'|'fy'|'cx'|'cy'|'near'|'far'>;
}
export type DepthCloudDisplay=DepthCloud|DepthCloudRaster;
export function isDepthCloudRaster(cloud:DepthCloudDisplay):cloud is DepthCloudRaster {
  return 'encoding' in cloud&&cloud.encoding==='Z16';
}

/** One vertex per native depth pixel. gl_VertexID supplies the raster index;
 * the only uploaded attribute is the original unsigned 16-bit depth texture. */
export class GpuDepthCloudRaster {
  readonly geometry=new THREE.BufferGeometry();
  readonly texture=new THREE.DataTexture(new Uint16Array(1),1,1,THREE.RedIntegerFormat,THREE.UnsignedShortType);
  readonly material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,transparent:true,depthWrite:false,
    uniforms:{depth:{value:this.texture},width:{value:1},intrinsics:{value:new THREE.Vector4()},
      unitsMeters:{value:.001},nearDepth:{value:0},farDepth:{value:0},pointColor:{value:new THREE.Color(.32,.76,.93)}},
    vertexShader:`precision highp float;precision highp int;
      uniform highp usampler2D depth;
      uniform int width;
      uniform vec4 intrinsics;
      uniform float unitsMeters,nearDepth,farDepth;
      uniform mat4 modelViewMatrix,projectionMatrix;
      out float valid;
      void main(){
        ivec2 pixel=ivec2(gl_VertexID%width,gl_VertexID/width);
        float z=float(texelFetch(depth,pixel,0).r)*unitsMeters;
        valid=(z>=nearDepth&&z<farDepth&&z>0.0)?z:0.0;
        vec2 optical=(vec2(pixel)-intrinsics.zw)*z/intrinsics.xy;
        vec3 point=vec3(z,-optical.x,-optical.y);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(point,1.0);
        gl_PointSize=2.0;
      }`,
    fragmentShader:`precision highp float;uniform vec3 pointColor;in float valid;out vec4 color;
      void main(){if(valid<=0.0)discard;color=vec4(pointColor,0.7);}`});
  constructor(){
    this.texture.internalFormat='R16UI';this.texture.unpackAlignment=2;
    this.texture.minFilter=this.texture.magFilter=THREE.NearestFilter;
    this.texture.generateMipmaps=false;this.texture.flipY=false;
    this.geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1);
  }
  set(cloud:DepthCloudRaster){
    const c=cloud.calibration;
    if(!(cloud.samples instanceof Uint16Array)||![cloud.width,cloud.height,cloud.strideBytes].every(Number.isSafeInteger)||
      cloud.width<=0||cloud.height<=0||cloud.width*cloud.height>990_000||cloud.strideBytes%2||cloud.strideBytes<cloud.width*2||
      cloud.samples.byteLength!==cloud.strideBytes*cloud.height||
      ![cloud.unitsMeters,c.fx,c.fy,c.cx,c.cy,c.near,c.far].every(Number.isFinite)||
      Math.fround(cloud.unitsMeters)<=0||!Number.isFinite(Math.fround(cloud.unitsMeters))||c.fx<=0||c.fy<=0||c.near<0||c.far<=c.near)
      throw Error('Invalid Z16 cloud presentation');
    const previous=this.texture.image;
    if(previous.width!==cloud.strideBytes/2||previous.height!==cloud.height)this.texture.dispose();
    this.texture.image={data:cloud.samples,width:cloud.strideBytes/2,height:cloud.height};this.texture.needsUpdate=true;
    const u=this.material.uniforms;u.width.value=cloud.width;u.intrinsics.value.set(c.fx,c.fy,c.cx,c.cy);
    u.unitsMeters.value=cloud.unitsMeters;u.nearDepth.value=c.near;u.farDepth.value=c.far;
    this.geometry.setDrawRange(0,cloud.width*cloud.height);this.geometry.boundingSphere!.radius=c.far*2;
  }
  dispose(){this.texture.dispose();this.geometry.dispose();this.material.dispose();}
}

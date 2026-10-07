import * as THREE from 'three';
import {GpuReadback,type GpuReadSubmission} from '../../src/gpu-readback';

export interface RealSenseImageLayout {
  width:number;height:number;strideBytes:number;bytes:number;
}
export interface RealSenseRawImages {
  color:RealSenseImageLayout & {format:'RGB8';data:Uint8Array};
  depth:RealSenseImageLayout & {format:'Z16';data:Uint16Array;unitsMeters:number;isBigEndian:false};
}
export interface CameraImageLayout {
  color:RealSenseImageLayout & {format:'RGB8'};
  depth:RealSenseImageLayout & {format:'Z16';unitsMeters:number;isBigEndian:false};
  rowOrder:'top-down';aligned:false;clockDomain:'simulation';
}
/** Allocate views only. Pixel packing and row orientation stay on the GPU.
 * Extra storage may hold cloud/LiDAR so all streams share one direct PBO copy. */
export function allocateRealSenseImages(color:{width:number;height:number},depth:{width:number;height:number},unitsMeters:number,extraBytes=0){
  if(new Uint8Array(new Uint16Array([1]).buffer)[0]!==1)throw Error('RealSense packing requires little-endian storage');
  if(!Number.isFinite(unitsMeters)||!Number.isFinite(Math.fround(unitsMeters))||Math.fround(unitsMeters)<=0)throw Error('Depth units must be positive finite float32');
  if(!Number.isSafeInteger(extraBytes)||extraBytes<0||extraBytes%4)throw Error('Extra sensor storage must be aligned');
  const layout=(source:{width:number;height:number},channels:number):RealSenseImageLayout=>{
    if(!Number.isSafeInteger(source.width)||!Number.isSafeInteger(source.height)||source.width<=0||source.height<=0||source.width*source.height>990_000)throw Error('Invalid camera image dimensions');
    const strideBytes=Math.ceil(source.width*channels/4)*4;
    return {width:source.width,height:source.height,strideBytes,bytes:strideBytes*source.height};
  };
  const colorLayout=layout(color,3),depthLayout=layout(depth,2),destination=new Uint8Array(colorLayout.bytes+depthLayout.bytes+extraBytes);
  const images:RealSenseRawImages={color:{...colorLayout,format:'RGB8',data:destination.subarray(0,colorLayout.bytes)},
    depth:{...depthLayout,format:'Z16',data:new Uint16Array(destination.buffer,colorLayout.bytes,depthLayout.bytes/2),unitsMeters,isBigEndian:false}};
  return {images,destination};
}
export function cameraImageLayout(images:RealSenseRawImages):CameraImageLayout {
  const {data:_rgb,...color}=images.color,{data:_depth,...depth}=images.depth;
  return {color,depth,rowOrder:'top-down',aligned:false,clockDomain:'simulation'};
}

const vertex=`in vec3 position;void main(){gl_Position=vec4(position.xy,0.0,1.0);}`;
const header=`precision highp float;precision highp int;uniform sampler2D image;out vec4 bytes;`;
const colorFragment=header+`
  uniform bool srgb;
  vec3 encoded(vec3 c){
    return mix(12.92*c,1.055*pow(c,vec3(1.0/2.4))-0.055,greaterThan(c,vec3(0.0031308)));
  }
  float byteAt(int offset,int row){
    ivec2 size=textureSize(image,0);
    if(offset>=size.x*3)return 0.0;
    vec3 c=texelFetch(image,ivec2(offset/3,size.y-1-row),0).rgb;
    if(srgb)c=encoded(c);
    return floor(c[offset%3]*255.0+0.5);
  }
  void main(){
    ivec2 pixel=ivec2(gl_FragCoord.xy);int offset=pixel.x*4;
    bytes=vec4(byteAt(offset,pixel.y),byteAt(offset+1,pixel.y),
      byteAt(offset+2,pixel.y),byteAt(offset+3,pixel.y))/255.0;
  }`;
const depthFragment=header+`
  uniform float unitsMeters;
  uint sampleAt(int column,int row){
    ivec2 size=textureSize(image,0);if(column>=size.x)return 0u;
    uvec4 b=uvec4(floor(texelFetch(image,ivec2(column,size.y-1-row),0)*255.0+0.5));
    float z=uintBitsToFloat(b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u));
    if(isnan(z)||isinf(z)||z<=0.0)return 0u;
    return uint(clamp(floor(z/unitsMeters+0.5),0.0,65535.0));
  }
  void main(){
    ivec2 pixel=ivec2(gl_FragCoord.xy);
    uint a=sampleAt(pixel.x*2,pixel.y),b=sampleAt(pixel.x*2+1,pixel.y);
    bytes=vec4(a&255u,a>>8u,b&255u,b>>8u)/255.0;
  }`;

/** GPU device-format packing.
 * RGB8 has no alpha. Z16 is unsigned little-endian axial depth, zero invalid,
 * with an explicit meters-per-unit scale. Shader output is already top-down.
 * Odd diagnostic widths retain explicit row padding; native848 is tightly packed.
 * Sensor noise is applied to the source depth texture before packing.
 */
export class GpuRealSensePacking {
  private color=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,colorSpace:THREE.NoColorSpace});
  private depth=this.color.clone();
  private scene=new THREE.Scene();private camera=new THREE.Camera();
  private geometry=new THREE.PlaneGeometry(2,2);
  private colorMaterial=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:colorFragment,
    uniforms:{image:{value:null},srgb:{value:false}},depthTest:false,depthWrite:false,blending:THREE.NoBlending});
  private depthMaterial=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:depthFragment,
    uniforms:{image:{value:null},unitsMeters:{value:.001}},depthTest:false,depthWrite:false,blending:THREE.NoBlending});
  private mesh=new THREE.Mesh(this.geometry,this.colorMaterial);private disposed=false;
  constructor(){this.mesh.frustumCulled=false;this.scene.add(this.mesh);}
  submit(renderer:THREE.WebGLRenderer,color:THREE.WebGLRenderTarget,depth:THREE.WebGLRenderTarget,images:RealSenseRawImages,read:GpuReadSubmission['read']) {
    if(this.disposed)throw Error('RealSense GPU packing is disposed');
    for(const source of [color,depth])if(source.samples!==0||source.texture.type!==THREE.UnsignedByteType||source.texture.format!==THREE.RGBAFormat)throw Error('RealSense packing requires single-sample RGBA8 source targets');
    if(depth.texture.colorSpace!==THREE.NoColorSpace)throw Error('Raw axial depth must have no color conversion');
    if(![THREE.NoColorSpace,THREE.SRGBColorSpace].includes(color.texture.colorSpace as ''|'srgb'))throw Error('Unsupported RGB target color space');
    const colorLayout=images.color,depthLayout=images.depth;
    if(colorLayout.format!=='RGB8'||!(colorLayout.data instanceof Uint8Array)||depthLayout.format!=='Z16'||!(depthLayout.data instanceof Uint16Array)||depthLayout.isBigEndian!==false||!Number.isFinite(depthLayout.unitsMeters)||!Number.isFinite(Math.fround(depthLayout.unitsMeters))||Math.fround(depthLayout.unitsMeters)<=0)throw Error('Invalid RealSense packing destination');
    for(const [source,layout,channels] of [[color,colorLayout,3],[depth,depthLayout,2]] as const)
      if(source.width!==layout.width||source.height!==layout.height||layout.strideBytes!==Math.ceil(source.width*channels/4)*4||layout.data.byteLength!==layout.strideBytes*layout.height)throw Error('Camera packing destination does not match source');
    this.color.setSize(colorLayout.strideBytes/4,color.height);this.depth.setSize(depthLayout.strideBytes/4,depth.height);
    const rgb=images.color.data,zBytes=new Uint8Array(images.depth.data.buffer,images.depth.data.byteOffset,images.depth.data.byteLength);
    const target=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
    const gl=renderer.getContext(),dither=gl.isEnabled(gl.DITHER);
    try{
      gl.disable(gl.DITHER);renderer.setScissorTest(false);
      this.colorMaterial.uniforms.image.value=color.texture;this.colorMaterial.uniforms.srgb.value=color.texture.colorSpace===THREE.SRGBColorSpace;
      this.depthMaterial.uniforms.image.value=depth.texture;this.depthMaterial.uniforms.unitsMeters.value=images.depth.unitsMeters;
      this.mesh.material=this.colorMaterial;renderer.setRenderTarget(this.color);renderer.render(this.scene,this.camera);read(this.color.width,this.color.height,rgb);
      this.mesh.material=this.depthMaterial;renderer.setRenderTarget(this.depth);renderer.render(this.scene,this.camera);read(this.depth.width,this.depth.height,zBytes);
    }finally{
      renderer.setRenderTarget(target);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
      if(dither)gl.enable(gl.DITHER);
    }
  }
  capture(renderer:THREE.WebGLRenderer,readback:GpuReadback,color:THREE.WebGLRenderTarget,depth:THREE.WebGLRenderTarget,unitsMeters:number):RealSenseRawImages {
    const {images,destination}=allocateRealSenseImages(color,depth,unitsMeters);
    readback.readBatchPackedSync(destination.byteLength,read=>this.submit(renderer,color,depth,images,read),destination);
    return images;
  }
  dispose(){this.disposed=true;this.color.dispose();this.depth.dispose();this.geometry.dispose();this.colorMaterial.dispose();this.depthMaterial.dispose();}
}

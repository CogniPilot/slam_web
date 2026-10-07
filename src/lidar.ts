import * as THREE from 'three';
import {withCommittedScene} from './committed-scene';
import {withSensorGeometry} from './sensor-geometry-batches';
import {GpuReadback,type GpuReadSubmission} from './gpu-readback';

export interface LidarScan {
  time:number;
  beams:64;
  columns:number;
  near:number;
  far:number;
  /** Unmodified RGBA32F readback, beam-major: local FLU XYZ and the exact
   * 24-bit radial code. All four channels are zero for an invalid return.
   * Modelica owns range decoding/selection; the host never compacts samples.
   * Metres = code / 16777214 * far. Beam b elevation = (15-40*b/63) degrees.
   */
  samples:Float32Array;
  format:'FLU_XYZ_PACK24';
  frame:'FLU';
}
export interface LidarOptions {columns?:number;cubeResolution?:256|512;near?:number;far?:number;cubeFaces?:4|6}
export interface LidarTimings {submitMs:number;waitMs:number;handoffMs:number;totalMs:number;method:string;samples:number;faces:number;drawCalls:number;triangles:number;readbackBytes:number}
const BEAMS=64;

/** GPU radial range capture and point projection into a 64-beam scan.
 * Angular sampling is limited by cubeResolution; this is not an exact ray tracer.
 * The caller passes the mounted sensor Object3D and objects excluded from sensing.
 */
export class GpuLidar {
  get readbackByteLength(){return BEAMS*this.columns*4*Float32Array.BYTES_PER_ELEMENT;}
  readonly columns:number;
  readonly near:number;
  readonly far:number;
  readonly cubeResolution:number;
  readonly cubeFaces:4|6;
  timings?:LidarTimings;
  private readonly cube:THREE.WebGLCubeRenderTarget;
  private readonly camera:THREE.CubeCamera;
  private readonly target:THREE.WebGLRenderTarget;
  private readonly radial:THREE.ShaderMaterial;
  private readonly scanMaterial:THREE.ShaderMaterial;
  private readonly scanScene=new THREE.Scene();
  private readonly scanCamera=new THREE.Camera();
  private readonly quad:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  private readonly readback:GpuReadback;
  private busy=false;
  private disposed=false;
  private readonly floatingSupported:boolean;

  constructor(private readonly renderer:THREE.WebGLRenderer,private readonly scene:THREE.Scene,options:LidarOptions={}) {
    this.readback=new GpuReadback(renderer.getContext() as WebGL2RenderingContext);
    this.columns=options.columns??1024;this.cubeResolution=options.cubeResolution??256;
    this.cubeFaces=options.cubeFaces??4;
    this.near=options.near??.1;this.far=options.far??80;
    if(!Number.isInteger(this.columns)||this.columns<64||this.columns>4096||!Number.isFinite(this.near)||!Number.isFinite(this.far)||this.near<=0||this.far<=this.near||![256,512].includes(this.cubeResolution)||![4,6].includes(this.cubeFaces))throw new Error('Invalid LiDAR resolution or range');
    if(this.columns>renderer.capabilities.maxTextureSize)throw new Error('LiDAR scan exceeds GPU texture limits');
    this.floatingSupported=!!(renderer.getContext() as WebGL2RenderingContext).getExtension('EXT_color_buffer_float');
    const settings={format:THREE.RGBAFormat,type:THREE.UnsignedByteType,colorSpace:THREE.NoColorSpace,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false};
    this.cube=new THREE.WebGLCubeRenderTarget(this.cubeResolution,{...settings,depthBuffer:true});
    // Cube clipping is axial per face; this admits every radial return >= near.
    this.camera=new THREE.CubeCamera(this.near/Math.sqrt(3),this.far,this.cube);
    this.target=new THREE.WebGLRenderTarget(this.columns,BEAMS,{...settings,type:THREE.FloatType,depthBuffer:false});
    this.radial=new THREE.ShaderMaterial({
      uniforms:{maxRange:{value:this.far}},side:THREE.DoubleSide,toneMapped:false,
      vertexShader:`
        #include <common>
        #include <batching_pars_vertex>
        #include <morphtarget_pars_vertex>
        #include <skinning_pars_vertex>
        varying vec3 viewPosition;
        void main(){
          #include <batching_vertex>
          #include <skinbase_vertex>
          #include <begin_vertex>
          #include <morphtarget_vertex>
          #include <skinning_vertex>
          #include <project_vertex>
          viewPosition=mvPosition.xyz;
        }`,
      fragmentShader:`
        uniform float maxRange;
        varying vec3 viewPosition;
        void main(){
          float code=floor(clamp(length(viewPosition)/maxRange,0.,1.)*16777214.+.5);
          gl_FragColor=vec4(floor(code/65536.),floor(mod(code,65536.)/256.),mod(code,256.),255.)/255.;
        }`
    });
    this.scanMaterial=new THREE.ShaderMaterial({
      uniforms:{radialCube:{value:this.cube.texture},columns:{value:this.columns},minRange:{value:this.near},maxRange:{value:this.far}},depthTest:false,depthWrite:false,toneMapped:false,
      vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`
        uniform samplerCube radialCube;
        uniform float columns;
        uniform float minRange,maxRange;
        void main(){
          float azimuth=6.283185307179586*(gl_FragCoord.x-.5)/columns;
          float elevation=radians(15.-40.*(gl_FragCoord.y-.5)/63.);
          // FLU (forward,left,up) -> Three (x,up,-left), in sensor-local axes.
          vec3 direction=vec3(cos(elevation)*cos(azimuth),sin(elevation),-cos(elevation)*sin(azimuth));
          vec3 encoded=textureCube(radialCube,direction).rgb;
          // Exact 24-bit code fits a float. Preserve it for Modelica range
          // decoding; XYZ and invalid-return clearing happen on the GPU.
          float code=floor(encoded.r*255.+.5)*65536.+floor(encoded.g*255.+.5)*256.+floor(encoded.b*255.+.5);
          float range=code/16777214.*maxRange;
          if(code>=16777214.||range<minRange||range>=maxRange){gl_FragColor=vec4(0.);return;}
          gl_FragColor=vec4(vec3(direction.x,-direction.z,direction.y)*range,code);
        }`
    });
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.scanMaterial);this.quad.frustumCulled=false;this.scanScene.add(this.quad);
  }

  private renderCube(){
    if(this.camera.coordinateSystem!==this.renderer.coordinateSystem){
      this.camera.coordinateSystem=this.renderer.coordinateSystem;this.camera.updateCoordinateSystem();
    }
    let drawCalls=0,triangles=0;
    // At elevations -25..+15 degrees a horizontal component always dominates
    // the vertical one. No beam samples the +Y/-Y cube faces, even when the
    // sensor is tilted: both camera and sampling directions use local axes.
    for(const face of this.cubeFaces===6?[0,1,2,3,4,5]:[0,1,4,5]){
      this.renderer.setRenderTarget(this.cube,face,0);
      this.renderer.render(this.scene,this.camera.children[face] as THREE.Camera);
      drawCalls+=this.renderer.info.render.calls;triangles+=this.renderer.info.render.triangles;
    }
    return {drawCalls,triangles};
  }

  async capture(sensor:THREE.Object3D,time:number,hidden:readonly THREE.Object3D[]=[],readbackMode:'async'|'sync'='async',submission?:GpuReadSubmission,destination?:Float32Array):Promise<LidarScan> {
    if(this.disposed)throw new Error('LiDAR is disposed');
    if(!this.floatingSupported)throw new Error('GPU LiDAR point projection requires EXT_color_buffer_float');
    if(this.busy)throw new Error('LiDAR capture is already in progress');
    if(!Number.isFinite(time)||time<0)throw new Error('LiDAR time must be finite and nonnegative');
    if(destination&&(!(destination instanceof Float32Array)||destination.length!==BEAMS*this.columns*4))throw Error('Invalid LiDAR destination');
    this.busy=true;
    const started=performance.now(),background=this.scene.background,override=this.scene.overrideMaterial;
    const target=this.renderer.getRenderTarget(),face=this.renderer.getActiveCubeFace(),mip=this.renderer.getActiveMipmapLevel();
    const xr=this.renderer.xr.enabled,autoClear=this.renderer.autoClear,shadows=this.renderer.shadowMap.enabled;
    const visibility=hidden.map(object=>({object,visible:object.visible})),pixels=destination??new Float32Array(BEAMS*this.columns*4);
    let drawCalls=0,triangles=0,blockingReadback=0;
    let read:Promise<unknown>|undefined;
    try {
      sensor.updateWorldMatrix(true,false);sensor.getWorldPosition(this.camera.position);sensor.getWorldQuaternion(this.camera.quaternion);
      this.camera.updateMatrixWorld(true);
      for(const {object} of visibility)object.visible=false;
      this.scene.background=new THREE.Color(0xffffff);this.scene.overrideMaterial=this.radial;
      this.renderer.xr.enabled=false;this.renderer.autoClear=true;this.renderer.shadowMap.enabled=false;
      ({drawCalls,triangles}=withCommittedScene(this.scene,()=>withSensorGeometry(this.scene,()=>this.renderCube())));
      this.renderer.setRenderTarget(this.target);this.renderer.render(this.scanScene,this.scanCamera);
      if(submission){
        submission.read(this.columns,BEAMS,pixels);read=submission.completed;
      }else if(readbackMode==='sync'){
        const before=performance.now();this.readback.readSync(this.columns,BEAMS,pixels);
        blockingReadback=performance.now()-before;read=Promise.resolve();
      }else read=this.readback.read(this.columns,BEAMS,pixels);
    } finally {
      // No scene state is held across a fence wait; overview rendering can resume.
      this.scene.background=background;this.scene.overrideMaterial=override;
      for(const {object,visible} of visibility)object.visible=visible;
      this.renderer.xr.enabled=xr;this.renderer.autoClear=autoClear;this.renderer.shadowMap.enabled=shadows;
      this.renderer.setRenderTarget(target,face,mip);
      if(!read)this.busy=false;
    }
    const submitted=performance.now();
    try {
      await read;const ready=performance.now();
      const scan:LidarScan={time,beams:BEAMS,columns:this.columns,near:this.near,far:this.far,samples:pixels,format:'FLU_XYZ_PACK24',frame:'FLU'};
      this.timings={submitMs:submitted-started-blockingReadback,waitMs:ready-submitted+blockingReadback,handoffMs:performance.now()-ready,totalMs:performance.now()-started,method:`GPU cube (${this.cubeFaces} faces) + GPU XYZ/validity + raw dense buffer + ${submission?'shared capture batch + ':''}${readbackMode==='sync'?'synchronous readback':'asynchronous WebGL fence'}`,samples:BEAMS*this.columns,faces:this.cubeFaces,drawCalls,triangles,readbackBytes:pixels.byteLength};
      return scan;
    } finally {this.busy=false;}
  }

  dispose() {
    if(this.busy)throw new Error('Wait for LiDAR capture before disposing');
    if(this.disposed)return;
    this.disposed=true;this.readback.dispose();this.cube.dispose();this.target.dispose();this.radial.dispose();this.scanMaterial.dispose();this.quad.geometry.dispose();
  }
}

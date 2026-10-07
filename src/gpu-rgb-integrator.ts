import * as THREE from 'three';

/** Staged sensor pixel integration. All sampling stays on the graphics card. */
export class GpuRgbIntegrator {
  readonly source:THREE.WebGLRenderTarget;
  readonly target:THREE.WebGLRenderTarget;
  private readonly scene=new THREE.Scene();
  private readonly camera=new THREE.Camera();
  private readonly material:THREE.ShaderMaterial;
  private readonly quad:THREE.Mesh;
  private disposed=false;

  constructor(readonly width:number,readonly height:number,readonly factor:2|4){
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1
      ||width>8192||height>8192||![2,4].includes(factor))throw new Error('Invalid RGB integration dimensions/factor');
    const options={type:THREE.UnsignedByteType,colorSpace:THREE.SRGBColorSpace,
      minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false};
    this.source=new THREE.WebGLRenderTarget(width*factor,height*factor,{...options,depthBuffer:true});
    this.target=new THREE.WebGLRenderTarget(width,height,{...options,depthBuffer:false});
    this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
      defines:{INTEGRATION_FACTOR:factor},uniforms:{sourceImage:{value:this.source.texture}},
      vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`
        uniform sampler2D sourceImage;
        void main(){
          ivec2 origin=ivec2(gl_FragCoord.xy)*INTEGRATION_FACTOR;
          vec4 integrated=vec4(0.);
          for(int y=0;y<INTEGRATION_FACTOR;y++){
            for(int x=0;x<INTEGRATION_FACTOR;x++){
              integrated+=texelFetch(sourceImage,origin+ivec2(x,y),0);
            }
          }
          gl_FragColor=integrated/float(INTEGRATION_FACTOR*INTEGRATION_FACTOR);
        }`});
    // sRGB attachments encode on write and decode on texture fetch. Accumulation
    // is linear; no shader-side gamma conversion or second tone map is applied.
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);
    this.quad.frustumCulled=false;this.scene.add(this.quad);
  }

  /** Camera projection remains calibrated to the output image's field of view.
   * Leaves the single-sample output framebuffer bound for immediate PBO reads. */
  submit(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera){
    if(this.disposed)throw new Error('RGB integrator is disposed');
    if(this.source.width>renderer.capabilities.maxTextureSize||this.source.height>renderer.capabilities.maxTextureSize)
      throw new Error('RGB integration exceeds this GPU texture size');
    renderer.setRenderTarget(this.source);renderer.render(scene,camera);this.resolve(renderer);
  }

  /** Also permits independent GPU sampling/color controls without scene geometry. */
  resolve(renderer:THREE.WebGLRenderer){
    if(this.disposed)throw new Error('RGB integrator is disposed');
    renderer.setRenderTarget(this.target);renderer.render(this.scene,this.camera);
  }

  dispose(){
    if(this.disposed)return;
    this.disposed=true;this.source.dispose();this.target.dispose();this.material.dispose();
    this.quad.geometry.dispose();
  }
}

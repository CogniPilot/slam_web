import * as THREE from 'three';

export interface DepthNoiseSettings {
  seed:number;disparityNoisePx:number;referenceFx:number;baselineMeters:number;
  dropoutProbability:number;unitsMeters:number;
}
export function validateDepthNoise(s:DepthNoiseSettings){
  if(!Number.isSafeInteger(s.seed)||![s.disparityNoisePx,s.referenceFx,s.baselineMeters,s.dropoutProbability,s.unitsMeters].every(Number.isFinite)||
    s.disparityNoisePx<0||s.referenceFx<=0||s.baselineMeters<=0||s.dropoutProbability<0||s.dropoutProbability>1||s.unitsMeters<=0)throw Error('Invalid GPU depth noise settings');
}

/** Independent per-pixel sensor noise, keyed by project seed and180Hz sim tick.
 * Changes the old camera/IMU-shared sequential RNG contract deliberately:
 * camera rate/resolution no longer changes the airframe's random stream.
 * The declared hash stream permits GPU parallelism and deterministic replay.
 */
export class GpuDepthNoise {
  readonly target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,colorSpace:THREE.NoColorSpace});
  private geometry=new THREE.PlaneGeometry(2,2);
  private material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,blending:THREE.NoBlending,
    uniforms:{image:{value:null},seed:{value:0},tick:{value:0},noiseScale:{value:0},dropoutProbability:{value:0},unitsMeters:{value:.001}},
    vertexShader:'in vec3 position;void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`precision highp float;precision highp int;
      uniform sampler2D image;uniform uint seed,tick;
      uniform float noiseScale,dropoutProbability,unitsMeters;out vec4 bytes;
      uint hash(uint x){x^=x>>16u;x*=0x7feb352du;x^=x>>15u;x*=0x846ca68bu;return x^(x>>16u);}
      float draw(uint pixel,uint lane){
        uint word=hash(hash(seed^0x9e3779b9u)^hash(tick^0x85ebca6bu)^hash(pixel*3u+lane+1u));
        return (float(word>>9u)+0.5)/8388608.0;
      }
      void main(){
        ivec2 p=ivec2(gl_FragCoord.xy),size=textureSize(image,0);
        uvec4 b=uvec4(floor(texelFetch(image,p,0)*255.0+0.5));
        float z=uintBitsToFloat(b.r|(b.g<<8u)|(b.b<<16u)|(b.a<<24u));
        float measured=0.0;
        uint pixel=uint((size.y-1-p.y)*size.x+p.x);
        if(z>0.0&&!isnan(z)&&!isinf(z)&&draw(pixel,0u)>=dropoutProbability){
          float gaussian=sqrt(-2.0*log(draw(pixel,1u)))*cos(6.283185307179586*draw(pixel,2u));
          float noisy=max(0.0,z+z*z*noiseScale*gaussian);
          float quantized=clamp(floor(noisy/unitsMeters+0.5),0.0,65535.0);
          measured=quantized*unitsMeters;
        }
        uint bits=floatBitsToUint(measured);
        bytes=vec4(bits&255u,(bits>>8u)&255u,(bits>>16u)&255u,bits>>24u)/255.0;
      }`});
  private scene=new THREE.Scene();private camera=new THREE.Camera();
  constructor(){const quad=new THREE.Mesh(this.geometry,this.material);quad.frustumCulled=false;this.scene.add(quad);}
  submit(renderer:THREE.WebGLRenderer,source:THREE.WebGLRenderTarget,settings:DepthNoiseSettings,time:number){
    validateDepthNoise(settings);
    if(!Number.isFinite(time)||time<0)throw Error('GPU depth noise requires nonnegative simulation time');
    this.target.setSize(source.width,source.height);
    const u=this.material.uniforms;u.image.value=source.texture;u.seed.value=settings.seed>>>0;u.tick.value=Math.round(time*180)>>>0;
    u.noiseScale.value=settings.disparityNoisePx/(settings.referenceFx*settings.baselineMeters);
    u.dropoutProbability.value=settings.dropoutProbability;u.unitsMeters.value=settings.unitsMeters;
    renderer.setRenderTarget(this.target);renderer.render(this.scene,this.camera);return this.target;
  }
  dispose(){this.target.dispose();this.geometry.dispose();this.material.dispose();}
}

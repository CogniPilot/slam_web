import * as THREE from 'three';
import type {Calibration,Pose} from './types';

export interface DepthCloud {
  time:number;
  width:number;
  height:number;
  /** Dense GPU FLU xyz/radial-validity samples; alpha is axial depth, zero invalid. */
  samples:Float32Array;
  pose:Pose;
  originFlu:[number,number,number];
}

/** Project packed axial depth on the GPU; the host transfers one dense buffer. */
export class GpuDepthCloud {
  readonly target:THREE.WebGLRenderTarget;
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.Camera();
  private readonly material:THREE.ShaderMaterial;
  private readonly quad:THREE.Mesh;
  constructor(depth:THREE.Texture,calibration:Calibration){
    const c=calibration;
    this.target=new THREE.WebGLRenderTarget(c.width,c.height,{type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false,colorSpace:THREE.NoColorSpace});
    this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
      uniforms:{depth:{value:depth},height:{value:c.height},intrinsics:{value:new THREE.Vector4(c.fx,c.fy,c.cx,c.cy)},nearDepth:{value:c.near},farDepth:{value:c.far}},
      vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`
        uniform sampler2D depth;
        uniform float height,nearDepth,farDepth;
        uniform vec4 intrinsics;
        void main(){
          uvec4 encoded=uvec4(round(texelFetch(depth,ivec2(gl_FragCoord.xy),0)*255.));
          uint bits=encoded.r|(encoded.g<<8u)|(encoded.b<<16u)|(encoded.a<<24u);
          float z=uintBitsToFloat(bits);
          if(!(z>=nearDepth&&z<farDepth)){gl_FragColor=vec4(0.);return;}
          vec2 pixel=vec2(gl_FragCoord.x-.5,height-gl_FragCoord.y-.5);
          vec2 optical=(pixel-intrinsics.zw)*z/intrinsics.xy;
          gl_FragColor=vec4(z,-optical.x,-optical.y,z);
        }`});
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.quad.frustumCulled=false;this.scene.add(this.quad);
  }
  setDepthTexture(depth:THREE.Texture){this.material.uniforms.depth.value=depth;}
  submit(renderer:THREE.WebGLRenderer){renderer.setRenderTarget(this.target);renderer.render(this.scene,this.camera);}
  dispose(){this.target.dispose();this.material.dispose();(this.quad.geometry as THREE.BufferGeometry).dispose();}
}

export function depthCloudMaterial(color?:number){
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    uniforms:{pointColor:{value:color===undefined?new THREE.Color(.32,.76,.93):new THREE.Color(color)}},
    vertexShader:`attribute float returnDepth;varying float valid;void main(){valid=returnDepth;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=2.;}`,
    fragmentShader:`uniform vec3 pointColor;varying float valid;void main(){if(valid<=0.)discard;gl_FragColor=vec4(pointColor,.7);}`});
}

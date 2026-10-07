import * as THREE from 'three';
import type {CameraImageLayout} from './gpu-realsense-packing';

/** Display measured axial depth. The float image stays untouched for estimation;
 * Three.js colors the preview on the GPU without a host pixel conversion. */
export class DepthPreview {
  readonly renderer:THREE.WebGLRenderer;
  private texture?:THREE.DataTexture;
  private width=0;private height=0;
  private scene=new THREE.Scene();
  private camera=new THREE.Camera();
  private geometry=new THREE.PlaneGeometry(2,2);
  private mesh:THREE.Mesh;
  private integerMaterial=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,
    uniforms:{depthImage:{value:null},imageWidth:{value:1},imageHeight:{value:1},far:{value:10},unitsMeters:{value:.001}},
    vertexShader:'in vec3 position;void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`precision highp float;precision highp int;
      uniform highp usampler2D depthImage;uniform int imageWidth,imageHeight;uniform float far,unitsMeters;out vec4 color;
      void main(){ivec2 p=ivec2(gl_FragCoord.xy);uint code=texelFetch(depthImage,ivec2(p.x,imageHeight-1-p.y),0).r;
        float f=clamp(float(code)*unitsMeters/far,0.0,1.0);
        color=vec4(code==0u?vec3(0.0):vec3(1.0-f,(210.0/255.0)*sin(f*3.141592653589793),f),1.0);}`});
  private material=new THREE.ShaderMaterial({
    uniforms:{depthImage:{value:null},far:{value:10}},depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 imageUv; void main(){imageUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`precision highp float;
      uniform sampler2D depthImage; uniform float far; varying vec2 imageUv;
      void main(){
        float z=texture2D(depthImage,vec2(imageUv.x,1.0-imageUv.y)).r;
        float f=clamp(z/far,0.0,1.0);
        vec3 color=vec3(1.0-f,(210.0/255.0)*sin(f*3.141592653589793),f);
        gl_FragColor=vec4(z==0.0?vec3(0.0):color,1.0);
      }`,
  });
  constructor(canvas:HTMLCanvasElement){
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:false,depth:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(1);
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.scene.add(this.mesh);
  }
  draw(depth:Float32Array|Uint16Array,width:number,height:number,far:number,layout?:CameraImageLayout['depth']){
    const integer=depth instanceof Uint16Array,stride=integer?(layout?.strideBytes??0)/2:width;
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(stride)||stride<width||depth.length!==stride*height||!Number.isFinite(far)||far<=0||integer&&(!layout||layout.format!=='Z16'||layout.width!==width||layout.height!==height||layout.isBigEndian||!Number.isFinite(layout.unitsMeters)||layout.unitsMeters<=0))throw Error('Invalid depth preview dimensions/range');
    const material=integer?this.integerMaterial:this.material;this.mesh.material=material;
    if(!this.texture||this.texture.image.width!==stride||this.texture.image.height!==height||this.texture.type!==(integer?THREE.UnsignedShortType:THREE.FloatType)){
      this.texture?.dispose();
      this.texture=new THREE.DataTexture(depth,stride,height,integer?THREE.RedIntegerFormat:THREE.RedFormat,integer?THREE.UnsignedShortType:THREE.FloatType);
      this.texture.minFilter=THREE.NearestFilter;this.texture.magFilter=THREE.NearestFilter;
    }else this.texture.image.data=depth;
    material.uniforms.depthImage.value=this.texture;
    if(this.width!==width||this.height!==height){this.renderer.setSize(width,height,false);this.width=width;this.height=height;}
    if(integer){material.uniforms.imageWidth.value=width;material.uniforms.imageHeight.value=height;material.uniforms.unitsMeters.value=layout!.unitsMeters;}
    this.texture.needsUpdate=true;material.uniforms.far.value=far;
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.texture?.dispose();this.geometry.dispose();this.material.dispose();this.integerMaterial.dispose();this.renderer.dispose();}
}

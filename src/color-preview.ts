import * as THREE from 'three';
import type {CameraImageLayout} from './gpu-realsense-packing';

/** Upload the received byte view unchanged; unpack RGB8 in the display shader.
 * The visible 2D canvas retains its feature/match overlay without JS pixels. */
export class ColorPreview {
  readonly renderer:THREE.WebGLRenderer;
  private texture?:THREE.DataTexture;
  private width=0;private height=0;
  private geometry=new THREE.PlaneGeometry(2,2);
  private scene=new THREE.Scene();private camera=new THREE.Camera();
  private material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,blending:THREE.NoBlending,
    uniforms:{image:{value:null},imageWidth:{value:1},imageHeight:{value:1},channels:{value:3}},
    vertexShader:'in vec3 position;void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`precision highp float;precision highp int;
      uniform sampler2D image;uniform int imageWidth,imageHeight,channels;out vec4 color;
      float byteAt(int offset,int row){return texelFetch(image,ivec2(offset/4,row),0)[offset%4];}
      void main(){
        ivec2 pixel=ivec2(gl_FragCoord.xy);int offset=pixel.x*channels,row=imageHeight-1-pixel.y;
        color=vec4(byteAt(offset,row),byteAt(offset+1,row),byteAt(offset+2,row),channels==4?byteAt(offset+3,row):1.0);
      }`});
  constructor(){
    const canvas=typeof OffscreenCanvas==='undefined'?document.createElement('canvas'):new OffscreenCanvas(1,1);
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,premultipliedAlpha:false,antialias:false,depth:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(1);this.scene.add(new THREE.Mesh(this.geometry,this.material));
  }
  draw(context:CanvasRenderingContext2D,data:Uint8Array,width:number,height:number,layout?:CameraImageLayout['color']){
    const channels=layout?3:4,stride=layout?.strideBytes??width*4;
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(stride)||stride%4||stride<width*channels||data.byteLength!==stride*height||layout&&(layout.format!=='RGB8'||layout.width!==width||layout.height!==height))throw Error('Invalid color preview layout');
    if(!this.texture||this.texture.image.width!==stride/4||this.texture.image.height!==height){
      this.texture?.dispose();this.texture=new THREE.DataTexture(data,stride/4,height,THREE.RGBAFormat,THREE.UnsignedByteType);
      this.texture.minFilter=THREE.NearestFilter;this.texture.magFilter=THREE.NearestFilter;
      this.material.uniforms.image.value=this.texture;
    }else this.texture.image.data=data;
    this.texture.needsUpdate=true;
    this.material.uniforms.imageWidth.value=width;this.material.uniforms.imageHeight.value=height;this.material.uniforms.channels.value=channels;
    if(this.width!==width||this.height!==height){this.renderer.setSize(width,height,false);this.width=width;this.height=height;}
    this.renderer.render(this.scene,this.camera);
    if(context.canvas.width!==width||context.canvas.height!==height){context.canvas.width=width;context.canvas.height=height;}
    context.save();context.globalCompositeOperation='copy';context.drawImage(this.renderer.domElement,0,0);context.restore();
  }
  dispose(){this.texture?.dispose();this.geometry.dispose();this.material.dispose();this.renderer.dispose();}
}

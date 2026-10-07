import * as THREE from 'three';

export type Surface='brick'|'plaster'|'asphalt'|'paving'|'wood'|'grass';
type SurfaceMaps={color:THREE.Texture;normal:THREE.Texture;roughness:THREE.Texture};
const TILE_METRES:Record<Surface,number>={brick:.96,plaster:2,asphalt:3,paving:2,wood:1.2,grass:2};
// Measured tile widths from Poly Haven's asset metadata, not artistic repeats.
const PHOTO_METRES:Record<Surface,number>={brick:3,plaster:2.16,asphalt:3,paving:1.8,wood:2,grass:2.51};
const TEXTURE_SIZE=256;
export type WorldCanvas=HTMLCanvasElement|OffscreenCanvas;
export function createWorldCanvas(width:number,height:number):WorldCanvas {
  if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(width,height);
  if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}
  throw new Error('World materials need Canvas2D or OffscreenCanvas');
}
function canvasContext(canvas:WorldCanvas) {
  const context=canvas.getContext('2d') as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null;
  if(!context)throw new Error('World materials could not create a 2D canvas context');
  return context;
}
export function worldAssetBase(){return typeof document!=='undefined'?document.baseURI:new URL('../',import.meta.url).href;}
const modulo=(x:number,n:number)=>(x%n+n)%n;
function grain(x:number,y:number,seed:number) {
  let value=Math.imul(x+seed*113,374761393)+Math.imul(y+seed*29,668265263);
  value=Math.imul(value^(value>>>13),1274126177);return ((value^(value>>>16))>>>0)/4294967295;
}

// World-owned texture/material caches survive environment rebuilds. Every
// detail setting retains metre-scaled PBR surfaces and the same palette.
export class WorldMaterials {
  private readonly textures=new Map<string,THREE.Texture>();
  private readonly surfaces=new Map<Surface,SurfaceMaps>();
  private readonly materials=new Map<string,THREE.MeshStandardMaterial>();
  private readonly photographic=new Set<Surface>();
  private readonly bitmaps=new Set<ImageBitmap>();
  private readonly photographicSources=new Map<THREE.Texture,ImageBitmap>();
  private disposed=false;
  readonly ready:Promise<void>;
  private normalMaps=true;
  private textureSize=1024;
  constructor(private anisotropy:number,private readonly base=worldAssetBase()) {this.ready=this.loadPhotographic();}
  setQuality(quality:{anisotropy:number;normalMaps:boolean;textureSize:number}){
    const normalsWereEnabled=this.normalMaps;
    this.anisotropy=quality.anisotropy;this.normalMaps=quality.normalMaps;
    this.textureSize=quality.textureSize;
    for(const [texture,source] of this.photographicSources)this.resizePhotographic(texture,source);
    for(const texture of this.textures.values())if(texture.anisotropy!==quality.anisotropy){texture.anisotropy=quality.anisotropy;texture.needsUpdate=true;}
    for(const material of this.materials.values()){
      const kind=material.userData.surfaceKind as Surface|undefined;if(!kind)continue;
      const normal=quality.normalMaps?this.surfaces.get(kind)?.normal??null:null;
      if(material.normalMap!==normal){material.normalMap=normal;material.needsUpdate=true;}
    }
    if(normalsWereEnabled&&!quality.normalMaps){
      // Removing a material binding alone does not free a previously uploaded
      // normal map. Retain its source for High without retaining the GPU copy.
      for(const maps of this.surfaces.values())maps.normal.dispose();
    }
    if(!normalsWereEnabled&&quality.normalMaps){
      for(const maps of this.surfaces.values())maps.normal.needsUpdate=true;
    }
  }
  private resizePhotographic(texture:THREE.Texture,source:ImageBitmap){
    const scale=Math.min(1,this.textureSize/Math.max(source.width,source.height));
    const width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));
    if(texture.image.width===width&&texture.image.height===height)return;
    let image:ImageBitmap|WorldCanvas=source;
    if(scale<1){
      image=createWorldCanvas(width,height);
      const context=canvasContext(image);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
      context.drawImage(source,0,0,width,height);
    }
    // Keep the Texture identity/metric UV transform, but retire the old GPU
    // storage before uploading the resized image at the next render boundary.
    texture.dispose();texture.image=image;texture.needsUpdate=true;
  }
  surface(kind:Surface,color:number) {
    return this.material(`${kind}:${color}`,()=>{
      const maps=this.surfaceMaps(kind);
      const material=new THREE.MeshStandardMaterial({map:maps.color,normalMap:this.normalMaps?maps.normal:null,roughnessMap:maps.roughness,
        color,roughness:kind==='wood'?.91:1,normalScale:new THREE.Vector2(1,1)});
      material.userData.surfaceKind=kind;material.userData.surfaceColor=color;
      if(this.photographic.has(kind))this.applyPhotographic(material,maps);
      material.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
#ifdef USE_MAP
 vec4 metricPoint=vec4(transformed,1.0);
 vec3 metricNormal=objectNormal;
 #ifdef USE_INSTANCING
 metricPoint=instanceMatrix*metricPoint;
 // Inverse transpose is required for nonuniform instance scale. Authored
 // surfaces are axis-aligned boxes with independent width/height/depth.
 mat3 metricInstance=mat3(instanceMatrix);
 metricNormal/=vec3(dot(metricInstance[0],metricInstance[0]),dot(metricInstance[1],metricInstance[1]),dot(metricInstance[2],metricInstance[2]));
 metricNormal=metricInstance*metricNormal;
 #endif
 metricPoint=modelMatrix*metricPoint;
 metricNormal=abs(normalize(mat3(modelMatrix)*metricNormal));
 vec2 metricUv=metricNormal.y>0.5?metricPoint.xz:(metricNormal.x>0.5?metricPoint.zy:metricPoint.xy);
 vMapUv=(mapTransform*vec3(metricUv,1.0)).xy;
 #ifdef USE_NORMALMAP
 vNormalMapUv=(normalMapTransform*vec3(metricUv,1.0)).xy;
 #endif
 #ifdef USE_ROUGHNESSMAP
 vRoughnessMapUv=(roughnessMapTransform*vec3(metricUv,1.0)).xy;
 #endif
 #ifdef USE_AOMAP
 vAoMapUv=(aoMapTransform*vec3(metricUv,1.0)).xy;
 #endif
#endif`);
      };
      material.customProgramCacheKey=()=> 'world-metric-pbr-uv-v3';
      return material;
    });
  }
  solid(color:number,roughness=.7,metalness=0) {
    return this.material(`solid:${color}:${roughness}:${metalness}`,()=>new THREE.MeshStandardMaterial({color,roughness,metalness}));
  }
  sign(label:string,color:number,layout:'wide'|'square'='wide') {
    return this.material(`sign:${label}:${color}:${layout}`,()=>{
      const canvas=createWorldCanvas(layout==='wide'?1024:320,layout==='wide'?100:256);
      const {width,height}=canvas,ctx=canvasContext(canvas);
      ctx.fillStyle=`#${color.toString(16).padStart(6,'0')}`;ctx.fillRect(0,0,width,height);
      ctx.strokeStyle='#eadfc5';ctx.lineWidth=layout==='wide'?3:4;ctx.strokeRect(9,9,width-18,height-18);
      ctx.fillStyle='#fff4d6';ctx.textAlign='center';ctx.textBaseline='middle';
      if(layout==='wide') {
        ctx.font='bold 62px sans-serif';ctx.fillText(label,width/2,height/2+2,width-90);
      } else {
        const split=label.lastIndexOf(' ');ctx.font='bold 36px sans-serif';
        ctx.fillText(label.slice(0,split),width/2,83,width-45);ctx.fillText(label.slice(split+1),width/2,127,width-45);
        ctx.fillStyle='#c8b99a';ctx.fillRect(105,172,110,3);ctx.font='15px sans-serif';ctx.fillText('NEIGHBOURHOOD',width/2,205);
      }
      // Shop fascia and projecting boards have different physical aspect
      // ratios; sharing one atlas used to stretch every letter visibly.
      const texture=this.cacheTexture(`sign:${label}:${color}:${layout}`,canvas,false,true);
      return new THREE.MeshStandardMaterial({map:texture,roughness:.58});
    });
  }
  private material(key:string,create:()=>THREE.MeshStandardMaterial) {
    let result=this.materials.get(key);if(!result){result=create();this.materials.set(key,result);}return result;
  }
  private cacheTexture(key:string,canvas:WorldCanvas,repeat:boolean,srgb:boolean,metres=1) {
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    if(repeat){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1/metres,1/metres);}
    texture.anisotropy=this.anisotropy;this.textures.set(key,texture);return texture;
  }
  private applyPhotographic(material:THREE.MeshStandardMaterial,maps:SurfaceMaps) {
    material.map=maps.color;material.normalMap=this.normalMaps?maps.normal:null;
    // Packed ARM channels are R=ambient occlusion, G=roughness, B=metallic.
    // These natural building surfaces are dielectric, so metallic stays zero.
    material.roughnessMap=maps.roughness;material.aoMap=maps.roughness;
    material.aoMapIntensity=.7;material.roughness=1;material.metalness=0;
    material.color.setHex(material.userData.surfaceColor as number).lerp(new THREE.Color(0xffffff),.8);
    material.needsUpdate=true;
  }
  private async loadPhotographic() {
    const loader=new THREE.ImageBitmapLoader().setOptions({imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'});
    await Promise.all((Object.keys(PHOTO_METRES) as Surface[]).map(async kind=>{
      const textures=await Promise.all(['color','normal','arm'].map(async role=>{
        const bitmap=await loader.loadAsync(new URL(`textures/pbr/${kind}-${role}.jpg`,this.base).href);
        if(this.disposed){bitmap.close();return undefined;}
        this.bitmaps.add(bitmap);
        const texture=new THREE.Texture(bitmap);texture.flipY=false;
        texture.colorSpace=role==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;
        texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.setScalar(1/PHOTO_METRES[kind]);
        texture.anisotropy=this.anisotropy;texture.needsUpdate=true;
        this.photographicSources.set(texture,bitmap);this.resizePhotographic(texture,bitmap);
        this.textures.set(`photo:${kind}:${role}`,texture);return texture;
      }));
      if(this.disposed)return;
      const maps={color:textures[0]!,normal:textures[1]!,roughness:textures[2]!};
      this.surfaces.set(kind,maps);this.photographic.add(kind);
      for(const material of this.materials.values())if(material.userData.surfaceKind===kind)this.applyPhotographic(material,maps);
      for(const role of ['color','normal','roughness']){const key=`${kind}:${role}`;this.textures.get(key)?.dispose();this.textures.delete(key);}
    }));
  }
  private surfaceMaps(kind:Surface) {
    const existing=this.surfaces.get(kind);if(existing)return existing;
    const size=TEXTURE_SIZE,metres=TILE_METRES[kind],height=new Float32Array(size*size);
    const albedo=new Uint8ClampedArray(size*size*4),roughness=new Uint8ClampedArray(size*size*4);
    const seed=['brick','plaster','asphalt','paving','wood','grass'].indexOf(kind)+1;
    // The integer cell identity is periodic, including staggered bricks crossing
    // the texture boundary. Previously those half-bricks used independent colors
    // at each edge, and painting their fill erased their grain.
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const noise=grain(x,y,seed),i=y*size+x;
      let value=.9+(noise-.5)*.05,relief=.00008*(noise-.5),rough=.93;
      if(kind==='brick') {
        const row=Math.floor(y/32),shift=(row%2)*32,column=Math.floor((x+shift)/64)%4;
        const u=modulo(x+shift,64),v=y%32,edge=Math.min(u,64-u,v,32-v);
        const cell=grain(column,row,seed),bevel=Math.max(0,Math.min(1,(edge-1.2)/1.8));
        const brick=.81+(cell-.5)*.18+(noise-.5)*.07;
        value=.67*(1-bevel)+brick*bevel;relief=.0028*bevel+.00016*(noise-.5)*bevel;
        rough=.97*(1-bevel)+(.82+.07*cell)*bevel;
      } else if(kind==='paving') {
        const cell=grain(Math.floor(x/64),Math.floor(y/64),seed),edge=Math.min(x%64,64-x%64,y%64,64-y%64);
        const bevel=Math.max(0,Math.min(1,(edge-.6)/1.2));value=(.69*(1-bevel)+(.88+(cell-.5)*.1)*bevel)+(noise-.5)*.045;
        relief=.0018*bevel+.00009*(noise-.5);rough=.95-.08*cell;
      } else if(kind==='plaster') {
        const mottling=Math.sin(x*Math.PI*2/size)*Math.cos(y*Math.PI*4/size);
        value=.95+.012*mottling+(noise-.5)*.055;relief=.00022*(noise-.5);rough=.88+.08*noise;
      } else if(kind==='wood') {
        const edge=Math.min(x%32,32-x%32),cell=grain(Math.floor(x/32),0,seed);
        const rings=Math.sin(x*Math.PI*2/32+Math.sin(y*Math.PI*2/size)*2);
        value=.79+(cell-.5)*.1+rings*.035+(noise-.5)*.035;
        if(edge<1.2)value*=.64;relief=(edge<1.2?0:.001)+rings*.0001;rough=.76+.13*noise;
      } else if(kind==='asphalt') {
        value=.62+(noise-.5)*.22;relief=.0004*(noise-.5);rough=.88+.1*noise;
      } else {
        value=.79+(noise-.5)*.2;relief=.00035*(noise-.5);rough=.98;
      }
      const brightness=Math.round(Math.max(0,Math.min(1,value))*255),r=Math.round(Math.max(0,Math.min(1,rough))*255);
      albedo.set([brightness,brightness,brightness,255],i*4);roughness.set([r,r,r,255],i*4);height[i]=relief;
    }
    // Derivatives use wrapped neighbours and metres, so mortar relief is the
    // same physical size on a tall facade and a short wall. Y reverses because
    // Canvas rows point down while the sampled OpenGL UV axis points up.
    const normal=new Uint8ClampedArray(size*size*4),scale=size/(2*metres);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const dx=(height[y*size+modulo(x+1,size)]-height[y*size+modulo(x-1,size)])*scale;
      const dy=(height[modulo(y+1,size)*size+x]-height[modulo(y-1,size)*size+x])*scale;
      const length=Math.sqrt(1+dx*dx+dy*dy),i=(y*size+x)*4;
      normal.set([Math.round((1-dx/length)*127.5),Math.round((1+dy/length)*127.5),Math.round((1+1/length)*127.5),255],i);
    }
    const makeCanvas=(bytes:Uint8ClampedArray)=>{
      const canvas=createWorldCanvas(size,size),ctx=canvasContext(canvas);
      const pixels=ctx.createImageData(size,size);pixels.data.set(bytes);ctx.putImageData(pixels,0,0);return canvas;
    };
    const result={color:this.cacheTexture(`${kind}:color`,makeCanvas(albedo),true,true,metres),
      normal:this.cacheTexture(`${kind}:normal`,makeCanvas(normal),true,false,metres),
      roughness:this.cacheTexture(`${kind}:roughness`,makeCanvas(roughness),true,false,metres)};
    this.surfaces.set(kind,result);return result;
  }
  dispose(){this.disposed=true;for(const material of this.materials.values())material.dispose();for(const texture of this.textures.values())texture.dispose();for(const bitmap of this.bitmaps)bitmap.close();this.materials.clear();this.textures.clear();this.surfaces.clear();this.photographic.clear();this.bitmaps.clear();this.photographicSources.clear();}
}

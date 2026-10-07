import * as THREE from 'three';
import {Sky} from 'three/addons/objects/Sky.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {worldAssetBase} from './world-materials';
import {GRAPHICS_QUALITY} from './graphics-quality';
import type {SceneDetail} from './types';

export type DaylightMode='day'|'night'|'cycle';
export type LightingOptions={base?:string;shadows?:boolean};
export type DaylightState={phase:number;sun:THREE.Vector3;moon:THREE.Vector3;day:number;night:number};
const smooth=(low:number,high:number,x:number)=>{const t=THREE.MathUtils.clamp((x-low)/(high-low),0,1);return t*t*(3-2*t);};
export function daylightState(phase:number):DaylightState {
  if(!Number.isFinite(phase))throw new Error('Daylight phase must be finite');
  phase=((phase%1)+1)%1;
  const hour=phase*Math.PI*2,altitude=Math.sin(hour-Math.PI/2)*.9,azimuth=hour+.7;
  const horizontal=Math.sqrt(1-altitude*altitude);
  const sun=new THREE.Vector3(Math.cos(azimuth)*horizontal,altitude,Math.sin(azimuth)*horizontal);
  return {phase,sun,moon:sun.clone().negate(),day:smooth(-.08,.2,altitude),night:1-smooth(-.12,.05,altitude)};
}

// One atmospheric sky draw combines daylight, thin clouds, stars and the moon.
// It remains visible in RGB, but must be hidden for axial depth and lidar passes.
const atmosphere=`
uniform float nightAmount;
uniform float cloudTime;
uniform float cloudOctaves;
uniform vec3 moonDirection;
float skyHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float skyNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(skyHash(i),skyHash(i+vec2(1,0)),f.x),mix(skyHash(i+vec2(0,1)),skyHash(i+vec2(1,1)),f.x),f.y);
}
float cloudNoise(vec2 p){
 float value=.56*skyNoise(p),weight=.56;
 if(cloudOctaves>1.5){value+=.29*skyNoise(p*2.03+13.1);weight+=.29;}
 if(cloudOctaves>2.5){value+=.15*skyNoise(p*4.01-7.3);weight+=.15;}
 return value/weight;
}
vec3 atmosphericDetails(vec3 color,vec3 direction){
 float upper=smoothstep(-.015,.12,direction.y);
 vec3 nightColor=mix(vec3(.009,.013,.026),vec3(.0015,.003,.011),smoothstep(0.0,.8,direction.y));
 color=mix(color,nightColor,nightAmount);
 // Night details cannot contribute during daylight. The uniform branch skips
 // angular coordinates and lunar noise for every fragment in that case.
 if(nightAmount>0.0){
 // Fixed angular star cells avoid frame-dependent flicker or wall-clock motion.
 vec2 stars=vec2(atan(direction.z,direction.x),asin(clamp(direction.y,-1.0,1.0)))*vec2(240.0,260.0);
 vec2 cell=floor(stars),local=fract(stars)-vec2(skyHash(cell+8.1),skyHash(cell+37.9));
 float star=(1.0-smoothstep(.012,.065,length(local)))*step(.986,skyHash(cell));
 color+=vec3(.68,.78,1.0)*star*nightAmount*upper;
 // The moon subtends about half a degree, with a softly resolved limb.
 float moon= smoothstep(cos(.0047),cos(.0042),dot(direction,moonDirection));
 vec3 axis=normalize(cross(moonDirection,vec3(0,1,0)));
 vec2 moonUv=vec2(dot(direction,axis),dot(direction,cross(axis,moonDirection)))/.0045;
 float lunar=.6+.3*skyNoise(moonUv*9.0)+.1*skyNoise(moonUv*27.0);
 color+=vec3(.9,.94,1.0)*lunar*moon*nightAmount*upper*2.0;
 }
 // A horizon-plane projection produces clouds with perspective, rather than
 // a screen overlay. Only simulation time advances this bounded shader field.
 vec2 cloudUv=direction.xz/max(.11,direction.y)*1.55+vec2(cloudTime*.004,cloudTime*.0015);
 float density=smoothstep(.52,.76,cloudNoise(cloudUv));
 density*=smoothstep(.025,.18,direction.y)*.67;
 vec3 cloudColor=mix(vec3(.84,.87,.89),vec3(.013,.019,.034),nightAmount);
 color=mix(color,cloudColor,density);
 return color;
}
`;

export class WorldLighting {
  readonly celestialGroup=new THREE.Group();
  readonly sun=new THREE.DirectionalLight(0xfff1dd,3.1);
  readonly moon=new THREE.DirectionalLight(0xb3caff,.12);
  readonly hemisphere=new THREE.HemisphereLight(0xc6dce8,0x645b4d,.3);
  readonly sky=new Sky();
  readonly ready:Promise<void>;
  private environmentTarget?:THREE.WebGLRenderTarget;
  private state=daylightState(.43);
  private disposed=false;
  constructor(private readonly renderer:THREE.WebGLRenderer,private readonly scene:THREE.Scene,options:LightingOptions={}) {
    this.celestialGroup.name='atmosphere (RGB background only)';
    this.celestialGroup.userData.excludeFromDepth=true;this.celestialGroup.userData.excludeFromLidar=true;
    this.sky.scale.setScalar(1000);this.sky.frustumCulled=false;this.sky.renderOrder=-1000;
    const uniforms=this.sky.material.uniforms;
    uniforms.turbidity.value=2.5;uniforms.rayleigh.value=2.1;uniforms.mieCoefficient.value=.004;uniforms.mieDirectionalG.value=.82;
    uniforms.nightAmount={value:0};uniforms.cloudTime={value:0};uniforms.moonDirection={value:new THREE.Vector3()};
    uniforms.cloudOctaves={value:GRAPHICS_QUALITY.high.cloudOctaves};
    this.sky.material.fragmentShader=this.sky.material.fragmentShader.replace('void main() {',atmosphere+'\nvoid main() {')
      .replace('gl_FragColor = vec4( retColor, 1.0 );','gl_FragColor = vec4( atmosphericDetails(retColor, direction), 1.0 );');
    this.celestialGroup.add(this.sky);this.scene.add(this.celestialGroup,this.sun,this.sun.target,this.moon,this.moon.target,this.hemisphere);
    this.sun.target.position.set(5,0,0);this.moon.target.position.copy(this.sun.target.position);
    if(options.shadows??true){
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate=false;
      this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);
      Object.assign(this.sun.shadow.camera,{left:-27,right:27,top:22,bottom:-22,near:1,far:150});
      this.sun.shadow.camera.updateProjectionMatrix();this.sun.shadow.bias=-.00015;this.sun.shadow.normalBias=.025;
    }
    this.setDaylight(.43);
    this.ready=this.loadEnvironment(options.base??worldAssetBase());
  }
  setDaylight(phase:number,simulationTimeSeconds=0) {
    if(!Number.isFinite(simulationTimeSeconds))throw new Error('Atmosphere requires finite simulation time');
    const next=daylightState(phase),changed=Math.abs(next.phase-this.state.phase)>1e-7;
    this.state=next;
    this.sky.material.uniforms.sunPosition.value.copy(next.sun).multiplyScalar(450000);
    this.sky.material.uniforms.moonDirection.value.copy(next.moon);
    this.sky.material.uniforms.nightAmount.value=next.night;
    this.sky.material.uniforms.cloudTime.value=simulationTimeSeconds;
    this.sun.position.copy(next.sun).multiplyScalar(70).add(this.sun.target.position);
    this.moon.position.copy(next.moon).multiplyScalar(70).add(this.moon.target.position);
    const direct=smooth(0,.18,next.sun.y);
    this.sun.intensity=3.1*direct;
    this.sun.color.setRGB(1,.74+.2*direct,.5+.37*direct);
    this.moon.intensity=.13*next.night;
    this.hemisphere.intensity=.045+.255*next.day;
    this.hemisphere.color.setHex(next.night>.5?0x536c9b:0xc6dce8);
    this.scene.environmentIntensity=.025+.8*next.day;
    this.renderer.toneMappingExposure=.9+.25*next.night;
    if(this.scene.fog)this.scene.fog.color.setHex(0xa9c5d3).lerp(new THREE.Color(0x07101e),next.night);
    if(changed)this.invalidateShadows();
    return next;
  }
  setMode(mode:DaylightMode,simulationTimeSeconds=0,cycleSeconds=240) {
    if(!Number.isFinite(cycleSeconds)||cycleSeconds<=0)throw new Error('Day/night cycle duration must be positive');
    if(!['day','night','cycle'].includes(mode))throw new Error('Unknown daylight mode');
    return this.setDaylight(mode==='day'?.43:mode==='night'?.02:.43+simulationTimeSeconds/cycleSeconds,simulationTimeSeconds);
  }
  invalidateShadows(){if(this.sun.castShadow)this.renderer.shadowMap.needsUpdate=true;}
  setQuality(detail:SceneDetail){
    const quality=GRAPHICS_QUALITY[detail];
    this.sky.material.uniforms.cloudOctaves.value=quality.cloudOctaves;
    this.renderer.shadowMap.enabled=quality.shadows;this.sun.castShadow=quality.shadows;
    if(!quality.shadows||this.sun.shadow.mapSize.x!==quality.shadowSize){
      this.sun.shadow.map?.dispose();this.sun.shadow.map=null;
      this.sun.shadow.mapPass?.dispose();this.sun.shadow.mapPass=null;
      this.sun.shadow.mapSize.set(quality.shadowSize,quality.shadowSize);
    }
    this.invalidateShadows();
  }
  private async loadEnvironment(base:string) {
    const source=await new HDRLoader().loadAsync(new URL('textures/pbr/daylight-1k.hdr',base).href);
    if(this.disposed){source.dispose();return;}
    source.mapping=THREE.EquirectangularReflectionMapping;
    const generator=new THREE.PMREMGenerator(this.renderer);
    try{this.environmentTarget=generator.fromEquirectangular(source);this.scene.environment=this.environmentTarget.texture;}
    finally{source.dispose();generator.dispose();}
  }
  dispose(){
    this.disposed=true;
    if(this.scene.environment===this.environmentTarget?.texture)this.scene.environment=null;
    this.environmentTarget?.dispose();this.sky.geometry.dispose();this.sky.material.dispose();this.sun.shadow.dispose();
    this.scene.remove(this.celestialGroup,this.sun,this.sun.target,this.moon,this.moon.target,this.hemisphere);
  }
}

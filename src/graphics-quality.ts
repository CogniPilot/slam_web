import type {SceneDetail} from './types';

/** Presentation/detail budgets. Sensor rates and Modelica stepping are fixed. */
export const GRAPHICS_QUALITY={
  low:{pixelRatio:.75,shadows:false,shadowSize:512,anisotropy:1,normalMaps:false,textureSize:256,cloudOctaves:1},
  medium:{pixelRatio:1,shadows:true,shadowSize:512,anisotropy:2,normalMaps:true,textureSize:512,cloudOctaves:2},
  high:{pixelRatio:2,shadows:true,shadowSize:1024,anisotropy:4,normalMaps:true,textureSize:1024,cloudOctaves:3},
} as const;
export const GRAPHICS_DESCRIPTIONS:Record<SceneDetail,string>={
  low:'Reduced resolution and decoration · no shadows or normal maps · simple clouds',
  medium:'Balanced detail · 512 px shadows · normal maps · layered clouds',
  high:'Full detail · 1024 px shadows · normal maps · detailed clouds',
};
export function graphicsQuality(detail:SceneDetail,deviceRatio:number,maxAnisotropy:number){
  const budget=GRAPHICS_QUALITY[detail];
  return {...budget,pixelRatio:Math.min(deviceRatio,budget.pixelRatio),anisotropy:Math.min(maxAnisotropy,budget.anisotropy)};
}

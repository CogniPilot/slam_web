type Point=[number,number,number];
export const SCENE_CAMERAS:Partial<Record<string,{eye:Point;target:Point}>>={
  city:{eye:[-23,-3.8,5.2],target:[5,0,4.1]},
  tokyo:{eye:[-10,-29,20],target:[16,0,5]},
  'asset-city':{eye:[-10,-2.7,9],target:[8,0,3]},
  'big-city':{eye:[-28,-37,32],target:[18,0,5]},
};
export const TRAINING_ROOF={minimum:[35.8,-5.2,0],maximum:[48.2,5.2,3.8]};
export const INTERIOR_CAMERAS={
  store:{eye:[18.4,9.4,1.8],target:[21.5,14.2,1.4]},
  apartment:{eye:[34,-10.5,1.8],target:[30,-11.4,1.1]},
  conference:{eye:[43.7,9.9,1.8],target:[48,15,1.2]},
} satisfies Record<string,{eye:Point;target:Point}>;

export interface BigCityInterior {
  id:keyof typeof INTERIOR_CAMERAS;label:string;
  roofVolume:{minimum:Point;maximum:Point};
  entrance:{outside:Point;inside:Point;clearWidth:number;clearHeight:number};
  circulation:Point[];
}
export const BIG_CITY_INTERIORS:readonly BigCityInterior[]=[
  {id:'store',label:'Corner Market',roofVolume:{minimum:[13.9,6.9,0],maximum:[26.1,17.1,3.8]},
    entrance:{outside:[20,4,1.5],inside:[20,9,1.5],clearWidth:3,clearHeight:2.8},
    circulation:[[20,9,1.5],[20,15.8,1.5],[18.4,15.8,1.5]]},
  {id:'apartment',label:'Daylight Loft',roofVolume:{minimum:[27.9,-17.1,0],maximum:[40.1,-6.9,6.8]},
    entrance:{outside:[34,-4,1.5],inside:[34,-9,1.5],clearWidth:3,clearHeight:2.8},
    circulation:[[34,-9,1.5],[34,-11.3,1.5],[38.1,-11.3,1.5],[34,-11.3,1.5],[34,-11.3,4.2],[38.1,-11.3,4.2]]},
  {id:'conference',label:'Civic Workspace',roofVolume:{minimum:[40.9,7.9,0],maximum:[55.1,20.1,3.9]},
    entrance:{outside:[48,5,1.5],inside:[48,9.7,1.5],clearWidth:3,clearHeight:2.8},
    circulation:[[48,9.7,1.5],[43.7,9.7,1.5],[43.7,18.7,1.5],[48,18.7,1.5]]},
];

export function sceneLandmarks(environment:string){
  const landmarks=environment==='big-city'?BIG_CITY_INTERIORS.map(room=>({...room,camera:INTERIOR_CAMERAS[room.id]})):
    ['city','asset-city'].includes(environment)?[{id:'training-building',label:'GPS / SLAM training building',roofVolume:TRAINING_ROOF,entrance:{outside:[34,0,1.5],inside:[38,0,1.5],clearWidth:3,clearHeight:2.8},circulation:[[38,0,1.5],[46,0,1.5]]}]:[];
  return {environment,frame:'World ENU, meters: x east, y north, z up. Three.js uses [x,z,-y].',overview:SCENE_CAMERAS[environment]??null,landmarks,
    availableEnvironments:['city','warehouse','courtyard','tokyo','asset-city','big-city'],
    notes:'Camera poses are inspection views, not drone poses. Circulation points are authored aisle references, not collision-checked routes. Write starting pose and trajectory in Modelica; preserve controller and motor dynamics. The store, loft and conference room exist only in big-city. Collision support is not implemented.'};
}

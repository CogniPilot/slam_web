import {describe,expect,it} from 'vitest';
import {BIG_CITY_INTERIORS,INTERIOR_CAMERAS,sceneLandmarks} from '../src/scene-landmarks';

describe('agent map coordinates',()=>{
  it('shares room camera coordinates and authored bounds with the viewer',()=>{
    const result=sceneLandmarks('big-city');expect(result.frame).toContain('ENU');
    for(const room of BIG_CITY_INTERIORS){
      expect(result.landmarks.find(item=>item.id===room.id)).toMatchObject({...room,camera:INTERIOR_CAMERAS[room.id]});
      for(const point of [room.entrance.inside,...room.circulation])point.forEach((value,axis)=>{expect(value).toBeGreaterThan(room.roofVolume.minimum[axis]);expect(value).toBeLessThan(room.roofVolume.maximum[axis]);});
    }
  });
  it('does not invent a store in maps without an enterable store',()=>{
    for(const environment of ['city','warehouse','courtyard','tokyo','asset-city'])expect(sceneLandmarks(environment).landmarks.some(room=>room.id==='store')).toBe(false);
  });
});

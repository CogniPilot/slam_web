import type {Scene} from 'three';

/** Render multiple views of one committed pose without repeating the full
 * scene transform traversal. Animation must be applied before entering this
 * synchronous scope; render state is restored before any GPU fence is awaited.
 */
export function withCommittedScene<T>(scene:Scene,render:()=>T):T {
  const automatic=scene.matrixWorldAutoUpdate;
  if(automatic)scene.updateMatrixWorld();
  scene.matrixWorldAutoUpdate=false;
  try{return render();}finally{scene.matrixWorldAutoUpdate=automatic;}
}

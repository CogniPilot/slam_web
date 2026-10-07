/// <reference lib="webworker" />
import {World} from './world';
import {PerformanceCounters,RenderDeadline} from './performance-monitor';
import {ViewerCloudRetention} from './viewer-cloud-transfer';
import {isDepthCloudRaster} from './depth-cloud-raster';
let world:World,visible=true,running=false,hasUncertainty=false,queue=Promise.resolve();
const deadline=new RenderDeadline(30),counters=new PerformanceCounters(30,performance.now());
let lastReport=performance.now();
const clouds=new ViewerCloudRetention();
function tick(now:number){
  if(world&&visible&&deadline.due(now)){
    const start=performance.now();world.render(running);counters.rendered(performance.now(),performance.now()-start);
  }
  if(visible&&now-lastReport>=1000){self.postMessage({type:'performance',snapshot:counters.take(now)});lastReport=now;}
  requestAnimationFrame(tick);
}
async function execute(data:any){
  switch(data.type){
    case 'init':world=new World({canvas:data.canvas,width:data.width,height:data.height,pixelRatio:data.pixelRatio,base:data.base});await world.ready;requestAnimationFrame(tick);return {graphics:world.graphics};
    case 'configure':world.build(data.environment,data.detail,!!data.preservePresentation);await world.ready;world.actors.setEnabled(data.carsEnabled,data.peopleEnabled);return {};
    case 'present':world.render(running);return {};
    case 'resize':world.renderer.setSize(data.width,data.height,false);world.view.aspect=data.width/data.height;world.view.updateProjectionMatrix();break;
    case 'camera':world.view.position.fromArray(data.position);world.view.quaternion.fromArray(data.quaternion);break;
    case 'pose':world.update(data.truth);break;
    case 'running':running=data.running;break;
    case 'visibility':visible=data.visible;deadline.reset();counters.reset(performance.now());lastReport=performance.now();break;
    case 'actors':world.actors.setEnabled(data.cars,data.people);break;
    case 'actor-motion':world.setActorMotion(data.frame);break;
    case 'lighting':world.setLighting(data.mode);break;
    case 'sensor-clouds':
      if(data.cloud){if(isDepthCloudRaster(data.cloud))world.setDepthRaster(data.cloud);else world.setDepthCloud(data.cloud);}
      if(data.lidar){
        world.setLidarScan(data.lidar.scan);
        // Placement was captured with this scan, independently of any newer
        // interpolated viewer pose. It is presentation data, never SLAM input.
        world.lidarView.position.fromArray(data.lidar.placement.position);
        world.lidarView.quaternion.fromArray(data.lidar.placement.quaternion);
      }
      return {released:clouds.replace(data.cloud?.samples.buffer,data.lidar?.scan.samples.buffer)};
    case 'depth-cloud-enabled':world.setDepthCloudEnabled(data.enabled);break;
    case 'flags':world.covariance.visible=data.uncertainty&&hasUncertainty;for(const object of [world.graphEdges,world.loopEdges,world.keyframes])object.visible=data.graph;world.showMap(data.showMap);world.trajectories.visible=data.showPaths;break;
    case 'diagnostics':hasUncertainty=!!data.estimate.uncertainty;if(data.map)world.setMapBuffer(data.map,data.origin);else world.setMapOrigin(data.origin);world.setEstimate(data.estimate);world.covariance.visible=data.uncertainty&&!!data.estimate.uncertainty;for(const object of [world.graphEdges,world.loopEdges,world.keyframes])object.visible=data.graph;world.showMap(data.showMap);world.trajectories.visible=data.showPaths;world.setTrajectoryBuffers(data.trajectories);break;
    case 'scene-visible':world.setEnvironmentVisible(data.visible);break;
  }
}
self.onmessage=({data})=>{
  queue=queue.then(async()=>{try{const result=await execute(data);if(data.id!==undefined)self.postMessage({id:data.id,result},{transfer:result&&'released' in result?result.released??[]:[]});}catch(error){self.postMessage({id:data.id,error:String(error)});}});
};

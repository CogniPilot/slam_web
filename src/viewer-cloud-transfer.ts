import {isDepthCloudRaster,type DepthCloudDisplay} from './depth-cloud-raster';
import type {LidarScan} from './lidar';

export interface CloudPlacement {position:number[];quaternion:number[]}
export interface ViewerCloudBatch {
  buffer:ArrayBuffer;
  cloud?:DepthCloudDisplay;
  lidar?:{scan:LidarScan;placement:CloudPlacement};
}

/** Latest-only presentation mailbox. Sensor/estimator storage is never
 * transferred: byte copies enter a bounded pool owned by the viewer protocol. */
export class ViewerCloudTransfer {
  private pendingCloud?:DepthCloudDisplay;
  private pendingLidar?:ViewerCloudBatch['lidar'];
  private previousCloud?:DepthCloudDisplay;
  private previousLidar?:LidarScan;
  private free:ArrayBuffer[]=[];
  private busy=false;
  private totals={batches:0,clouds:0,lidarScans:0,copiedBytes:0,allocations:0,reuses:0};

  get stats(){return {...this.totals,inFlight:this.busy,freeBuffers:this.free.length,freeBytes:this.free.reduce((sum,b)=>sum+b.byteLength,0)};}
  cloud(cloud:DepthCloudDisplay){if(cloud!==this.previousCloud&&cloud!==this.pendingCloud)this.pendingCloud=cloud;}
  lidar(scan:LidarScan,placement:()=>CloudPlacement){
    if(scan!==this.previousLidar&&scan!==this.pendingLidar?.scan)this.pendingLidar={scan,placement:placement()};
  }
  clearCloud(){this.pendingCloud=undefined;this.previousCloud=undefined;}
  reset(){this.clearCloud();this.pendingLidar=undefined;this.previousLidar=undefined;}

  take():ViewerCloudBatch|undefined{
    if(this.busy||(!this.pendingCloud&&!this.pendingLidar))return;
    const cloud=this.pendingCloud,lidar=this.pendingLidar;
    const cloudBytes=cloud?.samples.byteLength??0,lidarBytes=lidar?.scan.samples.byteLength??0;
    const lidarOffset=lidar?Math.ceil(cloudBytes/4)*4:cloudBytes,size=lidarOffset+lidarBytes;
    const index=this.free.findIndex(buffer=>buffer.byteLength===size);
    const buffer=index<0?new ArrayBuffer(size):this.free.splice(index,1)[0],bytes=new Uint8Array(buffer);
    if(index<0)this.totals.allocations++;else this.totals.reuses++;
    const copy=(source:Float32Array|Uint16Array,offset:number)=>bytes.set(new Uint8Array(source.buffer,source.byteOffset,source.byteLength),offset);
    if(cloud&&lidar&&cloudBytes===lidarOffset&&cloud.samples.buffer===lidar.scan.samples.buffer&&cloud.samples.byteOffset+cloudBytes===lidar.scan.samples.byteOffset){
      bytes.set(new Uint8Array(cloud.samples.buffer,cloud.samples.byteOffset,size));
    }else{if(cloud)copy(cloud.samples,0);if(lidar)copy(lidar.scan.samples,lidarOffset);}
    bytes.fill(0,cloudBytes,lidarOffset);
    this.busy=true;this.pendingCloud=undefined;this.pendingLidar=undefined;
    this.totals.batches++;this.totals.copiedBytes+=size;
    if(cloud){this.previousCloud=cloud;this.totals.clouds++;}
    if(lidar){this.previousLidar=lidar.scan;this.totals.lidarScans++;}
    const copiedCloud=cloud?(isDepthCloudRaster(cloud)?{...cloud,samples:new Uint16Array(buffer,0,cloudBytes/2)}:{...cloud,samples:new Float32Array(buffer,0,cloudBytes/4)}):undefined;
    return {buffer,...(copiedCloud?{cloud:copiedCloud}:{}),
      ...(lidar?{lidar:{...lidar,scan:{...lidar.scan,samples:new Float32Array(buffer,lidarOffset,lidarBytes/4)}}}:{})};
  }

  complete(released:ArrayBuffer[]=[]){
    if(!this.busy)throw Error('No viewer cloud batch is in flight');
    this.busy=false;
    // Two camera buffers plus one combined buffer can retire at a LiDAR tick.
    // Retain that bounded set so unequal rates do not evict/reallocate it.
    for(const buffer of released)if(buffer.byteLength&&!this.free.includes(buffer)){
      this.free.push(buffer);if(this.free.length>3)this.free.shift();
    }
  }
}

/** A combined buffer cannot return while either displayed stream still uses
 * it. Call only after replacing the corresponding geometry/array references. */
export class ViewerCloudRetention {
  private cloud?:ArrayBuffer;
  private lidar?:ArrayBuffer;
  replace(cloud?:ArrayBuffer,lidar?:ArrayBuffer){
    const previous=new Set([this.cloud,this.lidar]);
    if(cloud)this.cloud=cloud;if(lidar)this.lidar=lidar;
    return [...previous].filter((buffer):buffer is ArrayBuffer=>!!buffer&&buffer!==this.cloud&&buffer!==this.lidar);
  }
}

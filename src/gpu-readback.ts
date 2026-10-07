/** Borrowed submission into one capture's GPU batch. Completion owns the wait;
 * callers must restore render state before awaiting it. No frame is pipelined. */
export interface GpuReadSubmission {
  read(width:number,height:number,bytes:Uint8Array|Float32Array):void;
  completed:Promise<void>;
}
type ReadBuffer={buffer:WebGLBuffer;size:number};
type PackedBatch={entry:ReadBuffer;used:number;destinations:{offset:number;size:number;bytes:Uint8Array|Float32Array}[];destination?:Uint8Array;capacity:number};

/** RGBA8 and RGBA32F render-target reads without Three's fixed four millisecond
 * initial fence delay. Submissions read the currently bound framebuffer.
 * Buffers are pooled; fence checks yield to the event loop and back off rather
 * than spinning while the GPU works. No scene or framebuffer state is retained.
 */
export class GpuReadback {
  private free:{buffer:WebGLBuffer;size:number}[]=[];
  private packedStaging=new Map<number,Uint8Array>();
  private pending=new Set<Promise<void>>();
  private disposed=false;
  constructor(private readonly gl:WebGL2RenderingContext){}
  private buffer(size:number){
    // Mixed RGB8/depth32 batches must retain their own allocation sizes.
    // LIFO reuse otherwise reallocates two differently sized PBOs every frame.
    const index=this.free.findIndex(entry=>entry.size===size);
    return index>=0?this.free.splice(index,1)[0]:this.free.pop()??{buffer:this.gl.createBuffer()!,size:0};
  }

  private submitPacked(capacity:number,submit:(read:GpuReadSubmission['read'])=>void,destination?:Uint8Array):PackedBatch{
    if(this.disposed)throw new Error('GPU readback is disposed');
    if(!Number.isSafeInteger(capacity)||capacity<4||capacity%4)throw new Error('Invalid packed readback capacity');
    if(destination&&(!(destination instanceof Uint8Array)||destination.byteLength!==capacity))throw new Error('Packed readback destination must cover its exact capacity');
    const gl=this.gl,previous=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer|null,entry=this.buffer(capacity);
    if(!entry.buffer)throw new Error('Cannot allocate GPU readback buffer');
    const destinations:PackedBatch['destinations']=[];let used=0;
    try{
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER,entry.buffer);
      if(entry.size!==capacity){gl.bufferData(gl.PIXEL_PACK_BUFFER,capacity,gl.STREAM_READ);entry.size=capacity;}
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previous);
      submit((width,height,bytes)=>{
        const floating=bytes instanceof Float32Array;
        if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||bytes.byteLength!==width*height*4*(floating?4:1))throw new Error('RGBA readback size mismatch');
        if(used+bytes.byteLength>capacity)throw new Error('Packed readback capacity exceeded');
        const offset=used;used+=bytes.byteLength;destinations.push({offset,size:bytes.byteLength,bytes});
        if(destination&&(bytes.buffer!==destination.buffer||bytes.byteOffset!==destination.byteOffset+offset))throw new Error('Direct readback views must match their packed destination');
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER,entry.buffer);
        try{gl.readPixels(0,0,width,height,gl.RGBA,floating?gl.FLOAT:gl.UNSIGNED_BYTE,offset);}
        finally{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previous);}
      });
      if(!destinations.length)throw new Error('GPU readback batch is empty');
      return {entry,used,destinations,destination,capacity};
    }catch(error){gl.deleteBuffer(entry.buffer);throw error;}
    finally{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previous);}
  }

  private copyPacked({entry,used,destinations,destination,capacity}:PackedBatch){
    // A WASM memory grow detaches old views. Refuse before writing anything;
    // the owner must keep its input window stable until capture completes.
    if((destination&&destination.byteLength!==capacity)||destinations.some(({bytes,size})=>bytes.byteLength!==size))throw new Error('GPU readback destination changed while waiting');
    let staging=destination?.subarray(0,used)??this.packedStaging.get(used);
    if(!staging){staging=new Uint8Array(used);this.packedStaging.set(used,staging);}
    const gl=this.gl;gl.bindBuffer(gl.PIXEL_PACK_BUFFER,entry.buffer);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,staging);
    if(!destination)for(const {offset,size,bytes} of destinations)new Uint8Array(bytes.buffer,bytes.byteOffset,size).set(staging.subarray(offset,offset+size));
  }

  /** One PBO and one browser/GPU transport copy; scatter preserves raw bits. */
  readBatchPackedSync(capacity:number,submit:((read:GpuReadSubmission['read'])=>void),destination?:Uint8Array):number{
    const batch=this.submitPacked(capacity,submit,destination),gl=this.gl;
    const previous=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer|null,started=performance.now();
    try{this.copyPacked(batch);this.free.push(batch.entry);return performance.now()-started;}
    catch(error){gl.deleteBuffer(batch.entry.buffer);throw error;}
    finally{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previous);}
  }

  /** Submit every attachment now, then yield until one fence signals before
   * performing one packed copy. This Promise is the capture's lockstep barrier. */
  readBatchPacked(capacity:number,submit:((read:GpuReadSubmission['read'])=>void),destination?:Uint8Array):Promise<void>{
    const batch=this.submitPacked(capacity,submit,destination);
    return this.completeBatch([batch.entry],()=>this.copyPacked(batch));
  }

  /** Queue every attachment before blocking on the last PBO. Its completion
   * orders all preceding reads, so earlier buffers can then be copied without
   * serializing a CPU/GPU round trip between each scene render. */
  readBatchSync(submit:(read:(width:number,height:number,bytes:Uint8Array|Float32Array)=>void)=>void):number{
    if(this.disposed)throw new Error('GPU readback is disposed');
    const gl=this.gl,previous=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer|null;
    const entries:{buffer:WebGLBuffer;size:number;bytes:Uint8Array|Float32Array}[]=[];
    try{
      submit((width,height,bytes)=>{
        const floating=bytes instanceof Float32Array;
        if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||bytes.byteLength!==width*height*4*(floating?4:1))throw new Error('RGBA readback size mismatch');
        const entry=this.buffer(bytes.byteLength);
        if(!entry.buffer)throw new Error('Cannot allocate GPU readback buffer');
        entries.push({...entry,bytes});
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER,entry.buffer);
        if(entry.size!==bytes.byteLength){gl.bufferData(gl.PIXEL_PACK_BUFFER,bytes.byteLength,gl.STREAM_READ);entries.at(-1)!.size=bytes.byteLength;}
        try{gl.readPixels(0,0,width,height,gl.RGBA,floating?gl.FLOAT:gl.UNSIGNED_BYTE,0);}
        finally{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previous);}
      });
      if(!entries.length)throw new Error('GPU readback batch is empty');
      const started=performance.now();
      for(let index=entries.length-1;index>=0;index--){
        const entry=entries[index];gl.bindBuffer(gl.PIXEL_PACK_BUFFER,entry.buffer);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,entry.bytes);
      }
      const readback=performance.now()-started;
      for(const {buffer,size} of entries)this.free.push({buffer,size});
      return readback;
    }catch(error){for(const entry of entries)gl.deleteBuffer(entry.buffer);throw error;}
    finally{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previous);}
  }

  /** Read a currently bound, known RGBA8/RGBA32F attachment without querying
   * its format from the driver. Preserve external pixel-pack-buffer state. */
  readSync<T extends Uint8Array|Float32Array>(width:number,height:number,bytes:T):T{
    if(this.disposed)throw new Error('GPU readback is disposed');
    const gl=this.gl,floating=bytes instanceof Float32Array;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||bytes.byteLength!==width*height*4*(floating?4:1))throw new Error('RGBA readback size mismatch');
    const previous=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer|null;
    try{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.readPixels(0,0,width,height,gl.RGBA,floating?gl.FLOAT:gl.UNSIGNED_BYTE,bytes);}
    finally{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previous);}
    return bytes;
  }

  read<T extends Uint8Array|Float32Array>(width:number,height:number,bytes:T):Promise<T>{
    return this.readBatch(read=>read(width,height,bytes)).then(()=>bytes);
  }

  /** Submit all reads synchronously from their bound framebuffers, then wait
   * on one fence for the complete capture. No simulation frame is pipelined.
   */
  readBatch(submit:(read:(width:number,height:number,bytes:Uint8Array|Float32Array)=>void)=>void):Promise<void>{
    if(this.disposed)throw new Error('GPU readback is disposed');
    const gl=this.gl,entries:{buffer:WebGLBuffer;size:number;bytes:Uint8Array|Float32Array}[]=[];
    try {
      submit((width,height,bytes)=>{
        const floating=bytes instanceof Float32Array;
        if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||bytes.byteLength!==width*height*4*(floating?4:1))
          throw new Error('RGBA readback size mismatch');
        const entry=this.buffer(bytes.byteLength);
        if(!entry.buffer)throw new Error('Cannot allocate GPU readback buffer');
        entries.push({...entry,bytes});
        const previous=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer|null;
        try {
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER,entry.buffer);
          if(entry.size!==bytes.byteLength){gl.bufferData(gl.PIXEL_PACK_BUFFER,bytes.byteLength,gl.STREAM_READ);entries.at(-1)!.size=bytes.byteLength;}
          gl.readPixels(0,0,width,height,gl.RGBA,floating?gl.FLOAT:gl.UNSIGNED_BYTE,0);
        } finally {gl.bindBuffer(gl.PIXEL_PACK_BUFFER,previous);}
      });
      if(!entries.length)throw new Error('GPU readback batch is empty');
    } catch(error){for(const entry of entries)gl.deleteBuffer(entry.buffer);throw error;}
    return this.completeBatch(entries,()=>{
      if(entries.some(entry=>entry.bytes.byteLength!==entry.size))throw new Error('GPU readback destination changed while waiting');
      for(const entry of entries){gl.bindBuffer(gl.PIXEL_PACK_BUFFER,entry.buffer);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,entry.bytes);}
    });
  }

  private completeBatch(entries:ReadBuffer[],copy:()=>void):Promise<void>{
    const gl=this.gl;let sync:WebGLSync|null=null;
    try{
      sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
      if(!sync)throw new Error('Cannot create GPU readback fence');
      gl.flush();
    } catch(error){if(sync)gl.deleteSync(sync);for(const entry of entries)gl.deleteBuffer(entry.buffer);throw error;}
    const fence=sync;
    const started=performance.now();
    const promise=new Promise<void>((resolve,reject)=>{
      let attempts=0,channel:MessageChannel|undefined;
      const finish=(error?:Error)=>{
        channel?.port1.close();channel?.port2.close();gl.deleteSync(fence);
        if(error){for(const entry of entries)gl.deleteBuffer(entry.buffer);reject(error);return;}
        const binding=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer|null;
        try {
          copy();
          for(const {buffer,size} of entries)this.free.push({buffer,size});resolve();
        } catch(error){for(const entry of entries)gl.deleteBuffer(entry.buffer);reject(error);}
        finally {gl.bindBuffer(gl.PIXEL_PACK_BUFFER,binding);}
      };
      const probe=()=>{
        try{
        const status=gl.clientWaitSync(fence,0,0);
        if(status===gl.WAIT_FAILED||gl.isContextLost()){finish(new Error('GPU readback fence failed'));return;}
        if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED){finish();return;}
        if(performance.now()-started>10000){finish(new Error('GPU readback timed out'));return;}
        // One immediate event-loop turn; subsequent checks wait 1..4 ms. This
        // keeps a delayed or software GPU from occupying a CPU core with polls.
        if(attempts++===0){channel=new MessageChannel();channel.port1.onmessage=probe;channel.port2.postMessage(0);}
        else setTimeout(probe,Math.min(attempts-1,4));
        }catch(error){finish(error instanceof Error?error:new Error(String(error)));}
      };
      probe();
    });
    this.pending.add(promise);
    void promise.then(()=>this.pending.delete(promise),()=>this.pending.delete(promise));
    return promise;
  }
  dispose(){
    if(this.pending.size)throw new Error('Wait for GPU readbacks before disposing');
    this.disposed=true;for(const entry of this.free)this.gl.deleteBuffer(entry.buffer);this.free=[];this.packedStaging.clear();
  }
}

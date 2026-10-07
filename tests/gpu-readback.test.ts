import {describe,it,expect,vi} from 'vitest';
import {GpuReadback,type GpuReadSubmission} from '../src/gpu-readback';
function context(statuses:number[]=[3]){
  const prior={},gl={PIXEL_PACK_BUFFER_BINDING:1,PIXEL_PACK_BUFFER:2,ALREADY_SIGNALED:3,CONDITION_SATISFIED:4,WAIT_FAILED:5,TIMEOUT_EXPIRED:6,STREAM_READ:7,RGBA:8,UNSIGNED_BYTE:9,SYNC_GPU_COMMANDS_COMPLETE:10,FLOAT:11,
    getParameter:vi.fn(()=>prior),createBuffer:vi.fn(()=>({})),bindBuffer:vi.fn(),bufferData:vi.fn(),readPixels:vi.fn(),fenceSync:vi.fn(()=>({})),flush:vi.fn(),deleteSync:vi.fn(),deleteBuffer:vi.fn(),
    clientWaitSync:vi.fn(()=>statuses.shift()??3),isContextLost:vi.fn(()=>false),getBufferSubData:vi.fn((_target:number,_offset:number,bytes:Uint8Array)=>bytes.fill(42))};
  return {gl:gl as unknown as WebGL2RenderingContext,mock:gl,prior};
}
describe('pooled asynchronous GPU readback',()=>{
  it('waits before one packed copy into WASM, preserves float bits and restores the current binding',async()=>{
    const {gl,mock}=context([6,3]),readback=new GpuReadback(gl),memory=new WebAssembly.Memory({initial:1,maximum:2});
    const all=new Uint8Array(memory.buffer);all.fill(99);
    const destination=new Uint8Array(memory.buffer,32,24),rgb=destination.subarray(0,4),points=new Float32Array(memory.buffer,36,4);
    const bits=new Uint32Array([0x80000000,0x7fc01234,0x3f800000,0xff800000]);
    mock.getBufferSubData.mockImplementation((_target,_offset,bytes)=>{expect(bytes.buffer).toBe(memory.buffer);expect(bytes.byteLength).toBe(20);bytes.set([1,2,3,4]);bytes.set(new Uint8Array(bits.buffer),4);return bytes;});
    const submit=(read:GpuReadSubmission['read'])=>{read(1,1,rgb);read(1,1,points);};
    const pending=readback.readBatchPacked(24,submit,destination);
    expect(mock.readPixels.mock.calls.map(call=>call[6])).toEqual([0,4]);
    expect(mock.createBuffer).toHaveBeenCalledTimes(1);expect(mock.fenceSync).toHaveBeenCalledTimes(1);
    expect(mock.fenceSync.mock.invocationCallOrder[0]).toBeGreaterThan(mock.readPixels.mock.invocationCallOrder[1]);
    expect(mock.getBufferSubData).not.toHaveBeenCalled();expect(all.every(byte=>byte===99)).toBe(true);
    expect(()=>readback.dispose()).toThrow('Wait');
    const current={};mock.getParameter.mockReturnValue(current);
    await pending;
    expect(rgb).toEqual(new Uint8Array([1,2,3,4]));expect(new Uint32Array(points.buffer,points.byteOffset,4)).toEqual(bits);
    expect(all.subarray(0,32).every(byte=>byte===99)).toBe(true);expect(all.subarray(52).every(byte=>byte===99)).toBe(true);
    expect(mock.getBufferSubData).toHaveBeenCalledTimes(1);expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,current);
    await readback.readBatchPacked(24,submit,destination);expect(mock.createBuffer).toHaveBeenCalledTimes(1);expect(mock.bufferData).toHaveBeenCalledTimes(1);
    readback.dispose();expect(mock.deleteBuffer).toHaveBeenCalledTimes(1);
  });
  it('scatters asynchronous packed bytes without changing float payloads',async()=>{
    const {gl,mock}=context(),readback=new GpuReadback(gl),rgb=new Uint8Array(4),points=new Float32Array(4);
    const bits=new Uint32Array([0x80000000,0x7fc01234,0x3f800000,0xff800000]);
    mock.getBufferSubData.mockImplementation((_target,_offset,bytes)=>{bytes.set([1,2,3,4]);bytes.set(new Uint8Array(bits.buffer),4);return bytes;});
    await readback.readBatchPacked(20,read=>{read(1,1,rgb);read(1,1,points);});
    expect(rgb).toEqual(new Uint8Array([1,2,3,4]));expect(new Uint32Array(points.buffer)).toEqual(bits);
    expect(mock.getBufferSubData).toHaveBeenCalledTimes(1);readback.dispose();
  });
  it.each([true,false])('refuses detached WASM views before copying, direct destination=%s',async direct=>{
    const {gl,mock}=context([6,3]),readback=new GpuReadback(gl),memory=new WebAssembly.Memory({initial:1,maximum:2});
    const destination=new Uint8Array(memory.buffer,32,4),pending=readback.readBatchPacked(4,read=>read(1,1,destination),direct?destination:undefined);
    memory.grow(1);const grown=new Uint8Array(memory.buffer);grown.fill(99);
    await expect(pending).rejects.toThrow('destination changed');expect(mock.getBufferSubData).not.toHaveBeenCalled();
    expect(grown.every(byte=>byte===99)).toBe(true);expect(mock.deleteBuffer).toHaveBeenCalledTimes(1);expect(mock.deleteSync).toHaveBeenCalledTimes(1);readback.dispose();
  });
  it('cleans packed submission, fence, context and copy failures and allows recovery',async()=>{
    const {gl,mock,prior}=context(),readback=new GpuReadback(gl),destination=new Uint8Array(8);
    expect(()=>readback.readBatchPacked(8,()=>{})).toThrow('empty');
    expect(()=>readback.readBatchPacked(8,read=>read(1,1,new Uint8Array(4)),destination)).toThrow('must match');
    expect(()=>readback.readBatchPacked(4,read=>read(2,1,new Uint8Array(8)))).toThrow('capacity exceeded');
    expect(()=>readback.readBatchPacked(4,read=>{read(1,1,new Uint8Array(4));throw Error('render fault');})).toThrow('render fault');
    const submit=(read:(w:number,h:number,b:Uint8Array)=>void)=>read(1,1,new Uint8Array(4));
    mock.fenceSync.mockReturnValueOnce(null as any);expect(()=>readback.readBatchPacked(4,submit)).toThrow('fence');
    mock.clientWaitSync.mockReturnValueOnce(gl.WAIT_FAILED);await expect(readback.readBatchPacked(4,submit)).rejects.toThrow('fence failed');
    mock.isContextLost.mockReturnValueOnce(true);await expect(readback.readBatchPacked(4,submit)).rejects.toThrow('fence failed');
    mock.clientWaitSync.mockImplementationOnce(()=>{throw Error('probe fault');});await expect(readback.readBatchPacked(4,submit)).rejects.toThrow('probe fault');
    mock.getBufferSubData.mockImplementationOnce(()=>{throw Error('copy fault');});await expect(readback.readBatchPacked(4,submit)).rejects.toThrow('copy fault');
    expect(mock.deleteBuffer).toHaveBeenCalledTimes(9);expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    await readback.readBatchPacked(4,submit);readback.dispose();expect(mock.deleteBuffer).toHaveBeenCalledTimes(10);
    expect(()=>readback.readBatchPacked(4,submit)).toThrow('disposed');
  });
  it('times out an unsignaled packed fence and releases its resources',async()=>{
    const {gl,mock}=context([6]),readback=new GpuReadback(gl),now=vi.spyOn(performance,'now').mockReturnValueOnce(0).mockReturnValue(10001);
    try{await expect(readback.readBatchPacked(4,read=>read(1,1,new Uint8Array(4)))).rejects.toThrow('timed out');}
    finally{now.mockRestore();}
    expect(mock.getBufferSubData).not.toHaveBeenCalled();expect(mock.deleteSync).toHaveBeenCalledTimes(1);expect(mock.deleteBuffer).toHaveBeenCalledTimes(1);readback.dispose();
  });
  it('reads directly into contiguous WASM views, preserves raw float bits and leaves guard bytes untouched',()=>{
    const {gl,mock,prior}=context(),readback=new GpuReadback(gl),memory=new WebAssembly.Memory({initial:1,maximum:1});
    const all=new Uint8Array(memory.buffer);all.fill(99);
    const destination=new Uint8Array(memory.buffer,32,24),rgb=new Uint8Array(memory.buffer,32,4),points=new Float32Array(memory.buffer,36,4);
    const bits=new Uint32Array([0x80000000,0x7fc01234,0x3f800000,0xff800000]);
    mock.getBufferSubData.mockImplementation((_target,_offset,bytes)=>{
      expect(bytes.buffer).toBe(memory.buffer);expect(bytes.byteLength).toBe(20);
      bytes.set([1,2,3,4]);bytes.set(new Uint8Array(bits.buffer),4);return bytes;
    });
    readback.readBatchPackedSync(24,read=>{read(1,1,rgb);read(1,1,points);},destination);
    expect(rgb).toEqual(new Uint8Array([1,2,3,4]));expect(new Uint32Array(points.buffer,points.byteOffset,4)).toEqual(bits);
    expect(all.subarray(0,32).every(byte=>byte===99)).toBe(true);expect(all.subarray(52).every(byte=>byte===99)).toBe(true);
    expect(mock.getBufferSubData).toHaveBeenCalledTimes(1);expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    readback.dispose();
  });
  it('refuses mismatched direct views before CPU-memory writes and restores the PBO owner',()=>{
    const {gl,mock,prior}=context(),readback=new GpuReadback(gl),memory=new WebAssembly.Memory({initial:1,maximum:1});
    const destination=new Uint8Array(memory.buffer,32,8);destination.fill(99);
    expect(()=>readback.readBatchPackedSync(8,read=>{read(1,1,destination.subarray(0,4));read(1,1,new Uint8Array(memory.buffer,37,4));},destination)).toThrow('must match');
    expect(mock.getBufferSubData).not.toHaveBeenCalled();expect(destination).toEqual(new Uint8Array(8).fill(99));
    expect(mock.deleteBuffer).toHaveBeenCalledTimes(1);expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    expect(()=>readback.readBatchPackedSync(4,()=>{},destination)).toThrow('exact capacity');readback.dispose();
  });
  it('packs mixed formats into one transport and preserves float bits and failure cleanup',()=>{
    const {gl,mock,prior}=context(),readback=new GpuReadback(gl),rgb=new Uint8Array(4),float=new Float32Array(4);
    const bits=new Uint32Array([0x80000000,0x7fc01234,0x3f800000,0xff800000]);
    mock.getBufferSubData.mockImplementation((_target,_offset,bytes)=>{bytes.set([1,2,3,4]);bytes.set(new Uint8Array(bits.buffer),4);return bytes;});
    const submit=(read:(w:number,h:number,b:Uint8Array|Float32Array)=>void)=>{read(1,1,rgb);read(1,1,float);};
    readback.readBatchPackedSync(20,submit);
    expect(rgb).toEqual(new Uint8Array([1,2,3,4]));expect(new Uint32Array(float.buffer)).toEqual(bits);
    expect(mock.readPixels.mock.calls.map(call=>call[6])).toEqual([0,4]);expect(mock.getBufferSubData).toHaveBeenCalledTimes(1);
    readback.readBatchPackedSync(20,submit);expect(mock.createBuffer).toHaveBeenCalledTimes(1);expect(mock.bufferData).toHaveBeenCalledTimes(1);
    expect(()=>readback.readBatchPackedSync(4,submit)).toThrow('capacity exceeded');expect(mock.deleteBuffer).toHaveBeenCalledTimes(1);
    mock.getBufferSubData.mockImplementationOnce(()=>{throw new Error('copy fault');});expect(()=>readback.readBatchPackedSync(20,submit)).toThrow('copy fault');
    expect(mock.deleteBuffer).toHaveBeenCalledTimes(2);expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    readback.dispose();expect(()=>readback.readBatchPackedSync(20,submit)).toThrow('disposed');
  });
  it('submits all mixed attachments before synchronous copies and preserves size-matched pools',()=>{
    const {gl,mock,prior}=context(),readback=new GpuReadback(gl);
    const rgb=new Uint8Array(16),depth=new Uint8Array(16),cloud=new Float32Array(16);
    mock.getBufferSubData.mockImplementation((_target,_offset,bytes)=>{
      expect(mock.readPixels).toHaveBeenCalledTimes(3);return bytes.fill(42);
    });
    const submit=(read:(w:number,h:number,b:Uint8Array|Float32Array)=>void)=>{read(2,2,rgb);read(2,2,depth);read(2,2,cloud);};
    readback.readBatchSync(submit);
    expect(mock.getBufferSubData.mock.calls.map(call=>call[2])).toEqual([cloud,depth,rgb]);
    expect(rgb).toEqual(new Uint8Array(16).fill(42));expect(cloud).toEqual(new Float32Array(16).fill(42));
    mock.readPixels.mockClear();readback.readBatchSync(submit);
    expect(mock.createBuffer).toHaveBeenCalledTimes(3);expect(mock.bufferData).toHaveBeenCalledTimes(3);
    expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);expect(mock.fenceSync).not.toHaveBeenCalled();
    mock.readPixels.mockClear();mock.getBufferSubData.mockImplementationOnce(()=>{throw new Error('copy failure');});
    expect(()=>readback.readBatchSync(submit)).toThrow('copy failure');expect(mock.deleteBuffer).toHaveBeenCalledTimes(3);
    expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    readback.dispose();expect(()=>readback.readBatchSync(submit)).toThrow('disposed');
  });
  it('reads known synchronous attachments without format queries and restores PBO state even on failure',()=>{
    const {gl,mock,prior}=context(),readback=new GpuReadback(gl);
    const floats=new Float32Array(16);expect(readback.readSync(2,2,floats)).toBe(floats);
    expect(mock.readPixels).toHaveBeenLastCalledWith(0,0,2,2,gl.RGBA,gl.FLOAT,floats);
    expect(mock.getParameter).toHaveBeenCalledTimes(1);
    expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    mock.readPixels.mockImplementationOnce(()=>{throw new Error('read failed');});
    expect(()=>readback.readSync(1,1,new Uint8Array(4))).toThrow('read failed');
    expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    expect(mock.fenceSync).not.toHaveBeenCalled();expect(()=>readback.readSync(1,1,new Uint8Array(3))).toThrow('size');
    readback.dispose();expect(()=>readback.readSync(1,1,new Uint8Array(4))).toThrow('disposed');
  });
  it('reads GPU float point buffers with correct type, byte size and pooled packing state',async()=>{
    const {gl,mock,prior}=context(),readback=new GpuReadback(gl),points=new Float32Array(16);
    expect(await readback.read(2,2,points)).toBe(points);expect(points).toEqual(new Float32Array(16).fill(42));
    expect(mock.readPixels).toHaveBeenCalledWith(0,0,2,2,gl.RGBA,gl.FLOAT,0);
    expect(mock.bufferData).toHaveBeenCalledWith(gl.PIXEL_PACK_BUFFER,64,gl.STREAM_READ);
    await readback.read(2,2,new Uint8Array(16));
    expect(mock.createBuffer).toHaveBeenCalledTimes(1);expect(mock.bufferData).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,16,gl.STREAM_READ);
    expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);readback.dispose();
  });
  it('returns exact bytes, restores packing state and reuses allocations',async()=>{
    const {gl,mock,prior}=context(),readback=new GpuReadback(gl);
    expect(await readback.read(2,2,new Uint8Array(16))).toEqual(new Uint8Array(16).fill(42));
    await readback.read(2,2,new Uint8Array(16));
    expect(mock.createBuffer).toHaveBeenCalledTimes(1);expect(mock.bufferData).toHaveBeenCalledTimes(1);
    expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    expect(mock.deleteSync).toHaveBeenCalledTimes(2);readback.dispose();expect(mock.deleteBuffer).toHaveBeenCalledTimes(1);
  });
  it('yields for unsignaled fences and rejects failed fences without leaking',async()=>{
    const {gl,mock}=context([6,6,3]),readback=new GpuReadback(gl),pending=readback.read(1,1,new Uint8Array(4));
    expect(()=>readback.dispose()).toThrow('Wait');await pending;
    expect(mock.clientWaitSync).toHaveBeenCalledTimes(3);
    mock.clientWaitSync.mockReturnValueOnce(5);
    await expect(readback.read(1,1,new Uint8Array(4))).rejects.toThrow('fence failed');
    expect(mock.deleteSync).toHaveBeenCalledTimes(2);expect(mock.deleteBuffer).toHaveBeenCalledTimes(1);readback.dispose();
  });
  it('cleans up failed submissions and validates lifecycle',()=>{
    const {gl,mock,prior}=context(),readback=new GpuReadback(gl);
    expect(()=>readback.read(2,2,new Uint8Array(4))).toThrow('size');
    mock.fenceSync.mockReturnValueOnce(null as any);
    expect(()=>readback.read(1,1,new Uint8Array(4))).toThrow('fence');
    expect(mock.deleteBuffer).toHaveBeenCalledTimes(1);expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    readback.dispose();expect(()=>readback.read(1,1,new Uint8Array(4))).toThrow('disposed');
  });
  it('waits for both framebuffer reads on one fence and reuses both buffers',async()=>{
    const {gl,mock,prior}=context([6,3]),readback=new GpuReadback(gl);
    const rgb=new Uint8Array(16),depth=new Uint8Array(16);
    const pending=readback.readBatch(read=>{read(2,2,rgb);read(2,2,depth);});
    expect(mock.readPixels).toHaveBeenCalledTimes(2);expect(mock.fenceSync).toHaveBeenCalledTimes(1);
    expect(mock.flush).toHaveBeenCalledTimes(1);expect(mock.getBufferSubData).not.toHaveBeenCalled();
    expect(()=>readback.dispose()).toThrow('Wait');await pending;
    expect(rgb).toEqual(new Uint8Array(16).fill(42));expect(depth).toEqual(rgb);
    await readback.readBatch(read=>{read(2,2,rgb);read(2,2,depth);});
    expect(mock.createBuffer).toHaveBeenCalledTimes(2);expect(mock.bufferData).toHaveBeenCalledTimes(2);
    expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    readback.dispose();expect(mock.deleteBuffer).toHaveBeenCalledTimes(2);
  });
  it('releases every buffer if a batch submission or completion fails',async()=>{
    const {gl,mock,prior}=context(),readback=new GpuReadback(gl);
    expect(()=>readback.readBatch(read=>{read(1,1,new Uint8Array(4));read(1,1,new Uint8Array(4));throw new Error('render failed');})).toThrow('render failed');
    expect(mock.deleteBuffer).toHaveBeenCalledTimes(2);expect(mock.fenceSync).not.toHaveBeenCalled();
    mock.clientWaitSync.mockReturnValueOnce(gl.WAIT_FAILED);
    await expect(readback.readBatch(read=>{read(1,1,new Uint8Array(4));read(1,1,new Uint8Array(4));})).rejects.toThrow('fence failed');
    expect(mock.deleteBuffer).toHaveBeenCalledTimes(4);
    mock.getBufferSubData.mockImplementationOnce(()=>{throw new Error('copy failed');});
    await expect(readback.readBatch(read=>{read(1,1,new Uint8Array(4));read(1,1,new Uint8Array(4));})).rejects.toThrow('copy failed');
    expect(mock.deleteBuffer).toHaveBeenCalledTimes(6);expect(mock.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER,prior);
    readback.dispose();expect(mock.deleteBuffer).toHaveBeenCalledTimes(6);
  });
});

import * as THREE from 'three';

/** Reverse camera rows on the GPU without sampling, color shaders or host pixel
 * loops. The original targets remain available to GPU depth-cloud processing.
 * The returned target is bound for readback; the caller restores render state.
 */
export class GpuRasterRows {
  private targets=new Map<THREE.WebGLRenderTarget,THREE.WebGLRenderTarget>();
  private disposed=false;
  bindTopDown(renderer:THREE.WebGLRenderer,source:THREE.WebGLRenderTarget){
    if(this.disposed)throw Error('GPU raster row converter is disposed');
    if(source.samples!==0||source.texture.type!==THREE.UnsignedByteType||source.texture.format!==THREE.RGBAFormat)throw Error('GPU camera rows require single-sample RGBA8');
    let destination=this.targets.get(source);
    if(!destination){
      destination=new THREE.WebGLRenderTarget(source.width,source.height,{depthBuffer:false,stencilBuffer:false,
        type:source.texture.type,format:source.texture.format,colorSpace:source.texture.colorSpace as THREE.ColorSpace,
        minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false});
      this.targets.set(source,destination);
    }else if(destination.width!==source.width||destination.height!==source.height)destination.setSize(source.width,source.height);
    const gl=renderer.getContext() as WebGL2RenderingContext;
    renderer.setRenderTarget(source);
    const sourceFramebuffer=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer;
    renderer.setRenderTarget(destination);
    const readFramebuffer=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer;
    const scissor=gl.isEnabled(gl.SCISSOR_TEST);
    try{
      if(scissor)gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,sourceFramebuffer);
      gl.blitFramebuffer(0,source.height,source.width,0,0,0,source.width,source.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);
    }finally{
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,readFramebuffer);
      if(scissor)gl.enable(gl.SCISSOR_TEST);
    }
    return destination;
  }
  dispose(){this.disposed=true;for(const target of this.targets.values())target.dispose();this.targets.clear();}
}

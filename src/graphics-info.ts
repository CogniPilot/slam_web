export interface GraphicsInfo {api:string;renderer:string;vendor:string;acceleration:'software'|'hardware-reported'|'unknown';powerPreference:string}
export function graphicsInfo(gl:WebGLRenderingContext|WebGL2RenderingContext):GraphicsInfo {
  const extension=gl.getExtension('WEBGL_debug_renderer_info');
  const renderer=String(gl.getParameter(extension?extension.UNMASKED_RENDERER_WEBGL:gl.RENDERER));
  const vendor=String(gl.getParameter(extension?extension.UNMASKED_VENDOR_WEBGL:gl.VENDOR));
  const driver=`${renderer} ${vendor}`;
  const software=/swiftshader|llvmpipe|softpipe|lavapipe|software raster|basic render/i.test(driver);
  const namedHardware=!!extension&&/nvidia|geforce|radeon|intel|apple|adreno|mali|powervr|amd|qualcomm/i.test(driver);
  return {api:'WebGL 2',renderer,vendor,acceleration:software?'software':namedHardware?'hardware-reported':'unknown',powerPreference:gl.getContextAttributes()?.powerPreference??'default'};
}

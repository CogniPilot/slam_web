/** Depth registration for this simulator's co-located, rectified cameras.
 * world.ts renders both images from one sensor pose. baseline is used by the
 * noise model, NOT a depth-to-color translation. Pixel footprints are projected
 * into the color raster; nearest axial depth wins at overlapping footprints.
 * No interpolation, hole filling, truth, or estimated poses are used.
 */
export function registerDepth(bytes, calibration, layout) {
  const {width, height, fx, fy, rgbFx, rgbFy, cx, cy} = calibration;
  if (![width, height].every(v => Number.isSafeInteger(v) && v > 0) ||
      ![fx, fy, rgbFx, rgbFy].every(v => Number.isFinite(v) && v > 0) ||
      ![cx, cy].every(Number.isFinite)) throw Error('Invalid calibration');
  if (layout.width !== width || layout.height !== height || layout.format !== 'Z16' ||
      layout.isBigEndian || layout.strideBytes !== width * 2 ||
      !(layout.unitsMeters > 0) || !Number.isFinite(layout.unitsMeters) ||
      bytes.length !== width * height * 2) throw Error('Invalid packed Z16 depth');
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = Buffer.alloc(bytes.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const z = input.getUint16((y * width + x) * 2, true);
    if (z === 0) continue;
    const left = Math.max(0, Math.ceil((x - .5 - cx) * rgbFx / fx + cx));
    const right = Math.min(width - 1, Math.floor((x + .5 - cx) * rgbFx / fx + cx));
    const top = Math.max(0, Math.ceil((y - .5 - cy) * rgbFy / fy + cy));
    const bottom = Math.min(height - 1, Math.floor((y + .5 - cy) * rgbFy / fy + cy));
    for (let v = top; v <= bottom; v++) for (let u = left; u <= right; u++) {
      const i = (v * width + u) * 2, old = out.readUInt16LE(i);
      if (!old || z < old) out.writeUInt16LE(z, i);
    }
  }
  return out;
}

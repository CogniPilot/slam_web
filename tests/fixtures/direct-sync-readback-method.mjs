// Diagnostic candidate only. Reads each bound attachment directly into its
// final typed view, bypassing the intermediate PBO and getBufferSubData call.
// The matched browser harness substitutes this method in its own context.
export function readBatchPackedSync(capacity, submit, destination) {
  if (this.disposed) throw new Error('GPU readback is disposed');
  if (!Number.isSafeInteger(capacity) || capacity < 4 || capacity % 4)
    throw new Error('Invalid packed readback capacity');
  if (destination && (!(destination instanceof Uint8Array) || destination.byteLength !== capacity))
    throw new Error('Packed readback destination must cover its exact capacity');
  const gl = this.gl;
  const previous = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
  let used = 0, reads = 0, readbackMs = 0;
  try {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    submit((width, height, bytes) => {
      const floating = bytes instanceof Float32Array;
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
        || bytes.byteLength !== width * height * 4 * (floating ? 4 : 1))
        throw new Error('RGBA readback size mismatch');
      if (used + bytes.byteLength > capacity) throw new Error('Packed readback capacity exceeded');
      if (destination && (bytes.buffer !== destination.buffer || bytes.byteOffset !== destination.byteOffset + used))
        throw new Error('Direct readback views must match their packed destination');
      used += bytes.byteLength;
      reads++;
      const started = performance.now();
      gl.readPixels(0, 0, width, height, gl.RGBA, floating ? gl.FLOAT : gl.UNSIGNED_BYTE, bytes);
      readbackMs += performance.now() - started;
    });
    if (!reads) throw new Error('GPU readback batch is empty');
    return readbackMs;
  } finally {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous);
  }
}

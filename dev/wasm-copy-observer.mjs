import wabtFactory from 'wabt';

// Diagnostic instrumentation retains every original call and memory.copy.
// The caller must compare all output and input bits against the original.
export async function observeWasmCopies(original) {
  const wabt = await wabtFactory(), parsed = wabt.readWasm(original, {multi_memory:true});
  parsed.generateNames(); parsed.applyNames();
  const originalWat = parsed.toText({foldExprs:false,inlineExport:false}); parsed.destroy();
  const lines = originalWat.split('\n'), rewritten = [], sites = [], functions = [];
  let nextFunction = WebAssembly.Module.imports(await WebAssembly.compile(original)).filter(i => i.kind === 'function').length;
  let currentFunction, entryPending = false, inserted = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], trimmed = line.trim();
    if (/^  \(func /.test(line)) {
      if (!inserted) {
        rewritten.push('  (import "diag" "copy" (func $observe_copy (param i32 i32)))',
          '  (import "diag" "enter" (func $observe_enter (param i32)))'); inserted = true;
      }
      currentFunction = nextFunction++; functions.push({originalFunctionIndex:currentFunction,declaration:trimmed});
      rewritten.push(line,'    (local $observed_copy_size i32)'); entryPending = true; continue;
    }
    if (entryPending && !trimmed.startsWith('(local ')) {
      rewritten.push(`    i32.const ${currentFunction}`,'    call $observe_enter'); entryPending = false;
    }
    if (/^memory\.copy\b/.test(trimmed)) {
      const id = sites.length, width = lines[i-1].trim().match(/^i32\.const (-?\d+)$/);
      sites.push({id,originalFunctionIndex:currentFunction,originalWatLine:i+1,
        immediateBytes:width ? Number(width[1]) >>> 0 : null});
      rewritten.push('    local.tee $observed_copy_size',`    i32.const ${id}`,
        '    local.get $observed_copy_size','    call $observe_copy');
    }
    rewritten.push(line);
  }
  if (rewritten.some(l => /^\s*call \d+\b/.test(l) || /^\s*\(export .*\(func \d+\)/.test(l)))
    throw Error('Original function indices must have named bindings');
  const observedWat = rewritten.join('\n'), instrumented = wabt.parseWat('observed.wat',observedWat,{multi_memory:true});
  instrumented.validate({multi_memory:true});
  const observed = new Uint8Array(instrumented.toBinary({write_debug_names:false}).buffer); instrumented.destroy();
  return {originalWat,observedWat,observed,sites,functions};
}

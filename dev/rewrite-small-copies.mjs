// Diagnostic only: all source cells are loaded before any destination store.
// This preserves overlapping-copy values for admitted in-bounds buffers.
export function rewriteSmallCopies(wat) {
  if (/\blocal\.(get|set|tee) \d+\b/.test(wat)) {
    throw new Error('Name original locals before inserting diagnostic locals');
  }
  const lines = wat.split('\n'), result = [];
  let replacements = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);
    if (/^  \(func /.test(line)) {
      result.push('    (local $__copy_destination i32) (local $__copy_source i32)',
        '    (local $__copy_cell0 i64) (local $__copy_cell1 i64)',
        '    (local $__copy_cell2 i64) (local $__copy_cell3 i64)');
    }
    const width = line.trim().match(/^i32\.const (24|32)$/);
    if (!width || !/^memory\.copy(?: 0 0)?$/.test(lines[i+1]?.trim())) continue;
    result.pop(); // The original constant size is unnecessary for fixed loads.
    result.push('    local.set $__copy_source', '    local.set $__copy_destination');
    const cells = Number(width[1])/8;
    for (let cell = 0; cell < cells; cell++) result.push(
      '    local.get $__copy_source', `    i64.load offset=${cell*8}`,
      `    local.set $__copy_cell${cell}`);
    for (let cell = 0; cell < cells; cell++) result.push(
      '    local.get $__copy_destination', `    local.get $__copy_cell${cell}`,
      `    i64.store offset=${cell*8}`);
    i++; replacements++;
  }
  return {wat:result.join('\n'), replacements};
}

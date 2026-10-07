// Read-only verification of private allocation diagnostics or lazy-cache code.
// This checks exact source bytes; it does not compile or qualify either patch.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const mode = process.argv[2] ?? 'allocation';
assert(['allocation', 'lazy-cache'].includes(mode) && process.argv.length <= 3);
const lazy = mode === 'lazy-cache';
const root = lazy
  ? 'dev/artifacts/lazy-jacobian-column-cache-proposal'
  : 'dev/artifacts/fast-retained-artifacts-audit';
const reportBytes = fs.readFileSync(lazy
  ? 'dev/rumoca-lazy-jacobian-column-cache-proposal.json'
  : 'dev/rumoca-fast-retained-artifacts-audit.json');
const report = JSON.parse(reportBytes);
const manifestBytes = fs.readFileSync(report.archive.manifest);
assert.equal(sha(manifestBytes), report.archive.manifestSha256);
const manifest = JSON.parse(manifestBytes);
let archiveBytes = 0;
for (const file of manifest.files) {
  const bytes = fs.readFileSync(file.path);
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(sha(bytes), file.sha256, file.path);
  archiveBytes += bytes.length;
}
assert.equal(manifest.files.length, report.archive.files);
assert.equal(archiveBytes, report.archive.bytes);

const preimages = JSON.parse(fs.readFileSync(lazy ? report.preimages : report.overlay.preimages));
const patchBytes = fs.readFileSync(lazy ? report.patch : report.overlay.patch);
assert.equal(sha(patchBytes), lazy ? report.patchSha256 : report.overlay.sha256);
const lines = patchBytes.toString().split('\n');
if (lines.at(-1) === '') lines.pop();
let index = 0;
const checked = [];
while (index < lines.length) {
  if (!lines[index].startsWith('--- ')) {
    index++;
    continue;
  }
  const oldPath = lines[index++].slice(4);
  const added = oldPath === '/dev/null';
  assert(added || oldPath.startsWith('a/'));
  const newPath = lines[index++];
  assert(newPath.startsWith('+++ b/'));
  const file = newPath.slice(6);
  if (!added) assert.equal(oldPath, `a/${file}`);
  const receipt = preimages.files.find(entry => entry.path === file);
  assert(receipt, `Missing source identity for ${file}`);
  const originalBytes = added ? Buffer.alloc(0) : fs.readFileSync(path.join(root, 'before', file));
  if (added) {
    assert.equal(receipt.before_sha256, null);
    assert(!fs.existsSync(path.join('../rumoca-native-functions', file)));
  } else {
    assert.equal(sha(originalBytes), receipt.before_sha256);
    assert.equal(sha(fs.readFileSync(path.join('../rumoca-native-functions', file))), receipt.before_sha256);
  }
  const original = originalBytes.toString().split('\n');
  assert.equal(original.pop(), '', 'Expected newline-terminated Rust source');
  let cursor = 0;
  const result = [];
  while (index < lines.length && lines[index].startsWith('@@ ')) {
    const match = lines[index++].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    assert(match, `Invalid hunk in ${file}`);
    const start = Math.max(0, Number(match[1]) - 1);
    assert(cursor <= start, `Overlapping hunks in ${file}`);
    result.push(...original.slice(cursor, start));
    cursor = start;
    const oldCount = Number(match[2] ?? 1);
    const newCount = Number(match[4] ?? 1);
    let oldUsed = 0;
    let newUsed = 0;
    while (oldUsed < oldCount || newUsed < newCount) {
      const line = lines[index++];
      const kind = line[0];
      assert([' ', '-', '+'].includes(kind), `Invalid hunk body in ${file}`);
      if (kind !== '+') {
        assert.equal(original[cursor++], line.slice(1), `Source context mismatch in ${file}`);
        oldUsed++;
      }
      if (kind !== '-') {
        result.push(line.slice(1));
        newUsed++;
      }
    }
    assert.equal(oldUsed, oldCount);
    assert.equal(newUsed, newCount);
  }
  result.push(...original.slice(cursor));
  const applied = Buffer.from(result.join('\n') + '\n');
  assert.equal(sha(applied), receipt.after_sha256);
  assert.equal(sha(fs.readFileSync(path.join(root, 'after', file))), receipt.after_sha256);
  checked.push(file);
}
assert.equal(new Set(checked).size, preimages.files.length);
assert.equal(checked.length, lazy ? preimages.files.length : report.overlay.changedFiles);

const verification = {
  status: lazy
    ? 'ROOT_LAZY_JACOBIAN_COLUMN_CACHE_ARCHIVE_AND_EXACT_IN_MEMORY_APPLY_PASS'
    : 'ROOT_RETAINED_ALLOCATION_DIAGNOSTIC_ARCHIVE_AND_EXACT_IN_MEMORY_APPLY_PASS',
  sourceReportSha256: sha(reportBytes),
  manifestSha256: sha(manifestBytes),
  archiveFiles: manifest.files.length,
  archiveBytes,
  patchSha256: sha(patchBytes),
  checkedCurrentPreimagesAndPostimages: checked,
  scope: 'Read-only compiler source verification and exact copied-patch application in memory; only this durable report is written to the app workspace.',
  compilerModified: false,
  compiled: false,
  actualAllocationCounters: 'UNRUN',
  fullFrameAttribution: 'UNPROVED',
  proposalScope: lazy
    ? 'Demand initialization from the existing immutable pattern; public slice API, exact coloring and warm owned-clone behavior retained. Compiler tests unrun.'
    : 'Private opt-in allocation counters; production suitability and actual counters unrun.',
  limitations: [
    'Neither private patch is qualified for production.',
    'The conditional dense-Jacobian storage estimate is not a measured allocation.',
    'Source integrity does not prove Rust type correctness, numerical parity or full-frame admission.',
  ],
};
fs.writeFileSync(lazy
  ? 'dev/rumoca-lazy-jacobian-column-cache-root-review.json'
  : 'dev/rumoca-fast-retained-artifacts-root-review.json', JSON.stringify(verification, null, 2) + '\n');
console.log(JSON.stringify({ status: verification.status, archiveFiles: manifest.files.length, appliedFiles: checked.length }));

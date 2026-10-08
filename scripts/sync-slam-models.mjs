// Refresh generated compatibility sources from the committed canonical library.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [checkout, revision] = process.argv.slice(2);
assert.ok(checkout && /^[a-f0-9]{40}$/.test(revision ?? ''), 'CHECKOUT FULL_COMMIT_SHA required');
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], {maxBuffer: 8 * 1024 * 1024});
assert.equal(git('rev-parse', revision + '^{commit}').toString().trim(), revision);
const temporaryRoot = process.env.TMPDIR ?? path.join(os.homedir(), 'scratch', 'slam_web', 'tmp');
fs.mkdirSync(temporaryRoot, {recursive: true});
const temporary = fs.mkdtempSync(path.join(temporaryRoot, 'canonical-models-'));
try {
  const exporter = path.join(temporary, 'export.py');
  fs.writeFileSync(exporter, git('show', revision + ':tools/slam/export_legacy_sources.py'));
  const snapshot = path.join(temporary, 'snapshot');
  execFileSync(process.env.PYTHON ?? 'python3', [exporter, '--repository', checkout,
    '--revision', revision, '--output', snapshot], {stdio: 'inherit'});
  const provenance = JSON.parse(fs.readFileSync(path.join(snapshot, 'slam-provenance.json'), 'utf8'));
  for (const file of Object.keys(provenance.sources)) {
    assert.ok(file.startsWith('models/') && file.endsWith('.mo') && !file.split('/').includes('..'));
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.copyFileSync(path.join(snapshot, file), file);
  }
  fs.copyFileSync(path.join(snapshot, 'slam-provenance.json'), 'models/slam-provenance.json');
} finally {
  fs.rmSync(temporary, {recursive: true, force: true});
}

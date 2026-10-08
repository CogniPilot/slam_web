import {expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

it('ships the exact generated snapshots from the pinned canonical Modelica library', () => {
  const receipt = JSON.parse(readFileSync('models/slam-provenance.json', 'utf8'));
  expect(receipt.repository).toBe('https://github.com/CogniPilot/modelica_models');
  expect(receipt.revision).toMatch(/^[a-f0-9]{40}$/);
  expect(receipt.generated).toBe(true);
  expect(receipt.license).toBe('Apache-2.0');
  expect(Object.keys(receipt.sources)).toHaveLength(74);
  expect(receipt.canonical_classes).toHaveLength(179);
  for (const [file, expected] of Object.entries(receipt.sources)) {
    expect(file).toMatch(/^models\/[A-Za-z0-9_/]+\.mo$/);
    const bytes = readFileSync(file);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
    expect(bytes.toString()).toContain('Generated from CogniPilot/modelica_models ' + receipt.revision);
  }
});

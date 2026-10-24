import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {captureScene,CAPTURE_SCENES,CAPTURE_CAMERA_HZ} from './environment-scale-scenes.mjs';

const sha=text=>createHash('sha256').update(text).digest('hex');
const plant=()=>readFile(new URL('../models/Vehicles/LabQuadrotor.mo',import.meta.url),'utf8');

test('capture scenes keep the 5 Hz frame budgets',()=>{
 assert.equal(CAPTURE_CAMERA_HZ,5);
 assert.equal(captureScene('hallway').frames,3001);
 assert.equal(captureScene('office-loop').frames,1251);
 assert.equal(captureScene('office-loop').defaultUrl,undefined);
 assert.equal(captureScene('office-loop-two-circuit').frames,1251);
 assert.equal(captureScene('office-loop-two-circuit').defaultUrl,undefined);
 assert.deepEqual(Object.keys(CAPTURE_SCENES).sort(),['hallway','office-loop','office-loop-two-circuit']);
});

test('unknown capture scenes are refused',()=>{
 for(const name of ['city','toString','__proto__',''])assert.throws(()=>captureScene(name),/Unknown capture scene/);
});

test('office capture physics replaces only the four mission references',async()=>{
 const original=await plant(),scene=captureScene('office-loop'),physics=await scene.physics(original);
 for(const name of ['X','Y','VX','VY','AX','AY','Heading'])assert.ok(physics.includes('OfficeLoopProfile.'+name+'(time)'));
 assert.ok(!physics.includes('then targetPosition else pathPosition'));
 assert.ok(physics.startsWith(original.split('positionSetpoint =')[0]));
 assert.ok(physics.endsWith(await readFile(new URL('../'+scene.profile,import.meta.url),'utf8')));
 // Matches sourceSha256 of the passing office-loop-physics-r2 route receipt.
 assert.equal(sha(physics),'4cceadb8a81110c629f97e0b21eb19d2e712e99fb266bbcd7f3341645cdadbf6');
});

test('two-circuit capture physics is the source the Phase B preflight simulated',async()=>{
 const original=await plant(),scene=captureScene('office-loop-two-circuit'),physics=await scene.physics(original);
 for(const name of ['X','Y','VX','VY','AX','AY','Heading'])assert.ok(physics.includes('OfficeLoopTwoCircuitProfile.'+name+'(time)'));
 assert.ok(!physics.includes('then targetPosition else pathPosition'));
 assert.ok(physics.startsWith(original.split('positionSetpoint =')[0]));
 assert.ok(physics.endsWith(await readFile(new URL('../'+scene.profile,import.meta.url),'utf8')));
 // The preflight receipt (sha 497de442) was taken at models 34c26cb4. Only the generated header
 // names the library revision, so map it to that revision and require the rest to match exactly.
 const [header,...rest]=physics.split('\n');
 assert.match(header,/^\/\/ Generated from CogniPilot\/modelica_models [0-9a-f]{40}; edit the canonical packages there\.$/);
 const asPreflight=[header.replace(/[0-9a-f]{40}/,'34c26cb4b3ad6f16a072582115acc68d35178d1f'),...rest].join('\n');
 assert.equal(sha(asPreflight),'497de442e40a4e4ba66985ffbf6723c13688c4390acdabe142be62c09d12c658');
});

test('scene physics refuses a plant without the canonical references',async()=>{
 for(const name of Object.keys(CAPTURE_SCENES))await assert.rejects(captureScene(name).physics('model Empty end Empty;'));
});

test('hallway capture physics is unchanged by the scene table',async()=>{
 // Matches the physics of the sealed hallway-r1 capture project.
 assert.equal(sha(await captureScene('hallway').physics(await plant())),'3b045265a638156d42fe66132a87cf5a03bec26e261e5d2221195d08414012fe');
});

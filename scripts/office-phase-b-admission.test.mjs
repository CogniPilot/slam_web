import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {requirePhaseBHost,loadAdmission,SUCCESSOR_PATHS} from './office-phase-b-admission.mjs';

// A throwaway repository: a capture commit, then successors that change allowed or forbidden paths.
const repo=mkdtempSync(join(tmpdir(),'phase-b-successor-'));
const git=(...args)=>execFileSync('git',['-C',repo,'-c','user.name=Test','-c','user.email=test@example.invalid',...args],{encoding:'utf8'});
const write=(path,text)=>{mkdirSync(join(repo,path,'..'),{recursive:true});writeFileSync(join(repo,path),text);};
const commit=message=>{git('add','-A');git('commit','-q','-m',message);return git('rev-parse','HEAD').trim();};
git('init','-q');
write('package.json','{\n  "scripts": {\n    "build": "vite build",\n    "test:office-ci": "node --test a.test.mjs"\n  }\n}\n');
write('scripts/verify-office-ci-artifacts.mjs','v1\n');write('scripts/office-compare.browser.ts','compare\n');write('src/modelica-slam-session.ts','session\n');
const capture=commit('capture');
const host=(head,target)=>requirePhaseBHost(head,target,(...a)=>git(...a));

test('the capture commit itself is its own host',()=>{assert.equal(host(capture,capture),'capture');});
test('a successor changing only admission paths and the one package test line is accepted',()=>{
 git('checkout','-q','-b','ok',capture);
 write('scripts/verify-office-ci-artifacts.mjs','v2\n');write('scripts/admit-phase-b-capture.mjs','admit\n');
 write('package.json','{\n  "scripts": {\n    "build": "vite build",\n    "test:office-ci": "node --test a.test.mjs b.test.mjs"\n  }\n}\n');
 assert.equal(host(capture,commit('ok')),'successor');
});
test('a successor touching replay or comparison code, or any other path, is refused',()=>{
 for(const [branch,path] of [['compare','scripts/office-compare.browser.ts'],['src','src/modelica-slam-session.ts'],['new','scripts/unlisted.mjs']]){
  git('checkout','-q','-b',branch,capture);write(path,'changed\n');
  assert.throws(()=>host(capture,commit(branch)),/outside the admission list/,path);
 }
});
test('package.json may change only its test:office-ci line',()=>{
 git('checkout','-q','-b','pkg',capture);
 write('package.json','{\n  "scripts": {\n    "build": "vite build --mode other",\n    "test:office-ci": "node --test a.test.mjs"\n  }\n}\n');
 assert.throws(()=>host(capture,commit('pkg')),/beyond the test:office-ci line/);
});
test('a host that does not descend from the capture commit is refused',()=>{
 git('checkout','-q','--orphan','other');git('rm','-rq','--cached','.');write('README','x\n');
 assert.throws(()=>host(capture,commit('other')),/does not descend/);
});
test('the replay and comparison bundles, drivers and src are not admission paths',()=>{
 for(const path of ['scripts/office-replay.browser.ts','scripts/office-compare.browser.ts','scripts/replay-office-browser.mjs','scripts/compare-office-browser.mjs',
   'scripts/office-replay-contract.mjs','scripts/office-compare-contract.mjs','scripts/run-office-phase-b-pass2.sh','scripts/run-office-comparison.sh'])
  assert.ok(!SUCCESSOR_PATHS.includes(path),path);
 assert.ok(SUCCESSOR_PATHS.every(path=>!path.startsWith('src/')));
});
test('no admission is in force unless one is granted',()=>{
 assert.equal(loadAdmission({}),null);
 assert.throws(()=>loadAdmission({OFFICE_PHASE_B_ADMISSION:'/nonexistent'}),/granted sha256/);
});

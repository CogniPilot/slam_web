import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {resolveChromiumPath,chromiumLaunchOptions} from './browser-launch.mjs';

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'slam-browser-path-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const explicit=join(root,'pinned-chromium'),bin=join(root,'bin');
  await mkdir(bin);await writeFile(explicit,'#!/bin/sh\nexit 0\n',{mode:0o755});
  return {root,explicit,bin};
}

test('explicit Chromium takes precedence; an invalid override never falls back to PATH',async t=>{
  const f=await fixture(t);await symlink(f.explicit,join(f.bin,'chromium'));
  assert.deepEqual(chromiumLaunchOptions({CHROMIUM_PATH:f.explicit,PATH:f.bin}),
    {executablePath:f.explicit,chromiumSandbox:true});
  for(const path of [join(f.root,'missing'),f.bin])
    assert.throws(()=>resolveChromiumPath({CHROMIUM_PATH:path,PATH:f.bin}),/not an executable file/);
});

test('image PATH discovery follows executable symlinks and skips unusable candidates',async t=>{
  const f=await fixture(t),first=join(f.root,'first');await mkdir(first);
  await writeFile(join(first,'chromium'),'not executable',{mode:0o644});
  await symlink(f.explicit,join(f.bin,'chromium-browser'));
  assert.equal(resolveChromiumPath({PATH:[first,f.bin].join(delimiter)}),join(f.bin,'chromium-browser'));
  assert.equal(chromiumLaunchOptions({PATH:f.bin}).chromiumSandbox,true);
});

test('missing image browser fails with an actionable error, without a bundled fallback',()=>{
  assert.throws(()=>resolveChromiumPath({PATH:''}),/Chromium unavailable.*browser worker image/);
});

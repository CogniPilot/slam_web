import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '@playwright/test';
import {chromiumLaunchOptions} from './browser-launch.mjs';

// Exercise the pinned Playwright argument generator with a recorder executable,
// not a browser. This establishes launch intent, not a working kernel sandbox.
test('real Playwright argv preserves the sandbox; its default is a negative control',async t=>{
  const root=await mkdtemp(join(tmpdir(),'slam-playwright-argv-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const recorder=join(root,'chromium');
  await writeFile(recorder,'#!/bin/sh\nprintf "%s\\n" "$@" > "$SLAM_BROWSER_ARGV_CAPTURE"\nexit 1\n',{mode:0o755});
  const launch=chromiumLaunchOptions({CHROMIUM_PATH:recorder});
  for(const sandbox of [true,undefined]){
    const output=join(root,sandbox?'sandbox-on.txt':'playwright-default.txt');
    await assert.rejects(chromium.launch({...launch,chromiumSandbox:sandbox,
      headless:true,timeout:5000,env:{...process.env,SLAM_BROWSER_ARGV_CAPTURE:output}}));
    const args=(await readFile(output,'utf8')).trim().split('\n');
    assert.equal(args.includes('--no-sandbox'),sandbox!==true);
    assert.equal(args.includes('--disable-gpu-sandbox'),false);
  }
});

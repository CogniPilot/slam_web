import {defineConfig,devices} from '@playwright/test';
import process from 'node:process';
import base from './playwright.config';
import {chromiumLaunchOptions} from './scripts/browser-launch.mjs';

// Phone smoke: WebKit stands in for iPhone Safari and Chromium for Android.
// Software rendering only; these checks cover startup and Run, not frame rate.
const chromium={...devices['Pixel 7'],launchOptions:{...chromiumLaunchOptions(),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}};
const webkit={...devices['iPhone 13'],launchOptions:{executablePath:process.env.WEBKIT_PATH}};
export default defineConfig({
  ...base,
  testMatch:['**/*.mobile.ts'],
  globalTimeout:process.env.CI?12*60_000:undefined,
  projects:[
    {name:'iphone-webkit',use:{...base.use,...webkit}},
    {name:'android-chromium',use:{...base.use,...chromium}},
  ],
});

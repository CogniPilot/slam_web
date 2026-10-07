import { defineConfig } from '@playwright/test';
import process from 'node:process';
const port=Number(process.env.SLAM_PREVIEW_PORT??4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid SLAM_PREVIEW_PORT');
export default defineConfig({
  testDir:'tests/browser',timeout:120_000,workers:1,
  use:{baseURL:`http://127.0.0.1:${port}`,headless:true,viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox',...(process.env.SLAM_BROWSER_GPU==='1'?['--enable-gpu','--use-gl=angle','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader'])]}},
  webServer:{command:`npm run preview -- --port ${port} --strictPort`,url:`http://127.0.0.1:${port}`,reuseExistingServer:!process.env.CI}
});

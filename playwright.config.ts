import { defineConfig } from '@playwright/test';
import process from 'node:process';
import {chromiumLaunchOptions} from './scripts/browser-launch.mjs';
const port=Number(process.env.SLAM_PREVIEW_PORT??4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid SLAM_PREVIEW_PORT');
export default defineConfig({
  // Bounded CI smoke; full sensor/scene coverage runs on a hardware GPU.
  testMatch:[
    '**/raw-camera-preview.spec.ts',
    '**/realsense-packing.spec.ts',
    '**/depth-preview.spec.ts',
    '**/gpu-depth-noise.spec.ts',
    '**/viewer-cloud-transfer.spec.ts',
    '**/configuration-panel.spec.ts',
    '**/loop-tuning.spec.ts',
    '**/model-parameters.spec.ts',
    '**/modelica-docs.spec.ts',
    '**/assistant.spec.ts',
    '**/workspace-panes.spec.ts',
    '**/modelica-examples.spec.ts',
    '**/project-rejection.spec.ts',
    '**/slam-workspace.spec.ts',
    '**/slam-build.spec.ts',
    '**/editor.spec.ts',
    '**/startup.spec.ts',
    '**/reset.spec.ts',
    '**/map-flight-tour.spec.ts',
    '**/viewer-camera.spec.ts',
    '**/native-slam.spec.ts',
  ],
  testDir:'tests/browser',timeout:120_000,workers:1,reporter:'list',
  // The slowest hosted software-rendering shard needs time for repeated
  // compiler startup and source recovery. Keep phase deadlines intact.
  globalTimeout:process.env.CI?12*60_000:undefined,
  use:{baseURL:`http://127.0.0.1:${port}`,headless:true,viewport:{width:1440,height:1000},launchOptions:{...chromiumLaunchOptions(),args:[...(process.env.SLAM_BROWSER_GPU==='1'?['--enable-gpu','--use-gl=angle',`--use-angle=${process.env.SLAM_BROWSER_ANGLE??'gl'}`]:['--use-angle=swiftshader','--enable-unsafe-swiftshader'])]}},
  webServer:{command:`npm run preview -- --port ${port} --strictPort`,url:`http://127.0.0.1:${port}`,reuseExistingServer:!process.env.CI}
});

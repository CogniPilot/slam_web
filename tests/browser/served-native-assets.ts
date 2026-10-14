import type {Page} from '@playwright/test';
import type {SlamNativeManifest} from '../../src/slam-native-program';

/** CI serves a restored build artifact; public/ in the checkout can be empty. */
export async function servedNativeManifest(page:Page):Promise<(SlamNativeManifest&{fmu?:{file:string}})|undefined>{
  const url=new URL('vendor/slam/manifest.json',page.url()).href;
  const response=await page.request.get(url);
  if(response.status()===404)return undefined;
  if(!response.ok())throw new Error(`Native manifest request failed: ${response.status()} ${url}`);
  // Vite's static SPA fallback returns index.html for an absent asset.
  if(!response.headers()['content-type']?.includes('application/json'))return undefined;
  const manifest=await response.json();
  if(manifest.schemaVersion!==1||!manifest.models?.initialize||!manifest.models?.step)throw new Error('Invalid served native SLAM manifest');
  return manifest;
}

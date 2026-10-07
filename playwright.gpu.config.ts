import {defineConfig} from '@playwright/test';
import process from 'node:process';
import base from './playwright.config';

if(process.env.SLAM_BROWSER_GPU!=='1'){
  throw new Error('The full browser suite requires a hardware GPU: set SLAM_BROWSER_GPU=1.');
}

// All supported browser tests, including native sensor sizes and full scenes.
// Strict experimental compiler admission remains separate.
export default defineConfig({...base,testMatch:['**/*.spec.ts'],globalTimeout:30*60_000});

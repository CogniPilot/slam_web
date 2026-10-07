import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testIgnore:[],testMatch:['**/editor-compiler-admission.spec.ts']});

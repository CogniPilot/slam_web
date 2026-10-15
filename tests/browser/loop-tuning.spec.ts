import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {resolve} from 'node:path';

let script:string;
test.beforeAll(async()=>{
  const result=await build({stdin:{resolveDir:resolve('.'),contents:`
    import {mountLoopClosureSettings} from './src/loop-closure-settings-panel';
    import {LoopClosureHistory} from './src/loop-closure-history';
    import {mountLoopClosurePanel} from './src/loop-closure-panel';
    const state={settings:undefined,changes:[],hold:false,release:undefined};
    mountLoopClosureSettings(document.querySelector('#settings'),{settings:()=>state.settings,onApply:async settings=>{
      if(state.hold)await new Promise(resolve=>state.release=resolve);
      state.settings=structuredClone(settings);state.changes.push(structuredClone(settings));
    }});
    const history=new LoopClosureHistory();
    const frame=sequence=>({sequence,time:sequence*.2,calibration:{width:2,height:1},rgb:new Uint8Array([1,2,3,4,5,6]),imageLayout:{color:{width:2,height:1,strideBytes:6,format:'RGB8'}}});
    const graph={keyframes:[{id:1,time:0,imageEpoch:0,position:[0,0,0],quaternion:[1,0,0,0]}],edges:[]};
    history.observe(frame(0),{poseGraph:graph});
    history.observe(frame(1),{poseGraph:graph,diagnostics:{loopCandidates:1},loopClosure:{attempted:true,retrievalReason:0,graphReason:0,candidateCount:1,
      candidates:[{referenceId:1,currentId:2,score:.8,reason:11,verified:false,matchedCount:24,inlierCount:20,rms:.01}]}});
    const panel=mountLoopClosurePanel(document.querySelector('#decisions'),()=>state.tuned=true);panel.render(history,1,85,true);
    window.loopTuningTest={state,history,panel};`},bundle:true,write:false,format:'iife',platform:'browser'});
  script=result.outputFiles[0].text;
});
test.beforeEach(async({page})=>{
  await page.setContent('<main><div id="settings"></div><div id="decisions"></div></main>');
  await page.addScriptTag({content:script});
});

test('rejects incompatible limits, applies edits explicitly and restores defaults without applying them',async({page})=>{
  await page.getByLabel('Metric registration RMS limit (m)',{exact:true}).fill('.2');
  await page.getByRole('button',{name:'Apply tuning',exact:true}).click();
  await expect(page.getByRole('status').first()).toContainText('must not exceed');
  expect(await page.evaluate(()=>(window as any).loopTuningTest.state.changes)).toHaveLength(0);
  await page.getByLabel('Metric registration RMS limit (m)',{exact:true}).fill('.02');
  await page.getByLabel('Minimum appearance similarity',{exact:true}).fill('.7');
  await page.getByLabel('Use calibrated residuals',{exact:true}).uncheck();
  await page.evaluate(()=>{(window as any).loopTuningTest.state.hold=true;});
  await page.getByRole('button',{name:'Apply tuning',exact:true}).click();
  await expect(page.getByLabel('Minimum revisit age (s)',{exact:true})).toBeDisabled();
  await page.evaluate(()=>(window as any).loopTuningTest.state.release());
  await expect(page.getByRole('status').first()).toContainText('Tuning saved');
  expect(await page.evaluate(()=>(window as any).loopTuningTest.state.settings)).toMatchObject({loopMinimumSimilarity:.7,loopMaximumRms:.02,loopCalibratedResiduals:false});
  await page.getByRole('button',{name:'Restore defaults',exact:true}).click();
  await expect(page.getByLabel('Minimum appearance similarity',{exact:true})).toHaveValue('0.35');
  expect(await page.evaluate(()=>(window as any).loopTuningTest.state.settings.loopMinimumSimilarity)).toBe(.7);
});

test('shows rejected candidate images and model reasons, filters them and reuses their canvases',async({page})=>{
  const card=page.locator('.loop-candidate-history article');
  await expect(card).toHaveCount(1);await expect(card).toContainText('Rejected');
  await expect(card).toContainText('Loop motion disagrees with retained pose uncertainty');
  await expect(card).toContainText('24 descriptor matches');await expect(card).toContainText('20 inliers');
  await expect(card.locator('canvas')).toHaveCount(2);
  await page.evaluate(()=>{(window as any).retainedCandidateCanvas=document.querySelector('.loop-candidate-history canvas');});
  await page.getByLabel('Loop candidate filter').selectOption('accepted');await expect(card).toHaveCount(0);
  await page.getByLabel('Loop candidate filter').selectOption('rejected');await expect(card).toHaveCount(1);
  expect(await page.evaluate(()=>(window as any).retainedCandidateCanvas===document.querySelector('.loop-candidate-history canvas'))).toBe(true);
  await page.getByRole('button',{name:'Tune loop closure',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).loopTuningTest.state.tuned)).toBe(true);
  await expect(page.locator('.loop-closure-history').first().locator('article')).toHaveCount(0);
});

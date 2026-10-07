import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {resolve} from 'node:path';

let script:string;
test.beforeAll(async()=>{
  const result=await build({stdin:{contents:`import {mountConfigurationPanel} from './src/configuration-panel';
    const state={project:{sceneDetail:'high'},changes:[],release:undefined};
    const panel=mountConfigurationPanel(document.querySelector('aside'),{project:()=>state.project,onRatesChange:async rates=>{
      state.changes.push(rates??null);if(rates)state.project.sensorRates={...rates};else delete state.project.sensorRates;
      if(state.hold)await new Promise(resolve=>state.release=resolve);
    }});window.panelTest={state,panel};`,resolveDir:resolve('.')},bundle:true,write:false,format:'iife',platform:'browser'});
  script=result.outputFiles[0].text;
});
test.beforeEach(async({page})=>{
  await page.setContent('<main><div class="run-controls"><button>Run</button><label><input id="tour" type="checkbox" checked>Flight tour</label><select id="tour-mode" aria-label="Flight tour route"><option>Street circuit</option></select></div><div class="scene-controls"><select id="environment" aria-label="Environment"><option>City blocks</option></select><label><input id="cars" type="checkbox" checked>Cars</label></div><p id="graphics-budget">Graphics budget</p><span id="sensor-rate-summary"></span><aside><h2>Editable source</h2><textarea aria-label="Modelica source">model Kept end Kept;</textarea></aside></main>');
  await page.evaluate(()=>{document.getElementById('cars')!.addEventListener('change',()=>{(window as any).retainedHandler=true;});});
  await page.addScriptTag({content:script});
});

test('pane switches with keyboard and preserves existing source and control handlers',async({page})=>{
  await expect(page.getByLabel('Modelica source')).toBeVisible();
  await expect(page.getByLabel('Environment')).toBeHidden();
  await page.getByRole('tab',{name:'Editor',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:'Configuration',exact:true})).toBeFocused();
  await expect(page.getByLabel('Modelica source')).toBeHidden();
  await expect(page.getByRole('button',{name:'Run',exact:true})).toBeVisible();
  await page.getByLabel('Cars',{exact:true}).uncheck();
  expect(await page.evaluate(()=>(window as any).retainedHandler)).toBe(true);
  await page.getByRole('tab',{name:'Configuration',exact:true}).focus();await page.keyboard.press('Home');
  await expect(page.getByLabel('Modelica source')).toHaveValue('model Kept end Kept;');
  await expect(page.getByLabel('Modelica source')).toBeVisible();
});

test('custom sensor rates survive quality changes, reset explicitly and disable pending edits',async({page})=>{
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  for(const [label,values] of [['RGB + depth rate',['15','30','60']],['LiDAR rate',['5','10','20']],['Airframe IMU rate',['30','60','90','180']],['GPS rate',['1','5','10']]] as const)
    expect(await page.getByLabel(label,{exact:true}).locator('option').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value))).toEqual(values);
  await page.getByLabel('RGB + depth rate',{exact:true}).selectOption('60');
  await page.getByLabel('Airframe IMU rate',{exact:true}).selectOption('180');
  await page.evaluate(()=>{const {state,panel}=(window as any).panelTest;state.project.sceneDetail='low';panel.sync(state.project);});
  await expect(page.getByLabel('RGB + depth rate',{exact:true})).toHaveValue('60');
  await expect(page.locator('#sensor-rate-policy')).toContainText('Custom rates');
  await page.getByRole('button',{name:'Use quality defaults',exact:true}).click();
  await expect(page.getByLabel('RGB + depth rate',{exact:true})).toHaveValue('15');
  await expect(page.getByLabel('Airframe IMU rate',{exact:true})).toHaveValue('90');
  expect(await page.evaluate(()=>(window as any).panelTest.state.project.sensorRates)).toBeUndefined();
  await page.evaluate(()=>{(window as any).panelTest.state.hold=true;});
  await page.getByLabel('GPS rate',{exact:true}).selectOption('1');
  await expect(page.getByLabel('LiDAR rate',{exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Use quality defaults',exact:true})).toBeDisabled();
  await page.evaluate(()=>{(window as any).panelTest.state.release();});
  await expect(page.getByLabel('LiDAR rate',{exact:true})).toBeEnabled();
  await expect(page.locator('#sensor-rate-summary')).toHaveText('RGB + depth · 848 × 480 · 15 Hz sim time');
});

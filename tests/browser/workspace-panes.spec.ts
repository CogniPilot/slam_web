import {test, expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

let script: string;
const style=['src/style.css','src/workspace.css'].map(path=>readFileSync(path,'utf8')).join('\n');
test.beforeAll(async()=>{
  const result=await build({stdin:{resolveDir:resolve('.'),contents:`
    import {mountWorkspacePanes} from './src/workspace-panes';
    import {createSourceExplorer} from './src/source-explorer';
    const editor=document.querySelector('aside.editor');
    const explorer=createSourceExplorer(id=>{window.selectedFile=id;});
    explorer.update([
      {id:'main',path:'Examples/InertialOnly.mo'},
      {id:'matching',path:'Vision/Matching/RGBDFeatureMatching.mo'},
    ],'main');
    document.querySelector('.editor-view').prepend(explorer.element);
    mountWorkspacePanes([
      {name:'viewer',panel:document.querySelector('.scene'),header:document.querySelector('.panel-label'),fullScreenControls:document.querySelector('.run-controls')},
      {name:'editor',panel:editor,header:document.querySelector('.configuration-tabs'),fullScreenControls:document.querySelector('.run-controls')},
    ]);
    window.originalCanvas=document.querySelector('canvas');
    document.querySelector('#run').onclick=()=>{window.runClicks=(window.runClicks??0)+1;};
  `},bundle:true,write:false,format:'iife'});
  script=result.outputFiles[0].text;
});
test.beforeEach(async({page})=>{
  await page.setContent(`<style>${style}</style><header>SLAM Lab</header><main>
    <div class="toolbar"><div class="run-controls"><button id="run">Run</button></div></div>
    <div class="workspace"><section class="visuals"><div class="scene panel">
      <div class="panel-label">WORLD VIEW</div><div id="world"><canvas></canvas></div>
    </div></section><aside class="panel editor">
      <div class="configuration-tabs"><button>Editor</button></div>
      <div class="editor-view"><textarea aria-label="Source">model Kept end Kept;</textarea></div>
    </aside></div></main>`);
  await page.addScriptTag({content:script});
});

test('collapse and full screen preserve source, canvas, controls and focus',async({page})=>{
  await page.getByLabel('Source').fill('model Edited end Edited;');
  await page.getByRole('button',{name:'Collapse viewer',exact:true}).click();
  await expect(page.locator('#world')).toBeHidden();
  await page.getByRole('button',{name:'Expand viewer',exact:true}).click();
  await expect(page.locator('#world')).toBeVisible();
  await page.getByRole('button',{name:'Full screen viewer',exact:true}).click();
  await expect(page.locator('.scene')).toHaveClass(/pane-fullscreen/);
  await expect(page.getByLabel('Source')).toHaveJSProperty('inert',false);
  expect(await page.getByLabel('Source').evaluate(element=>!!element.closest('[inert]'))).toBe(true);
  await page.getByRole('button',{name:'Run',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).runClicks)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Full screen viewer',exact:true})).toBeFocused();
  await expect(page.locator('.toolbar #run')).toBeVisible();
  await page.getByRole('button',{name:'Full screen editor',exact:true}).click();
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await page.getByRole('button',{name:'Exit full screen editor',exact:true}).click();
  await page.getByRole('button',{name:'Collapse editor',exact:true}).click();
  await expect(page.getByLabel('Source')).toBeHidden();
  await page.getByRole('button',{name:'Expand editor',exact:true}).click();
  await expect(page.getByLabel('Source')).toHaveValue('model Edited end Edited;');
  expect(await page.evaluate(()=>document.querySelector('canvas')===(window as any).originalCanvas)).toBe(true);
  expect(await page.evaluate(()=>document.querySelectorAll('[inert]').length)).toBe(0);
});

test('folder navigation filters sources and handles an empty search',async({page})=>{
  await expect(page.getByRole('button',{name:'Open Examples/InertialOnly.mo',exact:true})).toHaveAttribute('aria-current','page');
  await page.getByRole('searchbox',{name:'Find a file'}).fill('Matching');
  await page.getByRole('button',{name:'Open Vision/Matching/RGBDFeatureMatching.mo',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).selectedFile)).toBe('matching');
  await page.getByRole('searchbox',{name:'Find a file'}).fill('missing');
  await expect(page.getByText('No matching files',{exact:true})).toBeVisible();
  await page.getByRole('searchbox',{name:'Find a file'}).fill('');
  await expect(page.getByRole('button',{name:'Open Examples/InertialOnly.mo',exact:true})).toBeVisible();
});

test('phone panes fit the viewport and keep expand controls reachable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  for(const name of ['viewer','editor']){
    await page.getByRole('button',{name:'Full screen '+name,exact:true}).click();
    const pane=page.locator('.pane-fullscreen');
    const bounds=await pane.boundingBox();
    expect(bounds).toEqual({x:0,y:0,width:390,height:844});
    await expect(page.getByRole('button',{name:'Exit full screen '+name,exact:true})).toBeInViewport();
    await page.keyboard.press('Escape');
  }
});

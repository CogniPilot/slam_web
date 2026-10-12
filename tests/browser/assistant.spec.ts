import {expect,test} from '@playwright/test';

test('mobile assistant reviews an edit, preserves source until accepted and forgets credentials',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  let requests=0,source='',path='';
  await page.route('https://assistant.example/v1/chat/completions',async route=>{
    const body=route.request().postDataJSON();requests++;
    if(requests===1){
      await route.fulfill({json:{choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'files',type:'function',function:{name:'list_files',arguments:'{}'}}]}}]}});return;
    }
    if(requests===2){
      const files=JSON.parse(body.messages.find((m:any)=>m.tool_call_id==='files').content);path=files.find((p:string)=>p.endsWith('Examples/InertialOnly.mo'))??files.find((p:string)=>p.endsWith('Main.mo'))??files[0];
      await route.fulfill({json:{choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'read',type:'function',function:{name:'read_file',arguments:JSON.stringify({path})}}]}}]}});return;
    }
    if(requests===3){
      source=JSON.parse(body.messages.find((m:any)=>m.tool_call_id==='read').content);
      await route.fulfill({json:{choices:[{message:{role:'assistant',content:'A comment documents the algorithm.',tool_calls:[{id:'edit',type:'function',function:{name:'propose_edit',arguments:JSON.stringify({path,source:source+'\n// Assistant browser fixture',reason:'Document the algorithm'})}}]}}]}});return;
    }
    await route.fulfill({json:{choices:[{message:{role:'assistant',content:'Please review the proposed comment.'}}]}});
  });
  await page.goto('/');
  await page.getByRole('tab',{name:'Assistant',exact:true}).click({timeout:90000});
  await page.getByLabel('Assistant provider',{exact:true}).selectOption('custom');
  await page.getByLabel('Assistant endpoint',{exact:true}).fill('https://assistant.example/v1');
  await page.getByLabel('Assistant model',{exact:true}).fill('fixture-model');
  await page.getByLabel('Assistant API key',{exact:true}).fill('session-only-fixture');
  await page.getByLabel('Assistant prompt',{exact:true}).fill('Inspect the algorithm and propose a comment.');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.getByRole('button',{name:'Accept edit',exact:true})).toBeEnabled();
  await expect(page.getByRole('log')).toContainText('Please review');
  expect(requests).toBe(4);
  expect(await page.evaluate(()=>JSON.stringify((window as any).__slamLab.project))).not.toContain('// Assistant browser fixture');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Accept edit',exact:true}).click();
  await expect(page.getByRole('button',{name:'Accepted',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>JSON.stringify((window as any).__slamLab.project))).toContain('// Assistant browser fixture');
  await page.getByRole('button',{name:'Forget key & conversation',exact:true}).click();
  await expect(page.getByLabel('Assistant API key',{exact:true})).toHaveValue('');
  await expect(page.getByRole('log')).toBeEmpty();
  const persisted=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));expect(persisted).not.toContain('session-only-fixture');
});

test('assistant shows connection failures and allows retry',async({page})=>{
  await page.route('https://assistant.example/v1/chat/completions',route=>route.fulfill({status:401,body:'invalid key'}));
  await page.goto('/');await page.getByRole('tab',{name:'Assistant',exact:true}).click({timeout:90000});
  await page.getByLabel('Assistant provider',{exact:true}).selectOption('custom');
  await page.getByLabel('Assistant endpoint',{exact:true}).fill('https://assistant.example/v1');
  await page.getByLabel('Assistant model',{exact:true}).fill('fixture-model');
  await page.getByLabel('Assistant prompt',{exact:true}).fill('Help');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.assistant-status')).toContainText('HTTP 401');await expect(page.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
});

test('OpenAI Responses edits Modelica, measures a lockstep run, starts playback and offers undo',async({page})=>{
  let requests=0,physicsPath='',measurement:any;
  await page.route('https://api.openai.com/v1/responses',async route=>{
    const body=route.request().postDataJSON();requests++;
    expect(body.store).toBe(false);expect(body.reasoning).toEqual({effort:'medium'});
    expect(body.tools[0]).toHaveProperty('name');expect(body.tools[0]).not.toHaveProperty('function');
    const tool=(name:string,args:unknown)=>({type:'function_call',call_id:`call-${requests}`,name,arguments:JSON.stringify(args)});
    let output;
    if(requests===1)output=[tool('list_files',{})];
    else if(requests===2){
      const files=JSON.parse(body.input.find((item:any)=>item.call_id==='call-1'&&item.type==='function_call_output').output);
      // The editable plant, not the pinned library copy of the same class.
      physicsPath=files.find((path:string)=>path==='models/Vehicles/LabQuadrotor.mo');expect(physicsPath).toBeTruthy();
      output=[tool('search_source',{path:physicsPath,query:'parameter Real initialHeight = 1.5;'})];
    }else if(requests===3){
      const matches=JSON.parse(body.input.find((item:any)=>item.call_id==='call-2'&&item.type==='function_call_output').output);
      expect(matches).toHaveLength(1);
      output=[tool('read_lines',{path:physicsPath,start_line:Math.max(1,matches[0].line-5),end_line:matches[0].line+5})];
    }else if(requests===4)output=[tool('replace_text',{path:physicsPath,old_text:'parameter Real initialHeight = 1.5;',new_text:'parameter Real initialHeight = 1.8;',reason:'Requested starting altitude'})];
    else if(requests===5)output=[tool('run_simulation',{frames:1})];
    else {
      measurement=JSON.parse(body.input.find((item:any)=>item.call_id==='call-5'&&item.type==='function_call_output').output);
      output=[tool('start_simulation',{})];
    }
    await route.fulfill({json:{status:'completed',output}});
  });
  await page.goto('/');await page.getByRole('tab',{name:'Assistant',exact:true}).click({timeout:90000});
  await page.getByLabel('Assistant API key',{exact:true}).fill('responses-fixture');
  await page.getByLabel('Assistant prompt',{exact:true}).fill('Change the starting altitude to 1.8 meters, test it, and fly.');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.assistant-status')).toContainText('Done.',{timeout:90000});
  expect(requests).toBe(6);expect(measurement.completedFrames).toBe(1);
  expect(measurement.simulation.truth.position[2]).toBeCloseTo(1.8,1);
  expect(measurement.simulation.pending).not.toEqual({});
  expect(await page.evaluate(()=>(window as any).__slamLab.runtime.running)).toBe(true);
  await page.getByRole('button',{name:'Undo edit',exact:true}).click();
  await expect(page.locator('.assistant-status')).toContainText('Edit undone');
  expect(await page.evaluate(()=>(window as any).__slamLab.project.physics)).toContain('parameter Real initialHeight = 1.5;');
  expect(await page.evaluate(()=>(window as any).__slamLab.runtime.running)).toBe(false);
});

test('WebLLM controls work on mobile without starting a download on selection',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  let downloads=0;await page.route('https://esm.run/**',route=>{downloads++;return route.abort();});
  await page.goto('/');await page.getByRole('tab',{name:'Assistant',exact:true}).click({timeout:90000});
  await page.getByLabel('Assistant provider',{exact:true}).selectOption('webllm');
  await expect(page.getByLabel('Assistant local model',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Assistant API key',{exact:true})).toBeHidden();
  await expect(page.getByLabel('Assistant endpoint',{exact:true})).toBeHidden();
  await expect(page.getByLabel('Assistant reasoning',{exact:true})).toBeHidden();
  await expect(page.getByRole('button',{name:'Unload local model',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(downloads).toBe(0);
});

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
  await page.getByLabel('Assistant endpoint',{exact:true}).fill('https://assistant.example/v1');
  await page.getByLabel('Assistant model',{exact:true}).fill('fixture-model');
  await page.getByLabel('Assistant prompt',{exact:true}).fill('Help');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.assistant-status')).toContainText('HTTP 401');await expect(page.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
});

import {test,expect} from '@playwright/test';

test('recovers an unsupported saved project without losing its original source',async({page})=>{
 const legacy=JSON.stringify({format:'slam-lab-project',version:1,name:'Stored source must survive',runtime:'retired',detectorLanguage:'modelica',algorithm:'retained unsupported source fixture',detector:'retained detector',physics:'retained physics',algorithmPreset:'custom',detectorPreset:'custom',environment:'city',seed:7,graph:{nodes:[],edges:[]}});
 await page.addInitScript(text=>localStorage.setItem('slam-lab.project.v1',text),legacy);
 await page.goto('/');
 await expect(page.locator('#startup-screen')).toBeHidden({timeout:90_000});
 await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled();
 await expect(page.locator('#model-recovery')).toContainText('Loaded current default models');
 await expect(page.locator('#model-recovery')).toContainText('retired runtime');
 await expect(page.getByRole('button',{name:'Save project',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>localStorage.getItem('slam-lab.project.v1'))).toBe(legacy);
 const original=await page.evaluate(()=>new Promise<string>((resolve,reject)=>{
  const request=indexedDB.open('slam-lab-projects',1);request.onsuccess=()=>{
   const db=request.result,store=db.transaction('projects','readonly').objectStore('projects');
   const latest=store.get('slam-lab.project.v1.recovery');latest.onsuccess=()=>{
    const backup=store.get('slam-lab.project.v1.recovery.'+latest.result);
    backup.onsuccess=()=>{resolve(backup.result.text);db.close();};backup.onerror=()=>reject(backup.error);
   };latest.onerror=()=>reject(latest.error);
  };request.onerror=()=>reject(request.error);
 }));
 expect(original).toBe(legacy);
 expect(await page.evaluate(()=>(window as any).__slamLab.project.name)).toBe('Stored source must survive');
});

test('recovers an imported quadrotor with a missing base class and retains the imported settings',async({page})=>{
 test.setTimeout(180_000); // Initial preparation plus two independent recoveries.
 await page.goto('/');
 await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled({timeout:90_000});
 const text=await page.evaluate(()=>{
  const project=structuredClone((window as any).__slamLab.project);
  project.physics=project.physics.replace(/\bLabQuadrotor\b/g,'LegacyQuadrotor');
  project.name='Imported warehouse';project.environment='warehouse';project.cameraResolution='424x240';
  return JSON.stringify(project);
 });
 await page.locator('#open').setInputFiles({name:'old-model.slam.json',mimeType:'application/json',buffer:Buffer.from(text)});
 await expect(page.locator('#model-recovery')).toContainText('Loaded current default models',{timeout:90_000});
 await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).__slamLab.project)).toMatchObject({name:'Imported warehouse',environment:'warehouse',cameraResolution:'424x240'});
 await page.getByRole('button',{name:'▶ Run',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence??-1),{timeout:30_000}).toBeGreaterThan(0);
 // Invalid JSON must be recoverable too, including its exact unparseable text.
 const malformed='{ "format": "slam-lab-project", damaged';
 await page.locator('#open').setInputFiles({name:'damaged.slam.json',mimeType:'application/json',buffer:Buffer.from(malformed)});
 await expect(page.locator('#model-recovery')).toContainText('SyntaxError',{timeout:90_000});
 await expect(page.locator('#model-recovery')).toContainText('Loaded current default models',{timeout:90_000});
 const history=await page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
  const request=indexedDB.open('slam-lab-projects',1);request.onsuccess=()=>{
   const db=request.result,read=db.transaction('projects','readonly').objectStore('projects').getAll();
   read.onsuccess=()=>{resolve(read.result.filter(value=>value?.createdAt));db.close();};read.onerror=()=>reject(read.error);
  };request.onerror=()=>reject(request.error);
 }));
 expect(history.map(backup=>backup.text).sort()).toEqual([text,malformed].sort());
});

test('failed edits stay editable and default recovery cannot overwrite saved source when backup storage fails',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled({timeout:90_000});
 await page.getByLabel('Modelica source').fill('within SLAM.Examples; model InertialOnly Real x; equation x=; end InertialOnly;');
 await page.getByRole('button',{name:'Save project',exact:true}).click();
 await expect(page.locator('#saved')).toHaveText('Saved locally');
 await page.getByRole('button',{name:'Apply & reset',exact:true}).click();
 await expect(page.locator('#status')).toHaveClass(/error/,{timeout:30_000});
 expect(await page.getByLabel('Modelica source').inputValue()).toContain('equation x=;');
 await expect(page.locator('#model-recovery')).toHaveCount(0);
 await page.evaluate(()=>{
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){
   if(String(key).includes('.recovery'))throw new DOMException('Backup quota exhausted','QuotaExceededError');
   return put.call(this,value,key);
  };
 });
 await page.getByRole('button',{name:'Load default models',exact:true}).click();
 await expect(page.locator('#model-recovery')).toContainText('Loaded current default models',{timeout:90_000});
 await expect(page.locator('#model-recovery')).toContainText('Automatic saving is disabled');
 await expect(page.getByRole('button',{name:'Save project',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled();
 const saved=await page.evaluate(()=>new Promise<any>((resolve,reject)=>{
  const request=indexedDB.open('slam-lab-projects',1);request.onsuccess=()=>{
   const db=request.result,read=db.transaction('projects','readonly').objectStore('projects').get('slam-lab.project.v1');
   read.onsuccess=()=>{resolve(read.result);db.close();};read.onerror=()=>reject(read.error);
  };request.onerror=()=>reject(request.error);
 }));
 expect(saved.algorithm).toContain('equation x=;');
 await expect(page.getByRole('button',{name:'Download previous model',exact:true})).toBeEnabled();
});

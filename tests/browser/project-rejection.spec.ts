import {test,expect} from '@playwright/test';

test('rejects a stored unsupported project without autosaving a replacement over it',async({page})=>{
 const legacy=JSON.stringify({format:'slam-lab-project',version:1,name:'Stored source must survive',runtime:'retired',detectorLanguage:'modelica',algorithm:'retained unsupported source fixture',detector:'retained detector',physics:'retained physics',algorithmPreset:'custom',detectorPreset:'custom',environment:'city',seed:7,graph:{nodes:[],edges:[]}});
 await page.addInitScript(text=>localStorage.setItem('slam-lab.project.v1',text),legacy);
 await page.goto('/');
 await expect(page.locator('#startup-screen')).toBeHidden({timeout:90_000});
 await expect(page.locator('#status')).toContainText('retired runtime',{timeout:30000});
 await expect(page.getByRole('button',{name:'Save project',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Apply & reset',exact:true})).toBeEnabled();
 await page.getByLabel('Project name').fill('An edit must not overwrite the rejected source');
 await page.getByLabel('Modelica source').fill('model Edited\n Real x;\nequation\n x=1;\nend Edited;');
 // Wait beyond the real autosave debounce and allow its transaction to finish.
 await page.waitForTimeout(700);
 expect(await page.evaluate(()=>localStorage.getItem('slam-lab.project.v1'))).toBe(legacy);
 const stored=await page.evaluate(()=>new Promise<unknown>((resolve,reject)=>{const request=indexedDB.open('slam-lab-projects',1);request.onsuccess=()=>{const db=request.result,read=db.transaction('projects','readonly').objectStore('projects').get('slam-lab.project.v1');read.onsuccess=()=>{resolve(read.result??null);db.close();};read.onerror=()=>reject(read.error);};request.onerror=()=>reject(request.error);}));
 expect(stored).toBeNull();
 expect(await page.evaluate(()=>(window as any).__slamLab.ready)).toBe(false);
});

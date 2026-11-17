import {test,expect} from '@playwright/test';

test('changing maps picks the matching route while a manual override persists across reload',async({page})=>{
  test.setTimeout(180_000);await page.goto('/');
  const run=page.getByRole('button',{name:'▶ Run',exact:true});await expect(run).toBeEnabled({timeout:90_000});
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  const map=page.getByLabel('Environment',{exact:true}),route=page.getByLabel('Flight tour route',{exact:true});
  await map.selectOption('office-loop');await expect(route).toHaveValue('office-loop');
  await expect(map).toBeEnabled();
  await page.locator('#flight-control').click();await expect(route).toBeEnabled();
  await route.selectOption('indoor');await expect(run).toBeEnabled({timeout:90_000});
  await page.getByRole('button',{name:'Save project',exact:true}).click();await expect(page.locator('#saved')).toHaveText('Saved locally');
  await page.reload();await expect(run).toBeEnabled({timeout:90_000});
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  await expect(map).toHaveValue('office-loop');await expect(route).toHaveValue('indoor');
  await map.selectOption('hallway');await expect(route).toHaveValue('hallway');await expect(map).toBeEnabled();
});

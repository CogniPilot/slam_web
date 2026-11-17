import {test,expect} from '@playwright/test';

test('a phone visitor streams motion sensors into the phone EKF',async({page},testInfo)=>{
  // Playwright's WebKit build cannot construct DeviceMotionEvent; Chromium can.
  test.skip(testInfo.project.name!=='android-chromium','Synthetic motion events need Chromium');
  await page.goto('/');
  await expect(page.locator('#startup-screen')).toBeHidden({timeout:90_000});
  await page.getByRole('tab',{name:'Configuration'}).click();
  const panel=page.locator('.phone-motion');
  await expect(panel.getByLabel('Phone motion estimator')).toHaveValue('PhoneMotionEKF');
  await panel.getByRole('button',{name:'Use this phone\'s motion sensors'}).click();
  // A phone rolled 30° and held still, at 60 Hz, with matching orientation angles.
  await page.evaluate(()=>{
    const g=9.81,roll=Math.PI/6;
    setInterval(()=>{
      // A roll about the device x axis is DeviceOrientation beta.
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:0,beta:30,gamma:0}));
      window.dispatchEvent(new DeviceMotionEvent('devicemotion',{interval:1000/60,
        accelerationIncludingGravity:{x:0,y:g*Math.sin(roll),z:g*Math.cos(roll)},
        rotationRate:{alpha:0,beta:0,gamma:0}}));
    },1000/60);
  });
  await expect(panel.locator('.phone-motion-status')).toContainText('Running',{timeout:90_000});
  const roll=panel.locator('dt',{hasText:'Roll'}).locator('xpath=following-sibling::dd[1]');
  await expect.poll(async()=>parseFloat(await roll.textContent()??'NaN'),{timeout:30_000}).toBeCloseTo(30,0);
  await panel.getByRole('button',{name:'Stop phone sensors'}).click();
  await expect(panel.locator('.phone-motion-status')).toContainText('Stopped');
});

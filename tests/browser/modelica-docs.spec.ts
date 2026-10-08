import {test,expect} from '@playwright/test';

test('documentation uses the real compiler, sanitizes edited annotations and opens their source on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('#startup-screen')).toBeHidden({timeout:90_000});
  const github=page.getByRole('link',{name:'SLAM Lab on GitHub',exact:true});
  await expect(github).toHaveText('');await expect(github.locator('img')).toHaveAttribute('src',/brand\/github.svg$/);
  const powered=page.getByRole('link',{name:'Powered by Rumoca',exact:true});
  await expect(powered).toHaveText('Powered by');await expect(powered.locator('img')).toHaveAttribute('src',/brand\/rumoca.svg$/);
  for(const width of [945,800,390]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.evaluate(()=>{
    const lab=(window as any).__slamLab;
    const html='<html><h2>Filter mathematics</h2><p>Gain controls convergence.</p><a href="modelica://Help.Other">Related class</a><script>window.docAttack=true</script><img src="/doc-attack.png" onerror="window.docAttack=true"><a href="javascript:window.docAttack=true">Unsafe</a><table><tr><td onclick="window.docAttack=true">Safe cell</td></tr></table></html>';
    lab.project.modelicaSources['models/Help/package.mo']='within; package Help end Help;';
    lab.project.modelicaSources['models/Help/Filter.mo']=`within Help; model Filter "Teaching filter" parameter Real gain=2 "Correction gain"; Real x; equation x=gain; annotation(Documentation(info=${JSON.stringify(html)})); end Filter;`;
    lab.project.modelicaSources['models/Help/Other.mo']='within Help; model Other "Related filter" Real y=1; end Other;';
  });
  await page.getByRole('tab',{name:'Docs',exact:true}).click();
  const docs=page.getByRole('tabpanel',{name:'Docs',exact:true});
  await docs.getByLabel('Find a Modelica class').fill('Help.Filter');
  await docs.getByRole('button',{name:'Documentation for Help.Filter',exact:true}).click();
  const article=docs.getByRole('article',{name:'Modelica class documentation'});
  await expect(article).toContainText('Filter mathematics');
  await expect(article).toContainText('Correction gain');
  expect(await article.locator('script,img,iframe,[onclick],[onerror]').count()).toBe(0);
  expect(await page.evaluate(()=>(window as any).docAttack)).toBeUndefined();
  await expect(article.getByText('Unsafe',{exact:true})).not.toHaveAttribute('href',/javascript/);
  await article.getByRole('link',{name:'Related class'}).click();
  await expect(article.getByRole('heading',{name:'Help.Other',exact:true})).toBeVisible();
  await article.getByRole('button',{name:'Open source'}).click();
  await expect(page.getByRole('tab',{name:'Editor',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByLabel('Modelica source')).toHaveValue(/model Other/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('tab',{name:'Editor',exact:true}).focus();await page.keyboard.press('End');
  await expect(page.getByRole('tab',{name:'Assistant',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'Editor',exact:true})).toBeFocused();
});

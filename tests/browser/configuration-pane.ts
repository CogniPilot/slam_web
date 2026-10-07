import type {Page} from '@playwright/test';

export async function openConfiguration(page:Page){await page.getByRole('tab',{name:'Configuration',exact:true}).click();}
export async function openEditor(page:Page){await page.getByRole('tab',{name:'Editor',exact:true}).click();}

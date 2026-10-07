import {expect, type Page} from '@playwright/test';

async function openFile(page: Page, id: string, query: string) {
  await page.getByRole('tab', {name: 'Editor', exact: true}).click();
  if (await page.getByRole('navigation', {name: 'Project files'}).isHidden())
    await page.getByRole('button', {name: 'Files', exact: true}).click();
  await page.getByRole('searchbox', {name: 'Find a file'}).fill(query);
  const file = page.locator(`[data-source-id="${id}"]`);
  await expect(file).toBeVisible();
  await file.click();
}

export async function openSourceFile(page: Page, path: string) {
  await openFile(page, path, path.split('/').at(-1)!);
}

export async function openExperimentFile(page: Page, id: string) {
  await openFile(page, 'experiment:' + id, id==='slam'?'':'Experiment/');
}

export async function openLibraryFile(page: Page, path: string) {
  await openFile(page, 'library:' + path, path.split('/').at(-1)!);
}

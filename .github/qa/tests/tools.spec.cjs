const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});
test('supplier CSV upload maps quoted fields and leading zeros into the download', async ({page}) => {
  await page.goto('/utilities/csv-column-mapper/');
  await page.locator('#file').setInputFiles({name:'supplier.csv', mimeType:'text/csv', buffer:Buffer.from('Item,Cost,Code\r\n"Mug, blue",7.50,0012\r\n"Frame, 5""",9.25,0013\r\n')});
  await expect(page.locator('#source')).toHaveValue(/0013/);
  await page.locator('#target').fill('SKU,Title,Price');
  await page.locator('#prepare').click();
  await page.locator('#source-0').selectOption('2');
  await page.locator('#source-1').selectOption('0');
  await page.locator('#source-2').selectOption('1');
  await page.locator('#generate').click();
  await expect(page.locator('#output')).toHaveValue('SKU,Title,Price\n0012,"Mug, blue",7.50\n0013,"Frame, 5""",9.25');
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('mapped.csv');
  expect(fs.readFileSync(await download.path(), 'utf8')).toBe('SKU,Title,Price\r\n0012,"Mug, blue",7.50\r\n0013,"Frame, 5""",9.25\r\n');
  await page.locator('#source').fill('Item,Cost,Code\nNotebook,3.50');
  await page.locator('#prepare').click();
  await expect(page.locator('#message')).toHaveText(/Line 2 has 2 fields.*header has 3/);
  await expect(page.locator('#result')).toBeHidden();
  await page.locator('#source').fill('Item,Cost,Code\nNotebook,3.50,0014');
  await page.locator('#target').fill('Price,Price');
  await page.locator('#prepare').click();
  await expect(page.locator('#message')).toHaveText(/distinct, nonblank/);
});
test('photo file upload reads exact dimensions and rejects a disguised text file', async ({page}) => {
  await page.goto('/utilities/image-dimension-checker/');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width=900; canvas.height=600;
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#files').setInputFiles([
    {name:'product.png', mimeType:'image/png', buffer:Buffer.from(image, 'base64')},
    {name:'invalid.png', mimeType:'image/png', buffer:Buffer.from('not an image')}
  ]);
  await expect(page.locator('#status')).toHaveText('0 of 2 meet your limits.');
  await expect(page.locator('#output')).toContainText('900 \u00d7 600');
  await expect(page.locator('#output')).toContainText('Height short by 200 px');
  await expect(page.locator('#output')).toContainText('Choose a JPEG, PNG or WebP image');
  await page.locator('#height').fill('600');
  await expect(page.locator('#status')).toHaveText('1 of 2 meet your limits.');
});
test('list comparison identifies additions, removals and shared IDs', async ({page}) => {
  await page.goto('/utilities/list-difference/');
  await page.locator('#a').fill(' A001 \nA002\nA002');
  await page.locator('#b').fill('A002\nA003');
  await page.locator('#compare').click();
  await expect(page.locator('#added')).toHaveValue('A003');
  await expect(page.locator('#removed')).toHaveValue('A001');
  await expect(page.locator('#shared')).toHaveValue('A002');
});
test('slug generator withholds a final list when titles collide', async ({page}) => {
  await page.goto('/utilities/slug-generator/');
  await page.locator('#sample').click();
  await expect(page.locator('#copy-area')).toBeHidden();
  await expect(page.locator('#summary')).toHaveText('2 of 3 titles need review.');
  await page.locator('#titles').fill('Blue Mug\nRed Mug');
  await page.locator('#builder button[type="submit"]').click();
  await expect(page.locator('#output')).toHaveValue('blue-mug\nred-mug');
});

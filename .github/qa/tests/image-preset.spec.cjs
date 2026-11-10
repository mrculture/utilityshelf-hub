const { test, expect } = require('@playwright/test');

test('eBay preset applies recommended limits, checks boundaries and returns to custom on edits', async ({page, context}) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/utilities/image-dimension-checker/');
  const images = await page.evaluate(() => {
    return [[1600,1600],[1600,900],[900,1600]].map(([width,height]) => {
      const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
      return canvas.toDataURL('image/png').split(',')[1];
    });
  });
  const square=Buffer.from(images[0],'base64');
  await page.locator('#files').setInputFiles([
    {name:'exact-12mb.png',mimeType:'image/png',buffer:Buffer.concat([square,Buffer.alloc(12000000-square.length)])},
    {name:'over-12mb.png',mimeType:'image/png',buffer:Buffer.concat([square,Buffer.alloc(12000001-square.length)])},
    {name:'landscape.png',mimeType:'image/png',buffer:Buffer.from(images[1],'base64')},
    {name:'portrait.png',mimeType:'image/png',buffer:Buffer.from(images[2],'base64')}
  ]);
  await expect(page.locator('#status')).toHaveText('2 of 4 meet your limits.');
  await page.locator('#preset').selectOption('ebay');
  await expect(page.locator('#width')).toHaveValue('1600');
  await expect(page.locator('#height')).toHaveValue('1600');
  await expect(page.locator('#size')).toHaveValue('12');
  await expect(page.locator('#ebayHelp')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('1 of 4 meet the eBay recommended-size preset.');
  await expect(page.locator('tbody tr').filter({hasText:'exact-12mb.png'})).toContainText('Pass');
  await expect(page.locator('tbody tr').filter({hasText:'over-12mb.png'})).toContainText('Over the file size limit');
  await expect(page.locator('tbody tr').filter({hasText:'landscape.png'})).toContainText('Height short by 700 px');
  await expect(page.locator('tbody tr').filter({hasText:'portrait.png'})).toContainText('Width short by 700 px');
  await page.locator('#height').fill('900');
  await expect(page.locator('#preset')).toHaveValue('custom');
  await expect(page.locator('#ebayHelp')).toBeHidden();
  await expect(page.locator('#status')).toHaveText('2 of 4 meet your limits.');
  await page.locator('#preset').selectOption('ebay');
  await expect(page.locator('#height')).toHaveValue('1600');
  await page.locator('#preset').selectOption('custom');
  await expect(page.locator('#status')).toHaveText('1 of 4 meet your limits.');
  await page.locator('#preset').selectOption('ebay');
  await page.locator('#demo').click();
  await expect(page.locator('#preset')).toHaveValue('custom');
  await expect(page.locator('#width')).toHaveValue('800');
  await expect(page.locator('#height')).toHaveValue('800');
  await expect(page.locator('#size')).toHaveValue('8');
  await expect(page.locator('#status')).toHaveText('1 of 2 meet your limits.', {timeout:15000});
});

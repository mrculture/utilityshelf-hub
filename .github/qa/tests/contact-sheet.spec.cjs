const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('photo order follows keyboard moves, columns and the downloaded PNG', async ({ page }) => {
  await page.goto('/utilities/image-contact-sheet/');
  await page.locator('#demo').click();
  const labels = page.locator('#names li > span');
  await expect(labels).toHaveText(['front.png', 'side.png', 'detail.png'], { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Move earlier: photo 1, front.png', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move later: photo 3, detail.png', exact: true })).toBeDisabled();
  const original = await page.locator('#sheet').evaluate(canvas => canvas.toDataURL());
  await page.getByRole('button', { name: 'Move earlier: photo 3, detail.png', exact: true }).press('Enter');
  await expect(labels).toHaveText(['front.png', 'detail.png', 'side.png']);
  const again = page.getByRole('button', { name: 'Move earlier: photo 2, detail.png', exact: true });
  await expect(again).toBeFocused();
  await again.press('Enter');
  await expect(labels).toHaveText(['detail.png', 'front.png', 'side.png']);
  await expect(page.locator('#orderedNames')).toHaveValue('detail.png\nfront.png\nside.png');
  await expect(page.getByRole('button', { name: 'Move later: photo 1, detail.png', exact: true })).toBeFocused();
  expect(await page.locator('#sheet').evaluate(canvas => canvas.toDataURL())).not.toBe(original);
  await page.locator('#columns').selectOption('2');
  await expect(labels).toHaveText(['detail.png', 'front.png', 'side.png']);
  await expect(page.locator('#orderedNames')).toHaveValue('detail.png\nfront.png\nside.png');
  await expect(page.locator('#status')).toContainText('600 × 464');
  const canvasPng = await page.locator('#sheet').evaluate(canvas => canvas.toDataURL().split(',')[1]);
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await pending;
  expect(fs.readFileSync(await download.path()).equals(Buffer.from(canvasPng, 'base64'))).toBe(true);
  await page.getByRole('button', { name: 'Move later: photo 1, detail.png', exact: true }).click();
  await expect(labels).toHaveText(['front.png', 'detail.png', 'side.png']);
  await page.locator('#demo').click();
  await expect(labels).toHaveText(['front.png', 'side.png', 'detail.png'], { timeout: 15000 });
});

test('ordered names copy into SKU numbering in the chosen photo order', async ({ page }) => {
  await page.goto('/utilities/image-contact-sheet/?test-mode=1');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedNames = text; } } }));
  await page.locator('#demo').click();
  await expect(page.locator('#names li')).toHaveCount(3, { timeout: 15000 });
  await page.getByRole('button', { name: 'Move earlier: photo 3, detail.png', exact: true }).click();
  await page.locator('#copyNames').click();
  await expect(page.locator('#namesCopyStatus')).toContainText('Copied 3 filenames');
  const copied = await page.evaluate(() => window.copiedNames);
  expect(copied).toBe('front.png\ndetail.png\nside.png');
  await expect(page.getByRole('link', { name: 'Open Filename Cleaner', exact: true })).toHaveAttribute('href', 'https://filename-cleaner.utilityshelf.site/?test-mode=1#five-photo-example');
  await page.goto('/tools/filename-cleaner/?test-mode=1');
  await page.locator('#names').fill(copied);
  await page.locator('#mode').selectOption('numbered');
  await page.locator('#prefix').fill('SKU-1042');
  await expect(page.locator('#result')).toHaveValue('sku-1042-001.png\nsku-1042-002.png\nsku-1042-003.png');
  await expect(page.locator('.original')).toHaveText(['front.png', 'detail.png', 'side.png']);
  await expect(page.locator('#downloadMapping')).toBeEnabled();
});

test('copy fallback selects current names and a rejected batch clears the old list', async ({ page }) => {
  await page.goto('/utilities/image-contact-sheet/');
  await expect(page.locator('#filenameOrder')).toBeHidden();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.locator('#demo').click();
  await expect(page.locator('#copyNames')).toBeEnabled({ timeout: 15000 });
  await page.locator('#copyNames').click();
  await expect(page.locator('#namesCopyStatus')).toContainText('Automatic copy is unavailable');
  expect(await page.locator('#orderedNames').evaluate(el => el.selectionEnd - el.selectionStart)).toBe('front.png\nside.png\ndetail.png'.length);
  await page.getByRole('button', { name: 'Move later: photo 1, front.png', exact: true }).click();
  await expect(page.locator('#namesCopyStatus')).toBeEmpty();
  await page.locator('#selectNames').click();
  await expect(page.locator('#orderedNames')).toHaveValue('side.png\nfront.png\ndetail.png');
  expect(await page.locator('#orderedNames').evaluate(el => el.selectionEnd)).toBe('side.png\nfront.png\ndetail.png'.length);
  await page.locator('#files').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('bad photo') });
  await expect(page.locator('#status')).toContainText('No readable photos');
  await expect(page.locator('#filenameOrder')).toBeHidden();
  await expect(page.locator('#orderedNames')).toHaveValue('');
  await expect(page.locator('#copyNames')).toBeDisabled();
});

test('a late clipboard response cannot report an old order as the current list', async ({ page }) => {
  await page.goto('/utilities/image-contact-sheet/');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise(resolve => { window.finishCopy = resolve; }) } }));
  await page.locator('#demo').click();
  await expect(page.locator('#copyNames')).toBeEnabled({ timeout: 15000 });
  await page.locator('#copyNames').click();
  await page.getByRole('button', { name: 'Move later: photo 1, front.png', exact: true }).click();
  await page.evaluate(() => window.finishCopy());
  await expect(page.locator('#namesCopyStatus')).toBeEmpty();
  await expect(page.locator('#orderedNames')).toHaveValue('side.png\nfront.png\ndetail.png');
});

test('a replacement single-photo batch has both move controls disabled', async ({ page }) => {
  await page.goto('/utilities/image-contact-sheet/');
  await page.locator('#demo').click();
  await expect(page.locator('#names li')).toHaveCount(3, { timeout: 15000 });
  const png = await page.locator('#sheet').evaluate(canvas => canvas.toDataURL().split(',')[1]);
  await page.locator('#files').setInputFiles({ name: 'one.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('#names li > span')).toHaveText(['one.png']);
  await expect(page.getByRole('button', { name: 'Move earlier: photo 1, one.png', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move later: photo 1, one.png', exact: true })).toBeDisabled();
  await expect(page.locator('#download')).toBeEnabled();
});

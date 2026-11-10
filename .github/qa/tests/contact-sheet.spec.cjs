const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('photo order follows keyboard moves, columns and the downloaded PNG', async ({ page }) => {
  await page.goto('/utilities/image-contact-sheet/');
  await page.locator('#demo').click();
  const labels = page.locator('#names li > span');
  await expect(labels).toHaveText(['front.png', 'side.png', 'detail.png']);
  await expect(page.getByRole('button', { name: 'Move earlier: photo 1, front.png', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move later: photo 3, detail.png', exact: true })).toBeDisabled();
  const original = await page.locator('#sheet').evaluate(canvas => canvas.toDataURL());
  await page.getByRole('button', { name: 'Move earlier: photo 3, detail.png', exact: true }).press('Enter');
  await expect(labels).toHaveText(['front.png', 'detail.png', 'side.png']);
  const again = page.getByRole('button', { name: 'Move earlier: photo 2, detail.png', exact: true });
  await expect(again).toBeFocused();
  await again.press('Enter');
  await expect(labels).toHaveText(['detail.png', 'front.png', 'side.png']);
  await expect(page.getByRole('button', { name: 'Move later: photo 1, detail.png', exact: true })).toBeFocused();
  expect(await page.locator('#sheet').evaluate(canvas => canvas.toDataURL())).not.toBe(original);
  await page.locator('#columns').selectOption('2');
  await expect(labels).toHaveText(['detail.png', 'front.png', 'side.png']);
  await expect(page.locator('#status')).toContainText('600 × 464');
  const canvasPng = await page.locator('#sheet').evaluate(canvas => canvas.toDataURL().split(',')[1]);
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await pending;
  expect(fs.readFileSync(await download.path()).equals(Buffer.from(canvasPng, 'base64'))).toBe(true);
  await page.getByRole('button', { name: 'Move later: photo 1, detail.png', exact: true }).click();
  await expect(labels).toHaveText(['front.png', 'detail.png', 'side.png']);
  await page.locator('#demo').click();
  await expect(labels).toHaveText(['front.png', 'side.png', 'detail.png']);
});

test('a replacement single-photo batch has both move controls disabled', async ({ page }) => {
  await page.goto('/utilities/image-contact-sheet/');
  await page.locator('#demo').click();
  await expect(page.locator('#names li')).toHaveCount(3);
  const png = await page.locator('#sheet').evaluate(canvas => canvas.toDataURL().split(',')[1]);
  await page.locator('#files').setInputFiles({ name: 'one.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('#names li > span')).toHaveText(['one.png']);
  await expect(page.getByRole('button', { name: 'Move earlier: photo 1, one.png', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move later: photo 1, one.png', exact: true })).toBeDisabled();
  await expect(page.locator('#download')).toBeEnabled();
});

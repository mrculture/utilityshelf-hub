const {test, expect} = require('@playwright/test');
const fs = require('node:fs');

test.beforeEach(async ({page, context}) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/utilities/bulk-barcode-checker/?test-mode=1');
});

async function runCheck(page, csv) {
  await page.locator('#source').fill(csv);
  await page.locator('#readHeaders').click();
  await page.locator('#check').click();
}

async function downloadReport(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#downloadReport').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('bulk-barcode-report.txt');
  return fs.readFileSync(await download.path(), 'utf8');
}

test('validates four GTIN formats, correct check digits, leading zeros and exact digit spelling', async ({page}) => {
  const valid = [['ITEM8', '96385074'], ['ITEM12', '036000291452'], ['ITEM13', '4006381333931'], ['ITEM14', '10012345000017']];
  const invalid = [['CHECK', '96385075'], ['LEFT', ' 036000291452'], ['UNICODE', '０36000291452'],
    ['EXPONENT', '3.6000291452E+10'], ['LENGTH', '123456789'], ['RIGHT', '4006381333931 ']];
  const blank = [['EMPTY', ''], ['SPACES', '   ']];
  const csv = ['SKU,GTIN', ...[...valid, ...invalid, ...blank].map(row => row.join(','))].join('\n');
  await runCheck(page, csv);
  await expect(page.locator('#summary')).toHaveText('4 valid · 6 invalid · 2 blank');
  await expect(page.locator('#skuColumn')).toHaveValue('0');
  await expect(page.locator('#barcodeColumn')).toHaveValue('1');
  await expect(page.locator('#source')).toHaveValue(csv);

  const rows = page.locator('#resultRows tr');
  const filter = page.locator('#resultFilter');
  await filter.selectOption('valid');
  await expect(rows).toHaveCount(4);
  for (const [index, [sku, code]] of valid.entries()) {
    const cells = rows.nth(index).getByRole('cell');
    await expect(cells.nth(1)).toHaveText(sku);
    await expect(cells.nth(2)).toHaveText(code);
    await expect(cells.nth(3)).toHaveText('Valid');
  }

  await filter.selectOption('invalid');
  await expect(rows).toHaveCount(6);
  await expect(rows.getByRole('cell', {name: 'Invalid', exact: true})).toHaveCount(6);
  await expect(rows.first()).toContainText(/check digit/i);
  await expect(rows.first().getByRole('cell').first()).toHaveText('6');
  await expect(rows.nth(4)).toContainText(/length|digits/i);

  await filter.selectOption('blank');
  await expect(rows).toHaveCount(2);
  await expect(rows.getByRole('cell', {name: 'Blank', exact: true}).and(rows.locator('td:nth-child(4)'))).toHaveCount(2);
  const report = await downloadReport(page);
  for (const [sku] of [...valid, ...invalid, ...blank]) expect(report).toContain(sku);
  for (const [, code] of valid) expect(report).toContain(code);
  expect(report).toMatch(/check digit/i);
});

test('a selected CSV can use custom headings, handles physical CSV lines, and stays in the browser', async ({page}) => {
  const requests = [];
  page.on('request', request => requests.push(request));
  const csv = 'Scanned identifier,Notes,Supplier reference\n96385074,"First line\nSecond line",0012\n036000291453,Ordinary,0013';
  const file = page.locator('#sourceFile');
  await expect(file).toBeEnabled();
  await file.setInputFiles({name: 'barcode-inventory.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
  await expect(page.locator('#source')).toHaveValue(csv);
  await page.locator('#readHeaders').click();
  await page.locator('#skuColumn').selectOption('2');
  await page.locator('#barcodeColumn').selectOption('0');
  await page.locator('#check').click();
  await expect(page.locator('#summary')).toHaveText('1 valid · 1 invalid · 0 blank');
  const rows = page.locator('#resultRows tr');
  await expect(rows.nth(0).locator('td').first()).toHaveText('2');
  await expect(rows.nth(0)).toContainText('0012');
  await expect(rows.nth(1).locator('td').first()).toHaveText('4');
  await expect(rows.nth(1)).toContainText('0013');
  const report = await downloadReport(page);
  expect(report).not.toMatch(/First line|Second line|Ordinary/);
  expect(requests.filter(request => request.method() !== 'GET' || new URL(request.url()).hostname !== '127.0.0.1')).toEqual([]);
});

test('sample and optional SKU work and editing the CSV disables stale reports', async ({page}) => {
  await page.locator('#sample').click();
  await expect(page.locator('#summary')).toHaveText('4 valid · 3 invalid · 1 blank');
  await expect(page.locator('#downloadReport')).toBeEnabled();

  await page.locator('#source').fill('GTIN\n036000291452\n4006381333931');
  await expect(page.locator('#downloadReport')).toBeDisabled();
  await expect(page.locator('#summary')).toBeHidden();
  await page.locator('#readHeaders').click();
  await expect(page.locator('#skuColumn')).toHaveValue('');
  await page.locator('#check').click();
  await expect(page.locator('#summary')).toHaveText('2 valid · 0 invalid · 0 blank');
  await expect(page.locator('#downloadReport')).toBeEnabled();
});

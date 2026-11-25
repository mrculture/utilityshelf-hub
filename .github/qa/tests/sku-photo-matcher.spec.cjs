const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const practicePack = path.resolve(__dirname, '../../../guides/samples/product-photo-practice-v1.zip');

test.beforeEach(async ({page, context}) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/utilities/sku-photo-matcher/?test-mode=1');
});

function practicePhotos() {
  const names = {
    'photos/01-pass-front.jpg': ['0012-001.jpg', 'image/jpeg'],
    'photos/02-pass-detail.png': ['0012-002.png', 'image/png'],
    'replacements/03-replacement.jpg': ['12-001.jpg', 'image/jpeg'],
    'photos/04-fail-file-size.png': ['A-1-001.png', 'image/png'],
    'photos/06-pass-packaging.webp': ['A-10-001.webp', 'image/webp'],
  };
  const script = 'import base64,json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n print(json.dumps([base64.b64encode(z.read(name)).decode() for name in sys.argv[2:]]))';
  const encoded = JSON.parse(execFileSync(process.platform === 'win32' ? 'python' : 'python3',
    ['-c', script, practicePack, ...Object.keys(names)], {encoding: 'utf8', maxBuffer: 16_000_000}));
  return Object.values(names).map(([name, mimeType], index) => ({name, mimeType, buffer: Buffer.from(encoded[index], 'base64')}));
}

function finding(page, text) {
  return page.locator('#findings tr').filter({has: page.getByRole('cell', {name: text, exact: true})});
}

async function downloadReport(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('sku-photo-match-report.txt');
  return fs.readFileSync(await download.path(), 'utf8');
}

test('five selected practice photos match the correct CSV SKU, including leading zeros and shared prefixes', async ({page}) => {
  const requests = [];
  page.on('request', request => requests.push(request));
  const csv = 'Title,SKU\n"Blue mug, small",0012\nSecond mug,12\nDetail,A-1\nPackaging,A-10';
  const photos = practicePhotos();
  await page.locator('#csvFile').setInputFiles({name: 'inventory.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
  await expect(page.locator('#csv')).toHaveValue(csv);
  await expect(page.locator('#skuColumn')).toHaveValue('1');
  await page.locator('#photos').setInputFiles([...photos].reverse());
  await page.locator('#match').click();
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.getByRole('cell', {name: 'Matched', exact: true})).toHaveCount(5);

  for (const [index, sku] of ['0012', '0012', '12', 'A-1', 'A-10'].entries()) {
    const row = finding(page, photos[index].name);
    await expect(row.getByRole('cell', {name: sku, exact: true})).toBeVisible();
  }
  const report = await downloadReport(page);
  for (const {name} of photos) expect(report).toContain(name);
  expect(report).not.toContain('Blue mug, small');
  expect(requests.filter(request => request.method() !== 'GET' || new URL(request.url()).hostname !== '127.0.0.1')).toEqual([]);
});

test('flags missing, extra and ambiguous files without allowing partial or leading-zero cross-matches', async ({page}) => {
  await page.locator('#csv').fill('Product,Code\nOne,0012\nTwo,12\nThree,A-1\nFour,A-10\nFive,Blue Mug\nSix,BLUE-MUG\nSeven,MISSING');
  await page.locator('#skuColumn').selectOption('1');
  const filenames = ['0012-001.jpg', '12-001.jpg', 'A-1-001.jpg', 'A-10-001.jpg', 'Blue_Mug_01.jpg',
    'A-100-001.jpg', '00012-001.jpg', 'A-1-100x.jpg', 'notes.txt'];
  await page.locator('#names').fill(filenames.join('\n'));
  await page.locator('#match').click();
  await expect(page.getByRole('cell', {name: 'Matched', exact: true})).toHaveCount(4);
  const conflict = finding(page, 'Blue_Mug_01.jpg');
  await expect(conflict.getByRole('cell', {name: 'Needs review', exact: true})).toBeVisible();
  for (const sku of ['Blue Mug', 'BLUE-MUG']) await expect(conflict).toContainText(sku);
  for (const filename of filenames.slice(5, 8)) {
    await expect(finding(page, filename).getByRole('cell', {name: 'Unmatched photo', exact: true})).toBeVisible();
  }
  await expect(finding(page, 'MISSING').getByRole('cell', {name: 'Missing photos', exact: true})).toBeVisible();
  await expect(finding(page, 'notes.txt').getByRole('cell', {name: 'Skipped', exact: true})).toBeVisible();

  const report = await downloadReport(page);
  for (const detail of ['MISSING', ...filenames]) expect(report).toContain(detail);
  for (const state of ['Matched', 'Missing photos', 'Unmatched photo', 'Needs review', 'Skipped']) expect(report).toContain(state);
});

test('matches literal supplier SKU spellings and keeps collisions with generated names under review', async ({page}) => {
  await page.locator('#csv').fill('SKU\nAB-123\nKIT.A\nBLUE BOX\nBLUE-BOX\n0012');
  await page.locator('#names').fill('ab-123_01.jpg\nkit.a-01.jpg\nab_123_02.jpg\nblue-box-01.jpg\n12-01.jpg');
  await page.locator('#match').click();
  await expect(page.locator('#summary')).toContainText('3 matched, 1 unmatched, 1 needing review');
  await expect(finding(page, 'ab-123_01.jpg').getByRole('cell', {name: 'AB-123', exact: true})).toBeVisible();
  await expect(finding(page, 'kit.a-01.jpg').getByRole('cell', {name: 'KIT.A', exact: true})).toBeVisible();
  await expect(finding(page, 'ab_123_02.jpg').getByRole('cell', {name: 'AB-123', exact: true})).toBeVisible();

  const report = await downloadReport(page);
  expect(report).toContain('Needs review\tBLUE BOX / BLUE-BOX\tblue-box-01.jpg');
  expect(report).toContain('Unmatched photo\t\t12-01.jpg');
  expect(report).toContain('Missing photos\t0012\t');
});

test('competing photo numbers and duplicate CSV SKUs never leave stale results available', async ({page}) => {
  await page.locator('#csv').fill('SKU,Title\nBOX,Box');
  await page.locator('#names').fill('BOX-1.jpg\nbox-001.png');
  await page.locator('#match').click();
  await expect(page.getByRole('cell', {name: 'Matched', exact: true})).toHaveCount(0);
  await expect(page.locator('#findings')).toContainText('Needs review');
  for (const filename of ['BOX-1.jpg', 'box-001.png']) await expect(page.locator('#findings')).toContainText(filename);

  await page.locator('#names').fill('BOX-002.png');
  await expect(page.locator('#download')).toBeHidden();
  await expect(page.locator('#results')).toBeHidden();
  await page.locator('#match').click();
  await expect(finding(page, 'BOX-002.png').getByRole('cell', {name: 'Matched', exact: true})).toBeVisible();

  await page.locator('#csv').fill('SKU,Title\nBOX,Box\nBOX,Other');
  await page.locator('#match').click();
  await expect(page.locator('#status')).toContainText(/duplicate.*SKU|SKU.*duplicate/i);
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#download')).toBeHidden();
});

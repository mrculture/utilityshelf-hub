const {test, expect} = require('@playwright/test');

test.beforeEach(async ({page, context}) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/utilities/supplier-csv-compare/?test-mode=1');
});

async function loadSnapshots(page, previous, current) {
  await page.locator('#previous').fill(previous);
  await page.locator('#current').fill(current);
  await page.locator('#readHeaders').click();
}

function rowFor(page, sku) {
  return page.locator('#resultRows tr').filter({has: page.getByRole('cell', {name: sku, exact: true})});
}

test('keeps the example and file controls disabled until the comparison script is ready', async ({page}) => {
  let startApp;
  const canLoad = new Promise(resolve => { startApp = resolve; });
  await page.route(url => url.pathname === '/utilities/supplier-csv-compare/app.js', async route => {
    await canLoad;
    await route.continue();
  });
  const example = page.getByRole('button', {name: 'Try supplier example'});
  try {
    await page.reload({waitUntil: 'commit'});
    await expect(example).toBeDisabled();
    await expect(page.locator('#readHeaders')).toBeDisabled();
    await expect(page.locator('#previousFile')).toBeDisabled();
    await expect(page.locator('#currentFile')).toBeDisabled();
  } finally {
    startApp();
  }
  await example.click();
  await expect(page.locator('#summary')).toHaveText('1 added · 1 missing · 2 changed · 1 unchanged');
});

test('compares added and missing products, price and stock changes, and equivalent decimals', async ({page}) => {
  const previous = 'SKU,Price,Stock\n0012,1.20,10\n12,2.00,8\nBOTH,4.00,2\nZERO,,\nEQUAL,1.5000,002\nOLD,9.00,2';
  const current = 'Stock,SKU,Price\n2,EQUAL,1.50\n9,12,2\n10,0012,1.35\n3,BOTH,4.50\n0,ZERO,0\n2,"NEW,SKU",9.99';
  await loadSnapshots(page, previous, current);
  await expect(page.locator('#previousSku')).toHaveValue('0');
  await expect(page.locator('#currentSku')).toHaveValue('1');
  await expect(page.locator('#currentPrice')).toHaveValue('2');
  await expect(page.locator('#currentStock')).toHaveValue('0');
  await page.locator('#compare').click();
  await expect(page.locator('#results')).toBeVisible();
  const summary = page.locator('#summary');
  for (const text of ['1 added', '1 missing', '4 changed', '1 unchanged']) {
    await expect(summary).toContainText(text);
  }

  await page.locator('#resultKind').selectOption('changed');
  await expect(page.locator('#resultRows tr')).toHaveCount(4);
  await expect(rowFor(page, 'EQUAL')).toHaveCount(0);
  await expect(rowFor(page, '0012').getByRole('cell')).toHaveText(['0012', '1.20', '1.35', '10', '10', 'Price']);
  await expect(rowFor(page, '12').getByRole('cell')).toHaveText(['12', '2.00', '2', '8', '9', 'Stock']);
  await expect(rowFor(page, 'BOTH').getByRole('cell')).toHaveText(['BOTH', '4.00', '4.50', '2', '3', 'Price and stock']);
  await expect(rowFor(page, 'ZERO').getByRole('cell')).toHaveText(['ZERO', 'Blank', '0', 'Blank', '0', 'Price and stock']);

  await page.locator('#resultKind').selectOption('added');
  await expect(page.locator('#resultRows tr')).toHaveCount(1);
  await expect(rowFor(page, 'NEW,SKU')).toContainText('9.99');
  await page.locator('#resultKind').selectOption('missing');
  await expect(page.locator('#resultRows tr')).toHaveCount(1);
  await expect(rowFor(page, 'OLD')).toContainText('9.00');
  await expect(page.locator('#previous')).toHaveValue(previous);
  await expect(page.locator('#current')).toHaveValue(current);
});

test('accepts separate column selections and invalidates a comparison after an edit', async ({page}) => {
  await loadSnapshots(page, 'Stock count,Part code,List cost\n4,0012,32.15', 'Trade,Units,ID\n33.95,4,0012');
  for (const [id, value] of Object.entries({previousSku: '1', previousPrice: '2', previousStock: '0', currentSku: '2', currentPrice: '0', currentStock: '1'})) {
    await page.locator('#' + id).selectOption(value);
  }
  await page.locator('#compare').click();
  await expect(page.locator('#summary')).toContainText('1 changed');
  await page.locator('#resultKind').selectOption('changed');
  await expect(rowFor(page, '0012')).toContainText('32.15');
  await expect(rowFor(page, '0012')).toContainText('33.95');

  await page.locator('#current').fill('SKU,Price,Stock\n0012,33.95,4\n0012,42.00,9');
  await expect(page.locator('#results')).toBeHidden();
  await page.locator('#previous').fill('SKU,Price,Stock\n0012,32.15,4');
  await page.locator('#readHeaders').click();
  await page.locator('#compare').click();
  await expect(page.locator('#status')).toContainText(/duplicate.*SKU|SKU.*duplicate/i);
  await expect(page.locator('#results')).toBeHidden();

  await page.locator('#current').fill('SKU,Price,Stock\n0012,32.150,4');
  await page.locator('#readHeaders').click();
  await page.locator('#compare').click();
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#summary')).toContainText('0 changed');
  await expect(page.locator('#summary')).toContainText('1 unchanged');
});

test('compares two selected CSV files without sending either snapshot', async ({page}) => {
  const requests = [];
  page.on('request', request => requests.push(request));
  const previous = 'SKU,Price,Stock\nKEEP,8.50,12\nOLD,3.50,5';
  const current = 'SKU,Price,Stock\nKEEP,9.50,10\nNEW,5.00,2';
  await page.locator('#previousFile').setInputFiles({name: 'previous.csv', mimeType: 'text/csv', buffer: Buffer.from(previous)});
  await page.locator('#currentFile').setInputFiles({name: 'current.csv', mimeType: 'text/csv', buffer: Buffer.from(current)});
  await expect(page.locator('#previous')).toHaveValue(previous);
  await expect(page.locator('#current')).toHaveValue(current);
  await page.locator('#readHeaders').click();
  await page.locator('#compare').click();

  const summary = page.locator('#summary');
  for (const text of ['1 added', '1 missing', '1 changed']) {
    await expect(summary).toContainText(text);
  }
  await expect(rowFor(page, 'KEEP')).toContainText('9.50');
  expect(requests.filter(request => request.method() !== 'GET' || new URL(request.url()).hostname !== '127.0.0.1')).toEqual([]);
});

test('keeps file read errors until the affected snapshot is corrected', async ({page}) => {
  const csv = 'SKU,Price,Stock\n0012,9.50,10';
  const utf16 = {name: 'supplier.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFF' + csv, 'utf16le')};
  const utf8 = {name: 'supplier.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)};
  const status = page.locator('#status');
  const previousError = 'Previous CSV: Save the file as UTF-8 and open it again.';
  const latestError = 'Latest CSV: Save the file as UTF-8 and open it again.';
  await page.locator('#sample').click();
  await page.locator('#previousFile').setInputFiles(utf16);
  await expect(status).toHaveText(previousError);
  await expect(page.locator('#results')).toBeHidden();
  await page.locator('#currentFile').setInputFiles(utf8);
  await expect(page.locator('#current')).toHaveValue(csv);
  await page.locator('#readHeaders').click();
  await expect(status).toHaveText(previousError);
  await expect(page.locator('#columnChoices')).toBeHidden();

  await page.locator('#currentFile').setInputFiles(utf16);
  await expect(status).toContainText(latestError);
  await expect(status).toContainText(previousError);
  await page.locator('#previous').fill(csv);
  await expect(status).toHaveText(latestError);
  await page.locator('#currentFile').setInputFiles(utf8);
  await expect(page.locator('#current')).toHaveValue(csv);
  await page.locator('#readHeaders').click();
  await page.locator('#compare').click();
  await expect(status).toHaveText('Comparison complete.');
  await expect(page.locator('#summary')).toHaveText('0 added · 0 missing · 0 changed · 1 unchanged');
});

test('flags header-only supplier exports without losing their comparison counts', async ({page}) => {
  const header = 'SKU,Price,Stock';
  const stock = header + '\n0012,9.50,10\n0013,0,0';
  for (const [previous, current, source, counts] of [
    [stock, header, 'Latest CSV', '0 added · 2 missing'],
    [header, stock, 'Previous CSV', '2 added · 0 missing'],
  ]) {
    await loadSnapshots(page, previous, current);
    await page.locator('#compare').click();
    await expect(page.locator('#summary')).toContainText(counts);
    await expect(page.locator('#status')).toContainText(source + ' has a header but no product rows.');
    await expect(page.locator('#resultRows tr')).toHaveCount(2);
  }
});

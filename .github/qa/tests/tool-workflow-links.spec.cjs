const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const hub = 'https://utilityshelf.site';
const dimension = hub + '/utilities/image-dimension-checker/';
const sheet = hub + '/utilities/image-contact-sheet/';
const filename = 'https://filename-cleaner.utilityshelf.site/';
const photoGuide = hub + '/guides/prepare-product-photos-for-ebay';
const photoMatcher = hub + '/utilities/sku-photo-matcher/';
const csvImport = 'https://csv-import-checker.utilityshelf.site/';
const mapper = hub + '/utilities/csv-column-mapper/';
const formula = hub + '/utilities/csv-formula-checker/';
const comparator = hub + '/utilities/supplier-csv-compare/';
const barcode = hub + '/utilities/bulk-barcode-checker/';
const csvGuide = hub + '/guides/prepare-supplier-csv-for-import';

const workflows = [
  [dimension, [hub + '/#product-photos', sheet, photoGuide]],
  [sheet, [dimension, filename, photoGuide]],
  [filename, [sheet, photoGuide + '#verify-listing-photos', photoGuide]],
  [csvImport, [hub + '/#supplier-csv', mapper, csvGuide]],
  [mapper, [csvImport, formula, csvGuide]],
  [formula, [mapper, comparator, csvGuide]],
  [comparator, [formula, csvGuide + '#verify-final-csv', csvGuide]],
];

// Keep production origins so cross-subdomain navigation uses the public link
// logic. Serve the three release packages locally and record tracking attempts.
async function serveSite(page) {
  const tracked = [];
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', {value: false}));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'static.cloudflareinsights.com' || url.pathname === '/usage') {
      tracked.push(url.href);
      return route.abort();
    }
    const packagePath = {
      [new URL(hub).hostname]: '',
      [new URL(filename).hostname]: '/tools/filename-cleaner',
      [new URL(csvImport).hostname]: '/tools/csv-import-checker',
    }[url.hostname];
    if (packagePath === undefined) return route.abort();
    const candidate = path.join(root, packagePath, url.pathname);
    const file = [candidate, candidate + '.html', path.join(candidate, 'index.html')]
      .find(item => fs.existsSync(item) && fs.statSync(item).isFile());
    if (!file) return route.fulfill({status: 404, body: 'Not found'});
    return route.fulfill({path: file});
  });
  return tracked;
}

function testUrl(url) {
  const result = new URL(url);
  result.searchParams.set('test-mode', '1');
  return result.href;
}

for (const [source, destinations] of workflows) {
  test('previous, next and guide all keep test mode from ' + source, async ({page}) => {
    const tracked = await serveSite(page);
    for (const [i, name] of ['Previous', 'Next', 'Guide'].entries()) {
      await page.goto(testUrl(source));
      const nav = page.getByRole('navigation', {name: /^(Product photo|Supplier CSV) workflow$/});
      await expect(nav.getByRole('link')).toHaveCount(3);
      const link = nav.getByRole('link', {name: new RegExp('^' + name + ':')});
      const destination = testUrl(destinations[i]);
      await expect(link).toHaveAttribute('href', destination);
      const navigation = page.waitForNavigation();
      await link.click();
      expect((await navigation).ok()).toBe(true);
      await expect(page).toHaveURL(destination);
      await expect(page.locator('#testModeNotice')).toBeVisible();
      const {hash} = new URL(destination);
      if (hash) await expect(page.locator(hash)).toBeVisible();
    }
    expect(tracked).toEqual([]);
  });
}

test('supplier guide keeps test mode when continuing to the CSV tools', async ({page}) => {
  const tracked = await serveSite(page);
  await page.goto(testUrl(csvGuide));
  await expect(page.locator('#testModeNotice')).toBeVisible();
  for (const destination of [csvImport, mapper, formula, comparator, photoMatcher, barcode]) {
    await expect(page.locator('article').locator('a[href="' + testUrl(destination) + '"]').first()).toBeVisible();
  }
  expect(tracked).toEqual([]);
});

test('supplier workflow opens the optional comparison with test mode intact', async ({page}) => {
  const tracked = await serveSite(page);
  await page.goto(testUrl(hub + '/#supplier-csv'));
  const link = page.locator('#supplier-csv a[href="' + testUrl(comparator) + '"]');
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(testUrl(comparator));
  await expect(page.getByRole('heading', {name: 'Supplier CSV Compare', exact: true})).toBeVisible();
  await expect(page.locator('#testModeNotice')).toBeVisible();
  expect(tracked).toEqual([]);
});

for (const [workflow, tool, linkName, title] of [
  ['product-photos', photoMatcher, 'match SKU-named photos', 'SKU Photo Matcher'],
  ['supplier-csv', barcode, 'Check catalogue barcodes', 'Bulk Barcode Checker'],
]) {
  test(title + ' opens from its homepage workflow in test mode', async ({page}) => {
    const tracked = await serveSite(page);
    await page.goto(testUrl(hub + '/#' + workflow));
    const link = page.locator('#' + workflow).getByRole('link', {name: linkName, exact: true});
    await expect(link).toHaveAttribute('href', testUrl(tool));
    await link.click();
    await expect(page).toHaveURL(testUrl(tool));
    await expect(page.getByRole('heading', {name: title, exact: true})).toBeVisible();
    await expect(page.locator('#testModeNotice')).toBeVisible();
    expect(tracked).toEqual([]);
  });
}

test('product photo guide opens SKU Photo Matcher in test mode', async ({page}) => {
  const tracked = await serveSite(page);
  await page.goto(testUrl(photoGuide + '#match-catalogue-photos'));
  const link = page.locator('article').locator('a[href="' + testUrl(photoMatcher) + '"]');
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(testUrl(photoMatcher));
  await expect(page.locator('#testModeNotice')).toBeVisible();
  expect(tracked).toEqual([]);
});

test('normal supplier guide visits retain the page-view beacon and ordinary tool links', async ({page}) => {
  await serveSite(page);
  await page.goto(csvGuide);
  await expect(page.locator('#testModeNotice')).toHaveCount(0);
  await expect(page.locator('script[src="https://static.cloudflareinsights.com/beacon.min.js"]')).toHaveCount(1);
  await expect(page.locator('article a[href="' + csvImport + '"]').first()).toBeVisible();
});

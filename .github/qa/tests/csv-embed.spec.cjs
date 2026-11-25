const {test: base, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const checker = 'https://csv-import-checker.utilityshelf.site';
const hub = 'https://utilityshelf.site';
const supplier = 'https://supplier.example';
const collector = 'https://filename-cleaner.utilityshelf.site/usage';
const collectorCode = fs.readFileSync(path.join(root, 'tools/filename-cleaner/_worker.js'));
const worker = import('data:text/javascript;base64,' + collectorCode.toString('base64')).then(module => module.default);
const testFile = {name: 'private-stock.csv', mimeType: 'text/csv', buffer: Buffer.from('SKU,Price,Title\n0012,0,Café')};

// Keep genuine browser origins and cross-origin frames. Both the HTTP responses
// and the Worker's Analytics Engine binding are local to this test.
const test = base.extend({
  partnerSite: async ({context}, use) => {
    const site = {snippet: '', posts: [], points: [], beacons: []};
    const env = {USAGE: {writeDataPoint: point => site.points.push(point)}};
    await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', {value: false}));
    await context.route('**/*', async route => {
      const original = route.request();
      const url = new URL(original.url());
      if (url.href === collector) {
        const headers = await original.allHeaders();
        if (original.method() === 'POST') site.posts.push(original.postData());
        const request = new Request(url, {method: original.method(), headers, body: original.postDataBuffer()});
        const response = await (await worker).fetch(request, env);
        return route.fulfill({status: response.status, headers: Object.fromEntries(response.headers)});
      }
      if (url.hostname.includes('cloudflareinsights.com')) {
        site.beacons.push(url.href);
        return route.abort();
      }
      if (url.origin === supplier) {
        return route.fulfill({contentType: 'text/html', body:
          '<!doctype html><title>Supplier portal</title><meta name="viewport" content="width=device-width, initial-scale=1">' +
          '<main><h1>Supplier stock</h1>' + site.snippet + '</main>'});
      }
      if (![checker, hub].includes(url.origin)) return route.abort();
      const basePath = url.origin === checker ? path.join(root, 'tools/csv-import-checker') : root;
      const candidate = path.join(basePath, url.pathname);
      const file = [candidate, candidate + '.html', path.join(candidate, 'index.html')]
        .find(item => fs.existsSync(item) && fs.statSync(item).isFile());
      return file ? route.fulfill({path: file}) : route.fulfill({status: 404});
    });
    await use(site);
  },
});

test('owner copies a working partner embed; sample, file and onward actions reach the collector', async ({page, context, partnerSite}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: checker});
  await page.goto(checker + '/for-websites/');
  await page.getByText('Use an assigned partner code').click();
  await page.locator('#partner').fill('unassigned-supplier');
  await expect(page.locator('#copy-code')).toBeDisabled();
  await page.locator('#partner').fill('supplier-pilot');
  await page.locator('#copy-code').click();
  await expect(page.locator('#copy-status')).toHaveText('Embed code copied.');
  partnerSite.snippet = await page.evaluate(() => navigator.clipboard.readText());
  // Windows writes CRLF to the clipboard while textarea.value always uses LF.
  expect(partnerSite.snippet.replaceAll('\r\n', '\n')).toBe(await page.locator('#embed-code').inputValue());

  const portal = await context.newPage();
  await portal.setViewportSize({width: 320, height: 690});
  await portal.goto(supplier);
  const frame = portal.frameLocator('iframe[title="CSV Import Checker"]');
  await expect(frame.getByRole('heading', {name: 'CSV Import Checker'})).toBeVisible();
  await expect(portal.getByRole('link', {name: 'Open the full CSV Import Checker'})).toHaveAttribute('href', checker + '/');
  await expect(frame.locator('header')).toBeHidden();
  await expect(frame.locator('#results')).toBeHidden();
  expect(await frame.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await portal.waitForLoadState('networkidle');
  expect(partnerSite.posts).toEqual([]);
  expect(partnerSite.beacons).toEqual([]);

  await frame.locator('#sample').click();
  await expect(frame.locator('#summary')).toContainText('2 issues');
  await expect(frame.locator('#summary')).toBeFocused();
  await expect(frame.locator('#issues li')).toHaveCount(2);
  await expect.poll(() => partnerSite.points.length).toBe(1);
  await frame.locator('#file').setInputFiles(testFile);
  await expect(frame.locator('#summary')).toContainText('checks passed');
  await frame.locator('#check').click();
  await expect.poll(() => partnerSite.points.length).toBe(2);
  const [next] = await Promise.all([portal.waitForEvent('popup'), frame.getByRole('link', {name: 'Map your columns'}).click()]);
  await expect(next).toHaveURL(hub + '/utilities/csv-column-mapper/');
  await expect.poll(() => partnerSite.points.length).toBe(3);
  expect(partnerSite.points).toEqual([
    ['check_complete', 'issues', 'sample'],
    ['check_complete', 'passed', 'custom'],
    ['onward_click', 'mapper', 'custom'],
  ].map(labels => ({indexes: ['csv-import-checker'], doubles: [1], blobs: [...labels, 'embed', 'supplier-pilot']})));
  expect(partnerSite.posts).toHaveLength(3);
  expect(partnerSite.posts.join('')).not.toMatch(/private-stock|0012|Café|Title|supplier\.example/);
});

test('preview and the sample supplier page support real checks without recording them', async ({page, partnerSite}) => {
  await page.goto(checker + '/for-websites/');
  const preview = page.frameLocator('#checker-preview');
  await preview.locator('#sample').click();
  await expect(preview.locator('#summary')).toContainText('2 issues');
  await preview.locator('#file').setInputFiles(testFile);
  await expect(preview.locator('#summary')).toContainText('checks passed');
  await page.locator('#supplier-example').click();
  await expect(page).toHaveURL(hub + '/examples/supplier-stock/');
  const demo = page.frameLocator('iframe[title="CSV Import Checker"]');
  const [practice] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', {name: 'Download stock CSV'}).click()]);
  await demo.locator('#file').setInputFiles(await practice.path());
  await expect(demo.locator('#issues li')).toHaveText([/Price.*columns 3 and 4/, /Line 3 has 3 fields/]);
  await expect(demo.getByRole('link', {name: 'Supplier CSV walkthrough'})).toHaveAttribute('href', /test-mode=1/);
  await page.waitForLoadState('networkidle');
  expect(partnerSite.posts).toEqual([]);
  expect(partnerSite.points).toEqual([]);
  expect(partnerSite.beacons).toEqual([]);
});

async function holdTracker(context) {
  let resume;
  const released = new Promise(resolve => { resume = resolve; });
  await context.route(checker + '/usage.js*', async route => {
    await released;
    await route.fallback();
  });
  return resume;
}

test('first embed actions work before usage.js arrives and retain their original input types', async ({page, context, partnerSite}) => {
  const resume = await holdTracker(context);
  partnerSite.snippet = '<iframe title="Checker" src="' + checker + '/?embed=1&amp;partner=supplier-pilot"></iframe>';
  await page.goto(supplier, {waitUntil: 'commit'});
  const frame = page.frameLocator('iframe');
  try {
    await frame.locator('#sample').click();
    await expect(frame.locator('#summary')).toContainText('2 issues');
    await frame.locator('#file').setInputFiles(testFile);
    await expect(frame.locator('#summary')).toContainText('checks passed');
    expect(partnerSite.posts).toEqual([]);
  } finally {
    resume();
  }
  await expect.poll(() => partnerSite.points.map(point => point.blobs)).toEqual([
    ['check_complete', 'issues', 'sample', 'embed', 'supplier-pilot'],
    ['check_complete', 'passed', 'custom', 'embed', 'supplier-pilot'],
  ]);
});

for (const optOut of [false, true]) {
  test('a standalone example keeps its tracking choice during a slow load, opt out: ' + optOut, async ({page, context, partnerSite}) => {
    const resume = await holdTracker(context);
    await page.goto(checker + '/#inventory-example', {waitUntil: 'commit'});
    try {
      await expect(page.locator('#summary')).toContainText('2 issues');
      if (optOut) {
        await page.locator('#usage').uncheck();
        await page.locator('#usage').check();
      }
      expect(partnerSite.posts).toEqual([]);
    } finally {
      resume();
    }
    await page.waitForLoadState('networkidle');
    expect(partnerSite.points.map(point => point.blobs)).toEqual(optOut ? [] : [['check_complete', 'issues', 'sample']]);
  });
}

for (const options of ['partner=supplier-demo', 'partner=supplier-pilot&amp;test-mode=1']) {
  test('embedded demo or test URL excludes checks with ' + options, async ({page, partnerSite}) => {
    partnerSite.snippet = '<iframe title="Checker" src="' + checker + '/?embed=1&amp;' + options + '#inventory-example"></iframe>';
    await page.goto(supplier);
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#source')).toHaveValue('');
    await expect(frame.locator('#results')).toBeHidden();
    await expect(frame.locator('#usage')).toBeDisabled();
    await frame.locator('#sample').click();
    await expect(frame.locator('#summary')).toContainText('2 issues');
    await frame.locator('#file').setInputFiles(testFile);
    await expect(frame.locator('#summary')).toContainText('checks passed');
    await page.waitForLoadState('networkidle');
    expect(partnerSite.posts).toEqual([]);
    expect(partnerSite.points).toEqual([]);
    expect(partnerSite.beacons).toEqual([]);
  });
}

test('the installer has a selectable standard snippet before its copy controls are ready', async ({page, partnerSite}) => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  await page.route('**/for-websites/install.js', async route => {
    await delayed;
    await route.fallback();
  });
  try {
    await page.goto(checker + '/for-websites/', {waitUntil: 'commit'});
    await expect(page.locator('#copy-code')).toBeDisabled();
    await expect(page.locator('#copy-link')).toBeDisabled();
    await expect(page.locator('#embed-code')).toHaveValue(/src="https:\/\/csv-import-checker\.utilityshelf\.site\/\?embed=1"/);
    await expect(page.locator('#direct-link')).toHaveValue(checker + '/');
    await page.getByText('Use an assigned partner code').click();
    await page.locator('#partner').fill('supplier-pilot');
  } finally {
    release();
  }
  await expect(page.locator('#copy-code')).toBeEnabled();
  await expect(page.locator('#copy-link')).toBeEnabled();
  await expect(page.locator('#embed-code')).toHaveValue(/embed=1&amp;partner=supplier-pilot/);
  expect(partnerSite.posts).toEqual([]);
});

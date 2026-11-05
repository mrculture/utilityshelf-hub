const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const sites = require('../sites.json');
const tracked = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
function resolveFile(site, pathname) {
  const file = path.join(root, site.dir, decodeURIComponent(pathname));
  return [file, file + '.html', path.join(file, 'index.html')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
}
test.beforeEach(async ({ context }) => {
  // Never send QA page views or fixtures to production services.
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addInitScript(() => localStorage.setItem('systemCareTourSeen', 'true'));
});
test('all tracked website JavaScript parses', () => {
  for (const file of tracked.filter(f => f.endsWith('.js') && !f.startsWith('.github/'))) {
    execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(path.join(root, file)), stdio: ['pipe', 'pipe', 'pipe'] });
  }
});
for (const site of sites) {
  const xml = fs.readFileSync(path.join(root, site.dir, 'sitemap.xml'), 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  test(`${site.dir || 'hub'} sitemap is valid and has unique URLs`, async ({page}) => {
    expect(urls.length).toBeGreaterThan(0);
    expect(new Set(urls).size).toBe(urls.length);
    await page.goto('/');
    expect(await page.evaluate(text => new DOMParser().parseFromString(text, 'application/xml').querySelector('parsererror')?.textContent || '', xml)).toBe('');
    for (const url of urls) {
      expect(new URL(url).origin).toBe(site.origin);
      expect(resolveFile(site, new URL(url).pathname), url).toBeTruthy();
    }
  });
  for (const url of urls) {
    const pathname = new URL(url).pathname;
    test(`page health: ${url}`, async ({page}) => {
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      page.on('response', response => { if (response.url().startsWith('http://127.0.0.1:4179') && response.status() >= 400) errors.push(response.url() + ' ' + response.status()); });
      const response = await page.goto('/' + site.dir + pathname.replace(/^\//, ''), {waitUntil: 'networkidle'});
      expect(response.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      expect((await page.title()).trim()).not.toBe('');
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url);
      await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
      const links = await page.locator('a[href], link[href], script[src], img[src]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href') || n.getAttribute('src')));
      for (const link of links) {
        const target = new URL(link, url);
        if (target.origin !== site.origin) continue;
        const file = resolveFile(site, target.pathname);
        expect(file, `${url} -> ${link}`).toBeTruthy();
        if (target.hash && /\.html$/.test(file)) {
          const html = fs.readFileSync(file, 'utf8');
          const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
          expect(ids, `${url} -> ${link}`).toContain(decodeURIComponent(target.hash.slice(1)));
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

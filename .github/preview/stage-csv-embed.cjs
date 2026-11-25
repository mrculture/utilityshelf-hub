// Stage the partner pilot separately from the three production deployments.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const out = process.argv[2];
if (!out || !path.isAbsolute(out) || fs.existsSync(out)) {
  throw new Error('Supply a new absolute staging directory.');
}
const project = 'utilityshelf-csv-embed-lab';
const checker = 'https://' + project + '.pages.dev';
const supplier = 'https://supplier-demo.' + project + '.pages.dev';
const dataset = 'utilityshelf_csv_embed_preview';
const assets = path.join(out, 'public');
const csvSource = 'tools/csv-import-checker/';
const samplePath = 'examples/supplier-stock/';
const originalChecker = 'https://csv-import-checker.utilityshelf.site';
const originalCollector = 'https://filename-cleaner.utilityshelf.site';
function copy(source, destination, rewrites = []) {
  let content = fs.readFileSync(path.join(root, source), 'utf8');
  for (const [before, after] of rewrites) {
    if (!content.includes(before)) throw new Error('Missing preview substitution in ' + source);
    content = content.replaceAll(before, after);
  }
  const target = path.join(assets, destination);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, content);
}
copy(csvSource + 'index.html', 'index.html', [[originalChecker, checker]]);
copy(csvSource + 'usage.js', 'usage.js', [
  [originalChecker, checker], [originalCollector, checker],
  // The pilot has no production page-view beacon, even if opened outside an iframe.
  ['document.head.append(beacon);', '/* No page-view beacon on the preview project. */']
]);
copy(csvSource + 'for-websites/index.html', 'for-websites/index.html', [
  [originalChecker, checker], ['https://utilityshelf.site/' + samplePath, supplier + '/' + samplePath]
]);
copy(csvSource + 'for-websites/install.js', 'for-websites/install.js');
copy(samplePath + 'index.html', samplePath + 'index.html', [[originalChecker, checker]]);
const exampleCsv = 'guides/samples/supplier-inventory-original.csv';
copy(exampleCsv, exampleCsv);
copy('tools/filename-cleaner/_worker.js', '_worker.js', [
  [originalCollector, checker], [originalChecker, checker], ['https://utilityshelf.site', supplier]
]);
copy(csvSource + '404.html', '404.html');
fs.writeFileSync(path.join(assets, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(assets, '_headers'), [
  '/*', '  X-Robots-Tag: noindex', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: no-referrer',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  "  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self' " + checker + "; base-uri 'self'; form-action 'self'",""
].join('\n'));
const analytics = [{binding: 'USAGE', dataset}];
fs.writeFileSync(path.join(out, 'wrangler.json'), JSON.stringify({
  name: project, compatibility_date: '2026-11-10', pages_build_output_dir: './public',
  analytics_engine_datasets: analytics, env: {preview: {analytics_engine_datasets: analytics}}
}, null, 2));

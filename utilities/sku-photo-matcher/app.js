import {matchPhotos, readColumns, MAX_BYTES, MAX_ENTRIES} from './matcher.js';

const byId = id => document.getElementById(id);
const csv = byId('csv');
const names = byId('names');
const column = byId('skuColumn');
const status = byId('status');
const results = byId('results');
const summary = byId('summary');
const filter = byId('filter');
const pageSize = 50;
let current = null;
let page = 0;
let csvRevision = 0;
let usingExampleCatalogue = false;
let usingExampleFilenames = false;

function track(action) {
  const source = usingExampleCatalogue || usingExampleFilenames ? 'sample' : 'custom';
  window.UtilityShelfUsage?.track('sku-photo-matcher', action, 'match', source);
}

function invalidate(message) {
  current = null;
  results.hidden = true;
  byId('findings').replaceChildren();
  status.textContent = message;
}

function refreshColumns(preferred) {
  column.replaceChildren(new Option('Choose a column', ''));
  column.disabled = true;
  try {
    const headers = readColumns(csv.value);
    for (const [index, heading] of headers.entries()) column.add(new Option(heading, String(index)));
    const previous = headers.indexOf(preferred);
    const skuIndex = headers.findIndex(heading => heading.trim().toLowerCase() === 'sku');
    const selected = previous >= 0 ? previous : skuIndex;
    if (selected >= 0) column.value = String(selected);
    else if (headers.length === 1) column.value = '0';
    column.disabled = false;
    return true;
  } catch (error) {
    status.textContent = error.message;
    return false;
  }
}

csv.addEventListener('input', () => {
  csvRevision++;
  usingExampleCatalogue = false;
  const preferred = column.selectedOptions[0]?.textContent;
  invalidate('Catalogue updated. Review the SKU column and match again.');
  refreshColumns(preferred);
});
column.addEventListener('change', () => invalidate('SKU column changed. Match again to refresh the report.'));
names.addEventListener('input', () => {
  usingExampleFilenames = false;
  invalidate('Photo list updated. Match again to refresh the report.');
});

byId('csvFile').addEventListener('change', async event => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;
  const revision = ++csvRevision;
  usingExampleCatalogue = false;
  input.value = '';
  csv.value = '';
  column.replaceChildren(new Option('Choose a column', ''));
  column.disabled = true;
  invalidate('Reading the supplier CSV…');
  try {
    if (file.size > MAX_BYTES) throw new Error('Choose a CSV up to 2 MiB.');
    const bytes = await file.arrayBuffer();
    if (revision !== csvRevision) return;
    try { csv.value = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
    catch { throw new Error('Save the CSV as UTF-8 and open it again.'); }
    if (refreshColumns()) status.textContent = 'Loaded ' + file.name + '. Review the SKU column and photo filenames.';
  } catch (error) {
    if (revision === csvRevision) status.textContent = error.message;
  }
});

for (const id of ['photos', 'folder']) {
  byId(id).addEventListener('change', event => {
    const input = event.currentTarget;
    if (!input.files.length) return;
    usingExampleFilenames = false;
    names.value = '';
    invalidate('Reading photo filenames…');
    try {
      if (input.files.length > MAX_ENTRIES) throw new Error('Choose up to 5,000 filenames at once.');
      const paths = Array.from(input.files, file => file.webkitRelativePath || file.name);
      if (paths.some(path => /[\r\n]/.test(path))) throw new Error('Rename files or folders containing a line break before matching.');
      names.value = paths.join('\n');
      status.textContent = 'Loaded ' + paths.length + ' filenames. Select Match photos to SKUs.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      input.value = '';
    }
  });
}

function match() {
  invalidate('Checking product and photo names…');
  try {
    current = matchPhotos(csv.value, column.value === '' ? null : Number(column.value), names.value);
    const {covered, total, pending, counts} = current;
    summary.textContent = 'Catalogue coverage (' + total + ' SKUs) — ' + covered + ' with confirmed photos, ' +
      counts['Missing photos'] + ' missing photos, ' + pending + ' awaiting review. File findings — ' +
      counts.Matched + ' matched, ' + counts['Unmatched photo'] + ' unmatched, ' +
      counts['Needs review'] + ' needing review, ' + counts.Skipped + ' skipped.';
    filter.value = '';
    page = 0;
    results.hidden = false;
    renderPage();
    status.textContent = 'Photo match complete.';
    track('check_complete');
  } catch (error) {
    status.textContent = error.message;
  }
}

function renderPage() {
  if (!current) return;
  const findings = filter.value ? current.findings.filter(row => row.kind === filter.value) : current.findings;
  const start = page * pageSize;
  const visible = findings.slice(start, start + pageSize);
  const fragment = document.createDocumentFragment();
  for (const {kind, sku, path, detail} of visible) {
    const row = document.createElement('tr');
    for (const value of [kind, sku, path, detail]) {
      const cell = document.createElement('td');
      cell.textContent = value || '—';
      row.append(cell);
    }
    fragment.append(row);
  }
  byId('findings').replaceChildren(fragment);
  byId('pageStatus').textContent = findings.length ? 'Showing ' + (start + 1) + '–' + (start + visible.length) + ' of ' + findings.length + ' findings.' : 'No findings in this category.';
  byId('pager').hidden = findings.length <= pageSize;
  byId('previous').disabled = page === 0;
  byId('next').disabled = start + visible.length >= findings.length;
}

filter.addEventListener('change', () => { page = 0; renderPage(); });
byId('previous').addEventListener('click', () => { page--; renderPage(); });
byId('next').addEventListener('click', () => { page++; renderPage(); });
byId('match').addEventListener('click', match);
byId('sample').addEventListener('click', () => {
  csvRevision++;
  usingExampleCatalogue = true;
  usingExampleFilenames = true;
  csv.value = 'SKU,Product\n0012,Mouse\n12,Keyboard\nA-1,Cable\nA-10,Adapter\nBlue Mug,Small mug\nBLUE-MUG,Large mug\nMISSING,Charger';
  names.value = '0012-01.jpg\n12-01.jpg\na-1-01.png\na-10-01.webp\nblue-mug-01.jpg\nOTHER-01.jpg';
  refreshColumns();
  match();
});

function printable(value) {
  return /[\u0000-\u001f\u007f]/.test(value) ? JSON.stringify(value) : value;
}

byId('download').addEventListener('click', () => {
  if (!current) return;
  const lines = ['UtilityShelf SKU Photo Matcher', summary.textContent, '', 'Finding\tSKU\tFilename\tDetails'];
  for (const {kind, sku, path, detail} of current.findings) lines.push([kind, sku, path, detail].map(printable).join('\t'));
  for (const [candidates, group] of current.ambiguousGroups) {
    lines.push('', 'Group ' + group.index + ' — SKUs sharing a filename prefix');
    for (const product of candidates) lines.push('Line ' + product.line + '\t' + printable(product.sku));
  }
  const url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], {type: 'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sku-photo-match-report.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  track('report_download');
});

for (const id of ['csvFile', 'photos', 'folder', 'match', 'sample']) byId(id).disabled = false;
if (csv.value) refreshColumns();

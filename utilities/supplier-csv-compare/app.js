import {readSnapshot, compareSnapshots, MAX_SNAPSHOT_BYTES} from './compare.js';

const byId = id => document.getElementById(id);
const fields = {sku: 'Sku', price: 'Price', stock: 'Stock'};
const pageSize = 50;
const status = byId('status');
const summary = byId('summary');
const resultKind = byId('resultKind');
const previousPage = byId('previousPage');
const nextPage = byId('nextPage');
const sources = ['previous', 'current'].map(key => ({
  key,
  label: key === 'previous' ? 'Previous CSV' : 'Latest CSV',
  text: byId(key),
  file: byId(key + 'File'),
  controls: Object.fromEntries(Object.entries(fields).map(([field, suffix]) => [field, byId(key + suffix)])),
  revision: 0,
}));
let snapshots = null;
let comparison = null;
let page = 1;

function clearResults() {
  comparison = null;
  page = 1;
  byId('results').hidden = true;
  summary.textContent = '';
  byId('pageStatus').textContent = '';
  byId('resultRows').replaceChildren();
}

function clearSnapshots(message) {
  snapshots = null;
  clearResults();
  byId('columnChoices').hidden = true;
  status.textContent = message;
}

for (const source of sources) {
  source.text.addEventListener('input', () => {
    source.revision++;
    clearSnapshots('CSV text changed. Select Read headers before comparing.');
  });

  source.file.addEventListener('change', async () => {
    const file = source.file.files[0];
    if (!file) return;
    const revision = ++source.revision;
    source.file.value = '';
    source.text.value = '';
    clearSnapshots('Reading ' + source.label.toLowerCase() + '…');
    try {
      if (file.size > MAX_SNAPSHOT_BYTES) throw new Error('Choose a file no larger than 2 MiB.');
      const bytes = await file.arrayBuffer();
      if (source.revision !== revision) return;
      try { source.text.value = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
      catch { throw new Error('Save the file as UTF-8 and open it again.'); }
      status.textContent = source.label + ' loaded. Select Read headers once both files are ready.';
    } catch (error) {
      if (source.revision === revision) status.textContent = source.label + ': ' + error.message;
    }
  });

  for (const control of Object.values(source.controls)) {
    control.addEventListener('change', () => {
      clearResults();
      status.textContent = 'Column choices changed. Select Compare by SKU to refresh the results.';
    });
  }
}

function readHeaders() {
  clearSnapshots('Reading both headers…');
  try {
    snapshots = Object.fromEntries(sources.map(source => [source.key, readSnapshot(source.text.value, source.label)]));
  } catch (error) {
    status.textContent = error.message;
    return false;
  }

  for (const {key, controls} of sources) {
    const {headers} = snapshots[key];
    for (const [field, control] of Object.entries(controls)) {
      control.replaceChildren(new Option('Choose a column', ''), ...headers.map((name, index) => new Option(name, String(index))));
      const match = headers.findIndex(name => name.trim().toLowerCase() === field);
      if (match !== -1) control.value = String(match);
    }
  }
  byId('columnChoices').hidden = false;
  status.textContent = 'Read ' + snapshots.previous.rows.length + ' previous rows and ' + snapshots.current.rows.length + ' latest rows. Review the column choices.';
  return true;
}

function compare() {
  clearResults();
  if (!snapshots) return;
  const selections = {};
  for (const {key, label, controls} of sources) {
    if (Object.values(controls).some(control => control.value === '')) {
      status.textContent = label + ': Choose a SKU, price and stock column.';
      return;
    }
    selections[key] = Object.fromEntries(Object.entries(controls).map(([field, control]) => [field, Number(control.value)]));
  }
  try { comparison = compareSnapshots(snapshots.previous, snapshots.current, selections); }
  catch (error) {
    status.textContent = error.message;
    return;
  }

  const {added, missing, changed, unchanged} = comparison;
  const counts = {changed: changed.length, added: added.length, missing: missing.length};
  summary.textContent = added.length + ' added · ' + missing.length + ' missing · ' + changed.length + ' changed · ' + unchanged + ' unchanged';
  for (const option of resultKind.options) {
    option.textContent = option.textContent.replace(/ \(\d+\)$/, '') + ' (' + counts[option.value] + ')';
  }
  resultKind.value = Object.keys(counts).find(kind => counts[kind]) ?? 'changed';
  status.textContent = 'Comparison complete.';
  byId('results').hidden = false;
  renderPage();
}

function appendRow(rows, record, kind) {
  const before = kind === 'changed' ? record.previous : kind === 'missing' ? record : null;
  const after = kind === 'changed' ? record.current : kind === 'added' ? record : null;
  const value = (product, field) => product ? (product[field].trim() ? product[field] : 'Blank') : 'Absent';
  const difference = kind === 'added' ? 'Added' : kind === 'missing' ? 'Missing'
    : record.priceChanged && record.stockChanged ? 'Price and stock' : record.priceChanged ? 'Price' : 'Stock';
  const cells = [record.sku, value(before, 'price'), value(after, 'price'), value(before, 'stock'), value(after, 'stock'), difference];
  const row = document.createElement('tr');
  for (const [index, text] of cells.entries()) {
    const cell = document.createElement('td');
    cell.textContent = text;
    if (kind === 'changed' && ((index === 2 && record.priceChanged) || (index === 4 && record.stockChanged))) cell.dataset.changed = '';
    row.append(cell);
  }
  rows.append(row);
}

function renderPage() {
  if (!comparison) return;
  const kind = resultKind.value;
  const products = comparison[kind];
  const pageCount = Math.max(1, Math.ceil(products.length / pageSize));
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, products.length);
  const rows = document.createDocumentFragment();
  for (const product of products.slice(start, end)) appendRow(rows, product, kind);
  byId('resultRows').replaceChildren(rows);
  byId('resultTable').hidden = !products.length;
  byId('resultPager').hidden = pageCount === 1;
  previousPage.disabled = page === 1;
  nextPage.disabled = page === pageCount;
  byId('pageStatus').textContent = products.length
    ? 'Showing products ' + (start + 1) + '–' + end + ' of ' + products.length + '. Page ' + page + ' of ' + pageCount + '.'
    : 'No ' + kind + ' products to show.';
}

resultKind.addEventListener('change', () => {
  page = 1;
  renderPage();
});
for (const [button, direction] of [[previousPage, -1], [nextPage, 1]]) {
  button.addEventListener('click', () => {
    page += direction;
    renderPage();
    if (button.disabled) (direction === 1 ? previousPage : nextPage).focus();
  });
}

byId('readHeaders').addEventListener('click', readHeaders);
byId('compare').addEventListener('click', compare);
byId('sample').addEventListener('click', () => {
  const examples = [
    'SKU,Price,Stock\n0012,7.50,14\n12,9.00,6\nSTABLE,2.00,5\nOLD-04,12.00,1',
    'Stock,SKU,Price\n14,0012,8.25\n0,12,9\n5,STABLE,2\n8,NEW-05,11.99',
  ];
  for (const [index, source] of sources.entries()) {
    source.revision++;
    source.text.value = examples[index];
  }
  if (readHeaders()) compare();
});

for (const control of [byId('readHeaders'), byId('sample'), ...sources.map(source => source.file)]) {
  control.disabled = false;
}

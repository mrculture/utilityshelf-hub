import {attachFileInput} from '../csv-column-mapper/csv.js';
import {readBarcodeCsv, checkBarcode} from './barcodes.js';

const byId = id => document.getElementById(id);
const source = byId('source');
const status = byId('status');
const barcodeColumn = byId('barcodeColumn');
const skuColumn = byId('skuColumn');
const filter = byId('resultFilter');
const pageSize = 100;
let table = null;
let findings = [];
let visible = [];
let page = 0;

function clearResults() {
  findings = [];
  visible = [];
  page = 0;
  byId('results').hidden = true;
  byId('resultRows').replaceChildren();
  byId('summary').textContent = '';
  byId('downloadReport').disabled = true;
}

function clearSource() {
  table = null;
  byId('mapping').hidden = true;
  clearResults();
  status.textContent = 'Select Read headers to use the current CSV.';
}

function fillColumnOptions(select, prompt, pattern) {
  select.replaceChildren(new Option(prompt, ''), ...table.headers.map((name, index) => new Option(name, String(index))));
  const matches = table.headers.map((name, index) => pattern.test(name.trim()) ? index : -1).filter(index => index >= 0);
  if (matches.length === 1) select.value = String(matches[0]);
}

function readHeaders() {
  clearSource();
  try {
    table = readBarcodeCsv(source.value);
  } catch (error) {
    status.textContent = error.message;
    return false;
  }
  fillColumnOptions(barcodeColumn, 'Choose a barcode column', /^(?:barcode|gtin|ean|upc)(?:[-_ ]?(?:8|12|13|14|a))?$/i);
  fillColumnOptions(skuColumn, 'Use CSV line only', /^(?:sku|seller[ _-]sku|product[ _-]sku)$/i);
  if (table.headers.length === 1) {
    barcodeColumn.value = '0';
    skuColumn.value = '';
  }
  byId('mapping').hidden = false;
  status.textContent = 'Read ' + table.rows.length + ' product rows. Review the selected columns.';
  return true;
}

function runCheck() {
  clearResults();
  if (!table || barcodeColumn.value === '' || skuColumn.value === barcodeColumn.value) {
    status.textContent = 'Choose a barcode column. If you include a SKU, select a different column for it.';
    return;
  }
  const counts = {Valid: 0, Invalid: 0, Blank: 0};
  findings = table.rows.map(({cells, start}) => {
    const barcode = cells[Number(barcodeColumn.value)];
    const sku = skuColumn.value === '' ? '' : cells[Number(skuColumn.value)];
    const finding = checkBarcode(barcode);
    counts[finding.status]++;
    return {line: start, sku, barcode, ...finding};
  });
  byId('summary').textContent = counts.Valid + ' valid · ' + counts.Invalid + ' invalid · ' + counts.Blank + ' blank';
  filter.value = 'all';
  applyFilter();
  byId('results').hidden = false;
  byId('downloadReport').disabled = false;
  status.textContent = 'Checked ' + findings.length + ' product rows.';
}

function applyFilter() {
  visible = filter.value === 'all' ? findings : findings.filter(row => row.status.toLowerCase() === filter.value);
  page = 0;
  showPage();
}

function showPage() {
  const start = page * pageSize;
  const end = Math.min(start + pageSize, visible.length);
  const body = document.createDocumentFragment();
  for (const row of visible.slice(start, end)) {
    const tr = document.createElement('tr');
    for (const value of [row.line, row.sku, row.barcode, row.status, row.detail]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    body.append(tr);
  }
  byId('resultRows').replaceChildren(body);
  byId('pageStatus').textContent = visible.length ? 'Showing rows ' + (start + 1) + '–' + end + ' of ' + visible.length + '.' : 'No rows match this filter.';
  byId('tableWrap').hidden = !visible.length;
  byId('pager').hidden = visible.length <= pageSize;
  byId('previous').disabled = page === 0;
  byId('next').disabled = end >= visible.length;
}

function downloadReport() {
  if (!findings.length) return;
  const lines = [
    'UtilityShelf bulk barcode report',
    byId('summary').textContent,
    'Checks cover GTIN length and check digit. Confirm product assignment separately.',
    'Barcode column: ' + JSON.stringify(table.headers[Number(barcodeColumn.value)]),
    'CSV line\tSKU\tBarcode\tResult\tDetails',
  ];
  for (const row of findings) {
    lines.push([row.line, JSON.stringify(row.sku), JSON.stringify(row.barcode), row.status, row.detail].join('\t'));
  }
  const url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], {type: 'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.download = 'bulk-barcode-report.txt';
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

source.addEventListener('input', clearSource);
attachFileInput(byId('sourceFile'), source, status);
byId('readHeaders').addEventListener('click', readHeaders);
byId('check').addEventListener('click', runCheck);
for (const select of [skuColumn, barcodeColumn]) {
  select.addEventListener('change', () => {
    clearResults();
    status.textContent = 'Column selection changed. Select Check barcodes to refresh the results.';
  });
}
filter.addEventListener('change', applyFilter);
byId('previous').addEventListener('click', () => { page--; showPage(); });
byId('next').addEventListener('click', () => { page++; showPage(); });
byId('downloadReport').addEventListener('click', downloadReport);
byId('sample').addEventListener('click', () => {
  source.value = 'SKU,Barcode\n0012,96385074\n12,036000291452\nLAP-13,4006381333931\nCASE-14,10012345000017\nCHECK,4006381333932\nSHORT,12345\nFORMAT,4.006E+12\nUNASSIGNED,';
  source.dispatchEvent(new Event('input'));
  if (readHeaders()) runCheck();
});
for (const key of ['sourceFile', 'readHeaders', 'sample']) byId(key).disabled = false;

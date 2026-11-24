import {csvRows} from '../csv-column-mapper/csv.js';

export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
export const MAX_SNAPSHOT_ROWS = 25_000;
const maxColumns = 128;
const maxHeaderCharacters = 8_192;

export function readSnapshot(text, label = 'CSV') {
  try {
    if (text.length > MAX_SNAPSHOT_BYTES || new TextEncoder().encode(text).length > MAX_SNAPSHOT_BYTES) {
      throw new Error('Use a CSV no larger than 2 MiB.');
    }
    if (text.includes('\0')) throw new Error('Save the file as a UTF-8 CSV.');

    const records = csvRows(text);
    const header = records.next().value;
    if (!header || header.cells.length < 3) {
      throw new Error('Use a comma-separated header with at least three columns for SKU, price and stock.');
    }
    const headers = header.cells;
    if (headers.length > maxColumns || headers.reduce((size, name) => size + name.length, 0) > maxHeaderCharacters) {
      throw new Error('Use up to 128 columns and shorten the header names.');
    }
    const names = headers.map(name => name.trim().toLowerCase());
    if (names.includes('') || new Set(names).size !== names.length) {
      throw new Error('Give each column a nonempty, distinct heading.');
    }

    const rows = [];
    for (const row of records) {
      if (row.cells.length !== headers.length) {
        throw new Error('Line ' + row.start + ' has ' + row.cells.length + ' fields. The header has ' + headers.length + '. Check separators and quoted values.');
      }
      if (rows.length === MAX_SNAPSHOT_ROWS) {
        throw new Error('Use up to 25,000 product rows per CSV.');
      }
      rows.push(row);
    }
    return {headers, rows};
  } catch (error) {
    throw new Error(label + ': ' + error.message);
  }
}

function normalizeNumber(value, field, location) {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  const price = field === 'price';
  const valid = price ? /^[0-9]+(?:\.[0-9]+)?$/ : /^[0-9]+$/;
  if (!valid.test(trimmed)) {
    throw new Error(location + ': ' + (price
      ? 'Use a blank price or non-negative digits with an optional decimal point, without currency symbols or separators.'
      : 'Use a blank stock value or non-negative whole-number digits.'));
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const integer = whole.replace(/^0+(?=[0-9])/, '');
  let fractionEnd = fraction.length;
  while (fractionEnd > 0 && fraction[fractionEnd - 1] === '0') fractionEnd--;
  const decimal = fraction.slice(0, fractionEnd);
  return decimal ? integer + '.' + decimal : integer;
}

function indexSnapshot(snapshot, columns, label) {
  const fields = [columns?.sku, columns?.price, columns?.stock];
  if (new Set(fields).size !== fields.length || fields.some(index => !Number.isInteger(index) || index < 0 || index >= snapshot.headers.length)) {
    throw new Error(label + ': Choose different columns for SKU, price and stock.');
  }

  const index = new Map();
  for (const {cells, start} of snapshot.rows) {
    const [sku, price, stock] = fields.map(column => cells[column]);
    const location = label + ' line ' + start;
    if (!sku.trim()) throw new Error(location + ': Enter a SKU for this product.');
    if (index.has(sku)) {
      throw new Error(location + ': Duplicate SKU already on line ' + index.get(sku).line + '. Keep one row per SKU before comparing.');
    }
    index.set(sku, {
      line: start,
      values: {sku, price, stock},
      priceKey: normalizeNumber(price, 'price', location),
      stockKey: normalizeNumber(stock, 'stock', location),
    });
  }
  return index;
}

export function compareSnapshots(previous, current, selections) {
  const previousProducts = indexSnapshot(previous, selections.previous, 'Previous CSV');
  const currentProducts = indexSnapshot(current, selections.current, 'Current CSV');
  const result = {added: [], missing: [], changed: [], unchanged: 0};

  for (const [sku, currentProduct] of currentProducts) {
    const previousProduct = previousProducts.get(sku);
    if (!previousProduct) {
      result.added.push(currentProduct.values);
      continue;
    }
    const priceChanged = previousProduct.priceKey !== currentProduct.priceKey;
    const stockChanged = previousProduct.stockKey !== currentProduct.stockKey;
    if (priceChanged || stockChanged) {
      result.changed.push({sku, previous: previousProduct.values, current: currentProduct.values, priceChanged, stockChanged});
    } else {
      result.unchanged++;
    }
  }

  for (const [sku, previousProduct] of previousProducts) {
    if (!currentProducts.has(sku)) result.missing.push(previousProduct.values);
  }
  return result;
}

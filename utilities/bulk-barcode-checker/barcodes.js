import {csvRows} from '../csv-column-mapper/csv.js';

export function readBarcodeCsv(text) {
  const maxBytes = 2 * 1024 * 1024;
  if (text.length > maxBytes || new TextEncoder().encode(text).length > maxBytes) {
    throw new Error('Choose a CSV up to 2 MiB.');
  }
  if (text.includes('\0')) throw new Error('Save the CSV using UTF-8 and try again.');

  const records = csvRows(text);
  const headers = records.next().value?.cells;
  if (!headers || headers.length > 128 || headers.some(header => !header.trim())) {
    throw new Error('Use a CSV header with 1 to 128 named columns.');
  }
  if (headers.join('').length > 8192) throw new Error('Shorten the CSV column headings to a combined 8,192 characters.');
  const names = headers.map(header => header.trim().toLowerCase());
  if (new Set(names).size !== names.length) throw new Error('Give each column a distinct header.');

  const rows = [];
  for (const row of records) {
    if (row.cells.length !== headers.length) {
      throw new Error('Line ' + row.start + ' has ' + row.cells.length + ' fields. The header has ' + headers.length + '.');
    }
    if (rows.length === 25_000) throw new Error('Use up to 25,000 product rows per file.');
    rows.push(row);
  }
  if (!rows.length) throw new Error('Add a product row below the header.');
  return {headers, rows};
}

export function checkBarcode(value) {
  if (!value.trim()) return {status: 'Blank', detail: 'No barcode supplied.'};
  if (/[^0-9]/.test(value)) return {status: 'Invalid', detail: 'Use digits 0–9 only. Check for spaces, punctuation or spreadsheet formatting.'};
  if (![8, 12, 13, 14].includes(value.length)) {
    return {status: 'Invalid', detail: value.length + ' digits supplied. Expected 8, 12, 13 or 14.'};
  }

  // Starting immediately before the check digit, the weights alternate 3, 1.
  let total = 0;
  let weight = 3;
  for (let i = value.length - 2; i >= 0; i--) {
    total += Number(value[i]) * weight;
    weight = 4 - weight;
  }
  const expected = (10 - total % 10) % 10;
  if (Number(value.at(-1)) !== expected) {
    return {status: 'Invalid', detail: 'Check digit mismatch. For the preceding digits, expected ' + expected + ' and found ' + value.at(-1) + '. Verify the full barcode.'};
  }
  return {status: 'Valid', detail: 'GTIN-' + value.length + ' length and check digit pass.'};
}

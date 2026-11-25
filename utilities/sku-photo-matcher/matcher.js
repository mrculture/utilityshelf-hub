import {csvRows} from '../csv-column-mapper/csv.js';

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ENTRIES = 5000;
const separators = ['-', '_', ' '];

function checkSize(text, label) {
  if (text.length > MAX_BYTES || new TextEncoder().encode(text).length > MAX_BYTES) {
    throw new Error(label + ' exceeds the 2 MiB limit.');
  }
  if (text.includes('\0')) throw new Error(label + ' contains a null character. Check the text encoding.');
}

export function readColumns(text) {
  checkSize(text, 'Supplier CSV');
  const headers = csvRows(text).next().value?.cells;
  if (!headers) throw new Error('Open or paste a supplier CSV with a header.');
  const keys = headers.map(name => name.trim().toLowerCase());
  if (keys.length > 128 || headers.join('').length > 8192) throw new Error('Use up to 128 columns and shorten the headings.');
  if (keys.includes('') || new Set(keys).size !== keys.length) throw new Error('Give each CSV column a distinct, nonblank heading.');
  return headers;
}

function indexProducts(text, column) {
  const headers = readColumns(text);
  if (!Number.isInteger(column) || column < 0 || column >= headers.length) throw new Error('Choose the SKU column.');
  const products = new Map();
  const byStyle = new Map(separators.map(separator => [separator, new Map()]));
  const rows = csvRows(text);
  rows.next();
  for (const {cells, start} of rows) {
    if (products.size === MAX_ENTRIES) throw new Error('Use up to 5,000 product rows per catalogue.');
    if (cells.length !== headers.length) throw new Error('Line ' + start + ' has ' + cells.length + ' fields. The header has ' + headers.length + '.');
    const sku = cells[column];
    if (!sku.trim()) throw new Error('Blank SKU on line ' + start + '. Give each product a SKU.');
    if (sku.length > 200) throw new Error('The SKU on line ' + start + ' exceeds Filename Cleaner’s 200-character prefix limit.');
    if (products.has(sku)) throw new Error('Duplicate SKU on lines ' + products.get(sku).line + ' and ' + start + '. Keep one row per SKU.');
    const product = {sku, line: start, matched: false, review: false};
    products.set(sku, product);
    // Filename Cleaner’s numbered mode uses these Unicode word groups and the selected separator.
    const words = sku.trim().normalize('NFC').toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu);
    if (!words || !/[\p{L}\p{N}]/u.test(sku) || /[\\/]/.test(sku)) continue;
    for (const [separator, groups] of byStyle) {
      const prefix = words.join(separator);
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix).push(product);
    }
  }
  if (!products.size) throw new Error('Add at least one product row beneath the CSV header.');
  return {products, byStyle};
}

export function matchPhotos(csv, column, names) {
  const {products, byStyle} = indexProducts(csv, column);
  checkSize(names, 'Filename list');
  const paths = names.split(/\r\n|\r|\n/).filter(line => line.trim());
  if (paths.length === 0) throw new Error('Choose photos or paste their filenames.');
  if (paths.length > MAX_ENTRIES) throw new Error('Use up to 5,000 filenames per check.');

  const findings = [];
  const positions = new Map();
  const ambiguousGroups = new Map();
  for (const path of paths) {
    const basename = path.split(/[\\/]/).at(-1);
    const extension = /\.(?:jpe?g|png|webp)$/i.exec(basename);
    if (!extension) {
      findings.push({kind: 'Skipped', path, sku: '', detail: 'Unsupported file extension.'});
      continue;
    }
    const stem = basename.slice(0, extension.index);
    const suffix = /([-_ ])([0-9]{1,6})$/u.exec(stem);
    const position = suffix && Number(suffix[2]);
    if (!position) {
      findings.push({kind: 'Unmatched photo', path, sku: '', detail: 'Expected a SKU followed by a separator and a positive position.'});
      continue;
    }
    const prefix = stem.slice(0, suffix.index).normalize('NFC').toLowerCase();
    const candidates = byStyle.get(suffix[1]).get(prefix);
    if (!candidates) {
      findings.push({kind: 'Unmatched photo', path, sku: '', detail: 'No catalogue SKU has this prefix.'});
      continue;
    }
    if (candidates.length > 1) {
      if (!ambiguousGroups.has(candidates)) {
        for (const product of candidates) product.review = true;
        const index = ambiguousGroups.size + 1;
        ambiguousGroups.set(candidates, {
          index,
          label: candidates.length <= 8 ? candidates.map(product => product.sku).join(' / ') : candidates.length + ' SKUs (group ' + index + ')',
        });
      }
      const group = ambiguousGroups.get(candidates);
      findings.push({kind: 'Needs review', path, sku: group.label, detail: 'Multiple SKUs share this prefix. Check the original photo or naming map against group ' + group.index + ' in the report.'});
      continue;
    }
    const product = candidates[0];
    if (!positions.has(product)) positions.set(product, new Map());
    const productPositions = positions.get(product);
    if (!productPositions.has(position)) productPositions.set(position, []);
    const finding = {kind: 'Matched', path, sku: product.sku, detail: 'Position ' + position + '.'};
    findings.push(finding);
    productPositions.get(position).push(finding);
  }

  if (findings.every(finding => finding.kind === 'Skipped')) throw new Error('Choose at least one JPG, JPEG, PNG or WebP filename.');
  for (const [product, numbered] of positions) {
    for (const [position, photos] of numbered) {
      if (photos.length === 1) {
        product.matched = true;
      } else {
        product.review = true;
        for (const photo of photos) {
          photo.kind = 'Needs review';
          photo.detail = photos.length + ' filenames claim position ' + position + '.';
        }
      }
    }
  }
  let covered = 0;
  for (const product of products.values()) {
    if (product.matched) covered++;
    else if (!product.review) findings.push({kind: 'Missing photos', path: '', sku: product.sku, detail: 'No matching photo in this selection.'});
  }
  const counts = {'Matched': 0, 'Missing photos': 0, 'Unmatched photo': 0, 'Needs review': 0, 'Skipped': 0};
  for (const finding of findings) counts[finding.kind]++;
  return {findings, counts, covered, pending: products.size - covered - counts['Missing photos'], total: products.size, ambiguousGroups};
}

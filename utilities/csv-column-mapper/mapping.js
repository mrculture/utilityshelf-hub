const uniqueHeaders = headers => Array.isArray(headers) && headers.length > 0 && headers.length <= 128 &&
  headers.every(h => typeof h === 'string' && h.trim()) &&
  new Set(headers.map(h => h.trim().toLowerCase())).size === headers.length;

export function reusableHeaders(headers) { return uniqueHeaders(headers); }

export function validateMapping(value) {
  const keys = ['format', 'version', 'sourceHeaders', 'destinationHeaders', 'columns'];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k)) ||
      value.format !== 'utilityshelf-column-mapping' || value.version !== 1 ||
      !uniqueHeaders(value.sourceHeaders) || !uniqueHeaders(value.destinationHeaders) ||
      !Array.isArray(value.columns) || value.columns.length !== value.destinationHeaders.length ||
      !value.columns.every(i => i === null || Number.isInteger(i) && i >= 0 && i < value.sourceHeaders.length)) {
    throw new Error('Choose a valid UtilityShelf mapping file (version 1) with distinct, nonblank headers and valid column choices.');
  }
  return value;
}

export function resolveMapping(saved, currentHeaders) {
  validateMapping(saved);
  if (!uniqueHeaders(currentHeaders)) throw new Error('Saved mappings need distinct, nonblank source headers. Correct the CSV headers first.');
  const missing = saved.sourceHeaders.filter(h => !currentHeaders.includes(h));
  const added = currentHeaders.filter(h => !saved.sourceHeaders.includes(h));
  if (missing.length || added.length) {
    const describe = names => names.slice(0, 8).map(n => JSON.stringify(n).slice(0, 100)).join(', ') + (names.length > 8 ? ' …' : '');
    throw new Error('Source headers changed. ' + (missing.length ? 'Missing or renamed: ' + describe(missing) + '. ' : '') +
      (added.length ? 'New or renamed: ' + describe(added) + '. ' : '') + 'Set up a new mapping and review every choice. Matching is case- and space-sensitive.');
  }
  return saved.columns.map(i => i === null ? 'empty' : String(currentHeaders.indexOf(saved.sourceHeaders[i])));
}

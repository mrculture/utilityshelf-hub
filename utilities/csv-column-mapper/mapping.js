const uniqueHeaders = headers => Array.isArray(headers) && headers.length > 0 && headers.length <= 128 &&
  headers.every(h => typeof h === 'string' && h.trim()) &&
  new Set(headers.map(h => h.trim().toLowerCase())).size === headers.length;

export function reusableHeaders(headers) { return uniqueHeaders(headers); }

export function validateMapping(value) {
  const keys = ['format', 'version', 'sourceHeaders', 'destinationHeaders', 'columns'];
  if ([2, 3].includes(value?.version)) keys.push('required');
  if (value?.version === 3) keys.push('unique', 'ignoreCase', 'trimWhitespace');
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k)) ||
      value.format !== 'utilityshelf-column-mapping' || ![1, 2, 3].includes(value.version) ||
      !uniqueHeaders(value.sourceHeaders) || !uniqueHeaders(value.destinationHeaders) ||
      !Array.isArray(value.columns) || value.columns.length !== value.destinationHeaders.length ||
      !value.columns.every(i => i === null || Number.isInteger(i) && i >= 0 && i < value.sourceHeaders.length) ||
      (value.version >= 2 && (!Array.isArray(value.required) || value.required.length !== value.destinationHeaders.length ||
        !value.required.every(flag => typeof flag === 'boolean'))) ||
      (value.version === 3 && (!Array.isArray(value.unique) || value.unique.length !== value.destinationHeaders.length ||
        !value.unique.every(flag => typeof flag === 'boolean') || typeof value.ignoreCase !== 'boolean' || typeof value.trimWhitespace !== 'boolean'))) {
    throw new Error('Choose a valid UtilityShelf mapping file (version 1, 2 or 3) with distinct, nonblank headers and valid check settings.');
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

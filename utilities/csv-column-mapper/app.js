import { csvRows, encodeRow, attachFileInput } from './csv.js';
import { reusableHeaders, validateMapping, resolveMapping } from './mapping.js?v=20261116-required-settings';
const byId = id => document.getElementById(id);
const source = byId('source'), target = byId('target'), message = byId('message');
let records = [], labels = [], controls = [], generated = '';
let inputSource = 'custom';
let sourceHeaders = [], mappingRevision = 0;
let mappingReport = '';
let requiredControls = [];
const mappingLimit = 64 * 1024;
const track = event => window.UtilityShelfUsage?.track('csv-column-mapper', event, 'mapped', inputSource);

function clearResult() {
  generated = '';
  mappingReport = '';
  byId('downloadReport').disabled = true;
  byId('reportStatus').textContent = '';
  byId('mappingSummary').textContent = '';
  byId('mappingDetails').replaceChildren();
  byId('omittedColumns').replaceChildren();
  byId('requiredSummary').textContent = '';
  byId('requiredFindings').replaceChildren();
  byId('result').hidden = true;
  byId('output').value = '';
}
function reset() {
  mappingRevision++;
  sourceHeaders = [];
  byId('saveMapping').disabled = true;
  records = [];
  labels = [];
  controls = [];
  requiredControls = [];
  byId('mapping').hidden = true;
  byId('choices').replaceChildren();
  clearResult();
  message.textContent = 'Select Set up mapping to read the current source and destination.';
}
function prepare(sampleColumns) {
  reset();
  try {
    if (!source.value.trim() || !target.value.trim()) throw new Error('Enter the source CSV and a destination header.');
    if (source.value.length > 2097152 || target.value.length > 8192) throw new Error('Use a smaller CSV extract or a shorter destination header.');
    const targetRecords = [...csvRows(target.value)];
    if (targetRecords.length !== 1) throw new Error('Enter a single CSV record for the destination headings.');
    const headings = targetRecords[0].cells;
    if (headings.some(h => !h.trim()) || new Set(headings.map(h => h.trim().toLowerCase())).size !== headings.length) {
      throw new Error('Give every destination column a distinct, nonblank name.');
    }
    const parsed = [...csvRows(source.value)];
    const columns = parsed[0].cells;
    if (headings.length > 128 || columns.length > 128) throw new Error('This tool supports up to 128 columns per header.');
    const uneven = parsed.find(row => row.cells.length !== columns.length);
    if (uneven) throw new Error('Line ' + uneven.start + ' has ' + uneven.cells.length + ' fields. The source header has ' + columns.length + '. Fix that row first.');
    records = parsed.slice(1);
    sourceHeaders = columns;
    labels = headings;
    const fields = document.createDocumentFragment();
    controls = headings.map((heading, i) => {
      const label = document.createElement('label');
      const select = document.createElement('select');
      select.id = 'source-' + i;
      label.htmlFor = select.id;
      label.textContent = 'Source for ' + heading;
      select.add(new Option('Choose a column', ''));
      select.add(new Option('Use empty values', 'empty'));
      columns.forEach((name, index) => select.add(new Option((index + 1) + '. ' + (name || '(blank header)'), String(index))));
      const matches = columns.flatMap((name, index) => name === heading ? [index] : []);
      if (sampleColumns) select.value = String(sampleColumns[i]);
      else if (matches.length === 1) select.value = String(matches[0]);
      select.addEventListener('change', () => {
        mappingRevision++;
        clearResult();
        updateSave();
        message.textContent = 'Select Build mapped CSV to apply the revised mapping.';
      });
      const required = document.createElement('input');
      required.type = 'checkbox'; required.id = 'required-' + i;
      const requiredLabel = document.createElement('label');
      requiredLabel.append(required, document.createTextNode(' Required value for ' + heading));
      required.addEventListener('change', () => {
        mappingRevision++;
        clearResult();
        message.textContent = 'Select Build mapped CSV to check the revised required fields. CSV values will not be changed.';
      });
      requiredControls.push(required);
      fields.append(label, select, requiredLabel);
      return select;
    });
    byId('choices').append(fields);
    byId('mapping').hidden = false;
    message.textContent = 'Read ' + records.length + ' data rows. Review the source chosen for each destination column.';
    updateSave();
    return true;
  } catch (err) {
    message.textContent = err.message;
    return false;
  }
}
function updateSave() {
  byId('saveMapping').disabled = !reusableHeaders(sourceHeaders) || !controls.length || controls.some(s => s.value === '');
}
function saveMapping() {
  if (byId('saveMapping').disabled) return;
  const saved = {format:'utilityshelf-column-mapping', version:2, sourceHeaders,
    destinationHeaders:labels, columns:controls.map(s => s.value === 'empty' ? null : Number(s.value)),
    required:requiredControls.map(control => control.checked)};
  const blob = new Blob([JSON.stringify(saved, null, 2) + '\n'], {type:'application/json;charset=utf-8'});
  if (blob.size > mappingLimit) { message.textContent = 'Mapping exceeds 64 KiB. Use shorter headers before saving.'; return; }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'utilityshelf-column-mapping.json'; link.click();
  message.textContent = 'Mapping download started. It contains headers, column choices and required-field choices, with no data rows.';
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
byId('saveMapping').addEventListener('click', saveMapping);
byId('loadMapping').addEventListener('click', () => byId('mappingFile').click());
byId('mappingFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  reset();
  const request = mappingRevision;
  message.textContent = 'Reading saved mapping…';
  try {
    if (file.size > mappingLimit) throw new Error('Choose a mapping file no larger than 64 KiB.');
    const text = await file.text();
    if (request !== mappingRevision) return;
    let saved;
    try { saved = validateMapping(JSON.parse(text.replace(/^\uFEFF/, ''))); }
    catch { throw new Error('Choose a valid UtilityShelf mapping file (version 1 or 2). The file was not applied.'); }
    if (!source.value.trim()) throw new Error('Open or paste your current source CSV before loading its mapping.');
    if (source.value.length > 2097152) throw new Error('Use a smaller CSV extract (up to 2 million characters).');
    const currentHeaders = csvRows(source.value).next().value.cells;
    const selections = resolveMapping(saved, currentHeaders);
    const destination = encodeRow(saved.destinationHeaders);
    if (destination.length > 8192) throw new Error('The saved destination header exceeds the supported limit.');
    target.value = destination;
    if (prepare(selections)) {
      requiredControls.forEach((control, index) => { control.checked = saved.version === 2 ? saved.required[index] : false; });
      message.textContent = 'Mapping loaded by exact header name. ' +
        (saved.version === 2 ? 'Required-field choices restored for the destination columns. ' : 'Older mapping: required-field choices were not saved, so all start off. ') +
        'Review every choice, then select Build mapped CSV. No export has been created yet.';
    }
  } catch (err) {
    if (request === mappingRevision) message.textContent = err.message;
  }
});
function build() {
  clearResult();
  const mapping = controls.map(s => s.value);
  const missing = mapping.indexOf('');
  if (missing !== -1) {
    message.textContent = 'Choose a source for ' + labels[missing] + '.';
    controls[missing].focus();
    return;
  }
  const maxCharacters = 4 * 1024 * 1024;
  const rows = [encodeRow(labels)];
  let length = rows[0].length + 2;
  const requiredIndices = requiredControls.flatMap((control,index) => control.checked ? [index] : []);
  const requiredCheck = {indices:requiredIndices, count:0, affectedRows:0, findings:[]};
  const lineBreaks = text => (text.match(/\r\n|\r|\n/g) || []).length;
  let outputLine = lineBreaks(rows[0]) + 2;
  for (const [rowIndex, { cells, start:sourceLine }] of records.entries()) {
    const values = mapping.map(index => index === 'empty' ? '' : cells[Number(index)]);
    const minimumLength = values.reduce((size, value) => size + value.length, values.length - 1) + 2;
    // A mapping can duplicate the same long source cell many times. Check before joining it.
    const encoded = length + minimumLength <= maxCharacters ? encodeRow(values) : null;
    if (encoded === null || length + encoded.length + 2 > maxCharacters) {
      message.textContent = 'Mapped CSV exceeds the 4,194,304-character export limit. Choose fewer destination columns or a smaller source extract.';
      return;
    }
    rows.push(encoded);
    length += encoded.length + 2;
    let rowMissing = false;
    for (const index of requiredIndices) {
      if (values[index].trim() !== '') continue;
      requiredCheck.count++; rowMissing = true;
      if (requiredCheck.findings.length < 100) requiredCheck.findings.push(
        'Data row ' + (rowIndex + 1) + ' (CSV record ' + (rowIndex + 2) + '), destination column ' + (index + 1) + ' ' + JSON.stringify(labels[index]) +
        ': ' + (mapping[index] === 'empty' ? 'empty value inserted by mapping' : values[index] === '' ? 'blank cell' : 'whitespace-only value') +
        '. Source line ' + sourceLine + '; mapped CSV line ' + outputLine + '.');
    }
    if (rowMissing) requiredCheck.affectedRows++;
    outputLine += lineBreaks(encoded) + 1;
  }
  generated = rows.join('\r\n') + '\r\n';
  summarizeMapping(mapping, rows.length - 1, requiredCheck);
  byId('output').value = rows.slice(0, 6).join('\n');
  byId('result').hidden = false;
  message.textContent = 'Ready to download ' + records.length + ' data rows in ' + labels.length + ' destination columns.';
  if (requiredCheck.count) message.textContent += ' Required-field issues found: review them before importing. CSV values are unchanged.';
  track('build_complete');
}

function summarizeMapping(mapping, outputRows, requiredCheck) {
  const used = new Set(mapping.filter(index => index !== 'empty').map(Number));
  const omitted = sourceHeaders.flatMap((name, index) => used.has(index) ? [] : [{name, index}]);
  const emptyCount = mapping.filter(index => index === 'empty').length;
  const quote = name => JSON.stringify(name);
  const summary = 'Input: ' + records.length + ' data rows, ' + sourceHeaders.length + ' columns. Output: ' + outputRows + ' data rows, ' + labels.length + ' columns. Row order preserved; no data rows removed.';
  const counts = 'Source columns omitted: ' + omitted.length + '. Destination columns using empty values: ' + emptyCount + ' (' + (emptyCount * outputRows) + ' inserted blank cells).';
  byId('mappingSummary').textContent = summary + ' ' + counts;
  const lines = ['UtilityShelf CSV mapping report', 'Status: Export prepared', summary, counts, '', 'Destination mapping (positions are 1-based):'];
  mapping.forEach((selection, destination) => {
    const index = selection === 'empty' ? null : Number(selection);
    const from = index === null ? 'Use empty values' : (index + 1) + '. ' + quote(sourceHeaders[index]);
    const to = (destination + 1) + '. ' + quote(labels[destination]);
    const changes = [];
    if (index === null) changes.push('Empty values inserted in all ' + outputRows + ' data rows');
    else {
      if (sourceHeaders[index] !== labels[destination]) changes.push('Renamed');
      if (index !== destination) changes.push('Moved from position ' + (index + 1) + ' to ' + (destination + 1));
      if (mapping.filter(value => value === selection).length > 1) changes.push('Source reused in multiple destinations');
      if (!changes.length) changes.push('Same heading and position');
    }
    const note = changes.join('; ');
    const tr = document.createElement('tr');
    for (const value of [to, from, note]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
    byId('mappingDetails').append(tr);
    lines.push(to + ' <- ' + from + ' | ' + note);
  });
  lines.push('', 'Omitted source columns:');
  const descriptions = omitted.length ? omitted.map(({name,index}) => (index + 1) + '. ' + quote(name)) : ['None.'];
  for (const description of descriptions) {
    const li = document.createElement('li'); li.textContent = description; byId('omittedColumns').append(li);
    lines.push(description);
  }
  lines.push('', ...summarizeRequired(requiredCheck, outputRows));
  lines.push('', 'Scope: This describes the prepared mapped.csv export, not importer acceptance or formula safety.',
    'Counts exclude the header. Inserted blanks count only destinations set to Use empty values; existing blank source cells are not counted.',
    'No cell values are transformed or sanitised. Headers are quoted with escaped control characters. This report contains headings and choices, not product-row contents.',
    'Keep this report with its exact CSV. Rebuild and download both again after any input or mapping change.');
  mappingReport = lines.join('\r\n') + '\r\n';
  byId('downloadReport').disabled = false;
}

function summarizeRequired(check, outputRows) {
  let summary;
  if (!check.indices.length) summary = 'Required fields: Not checked — no destination columns selected.';
  else if (!outputRows) summary = 'Required fields: Not checked — no data rows to check.';
  else if (check.count) summary = 'Required fields: Issues found — ' + check.count + ' missing values across ' + check.affectedRows + ' data rows.';
  else summary = 'Required fields: Passed — no missing values in ' + check.indices.length + ' selected columns across ' + outputRows + ' data rows.';
  const selected = check.indices.length ? check.indices.map(index => (index + 1) + '. ' + JSON.stringify(labels[index])).join(', ') : 'None.';
  const scope = 'Selected required destination columns: ' + selected;
  const limit = check.count > 100 ? 'Showing first 100 of ' + check.count + ' findings. All data rows were checked.' : '';
  byId('requiredSummary').textContent = summary + ' ' + scope + (limit ? ' ' + limit : '');
  for (const finding of check.findings) {
    const item = document.createElement('li'); item.textContent = finding; byId('requiredFindings').append(item);
  }
  return [summary, scope, ...(limit ? [limit] : []), ...check.findings,
    'Data rows exclude the header; CSV records include it. Source and mapped CSV line numbers identify the start of each record, including multiline fields.',
    'Only presence is checked: empty or whitespace-only values are missing; 0 and 0.00 are present. Values are not trimmed, filled or removed. This does not validate numeric ranges, unique IDs or importer-specific rules.'];
}

byId('downloadReport').addEventListener('click', () => {
  if (!generated || !mappingReport) return;
  const url = URL.createObjectURL(new Blob([mappingReport], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = 'csv-mapping-report.txt'; link.click();
  byId('reportStatus').textContent = 'Mapping report download started. Keep it with this mapped CSV; rebuild and download both after changes.';
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});

source.addEventListener('input', () => { inputSource = 'custom'; reset(); });
target.addEventListener('input', reset);
byId('prepare').addEventListener('click', () => prepare());
byId('generate').addEventListener('click', build);
byId('sample').addEventListener('click', () => {
  source.value = 'Supplier title,Unit cost,Stock code,Internal note\n"Mug, blue",7.50,0012,Spring range\n"Desk frame, 5""",9.25,0013,For review';
  source.dispatchEvent(new Event('input'));
  inputSource = 'sample';
  target.value = 'SKU,Title,Price';
  prepare([2,0,1]);
  build();
});
byId('download').addEventListener('click', () => {
  if (!generated) return;
  const url = URL.createObjectURL(new Blob([generated], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mapped.csv';
  link.click();
  track('mapped_download');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});
attachFileInput(byId('file'), source, message);

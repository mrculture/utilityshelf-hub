import { csvRows, encodeRow, attachFileInput } from './csv.js';
const byId = id => document.getElementById(id);
const source = byId('source'), target = byId('target'), message = byId('message');
let records = [], labels = [], controls = [], generated = '';

function clearResult() {
  generated = '';
  byId('result').hidden = true;
  byId('output').value = '';
}
function reset() {
  records = [];
  labels = [];
  controls = [];
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
        clearResult();
        message.textContent = 'Select Build mapped CSV to apply the revised mapping.';
      });
      fields.append(label, select);
      return select;
    });
    byId('choices').append(fields);
    byId('mapping').hidden = false;
    message.textContent = 'Read ' + records.length + ' data rows. Review the source chosen for each destination column.';
  } catch (err) {
    message.textContent = err.message;
  }
}
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
  for (const { cells } of records) {
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
  }
  generated = rows.join('\r\n') + '\r\n';
  byId('output').value = rows.slice(0, 6).join('\n');
  byId('result').hidden = false;
  message.textContent = 'Ready to download ' + records.length + ' data rows in ' + labels.length + ' destination columns.';
}

source.addEventListener('input', reset);
target.addEventListener('input', reset);
byId('prepare').addEventListener('click', () => prepare());
byId('generate').addEventListener('click', build);
byId('sample').addEventListener('click', () => {
  source.value = 'Supplier title,Unit cost,Stock code,Internal note\n"Mug, blue",7.50,0012,Spring range\n"Desk frame, 5""",9.25,0013,For review';
  source.dispatchEvent(new Event('input'));
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
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});
attachFileInput(byId('file'), source, message);

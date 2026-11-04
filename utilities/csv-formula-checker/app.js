import { csvRows, attachFileInput } from '../csv-column-mapper/csv.js';
const byId = id => document.getElementById(id);
const source = byId('source'), summary = byId('summary'), issues = byId('issues');

function reason(value) {
  const prefix = value.trimStart()[0] || '';
  if (prefix && '=+-@＝＋－＠'.includes(prefix)) {
    return /^[+-]\d+(?:\.\d+)?$/.test(value.trim()) ? 'Signed number; check that this is an intended amount.' : 'Potential formula prefix ' + prefix + '.';
  }
  return /^[ \u00a0]*[\r\n\t]/.test(value) ? 'Leading tab or line break.' : '';
}

function scan() {
  issues.replaceChildren();
  if (!source.value.trim()) { summary.textContent = 'Enter a header or some data to check.'; return; }
  if (source.value.length > 2097152) { summary.textContent = 'Use a smaller extract (up to 2 million characters).'; return; }
  let scanned = 0, found = 0, row = 0;
  const results = document.createDocumentFragment();
  try {
    const separator = { comma: ',', semicolon: ';', tab: '\t' }[byId('delimiter').value];
    for (const { cells, start } of csvRows(source.value, separator)) {
      row++;
      cells.forEach((value, index) => {
        scanned++;
        const explanation = reason(value);
        if (!explanation) return;
        found++;
        if (found > 100) return;
        const li = document.createElement('li');
        const example = document.createElement('code');
        example.textContent = JSON.stringify(value.slice(0, 80)) + (value.length > 80 ? '…' : '');
        li.append('Record ' + row + ' (line ' + start + '), column ' + (index + 1) + ' — ' + explanation + ' ', example);
        results.append(li);
      });
    }
    issues.append(results);
    summary.textContent = found + (found === 1 ? ' field' : ' fields') + ' to review out of ' + scanned + ' checked.' + (found > 100 ? ' Showing the first 100.' : '');
  } catch (err) {
    summary.textContent = 'Scan incomplete. ' + err.message;
  }
}

function reset() {
  issues.replaceChildren();
  summary.textContent = 'Select Check fields to scan the current input.';
}
source.addEventListener('input', reset);
byId('delimiter').addEventListener('change', reset);
byId('scan').addEventListener('click', scan);
byId('sample').addEventListener('click', () => {
  source.value = 'Order,Customer note,Adjustment\n1001,"=SUM(2,3)",-12.50\n1002,"Leave at desk, please",0\n1003,"  @review",0';
  source.dispatchEvent(new Event('input'));
  byId('delimiter').value = 'comma';
  scan();
});
attachFileInput(byId('file'), source, summary);

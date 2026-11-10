import { csvRows, attachFileInput } from '../csv-column-mapper/csv.js';
const byId = id => document.getElementById(id);
const source = byId('source'), summary = byId('summary'), issues = byId('issues');
let inputSource = 'custom';
const downloadReport = byId('downloadReport');
let reportText = null, reportInput = null, reportDelimiter = null, reportMode = null;
function invalidateReport() {
  reportText = null; reportInput = null; reportDelimiter = null; reportMode = null;
  downloadReport.disabled = true;
  byId('reportStatus').textContent = 'Run a check to create a report.';
}
function prepareReport(status, details) {
  reportInput = source.value; reportDelimiter = byId('delimiter').value;
  reportMode = status === 'Passed' ? 'passed' : status === 'Issues found' ? 'issues' : 'incomplete';
  reportText = ['UtilityShelf - CSV Formula Checker report', 'Status: ' + status,
    'Separator: ' + byId('delimiter').selectedOptions[0].textContent, summary.textContent, '', 'Details:',
    ...details.map((line, index) => (index + 1) + '. ' + line), '',
    'Next step: review the intended values. Signed numbers can be legitimate amounts. For intended literal text, use your spreadsheet\'s text-import settings. Correct only confirmed errors and scan the saved file again.',
    'Scope: formula-prefix warnings only. This report does not guarantee spreadsheet safety or validate the import schema.',
    'Records include the header. Line numbers refer to the physical start of each record. Field previews are limited to 80 characters.'].join('\r\n') + '\r\n';
  byId('reportStatus').textContent = 'Report status: ' + status + '.';
  downloadReport.disabled = false;
}

function reason(value) {
  const prefix = value.trimStart()[0] || '';
  if (prefix && '=+-@＝＋－＠'.includes(prefix)) {
    return /^[+-]\d+(?:\.\d+)?$/.test(value.trim()) ? 'Signed number; check that this is an intended amount.' : 'Potential formula prefix ' + prefix + '.';
  }
  return /^[ \u00a0]*[\r\n\t]/.test(value) ? 'Leading tab or line break.' : '';
}

function scan() {
  invalidateReport();
  issues.replaceChildren();
  if (!source.value.trim()) { summary.textContent = 'Enter a header or some data to check.'; return; }
  if (source.value.length > 2097152) {
    summary.textContent = 'Scan incomplete. Use a smaller extract (up to 2 million characters).';
    prepareReport('Check incomplete', ['No fields were checked because the input exceeds the supported limit.']);
    return;
  }
  let scanned = 0, found = 0, row = 0;
  const results = document.createDocumentFragment();
  const findings = [];
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
        const location = 'Record ' + row + ' (line ' + start + '), column ' + (index + 1) + ' — ' + explanation + ' ';
        li.append(location, example);
        findings.push(location + example.textContent);
        results.append(li);
      });
    }
    issues.append(results);
    summary.textContent = found + (found === 1 ? ' field' : ' fields') + ' to review out of ' + scanned + ' checked.' + (found > 100 ? ' Showing the first 100.' : '');
    prepareReport(found ? 'Issues found' : 'Passed', found ? findings : ['No formula-prefix warnings found in the checked fields.']);
    window.UtilityShelfUsage?.track('csv-formula-checker', 'scan_complete', found ? 'warnings' : 'clear', inputSource);
  } catch (err) {
    issues.append(results);
    summary.textContent = 'Scan incomplete. ' + err.message;
    prepareReport('Check incomplete', ['Fields checked before stopping: ' + scanned + '. Remaining records were not checked.',
      'Warnings detected before stopping: ' + found + '. Listing ' + findings.length + '.', ...findings]);
  }
}

function reset() {
  invalidateReport();
  issues.replaceChildren();
  summary.textContent = 'Select Check fields to scan the current input.';
}
source.addEventListener('input', () => { inputSource = 'custom'; reset(); });
byId('delimiter').addEventListener('change', reset);
byId('scan').addEventListener('click', scan);
downloadReport.addEventListener('click', () => {
  if (downloadReport.disabled || reportText === null || reportInput !== source.value || reportDelimiter !== byId('delimiter').value) return;
  const url = URL.createObjectURL(new Blob([reportText], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url; link.download = 'csv-formula-check-report.txt'; link.click();
  window.UtilityShelfUsage?.track('csv-formula-checker', 'report_download', reportMode, inputSource);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});
byId('sample').addEventListener('click', () => {
  source.value = 'Order,Customer note,Adjustment\n1001,"=SUM(2,3)",-12.50\n1002,"Leave at desk, please",0\n1003,"  @review",0';
  source.dispatchEvent(new Event('input'));
  inputSource = 'sample';
  byId('delimiter').value = 'comma';
  scan();
});
attachFileInput(byId('file'), source, summary);

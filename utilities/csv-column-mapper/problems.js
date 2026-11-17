const limit = 100;
const compare = (a, b) => a.row - b.row || a.column - b.column || a.reason.localeCompare(b.reason);

// Retain bounded details while counting every issue and affected row.
export function problemCollector() {
  const result = {count:0, rows:new Set(), details:[]};
  result.add = (row, column, reason) => {
    result.count++; result.rows.add(row);
    const item = {row, column, reason};
    if (result.details.length === limit && compare(item, result.details[limit - 1]) >= 0) return;
    const position = result.details.findIndex(existing => compare(item, existing) < 0);
    result.details.splice(position < 0 ? result.details.length : position, 0, item);
    if (result.details.length > limit) result.details.pop();
  };
  return result;
}

export function renderProblems(check, records, mapping, labels, headers, outputLines, selected) {
  const summary = !selected ? 'Problem rows: Not checked — no validation checks selected.'
    : !records.length ? 'Problem rows: Not checked — no data rows.'
    : check.count ? 'Problem rows: ' + check.count + ' issues across ' + check.rows.size + ' data rows.'
    : 'Problem rows: No issues found by the selected checks. This does not certify importer acceptance.';
  const detailScope = check.count > limit ? 'Showing first 100 of ' + check.count + ' issues; all data rows were checked.' : '';
  document.getElementById('problemSummary').textContent = [summary, detailScope].filter(Boolean).join(' ');
  document.getElementById('showProblems').disabled = !check.count;
  const report = ['Combined problem rows', summary, ...(detailScope ? [detailScope] : [])];
  const body = document.getElementById('problemDetails');
  for (const {row, column, reason} of check.details) {
    const source = mapping[column] === 'empty' ? null : Number(mapping[column]);
    const location = 'Data row ' + (row + 1) + ' (CSV record ' + (row + 2) + '). Source line ' + records[row].start + '; mapped CSV line ' + outputLines[row] + '.';
    const columns = 'Destination column ' + (column + 1) + ' ' + JSON.stringify(labels[column]) + ' ← ' + (source === null ? 'Use empty values' : 'source column ' + (source + 1) + ' ' + JSON.stringify(headers[source]));
    const value = source === null ? '' : records[row].cells[source];
    const preview = JSON.stringify(value.slice(0, 200)) + (value.length > 200 ? ' … [preview shortened]' : '');
    const tr = document.createElement('tr');
    for (const text of [location, columns, preview, reason]) {
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    }
    body.append(tr);
    report.push(location + ' ' + columns + ': ' + reason + '.');
  }
  report.push('Combined entries are ordered by data row then destination column. Values are omitted. Showing or hiding problem rows does not change the CSV.');
  return report;
}

const pageSize = 50;
const reportLimit = 100;
const types = ['missing', 'duplicate', 'price', 'stock'];
const byId = id => document.getElementById(id);

// A byte per mapped cell holds the issue flags. The page indexes store only
// encoded positions, so a large batch doesn't retain a rendered string per issue.
export function problemCollector(rowCount, columnCount) {
  const flags = new Uint8Array(rowCount * columnCount);
  const counts = new Uint32Array(types.length + 1);
  let duplicateFirst, duplicateSizes;

  function add(row, column, type, first, size) {
    const position = row * columnCount + column;
    const kind = types.indexOf(type);
    const bit = 1 << kind;
    if (flags[position] & bit) return;
    flags[position] |= bit;
    counts[0]++;
    counts[kind + 1]++;
    if (type === 'duplicate') {
      duplicateFirst ??= new Uint32Array(flags.length);
      duplicateSizes ??= new Uint32Array(flags.length);
      duplicateFirst[position] = first;
      duplicateSizes[position] = size;
    }
  }

  function finish() {
    const pages = Array.from(counts, count => new Uint32Array(count));
    const offsets = new Uint32Array(pages.length);
    let affectedRows = 0;
    let previousRow = -1;
    if (counts[0]) {
      for (let position = 0; position < flags.length; position++) {
        if (!flags[position]) continue;
        const row = Math.floor(position / columnCount);
        if (row !== previousRow) affectedRows++;
        previousRow = row;
        for (let kind = 0; kind < types.length; kind++) {
          if (!(flags[position] & (1 << kind))) continue;
          const code = position * types.length + kind;
          pages[0][offsets[0]++] = code;
          pages[kind + 1][offsets[kind + 1]++] = code;
        }
      }
    }
    return {pages, affectedRows, duplicateFirst, duplicateSizes};
  }

  return {add, finish};
}

const filter = byId('problemType');
const pageInput = byId('problemPage');
const previous = byId('problemPrev');
const next = byId('problemNext');
let view = null;
let page = 1;

export function clearProblems() {
  view = null;
  page = 1;
  filter.value = 'all';
  pageInput.value = '1';
  pageInput.max = '1';
  byId('showProblems').disabled = true;
  byId('problemRows').hidden = true;
  byId('showProblems').setAttribute('aria-expanded', 'false');
  byId('showProblems').textContent = 'Show problem rows';
  byId('problemSummary').textContent = '';
  byId('problemPageStatus').textContent = '';
  byId('problemDetails').replaceChildren();
}

function drawPage() {
  if (!view) return;
  const matches = view.pages[types.indexOf(filter.value) + 1];
  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(page, pageCount);
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);

  byId('problemPageStatus').textContent = total
    ? 'Showing issues ' + (start + 1) + '–' + end + ' of ' + total + '. Page ' + page + ' of ' + pageCount + '.'
    : 'No issues match this filter.';
  byId('problemTable').hidden = !total;
  byId('problemPagination').hidden = pageCount === 1;
  pageInput.max = String(pageCount);
  pageInput.value = String(page);
  previous.disabled = page === 1;
  next.disabled = page === pageCount;

  const rows = document.createDocumentFragment();
  for (const code of matches.subarray(start, end)) {
    const {location, columns, value, reason} = view.describe(code);
    const preview = JSON.stringify(value.slice(0, 200)) + (value.length > 200 ? ' … [preview shortened]' : '');
    const tr = document.createElement('tr');
    for (const text of [location, columns, preview, reason]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    rows.append(tr);
  }
  byId('problemDetails').replaceChildren(rows);
}

filter.addEventListener('change', () => {
  page = 1;
  drawPage();
});
for (const [button, direction] of [[previous, -1], [next, 1]]) {
  button.addEventListener('click', () => {
    page += direction;
    drawPage();
    if (button.disabled) pageInput.focus();
  });
}
byId('problemJump').addEventListener('submit', event => {
  event.preventDefault();
  page = pageInput.valueAsNumber;
  drawPage();
});

export function renderProblems(check, records, mapping, labels, headers, outputLines, selected) {
  const {pages, affectedRows, duplicateFirst, duplicateSizes} = check.finish();
  const count = pages[0].length;
  const summary = !selected ? 'Problem rows: Not checked — no validation checks selected.'
    : !records.length ? 'Problem rows: Not checked — no data rows.'
    : count ? 'Problem rows: ' + count + ' issues across ' + affectedRows + ' data rows.'
    : 'Problem rows: No issues found by the selected checks. This does not certify importer acceptance.';
  byId('problemSummary').textContent = summary;
  byId('showProblems').disabled = !count;

  function describe(code) {
    const type = types[code % types.length];
    const position = Math.floor(code / types.length);
    const row = Math.floor(position / labels.length);
    const column = position % labels.length;
    const source = mapping[column] === 'empty' ? null : Number(mapping[column]);
    const location = 'Data row ' + (row + 1) + ' (CSV record ' + (row + 2) + '). Source line ' + records[row].start + '; mapped CSV line ' + outputLines[row] + '.';
    const columns = 'Destination column ' + (column + 1) + ' ' + JSON.stringify(labels[column]) + ' ← ' +
      (source === null ? 'Use empty values' : 'source column ' + (source + 1) + ' ' + JSON.stringify(headers[source]));
    const value = source === null ? '' : records[row].cells[source];
    let reason;
    if (type === 'missing') reason = source === null ? 'empty value inserted by mapping' : value === '' ? 'blank cell' : 'whitespace-only value';
    else if (type === 'duplicate') reason = 'duplicate group starting at data row ' + duplicateFirst[position] + ' (' + duplicateSizes[position] + ' occurrences, including the first)';
    else reason = 'invalid ' + type + ' format';
    return {location, columns, value, reason};
  }

  view = {pages, describe};
  drawPage();
  const report = ['Combined problem rows', summary];
  if (count > reportLimit) report.push('Showing first 100 of ' + count + ' issues in this report; all data rows were checked. Use the on-page problem rows to review the rest.');
  for (const code of pages[0].subarray(0, reportLimit)) {
    const {location, columns, reason} = describe(code);
    report.push(location + ' ' + columns + ': ' + reason + '.');
  }
  report.push('Combined entries are ordered by data row then destination column. Values are omitted. Issue filters and page controls only affect the on-page review.');
  return report;
}

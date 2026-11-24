// Comparison keys never replace original cell values or CSV output.
export function checkDuplicates(records, mapping, labels, outputLines, options, onIssue = () => {}) {
  const result = {groups:0, count:0, affectedRows:0, checked:0, skipped:0, findings:[]};
  const affected = new Set();
  for (const index of options.indices) {
    const groups = new Map();
    const keyFor = row => {
      const value = mapping[index] === 'empty' ? '' : row.cells[Number(mapping[index])];
      if (!value.trim()) return null;
      const spaced = options.trimWhitespace ? value.trim() : value;
      return options.ignoreCase ? spaced.toLowerCase() : spaced;
    };
    for (const [rowIndex, row] of records.entries()) {
      const key = keyFor(row);
      if (key === null) { result.skipped++; continue; }
      result.checked++;
      const group = groups.get(key);
      if (group) { group.count++; if (group.count === 2) result.groups++; }
      else groups.set(key, {count:1, first:rowIndex + 1});
    }
    for (const [rowIndex, row] of records.entries()) {
      const key = keyFor(row), group = key === null ? null : groups.get(key);
      if (!group || group.count < 2) continue;
      result.count++; affected.add(rowIndex);
      onIssue(rowIndex, index, 'duplicate', group.first, group.count);
      if (result.findings.length < 100) result.findings.push(
        'Data row ' + (rowIndex + 1) + ' (CSV record ' + (rowIndex + 2) + '), destination column ' + (index + 1) + ' ' + JSON.stringify(labels[index]) +
        ': duplicate group starting at data row ' + group.first + ' (' + group.count + ' occurrences, including the first).' +
        ' Source line ' + row.start + '; mapped CSV line ' + outputLines[rowIndex] + '.');
    }
  }
  result.affectedRows = affected.size;
  return result;
}

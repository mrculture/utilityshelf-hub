export function checkNumeric(records, mapping, labels, outputLines, rules, onIssue = () => {}) {
  const result = {count:0, affectedRows:0, checked:0, skipped:0, findings:[]};
  for (const [rowIndex, row] of records.entries()) {
    let failed = false;
    for (const [index, rule] of rules.entries()) {
      if (rule === 'none') continue;
      const value = mapping[index] === 'empty' ? '' : row.cells[Number(mapping[index])];
      const text = value.trim();
      if (!text) { result.skipped++; continue; }
      result.checked++;
      // Validate text, never round/coerce numbers or modify the mapped value.
      if ((rule === 'price' ? /^[0-9]+(?:\.[0-9]+)?$/ : /^[0-9]+$/).test(text)) continue;
      result.count++; failed = true;
      onIssue(rowIndex, index, 'invalid ' + rule + ' format');
      if (result.findings.length < 100) result.findings.push(
        'Data row ' + (rowIndex + 1) + ' (CSV record ' + (rowIndex + 2) + '), destination column ' + (index + 1) + ' ' + JSON.stringify(labels[index]) +
        ': invalid ' + rule + ' format. ' + (rule === 'price' ? 'Use non-negative digits with an optional dot decimal.' : 'Use non-negative whole-number digits only; decimal notation is not accepted.') +
        ' Source line ' + row.start + '; mapped CSV line ' + outputLines[rowIndex] + '.');
    }
    if (failed) result.affectedRows++;
  }
  return result;
}

const byId = id => document.getElementById(id);
function collect(text, trim, fold) {
  const items = new Map();
  let duplicates = 0;
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    const item = trim ? line.trim() : line;
    const key = fold ? item.toLowerCase() : item;
    if (items.has(key)) duplicates++;
    else items.set(key, item);
  }
  return { items, duplicates };
}
function showGroup(id, values) {
  byId(id).value = values.join('\n');
  byId(id + '-count').textContent = '(' + values.length + ')';
}
function clearResults() {
  byId('results').hidden = true;
  for (const id of ['added','removed','shared']) showGroup(id, []);
  byId('summary').textContent = 'Select Compare lists to check the current snapshots.';
}
function compare() {
  clearResults();
  const trim = byId('trim').checked, fold = byId('fold').checked;
  const a = collect(byId('a').value, trim, fold), b = collect(byId('b').value, trim, fold);
  if (!a.items.size && !b.items.size) { byId('summary').textContent = 'Enter at least one nonblank item.'; return; }
  const added = [], removed = [], shared = [];
  for (const [key, item] of b.items) if (!a.items.has(key)) added.push(item);
  for (const [key, item] of a.items) (b.items.has(key) ? shared : removed).push(item);
  showGroup('added', added);
  showGroup('removed', removed);
  showGroup('shared', shared);
  byId('results').hidden = false;
  byId('summary').textContent = added.length + ' added, ' + removed.length + ' missing, ' + shared.length + ' shared. Repeated lines ignored: ' + a.duplicates + ' in A and ' + b.duplicates + ' in B.';
}
for (const id of ['a','b','trim','fold']) byId(id).addEventListener('input', clearResults);
byId('compare').addEventListener('click', compare);
byId('sample').addEventListener('click', () => {
  byId('a').value = 'A104\nA102\nA101\nA101';
  byId('b').value = 'A101\nA105\nA104';
  byId('trim').checked = true;
  byId('fold').checked = false;
  compare();
});

'use strict';
const byId = id => document.getElementById(id);
const form = byId('builder');

function slugFromTitle(title, foldLatin) {
  let text = title.normalize('NFC').toLowerCase();
  if (foldLatin) text = text.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC');
  text = text.replace(/['’]/g, '');
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu);
  return words ? words.join('-') : '';
}
function run() {
  const titles = byId('titles').value.split(/\r\n?|\n/).map(text => text.trim()).filter(Boolean);
  const slugs = titles.map(title => slugFromTitle(title, byId('fold').checked));
  const counts = new Map();
  for (const slug of slugs) counts.set(slug, (counts.get(slug) || 0) + 1);
  const rows = byId('rows');
  rows.replaceChildren();
  let issues = 0;
  titles.forEach((title, i) => {
    const slug = slugs[i], item = document.createElement('li');
    const name = document.createElement('strong'); name.textContent = title;
    const value = document.createElement('code'); value.textContent = slug;
    item.append(name, ' → ', value);
    if (!slug || counts.get(slug) > 1) {
      item.append(' — ' + (slug ? 'Duplicate segment. Revise a matching title.' : 'No letters or numbers to build a segment.'));
      issues++;
    } else if (encodeURIComponent(slug) !== slug) {
      const encoded = document.createElement('code');
      encoded.textContent = encodeURIComponent(slug);
      item.append(document.createElement('br'), 'Encoded: ', encoded);
    }
    rows.append(item);
  });
  const ready = titles.length > 0 && issues === 0;
  byId('result').hidden = !titles.length;
  byId('copy-area').hidden = !ready;
  byId('output').value = ready ? slugs.join('\n') : '';
  byId('summary').textContent = !titles.length ? 'Enter at least one title.' : issues ? issues + ' of ' + titles.length + ' titles need review.' : titles.length + (titles.length === 1 ? ' slug ready.' : ' slugs ready.');
}
form.addEventListener('submit', event => { event.preventDefault(); run(); });
form.addEventListener('input', () => { byId('result').hidden = true; byId('output').value = ''; byId('summary').textContent = 'Generate slugs to review your edits.'; });
byId('sample').addEventListener('click', () => {
  byId('titles').value = 'Café Guide\nCafe Guide\n東京 散歩';
  byId('fold').checked = true;
  run();
});
byId('select').addEventListener('click', () => { byId('output').focus(); byId('output').select(); });

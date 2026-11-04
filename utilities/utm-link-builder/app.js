'use strict';
const byId = id => document.getElementById(id);
const fieldNames = ['source', 'medium', 'campaign', 'content', 'term'];
const form = byId('builder');

function buildTaggedLink(destination, tags) {
  let url;
  try { url = new URL(destination); } catch { throw new Error('Enter a full URL starting with https:// or http://.'); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error('Use a public HTTP or HTTPS URL without a username or password.');
  }
  if (['source', 'medium', 'campaign'].some(name => !tags[name])) throw new Error('Fill in source, medium and campaign name.');
  const parts = url.search ? url.search.slice(1).split('&') : [];
  const kept = [];
  const oldValues = new Map();
  for (const part of parts) {
    // Prefix a neutral key so a leading question mark in a parameter stays literal.
    const pair = new URLSearchParams('&' + part).entries().next().value;
    const key = pair && pair[0].toLowerCase();
    if (!key || !key.startsWith('utm_') || !Object.hasOwn(tags, key.slice(4)) || !tags[key.slice(4)]) {
      kept.push(part);
      continue;
    }
    if (!oldValues.has(key)) oldValues.set(key, []);
    oldValues.get(key).push(pair[1]);
  }
  const changes = [];
  for (const name of fieldNames) {
    if (!tags[name]) continue;
    const key = 'utm_' + name;
    kept.push(new URLSearchParams([[key, tags[name]]]).toString());
    const old = oldValues.get(key);
    changes.push(old ? key + ': replaced ' + old.map(value => '“' + value + '”').join(', ') + ' with “' + tags[name] + '”.'
                     : key + ': added “' + tags[name] + '”.');
  }
  url.search = kept.join('&');
  return { address: url.href, changes };
}

function clearResult() {
  byId('result').hidden = true;
  byId('output').value = '';
  byId('changes').replaceChildren();
}
function run() {
  clearResult();
  try {
    const tags = Object.fromEntries(fieldNames.map(name => [name, byId(name).value.trim()]));
    const {address, changes} = buildTaggedLink(byId('destination').value.trim(), tags);
    byId('output').value = address;
    for (const change of changes) {
      const li = document.createElement('li');
      li.textContent = change;
      byId('changes').append(li);
    }
    byId('result').hidden = false;
    byId('summary').textContent = 'Campaign link ready. Review the tag changes below.';
  } catch (error) { byId('summary').textContent = error.message; }
}
form.addEventListener('submit', event => { event.preventDefault(); run(); });
form.addEventListener('input', () => { clearResult(); byId('summary').textContent = 'Build the link to review your edits.'; });
byId('sample').addEventListener('click', () => {
  byId('destination').value = 'https://example.com/shop?section=mugs&utm_source=old-list#blue';
  byId('source').value = 'weekly-newsletter'; byId('medium').value = 'email'; byId('campaign').value = 'winter-launch';
  byId('content').value = 'hero-button'; byId('term').value = '';
  run();
});
byId('select').addEventListener('click', () => { byId('output').focus(); byId('output').select(); });

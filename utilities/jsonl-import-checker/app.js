'use strict';
const data = document.getElementById('data');
const statusText = document.getElementById('status');
const errors = document.getElementById('errors');
const objects = document.getElementById('objects');
const maxBytes = 4 * 1024 * 1024;
let revision = 0;
function reset(message) {
  errors.replaceChildren();
  statusText.textContent = message;
}
function check() {
  reset('');
  const text = data.value;
  if (!text) { reset('Add at least one record.'); return; }
  if (new Blob([text]).size > maxBytes) { reset('Check up to 4 MiB at a time.'); return; }
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  let failed = 0;
  lines.forEach((line, index) => {
    let issue = '';
    if (index === 0 && line.startsWith('\uFEFF')) issue = 'Remove the byte order mark before the first record.';
    else if (!line.trim()) issue = 'Blank line. Remove it or enter a JSON value.';
    else {
      try {
        const value = JSON.parse(line);
        if (objects.checked && (value === null || typeof value !== 'object' || Array.isArray(value))) {
          issue = 'Expected an object for this import.';
        }
      } catch { issue = 'Invalid JSON. Check quotes, commas and matching braces on this line.'; }
    }
    if (!issue) return;
    failed++;
    if (failed <= 100) {
      const entry = document.createElement('li');
      entry.textContent = 'Line ' + (index + 1) + ' — ' + issue;
      errors.append(entry);
    }
  });
  statusText.textContent = failed ? failed + ' of ' + lines.length + ' lines need review.' +
    (failed > 100 ? ' Showing the first 100.' : '') : 'All ' + lines.length + ' records passed.';
}
data.addEventListener('input', () => { revision++; reset('Check again to review your changes.'); });
objects.addEventListener('change', check);
document.getElementById('check').addEventListener('click', check);
document.getElementById('sample').addEventListener('click', () => {
  revision++;
  data.value = '{"sku":"A101","price":12}\n{"sku":"A102","price":6.5,}\nnull';
  check();
});
document.getElementById('file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const request = ++revision;
  data.value = '';
  if (file.size > maxBytes) { reset('Choose a file of 4 MiB or less.'); return; }
  reset('Reading file…');
  try {
    const buffer = await file.arrayBuffer();
    if (request !== revision) return;
    const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
    if (/\r(?!\n)/.test(decoded)) {
      reset('Use LF or CRLF line endings. This file contains a standalone carriage return.');
      return;
    }
    data.value = decoded;
    check();
  } catch {
    if (request === revision) reset('Could not read this file as UTF-8. Check the file and its encoding.');
  }
});

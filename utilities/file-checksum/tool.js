const byId = id => document.getElementById(id);
const input = byId('file'), expected = byId('expected'), hash = byId('hash');
const status = byId('status'), match = byId('match');
let generation = 0;

function compare() {
  const value = expected.value.trim();
  if (!value) { match.textContent = ''; return; }
  if (!/^[a-f\d]{64}$/i.test(value)) {
    match.textContent = 'Enter a SHA-256 checksum of exactly 64 hexadecimal characters.';
    return;
  }
  if (!hash.value) { match.textContent = 'Choose a file to compare with this checksum.'; return; }
  match.textContent = value.toLowerCase() === hash.value ? 'Match. The computed checksum equals the expected value.' :
    'Mismatch. The computed checksum differs from the expected value.';
}

async function digest(file) {
  const id = ++generation;
  hash.value = '';
  compare();
  if (!file) { status.textContent = 'Choose a file or try the example.'; return; }
  if (file.size > 64 * 1024 * 1024) { status.textContent = 'This file exceeds 64 MiB. Choose a smaller file.'; return; }
  if (!globalThis.crypto?.subtle) { status.textContent = 'SHA-256 requires a browser with Web Crypto on HTTPS or localhost.'; return; }
  status.textContent = 'Calculating SHA-256 for ' + file.name + '…';
  try {
    const buffer = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    if (id !== generation) return;
    hash.value = Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
    status.textContent = 'Calculated SHA-256 for ' + file.name + ' (' + file.size.toLocaleString() + ' bytes).';
  } catch {
    if (id !== generation) return;
    status.textContent = 'The browser could not read or hash this file. Select it again.';
  }
  compare();
}
input.addEventListener('change', () => digest(input.files[0]));
expected.addEventListener('input', compare);
byId('demo').addEventListener('click', () => {
  input.value = '';
  expected.value = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  digest(new File(['abc'], 'abc.txt', { type: 'text/plain' }));
});

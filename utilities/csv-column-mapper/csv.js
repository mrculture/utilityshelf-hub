// Shared by the mapper and formula checker. Keep embedded field content intact.
export function* csvRows(text, delimiter = ',') {
  text = text.replace(/^\uFEFF/, '');
  if (!text) return;
  let cells = [], value = '', state = 'start', line = 1, start = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const newline = ch === '\r' || ch === '\n';
    if (state === 'quoted') {
      if (ch === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else state = 'closed';
      } else {
        value += ch;
        if (ch === '\r' && text[i + 1] === '\n') value += text[++i];
        if (newline) line++;
      }
    } else if (ch === delimiter || newline) {
      cells.push(value);
      value = '';
      state = 'start';
      if (newline) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        yield { cells, start };
        cells = [];
        start = ++line;
      }
    } else if (ch === '"' && state === 'start') {
      state = 'quoted';
    } else if (ch === '"' || state === 'closed') {
      throw new Error('Check the quotation marks on line ' + line + '. Quote the entire field and double any quote inside it.');
    } else {
      value += ch;
      state = 'plain';
    }
  }
  if (state === 'quoted') throw new Error('Missing closing quote in the record starting on line ' + start + '.');
  if (cells.length || state !== 'start') yield { cells: [...cells, value], start };
}

export function encodeRow(cells) {
  return cells.map(value => /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value).join(',');
}

export function attachFileInput(file, source, message) {
  let version = 0;
  source.addEventListener('input', () => { version++; });
  file.addEventListener('change', async () => {
    const selected = file.files[0];
    if (!selected) return;
    const current = ++version;
    file.value = '';
    try {
      if (selected.size > 2 * 1024 * 1024) throw new Error('Choose a file smaller than 2 MiB.');
      const contents = await selected.text();
      if (current !== version) return;
      source.value = contents;
      source.dispatchEvent(new Event('input'));
      message.textContent = 'Loaded ' + selected.name + '.';
    } catch (err) {
      if (current === version) message.textContent = err.message;
    }
  });
}

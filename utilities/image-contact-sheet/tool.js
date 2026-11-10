const byId = id => document.getElementById(id);
const input = byId('files');
const status = byId('status');
let generation = 0;
let inputSource = 'custom';
const track = (event, source = inputSource) => window.UtilityShelfUsage?.track('image-contact-sheet', event, 'sheet', source);

async function openPhoto(file) {
  if (file.size > 32000000) throw new Error('Exceeds the 32 MB reading limit');
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const type = String.fromCharCode(...header);
  const raster = type.startsWith('\x89PNG\r\n\x1a\n') || type.startsWith('\xff\xd8\xff') ||
    (type.startsWith('RIFF') && type.slice(8, 12) === 'WEBP');
  if (!raster) throw new Error('Choose a JPEG, PNG or WebP image');
  return createImageBitmap(file);
}

async function examplePhoto(name, width, height, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#edf1e5';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = accent;
  ctx.fillRect(width * .18, height * .16, width * .64, height * .68);
  ctx.fillStyle = '#fff9e8';
  ctx.fillRect(width * .3, height * .34, width * .4, height * .12);
  ctx.fillRect(width * .3, height * .53, width * .24, height * .06);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}
const sheet = byId('sheet');
const download = byId('download');
const names = byId('names');
let photos = [];
let errors = [];
let removed = null;
let replacementTarget = null;
let replacementRevision = 0;
let renderVersion = 0;
const tileWidth = 300, tileHeight = 232;

function makePhoto(file, image) {
  const thumb = document.createElement('canvas');
  thumb.width = tileWidth - 16; thumb.height = tileHeight - 48;
  const ctx = thumb.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, thumb.width, thumb.height);
  const zoom = Math.min(thumb.width / image.width, thumb.height / image.height);
  const width = image.width * zoom, height = image.height * zoom;
  ctx.drawImage(image, (thumb.width - width) / 2, (thumb.height - height) / 2, width, height);
  return { name: file.name, size: file.size, thumb };
}

function shorten(ctx, name, width) {
  if (ctx.measureText(name).width <= width) return name;
  const chars = Array.from(name);
  while (chars.length && ctx.measureText(chars.join('') + '…').width > width) chars.pop();
  return chars.join('') + '…';
}

function render() {
  renderVersion++;
  names.replaceChildren();
  sheet.hidden = !photos.length;
  download.disabled = !photos.length;
  byId('filenameOrder').hidden = !photos.length;
  byId('orderedNames').value = photos.map(photo => photo.name).join('\n');
  const multilineName = photos.some(photo => /[\u0000-\u001f\u007f]/.test(photo.name));
  byId('copyNames').disabled = !photos.length || multilineName;
  byId('downloadNames').disabled = !photos.length || multilineName;
  byId('selectNames').disabled = multilineName;
  byId('namesCopyStatus').textContent = multilineName ? 'A filename contains a line break or control character. Rename that file on your device and choose the photos again before copying or downloading a one-name-per-line list.' : '';
  byId('undoRemoval').disabled = !removed;
  byId('undoHint').textContent = removed ? 'Undo restores ' + removed.photo.name + ' to position ' + (Math.min(removed.index, photos.length) + 1) + '. Only the most recent removal can be undone.' : '';
  if (!photos.length) {
    status.textContent = 'No photos on sheet. Choose photos' + (removed ? ' or undo the last removal.' : '.');
    return;
  }
  const cols = Math.min(Number(byId('columns').value), photos.length);
  sheet.width = cols * tileWidth;
  sheet.height = Math.ceil(photos.length / cols) * tileHeight;
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  photos.forEach((photo, index) => {
    const x = index % cols * tileWidth, y = Math.floor(index / cols) * tileHeight;
    ctx.drawImage(photo.thumb, x + 8, y + 8);
    ctx.fillStyle = '#16362c';
    ctx.font = '15px sans-serif';
    const prefix = String(index + 1).padStart(2, '0') + '  ';
    ctx.fillText(shorten(ctx, prefix + photo.name, tileWidth - 20), x + 10, y + 215);
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = photo.name;
    item.append(label);
    const controls = document.createElement('div');
    controls.className = 'order-actions';
    for (const [direction, title] of [[-1, 'Move earlier'], [1, 'Move later']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = title;
      button.dataset.direction = direction;
      button.setAttribute('aria-label', title + ': photo ' + (index + 1) + ', ' + photo.name);
      button.disabled = index + direction < 0 || index + direction >= photos.length;
      button.addEventListener('click', () => {
        const destination = index + direction;
        if (destination < 0 || destination >= photos.length) return;
        [photos[index], photos[destination]] = [photos[destination], photos[index]];
        render();
        track('reorder');
        status.textContent += ' Moved ' + photo.name + ' to position ' + (destination + 1) + '.';
        const buttons = names.children[destination].querySelectorAll('button');
        const sameDirection = Array.from(buttons).find(control => control.dataset.direction === String(direction));
        (sameDirection.disabled ? Array.from(buttons).find(control => !control.disabled) : sameDirection)?.focus();
      });
      controls.append(button);
    }
    for (const action of ['Replace photo', 'Remove photo']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action;
      button.setAttribute('aria-label', action + ': photo ' + (index + 1) + ', ' + photo.name);
      button.addEventListener('click', () => {
        if (action === 'Replace photo') {
          replacementRevision++;
          replacementTarget = photo;
          byId('editStatus').textContent = 'Choose a replacement for ' + photo.name + '. Cancelling keeps the existing photo.';
          byId('replacementFile').value = '';
          byId('replacementFile').click();
          return;
        }
        const position = photos.indexOf(photo);
        if (position < 0) return;
        photos.splice(position, 1);
        removed = { photo, index: position };
        if (replacementTarget === photo) { replacementTarget = null; replacementRevision++; }
        render();
        byId('editStatus').textContent = 'Removed ' + photo.name + ' from the sheet. The original file is unchanged.';
        byId('undoRemoval').focus();
      });
      controls.append(button);
    }
    item.append(controls);
    names.append(item);
  });
  status.textContent = photos.length + ' photos on sheet · ' + sheet.width + ' × ' + sheet.height + ' px.' +
    (errors.length ? ' Skipped: ' + errors.join(', ') + '.' : '');
}

async function load(files, id, source = 'custom') {
  inputSource = source;
  resetEdits();
  photos = [];
  errors = [];
  render();
  if (!files.length || files.length > 30) {
    status.textContent = files.length > 30 ? 'You selected ' + files.length + ' photos. Choose between 1 and 30 photos. No photos were processed; split the batch and try again.' : 'Choose between 1 and 30 photos.';
    return;
  }
  if (files.reduce((total, file) => total + file.size, 0) > 100000000) {
    status.textContent = 'Keep the combined photo size at or below 100 MB. No photos were processed; split the batch and try again.';
    return;
  }
  status.textContent = 'Preparing thumbnails…';
  const next = [], skipped = [];
  for (const file of files) {
    try {
      const image = await openPhoto(file);
      try {
        next.push(makePhoto(file, image));
      } finally { image.close(); }
    } catch { skipped.push(file.name); }
    if (id !== generation) return;
  }
  photos = next;
  errors = skipped;
  render();
  if (!photos.length) status.textContent = 'No readable photos. Check the file type and size for ' + skipped.join(', ') + '.';
}
function resetEdits() {
  removed = null;
  replacementTarget = null;
  replacementRevision++;
  byId('replacementFile').value = '';
  byId('editStatus').textContent = '';
}
byId('undoRemoval').addEventListener('click', () => {
  if (!removed) return;
  if (photos.length >= 30 || photos.reduce((sum, photo) => sum + photo.size, removed.photo.size) > 100000000) {
    byId('editStatus').textContent = 'Cannot undo: restoring this photo would exceed the 30-photo or 100 MB combined limit. Your current sheet is unchanged.';
    return;
  }
  const { photo, index } = removed;
  const position = Math.min(index, photos.length);
  photos.splice(position, 0, photo);
  removed = null;
  render();
  byId('editStatus').textContent = 'Restored ' + photo.name + ' to position ' + (position + 1) + '.';
  names.children[position].querySelector('button:not(:disabled)')?.focus();
});
byId('replacementFile').addEventListener('cancel', () => {
  replacementTarget = null;
  replacementRevision++;
  byId('editStatus').textContent = 'Replacement cancelled. The sheet is unchanged.';
});
byId('replacementFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  const target = replacementTarget;
  if (!file || !target) return;
  const revision = ++replacementRevision;
  const batch = generation;
  const current = () => batch === generation && revision === replacementRevision && photos.includes(target);
  byId('editStatus').textContent = 'Reading replacement for ' + target.name + '…';
  try {
    if (photos.reduce((sum, photo) => sum + (photo === target ? 0 : photo.size), file.size) > 100000000)
      throw new Error('Keep the combined photo size at or below 100 MB');
    const image = await openPhoto(file);
    let replacement;
    try { replacement = makePhoto(file, image); } finally { image.close(); }
    if (!current()) return;
    if (photos.reduce((sum, photo) => sum + (photo === target ? 0 : photo.size), file.size) > 100000000)
      throw new Error('Keep the combined photo size at or below 100 MB');
    const position = photos.indexOf(target);
    photos[position] = replacement;
    inputSource = 'custom';
    replacementTarget = null;
    render();
    byId('editStatus').textContent = 'Replaced ' + target.name + ' with ' + file.name + ' at position ' + (position + 1) + '. Check the replacement in Image Dimension Checker before using it in your listing.';
    names.children[position].querySelector('button:not(:disabled)')?.focus();
  } catch (error) {
    if (current()) byId('editStatus').textContent = 'Replacement failed. The existing photo and order are unchanged. ' + (error.message || 'Could not read this photo') + '.';
  }
});

input.addEventListener('change', () => load(Array.from(input.files), ++generation));
byId('downloadNames').addEventListener('click', () => {
  if (byId('downloadNames').disabled || !photos.length) return;
  const url = URL.createObjectURL(new Blob([photos.map(photo => photo.name).join('\r\n') + '\r\n'], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url; link.download = 'ordered-filenames.txt'; link.click();
  byId('namesCopyStatus').textContent = 'Downloaded ' + photos.length + ' filenames in sheet order. Use Load filename list in Filename Cleaner, then select the matching photos separately.';
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});
byId('selectNames').addEventListener('click', () => {
  byId('orderedNames').focus();
  byId('orderedNames').select();
  byId('namesCopyStatus').textContent = 'All filenames selected. Press Ctrl+C or ⌘C, then paste into Filename Cleaner.';
});
byId('copyNames').addEventListener('click', async () => {
  if (byId('copyNames').disabled || !photos.length) return;
  const version = renderVersion;
  const source = inputSource;
  const text = byId('orderedNames').value;
  try {
    await navigator.clipboard.writeText(text);
    if (version !== renderVersion) return;
    byId('namesCopyStatus').textContent = 'Copied ' + photos.length + ' filenames in sheet order. Paste them into Filename Cleaner.';
    track('names_copy', source);
  } catch {
    if (version !== renderVersion) return;
    byId('orderedNames').focus();
    byId('orderedNames').select();
    byId('namesCopyStatus').textContent = 'Automatic copy is unavailable. The filenames are selected: press Ctrl+C or ⌘C.';
  }
});
byId('columns').addEventListener('change', render);
byId('demo').addEventListener('click', async () => {
  const id = ++generation;
  resetEdits();
  input.value = '';
  photos = [];
  errors = [];
  render();
  status.textContent = 'Preparing example photos…';
  try {
    const files = await Promise.all([examplePhoto('front.png', 640, 480, '#2d5845'),
      examplePhoto('side.png', 400, 600, '#b16a36'), examplePhoto('detail.png', 600, 400, '#416781')]);
    if (id === generation) await load(files, id, 'sample');
  } catch {
    if (id === generation) status.textContent = 'Could not prepare the example. Try again or choose your own photos.';
  }
});
download.addEventListener('click', () => {
  if (download.disabled || !photos.length) return;
  const source = inputSource;
  const id = generation;
  const version = renderVersion;
  sheet.toBlob(blob => {
    if (id !== generation || version !== renderVersion) return;
    if (!blob) { status.textContent = 'PNG export failed. Try again with fewer photos.'; return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'contact-sheet.png';
    document.body.append(link); link.click(); link.remove();
    track('sheet_download', source);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }, 'image/png');
});

const byId = id => document.getElementById(id);
const input = byId('files');
const status = byId('status');
let generation = 0;

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
let renderVersion = 0;
const tileWidth = 300, tileHeight = 232;

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
  if (!photos.length) return;
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
        status.textContent += ' Moved ' + photo.name + ' to position ' + (destination + 1) + '.';
        const buttons = names.children[destination].querySelectorAll('button');
        const sameDirection = Array.from(buttons).find(control => control.dataset.direction === String(direction));
        (sameDirection.disabled ? Array.from(buttons).find(control => !control.disabled) : sameDirection)?.focus();
      });
      controls.append(button);
    }
    item.append(controls);
    names.append(item);
  });
  status.textContent = photos.length + ' photos on sheet · ' + sheet.width + ' × ' + sheet.height + ' px.' +
    (errors.length ? ' Skipped: ' + errors.join(', ') + '.' : '');
}

async function load(files, id) {
  photos = [];
  errors = [];
  render();
  if (!files.length || files.length > 24) {
    status.textContent = 'Choose between 1 and 24 photos.';
    return;
  }
  status.textContent = 'Preparing thumbnails…';
  const next = [], skipped = [];
  for (const file of files) {
    try {
      const image = await openPhoto(file);
      try {
        const thumb = document.createElement('canvas');
        thumb.width = tileWidth - 16; thumb.height = tileHeight - 48;
        const ctx = thumb.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, thumb.width, thumb.height);
        const zoom = Math.min(thumb.width / image.width, thumb.height / image.height);
        const width = image.width * zoom, height = image.height * zoom;
        ctx.drawImage(image, (thumb.width - width) / 2, (thumb.height - height) / 2, width, height);
        next.push({ name: file.name, thumb });
      } finally { image.close(); }
    } catch { skipped.push(file.name); }
    if (id !== generation) return;
  }
  photos = next;
  errors = skipped;
  render();
  if (!photos.length) status.textContent = 'No readable photos. Check the file type and size for ' + skipped.join(', ') + '.';
}
input.addEventListener('change', () => load(Array.from(input.files), ++generation));
byId('columns').addEventListener('change', render);
byId('demo').addEventListener('click', async () => {
  const id = ++generation;
  input.value = '';
  photos = [];
  errors = [];
  render();
  status.textContent = 'Preparing example photos…';
  try {
    const files = await Promise.all([examplePhoto('front.png', 640, 480, '#2d5845'),
      examplePhoto('side.png', 400, 600, '#b16a36'), examplePhoto('detail.png', 600, 400, '#416781')]);
    if (id === generation) await load(files, id);
  } catch {
    if (id === generation) status.textContent = 'Could not prepare the example. Try again or choose your own photos.';
  }
});
download.addEventListener('click', () => {
  const id = generation;
  const version = renderVersion;
  sheet.toBlob(blob => {
    if (id !== generation || version !== renderVersion) return;
    if (!blob) { status.textContent = 'PNG export failed. Try again with fewer photos.'; return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'contact-sheet.png';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }, 'image/png');
});

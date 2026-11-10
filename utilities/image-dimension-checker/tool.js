const byId = id => document.getElementById(id);
const input = byId('files');
const status = byId('status');
let generation = 0;
let inputSource = 'custom';
let usageTimer;
const downloadReport = byId('downloadReport');
let reportText = null, reportKey = null;
const currentReportKey = () => JSON.stringify([generation, byId('preset').value, ...['width', 'height', 'size'].map(id => byId(id).value)]);
function invalidateReport() {
  window.UtilityShelfResize?.reset();
  reportText = null; reportKey = null; downloadReport.disabled = true;
  byId('reportStatus').textContent = 'Choose photos and valid limits to create a report.';
}
function scheduleUsage() {
  clearTimeout(usageTimer);
  if (!measurements.some(item => !item.error)) return;
  const id = generation, mode = preset.value, source = inputSource;
  usageTimer = setTimeout(() => {
    if (id !== generation) return;
    window.UtilityShelfUsage?.track('image-dimension-checker', 'check_complete', mode, source);
    if (mode === 'ebay') window.UtilityShelfUsage?.track('image-dimension-checker', 'ebay_preset', mode, source);
  }, 500);
}

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
const output = byId('output');
let measurements = [];
const preset = byId('preset');

function showPreset() {
  byId('ebayHelp').hidden = preset.value !== 'ebay';
}
preset.addEventListener('change', () => {
  if (preset.value === 'ebay') {
    byId('width').value = 1600;
    byId('height').value = 1600;
    byId('size').value = 12;
  }
  showPreset();
  evaluatePhotos();
});

function evaluatePhotos() {
  clearTimeout(usageTimer);
  invalidateReport();
  output.replaceChildren();
  if (!measurements.length) return;
  const limits = ['width', 'height', 'size'].map(byId);
  if (!limits.every(field => field.checkValidity())) {
    status.textContent = 'Enter valid limits to check these photos.';
    return;
  }
  const [minWidth, minHeight, maxSize] = limits.map(field => field.valueAsNumber);
  const table = document.createElement('table');
  const heading = table.createTHead().insertRow();
  for (const label of ['Filename', 'Dimensions', 'File size', 'Result']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    heading.append(cell);
  }
  const body = table.createTBody();
  let passes = 0;
  const attention = [], passed = [];
  for (const [index, item] of measurements.entries()) {
    const problems = [];
    if (item.error) {
      problems.push(item.error);
    } else {
      if (item.width < minWidth) problems.push('Width short by ' + (minWidth - item.width) + ' px');
      if (item.height < minHeight) problems.push('Height short by ' + (minHeight - item.height) + ' px');
      if (item.bytes > maxSize * 1000000) problems.push('Over the file size limit');
    }
    if (!problems.length) passes++;
    const entry = ['Photo ' + (index + 1) + ': ' + JSON.stringify(item.name),
      'Dimensions: ' + (item.error ? 'Not available' : item.width + ' x ' + item.height + ' px'),
      'File size: ' + item.bytes + ' bytes',
      'Result: ' + (item.error ? 'Could not check: ' : '') + (problems.join('; ') || 'Pass')].join('\r\n');
    (problems.length ? attention : passed).push(entry);
    const row = body.insertRow();
    for (const text of [item.name, item.error ? '—' : item.width + ' × ' + item.height,
      item.bytes.toLocaleString() + ' bytes', problems.join('; ') || 'Pass']) {
      row.insertCell().textContent = text;
    }
  }
  output.append(table);
  status.textContent = passes + ' of ' + measurements.length +
    (preset.value === 'ebay' ? ' meet the eBay recommended-size preset.' : ' meet your limits.');
  const unreadable = measurements.filter(item => item.error).length;
  const result = unreadable ? 'Check incomplete' : attention.length ? 'Needs attention' : 'Passed';
  reportText = ['UtilityShelf - Image Dimension Checker report', 'Status: ' + result,
    'Preset: ' + (preset.value === 'ebay' ? 'eBay recommended-size preset' : 'Custom limits'),
    'Minimum width: ' + minWidth + ' px; minimum height: ' + minHeight + ' px.',
    'Maximum file size: ' + maxSize + ' MB (' + (maxSize * 1000000) + ' bytes). 1 MB = 1,000,000 bytes.',
    'Selected: ' + measurements.length + '. Passed: ' + passes + '. Need attention (including unreadable): ' + attention.length + '. Unreadable: ' + unreadable + '.',
    '', 'PHOTOS NEEDING ATTENTION', attention.length ? attention.join('\r\n\r\n') : 'None. All selected photos meet these limits.',
    '', 'PASSING PHOTOS', passed.length ? passed.join('\r\n\r\n') : 'None.', '',
    'Scope: decoded dimensions in display orientation and file sizes only. Unreadable files could not be checked for dimensions.',
    'This report does not assess focus, composition or marketplace acceptance. The eBay preset is a size target, not a guarantee of listing approval.',
    'Review the listed files, choose replacement photos if needed, and download a fresh report after checking again. Original photos are not changed.'].join('\r\n') + '\r\n';
  reportKey = currentReportKey();
  downloadReport.disabled = false;
  byId('reportStatus').textContent = 'Report status: ' + result + '.';
  window.UtilityShelfResize?.setBatch(measurements, {minWidth, minHeight, maxBytes:maxSize * 1000000}, preset.value, inputSource);
  scheduleUsage();
}

async function load(files, id, source = 'custom') {
  clearTimeout(usageTimer);
  invalidateReport();
  inputSource = source;
  measurements = [];
  output.replaceChildren();
  if (!files.length || files.length > 30) {
    status.textContent = files.length > 30 ? 'You selected ' + files.length + ' photos. Choose between 1 and 30 photos. No photos were processed; split the batch and try again.' : 'Choose between 1 and 30 photos.';
    return;
  }
  if (files.reduce((total, file) => total + file.size, 0) > 100000000) {
    status.textContent = 'Keep the combined photo size at or below 100 MB. No photos were processed; split the batch and try again.';
    byId('resizeStatus').textContent = status.textContent;
    return;
  }
  status.textContent = 'Reading photos…';
  const next = [];
  for (const file of files) {
    const item = { name: file.name, bytes: file.size, file };
    try {
      const image = await openPhoto(file);
      item.width = image.width;
      item.height = image.height;
      image.close();
    } catch (err) {
      item.error = err.name === 'Error' ? err.message : 'Image could not be decoded';
    }
    if (id !== generation) return;
    next.push(item);
  }
  measurements = next;
  evaluatePhotos();
}
input.addEventListener('change', () => load(Array.from(input.files), ++generation));
for (const id of ['width', 'height', 'size']) byId(id).addEventListener('input', () => {
  preset.value = 'custom';
  showPreset();
  evaluatePhotos();
});
byId('demo').addEventListener('click', async () => {
  const id = ++generation;
  clearTimeout(usageTimer);
  invalidateReport();
  measurements = [];
  output.replaceChildren();
  input.value = '';
  preset.value = 'custom';
  showPreset();
  byId('width').value = 800;
  byId('height').value = 800;
  byId('size').value = 8;
  status.textContent = 'Preparing example photos…';
  try {
    const files = await Promise.all([examplePhoto('front.png', 1000, 1000, '#22523f'),
      examplePhoto('detail.png', 1000, 600, '#c07141')]);
    if (id === generation) load(files, id, 'sample');
  } catch {
    if (id === generation) status.textContent = 'Could not prepare the example. Choose photos from your device instead.';
  }
});
downloadReport.addEventListener('click', () => {
  if (downloadReport.disabled || reportText === null || reportKey !== currentReportKey()) return;
  const url = URL.createObjectURL(new Blob([reportText], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url; link.download = 'image-dimension-report.txt'; link.click();
  window.UtilityShelfUsage?.track('image-dimension-checker', 'report_download', preset.value, inputSource);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});

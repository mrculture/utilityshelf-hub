// Reads the flat, stored ZIP format written by Image Dimension Checker.
// ZIP record layout: PKWARE APPNOTE sections 4.3.7, 4.3.12 and 4.3.16.
async function readCheckedPhotoZip(file) {
  const maxPhotos = 30;
  const maxPhotoBytes = 32_000_000;
  const maxBatchBytes = 100_000_000;
  const maxReportBytes = 1_000_000;
  // Allow the report and ZIP headers on top of the photo byte limit.
  if (file.size > 106_000_000) throw new Error('The ZIP exceeds the 106 MB archive limit.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const word = offset => view.getUint16(offset, true);
  const long = offset => view.getUint32(offset, true);
  const invalid = () => new Error('The ZIP is damaged or unsupported. Choose a checked-photo ZIP from Image Dimension Checker.');
  const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
  const mime = {jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp'};
  const end = bytes.length - 22;

  if (end < 0 || long(end) !== 0x06054b50 || long(end + 4) !== 0 || word(end + 20) !== 0) throw invalid();
  const entryCount = word(end + 10);
  const directoryOffset = long(end + 16);
  if (entryCount !== word(end + 8) || directoryOffset + long(end + 12) !== end) throw invalid();
  if (entryCount > maxPhotos + 1) throw new Error('The ZIP exceeds the 30-photo limit. Split the batch and try again.');

  const entries = [];
  const usedNames = new Set();
  let total = 0;
  let photoCount = 0;
  let hasReport = false;
  let local = 0;
  let central = directoryOffset;
  for (let i = 0; i < entryCount; i++) {
    if (central + 46 > end || long(central) !== 0x02014b50 || local + 30 > directoryOffset || long(local) !== 0x04034b50) throw invalid();
    const nameLength = word(central + 28);
    const nextCentral = central + 46 + nameLength;
    const start = local + 30 + nameLength;
    const size = long(central + 24);
    const crc = long(central + 16);
    if (!nameLength || nextCentral > end || start + size > directoryOffset) throw invalid();
    // The exporter uses UTF-8 names, stored entries and contiguous local headers.
    if (word(central + 8) !== 0x800 || word(local + 6) !== 0x800 || word(central + 10) !== 0 || word(local + 8) !== 0 ||
        word(central + 30) || word(central + 32) || word(central + 34) || word(local + 28) ||
        long(central + 42) !== local || word(local + 26) !== nameLength || long(local + 14) !== crc ||
        long(central + 20) !== size || long(local + 18) !== size || long(local + 22) !== size) throw invalid();
    const nameBytes = bytes.subarray(central + 46, nextCentral);
    if (!nameBytes.every((byte, index) => byte === bytes[local + 30 + index])) throw invalid();
    let name;
    try { name = decoder.decode(nameBytes); } catch { throw invalid(); }
    const key = name.normalize('NFC').toLowerCase();
    if (/[\\/:\u0000-\u001f\u007f]/.test(name) || usedNames.has(key)) throw invalid();
    usedNames.add(key);
    const report = name === 'resize-report.txt';
    const extension = /\.(jpe?g|png|webp)$/.exec(key)?.[1];
    const type = mime[extension];
    if (report) {
      if (!size || size > maxReportBytes) throw invalid();
      hasReport = true;
    } else {
      if (!type || !size) throw invalid();
      photoCount++;
      total += size;
      if (size > maxPhotoBytes) throw new Error('A photo in the ZIP exceeds 32 MB.');
      if (total > maxBatchBytes) throw new Error('The photos in the ZIP exceed 100 MB combined.');
      if (photoCount > maxPhotos) throw new Error('The ZIP exceeds the 30-photo limit. Split the batch and try again.');
    }
    entries.push({name, type, report, crc, start, end: start + size});
    local = start + size;
    central = nextCentral;
  }
  if (!photoCount || !hasReport || central !== end || local !== directoryOffset) throw invalid();

  const crcTable = Uint32Array.from({length: 256}, (_, n) => {
    for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n;
  });
  const photos = [];
  for (const entry of entries) {
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(entry.start, entry.end)) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== entry.crc) throw invalid();
    if (!entry.report) photos.push(new File([file.slice(entry.start, entry.end)], entry.name, {type: entry.type}));
  }
  return photos;
}

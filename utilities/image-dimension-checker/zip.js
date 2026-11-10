// Small ZIP writer: stored entries, CRC32 and UTF-8 names, no image re-encoding.
// Format reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
(() => {
  const encoder = new TextEncoder();
  const crcTable = Uint32Array.from({length:256}, (_, n) => {
    for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  window.UtilityShelfPhotoZip = entries => {
    const parts = [], central = [];
    let offset = 0, centralSize = 0;
    for (const {name, bytes} of entries) {
      const filename = encoder.encode(name), crc = crc32(bytes);
      const local = new Uint8Array(30 + filename.length), l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true);
      l.setUint16(6, 0x800, true); l.setUint16(12, 33, true); // UTF-8, stored, 1980-01-01.
      l.setUint32(14, crc, true); l.setUint32(18, bytes.length, true); l.setUint32(22, bytes.length, true);
      l.setUint16(26, filename.length, true); local.set(filename, 30);
      const directory = new Uint8Array(46 + filename.length), d = new DataView(directory.buffer);
      d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true);
      d.setUint16(8, 0x800, true); d.setUint16(14, 33, true);
      d.setUint32(16, crc, true); d.setUint32(20, bytes.length, true); d.setUint32(24, bytes.length, true);
      d.setUint16(28, filename.length, true); d.setUint32(42, offset, true); directory.set(filename, 46);
      parts.push(local, bytes); central.push(directory);
      offset += local.length + bytes.length; centralSize += directory.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
    e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], {type:'application/zip'});
  };
})();

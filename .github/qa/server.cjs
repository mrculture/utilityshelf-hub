const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) throw Error('Outside root');
    if (pathname.split('/').some(p => p.startsWith('.'))) throw Error('Private file');
    file = [file, file + '.html', path.join(file, 'index.html')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!file) { res.writeHead(404); return res.end('Not found'); }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.png': 'image/png' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(400); res.end('Bad request'); }
}).listen(4179, '127.0.0.1');

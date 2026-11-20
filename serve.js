// Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
// Optional dependency-free static server: node serve.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.dict':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8'};
http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let target;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    target = path.resolve(__dirname, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(__dirname + path.sep)) throw new Error('Invalid path');
  } catch (_) { res.writeHead(400); res.end('Invalid path'); return; }
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff'});
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(target).on('error', () => res.destroy()).pipe(res);
  });
}).listen(8000, '127.0.0.1', () => console.log('Open http://localhost:8000'));

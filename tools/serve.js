// Minimal static server for previewing the design mockups. No dependencies.
// Usage: node _design/serve.js   → http://localhost:4173/beranda.html
const http = require('http');
const fs = require('fs');
const path = require('path');

// Optional args: <folder to serve> <port> <base path>. Defaults: this folder, 4173, "/".
// Base path mimics GitHub Pages project sites, e.g. "/Mediaratecard/".
const root = path.resolve(process.argv[2] || __dirname);
const port = Number(process.argv[3] || 4173);
const base = process.argv[4] || '/';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (base !== '/') {
    if (url === '/' || url === base.slice(0, -1)) { res.writeHead(302, { Location: base }); return res.end(); }
    if (!url.startsWith(base)) { res.writeHead(404); return res.end('Not found'); }
    url = '/' + url.slice(base.length);
  }
  let file = path.normalize(path.join(root, url));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (url.endsWith('/')) file = path.join(file, fs.existsSync(path.join(file, 'index.html')) ? 'index.html' : 'beranda.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      const nf = path.join(root, '404.html');
      res.writeHead(404, { 'Content-Type': types['.html'] });
      return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`Preview at http://localhost:${port}${base}`));

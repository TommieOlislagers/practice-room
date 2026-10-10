'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const rootDir = path.join(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.wav': 'audio/wav', '.js': 'text/javascript', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.woff2': 'font/woff2' };
module.exports = function start(port) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = path.normalize(decodeURIComponent(req.url.split('?')[0]));
      const file = path.join(rootDir, p);
      if (!file.startsWith(rootDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
};

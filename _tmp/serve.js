/* 本地静态服务器（仅开发校验用）：node _tmp/serve.js [port] */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve('F:/GitHub/H874589148.github.io');
const PORT = parseInt(process.argv[2] || '8000', 10);
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};
http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const fp = path.resolve(ROOT, '.' + p);
    if (fp.toLowerCase().indexOf(ROOT.toLowerCase()) !== 0) { res.writeHead(403); res.end(); return; }
    fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404); res.end('404 ' + p); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));

/* 校验本地静态服务器关键 URL 均返回 200：node _tmp/check-server.js [port] */
'use strict';
const http = require('http');
const PORT = parseInt(process.argv[2] || '8002', 10);
const urls = [
    '/index.html',
    '/tools/truth-table/index.html',
    '/tools/truth-table/engine.js',
    '/tools/truth-table/canvas-netlist.js',
    '/tools/truth-table/script.js',
    '/tools/truth-table/style.css',
    '/tools/circuit-sketch/index.html?embed=tt&devices=and-gate,dot',
    '/razavi/razavi-symbols.js',
    '/razavi/render.js',
    '/logic_truth_table.html'
];
let done = 0, bad = 0;
urls.forEach(u => {
    http.get({ host: 'localhost', port: PORT, path: u }, res => {
        console.log(res.statusCode, u);
        if (res.statusCode !== 200) bad++;
        res.resume();
        if (++done === urls.length) {
            console.log('----------------------------------------');
            console.log(bad ? bad + ' URL(s) NOT 200' : 'all ' + urls.length + ' URLs OK');
            process.exit(bad ? 1 : 0);
        }
    }).on('error', e => {
        console.log('ERR', u, e.message);
        bad++;
        if (++done === urls.length) process.exit(1);
    });
});

'use strict';
const fs = require('fs');
const ROOT = 'F:/GitHub/H874589148.github.io';
const netlist = require(ROOT + '/tools/truth-table/canvas-netlist.js');
const bundleSrc = fs.readFileSync(ROOT + '/razavi/razavi-symbols.js', 'utf8');
const renderSrc = fs.readFileSync(ROOT + '/razavi/render.js', 'utf8');
const win = {};
new Function('window', bundleSrc +
    ';window.RAZAVI_CATEGORIES=RAZAVI_CATEGORIES;window.RAZAVI_CATALOG=RAZAVI_CATALOG;window.RAZAVI_SYMBOLS=RAZAVI_SYMBOLS;' +
    renderSrc)(win);
const portsOf = (t, v) => win.Razavi.ports(t, v);

const src = fs.readFileSync(ROOT + '/tools/truth-table/script.js', 'utf8');
const m = src.match(/var EXAMPLE_DOC = (\(function \(\) \{[\s\S]*?\}\)\(\));/);
const exDoc = eval(m[1]);
console.log('items:', exDoc.items.length);
exDoc.items.forEach(it => {
    if (it.kind === 'comp') console.log('comp', it.id, it.type, it.x, it.y, JSON.stringify(portsOf(it.type, it.variant)));
    else console.log('wire', it.id, JSON.stringify(it.pts));
});
try {
    const ir = netlist.buildIRFromDoc(exDoc, portsOf);
    console.log('IR:', JSON.stringify(ir, null, 1));
} catch (e) {
    console.log('ERROR:', e.message);
}

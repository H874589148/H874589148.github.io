/* t1 验证：7 个 symbol.json 的 circle 已补 fill/stroke，且打包产物同步更新 */
const fs = require('fs');
const path = require('path');

const RAZAVI = 'F:/GitHub/H874589148.github.io/razavi';
const targets = [
    { id: 'nand-gate', part: 'negation-bubble' },
    { id: 'nor-gate', part: 'negation-bubble' },
    { id: 'xnor-gate', part: 'negation-bubble' },
    { id: 'inverter', part: 'negation-bubble' },
    { id: 'voltage-source', part: null },
    { id: 'current-source', part: null },
    { id: 'pulse-voltage-source', part: null }
];

let fail = 0;

/* 1) 源 JSON 校验 */
const expect = {};
targets.forEach(t => {
    const fp = path.join(RAZAVI, t.id + '.symbol.json');
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const circles = (j.primitives || []).filter(p => p.kind === 'circle');
    if (!circles.length) { console.log('FAIL', t.id, 'no circle'); fail++; return; }
    circles.forEach(c => {
        if (c.fill !== 'none' || c.stroke !== 'foreground') {
            console.log('FAIL', t.id, 'circle missing fill/stroke', JSON.stringify({ fill: c.fill, stroke: c.stroke }));
            fail++;
        }
    });
    expect[t.id] = true;
});
console.log('source JSON: 7 files circle fill/stroke', fail === 0 ? 'OK' : 'HAS FAILURES');

/* 2) 打包产物校验：razavi-symbols.js 为浏览器脚本，提取 RAZAVI_SYMBOLS JSON */
const raw = fs.readFileSync(path.join(RAZAVI, 'razavi-symbols.js'), 'utf8');
const m = raw.match(/RAZAVI_SYMBOLS\s*=\s*(\{.*\})\s*;?\s*(?:var\s|$)/s) || raw.match(/RAZAVI_SYMBOLS\s*=\s*(\{[\s\S]*\});/);
if (!m) {
    /* 退化方案：直接 window 全局 eval */
    const sandbox = {};
    new Function('window', raw)(sandbox);
    var SYMBOLS = sandbox.RAZAVI_SYMBOLS;
} else {
    var SYMBOLS = JSON.parse(m[1]);
}
if (!SYMBOLS) { console.log('FAIL: cannot extract RAZAVI_SYMBOLS'); process.exit(1); }

let fail2 = 0;
targets.forEach(t => {
    const sym = SYMBOLS[t.id];
    if (!sym) { console.log('FAIL bundle missing', t.id); fail2++; return; }
    const circles = (sym.primitives || []).filter(p => p.kind === 'circle');
    if (!circles.length) { console.log('FAIL bundle', t.id, 'no circle'); fail2++; return; }
    circles.forEach(c => {
        if (c.fill !== 'none' || c.stroke !== 'foreground') {
            console.log('FAIL bundle', t.id, JSON.stringify({ fill: c.fill, stroke: c.stroke }));
            fail2++;
        }
    });
});
console.log('bundle razavi-symbols.js: 7 symbols circle fill/stroke', fail2 === 0 ? 'OK' : 'HAS FAILURES');

/* 3) 全库回归：所有 circle 均有显式 fill 与 stroke */
let fail3 = 0, total = 0;
Object.keys(SYMBOLS).forEach(id => {
    (SYMBOLS[id].primitives || []).forEach(p => {
        if (p.kind === 'circle') {
            total++;
            if (p.fill === undefined || p.stroke === undefined) {
                console.log('FAIL regression', id, 'circle missing field');
                fail3++;
            }
        }
    });
});
console.log('regression: ' + total + ' circles in bundle, all have explicit fill+stroke:', fail3 === 0 ? 'OK' : 'HAS FAILURES');

process.exit(fail + fail2 + fail3 === 0 ? 0 : 1);

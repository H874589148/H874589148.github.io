/* 实际图纸端口连通、文档往返及独立节点方程验证；不代替目视验收。 */
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { environment, code, plain } = require('./handoff-harness');
const G = require('../circuit-connectivity');
const E = require('../../tools/power-electronics/engine');
const DPI = require('../../tools/dpi-calc/script');
const h = environment(), s = h.s, R = s.Razavi;
for (const file of ['tools/filter-design/topologies.js', 'tools/dpi-calc/topologies.js', 'tools/power-electronics/topologies.js']) h.run(file);
// 计算函数与事件绑定完整执行；只跳过依赖真实 Canvas 排版的启动调用。
h.run('tools/filter-design/script.js', code('tools/filter-design/script.js').replace(/fullUpdate\(\);\s*$/, ''));
h.run('tools/filter-design/rev-calc.js', code('tools/filter-design/rev-calc.js').replace(/renderRevFields\(\);\s*revUpdate\(\);\s*$/, ''));
s.formatEngineering = x => String(x);
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= (Math.abs(b) < 1e-14 ? 1e-9 : Math.abs(b) * tolerance), `${a} != ${b}`);
function netlist(doc) {
    const graph = G.build(doc, R.portsWorld), parts = Object.fromEntries(doc.items.filter(i => i.kind === 'comp').map(i => [i.id, i]));
    const ground = new Set(Object.values(parts).filter(p => p.type === 'ground').map(p => graph.netOf(p.id, R.portsWorld(p)[0].n)));
    function net(id, pin = 0) {
        assert.ok(parts[id], '缺少器件 ' + id);
        const name = typeof pin === 'number' ? R.portsWorld(parts[id])[pin].n : pin;
        const n = graph.netOf(id, name); assert.notEqual(n, -1, id + '.' + name);
        return ground.has(n) ? 'GND' : n;
    }
    return { graph, parts, net };
}
function paper(pack) {
    const checked = s.CircuitHandoff.validateDoc(pack.doc);
    assert.deepEqual(plain(checked), plain(pack.doc));
    const t = s.CircuitHandoff.create('图纸测试'); s.CircuitHandoff.publish(t, pack);
    assert.deepEqual(plain(s.CircuitHandoff.read(t).doc), plain(pack.doc)); s.CircuitHandoff.consume(t);
    const box = R.docBBox(pack.doc, { editorText: true }), svg = s.CircuitFigure.render(pack.doc, { itemIds: true });
    assert.ok(!/NaN|undefined|Infinity/.test(svg)); assert.match(svg, /data-item-id=/);
    for (const i of pack.doc.items) {
        const b = R.itemOuterBBox(i, { editorText: true });
        for (const k of ['x0', 'x1', 'y0', 'y1']) assert.ok(Number.isFinite(b[k]));
        assert.ok(b.x0 >= box.x0 && b.y0 >= box.y0 && b.x1 <= box.x1 && b.y1 <= box.y1, '对象超出图纸边界');
    }
}
// 独立复数高斯消元，不调用滤波器或 TF 求解代码。
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], neg = a => [-a[0], -a[1]];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a, b) => { const d = b[0] ** 2 + b[1] ** 2; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
function response(doc, values, f) {
    const { parts, net } = netlist(doc), nodes = new Map();
    Object.values(parts).forEach(p => R.portsWorld(p).forEach(pin => { const n = net(p.id, pin.n); if (n !== 'GND' && !nodes.has(n)) nodes.set(n, nodes.size); }));
    const amps = Object.values(parts).filter(p => p.type === 'opamp'), n = nodes.size + amps.length + 1;
    const A = Array.from({ length: n }, () => Array.from({ length: n }, () => [0, 0])), B = Array.from({ length: n }, () => [0, 0]);
    const ix = (id, pin) => nodes.get(net(id, pin));
    function stamp(i, j, z) { if (i !== undefined && j !== undefined) A[i][j] = add(A[i][j], z); }
    Object.values(parts).forEach(p => {
        if (!['resistor', 'capacitor'].includes(p.type)) return;
        const a = ix(p.id, 0), b = ix(p.id, 1), y = p.type === 'resistor' ? [1 / values[p.id], 0] : [0, 2 * Math.PI * f * values[p.id]];
        stamp(a, a, y); stamp(b, b, y); stamp(a, b, neg(y)); stamp(b, a, neg(y));
    });
    let k = nodes.size; stamp(ix('Vin', 0), k, [1, 0]); stamp(k, ix('Vin', 0), [1, 0]); B[k++] = [1, 0];
    amps.forEach(p => { stamp(ix(p.id, 'OUT'), k, [1, 0]); stamp(k, ix(p.id, 'IN+'), [1, 0]); stamp(k, ix(p.id, 'IN-'), [-1, 0]); k++; });
    for (let c = 0; c < n; c++) {
        let pivot = c;
        for (let j = c + 1; j < n; j++) if (Math.hypot(...A[j][c]) > Math.hypot(...A[pivot][c])) pivot = j;
        assert.ok(Math.hypot(...A[pivot][c]) > 1e-20, '节点矩阵奇异：断路/短接');
        [A[c], A[pivot]] = [A[pivot], A[c]]; [B[c], B[pivot]] = [B[pivot], B[c]];
        const d = A[c][c]; for (let j = c; j < n; j++) A[c][j] = div(A[c][j], d); B[c] = div(B[c], d);
        for (let i = 0; i < n; i++) if (i !== c) { const m = A[i][c]; for (let j = c; j < n; j++) A[i][j] = add(A[i][j], neg(mul(m, A[c][j]))); B[i] = add(B[i], neg(mul(m, B[c]))); }
    }
    return B[ix('Vout', 0)];
}
const expand = (arch, c) => arch === 'notch' ? { R1: c.R, R2: c.R, R3: c.R / 2, C1: c.C, C2: c.C, C3: c.C * 2 } : c;
for (const arch of Object.keys(s.FilterFigures.names)) test('滤波器 ' + arch + '：非标称/标称节点方程、反算和正向回填', () => {
    const defaults = Object.fromEntries(Object.entries(s.REV_ARCHS[arch].def).map(([k, v]) => [k, s.parseVal(v)]));
    for (const c of [defaults, Object.fromEntries(Object.entries(defaults).map(([k, v], i) => [k, v * (1 + i * .31)]))]) {
        const values = expand(arch, c), p = s.FilterFigures.build(arch, values), fe = s.revFeatures(arch, c); paper(p);
        for (const factor of [.1, .9, 1, 1.1, 10]) near(Math.hypot(...response(p.doc, values, fe.fref * factor)), s.revH(arch, c, fe.fref * factor));
    }
    const spec = { arch, fc: 1500, fL: 1000, fH: 10000, f0: 2000, q: 2, rhoR: 100, rhoC: 1, T: 300 };
    const c = s.designOptimal(spec), values = Object.fromEntries(s.compList(spec, c).map(r => [r[0], r[1]]));
    const rev = arch === 'notch' ? { R: c.R1, C: c.C1 } : values;
    const f0 = arch === 'rc-bp' ? Math.sqrt(spec.fL * spec.fH) : ['notch', 'mfb-bp'].includes(arch) ? spec.f0 : spec.fc;
    near(s.revFeatures(arch, rev).fref, f0);
    const doc = s.FilterFigures.build(arch, values).doc;
    for (const factor of [.1, .9, 1, 1.1, 10]) {
        const f = f0 * factor; near(Math.hypot(...response(doc, values, f)), s.respH(spec, f)); near(s.revH(arch, rev, f), s.respH(spec, f));
    }
    if (arch === 'mfb-bp') { near(response(doc, values, f0)[0], -1); assert.equal(s.revFeatures(arch, rev).rows.find(r => r[0].includes('Q'))[1], '2.000'); }
});
test('RC 和 SK 高通确定基准、工程单位错误及溢出', () => {
    near(s.revFeatures('rc-lp', { R1: 1e4, C1: 1e-8 }).fref, 1591.54943091895);
    const c = { R1: 1e4, R2: 2e4, C1: 1e-8, C2: 1e-8 }, fe = s.revFeatures('sk-hp', c);
    near(fe.fref, 1125.39539519638); assert.equal(fe.rows[1][1], '0.707'); near(20 * Math.log10(s.revH('sk-hp', c, fe.fref)), -3.01029995664);
    for (const bad of ['1e', '1.2.3', '1e999', '1e308G', 'Infinity', '1junk']) assert.ok(Number.isNaN(s.parseVal(bad)), bad);
    near(s.parseVal('6.8n'), 6.8e-9, 1e-10);
});
const dp = { f: 1e6, p: 37, r0: 50, cb: 6.8e-9, esr: .1, esl: 1e-9, leak: 1e8, lb: 5e-6, rb: 150, cban: 6.8e-9, rext: 0, rd: 50, xd: 0, rm: 1e4, cm: 1e-8, rin: 1e6, cin: 1e-11, lrf: 5e-6 };
for (const kind of Object.keys(s.DPIFigures.titles)) test('DPI ' + kind + '：双模型/BAN 开关、真实端口、当前值往返', () => {
    for (const parasitic of [false, true]) for (const useBan of [false, true]) {
        const pack = s.DPIFigures.build(kind, { ...dp, parasitic, useBan }); paper(pack);
        const { net, parts, graph } = netlist(pack.doc);
        for (const p of Object.values(parts)) if (!['dot', 'ground'].includes(p.type)) R.portsWorld(p).forEach(pin => {
            if (p.id === 'Zdut' && ['L', 'R'].includes(pin.n)) return;
            assert.ok(graph.nets.get(graph.netOf(p.id, pin.n)).some(point => !point.comp), p.id + '.' + pin.n + ' 无导线');
        });
        function same(a, ai, b, bi) { assert.equal(net(a, ai), net(b, bi), a + ' / ' + b); }
        if (parts.Cblock) {
            assert.notEqual(net('Cblock', 0), net('Cblock', 1));
            if (parasitic) { same('ESR', 1, 'ESL', 0); same('ESL', 1, 'Cblock', 0); same('Rleak', 0, 'Cblock', 0); same('Rleak', 1, 'Cblock', 1); }
        }
        if (kind === 'ban') { same('Lban', 0, 'Rext', 0); same('Lban', 1, 'Rban', 0); same('Rban', 1, 'Cban', 0); assert.equal(net('Cban', 1), 'GND'); assert.equal(net('Rext', 1), 'GND'); }
        if (parts.Rm) { same('Rm', 1, 'Cm', 0); same('Cm', 0, 'Rin', 0); same('Cm', 0, 'Cin', 0); for (const id of ['Cm', 'Rin', 'Cin']) assert.equal(net(id, 1), 'GND'); }
        if (kind === 'injection') { same('Vs', 0, 'R0', 0); same('R0', 1, parasitic ? 'ESR' : 'Cblock', 0); same('Cblock', 1, 'Zdut', 'T'); assert.equal(net('Zdut', 'B'), 'GND'); if (useBan) same('Zdut', 'T', 'Lban', 1); else assert.ok(!parts.Lban); }
        if (kind === 'bench') {
            same('DUT', 'VDD', 'supply-Lban', 1); same('DUT', 'IN', 'Lrf', 1); same('DUT', 'OUT1', 'Cblock', 1); same('DUT', 'OUT2', 'Rm', 0);
            assert.equal(net('DUT', 'GND'), 'GND'); assert.notEqual(net('DUT', 'OUT1'), net('DUT', 'OUT2'));
            assert.equal(!!parts['out1-Lban'], useBan); assert.ok(pack.doc.items.some(i => /未设定/.test(i.text)));
        }
    }
});
for (const topo of Object.keys(E.specs)) test('电力电子 ' + topo + '：数值成组、无旧结果，添加标签不改变网络', () => {
    for (const mode of topo === 'buck' ? ['auto', 'sync'] : ['auto']) {
        const p = { ...E.defaults(topo), mode }, pack = s.PEFigures.pack(topo, mode, p); paper(pack);
        const a = G.build(s.PEFigures.build(topo, mode), R.portsWorld), b = G.build(pack.doc, R.portsWorld);
        for (const item of pack.doc.items.filter(i => i.kind === 'comp')) for (const pin of R.portsWorld(item)) assert.equal(a.netOf(item.id, pin.n), b.netOf(item.id, pin.n));
        assert.deepEqual(plain(pack.context.inputs), p); assert.match(s.CircuitFigure.render(pack.doc), /fsw/);
        assert.ok(pack.doc.groups.length >= 4); assert.equal(pack.context.Vout, undefined);
    }
});
test('DPI 既有功率、隔直、BAN、监测计算回归', () => {
    near(DPI.dbmToW(37), 5.01187233627); near(DPI.wToDbm(5.01187233627), 37); near(DPI.power(37, 50).pp, 44.7744227714);
    assert.throws(() => DPI.wToDbm(0)); assert.throws(() => DPI.power(0, 0));
    const p = { ...dp, parasitic: false, useBan: false }, w = 2 * Math.PI * p.f;
    near(DPI.block(p, p.f).im, -1 / (w * p.cb)); near(DPI.network(p, p.f).vpk, DPI.power(p.p, p.r0).sourcePk * p.rd / Math.hypot(p.r0 + p.rd, 1 / (w * p.cb)));
    near(DPI.monitor(p, p.f).ideal, 1 / (2 * Math.PI * p.rm * p.cm)); assert.equal(DPI.srf(p), null);
    p.parasitic = true; p.useBan = true; near(DPI.srf(p), 1 / (2 * Math.PI * Math.sqrt(p.esl * p.cb))); assert.equal(DPI.banZero(p), null);
    for (const f of [1e3, 1e6, 1e9]) { const z = DPI.impedances(p, f); for (const key of ['block', 'ban', 'eq', 'h']) assert.ok(Number.isFinite(z[key].re + z[key].im)); }
});

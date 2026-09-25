/* 可直接使用 Node 运行；加载真实符号、示例、几何与求解器，不依赖浏览器。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const base = path.resolve(__dirname, '../../..');
const context = { console }; context.window = context;
vm.createContext(context);
for (const name of ['razavi/razavi-symbols.js', 'razavi/render.js']) vm.runInContext(fs.readFileSync(path.join(base, name), 'utf8'), context);
const R = context.Razavi;
const N = require('../canvas-netlist.js');
const E = require('../engine.js');
const X = require('../examples.js');
const G = require('../../../js/circuit-connectivity.js');
const clone = x => JSON.parse(JSON.stringify(x));
const example = key => { const p = X.create(key, R); return N.build(p.doc, R.portsWorld, p.inputKind); };
function near(actual, expected, tol = 1e-8) { assert.ok(Math.abs(actual - expected) <= tol * Math.max(1e-30, Math.abs(expected)), `${actual} != ${expected}`); }
function close(a, b) { assert.ok(a && b); assert.ok(Math.hypot(a.re - b.re, a.im - b.im) / Math.max(1e-30, Math.hypot(b.re, b.im)) < 1e-6, JSON.stringify({ a, b })); }
function symbolCoefficients(s, net, key) {
    const values = Object.fromEntries(net.devices.map(d => [d.symbol, d.numeric]));
    const out = [];
    s.terms[key].forEach(([powers, value]) => {
        const es = powers.split(',').map(Number);
        let v = Number(value);
        for (let i = 1; i < es.length; i++) v *= values[s.terms.names[i]] ** es[i];
        out[es[0]] = (out[es[0]] || 0) + v;
    });
    return Array.from({ length: out.length }, (_, i) => out[i] || 0);
}
for (const key of Object.keys(X.names)) test('真实画布示例三通道对照：' + key, () => {
    const net = example(key), num = E.numeric(net), sym = E.symbolic(net);
    assert.equal(sym.expanded, true); assert.equal(num.poles.ok, true); assert.equal(num.zeros.ok, true);
    const sn = symbolCoefficients(sym, net, 'num'), sd = symbolCoefficients(sym, net, 'den');
    const sys = E.acSystem(net);
    for (const f of [1, 1e3, 159154.943091895, 1e7, 1e9]) {
        const z = E.complex.make(0, 2 * Math.PI * f);
        close(E.response(sys, net.output, f), E.evalRatio(num.num, num.den, z));
        close(E.evalRatio(sn, sd, z), E.evalRatio(num.num, num.den, z));
    }
    const sweep = E.sweep(net, num);
    assert.equal(sweep.reliable, true); assert.ok(sweep.rows.length >= 800 && sweep.rows.length <= 5000);
});
test('带尺度多项式比在大频率仍能求值', () => {
    const p = [1, 2, 3, 4, 5, 6, 7, 8, 1];
    close(E.evalRatio(p, p, E.complex.make(0, 1e150)), { re: 1, im: 0 });
});
test('RC 低通的系数、极点和截止频率', () => {
    const net = example('rc'), n = E.numeric(net);
    near(n.num[0], 1); near(n.den[1], 1e-6); near(n.poles.roots[0].re, -1e6);
    const h = E.response(E.acSystem(net), net.output, 1e6 / (2 * Math.PI));
    near(20 * Math.log10(Math.hypot(h.re, h.im)), -3.01029995664);
    near(Math.atan2(h.im, h.re) * 180 / Math.PI, -45);
});
test('单级负增益、级联及并联 gm', () => {
    near(E.numeric(example('gm')).num[0], -10);
    near(E.numeric(example('cascade')).num[0], 10000);
    near(E.numeric(example('parallel')).num[0], -30);
    const n = example('parallel'); n.devices.find(d => d.symbol === 'gm2').value = '-1';
    const zero = E.numeric(n); assert.equal(zero.zeroTransfer, true); assert.equal(zero.text, '0');
    assert.equal(zero.zeros.roots.length, 0);
    assert.ok(E.sweep(n, zero).rows.every(r => r.phase === null && r.db === null));
});
test('耦合电容保留右半平面零点与真实二阶分母', () => {
    const net = example('coupling'), n = E.numeric(net);
    near(n.zeros.roots[0].re, 1e9);
    near(n.den[1], (1e-5 * 22e-12 + 2e-5 * 12e-12 + 2e-12 * 2e-3) / (1e-5 * 2e-5));
    near(n.den[2], (12e-12 * 22e-12 - 2e-12 ** 2) / (1e-5 * 2e-5));
    const s = E.sweep(net, n, { auto: false, min: 1e3, max: 1e11 });
    assert.ok(s.rows[s.rows.length - 1].phase < -260);
});
test('跨阻幅值与纯电容原点极点', () => {
    const n = E.numeric(example('transimpedance')); near(20 * Math.log10(n.num[0]), 80);
    const net = example('integrator'), i = E.numeric(net);
    assert.equal(i.poles.roots[0].re, 0); assert.equal(i.poles.roots[0].multiplicity, 1);
    near(i.num[0], 1e11); assert.deepEqual(i.den, [0, 1]);
    assert.ok(E.sweep(net, i).rows.every(r => Math.abs(r.phase + 90) < 1e-8));
});
test('精确前缀、科学计数法与合法性', () => {
    assert.deepEqual(E.decimal('1', 'm'), E.decimal('1000', 'u'));
    assert.deepEqual(E.decimal('0.001e3', ''), [1n, 1n]);
    assert.deepEqual(E.decimal('1e0001', 'm'), [1n, 100n]);
    assert.deepEqual(E.decimal('0e400', 'G'), [0n, 1n]);
    assert.deepEqual(E.decimal('-0e-400', 'f'), [0n, 1n]);
    assert.throws(() => E.decimal('0e401', 'G'), /指数/);
    const a = (value, prefix = '') => ({ version: 1, symbol: 'gm1', value, prefix });
    near(N.valueOf(a('2', 'M'), 'gm'), 2e6); near(N.valueOf(a('2', 'm'), 'gm'), 2e-3);
    near(N.valueOf(a('2', 'p'), 'C'), 2e-12); near(N.valueOf(a('2', 'f'), 'C'), 2e-15);
    assert.equal(N.valueOf(a(''), 'R'), null); assert.equal(N.valueOf(a('0'), 'C'), 0);
    near(N.valueOf(a('-2', 'm'), 'gm'), -0.002);
    near(N.valueOf(a('1e0001', 'm'), 'gm'), 0.01);
    assert.equal(N.valueOf(a('0e400', 'G'), 'gm'), 0);
    for (const v of ['NaN', 'Infinity', '1x', '0x10', '1e999', '1e-400', '1e-151', '1e151']) assert.throws(() => N.valueOf(a(v), 'gm'));
    assert.throws(() => N.valueOf(a('0'), 'R')); assert.throws(() => N.valueOf(a('-1'), 'C'));
    for (const name of ['s', 'j', 'e', 'pi', '__proto__', 'A+B', '1gm', 'a'.repeat(65)]) assert.equal(N.validName(name), false);
    assert.equal(N.validName('_gain2'), true);
});
test('缺值只跳过数值，超预算保留精确矩阵', () => {
    const net = example('gm'); net.devices[0].value = '';
    assert.equal(E.numeric(net).missing.length, 1); assert.equal(E.symbolic(net).expanded, true);
    const s = E.symbolic(net, { terms: 0 });
    assert.equal(s.expanded, false); assert.equal(s.matrix.a.length, 3); assert.match(s.reason, /未展开/);
    assert.equal(E.symbolic(net, { matrixOnly: true }).expanded, false);
    assert.equal(E.symbolic(net, { characters: 1 }).expanded, false);
});
const poly = a => a.map(x => E.decimal(String(x), ''));
test('四阶全复根、左右半平面、重复根与原点重数', () => {
    const p = E.poly.mul(poly([2, 2, 1]), poly([13, -4, 1]));
    const r = E.roots(p); assert.equal(r.ok, true); assert.equal(r.roots.length, 4);
    for (const [re, im] of [[-1, 1], [-1, -1], [2, 3], [2, -3]]) assert.ok(r.roots.some(z => Math.hypot(z.re - re, z.im - im) < 1e-7));
    const repeated = E.poly.mul(E.poly.mul(poly([0, 0, 1]), poly([1, 3, 3, 1])), E.poly.mul(poly([1, 0, 1]), poly([1, 0, 1])));
    const rr = E.roots(repeated); assert.equal(rr.ok, true);
    assert.equal(rr.roots.find(z => z.re === 0 && z.im === 0).multiplicity, 2);
    assert.equal(rr.roots.find(z => Math.abs(z.re + 1) < 1e-8).multiplicity, 3);
    assert.equal(rr.roots.filter(z => Math.abs(z.im) > 0.9).length, 2);
    assert.ok(rr.roots.filter(z => Math.abs(z.im) > 0.9).every(z => z.multiplicity === 2));
    assert.equal(E.poly.gcd(poly([1, 1]), poly([1.0000001, 1])).length, 1);
});
test('数值奇异与零电容、负跨导', () => {
    const net = example('integrator'); net.devices[0].value = '0';
    assert.throws(() => E.numeric(net), /恒奇异/);
    const gm = example('gm'); gm.devices.find(d => d.kind === 'C').value = '0';
    gm.devices.find(d => d.kind === 'gm').value = '-1';
    const n = E.numeric(gm); near(n.num[0], 10); assert.equal(n.den.length, 1);
    assert.throws(() => E.sweep(gm, n, { min: 10, max: 1 }), /频率范围/);
    assert.ok(Number.isNaN(E.complex.make(0, NaN).im));
});
test('工程错误、悬空端、地合并与额度', () => {
    const p = X.create('gm', R), d = p.doc;
    const bad = clone(d); bad.items.push(clone(bad.items[0])); assert.throws(() => N.validateDoc(bad), /ID/);
    const unknown = clone(d); unknown.items[0].type = 'inductor'; assert.throws(() => N.validateDoc(unknown), /不支持/);
    const noGround = clone(d); noGround.items = noGround.items.filter(i => i.type !== 'ground'); assert.throws(() => N.build(noGround, R.portsWorld, 'voltage'), /地/);
    const floating = clone(d); floating.items.find(i => i.type === 'transconductance-4t').x += 10; assert.throws(() => N.build(floating, R.portsWorld, 'voltage'), /悬空/);
    const duplicate = clone(d); duplicate.items.find(i => i.type === 'resistor').analysis.symbol = 'gm1'; assert.throws(() => N.validateDoc(duplicate), /重复/);
    const coords = clone(d); coords.items[0].x = Infinity; assert.throws(() => N.validateDoc(coords), /坐标/);
    const over = clone(d); for (let i = 0; i < 9; i++) over.items.push({ ...clone(d.items.find(i => i.type === 'capacitor')), id: 'extra' + i, analysis: { version: 1, symbol: 'extraC' + i, value: '1', prefix: 'p' } });
    assert.throws(() => N.build(over, R.portsWorld, 'voltage'), /最多/);
    const net = example('gm'); assert.equal(net.nodeCount, 2); assert.ok(net.mapping.filter(p => p.name === 'ground').every(p => p.node === 0));
});
function device(kind, symbol, nodes, value, prefix = '') { return { kind, symbol, nodes, value: String(value), prefix }; }
function network(devices, nodeCount = 2, output = 2) { return { nodeCount, input: 1, output, inputKind: 'voltage', devices, warnings: [] }; }
test('四端 gm 浮置输出及差分反馈的完整印章', () => {
    const net = network([device('gm', 'gm1', [1, 3, 2, 3], 1, 'm'), device('R', 'R1', [2, 0], 1, 'k'), device('R', 'R2', [3, 0], 1, 'k')], 3);
    near(E.numeric(net).num[0], -0.5);
    near(E.response(E.acSystem(net), 3, 100).re, 0.5);
});
test('精确与近似相消分离，并保留隐藏的右半平面模态', () => {
    const net = network([device('R', 'R1', [1, 2], 1, 'k'), device('C', 'C1', [1, 2], 1, 'n'), device('R', 'R2', [2, 0], 1, 'k'), device('C', 'C2', [2, 0], 1.0000001, 'n')]);
    const n = E.numeric(net); assert.equal(n.num.length, 2); assert.equal(n.den.length, 2); assert.match(n.warnings.join(), /未自动作近似相消/);
    net.devices[3].value = '1'; const exact = E.numeric(net); assert.equal(exact.num.length, 1); assert.equal(exact.hidden.roots.length, 1); near(exact.num[0], 0.5);
    const unstable = network([device('gm', 'gm1', [1, 0, 2, 0], 1, 'm'), device('gm', 'gm2', [2, 0, 2, 0], -2, 'm'), device('R', 'R1', [2, 0], 1, 'k'), device('C', 'C1', [2, 0], 1, 'n')], 2, 1);
    const u = E.numeric(unstable); near(u.num[0], 1); near(u.hidden.roots[0].re, 1e6); assert.match(u.warnings.join(), /内部模态包含右半平面/);
});
test('9×9 MNA 和 24 个器件保留七阶精确重极点', () => {
    const devices = [];
    for (let i = 1; i <= 8; i++) {
        devices.push(device('R', 'R' + i, [i, 0], 1, 'k'), device('C', 'C' + i, [i, 0], 1, 'n'));
        devices.push(device('gm', 'gm' + i, [i === 1 ? 8 : i - 1, 0, i, 0], 1, 'm'));
    }
    const net = network(devices, 8, 8), n = E.numeric(net);
    assert.equal(n.den.length, 8); assert.equal(n.poles.roots[0].multiplicity, 7); near(n.poles.roots[0].re, -1e6);
    close(E.response(E.acSystem(net), 8, 1e5), E.evalRatio(n.num, n.den, E.complex.make(0, 2 * Math.PI * 1e5)));
    const fallback = E.symbolic(net, { terms: 10 }); assert.equal(fallback.expanded, false); assert.equal(fallback.matrix.a.length, 9);
});
test('求根失败保持明确状态，并且不阻断 MNA 扫频', () => {
    const failed = E.roots(poly(['1e-300', 0, 0, '1e300'])); assert.equal(failed.ok, false); assert.match(failed.error, /未可靠求得/);
    const net = example('rc'), n = E.numeric(net); n.poles = failed; n.zeros = failed;
    assert.equal(E.sweep(net, n).reliable, true);
});
test('几何超节点、器件超限、孤立网络与旁路提示', () => {
    const d = X.create('gm', R).doc;
    for (let i = 0; i < 7; i++) d.items.push({ kind: 'comp', type: 'dot', id: 'isolated' + i, x: 2000 + i * 100, y: 2000 });
    assert.throws(() => N.build(d, R.portsWorld, 'voltage'), /超过 8/);
    d.items.splice(-6); assert.throws(() => N.build(d, R.portsWorld, 'voltage'), /隔离/);
    const p = X.create('gm', R).doc, r = p.items.find(i => i.type === 'resistor');
    for (let i = 0; i < 22; i++) p.items.push({ ...clone(r), id: 'extra' + i, analysis: { ...r.analysis, symbol: 'extraR' + i } });
    assert.throws(() => N.build(p, R.portsWorld, 'voltage'), /最多/);
    const bypass = X.create('gm', R).doc;
    bypass.items.push({ kind: 'comp', id: 'shortedR', type: 'resistor', x: 450, y: 160, rot: 1, analysis: { version: 1, symbol: 'Rshort', value: '1', prefix: 'k' } });
    const net = N.build(bypass, R.portsWorld, 'voltage'); assert.match(net.warnings.join(), /旁路/); near(E.numeric(net).num[0], -10);
});
test('四端引脚与所有旋转镜像的共享坐标', () => {
    const pins = clone(R.ports('transconductance-4t'));
    assert.deepEqual(pins.map(p => [p.n, p.x, p.y]), [['cp', -40, -20], ['cn', -40, 20], ['op', 40, -20], ['on', 40, 20]]);
    for (let rot = 0; rot < 4; rot++) for (const fh of [false, true]) for (const fv of [false, true]) {
        const c = { type: 'transconductance-4t', x: 140, y: 220, rot, fh, fv };
        assert.deepEqual(clone(R.portsWorld(c)), pins.map(p => G.world(c, p)));
    }
    assert.deepEqual(clone(R.ports('transconductance')).map(p => p.n), ['A', 'Y']);
    const symbol = JSON.parse(fs.readFileSync(path.join(base, 'razavi/transconductance-4t.symbol.json'), 'utf8'));
    assert.deepEqual(clone(context.RAZAVI_SYMBOLS['transconductance-4t']), symbol);
});
test('长折线、T 接、无点十字不连通、有点十字连通', () => {
    const dot = (id, x, y) => ({ kind: 'comp', type: 'dot', id, x, y, rot: 0 });
    const wire = (id, ps) => ({ kind: 'wire', id, pts: ps.map(([x, y]) => ({ x, y })) });
    const d = { items: [dot('a', -100, 0), dot('b', 0, -100), dot('c', 100, 80), wire('w1', [[-100, 0], [100, 0], [100, 80]]), wire('w2', [[0, -100], [0, 100]])] };
    let g = G.build(d, R.portsWorld);
    assert.equal(g.netOf('a', 'p'), g.netOf('c', 'p')); assert.notEqual(g.netOf('a', 'p'), g.netOf('b', 'p'));
    d.items.push(dot('join', 0, 0)); g = G.build(d, R.portsWorld); assert.equal(g.netOf('a', 'p'), g.netOf('b', 'p'));
    const t = { items: [dot('a', -100, 0), dot('b', 0, -100), wire('w1', [[-100, 0], [100, 0]]), wire('w2', [[0, -100], [0, 0]])] };
    g = G.build(t, R.portsWorld); assert.equal(g.netOf('a', 'p'), g.netOf('b', 'p'));
});
test('真值表原 2 选 1 真实示例保持 8 行结果', () => {
    const TTN = require('../../truth-table/canvas-netlist.js'), TTE = require('../../truth-table/engine.js');
    const src = fs.readFileSync(path.join(base, 'tools/truth-table/script.js'), 'utf8');
    const start = src.indexOf('var EXAMPLE_DOC ='), end = src.indexOf('})();', start) + 5;
    const fixture = {}; vm.createContext(fixture); vm.runInContext(src.slice(start, end), fixture);
    const ir = TTN.buildIRFromDoc(fixture.EXAMPLE_DOC, R.ports), result = TTE.evaluateIR(ir);
    const expected = TTE.evaluateIR(TTE.buildIRFromText(TTE.TEXT_EXAMPLES.mux));
    assert.equal(result.R, 8); assert.deepEqual(Array.from(result.outMasks), Array.from(expected.outMasks));
    for (let row = 0; row < 8; row++) assert.equal(Number((result.outMasks[0] >> BigInt(row)) & 1n), row & 4 ? row & 1 : (row >> 1) & 1);
});

/* 下列测试使用可控 DOM/消息/时钟边界，验证真实宿主脚本；不冒充浏览器交互验收。 */
class Element {
    constructor() { this.listeners = {}; this.dataset = {}; this.style = {}; this.children = new Map(); this.value = ''; this.textContent = ''; this.innerHTML = ''; this.disabled = false; this.checked = false; this.tagName = 'DIV'; this.classList = { add() {}, remove() {}, toggle() {} }; }
    addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
    fire(type, extra = {}) { for (const cb of this.listeners[type] || []) cb({ target: this, key: '', preventDefault() {}, stopPropagation() {}, ...extra }); }
    setAttribute(name, value) { this[name] = value; }
    removeAttribute(name) { delete this[name]; }
    getAttribute(name) { return this[name]; }
    querySelector(name) { if (!this.children.has(name)) this.children.set(name, new Element()); return this.children.get(name); }
    querySelectorAll() { return []; }
    appendChild(el) { el.parentNode = this; return el; }
    insertBefore(el) { el.parentNode = this; return el; }
    replaceChildren() {}
    focus() {}
    select() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
    closest() { return null; }
    contains() { return false; }
    remove() {}
    click() { this.fire('click'); }
}
function sandbox() {
    const els = new Map(), callbacks = {}, observers = [], timers = new Map(), stores = new Map([['ee-circuit-sketch-v2', 'original-main-archive']]); let tid = 0;
    const get = id => { if (!els.has(id)) els.set(id, new Element()); return els.get(id); };
    const document = new Element(); document.getElementById = get; document.createElement = () => new Element(); document.head = new Element(); document.body = new Element(); document.documentElement = new Element();
    document.querySelectorAll = () => [];
    const s = { console, document, TFNetlist: N, TFExamples: X, Razavi: R, CircuitConnectivity: G, Blob,
        location: { origin: 'http://test.local', search: '?embed=tf' },
        localStorage: { getItem: k => stores.get(k) || null, setItem: (k, v) => stores.set(k, v) },
        setTimeout: (cb, ms) => { const id = ++tid; timers.set(id, { cb, ms }); return id; }, clearTimeout: id => timers.delete(id),
        requestAnimationFrame: () => 1, cancelAnimationFrame() {},
        getComputedStyle: () => ({ getPropertyValue: () => '#123456' }), MutationObserver: class { constructor(cb) { observers.push(cb); } observe() {} },
        addEventListener: (type, cb) => (callbacks[type] ||= []).push(cb), confirm: () => true,
        copyTextToClipboard: (_, cb) => cb(true) };
    s.window = s; s.globalThis = s; vm.createContext(s);
    const common = fs.readFileSync(path.join(base, 'js/common.js'), 'utf8');
    vm.runInContext(common.slice(common.indexOf('var Theme =')), s);
    return { s, get, timers, stores, callbacks, themeMutation: () => observers.forEach(cb => cb()), dispatch: (type, e) => { for (const cb of callbacks[type] || []) cb(e); } };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function host() {
    const env = sandbox(), { s, get, stores, dispatch } = env;
    const workers = [], sent = []; let revision = 0, doc = { items: [], groups: [] }, inputKind = 'voltage', editing = false;
    const win = { postMessage(m) {
        sent.push(m);
        const answer = { revision, requestId: m.requestId };
        if (m.type === 'tf-get-doc') Object.assign(answer, { type: 'tf-doc', doc: clone(doc), inputKind, editing });
        else {
            answer.type = 'tf-ack';
            if (editing && m.type !== 'tf-set-theme') answer.error = '草稿尚未结束';
            else if (m.type === 'tf-load-doc') { doc = clone(m.doc); inputKind = m.inputKind; answer.revision = ++revision; }
            else if (m.type === 'tf-set-input-kind') { inputKind = m.inputKind; answer.revision = ++revision; }
        }
        Promise.resolve().then(() => send(answer));
    } };
    function send(data, origin = s.location.origin, source = win) { dispatch('message', { data, origin, source }); }
    get('ckFrame').contentWindow = win;
    const frameWrap = new Element(); s.document.body.appendChild(frameWrap); frameWrap.appendChild(get('ckFrame'));
    vm.runInContext(fs.readFileSync(path.join(base, 'js/circuit-handoff.js'), 'utf8'), s);
    s.Worker = class {
        constructor() { workers.push(this); this.terminated = false; }
        postMessage(m) { this.payload = m; }
        terminate() { this.terminated = true; }
        emit(type, payload = {}) { this.onmessage({ data: { type, jobId: this.payload.jobId, revision: this.payload.revision, ...payload } }); }
    };
    vm.runInContext(fs.readFileSync(path.join(base, 'tools/transfer-function/script.js'), 'utf8'), s);
    send({ type: 'tf-ready', revision });
    return { ...env, workers, sent, send, changed() { doc.items[0].x++; revision++; send({ type: 'tf-doc-changed', revision, inputKind }); }, edit(value) { editing = value; }, archive: () => JSON.parse(stores.get('ee-transfer-function-v1')) };
}
test('宿主：独立存档、取消、过期与旧 Worker 响应隔离', async () => {
    const h = host(); await settle();
    assert.equal(h.archive().doc.items.length, X.create('gm', R).doc.items.length);
    assert.equal(h.stores.get('ee-circuit-sketch-v2'), 'original-main-archive');
    h.get('generate').fire('click'); await settle(); const w = h.workers[0]; assert.ok(w);
    w.emit('numeric', { numeric: E.numeric(w.payload.net) });
    assert.match(h.get('numericText').textContent, /10/);
    h.changed(); assert.equal(w.terminated, true); assert.equal(h.get('stale').hidden, false);
    w.emit('numeric', { numeric: { missing: [], text: 'WRONG_OLD_RESULT' } });
    assert.doesNotMatch(h.get('numericText').textContent, /WRONG/);
    assert.equal(h.get('copyNumeric').disabled, true);
    h.get('generate').fire('click'); await settle(); const w2 = h.workers[1]; assert.ok(w2);
    h.get('cancel').fire('click'); assert.equal(w2.terminated, true);
    assert.equal(h.stores.get('ee-circuit-sketch-v2'), 'original-main-archive');
});
test('宿主：草稿锁、外域消息拒绝和连续生成', async () => {
    const h = host(); await settle(); h.edit(true);
    h.get('generate').fire('click'); await settle(); assert.equal(h.workers.length, 0); assert.match(h.get('status').textContent, /草稿/);
    h.edit(false); h.get('generate').fire('click'); await settle(); const w = h.workers[0];
    h.send({ type: 'tf-doc-changed', revision: 999 }, 'http://evil.local'); assert.equal(w.terminated, false);
    h.send({ type: 'tf-doc-changed', revision: 999 }, h.s.location.origin, {}); assert.equal(w.terminated, false);
    h.get('generate').fire('click'); h.get('generate').fire('click'); await settle();
    assert.equal(w.terminated, true); assert.equal(h.workers.length, 2);
});
test('宿主：硬超时保留未展开矩阵，Worker 错误可恢复', async () => {
    const h = host(); await settle(); h.get('generate').fire('click'); await settle();
    const w = h.workers[0]; w.emit('matrix', { symbolic: E.symbolic(w.payload.net, { matrixOnly: true }) });
    const numericTimer = Array.from(h.timers.values()).find(t => t.ms === 15000); assert.ok(numericTimer);
    w.emit('stage', { stage: 'symbolic' }); const timer = Array.from(h.timers.values()).find(t => t.ms === 5000); assert.ok(timer); timer.cb();
    assert.equal(w.terminated, true); assert.match(h.get('symbolicState').textContent, /未展开/); assert.match(h.get('status').textContent, /超时/);
    h.get('generate').fire('click'); await settle(); const w2 = h.workers[1];
    w2.onerror({ preventDefault() {}, message: 'test error' }); assert.equal(w2.terminated, true); assert.match(h.get('diagnostics').innerHTML, /test error/);
});
test('真实 Worker 分阶段消息与缺值/奇异处理', () => {
    const messages = [], s = { TFEngine: E, importScripts() {}, postMessage: m => messages.push(m) }; s.self = s; vm.createContext(s);
    vm.runInContext(fs.readFileSync(path.join(base, 'tools/transfer-function/worker.js'), 'utf8'), s);
    s.onmessage({ data: { type: 'compute', jobId: 3, revision: 7, net: example('rc'), frequency: { auto: true } } });
    assert.deepEqual(messages.map(m => m.type), ['matrix', 'numeric', 'sweep', 'stage', 'symbolic', 'done']);
    assert.ok(messages.every(m => m.jobId === 3 && m.revision === 7));
    messages.length = 0; const n = example('gm'); n.devices[0].value = '';
    s.onmessage({ data: { type: 'compute', jobId: 4, revision: 8, net: n } });
    assert.equal(messages.find(m => m.type === 'numeric').numeric.missing.length, 1); assert.ok(messages.some(m => m.type === 'symbolic'));
    messages.length = 0; const broken = example('integrator'); broken.devices[0].value = '0';
    s.onmessage({ data: { type: 'compute', jobId: 5, revision: 9, net: broken } });
    assert.ok(messages.some(m => m.type === 'issue' && /恒奇异/.test(m.message))); assert.ok(!messages.some(m => m.type === 'numeric'));
});
test('脚本语法、HTML 本地依赖与所有 symbol JSON/bundle 一致', () => {
    const js = ['js/circuit-connectivity.js', 'js/common.js', 'razavi/render.js', 'razavi/razavi-symbols.js', 'tools/circuit-sketch/script.js', 'tools/circuit-sketch/parameter-editor.js', 'tools/truth-table/canvas-netlist.js', 'tools/transfer-function/script.js', 'tools/transfer-function/engine.js', 'tools/transfer-function/canvas-netlist.js', 'tools/transfer-function/examples.js', 'tools/transfer-function/worker.js'];
    for (const file of js) assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(base, file), 'utf8'), { filename: file }));
    for (const file of ['index.html', 'tools/transfer-function/index.html', 'tools/circuit-sketch/index.html', 'tools/truth-table/index.html']) {
        const source = fs.readFileSync(path.join(base, file), 'utf8');
        for (const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (m[1].trim()) assert.doesNotThrow(() => new vm.Script(m[1]));
        for (const m of source.matchAll(/(?:src|href)="([^"#?]+)"/g)) if (!m[1].includes(':')) assert.ok(fs.existsSync(path.resolve(base, path.dirname(file), m[1])), file + ': ' + m[1]);
    }
    const catalog = JSON.parse(fs.readFileSync(path.join(base, 'razavi/catalog.json'), 'utf8'));
    JSON.parse(fs.readFileSync(path.join(base, 'razavi/i18n-zh.json'), 'utf8'));
    for (const e of catalog.entries) assert.deepEqual(clone(context.RAZAVI_SYMBOLS[e.symbolId]), JSON.parse(fs.readFileSync(path.join(base, 'razavi', e.assetPath), 'utf8')));
});
test('共享 SVG 导出包含参数、长标签，旋转镜像不反转文字', () => {
    const p = X.create('gm', R).doc, it = p.items.find(i => i.type === 'transconductance-4t');
    it.text = 'gm_parameter_with_a_very_long_symbol_name = 2 uS'; it.rot = 1; it.fh = true;
    const bounds = R.itemOuterBBox(it, { editorText: true }), textBounds = R.textBBox(it);
    assert.ok(bounds.x0 <= textBounds.x0 && bounds.x1 >= textBounds.x1 && bounds.y0 <= textBounds.y0);
    const svg = R.docSvg(p, { editorText: true, standalone: true }).str;
    assert.match(svg, /gm_parameter_with_a_very_long_symbol_name/); assert.match(svg, /2 uS/); assert.doesNotMatch(svg, /NaN|undefined/);
    const body = R.itemSvg(it, { editorText: true }); assert.ok(body.indexOf('</g></g>') < body.indexOf('<text'));
});
function editor(mode = 'tf') {
    const env = sandbox(), { s } = env, sent = [];
    s.location.search = mode ? '?embed=' + mode : '';
    s.parent = { postMessage: m => sent.push(m) };
    vm.runInContext(fs.readFileSync(path.join(base, 'tools/circuit-sketch/parameter-editor.js'), 'utf8'), s);
    const src = fs.readFileSync(path.join(base, 'tools/circuit-sketch/script.js'), 'utf8');
    vm.runInContext(src.slice(0, src.indexOf('(function boot()')), s);
    s.render = () => s.tfNotify(); s.renderProps = () => {}; s.setTool = () => {}; s.fitContent = () => {}; s.closeMenus = () => {}; s.setStatus = () => {};
    s.initParameters(); if (mode === 'tf') s.initTFBridge();
    return { ...env, sent, message: data => env.dispatch('message', { data: { requestId: 'test', ...data }, origin: s.location.origin, source: s.parent }) };
}
test('编辑器：白名单、保存隔离、桥接草稿锁及输入模式撤销', () => {
    const e = editor(), { s } = e;
    assert.equal(s.EMBED.devices.length, 7);
    e.message({ type: 'tf-load-doc', ...X.create('gm', R) }); const doc = JSON.stringify(s.doc);
    s.parameterEditor.active = true; e.message({ type: 'tf-load-doc', doc: { items: [] } }); assert.equal(JSON.stringify(s.doc), doc);
    e.message({ type: 'tf-get-doc' }); assert.equal(e.sent.at(-1).editing, true);
    s.parameterEditor.active = false; e.message({ type: 'tf-set-input-kind', inputKind: 'current' }); assert.equal(s.tfInputKind, 'current');
    s.undo(); assert.equal(s.tfInputKind, 'voltage'); s.redo(); assert.equal(s.tfInputKind, 'current');
    s.saveLocal(); s.menuActions['save-local'](); assert.equal(e.stores.get('ee-circuit-sketch-v2'), 'original-main-archive');
    e.message({ type: 'tt-load-doc', doc: { items: [] } }); assert.ok(s.doc.items.length > 0);
    const tt = editor('tt'); assert.equal(tt.s.EMBED.devices.length, 13); tt.s.saveLocal(); tt.s.menuActions['save-local'](); assert.equal(tt.stores.get('ee-circuit-sketch-v2'), 'original-main-archive');
    const main = editor(''); assert.equal(main.s.deviceVisible('tf-in'), false); assert.equal(main.s.deviceVisible('transconductance-4t'), true);
});
test('参数会话：非法值保留草稿，确认一次撤销，复制重新编号', () => {
    const e = editor(), { s, get } = e; e.message({ type: 'tf-load-doc', ...X.create('gm', R) });
    const it = s.doc.items.find(i => i.type === 'transconductance-4t'), original = JSON.stringify(it.analysis), count = s.undoStack.length;
    s.startTextEdit(it); const dialog = get('ckParameterDialog'), form = dialog.querySelector('form');
    dialog.querySelector('[name="value"]').value = 'NaN'; form.fire('submit'); assert.equal(s.parameterEditor.active, true); assert.equal(JSON.stringify(it.analysis), original);
    dialog.querySelector('[name="value"]').value = '2'; dialog.querySelector('[name="prefix"]').value = 'u'; form.fire('submit');
    assert.equal(s.parameterEditor.active, false); assert.equal(it.analysis.value, '2'); assert.equal(it.analysis.prefix, 'u'); assert.equal(s.undoStack.length, count + 1);
    s.undo(); assert.equal(JSON.stringify(s.doc.items.find(i => i.id === it.id).analysis), original); s.redo();
    s.clipboard = [clone(s.doc.items.find(i => i.id === it.id))]; s.pasteClip();
    const copy = s.doc.items.at(-1); assert.notEqual(copy.analysis.symbol, it.analysis.symbol); assert.equal(copy.analysis.value, '2'); assert.equal(copy.analysis.prefix, 'u');
    const beforeCancel = s.undoStack.length; s.startTextEdit(copy); dialog.fire('keydown', { key: 'Escape' });
    assert.equal(s.parameterEditor.active, false); assert.equal(s.undoStack.length, beforeCancel);
});
test('导入原子校验拒绝 SVG 属性注入和无效富文本端口名', () => {
    const e = editor(), { s } = e; e.message({ type: 'tf-load-doc', ...X.create('gm', R) }); const original = JSON.stringify(s.doc);
    const p = X.create('rc', R); p.doc.items[0].stroke = 'black" onload="alert(1)';
    e.message({ type: 'tf-load-doc', ...p }); assert.equal(JSON.stringify(s.doc), original); assert.match(e.sent.at(-1).error, /颜色/);
    p.doc.items[0].stroke = '#000'; p.doc.items[0].richText = { version: 1, align: 'middle', lines: [{ runs: [{ text: 's' }] }] };
    e.message({ type: 'tf-load-doc', ...p }); assert.equal(JSON.stringify(s.doc), original); assert.match(e.sent.at(-1).error, /名称/);
});
test('主题双向同步只改变显示，不终止计算或修改草稿和存档', async () => {
    const h = host(); await settle();
    assert.ok(h.sent.some(m => m.type === 'tf-set-theme' && m.theme === 'light'));
    h.get('generate').fire('click'); await settle(); const w = h.workers[0];
    const archive = h.stores.get('ee-transfer-function-v1');
    h.s.Theme.set('dark'); h.themeMutation(); await settle();
    assert.equal(h.sent.at(-1).theme, 'dark');
    h.send({ type: 'tf-theme-changed', revision: 1, theme: 'light' }); h.themeMutation(); await settle();
    assert.equal(h.s.Theme.get(), 'light'); assert.equal(w.terminated, false);
    assert.equal(h.stores.get('ee-transfer-function-v1'), archive);
    h.send({ type: 'tf-theme-changed', revision: 1, theme: 'dark' }, 'https://other.local');
    assert.equal(h.s.Theme.get(), 'light');
    const e = editor(), { s } = e; e.message({ type: 'tf-load-doc', ...X.create('gm', R) });
    const doc = JSON.stringify(s.doc), revision = s.tfRevision, undo = s.undoStack.length;
    s.parameterEditor.active = true;
    e.message({ type: 'tf-set-theme', theme: 'dark' }); e.themeMutation();
    assert.equal(s.Theme.get(), 'dark'); assert.equal(e.sent.at(-1).error, '');
    assert.ok(!e.sent.some(m => m.type === 'tf-theme-changed'));
    s.Theme.toggle(); e.themeMutation(); assert.equal(e.sent.at(-1).type, 'tf-theme-changed');
    assert.equal(e.sent.at(-1).theme, 'light');
    e.message({ type: 'tf-set-theme', theme: 'invalid' }); assert.match(e.sent.at(-1).error, /主题/);
    assert.equal(s.parameterEditor.active, true); assert.equal(JSON.stringify(s.doc), doc);
    assert.equal(s.tfRevision, revision); assert.equal(s.undoStack.length, undo);
    assert.equal(e.stores.get('ee-circuit-sketch-v2'), 'original-main-archive');
});
test('SVG 桥等待导出完成，异步错误与等待期间的图纸变化明确失败', async () => {
    const e = editor(), { s } = e, downloads = []; e.message({ type: 'tf-load-doc', ...X.create('gm', R) });
    s.download = (name, blob) => downloads.push({ name, blob });
    let release; s.document.fonts = { ready: new Promise(resolve => { release = resolve; }) };
    e.message({ type: 'tf-export', format: 'svg', requestId: 'svg1' });
    assert.ok(!e.sent.some(m => m.requestId === 'svg1'));
    release(); await settle();
    assert.equal(downloads[0].name, 'circuit.svg'); assert.equal(e.sent.at(-1).error, '');
    assert.match(await downloads[0].blob.text(), /gm1/);
    s.document.fonts.ready = Promise.reject(new Error('字体失败'));
    e.message({ type: 'tf-export', format: 'svg', requestId: 'svg2' }); await settle();
    assert.match(e.sent.at(-1).error, /字体失败/); assert.equal(downloads.length, 1);
    s.document.fonts.ready = new Promise(resolve => { release = resolve; });
    e.message({ type: 'tf-export', format: 'svg', requestId: 'svg3' });
    e.message({ type: 'tf-set-input-kind', inputKind: 'current' }); release(); await settle();
    assert.match(e.sent.at(-1).error, /图纸已改变/); assert.equal(downloads.length, 1);
});
test('PNG 桥等待编码，覆盖解码/编码失败、超时及迟到回调', async () => {
    const e = editor(), { s } = e, downloads = [], images = []; let encode;
    e.message({ type: 'tf-load-doc', ...X.create('gm', R) }); s.download = name => downloads.push(name);
    s.Image = class { constructor() { images.push(this); } };
    const create = s.document.createElement;
    s.document.createElement = tag => tag !== 'canvas' ? create(tag) : {
        getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: cb => { encode = cb; }
    };
    e.message({ type: 'tf-export', format: 'png', requestId: 'png1' }); await settle();
    assert.ok(!e.sent.some(m => m.requestId === 'png1'));
    images.at(-1).onload(); await settle(); assert.equal(downloads.length, 0);
    encode(new Blob(['png'])); await settle(); assert.deepEqual(downloads, ['circuit.png']); assert.equal(e.sent.at(-1).error, '');
    e.message({ type: 'tf-export', format: 'png', requestId: 'png2' }); await settle();
    images.at(-1).onerror(); await settle(); assert.match(e.sent.at(-1).error, /栅格化/);
    e.message({ type: 'tf-export', format: 'png', requestId: 'png3' }); await settle();
    images.at(-1).onload(); encode(null); await settle(); assert.match(e.sent.at(-1).error, /编码失败/);
    e.message({ type: 'tf-export', format: 'png', requestId: 'png4' }); await settle();
    images.at(-1).onload();
    const timeout = Array.from(e.timers.values()).find(t => t.ms === 10000); timeout.cb(); await settle();
    assert.match(e.sent.at(-1).error, /超时/); encode(new Blob(['late'])); await settle(); assert.equal(downloads.length, 1);
    e.message({ type: 'tf-export', format: 'png', requestId: 'png5' }); await settle();
    images.at(-1).onload(); s.parameterEditor.active = true; encode(new Blob(['draft'])); await settle();
    assert.match(e.sent.at(-1).error, /草稿/); assert.equal(downloads.length, 1);
});

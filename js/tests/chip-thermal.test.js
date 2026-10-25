/* 运行：node --test js/tests/chip-thermal.test.js。数值及 DOM/Worker 替身自测，不替代独立浏览器验收。 */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const C = require('../../tools/chip-thermal/thermal-core.js');
const U = require('../../tools/chip-thermal/script.js');
const { Element, Storage } = require('./handoff-harness.js');
const root = path.resolve(__dirname, '../..');
const code = file => fs.readFileSync(path.join(root, file), 'utf8');
const prefix = 'tools/chip-thermal/';
const html = code(prefix + 'index.html'), home = code('index.html');
const clone = v => structuredClone(v);
function near(a, b, tol = 1e-9) { assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tol, `${a} != ${b} (tol=${tol})`); }
function config(n = 16) { const c = U.buildConfig(U.restore(null)); c.n = n; return c; }
function allNear(values, expected, tol = 1e-9) { values.forEach(v => near(v, expected, tol)); }

test('严格数值、科学计数法及序列去重排序', () => {
    near(C.number(' +1.2e3 ', 1e-3), 1.2); near(C.number('-.5'), -0.5);
    assert.deepEqual(C.series('2,0，1 2\n.5', 1), [0, 0.5, 1, 2]);
    assert.deepEqual(C.series('-40, 25', 1, 'temperature'), [-40, 25]);
    for (const s of ['', ' ', '1A', '1e', '0x10', 'NaN', 'Infinity', '1e309', '1.2.3']) assert.throws(() => C.number(s));
    for (const s of ['', '-1', Array(51).fill('1').join(',')]) assert.throws(() => C.series(s));
});
test('单位换算保持物理量且溢出不写回状态', () => {
    const s = U.restore(null);
    for (const [key, unit] of [['r25', '1'], ['area', '1e-12'], ['thickness', '0.001'], ['time', '1'], ['voltage', '0.001'], ['currentCustom', '0.001']]) {
        const before = U.read(s, key); U.changeUnit(s, key, unit); near(U.read(s, key), before, Math.abs(before) * 1e-12);
    }
    const list = U.read(s, 'currentList'); U.changeUnit(s, 'currentList', '0.001'); assert.deepEqual(U.read(s, 'currentList'), list);
    const src = U.sourceState(false); U.changeUnit(src, 'power', '0.001', U.SOURCE_DEFS); near(U.read(src, 'power', U.SOURCE_DEFS), 0.1);
    s.input.voltage = '1e308'; s.units.voltage = '1'; const old = clone(s);
    assert.throws(() => U.changeUnit(s, 'voltage', '0.001'), /超范围/); assert.deepEqual(s, old);
    assert.throws(() => U.changeUnit(s, 'voltage', '99'));
});
test('稳态正算、热失稳、临界及敏感状态基线', () => {
    const v = C.conduction(.05, .4, 40, 25, 2);
    near(v.resistance, .05165289256198347); near(v.power, .2066115702479339); near(v.temperature, 33.264462809917354);
    near(v.critical, 11.180339887498949); near(C.conduction(.05, .4, 40, 25, 12).g, 1.152);
    assert.equal(C.conduction(.05, .4, 40, 25, 12).status, 'runaway');
    assert.equal(C.conduction(.05, .4, 40, 25, Math.sqrt(.98 / .008)).status, 'sensitive');
    assert.equal(C.conduction(.05, .4, 40, 25, 12).temperature, undefined);
});
test('零电流、零及负 TCR、低于环境的约束', () => {
    const zero = C.conduction(.05, .4, 40, 50, 0); near(zero.temperature, 50); near(zero.power, 0); near(zero.resistance, .055);
    near(C.conduction(.05, 0, 40, 25, 2).temperature, 33);
    const neg = C.conduction(.05, -.4, 40, 25, 2); assert.ok(neg.temperature < 33 && neg.temperature > 25); assert.equal(neg.critical, null);
    near(C.resistanceAt(.05, -.4, neg.temperature), neg.resistance);
    assert.equal(C.maxCurrent(.05, .4, 40, 50, 40).status, 'ambient-over-limit');
    near(C.maxCurrent(.05, .4, 40, 50, 50).current, 0);
});
test('反算基线及正反一致，不以提醒阈值截断', () => {
    const v = C.maxCurrent(.05, .4, 40, 25, 125); near(v.resistance, .07); near(v.power, 2.5); near(v.current, 5.976143046671968);
    for (const tcr of [0, .4, -.1]) for (const t of [25, 85, 125, 200]) {
        const a = C.maxCurrent(.05, tcr, 40, 25, t); near(C.conduction(.05, tcr, 40, 25, a.current).temperature, t);
    }
    const s = U.restore(null); s.input.limitCustom = '200'; const row = U.tableData(s, 'limit').rows.at(-1);
    assert.notEqual(row.cells[2], '—'); assert.match(row.cells[3], /高于提醒阈值/);
});
test('输入的绝对零度、非正电阻/热阻及非有限中间值均拒绝', () => {
    for (const args of [[0, .4, 40, 25, 1], [.05, .4, 0, 25, 1], [.05, .4, 40, -273.15, 1], [.05, .4, 40, 25, -1], [.05, -4, 40, 100, 1], [.05, .4, 40, 25, 1e200]]) assert.throws(() => C.conduction(...args));
    assert.throws(() => C.maxCurrent(.05, -4, 40, 25, 100));
    assert.throws(() => C.constantDrop(-1, 40, 25, 1));
    assert.throws(() => C.constantDrop(1e308, 40, 25, 1e308));
    assert.throws(() => C.dimensions(0, 1)); assert.throws(() => C.temperature(Infinity));
});
test('恒压降单主管功耗和结温基线', () => {
    assert.deepEqual(C.constantDrop(.5, 40, 25, 1), { power: .5, temperature: 45 });
    assert.deepEqual(C.constantDrop(0, 40, 25, 10), { power: 0, temperature: 25 });
});
test('DCT 正逆变换及离散 Neumann 特征模态', () => {
    const n = 8, b = C.basis(n), v = Float64Array.from({ length: n * n }, (_, i) => Math.sin(i * .7));
    const recovered = C.transform(C.transform(v, n, b, false), n, b, true); v.forEach((x, i) => near(recovered[i], x));
    const c = config(n), m = C.createModel(c), g = C.geometry(c), mode = new Float64Array(n * n); mode[2 * n + 1] = 1;
    const u = C.transform(mode, n, b, true);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const lap = ((x ? u[i - 1] : u[i]) + (x < n - 1 ? u[i + 1] : u[i]) - 2 * u[i]) / g.dx ** 2
            + ((y ? u[i - n] : u[i]) + (y < n - 1 ? u[i + n] : u[i]) - 2 * u[i]) / g.dy ** 2;
        near(-c.diffusivity * lap, m.rates[2 * n + 1] * u[i], 1e-9);
    }
});
test('边界和跨单元热源功率守恒，触边允许', () => {
    for (const n of [16, 64, 128]) {
        const c = config(n); c.sources[0].x = .437; c.sources[0].y = .541; c.sources[0].power = 1.234;
        let g = C.geometry(c), q = C.raster(g, g.rects); near(q.reduce((a, b) => a + b, 0) * g.dx * g.dy, 1.234, 1e-12);
        c.sources[0].x = .125; c.sources[0].y = .125; g = C.geometry(c); q = C.raster(g, g.rects); near(q.reduce((a, b) => a + b, 0) * g.dx * g.dy, 1.234, 1e-12);
    }
});
test('越界、重叠、亚网格及源数限制明确拒绝', () => {
    let c = config(); c.sources[0].x = .01; assert.throws(() => C.geometry(c), /边界/);
    c = config(); c.sources.push(clone(c.sources[0])); assert.throws(() => C.geometry(c), /重叠/);
    c.sources[1].enabled = false; assert.doesNotThrow(() => C.geometry(c));
    c = config(); c.sources[0].area = 1e-12; assert.throws(() => C.geometry(c), /两个网格/);
    c = config(); c.sources = Array(9).fill(c.sources[0]); assert.throws(() => C.geometry(c), /1～8/);
    for (const n of [0, 129, 4.5, NaN]) { c = config(); c.n = n; assert.throws(() => C.geometry(c)); }
});
test('全芯片均匀源独立解析基准：热容、时间常数与指数响应', () => {
    const c = config(); c.sources[0].area = c.area;
    const capacity = c.heatCapacity * c.area * c.thickness, tau = c.theta * capacity, m = C.createModel(c);
    near(capacity, .001956); near(tau, .07824); near(m.beta, 1 / tau, 1e-9);
    for (const t of [0, 1e-12, .01, .1, 1]) {
        c.time = t; c.initial = 60;
        const expected = 25 + 35 * Math.exp(-t / tau) + .5 * 40 * -Math.expm1(-t / tau);
        allNear(C.solve(c, m).values, expected, 1e-9);
    }
    c.steady = true; allNear(C.solve(c, m).values, 45, 1e-9);
});
test('t=0 精确初温、零功耗与预热冷却', () => {
    const c = config(), m = C.createModel(c); c.time = 0; c.initial = 80;
    C.solve(c, m).values.forEach(v => assert.equal(v, 80));
    c.sources[0].power = 0; c.time = .02;
    allNear(C.solve(c, m).values, 25 + 55 * Math.exp(-m.beta * c.time));
    c.initial = 25; allNear(C.solve(c, m).values, 25);
    c.steady = true; allNear(C.solve(c, m).values, 25);
});
test('64/128 网格单源标定、对称性与非负温升', () => {
    for (const n of [64, 128]) {
        const c = config(n), m = C.createModel(c); assert.ok(m.error <= 1e-4);
        c.steady = true; const steady = C.solve(c, m); near(steady.max, 45, 20e-4); near(steady.mainMax, steady.max);
        c.steady = false;
        for (const t of [1e-12, 1e-6, .01, 10]) {
            c.time = t; const r = C.solve(c, m); assert.ok(r.min >= 25 - 1e-10);
            for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { near(r.values[y * n + x], r.values[y * n + n - 1 - x], 1e-9); near(r.values[y * n + x], r.values[(n - 1 - y) * n + x], 1e-9); }
        }
    }
});
test('附加热源叠加及平均温度解析式，β 保持不变', () => {
    const c = config(32); c.sources[0].x = .25;
    c.sources.push({ ...clone(c.sources[0]), name: '附加', x: .75, power: .3 });
    const m = C.createModel(c), combined = C.solve(c, m);
    const main = clone(c); main.sources[1].enabled = false;
    const extra = clone(c); extra.sources[0].power = 0;
    const a = C.solve(main, m), b = C.solve(extra, m);
    combined.values.forEach((v, i) => near(v - 25, a.values[i] + b.values[i] - 50, 1e-9));
    assert.ok(combined.max > a.max); assert.equal(combined.beta, a.beta); near(combined.totalPower, .8);
    const expected = 25 + .8 / (m.beta * c.heatCapacity * c.area * c.thickness) * -Math.expm1(-m.beta * c.time);
    near(combined.mean, expected, 1e-9);
    c.ambient = 30; c.initial = 60; c.time = .1; c.sources[1].x = .7;
    assert.equal(C.modelKey(c), m.key); assert.equal(C.solve(c, m).beta, m.beta);
    c.sources[0].x = .3; assert.notEqual(C.modelKey(c), m.key); assert.throws(() => C.solve(c, m), /缓存/);
});
test('小网格独立时域积分验证瞬态（不调用 DCT 时间算子）', () => {
    const c = config(8); c.sources[0].x = .4; c.sources[0].y = .6; c.initial = 40; c.time = .003;
    const m = C.createModel(c), g = C.geometry(c), q = C.raster(g, g.rects), count = 6000, dt = c.time / count, n = c.n;
    let u = new Float64Array(n * n).fill(c.initial - c.ambient);
    for (let step = 0; step < count; step++) {
        const next = new Float64Array(u.length);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            const i = y * n + x;
            const lap = ((x ? u[i - 1] : u[i]) + (x + 1 < n ? u[i + 1] : u[i]) - 2 * u[i]) / g.dx ** 2
                + ((y ? u[i - n] : u[i]) + (y + 1 < n ? u[i + n] : u[i]) - 2 * u[i]) / g.dy ** 2;
            next[i] = u[i] + dt * (c.diffusivity * lap - m.beta * u[i] + q[i] / (c.heatCapacity * c.thickness));
        }
        u = next;
    }
    C.solve(c, m).values.forEach((v, i) => near(v, u[i] + c.ambient, 2e-4));
});
test('网格细化收敛与主源面积改变后保持相同热阻峰值', () => {
    const c = config(32), results = [];
    for (const n of [32, 64, 128]) { c.n = n; const m = C.createModel(c); results.push(C.solve(c, m)); }
    assert.ok(Math.abs(results[2].mean - results[1].mean) < Math.abs(results[1].mean - results[0].mean));
    c.steady = true; c.sources[0].area = 1e-6; near(C.solve(c).max, 45, .002);
    near(C.solve(c).hotFraction, 0); c.threshold = 24; const hot = C.solve(c); near(hot.hotFraction, 1); near(hot.hotArea, c.area, 1e-15);
});
test('损坏存档、版本及白名单；错误数值原样保留', () => {
    for (const raw of ['{broken', 'null', '[]', '{"version":99}']) assert.deepEqual(U.restore(raw), U.restore(null));
    const s = U.restore(null); s.input.theta = '错误'; s.tab = 'drop'; s.follow = false; s.steady = true; s.sources.push(U.sourceState(false));
    assert.deepEqual(U.restore(JSON.stringify(s)), s);
    const bad = U.restore(JSON.stringify({ version: 1, input: { r25: '-1', extra: '非法' }, units: { r25: '99' }, sources: Array(10).fill({ enabled: false }) }));
    assert.equal(bad.input.r25, '-1'); assert.equal(bad.input.extra, undefined); assert.equal(bad.units.r25, '0.001'); assert.equal(bad.sources.length, 8); assert.equal(bad.sources[0].enabled, true);
});
test('表格单独口径、末行重复与高级参数隔离', () => {
    const s = U.restore(null); const before = U.tableData(s, 'drop');
    assert.equal(before.rows.at(-1).key, 'custom'); assert.equal(before.rows.at(-1).value, 1);
    assert.equal(before.rows.filter(r => r.value === 1).length, 2);
    s.sources.push(U.sourceState(false)); s.sources[1].enabled = true; s.sources[1].input.power = '100'; s.input.area = '';
    assert.deepEqual(U.tableData(s, 'drop'), before); assert.throws(() => U.buildConfig(s));
    s.input.area = '4'; s.sources[1].enabled = false; s.sources[1].input.area = ''; assert.doesNotThrow(() => U.buildConfig(s));
    s.input.r25 = ''; assert.equal(U.tableData(s, 'drop').exportable, true); assert.equal(U.tableData(s, 'current').exportable, false);
});
test('基础输入错误和有限超温不会冒充失稳，TSV 附当次口径', () => {
    const s = U.restore(null); s.input.currentCustom = '8'; let row = U.tableData(s, 'current').rows.at(-1); assert.match(row.cells[3], /超温/); assert.doesNotMatch(row.cells[3], /热失稳/);
    s.input.currentCustom = '12'; row = U.tableData(s, 'current').rows.at(-1); assert.equal(row.cells[0], '—'); assert.match(row.cells[3], /热失稳/);
    assert.match(U.tableTSV(s, 'drop'), /主管单独发热，未含其他热源/); assert.match(U.tableTSV(s, 'drop'), /0.5\t45/);
    assert.match(U.tableTSV(s, 'current'), /R25=0.05 Ω；TCR=0.4/);
    s.input.theta = ''; assert.throws(() => U.tableTSV(s, 'drop')); assert.equal(U.tableData(s, 'drop').rows[0].cells[0], '—');
});

// 执行真实适配层和 Worker 代码；DOM、Canvas、存储及消息投递为可控边界。
function harness(options = {}) {
    let doc, timeId = 0; const timers = new Map(), workers = [], downloads = [], copies = [], events = {}, drawings = [];
    class Node extends Element {
        get firstChild() { return this.children[0] || null; }
        get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
        set textContent(v) { this._text = String(v); if (this.children) { this.children.forEach(c => { c.parentNode = null; }); this.children = []; } }
        focus() { doc.activeElement = this; }
        select() { doc.activeElement = this; }
        getContext() {
            if (options.noCanvas) return null;
            return new Proxy({}, { get(obj, key) {
                if (key in obj) return obj[key];
                if (key === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
                if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
                return (...args) => { args.forEach(a => { if (typeof a === 'number') assert.ok(Number.isFinite(a), 'Canvas 坐标有限'); }); drawings.push([key, ...args]); };
            } });
        }
        toDataURL() { return 'data:image/png;base64,TEST'; }
        click() { if (this.tagName === 'A') downloads.push({ href: this.href, name: this.download }); return super.click(); }
    }
    const body = new Node('body');
    doc = { body, documentElement: new Node('html'), activeElement: body, createElement: tag => new Node(tag),
        getElementById: id => body.all().find(el => el.id === id) || null,
        execCommand: () => { copies.push(doc.activeElement.value); if (options.execThrows) throw Error('剪贴板失败'); return options.execResult !== false; } };
    const stack = [body];
    for (const m of html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').matchAll(/<(\/?)([\w-]+)\b([^>]*)>/g)) {
        const [, close, tag, attrs] = m;
        if (close) { if (stack.length > 1 && stack.at(-1).tagName === tag.toUpperCase()) stack.pop(); continue; }
        const el = new Node(tag); for (const a of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) { el.setAttribute(a[1], a[2]); if (a[1] === 'id') el.id = a[2]; if (a[1] === 'value') el.value = a[2]; }
        el.disabled = /\bdisabled\b/.test(attrs); el.checked = /\bchecked\b/.test(attrs);
        stack.at(-1).appendChild(el); if (!['meta', 'link', 'input', 'hr', 'br', 'img'].includes(tag)) stack.push(el);
    }
    const storage = new Storage(); if (options.raw) storage.setItem('ee-chip-thermal', options.raw);
    storage.failRead = storage.failWrite = !!options.storageThrows;
    const win = { localStorage: storage, navigator: { clipboard: options.clipboard },
        setTimeout: (fn, ms) => { timers.set(++timeId, { fn, ms }); return timeId; }, clearTimeout: id => timers.delete(id),
        addEventListener: (key, fn) => { events[key] = fn; },
        getComputedStyle: () => ({ getPropertyValue: key => key.includes('accent') ? '#c0583a' : key.includes('primary') ? '#3a5a8c' : '#fff' }),
        MutationObserver: class { constructor(fn) { events.theme = fn; } observe() {} } };
    if (!options.noWorker) win.Worker = class {
        constructor(url) {
            if (options.workerThrows) throw Error('Worker 禁用');
            assert.equal(url, 'thermal-worker.js'); workers.push(this); this.messages = []; this.calibrations = 0;
            const w = this; this.scope = vm.createContext({ self: { postMessage: data => { this.response = data; } },
                importScripts(file) { assert.equal(file, 'thermal-core.js'); vm.runInContext(code(prefix + file), w.scope); const create = w.scope.ThermalCore.createModel; w.scope.ThermalCore.createModel = c => { w.calibrations++; return create(c); }; } });
            vm.runInContext(code(prefix + 'thermal-worker.js'), this.scope);
        }
        postMessage(data) { this.payload = clone(data); this.messages.push(this.payload); }
        terminate() { this.terminated = true; }
        emit(data) { this.onmessage({ data }); }
        complete() { this.scope.self.onmessage({ data: this.payload }); this.emit(this.response); }
    };
    const app = U.mount(doc, win), get = doc.getElementById;
    function input(id, value, type = 'input') { const el = get(id); assert.ok(el, id); el.value = String(value); el.fire(type); }
    function flush() { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(t => { assert.equal(t.ms, 150); t.fn(); }); }
    return { app, get, doc, win, workers, downloads, copies, events, drawings, timers, storage, input, flush,
        complete() { flush(); workers.at(-1).complete(); },
        unit(id, value) { const el = get(id).parentNode.children.find(n => n.tagName === 'SELECT' && n !== get(id)); el.value = value; el.fire('change'); },
        source(i, key) { return get('sourceList').children[i].all().find(el => el.id && el.id.endsWith('-' + key) && el.tagName === 'INPUT'); } };
}
function heat(options) { const h = harness(options); h.get('tab-drop').click(); return h; }

test('DOM 接线、实时更新、自定义末行输入身份及焦点保持', () => {
    const h = harness(), input = h.get('currentCustom'); input.focus(); input.selectionStart = 1;
    h.input('currentCustom', '2'); assert.equal(h.doc.activeElement, input); assert.equal(h.get('currentCustom'), input); assert.equal(input.selectionStart, 1);
    assert.equal(h.get('currentCustomRow').children[1].textContent, '33.26446');
    h.input('currentList', '1,2'); assert.equal(h.get('currentCustom'), input); assert.equal(h.get('currentRows').children.length, 2);
    h.get('tab-limit').click(); assert.equal(h.get('panel-current').hidden, true); assert.equal(h.get('resistanceBlock').hidden, false);
    h.input('limitCustom', '125'); assert.equal(h.get('limitCustomRow').children[3].textContent, '5.976143');
    h.get('tab-limit').fire('keydown', { key: 'End' }); assert.equal(h.app.getState().tab, 'drop'); assert.equal(h.doc.activeElement, h.get('tab-drop'));
});
test('输入单位与共享参数切换、初温跟随和刷新恢复', () => {
    const h = heat(); h.unit('r25', '1'); assert.equal(h.get('r25').value, '0.05'); h.input('ambient', '50'); assert.equal(h.get('initial').value, '50');
    h.get('initialFollow').checked = false; h.get('initialFollow').fire('change'); h.input('initial', '75');
    h.get('addSource').click(); h.source(1, 'name').value = '模拟模块'; h.source(1, 'name').fire('input');
    const raw = h.storage.getItem('ee-chip-thermal'), restored = harness({ raw });
    assert.equal(restored.app.getState().tab, 'drop'); assert.equal(restored.get('r25').value, '0.05'); assert.equal(restored.get('initial').value, '75');
    assert.equal(restored.source(1, 'name').value, '模拟模块'); assert.doesNotMatch(raw, /"values"|"beta"/);
});
test('电流选择、预设删除回自定义、附加源只改变热图', () => {
    const h = heat(); const row = h.get('dropRows').children.find(r => r.all().some(n => n.type === 'radio' && n.value === 'i:2'));
    const radio = row.all().find(n => n.type === 'radio'); radio.checked = true; radio.fire('change'); h.complete();
    assert.match(h.get('heatTitle').textContent, /主管 I = 2 A.*主管 P = 1 W/);
    h.input('currentList', '0,1'); assert.equal(h.app.getState().selection, 'custom'); assert.match(h.get('selectionNotice').textContent, /移除/);
    const table = h.get('dropRows').textContent; h.get('addSource').click();
    const checkbox = h.get('sourceList').children[1].all().find(n => n.type === 'checkbox'); checkbox.checked = true; checkbox.fire('change'); h.complete();
    assert.equal(h.get('dropRows').textContent, table); assert.match(h.get('heatTitle').textContent, /全部热源 P = 0.6 W/);
    h.get('sourceList').children[1].all().find(n => n.tagName === 'BUTTON').click(); assert.equal(h.app.getState().sources.length, 1);
});
test('最多八源且新增默认关闭，名称用文本节点不注入 HTML', () => {
    const h = heat(); for (let i = 0; i < 10; i++) h.get('addSource').click(); assert.equal(h.app.getState().sources.length, 8); assert.equal(h.get('addSource').disabled, true);
    assert.ok(h.app.getState().sources.slice(1).every(s => !s.enabled));
    h.source(1, 'name').value = '<img src=x onerror=alert(1)>'; h.source(1, 'name').fire('input');
    assert.equal(h.get('sourceList').children[1].all().filter(n => n.tagName === 'IMG').length, 0);
});
test('真实 Worker 标定缓存复用，参数变化才重新标定', () => {
    const h = heat(); h.complete(); const w = h.workers[0]; assert.equal(w.calibrations, 1); assert.equal(h.app.isHeatValid(), true);
    h.input('time', '20'); h.complete(); assert.equal(h.workers.length, 1); assert.equal(w.calibrations, 1);
    h.input('dropCustom', '2'); h.complete(); assert.equal(w.calibrations, 1);
    h.get('addSource').click(); h.complete(); assert.equal(w.calibrations, 1);
    h.input('theta', '45'); h.complete(); assert.equal(w.calibrations, 2);
    assert.equal(h.get('exportPng').disabled, false);
});
test('旧 Worker 回包、迟到错误与防抖任务不能覆盖新结果', () => {
    const h = heat(); h.flush(); const old = h.workers[0];
    h.input('dropCustom', '2'); h.flush(); const current = h.workers[1]; assert.equal(old.terminated, true);
    old.complete(); old.onerror(); assert.equal(current.terminated, undefined); assert.equal(h.app.isHeatValid(), false);
    current.emit({ id: current.payload.id + 9, error: '不相关' }); current.complete(); assert.equal(h.app.isHeatValid(), true); assert.match(h.get('heatTitle').textContent, /主管 I = 2 A/);
    h.input('time', '20'); h.input('time', '30'); assert.equal(h.timers.size, 1); h.complete(); assert.match(h.get('heatTitle').textContent, /t = 0.03 s/);
});
test('几何错误隔离基础表、旧图明确过期且禁止导出和探针', () => {
    const h = heat(); h.complete(); const table = h.get('dropRows').textContent;
    h.input('area', ''); assert.equal(h.get('area').getAttribute('aria-invalid'), 'true'); assert.equal(h.get('dropRows').textContent, table);
    assert.equal(h.app.isHeatValid(), false); assert.match(h.get('heatStatus').textContent, /旧结果，当前参数未生效/); assert.equal(h.get('exportPng').disabled, true);
    h.get('exportPng').click(); assert.equal(h.downloads.length, 0); h.get('heatCanvas').fire('pointermove', { clientX: 400, clientY: 200 }); assert.match(h.get('probe').textContent, /暂停/);
    h.input('colorHigh', '200'); assert.equal(h.app.isHeatValid(), false);
    h.input('area', '4'); h.complete(); assert.equal(h.app.isHeatValid(), true);
});
test('热源越界、重叠及 Worker 数值失败都不导出伪有效图', () => {
    const h = heat(); h.complete(); h.source(0, 'x').value = '1'; h.source(0, 'x').fire('input'); assert.match(h.get('heatStatus').textContent, /边界/);
    h.source(0, 'x').value = '50'; h.source(0, 'x').fire('input'); h.flush();
    const w = h.workers.at(-1); w.payload.config.thickness = 1e308; w.complete(); assert.equal(h.app.isHeatValid(), false); assert.match(h.get('heatStatus').textContent, /超范围/);
});
test('Worker 缺失、构造或运行失败以及 Canvas 不可用保留表格', () => {
    for (const opt of [{ noWorker: true }, { workerThrows: true }, { noCanvas: true }, {}]) {
        const h = heat(opt); h.flush(); if (opt.noCanvas) h.workers[0].complete(); else if (!opt.noWorker && !opt.workerThrows) h.workers[0].onerror();
        assert.equal(h.app.isHeatValid(), false); assert.equal(h.get('dropCustomRow').children[2].textContent, '45'); assert.equal(h.get('exportPng').disabled, true);
        assert.match(h.get('heatStatus').textContent, /Worker|Canvas/);
    }
});
test('色标固定、色标错误与恢复、主题重绘及 PNG 参数快照', () => {
    const h = heat(); h.complete(); const low = h.get('colorLow').value, high = h.get('colorHigh').value;
    h.input('time', '100'); h.complete(); assert.equal(h.get('colorLow').value, low); assert.equal(h.get('colorHigh').value, high);
    const requests = h.workers[0].messages.length; h.input('colorHigh', '20'); assert.equal(h.app.isHeatValid(), false); assert.match(h.get('heatStatus').textContent, /色标/);
    h.input('colorHigh', '30'); assert.equal(h.app.isHeatValid(), true); assert.equal(h.workers[0].messages.length, requests); assert.match(h.get('heatStatus').textContent, /色标外/);
    h.events.theme(); h.get('exportPng').click(); assert.equal(h.downloads.length, 1); assert.equal(h.downloads[0].name, '芯片发热估算.png');
    const text = h.drawings.filter(a => a[0] === 'fillText').map(a => a[1]).join('\n');
    for (const pattern of [/简化二维/, /t = 0.1 s/, /主管 I = 1 A/, /色标 25～30 ℃/, /主功率管/, /总功耗 = 0.5 W/]) assert.match(text, pattern);
    h.get('fitColor').click(); assert.equal(h.app.isHeatValid(), true); h.get('defaultColor').click(); assert.equal(h.get('colorHigh').value, '150');
});
test('首次色标错误修正后自动计算，存在旧图时也恢复被阻断的新配置', () => {
    const s = U.restore(null); s.paletteDefault = false; s.input.colorHigh = '20';
    const h = heat({ raw: JSON.stringify(s) }); h.flush(); assert.equal(h.workers.length, 0);
    h.input('colorHigh', '150'); assert.equal(h.timers.size, 1); h.complete(); assert.equal(h.app.isHeatValid(), true);
    h.input('colorHigh', '20'); h.input('dropCustom', '2'); h.flush(); assert.equal(h.app.isHeatValid(), false);
    h.input('colorHigh', '150'); h.complete(); assert.equal(h.app.isHeatValid(), true); assert.match(h.get('heatTitle').textContent, /主管 I = 2 A/);
});
test('高精度电流序列单位换算保留所选预设', () => {
    const h = heat(); h.input('currentList', '0,0.3333333333333333');
    const radio = h.get('dropRows').children[1].all().find(n => n.type === 'radio'); radio.checked = true; radio.fire('change');
    h.unit('currentList', '0.001'); assert.notEqual(h.app.getState().selection, 'custom');
    near(U.selectedCurrent(h.app.getState()), 1 / 3, 1e-13); h.complete(); assert.equal(h.app.isHeatValid(), true);
});
test('真实长宽比、探针坐标、时间滑块和稳态按钮', () => {
    const h = heat(); h.input('aspect', '2'); h.complete();
    const draw = h.drawings.filter(a => a[0] === 'drawImage').at(-1); near(draw[4] / draw[5], 2);
    h.get('heatCanvas').fire('pointermove', { clientX: 455, clientY: 240 }); assert.match(h.get('probe').textContent, /单元中心 X=.*mm，Y=.*T=/);
    h.get('steadyBtn').click(); h.complete(); assert.match(h.get('heatTitle').textContent, /^稳态/);
    h.input('timeSlider', '.0001'); h.complete(); assert.equal(h.app.getState().steady, false); assert.equal(h.get('time').value, '0.1'); assert.match(h.get('thinWarning').textContent, /薄层/);
    h.input('timeEnd', '0.00001'); assert.match(h.get('heatStatus').textContent, /上限/); assert.equal(h.app.isHeatValid(), false);
});
test('禁用存储仍计算；TSV 剪贴板失败提示并恢复焦点', async () => {
    const h = harness({ storageThrows: true, clipboard: { writeText: () => Promise.reject(Error('拒绝')) }, execResult: false });
    assert.match(h.get('storageStatus').textContent, /存储不可用/); const focused = h.get('currentCustom'); focused.focus(); h.get('copyTable').click(); await Promise.resolve(); await Promise.resolve();
    assert.match(h.get('copyStatus').textContent, /复制失败/); assert.equal(h.doc.activeElement, focused); assert.match(h.copies[0], /R25=0.05/);
    const ok = heat(); ok.get('copyTable').click(); assert.match(ok.get('copyStatus').textContent, /已复制/); assert.match(ok.copies[0], /主管单独发热/);
});
test('剪贴板异步使用点击时的快照；卸载取消后台计算', async () => {
    let captured, resolve; const h = heat({ clipboard: { writeText: text => { captured = text; return new Promise(r => { resolve = r; }); } } });
    h.get('copyTable').click(); h.input('voltage', '1'); resolve(); await Promise.resolve(); assert.match(captured, /\|VDS\|=0.5 V/); assert.doesNotMatch(captured, /\|VDS\|=1 V/);
    h.flush(); const w = h.workers.at(-1); h.events.beforeunload(); assert.equal(w.terminated, true); assert.equal(h.timers.size, 0);
});
test('源码语法、本地资源、页脚指标、主题及可访问性约定', () => {
    for (const file of ['thermal-core.js', 'thermal-worker.js', 'script.js']) new vm.Script(code(prefix + file), { filename: file });
    for (const page of [html, home]) for (const m of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"#?]+)"/g)) if (!m[1].includes(':')) assert.ok(fs.existsSync(path.resolve(root, prefix, m[1])), m[1]);
    for (const id of ['busuanzi_value_site_uv', 'busuanzi_value_site_pv', 'busuanzi_value_page_pv']) assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]); assert.equal(new Set(ids).size, ids.length);
    const css = code(prefix + 'style.css'); assert.match(css, /\[hidden\]/); assert.match(css, /:focus-visible/); assert.match(css, /max-width: 440px/); assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i);
    vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], { localStorage: { getItem() { throw Error('禁用'); } } });
});
test('首页计算工具入口、图标安全注入和实际中英文搜索', () => {
    assert.equal((home.match(/href="tools\/chip-thermal\/index.html"/g) || []).length, 1);
    assert.ok(home.indexOf('id="icon-chip-thermal"') > home.indexOf('计算工具')); assert.ok(home.indexOf('id="icon-chip-thermal"') < home.indexOf('<!-- ========== 版图设计'));
    const card = new Element('a'); card.textContent = '芯片发热估算'; card.setAttribute('href', 'tools/chip-thermal/index.html');
    const grid = new Element(); grid.querySelectorAll = () => [card];
    const nodes = { 'icon-chip-thermal': new Element(), siteSearch: new Element(), searchClear: new Element(), searchEmpty: new Element() };
    const s = { document: { getElementById: id => nodes[id] || null, querySelectorAll: selector => selector === '.nav-card' ? [card] : [grid] }, Theme: { bind() {} }, location: {} };
    vm.createContext(s); const common = code('js/common.js'); vm.runInContext(common.slice(common.indexOf('var Icons ='), common.indexOf('// 格式化数字显示')), s);
    const scripts = [...home.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    vm.runInContext(scripts.find(t => t.includes('var ICON_TARGETS')), s); assert.match(nodes['icon-chip-thermal'].innerHTML, /<svg.*currentColor/);
    vm.runInContext(scripts.find(t => t.includes('var SEARCH_KEYS')), s);
    for (const query of ['芯片', '发热', '结温', '热阻', 'Rdson', 'MOS', 'thermal', 'SOA']) { nodes.siteSearch.value = query; nodes.siteSearch.fire('input'); assert.equal(card.style.display, '', query); }
    nodes.siteSearch.value = '不相关词'; nodes.siteSearch.fire('input'); assert.equal(card.style.display, 'none');
});

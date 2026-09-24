/* 可控 DOM、Canvas、Worker 消息和时钟边界：执行真实页面适配逻辑，不冒充浏览器验收。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../engine.js'), UI = require('../script.js');
const workerCode = fs.readFileSync(path.join(__dirname, '../worker.js'), 'utf8');
class Element {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {}; this.style = {};
        this.value = ''; this.disabled = false; this.hidden = false; this.clientWidth = 600; this._text = ''; this.className = '';
        this.classList = {
            contains: c => this.className.split(' ').includes(c),
            toggle: (c, on) => { if (on === undefined) on = !this.classList.contains(c); this.classList[on ? 'add' : 'remove'](c); },
            add: c => { if (!this.classList.contains(c)) this.className += ' ' + c; },
            remove: c => { this.className = this.className.split(' ').filter(x => x !== c).join(' '); }
        };
        this.paint = [];
        this.ctx = new Proxy({}, { get: (obj, name) => obj[name] || ((...args) => {
            args.forEach(a => { if (typeof a === 'number') assert.ok(Number.isFinite(a), 'Canvas 非有限坐标'); });
            if (['fillText', 'fillRect', 'scale'].includes(name)) this.paint.push([name, ...args, obj.fillStyle]);
        }) });
    }
    set textContent(s) { this._text = String(s); this.replaceChildren(); }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set innerHTML(s) { this._text = String(s); this.replaceChildren(); }
    get innerHTML() { return this._text; }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k]; }
    appendChild(c) { c.parent = this; this.children.push(c); return c; }
    append(...children) { children.forEach(c => this.appendChild(c)); }
    replaceChildren(...children) { this.children.forEach(c => { c.parent = null; }); this.children = []; this.append(...children); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    fire(type, extra = {}) { if (type === 'click' && this.disabled) return; (this.listeners[type] || []).forEach(fn => fn({ target: this, preventDefault() {}, ...extra })); }
    click() { this.fire('click'); }
    getContext() { return this.ctx; }
    getBoundingClientRect() { return { left: 0, width: this.clientWidth }; }
    all() { return [this, ...this.children.flatMap(c => c.all())]; }
}
function harness() {
    const body = new Element('body'), root = new Element('html'), timers = new Map(), workers = [], observers = [], blobs = [], revoked = [];
    root.appendChild(body); let nextTimer = 0;
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const el = new Element(match[1]); el.id = match[3]; el.disabled = /\bdisabled\b/.test(match[2]); body.appendChild(el);
        if (el.tagName === 'SELECT') {
            const content = html.slice(match.index + match[0].length).split('</select>')[0];
            const options = [...content.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)];
            const opt = options.find(o => /selected/.test(o[1])) || options[0]; el.value = opt[1].match(/value="([^"]+)"/)?.[1] || opt[2];
        }
    }
    const get = id => body.all().find(e => e.id === id) || null;
    const buttons = [...html.matchAll(/data-topo="([^"]+)"/g)].map(m => { const e = new Element('button'); e.dataset.topo = m[1]; body.appendChild(e); return e; });
    const win = {
        document: { body, documentElement: root, getElementById: get, createElement: tag => new Element(tag), querySelectorAll: () => buttons },
        devicePixelRatio: 2, setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; }, clearTimeout: id => timers.delete(id),
        PEFigures: { render: (topo, mode) => topo + ':' + mode },
        getComputedStyle: () => ({ getPropertyValue: name => ({ '--color-text': '#ddd', '--color-card-bg': '#222', '--color-primary': '#abc', '--color-border': '#444' })[name] }),
        MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} },
        ResizeObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} },
        addEventListener: (type, fn) => root.addEventListener(type, fn),
        Blob: class { constructor(parts, options) { this.parts = parts; this.type = options.type; } },
        URL: { createObjectURL: b => { blobs.push(b); return 'blob:pe-' + blobs.length; }, revokeObjectURL: u => revoked.push(u) },
        Worker: class {
            constructor(url) { assert.equal(url, 'worker.js'); this.terminated = false; workers.push(this); }
            postMessage(payload) { this.payload = payload; }
            terminate() { this.terminated = true; }
            emit(data) { this.onmessage({ data }); }
            finish() {
                const worker = this, s = { importScripts: file => assert.equal(file, 'engine.js'), PowerElectronics: E,
                    postMessage: msg => worker.emit(msg) }; s.self = s; vm.createContext(s); vm.runInContext(workerCode, s);
                s.onmessage({ data: this.payload });
            }
        }
    };
    function flush(ms) { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } }
    UI.mount(win);
    return { win, get, workers, observers, blobs, revoked, timers, flush,
        select: topo => buttons.find(b => b.dataset.topo === topo).click(),
        input: (id, value, type = 'input') => { get(id).value = String(value); get(id).fire(type); },
        complete: () => { flush(150); workers.at(-1).finish(); },
        card: id => get('waveArea').children.find(e => e.dataset.channel === id) };
}
function raw(topo) { const p = E.defaults(topo); return Object.fromEntries(E.specs[topo].fields.map(k => [k, String(p[k] / E.fields[k].factor)])); }
test('六拓扑输入解析只读取有效字段，不替换非法值', () => {
    for (const topo of Object.keys(E.specs)) {
        assert.deepEqual(UI.parseInputs(topo, raw(topo), 'A', 'auto'), E.defaults(topo));
        for (const key of E.specs[topo].fields) for (const bad of ['', ' ', '0', '-1', 'NaN', 'Infinity', '1e999', '2junk', '0x10']) {
            assert.throws(() => UI.parseInputs(topo, { ...raw(topo), [key]: bad }, 'A', 'auto'));
        }
    }
    assert.equal(UI.parseInputs('buck', { ...raw('buck'), Iout: '2000', Lm: '' }, 'mA', 'auto').Iout, 2);
    assert.equal(UI.convertCurrent(UI.convertCurrent('0.125', 'A', 'mA'), 'mA', 'A'), '0.125');
    assert.equal(UI.convertCurrent('', 'A', 'mA'), '');
});
test('真实页面初始计算、统计、CSV、DPR 和毫伏刻度', () => {
    const h = harness(); assert.equal(h.get('exportCsv').disabled, true); assert.equal(h.workers.length, 0);
    h.complete(); assert.equal(h.workers.length, 1); assert.equal(h.get('exportCsv').disabled, false);
    assert.match(h.get('dcParams').textContent, /1\.5002 mV/);
    const card = h.card('Vout'), canvas = card.children[2];
    assert.equal(canvas.width, 1200); assert.equal(canvas.height, 400); assert.match(card.textContent, /平均/);
    assert.ok(canvas.paint.some(p => p[0] === 'fillText' && /Δvo；平均 6 V/.test(p[1])));
    assert.ok(canvas.paint.some(p => p[0] === 'fillText' && /(?:mV|µV)/.test(p[1])));
    assert.ok(canvas.paint.some(p => p[0] === 'fillRect' && p.at(-1) === '#222'));
    h.get('exportCsv').click(); assert.equal(h.blobs.length, 1);
    assert.equal(h.blobs[0].parts[0], E.csv(E.solve(E.defaults('buck'))));
    h.flush(1000); assert.deepEqual(h.revoked, ['blob:pe-1']);
});
test('页面 A↔mA 物理值保持、拓扑独立存储及隐藏参数隔离', () => {
    const h = harness(); h.input('param-L', 23); h.input('iLoadUnit', 'mA', 'change'); h.complete();
    assert.equal(h.get('param-Iout').value, '2000'); assert.equal(h.workers.at(-1).payload.params.Iout, 2);
    h.select('flyback'); assert.equal(h.get('param-L'), null); assert.equal(h.get('param-Lm').value, '10');
    h.input('param-Lm', 31); h.complete(); assert.equal(h.workers.at(-1).payload.params.L, undefined);
    h.select('llc'); h.complete(); assert.equal(h.get('modeField').hidden, true); assert.equal(h.get('param-D'), null);
    h.select('dsd'); assert.equal(h.get('param-D').max, '50'); assert.equal(h.get('param-D').value, '25');
    h.select('buck'); assert.equal(h.get('param-L').value, '23'); assert.equal(h.get('iLoadUnit').value, 'mA');
    h.input('iLoadUnit', 'A', 'change'); h.complete(); assert.equal(h.get('param-Iout').value, '2');
    h.select('flyback'); assert.equal(h.get('param-Lm').value, '31');
});
test('输入立即过期、150ms 防抖、快速切换和迟到响应不能覆盖新结果', () => {
    const h = harness(); h.complete(); h.input('param-Cout', 200);
    assert.equal(h.get('exportCsv').disabled, true); assert.ok(h.get('waveArea').classList.contains('is-stale'));
    h.input('param-Cout', 300); h.flush(150); const old = h.workers.at(-1);
    h.select('boost'); assert.equal(old.terminated, true); h.complete(); const snapshot = h.get('dcParams').textContent;
    old.emit({ id: old.payload.id, ok: true, result: E.solve(E.defaults('buck')) }); assert.equal(h.get('dcParams').textContent, snapshot);
    const fresh = h.workers.at(-1); fresh.emit({ id: fresh.payload.id, ok: false, error: '迟到错误' });
    assert.equal(h.get('exportCsv').disabled, false); assert.ok(!h.get('calculationStatus').textContent.includes('迟到错误'));
});
test('取消待执行/运行任务、无效参数和求解错误禁止旧 CSV', () => {
    const h = harness(); h.get('cancelCalculation').click(); h.flush(150); assert.equal(h.workers.length, 0);
    h.get('recalculate').click(); const w = h.workers.at(-1); h.get('cancelCalculation').click(); assert.equal(w.terminated, true);
    w.finish(); assert.equal(h.get('exportCsv').disabled, true);
    h.get('recalculate').click(); h.workers.at(-1).finish(); assert.equal(h.get('exportCsv').disabled, false);
    h.input('param-Iout', 0); h.flush(150); assert.match(h.get('calculationStatus').textContent, /空载/);
    assert.equal(h.get('waveArea').getAttribute('aria-busy'), 'false'); assert.equal(h.get('exportCsv').disabled, true);
    h.input('param-Iout', ''); h.flush(150); assert.match(h.get('calculationStatus').textContent, /有效数值/);
    h.select('dsd'); h.input('param-D', 51); h.flush(150); assert.match(h.get('calculationStatus').textContent, /占空比/);
    h.select('llc'); h.input('param-fsw', 500); h.complete(); assert.equal(h.get('exportCsv').disabled, true);
    assert.match(h.get('calculationStatus').textContent, /工作点|稳态|奇异/);
});
test('Worker 创建/加载/传输错误和硬超时均可恢复', () => {
    const h = harness(); const Constructor = h.win.Worker;
    h.win.Worker = class { constructor() { throw new Error('不可创建'); } }; h.flush(150);
    assert.match(h.get('calculationStatus').textContent, /不可创建/);
    h.win.Worker = Constructor;
    for (const failure of ['onerror', 'onmessageerror', 'timeout']) {
        h.get('recalculate').click(); const w = h.workers.at(-1);
        if (failure === 'timeout') h.flush(11000); else w[failure]();
        assert.equal(w.terminated, true); assert.equal(h.get('exportCsv').disabled, true);
        assert.equal(h.get('cancelCalculation').disabled, true); assert.equal(h.get('waveArea').getAttribute('aria-busy'), 'false');
    }
    h.get('recalculate').click(); h.workers.at(-1).finish(); assert.equal(h.get('exportCsv').disabled, false);
});
test('显示周期、AC/DC、主题和窗口变化只重绘，光标使用真实时间', () => {
    const h = harness(); h.complete(); const original = h.get('dcParams').textContent;
    h.input('ncycle', 5, 'change'); h.input('voltageView', 'dc', 'change'); h.observers.forEach(o => o.fn());
    const canvas = h.card('Vout').children[2]; canvas.clientWidth = 240; h.observers.forEach(o => o.fn());
    assert.equal(canvas.width, 480);
    canvas.fire('pointermove', { clientX: 158 }); assert.match(h.card('Vout').children[3].textContent, /t=5 µs/);
    canvas.fire('keydown', { key: 'ArrowRight' }); assert.match(h.card('Vout').children[3].textContent, /t=5\.05 µs/);
    assert.equal(h.workers.length, 1); assert.equal(h.get('dcParams').textContent, original); assert.equal(h.get('exportCsv').disabled, false);
    h.input('param-Vin', 13); assert.match(h.card('Vout').children[3].textContent, /^旧结果/);
    canvas.fire('pointerleave'); assert.match(h.card('Vout').children[3].textContent, /移动指针/);
});
test('锁定纵轴跨参数保持，超范围明确提示', () => {
    const h = harness(); h.complete(); h.input('axisMode', 'locked', 'change'); h.input('param-Cout', 10); h.complete();
    const canvas = h.card('Vout').children[2]; assert.ok(canvas.paint.some(p => p[0] === 'fillText' && /超出锁定范围/.test(p[1])));
    assert.match(h.get('scaleHint').textContent, /已锁定/);
    h.input('voltageView', 'dc', 'change'); canvas.paint = []; h.input('voltageView', 'ac', 'change');
    assert.ok(canvas.paint.some(p => p[0] === 'fillText' && /超出锁定范围/.test(p[1])));
    h.input('axisMode', 'auto', 'change'); assert.match(h.get('scaleHint').textContent, /自动缩放/);
});
test('当前 Worker 的错误 ID、卸载取消和 Buck 续流方式切换', () => {
    const h = harness(); h.flush(150); const w = h.workers.at(-1);
    w.emit({ id: w.payload.id + 999, ok: true, result: null }); assert.equal(w.terminated, false);
    assert.equal(h.get('exportCsv').disabled, true); w.finish();
    h.input('param-Iout', 0.1); h.input('modeSel', 'sync', 'change'); h.complete();
    assert.match(h.get('topoFig').innerHTML, /buck:sync/); assert.match(h.get('dcParams').textContent, /同步/);
    assert.ok(h.card('iReturn')); assert.equal(h.card('iD'), undefined);
    h.input('param-Vin', 15); h.flush(150); const current = h.workers.at(-1);
    h.win.document.documentElement.fire('beforeunload'); assert.equal(current.terminated, true); assert.equal(h.timers.size, 0);
});
test('实际 Worker 协议忽略无效请求，并保留参数校验错误码', () => {
    const messages = [], s = { PowerElectronics: E, importScripts() {}, postMessage: m => messages.push(m) }; s.self = s;
    vm.createContext(s); vm.runInContext(workerCode, s);
    for (const data of [null, {}, { id: '1', params: {} }, { id: 1 }]) s.onmessage({ data });
    assert.equal(messages.length, 0); s.onmessage({ data: { id: 9, params: { ...E.defaults('buck'), Iout: 0 } } });
    assert.equal(messages[0].id, 9); assert.equal(messages[0].ok, false); assert.equal(messages[0].code, 'INPUT');
});

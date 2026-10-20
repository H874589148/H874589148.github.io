/* 运行：node --test tools/bode-plot/tests/bode.test.js
   纯数值与轻量 DOM 桩回归；不替代真实浏览器布局/交互验收。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../bode-core.js');
const root = path.resolve(__dirname, '..');
function close(a, b, tolerance = 1e-9) { assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`); }
function sweep(k, p, z, start = 1, end = 1e8) { return core.sweep(core.prepare(k, p, z), { fStart: start, fEnd: end }); }
[
    ['10k', 'Hz', 1e4], ['10 kHz', 'Hz', 1e4], ['2.5MHz', 'Hz', 2.5e6], ['2.5e6', 'Hz', 2.5e6],
    ['1GHz', 'Hz', 1e9], ['1e9 Hz', 'Hz', 1e9], ['1MHz', 'Hz', 1e6], ['1mHz', 'Hz', 1e-3],
    ['10kΩ', 'Ω', 1e4], ['1MΩ', 'Ω', 1e6], ['10pF', 'F', 1e-11], ['2.2nF', 'F', 2.2e-9],
    ['1e-12 F', 'F', 1e-12], ['2µF', 'F', 2e-6], ['2μF', 'F', 2e-6], ['2uF', 'F', 2e-6],
    ['3 kohm', 'Ω', 3e3], ['1fF', 'F', 1e-15], ['1f', 'F', 1e-15], ['+1.2e-3MHz', 'Hz', 1200]
].forEach(([text, unit, value]) => test(`单位解析 ${text}`, () => close(core.parseQuantity(text, unit), value, Math.abs(value) * 1e-12)));
test('拒绝无效、错维度、非有限值和越界输入', () => {
    ['', 'abc', '10foo', '1e', '0x10', '1.2X', '1e999', '1e-999', '-1', '0', '1constructor', '10kΩ', '1e151'].forEach(v => {
        assert.throws(() => core.parseQuantity(v, 'Hz'), undefined, v);
    });
    assert.throws(() => core.parseQuantity('1kHz', 'Ω'));
    assert.throws(() => core.parseQuantity('10pf', 'F'));
});
test('频段校验拒绝倒置、相等和不可分辨的范围', () => {
    ['1', '0.1', '1.000000001'].forEach(v => assert.throws(() => core.frequencyRange('1', v)));
    assert.deepEqual(core.frequencyRange('1mHz', '1MHz'), { fStart: 1e-3, fEnd: 1e6 });
});
test('RC 换算与直接频率逐点相等', () => {
    const f = core.rcFrequency(core.parseQuantity('10kΩ', 'Ω'), core.parseQuantity('10pF', 'F'));
    close(f, 1591549.4309189534, 1e-7);
    const a = core.prepare(20, [f], []), b = core.prepare(20, [1 / (2 * Math.PI * 1e4 * 1e-11)], []);
    for (let i = -3; i <= 12; i += 0.05) {
        close(core.response(10 ** i, a).mag, core.response(10 ** i, b).mag);
        close(core.response(10 ** i, a).phase, core.response(10 ** i, b).phase);
    }
    assert.throws(() => core.rcFrequency(0, 1));
    assert.throws(() => core.rcFrequency(1e150, 1e150));
});
test('默认量程与超量程自动扩展', () => {
    assert.deepEqual(core.sliderDomain({ fStart: 1, fEnd: 1e8 }), { min: -3, max: 12 });
    assert.deepEqual(core.sliderDomain({ fStart: 1e-5, fEnd: 1e14 }), { min: -5, max: 14 });
    assert.deepEqual(core.sliderDomain({ fStart: 1, fEnd: 1e8 }, { min: -5, max: 14 }), { min: -5, max: 14 });
});
test('滑块交叉受到约束且保持正频率', () => {
    for (let x = -3; x <= 12; x += 0.1) {
        ['start', 'end'].forEach(side => {
            const r = core.slideRange({ fStart: 1, fEnd: 1e8 }, side, x);
            assert.ok(r.fStart > 0 && r.fEnd > r.fStart);
        });
    }
});
test('亚 Hz 与大频率显示保留有效数字', () => {
    assert.equal(core.format(1e-3, 'Hz'), '1 mHz');
    assert.equal(core.format(1e9, 'Hz'), '1 GHz');
    assert.notEqual(core.format(0.00012345, 'Hz'), '0 Hz');
});
test('单极点数值基准 fc / PM', () => {
    const r = sweep(20, [1e4], []);
    assert.equal(r.crossings.length, 1);
    close(r.primary.f, 1e4 * Math.sqrt(99), 1e-6);
    close(r.primary.pm, 95.73917047726678, 1e-8);
    assert.equal(r.gm, null);
});
test('零点与极点频率相同时完全抵消且无唯一交越', () => {
    const r = sweep(0, [1, 1e4, 1e4], [1e4, 1, 1e4]);
    assert.equal(r.unity, true); assert.equal(r.primary, null); assert.equal(r.crossings.length, 0);
    assert.ok(r.points.every(p => p.mag === 0 && p.phase === 0));
});
test('无交越/高于范围交越不推断裕度', () => {
    [-20, 0, 200].forEach(k => {
        const r = sweep(k, [1e4], [], 1, 1e3);
        assert.equal(r.primary, null); assert.equal(r.crossings.length, 0); assert.equal(r.gm, null);
    });
});
test('边界 0 dB 交越只计一次', () => {
    const r = sweep(10 * Math.log10(2), [1], [], 1, 1e4);
    assert.equal(r.crossings.length, 1); close(r.primary.f, 1, 1e-9);
});
test('双交越保留下降与上升，突出最低频下降交越', () => {
    const r = sweep(20, [1, 1e4], [100, 100], 1e-3, 1e7);
    assert.deepEqual(r.crossings.map(c => c.direction), ['down', 'up']);
    assert.equal(r.primary, r.crossings[0]);
    close(r.crossings[0].f * r.crossings[1].f, 1e4, 1e-5);
});
test('先上升后下降时主交越选第二个，单独上升不指定 UGB', () => {
    const r = sweep(-20, [100, 100], [1, 1e4], 1e-3, 1e7);
    assert.deepEqual(r.crossings.map(c => c.direction), ['up', 'down']);
    assert.equal(r.primary, r.crossings[1]);
    assert.equal(sweep(-20, [], [1], 1e-3, 1e3).primary, null);
});
test('窄双交越通过极值细分找到', () => {
    const base = core.prepare(0, [1, 2e4], [150, 150]);
    let a = 1, b = 3;
    for (let i = 0; i < 80; i++) {
        const x = (a + b) / 2;
        if (core.response(10 ** x, base).slope > 0) b = x; else a = x;
    }
    const min = core.response(10 ** ((a + b) / 2), base).mag;
    const r = sweep(-min - 1e-7, [1, 2e4], [150, 150], 1e-3, 1e8);
    assert.equal(r.crossings.length, 2);
    r.crossings.forEach(c => close(c.mag, 0, 1e-9));
});
test('0 dB 相切点显示但不指定为 UGB', () => {
    const model = core.prepare(0, [1, 1e4], [100, 100]);
    const gain = -core.response(100, model).mag;
    const r = sweep(gain, [1, 1e4], [100, 100], 1e-3, 1e7);
    assert.equal(r.crossings.length, 1); assert.equal(r.crossings[0].direction, 'touch');
    assert.equal(r.primary, null); close(r.crossings[0].f, 100, 1e-5);
});
test('三同频极点负 PM 与 GM 的解析基准', () => {
    const r = sweep(60, [100, 100, 100], [], 1e-3, 1e6);
    close(r.primary.f, 100 * Math.sqrt(99), 1e-6);
    close(r.primary.pm, 180 - 3 * Math.atan(Math.sqrt(99)) * 180 / Math.PI, 1e-8);
    assert.ok(r.primary.pm < 0);
    close(r.phaseCrossings[0].f, 100 * Math.sqrt(3), 1e-6);
    close(r.gm, 20 * Math.log10(8 / 1000), 1e-8);
});
test('高增益与高阶对数域响应无溢出', () => {
    const m = core.prepare(10000, Array(64).fill(1e-100), Array(63).fill(1e100));
    const h = core.response(1e150, m);
    assert.ok(Number.isFinite(h.mag) && Number.isFinite(h.phase));
    assert.throws(() => core.prepare(Infinity, [], []));
    assert.throws(() => core.prepare(20, [0], []));
});
[120, 160, 200, -200].forEach(k => test(`自动 dB 刻度 ${k}`, () => {
    const r = sweep(k, [1e4], []), values = r.points.map(p => p.mag);
    const a = core.axis(values, 260, false);
    assert.ok(a.min < Math.min(...values) && a.max > Math.max(...values));
    assert.ok(a.ticks.length >= 5 && a.ticks.length <= 9);
    assert.ok(a.ticks.some(t => k > 100 ? t > 100 : t < -100));
    assert.ok([1, 2, 5].includes(Number((a.step / 10 ** Math.floor(Math.log10(a.step))).toPrecision(5))));
}));
test('相位轴自动覆盖三极点及更高阶响应', () => {
    const a = core.axis([-269.99, 0], 260, true);
    assert.ok(a.min < -270 && a.max >= 100);
    const b = core.axis([-1080, 720], 260, true);
    assert.ok(b.min < -1080 && b.max > 720);
});

/* 最小 DOM/Canvas 桩：验证状态隔离、事件接线及绘图指令，不模拟 CSS 布局。 */
function fixture() {
    const labels = [], events = {}, frames = new Map(); let frameId = 0;
    const context2d = new Proxy({ measureText: t => ({ width: String(t).length * 6 }), fillText: t => labels.push(String(t)) }, {
        get(target, key) { return key in target ? target[key] : () => {}; }
    });
    class Element {
        constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.style = {}; this.dataset = {}; this.events = {}; this.value = ''; this.className = ''; this.textContent = ''; this.hidden = false; this.width = 700; this.height = 340; this.clientWidth = 700; this.clientHeight = 340; }
        get value() { return this._value; }
        set value(v) { this._value = String(v); }
        get classList() { const el = this; return { add(c) { el.className += ' ' + c; }, remove(c) { el.className = el.className.split(' ').filter(x => x !== c).join(' '); } }; }
        setAttribute(k, v) { this.attrs[k] = String(v); if (['id', 'value', 'class', 'min', 'max'].includes(k)) this[k === 'class' ? 'className' : k] = String(v); if (k === 'data-field') this.dataset.field = v; }
        getAttribute(k) { return this.attrs[k]; }
        appendChild(el) { el.parentElement = this; this.children.push(el); return el; }
        matches(s) { return s.startsWith('.') ? this.className.split(' ').includes(s.slice(1)) : s.startsWith('[data-field=') ? this.dataset.field === s.match(/"([^"]+)"/)[1] : this.tagName === s; }
        querySelectorAll(s) { return this.children.flatMap(el => (el.matches(s) ? [el] : []).concat(el.querySelectorAll(s))); }
        querySelector(s) { return this.querySelectorAll(s)[0] || null; }
        set innerHTML(html) {
            this.children = []; const stack = [this], voids = ['input', 'br', 'hr', 'meta', 'link'];
            for (const m of html.matchAll(/<(\/?)([\w-]+)([^>]*?)>/g)) {
                if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
                const el = new Element(m[2]);
                for (const attr of m[3].matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(attr[1], attr[2]);
                stack[stack.length - 1].appendChild(el);
                if (!voids.includes(m[2]) && !m[3].endsWith('/')) stack.push(el);
            }
        }
        addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
        dispatch(type, extra = {}) { (this.events[type] || []).forEach(fn => fn.call(this, { key: '', preventDefault() {}, ...extra })); }
        getContext() { return context2d; }
        getBoundingClientRect() { return { left: 0, top: 0 }; }
        focus() {}
    }
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const body = new Element('main'); body.innerHTML = html.slice(html.indexOf('<main'), html.indexOf('</main>') + 7);
    const document = { documentElement: {}, createElement: tag => new Element(tag),
        getElementById: id => body.querySelectorAll('*').find(el => el.id === id), querySelectorAll: s => body.querySelectorAll(s) };
    const matches = Element.prototype.matches;
    Element.prototype.matches = function (s) { return s === '*' || matches.call(this, s); };
    document.getElementById('dcUnit').value = 'dB';
    const sandbox = { document, console, BodeCore: core, getComputedStyle: () => ({ getPropertyValue: k => k.includes('card-bg') ? '#fff' : '#444' }),
        requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id),
        MutationObserver: class { constructor(fn) { events.theme = fn; } observe() {} } };
    sandbox.window = { devicePixelRatio: 1, addEventListener: (type, fn) => { events[type] = fn; } };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, 'bode-plot.js'), 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, 'script.js'), 'utf8'), sandbox);
    assert.ok(sandbox.lastPlot, document.getElementById('plotStatus').textContent + document.getElementById('gainError').textContent);
    function flush() { const jobs = [...frames.values()]; frames.clear(); jobs.forEach(fn => fn()); }
    function input(id, value) { const el = document.getElementById(id); assert.ok(el, id); el.value = value; el.dispatch('input'); flush(); }
    return { app: sandbox, get: id => document.getElementById(id), input, flush, labels, events };
}
test('页面脚本依赖顺序与静态输入接线', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(scripts.slice(-3), ['bode-core.js', 'bode-plot.js', 'script.js']);
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    assert.equal(ids.length, new Set(ids).size);
});
test('初始渲染、图上标记、摘要同源', () => {
    const f = fixture();
    assert.ok(f.app.lastPlot); assert.match(f.get('fcVal').textContent, /99.4987 kHz/);
    assert.equal(f.get('pmVal').textContent, '95.74°');
    assert.ok(f.labels.some(s => s.includes('fc/UGB #1')));
    assert.ok(f.labels.includes('PM 95.74°'));
});
test('非法范围/增益/零极点保留快照及读数，修复后恢复', () => {
    const f = fixture(), snapshot = f.app.lastPlot, h = f.app.calcH(1e4);
    f.input('freqEnd', 'abc'); f.input('dcGain', '160');
    assert.equal(f.app.lastPlot, snapshot); close(f.app.calcH(1e4).mag, h.mag);
    assert.match(f.get('plotStatus').textContent, /参数未生效/);
    f.input('freqEnd', '1e8'); assert.notEqual(f.app.lastPlot, snapshot);
    const good = f.app.lastPlot;
    f.input('dcGain', ''); assert.equal(f.app.lastPlot, good);
    f.input('dcGain', '20');
    const current = f.app.lastPlot;
    f.input('freq-p1', '1e'); assert.equal(f.app.lastPlot, current);
    f.input('freq-p1', '1MHz'); close(f.app.poles[0].freq, 1e6);
});
test('RC 双模式不虚构数值、保留参数、往返频率精确', () => {
    const f = fixture(), snapshot = f.app.lastPlot;
    let select = f.get('item-p1').querySelector('select'); select.value = 'rc'; select.dispatch('change');
    assert.equal(f.get('r-p1').value, ''); assert.equal(f.get('c-p1').value, ''); assert.equal(f.app.lastPlot, snapshot);
    f.input('r-p1', '10kΩ'); f.input('c-p1', '10pF');
    const freq = f.app.poles[0].freq; close(freq, 1591549.4309189534, 1e-7);
    select = f.get('item-p1').querySelector('select'); select.value = 'frequency'; select.dispatch('change');
    close(core.parseQuantity(f.get('freq-p1').value, 'Hz'), freq, 0);
    select = f.get('item-p1').querySelector('select'); select.value = 'rc'; select.dispatch('change');
    assert.equal(f.get('r-p1').value, '10kΩ'); assert.equal(f.get('c-p1').value, '10pF');
});
test('极点与零点各自独立保留 RC，添加列表项不丢失草稿', () => {
    const f = fixture(); f.app.addZero(1000);
    const select = f.get('item-z1').querySelector('select'); select.value = 'rc'; select.dispatch('change');
    f.input('r-z1', '1MΩ'); f.input('c-z1', '2.2nF');
    const zero = f.app.zeros[0].freq;
    f.input('freq-p1', '1MHz'); close(f.app.zeros[0].freq, zero, 0);
    f.input('freq-p1', '1X'); const snapshot = f.app.lastPlot; f.app.addPole();
    assert.equal(f.get('freq-p1').value, '1X'); assert.equal(f.get('r-z1').value, '1MΩ'); assert.equal(f.app.lastPlot, snapshot);
});
test('RC 空值是待输入，零极点均不标红且不能应用旧频率', () => {
    ['p1', 'z1'].forEach(id => {
        const f = fixture(); if (id === 'z1') f.app.addZero();
        const snapshot = f.app.lastPlot, pm = f.get('pmVal').textContent, h = f.app.calcH(1e4);
        const select = f.get('item-' + id).querySelector('select'); select.value = 'rc'; select.dispatch('change');
        assert.equal(f.get('error-' + id).textContent, '');
        ['r', 'c'].forEach(key => assert.equal(f.get(key + '-' + id).getAttribute('aria-invalid'), 'false'));
        assert.match(f.get('item-' + id).querySelector('.pz-result').textContent, /待输入.*R.*C/);
        assert.match(f.get('plotStatus').textContent, /参数未生效.*待输入/);
        assert.doesNotMatch(f.get('plotStatus').textContent, /标红/);
        f.input('dcGain', '40'); f.app.drawBode();
        assert.equal(f.app.lastPlot, snapshot); assert.equal(f.get('pmVal').textContent, pm);
        close(f.app.calcH(1e4).mag, h.mag);
    });
});
test('RC 逐项待输入，不遮蔽非空非法字段，补齐后生效', () => {
    ['r', 'c'].forEach(first => {
        const f = fixture(), snapshot = f.app.lastPlot, second = first === 'r' ? 'c' : 'r';
        const values = { r: '10kΩ', c: '10pF' };
        const select = f.get('item-p1').querySelector('select'); select.value = 'rc'; select.dispatch('change');
        f.input(first + '-p1', 'abc');
        assert.equal(f.get(first + '-p1').getAttribute('aria-invalid'), 'true');
        assert.equal(f.get(second + '-p1').getAttribute('aria-invalid'), 'false');
        assert.ok(f.get('error-p1').textContent); assert.equal(f.app.lastPlot, snapshot);
        f.input(first + '-p1', values[first]);
        assert.equal(f.get('error-p1').textContent, '');
        assert.equal(f.get(first + '-p1').getAttribute('aria-invalid'), 'false');
        assert.match(f.get('item-p1').querySelector('.pz-result').textContent, new RegExp('待输入.*' + second.toUpperCase()));
        assert.equal(f.app.lastPlot, snapshot);
        f.app.addPole(); assert.equal(f.get(first + '-p1').value, values[first]); assert.equal(f.app.lastPlot, snapshot);
        f.input(second + '-p1', values[second]);
        assert.notEqual(f.app.lastPlot, snapshot); close(f.app.poles[0].freq, 1591549.4309189534, 1e-7);
        assert.match(f.get('plotStatus').textContent, /^已生效/);
    });
});
test('清空已完成的 RC 回到待输入，保留最后有效快照', () => {
    const f = fixture();
    const select = f.get('item-p1').querySelector('select'); select.value = 'rc'; select.dispatch('change');
    f.input('r-p1', '10kΩ'); f.input('c-p1', '10pF'); const snapshot = f.app.lastPlot;
    f.input('r-p1', '  '); f.input('c-p1', '');
    assert.equal(f.get('error-p1').textContent, ''); assert.equal(f.app.lastPlot, snapshot);
    assert.match(f.get('item-p1').querySelector('.pz-result').textContent, /待输入.*R.*C/);
    ['r', 'c'].forEach(key => assert.equal(f.get(key + '-p1').getAttribute('aria-invalid'), 'false'));
    f.input('r-p1', '20kΩ'); f.input('c-p1', '10pF');
    close(f.app.poles[0].freq, 795774.7154594767, 1e-7); assert.notEqual(f.app.lastPlot, snapshot);
});
test('RC 待输入不覆盖其他字段的错误状态', () => {
    const f = fixture(), snapshot = f.app.lastPlot;
    const select = f.get('item-p1').querySelector('select'); select.value = 'rc'; select.dispatch('change');
    [['freqEnd', 'abc', '100MHz'], ['dcGain', '', '20']].forEach(([id, bad, good]) => {
        f.input(id, bad); assert.match(f.get('plotStatus').textContent, /修正标红/);
        assert.equal(f.get(id).getAttribute('aria-invalid'), 'true'); assert.equal(f.app.lastPlot, snapshot);
        f.input(id, good); assert.match(f.get('plotStatus').textContent, /待输入/);
        assert.doesNotMatch(f.get('plotStatus').textContent, /标红/); assert.equal(f.app.lastPlot, snapshot);
    });
});
test('RC 越界标红并保留旧图', () => {
    const f = fixture(), snapshot = f.app.lastPlot;
    const select = f.get('item-p1').querySelector('select'); select.value = 'rc'; select.dispatch('change');
    f.input('r-p1', '1e150'); f.input('c-p1', '1e150');
    assert.equal(f.get('r-p1').getAttribute('aria-invalid'), 'true');
    assert.equal(f.get('c-p1').getAttribute('aria-invalid'), 'true'); assert.equal(f.app.lastPlot, snapshot);
});
test('增益单位往返不丢小值，浮点溢出时不静默替换', () => {
    const f = fixture(); f.input('dcGain', '-120');
    f.get('dcUnit').value = 'vv'; f.get('dcUnit').dispatch('change'); close(Number(f.get('dcGain').value), 1e-6, 1e-15);
    f.get('dcUnit').value = 'dB'; f.get('dcUnit').dispatch('change'); close(Number(f.get('dcGain').value), -120);
    f.input('dcGain', '10000'); const snapshot = f.app.lastPlot;
    f.get('dcUnit').value = 'vv'; f.get('dcUnit').dispatch('change');
    assert.equal(f.get('dcUnit').value, 'dB'); assert.equal(f.app.lastPlot, snapshot);
});
['input', 'change', 'blur'].forEach(event => test(`增益 ${event} 同步校验不依赖绘图帧`, () => {
    const f = fixture(), gain = f.get('dcGain'), snapshot = f.app.lastPlot, pm = f.get('pmVal').textContent;
    // 不 flush，模拟绘图帧尚未执行；change/blur 也覆盖没有 input 的提交路径。
    gain.value = ''; gain.dispatch(event);
    assert.match(f.get('gainError').textContent, /请输入有限的直流增益/);
    assert.equal(gain.getAttribute('aria-invalid'), 'true'); assert.equal(f.get('dcConv').textContent, '');
    assert.match(f.get('plotStatus').textContent, /参数未生效/);
    assert.equal(f.app.lastPlot, snapshot); assert.equal(f.get('pmVal').textContent, pm);
    const frame = f.app.drawFrame; assert.ok(frame);
    gain.value = '40'; gain.dispatch(event);
    assert.equal(f.get('gainError').textContent, ''); assert.equal(gain.getAttribute('aria-invalid'), 'false');
    assert.equal(f.get('dcConv').textContent, '40 dB = 100 V/V');
    assert.equal(f.app.lastPlot, snapshot); assert.equal(f.app.drawFrame, frame);
    f.flush(); assert.notEqual(f.app.lastPlot, snapshot); assert.equal(f.app.lastPlot.model.gainDb, 40);
    gain.value = ''; gain.dispatch(event); const good = f.app.lastPlot;
    f.flush(); assert.equal(f.app.lastPlot, good); assert.equal(f.get('dcConv').textContent, '');
}));
test('非法增益同步清除换算文本，dB 零值仍有效', () => {
    const f = fixture(), gain = f.get('dcGain');
    [['dB', [' ', 'Infinity', '1000001', '1e']], ['vv', ['0', '-1', '1e999']]].forEach(([unit, values]) => {
        f.get('dcUnit').value = unit;
        values.forEach(value => {
            gain.value = value; gain.dispatch('input');
            assert.ok(f.get('gainError').textContent, value); assert.equal(gain.getAttribute('aria-invalid'), 'true');
            assert.equal(f.get('dcConv').textContent, '');
        });
    });
    f.get('dcUnit').value = 'dB'; gain.value = '0'; gain.dispatch('input');
    assert.equal(f.get('gainError').textContent, ''); assert.equal(f.get('dcConv').textContent, '0 dB = 1 V/V');
    f.flush(); assert.equal(f.app.lastPlot.model.gainDb, 0);
});
test('显式绘图同步更新增益错误与换算提示', () => {
    const f = fixture(), gain = f.get('dcGain'), snapshot = f.app.lastPlot;
    gain.value = ''; f.app.drawBode();
    assert.equal(f.app.lastPlot, snapshot); assert.equal(f.get('dcConv').textContent, '');
    assert.equal(gain.getAttribute('aria-invalid'), 'true');
    gain.value = '40'; f.app.drawBode();
    assert.equal(f.get('gainError').textContent, ''); assert.equal(gain.getAttribute('aria-invalid'), 'false');
    assert.equal(f.get('dcConv').textContent, '40 dB = 100 V/V'); assert.notEqual(f.app.lastPlot, snapshot);
});
test('频率滑块接线、范围扩展、键盘操作和合并更新', () => {
    const f = fixture(); f.input('freqEnd', '1e14');
    assert.equal(Number(f.get('freqEndSlider').max), 14);
    f.input('freqStartSlider', '-3'); close(f.app.lastRange.fStart, 1e-3);
    f.get('freqStartSlider').dispatch('keydown', { key: 'ArrowRight' }); f.flush();
    assert.ok(f.app.lastRange.fStart > 1e-3);
    f.input('freqEndSlider', '-3'); assert.ok(f.app.lastRange.fEnd > f.app.lastRange.fStart);
});
test('预设切换清空旧列表、标记近似并保留拓扑卡', () => {
    const f = fixture();
    f.app.loadPreset('typeIII'); assert.equal(f.get('zeroList').children.length, 2); assert.equal(f.get('modelNotice').hidden, false);
    assert.equal(f.get('presetInfo').style.display, '');
    f.app.loadPreset('singlePole'); assert.equal(f.get('zeroList').children.length, 0); assert.equal(f.get('poleList').children.length, 1); assert.equal(f.get('modelNotice').hidden, true);
    f.app.removePZ('pole', 'p1'); f.input('dcGain', '0'); assert.equal(f.get('fcVal').textContent, '无唯一交越');
});
test('TF 导入保留基本功能，原点/复根/RHP/负增益均标记近似', () => {
    const f = fixture();
    ['1/s', '1/(s^2+2*s+10)', '(s-1)/(s+10)', '-10/(s+1)'].forEach(expr => {
        f.get('tfExpr').value = expr; f.app.applyTF();
        assert.ok(f.app.lastPlot.approximation, expr); assert.equal(f.get('modelNotice').hidden, false);
    });
    f.get('tfExpr').value = '10/(s+1)'; f.app.applyTF(); assert.equal(f.app.lastPlot.approximation, '');
    const plot = f.app.lastPlot;
    f.get('tfExpr').value = 'e^(-s)'; f.app.applyTF(); assert.equal(f.app.lastPlot, plot); assert.match(f.get('tfMsg').textContent, /不支持/);
});
test('无交越提示不输出无依据的稳定结论或无限裕度', () => {
    const f = fixture(); f.input('freqEnd', '1kHz');
    assert.match(f.get('marginMessage').textContent, /未找到 0 dB 交越/);
    assert.doesNotMatch(f.get('pmVal').textContent + f.get('gmVal').textContent, /稳定|∞/);
});
test('主题与 resize 重绘不使用无效草稿，取点坐标跟随新尺寸', () => {
    const f = fixture(); f.input('freqEnd', 'abc'); const snapshot = f.app.lastPlot;
    f.get('magCanvas').clientWidth = 320; f.events.resize(); f.events.theme(); f.flush();
    assert.equal(f.app.lastPlot, snapshot); assert.equal(f.get('magCanvas')._bodeGeometry.width, 320);
    assert.ok(f.get('magCanvas')._bodeGeometry.pad.left >= 42);
});

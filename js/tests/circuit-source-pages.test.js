/* 源页面真实事件/消息/Worker 适配测试；DOM 桩不验证浏览器排版和新标签页行为。 */
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const { environment, Element, code, plain, settle, base } = require('./handoff-harness');
test('六个页面及共享脚本语法、HTML 本地依赖完整', () => {
    const fs = require('node:fs'), path = require('node:path');
    const modules = ['circuit-sketch', 'dpi-calc', 'filter-design', 'power-electronics', 'truth-table', 'transfer-function'];
    const scripts = new Set(['js/circuit-handoff.js', 'razavi/figure-utils.js']);
    for (const name of modules) {
        const file = 'tools/' + name + '/index.html', html = code(file);
        // 运行时资源依赖；文献下载等普通超链接不属于本次迁移范围。
        for (const m of html.matchAll(/<(?:script|link|img|iframe)\b[^>]*(?:src|href)="([^"#?]+)"/g)) if (!m[1].includes(':')) assert.ok(fs.existsSync(path.resolve(base, path.dirname(file), m[1])), file + ': ' + m[1]);
        for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
            const src = m[1].match(/src="([^"]+)"/);
            if (src && !src[1].includes(':')) scripts.add(path.relative(base, path.resolve(base, path.dirname(file), src[1])));
            else if (m[2].trim()) assert.doesNotThrow(() => new vm.Script(m[2], { filename: file }));
        }
    }
    for (const file of scripts) assert.doesNotThrow(() => new vm.Script(code(file), { filename: file }));
});
function ui(h, file) {
    function parse(html) {
        const nodes = [];
        for (const m of html.matchAll(/<([\w-]+)\b([^>]*)>/g)) {
            const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
            if (!attrs.id && !['input', 'select'].includes(m[1])) continue;
            const el = attrs.id ? h.get(attrs.id) : new Element(m[1]); el.tagName = m[1].toUpperCase();
            for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
            if ('value' in attrs) el.value = attrs.value;
            if (m[1] === 'input') el.checked = /\bchecked\b/.test(m[2]);
            if (m[1] === 'select') {
                const opts = [...html.slice(m.index + m[0].length).split('</select>')[0].matchAll(/<option([^>]*)>([^<]*)<\/option>/g)];
                const opt = opts.find(o => /selected/.test(o[1])) || opts[0];
                if (opt) el.value = opt[1].match(/value="([^"]+)"/)?.[1] || opt[2];
            }
            nodes.push(el);
        }
        return nodes;
    }
    const nodes = parse(code(file));
    for (const el of nodes) {
        let html = '';
        Object.defineProperty(el, 'innerHTML', { configurable: true, get: () => html, set: text => {
            html = text; const inputs = parse(text).filter(n => ['INPUT', 'SELECT'].includes(n.tagName));
            el.querySelectorAll = selector => selector === 'input' ? inputs.filter(n => n.tagName === 'INPUT') : selector === 'input, select' ? inputs : [];
        } });
    }
    const ctx = new Proxy({}, { get: (o, key) => o[key] || ((...args) => {
        args.forEach(a => { if (typeof a === 'number') assert.ok(Number.isFinite(a), '绘图不得传入非有限数值'); });
    }) });
    for (const el of nodes.filter(n => n.tagName === 'CANVAS')) el.getContext = () => ctx;
    h.s.MutationObserver = class { observe() {} };
    h.s.formatEngineering = v => String(v);
    h.s.document.querySelector = selector => h.get(selector.startsWith('#') ? selector.slice(1) : selector);
    return h;
}
function bars(h) { return h.s.document.body.children.filter(c => c.className === 'circuit-handoff-bar'); }
async function open(h, bar) {
    const a = bar.children[1]; a.click(); const token = a.href.split('#handoff=')[1]; await settle();
    return h.s.CircuitHandoff.read(token);
}
function filter() {
    const h = ui(environment(), 'tools/filter-design/index.html');
    h.run('tools/filter-design/topologies.js'); h.run('tools/filter-design/script.js'); h.run('tools/filter-design/rev-calc.js'); return h;
}
test('滤波器两页七架构预览与传输相同，输入变更不串状态，非法值不带旧设计', async () => {
    const h = filter(), s = h.s;
    assert.equal(bars(h).length, 2);
    for (const arch of Object.keys(s.ARCHS)) {
        h.get('arch').value = arch; h.get('arch').fire('change');
        const forward = await open(h, bars(h)[0]); assert.equal(forward.status, 'ready');
        assert.deepEqual(plain(forward.doc), plain(s.filterPapers.topoFig.doc));
        assert.equal(h.get('topoFig').innerHTML, s.CircuitFigure.render(forward.doc));
        h.get('rArch').value = arch; h.get('rArch').fire('change');
        assert.equal((await open(h, bars(h)[1])).status, 'ready');
        const reverse = JSON.stringify(s.filterPapers.rTopoFig);
        const input = h.get('compFields').querySelectorAll('input')[0]; input.value = '22k';
        h.get('compFields').fire('input', { target: input });
        assert.equal(JSON.stringify(s.filterPapers.rTopoFig), reverse);
        assert.notDeepEqual((await open(h, bars(h)[0])).doc, forward.doc);
        input.value = '1e999'; h.get('compFields').fire('input', { target: input });
        assert.equal(s.filterPapers.topoFig, null); assert.equal(bars(h)[0].children[1].getAttribute('aria-disabled'), 'true');
        const r = h.get('rCompFields').querySelectorAll('input')[0]; r.value = '2junk'; h.get('rCompFields').fire('input', { target: r });
        assert.equal(s.filterPapers.rTopoFig, null); assert.ok(!h.get('rTopoFig').innerHTML.includes('NaN'));
    }
});
test('DPI 五个入口同步当前输入与模式，相关参数失效只禁用受影响图纸', async () => {
    const h = ui(environment(), 'tools/dpi-calc/index.html'); h.run('tools/dpi-calc/topologies.js'); h.run('tools/dpi-calc/script.js');
    const bb = bars(h); assert.equal(bb.length, 5);
    const records = await Promise.all(bb.map(b => open(h, b)));
    records.forEach(r => assert.equal(r.status, 'ready'));
    const byKind = kind => bb[Object.keys(h.s.DPIFigures.titles).indexOf(kind)];
    h.get('dpi-cb').value = '12'; h.get('dpi-cb').fire('input');
    const block = await open(h, byKind('block')); assert.ok(Math.abs(block.context.inputs.cb / 12e-9 - 1) < 1e-14);
    assert.equal(h.get('blockFigure').innerHTML, h.s.CircuitFigure.render(block.doc, { itemIds: true }));
    h.get('unit-cb').value = '0.000001'; h.get('unit-cb').fire('change');
    assert.equal(h.get('dpi-cb').value, '0.012'); assert.equal((await open(h, byKind('block'))).context.inputs.cb, 12e-9);
    h.get('blockModel').value = 'parasitic'; h.get('blockModel').fire('change');
    assert.ok((await open(h, byKind('block'))).doc.items.some(i => i.id.includes('ESR')));
    h.get('useBan').checked = false; h.get('useBan').fire('change');
    assert.equal(h.get('dpi-lb').disabled, false);
    const bench = await open(h, byKind('bench')); assert.ok(bench.doc.items.some(i => i.id.includes('supply-Lban')));
    h.get('dpi-cb').value = ''; h.get('dpi-cb').fire('input');
    for (const kind of ['block', 'injection', 'bench']) assert.equal(byKind(kind).children[1].getAttribute('aria-disabled'), 'true');
    for (const kind of ['monitor', 'ban']) assert.equal((await open(h, byKind(kind))).status, 'ready');
    h.get('resetBench').click(); assert.equal((await open(h, byKind('block'))).context.inputs.cb, 6.8e-9);
    h.get('monitorFigurePreset').click(); assert.equal((await open(h, byKind('monitor'))).context.inputs.rm, 150000);
});
test('滤波器极端有限输入不会卡住绘图，失效频段不得继续传递图纸', () => {
    for (const direction of ['forward', 'reverse']) {
        const h = filter();
        if (direction === 'forward') h.get('fc').value = '1e307';
        else h.get('rCompFields').querySelectorAll('input').forEach(el => { el.value = '1e-200'; });
        vm.runInContext(direction === 'forward' ? 'fullUpdate()' : 'revUpdate()', h.s, { timeout: 1000 });
        assert.equal(direction === 'forward' ? h.s.filterPapers.topoFig : h.s.filterPapers.rTopoFig, null);
    }
});
function bridge(mode) {
    const h = environment(), s = h.s, requests = [], blobs = [], downloads = [], workers = [];
    s.Theme = { get: () => 'light', set() {} }; s.MutationObserver = class { observe() {} };
    s.document.querySelector = selector => h.get(selector.replace(/^#/, ''));
    const frame = h.get('ckFrame'), wrapper = new Element(); s.document.body.appendChild(wrapper); wrapper.appendChild(frame);
    frame.contentWindow = { postMessage: (d, origin) => { assert.equal(origin, s.location.origin); requests.push(plain(d)); } };
    s.URL = { createObjectURL: blob => { blobs.push(blob); return 'blob:' + (blobs.length - 1); }, revokeObjectURL() {} };
    const create = s.document.createElement;
    s.document.createElement = tag => { const el = create(tag); if (tag === 'a') el.click = () => downloads.push(blobs[Number(el.href.split(':')[1])]); return el; };
    s.Worker = class {
        constructor(url) { this.url = url; workers.push(this); }
        terminate() { this.terminated = true; }
        postMessage(data) {
            this.payload = data;
            if (!this.url.startsWith('blob:')) return;
            blobs[Number(this.url.split(':')[1])].text().then(source => {
                const scope = { Blob, performance, self: { postMessage: d => this.onmessage({ data: d }) } };
                vm.createContext(scope); vm.runInContext(source, scope); scope.self.onmessage({ data });
            });
        }
    };
    function emit(data, origin = s.location.origin, source = frame.contentWindow) { h.events.fire('message', { data, origin, source }); }
    function reply(req, doc, extra = {}) { emit({ type: mode + (req.type.endsWith('get-doc') ? '-doc' : '-ack'), requestId: req.requestId, revision: 1, inputKind: 'voltage', doc, ...extra }); }
    h.run('js/circuit-connectivity.js');
    if (mode === 'tt') {
        h.run('tools/truth-table/engine.js'); h.run('tools/truth-table/canvas-netlist.js');
        h.get('src').value = s.TTEngine.TEXT_EXAMPLES.majority;
        const tabs = ['text', 'canvas'].map(key => { const el = h.get('tab-' + key); el.dataset.tab = key; return el; });
        s.document.querySelectorAll = selector => selector === '[role="tab"]' ? tabs : [];
        h.run('tools/truth-table/script.js');
    } else {
        h.run('tools/transfer-function/canvas-netlist.js'); h.run('tools/transfer-function/examples.js');
        h.get('parameters').querySelector = () => h.get('parameterBody');
        h.run('tools/transfer-function/script.js');
    }
    return { ...h, requests, frame, emit, reply, blobs, downloads, workers, bar: bars(h)[0] };
}
const labelDoc = text => ({ items: [{ kind: 'label', id: 'label', x: 12.5, y: 23.5, text }], groups: [] });
test('真值表取图并发按 requestId 配对，忽略异源/错类型，保留空图与当前标注', async () => {
    const h = bridge('tt'), a = h.bar.children[1]; await settle();
    a.fire('click'); const one = a.href.split('=')[1]; const req1 = h.requests.at(-1);
    a.fire('click'); const two = a.href.split('=')[1]; const req2 = h.requests.at(-1);
    h.reply(req2, labelDoc('第二次')); h.reply(req1, labelDoc('恶意'), { requestId: 'other' });
    h.emit({ type: 'tt-doc', requestId: req1.requestId, doc: labelDoc('异源') }, 'https://bad.test'); await settle();
    assert.equal(h.s.CircuitHandoff.read(one).status, 'pending');
    h.reply(req1, { items: [], groups: [] }); await settle();
    assert.equal(h.s.CircuitHandoff.read(one).doc.items.length, 0);
    assert.equal(h.s.CircuitHandoff.read(two).doc.items[0].text, '第二次');
});
test('真值表草稿、iframe 重载、超时和 postMessage 抛错均明确失败并可重试', async () => {
    for (const failure of ['draft', 'reload', 'timeout', 'throw']) {
        const h = bridge('tt'); await settle(); const a = h.bar.children[1];
        if (failure === 'throw') h.frame.contentWindow.postMessage = () => { throw Error('不可发送'); };
        a.fire('click'); const token = a.href.split('=')[1], req = h.requests.at(-1);
        if (failure === 'draft') h.reply(req, labelDoc('未提交'), { editing: true });
        if (failure === 'reload') h.frame.fire('load');
        if (failure === 'timeout') h.tick(5000);
        await settle(); const r = h.s.CircuitHandoff.read(token); assert.equal(r.status, 'error');
        assert.match(r.error, /草稿|重新加载|超时|不可发送/);
        if (failure === 'reload') { h.reply(req, labelDoc('迟到')); await settle(); assert.equal(h.s.CircuitHandoff.read(token).status, 'error'); }
    }
});
test('真值表实际 Blob Worker 生成、画布示例、CSV 及修改后拒绝旧导出', async () => {
    const h = bridge('tt'); await settle(); assert.equal(h.get('statRows').textContent, '8');
    h.get('tab-canvas').click(); h.get('loadExample').click(); const load = h.requests.at(-1), doc = load.doc; h.reply(load);
    h.get('genCanvas').click(); h.reply(h.requests.at(-1), doc); await settle();
    assert.equal(h.get('statRows').textContent, '8'); assert.match(h.get('status').textContent, /已生成/);
    h.get('exportCsv').click(); const csvReq = h.requests.at(-1);
    h.bar.children[1].fire('click'); const copyReq = h.requests.at(-1), token = h.bar.children[1].href.split('=')[1];
    h.reply(copyReq, labelDoc('不要求完成计算')); h.reply(csvReq, doc); await settle();
    assert.equal(h.downloads.length, 1); const csv = await h.downloads[0].text(); assert.match(csv, /"a","b","s","y"/);
    const rows = csv.trim().split(/\r?\n/).slice(1).map(r => r.split(',').map(Number));
    assert.equal(rows.length, 8); rows.forEach(([a, b, s, y]) => assert.equal(y, s ? a : b));
    assert.equal(h.s.CircuitHandoff.read(token).doc.items[0].text, '不要求完成计算');
    h.get('exportCsv').click(); h.reply(h.requests.at(-1), labelDoc('修改后')); await settle();
    assert.equal(h.downloads.length, 1); assert.match(h.get('status').textContent, /画布已修改/);
});
async function readyTF(h) {
    h.emit({ type: 'tf-ready', revision: 0 });
    h.reply(h.requests.find(r => r.type === 'tf-set-theme'));
    const req = h.requests.find(r => r.type === 'tf-load-doc'); h.reply(req); await settle();
    h.reply(h.requests.at(-1), req.doc); await settle(); return req.doc;
}
test('TF 当前画布、输入类型和 gm 极性完整传递，元数据不污染宿主工程', async () => {
    const h = bridge('tf'), doc = await readyTF(h), a = h.bar.children[1];
    doc.items[0].x += 30; doc.items.find(i => i.analysis).analysis.value = '3.5';
    const gm = doc.items.find(i => i.type === 'transconductance-4t'); gm.fh = true; gm.fv = true;
    a.fire('click'); const token = a.href.split('=')[1]; h.reply(h.requests.at(-1), doc, { revision: 2, inputKind: 'current' }); await settle();
    const copied = h.s.CircuitHandoff.read(token).doc;
    assert.deepEqual(plain(copied), { ...doc, inputKind: 'current', analysisContext: { version: 1, kind: 'tf' } });
    const stored = JSON.parse(h.s.localStorage.getItem('ee-transfer-function-v1'));
    assert.equal(stored.doc.analysisContext, undefined); assert.equal(stored.inputKind, 'current');
    assert.equal(h.workers.length, 0); assert.equal(h.s.localStorage.getItem('ee-circuit-sketch-v2'), null);
    a.fire('click'); const empty = a.href.split('=')[1]; h.reply(h.requests.at(-1), { items: [], groups: [] }, { revision: 3 }); await settle();
    assert.equal(h.s.CircuitHandoff.read(empty).doc.items.length, 0);
});
test('TF 草稿、未就绪、载入事务与取图超时均不冒充成功', async () => {
    for (const failure of ['unready', 'transaction', 'draft', 'timeout']) {
        const h = bridge('tf');
        if (failure === 'transaction') h.emit({ type: 'tf-ready', revision: 0 });
        else if (failure !== 'unready') await readyTF(h);
        h.bar.children[1].fire('click'); const token = h.bar.children[1].href.split('=')[1];
        if (failure === 'draft') h.reply(h.requests.at(-1), labelDoc('草稿'), { editing: true });
        if (failure === 'timeout') h.tick(5000);
        await settle(); assert.equal(h.s.CircuitHandoff.read(token).status, 'error');
    }
});
test('TF 宿主 Worker 启停、迟到响应、当前工程导出和频率设置回归', async () => {
    const h = bridge('tf'), doc = await readyTF(h);
    h.get('generate').click(); h.reply(h.requests.at(-1), doc); await settle();
    assert.equal(h.workers.length, 1); const w = h.workers[0]; assert.equal(w.payload.type, 'compute');
    h.get('cancel').click(); assert.equal(w.terminated, true);
    w.onmessage({ data: { type: 'done', jobId: w.payload.jobId, revision: 1 } }); assert.match(h.get('status').textContent, /取消/);
    h.get('frequencyMin').value = '10'; h.get('frequencyMin').fire('input');
    h.get('exportProject').click(); await settle(); h.reply(h.requests.at(-1), doc); await settle();
    const project = JSON.parse(await h.downloads[0].text()); assert.equal(project.frequency.min, 10); assert.deepEqual(project.doc, doc);
    h.get('generate').click(); h.reply(h.requests.at(-1), doc); await settle(); const failed = h.workers.at(-1);
    failed.onerror({ preventDefault() {}, message: '加载失败' }); assert.equal(failed.terminated, true); assert.match(h.get('status').textContent, /后台任务异常/);
});

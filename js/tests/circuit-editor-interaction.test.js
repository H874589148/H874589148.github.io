/* 执行真实产品事件处理与渲染；DOM 桩不证明真实排版、鼠标命中或输入法体验。 */
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { editor, environment, Element, Storage, code, plain, settle } = require('./handoff-harness');
const empty = () => ({ items: [], groups: [] });
const comp = (type, id, x = 300, y = 200) => ({ kind: 'comp', type, id, x, y, rot: 0, text: 'R1', sw: 1.5, stroke: '#1a1a1a' });
const mainKey = 'ee-circuit-sketch-v2', uiKey = 'ee-circuit-sketch-ui-v1';
async function blank(options = {}) { const h = editor({ doc: empty(), ...options }); await settle(); return h; }
function key(h, key, extra = {}) { return h.events.fire('keydown', { key, target: h.s.svg, ...extra }); }
function point(h, x, y, type = 'mousedown', extra = {}) {
    const p = h.s.canvasToScreen(x, y), e = { clientX: p.x, clientY: p.y, button: 0, detail: 1, target: h.s.svg, ...extra };
    return (type === 'mousemove' ? h.events : h.s.svg).fire(type, e);
}
function click(h, x, y, detail = 1) { point(h, x, y, 'mousedown', { detail }); h.events.fire('mouseup', { button: 0 }); }
function double(h, x, y) { click(h, x, y); click(h, x, y, 2); return point(h, x, y, 'dblclick', { detail: 2 }); }
function lines(h) { return h.s.doc.items.filter(i => i.kind === 'wire'); }
function orthogonal(w) { for (let i = 1; i < w.pts.length; i++) { const a = w.pts[i - 1], b = w.pts[i]; assert.ok(a.x === b.x || a.y === b.y); assert.notDeepEqual(plain(a), plain(b)); } }
function menu(h, name) { h.s.menubar.fire('click', { target: h.actions[name], detail: 1 }); }

test('W 待起点、重复 W、多个固定点为同一个对象，尾段不进保存或导出', async () => {
    const h = await blank(), s = h.s;
    key(h, 'w'); assert.equal(s.tool, 'wire'); assert.equal(s.wireStart, null); assert.equal(lines(h).length, 0);
    click(h, 103, 104); assert.deepEqual(plain(s.wireStart), { x: 100, y: 100, wireId: null }); assert.equal(s.undoStack.length, 0);
    point(h, 180, 140, 'mousemove'); assert.match(s.layerOverlay.innerHTML, /stroke="#c0583a"/); assert.equal(lines(h).length, 0);
    click(h, 180, 140); const id = lines(h)[0].id;
    key(h, 'w', { repeat: true }); assert.equal(s.wireStart.wireId, id);
    click(h, 220, 190); click(h, 280, 210); orthogonal(lines(h)[0]);
    assert.equal(lines(h).length, 1); assert.equal(lines(h)[0].id, id); assert.equal(s.undoStack.length, 1);
    const fixed = plain(lines(h)[0]); point(h, 410, 340, 'mousemove');
    assert.deepEqual(plain(lines(h)[0]), fixed); assert.doesNotMatch(s.exportSvgStr(false).str, /#c0583a|410,340/);
    const saved = JSON.parse(s.sessionStorage.getItem(s.CircuitHandoff.SESSION + h.token));
    assert.doesNotMatch(JSON.stringify(saved), /wireStart|"cur"|410/);
    key(h, 'Escape'); assert.equal(s.tool, 'select'); assert.equal(s.wireStart, null); assert.deepEqual(plain(lines(h)[0]), fixed);
    key(h, 'z', { ctrlKey: true }); assert.equal(lines(h).length, 0);
    key(h, 'y', { ctrlKey: true }); assert.deepEqual(plain(lines(h)[0]), fixed);
});

test('仅有起点的撤销不误撤前一操作；同点和双击零长度不创建导线', async () => {
    const h = await blank(), s = h.s;
    s.addComp('ground', 500, 500); const before = plain(s.doc), history = s.undoStack.length;
    key(h, 'w'); click(h, 100, 100); click(h, 100, 100); key(h, 'z', { ctrlKey: true });
    assert.deepEqual(plain(s.doc), before); assert.equal(s.undoStack.length, history); assert.equal(s.wireStart, null);
    double(h, 100, 100); assert.equal(s.wireStart, null); assert.equal(lines(h).length, 0);
});

test('双击空白固定末段并待命，端口双击后不残留幽灵起点', async () => {
    const h = await blank(), s = h.s;
    key(h, 'w'); click(h, 100, 100); click(h, 160, 140); double(h, 220, 200);
    assert.equal(lines(h).length, 1); assert.equal(s.wireStart, null); assert.equal(s.tool, 'wire');
    assert.deepEqual(plain(lines(h)[0].pts.at(-1)), { x: 220, y: 200 }); orthogonal(lines(h)[0]);
    s.addComp('ground-triangle', 400, 400); const port = s.Razavi.portsWorld(s.doc.items.at(-1))[0];
    key(h, 'w'); click(h, 300, 300); double(h, port.x, port.y);
    assert.equal(s.wireStart, null); assert.equal(lines(h).length, 2);
    assert.deepEqual(plain(lines(h)[1].pts.at(-1)), { x: port.x, y: port.y });
});

test('小数端口在缩放、旋转和镜像后精确连接，导线中段不会终止', async () => {
    for (const scale of [0.5, 2.5]) for (const rot of [0, 1, 2, 3]) {
        const item = { ...comp('ground-triangle', 'g', 410.25, 330.75), rot, fh: true, fv: true };
        const h = await blank({ doc: { items: [item, { kind: 'wire', id: 'old', pts: [{ x: 80, y: 200 }, { x: 260, y: 200 }] }], groups: [] } }), s = h.s;
        s.viewTransform = { x: 50, y: -20, scale }; key(h, 'w'); click(h, 100, 100); click(h, 150, 200);
        assert.ok(s.wireStart); const port = s.Razavi.portsWorld(s.doc.items[0])[0]; click(h, port.x, port.y);
        assert.equal(s.wireStart, null); assert.deepEqual(plain(lines(h)[1].pts.at(-1)), { x: port.x, y: port.y }); orthogonal(lines(h)[1]);
    }
});

test('同向冗余点合并但保留回折，斜线切换只改变后续路径', async () => {
    const h = await blank(), s = h.s; key(h, 'w'); click(h, 100, 100); click(h, 200, 100); click(h, 300, 100); click(h, 200, 100);
    assert.deepEqual(plain(lines(h)[0].pts), [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 100 }]);
    const fixed = plain(lines(h)[0].pts); s.menuActions['wire-mode'](); click(h, 250, 150);
    assert.deepEqual(plain(lines(h)[0].pts.slice(0, -1)), fixed);
    s.setTool('select'); assert.equal(s.wireStart, null); s.undo(); assert.equal(lines(h).length, 0);
});

test('鼠标离开、窗口失焦、面板和中键平移不增加固定点', async () => {
    const h = await blank(), s = h.s; key(h, 'w'); click(h, 100, 100); click(h, 200, 100); const before = plain(s.doc);
    for (const event of ['mouseleave', 'blur', 'pointercancel']) {
        point(h, 250, 250, 'mousemove'); (event === 'mouseleave' ? s.svg : h.events).fire(event);
        assert.equal(s.wireStart.cur, undefined); assert.deepEqual(plain(s.doc), before);
    }
    s.document.elementFromPoint = () => s.templatesPanel; point(h, 500, 300, 'mousemove');
    assert.equal(s.wireStart.cur, undefined); menu(h, 'props'); assert.deepEqual(plain(s.doc), before);
    point(h, 100, 100, 'mousedown', { button: 1 }); h.events.fire('mousemove', { clientX: 300, clientY: 300, buttons: 4 }); h.events.fire('mouseup', { button: 1 });
    assert.deepEqual(plain(s.doc), before); assert.ok(s.wireStart);
});

test('保存刷新只恢复固定段；导入、新建、模板插入和宿主载入清理连线引用', async () => {
    const h = await blank(), s = h.s; key(h, 'w'); click(h, 100, 100); click(h, 200, 150); point(h, 280, 240, 'mousemove');
    const fixed = plain(s.doc), storage = { localStorage: s.localStorage, sessionStorage: s.sessionStorage };
    const fresh = await blank({ token: h.token, storage }); assert.deepEqual(plain(fresh.s.doc), fixed); assert.equal(fresh.s.wireStart, null);
    h.import(empty()); assert.equal(s.wireStart, null); s.undo(); assert.deepEqual(plain(s.doc), fixed);
    key(h, 'w'); click(h, 100, 100); s.newDoc(); assert.equal(s.wireStart, null);
    key(h, 'w'); click(h, 100, 100); s.insertFigure('ota5'); assert.equal(s.wireStart, null);
    for (const mode of ['tt', 'tf']) {
        const embedded = editor({ copy: false, search: '?embed=' + mode }); key(embedded, 'w'); click(embedded, 100, 100);
        embedded.events.fire('message', { source: embedded.s.parent, origin: embedded.s.location.origin, data: { type: mode + '-load-doc', doc: empty(), requestId: 'load' } });
        assert.equal(embedded.s.wireStart, null);
    }
});

test('其他文档命令结束连线并独立撤销，不跨命令追加到旧线', async () => {
    const h = await blank(), s = h.s; key(h, 'w'); click(h, 100, 100); click(h, 200, 150);
    const wire = plain(lines(h)[0]); s.addComp('resistor', 400, 400);
    assert.equal(s.wireStart, null); s.undo(); assert.deepEqual(plain(s.doc.items), [wire]); s.undo(); assert.equal(s.doc.items.length, 0);
    s.redo(); assert.deepEqual(plain(s.doc.items), [wire]); s.redo(); assert.equal(s.doc.items.length, 2);
});

test('倒三角地 JSON/catalog/bundle 一致，旧地端口不变且三入口使用同一目录', async () => {
    const h = await blank(), s = h.s, R = s.Razavi;
    const asset = JSON.parse(code('razavi/ground-triangle.symbol.json'));
    assert.deepEqual(plain(s.RAZAVI_SYMBOLS['ground-triangle']), asset);
    const meta = JSON.parse(code('razavi/catalog.json')).entries.find(e => e.symbolId === asset.id);
    assert.equal(meta.category, 'power'); assert.equal(meta.palette, true); assert.equal(R.meta(asset.id).nameZh, '倒三角地');
    assert.deepEqual(plain(R.ports(asset.id)), plain(R.ports('ground'))); assert.equal(R.textPos(asset.id), 'none');
    assert.equal(R.ports('ground')[0].x, 0); assert.equal(R.ports('ground')[0].y, -10);
    assert.match(h.get('menuInsert').innerHTML, /data-device="ground-triangle"/);
    assert.match(s.palList.innerHTML, /data-type="ground-triangle"/);
    const list = new Element(); list.querySelector = () => new Element(); s.renderPickerList(list, '倒三角'); assert.match(list.innerHTML, /ground-triangle/);
    const html = R.symbolInner(asset.id); assert.match(html, /<polygon[^>]*fill="none"/);
    assert.ok(!s.TFNetlist.DEVICES.includes(asset.id));
    assert.throws(() => s.TFNetlist.validateDoc({ items: [comp(asset.id, 'g')], groups: [] }), /不支持|器件/);
});

test('所有符号描边传递虚线/点线，文字与实心区域保持原有内容', () => {
    const h = environment(), R = h.s.Razavi;
    for (const entry of R.CATALOG) {
        const variants = [undefined, ...(R.variantOptions(entry.id) || []).map(v => v.id)];
        for (const variant of variants) for (const dash of ['7 4', '2 3']) {
            const it = { ...comp(entry.id, 'a'), dash, variant, rot: 1, fh: true };
            const str = R.itemSvg(it, { editorText: true });
            const stroked = [...str.matchAll(/<(?:line|polyline|path|circle|polygon)\b[^>]*>/g)].map(m => m[0]).filter(tag => /stroke-width=/.test(tag));
            for (const tag of stroked) assert.ok(tag.includes('stroke-dasharray="' + dash + '"'), entry.id + ': ' + tag);
            for (const m of str.matchAll(/<text\b[^>]*>/g)) assert.doesNotMatch(m[0], /stroke-dasharray/);
            const exported = R.docSvg({ items: [it] }, { editorText: true }).str;
            assert.equal(exported.includes('stroke-dasharray'), str.includes('stroke-dasharray'));
        }
    }
    for (const id of R.AUX_ORDER) assert.ok(R.itemSvg({ ...comp(id, 'aux'), dash: '2 3' }, { editorText: true }).includes('stroke-dasharray="2 3"'));
});

test('线型不改变网络提取，两种地不会因同名引脚自动合并', async () => {
    const G = require('../circuit-connectivity');
    const h = await blank(), s = h.s, R = s.Razavi;
    const doc = { items: [comp('resistor', 'r', 200, 200), comp('ground', 'g', 100, 300), comp('ground-triangle', 't', 300, 300)], groups: [] };
    const ports = doc.items.map(it => R.portsWorld(it));
    doc.items.push({ kind: 'wire', id: 'w', pts: [{ x: ports[0][0].x, y: ports[0][0].y }, { x: ports[1][0].x, y: ports[1][0].y }] });
    function nets() { const graph = G.build(doc, R.portsWorld); return doc.items.filter(i => i.kind === 'comp').map(i => R.portsWorld(i).map(p => graph.netOf(i.id, p.n))); }
    const before = nets(); assert.notEqual(before[1][0], before[2][0]); assert.equal(before[0][0], before[1][0]);
    doc.items.forEach(it => { it.dash = '7 4'; }); assert.deepEqual(nets(), before);
});

test('SVG/PNG/PDF 导出入口使用相同虚线几何且没有橙色尾段', async () => {
    const h = await blank({ doc: { items: [comp('resistor', 'r'), comp('ground', 'g', 400, 300), comp('ground-triangle', 't', 600, 300)], groups: [] } }), s = h.s;
    s.doc.items.forEach(i => { i.dash = '2 3'; });
    key(h, 'w'); click(h, 100, 100); click(h, 140, 140); point(h, 190, 190, 'mousemove');
    const sources = [], downloads = []; let pdf = 0;
    s.download = (name, blob) => downloads.push({ name, blob }); s.downloadPdfFromCanvas = () => { pdf++; };
    s.Image = class { set src(value) { sources.push(decodeURIComponent(value.split(',').slice(1).join(','))); this.onload(); } };
    const create = s.document.createElement;
    s.document.createElement = tag => tag === 'canvas' ? { getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: callback => callback(new Blob(['PNG'])) } : create(tag);
    await s.exportSVG(); await s.exportPNG(); await s.exportPDF();
    assert.equal(downloads.length, 2); assert.equal(pdf, 1); assert.equal(sources.length, 2);
    const svg = await downloads[0].blob.text(); assert.equal(svg, sources[0]); assert.equal(svg, sources[1]);
    assert.match(svg, /stroke-dasharray="2 3"/); assert.match(svg, /<polygon/); assert.doesNotMatch(svg, /#c0583a/);
});

test('线型单选/混合/成组、撤销、复制、JSON、刷新保持一致且不改端口', async () => {
    const doc = { items: [comp('resistor', 'r'), { ...comp('ground-triangle', 'g', 600, 300), dash: '2 3' }, { kind: 'label', id: 'l', x: 600, y: 500, text: '标签' }], groups: [{ id: 'group', members: ['r', 'g', 'l'] }] };
    const h = await blank({ doc }), s = h.s;
    s.sel = s.expandSel('r'); s.renderProps(); assert.equal(s.propDash.value, 'mixed');
    const ports = s.doc.items.filter(i => i.kind === 'comp').map(i => plain(s.Razavi.portsWorld(i)));
    s.propDash.value = '7 4'; s.propDash.fire('change');
    assert.equal(s.doc.items[0].dash, '7 4'); assert.equal(s.doc.items[1].dash, '7 4'); assert.equal(s.doc.items[2].dash, undefined);
    assert.deepEqual(s.doc.items.filter(i => i.kind === 'comp').map(i => plain(s.Razavi.portsWorld(i))), ports);
    s.undo(); assert.equal(s.doc.items[0].dash || '', ''); s.redo();
    s.sel = s.expandSel('r'); s.copySel(); s.pasteClip(); assert.equal(s.doc.items.filter(i => i.dash === '7 4').length, 4);
    h.import(plain(s.doc)); const fresh = await blank({ token: h.token, storage: { localStorage: s.localStorage, sessionStorage: s.sessionStorage } });
    assert.deepEqual(plain(fresh.s.doc), plain(s.doc));
    s.sel = ['l']; s.renderProps(); assert.equal(s.propDash.disabled, true); const history = s.undoStack.length;
    s.propDash.value = '2 3'; s.propDash.fire('change'); assert.equal(s.undoStack.length, history);
});

test('三窗口菜单、关闭、恢复与桌面偏好同步，不写图纸或撤销历史', async () => {
    const h = await blank(), s = h.s, before = JSON.stringify(s.doc), undo = s.undoStack.length, view = plain(s.viewTransform);
    for (const k of ['palette', 'templates', 'props']) {
        assert.equal(s.panelVisible(k), true); menu(h, k); assert.equal(s.panels[k].hidden, true); assert.equal(h.actions[k].getAttribute('aria-checked'), 'false');
        menu(h, k); h.panelNodes[k].close.click(); assert.equal(s.panelVisible(k), false);
    }
    assert.deepEqual(JSON.parse(s.localStorage.getItem(uiKey)).full, { palette: false, templates: false, props: false });
    const fresh = await blank({ token: h.token, storage: { localStorage: s.localStorage, sessionStorage: s.sessionStorage } }); assert.equal(fresh.s.panelVisible('templates'), false);
    menu(h, 'reset'); assert.equal(s.panelVisible('templates'), true); assert.equal(JSON.stringify(s.doc), before); assert.equal(s.undoStack.length, undo);
    assert.deepEqual(plain(s.viewTransform), view); assert.equal(s.localStorage.getItem(mainKey), h.before);
});

test('窄屏默认全关并单开，断点切换不覆盖桌面偏好，full/tt/tf 隔离', async () => {
    const h = await blank(), s = h.s; menu(h, 'palette'); const pref = s.localStorage.getItem(uiKey);
    s.innerWidth = 375; h.events.fire('resize'); assert.equal(s.narrowPanel, null);
    h.get('ckToggleTemplates').click(); assert.equal(s.panelVisible('templates'), true);
    h.get('ckToggleProps').click(); assert.equal(s.panelVisible('templates'), false); assert.equal(s.panelVisible('props'), true);
    h.get('ckToggleProps').click(); assert.equal(s.narrowPanel, null); assert.equal(s.localStorage.getItem(uiKey), pref);
    menu(h, 'reset'); assert.equal(s.narrowPanel, null); assert.equal(s.localStorage.getItem(uiKey), pref);
    s.innerWidth = 1440; h.events.fire('resize'); assert.equal(s.panelVisible('palette'), false); assert.equal(s.panelVisible('templates'), true);
    for (const mode of ['tt', 'tf']) {
        const embedded = editor({ copy: false, search: '?embed=' + mode, storage: { localStorage: s.localStorage } });
        assert.equal(embedded.s.panelVisible('palette'), true); assert.equal(embedded.actions.templates.hidden, true);
        embedded.s.togglePanel('templates'); embedded.s.insertFigure('ota5'); assert.equal(embedded.s.doc.items.length, 0);
        menu(embedded, 'props'); assert.equal(JSON.parse(s.localStorage.getItem(uiKey))[mode].props, false);
    }
    assert.equal(JSON.parse(s.localStorage.getItem(uiKey)).full.palette, false);
});

test('存储读取/写入失败不阻塞绘图或窗口切换', () => {
    const storage = new Storage(); storage.failRead = true;
    const h = editor({ copy: false, search: '?embed=tt', setup(h) { h.s.localStorage = storage; } });
    storage.failWrite = true; menu(h, 'props'); assert.equal(h.s.panelVisible('props'), false);
    h.s.addComp('tt-in', 100, 100); assert.equal(h.s.doc.items.length, 1); menu(h, 'reset'); assert.equal(h.s.panelVisible('props'), true);
});

test('属性与模板拖动钳制在视口内，隐藏/取消/失焦/resize 结束拖动', async () => {
    const h = await blank(), s = h.s;
    for (const k of ['props', 'templates']) for (const end of ['blur', 'pointercancel', 'resize', 'hide']) {
        const { hd } = h.panelNodes[k]; if (!s.panelVisible(k)) s.togglePanel(k);
        hd.fire('pointerdown', { target: hd, button: 0, pointerId: 1, clientX: 20, clientY: 20 }); assert.ok(s.panelDrag);
        h.events.fire('pointermove', { pointerId: 1, buttons: 1, clientX: 9999, clientY: 9999 });
        assert.deepEqual(plain(s.panelPositions[k]), { left: 790, top: 400 });
        if (end === 'hide') s.togglePanel(k); else h.events.fire(end, { pointerId: 1 });
        assert.equal(s.panelDrag, null);
    }
    assert.equal(s.doc.items.length, 0); assert.equal(s.undoStack.length, 0);
    s.resetPanelLayout(); assert.deepEqual(plain(s.panelPositions), {});
});

test('可用画布排除实际可见模板，隐藏后回收空间；五模板一步撤销且 ID 唯一', async () => {
    const h = await blank(), s = h.s;
    s.getComputedStyle = () => ({ position: 'absolute', display: 'block' });
    s.palettePanel.hidden = s.propsPanel.hidden = true;
    s.templatesPanel.getBoundingClientRect = () => ({ left: 400, right: 600, top: 300, bottom: 600 });
    const r = s.canvasUsableRect(); assert.ok(r.y + r.height <= 284 || r.x + r.width <= 384 || r.x >= 616);
    s.templatesPanel.hidden = true; assert.equal(s.canvasUsableRect().width, 920);
    const originals = JSON.stringify(s.RAZAVI_FIGURES);
    for (const btn of h.templateButtons) {
        btn.click(); const saved = plain(s.doc); assert.equal(s.doc.groups.length, 1); assert.equal(s.document.activeElement, s.svg);
        assert.equal(new Set(s.doc.items.map(i => i.id)).size, s.doc.items.length);
        key(h, 'z', { ctrlKey: true }); assert.equal(s.doc.items.length, 0);
        key(h, 'y', { ctrlKey: true }); assert.deepEqual(plain(s.doc), saved);
        btn.click(); assert.equal(new Set(s.doc.items.map(i => i.id)).size, s.doc.items.length); s.newDoc();
    }
    assert.equal(JSON.stringify(s.RAZAVI_FIGURES), originals);
});

/* 最小输入表面：选区/事件由测试控制，运行真实富文本模型，不模拟浏览器排版或 IME。 */
function textSurface(h) {
    const s = h.s, d = s.document;
    function text(value) { return { nodeType: 3, data: String(value), contains(n) { return n === this; }, get textContent() { return this.data; }, all() { return [this]; } }; }
    function surface(e) {
        e.nodeType = 1;
        Object.defineProperty(e, 'childNodes', { get: () => e.children });
        Object.defineProperty(e, 'firstChild', { get: () => e.children[0] });
        Object.defineProperty(e, 'innerHTML', { get: () => '', set() { e.children = []; } });
        Object.defineProperty(e, 'textContent', { get: () => e.children.map(n => n.textContent).join(''), set(value) { e.children = []; if (value !== '') e.appendChild(text(value)); } });
        e.focus = () => { if (d.activeElement !== e) { d.activeElement = e; e.fire('focus'); } };
        e.offsetHeight = 30; e.offsetWidth = 300; e.scrollLeft = e.scrollTop = 0;
        e.setCustomValidity = () => {}; e.reportValidity = () => {};
        return e;
    }
    d.createElement = tag => surface(new Element(tag)); d.createTextNode = text;
    const host = surface(h.get('ckTextHost')), box = surface(h.get('ckTextBox')), bar = surface(h.get('ckTextToolbar'));
    host.appendChild(box); host.appendChild(bar); box.isContentEditable = true;
    const size = d.createElement('input'); size.dataset.size = ''; bar.appendChild(size);
    const buttons = ['bold', 'italic', 'super', 'sub'].map(name => {
        const b = d.createElement('button'); b.dataset.format = name; b.closest = selector => selector === 'button' ? b : null; bar.appendChild(b); return b;
    });
    bar.querySelector = selector => selector === '[data-size]' ? size : null;
    bar.querySelectorAll = selector => selector === '[data-format]' ? buttons : [];
    s.NodeFilter = { SHOW_TEXT: 4 };
    d.createTreeWalker = root => { const nodes = []; const walk = n => { if (n.nodeType === 3) nodes.push(n); else (n.childNodes || []).forEach(walk); }; walk(root); let i = 0; return { nextNode: () => nodes[i++] || null }; };
    d.createRange = () => ({
        setStart(node, offset) { this.startContainer = node; this.startOffset = offset; },
        setEnd(node, offset) { this.endContainer = node; this.endOffset = offset; },
        collapse() { this.setEnd(this.startContainer, this.startOffset); }, getClientRects: () => []
    });
    const selection = { rangeCount: 0, removeAllRanges() { this.rangeCount = 0; this.anchorNode = this.focusNode = null; },
        addRange(r) { this.rangeCount = 1; this.range = r; this.anchorNode = r.startContainer; this.anchorOffset = r.startOffset; this.focusNode = r.endContainer; this.focusOffset = r.endOffset; },
        getRangeAt() { return this.range; }, setBaseAndExtent(a, ai, b, bi) { this.anchorNode = a; this.anchorOffset = ai; this.focusNode = b; this.focusOffset = bi; } };
    s.getSelection = () => selection;
    h.text = { host, box, bar, size, buttons, selection, selectAll() { const r = d.createRange(); r.setStart(box, 0); r.setEnd(box, box.childNodes.length); selection.addRange(r); } };
    h.run('tools/circuit-sketch/text-editor.js');
}
function type(h, data) { h.text.box.fire('beforeinput', { inputType: 'insertText', data }); }
function textKey(h, value, extra = {}) { return h.text.box.fire('keydown', { key: value, ...extra }); }

test('双击文字事件和属性按钮进入真实文本会话，末尾直接输入、确认一步撤销', async () => {
    const h = await blank({ doc: { items: [{ kind: 'label', id: 'label', x: 100, y: 100, text: '原文' }], groups: [] }, setup: textSurface }), s = h.s;
    double(h, 105, 96); assert.equal(s.document.activeElement, h.text.box); assert.ok(s.textSession);
    const saved = s.sessionStorage.getItem(s.CircuitHandoff.SESSION + h.token);
    type(h, ' W/R'); assert.equal(h.text.box.textContent, '原文 W/R'); assert.equal(s.doc.items[0].text, '原文');
    for (const value of ['w', 'r', 'Delete', ' ']) key(h, value, { target: h.text.box });
    assert.equal(s.tool, 'select'); assert.equal(s.doc.items.length, 1);
    assert.equal(s.sessionStorage.getItem(s.CircuitHandoff.SESSION + h.token), saved);
    textKey(h, 'Enter'); assert.equal(s.doc.items[0].text, '原文 W/R'); assert.equal(s.undoStack.length, 1);
    s.undo(); assert.equal(s.doc.items[0].text, '原文'); s.redo();
    s.sel = ['label']; s.renderProps(); s.propEditText.click(); assert.equal(s.document.activeElement, h.text.box);
    h.text.selectAll(); type(h, '替换'); textKey(h, 'Enter'); assert.equal(s.doc.items[0].text, '替换');
});

test('空标签输入、取消不落盘，组内双击只修改目标文字', async () => {
    const h = await blank({ setup: textSurface }), s = h.s; key(h, 't'); click(h, 200, 200);
    assert.equal(s.document.activeElement, h.text.box); assert.equal(h.text.box.firstChild.style.paddingTop, '0');
    type(h, '草稿'); textKey(h, 'Escape'); assert.equal(s.doc.items.length, 0); assert.equal(s.undoStack.length, 0);
    h.import({ items: [{ kind: 'label', id: 'a', x: 100, y: 100, text: 'A' }, { kind: 'label', id: 'b', x: 300, y: 100, text: 'B' }], groups: [{ id: 'g', members: ['a', 'b'] }] });
    double(h, 105, 96); assert.equal(s.textSession.id, 'a'); assert.equal(s.propEditText.disabled, true);
    type(h, '1'); textKey(h, 'Enter'); assert.equal(s.doc.items[0].text, 'A1'); assert.equal(s.doc.items[1].text, 'B'); assert.equal(s.doc.groups.length, 1);
});

test('字体刷新不抢工具栏焦点，格式操作恢复选区继续输入，窗口操作保留草稿', async () => {
    const h = await blank({ doc: { items: [{ kind: 'label', id: 'a', x: 100, y: 100, text: 'AB' }], groups: [] }, setup: textSurface }), s = h.s;
    double(h, 105, 96); h.text.selectAll(); h.text.bar.fire('pointerdown', { target: h.text.size }); h.text.size.focus();
    s.textEditor.refresh(); assert.equal(s.document.activeElement, h.text.size);
    h.text.size.value = '24'; h.text.size.fire('change'); assert.equal(s.document.activeElement, h.text.box);
    type(h, 'X'); assert.equal(h.text.box.textContent, 'X');
    h.text.bar.fire('pointerdown', { target: h.text.buttons[0] }); h.text.bar.fire('click', { target: h.text.buttons[0] }); type(h, '粗体');
    s.togglePanel('props'); s.resetPanelLayout(); assert.ok(s.textSession); assert.equal(s.doc.items[0].text, 'AB');
    textKey(h, 'Enter'); assert.equal(s.doc.items[0].text, 'X粗体'); assert.equal(s.doc.items[0].richText.lines[0].runs.at(-1).bold, true);
    assert.equal(s.undoStack.length, 1);
});

test('输入法组合期间 Enter 不确认，Alt+Enter 换行，逻辑 IO 保持全选改名', async () => {
    const h = await blank({ doc: { items: [{ kind: 'label', id: 'a', x: 100, y: 100, text: 'A' }], groups: [] }, setup: textSurface }), s = h.s;
    double(h, 105, 96); h.text.selection.removeAllRanges(); h.text.box.fire('compositionstart');
    textKey(h, 'Enter', { isComposing: true, keyCode: 229 }); assert.ok(s.textSession);
    h.text.box.firstChild.firstChild.textContent = 'A中文';
    h.text.box.fire('compositionend'); h.tick(1); textKey(h, 'Enter'); assert.ok(s.textSession);
    h.tick(100); textKey(h, 'Enter', { altKey: true }); type(h, '下一行'); textKey(h, 'Enter'); assert.match(s.doc.items[0].text, /\n下一行/);
    h.import({ items: [comp('tt-in', 'in', 200, 200)], groups: [] }); s.sel = ['in']; s.propEditText.click();
    type(h, 'input_a'); textKey(h, 'Enter'); assert.equal(s.doc.items[0].text, 'input_a');
});

test('TF iframe 与 TF 副本双击参数体/标签仍路由到参数编辑器', async () => {
    for (const embedded of [false, true]) {
        const h = await blank({ copy: !embedded, search: embedded ? '?embed=tf' : '', setup: textSurface }), s = h.s;
        const doc = { items: [{ ...comp('resistor', 'r'), analysis: { version: 1, symbol: 'R1', value: '12', prefix: 'k' } }], groups: [], analysisContext: { version: 1, kind: 'tf' }, inputKind: 'current' };
        h.import(doc); double(h, 300, 200); assert.ok(s.parameterEditor.active); assert.equal(s.textSession, null);
        s.parameterEditor.cancel(); s.sel = ['r']; s.renderProps(); assert.equal(s.propEditText.textContent, '编辑参数');
        s.propEditText.click(); assert.ok(s.parameterEditor.active); h.children.get('[name="value"]').value = '24'; h.children.get('form').fire('submit');
        assert.equal(s.doc.items[0].analysis.value, '24'); assert.equal(s.doc.inputKind, 'current');
    }
});

test('HTML 模板区域独立，混合线型与窗口入口齐全', () => {
    const html = code('tools/circuit-sketch/index.html');
    const palette = html.match(/<aside[^>]*id="ckPalette"[\s\S]*?<\/aside>/)[0]; assert.doesNotMatch(palette, /data-tpl/);
    const templates = html.match(/<aside[^>]*id="ckTemplates"[\s\S]*?<\/aside>/)[0]; assert.equal((templates.match(/data-tpl=/g) || []).length, 5);
    assert.match(html, /value="mixed" disabled/); assert.match(html, /id="menuWindow"/); assert.match(html, /双击文字直接编辑/);
});

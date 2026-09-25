/* 执行编辑器完整启动/菜单/存档代码；DOM 几何与富文本交互由浏览器验收承担。 */
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { environment, editor, plain, settle } = require('./handoff-harness');
const mainKey = 'ee-circuit-sketch-v2';
const document0 = () => ({ items: [{ kind: 'comp', id: 'i7', type: 'resistor', x: 55.5, y: 79.25, rot: 3, fh: true, text: 'R1' }, { kind: 'wire', id: 'i12', pts: [{ x: 10, y: 20 }, { x: 40, y: 20 }] }], groups: [] });
test('全部生成图纸经传输进入真实编辑器，连接/数值/位置/分组保持不变', async () => {
    const build = environment(), s = build.s;
    for (const file of ['tools/dpi-calc/topologies.js', 'tools/filter-design/topologies.js', 'tools/power-electronics/topologies.js']) build.run(file);
    const p = { f: 1e6, p: 37, r0: 50, cb: 6.8e-9, esr: .1, esl: 1e-9, leak: 1e8, lb: 5e-6, rb: 150, cban: 6.8e-9, rext: 0, rd: 50, xd: 0, rm: 1e4, cm: 1e-8, rin: 1e6, cin: 1e-11, lrf: 5e-6 };
    const docs = [];
    for (const kind of Object.keys(s.DPIFigures.titles)) for (const parasitic of [false, true]) for (const useBan of [false, true]) docs.push(s.DPIFigures.build(kind, { ...p, parasitic, useBan }).doc);
    for (const arch of Object.keys(s.FilterFigures.names)) docs.push(s.FilterFigures.build(arch, { R1: 1e4, R2: 2e4, R3: 5e3, C1: 1e-8, C2: 2e-8, C3: 2e-8 }).doc);
    const E = require('../../tools/power-electronics/engine');
    for (const topo of Object.keys(E.specs)) for (const mode of topo === 'buck' ? ['auto', 'sync'] : ['auto']) docs.push(s.PEFigures.pack(topo, mode, { ...E.defaults(topo), mode }).doc);
    for (const original of docs) {
        const h = editor({ doc: original }); await settle(); assert.equal(h.s.copyPending, false);
        assert.equal(h.s.doc.items.length, original.items.length); assert.deepEqual(plain(h.s.doc.groups), plain(original.groups));
        for (const item of original.items) {
            const got = h.s.doc.items.find(i => i.id === item.id);
            assert.deepEqual(plain(Object.fromEntries(Object.keys(item).map(k => [k, got[k]]))), plain(item));
        }
        assert.equal(h.s.localStorage.getItem(mainKey), h.before);
    }
});
test('副本启动不载主存档，pending 禁编辑，接收后保持坐标并清空撤销栈', async () => {
    const h = editor({ pending: true }), s = h.s;
    assert.equal(s.copyPending, true); assert.equal(s.doc.items.length, 0); s.newDoc(); assert.equal(s.doc.items.length, 0);
    s.CircuitHandoff.publish(h.token, { doc: document0(), title: '图', context: {} }); h.events.fire('storage'); await settle();
    assert.equal(s.copyPending, false); assert.equal(s.doc.items[0].x, 55.5); assert.equal(s.doc.items[0].rot, 3);
    assert.equal(s.undoStack.length, 0); assert.equal(s.localStorage.getItem(mainKey), h.before);
    assert.equal(s.localStorage.getItem(s.CircuitHandoff.PREFIX + h.token), null);
});
test('副本移动/连线/文字/撤销/重做/Ctrl+S 全程不写主档，刷新保留修改', async () => {
    const h = editor(); await settle(); const s = h.s;
    s.pushUndo(); s.moveItem(s.doc.items[0], 20, 10); s.doc.items[0].text = '修改值'; s.doc.items[1].pts[1].y = 55; s.render();
    s.undo(); assert.equal(s.doc.items[0].x, 55.5); s.redo(); assert.equal(s.doc.items[0].x, 75.5);
    h.events.fire('keydown', { key: 's', code: 'KeyS', ctrlKey: true, target: s.svg });
    assert.equal(s.localStorage.getItem(mainKey), h.before); assert.ok(!s.localStorage.writes.includes(mainKey));
    const fresh = editor({ token: h.token, storage: { localStorage: s.localStorage, sessionStorage: s.sessionStorage } }); await settle();
    assert.equal(fresh.s.doc.items[0].x, 75.5); assert.equal(fresh.s.doc.items[0].text, '修改值'); assert.equal(fresh.s.doc.items[1].pts[1].y, 55);
    assert.ok(h.events.fire('beforeunload').prevented);
});
test('新建、JSON 导入、ID 种子与显式主存档确认/取消', async () => {
    const h = editor(); await settle(); const s = h.s;
    s.newDoc(); assert.equal(s.doc.items.length, 0); s.undo(); assert.equal(s.doc.items.length, 2);
    const incoming = document0(); incoming.items[0].text = '导入'; h.import(incoming); assert.equal(s.doc.items[0].text, '导入');
    assert.ok(Number(s.uid().slice(1)) > 12); s.undo(); assert.equal(s.doc.items[0].text, 'R1'); s.redo();
    assert.equal(s.localStorage.getItem(mainKey), h.before); s.confirm = () => false; s.menuActions['save-main'](); assert.equal(s.localStorage.getItem(mainKey), h.before);
    s.confirm = () => true; s.menuActions['save-main'](); const explicit = s.localStorage.getItem(mainKey); assert.equal(JSON.parse(explicit).items[0].text, '导入');
    s.newDoc(); s.menuActions['save-local'](); assert.equal(s.localStorage.getItem(mainKey), explicit);
});
test('会话配额失败保留传输并警告；无效/冲突链接不回退示例', async () => {
    const h = editor({ sessionFail: true }); await settle(); assert.equal(h.s.copyPending, false);
    assert.match(h.get('copyNotice').textContent, /刷新可能丢失/); assert.equal(h.s.CircuitHandoff.read(h.token).status, 'ready');
    assert.equal(h.s.localStorage.getItem(mainKey), h.before);
    for (const options of [{ token: 'invalid' }, { search: '?embed=tf' }, { search: '?fig=ota5' }]) {
        const bad = editor(options); await settle(); assert.equal(bad.s.copyPending, true); assert.equal(bad.s.doc.items.length, 0);
        assert.match(bad.get('copyNotice').textContent, /载入失败/); assert.equal(bad.s.localStorage.getItem(mainKey), bad.before); assert.equal(bad.messages.length, 0);
    }
});
test('副本新建后刷新保持空图；损坏会话不被原传输快照覆盖', async () => {
    const h = editor(); await settle(); h.s.newDoc();
    const storage = { localStorage: h.s.localStorage, sessionStorage: h.s.sessionStorage };
    const fresh = editor({ token: h.token, storage }); await settle(); assert.equal(fresh.s.doc.items.length, 0); assert.equal(fresh.s.copyPending, false);
    const bad = editor({ pending: true }); bad.s.CircuitHandoff.publish(bad.token, { doc: document0(), title: '原快照', context: {} });
    const key = bad.s.CircuitHandoff.SESSION + bad.token; bad.s.sessionStorage.setItem(key, '{损坏会话'); await settle();
    assert.equal(bad.s.copyPending, true); assert.equal(bad.s.sessionStorage.getItem(key), '{损坏会话');
    assert.match(bad.get('copyNotice').textContent, /无法恢复副本会话/); assert.equal(bad.s.CircuitHandoff.read(bad.token).status, 'ready');
    assert.equal(bad.s.localStorage.getItem(mainKey), bad.before);
});
test('普通启动、旧 fig 和两个 embed 的存档及桥接回归', async () => {
    const normal = editor({ copy: false }); assert.equal(normal.s.doc.items[0].id, 'main'); normal.s.newDoc(); assert.equal(JSON.parse(normal.s.localStorage.getItem(mainKey)).items.length, 0);
    const fig = editor({ copy: false, search: '?fig=ota5' }); assert.ok(fig.s.doc.items.length > 2); assert.equal(fig.s.suppressSave, true); fig.s.undo(); assert.equal(fig.s.doc.items[0].id, 'main');
    for (const mode of ['tt', 'tf']) {
        const h = editor({ copy: false, search: '?embed=' + mode }); const s = h.s;
        assert.equal(s.doc.items.length, 0); assert.equal(s.localStorage.getItem(mainKey), h.before);
        h.events.fire('message', { source: s.parent, origin: s.location.origin, data: { type: mode + '-get-doc', requestId: 'request' } });
        assert.ok(h.messages.some(m => m.d.type === mode + '-doc' && m.d.requestId === 'request' && m.origin === s.location.origin));
    }
});
test('TF 副本参数对话框、草稿保护、唯一命名、复制及 JSON 元数据', async () => {
    const d = document0(); d.analysisContext = { version: 1, kind: 'tf' }; d.inputKind = 'current';
    d.items[0].analysis = { version: 1, symbol: 'R1', value: '12', prefix: 'k' };
    const h = editor({ doc: d }); await settle(); const s = h.s;
    assert.ok(s.hasTFContext()); assert.ok(!s.isTF()); assert.equal(h.messages.length, 0); assert.ok(s.deviceVisible('tf-in'));
    s.parameterItem = s.doc.items[0].id; s.parameterEditor.open(s.doc.items[0], s.doc.items[0].analysis);
    assert.ok(s.shortcutBlocked({ target: s.svg })); s.newDoc(); assert.equal(s.doc.items.length, 2);
    h.children.get('[name="value"]').value = '24'; h.children.get('form').fire('submit');
    assert.equal(s.doc.items[0].analysis.value, '24'); s.undo(); assert.equal(s.doc.items[0].analysis.value, '12'); s.redo();
    s.sel = [s.doc.items[0].id]; s.copySel(); s.pasteClip();
    const parameters = s.doc.items.filter(i => i.analysis); assert.equal(parameters.length, 2); assert.notEqual(parameters[0].analysis.symbol, parameters[1].analysis.symbol);
    h.import(plain(s.doc)); assert.equal(s.doc.inputKind, 'current'); assert.ok(s.hasTFContext());
    s.newDoc(); assert.ok(!s.hasTFContext()); s.undo(); assert.ok(s.hasTFContext()); assert.equal(h.messages.length, 0);
    assert.equal(s.localStorage.getItem(mainKey), h.before);
});
test('TT 嵌入桥拒绝异源、草稿和损坏载入，保留组/富文本', () => {
    const h = editor({ copy: false, search: '?embed=tt' }), s = h.s, d = document0();
    const emit = (data, origin = s.location.origin) => h.events.fire('message', { data, origin, source: s.parent });
    const initial = h.messages.length; emit({ type: 'tt-get-doc', requestId: 'bad' }, 'https://bad.test'); assert.equal(h.messages.length, initial);
    s.textSession = {}; emit({ type: 'tt-get-doc', requestId: 'draft' }); assert.equal(h.messages.at(-1).d.editing, true);
    emit({ type: 'tt-load-doc', requestId: 'blocked', doc: d }); assert.match(h.messages.at(-1).d.error, /草稿/); s.textSession = null;
    d.items[0].richText = { version: 1, align: 'middle', lines: [{ runs: [{ text: 'R', bold: true }, { text: '1', script: 'sub' }] }] };
    d.groups = [{ id: 'grp', members: ['i7', 'i12'] }]; emit({ type: 'tt-load-doc', requestId: 'load', doc: d }); assert.equal(h.messages.at(-1).d.type, 'tt-ack'); assert.equal(s.doc.groups.length, 1);
    assert.equal(s.doc.items[0].richText.lines[0].runs[0].bold, true); assert.equal(s.doc.items[0].richText.lines[0].runs[1].script, 'sub');
    emit({ type: 'tt-load-doc', requestId: 'invalid', doc: { items: [{ ...d.items[0], type: 'missing' }] } }); assert.match(h.messages.at(-1).d.error, /未知器件/);
    assert.equal(s.doc.items.length, 2); assert.equal(s.localStorage.getItem(mainKey), h.before);
});

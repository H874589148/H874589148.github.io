/* 模型、真实 XLSX 回读、界面事件与 Worker 竞态；不替代独立浏览器/Office 验收。 */
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const C = require('../../tools/sim-log/result-core'), OCR = require('../../tools/sim-log/result-ocr'), Editor = require('../../tools/sim-log/result-editor');
const { environment, settle, html, root } = require('./sim-results-harness');
const ExcelJS = require('../../lib/exceljs/4.4.0/exceljs.min.js'), marked = require('../../lib/marked.min.js');
const select = (d, r = 0, c = 0, mode = 'cell') => ({ row: d.rows[r], col: d.cols[c], mode });
const word = (id, text, x0, y0, x1, y1, confidence = 95) => ({ id, text, x0, y0, x1, y1, confidence });
const origin = { kind: 'ocr', imageId: 'image', name: 'fixture' };
function ui(options) { const h = environment(options); h.editor = Editor.init(h.win); h.editor.setActive(true); return h; }
function fill(h, text) { h.get('fill-text').value = text; h.click('text-apply'); }
function create(h) { h.click('create'); return h.editor.snapshot(); }
const file = (extra = {}) => ({ type: 'image/png', size: 1024, name: 'fixture.png', ...extra });
const raw = { blocks: [{ paragraphs: [{ lines: [{ words: [{ text: '100', confidence: 96, bbox: { x0: 10, y0: 10, x1: 30, y1: 25 } }] }] }] }] };
async function advancePixel(h) {
    const worker = h.workers.filter(w => w.url === 'result-image-worker.js').at(-1), p = worker.payload;
    const result = C.preprocess(new Uint8ClampedArray(p.buffer), p.width, p.height, p.mode);
    worker.emit({ id: p.id, buffer: result.pixels.buffer, grid: result.grid }); await settle();
    return h.workers.filter(w => w.url === 'result-ocr-worker.js').at(-1);
}
test('严格矩形容量、未知版本、损坏存档均拒绝，不静默截断', () => {
    for (const [r, c] of [[0, 1], [201, 1], [1, 51], [200, 26], [1.5, 2]]) assert.throws(() => C.create(r, c));
    const d = C.create(100, 50); assert.equal(C.validate(d), d); assert.throws(() => C.parse('{'));
    for (const modify of [d => d.version = 2, d => d.rows[1] = d.rows[0], d => d.cells[0].pop(), d => d.cells[0][0].text = 'a'.repeat(2001), d => d.cells[0][0].fill = 'red;display:none', d => d.header = 'yes']) { const doc = C.create(2, 2); modify(doc); assert.throws(() => C.validate(doc)); }
    d.cells.forEach(row => row.forEach(cell => { cell.text = 'x'.repeat(101); })); assert.throws(() => C.validate(d), /500,000/);
});
test('行列移动携带文字、填色、来源、核对状态，选区按稳定 ID 跟随', () => {
    let d = C.create(3, 3, origin); const v = d.cells[2][0]; Object.assign(v, { text: '00123', fill: '#ABCDEF', confidence: 77, reviewed: false, source: { imageId: 'image', ambiguous: false, boxes: [word('x', '', 1, 1, 5, 5)] } });
    const s = select(d, 2, 0); d = C.apply(d, { type: 'move', axis: 'row', id: s.row, to: 0 }); d = C.apply(d, { type: 'move', axis: 'col', id: s.col, to: 2 });
    assert.deepEqual(d.cells[0][2], v); assert.deepEqual(C.range(d, s), { r0: 0, r1: 0, c0: 2, c1: 2 });
});
test('同文覆盖与只填空串；文字与底色清除独立且原表不可变', () => {
    let d = C.create(1, 4); ['', '0', '—', ' '].forEach((text, i) => { d.cells[0][i].text = text; d.cells[0][i].fill = '#FF0000'; });
    const selection = select(d, 0, 0, 'row'); let next = C.apply(d, { type: 'text', selection, text: '填充', onlyEmpty: true });
    assert.deepEqual(next.cells[0].map(v => v.text), ['填充', '0', '—', ' ']); assert.equal(d.cells[0][0].text, '');
    next = C.apply(next, { type: 'clear', selection }); assert.ok(next.cells[0].every(v => v.text === '' && v.fill === '#FF0000'));
    next = C.apply(next, { type: 'fill', selection, fill: '' }); assert.ok(next.cells[0].every(v => v.fill === ''));
});
test('插入、完整行列删除与最后一格保护；无效操作不改变文档', () => {
    let d = C.create(2, 2); d = C.apply(d, { type: 'insert', axis: 'row', id: d.rows[0], after: true }); assert.equal(d.rows.length, 3);
    d = C.apply(d, { type: 'insert', axis: 'col', id: d.cols[0], after: false }); assert.equal(d.cols.length, 3);
    assert.throws(() => C.apply(d, { type: 'delete', axis: 'row', id: d.rows[0], selection: select(d) }), /完整/);
    for (const axis of ['row', 'col']) { const s = select(d, 0, 0, axis); s.endRow = d.rows.at(-1); s.endCol = d.cols.at(-1); d = C.apply(d, { type: 'delete', axis, id: axis === 'row' ? d.rows[0] : d.cols[0], selection: s }); }
    assert.equal(d.cells.length, 1); assert.equal(d.cells[0].length, 1); assert.equal(d.cells[0][0].text, '');
});
test('历史整次事务撤销重做、分支清理、50 步和 10 MiB 上限', () => {
    const h = new C.History(); let d = C.create(2, 2), s = select(d, 0, 0, 'row');
    h.push(d, s); const old = d; d = C.apply(d, { type: 'text', selection: s, text: '一整行' });
    const undo = h.step(false, d, s); assert.deepEqual(undo.doc, old); const redo = h.step(true, undo.doc, undo.selection); assert.deepEqual(redo.doc, d);
    for (let i = 0; i < 60; i++) h.push(d, s); assert.equal(h.undoItems.length, 50);
    const large = C.create(200, 25); large.cells.forEach(row => row.forEach(v => { v.text = 'a'.repeat(100); }));
    for (let i = 0; i < 15; i++) h.push(large, select(large)); assert.ok(JSON.stringify([h.undoItems, h.redoItems]).length * 2 <= C.LIMITS.bytes);
});
test('可信网格保留空格，多行、多词、跨界、未归属、低置信逐项保留', () => {
    const words = [word('a', 'Output', 10, 10, 35, 20), word('b', 'Voltage', 40, 10, 75, 20), word('c', 'line2', 10, 30, 50, 40), word('d', 'cross', 90, 60, 110, 75, 60), word('e', 'outside', 230, 10, 260, 20)];
    const out = C.reconstruct(words, { xs: [0, 100, 200], ys: [0, 50, 100] }, 300, 120, origin);
    assert.equal(out.doc.cells[0][0].text, 'Output Voltage\nline2'); assert.equal(out.doc.cells[0][1].text, '');
    assert.ok(out.issues.some(i => i.reason === '跨边界')); assert.ok(out.issues.some(i => i.word.text === 'outside' && i.reason === '未归属'));
    assert.ok(out.doc.cells[1].some(v => v.text === 'cross' && !v.reviewed));
});
test('无线表按重复几何空隙分列，不按单元格内字符串空格分列', () => {
    const words = [];
    for (let r = 0; r < 3; r++) words.push(word('a' + r, 'Output Voltage', 10, 10 + r * 30, 90, 25 + r * 30), word('b' + r, '1e-6', 150, 10 + r * 30, 180, 25 + r * 30));
    const grid = C.infer(words, 200, 100, { xs: [], ys: [] }); assert.equal(grid.xs.length, 3); assert.equal(grid.ys.length, 4);
    assert.throws(() => C.infer([], 100, 100), /未识别/);
    for (const xs of [[0, 0, 10], [10, 0], [-1, 10], [0, 101], [0, NaN]]) assert.throws(() => C.boundaries(xs, 100));
});
test('位置输出无效词显式返回，置信分数规范化不改写数值', () => {
    const input = C.clone(raw); input.blocks[0].paragraphs[0].lines[0].words.push({ text: '00123' }, { text: 'O µA -1e-6', confidence: -1, bbox: { x0: 1, y0: 1, x1: 2, y1: 2 } });
    const out = C.normalizeWords(input); assert.deepEqual(out.rejected, ['00123']); assert.equal(out.words[1].text, 'O µA -1e-6'); assert.equal(out.words[1].confidence, 0);
});
test('像素预处理自动反色、透明合成及尺寸边界', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 0]);
    const dark = C.preprocess(pixels, 2, 1, 'dark'); assert.equal(dark.inverted, true); assert.equal(dark.pixels[0], 255); assert.equal(dark.pixels[4], 255); assert.equal(pixels[0], 0);
    assert.throws(() => C.preprocess(pixels, 5000, 1, 'auto')); assert.equal(C.foreground('#FFFFFF'), '#000000'); assert.equal(C.foreground('#000000'), '#FFFFFF');
});
test('Excel HTML/TSV 不执行注入且文本保护不修改原数据', () => {
    const d = C.create(1, 4); ['=1+1', '00123', '<script>&\n"', 'a\tb'].forEach((v, i) => d.cells[0][i].text = v);
    const text = C.tsv(d), markup = C.html(d); assert.match(text, /'=1\+1/); assert.match(text, /'00123/); assert.match(text, /"'a\tb"/); assert.match(markup, /mso-number-format/); assert.doesNotMatch(markup, /<script>/); assert.match(markup, /&lt;script&gt;&amp;<br>/); assert.equal(d.cells[0][0].text, '=1+1');
});
test('Markdown 渲染保留首行数据、转义管道/反斜杠/HTML/换行', () => {
    const d = C.create(2, 2); d.header = false; d.cells[0][0].text = 'first|\\<b>\nnext'; d.cells[1][0].text = '**literal**';
    const rendered = marked.parse(C.markdown(d)); assert.equal((rendered.match(/<tr>/g) || []).length, 3); assert.match(rendered, /first&#124;&#92;&lt;b&gt;<br>next/); assert.doesNotMatch(rendered, /<strong>|<b>/);
});
test('LaTeX 转义、换行及真实填色，首行表头随重排生效', () => {
    let d = C.create(2, 1); d.cells[1][0].text = '\\input{bad}&_%#\nµA'; d.cells[1][0].fill = '#112233'; d = C.apply(d, { type: 'move', axis: 'row', id: d.rows[1], to: 0 });
    const tex = C.latex(d); assert.match(tex, /\\cellcolor\[HTML\]\{112233\}/); assert.match(tex, /\\shortstack/); assert.match(tex, /\\textbf/); assert.doesNotMatch(tex, /\\input\{/); assert.match(tex, /\\textbackslash\{\}input\\\{bad/);
});
test('真实 XLSX 回读：字符串类型、前导零、长整数、公式样文字、底色与冻结表头', async () => {
    const values = ['00123', '1e-6', '=1+1', '-0.25', '12345678901234567890', '2026-01-02', 'µA\n第二行'];
    let d = C.create(values.length, 1); values.forEach((text, i) => { d.cells[i][0].text = text; d.cells[i][0].fill = '#123456'; });
    d = C.apply(d, { type: 'move', axis: 'row', id: d.rows.at(-1), to: 0 });
    const bytes = await C.workbook(d, ExcelJS).xlsx.writeBuffer(); assert.equal(bytes[0], 80); assert.equal(bytes[1], 75);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes); const sheet = book.worksheets[0];
    for (let r = 1; r <= values.length; r++) { const cell = sheet.getCell(r, 1); assert.equal(cell.type, ExcelJS.ValueType.String); assert.equal(cell.value, d.cells[r - 1][0].text); assert.equal(cell.numFmt, '@'); assert.equal(cell.fill.fgColor.argb, 'FF123456'); assert.equal(cell.alignment.wrapText, true); }
    assert.equal(sheet.views[0].ySplit, 1); assert.equal(sheet.getCell(1, 1).font.bold, true);
});
test('导入格式/体积/数量/解码尺寸拒绝；缩放明确限制', async () => {
    for (const files of [[], [file(), file()], [file({ type: 'image/svg+xml' })], [file({ size: 16 * 1024 * 1024 })]]) assert.throws(() => OCR.fileCheck(files));
    const h = environment(), ocr = new OCR.Controller(h.win); await assert.rejects(ocr.importFiles([file({ width: 6000, height: 4000 })]), /20 MP/); assert.equal(ocr.image, null);
    await assert.rejects(ocr.importFiles([file({ broken: true })])); assert.equal(ocr.image, null);
    const size = OCR.workSize({ width: 10000, height: 1000 }); assert.ok(size.width <= 4096 && size.width * size.height <= 6000000); assert.ok(size.scale < 1);
});
test('图片粘贴只在结果页非文字控件，普通文字不被接管', () => {
    const event = { target: { tagName: 'DIV' }, clipboardData: { items: [{ kind: 'file', getAsFile: () => file() }] } };
    assert.equal(OCR.pastedImages(event, true).length, 1); assert.equal(OCR.pastedImages(event, false).length, 0);
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(OCR.pastedImages({ ...event, target: { tagName } }, true).length, 0);
    assert.deepEqual(OCR.pastedImages({ ...event, clipboardData: { items: [{ kind: 'string' }] } }, true), []);
});
test('真实图片 Worker 源码按请求 ID 回传像素，错误显式返回', () => {
    const posted = [], scope = { SimResultsCore: C, Uint8ClampedArray, importScripts() {}, self: { postMessage: (data, transfer) => posted.push({ data, transfer }) } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'tools/sim-log/result-image-worker.js'), 'utf8'), scope);
    scope.self.onmessage({ data: { id: 7, width: 1, height: 1, mode: 'light', buffer: new Uint8ClampedArray([0, 0, 0, 255]).buffer } });
    assert.equal(posted[0].data.id, 7); assert.equal(posted[0].transfer[0], posted[0].data.buffer);
    scope.self.onmessage({ data: { id: 8, width: 0 } }); assert.equal(posted[1].data.id, 8); assert.ok(posted[1].data.error);
});
test('OCR 初始化/识别取消及迟到消息不污染新任务，Worker 可重建复用', async () => {
    const h = environment(), messages = [], controller = new OCR.Controller(h.win, value => messages.push(value));
    await controller.importFiles([file()]); let p = controller.run({ lang: 'eng', mode: 'auto' }); const rejection = assert.rejects(p, /取消/);
    const old = await advancePixel(h); assert.ok(old); controller.cancel(); await rejection; assert.equal(old.terminated, true);
    p = controller.run({ lang: 'eng', mode: 'auto' }); const owner = await advancePixel(h), count = messages.length;
    old.emit({ id: old.payload.id, error: '旧错误' }); old.emit({ id: old.payload.id, progress: { status: 'recognizing text', progress: 1 } }); assert.equal(messages.length, count);
    owner.emit({ id: owner.payload.id, data: raw }); const result = await p; assert.equal(result.doc.cells[0][0].text, '100');
    p = controller.run({ lang: 'eng', mode: 'auto' }); const reused = await advancePixel(h); assert.equal(reused, owner); reused.emit({ id: reused.payload.id, data: raw }); await p;
});
test('完整任务 120 秒超时，像素 Worker 终止，旧图片与旧错误失效', async () => {
    const h = environment(), controller = new OCR.Controller(h.win); await controller.importFiles([file()]);
    const p = controller.run({ lang: 'eng', mode: 'auto' }), rejected = assert.rejects(p, /120 秒/); const worker = h.workers.at(-1);
    [...h.timers.values()].find(t => t.delay === 120000).fn(); await rejected; assert.equal(worker.terminated, true); assert.equal(controller.job, null);
    let resolve; h.win.createImageBitmap = f => f.name === 'old' ? new Promise(r => { resolve = r; }) : Promise.resolve({ width: 10, height: 10 });
    const old = controller.importFiles([file({ name: 'old' })]); await controller.importFiles([file({ name: 'new' })]); resolve({ width: 10, height: 10, close() {} }); assert.equal(await old, null); assert.equal(controller.image.name, 'new');
});
test('UI 初始无演示表、手工建表、撤销到无表再重做', () => {
    const h = ui(); assert.equal(h.editor.snapshot(), null); assert.equal(h.get('export-controls').disabled, true); create(h); assert.equal(h.editor.snapshot().origin.kind, 'manual');
    h.click('undo'); assert.equal(h.editor.snapshot(), null); assert.equal(h.get('redo').disabled, false); h.click('redo'); assert.equal(h.editor.snapshot().rows.length, 3);
});
test('UI textarea 中文组字不重建节点；Enter/换行/取消/Tab 与容量保护', () => {
    const h = ui(); create(h); const td = h.cell(0, 0); h.tableClick(td); h.key('F2'); const ta = td.children[0]; ta.fire('compositionstart'); ta.value = '工程';
    h.key('Enter', { isComposing: true }); assert.equal(td.children[0], ta); assert.equal(h.editor.snapshot().cells[0][0].text, ''); ta.fire('compositionend');
    h.key('Enter', { shiftKey: true }); assert.equal(td.children[0], ta); ta.value += '\n数值'; h.key('Enter'); assert.equal(h.editor.snapshot().cells[0][0].text, '工程\n数值'); assert.equal(h.cell(0, 0), td);
    h.key('F2'); td.children[0].value = '未提交'; h.key('Escape'); assert.equal(h.editor.snapshot().cells[0][0].text, '工程\n数值');
    h.key('F2'); td.children[0].value = 'a'.repeat(2001); h.key('Tab'); assert.ok(td.children.length); assert.match(h.get('status').textContent, /2,000/); td.children[0].value = '合法'; h.key('Tab'); assert.equal(h.document.activeElement, h.cell(0, 1));
});
test('UI 矩形/整行/整列选择与批量填充一步撤销，重排焦点按 ID 保留', () => {
    const h = ui(); create(h); h.tableClick(h.cell(0, 0)); h.tableClick(h.cell(1, 1), { shiftKey: true }); fill(h, '0'); assert.equal(h.editor.snapshot().cells[1][1].text, '0'); h.click('undo'); assert.equal(h.editor.snapshot().cells[0][0].text, '');
    h.tableClick(h.get('table').children[1].children[2].children[0].children[0]); fill(h, '末行'); h.get('fill').value = '#123456'; h.click('fill-apply'); const selected = h.editor.snapshot().rows[2];
    h.get('row-action').value = 'to'; h.get('row-to').value = '1'; h.click('row-apply'); const d = h.editor.snapshot(); assert.equal(d.rows[0], selected); assert.ok(d.cells[0].every(v => v.text === '末行' && v.fill === '#123456')); assert.equal(h.document.activeElement.dataset.row, selected);
});
test('UI 存档隔离、配额失败仍能编辑导出；恢复不含图片与历史', async () => {
    const h = ui({ stores: { 'ee-sim-log': 'untouched' } }); create(h); fill(h, '00123'); const stored = h.stores.get('ee-sim-log-results'); assert.equal(h.stores.get('ee-sim-log'), 'untouched'); assert.doesNotMatch(stored, /bitmap|undoItems/);
    const restored = ui({ stores: { 'ee-sim-log-results': stored } }); assert.equal(restored.editor.snapshot().cells[0][0].text, '00123'); assert.match(restored.get('save').textContent, /原图未保存/); assert.equal(restored.get('undo').disabled, true);
    const failing = ui({ storageThrows: true }); create(failing); fill(failing, '继续'); failing.click('copy-md'); await settle(); assert.match(failing.get('save').textContent, /未保存/); assert.match(failing.get('status').textContent, /已复制/);
    const corrupt = ui({ stores: { 'ee-sim-log-results': '{', 'ee-sim-log': 'old' } }); assert.equal(corrupt.editor.snapshot(), null); assert.equal(corrupt.stores.get('ee-sim-log-results'), '{'); assert.equal(corrupt.stores.get('ee-sim-log'), 'old');
});
test('UI 重新识别先确认，转换期间锁结果但新图片可替换，失败保留旧表', async () => {
    const h = ui({ confirm: false }); create(h); fill(h, '旧表'); await h.editor.importFiles([file()]); h.click('convert'); assert.equal(h.workers.length, 0);
    h.options.confirm = true; h.click('convert'); assert.equal(h.get('edit-controls').disabled, true); const old = h.editor.snapshot();
    h.workers.at(-1).emit({ id: h.workers.at(-1).payload.id, error: '像素失败' }); await settle(); assert.deepEqual(h.editor.snapshot(), old); assert.equal(h.get('edit-controls').disabled, false);
    h.click('convert'); await h.editor.importFiles([file({ name: '另一张' })]); await settle(); assert.deepEqual(h.editor.snapshot(), old); assert.equal(h.get('convert').disabled, false);
});
test('UI 成功识别与手动分隔复用词框；换图提示来源区别', async () => {
    const h = ui(); await h.editor.importFiles([file()]); h.click('convert'); const engine = await advancePixel(h); engine.emit({ id: engine.payload.id, data: raw }); await settle();
    assert.equal(h.editor.snapshot().origin.kind, 'ocr'); assert.equal(h.editor.snapshot().cells[0][0].text, '100');
    const count = h.workers.length; h.get('grid-x').value = '0, 50, 100'; h.get('grid-y').value = '0, 50, 100'; h.click('grid-apply'); assert.equal(h.editor.snapshot().cols.length, 2); assert.equal(h.workers.length, count);
    await h.editor.importFiles([file({ name: '新输入' })]); assert.match(h.get('origin').textContent, /仍来自上一张图片/); assert.equal(h.editor.snapshot().cells[0][0].text, '100');
});
test('UI 复制捕获同一快照；权限拒绝和 execCommand false 显示可选文本', async () => {
    const h = ui({ copyFails: true, exec: false }); create(h); fill(h, '00123'); h.click('copy-excel'); fill(h, '之后'); await settle();
    const payload = h.writes[0][0].data; assert.match(await payload['text/html'].text(), /00123/); assert.doesNotMatch(await payload['text/plain'].text(), /之后/); assert.equal(h.get('fallback-label').hidden, false); assert.match(h.get('fallback').value, /00123/); assert.match(h.get('status').textContent, /复制失败/);
});
test('UI 本地 ExcelJS 延迟加载不混入后续编辑；加载失败可重试且复制仍可用', async () => {
    const h = ui(); create(h); fill(h, '00123'); h.click('xlsx'); const script = h.document.head.children.at(-1); assert.match(script.src, /lib\/exceljs\/4.4.0/); script.onerror(); await settle();
    assert.match(h.get('status').textContent, /资源加载失败/); h.click('copy-md'); await settle(); assert.match(h.get('status').textContent, /已复制/);
    let captured; h.win.ExcelJS = { Workbook: class extends ExcelJS.Workbook { constructor() { super(); const self = this; Object.defineProperty(this, 'xlsx', { get: () => ({ writeBuffer: async () => { captured = self.worksheets[0].getCell(1, 1).value; return new Uint8Array([80, 75]); } }) }); } } };
    h.click('xlsx'); fill(h, 'later'); await settle(); assert.equal(captured, '00123'); assert.ok(h.document.downloads.includes('仿真结果.xlsx'));
});
test('双主标签 ARIA、键盘切换、独立存档，默认设置页不初始化 OCR 编辑器', () => {
    const h = environment(); let count = 0, active; h.win.SimResultsEditor = { init() { count++; return { setActive(v) { active = v; }, beforeLeave() { return true; } }; } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'tools/sim-log/page.js'), 'utf8'), { window: h.win }); assert.equal(count, 0); assert.equal(h.get('sim-panel-results').hidden, true);
    h.get('sim-tab-settings').fire('keydown', { key: 'ArrowRight' }); assert.equal(count, 1); assert.equal(active, true); assert.equal(h.get('sim-tab-results').getAttribute('aria-selected'), 'true');
    h.get('sim-tab-results').fire('keydown', { key: 'Home' }); assert.equal(active, false); assert.equal(h.get('sim-panel-settings').hidden, false); assert.equal(JSON.parse(h.stores.get('ee-sim-log-ui')).tab, 'settings'); assert.equal(h.workers.length, 0);
});
test('OCR 宿主真实脚本接线：同源路径、显式 blocks、语言变更与任务 ID', async () => {
    const posted = [], configurations = [], engines = [];
    const Tesseract = { async createWorker(lang, oem, options) {
        configurations.push({ lang, oem, options });
        const engine = { async setParameters(p) { assert.equal(p.tessedit_pageseg_mode, '6'); }, async recognize(buffer, opts, output, id) { assert.equal(output.blocks, true); assert.ok(id.startsWith('result-')); return { data: raw }; }, async terminate() { this.terminated = true; } };
        engines.push(engine); return engine;
    } };
    const scope = { URL, Tesseract, self: { Tesseract, location: { href: 'https://example.test/tools/sim-log/result-ocr-worker.js' }, postMessage: value => posted.push(value) }, importScripts() { throw Error('不应重复加载'); } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'tools/sim-log/result-ocr-worker.js'), 'utf8'), scope);
    await scope.self.onmessage({ data: { id: 1, lang: 'eng', buffer: new ArrayBuffer(0) } });
    await scope.self.onmessage({ data: { id: 2, lang: 'chi_sim+eng', buffer: new ArrayBuffer(0) } });
    assert.deepEqual(posted.map(v => v.id), [1, 2]); assert.equal(engines[0].terminated, true);
    for (const config of configurations) { assert.equal(config.oem, 1); for (const key of ['workerPath', 'corePath', 'langPath']) assert.ok(config.options[key].startsWith('https://example.test/lib/ocr/')); assert.equal(config.options.cacheMethod, 'none'); }
});
test('UI 裁剪拖动、重置后来源仍指向原区域；页面挂起恢复不残留图片按钮', async () => {
    const h = ui(); await h.editor.importFiles([file()]); h.get('preview-mode').value = 'crop';
    h.get('preview').fire('pointerdown', { clientX: 20, clientY: 20, pointerId: 1 }); h.get('preview').fire('pointermove', { clientX: 70, clientY: 70 }); h.get('preview').fire('pointerup', { clientX: 70, clientY: 70 });
    assert.deepEqual(h.editor.controller.crop, { x: 20, y: 20, width: 50, height: 50 });
    h.click('convert'); const engine = await advancePixel(h); engine.emit({ id: engine.payload.id, data: raw }); await settle();
    const d = h.editor.snapshot(); h.click('crop-reset'); h.get('source').children[1].fire('click'); assert.deepEqual(h.get('preview').draws.at(-1), [30, 30, 20, 15]); assert.deepEqual(h.editor.snapshot(), d);
    h.events.pagehide[0](); assert.equal(h.editor.controller.image, null); assert.equal(h.get('convert').disabled, true); assert.match(h.get('origin').textContent, /原图未保存/);
});
test('UI 自动结构超过容量时保留词框供校正，已有表不被覆盖', async () => {
    const h = ui(); create(h); fill(h, '保留'); await h.editor.importFiles([file({ width: 1000, height: 3000 })]); h.click('convert');
    const engine = await advancePixel(h), data = C.clone(raw), words = [];
    for (let r = 0; r < 201; r++) words.push({ text: '100', confidence: 90, bbox: { x0: 10, y0: r * 10 + 1, x1: 30, y1: r * 10 + 6 } });
    data.blocks[0].paragraphs[0].lines[0].words = words; engine.emit({ id: engine.payload.id, data }); await settle();
    assert.equal(h.editor.snapshot().cells[0][0].text, '保留'); assert.equal(h.get('grid-controls').disabled, false); assert.match(h.get('status').textContent, /已保留词框/);
});
test('页面语法、ID、本地引用、首页改名搜索与局部主题规则', () => {
    for (const name of ['page.js', 'result-core.js', 'result-ocr.js', 'result-editor.js', 'result-image-worker.js', 'result-ocr-worker.js']) new vm.Script(fs.readFileSync(path.join(root, 'tools/sim-log', name), 'utf8'));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]); assert.equal(ids.length, new Set(ids).size);
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"#?]+)"/g)) if (!m[1].includes(':')) assert.ok(fs.existsSync(path.resolve(root, 'tools/sim-log', m[1])), m[1]);
    const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); assert.match(home, /<div class="card-title">仿真结果收集<\/div>/); assert.match(home, /图片 截图 表格 ocr excel xlsx/); assert.equal((home.match(/href="tools\/sim-log\/index.html"/g) || []).length, 1);
    const css = fs.readFileSync(path.join(root, 'tools/sim-log/style.css'), 'utf8'); assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i); assert.match(css, /\[hidden\]/); assert.match(css, /max-width: 440px/);
});

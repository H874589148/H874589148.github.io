/* 结果表编辑界面：纯文本编辑、稳定选区、独立存档与快照导出。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./result-core'), require('./result-ocr'));
    else root.SimResultsEditor = factory(root.SimResultsCore, root.SimResultsOCR);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (C, OCR) {
    'use strict';
    async function clipboard(win, html, plain) {
        try {
            if (html && win.ClipboardItem && win.navigator.clipboard && win.navigator.clipboard.write) {
                await win.navigator.clipboard.write([new win.ClipboardItem({ 'text/html': new win.Blob([html], { type: 'text/html' }), 'text/plain': new win.Blob([plain], { type: 'text/plain' }) })]); return true;
            }
            if (!html && win.navigator.clipboard && win.navigator.clipboard.writeText) { await win.navigator.clipboard.writeText(plain); return true; }
        } catch (_) { /* 继续尝试可验证返回值的本地兜底。 */ }
        var doc = win.document, focused = doc.activeElement, ta = doc.createElement('textarea'), selection = win.getSelection(), saved = [];
        for (var i = 0; selection && i < selection.rangeCount; i++) saved.push(selection.getRangeAt(i).cloneRange());
        function onCopy(e) { if (e.clipboardData) { if (html) e.clipboardData.setData('text/html', html); e.clipboardData.setData('text/plain', plain); e.preventDefault(); } }
        try {
            ta.value = plain; ta.style.cssText = 'position:fixed;left:-9999px;top:0'; doc.body.appendChild(ta); ta.select(); doc.addEventListener('copy', onCopy);
            return doc.execCommand('copy') === true;
        } catch (_) { return false; }
        finally {
            doc.removeEventListener('copy', onCopy); ta.remove();
            if (selection) { selection.removeAllRanges(); saved.forEach(function (r) { selection.addRange(r); }); }
            if (focused && focused.focus) focused.focus();
        }
    }
    function init(win) {
        var document = win.document, $ = function (id) { return document.getElementById('sr-' + id); };
        var panel = document.getElementById('sim-panel-results'), doc = null, selection = null, history = new C.History();
        var active = false, busy = false, editing = null, composing = false, nodes = new Map(), schema = '', request = 0, highlight = null, gridPreview = null, cropDraft = null, restoring = false;
        var ocr = new OCR.Controller(win, function (state) { status(state.message); });
        function status(message, error) { $('status').textContent = message; $('status').classList.toggle('sr-error', !!error); }
        function key(r, c) { return r + '/' + c; }
        function firstSelection() { return { row: doc.rows[0], col: doc.cols[0], mode: 'cell' }; }
        function repairSelection() {
            if (!doc) { selection = null; return; }
            if (!selection || !doc.rows.includes(selection.row) || !doc.cols.includes(selection.col)) selection = firstSelection();
            if (!doc.rows.includes(selection.endRow)) delete selection.endRow;
            if (!doc.cols.includes(selection.endCol)) delete selection.endCol;
        }
        function save() {
            if (!doc || restoring) return;
            try { win.localStorage.setItem('ee-sim-log-results', JSON.stringify(C.validate(doc))); $('save').textContent = '表格已保存在本机；原图与撤销历史不保存。'; }
            catch (_) { $('save').textContent = '未保存：本机存储不可用或配额不足。编辑和导出仍可使用。'; }
        }
        function origins() {
            if (!doc) { $('origin').textContent = '尚无结果表。'; return; }
            var text = doc.origin.kind === 'manual' ? '手工输入表（非 OCR 识别结果）。' : '当前表来源：' + doc.origin.name + '。识别草稿，请核对工程数值。';
            if (doc.origin.kind === 'ocr' && (!ocr.image || ocr.image.id !== doc.origin.imageId)) text += ocr.image ? ' 当前表仍来自上一张图片。' : ' 原图未保存，请重新导入后重新识别。';
            $('origin').textContent = text;
        }
        function controls() {
            $('edit-controls').disabled = busy || !doc; $('export-controls').disabled = busy || !doc; $('manual-controls').disabled = busy;
            $('crop-controls').disabled = busy || !ocr.image; $('grid-controls').disabled = busy || !ocr.recognition;
            $('convert').disabled = busy || !ocr.image; $('cancel').disabled = !busy;
            $('crop-reset').disabled = busy || !ocr.image; $('preview-mode').disabled = busy; $('mode').disabled = busy; $('lang').disabled = busy;
            $('undo').disabled = busy || !history.undoItems.length; $('redo').disabled = busy || !history.redoItems.length;
            $('table').setAttribute('aria-busy', String(busy));
            if (doc) $('header').checked = doc.header;
            origins();
        }
        function selectedCell() {
            if (!doc || !selection) return null;
            return doc.cells[doc.rows.indexOf(selection.endRow || selection.row)][doc.cols.indexOf(selection.endCol || selection.col)];
        }
        function showSource() {
            var host = $('source'); host.replaceChildren(); var v = selectedCell();
            if (!v) return;
            var text = v.confidence === null ? '手工单元格。' : '引擎置信分数：' + v.confidence.toFixed(1) + '（不是正确率）。' + (v.reviewed ? '已人工核对。' : '待人工核对。');
            host.appendChild(document.createTextNode(text));
            if (v.source) {
                var button = document.createElement('button'); button.className = 'btn'; button.type = 'button'; button.textContent = '定位原图来源';
                button.disabled = !ocr.image || ocr.image.id !== v.source.imageId;
                button.addEventListener('click', function () { highlight = { boxes: v.source.boxes, origin: doc.origin }; draw(); $('preview').scrollIntoView({ block: 'nearest' }); }); host.appendChild(button);
            }
        }
        function renderSelection(focus) {
            repairSelection(); if (!doc) return;
            var range = C.range(doc, selection), focusRow = selection.endRow || selection.row, focusCol = selection.endCol || selection.col;
            doc.rows.forEach(function (r, ri) { doc.cols.forEach(function (c, ci) {
                var td = nodes.get(key(r, c)), selected = ri >= range.r0 && ri <= range.r1 && ci >= range.c0 && ci <= range.c1;
                if (td.getAttribute('aria-selected') !== String(selected)) td.setAttribute('aria-selected', String(selected));
                var tabIndex = r === focusRow && c === focusCol ? 0 : -1;
                if (td.tabIndex !== tabIndex) td.tabIndex = tabIndex;
            }); });
            $('selection').textContent = '选区：第 ' + (range.r0 + 1) + '–' + (range.r1 + 1) + ' 行，第 ' + (range.c0 + 1) + '–' + (range.c1 + 1) + ' 列。';
            showSource();
            if (focus && !editing) nodes.get(key(focusRow, focusCol)).focus();
        }
        function paint(td, value, ri) {
            if (!editing || editing.td !== td) { if (td.textContent !== value.text) td.textContent = value.text; }
            var signature = JSON.stringify([value.fill, value.confidence, value.reviewed, value.source && value.source.ambiguous, doc.header && ri === 0]);
            if (td._styleSignature === signature) return;
            td._styleSignature = signature;
            td.style.backgroundColor = value.fill; td.style.color = C.foreground(value.fill);
            td.classList.toggle('sr-unchecked', !value.reviewed && (value.confidence < 80 || value.source && value.source.ambiguous));
            td.classList.toggle('sr-header', doc.header && ri === 0);
            td.title = value.confidence === null ? '手工输入' : '置信分数 ' + value.confidence.toFixed(1) + '；' + (value.reviewed ? '已核对' : '待核对');
        }
        function render(focus) {
            if (!doc) { $('table').replaceChildren(); nodes.clear(); schema = ''; controls(); return; }
            repairSelection();
            var nextSchema = JSON.stringify([doc.rows, doc.cols]);
            if (schema !== nextSchema) {
                nodes.clear(); $('table').replaceChildren(); schema = nextSchema;
                var head = document.createElement('thead'), hr = document.createElement('tr'); hr.appendChild(document.createElement('th'));
                doc.cols.forEach(function (c, ci) {
                    var th = document.createElement('th'), b = document.createElement('button'); b.type = 'button'; b.textContent = String(ci + 1); b.dataset.colHeader = c; b.setAttribute('aria-label', '选择第 ' + (ci + 1) + ' 列'); th.appendChild(b); hr.appendChild(th);
                }); head.appendChild(hr); $('table').appendChild(head);
                var body = document.createElement('tbody');
                doc.rows.forEach(function (r, ri) {
                    var tr = document.createElement('tr'), th = document.createElement('th'), b = document.createElement('button'); b.type = 'button'; b.textContent = String(ri + 1); b.dataset.rowHeader = r; b.setAttribute('aria-label', '选择第 ' + (ri + 1) + ' 行'); th.appendChild(b); tr.appendChild(th);
                    doc.cols.forEach(function (c) { var td = document.createElement('td'); td.dataset.row = r; td.dataset.col = c; td.setAttribute('role', 'gridcell'); td.tabIndex = -1; nodes.set(key(r, c), td); tr.appendChild(td); }); body.appendChild(tr);
                }); $('table').appendChild(body);
            }
            doc.rows.forEach(function (r, ri) { doc.cols.forEach(function (c, ci) { paint(nodes.get(key(r, c)), doc.cells[ri][ci], ri); }); });
            renderSelection(focus); controls();
        }
        function change(cmd, focus) {
            if (busy || !doc) return false;
            var next = C.apply(doc, cmd);
            if (JSON.stringify(next) !== JSON.stringify(doc)) { history.push(doc, selection); doc = next; save(); }
            render(focus); return true;
        }
        function commit() {
            if (!editing) return true;
            if (composing) { status('请先完成中文输入法组字。', true); return false; }
            var current = editing;
            try {
                var next = C.apply(doc, { type: 'text', selection: { row: current.row, col: current.col, mode: 'cell' }, text: current.ta.value });
                editing = null; current.ta.remove();
                if (JSON.stringify(next) !== JSON.stringify(doc)) { history.push(doc, selection); doc = next; save(); }
                render(false); return true;
            } catch (err) { status(err.message, true); current.ta.focus(); return false; }
        }
        function startEdit(seed) {
            if (busy || !doc || editing) return;
            var row = selection.endRow || selection.row, col = selection.endCol || selection.col;
            selection = { row: row, col: col, mode: 'cell' }; renderSelection(false);
            var td = nodes.get(key(row, col)), ta = document.createElement('textarea'); ta.value = seed === undefined ? selectedCell().text : seed;
            ta.setAttribute('aria-label', '编辑单元格文字'); td.replaceChildren(ta); editing = { row: row, col: col, td: td, ta: ta };
            ta.addEventListener('compositionstart', function () { composing = true; }); ta.addEventListener('compositionend', function () { composing = false; });
            ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
        }
        function cancelEdit() { if (!editing) return; var td = editing.td; editing = null; composing = false; td.replaceChildren(); render(true); }
        function moveFocus(dr, dc, extend) {
            var r = doc.rows.indexOf(selection.endRow || selection.row), c = doc.cols.indexOf(selection.endCol || selection.col);
            if (dc && !dr) { c += dc; if (c >= doc.cols.length) { c = 0; r++; } if (c < 0) { c = doc.cols.length - 1; r--; } } else r += dr;
            r = Math.max(0, Math.min(doc.rows.length - 1, r)); c = Math.max(0, Math.min(doc.cols.length - 1, c));
            if (extend) { selection.endRow = doc.rows[r]; selection.endCol = doc.cols[c]; selection.mode = 'cell'; }
            else selection = { row: doc.rows[r], col: doc.cols[c], mode: 'cell' };
            renderSelection(true);
        }
        function replace(next) { history.push(doc, selection); doc = C.validate(next); selection = firstSelection(); highlight = null; save(); render(false); }
        function confirmReplace() { return !C.nonempty(doc) || win.confirm('新结果将替换已有文字或底色，确认继续？可通过撤销恢复。'); }
        function action(fn) { return function () { if (busy || !commit()) return; try { var result = fn(); if (result && result.catch) result.catch(function (err) { status(err.message, true); }); } catch (err) { status(err.message, true); controls(); } }; }
        function bind(id, fn) { $(id).addEventListener('click', action(fn)); }
        function axisAction(axis) {
            var value = $(axis + '-action').value, ids = axis === 'row' ? doc.rows : doc.cols, selected = axis === 'row' ? selection.endRow || selection.row : selection.endCol || selection.col, at = ids.indexOf(selected);
            var cmd = { axis: axis, id: selected, selection: selection };
            if (value === 'before' || value === 'after') { cmd.type = 'insert'; cmd.after = value === 'after'; }
            else if (value === 'delete') cmd.type = 'delete';
            else { cmd.type = 'move'; cmd.to = value === 'to' ? Number($(axis + '-to').value) - 1 : at + (value === 'up' ? -1 : 1); }
            change(cmd, true);
        }
        function draw() {
            var canvas = $('preview'), ctx = canvas.getContext('2d'), image = ocr.image;
            if (!image) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
            var ratio = Math.min(1, 1000 / image.width, 900 / image.height); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
            ctx.drawImage(image.bitmap, 0, 0, canvas.width, canvas.height);
            var colors = win.getComputedStyle(panel), crop = cropDraft || ocr.crop;
            ctx.lineWidth = 2; ctx.strokeStyle = colors.getPropertyValue('--color-primary').trim();
            ctx.strokeRect(crop.x * ratio, crop.y * ratio, crop.width * ratio, crop.height * ratio);
            function transform(origin) { return { x: origin.crop ? origin.crop.x : 0, y: origin.crop ? origin.crop.y : 0, sx: origin.crop ? origin.crop.width / origin.width : 1, sy: origin.crop ? origin.crop.height / origin.height : 1 }; }
            function box(b, origin) { var t = transform(origin); ctx.strokeRect((t.x + b.x0 * t.sx) * ratio, (t.y + b.y0 * t.sy) * ratio, (b.x1 - b.x0) * t.sx * ratio, (b.y1 - b.y0) * t.sy * ratio); }
            var rec = ocr.recognition;
            if (rec && rec.imageId === image.id) {
                ctx.lineWidth = 1; ctx.strokeStyle = colors.getPropertyValue('--color-text-muted').trim(); rec.words.forEach(function (w) { box(w, rec); });
                var grid = gridPreview || rec.grid, t = transform(rec); ctx.strokeStyle = colors.getPropertyValue('--color-primary').trim();
                grid.xs.forEach(function (x) { ctx.beginPath(); ctx.moveTo((t.x + x * t.sx) * ratio, t.y * ratio); ctx.lineTo((t.x + x * t.sx) * ratio, (t.y + rec.crop.height) * ratio); ctx.stroke(); });
                grid.ys.forEach(function (y) { ctx.beginPath(); ctx.moveTo(t.x * ratio, (t.y + y * t.sy) * ratio); ctx.lineTo((t.x + rec.crop.width) * ratio, (t.y + y * t.sy) * ratio); ctx.stroke(); });
            }
            if (highlight && highlight.origin.imageId === image.id) { ctx.lineWidth = 3; ctx.strokeStyle = colors.getPropertyValue('--color-accent').trim(); highlight.boxes.forEach(function (b) { box(b, highlight.origin); }); }
        }
        function imageInfo() {
            if (!ocr.image) { $('image-info').textContent = ''; return; }
            var image = ocr.image, crop = ocr.crop, size = OCR.workSize(crop);
            $('image-info').textContent = image.name + ' · 原图 ' + image.width + '×' + image.height + ' · 工作图 ' + size.width + '×' + size.height + ' · 缩放 ' + (size.scale * 100).toFixed(1) + '%（缩小可能降低识别精度）';
            ['x', 'y', 'width', 'height'].forEach(function (k) { $('crop-' + k).value = String(crop[k]); });
        }
        function clearRecognition() { highlight = null; gridPreview = null; cropDraft = null; drag = null; $('issues').replaceChildren(); $('issue-count').textContent = ''; $('grid-x').value = ''; $('grid-y').value = ''; }
        async function importFiles(files) {
            var token = ++request; busy = false;
            try {
                var pending = ocr.importFiles(files); clearRecognition(); draw(); imageInfo(); controls(); status('正在解码图片…');
                var image = await pending; if (request !== token || !image) return;
                imageInfo(); draw(); controls();
            } catch (err) { if (token === request) { clearRecognition(); imageInfo(); draw(); controls(); status('导入失败：' + err.message, true); } }
        }
        function showIssues(issues, rec) {
            $('issues').replaceChildren(); $('issue-count').textContent = String(issues.length + rec.rejected.length);
            issues.forEach(function (issue) {
                var b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = issue.reason + '：' + issue.word.text + '（' + issue.word.confidence.toFixed(1) + '）';
                b.addEventListener('click', function () { highlight = { boxes: [issue.word], origin: rec.origin }; draw(); }); $('issues').appendChild(b);
            });
            rec.rejected.forEach(function (text) { var p = document.createElement('p'); p.textContent = '无有效坐标，未归属：' + text; $('issues').appendChild(p); });
        }
        async function convert() {
            if (!confirmReplace()) return;
            var token = ++request; busy = true; controls();
            try {
                var result = await ocr.run({ mode: $('mode').value, lang: $('lang').value }); if (request !== token) return;
                busy = false; replace(result.doc); gridPreview = null;
                $('grid-x').value = result.recognition.grid.xs.join(', '); $('grid-y').value = result.recognition.grid.ys.join(', ');
                showIssues(result.issues, result.recognition); draw(); status('结果待校对：' + doc.rows.length + ' 行 × ' + doc.cols.length + ' 列。识别草稿，请逐项核对工程数值。');
            } catch (err) {
                if (request === token) {
                    var rec = ocr.recognition;
                    if (rec) { $('grid-x').value = rec.grid.xs.join(', '); $('grid-y').value = rec.grid.ys.join(', '); gridPreview = null; draw(); }
                    status('转换失败或已取消：' + err.message + (rec ? ' 已保留词框，可调整分隔线后重新组表。' : ''), true);
                }
            }
            finally { if (request === token) { busy = false; controls(); } }
        }
        function cropApply(value) { ocr.setCrop(value); clearRecognition(); imageInfo(); controls(); draw(); status('裁剪已更新；原表未改动，点击转换可生成新结果。'); }
        function readGrid() {
            var rec = ocr.recognition;
            function parse(value, limit) {
                var tokens = value.split(/[,，;；\s]+/).filter(Boolean);
                if (!tokens.length || tokens.some(function (x) { return !/^\d+(?:\.\d+)?$/.test(x); })) throw new Error('分隔线请输入逗号分隔的非负坐标。');
                return C.boundaries(tokens.map(Number), limit);
            }
            return { xs: parse($('grid-x').value, rec.width), ys: parse($('grid-y').value, rec.height), kind: 'manual' };
        }
        function undo(redo) {
            var next = history.step(redo, doc, selection); if (!next) return;
            doc = next.doc; selection = next.selection; if (doc) save(); else { try { win.localStorage.setItem('ee-sim-log-results', ''); } catch (_) { $('save').textContent = '未保存：本机存储不可用。'; } }
            render(true); status(redo ? '已重做。' : '已撤销。');
        }
        async function exportTable(kind) {
            var snapshot = C.clone(C.validate(doc)); $('fallback-label').hidden = true;
            if (kind === 'xlsx') {
                $('xlsx').disabled = true;
                try {
                    var ExcelJS = await OCR.loadScript(win, '../../lib/exceljs/4.4.0/exceljs.min.js', 'ExcelJS');
                    var buffer = await C.workbook(snapshot, ExcelJS).xlsx.writeBuffer();
                    var url = win.URL.createObjectURL(new win.Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), a = document.createElement('a');
                    a.href = url; a.download = '仿真结果.xlsx'; document.body.appendChild(a); a.click(); a.remove(); win.setTimeout(function () { win.URL.revokeObjectURL(url); }, 1000); status('已生成真实 .xlsx 下载，全部单元格按文本保存。');
                } finally { $('xlsx').disabled = false; }
            } else {
                var plain = kind === 'excel' ? C.tsv(snapshot) : kind === 'md' ? C.markdown(snapshot) : C.latex(snapshot);
                var ok = await clipboard(win, kind === 'excel' ? C.html(snapshot) : '', plain);
                if (ok) status('已复制' + (kind === 'excel' ? ' Excel 格式；目标软件的格式保留行为需自行核对。' : '。'));
                else { $('fallback-label').hidden = false; $('fallback').value = plain; $('fallback').focus(); $('fallback').select(); status('复制失败，已提供可手工选取的导出文本。', true); }
            }
        }
        $('table').addEventListener('click', function (event) {
            if (busy || event.target.tagName === 'TEXTAREA' || !commit()) return;
            var target = event.target.closest('[data-row], [data-row-header], [data-col-header]'); if (!target) return;
            var r = target.dataset.row || target.dataset.rowHeader || doc.rows[0], c = target.dataset.col || target.dataset.colHeader || doc.cols[0];
            var mode = target.dataset.rowHeader ? 'row' : target.dataset.colHeader ? 'col' : 'cell';
            if (event.shiftKey && selection && selection.mode === mode) { selection.endRow = r; selection.endCol = c; }
            else selection = { row: r, col: c, mode: mode };
            renderSelection(true);
        });
        $('table').addEventListener('dblclick', function (event) { if (event.target.closest('td') && !editing) startEdit(); });
        $('table').addEventListener('keydown', function (event) {
            if (busy || !doc || event.target.tagName === 'BUTTON') return;
            if (event.isComposing || composing) return;
            if (editing) {
                if (event.key === 'Escape') { event.preventDefault(); cancelEdit(); }
                else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (commit()) renderSelection(true); }
                else if (event.key === 'Tab') { event.preventDefault(); if (commit()) moveFocus(0, event.shiftKey ? -1 : 1, false); }
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(event.shiftKey); return; }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); undo(true); return; }
            if (event.key === 'F2' || event.key === 'Enter') { event.preventDefault(); startEdit(); }
            else if (event.key === 'Tab') { event.preventDefault(); moveFocus(0, event.shiftKey ? -1 : 1, false); }
            else if (event.key.startsWith('Arrow')) { event.preventDefault(); moveFocus(event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0, event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0, event.shiftKey); }
            else if (event.keyCode === 229 || event.key === 'Process') startEdit('');
            else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); startEdit(event.key); }
        });
        $('file').addEventListener('change', function () { var files = Array.from($('file').files || []); $('file').value = ''; if (files.length && commit()) importFiles(files); });
        document.addEventListener('paste', function (event) { var files = OCR.pastedImages(event, active); if (files.length && commit()) { event.preventDefault(); importFiles(files); } });
        bind('convert', convert);
        $('cancel').addEventListener('click', function () { ++request; ocr.cancel(); busy = false; controls(); status('已取消转换，原表保持不变。'); });
        bind('create', function () { var next = C.create(Number($('rows').value), Number($('cols').value)); if (confirmReplace()) { replace(next); status('可编辑：已创建手工输入空表，非 OCR 识别结果。'); } });
        bind('crop-reset', function () { cropApply({ x: 0, y: 0, width: ocr.image.width, height: ocr.image.height }); });
        bind('crop-apply', function () { var value = {}; ['x', 'y', 'width', 'height'].forEach(function (k) { value[k] = Number($('crop-' + k).value); }); cropApply(value); });
        bind('grid-preview', function () { gridPreview = readGrid(); draw(); status('分隔线预览已更新，尚未替换表格。'); });
        bind('grid-apply', function () { var rec = ocr.recognition, grid = readGrid(), next = C.reconstruct(rec.words, grid, rec.width, rec.height, rec.origin); if (!confirmReplace()) return; rec.grid = grid; gridPreview = null; replace(next.doc); showIssues(next.issues, rec); draw(); status('已复用词框重新组表，请核对。'); });
        bind('row-apply', function () { axisAction('row'); }); bind('col-apply', function () { axisAction('col'); });
        bind('undo', function () { undo(false); }); bind('redo', function () { undo(true); });
        $('header').addEventListener('change', action(function () { change({ type: 'header', value: $('header').checked }); }));
        $('palette').addEventListener('change', function () { $('fill').value = $('palette').value; });
        bind('fill-apply', function () { change({ type: 'fill', selection: selection, fill: $('fill').value }); }); bind('fill-clear', function () { change({ type: 'fill', selection: selection, fill: '' }); });
        bind('text-apply', function () { change({ type: 'text', selection: selection, text: $('fill-text').value, onlyEmpty: $('fill-mode').value === 'empty' }); });
        bind('text-clear', function () { change({ type: 'clear', selection: selection }); }); bind('reviewed', function () { change({ type: 'review', selection: selection }); });
        bind('copy-excel', function () { return exportTable('excel'); }); bind('copy-md', function () { return exportTable('md'); }); bind('copy-tex', function () { return exportTable('tex'); }); bind('xlsx', function () { return exportTable('xlsx'); });
        var drag = null;
        function point(event) { var rect = $('preview').getBoundingClientRect(); return { x: Math.max(0, Math.min(ocr.image.width, (event.clientX - rect.left) / rect.width * ocr.image.width)), y: Math.max(0, Math.min(ocr.image.height, (event.clientY - rect.top) / rect.height * ocr.image.height)) }; }
        $('preview').addEventListener('pointerdown', function (event) { if (busy || !ocr.image || $('preview-mode').value !== 'crop' || !commit()) return; drag = point(event); $('preview').setPointerCapture(event.pointerId); });
        $('preview').addEventListener('pointermove', function (event) {
            if (!drag || !ocr.image) return; var end = point(event);
            cropDraft = { x: Math.min(drag.x, end.x), y: Math.min(drag.y, end.y), width: Math.abs(drag.x - end.x), height: Math.abs(drag.y - end.y) }; draw();
        });
        $('preview').addEventListener('pointerup', function (event) {
            if (!drag || !ocr.image) return; var end = point(event), start = drag; drag = null; cropDraft = null;
            try { cropApply({ x: Math.floor(Math.min(start.x, end.x)), y: Math.floor(Math.min(start.y, end.y)), width: Math.floor(Math.abs(start.x - end.x)), height: Math.floor(Math.abs(start.y - end.y)) }); } catch (err) { status(err.message, true); draw(); }
        });
        $('preview').addEventListener('pointercancel', function () { drag = null; cropDraft = null; draw(); });
        if (win.MutationObserver) new win.MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        win.addEventListener('pagehide', function () { ++request; ocr.dispose(); busy = false; clearRecognition(); imageInfo(); controls(); draw(); });
        try {
            var raw = win.localStorage.getItem('ee-sim-log-results');
            if (raw) { restoring = true; doc = C.parse(raw); selection = firstSelection(); $('save').textContent = '已恢复表格；原图未保存，请重新导入后重新识别。'; }
        } catch (err) { $('save').textContent = '结果存档无法恢复，未覆盖原记录：' + err.message; }
        restoring = false; render(false);
        return { setActive: function (value) { active = value; if (value) draw(); }, beforeLeave: commit,
            snapshot: function () { return doc ? C.clone(doc) : null; }, controller: ocr, importFiles: importFiles };
    }
    return { init: init, clipboard: clipboard };
}));

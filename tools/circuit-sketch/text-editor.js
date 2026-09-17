/* 画布富文本编辑会话：草稿、选区、输入法及会话历史与工程隔离。 */
window.CircuitTextEditor = (function () {
'use strict';
var R = window.Razavi;
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function atoms(model) {
    var out = [];
    model.lines.forEach(function (line, i) {
        if (i) out.push(Object.assign({ text: '\n' }, R.runStyle(line.runs[0] || {}, 13)));
        line.runs.forEach(function (run) {
            for (var j = 0; j < run.text.length; j++) out.push(Object.assign({}, run, { text: run.text[j] }));
        });
    });
    return out;
}
function fromAtoms(list, align, pending) {
    var lines = [{ runs: [] }];
    list.forEach(function (a) {
        if (a.text === '\n') { lines.push({ runs: [] }); return; }
        var runs = lines[lines.length - 1].runs, prev = runs[runs.length - 1];
        if (prev && R.sameStyle(prev, a)) prev.text += a.text;
        else runs.push(Object.assign({}, a));
    });
    lines.forEach(function (line) { if (!line.runs.length) line.runs.push(Object.assign({ text: '' }, pending)); });
    return R.normalizeRichText({ version: 1, align: align, lines: lines }, '', 13, align);
}
function create(options) {
    var host = options.host, box = options.box, bar = options.bar, hint = options.hint;
    var sizeInput = bar.querySelector('[data-size]');
    var session = null, composing = false, compositionEnd = 0, history = [], future = [];
    var selection = { start: 0, end: 0, backward: false }, pending = R.runStyle({}, 13), explicitStyle = false;
    var painting = false, compositionTimer = 0, baselineCache = new Map();
    function active() { return !!session; }
    function notify() { hint.textContent = 'Enter 确认，Esc 取消；Alt+Enter 换行'; }
    function modelItem() { return Object.assign({}, session.item, { richText: session.model, text: R.richPlain(session.model) }); }
    function snapshot() { return { model: clone(session.model), selection: clone(selection), pending: clone(pending), explicitStyle: explicitStyle }; }
    function record() {
        history.push(snapshot());
        if (history.length > 100) history.shift();
        future = [];
    }
    /* DOM 仅是输入表面；解析只接收白名单样式，不保存 HTML。 */
    function readSurface() {
        var list = [], offsets = new WeakMap();
        function walk(node, style) {
            if (node.nodeType === 3) {
                var start = list.length;
                offsets.set(node, start);
                for (var i = 0; i < node.data.length; i++) list.push(Object.assign({ text: node.data[i] }, style));
                return;
            }
            if (node.nodeType !== 1) return;
            if (node.dataset.format) {
                try { style = R.runStyle(JSON.parse(node.dataset.format), pending.size); } catch (err) { /* 忽略非法格式。 */ }
            }
            if (node.tagName === 'BR') {
                offsets.set(node, [list.length]);
                if (node.nextSibling) list.push(Object.assign({ text: '\n' }, style));
                return;
            }
            var points = [list.length];
            Array.prototype.forEach.call(node.childNodes, function (child, index) {
                if (index && child.nodeType === 1 && /^(DIV|P)$/.test(child.tagName)) {
                    list.push(Object.assign({ text: '\n' }, style));
                    points[index] = list.length;
                }
                walk(child, style);
                points.push(list.length);
            });
            offsets.set(node, points);
        }
        walk(box, pending);
        function offset(node, index) {
            var entry = offsets.get(node);
            return typeof entry === 'number' ? entry + index : (entry ? entry[Math.min(index, entry.length - 1)] : null);
        }
        var s = window.getSelection(), range = null;
        if (s && s.rangeCount && box.contains(s.anchorNode) && box.contains(s.focusNode)) {
            var a = offset(s.anchorNode, s.anchorOffset), b = offset(s.focusNode, s.focusOffset);
            if (a != null && b != null) range = { start: Math.min(a, b), end: Math.max(a, b), backward: a > b };
        }
        return { list: list, range: range };
    }
    function rememberSelection() {
        if (!session || painting || composing) return;
        var state = readSurface();
        if (!state.range) return;
        var changed = selection.start !== state.range.start || selection.end !== state.range.end;
        selection = state.range;
        if (changed) explicitStyle = false;
        if (!explicitStyle) {
            var list = atoms(session.model), a = list[Math.max(0, selection.start - (selection.start === selection.end ? 1 : 0))];
            if (a) pending = R.runStyle(a, 13);
        }
        updateToolbar();
    }
    function restoreSelection(focus) {
        if (!session) return;
        if (focus !== false) box.focus({ preventScroll: true });
        var positions = [], total = 0;
        Array.prototype.forEach.call(box.children, function (line, index) {
            if (index) total++;
            var walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT), node, found = false;
            while ((node = walker.nextNode())) {
                found = true;
                positions.push({ node: node, start: total, end: total + node.data.length });
                total += node.data.length;
            }
            if (!found) positions.push({ node: line, start: total, end: total });
        });
        function point(n) {
            n = Math.min(total, Math.max(0, n));
            for (var i = 0; i < positions.length; i++) {
                if (n <= positions[i].end) return { node: positions[i].node, offset: Math.max(0, n - positions[i].start) };
            }
            return { node: box, offset: box.childNodes.length };
        }
        var a = point(selection.start), b = point(selection.end), s = window.getSelection();
        var range = document.createRange();
        range.setStart(a.node, a.offset); range.setEnd(b.node, b.offset);
        s.removeAllRanges(); s.addRange(range);
        if (selection.backward && s.setBaseAndExtent) s.setBaseAndExtent(b.node, b.offset, a.node, a.offset);
        if (selection.start === selection.end && focus !== false) {
            var rects = range.getClientRects(), caret = rects.length && rects[rects.length - 1];
            if (caret) {
                var view = box.getBoundingClientRect(), scale = options.project(0, 0).scale;
                if (caret.right > view.right - 4) box.scrollLeft += (caret.right - view.right + 4) / scale;
                if (caret.left < view.left + 4) box.scrollLeft -= (view.left + 4 - caret.left) / scale;
                if (caret.bottom > view.bottom - 4) box.scrollTop += (caret.bottom - view.bottom + 4) / scale;
                if (caret.top < view.top + 4) box.scrollTop -= (view.top + 4 - caret.top) / scale;
            }
        }
    }
    function updateToolbar() {
        if (!session) return;
        var selected = atoms(session.model).slice(selection.start, selection.end).filter(function (a) { return a.text !== '\n'; });
        if (!selected.length) selected = [pending];
        bar.querySelectorAll('[data-format]').forEach(function (button) {
            var key = button.dataset.format;
            var values = selected.map(function (a) { return key === 'super' || key === 'sub' ? a.script === key : a[key]; });
            var all = values.every(Boolean), some = values.some(Boolean);
            button.setAttribute('aria-pressed', all ? 'true' : (some ? 'mixed' : 'false'));
        });
        bar.querySelectorAll('[data-align]').forEach(function (button) {
            button.setAttribute('aria-pressed', String(session.model.align === button.dataset.align));
        });
        if (document.activeElement !== sizeInput) {
            var mixed = selected.some(function (a) { return a.size !== selected[0].size; });
            sizeInput.value = mixed ? '' : selected[0].size;
            sizeInput.placeholder = mixed ? '混合' : '13';
        }
    }
    function reposition() {
        if (!session) return;
        var layout = R.textLayout(modelItem()), projected = options.project(layout.anchor.x, layout.anchor.y);
        var scale = projected.scale, width = Math.max(48, layout.bounds.x1 - layout.bounds.x0 + 12);
        var height = Math.max(24, layout.bounds.y1 - layout.bounds.y0 + 12);
        var vw = host.clientWidth, vh = host.clientHeight;
        var left = projected.x + (layout.bounds.x0 - 6) * scale;
        var top = projected.y + (layout.bounds.y0 - 6) * scale;
        box.style.transform = 'scale(' + scale + ')';
        box.style.left = Math.max(0, Math.min(vw - Math.min(width * scale, vw), left)) + 'px';
        box.style.top = Math.max(0, Math.min(vh - Math.min(height * scale, vh), top)) + 'px';
        box.style.width = width + 'px';
        box.style.maxWidth = Math.max(1, vw / scale) + 'px';
        box.style.maxHeight = Math.max(1, (vh - 8) / scale) + 'px';
        box.style.textAlign = 'left';
        var r = box.getBoundingClientRect(), h = host.getBoundingClientRect();
        bar.style.maxWidth = Math.max(1, vw - 12) + 'px';
        bar.style.maxHeight = Math.max(1, vh - 12) + 'px';
        var bh = bar.offsetHeight, bw = bar.offsetWidth;
        var by = r.top - h.top - bh - 8;
        if (by < 6) by = r.bottom - h.top + 8;
        bar.style.left = Math.max(6, Math.min(vw - bw - 6, r.left - h.left)) + 'px';
        bar.style.top = Math.max(6, Math.min(vh - bh - 6, by)) + 'px';
    }
    function styleSpan(span, r, font) {
        span.dataset.format = JSON.stringify(R.runStyle(r, 13));
        span.style.fontFamily = font;
        span.style.fontSize = (r.size * (r.script === 'normal' ? 1 : 0.7)) + 'px';
        span.style.fontWeight = r.bold ? '700' : '400';
        span.style.fontStyle = r.italic ? 'italic' : 'normal';
    }
    /* 用零高基线标记测量 HTML 字体基线，避免浏览器行框与 SVG baseline 偏移。 */
    function htmlBaseline(r, font) {
        var key = JSON.stringify([r.size, r.script, r.bold, r.italic, font]);
        if (baselineCache.has(key)) return baselineCache.get(key);
        var probe = document.createElement('span'), marker = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;line-height:normal;left:0;top:0';
        styleSpan(probe, r, font); probe.textContent = 'Mg国';
        marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        probe.appendChild(marker); host.appendChild(probe);
        var baseline = marker.getBoundingClientRect().top - probe.getBoundingClientRect().top;
        probe.remove(); baselineCache.set(key, baseline);
        return baseline;
    }
    function paint(focus) {
        if (!session || composing) return;
        painting = true;
        var layout = R.textLayout(modelItem());
        box.innerHTML = '';
        layout.lines.forEach(function (line, index) {
            var div = document.createElement('div');
            div.className = 'ck-text-line';
            div.dataset.line = index;
            var next = layout.lines[index + 1], gap = next ? Math.max(line.gap, next.gap) : 0;
            div.style.height = (line.ascent + line.descent + gap) + 'px';
            div.style.paddingTop = line.ascent + 'px';
            div.style.marginLeft = (line.left - layout.bounds.x0) + 'px';
            div.style.width = Math.max(1, line.width) + 'px';
            line.segments.forEach(function (seg) {
                if (!seg.text) return;
                var span = document.createElement('span'), r = seg.style;
                styleSpan(span, r, seg.font);
                span.style.top = (seg.shift - htmlBaseline(r, seg.font)) + 'px';
                span.textContent = seg.text;
                div.appendChild(span);
            });
            if (!div.childNodes.length) {
                div.style.fontSize = session.model.lines[index].runs[0].size + 'px';
                div.appendChild(document.createElement('br'));
            }
            box.appendChild(div);
        });
        reposition();
        restoreSelection(focus);
        painting = false;
        updateToolbar();
    }
    function replaceSelection(text) {
        rememberSelection(); record();
        var list = atoms(session.model), insert = [];
        text = String(text).replace(/\r\n?/g, '\n');
        for (var i = 0; i < text.length; i++) insert.push(Object.assign({ text: text[i] }, pending));
        list = list.slice(0, selection.start).concat(insert, list.slice(selection.end));
        var end = selection.start + text.length;
        session.model = fromAtoms(list, session.model.align, pending);
        selection = { start: end, end: end, backward: false };
        explicitStyle = true;
        paint();
    }
    function format(key, value) {
        if (!session || composing) return;
        rememberSelection(); record();
        var list = atoms(session.model), selected = list.slice(selection.start, selection.end);
        if (!selected.length) selected = [pending];
        if (key === 'super' || key === 'sub') {
            value = selected.every(function (a) { return a.script === key; }) ? 'normal' : key;
            key = 'script';
        } else if (key === 'bold' || key === 'italic') value = !selected.every(function (a) { return a[key]; });
        if (key === 'align') session.model.align = value;
        else {
            pending[key] = value;
            for (var i = selection.start; i < selection.end; i++) list[i][key] = value;
            session.model = fromAtoms(list, session.model.align, pending);
            explicitStyle = true;
        }
        paint();
    }
    function undo(redo) {
        if (!session || composing) return;
        var source = redo ? future : history, destination = redo ? history : future;
        if (!source.length) return;
        destination.push(snapshot());
        var state = source.pop();
        session.model = state.model; selection = state.selection; pending = state.pending; explicitStyle = state.explicitStyle;
        paint();
    }
    function syncInput() {
        if (!session || composing) return;
        var state = readSurface();
        session.model = fromAtoms(state.list, session.model.align, pending);
        if (state.range) selection = state.range;
        explicitStyle = false;
        paint();
    }
    function finish(commit) {
        if (!session || composing) return;
        clearTimeout(compositionTimer);
        var result = session;
        session = null; history = []; future = [];
        host.hidden = true; box.innerHTML = '';
        options.finish(commit ? result.model : null);
    }
    box.addEventListener('beforeinput', function (e) {
        if (!session || composing || e.isComposing || e.inputType === 'insertCompositionText') return;
        if (e.inputType === 'insertFromComposition') return;
        if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
            e.preventDefault(); undo(e.inputType === 'historyRedo'); return;
        }
        if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') { e.preventDefault(); return; }
        if (e.inputType === 'insertText' || e.inputType === 'insertReplacementText') {
            if (e.data != null) { e.preventDefault(); replaceSelection(e.data); return; }
        }
        if (e.inputType.indexOf('format') === 0) { e.preventDefault(); return; }
        rememberSelection(); record();
    });
    box.addEventListener('input', function (e) {
        if (!composing && !e.isComposing && e.inputType !== 'insertCompositionText') syncInput();
    });
    box.addEventListener('compositionstart', function () {
        clearTimeout(compositionTimer); rememberSelection(); record(); composing = true;
        var s = window.getSelection();
        if (s && s.rangeCount && box.contains(s.anchorNode)) {
            var range = s.getRangeAt(0), span = document.createElement('span');
            styleSpan(span, pending, R.TEXT_FONTS.cjk);
            var shift = pending.script === 'super' ? -0.4 * pending.size : (pending.script === 'sub' ? 0.22 * pending.size : 0);
            span.style.top = (shift - htmlBaseline(pending, R.TEXT_FONTS.cjk)) + 'px';
            range.deleteContents();
            /* 插入同级片段，避免继承旧字符格式；组合输入期间不重建 DOM。 */
            var parent = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
            if (parent.dataset && parent.dataset.format && parent.parentNode.classList.contains('ck-text-line')) {
                var tail = document.createRange();
                tail.setStart(range.startContainer, range.startOffset); tail.setEnd(parent, parent.childNodes.length);
                var right = parent.cloneNode(false); right.appendChild(tail.extractContents());
                parent.after(span, right);
            } else range.insertNode(span);
            span.appendChild(document.createTextNode(''));
            range.setStart(span.firstChild, 0); range.collapse(true); s.removeAllRanges(); s.addRange(range);
        }
    });
    box.addEventListener('compositionend', function () {
        composing = false; compositionEnd = Date.now();
        compositionTimer = setTimeout(syncInput, 0);
    });
    box.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.isComposing || composing || e.keyCode === 229) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (Date.now() - compositionEnd < 80) return;
            if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) replaceSelection('\n');
            else if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) finish(true);
        } else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.ctrlKey || e.metaKey) {
            var key = e.key.toLowerCase();
            if (key === 'z' || key === 'y') { e.preventDefault(); undo(key === 'y' || e.shiftKey); }
            else if (key === 'b' || key === 'i') { e.preventDefault(); format(key === 'b' ? 'bold' : 'italic'); }
        }
    });
    box.addEventListener('paste', function (e) {
        e.preventDefault();
        if (!composing && e.clipboardData) replaceSelection(e.clipboardData.getData('text/plain'));
    });
    box.addEventListener('copy', function (e) {
        rememberSelection();
        if (e.clipboardData) { e.preventDefault(); e.clipboardData.setData('text/plain', R.richPlain(session.model).slice(selection.start, selection.end)); }
    });
    box.addEventListener('cut', function (e) {
        rememberSelection();
        if (!composing && e.clipboardData) {
            e.preventDefault(); e.clipboardData.setData('text/plain', R.richPlain(session.model).slice(selection.start, selection.end));
            replaceSelection('');
        }
    });
    box.addEventListener('drop', function (e) { e.preventDefault(); });
    box.addEventListener('dragstart', function (e) { e.preventDefault(); });
    host.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });
    bar.addEventListener('pointerdown', function (e) {
        if (composing) { e.preventDefault(); return; }
        rememberSelection();
        if (e.target.closest('button')) e.preventDefault();
    });
    bar.addEventListener('click', function (e) {
        var button = e.target.closest('button');
        if (!button) return;
        if (button.dataset.format) format(button.dataset.format);
        else if (button.dataset.align) format('align', button.dataset.align);
        else if (button.dataset.sizeStep) {
            sizeInput.value = Math.max(6, Math.min(144, (Number(sizeInput.value) || pending.size) + Number(button.dataset.sizeStep)));
            applySize();
        }
    });
    function applySize() {
        if (composing) return;
        var n = Number(sizeInput.value);
        if (!sizeInput.value || !Number.isFinite(n) || n < 6 || n > 144) { sizeInput.setCustomValidity('请输入 6–144 之间的字号'); sizeInput.reportValidity(); return; }
        sizeInput.setCustomValidity(''); format('size', n);
    }
    sizeInput.addEventListener('input', function () { sizeInput.setCustomValidity(''); });
    sizeInput.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        sizeInput.value = Math.max(6, Math.min(144, (Number(sizeInput.value) || 13) + (e.key === 'ArrowUp' ? 1 : -1)));
        applySize();
    });
    sizeInput.addEventListener('change', applySize);
    bar.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.isComposing || composing) return;
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Enter' && e.target === sizeInput) { e.preventDefault(); applySize(); }
        else if ((e.ctrlKey || e.metaKey) && /^(z|y)$/i.test(e.key)) { e.preventDefault(); undo(e.key.toLowerCase() === 'y' || e.shiftKey); }
    });
    document.addEventListener('selectionchange', rememberSelection);
    return {
        active: active, notify: notify, reposition: reposition,
        cancel: function () { finish(false); },
        refresh: function () { baselineCache.clear(); if (session && !composing) paint(document.activeElement === box); },
        start: function (item) {
            session = { item: clone(item), model: R.richForItem(item) };
            composing = false; compositionEnd = 0; history = []; future = [];
            var lastLine = session.model.lines[session.model.lines.length - 1];
            pending = R.runStyle(lastLine.runs[lastLine.runs.length - 1], 13); explicitStyle = false;
            var end = R.richPlain(session.model).length;
            selection = { start: end, end: end, backward: false };
            box.style.color = !item.stroke || item.stroke.toLowerCase() === '#1a1a1a' ? 'var(--ck-ink)' : item.stroke;
            host.hidden = false; notify(); paint();
        }
    };
}
return { create: create };
})();

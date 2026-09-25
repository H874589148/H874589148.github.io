/* tools/truth-table/script.js
   逻辑真值表模块页面逻辑：
   - 文本输入：engine.js 的 DSL → IR → Blob Worker 位并行求值（迁移自 logic_truth_table.html）
   - 画布搭建：iframe 嵌入电路示意图编辑器（embed=tt 模式），postMessage 取 doc → canvas-netlist.js 提 IR → 同一引擎
   - 结果区：统计四格、来源/版本提示、显示中间信号、只看含 1、512 行分页、CSV 导出（全部行，带进度） */
(function (root) {
'use strict';
var doc0 = root.document;
var $ = function (s) { return doc0.querySelector(s); };
var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
};
var TTE = root.TTEngine, TTN = root.TTNetlist;
var bitAt = TTE.bitAt;

var PAGE_SIZE = 512;
var mode = 'text';
var page = 0, lastPages = 1;
var current = null;               // 当前真值表结果（canvas 来源时附 docStr 快照用于修改检测）
var revisions = { text: 0 };      // 文本源版本号；画布源以 docStr 快照比对
var busy = false, exporting = false;

/* ============================================
   Tab 切换（ARIA + 方向键，与 24 点模块同款）
   ============================================ */
function switchTab(name, focus) {
    mode = name;
    ['text', 'canvas'].forEach(function (key) {
        var active = key === name, btn = $('#tab-' + key);
        $('#panel-' + key).hidden = !active;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
        btn.tabIndex = active ? 0 : -1;
    });
    if (focus) $('#tab-' + name).focus();
    updateProvenance();
}
var tabs = Array.prototype.slice.call(doc0.querySelectorAll('[role="tab"]'));
tabs.forEach(function (btn, i) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    btn.addEventListener('keydown', function (e) {
        var next;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = tabs.length - 1;
        if (next !== undefined) { e.preventDefault(); switchTab(tabs[next].dataset.tab, true); }
    });
});

/* ============================================
   画布 iframe 数据桥（circuit-sketch embed=tt）
   ============================================ */
var frame = $('#ckFrame');
var docWaiters = new Map(), requestSequence = 0;
function resetRequests() {
    docWaiters.forEach(function (w) { clearTimeout(w.timer); w.reject(new Error('画布已重新加载，请重试')); });
    docWaiters.clear();
}
frame.addEventListener('load', resetRequests);
root.addEventListener('message', function (e) {
    if (!frame.contentWindow || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    var d = e.data;
    if (!d || typeof d !== 'object') return;
    var w = docWaiters.get(d.requestId);
    if (!w || d.type !== w.type) return;
    docWaiters.delete(d.requestId); clearTimeout(w.timer);
    if (d.error || d.editing) w.reject(new Error(d.error || '请先确认或取消画布中的文字草稿'));
    else w.resolve(d);
});
function frameRequest(msg) {
    return new Promise(function (resolve, reject) {
        if (!frame.contentWindow) return reject(new Error('画布尚未加载，请稍候再试'));
        var id = 'tt-' + (++requestSequence);
        var timer = setTimeout(function () { docWaiters.delete(id); reject(new Error('画布响应超时，请刷新页面重试')); }, 5000);
        docWaiters.set(id, { resolve: resolve, reject: reject, timer: timer, type: msg.type === 'tt-get-doc' ? 'tt-doc' : 'tt-ack' });
        try { frame.contentWindow.postMessage(Object.assign({}, msg, { requestId: id }), location.origin); }
        catch (err) { clearTimeout(timer); docWaiters.delete(id); reject(err); }
    });
}
function requestDoc() { return frameRequest({ type: 'tt-get-doc' }).then(function (d) { return CircuitHandoff.validateDoc(d.doc); }); }
function postToFrame(msg) { frameRequest(msg).catch(function (err) { setStatus(err.message, 'err'); }); }
CircuitHandoff.toolbar(frame.parentNode, '逻辑真值表', function () {
    return requestDoc().then(function (doc) { return { doc: doc, title: '当前逻辑画布', context: { module: 'truth-table' } }; });
});

/* 2 选 1 选择器示例：y = a&s | b&~s（razavi 符号手工布局，走线端点精确落在引脚上） */
var EXAMPLE_DOC = (function () {
    var _id = 0;
    function uid() { return 'i' + (++_id); }
    function comp(type, x, y, text) {
        return { kind: 'comp', id: uid(), type: type, x: x, y: y, rot: 0, fh: false, fv: false,
            text: text || '', stroke: '#1a1a1a', sw: 1.5, dash: '' };
    }
    function wire(pts) {
        return { kind: 'wire', id: uid(), pts: pts, stroke: '#1a1a1a', sw: 1.5, dash: '' };
    }
    return { groups: [], items: [
        comp('tt-in', 100, 120, 'a'),
        comp('tt-in', 100, 300, 'b'),
        comp('tt-in', 100, 460, 's'),
        comp('inverter', 200, 540),
        comp('and-gate', 400, 160),
        comp('and-gate', 400, 360),
        comp('or-gate', 580, 260),
        comp('tt-out', 720, 260, 'y'),
        wire([{ x: 132, y: 120 }, { x: 200, y: 120 }, { x: 200, y: 150 }, { x: 370, y: 150 }]),   // a → and1.A
        wire([{ x: 132, y: 460 }, { x: 380, y: 460 }, { x: 380, y: 170 }, { x: 370, y: 170 }]),   // s → and1.B
        wire([{ x: 132, y: 460 }, { x: 132, y: 540 }, { x: 170, y: 540 }]),                       // s → inv.A
        wire([{ x: 230, y: 540 }, { x: 460, y: 540 }, { x: 460, y: 370 }, { x: 370, y: 370 }]),   // inv.Y → and2.B
        wire([{ x: 132, y: 300 }, { x: 350, y: 300 }, { x: 350, y: 350 }, { x: 370, y: 350 }]),   // b → and2.A
        wire([{ x: 430, y: 160 }, { x: 520, y: 160 }, { x: 520, y: 250 }, { x: 550, y: 250 }]),   // and1.Y → or1.A
        wire([{ x: 430, y: 360 }, { x: 530, y: 360 }, { x: 530, y: 270 }, { x: 550, y: 270 }]),   // and2.Y → or1.B
        wire([{ x: 610, y: 260 }, { x: 688, y: 260 }])                                            // or1.Y → y
    ] };
})();

/* ============================================
   真值表展示（迁移自 logic_truth_table.html）
   ============================================ */
var showInternal = function () { return $('#showInternal').checked; };
var onlyOnes = function () { return $('#onlyOnes').checked; };
var columnsOf = function (st) { return st.inputCols.concat(st.outputCols, showInternal() ? st.internalCols : []); };

function renderTable() {
    var tt = $('#tt');
    if (!current) {
        tt.innerHTML = '<tbody><tr><td class="empty">输入逻辑后，点击「生成真值表」查看结果。</td></tr></tbody>';
        $('#summary').textContent = ''; $('#resultSource').textContent = '等待计算';
        ['statInputs', 'statOutputs', 'statRows', 'statTime', 'inputNames', 'outputNames'].forEach(function (id) { $('#' + id).textContent = '—'; });
        lastPages = 1; $('#pageInfo').textContent = ''; $('#prevPage').disabled = true; $('#nextPage').disabled = true;
        $('#exportCsv').disabled = true; updateProvenance(); return;
    }
    var st = current, cols = columnsOf(st), rows = onlyOnes() ? st.onesRows : null;
    var total = rows ? rows.length : st.R;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.max(0, Math.min(page, pages - 1));
    var from = page * PAGE_SIZE, to = Math.min(total, from + PAGE_SIZE);
    var html = '<thead><tr>' + cols.map(function (c) { return '<th scope="col" class="' + c.cls + '">' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (var k = from; k < to; k++) {
        var r = rows ? rows[k] : k;
        html += '<tr>' + cols.map(function (c) { var v = bitAt(c.bits, r); return '<td' + (v && c.cls !== 'in' ? ' class="one"' : '') + '>' + v + '</td>'; }).join('') + '</tr>';
    }
    if (!total) html += '<tr><td class="empty" colspan="' + cols.length + '">没有输出含 1 的行。取消筛选可查看全部组合。</td></tr>';
    tt.innerHTML = html + '</tbody>';
    $('#tableWrap').scrollTop = 0;
    $('#statInputs').textContent = st.n;
    $('#statOutputs').textContent = st.ir.outputs.length;
    $('#statRows').textContent = st.R.toLocaleString('en-US');
    $('#statTime').textContent = st.elapsed.toFixed(1);
    $('#inputNames').textContent = st.ir.inputs.join(', ') || '常量电路 / 无输入';
    $('#outputNames').textContent = st.ir.outputs.map(function (o) { return o.name; }).join(', ');
    $('#inputNames').title = $('#inputNames').textContent; $('#outputNames').title = $('#outputNames').textContent;
    $('#summary').textContent = '输入 ' + st.n + ' 个 · 输出 ' + st.ir.outputs.length + ' 个 · 共 ' + st.R + ' 行（2^' + st.n + '）' + (onlyOnes() ? ' · 筛选后 ' + total + ' 行' : '');
    lastPages = pages;
    $('#pageInfo').textContent = total ? '第 ' + (page + 1) + ' / ' + pages + ' 页 · 第 ' + (from + 1) + '–' + to + ' 行' : '没有匹配的行';
    $('#prevPage').disabled = page <= 0; $('#nextPage').disabled = page >= pages - 1;
    updateProvenance();
}

function updateProvenance() {
    var el = $('#provenance');
    if (!current) { el.textContent = ''; return; }
    var name = current.source === 'text' ? '文本输入' : '画布搭建';
    $('#resultSource').textContent = '来源：' + name;
    var notices = [];
    if (current.source !== mode) notices.push('当前显示的是「' + name + '」的结果，并非当前输入面板的结果。');
    /* 文本源用版本号检测修改；画布源在 iframe 内编辑无法被动感知，导出/生成时以 docStr 快照比对 */
    var stale = current.source === 'text' && current.revision !== revisions.text;
    if (stale) notices.push('源电路已修改，下表为修改前的结果。');
    el.textContent = notices.length ? notices.join(' ') + ' 请点击「生成真值表」更新。' : '';
    $('#exportCsv').disabled = busy || exporting || stale;
}

function setStatus(msg, cls) { var el = $('#status'); el.textContent = msg || ''; el.className = cls || ''; }

/* ============================================
   生成与导出
   ============================================ */
function generate() {
    if (busy) return Promise.resolve(null);
    busy = true;
    var source = mode;
    $('#genText').disabled = $('#genCanvas').disabled = $('#exportCsv').disabled = true;
    $('#panel-result').setAttribute('aria-busy', 'true');
    setStatus('正在后台计算，请稍候…');
    var obtain;
    if (source === 'text') {
        obtain = TTE.runJob({ type: 'evaluate', source: 'text', text: $('#src').value });
    } else {
        obtain = requestDoc().then(function (doc) {
            var ir = TTN.buildIRFromDoc(doc, root.Razavi.ports);   // 校验失败在此抛错
            var docStr = JSON.stringify(doc);
            return TTE.runJob({ type: 'evaluate', source: 'canvas', ir: ir }).then(function (result) {
                result.docStr = docStr;
                return result;
            });
        });
    }
    return obtain.then(function (result) {
        result.source = source;
        result.revision = revisions.text;
        current = result; page = 0; renderTable();
        setStatus('已生成真值表：共 ' + current.R + ' 行', 'ok');
        return current;
    }).catch(function (e) {
        current = null; renderTable();
        setStatus('错误：' + e.message, 'err');
        return null;
    }).then(function (r) {
        busy = false;
        $('#genText').disabled = $('#genCanvas').disabled = false;
        $('#panel-result').setAttribute('aria-busy', 'false');
        updateProvenance();
        return r;
    });
}

function exportCsv() {
    if (!current || busy || exporting) return;
    var st = current;
    var proceed = function () {
        exporting = true; updateProvenance();
        $('#exportProgress').textContent = '正在导出全部 ' + st.R + ' 行…';
        TTE.runJob({ type: 'csv', cols: columnsOf(st), rows: st.R }, function (p) { $('#exportProgress').textContent = '导出 ' + p + '%'; })
            .then(function (blob) {
                var a = doc0.createElement('a'), url = URL.createObjectURL(blob);
                a.href = url; a.download = 'truth-table-' + st.source + '.csv';
                doc0.body.appendChild(a); a.click(); a.remove();
                setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
                $('#exportProgress').textContent = '已导出 ' + st.R + ' 行';
            })
            .catch(function (e) { $('#exportProgress').textContent = '导出失败：' + e.message; })
            .then(function () { exporting = false; updateProvenance(); if (!current) $('#exportCsv').disabled = true; });
    };
    if (st.source === 'text') {
        if (st.revision !== revisions.text) { setStatus('提示：电路已修改，请重新生成后导出', 'err'); return; }
        proceed();
    } else {
        requestDoc().then(function (doc) {
            if (JSON.stringify(doc) !== st.docStr) { setStatus('提示：画布已修改，请重新生成后导出', 'err'); return; }
            proceed();
        }).catch(function (e) { setStatus('提示：' + e.message, 'err'); });
    }
}

/* ============================================
   事件绑定与初始化
   ============================================ */
$('#src').addEventListener('input', function () { revisions.text++; $('#textExample').value = ''; updateProvenance(); });
$('#textExample').addEventListener('change', function (e) {
    var text = TTE.TEXT_EXAMPLES[e.target.value]; if (!text) return;
    var isExample = Object.keys(TTE.TEXT_EXAMPLES).some(function (k) { return TTE.TEXT_EXAMPLES[k] === $('#src').value; });
    if ($('#src').value.trim() && !isExample && !confirm('载入示例将替换当前文本，继续吗？')) { e.target.value = ''; return; }
    $('#src').value = text; revisions.text++; updateProvenance();
});
$('#genText').addEventListener('click', generate);
$('#genCanvas').addEventListener('click', generate);
root.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generate(); }
});
$('#loadExample').addEventListener('click', function () {
    if (!confirm('载入示例将替换当前画布，继续吗？')) return;
    postToFrame({ type: 'tt-load-doc', doc: JSON.parse(JSON.stringify(EXAMPLE_DOC)) });
});
$('#clearCanvas').addEventListener('click', function () {
    if (!confirm('确定清空全部器件和连线？（画布内 Ctrl+Z 可撤销）')) return;
    postToFrame({ type: 'tt-load-doc', doc: { items: [], groups: [] } });
});
$('#showInternal').addEventListener('change', function () { page = 0; renderTable(); });
$('#onlyOnes').addEventListener('change', function () { page = 0; renderTable(); });
$('#exportCsv').addEventListener('click', exportCsv);
$('#prevPage').addEventListener('click', function () { if (page > 0) { page--; renderTable(); } });
$('#nextPage').addEventListener('click', function () { if (page < lastPages - 1) { page++; renderTable(); } });

switchTab('text');
renderTable();
generate();   // 默认多数表决器文本，进页面即见结果
})(typeof window !== 'undefined' ? window : globalThis);

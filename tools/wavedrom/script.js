/* ============================================
   tools/wavedrom/script.js
   波形编辑器（纯图形化，零依赖自绘 SVG，无 WaveJSON）

   数据模型：
   state = {
     slots: 40,                  // 全局横向槽数（1 槽 = 半个 clk 周期，40 槽 = 20 周期）
     signals: [{
       id, name, kind,           // kind: 'clk' | 'sig' | 'bus'
       cells: [{ v, edge, text, fill }],
       //   v: '0'|'1'|'z'|'x'|'data'；edge: 'ideal'|'slope'（进入该槽的跳变沿）
       //   v='data' 时 text=块文字（hex/注释）、fill=块底色
       fillRegions: [{ from, to, color }]   // 行内区域填色带
     }]
   }
   clk 行 cells 物化为 0/1 交替，增删周期 = 所有信号 cells 同步 push/pop。
   ============================================ */

'use strict';

/* ---- 常量 ---- */
var LS_KEY = 'wave-editor-state-v1';
var SW = 40;                 // 槽宽 px
var RH = 52;                 // 行高 px（含底部填色带）
var NAME_W = 92;             // 左侧信号名列宽
var AXIS_H = 22;             // 顶部周期刻度轴高
var Y_HI = 10, Y_LO = 38, Y_MID = 24;   // 行内电平 y 坐标
var SLOPE_W = 10;            // 非理想斜坡沿水平宽度
var PALETTE = ['#3a5a8c', '#c0583a', '#4a7c59', '#8c6bb1', '#b8860b', '#2e7d8c', '#a04a6e', '#5a5a5a'];

/* ---- 状态 ---- */
var _uid = 1;
function uid() { return _uid++; }
function mkCell(v, edge) { return { v: v, edge: edge || 'ideal', text: '', fill: '' }; }

function defaultState() {
    var S = 40;   // 20 周期 × 2 槽
    function cells(n, v) { var a = []; for (var i = 0; i < n; i++) a.push(mkCell(v || '0')); return a; }

    /* 第 1 行 clk：50% 占空比方波 20 周期（0/1 交替物化） */
    var clkCells = cells(S);
    for (var i = 0; i < S; i++) clkCells[i].v = (i % 2 === 0) ? '0' : '1';

    /* 第 2 行 data（总线）：低→高→hex 块→文字注释块→低 */
    var d = cells(S);
    d[2].v = '1'; d[3].v = '1';
    var blocks = [[4, '0xA5', PALETTE[0]], [8, '0x3C', PALETTE[2]], [12, 'IDLE', PALETTE[4]]];
    blocks.forEach(function (b) {
        for (var k = 0; k < 4; k++) { var c = d[b[0] + k]; c.v = 'data'; c.text = b[1]; c.fill = b[2]; }
    });

    /* 第 3 行 req：电平高低跳变（理想陡峭沿） */
    var rq = cells(S);
    for (var a = 6; a <= 13; a++) rq[a].v = '1';
    for (var b2 = 20; b2 <= 27; b2++) rq[b2].v = '1';

    /* 第 4 行 ack：z / x 态 + 非理想斜坡沿示例 */
    var ak = cells(S);
    var j;
    for (j = 0; j <= 3; j++) ak[j].v = 'z';
    for (j = 4; j <= 11; j++) ak[j].v = '1';
    ak[4].edge = 'slope';                       // z → 1 斜坡上升
    for (j = 12; j <= 15; j++) ak[j].v = 'x';
    ak[12].edge = 'slope';                      // 1 → x 缓变
    for (j = 24; j <= 31; j++) ak[j].v = '1';
    ak[24].edge = 'slope';                      // 0 → 1 斜坡上升
    ak[32].edge = 'slope';                      // 1 → 0 斜坡下降

    /* 第 5 行 win：区域填色示例（第 5~10 槽 = 第 3~5 周期） */
    var wn = cells(S);

    return {
        slots: S,
        signals: [
            { id: uid(), name: 'clk',  kind: 'clk', cells: clkCells, fillRegions: [] },
            { id: uid(), name: 'data', kind: 'bus', cells: d,        fillRegions: [] },
            { id: uid(), name: 'req',  kind: 'sig', cells: rq,       fillRegions: [] },
            { id: uid(), name: 'ack',  kind: 'sig', cells: ak,       fillRegions: [] },
            { id: uid(), name: 'win',  kind: 'bus', cells: wn,       fillRegions: [{ from: 4, to: 9, color: PALETTE[0] }] }
        ]
    };
}

/* 持久化 */
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { } }
function load() {
    try {
        var s = JSON.parse(localStorage.getItem(LS_KEY));
        if (!s || !s.slots || !Array.isArray(s.signals) || !s.signals.length) return null;
        /* 字段补全（兼容旧版本存档）；结构损坏则弃用存档 */
        var bad = false;
        s.signals.forEach(function (g) {
            if (!Array.isArray(g.cells) || g.cells.length !== s.slots) { bad = true; return; }
            if (!Array.isArray(g.fillRegions)) g.fillRegions = [];
            g.cells.forEach(function (c) {
                if (!c.edge) c.edge = 'ideal';
                if (typeof c.text !== 'string') c.text = '';
                if (typeof c.fill !== 'string') c.fill = '';
            });
            if (g.id) _uid = Math.max(_uid, g.id + 1);
        });
        return bad ? null : s;
    } catch (e) { return null; }
}

var state = load() || defaultState();
var sel = null;                    // 选区 { sig, a, b }（同行槽区间）
var undoStack = [], redoStack = [];
var curBlockColor = PALETTE[0];    // 数据块当前色
var curFillColor = PALETTE[1];     // 区域填色当前色
var lastClick = { x: 100, y: 100 };// 数据块弹层定位用

/* 撤销 / 重做 */
function pushUndo() {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
}
function doUndo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(state));
    state = JSON.parse(undoStack.pop());
    sel = null;
    commit();
}
function doRedo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(state));
    state = JSON.parse(redoStack.pop());
    sel = null;
    commit();
}
function commit() { save(); render(); }

/* ---- 元素索引 ---- */
var el = {};
['wvOut', 'selInfo', 'wvPanel', 'wvPanelText', 'wvPanelColors', 'wvPanelOk', 'wvPanelDel',
 'addSig', 'addBus', 'addClk', 'delSig', 'mvUp', 'mvDown', 'addPer', 'delPer',
 'set0', 'set1', 'setZ', 'setX', 'edgeIdeal', 'edgeSlope',
 'mkData', 'editData', 'unData', 'blockColors',
 'fillColors', 'applyFill', 'clearFill',
 'expSvg', 'expPng', 'expPdf', 'undoBtn', 'redoBtn', 'resetBtn'
].forEach(function (id) { el[id] = document.getElementById(id); });

/* ============================================
   渲染：自绘 SVG
   ============================================ */
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function levelY(v, y0) { return v === '1' ? y0 + Y_HI : v === '0' ? y0 + Y_LO : y0 + Y_MID; }

/* 单行波形 → SVG 片段 */
function renderWave(sig, y0) {
    var s = '';
    var cells = sig.cells, n = state.slots;
    function X(i) { return NAME_W + i * SW; }
    function keyOf(c) { return c.v === 'data' ? 'data|' + c.text + '|' + c.fill : c.v; }

    /* 段扫描：相同 key 的连续槽合并为一段 */
    var segs = [], j = 0;
    while (j < n) {
        var k = j, key = keyOf(cells[j]);
        while (k + 1 < n && keyOf(cells[k + 1]) === key) k++;
        segs.push({ v: cells[j].v, text: cells[j].text, fill: cells[j].fill, from: j, to: k });
        j = k + 1;
    }

    var prevY = null;   // 上一段结束时的电平 y（data/x 段结束后视为中线）
    segs.forEach(function (sg) {
        var xa = X(sg.from), xb = X(sg.to + 1);
        if (sg.v === '0' || sg.v === '1' || sg.v === 'z') {
            var y = levelY(sg.v, y0);
            var startX = xa;
            if (prevY !== null && Math.abs(prevY - y) > 0.5) {
                if (cells[sg.from].edge === 'slope') {
                    startX = xa + SLOPE_W;
                    s += '<line x1="' + xa + '" y1="' + prevY + '" x2="' + startX + '" y2="' + y + '" stroke="#1a1a1a" stroke-width="2"/>';
                } else {
                    s += '<line x1="' + xa + '" y1="' + prevY + '" x2="' + xa + '" y2="' + y + '" stroke="#1a1a1a" stroke-width="2"/>';
                }
            }
            var dash = sg.v === 'z' ? ' stroke-dasharray="5 3" stroke="#8a8274"' : ' stroke="#1a1a1a"';
            s += '<line x1="' + startX + '" y1="' + y + '" x2="' + xb + '" y2="' + y + '"' + dash + ' stroke-width="2"/>';
            prevY = y;
        } else if (sg.v === 'x') {
            /* 不确定态：浅灰块 + 每槽 X 交叉 */
            var ym = y0 + Y_MID;
            s += '<rect x="' + xa + '" y="' + (ym - 9) + '" width="' + (xb - xa) + '" height="18" fill="#f0ebe0" stroke="#b8b0a0" stroke-width="1"/>';
            for (var i = sg.from; i <= sg.to; i++) {
                var cx = X(i);
                s += '<line x1="' + (cx + 8) + '" y1="' + (ym - 6) + '" x2="' + (cx + SW - 8) + '" y2="' + (ym + 6) + '" stroke="#b8b0a0" stroke-width="1"/>';
                s += '<line x1="' + (cx + 8) + '" y1="' + (ym + 6) + '" x2="' + (cx + SW - 8) + '" y2="' + (ym - 6) + '" stroke="#b8b0a0" stroke-width="1"/>';
            }
            prevY = ym;
        } else {
            /* 数据块：六边形总线带 + 居中文字 */
            var yt = y0 + Y_HI, yb = y0 + Y_LO, ym2 = y0 + Y_MID, tip = 6;
            var fill = sg.fill || '#e8e2d8';
            s += '<path d="M ' + (xa + tip) + ' ' + yt + ' L ' + (xb - tip) + ' ' + yt +
                ' L ' + xb + ' ' + ym2 + ' L ' + (xb - tip) + ' ' + yb +
                ' L ' + (xa + tip) + ' ' + yb + ' L ' + xa + ' ' + ym2 + ' Z" fill="' + fill + '" stroke="#4a4a4a" stroke-width="1.5"/>';
            if (sg.text) {
                var tw = xb - xa;
                var tc = sg.fill ? '#fff' : '#4a4a4a';
                var tl = (tw < 64) ? ' textLength="' + Math.max(tw - 14, 18) + '" lengthAdjust="spacingAndGlyphs"' : '';
                s += '<text x="' + ((xa + xb) / 2) + '" y="' + (ym2 + 4) + '" text-anchor="middle" font-size="11" fill="' + tc + '"' + tl + '>' + esc(sg.text) + '</text>';
            }
            prevY = ym2;
        }
    });
    return s;
}

function buildSvg(showSel, withBg) {
    var W = NAME_W + state.slots * SW + 16;
    var H = AXIS_H + state.signals.length * RH + 12;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="\'Fira Code\', monospace">';
    if (withBg) s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>';

    /* 顶部周期刻度轴（每 2 槽 = 1 周期） */
    s += '<line x1="' + NAME_W + '" y1="' + (AXIS_H - 4) + '" x2="' + (NAME_W + state.slots * SW) + '" y2="' + (AXIS_H - 4) + '" stroke="#b8b0a0" stroke-width="1"/>';
    var i;
    for (i = 0; i < state.slots; i += 2) {
        s += '<text x="' + (NAME_W + i * SW + SW) + '" y="13" text-anchor="middle" font-size="9" fill="#8a8274">' + (i / 2 + 1) + '</text>';
        s += '<line x1="' + (NAME_W + i * SW) + '" y1="' + AXIS_H + '" x2="' + (NAME_W + i * SW) + '" y2="' + (H - 8) + '" stroke="#eae3d5" stroke-width="1" stroke-dasharray="3 3"/>';
    }
    s += '<line x1="' + (NAME_W + state.slots * SW) + '" y1="' + AXIS_H + '" x2="' + (NAME_W + state.slots * SW) + '" y2="' + (H - 8) + '" stroke="#eae3d5" stroke-width="1" stroke-dasharray="3 3"/>';

    /* 各行 */
    state.signals.forEach(function (sig, r) {
        var y0 = AXIS_H + r * RH;
        if (r > 0) s += '<line x1="4" y1="' + y0 + '" x2="' + (W - 8) + '" y2="' + y0 + '" stroke="#f0ebe0" stroke-width="1"/>';

        /* 信号名（双击重命名） */
        s += '<text class="wv-name" data-r="' + r + '" x="8" y="' + (y0 + Y_MID + 5) + '" font-size="14" fill="#4a4a4a" font-family="\'Patrick Hand\', \'Fira Code\', sans-serif">' + esc(sig.name) + '</text>';

        /* 区域填色带（波形下方） */
        (sig.fillRegions || []).forEach(function (fr) {
            s += '<rect x="' + (NAME_W + fr.from * SW) + '" y="' + (y0 + 43) + '" width="' + ((fr.to - fr.from + 1) * SW) + '" height="6" rx="3" fill="' + fr.color + '" opacity="0.55"/>';
        });

        /* 波形本体 */
        s += renderWave(sig, y0);

        /* 点击热区 */
        if (showSel) {
            for (i = 0; i < state.slots; i++) {
                s += '<rect class="wv-hit" data-r="' + r + '" data-i="' + i + '" x="' + (NAME_W + i * SW) + '" y="' + y0 + '" width="' + SW + '" height="' + RH + '" fill="transparent"/>';
            }
        }

        /* 选区高亮 */
        if (showSel && sel && sel.sig === r) {
            var a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b);
            s += '<rect x="' + (NAME_W + a * SW + 1) + '" y="' + (y0 + 2) + '" width="' + ((b - a + 1) * SW - 2) + '" height="' + (RH - 4) + '" fill="rgba(58,90,140,0.10)" stroke="#3a5a8c" stroke-width="1.5" stroke-dasharray="4 3" pointer-events="none"/>';
        }
    });

    s += '</svg>';
    return s;
}

function render() {
    /* 选区越界保护 */
    if (sel) {
        if (sel.sig >= state.signals.length) sel = null;
        else { sel.a = Math.min(sel.a, state.slots - 1); sel.b = Math.min(sel.b, state.slots - 1); }
    }
    el.wvOut.innerHTML = buildSvg(true, false);

    /* 状态条 */
    if (sel) {
        var r = selRange();
        var g = state.signals[r.sig];
        el.selInfo.textContent = '选中：' + g.name + ' 行 第 ' + (r.a + 1) + (r.b > r.a ? '~' + (r.b + 1) : '') +
            ' 槽（周期 ' + (Math.floor(r.a / 2) + 1) + (Math.floor(r.b / 2) > Math.floor(r.a / 2) ? '~' + (Math.floor(r.b / 2) + 1) : '') + '）';
    } else {
        el.selInfo.textContent = '未选中槽位 —— 单击波形选中，再次点击切换电平 / 编辑数据块，Shift+点击扩展选区';
    }
    el.undoBtn.disabled = !undoStack.length;
    el.redoBtn.disabled = !redoStack.length;
}

/* ============================================
   选区与编辑操作
   ============================================ */
function selRange() {
    if (!sel) return null;
    return { sig: sel.sig, a: Math.min(sel.a, sel.b), b: Math.max(sel.a, sel.b) };
}
function forSelCells(fn) {
    var r = selRange();
    if (!r) { el.selInfo.textContent = '请先点击波形选择槽位'; return false; }
    var sig = state.signals[r.sig];
    for (var i = r.a; i <= r.b; i++) fn(sig.cells[i], i, sig);
    return true;
}

/* 点击同一已选槽：循环切换 / 弹数据块面板 */
function cycleOrEdit(r, i) {
    var sig = state.signals[r];
    var c = sig.cells[i];
    if (sig.kind === 'bus') {
        if (c.v === 'data') { openPanel(r, i); return; }
        pushUndo();
        c.v = c.v === '0' ? '1' : c.v === '1' ? 'data' : '0';
        if (c.v === 'data') { c.text = 'DATA'; c.fill = curBlockColor; }
        commit();
    } else {
        pushUndo();
        c.v = c.v === '0' ? '1' : c.v === '1' ? 'z' : c.v === 'z' ? 'x' : '0';
        commit();
    }
}

/* 点击热区（事件委托） */
el.wvOut.addEventListener('click', function (e) {
    lastClick = { x: e.clientX, y: e.clientY };
    var t = e.target;
    if (!t.classList || !t.classList.contains('wv-hit')) return;
    if (panelCtx) closePanel();   // 点击波形即关闭数据块弹层（如需会由 cycleOrEdit 重新打开）
    var r = +t.dataset.r, i = +t.dataset.i;
    if (e.shiftKey && sel && sel.sig === r) {
        sel.b = i;
        render();
    } else if (sel && sel.sig === r && sel.a === i && sel.b === i) {
        cycleOrEdit(r, i);
    } else {
        sel = { sig: r, a: i, b: i };
        render();
    }
});

/* 双击信号名：内联重命名 */
el.wvOut.addEventListener('dblclick', function (e) {
    var t = e.target;
    if (!t.classList || !t.classList.contains('wv-name')) return;
    var r = +t.dataset.r;
    var sig = state.signals[r];
    /* 以被双击文本元素的实际位置定位输入框（相对容器，含滚动偏移） */
    var trect = t.getBoundingClientRect();
    var crect = el.wvOut.getBoundingClientRect();
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.value = sig.name;
    inp.className = 'wv-rename';
    inp.style.left = (trect.left - crect.left + el.wvOut.scrollLeft - 4) + 'px';
    inp.style.top = (trect.top - crect.top + el.wvOut.scrollTop - 3) + 'px';
    inp.style.width = Math.max(trect.width + 28, 76) + 'px';
    el.wvOut.appendChild(inp);
    inp.focus();
    inp.select();
    function done(ok) {
        if (ok) {
            var v = inp.value.trim();
            if (v && v !== sig.name) { pushUndo(); sig.name = v; commit(); }
        }
        if (inp.parentNode) inp.parentNode.removeChild(inp);
    }
    inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') done(true);
        else if (ev.key === 'Escape') done(false);
    });
    inp.addEventListener('blur', function () { done(true); });
});

/* ============================================
   数据块编辑弹层
   ============================================ */
var panelCtx = null;   // { r, i }

function blockRange(sig, i) {
    var c = sig.cells[i];
    if (c.v !== 'data') return { a: i, b: i };
    var a = i, b = i;
    while (a > 0 && sig.cells[a - 1].v === 'data' && sig.cells[a - 1].text === c.text && sig.cells[a - 1].fill === c.fill) a--;
    while (b < state.slots - 1 && sig.cells[b + 1].v === 'data' && sig.cells[b + 1].text === c.text && sig.cells[b + 1].fill === c.fill) b++;
    return { a: a, b: b };
}

function buildSwatches(container, onPick) {
    PALETTE.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'wv-sw';
        b.style.background = c;
        b.dataset.color = c;
        b.addEventListener('click', function () { onPick(c); });
        container.appendChild(b);
    });
}
function markSwatch(container, color) {
    container.querySelectorAll('.wv-sw').forEach(function (b) {
        b.classList.toggle('active', b.dataset.color === color);
    });
}

function openPanel(r, i) {
    panelCtx = { r: r, i: i };
    var c = state.signals[r].cells[i];
    el.wvPanelText.value = c.text || '';
    markSwatch(el.wvPanelColors, c.fill || curBlockColor);
    el.wvPanel.style.display = 'block';
    var pw = 250, ph = 210;
    el.wvPanel.style.left = Math.max(8, Math.min(lastClick.x, window.innerWidth - pw - 16)) + 'px';
    el.wvPanel.style.top = Math.max(8, Math.min(lastClick.y + 12, window.innerHeight - ph - 16)) + 'px';
    el.wvPanelText.focus();
    el.wvPanelText.select();
}
function closePanel() { el.wvPanel.style.display = 'none'; panelCtx = null; }

el.wvPanelOk.addEventListener('click', function () {
    if (!panelCtx) return;
    var sig = state.signals[panelCtx.r];
    var rg = blockRange(sig, panelCtx.i);
    pushUndo();
    for (var i = rg.a; i <= rg.b; i++) {
        sig.cells[i].text = el.wvPanelText.value;
        sig.cells[i].fill = curBlockColor;
    }
    closePanel();
    commit();
});
el.wvPanelDel.addEventListener('click', function () {
    if (!panelCtx) return;
    var sig = state.signals[panelCtx.r];
    var rg = blockRange(sig, panelCtx.i);
    pushUndo();
    for (var i = rg.a; i <= rg.b; i++) sig.cells[i] = mkCell('0');
    closePanel();
    commit();
});
buildSwatches(el.wvPanelColors, function (c) { curBlockColor = c; markSwatch(el.wvPanelColors, c); });

/* ============================================
   工具栏：结构
   ============================================ */
el.addSig.addEventListener('click', function () {
    pushUndo();
    var a = []; for (var i = 0; i < state.slots; i++) a.push(mkCell('0'));
    state.signals.push({ id: uid(), name: 'sig' + state.signals.length, kind: 'sig', cells: a, fillRegions: [] });
    commit();
});
el.addBus.addEventListener('click', function () {
    pushUndo();
    var a = []; for (var i = 0; i < state.slots; i++) a.push(mkCell('0'));
    state.signals.push({ id: uid(), name: 'bus' + state.signals.length, kind: 'bus', cells: a, fillRegions: [] });
    commit();
});
el.addClk.addEventListener('click', function () {
    pushUndo();
    var a = []; for (var i = 0; i < state.slots; i++) a.push(mkCell(i % 2 === 0 ? '0' : '1'));
    state.signals.push({ id: uid(), name: 'clk' + state.signals.length, kind: 'clk', cells: a, fillRegions: [] });
    commit();
});
el.delSig.addEventListener('click', function () {
    var r = selRange();
    if (!r) { el.selInfo.textContent = '请先点击要删除信号行中的任意槽位'; return; }
    if (state.signals.length <= 1) { el.selInfo.textContent = '至少保留一行信号'; return; }
    pushUndo();
    state.signals.splice(r.sig, 1);
    sel = null;
    commit();
});
el.mvUp.addEventListener('click', function () {
    var r = selRange();
    if (!r || r.sig === 0) { el.selInfo.textContent = r ? '已在顶部' : '请先点击选中要移动的信号行'; return; }
    pushUndo();
    var t = state.signals[r.sig];
    state.signals.splice(r.sig, 1);
    state.signals.splice(r.sig - 1, 0, t);
    sel.sig = r.sig - 1;
    commit();
});
el.mvDown.addEventListener('click', function () {
    var r = selRange();
    if (!r || r.sig >= state.signals.length - 1) { el.selInfo.textContent = r ? '已在底部' : '请先点击选中要移动的信号行'; return; }
    pushUndo();
    var t = state.signals[r.sig];
    state.signals.splice(r.sig, 1);
    state.signals.splice(r.sig + 1, 0, t);
    sel.sig = r.sig + 1;
    commit();
});

/* +/− 周期：全局槽数 ±2（1 周期 = 2 槽），所有信号同步 */
el.addPer.addEventListener('click', function () {
    if (state.slots >= 120) { el.selInfo.textContent = '已达上限 60 周期'; return; }
    pushUndo();
    state.signals.forEach(function (g) {
        var last = g.cells[g.cells.length - 1];
        var c1 = mkCell(last.v, last.edge), c2 = mkCell(last.v, last.edge);
        c1.text = last.text; c1.fill = last.fill; c2.text = last.text; c2.fill = last.fill;
        if (g.kind === 'clk') { c1.v = last.v === '0' ? '1' : '0'; c2.v = last.v; }
        g.cells.push(c1, c2);
    });
    state.slots += 2;
    commit();
});
el.delPer.addEventListener('click', function () {
    if (state.slots <= 4) { el.selInfo.textContent = '至少保留 2 周期'; return; }
    pushUndo();
    state.slots -= 2;
    state.signals.forEach(function (g) {
        g.cells.length = state.slots;
        g.fillRegions = g.fillRegions.filter(function (fr) { return fr.from < state.slots; })
            .map(function (fr) { return { from: fr.from, to: Math.min(fr.to, state.slots - 1), color: fr.color }; });
    });
    commit();
});

/* ============================================
   工具栏：电平与沿
   ============================================ */
function setLvl(v) {
    if (!selRange()) { el.selInfo.textContent = '请先点击波形选择槽位'; return; }
    pushUndo();
    forSelCells(function (c) { c.v = v; });
    commit();
}
el.set0.addEventListener('click', function () { setLvl('0'); });
el.set1.addEventListener('click', function () { setLvl('1'); });
el.setZ.addEventListener('click', function () { setLvl('z'); });
el.setX.addEventListener('click', function () { setLvl('x'); });

function setEdge(edge) {
    if (!selRange()) { el.selInfo.textContent = '请先点击波形选择槽位'; return; }
    pushUndo();
    forSelCells(function (c) { c.edge = edge; });
    commit();
    el.selInfo.textContent = edge === 'slope'
        ? '已将选区设为斜坡沿（非理想）—— 在 0↔1 等跳变处显示为斜线'
        : '已将选区设为理想沿 —— 跳变处显示为垂直线';
}
el.edgeIdeal.addEventListener('click', function () { setEdge('ideal'); });
el.edgeSlope.addEventListener('click', function () { setEdge('slope'); });

/* ============================================
   工具栏：数据块
   ============================================ */
el.mkData.addEventListener('click', function () {
    if (!selRange()) { el.selInfo.textContent = '请先点击波形选择槽位'; return; }
    pushUndo();
    forSelCells(function (c) { c.v = 'data'; c.text = 'DATA'; c.fill = curBlockColor; });
    commit();
});
el.editData.addEventListener('click', function () {
    var r = selRange();
    if (!r) { el.selInfo.textContent = '请先点击选中一个数据块'; return; }
    var sig = state.signals[r.sig];
    for (var i = r.a; i <= r.b; i++) {
        if (sig.cells[i].v === 'data') { openPanel(r.sig, i); return; }
    }
    el.selInfo.textContent = '选区内没有数据块 —— 请先用「设为数据块」或在总线行点击槽位';
});
el.unData.addEventListener('click', function () {
    if (!selRange()) { el.selInfo.textContent = '请先点击波形选择槽位'; return; }
    pushUndo();
    forSelCells(function (c) { if (c.v === 'data') { c.v = '0'; c.text = ''; c.fill = ''; } });
    commit();
});
buildSwatches(el.blockColors, function (c) {
    curBlockColor = c;
    markSwatch(el.blockColors, c);
    /* 同步应用到选区内 data 槽 */
    var r = selRange();
    if (!r) return;
    var has = false, sig = state.signals[r.sig];
    for (var i = r.a; i <= r.b; i++) if (sig.cells[i].v === 'data') has = true;
    if (has) {
        pushUndo();
        for (var j = r.a; j <= r.b; j++) if (sig.cells[j].v === 'data') sig.cells[j].fill = c;
        commit();
    }
});

/* ============================================
   工具栏：区域填色
   ============================================ */
buildSwatches(el.fillColors, function (c) { curFillColor = c; markSwatch(el.fillColors, c); });
el.applyFill.addEventListener('click', function () {
    var r = selRange();
    if (!r) { el.selInfo.textContent = '请先点击选中要填色的槽位（可 Shift+点击扩展选区）'; return; }
    pushUndo();
    state.signals[r.sig].fillRegions.push({ from: r.a, to: r.b, color: curFillColor });
    commit();
});
el.clearFill.addEventListener('click', function () {
    var r = selRange();
    if (!r) { el.selInfo.textContent = '请先点击选中要清除填色的槽位'; return; }
    var sig = state.signals[r.sig];
    pushUndo();
    sig.fillRegions = sig.fillRegions.filter(function (fr) { return fr.to < r.a || fr.from > r.b; });
    commit();
});

/* ============================================
   工具栏：文件（导出 / 撤销 / 重置）
   ============================================ */
function download(href, name) {
    var a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

el.expSvg.addEventListener('click', function () {
    var str = buildSvg(false, true);
    var blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    download(url, 'waveform.svg');
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
});

function svgToCanvas(cb) {
    var str = buildSvg(false, true);
    var img = new Image();
    var url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = function () {
        var w = img.naturalWidth || (NAME_W + state.slots * SW + 16);
        var h = img.naturalHeight || (AXIS_H + state.signals.length * RH + 12);
        var cv = document.createElement('canvas');
        cv.width = w * 2;
        cv.height = h * 2;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        cb(cv);
    };
    img.onerror = function () {
        URL.revokeObjectURL(url);
        el.selInfo.textContent = '导出失败：SVG 栅格化出错';
    };
    img.src = url;
}

el.expPng.addEventListener('click', function () {
    svgToCanvas(function (cv) { download(cv.toDataURL('image/png'), 'waveform.png'); });
});
el.expPdf.addEventListener('click', function () {
    svgToCanvas(function (cv) { downloadPdfFromCanvas(cv, 'waveform.pdf'); });
});

el.undoBtn.addEventListener('click', doUndo);
el.redoBtn.addEventListener('click', doRedo);
window.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); }
});

el.resetBtn.addEventListener('click', function () {
    if (!confirm('重置为默认示例？当前全部编辑内容将丢失。')) return;
    pushUndo();
    state = defaultState();
    sel = null;
    commit();
});

/* 点击弹层外部时关闭 */
document.addEventListener('click', function (e) {
    if (!panelCtx) return;
    if (el.wvPanel.contains(e.target)) return;
    if (e.target.classList && e.target.classList.contains('wv-hit')) return;   // 波形点击走自己的逻辑
    closePanel();
});

/* ---- 初始化 ---- */
markSwatch(el.blockColors, curBlockColor);
markSwatch(el.fillColors, curFillColor);
render();

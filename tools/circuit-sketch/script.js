/* tools/circuit-sketch/script.js
   电路示意图编辑器：单页 SVG 编辑器（无框架）
   器件 = razavi 符号库（render.js 渲染）+ 绘图辅助；连线 = polyline；自由文字 = label
   10px 网格；依赖 razavi/razavi-symbols.js + razavi/render.js + razavi/figures.js */

'use strict';

var GRID = 10;
var FONT = "'Fira Code',monospace";
var svg = document.getElementById('ckCanvas');
var layerMain = document.getElementById('layerMain');
var layerOverlay = document.getElementById('layerOverlay');
var wrap = document.getElementById('ckWrap');
var statusEl = document.getElementById('ckStatus');

function snap(v) { return Math.round(v / GRID) * GRID; }
var _uid = 1;
function uid() { return 'i' + (_uid++); }

/* ============================================
   符号库（Razavi.metaAll：palette 器件 + 绘图辅助）
   ============================================ */
var SYMBOLS = Razavi.metaAll();

/* 放置器件时的默认文字标签 */
var DEFAULT_TEXT = {
    nmos: 'M1', pmos: 'M1', npn: 'Q1', pnp: 'Q1',
    resistor: 'R1', 'variable-resistor': 'R1',
    capacitor: 'C1', 'variable-capacitor': 'C1',
    'inductor-compact': 'L1', inductor: 'L1', 'variable-inductor': 'L1',
    diode: 'D1', 'zener-diode': 'D1',
    'voltage-source': 'V1', 'current-source': 'I1', 'pulse-voltage-source': 'V1',
    'simple-switch': 'S1', 'closed-switch': 'S1', 'ideal-switch': 'S1',
    'spdt-switch': 'S1', 'voltage-controlled-switch': 'S1',
    opamp: 'A1', 'opamp-lettered': 'A1', 'opamp-differential': 'A1',
    comparator: 'A1', 'comparator-unmarked': 'A1',
    'voltage-amplifier': 'A1', 'voltage-amplifier-lettered': 'A1',
    adc: 'ADC1', dac: 'DAC1',
    inverter: 'U1', buffer: 'U1', 'and-gate': 'U1', 'nand-gate': 'U1',
    'or-gate': 'U1', 'nor-gate': 'U1', 'xor-gate': 'U1', 'xnor-gate': 'U1',
    'd-flip-flop': 'U1', 'd-flip-flop-q': 'U1', 'delay-cell': 'U1',
    adder: 'U1', multiplier: 'U1', transconductance: 'Gm1',
    integrator: 'U1', 'discrete-time-integrator': 'U1', 'unit-delay': 'U1', quantizer: 'U1',
    port: 'P1', 'port-filled': 'P1',
    'transformer-4t': 'T1', 'transformer-6t': 'T1', 'transformer-6t-ct': 'T1',
    block: 'BLOCK', mux: 'MUX'
};

/* 旧版（v1）类型名 → razavi 符号 id，存档迁移用 */
var TYPE_MIGRATE = {
    res: 'resistor', cap: 'capacitor',
    vsrc: 'voltage-source', isrc: 'current-source',
    gnd: 'ground', vdd: 'vdd-port',
    opamp: 'opamp', sw: 'simple-switch',
    nmos: 'nmos', pmos: 'pmos', diode: 'diode'
};

/* ============================================
   文档模型与状态
   items: [{kind:'comp', id, type, x, y, rot, fh, fv, variant, text, stroke, sw, dash}
           {kind:'wire', id, pts:[{x,y}...], stroke, sw, dash}
           {kind:'label', id, x, y, text, anchor, size, stroke}]
   ============================================ */
var doc = { items: [], groups: [] };
var sel = [];
var tool = 'select';           // select / wire / label
var wireMode = 'orth';         // 连线走线：orth 正交 / diag 斜线
var drag = null;
var wireStart = null;
var hoverPort = null;
var clipboard = [];
var undoStack = [], redoStack = [];
var LS_KEY = 'ee-circuit-sketch-v2';
var LS_KEY_V1 = 'ee-circuit-sketch-v1';
var hintMsg = '';              // 状态栏常驻提示（如迁移/载入标准图）
var suppressSave = false;      // ?fig= 载入后、首次编辑前不覆盖本地存档

function byId(id) {
    for (var i = 0; i < doc.items.length; i++) if (doc.items[i].id === id) return doc.items[i];
    return null;
}
function selItems() { return sel.map(byId).filter(Boolean); }
function groupOf(id) {
    for (var i = 0; i < doc.groups.length; i++) {
        if (doc.groups[i].members.indexOf(id) >= 0) return doc.groups[i];
    }
    return null;
}
/* 命中项所属组展开为选择集 */
function expandSel(id) {
    var g = groupOf(id);
    return g ? g.members.slice() : [id];
}

/* ============================================
   几何工具（端口/包围盒委托 Razavi 渲染器）
   ============================================ */
function portsOf(c) { return Razavi.ports(c.type, c.variant); }

function portWorld(c, p) {
    var sx = c.fh ? -1 : 1, sy = c.fv ? -1 : 1;
    var px = p.x * sx, py = p.y * sy;
    var th = c.rot * Math.PI / 2;
    var cos = Math.round(Math.cos(th)), sin = Math.round(Math.sin(th));
    return { x: c.x + cos * px - sin * py, y: c.y + sin * px + cos * py, n: p.n, comp: c };
}

function allPorts() {
    var out = [];
    doc.items.forEach(function (it) {
        if (it.kind !== 'comp') return;
        portsOf(it).forEach(function (p) { out.push(portWorld(it, p)); });
    });
    return out;
}

function nearestPort(x, y, r) {
    var best = null, bd = r * r;
    allPorts().forEach(function (p) {
        var d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (d <= bd) { bd = d; best = p; }
    });
    return best;
}

/* 世界点 → 器件局部坐标 */
function toLocal(c, x, y) {
    var dx = x - c.x, dy = y - c.y;
    var th = -c.rot * Math.PI / 2;
    var cos = Math.round(Math.cos(th)), sin = Math.round(Math.sin(th));
    var lx = cos * dx - sin * dy, ly = sin * dx + cos * dy;
    if (c.fh) lx = -lx;
    if (c.fv) ly = -ly;
    return { x: lx, y: ly };
}

function itemBBox(it) { return Razavi.itemBBox(it); }

function compHit(c, x, y, tol) {
    var l = toLocal(c, x, y);
    var b = Razavi.bboxArr(c.type);
    var t = tol || 3;
    return l.x >= b[0] - t && l.x <= b[2] + t && l.y >= b[1] - t && l.y <= b[3] + t;
}

function labelHit(it, x, y) {
    var b = Razavi.labelBBox(it);
    return x >= b.x0 - 2 && x <= b.x1 + 2 && y >= b.y0 - 2 && y <= b.y1 + 2;
}

function distToSeg(px, py, a, b) {
    var vx = b.x - a.x, vy = b.y - a.y;
    var len2 = vx * vx + vy * vy;
    var t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / len2));
    var dx = px - (a.x + t * vx), dy = py - (a.y + t * vy);
    return Math.sqrt(dx * dx + dy * dy);
}

/* 命中连线段：返回 {wire, seg} 或 null */
function wireHit(x, y, tol) {
    for (var i = doc.items.length - 1; i >= 0; i--) {
        var it = doc.items[i];
        if (it.kind !== 'wire') continue;
        for (var s = 0; s < it.pts.length - 1; s++) {
            if (distToSeg(x, y, it.pts[s], it.pts[s + 1]) <= tol) return { wire: it, seg: s };
        }
    }
    return null;
}

/* 顶向下的命中：器件 → 标注 → 连线 */
function hitItem(x, y) {
    var i, it;
    for (i = doc.items.length - 1; i >= 0; i--) {
        it = doc.items[i];
        if (it.kind === 'comp' && compHit(it, x, y)) return it;
    }
    for (i = doc.items.length - 1; i >= 0; i--) {
        it = doc.items[i];
        if (it.kind === 'label' && labelHit(it, x, y)) return it;
    }
    var wh = wireHit(x, y, 5);
    return wh ? wh.wire : null;
}

function moveItem(it, dx, dy) {
    if (it.kind === 'wire') it.pts.forEach(function (p) { p.x += dx; p.y += dy; });
    else { it.x += dx; it.y += dy; }
}

/* ============================================
   渲染
   ============================================ */
function render() {
    var html = '';
    doc.items.forEach(function (it) { html += Razavi.itemSvg(it, { font: FONT, stroke: '#1a1a1a' }); });
    layerMain.innerHTML = html;
    renderOverlay();
    renderProps();
    saveLocal();
}

function renderOverlay() {
    var s = '';
    /* 选中框 */
    selItems().forEach(function (it) {
        var b = itemBBox(it);
        s += '<rect x="' + (b.x0 - 5) + '" y="' + (b.y0 - 5) + '" width="' + (b.x1 - b.x0 + 10) + '" height="' + (b.y1 - b.y0 + 10) + '"' +
            ' fill="none" stroke="#c0583a" stroke-width="1.2" stroke-dasharray="4 3" pointer-events="none"/>';
    });
    /* 连线模式：全部端口提示 */
    if (tool === 'wire') {
        allPorts().forEach(function (p) {
            s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="2.5" fill="#8a8a8a" pointer-events="none"/>';
        });
    }
    /* 吸附端口高亮 */
    if (hoverPort) {
        s += '<circle cx="' + hoverPort.x + '" cy="' + hoverPort.y + '" r="7" fill="none" stroke="#c0583a" stroke-width="2" pointer-events="none"/>';
    }
    /* 连线预览 */
    if (wireStart && wireStart.cur) {
        s += '<polyline points="' + wirePath(wireStart, wireStart.cur).map(function (p) { return p.x + ',' + p.y; }).join(' ') + '"' +
            ' fill="none" stroke="#c0583a" stroke-width="1.5" stroke-dasharray="6 4" pointer-events="none"/>';
    }
    /* 框选矩形 */
    if (drag && drag.type === 'marquee') {
        var x0 = Math.min(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1);
        s += '<rect x="' + x0 + '" y="' + y0 + '" width="' + Math.abs(drag.x1 - drag.x0) + '" height="' + Math.abs(drag.y1 - drag.y0) + '"' +
            ' fill="rgba(58,90,140,0.08)" stroke="#3a5a8c" stroke-width="1" stroke-dasharray="4 3" pointer-events="none"/>';
    }
    layerOverlay.innerHTML = s;
}

/* Manhattan 路径：起点 → 拐点 → 终点（先水平后垂直），共线去重 */
function manhattan(a, b) {
    var pts = [{ x: a.x, y: a.y }];
    if (a.x !== b.x && a.y !== b.y) pts.push({ x: b.x, y: a.y });
    pts.push({ x: b.x, y: b.y });
    return pts;
}

/* 按当前走线模式生成路径：斜线 = 两点直 polyline */
function wirePath(a, b) {
    if (wireMode === 'diag') return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    return manhattan(a, b);
}

/* ============================================
   撤销 / 重做（快照命令栈，上限 50）
   ============================================ */
function pushUndo() {
    suppressSave = false;    // 有真实编辑动作，允许写回本地存档
    undoStack.push(JSON.stringify(doc));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
}
function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(doc));
    doc = JSON.parse(undoStack.pop());
    sel = [];
    hintMsg = '';
    render();
    setStatus('');
}
function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(doc));
    doc = JSON.parse(redoStack.pop());
    sel = [];
    hintMsg = '';
    render();
    setStatus('');
}

/* ============================================
   坐标换算与吸附
   ============================================ */
function evPos(e) {
    var r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function snapPort(x, y) {
    var p = nearestPort(x, y, 20);
    return p ? { x: p.x, y: p.y } : { x: snap(x), y: snap(y) };
}

function setStatus(extra) {
    statusEl.textContent = (hintMsg ? '｜ ' + hintMsg + ' ' : '') + (extra || '');
}

/* ============================================
   画布鼠标交互
   ============================================ */
svg.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    var pos = evPos(e);

    /* ---- 连线模式 ---- */
    if (tool === 'wire') {
        var pt = snapPort(pos.x, pos.y);
        if (!wireStart) {
            wireStart = pt;
        } else {
            if (pt.x !== wireStart.x || pt.y !== wireStart.y) {
                pushUndo();
                doc.items.push({ kind: 'wire', id: uid(), pts: wirePath(wireStart, pt), stroke: '#1a1a1a', sw: 1.5, dash: '' });
            }
            wireStart = null;
        }
        render();
        return;
    }

    /* ---- 标注模式 ---- */
    if (tool === 'label') {
        var lt = prompt('标注文字：', '');
        if (lt !== null && lt !== '') {
            pushUndo();
            var lb = { kind: 'label', id: uid(), x: snap(pos.x), y: snap(pos.y),
                text: lt, anchor: 'start', size: 13, stroke: '#1a1a1a' };
            doc.items.push(lb);
            sel = [lb.id];
        }
        render();
        return;
    }

    /* ---- 选择模式 ---- */
    var hit = hitItem(pos.x, pos.y);
    if (hit) {
        var ids = expandSel(hit.id);
        if (e.ctrlKey || e.metaKey) {                       // Ctrl+单击：切换多选
            var allIn = ids.every(function (id) { return sel.indexOf(id) >= 0; });
            if (allIn) sel = sel.filter(function (id) { return ids.indexOf(id) < 0; });
            else ids.forEach(function (id) { if (sel.indexOf(id) < 0) sel.push(id); });
            render();
            return;
        }
        var alreadySel = ids.every(function (id) { return sel.indexOf(id) >= 0; });
        if (!alreadySel) sel = ids;

        /* 唯一选中一条连线时点其段 → 拖段（水平/垂直段平移，邻段自动伸缩） */
        if (hit.kind === 'wire' && sel.length === 1) {
            var wh = wireHit(pos.x, pos.y, 5);
            if (wh) {
                var p0 = wh.wire.pts[wh.seg], p1 = wh.wire.pts[wh.seg + 1];
                if (p0.x === p1.x || p0.y === p1.y) {
                    drag = { type: 'seg', wire: wh.wire, seg: wh.seg, horiz: p0.y === p1.y,
                        origPts: wh.wire.pts.map(function (p) { return { x: p.x, y: p.y }; }), pushed: false };
                    render();
                    return;
                }
            }
        }

        /* 整体移动 */
        drag = {
            type: 'move', startX: pos.x, startY: pos.y, pushed: false,
            orig: selItems().map(function (it) {
                return it.kind === 'wire' ?
                    { it: it, pts: it.pts.map(function (p) { return { x: p.x, y: p.y }; }) } :
                    { it: it, x: it.x, y: it.y };
            })
        };
        render();
    } else {
        /* 空白：框选 */
        drag = { type: 'marquee', x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y, ctrl: e.ctrlKey || e.metaKey };
        if (!drag.ctrl) { sel = []; render(); }
        else renderOverlay();
    }
});

window.addEventListener('mousemove', function (e) {
    var pos = evPos(e);

    /* 连线模式：端口吸附提示 + 预览 */
    if (tool === 'wire') {
        hoverPort = nearestPort(pos.x, pos.y, 20);
        if (wireStart) wireStart.cur = snapPort(pos.x, pos.y);
        setStatus('｜ (' + snap(pos.x) + ', ' + snap(pos.y) + ')' + (wireStart ? ' 点击完成连线，Esc 取消' : ' 点击放置连线起点'));
        renderOverlay();
        return;
    }
    if (tool === 'label') {
        setStatus('｜ (' + snap(pos.x) + ', ' + snap(pos.y) + ') 点击放置标注，Esc 退出');
        return;
    }

    setStatus('｜ (' + snap(pos.x) + ', ' + snap(pos.y) + ')');
    if (!drag) return;

    if (drag.type === 'move') {
        var dx = snap(pos.x - drag.startX), dy = snap(pos.y - drag.startY);
        if ((dx || dy) && !drag.pushed) { pushUndo(); drag.pushed = true; }
        drag.orig.forEach(function (o) {
            if (o.it.kind === 'wire') o.it.pts = o.pts.map(function (p) { return { x: p.x + dx, y: p.y + dy }; });
            else { o.it.x = o.x + dx; o.it.y = o.y + dy; }
        });
        render();
    } else if (drag.type === 'seg') {
        var w = drag.wire;
        var nv = drag.horiz ? snap(pos.y) : snap(pos.x);
        var cur = drag.horiz ? w.pts[drag.seg].y : w.pts[drag.seg].x;
        if (nv !== cur && !drag.pushed) { pushUndo(); drag.pushed = true; }
        w.pts = drag.origPts.map(function (p) { return { x: p.x, y: p.y }; });
        if (drag.horiz) { w.pts[drag.seg].y = nv; w.pts[drag.seg + 1].y = nv; }
        else { w.pts[drag.seg].x = nv; w.pts[drag.seg + 1].x = nv; }
        render();
    } else if (drag.type === 'marquee') {
        drag.x1 = pos.x; drag.y1 = pos.y;
        renderOverlay();
    }
});

window.addEventListener('mouseup', function () {
    if (!drag) return;
    if (drag.type === 'marquee') {
        var rx0 = Math.min(drag.x0, drag.x1), rx1 = Math.max(drag.x0, drag.x1);
        var ry0 = Math.min(drag.y0, drag.y1), ry1 = Math.max(drag.y0, drag.y1);
        if (rx1 - rx0 > 4 || ry1 - ry0 > 4) {
            var out = [];
            doc.items.forEach(function (it) {
                var b = itemBBox(it);
                if (b.x0 <= rx1 && b.x1 >= rx0 && b.y0 <= ry1 && b.y1 >= ry0) {
                    expandSel(it.id).forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
                }
            });
            if (drag.ctrl) out.forEach(function (id) { if (sel.indexOf(id) < 0) sel.push(id); });
            else sel = out;
        }
    }
    drag = null;
    render();
});

/* 双击编辑文字（器件标签 / 自由标注） */
svg.addEventListener('dblclick', function (e) {
    if (tool !== 'select') return;
    var pos = evPos(e);
    var hit = hitItem(pos.x, pos.y);
    if (!hit) return;
    if (hit.kind === 'label') {
        var t0 = prompt('标注文字：', hit.text || '');
        if (t0 !== null) { pushUndo(); hit.text = t0; render(); }
        return;
    }
    if (hit.kind === 'comp' && Razavi.textPos(hit.type) !== 'none') {
        var t = prompt('文字标签：', hit.text || '');
        if (t !== null) { pushUndo(); hit.text = t; render(); }
    }
});

/* ============================================
   器件面板：11 个可折叠分组（10 个 razavi 分类 + 绘图辅助）
   拖放或点击放置
   ============================================ */
var palList = document.getElementById('palList');
var ghost = document.createElement('div');
ghost.id = 'ckGhost';
document.body.appendChild(ghost);

/* 预览用 currentColor 承接主题色（SVG 表现属性不支持 var()，借 color 传递） */
function palPreview(type) {
    var m = Razavi.meta(type);
    var b = m.bbox, pad = 6;
    var vb = (b[0] - pad) + ' ' + (b[1] - pad) + ' ' + (b[2] - b[0] + 2 * pad) + ' ' + (b[3] - b[1] + 2 * pad);
    var inner;
    if (m.razavi) {
        inner = Razavi.symbolInner(type, { stroke: 'currentColor', sw: 1.5, textColor: 'currentColor', showPinNames: false });
    } else {
        inner = '<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
            Razavi.AUX[type].body({ stroke: 'currentColor' }) + '</g>';
    }
    return '<svg width="56" height="40" viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" style="color:var(--color-border-sketch)">' + inner + '</svg>';
}

function palGroup(name, ids, isAux) {
    var s = '<div class="pal-group' + (isAux ? ' pal-aux' : '') + '">' +
        '<div class="pal-group-hd"><span class="pal-arrow">▾</span>' + Razavi.esc(name) +
        '<span class="pal-count">' + ids.length + '</span></div><div class="pal-grid">';
    ids.forEach(function (id) {
        var m = Razavi.meta(id);
        s += '<div class="pal-item" data-type="' + id + '" title="' + Razavi.esc(m.nameZh + ' / ' + m.name) + '">' +
            palPreview(id) + '<span>' + Razavi.esc(m.nameZh) + '</span></div>';
    });
    return s + '</div></div>';
}

function buildPalette() {
    var s = '';
    Razavi.CATS.forEach(function (cat) {
        var ids = [];
        Razavi.CATALOG.forEach(function (e) { if (e.palette && e.category === cat.id) ids.push(e.id); });
        if (ids.length) s += palGroup(cat.name, ids, false);
    });
    s += palGroup('绘图辅助', Razavi.AUX_ORDER.slice(), true);
    palList.innerHTML = s;
    Array.prototype.forEach.call(palList.querySelectorAll('.pal-group-hd'), function (hd) {
        hd.addEventListener('click', function () { hd.parentNode.classList.toggle('collapsed'); });
    });
    Array.prototype.forEach.call(palList.querySelectorAll('.pal-item'), function (el) {
        bindPalItem(el, el.getAttribute('data-type'));
    });
}

function bindPalItem(div, type) {
    div.addEventListener('mousedown', function (e) {
        e.preventDefault();
        ghost.innerHTML = palPreview(type);
        ghost.style.display = 'block';
        ghost.style.left = (e.clientX + 12) + 'px';
        ghost.style.top = (e.clientY + 12) + 'px';
        var sx = e.clientX, sy = e.clientY;
        function mv(ev) {
            ghost.style.left = (ev.clientX + 12) + 'px';
            ghost.style.top = (ev.clientY + 12) + 'px';
        }
        function up(ev) {
            window.removeEventListener('mousemove', mv);
            window.removeEventListener('mouseup', up);
            ghost.style.display = 'none';
            var r = svg.getBoundingClientRect();
            var x, y;
            if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) {
                /* 单击：放到画布可见区中心 */
                x = snap(wrap.scrollLeft + wrap.clientWidth / 2);
                y = snap(wrap.scrollTop + wrap.clientHeight / 2);
            } else if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
                x = snap(ev.clientX - r.left);
                y = snap(ev.clientY - r.top);
            } else return;
            addComp(type, x, y);
        }
        window.addEventListener('mousemove', mv);
        window.addEventListener('mouseup', up);
    });
}

function addComp(type, x, y) {
    pushUndo();
    var c = { kind: 'comp', id: uid(), type: type, x: x, y: y, rot: 0, fh: false, fv: false,
        text: DEFAULT_TEXT[type] || '', stroke: '#1a1a1a', sw: 1.5, dash: '' };
    doc.items.push(c);
    sel = [c.id];
    render();
}

/* ============================================
   文档规范化与迁移
   ============================================ */
function normalizeItem(it) {
    if (!it.id) it.id = uid();
    if (it.kind === 'wire') {
        it.stroke = it.stroke || '#1a1a1a';
        it.sw = it.sw || 1.5;
        it.dash = it.dash || '';
    } else if (it.kind === 'label') {
        it.text = it.text || '';
        it.anchor = it.anchor || 'start';
        it.size = it.size || 13;
        it.stroke = it.stroke || '#1a1a1a';
    } else {
        it.kind = 'comp';
        it.rot = it.rot || 0;
        it.fh = !!it.fh; it.fv = !!it.fv;
        it.text = it.text || '';
        it.stroke = it.stroke || '#1a1a1a';
        it.sw = it.sw || 1.5;
        it.dash = it.dash || '';
    }
}

function normalizeDoc(d) {
    d.items = d.items || [];
    d.groups = d.groups || [];
    d.items.forEach(normalizeItem);
    /* uid 种子越过已有 id，避免冲突 */
    d.items.forEach(function (it) {
        var m = /^i(\d+)$/.exec(it.id);
        if (m) _uid = Math.max(_uid, parseInt(m[1], 10) + 1);
    });
    return d;
}

/* 旧版文档迁移：类型名映射，坐标不变；返回是否有迁移动作 */
function migrateDoc(d) {
    var migrated = false;
    (d.items || []).forEach(function (it) {
        if (it.kind === 'comp' && TYPE_MIGRATE[it.type]) {
            it.type = TYPE_MIGRATE[it.type];
            migrated = true;
        }
    });
    return migrated;
}

/* ============================================
   模板：共享标准图（RAZAVI_FIGURES）深拷贝插入画布中心并自动成组
   ============================================ */
function insertFigure(key) {
    var fig = window.RAZAVI_FIGURES && RAZAVI_FIGURES[key];
    if (!fig) return;
    var cx = snap(wrap.scrollLeft + wrap.clientWidth / 2);
    var cy = snap(wrap.scrollTop + wrap.clientHeight / 2);
    var b = Razavi.docBBox(fig.doc);
    var dx = cx - snap((b.x0 + b.x1) / 2);
    var dy = cy - snap((b.y0 + b.y1) / 2);
    pushUndo();
    var ids = [];
    var items = JSON.parse(JSON.stringify(fig.doc.items));
    items.forEach(function (it) {
        normalizeItem(it);
        moveItem(it, dx, dy);
        doc.items.push(it);
        ids.push(it.id);
    });
    sel = ids;
    if (ids.length >= 2) doc.groups.push({ id: uid(), members: ids.slice() });
    hintMsg = '已插入模板「' + fig.name + '」，自动成组可整体拖动';
    render();
}

document.querySelectorAll('.ck-tpl-list [data-tpl]').forEach(function (btn) {
    btn.addEventListener('click', function () { insertFigure(btn.getAttribute('data-tpl')); });
});

/* ============================================
   编辑操作：旋转/镜像/对齐/均布/分组/图层/复制/删除
   ============================================ */
function selBBox() {
    var items = selItems();
    if (!items.length) return null;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    items.forEach(function (it) {
        var b = itemBBox(it);
        x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
        x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    });
    return { x0: x0, y0: y0, x1: x1, y1: y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/* 旋转/镜像：绕选区 bbox 中心（吸附网格），器件自身同步旋转/翻转 */
function transformSel(kind) {
    var items = selItems();
    if (!items.length) return;
    var bb = selBBox();
    var cx = snap(bb.cx), cy = snap(bb.cy);
    pushUndo();
    items.forEach(function (it) {
        if (it.kind === 'wire') {
            it.pts.forEach(function (p) {
                if (kind === 'rot') { var dx = p.x - cx, dy = p.y - cy; p.x = cx - dy; p.y = cy + dx; }
                else if (kind === 'fh') p.x = 2 * cx - p.x;
                else p.y = 2 * cy - p.y;
            });
        } else {
            if (kind === 'rot') { var ddx = it.x - cx, ddy = it.y - cy; it.x = cx - ddy; it.y = cy + ddx; if (it.kind === 'comp') it.rot = (it.rot + 1) % 4; }
            else if (kind === 'fh') { it.x = 2 * cx - it.x; if (it.kind === 'comp') it.fh = !it.fh; }
            else { it.y = 2 * cy - it.y; if (it.kind === 'comp') it.fv = !it.fv; }
        }
    });
    render();
}

function alignSel(kind) {
    var items = selItems();
    if (items.length < 2) return;
    pushUndo();
    var bbs = items.map(itemBBox);
    function minOf(f) { return Math.min.apply(null, bbs.map(f)); }
    function maxOf(f) { return Math.max.apply(null, bbs.map(f)); }
    var target;
    if (kind === 'l') target = minOf(function (b) { return b.x0; });
    else if (kind === 'r') target = maxOf(function (b) { return b.x1; });
    else if (kind === 't') target = minOf(function (b) { return b.y0; });
    else if (kind === 'b') target = maxOf(function (b) { return b.y1; });
    else if (kind === 'cx') target = (minOf(function (b) { return b.x0; }) + maxOf(function (b) { return b.x1; })) / 2;
    else target = (minOf(function (b) { return b.y0; }) + maxOf(function (b) { return b.y1; })) / 2;
    items.forEach(function (it, i) {
        var b = bbs[i], dx = 0, dy = 0;
        if (kind === 'l') dx = target - b.x0;
        else if (kind === 'r') dx = target - b.x1;
        else if (kind === 'cx') dx = target - (b.x0 + b.x1) / 2;
        else if (kind === 't') dy = target - b.y0;
        else if (kind === 'b') dy = target - b.y1;
        else dy = target - (b.y0 + b.y1) / 2;
        moveItem(it, snap(dx), snap(dy));
    });
    render();
}

function distributeSel(axis) {
    var items = selItems();
    if (items.length < 3) return;
    pushUndo();
    var arr = items.map(function (it) {
        var b = itemBBox(it);
        return { it: it, c: axis === 'h' ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2 };
    });
    arr.sort(function (a, b) { return a.c - b.c; });
    var first = arr[0].c, last = arr[arr.length - 1].c;
    var step = (last - first) / (arr.length - 1);
    arr.forEach(function (o, i) {
        if (i === 0 || i === arr.length - 1) return;
        var d = snap(first + step * i - o.c);
        if (axis === 'h') moveItem(o.it, d, 0); else moveItem(o.it, 0, d);
    });
    render();
}

function groupSel() {
    if (sel.length < 2) return;
    pushUndo();
    doc.groups = doc.groups.filter(function (g) {
        return !g.members.some(function (id) { return sel.indexOf(id) >= 0; });
    });
    doc.groups.push({ id: uid(), members: sel.slice() });
    render();
}

function ungroupSel() {
    var hit = doc.groups.some(function (g) {
        return g.members.some(function (id) { return sel.indexOf(id) >= 0; });
    });
    if (!hit) return;
    pushUndo();
    doc.groups = doc.groups.filter(function (g) {
        return !g.members.some(function (id) { return sel.indexOf(id) >= 0; });
    });
    render();
}

function zOrder(kind) {
    if (!sel.length) return;
    pushUndo();
    var items = doc.items;
    function inSel(it) { return sel.indexOf(it.id) >= 0; }
    function swap(i, j) { var t = items[i]; items[i] = items[j]; items[j] = t; }
    if (kind === 'top' || kind === 'bottom') {
        var moving = items.filter(inSel), rest = items.filter(function (it) { return !inSel(it); });
        doc.items = kind === 'top' ? rest.concat(moving) : moving.concat(rest);
    } else if (kind === 'up') {
        for (var i = items.length - 2; i >= 0; i--) if (inSel(items[i]) && !inSel(items[i + 1])) swap(i, i + 1);
    } else {
        for (var j = 1; j < items.length; j++) if (inSel(items[j]) && !inSel(items[j - 1])) swap(j, j - 1);
    }
    render();
}

function copySel() {
    var items = selItems();
    if (!items.length) return;
    clipboard = JSON.parse(JSON.stringify(items));
}

function pasteClip() {
    if (!clipboard.length) return;
    pushUndo();
    sel = [];
    clipboard.forEach(function (it) {
        var c = JSON.parse(JSON.stringify(it));
        c.id = uid();
        moveItem(c, 20, 20);
        doc.items.push(c);
        sel.push(c.id);
        moveItem(it, 20, 20);   // 连续粘贴阶梯偏移
    });
    render();
}

function delSel() {
    if (!sel.length) return;
    pushUndo();
    doc.items = doc.items.filter(function (it) { return sel.indexOf(it.id) < 0; });
    doc.groups = doc.groups.map(function (g) {
        return { id: g.id, members: g.members.filter(function (id) { return sel.indexOf(id) < 0; }) };
    }).filter(function (g) { return g.members.length > 0; });
    sel = [];
    render();
}

/* ============================================
   属性栏
   ============================================ */
var selInfo = document.getElementById('selInfo');
var propWidth = document.getElementById('propWidth');
var propColor = document.getElementById('propColor');
var propDash = document.getElementById('propDash');
var propText = document.getElementById('propText');
var propVariantRow = document.getElementById('propVariantRow');
var propVariant = document.getElementById('propVariant');

function renderProps() {
    var items = selItems();
    selInfo.textContent = items.length ? '已选中 ' + items.length + ' 项' : '未选中任何对象';
    if (!items.length) { propVariantRow.style.display = 'none'; return; }
    propWidth.value = String(items[0].sw || 1.5);
    if (items[0].stroke) propColor.value = items[0].stroke;
    propDash.value = items[0].dash || '';
    var t0 = items.filter(function (it) { return it.kind === 'comp' || it.kind === 'label'; })[0];
    propText.value = t0 ? (t0.text || '') : '';
    /* 符号变体：选中项中含可变体器件（nmos/pmos）即可用，作用于全部此类器件 */
    var varComps = items.filter(function (it) { return it.kind === 'comp' && Razavi.variantOptions(it.type); });
    if (varComps.length) {
        var opts = Razavi.variantOptions(varComps[0].type);
        propVariant.innerHTML = opts.map(function (o) {
            return '<option value="' + o.id + '">' + Razavi.esc(o.label) + '</option>';
        }).join('');
        propVariant.value = varComps[0].variant || '';
        propVariantRow.style.display = '';
    } else {
        propVariantRow.style.display = 'none';
    }
}

function applyProps(fn) {
    var items = selItems();
    if (!items.length) return;
    pushUndo();
    items.forEach(fn);
    render();
}

propWidth.addEventListener('change', function () {
    var v = parseFloat(propWidth.value);
    applyProps(function (it) { it.sw = v; });
});
propColor.addEventListener('input', function () {
    var v = propColor.value;
    applyProps(function (it) { it.stroke = v; });
});
propDash.addEventListener('change', function () {
    var v = propDash.value;
    applyProps(function (it) { it.dash = v; });
});
propText.addEventListener('change', function () {
    var v = propText.value;
    applyProps(function (it) { if (it.kind === 'comp' || it.kind === 'label') it.text = v; });
});
propVariant.addEventListener('change', function () {
    var v = propVariant.value;
    applyProps(function (it) { if (it.kind === 'comp' && Razavi.variantOptions(it.type)) it.variant = v; });
});

/* 预设色板 */
['#1a1a1a', '#3a5a8c', '#c0583a', '#4a7c59', '#8a8a8a'].forEach(function (color) {
    var d = document.createElement('div');
    d.className = 'ck-swatch';
    d.style.background = color;
    d.title = color;
    d.addEventListener('click', function () {
        propColor.value = color;
        applyProps(function (it) { it.stroke = color; });
    });
    document.getElementById('ckSwatches').appendChild(d);
});

/* ============================================
   工具栏与键盘
   ============================================ */
var toolSelect = document.getElementById('toolSelect');
var toolWire = document.getElementById('toolWire');
var toolLabelBtn = document.getElementById('toolLabel');

function setTool(t) {
    tool = t;
    wireStart = null;
    hoverPort = null;
    toolSelect.classList.toggle('btn-primary', t === 'select');
    toolWire.classList.toggle('btn-primary', t === 'wire');
    toolLabelBtn.classList.toggle('btn-primary', t === 'label');
    wrap.style.cursor = t === 'select' ? 'default' : 'crosshair';
    render();
}

toolSelect.addEventListener('click', function () { setTool('select'); });
toolWire.addEventListener('click', function () { setTool('wire'); });
toolLabelBtn.addEventListener('click', function () { setTool('label'); });
var wireModeBtn = document.getElementById('wireModeBtn');
wireModeBtn.addEventListener('click', function () {
    wireMode = wireMode === 'orth' ? 'diag' : 'orth';
    wireModeBtn.textContent = '走线：' + (wireMode === 'orth' ? '正交' : '斜线');
    if (wireStart) renderOverlay();   // 进行中的连线预览同步切换
});
document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('redoBtn').addEventListener('click', redo);
document.getElementById('copyBtn').addEventListener('click', copySel);
document.getElementById('pasteBtn').addEventListener('click', pasteClip);
document.getElementById('delBtn').addEventListener('click', delSel);
document.getElementById('rotBtn').addEventListener('click', function () { transformSel('rot'); });
document.getElementById('fhBtn').addEventListener('click', function () { transformSel('fh'); });
document.getElementById('fvBtn').addEventListener('click', function () { transformSel('fv'); });
document.getElementById('alL').addEventListener('click', function () { alignSel('l'); });
document.getElementById('alCX').addEventListener('click', function () { alignSel('cx'); });
document.getElementById('alR').addEventListener('click', function () { alignSel('r'); });
document.getElementById('alT').addEventListener('click', function () { alignSel('t'); });
document.getElementById('alCY').addEventListener('click', function () { alignSel('cy'); });
document.getElementById('alB').addEventListener('click', function () { alignSel('b'); });
document.getElementById('dsH').addEventListener('click', function () { distributeSel('h'); });
document.getElementById('dsV').addEventListener('click', function () { distributeSel('v'); });
document.getElementById('grpBtn').addEventListener('click', groupSel);
document.getElementById('ungrpBtn').addEventListener('click', ungroupSel);
document.getElementById('zTop').addEventListener('click', function () { zOrder('top'); });
document.getElementById('zUp').addEventListener('click', function () { zOrder('up'); });
document.getElementById('zDown').addEventListener('click', function () { zOrder('down'); });
document.getElementById('zBottom').addEventListener('click', function () { zOrder('bottom'); });

document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var k = e.key.toLowerCase();
    var ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (ctrl && k === 'c') { copySel(); }
    else if (ctrl && k === 'v') { pasteClip(); }
    else if (ctrl && k === 'g' && !e.shiftKey) { e.preventDefault(); groupSel(); }
    else if (ctrl && k === 'g' && e.shiftKey) { e.preventDefault(); ungroupSel(); }
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); delSel(); }
    else if (k === 'escape') {
        if (wireStart) { wireStart = null; render(); }
        else if (tool !== 'select') setTool('select');
        else if (sel.length) { sel = []; render(); }
    }
    else if (k === 'w') setTool('wire');
    else if (k === 't') setTool('label');
    else if (k === 'r') transformSel('rot');
    else if (k === 'h') transformSel('fh');
    else if (k === 'v') transformSel('fv');
});

/* ============================================
   导入 / 导出 / 持久化
   ============================================ */
function exportSvgStr(withBg) {
    return Razavi.docSvg(doc, {
        standalone: true, bg: withBg ? '#ffffff' : null, margin: 20,
        font: FONT, stroke: '#1a1a1a', textColor: '#1a1a1a'
    });
}

function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

document.getElementById('expSvg').addEventListener('click', function () {
    var r = exportSvgStr(!document.getElementById('expSvgTrans').checked);
    download('circuit.svg', new Blob([r.str], { type: 'image/svg+xml' }));
});

document.getElementById('expPng').addEventListener('click', function () {
    var trans = document.getElementById('expPngTrans').checked;
    var r = exportSvgStr(!trans);
    var img = new Image();
    img.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = r.w * 2; cv.height = r.h * 2;
        var ctx = cv.getContext('2d');
        if (!trans) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); }
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (bl) { if (bl) download('circuit.png', bl); });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.str);
});

/* 导出 PDF：白底 2x 位图（JPEG 不支持透明），走 common.js 最小 PDF 生成器 */
document.getElementById('expPdf').addEventListener('click', function () {
    var r = exportSvgStr(true);
    var img = new Image();
    img.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = r.w * 2; cv.height = r.h * 2;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        downloadPdfFromCanvas(cv, 'circuit.pdf');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.str);
});

document.getElementById('expJson').addEventListener('click', function () {
    download('circuit.json', new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
});

var impFile = document.getElementById('impFile');
document.getElementById('impJson').addEventListener('click', function () { impFile.click(); });
impFile.addEventListener('change', function () {
    var f = impFile.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
        try {
            var d = JSON.parse(rd.result);
            if (!d || !Array.isArray(d.items)) throw new Error('bad json');
            var migrated = migrateDoc(d);
            pushUndo();
            doc = normalizeDoc(d);
            sel = [];
            if (migrated) hintMsg = '导入的旧版工程已自动迁移为 Razavi 器件库';
            render();
        } catch (err) {
            alert('JSON 文件无效：' + err.message);
        }
        impFile.value = '';
    };
    rd.readAsText(f);
});

document.getElementById('clearBtn').addEventListener('click', function () {
    if (!doc.items.length) return;
    if (!confirm('确定清空整个画布？（可用 Ctrl+Z 撤销）')) return;
    pushUndo();
    doc = { items: [], groups: [] };
    sel = [];
    render();
});

function saveLocal() {
    if (suppressSave) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); } catch (e) { /* 存储满忽略 */ }
}

/* 读取本地存档：v2 优先；检测到 v1 自动迁移（v1 键保留作备份） */
function loadLocal() {
    try {
        var s = localStorage.getItem(LS_KEY);
        if (s) {
            var d = JSON.parse(s);
            if (d && Array.isArray(d.items)) { doc = normalizeDoc(d); return 'v2'; }
        }
        var s1 = localStorage.getItem(LS_KEY_V1);
        if (s1) {
            var d1 = JSON.parse(s1);
            if (d1 && Array.isArray(d1.items)) {
                migrateDoc(d1);
                doc = normalizeDoc(d1);
                return 'v1';
            }
        }
    } catch (e) { /* 损坏则使用示例 */ }
    return null;
}

/* ============================================
   初始示例（共源反相器，razavi 器件）与启动
   引脚：vdd-port P(0,+20)；pmos G(-20,0) S(+10,-20) D(+10,+20)；
        nmos G(-20,0) D(+10,-20) S(+10,+20)；ground pin(0,-10)
   ============================================ */
function sampleDoc() {
    doc = { items: [], groups: [] };
    function comp(type, x, y, extra) {
        var c = { kind: 'comp', id: uid(), type: type, x: x, y: y, rot: 0, fh: false, fv: false,
            text: '', stroke: '#1a1a1a', sw: 1.5, dash: '' };
        if (extra) Object.keys(extra).forEach(function (k) { c[k] = extra[k]; });
        doc.items.push(c);
    }
    function wire(pts) {
        doc.items.push({ kind: 'wire', id: uid(), pts: pts, stroke: '#1a1a1a', sw: 1.5, dash: '' });
    }
    function label(x, y, text, anchor) {
        doc.items.push({ kind: 'label', id: uid(), x: x, y: y, text: text,
            anchor: anchor || 'start', size: 13, stroke: '#1a1a1a' });
    }
    comp('vdd-port', 300, 100);
    comp('pmos', 290, 170, { text: 'M1' });
    comp('nmos', 290, 260, { text: 'M2' });
    comp('ground', 300, 320);
    comp('dot', 300, 215);
    comp('dot', 245, 170);
    wire([{ x: 300, y: 120 }, { x: 300, y: 150 }]);            // VDD → M1.S
    wire([{ x: 300, y: 190 }, { x: 300, y: 240 }]);            // M1.D → M2.D
    wire([{ x: 300, y: 215 }, { x: 360, y: 215 }]);            // Vout stub
    wire([{ x: 300, y: 280 }, { x: 300, y: 310 }]);            // M2.S → GND
    wire([{ x: 220, y: 170 }, { x: 270, y: 170 }]);            // Vin → M1.G
    wire([{ x: 245, y: 170 }, { x: 245, y: 260 }, { x: 270, y: 260 }]); // 下折 → M2.G
    label(312, 105, 'VDD');
    label(365, 220, 'Vout');
    label(215, 175, 'Vin', 'end');
}

(function boot() {
    buildPalette();
    var loaded = loadLocal();
    if (!loaded) sampleDoc();
    else if (loaded === 'v1') hintMsg = '已从旧版存档自动迁移为 Razavi 器件库';
    render();
    setStatus('');

    /* 跳转传图：?fig=ota5|telescopic|folded|diffpair|curmirror → pushUndo 后载入标准图 */
    var mq = /[?&]fig=([a-z0-9-]+)/i.exec(location.search || '');
    if (mq && window.RAZAVI_FIGURES && RAZAVI_FIGURES[mq[1]]) {
        var fig = RAZAVI_FIGURES[mq[1]];
        pushUndo();                                    // Ctrl+Z 可恢复原画布
        doc = normalizeDoc(JSON.parse(JSON.stringify(fig.doc)));
        doc.groups = [];
        sel = [];
        suppressSave = true;                           // 首次编辑前不覆盖本地存档
        hintMsg = '已载入标准图「' + fig.name + '」，Ctrl+Z 可恢复原画布';
        render();
        setStatus('');
    }
})();

/* tools/circuit-sketch/script.js
   电路示意图编辑器：单页 SVG 编辑器（无框架）
   器件 = <g> 内联符号组，连线 = polyline；标准论文直线符号；10px 网格 */

'use strict';

var GRID = 10;
var svg = document.getElementById('ckCanvas');
var layerMain = document.getElementById('layerMain');
var layerOverlay = document.getElementById('layerOverlay');
var wrap = document.getElementById('ckWrap');
var statusEl = document.getElementById('ckStatus');

function snap(v) { return Math.round(v / GRID) * GRID; }
var _uid = 1;
function uid() { return 'i' + (_uid++); }

/* ============================================
   器件符号库（局部坐标，原点 = 器件中心，端口均在网格上）
   bbox: [x0, y0, x1, y1]；ports: 吸附端口表
   ============================================ */
var SYMBOLS = {
    nmos: {
        name: 'NMOS', bbox: [-32, -32, 32, 32], textDy: -40,
        ports: [{ x: -30, y: 0, n: 'G' }, { x: 0, y: -30, n: 'D' }, { x: 0, y: 30, n: 'S' }, { x: 30, y: 0, n: 'B' }],
        body: function (c) {
            return '<path d="M0,-30 L0,-18 M0,18 L0,30"/>' +                       // D/S 引线
                '<path d="M0,-18 L0,-6 M0,-3 L0,3 M0,6 L0,18"/>' +                 // 沟道三段（增强型）
                '<path d="M-8,-21 L-8,21 M-30,0 L-8,0"/>' +                        // 栅极
                '<path d="M0,0 L26,0"/>' +                                         // 衬底引线
                '<polygon points="14,-5 14,5 5,0" fill="' + c.stroke + '" stroke="none"/>'; // NMOS 箭头向沟道
        }
    },
    pmos: {
        name: 'PMOS', bbox: [-32, -32, 32, 32], textDy: -40,
        ports: [{ x: -30, y: 0, n: 'G' }, { x: 0, y: -30, n: 'D' }, { x: 0, y: 30, n: 'S' }, { x: 30, y: 0, n: 'B' }],
        body: function (c) {
            return '<path d="M0,-30 L0,-18 M0,18 L0,30"/>' +
                '<path d="M0,-18 L0,-6 M0,-3 L0,3 M0,6 L0,18"/>' +
                '<circle cx="-11.5" cy="0" r="3.5"/>' +                            // 栅反相圈
                '<path d="M-8,-21 L-8,21 M-30,0 L-15,0"/>' +
                '<path d="M0,0 L26,0"/>' +
                '<polygon points="2,-5 2,5 11,0" fill="' + c.stroke + '" stroke="none"/>';  // PMOS 箭头向外
        }
    },
    diode: {
        name: '二极管', bbox: [-30, -12, 30, 12], textDy: -20,
        ports: [{ x: -30, y: 0, n: 'A' }, { x: 30, y: 0, n: 'K' }],
        body: function (c) {
            return '<path d="M-30,0 L-8,0 M8,0 L30,0"/>' +
                '<polygon points="-8,-10 -8,10 8,0" fill="' + c.stroke + '" stroke="none"/>' +
                '<path d="M8,-10 L8,10"/>';
        }
    },
    cap: {
        name: '电容', bbox: [-30, -13, 30, 13], textDy: -22,
        ports: [{ x: -30, y: 0, n: '1' }, { x: 30, y: 0, n: '2' }],
        body: function () {
            return '<path d="M-30,0 L-4,0 M4,0 L30,0 M-4,-12 L-4,12 M4,-12 L4,12"/>';
        }
    },
    res: {
        name: '电阻', bbox: [-30, -10, 30, 10], textDy: -18,
        ports: [{ x: -30, y: 0, n: '1' }, { x: 30, y: 0, n: '2' }],
        body: function () {
            return '<path d="M-30,0 L-20,0 M20,0 L30,0"/><rect x="-20" y="-8" width="40" height="16"/>';
        }
    },
    isrc: {
        name: '电流源', bbox: [-16, -30, 16, 30], textDy: 0, textSide: true,
        ports: [{ x: 0, y: -30, n: '+' }, { x: 0, y: 30, n: '-' }],
        body: function (c) {
            return '<path d="M0,-30 L0,-14 M0,14 L0,30"/><circle cx="0" cy="0" r="14"/>' +
                '<path d="M0,10 L0,-6"/>' +
                '<polygon points="-4,-3 4,-3 0,-10" fill="' + c.stroke + '" stroke="none"/>';
        }
    },
    vsrc: {
        name: '电压源', bbox: [-16, -30, 16, 30], textDy: 0, textSide: true,
        ports: [{ x: 0, y: -30, n: '+' }, { x: 0, y: 30, n: '-' }],
        body: function () {
            return '<path d="M0,-30 L0,-14 M0,14 L0,30"/><circle cx="0" cy="0" r="14"/>' +
                '<path d="M-3.5,-6 L3.5,-6 M0,-9.5 L0,-2.5 M-3.5,7 L3.5,7"/>';
        }
    },
    gnd: {
        name: 'GND', bbox: [-12, -2, 12, 18], noText: true,
        ports: [{ x: 0, y: 0, n: 'p' }],
        body: function () {
            return '<path d="M0,0 L0,8 M-12,8 L12,8 M-7,13 L7,13 M-2.5,18 L2.5,18"/>';
        }
    },
    vdd: {
        name: 'VDD', bbox: [-11, -12, 11, 2], textDy: -20,
        ports: [{ x: 0, y: 0, n: 'p' }],
        body: function () {
            return '<path d="M0,0 L0,-10 M-10,-10 L10,-10"/>';
        }
    },
    opamp: {
        name: '运放/比较器', bbox: [-30, -30, 34, 30], textDy: -38,
        ports: [{ x: -30, y: -15, n: 'in-' }, { x: -30, y: 15, n: 'in+' }, { x: 34, y: 0, n: 'out' },
                { x: 0, y: -22, n: 'VDD' }, { x: 0, y: 22, n: 'VSS' }],
        body: function () {
            return '<path d="M-30,-30 L-30,30 L34,0 Z"/>' +
                '<path d="M-26,-15 L-18,-15 M-26,15 L-18,15 M-22,11 L-22,19"/>' +
                '<path d="M0,-22 L0,-16 M0,22 L0,16"/>';
        }
    },
    sw: {
        name: '开关', bbox: [-30, -13, 30, 3], textDy: -20,
        ports: [{ x: -30, y: 0, n: '1' }, { x: 30, y: 0, n: '2' }],
        body: function (c) {
            return '<path d="M-30,0 L-10,0 M10,0 L30,0"/>' +
                '<circle cx="-10" cy="0" r="2" fill="' + c.stroke + '" stroke="none"/>' +
                '<circle cx="10" cy="0" r="2" fill="' + c.stroke + '" stroke="none"/>' +
                '<path d="M-10,0 L8,-12"/>';
        }
    },
    mux: {
        name: 'MUX', bbox: [-24, -24, 24, 24], centerText: true,
        ports: [{ x: -24, y: -10, n: 'in0' }, { x: -24, y: 10, n: 'in1' }, { x: 24, y: 0, n: 'out' }, { x: 0, y: 24, n: 'sel' }],
        body: function () {
            return '<path d="M-24,-24 L-24,24 L24,10 L24,-10 Z"/><path d="M0,24 L0,17"/>';
        }
    },
    block: {
        name: '功能块', bbox: [-40, -20, 40, 20], centerText: true,
        ports: [{ x: -40, y: 0, n: 'L' }, { x: 40, y: 0, n: 'R' }, { x: 0, y: -20, n: 'T' }, { x: 0, y: 20, n: 'B' }],
        body: function () {
            return '<rect x="-40" y="-20" width="80" height="40"/>';
        }
    },
    dot: {
        name: '连接点', bbox: [-5, -5, 5, 5], noText: true,
        ports: [{ x: 0, y: 0, n: 'p' }],
        body: function (c) {
            return '<circle cx="0" cy="0" r="3" fill="' + c.stroke + '" stroke="none"/>';
        }
    },
    arrow: {
        name: '标注箭头', bbox: [-20, -6, 21, 6], noText: true,
        ports: [{ x: -20, y: 0, n: 'tail' }, { x: 20, y: 0, n: 'head' }],
        body: function (c) {
            return '<path d="M-20,0 L15,0"/>' +
                '<polygon points="9,-5 9,5 20,0" fill="' + c.stroke + '" stroke="none"/>';
        }
    }
};
var PAL_ORDER = ['nmos', 'pmos', 'diode', 'cap', 'res', 'isrc', 'vsrc', 'gnd', 'vdd', 'opamp', 'sw', 'mux', 'block', 'dot', 'arrow'];
var DEFAULT_TEXT = { nmos: 'M1', pmos: 'M2', res: 'R1', cap: 'C1', isrc: 'I1', vsrc: 'V1', vdd: 'VDD', opamp: 'A1', sw: 'S1', mux: 'MUX', block: 'BLOCK' };

/* ============================================
   文档模型与状态
   items: [{kind:'comp', id, type, x, y, rot, fh, fv, text, stroke, sw, dash}
           {kind:'wire', id, pts:[{x,y}...], stroke, sw, dash}]
   ============================================ */
var doc = { items: [], groups: [] };
var sel = [];
var tool = 'select';
var drag = null;
var wireStart = null;
var hoverPort = null;
var clipboard = [];
var undoStack = [], redoStack = [];
var LS_KEY = 'ee-circuit-sketch-v1';

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
   几何工具
   ============================================ */
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
        SYMBOLS[it.type].ports.forEach(function (p) { out.push(portWorld(it, p)); });
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

function itemBBox(it) {
    if (it.kind === 'wire') {
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        it.pts.forEach(function (p) {
            x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
            x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
        });
        return { x0: x0, y0: y0, x1: x1, y1: y1 };
    }
    var b = SYMBOLS[it.type].bbox;
    var pts = [{ x: b[0], y: b[1] }, { x: b[2], y: b[1] }, { x: b[0], y: b[3] }, { x: b[2], y: b[3] }];
    var th = it.rot * Math.PI / 2;
    var cos = Math.round(Math.cos(th)), sin = Math.round(Math.sin(th));
    var sx = it.fh ? -1 : 1, sy = it.fv ? -1 : 1;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(function (p) {
        var px = p.x * sx, py = p.y * sy;
        var wx = it.x + cos * px - sin * py, wy = it.y + sin * px + cos * py;
        x0 = Math.min(x0, wx); y0 = Math.min(y0, wy);
        x1 = Math.max(x1, wx); y1 = Math.max(y1, wy);
    });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
}

function compHit(c, x, y, tol) {
    var l = toLocal(c, x, y);
    var b = SYMBOLS[c.type].bbox;
    var t = tol || 3;
    return l.x >= b[0] - t && l.x <= b[2] + t && l.y >= b[1] - t && l.y <= b[3] + t;
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

/* 顶向下的命中：器件优先于连线 */
function hitItem(x, y) {
    for (var i = doc.items.length - 1; i >= 0; i--) {
        var it = doc.items[i];
        if (it.kind === 'comp' && compHit(it, x, y)) return it;
    }
    var wh = wireHit(x, y, 5);
    return wh ? wh.wire : null;
}

function moveItem(it, dx, dy) {
    if (it.kind === 'comp') { it.x += dx; it.y += dy; }
    else it.pts.forEach(function (p) { p.x += dx; p.y += dy; });
}

/* ============================================
   渲染
   ============================================ */
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function dashAttr(it) { return it.dash ? ' stroke-dasharray="' + it.dash + '"' : ''; }

function compSvg(c) {
    var sym = SYMBOLS[c.type];
    var s = '<g transform="translate(' + c.x + ',' + c.y + ')">' +
        '<g transform="rotate(' + (c.rot * 90) + ') scale(' + (c.fh ? -1 : 1) + ',' + (c.fv ? -1 : 1) + ')"' +
        ' stroke="' + c.stroke + '" stroke-width="' + c.sw + '" fill="none"' +
        ' stroke-linecap="round" stroke-linejoin="round"' + dashAttr(c) + '>' +
        sym.body(c) + '</g>';
    if (c.text && !sym.noText) {
        var bb = itemBBox(c);
        var tx = sym.centerText ? c.x : (bb.x0 + bb.x1) / 2;
        var ty = sym.centerText ? c.y + 4 : bb.y0 - 7;
        if (sym.textSide) { tx = bb.x1 + 6; ty = c.y + 4; }
        s += '<text x="' + tx + '" y="' + ty + '" font-family="Fira Code, monospace" font-size="13"' +
            ' fill="' + c.stroke + '" text-anchor="' + (sym.textSide ? 'start' : 'middle') + '" stroke="none">' + esc(c.text) + '</text>';
    }
    return s + '</g>';
}

function wireSvg(w) {
    var pts = w.pts.map(function (p) { return p.x + ',' + p.y; }).join(' ');
    return '<polyline points="' + pts + '" fill="none" stroke="' + w.stroke + '" stroke-width="' + w.sw + '"' +
        ' stroke-linejoin="round" stroke-linecap="round"' + dashAttr(w) + '/>';
}

function render() {
    var html = '';
    doc.items.forEach(function (it) { html += it.kind === 'comp' ? compSvg(it) : wireSvg(it); });
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
        s += '<polyline points="' + manhattan(wireStart, wireStart.cur).map(function (p) { return p.x + ',' + p.y; }).join(' ') + '"' +
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

/* ============================================
   撤销 / 重做（快照命令栈，上限 50）
   ============================================ */
function pushUndo() {
    undoStack.push(JSON.stringify(doc));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
}
function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(doc));
    doc = JSON.parse(undoStack.pop());
    sel = [];
    render();
}
function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(doc));
    doc = JSON.parse(redoStack.pop());
    sel = [];
    render();
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
                doc.items.push({ kind: 'wire', id: uid(), pts: manhattan(wireStart, pt), stroke: '#1a1a1a', sw: 1.5, dash: '' });
            }
            wireStart = null;
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
                return it.kind === 'comp' ? { it: it, x: it.x, y: it.y } :
                    { it: it, pts: it.pts.map(function (p) { return { x: p.x, y: p.y }; }) };
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
        statusEl.textContent = '｜ (' + snap(pos.x) + ', ' + snap(pos.y) + ')' + (wireStart ? ' 点击完成连线，Esc 取消' : ' 点击放置连线起点');
        renderOverlay();
        return;
    }

    statusEl.textContent = '｜ (' + snap(pos.x) + ', ' + snap(pos.y) + ')';
    if (!drag) return;

    if (drag.type === 'move') {
        var dx = snap(pos.x - drag.startX), dy = snap(pos.y - drag.startY);
        if ((dx || dy) && !drag.pushed) { pushUndo(); drag.pushed = true; }
        drag.orig.forEach(function (o) {
            if (o.it.kind === 'comp') { o.it.x = o.x + dx; o.it.y = o.y + dy; }
            else o.it.pts = o.pts.map(function (p) { return { x: p.x + dx, y: p.y + dy }; });
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

/* 双击编辑文本标签 */
svg.addEventListener('dblclick', function (e) {
    if (tool === 'wire') return;
    var pos = evPos(e);
    var hit = hitItem(pos.x, pos.y);
    if (hit && hit.kind === 'comp' && !SYMBOLS[hit.type].noText) {
        var t = prompt('文字标签：', hit.text || '');
        if (t !== null) { pushUndo(); hit.text = t; render(); }
    }
});

/* ============================================
   器件面板：拖放 + 点击放置
   ============================================ */
var palList = document.getElementById('palList');
var ghost = document.createElement('div');
ghost.id = 'ckGhost';
document.body.appendChild(ghost);

function palPreview(type) {
    var sym = SYMBOLS[type];
    var b = sym.bbox, pad = 5;
    var vb = (b[0] - pad) + ' ' + (b[1] - pad) + ' ' + (b[2] - b[0] + 2 * pad) + ' ' + (b[3] - b[1] + 2 * pad);
    return '<svg width="56" height="40" viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet">' +
        '<g stroke="#4a4a4a" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        sym.body({ stroke: '#4a4a4a' }) + '</g></svg>';
}

PAL_ORDER.forEach(function (type) {
    var div = document.createElement('div');
    div.className = 'pal-item';
    div.innerHTML = palPreview(type) + '<span>' + SYMBOLS[type].name + '</span>';
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
    palList.appendChild(div);
});

function addComp(type, x, y) {
    pushUndo();
    var c = { kind: 'comp', id: uid(), type: type, x: x, y: y, rot: 0, fh: false, fv: false,
        text: DEFAULT_TEXT[type] || '', stroke: '#1a1a1a', sw: 1.5, dash: '' };
    doc.items.push(c);
    sel = [c.id];
    render();
}

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
        if (it.kind === 'comp') {
            if (kind === 'rot') { var dx = it.x - cx, dy = it.y - cy; it.x = cx - dy; it.y = cy + dx; it.rot = (it.rot + 1) % 4; }
            else if (kind === 'fh') { it.x = 2 * cx - it.x; it.fh = !it.fh; }
            else { it.y = 2 * cy - it.y; it.fv = !it.fv; }
        } else {
            it.pts.forEach(function (p) {
                if (kind === 'rot') { var dx = p.x - cx, dy = p.y - cy; p.x = cx - dy; p.y = cy + dx; }
                else if (kind === 'fh') p.x = 2 * cx - p.x;
                else p.y = 2 * cy - p.y;
            });
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
        if (c.kind === 'comp') { c.x += 20; c.y += 20; }
        else c.pts.forEach(function (p) { p.x += 20; p.y += 20; });
        doc.items.push(c);
        sel.push(c.id);
        if (c.kind === 'comp') { it.x += 20; it.y += 20; }   // 连续粘贴阶梯偏移
        else it.pts.forEach(function (p) { p.x += 20; p.y += 20; });
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

function renderProps() {
    var items = selItems();
    selInfo.textContent = items.length ? '已选中 ' + items.length + ' 项' : '未选中任何对象';
    if (!items.length) return;
    propWidth.value = String(items[0].sw);
    if (items[0].stroke) propColor.value = items[0].stroke;
    propDash.value = items[0].dash || '';
    var c0 = items.filter(function (it) { return it.kind === 'comp'; })[0];
    propText.value = c0 ? (c0.text || '') : '';
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
    applyProps(function (it) { it.stroke = propColor.value; });
});
propDash.addEventListener('change', function () {
    var v = propDash.value;
    applyProps(function (it) { it.dash = v; });
});
propText.addEventListener('change', function () {
    var v = propText.value;
    applyProps(function (it) { if (it.kind === 'comp') it.text = v; });
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

function setTool(t) {
    tool = t;
    wireStart = null;
    hoverPort = null;
    toolSelect.classList.toggle('btn-primary', t === 'select');
    toolWire.classList.toggle('btn-primary', t === 'wire');
    wrap.style.cursor = t === 'wire' ? 'crosshair' : 'default';
    render();
}

toolSelect.addEventListener('click', function () { setTool('select'); });
toolWire.addEventListener('click', function () { setTool('wire'); });
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
        else if (tool === 'wire') setTool('select');
        else if (sel.length) { sel = []; render(); }
    }
    else if (k === 'w') setTool('wire');
    else if (k === 'r') transformSel('rot');
    else if (k === 'h') transformSel('fh');
    else if (k === 'v') transformSel('fv');
});

/* ============================================
   导入 / 导出 / 持久化
   ============================================ */
function contentBBox() {
    if (!doc.items.length) return { x0: 0, y0: 0, x1: 1600, y1: 1100 };
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    doc.items.forEach(function (it) {
        var b = itemBBox(it);
        x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
        x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
        if (it.kind === 'comp' && it.text) {          // 文字标签外扩
            y0 = Math.min(y0, b.y0 - 20);
            x1 = Math.max(x1, b.x1 + (SYMBOLS[it.type].textSide ? 50 : 30));
            x0 = Math.min(x0, b.x0 - 30);
        }
    });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
}

function exportSvgStr() {
    var b = contentBBox(), m = 20;
    var x = b.x0 - m, y = b.y0 - m, w = b.x1 - b.x0 + 2 * m, h = b.y1 - b.y0 + 2 * m;
    var s = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
        x + ' ' + y + ' ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">' +
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#ffffff"/>';
    doc.items.forEach(function (it) { s += it.kind === 'comp' ? compSvg(it) : wireSvg(it); });
    return { str: s + '</svg>', w: w, h: h };
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
    var r = exportSvgStr();
    download('circuit.svg', new Blob([r.str], { type: 'image/svg+xml' }));
});

document.getElementById('expPng').addEventListener('click', function () {
    var r = exportSvgStr();
    var img = new Image();
    img.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = r.w * 2; cv.height = r.h * 2;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (bl) { if (bl) download('circuit.png', bl); });
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
            pushUndo();
            doc = d;
            doc.groups = doc.groups || [];
            sel = [];
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
    try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); } catch (e) { /* 存储满忽略 */ }
}
function loadLocal() {
    try {
        var s = localStorage.getItem(LS_KEY);
        if (s) {
            var d = JSON.parse(s);
            if (d && Array.isArray(d.items)) {
                doc = d;
                doc.groups = doc.groups || [];
                return true;
            }
        }
    } catch (e) { /* 损坏则使用示例 */ }
    return false;
}

/* ============================================
   初始示例（共源反相器）与启动
   ============================================ */
function sampleDoc() {
    doc = { items: [], groups: [] };
    function comp(type, x, y, extra) {
        var c = { kind: 'comp', id: uid(), type: type, x: x, y: y, rot: 0, fh: false, fv: false,
            text: DEFAULT_TEXT[type] || '', stroke: '#1a1a1a', sw: 1.5, dash: '' };
        if (extra) Object.keys(extra).forEach(function (k) { c[k] = extra[k]; });
        doc.items.push(c);
    }
    function wire(pts) {
        doc.items.push({ kind: 'wire', id: uid(), pts: pts, stroke: '#1a1a1a', sw: 1.5, dash: '' });
    }
    comp('vdd', 300, 140);
    comp('pmos', 300, 220, { fv: true, text: 'M1' });
    comp('nmos', 300, 320, { text: 'M2' });
    comp('gnd', 300, 400);
    comp('dot', 220, 220);
    comp('arrow', 400, 270);
    wire([{ x: 300, y: 140 }, { x: 300, y: 190 }]);          // VDD → M1.S
    wire([{ x: 300, y: 250 }, { x: 300, y: 290 }]);          // M1.D → M2.D
    wire([{ x: 300, y: 350 }, { x: 300, y: 400 }]);          // M2.S → GND
    wire([{ x: 300, y: 270 }, { x: 380, y: 270 }]);          // 输出 stub
    wire([{ x: 180, y: 220 }, { x: 270, y: 220 }]);          // 输入 → M1.G
    wire([{ x: 220, y: 220 }, { x: 220, y: 320 }, { x: 270, y: 320 }]); // 输入下折 → M2.G
}

if (!loadLocal()) sampleDoc();
render();

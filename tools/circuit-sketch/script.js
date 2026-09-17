/* tools/circuit-sketch/script.js
   电路示意图编辑器：单页 SVG 编辑器（无框架）
   器件 = razavi 符号库（render.js 渲染）+ 绘图辅助；连线 = polyline；自由文字 = label
   10px 网格；依赖 razavi/razavi-symbols.js + razavi/render.js + razavi/figures.js */

'use strict';

var GRID = 10;
var FONT = Razavi.TEXT_FONTS.latin;
var TEXT_OPTIONS = { editorText: true, font: FONT };
var textEditor = null, textSession = null, transformPivot = null;
var svg = document.getElementById('ckCanvas');
var layerMain = document.getElementById('layerMain');
var layerOverlay = document.getElementById('layerOverlay');
var wrap = document.getElementById('ckWrap');
var statusEl = document.getElementById('ckStatus');
var quickstartEl = document.getElementById('ckQuickstart');
var togglePaletteBtn = document.getElementById('ckTogglePalette');
var togglePropsBtn = document.getElementById('ckToggleProps');
var world = document.getElementById('world');
var gridMinor = document.getElementById('gridMinor');
var gridMajor = document.getElementById('gridMajor');
var layerPreview = document.getElementById('layerPreview');
var viewport = document.getElementById('ckViewport');
var palettePanel = document.getElementById('ckPalette');
var propsPanel = document.getElementById('ckProps');
var placement = null;
var paletteDrag = null;
var propsDrag = null;
var lastPointer = null;
var previewFrame = 0;
var previewKey = '';

/* ============================================
   无限画布：视图变换（平移 + 缩放）
   ============================================ */
var viewTransform = { x: 0, y: 0, scale: 1 };
var isPanning = false;
var panStart = { x: 0, y: 0 };
var spaceDown = false;
var gridEnabled = true;

/* 屏幕坐标 → 画布坐标 */
function screenToCanvas(sx, sy) {
    return {
        x: (sx - viewTransform.x) / viewTransform.scale,
        y: (sy - viewTransform.y) / viewTransform.scale
    };
}

/* 画布坐标 → 屏幕坐标 */
function canvasToScreen(cx, cy) {
    return {
        x: cx * viewTransform.scale + viewTransform.x,
        y: cy * viewTransform.scale + viewTransform.y
    };
}

/* 应用视图变换到世界组 */
function applyViewTransform() {
    world.setAttribute('transform',
        'translate(' + viewTransform.x + ',' + viewTransform.y + ') ' +
        'scale(' + viewTransform.scale + ')');
    updateGridVisibility();
    updateGridBounds();
    schedulePlacementPreview();
    syncMenuStatus();
    if (textEditor) textEditor.reposition();
}

/* 网格只覆盖当前可见世界范围，没有固定图纸边界 */
function updateGridBounds() {
    var a = screenToCanvas(0, 0);
    var b = screenToCanvas(svg.clientWidth, svg.clientHeight);
    [gridMinor, gridMajor].forEach(function (grid) {
        grid.setAttribute('x', a.x - 50);
        grid.setAttribute('y', a.y - 50);
        grid.setAttribute('width', b.x - a.x + 100);
        grid.setAttribute('height', b.y - a.y + 100);
    });
}

/* 根据缩放级别更新网格可见性 */
function updateGridVisibility() {
    var s = viewTransform.scale;
    gridMinor.style.display = gridEnabled && s >= 0.5 ? '' : 'none';
    gridMajor.style.display = gridEnabled && s >= 0.2 ? '' : 'none';
}

/* 视图菜单与滚轮共用缩放，菜单操作以视口中心为锚点 */
function zoomView(factor, mx, my) {
    if (editingBlocked()) return;
    var r = svg.getBoundingClientRect();
    if (mx == null) mx = r.width / 2;
    if (my == null) my = r.height / 2;
    var oldScale = viewTransform.scale;
    var newScale = Math.max(0.1, Math.min(10, oldScale * factor));
    viewTransform.x = mx - (mx - viewTransform.x) * (newScale / oldScale);
    viewTransform.y = my - (my - viewTransform.y) * (newScale / oldScale);
    viewTransform.scale = newScale;
    applyViewTransform();
}

/* 悬浮面板之间最大的可用横向区域；静态面板不占画布空间 */
function canvasUsableRect() {
    var r = svg.getBoundingClientRect();
    var left = Math.min(40, r.width / 4), right = r.width - left;
    var spans = [];
    [palettePanel, propsPanel].forEach(function (panel) {
        if (getComputedStyle(panel).position !== 'absolute') return;
        var p = panel.getBoundingClientRect();
        if (p.bottom <= r.top || p.top >= r.bottom) return;
        spans.push({ left: Math.max(left, p.left - r.left - 16), right: Math.min(right, p.right - r.left + 16) });
    });
    spans.sort(function (a, b) { return a.left - b.left; });
    var cursor = left, best = { left: left, right: left };
    spans.forEach(function (p) {
        if (p.left - cursor > best.right - best.left) best = { left: cursor, right: p.left };
        cursor = Math.max(cursor, p.right);
    });
    if (right - cursor > best.right - best.left) best = { left: cursor, right: right };
    if (best.right <= best.left) best = { left: left, right: right };
    var top = Math.min(40, r.height / 4);
    return { x: best.left, y: top, width: best.right - best.left, height: r.height - 2 * top };
}

/* 适应全部内容仅改变视图，不写入文档或撤销栈 */
function fitContent() {
    if (editingBlocked()) return;
    var r = canvasUsableRect();
    if (!r.width || !r.height) return;
    if (!doc.items.length) {
        viewTransform = { x: 0, y: 0, scale: 1 };
    } else {
        var b = Razavi.docBBox(doc, TEXT_OPTIONS);
        var s = Math.min(r.width / Math.max(1, b.x1 - b.x0), r.height / Math.max(1, b.y1 - b.y0));
        s = Math.max(0.1, Math.min(10, s));
        viewTransform = { x: r.x + r.width / 2 - (b.x0 + b.x1) * s / 2,
            y: r.y + r.height / 2 - (b.y0 + b.y1) * s / 2, scale: s };
    }
    applyViewTransform();
}

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

function itemBBox(it) { return Razavi.itemBBox(it, TEXT_OPTIONS); }

function compHit(c, x, y, tol) {
    var l = toLocal(c, x, y);
    var b = Razavi.bboxArr(c.type);
    var t = tol || 3;
    return l.x >= b[0] - t && l.x <= b[2] + t && l.y >= b[1] - t && l.y <= b[3] + t;
}

function labelHit(it, x, y) {
    var b = Razavi.textBBox(it);
    if (!b) return false;
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

/* 先按显示层级检查实际文字范围，包含符号几何外的标号。 */
function hitText(x, y) {
    for (var i = doc.items.length - 1; i >= 0; i--) {
        var it = doc.items[i];
        if (canEditText(it) && Razavi.richPlain(Razavi.richForItem(it)) && labelHit(it, x, y)) return it;
    }
    return null;
}
function hitItem(x, y) {
    var text = hitText(x, y);
    if (text) return text;
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
/* 默认墨色只在显示层映射主题，保留文档中的原始颜色 */
function displayItemSvg(it) {
    var display = Object.assign({}, it);
    if (!it.stroke || it.stroke.toLowerCase() === '#1a1a1a') display.stroke = 'currentColor';
    return '<g style="color:var(--ck-ink)">' +
        Razavi.itemSvg(display, { font: FONT, editorText: true, stroke: 'currentColor',
            hideText: !!textSession && textSession.id === it.id && !!it.id }) + '</g>';
}

function drawMain() {
    layerMain.innerHTML = doc.items.map(displayItemSvg).join('');
}
function render() {
    if (transformPivot && transformPivot.key !== sel.slice().sort().join(',')) transformPivot = null;
    drawMain();
    renderOverlay();
    renderProps();
    saveLocal();
    syncMenuState();
    schedulePlacementPreview();
    updateQuickstartVisibility();
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

/* 文字会话只持有草稿；确认才分配 ID、记录工程撤销及持久化。 */
function canEditText(it) {
    return it && (it.kind === 'label' || (it.kind === 'comp' && Razavi.textPos(it.type) !== 'none'));
}
function editingBlocked() {
    if (!textSession) return false;
    if (textEditor) textEditor.notify();
    return true;
}
function startTextEdit(it) {
    if (editingBlocked() || !canEditText(it)) return;
    setTool('select'); closeMenus(false);
    spaceDown = false;
    textSession = { id: it.id || null, item: it, original: JSON.stringify(Razavi.richForItem(it)) };
    drawMain(); renderOverlay(); renderProps(); updateQuickstartVisibility(); syncMenuStatus();
    textEditor.start(it);
}
function finishTextEdit(model) {
    var session = textSession;
    textSession = null;
    var changed = false;
    if (model) {
        var text = Razavi.richPlain(model), item = session.id ? byId(session.id) : session.item;
        var empty = !text.trim();
        if (item && ((!session.id && !empty) || (session.id &&
                (JSON.stringify(model) !== session.original || (empty && item.kind === 'label'))))) {
            pushUndo(); changed = true;
            if (empty && session.id && item.kind === 'label') {
                doc.items = doc.items.filter(function (it) { return it.id !== session.id; });
                doc.groups.forEach(function (g) { g.members = g.members.filter(function (id) { return id !== session.id; }); });
                doc.groups = doc.groups.filter(function (g) { return g.members.length; });
                sel = sel.filter(function (id) { return id !== session.id; });
            } else {
                item.richText = model; item.text = text;
                if (item.kind === 'label') item.anchor = model.align;
                if (!session.id) { item.id = uid(); doc.items.push(item); sel = [item.id]; }
            }
        }
    }
    if (changed) render();
    else { drawMain(); renderOverlay(); renderProps(); syncMenuState(); updateQuickstartVisibility(); }
    svg.focus({ preventScroll: true });
}
function initTextEditing() {
    var host = document.getElementById('ckTextHost');
    textEditor = CircuitTextEditor.create({
        host: host, box: document.getElementById('ckTextBox'), bar: document.getElementById('ckTextToolbar'),
        hint: document.getElementById('ckTextHint'), finish: finishTextEdit,
        project: function (x, y) {
            var p = svg.createSVGPoint(); p.x = x; p.y = y;
            var matrix = world.getScreenCTM(), point = p.matrixTransform(matrix), r = host.getBoundingClientRect();
            return { x: point.x - r.left, y: point.y - r.top, scale: Math.hypot(matrix.a, matrix.b) };
        }
    });
    /* 外部点击不提交、不穿透；仅允许菜单导航和主题切换。 */
    function allowedOutside(target) {
        return target.closest && target.closest('.theme-toggle, #ckMenubar [aria-controls], #ckMenubar [data-action="toggle-theme"]');
    }
    ['pointerdown', 'mousedown', 'click', 'dblclick', 'auxclick', 'wheel', 'drop'].forEach(function (type) {
        document.addEventListener(type, function (e) {
            if (!textSession || host.contains(e.target) || allowedOutside(e.target)) return;
            e.preventDefault(); e.stopImmediatePropagation(); textEditor.notify();
        }, { capture: true, passive: false });
    });
    document.addEventListener('keydown', function (e) {
        if (!textSession || host.contains(e.target)) return;
        if (e.key === 'Escape' && !e.isComposing) {
            e.preventDefault(); e.stopImmediatePropagation(); closeMenus(false); textEditor.cancel(); return;
        }
        if (allowedOutside(e.target) || menubar.contains(e.target)) return;
        e.preventDefault(); e.stopImmediatePropagation(); textEditor.notify();
    }, true);
    window.addEventListener('beforeunload', function (e) {
        if (textSession) { e.preventDefault(); e.returnValue = ''; }
    });
    function refreshFonts() {
        Razavi.clearTextCache(); previewKey = '';
        drawMain(); renderOverlay(); schedulePlacementPreview(); textEditor.refresh();
    }
    if (document.fonts) {
        document.fonts.ready.then(refreshFonts);
        document.fonts.addEventListener('loadingdone', refreshFonts);
    }
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
    transformPivot = null;
    suppressSave = false;    // 有真实编辑动作，允许写回本地存档
    undoStack.push(JSON.stringify(doc));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
}
function undo() {
    if (editingBlocked() || !undoStack.length) return;
    transformPivot = null;
    redoStack.push(JSON.stringify(doc));
    doc = JSON.parse(undoStack.pop());
    sel = [];
    hintMsg = '';
    render();
    setStatus('');
}
function redo() {
    if (editingBlocked() || !redoStack.length) return;
    transformPivot = null;
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
    var point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    return point.matrixTransform(world.getScreenCTM().inverse());
}

/* 命中真实 SVG，而不是浮在其矩形范围内的面板 */
function isCanvasPoint(e) {
    if (!e) return false;
    var hit = document.elementFromPoint(e.clientX, e.clientY);
    return !!hit && (hit === svg || svg.contains(hit));
}

function placementPoint(e) {
    if (spaceDown || isPanning || propsDrag || pickerEl || !isCanvasPoint(e)) return null;
    var p = evPos(e);
    return { x: snap(p.x), y: snap(p.y) };
}

/* 草稿不分配 id；预览和真正落下的器件共用全部默认属性 */
function compDraft(type, x, y, direction) {
    direction = direction || {};
    return { kind: 'comp', type: type, x: x, y: y, rot: direction.rot || 0, fh: !!direction.fh, fv: !!direction.fv,
        text: DEFAULT_TEXT[type] || '', stroke: '#1a1a1a', sw: 1.5, dash: '' };
}

function pendingDraft() { return paletteDrag && paletteDrag.moved ? paletteDrag : placement; }
function pendingType() { var draft = pendingDraft(); return draft && draft.type; }

function syncInteractionCursor() {
    wrap.classList.toggle('placing', !!pendingType() || tool === 'wire' || tool === 'label');
    wrap.classList.toggle('pan-ready', spaceDown && !isPanning);
    wrap.classList.toggle('panning', isPanning);
}

function syncPaletteSelection() {
    palettePanel.querySelectorAll('.pal-item').forEach(function (el) {
        var active = !!placement && el.getAttribute('data-type') === placement.type;
        el.classList.toggle('is-pending', active);
        el.setAttribute('aria-pressed', String(active));
    });
}

function hidePlacementPreview() {
    if (layerPreview.firstChild) layerPreview.innerHTML = '';
    previewKey = '';
}

function schedulePlacementPreview() {
    if (previewFrame) return;
    previewFrame = requestAnimationFrame(function () {
        previewFrame = 0;
        var type = pendingType();
        var p = type && placementPoint(lastPointer);
        if (!p || pickerEl) { hidePlacementPreview(); return; }
        var direction = pendingDraft();
        var key = [type, p.x, p.y, direction.rot, direction.fh, direction.fv].join(':');
        if (key !== previewKey) {
            layerPreview.innerHTML = displayItemSvg(compDraft(type, p.x, p.y, direction));
            previewKey = key;
        }
        setStatus('｜ ' + Razavi.meta(type).nameZh + ' (' + p.x + ', ' + p.y + ')' +
            (paletteDrag ? ' 松开放置一个' : ' 点击连续放置，Esc 退出'));
    });
}

function cancelPlacement() {
    placement = null;
    hidePlacementPreview();
    syncPaletteSelection();
    syncInteractionCursor();
    updateQuickstartVisibility();
}

function cancelPaletteDrag() {
    if (paletteDrag) paletteDrag.cleanup();
    hidePlacementPreview();
    syncInteractionCursor();
}

function beginPlacement(type) {
    if (editingBlocked() || !SYMBOLS[type]) return;
    setTool('select');
    placement = { type: type, mode: 'continuous', rot: 0, fh: false, fv: false };
    syncPaletteSelection();
    syncInteractionCursor();
    syncMenuState();
    setStatus('｜ 已选取「' + Razavi.meta(type).nameZh + '」，点击连续放置，Esc 退出');
    schedulePlacementPreview();
    updateQuickstartVisibility();
}

/* 跟随只更新预览，不调用 render 或 saveLocal */
window.addEventListener('pointermove', function (e) {
    if (e.isPrimary === false) return;
    lastPointer = { clientX: e.clientX, clientY: e.clientY };
    schedulePlacementPreview();
});
window.addEventListener('pointerdown', function (e) {
    if (e.isPrimary === false) return;
    lastPointer = { clientX: e.clientX, clientY: e.clientY };
    schedulePlacementPreview();
});
window.addEventListener('pointerout', function (e) {
    if (!e.relatedTarget) { lastPointer = null; hidePlacementPreview(); }
});
svg.addEventListener('pointerleave', hidePlacementPreview);
window.addEventListener('scroll', schedulePlacementPreview, true);

function snapPort(x, y) {
    var p = nearestPort(x, y, 20);
    return p ? { x: p.x, y: p.y } : { x: snap(x), y: snap(y) };
}

function setStatus(extra) {
    if (statusEl) statusEl.textContent = (hintMsg ? '｜ ' + hintMsg + ' ' : '') + (extra || '');
}

/* 快速入门面板：画布完全空白时显示，添加任意对象后隐藏 */
function updateQuickstartVisibility() {
    if (!quickstartEl) return;
    var isEmpty = !doc.items.length;
    if (isEmpty && !placement && !textSession && tool !== 'label') {
        quickstartEl.removeAttribute('hidden');
    } else {
        quickstartEl.setAttribute('hidden', '');
    }
}

/* ============================================
   画布鼠标交互
   ============================================ */
svg.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || spaceDown || isPanning || paletteDrag || propsDrag) return;
    e.preventDefault();
    svg.focus({ preventScroll: true });
    if (placement) {
        var anchor = placementPoint(e);
        if (anchor) addComp(placement.type, anchor.x, anchor.y, placement);
        return;
    }
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
        startTextEdit({ kind: 'label', x: snap(pos.x), y: snap(pos.y),
            text: '', anchor: 'start', size: 13, stroke: '#1a1a1a' });
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
    if (textSession || placement || paletteDrag || propsDrag || isPanning || spaceDown || pickerEl) return;
    if (!drag && !isCanvasPoint(e)) {
        if (hoverPort || (wireStart && wireStart.cur)) {
            hoverPort = null;
            if (wireStart) delete wireStart.cur;
            renderOverlay();
        }
        return;
    }
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
    if (tool !== 'select' || placement || paletteDrag || spaceDown || isPanning || e.button !== 0) return;
    var pos = evPos(e);
    var hit = hitItem(pos.x, pos.y);
    if (!hit) return;
    if (canEditText(hit)) startTextEdit(hit);
});

/* ============================================
   无限画布：缩放 / 平移 / 键盘
   ============================================ */
/* 鼠标滚轮缩放（以光标为中心） */
svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = svg.getBoundingClientRect();
    var mx = e.clientX - r.left;
    var my = e.clientY - r.top;
    if (!e.deltaY) return;
    var factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    /* 以光标为中心缩放：调整平移使光标下画布点不变 */
    zoomView(factor, mx, my);
}, { passive: false });

/* 中键或空格+左键平移 */
var panButton = null;
svg.addEventListener('mousedown', function (e) {
    if (paletteDrag || propsDrag || drag || isPanning) return;
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
        e.preventDefault();
        svg.focus({ preventScroll: true });
        isPanning = true;
        panButton = e.button;
        panStart.x = e.clientX - viewTransform.x;
        panStart.y = e.clientY - viewTransform.y;
        hidePlacementPreview();
        syncInteractionCursor();
    }
});
svg.addEventListener('auxclick', function (e) { if (e.button === 1) e.preventDefault(); });

function endPan() {
    isPanning = false;
    panButton = null;
    syncInteractionCursor();
    schedulePlacementPreview();
}
window.addEventListener('mousemove', function (e) {
    if (!isPanning) return;
    if (!(e.buttons & (panButton === 1 ? 4 : 1))) { endPan(); return; }
    viewTransform.x = e.clientX - panStart.x;
    viewTransform.y = e.clientY - panStart.y;
    applyViewTransform();
});
window.addEventListener('mouseup', function (e) {
    if (isPanning && e.button === panButton) endPan();
});

/* 输入控件、菜单和选择器保留自身键盘行为 */
function shortcutBlocked(e) {
    var target = e.target;
    return textSession || e.defaultPrevented || e.isComposing || pickerEl ||
        (target && (target.isContentEditable || (target.closest && target.closest(
            'input, textarea, select, button, a, [role="button"], #ckMenubar, .ck-picker-mask'))));
}

/* 空格键追踪 */
window.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' || shortcutBlocked(e) || e.ctrlKey || e.metaKey || e.altKey || paletteDrag || propsDrag || drag) return;
    e.preventDefault();
    spaceDown = true;
    hidePlacementPreview();
    syncInteractionCursor();
});
window.addEventListener('keyup', function (e) {
    if (e.code !== 'Space') return;
    spaceDown = false;
    syncInteractionCursor();
    schedulePlacementPreview();
}, true);

function resetPointerInteractions() {
    cancelPaletteDrag();
    cancelPropsDrag();
    spaceDown = false;
    lastPointer = null;
    endPan();
    drag = null;
    hoverPort = null;
    if (wireStart) delete wireStart.cur;
    hidePlacementPreview();
    renderOverlay();
    syncMenuState();
    setStatus('');
}
window.addEventListener('blur', resetPointerInteractions);
window.addEventListener('pointercancel', resetPointerInteractions);

/* 初始化视图变换在 boot 中执行，确保面板与菜单均已就绪 */

/* ============================================
   器件面板：11 个可折叠分组（10 个 razavi 分类 + 绘图辅助）
   拖放或点击放置
   ============================================ */
var palList = document.getElementById('palList');

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
        s += '<div class="pal-item" role="button" tabindex="0" aria-pressed="false" data-type="' + id + '" title="' + Razavi.esc(m.nameZh + ' / ' + m.name) + '">' +
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
    div.addEventListener('dragstart', function (e) { e.preventDefault(); });
    div.addEventListener('keydown', function (e) {
        if ((e.key !== 'Enter' && e.key !== ' ') || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        beginPlacement(type);
        svg.focus({ preventScroll: true });
    });
    div.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || e.isPrimary === false || isPanning || propsDrag) return;
        e.preventDefault();
        setTool('select');
        svg.focus({ preventScroll: true });
        var sx = e.clientX, sy = e.clientY, pointerId = e.pointerId;
        var state = { type: type, moved: false, rot: 0, fh: false, fv: false, cleanup: cleanup };
        paletteDrag = state;
        function track(ev) {
            var dx = ev.clientX - sx, dy = ev.clientY - sy;
            if (dx * dx + dy * dy >= 16) state.moved = true;
            lastPointer = { clientX: ev.clientX, clientY: ev.clientY };
        }
        function cleanup() {
            window.removeEventListener('pointermove', mv);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', cancel);
            div.removeEventListener('lostpointercapture', cancel);
            if (paletteDrag === state) paletteDrag = null;
            if (div.hasPointerCapture(pointerId)) div.releasePointerCapture(pointerId);
        }
        function cancel(ev) {
            if (ev.pointerId !== pointerId) return;
            cancelPaletteDrag();
            syncMenuState();
            setStatus('');
        }
        function mv(ev) {
            if (ev.pointerId !== pointerId) return;
            if (!(ev.buttons & 1)) { cancel(ev); return; }
            track(ev);
            syncInteractionCursor();
            schedulePlacementPreview();
        }
        function up(ev) {
            if (ev.pointerId !== pointerId || ev.button !== 0) return;
            ev.preventDefault();
            track(ev);
            var p = state.moved && placementPoint(ev);
            var hit = document.elementFromPoint(ev.clientX, ev.clientY);
            var clicked = !state.moved && hit && div.contains(hit);
            var direction = { rot: state.rot, fh: state.fh, fv: state.fv };
            setTool('select');
            if (p) addComp(type, p.x, p.y, direction);
            else if (clicked) beginPlacement(type);
        }
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
        div.addEventListener('lostpointercapture', cancel);
        try { div.setPointerCapture(pointerId); } catch (err) { /* 窗口监听仍可清理手势 */ }
    });
}

function addComp(type, x, y, direction) {
    if (editingBlocked()) return;
    pushUndo();
    var c = compDraft(type, x, y, direction);
    c.id = uid();
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
        it.rot = Number.isFinite(it.rot) ? ((Math.round(it.rot) % 4) + 4) % 4 : 0;
        it.fh = !!it.fh; it.fv = !!it.fv;
        it.text = it.text || '';
        it.stroke = it.stroke || '#1a1a1a';
        it.sw = it.sw || 1.5;
        it.dash = it.dash || '';
    }
    if (it.kind !== 'wire') {
        it.text = String(it.text == null ? '' : it.text);
        if (it.kind === 'label') {
            it.size = Razavi.textSize(it.size);
            it.anchor = ['start', 'middle', 'end'].indexOf(it.anchor) >= 0 ? it.anchor : 'start';
        }
        if (it.richText) {
            it.richText = Razavi.richForItem(it);
            it.text = Razavi.richPlain(it.richText);
        }
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
    if (editingBlocked()) return;
    var fig = window.RAZAVI_FIGURES && RAZAVI_FIGURES[key];
    if (!fig) return;
    setTool('select');
    var r = canvasUsableRect();
    var centerCanvas = screenToCanvas(r.x + r.width / 2, r.y + r.height / 2);
    var cx = snap(centerCanvas.x);
    var cy = snap(centerCanvas.y);
    var b = Razavi.docBBox(fig.doc, TEXT_OPTIONS);
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

/* 镜像以屏幕轴为准：奇数次旋转时交换器件局部镜像轴。 */
function transformDirection(it, kind) {
    if (kind === 'rot') it.rot = ((it.rot || 0) + 3) % 4;
    else {
        var axis = (it.rot || 0) % 2 ? (kind === 'fh' ? 'fv' : 'fh') : kind;
        it[axis] = !it[axis];
    }
}
function transformSel(kind) {
    if (editingBlocked()) return;
    var pending = pendingDraft();
    if (pending) {
        transformDirection(pending, kind);
        schedulePlacementPreview();
        return;
    }
    var items = selItems();
    if (!items.length) return;
    var bb = selBBox(), single = items.length === 1 && items[0].kind !== 'wire';
    var signature = JSON.stringify(items), key = sel.slice().sort().join(',');
    var previous = transformPivot && transformPivot.key === key && transformPivot.after === signature ? transformPivot : null;
    var cx = single ? items[0].x : (previous ? previous.x : snap(bb.cx));
    var cy = single ? items[0].y : (previous ? previous.y : snap(bb.cy));
    function transformPoint(p) {
        if (kind === 'rot') { var dx = p.x - cx, dy = p.y - cy; p.x = cx + dy; p.y = cy - dx; }
        else if (kind === 'fh') p.x = 2 * cx - p.x;
        else p.y = 2 * cy - p.y;
    }
    pushUndo();
    items.forEach(function (it) {
        if (it.kind === 'wire') it.pts.forEach(transformPoint);
        else {
            transformPoint(it);
            if (it.kind === 'comp') transformDirection(it, kind);
        }
    });
    /* 连续变换保留同一中心，正向标号改变外框时也可四次旋转复原。 */
    transformPivot = { key: key, after: JSON.stringify(items), x: cx, y: cy };
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
var propEditText = document.getElementById('propEditText');
var propVariantRow = document.getElementById('propVariantRow');
var propVariant = document.getElementById('propVariant');

function renderProps() {
    var items = selItems();
    selInfo.textContent = items.length ? '已选中 ' + items.length + ' 项' : '未选中任何对象';
    propEditText.disabled = !!textSession || items.length !== 1 || !canEditText(items[0]);
    propText.textContent = items.length === 1 && canEditText(items[0]) ? (items[0].text || '（空白标号）') :
        (items.length > 1 ? '多选时不编辑文字' : '未选中文字');
    if (!items.length) { propVariantRow.style.display = 'none'; return; }
    propWidth.value = String(items[0].sw || 1.5);
    if (items[0].stroke) propColor.value = items[0].stroke;
    propDash.value = items[0].dash || '';
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
    if (editingBlocked()) return;
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
propEditText.addEventListener('click', function () {
    var items = selItems();
    if (items.length === 1) startTextEdit(items[0]);
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

/* ---- 属性面板按视口钳制，窄屏清除拖动定位 ---- */
function cancelPropsDrag() {
    if (propsDrag) propsDrag.cleanup();
}
function positionProps(left, top) {
    var maxL = Math.max(0, viewport.clientWidth - propsPanel.offsetWidth);
    var maxT = Math.max(0, viewport.clientHeight - propsPanel.offsetHeight);
    propsPanel.style.left = Math.max(0, Math.min(maxL, left)) + 'px';
    propsPanel.style.top = Math.max(0, Math.min(maxT, top)) + 'px';
    propsPanel.style.right = 'auto';
}
function clampProps() {
    if (getComputedStyle(propsPanel).position !== 'absolute') {
        cancelPropsDrag();
        propsPanel.style.removeProperty('left');
        propsPanel.style.removeProperty('top');
        propsPanel.style.removeProperty('right');
    } else if (propsPanel.style.left) {
        positionProps(propsPanel.offsetLeft, propsPanel.offsetTop);
    }
}
(function initPropsDrag() {
    var hd = document.getElementById('ckPropsHd');
    hd.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || e.isPrimary === false || paletteDrag || isPanning || drag ||
                getComputedStyle(propsPanel).position !== 'absolute') return;
        e.preventDefault();
        cancelPropsDrag();
        var rect = propsPanel.getBoundingClientRect();
        var dx = e.clientX - rect.left, dy = e.clientY - rect.top, pointerId = e.pointerId;
        var state = { cleanup: cleanup };
        propsDrag = state;
        hidePlacementPreview();
        function cleanup() {
            window.removeEventListener('pointermove', mv);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            hd.removeEventListener('lostpointercapture', up);
            if (propsDrag === state) propsDrag = null;
            if (hd.hasPointerCapture(pointerId)) hd.releasePointerCapture(pointerId);
            schedulePlacementPreview();
        }
        function mv(ev) {
            if (ev.pointerId !== pointerId) return;
            if (!(ev.buttons & 1)) { cleanup(); return; }
            if (getComputedStyle(propsPanel).position !== 'absolute') { clampProps(); return; }
            var r = viewport.getBoundingClientRect();
            positionProps(ev.clientX - r.left - dx, ev.clientY - r.top - dy);
        }
        function up(ev) {
            if (ev.pointerId === pointerId) cleanup();
        }
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        hd.addEventListener('lostpointercapture', up);
        try { hd.setPointerCapture(pointerId); } catch (err) { /* 窗口监听仍可结束拖动 */ }
    });
})();

/* 窄屏面板切换：一次只展开一个 */
function toggleNarrowPanel(which) {
    if (!palettePanel || !propsPanel) return;
    var isPalette = which === 'palette';
    var target = isPalette ? palettePanel : propsPanel;
    var other = isPalette ? propsPanel : palettePanel;
    var btn = isPalette ? togglePaletteBtn : togglePropsBtn;
    var otherBtn = isPalette ? togglePropsBtn : togglePaletteBtn;
    var isOpen = target.classList.contains('ck-panel-open');
    // 关闭另一个
    other.classList.remove('ck-panel-open');
    if (otherBtn) otherBtn.classList.remove('active');
    // 切换当前
    if (isOpen) {
        target.classList.remove('ck-panel-open');
        if (btn) btn.classList.remove('active');
    } else {
        target.classList.add('ck-panel-open');
        if (btn) btn.classList.add('active');
    }
}
if (togglePaletteBtn) togglePaletteBtn.addEventListener('click', function () { toggleNarrowPanel('palette'); });
if (togglePropsBtn) togglePropsBtn.addEventListener('click', function () { toggleNarrowPanel('props'); });

/* 尺寸与主题变化只影响显示层，不保存文档 */
function refreshViewport() {
    clampProps();
    updateGridBounds();
    schedulePlacementPreview();
    if (textEditor) textEditor.reposition();
}
function observeViewport() {
    window.addEventListener('resize', refreshViewport);
    if (window.ResizeObserver) {
        var resizeObserver = new ResizeObserver(refreshViewport);
        [viewport, wrap, propsPanel].forEach(function (el) { resizeObserver.observe(el); });
    }
    new MutationObserver(function () {
        syncMenuState();
        schedulePlacementPreview();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/* ============================================
   菜单系统与键盘
   ============================================ */
var menubar = document.getElementById('ckMenubar');
var menuStatus = document.getElementById('ckMenuStatus');
var exportOptions = { svgTransparent: false, pngTransparent: false };

function setTool(t) {
    if (editingBlocked()) return;
    transformPivot = null;
    cancelPaletteDrag();
    cancelPropsDrag();
    cancelPlacement();
    if (isPanning) endPan();
    tool = t;
    wireStart = null;
    hoverPort = null;
    drag = null;
    syncInteractionCursor();
    renderOverlay();
    syncMenuState();
    setStatus('');
    updateQuickstartVisibility();
}

function syncMenuStatus() {
    if (!menuStatus) return;
    var label = textSession ? 'Enter 确认，Esc 取消' : placement ? '连续放置 · Esc 退出' : ({ select: '选择', wire: '连线', label: '文字标注' }[tool] || '选择');
    menuStatus.textContent = label + ' · ' + Math.round(viewTransform.scale * 100) + '%';
}

function syncMenuState() {
    if (!menubar) return;
    var count = selItems().length;
    var disabled = {
        undo: !undoStack.length, redo: !redoStack.length, paste: !clipboard.length,
        'select-all': !doc.items.length,
        ungroup: !sel.some(function (id) { return !!groupOf(id); }),
        'zoom-in': viewTransform.scale >= 10, 'zoom-out': viewTransform.scale <= 0.1
    };
    var checked = {
        'tool-select': tool === 'select' && !placement, 'tool-wire': tool === 'wire', 'tool-label': tool === 'label',
        'toggle-grid': gridEnabled, 'toggle-theme': Theme.get() === 'dark',
        'svg-transparent': exportOptions.svgTransparent, 'png-transparent': exportOptions.pngTransparent
    };
    menubar.querySelectorAll('[data-action]').forEach(function (btn) {
        var action = btn.getAttribute('data-action');
        var transform = ['rotate', 'flip-h', 'flip-v'].indexOf(action) >= 0;
        btn.disabled = !!disabled[action] || (!(transform && pendingDraft()) && count < Number(btn.getAttribute('data-min-selection') || 0));
        if (Object.prototype.hasOwnProperty.call(checked, action)) btn.setAttribute('aria-checked', String(checked[action]));
    });
    document.getElementById('wireModeBtn').textContent = '走线：' + (wireMode === 'orth' ? '正交' : '斜线') + '（点击切换）';
    syncMenuStatus();
}

/* 菜单操作统一分发，导入导出与原编辑操作共用实现 */
var menuActions = {
    'new': newDoc,
    'save-local': function () {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(doc));
            suppressSave = false;
            hintMsg = '已保存到本地浏览器；备份请使用 File → Export → JSON';
            setStatus('');
        } catch (err) { alert('保存失败，请导出 JSON 备份：' + err.message); }
    },
    'import-json': function () { setTool('select'); impFile.click(); },
    'export-svg': exportSVG, 'export-png': exportPNG, 'export-pdf': exportPDF, 'export-json': exportJSON,
    'svg-transparent': function () { exportOptions.svgTransparent = !exportOptions.svgTransparent; },
    'png-transparent': function () { exportOptions.pngTransparent = !exportOptions.pngTransparent; },
    'close-editor': function () {
        var message = suppressSave ? '当前载入的标准图尚未保存，仍要返回主页？' : '返回主页？当前工程已自动保存在此浏览器，建议先导出 JSON 备份。';
        if (confirm(message)) location.href = '../../index.html';
    },
    undo: undo, redo: redo, copy: copySel, paste: pasteClip, 'delete': delSel,
    cut: function () { if (selItems().length) { copySel(); delSel(); } },
    'select-all': function () { setTool('select'); sel = doc.items.map(function (it) { return it.id; }); render(); },
    'open-insert': function () { openMenu(menubar.querySelector('[aria-controls="menuInsert"]'), true); },
    'zoom-in': function () { zoomView(1.1); },
    'zoom-out': function () { zoomView(1 / 1.1); },
    'fit-content': fitContent,
    'reset-zoom': function () { zoomView(1 / viewTransform.scale); },
    'toggle-grid': function () { gridEnabled = !gridEnabled; updateGridVisibility(); },
    'toggle-theme': function () { Theme.toggle(); },
    'tool-select': function () { setTool('select'); },
    'tool-wire': function () { setTool('wire'); },
    'tool-label': function () { setTool('label'); },
    'wire-mode': function () {
        wireMode = wireMode === 'orth' ? 'diag' : 'orth';
        if (wireStart) renderOverlay();   // 进行中的连线预览同步切换
    },
    rotate: function () { transformSel('rot'); },
    'flip-h': function () { transformSel('fh'); }, 'flip-v': function () { transformSel('fv'); },
    group: groupSel, ungroup: ungroupSel
};
['l', 'cx', 'r', 't', 'cy', 'b'].forEach(function (kind) {
    menuActions['align-' + kind] = function () { alignSel(kind); };
});
['h', 'v'].forEach(function (axis) {
    menuActions['distribute-' + axis] = function () { distributeSel(axis); };
});
['top', 'up', 'down', 'bottom'].forEach(function (kind) {
    menuActions['layer-' + kind] = function () { zOrder(kind); };
});

/* 插入分类与左侧面板使用相同的 catalog，不维护第二套器件清单 */
function buildInsertMenu() {
    var html = '<button type="button" role="menuitem" data-action="tool-label">插入文字 <kbd>T</kbd></button><hr role="separator">' +
        '<p class="ck-menu-note">连续放置；R 逆时针，Shift+R 左右翻转，Ctrl+R 上下翻转，Esc 退出</p>';
    function category(name, ids, index) {
        if (!ids.length) return;
        var menuId = 'menuDevice' + index;
        html += '<button type="button" role="menuitem" aria-haspopup="true" aria-expanded="false" aria-controls="' + menuId + '">' +
            Razavi.esc(name) + '<span class="ck-menu-arrow">›</span></button>' +
            '<div class="ck-menu-popup" id="' + menuId + '" role="menu" aria-label="' + Razavi.esc(name) + '" hidden>';
        ids.forEach(function (id) {
            var m = Razavi.meta(id);
            html += '<button type="button" role="menuitem" class="ck-menu-device" data-device="' + Razavi.esc(id) +
                '" title="' + Razavi.esc(m.nameZh + ' / ' + m.name) + '">' + palPreview(id) + '<span>' + Razavi.esc(m.nameZh) + '</span></button>';
        });
        html += '</div>';
    }
    Razavi.CATS.forEach(function (cat, index) {
        var ids = Razavi.CATALOG.filter(function (e) { return e.palette && e.category === cat.id; })
            .map(function (e) { return e.id; });
        category(cat.name, ids, index);
    });
    category('绘图辅助', Razavi.AUX_ORDER, 'Aux');
    document.getElementById('menuInsert').innerHTML = html;
}

function menuOwner(popup) {
    return menubar.querySelector('[aria-controls="' + popup.id + '"]');
}

function closeMenu(popup) {
    popup.querySelectorAll('.ck-menu-popup').forEach(function (child) {
        child.hidden = true;
        menuOwner(child).setAttribute('aria-expanded', 'false');
    });
    popup.hidden = true;
    menuOwner(popup).setAttribute('aria-expanded', 'false');
}

function closeMenus(restoreFocus) {
    var trigger = menubar.querySelector('.ck-menu-trigger[aria-expanded="true"]');
    menubar.querySelectorAll('.ck-menu > .ck-menu-popup').forEach(closeMenu);
    if (restoreFocus && trigger) trigger.focus({ preventScroll: true });
    schedulePlacementPreview();
}

function menuItems(popup) {
    return Array.prototype.filter.call(popup.children, function (el) { return el.tagName === 'BUTTON' && !el.disabled; });
}

function openMenu(button, focusFirst) {
    var popup = document.getElementById(button.getAttribute('aria-controls'));
    if (!popup) return;
    var parent = button.closest('.ck-menu-popup');
    if (!parent) closeMenus(false);
    else Array.prototype.forEach.call(parent.children, function (el) {
        if (el.classList.contains('ck-menu-popup') && el !== popup) closeMenu(el);
    });
    syncMenuState();
    popup.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    popup.style.left = '0px';
    popup.style.top = '0px';
    var r = button.getBoundingClientRect(), p = parent && parent.getBoundingClientRect();
    var w = popup.offsetWidth, h = popup.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var x = parent ? p.right - 1 : r.left;
    var y = parent ? r.top : r.bottom + 2;
    if (x + w > vw - 8) x = parent ? p.left - w + 1 : vw - w - 8;
    if (y + h > vh - 8) y = parent ? vh - h - 8 : Math.max(8, r.top - h - 2);
    popup.style.left = Math.max(8, Math.min(x, vw - w - 8)) + 'px';
    popup.style.top = Math.max(8, Math.min(y, vh - h - 8)) + 'px';
    schedulePlacementPreview();
    if (focusFirst) {
        var items = menuItems(popup);
        if (items.length) items[0].focus({ preventScroll: true });
    }
}

function insertMenuDevice(type) {
    beginPlacement(type);
}

function initMenus() {
    buildInsertMenu();
    menubar.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn || btn.disabled) return;
        if (btn.hasAttribute('aria-controls')) {
            var popup = document.getElementById(btn.getAttribute('aria-controls'));
            if (!popup.hidden && btn.classList.contains('ck-menu-trigger')) closeMenu(popup);
            else openMenu(btn, e.detail === 0);
            return;
        }
        var action = btn.getAttribute('data-action');
        var device = btn.getAttribute('data-device');
        if (textSession && action !== 'toggle-theme') { textEditor.notify(); return; }
        var keepOpen = btn.getAttribute('role') === 'menuitemcheckbox';
        if (!keepOpen) {
            closeMenus(false);
            svg.focus({ preventScroll: true });
        }
        if (device) insertMenuDevice(device);
        else if (Object.prototype.hasOwnProperty.call(menuActions, action)) menuActions[action]();
        syncMenuState();
    });
    menubar.addEventListener('pointerover', function (e) {
        if (e.pointerType === 'touch') return;
        var btn = e.target.closest('button');
        if (!btn || btn.contains(e.relatedTarget)) return;
        if (btn.classList.contains('ck-menu-trigger')) {
            if (menubar.querySelector('.ck-menu-trigger[aria-expanded="true"]') && btn.getAttribute('aria-expanded') !== 'true') openMenu(btn, false);
            return;
        }
        var parent = btn.closest('.ck-menu-popup');
        if (!parent || parent.hidden) return;
        Array.prototype.forEach.call(parent.children, function (el) {
            if (el.classList.contains('ck-menu-popup') && el.id !== btn.getAttribute('aria-controls')) closeMenu(el);
        });
        if (!btn.disabled && btn.hasAttribute('aria-controls')) openMenu(btn, false);
    });
    menubar.addEventListener('keydown', function (e) {
        /* 菜单焦点内不触发画布快捷键或空格平移 */
        e.stopPropagation();
        var btn = e.target.closest('button');
        if (!btn) return;
        var popup = btn.closest('.ck-menu-popup');
        var owner = popup && menuOwner(popup);
        var isSubmenu = owner && !owner.classList.contains('ck-menu-trigger');
        if (e.key === 'Tab') { closeMenus(true); return; }
        if (e.key === 'Escape') {
            e.preventDefault();
            if (isSubmenu) { closeMenu(popup); owner.focus({ preventScroll: true }); }
            else closeMenus(true);
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            btn.click();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            if (!popup) { openMenu(btn, true); return; }
            var items = menuItems(popup), index = items.indexOf(btn);
            if (!items.length) return;
            if (e.key === 'Home') index = 0;
            else if (e.key === 'End') index = items.length - 1;
            else index = (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[index].focus({ preventScroll: true });
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            if (e.key === 'ArrowRight' && popup && btn.hasAttribute('aria-controls')) { openMenu(btn, true); return; }
            if (e.key === 'ArrowLeft' && isSubmenu) { closeMenu(popup); owner.focus({ preventScroll: true }); return; }
            var triggers = Array.prototype.slice.call(menubar.querySelectorAll('.ck-menu-trigger'));
            var root = btn.closest('.ck-menu').querySelector('.ck-menu-trigger');
            var next = (triggers.indexOf(root) + (e.key === 'ArrowRight' ? 1 : -1) + triggers.length) % triggers.length;
            openMenu(triggers[next], true);
        }
    });
    document.addEventListener('pointerdown', function (e) { if (!menubar.contains(e.target)) closeMenus(false); });
    menubar.addEventListener('focusout', function () {
        setTimeout(function () { if (!menubar.contains(document.activeElement)) closeMenus(false); }, 0);
    });
    window.addEventListener('resize', function () { closeMenus(true); });
    window.addEventListener('blur', function () { closeMenus(false); });
    window.addEventListener('scroll', function (e) {
        /* 页面移动时收起菜单；菜单自身滚动时仅关闭其子菜单 */
        if (e.target.classList && e.target.classList.contains('ck-menu-popup')) {
            Array.prototype.forEach.call(e.target.children, function (el) {
                if (el.classList.contains('ck-menu-popup')) closeMenu(el);
            });
        } else closeMenus(false);
    }, true);
    syncMenuState();
}

/* ============================================
   I 键器件选择器（浮动搜索面板）
   ============================================ */
var pickerEl = null;

function openDevicePicker() {
    if (editingBlocked()) return;
    if (pickerEl) closeDevicePicker();
    cancelPaletteDrag();
    hidePlacementPreview();
    var mask = document.createElement('div');
    mask.className = 'ck-picker-mask';
    var panel = document.createElement('div');
    panel.className = 'ck-picker';
    /* 居中于视口 */
    panel.style.left = '50%'; panel.style.top = '40%';
    panel.style.transform = 'translate(-50%, -40%)';
    panel.innerHTML = '<div class="ck-picker-hd">选取后连续放置（Esc 关闭）</div>' +
        '<input class="ck-picker-input" type="text" placeholder="搜索器件名称…" autocomplete="off">' +
        '<div class="ck-picker-body"></div>';
    mask.appendChild(panel);
    document.body.appendChild(mask);
    pickerEl = mask;
    var input = panel.querySelector('.ck-picker-input');
    var body = panel.querySelector('.ck-picker-body');
    input.focus();
    renderPickerList(body, '');
    input.addEventListener('input', function () {
        renderPickerList(body, input.value.trim().toLowerCase());
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') return;
        e.stopPropagation();
        if (e.isComposing) return;
        if (e.key === 'Escape') { e.preventDefault(); closeDevicePicker(); svg.focus({ preventScroll: true }); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            var items = Array.prototype.slice.call(body.querySelectorAll('.ck-picker-item'));
            if (!items.length) return;
            var cur = body.querySelector('.ck-picker-item.active');
            var idx = cur ? items.indexOf(cur) : -1;
            if (e.key === 'ArrowDown') idx = (idx + 1) % items.length;
            else idx = (idx - 1 + items.length) % items.length;
            if (cur) cur.classList.remove('active');
            items[idx].classList.add('active');
            items[idx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            var active = body.querySelector('.ck-picker-item.active');
            if (active) { pickFromPicker(active.getAttribute('data-type')); }
        }
    });
    mask.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Escape') {
            e.preventDefault();
            closeDevicePicker();
            svg.focus({ preventScroll: true });
        } else if (e.key === 'Tab') {
            var focusable = [input].concat(Array.prototype.slice.call(body.querySelectorAll('button')));
            var i = focusable.indexOf(document.activeElement);
            if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === focusable.length - 1)) {
                e.preventDefault();
                focusable[e.shiftKey ? focusable.length - 1 : 0].focus();
            }
        }
    });
    mask.addEventListener('click', function (e) {
        if (e.target === mask) { closeDevicePicker(); svg.focus({ preventScroll: true }); }
    });
}

function renderPickerList(body, query) {
    var html = '';
    var firstType = null;
    Razavi.CATS.forEach(function (cat) {
        var ids = [];
        Razavi.CATALOG.forEach(function (e) {
            if (!e.palette || e.category !== cat.id) return;
            if (query && (e.name + ' ' + e.nameZh + ' ' + e.id).toLowerCase().indexOf(query) < 0) return;
            ids.push(e.id);
        });
        if (!ids.length) return;
        html += '<div class="ck-picker-cat">' + Razavi.esc(cat.name) + '</div>';
        ids.forEach(function (id) {
            var m = Razavi.meta(id);
            if (!firstType) firstType = id;
            html += '<button type="button" class="ck-picker-item" data-type="' + Razavi.esc(id) + '">' +
                palPreview(id) + '<span>' + Razavi.esc(m.nameZh) + ' <small style="color:var(--color-text-muted)">' + Razavi.esc(m.name) + '</small></span></button>';
        });
    });
    /* 绘图辅助 */
    var auxIds = [];
    Razavi.AUX_ORDER.forEach(function (id) {
        if (query && (id + ' ' + (Razavi.AUX[id].nameZh || '') + ' ' + (Razavi.AUX[id].name || '')).toLowerCase().indexOf(query) < 0) return;
        auxIds.push(id);
    });
    if (auxIds.length) {
        html += '<div class="ck-picker-cat">绘图辅助</div>';
        auxIds.forEach(function (id) {
            var a = Razavi.meta(id);
            if (!firstType) firstType = id;
            html += '<button type="button" class="ck-picker-item" data-type="' + Razavi.esc(id) + '">' +
                palPreview(id) + '<span>' + Razavi.esc(a.nameZh || id) + '</span></button>';
        });
    }
    if (!html) html = '<div class="ck-picker-empty">无匹配器件</div>';
    body.innerHTML = html;
    if (firstType) body.querySelector('.ck-picker-item').classList.add('active');
    /* 绑定点击 */
    Array.prototype.forEach.call(body.querySelectorAll('.ck-picker-item'), function (btn) {
        btn.addEventListener('click', function () { pickFromPicker(btn.getAttribute('data-type')); });
        btn.addEventListener('mouseenter', function () {
            var cur = body.querySelector('.ck-picker-item.active');
            if (cur) cur.classList.remove('active');
            btn.classList.add('active');
        });
    });
}

function pickFromPicker(type) {
    closeDevicePicker();
    svg.focus({ preventScroll: true });
    insertMenuDevice(type);
}

function closeDevicePicker() {
    if (pickerEl && pickerEl.parentNode) {
        pickerEl.parentNode.removeChild(pickerEl);
    }
    pickerEl = null;
    schedulePlacementPreview();
}

/* 捕获拖入期间的 Esc，避免焦点变化使取消丢失 */
window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || (!paletteDrag && !propsDrag)) return;
    e.preventDefault();
    e.stopPropagation();
    if (paletteDrag) setTool('select');
    else cancelPropsDrag();
}, true);

document.addEventListener('keydown', function (e) {
    if (menubar.querySelector('.ck-menu-trigger[aria-expanded="true"]')) {
        if (e.key === 'Escape') { e.preventDefault(); closeMenus(true); }
        return;
    }
    if (shortcutBlocked(e) || e.altKey) return;
    var k = e.key.toLowerCase();
    var ctrl = e.ctrlKey || e.metaKey;
    if (k === 'escape') {
        e.preventDefault();
        if (isPanning) endPan();
        if (placement || paletteDrag) setTool('select');
        else if (wireStart) { wireStart = null; renderOverlay(); }
        else if (tool !== 'select') setTool('select');
        else {
            drag = null;
            sel = [];
            renderOverlay();
            renderProps();
            syncMenuState();
        }
        return;
    }
    var transformKey = k === 'r' || (!ctrl && !e.shiftKey && (k === 'h' || k === 'v'));
    var canvasContext = document.activeElement === svg || svg.contains(document.activeElement) ||
        (document.activeElement === document.body && isCanvasPoint(lastPointer));
    if (transformKey && !(ctrl && e.shiftKey) && canvasContext && !propsDrag && !drag && !isPanning &&
            !spaceDown && (pendingDraft() || (tool === 'select' && selItems().length))) {
        e.preventDefault();
        if (!e.repeat) transformSel(k === 'h' || e.shiftKey ? 'fh' : (k === 'v' || ctrl ? 'fv' : 'rot'));
        return;
    }
    if (paletteDrag || propsDrag || drag || isPanning) return;
    if (ctrl) {
        if (k === 'a') { e.preventDefault(); setTool('select'); sel = doc.items.map(function (it) { return it.id; }); render(); }
        else if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
        else if (k === 'c') { e.preventDefault(); copySel(); }
        else if (k === 'v') { e.preventDefault(); pasteClip(); }
        else if (k === 'g') { e.preventDefault(); if (e.shiftKey) ungroupSel(); else groupSel(); }
        return;
    }
    if (e.shiftKey) return;
    if (k === 'w') setTool('wire');
    else if (k === 't') setTool('label');
    else if (k === 'i') { e.preventDefault(); openDevicePicker(); }
    else if (k === 'f') { e.preventDefault(); fitContent(); }
    else if (k === 'u') { e.preventDefault(); undo(); }
    else if (!placement) {
        if (k === 'delete' || k === 'backspace') { e.preventDefault(); delSel(); }
        /* 变换键已在修饰键分发前处理，避免误拦截浏览器快捷键。 */
    }
});

/* ============================================
   导入 / 导出 / 持久化
   ============================================ */
function exportSvgStr(withBg) {
    return Razavi.docSvg(doc, {
        standalone: true, bg: withBg ? '#ffffff' : null, margin: 20,
        font: FONT, editorText: true, stroke: '#1a1a1a', textColor: '#1a1a1a'
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

async function exportSVG() {
    if (editingBlocked()) return;
    await readyTextFonts();
    if (editingBlocked()) return;
    var r = exportSvgStr(!exportOptions.svgTransparent);
    download('circuit.svg', new Blob([r.str], { type: 'image/svg+xml' }));
}

async function exportPNG() {
    if (editingBlocked()) return;
    await readyTextFonts();
    if (editingBlocked()) return;
    var trans = exportOptions.pngTransparent;
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
}

/* 导出 PDF：白底 2x 位图（JPEG 不支持透明），走 common.js 最小 PDF 生成器 */
async function exportPDF() {
    if (editingBlocked()) return;
    await readyTextFonts();
    if (editingBlocked()) return;
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
}

async function readyTextFonts() {
    if (document.fonts) await document.fonts.ready;
    Razavi.clearTextCache();
}
function exportJSON() {
    if (editingBlocked()) return;
    download('circuit.json', new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
}

var impFile = document.getElementById('impFile');
impFile.addEventListener('change', function () {
    var f = impFile.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
        if (editingBlocked()) { impFile.value = ''; return; }
        try {
            var d = JSON.parse(rd.result);
            if (!d || !Array.isArray(d.items)) throw new Error('bad json');
            var migrated = migrateDoc(d);
            d = normalizeDoc(d);
            if (doc.items.length && !confirm('导入将替换当前画布，是否继续？（可用 Ctrl+Z 恢复）')) { impFile.value = ''; return; }
            pushUndo();
            doc = d;
            sel = [];
            drag = null;
            hintMsg = migrated ? '导入的旧版工程已自动迁移为 Razavi 器件库' : '已导入 JSON 工程，Ctrl+Z 可恢复原画布';
            setTool('select');
            render();
            fitContent();
            setStatus('');
        } catch (err) {
            alert('JSON 文件无效：' + err.message);
        }
        impFile.value = '';
    };
    rd.readAsText(f);
});

function newDoc() {
    if (editingBlocked()) return;
    if (doc.items.length && !confirm('确定清空整个画布并新建工程？（可用 Ctrl+Z 撤销）')) return;
    pushUndo();
    doc = { items: [], groups: [] };
    sel = [];
    drag = null;
    hintMsg = '';
    setTool('select');
    render();
    fitContent();
    setStatus('');
    updateQuickstartVisibility();
}

function saveLocal() {
    if (suppressSave || textSession) return;
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
    initMenus();
    initTextEditing();
    applyViewTransform();
    observeViewport();
    var loaded = loadLocal();
    if (!loaded) sampleDoc();
    else if (loaded === 'v1') hintMsg = '已从旧版存档自动迁移为 Razavi 器件库';
    render();
    setStatus('');
    updateQuickstartVisibility();

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
        updateQuickstartVisibility();
    }
})();

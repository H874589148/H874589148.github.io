/* razavi/render.js
   Razavi 符号库共享渲染器（无依赖，暴露 window.Razavi）
   依赖：razavi-symbols.js 生成的 RAZAVI_CATEGORIES / RAZAVI_CATALOG / RAZAVI_SYMBOLS
   能力：符号 JSON → SVG 片段、编辑器文档条目（comp/wire/label）渲染、整图 docSvg、
        端口/包围盒查询、辅助绘图符号（连接点/箭头/功能块/MUX） */

window.Razavi = (function () {
'use strict';

var SYMS = window.RAZAVI_SYMBOLS || {};
var CATALOG = window.RAZAVI_CATALOG || [];
var CATS = window.RAZAVI_CATEGORIES || [];

var ROLE_W = { normal: 1, emphasis: 1.8, ground: 1 };   // strokeRole → 线宽倍率
var DIRV = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

/* 文字标签位置：top=框上方居中 / side=框右侧 / center=中心 / none=不显示；默认 top */
var TEXT_POS = {
    nmos: 'side', pmos: 'side', npn: 'side', pnp: 'side',
    'current-source': 'side', 'voltage-source': 'side', 'pulse-voltage-source': 'side',
    ground: 'none', 'vdd-port': 'none'
};

/* ---- 辅助绘图符号（非 razavi 库，编辑器「绘图辅助」组） ---- */
var AUX = {
    dot: {
        name: '连接点', bbox: [-5, -5, 5, 5], textPos: 'none',
        ports: [{ x: 0, y: 0, n: 'p' }],
        body: function (c) { return '<circle cx="0" cy="0" r="3" fill="' + c.stroke + '" stroke="none"/>'; }
    },
    arrow: {
        name: '标注箭头', bbox: [-20, -6, 21, 6], textPos: 'none',
        ports: [{ x: -20, y: 0, n: 'tail' }, { x: 20, y: 0, n: 'head' }],
        body: function (c) {
            return '<path d="M-20,0 L15,0"/><polygon points="9,-5 9,5 20,0" fill="' + c.stroke + '" stroke="none"/>';
        }
    },
    block: {
        name: '功能块', bbox: [-40, -20, 40, 20], textPos: 'center',
        ports: [{ x: -40, y: 0, n: 'L' }, { x: 40, y: 0, n: 'R' }, { x: 0, y: -20, n: 'T' }, { x: 0, y: 20, n: 'B' }],
        body: function () { return '<rect x="-40" y="-20" width="80" height="40"/>'; }
    },
    mux: {
        name: 'MUX', bbox: [-24, -24, 24, 24], textPos: 'center',
        ports: [{ x: -24, y: -10, n: 'in0' }, { x: -24, y: 10, n: 'in1' }, { x: 24, y: 0, n: 'out' }, { x: 0, y: 24, n: 'sel' }],
        body: function () { return '<path d="M-24,-24 L-24,24 L24,10 L24,-10 Z"/><path d="M0,24 L0,17"/>'; }
    }
};
var AUX_ORDER = ['dot', 'arrow', 'block', 'mux'];

/* ============================================ 基础工具 ============================================ */
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmt(v) { return Math.round(v * 1000) / 1000; }

function isRazavi(id) { return !!SYMS[id]; }
function catEntry(id) { for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i]; return null; }
function catName(cid) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === cid) return CATS[i].name; return cid; }

/* 颜色输出：var(--x) 走 style（表现属性不支持 CSS 变量），其余走 XML 属性 */
function Painter() { this.attrs = ''; this.styles = ''; }
Painter.prototype.put = function (kind, color) {
    if (!color) color = 'none';
    if (color.indexOf('var(') === 0) this.styles += kind + ':' + color + ';';
    else this.attrs += ' ' + kind + '="' + color + '"';
};
Painter.prototype.tag = function () { return this.attrs + (this.styles ? ' style="' + this.styles + '"' : ''); };

/* ============================================ 符号解析 ============================================ */
/* variant：undefined/'' = 默认变体；'__base__' = 基础版（无变体） */
function resolve(id, variant) {
    var s = SYMS[id];
    if (!s) return { primitives: [], pins: [] };
    var vid = variant || s.defaultVariantId || '';
    if (vid === '__base__') vid = '';
    if (!vid) return { primitives: s.primitives || [], pins: s.pins || [] };
    var v = null, i;
    for (i = 0; i < (s.variants || []).length; i++) if (s.variants[i].id === vid) v = s.variants[i];
    if (!v) return { primitives: s.primitives || [], pins: s.pins || [] };
    var hp = v.hiddenPrimitiveParts || [];
    var prims = (s.primitives || []).filter(function (p) { return !p.part || hp.indexOf(p.part) < 0; });
    prims = prims.concat(v.additionalPrimitives || []);
    var hn = v.hiddenPinNames || [];
    var pins = (s.pins || []).filter(function (p) { return hn.indexOf(p.name) < 0; });
    return { primitives: prims, pins: pins };
}

function ports(id, variant) {
    if (AUX[id]) return AUX[id].ports;
    return resolve(id, variant).pins
        .filter(function (p) { return !p.presentation || p.presentation.visibility !== 'hidden'; })
        .map(function (p) { return { x: p.at.x, y: p.at.y, n: p.name }; });
}

function bboxArr(id) {
    if (AUX[id]) return AUX[id].bbox;
    var s = SYMS[id];
    if (!s) return [-10, -10, 10, 10];
    var vb = s.viewBox;
    return [vb.x, vb.y, vb.x + vb.width, vb.y + vb.height];
}

/* 变体下拉选项（当前仅 nmos/pmos 有变体）；无变体返回 null */
function variantOptions(id) {
    var s = SYMS[id];
    if (!s || !s.variants || !s.variants.length) return null;
    return [{ id: '', label: '三端教材版(默认)' }, { id: '__base__', label: '四端完整版(含衬底)' }];
}

function textPos(id) {
    if (AUX[id]) return AUX[id].textPos;
    return TEXT_POS[id] || 'top';
}

function meta(id) {
    if (AUX[id]) {
        var a = AUX[id];
        return { id: id, name: a.name, nameZh: a.name, cat: 'aux', catName: '绘图辅助', bbox: a.bbox, textPos: a.textPos, razavi: false, hasVariants: false };
    }
    var e = catEntry(id);
    return {
        id: id, name: e ? e.name : id, nameZh: e ? e.nameZh : id,
        cat: e ? e.category : '', catName: e ? catName(e.category) : '',
        bbox: bboxArr(id), textPos: textPos(id), razavi: true,
        hasVariants: !!(SYMS[id] && SYMS[id].variants && SYMS[id].variants.length)
    };
}

/* 编辑器符号表：palette=true 的 razavi 器件 + 辅助符号 */
function metaAll() {
    var m = {};
    CATALOG.forEach(function (e) { if (e.palette) m[e.id] = meta(e.id); });
    AUX_ORDER.forEach(function (id) { m[id] = meta(id); });
    return m;
}

/* ============================================ 符号 SVG 渲染 ============================================ */
function primSvg(p, o) {
    var role = (p.style && p.style.strokeRole) || 'normal';
    var w = fmt((ROLE_W[role] || 1) * o.sw);
    var cap = (p.style && p.style.lineCap) || 'butt';
    var join = (p.style && p.style.lineJoin) || 'miter';
    var ml = (p.style && p.style.miterLimit) ? ' stroke-miterlimit="' + p.style.miterLimit + '"' : '';
    var pt = new Painter(), g;
    if (p.kind === 'line' || p.kind === 'polyline' || p.kind === 'path') {
        pt.put('stroke', o.stroke);
        if (p.kind === 'line') g = '<line x1="' + fmt(p.from.x) + '" y1="' + fmt(p.from.y) + '" x2="' + fmt(p.to.x) + '" y2="' + fmt(p.to.y) + '"';
        else if (p.kind === 'polyline') g = '<polyline points="' + p.points.map(function (q) { return fmt(q.x) + ',' + fmt(q.y); }).join(' ') + '"';
        else g = '<path d="' + p.data + '"';
        return g + pt.tag() + ' stroke-width="' + w + '" fill="none" stroke-linecap="' + cap + '" stroke-linejoin="' + join + '"' + ml + '/>';
    }
    if (p.kind === 'polygon' || p.kind === 'circle') {
        pt.put('fill', p.fill === 'foreground' ? o.stroke : (p.fill || 'none'));
        pt.put('stroke', p.stroke === 'foreground' ? o.stroke : (p.stroke || 'none'));
        if (p.kind === 'polygon') g = '<polygon points="' + p.points.map(function (q) { return fmt(q.x) + ',' + fmt(q.y); }).join(' ') + '"';
        else g = '<circle cx="' + fmt(p.center.x) + '" cy="' + fmt(p.center.y) + '" r="' + fmt(p.radius) + '"';
        return g + pt.tag() + (p.stroke && p.stroke !== 'none' ? ' stroke-width="' + w + '"' : '') + '/>';
    }
    return '';
}

/* 引脚名（showName 的引脚，如 D/CK/Q）：画在引线内侧 */
function pinLabelSvg(p, o) {
    if (!(p.presentation && p.presentation.showName)) return '';
    var d = DIRV[p.direction] || [0, 0];
    var lead = p.presentation.leadLength || 10;
    var size = fmt(16 * (p.presentation.textSizeScale || 0.68));
    var off = lead + 2;
    var lx = p.at.x - d[0] * off, ly = p.at.y - d[1] * off;
    var anchor = 'middle', base;
    if (p.direction === 'west') { anchor = 'start'; base = ly + size * 0.35; }
    else if (p.direction === 'east') { anchor = 'end'; base = ly + size * 0.35; }
    else if (p.direction === 'north') base = ly + size * 0.8;
    else base = ly;
    var pt = new Painter();
    pt.put('fill', o.textColor);
    return '<text x="' + fmt(lx) + '" y="' + fmt(base) + '" font-size="' + size + '" text-anchor="' + anchor + '"' +
        ' font-family="' + esc(o.font) + '" font-style="italic" stroke="none"' + pt.tag() + '>' + esc(p.name) + '</text>';
}

/* 单个符号的内联 SVG（不含外层变换） */
function symbolInner(id, opts) {
    opts = opts || {};
    var o = {
        stroke: opts.stroke || '#1a1a1a', sw: opts.sw || 1.5,
        font: opts.font || "'Fira Code',monospace",
        textColor: opts.textColor || opts.stroke || '#1a1a1a',
        showPinNames: opts.showPinNames !== false
    };
    var r = resolve(id, opts.variant);
    var s = '';
    r.primitives.forEach(function (p) { s += primSvg(p, o); });
    if (o.showPinNames) r.pins.forEach(function (p) { s += pinLabelSvg(p, o); });
    return s;
}

/* ============================================ 文档条目渲染 ============================================ */
function compWorldBBox(c) {
    var b = bboxArr(c.type);
    var pts = [{ x: b[0], y: b[1] }, { x: b[2], y: b[1] }, { x: b[0], y: b[3] }, { x: b[2], y: b[3] }];
    var th = (c.rot || 0) * Math.PI / 2;
    var cos = Math.round(Math.cos(th)), sin = Math.round(Math.sin(th));
    var sx = c.fh ? -1 : 1, sy = c.fv ? -1 : 1;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(function (p) {
        var px = p.x * sx, py = p.y * sy;
        var wx = c.x + cos * px - sin * py, wy = c.y + sin * px + cos * py;
        x0 = Math.min(x0, wx); y0 = Math.min(y0, wy);
        x1 = Math.max(x1, wx); y1 = Math.max(y1, wy);
    });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
}

function labelBBox(it) {
    var size = it.size || 13;
    var w = String(it.text || '').length * size * 0.62 + 4, h = size * 1.4;
    var x0 = it.anchor === 'end' ? it.x - w : (it.anchor === 'middle' ? it.x - w / 2 : it.x);
    return { x0: x0, y0: it.y - size, x1: x0 + w, y1: it.y - size + h };
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
    if (it.kind === 'label') return labelBBox(it);
    return compWorldBBox(it);
}

/* 含文字标签的外扩包围盒（导出裁剪用） */
function itemOuterBBox(it) {
    var b = itemBBox(it);
    if (it.kind === 'comp' && it.text) {
        var tp = textPos(it.type);
        if (tp === 'top') return { x0: b.x0 - 6, y0: b.y0 - 24, x1: b.x1 + 6, y1: b.y1 };
        if (tp === 'side') return { x0: b.x0, y0: b.y0 - 8, x1: b.x1 + 10 + String(it.text).length * 8, y1: b.y1 + 8 };
    }
    return b;
}

function itemSvg(it, opts) {
    opts = opts || {};
    var font = opts.font || "'Fira Code',monospace";
    var pt, stroke;
    if (it.kind === 'wire') {
        pt = new Painter();
        pt.put('stroke', it.stroke || opts.stroke || '#1a1a1a');
        return '<polyline points="' + it.pts.map(function (p) { return fmt(p.x) + ',' + fmt(p.y); }).join(' ') +
            '" fill="none"' + pt.tag() + ' stroke-width="' + (it.sw || 1.5) + '"' +
            ' stroke-linejoin="round" stroke-linecap="round"' + (it.dash ? ' stroke-dasharray="' + it.dash + '"' : '') + '/>';
    }
    if (it.kind === 'label') {
        pt = new Painter();
        pt.put('fill', it.stroke || opts.textColor || opts.stroke || '#1a1a1a');
        return '<text x="' + fmt(it.x) + '" y="' + fmt(it.y) + '" font-size="' + (it.size || 13) + '" text-anchor="' +
            (it.anchor || 'start') + '" font-family="' + esc(font) + '" stroke="none"' + pt.tag() + '>' + esc(it.text) + '</text>';
    }
    /* comp */
    stroke = it.stroke || opts.stroke || '#1a1a1a';
    var m = meta(it.type);
    var body;
    if (m.razavi) {
        body = symbolInner(it.type, { stroke: stroke, sw: it.sw || 1.5, variant: it.variant, font: font, textColor: opts.textColor || stroke });
    } else {
        pt = new Painter();
        pt.put('stroke', stroke);
        body = '<g' + pt.tag() + ' stroke-width="' + (it.sw || 1.5) + '" fill="none" stroke-linecap="round" stroke-linejoin="round"' +
            (it.dash ? ' stroke-dasharray="' + it.dash + '"' : '') + '>' + AUX[it.type].body({ stroke: stroke }) + '</g>';
    }
    /* 符号体在 translate(x,y) 组内用局部坐标；文字标签用世界坐标，必须先闭合该组再追加 */
    var s = '<g transform="translate(' + fmt(it.x) + ',' + fmt(it.y) + ')"><g transform="rotate(' + ((it.rot || 0) * 90) +
        ') scale(' + (it.fh ? -1 : 1) + ',' + (it.fv ? -1 : 1) + ')">' + body + '</g></g>';
    if (it.text && m.textPos !== 'none') {
        var bb = compWorldBBox(it);
        var tx, ty, anchor = 'middle';
        if (m.textPos === 'center') { tx = it.x; ty = it.y + 4; }
        else if (m.textPos === 'side') { tx = bb.x1 + 6; ty = it.y + 4; anchor = 'start'; }
        else { tx = (bb.x0 + bb.x1) / 2; ty = bb.y0 - 7; }
        pt = new Painter();
        pt.put('fill', stroke);
        s += '<text x="' + fmt(tx) + '" y="' + fmt(ty) + '" font-size="13" font-family="' + esc(font) +
            '" text-anchor="' + anchor + '" stroke="none"' + pt.tag() + '>' + esc(it.text) + '</text>';
    }
    return s;
}

function docBBox(doc) {
    if (!doc.items || !doc.items.length) return { x0: 0, y0: 0, x1: 100, y1: 100 };
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    doc.items.forEach(function (it) {
        var b = itemOuterBBox(it);
        x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
        x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
}

/* 整图 → 独立 SVG（按内容裁剪）。返回 {str, w, h} */
function docSvg(doc, opts) {
    opts = opts || {};
    var margin = opts.margin == null ? 18 : opts.margin;
    var b = docBBox(doc);
    var x = fmt(b.x0 - margin), y = fmt(b.y0 - margin);
    var w = fmt(b.x1 - b.x0 + 2 * margin), h = fmt(b.y1 - b.y0 + 2 * margin);
    var s = '';
    if (opts.standalone) s += '<?xml version="1.0" encoding="UTF-8"?>\n';
    s += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + x + ' ' + y + ' ' + w + ' ' + h +
        '" width="' + w + '" height="' + h + '"' + (opts.className ? ' class="' + opts.className + '"' : '') + '>';
    if (opts.bg) s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + opts.bg + '"/>';
    (doc.items || []).forEach(function (it) { s += itemSvg(it, opts); });
    return { str: s + '</svg>', w: w, h: h };
}

return {
    CATS: CATS, CATALOG: CATALOG, AUX: AUX, AUX_ORDER: AUX_ORDER,
    isRazavi: isRazavi, meta: meta, metaAll: metaAll, resolve: resolve,
    ports: ports, bboxArr: bboxArr, variantOptions: variantOptions, textPos: textPos,
    symbolInner: symbolInner, itemSvg: itemSvg,
    itemBBox: itemBBox, itemOuterBBox: itemOuterBBox, compWorldBBox: compWorldBBox, labelBBox: labelBBox,
    docBBox: docBBox, docSvg: docSvg, esc: esc
};
})();

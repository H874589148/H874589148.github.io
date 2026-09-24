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
    },
    /* ---- 共享逻辑 IO：沿用旧引脚坐标，单色轮廓与文字由统一渲染器输出 ---- */
    'tt-in': {
        name: '逻辑输入', bbox: [-32, -18, 32, 18], textPos: 'top',
        ports: [{ x: 32, y: 0, n: 'out' }],
        body: function () {
            return '<path d="M-22,-12 H10 L22,0 L10,12 H-22 Z"/><path d="M22,0 H32"/>';
        }
    },
    'tt-out': {
        name: '逻辑输出', bbox: [-32, -18, 32, 18], textPos: 'top',
        ports: [{ x: -32, y: 0, n: 'in' }],
        body: function () {
            return '<path d="M22,-12 H-10 L-22,0 L-10,12 H22 Z"/><path d="M-32,0 H-22"/>';
        }
    },
    'tt-const0': {
        name: '常量 0', bbox: [-18, -18, 18, 18], textPos: 'none', fixedText: '0',
        ports: [{ x: 18, y: 0, n: 'out' }],
        body: function () {
            return '<rect x="-10" y="-10" width="20" height="20"/><path d="M10,0 H18"/>';
        }
    },
    'tt-const1': {
        name: '常量 1', bbox: [-18, -18, 18, 18], textPos: 'none', fixedText: '1',
        ports: [{ x: 18, y: 0, n: 'out' }],
        body: function () {
            return '<rect x="-10" y="-10" width="20" height="20"/><path d="M10,0 H18"/>';
        }
    }
};
var LOGIC_IO_ORDER = ['tt-in', 'tt-out', 'tt-const0', 'tt-const1'];
var AUX_GROUPS = [
    { id: 'logic-io', name: '输入输出', ids: LOGIC_IO_ORDER },
    { id: 'aux', name: '绘图辅助', ids: ['dot', 'arrow', 'block', 'mux'] }
];
var AUX_ORDER = AUX_GROUPS[1].ids.concat(LOGIC_IO_ORDER);

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

/* 编辑器专用富文本；未启用 editorText 的共享调用方保留原排版。 */
var TEXT_FONTS = {
    latin: 'Arial Narrow, Arial, sans-serif',
    cjk: 'Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif'
};
var measureCache = new Map(), measureRoot = null;
function textSize(n, fallback) {
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(6, Math.min(144, n)) : (fallback || 13);
}
function runStyle(r, size) {
    return { bold: r.bold === true, italic: r.italic === true,
        script: ['normal', 'super', 'sub'].indexOf(r.script) >= 0 ? r.script : 'normal', size: textSize(r.size, size) };
}
function sameStyle(a, b) {
    return a.bold === b.bold && a.italic === b.italic && a.script === b.script && a.size === b.size;
}
function plainRich(text, size, align) {
    return { version: 1, align: align, lines: String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n').map(function (line) {
        return { runs: [Object.assign({ text: line }, runStyle({}, size))] };
    }) };
}
function normalizeRichText(value, text, size, align) {
    size = textSize(size);
    align = ['start', 'middle', 'end'].indexOf(align) >= 0 ? align : 'start';
    var valid = value && value.version === 1 && ['start', 'middle', 'end'].indexOf(value.align) >= 0 &&
        Array.isArray(value.lines) && value.lines.length && value.lines.every(function (line) {
            return line && Array.isArray(line.runs) && line.runs.every(function (r) {
                return r && typeof r.text === 'string' && !/[\r\n]/.test(r.text) &&
                    (r.bold == null || typeof r.bold === 'boolean') && (r.italic == null || typeof r.italic === 'boolean') &&
                    (r.size == null || (typeof r.size === 'number' && Number.isFinite(r.size))) &&
                    (r.script == null || ['normal', 'super', 'sub'].indexOf(r.script) >= 0);
            });
        });
    if (!valid) return plainRich(text, size, align);
    return { version: 1, align: value.align, lines: value.lines.map(function (line) {
        var runs = [];
        line.runs.forEach(function (r) {
            var clean = Object.assign({ text: r.text }, runStyle(r, size)), prev = runs[runs.length - 1];
            if (prev && sameStyle(prev, clean)) prev.text += clean.text;
            else if (clean.text || !runs.length) runs.push(clean);
        });
        return { runs: runs.length ? runs : [Object.assign({ text: '' }, runStyle({}, size))] };
    }) };
}
function richPlain(model) {
    return model.lines.map(function (line) { return line.runs.map(function (r) { return r.text; }).join(''); }).join('\n');
}
function fontSegments(text) {
    var result = [];
    Array.from(text).forEach(function (ch) {
        var cp = ch.codePointAt(0);
        var cjk = (cp >= 0x2e80 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) ||
            (cp >= 0xff00 && cp <= 0xffef) || (cp >= 0x20000 && cp <= 0x323af) || '“”‘’…—'.indexOf(ch) >= 0;
        var font = cjk ? TEXT_FONTS.cjk : TEXT_FONTS.latin, prev = result[result.length - 1];
        if (prev && prev.font === font) prev.text += ch;
        else result.push({ text: ch, font: font });
    });
    return result;
}
function clearTextCache() { measureCache.clear(); }
function measureText(text, style, font) {
    var size = style.size * (style.script === 'normal' ? 1 : 0.7);
    var key = JSON.stringify([text, size, style.bold, style.italic, font]);
    if (measureCache.has(key)) return measureCache.get(key);
    var result = { width: Array.from(text).length * size * 0.62, x: 0, y: -size, height: size * 1.25 };
    result.inkWidth = result.width;
    if (typeof document !== 'undefined' && document.body) {
        if (!measureRoot) {
            measureRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            measureRoot.setAttribute('aria-hidden', 'true');
            measureRoot.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
            document.body.appendChild(measureRoot);
        }
        var el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        el.setAttribute('font-family', font);
        el.setAttribute('font-size', size);
        el.setAttribute('font-weight', style.bold ? '700' : '400');
        el.setAttribute('font-style', style.italic ? 'italic' : 'normal');
        el.setAttribute('xml:space', 'preserve');
        el.style.whiteSpace = 'pre';
        el.textContent = text || 'Mg国';
        measureRoot.appendChild(el);
        try {
            var b = el.getBBox(), width = el.getComputedTextLength();
            if (b.height > 0) result = { width: text ? width : 0, x: text ? b.x : 0,
                y: b.y, inkWidth: text ? b.width : 0, height: b.height };
        } catch (err) { /* 无 SVG 测量能力的环境保留估算值，浏览器验收单独验证。 */ }
        measureRoot.removeChild(el);
    }
    if (measureCache.size > 4096) measureCache.clear();
    measureCache.set(key, result);
    return result;
}
function textAnchor(it) {
    if (it.kind === 'label') return { x: it.x, y: it.y, align: it.anchor || 'start' };
    var tp = textPos(it.type), b = compWorldBBox(it);
    if (tp === 'none') return null;
    if (tp === 'center') return { x: it.x, y: it.y + 4, align: 'middle' };
    if (tp === 'side') return { x: b.x1 + 6, y: it.y + 4, align: 'start' };
    return { x: (b.x0 + b.x1) / 2, y: b.y0 - 7, align: 'middle' };
}
function richForItem(it) {
    var a = textAnchor(it);
    return normalizeRichText(it.richText, it.text, it.size, a ? a.align : 'start');
}
function textLayout(it) {
    var a = textAnchor(it);
    if (!a) return null;
    var model = richForItem(it), lines = [], baseline = 0;
    var bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    model.lines.forEach(function (line, index) {
        var width = 0, ascent = 0, descent = 0, maxSize = 6, segments = [];
        line.runs.forEach(function (r) {
            var shift = r.script === 'super' ? -0.4 * r.size : (r.script === 'sub' ? 0.22 * r.size : 0);
            var parts = fontSegments(r.text);
            if (!parts.length) parts = [{ text: '', font: TEXT_FONTS.latin }];
            parts.forEach(function (part) {
                var m = measureText(part.text, r, part.font);
                segments.push({ text: part.text, font: part.font, style: r, x: width, shift: shift, metrics: m });
                width += m.width;
                ascent = Math.max(ascent, -m.y - shift);
                descent = Math.max(descent, m.y + m.height + shift);
                maxSize = Math.max(maxSize, r.size);
            });
        });
        var gap = maxSize * 0.2;
        if (index) baseline += lines[index - 1].descent + Math.max(gap, lines[index - 1].gap) + ascent;
        var left = model.align === 'middle' ? -width / 2 : (model.align === 'end' ? -width : 0);
        bounds.x0 = Math.min(bounds.x0, left);
        bounds.x1 = Math.max(bounds.x1, left + width);
        bounds.y0 = Math.min(bounds.y0, baseline - ascent);
        bounds.y1 = Math.max(bounds.y1, baseline + descent);
        segments.forEach(function (seg) {
            seg.x += left;
            seg.y = baseline + seg.shift;
            bounds.x0 = Math.min(bounds.x0, seg.x + seg.metrics.x);
            bounds.x1 = Math.max(bounds.x1, seg.x + seg.metrics.x + seg.metrics.inkWidth);
        });
        lines.push({ segments: segments, width: width, left: left, baseline: baseline,
            ascent: ascent, descent: descent, gap: gap });
    });
    return { anchor: a, model: model, lines: lines, bounds: bounds,
        bbox: { x0: a.x + bounds.x0, y0: a.y + bounds.y0, x1: a.x + bounds.x1, y1: a.y + bounds.y1 } };
}
function textBBox(it) { var layout = textLayout(it); return layout ? layout.bbox : null; }
function richSvg(it, color) {
    var layout = textLayout(it);
    if (!layout || !richPlain(layout.model)) return '';
    var pt = new Painter(); pt.put('fill', color);
    pt.styles += 'white-space:pre;';
    var s = '<text xml:space="preserve" stroke="none"' + pt.tag() + '>';
    layout.lines.forEach(function (line) {
        line.segments.forEach(function (seg) {
            if (!seg.text) return;
            var r = seg.style;
            s += '<tspan x="' + fmt(layout.anchor.x + seg.x) + '" y="' + fmt(layout.anchor.y + seg.y) +
                '" font-family="' + esc(seg.font) + '" font-size="' + fmt(r.size * (r.script === 'normal' ? 1 : 0.7)) +
                '" font-weight="' + (r.bold ? '700' : '400') + '" font-style="' + (r.italic ? 'italic' : 'normal') +
                '">' + esc(seg.text) + '</tspan>';
        });
    });
    return s + '</text>';
}
function unionBBox(a, b) {
    return b ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : a;
}

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
        var a = AUX[id], group = AUX_GROUPS[LOGIC_IO_ORDER.indexOf(id) >= 0 ? 0 : 1];
        return { id: id, name: a.name, nameZh: a.name, cat: group.id, catName: group.name, bbox: a.bbox, textPos: a.textPos, razavi: false, hasVariants: false, ttOnly: a.ttOnly === true };
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
    if (o.editorText) return richSvg({ kind: 'label', x: lx, y: base, text: p.name, size: size, anchor: anchor,
        richText: { version: 1, align: anchor, lines: [{ runs: [{ text: p.name, italic: true, size: size }] }] } }, o.textColor);
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
        editorText: opts.editorText === true, showPinNames: opts.showPinNames !== false
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

function labelBBox(it, opts) {
    if (opts && opts.editorText) return textBBox(it);
    var size = it.size || 13;
    var w = String(it.text || '').length * size * 0.62 + 4, h = size * 1.4;
    var x0 = it.anchor === 'end' ? it.x - w : (it.anchor === 'middle' ? it.x - w / 2 : it.x);
    return { x0: x0, y0: it.y - size, x1: x0 + w, y1: it.y - size + h };
}

function itemBBox(it, opts) {
    if (it.kind === 'wire') {
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        it.pts.forEach(function (p) {
            x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
            x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
        });
        return { x0: x0, y0: y0, x1: x1, y1: y1 };
    }
    if (it.kind === 'label') return labelBBox(it, opts);
    var b = compWorldBBox(it);
    return ((opts && opts.editorText) || LOGIC_IO_ORDER.indexOf(it.type) >= 0) && richPlain(richForItem(it)) ? unionBBox(b, textBBox(it)) : b;
}

/* 含文字标签的外扩包围盒（导出裁剪用） */
function itemOuterBBox(it, opts) {
    var b = itemBBox(it, opts);
    if ((opts && opts.editorText) || (it.kind === 'comp' && LOGIC_IO_ORDER.indexOf(it.type) >= 0)) return b;
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
        if (opts.hideText) return '';
        if (opts.editorText) return richSvg(it, it.stroke || opts.textColor || opts.stroke || '#1a1a1a');
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
        body = symbolInner(it.type, { stroke: stroke, sw: it.sw || 1.5, variant: it.variant, font: font, editorText: opts.editorText, textColor: opts.textColor || stroke });
    } else {
        pt = new Painter();
        pt.put('stroke', stroke);
        body = '<g' + pt.tag() + ' stroke-width="' + (it.sw || 1.5) + '" fill="none" stroke-linecap="' +
            (m.cat === 'logic-io' ? 'butt' : 'round') + '" stroke-linejoin="' + (m.cat === 'logic-io' ? 'miter' : 'round') + '"' +
            (it.dash ? ' stroke-dasharray="' + it.dash + '"' : '') + '>' + AUX[it.type].body({ stroke: stroke }) + '</g>';
    }
    /* 符号体在 translate(x,y) 组内用局部坐标；文字标签用世界坐标，必须先闭合该组再追加 */
    var s = '<g transform="translate(' + fmt(it.x) + ',' + fmt(it.y) + ')"><g transform="rotate(' + ((it.rot || 0) * 90) +
        ') scale(' + (it.fh ? -1 : 1) + ',' + (it.fv ? -1 : 1) + ')">' + body + '</g></g>';
    /* 固定逻辑值不参与旋转镜像，也不受可编辑标签或 hideText 影响。 */
    if (AUX[it.type] && typeof AUX[it.type].fixedText === 'string') {
        s += richSvg({ kind: 'label', x: it.x, y: it.y + 4, text: AUX[it.type].fixedText, size: 13, anchor: 'middle' }, stroke);
    }
    if (opts.editorText || LOGIC_IO_ORDER.indexOf(it.type) >= 0) return s + (opts.hideText ? '' : richSvg(it, stroke));
    if (!opts.hideText && it.text && m.textPos !== 'none') {
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

function docBBox(doc, opts) {
    if (!doc.items || !doc.items.length) return { x0: 0, y0: 0, x1: 100, y1: 100 };
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    doc.items.forEach(function (it) {
        var b = itemOuterBBox(it, opts);
        x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
        x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
}

/* 整图 → 独立 SVG（按内容裁剪）。返回 {str, w, h} */
function docSvg(doc, opts) {
    opts = opts || {};
    var margin = opts.margin == null ? 18 : opts.margin;
    var b = docBBox(doc, opts);
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
    LOGIC_IO_ORDER: LOGIC_IO_ORDER, AUX_GROUPS: AUX_GROUPS,
    isRazavi: isRazavi, meta: meta, metaAll: metaAll, resolve: resolve,
    ports: ports, bboxArr: bboxArr, variantOptions: variantOptions, textPos: textPos,
    symbolInner: symbolInner, itemSvg: itemSvg,
    itemBBox: itemBBox, itemOuterBBox: itemOuterBBox, compWorldBBox: compWorldBBox, labelBBox: labelBBox,
    docBBox: docBBox, docSvg: docSvg, esc: esc,
    TEXT_FONTS: TEXT_FONTS, textSize: textSize, runStyle: runStyle, sameStyle: sameStyle,
    normalizeRichText: normalizeRichText, richPlain: richPlain, richForItem: richForItem,
    fontSegments: fontSegments, textAnchor: textAnchor, textLayout: textLayout, textBBox: textBBox,
    clearTextCache: clearTextCache
};
})();

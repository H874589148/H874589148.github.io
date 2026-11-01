/* 仿真结果表纯逻辑：文本模型、几何结构、事务历史及安全导出。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SimResultsCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var LIMITS = { rows: 200, cols: 50, cells: 5000, text: 2000, total: 500000, history: 50, bytes: 10 * 1024 * 1024 };
    var serial = 0;
    function id(prefix) { return prefix + Date.now().toString(36) + '-' + (++serial).toString(36); }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function check(ok, message) { if (!ok) throw new Error(message); }
    function integer(n, min, max) { return Number.isInteger(n) && n >= min && n <= max; }
    function shape(r, c) {
        check(integer(r, 1, LIMITS.rows) && integer(c, 1, LIMITS.cols) && r * c <= LIMITS.cells,
            '表格上限为 200 行、50 列及 5,000 个单元格，至少保留一行一列。');
    }
    function color(value) {
        check(value === '' || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)), '底色必须是六位 RGB 颜色。');
        return value.toUpperCase();
    }
    function foreground(fill) {
        if (!fill) return '';
        var rgb = [1, 3, 5].map(function (p) { var x = parseInt(color(fill).slice(p, p + 2), 16) / 255; return x <= .04045 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); });
        return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .179 ? '#000000' : '#FFFFFF';
    }
    function cell() { return { text: '', fill: '', source: null, confidence: null, reviewed: true }; }
    function create(r, c, origin) {
        shape(r, c);
        return { version: 1, rows: Array.from({ length: r }, function () { return id('r'); }),
            cols: Array.from({ length: c }, function () { return id('c'); }),
            cells: Array.from({ length: r }, function () { return Array.from({ length: c }, cell); }),
            header: true, origin: origin || { kind: 'manual', imageId: '', name: '手工输入' } };
    }
    function validBox(b) { return b && ['x0', 'y0', 'x1', 'y1'].every(function (k) { return Number.isFinite(b[k]) && b[k] >= 0; }) && b.x1 > b.x0 && b.y1 > b.y0; }
    function validate(doc) {
        check(doc && doc.version === 1, '结果存档版本未知或损坏，未覆盖原记录。');
        check(Array.isArray(doc.rows) && Array.isArray(doc.cols) && Array.isArray(doc.cells), '结果表结构损坏。');
        shape(doc.rows.length, doc.cols.length);
        [doc.rows, doc.cols].forEach(function (ids) {
            check(ids.every(function (v) { return typeof v === 'string' && v.length > 0 && v.length <= 100; }) && new Set(ids).size === ids.length, '行列标识损坏。');
        });
        check(typeof doc.header === 'boolean' && doc.cells.length === doc.rows.length, '表头或行结构损坏。');
        check(doc.origin && ['manual', 'ocr'].indexOf(doc.origin.kind) >= 0 && typeof doc.origin.imageId === 'string' && typeof doc.origin.name === 'string' && doc.origin.name.length <= 2000, '来源信息损坏。');
        if (doc.origin.crop !== undefined) {
            var crop = doc.origin.crop;
            check(crop && ['x', 'y', 'width', 'height'].every(function (k) { return Number.isFinite(crop[k]); }) && crop.x >= 0 && crop.y >= 0 && crop.width >= 1 && crop.height >= 1 && integer(doc.origin.width, 1, 4096) && integer(doc.origin.height, 1, 4096), '来源裁剪信息损坏。');
        }
        var total = 0;
        doc.cells.forEach(function (row) {
            check(Array.isArray(row) && row.length === doc.cols.length, '结果表必须为矩形。');
            row.forEach(function (v) {
                check(v && typeof v.text === 'string' && v.text.length <= LIMITS.text, '单元格文字上限为 2,000 字符。');
                color(v.fill); total += v.text.length;
                check(typeof v.reviewed === 'boolean' && (v.confidence === null || (Number.isFinite(v.confidence) && v.confidence >= 0 && v.confidence <= 100)), '置信信息损坏。');
                if (v.source !== null) {
                    check(v.source && typeof v.source.imageId === 'string' && Array.isArray(v.source.boxes) && v.source.boxes.length <= 2000 && typeof v.source.ambiguous === 'boolean', '单元格来源损坏。');
                    check(v.source.boxes.every(function (b) { return validBox(b) && typeof b.id === 'string'; }), '来源坐标损坏。');
                }
            });
        });
        check(total <= LIMITS.total, '表格总文字上限为 500,000 字符。');
        return doc;
    }
    function parse(raw) { return validate(JSON.parse(raw)); }
    function nonempty(doc) { return doc && doc.cells.some(function (row) { return row.some(function (v) { return v.text !== '' || v.fill !== ''; }); }); }
    function range(doc, selection) {
        var a = selection || {}, r0 = doc.rows.indexOf(a.row), c0 = doc.cols.indexOf(a.col);
        var r1 = doc.rows.indexOf(a.endRow || a.row), c1 = doc.cols.indexOf(a.endCol || a.col);
        check(Math.min(r0, c0, r1, c1) >= 0, '请先选择有效单元格。');
        if (a.mode === 'row') { c0 = 0; c1 = doc.cols.length - 1; }
        if (a.mode === 'col') { r0 = 0; r1 = doc.rows.length - 1; }
        return { r0: Math.min(r0, r1), r1: Math.max(r0, r1), c0: Math.min(c0, c1), c1: Math.max(c0, c1) };
    }
    function apply(doc, cmd) {
        validate(doc);
        var out = clone(doc), s, i, axis = cmd.axis, rows = axis === 'row';
        if (['text', 'fill', 'clear', 'review'].indexOf(cmd.type) >= 0) {
            s = range(out, cmd.selection);
            for (var r = s.r0; r <= s.r1; r++) for (var c = s.c0; c <= s.c1; c++) {
                var v = out.cells[r][c];
                if (cmd.type === 'text' && (!cmd.onlyEmpty || v.text === '')) { v.text = cmd.text; v.reviewed = true; }
                if (cmd.type === 'clear') { v.text = ''; v.reviewed = true; }
                if (cmd.type === 'fill') v.fill = color(cmd.fill);
                if (cmd.type === 'review') v.reviewed = true;
            }
        } else if (cmd.type === 'header') out.header = cmd.value;
        else {
            check(axis === 'row' || axis === 'col', '行列操作无效。');
            var ids = rows ? out.rows : out.cols;
            i = ids.indexOf(cmd.id); check(i >= 0, '行列标识不存在。');
            if (cmd.type === 'move') {
                check(integer(cmd.to, 0, ids.length - 1), '目标行列位置越界。');
                ids.splice(cmd.to, 0, ids.splice(i, 1)[0]);
                if (rows) out.cells.splice(cmd.to, 0, out.cells.splice(i, 1)[0]);
                else out.cells.forEach(function (row) { row.splice(cmd.to, 0, row.splice(i, 1)[0]); });
            } else if (cmd.type === 'insert') {
                shape(out.rows.length + (rows ? 1 : 0), out.cols.length + (rows ? 0 : 1));
                i += cmd.after ? 1 : 0; ids.splice(i, 0, id(rows ? 'r' : 'c'));
                if (rows) out.cells.splice(i, 0, out.cols.map(cell));
                else out.cells.forEach(function (row) { row.splice(i, 0, cell()); });
            } else if (cmd.type === 'delete') {
                check(cmd.selection && cmd.selection.mode === axis, '删除须先选中完整行或列。');
                s = range(out, cmd.selection);
                var start = rows ? s.r0 : s.c0, count = (rows ? s.r1 : s.c1) - start + 1;
                if (count === ids.length) {
                    if (rows) { out.rows = [id('r')]; out.cells = [out.cols.map(cell)]; }
                    else { out.cols = [id('c')]; out.cells = out.rows.map(function () { return [cell()]; }); }
                } else {
                    ids.splice(start, count);
                    if (rows) out.cells.splice(start, count);
                    else out.cells.forEach(function (row) { row.splice(start, count); });
                }
            } else throw new Error('未知编辑操作。');
        }
        return validate(out);
    }
    function History() { this.undoItems = []; this.redoItems = []; }
    History.prototype.trim = function () {
        var self = this;
        function bytes() { return JSON.stringify([self.undoItems, self.redoItems]).length * 2; }
        while (this.undoItems.length + this.redoItems.length > LIMITS.history || bytes() > LIMITS.bytes) {
            if (this.undoItems.length) this.undoItems.shift(); else if (this.redoItems.length) this.redoItems.shift(); else break;
        }
    };
    History.prototype.push = function (doc, selection) { this.undoItems.push(clone({ doc: doc, selection: selection })); this.redoItems = []; this.trim(); };
    History.prototype.step = function (redo, doc, selection) {
        var from = redo ? this.redoItems : this.undoItems, to = redo ? this.undoItems : this.redoItems;
        if (!from.length) return null;
        var state = from.pop(); to.push(clone({ doc: doc, selection: selection })); this.trim(); return state;
    };
    function htmlEscape(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function html(doc) {
        validate(doc);
        return '<table style="border-collapse:collapse">' + doc.cells.map(function (row, r) {
            return '<tr>' + row.map(function (v) {
                var tag = doc.header && r === 0 ? 'th' : 'td';
                return '<' + tag + ' style="border:1px solid #777;padding:4px;white-space:pre-wrap;mso-number-format:\'\\@\';'
                    + (v.fill ? 'background-color:' + color(v.fill) + ';color:' + foreground(v.fill) + ';' : 'color:#000000;') + '">'
                    + htmlEscape(v.text).replace(/\r\n|\r|\n/g, '<br>') + '</' + tag + '>';
            }).join('') + '</tr>';
        }).join('') + '</table>';
    }
    function tsv(doc) {
        validate(doc);
        return doc.cells.map(function (row) { return row.map(function (v) {
            var text = v.text === '' ? '' : "'" + v.text;
            return /[\t\r\n"]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
        }).join('\t'); }).join('\r\n');
    }
    function markdown(doc) {
        validate(doc);
        function escaped(s) {
            return htmlEscape(s).replace(/\\/g, '&#92;').replace(/\|/g, '&#124;')
                .replace(/[`*_~\[\]]/g, function (v) { return '&#' + v.charCodeAt(0) + ';'; }).replace(/\r\n|\r|\n/g, '<br>');
        }
        function row(values) { return '| ' + values.join(' | ') + ' |'; }
        var data = doc.cells.map(function (r) { return row(r.map(function (v) { return escaped(v.text); })); });
        if (!doc.header) data.unshift(row(doc.cols.map(function () { return ''; })));
        data.splice(1, 0, row(doc.cols.map(function () { return '---'; })));
        return data.join('\n');
    }
    function latexEscape(s) {
        var map = { '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' };
        return s.replace(/[\\#$%&_{}~^]/g, function (v) { return map[v] || '\\' + v; });
    }
    function latex(doc) {
        validate(doc);
        return '% 使用 XeLaTeX / ctex；导言区添加 \\usepackage[table]{xcolor}\n\\begin{tabular}{|' + doc.cols.map(function () { return 'l|'; }).join('') + '}\n\\hline\n'
            + doc.cells.map(function (row, r) { return row.map(function (v) {
                var lines = v.text.split(/\r\n|\r|\n/).map(latexEscape);
                if (doc.header && r === 0) lines = lines.map(function (line) { return '\\textbf{' + line + '}'; });
                var text = lines.length > 1 ? '\\shortstack[l]{' + lines.join('\\\\') + '}' : lines[0];
                if (v.fill) text = '\\cellcolor[HTML]{' + color(v.fill).slice(1) + '}\\textcolor[HTML]{' + foreground(v.fill).slice(1) + '}{' + text + '}';
                return text;
            }).join(' & ') + ' \\\\ \\hline'; }).join('\n') + '\n\\end{tabular}';
    }
    function workbook(doc, ExcelJS) {
        validate(doc);
        var book = new ExcelJS.Workbook(), sheet = book.addWorksheet('仿真结果');
        doc.cells.forEach(function (row, r) { row.forEach(function (v, c) {
            var x = sheet.getCell(r + 1, c + 1); x.value = v.text; x.numFmt = '@';
            x.alignment = { vertical: 'top', wrapText: true }; x.font = { bold: doc.header && r === 0, color: { argb: 'FF' + (foreground(v.fill) || '#000000').slice(1) } };
            if (v.fill) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color(v.fill).slice(1) } };
            x.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        }); });
        sheet.columns.forEach(function (c) { c.width = 22; });
        if (doc.header) sheet.views = [{ state: 'frozen', ySplit: 1 }];
        return book;
    }
    function median(values) { var a = values.slice().sort(function (a, b) { return a - b; }); return a.length ? a[Math.floor(a.length / 2)] : 1; }
    function normalizeWords(data) {
        var words = [], rejected = [], n = 0;
        (data.blocks || []).forEach(function (b) { (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) {
            (l.words || []).forEach(function (w) {
                if (typeof w.text !== 'string' || !w.text.trim()) return;
                if (!validBox(w.bbox)) { rejected.push(w.text); return; }
                words.push(Object.assign({ id: 'w' + (++n), text: w.text, confidence: Number.isFinite(w.confidence) ? Math.max(0, Math.min(100, w.confidence)) : 0 }, w.bbox));
            });
        }); }); });
        return { words: words, rejected: rejected };
    }
    function groupRows(words) {
        var rows = [];
        words.slice().sort(function (a, b) { return a.y0 - b.y0 || a.x0 - b.x0; }).forEach(function (w) {
            var best = null, overlap = 0;
            rows.forEach(function (r) {
                var f = (Math.min(r.y1, w.y1) - Math.max(r.y0, w.y0)) / Math.min(r.y1 - r.y0, w.y1 - w.y0);
                if (f > .45 && f > overlap) { best = r; overlap = f; }
            });
            if (!best) { best = { y0: w.y0, y1: w.y1, words: [] }; rows.push(best); }
            best.words.push(w); best.y0 = Math.min(best.y0, w.y0); best.y1 = Math.max(best.y1, w.y1);
        });
        return rows.sort(function (a, b) { return a.y0 - b.y0; });
    }
    function boundaries(lines, limit) {
        check(Array.isArray(lines) && lines.length >= 2 && lines.every(function (v, i) { return Number.isFinite(v) && v >= 0 && v <= limit && (i === 0 || v - lines[i - 1] >= 1); }), '分隔线必须递增、在图片范围内且相隔至少 1 像素。');
        return lines.slice();
    }
    function infer(words, width, height, grid) {
        check(words.length > 0, '未识别到有效文字。请调整裁剪或预处理，也可明确选择手工建表。');
        if (grid && grid.xs.length >= 2 && grid.ys.length >= 2) {
            return { xs: boundaries(grid.xs, width), ys: boundaries(grid.ys, height), kind: 'grid' };
        }
        var rows = groupRows(words), h = median(words.map(function (w) { return w.y1 - w.y0; }));
        var gaps = [];
        rows.forEach(function (r, ri) {
            var ws = r.words.slice().sort(function (a, b) { return a.x0 - b.x0; });
            for (var i = 1; i < ws.length; i++) if (ws[i].x0 - ws[i - 1].x1 > h * 1.3) gaps.push({ a: ws[i - 1].x1, b: ws[i].x0, row: ri });
        });
        var candidates = gaps.map(function (g) {
            var mid = (g.a + g.b) / 2, support = gaps.filter(function (x) { return x.a <= mid && x.b >= mid; });
            return { x: mid, count: new Set(support.map(function (s) { return s.row; })).size, a: Math.max.apply(null, support.map(function (s) { return s.a; })), b: Math.min.apply(null, support.map(function (s) { return s.b; })) };
        }).filter(function (g) { return g.count >= Math.max(1, Math.ceil(rows.length * .5)); });
        candidates.sort(function (a, b) { return b.count - a.count; });
        var cuts = [];
        candidates.forEach(function (g) { if (!cuts.some(function (x) { return x >= g.a && x <= g.b; })) cuts.push((g.a + g.b) / 2); });
        cuts.sort(function (a, b) { return a - b; });
        var ys = [Math.max(0, rows[0].y0 - h * .5)];
        for (var r = 1; r < rows.length; r++) ys.push((rows[r - 1].y1 + rows[r].y0) / 2);
        ys.push(Math.min(height, rows[rows.length - 1].y1 + h * .5));
        return { xs: [0].concat(cuts, [width]), ys: ys, kind: 'alignment' };
    }
    function reconstruct(words, grid, width, height, origin) {
        var xs = boundaries(grid.xs, width), ys = boundaries(grid.ys, height);
        var doc = create(ys.length - 1, xs.length - 1, origin), buckets = doc.cells.map(function (r) { return r.map(function () { return []; }); }), issues = [];
        words.forEach(function (w) {
            var hits = [];
            for (var r = 0; r < ys.length - 1; r++) for (var c = 0; c < xs.length - 1; c++) {
                var area = Math.max(0, Math.min(w.x1, xs[c + 1]) - Math.max(w.x0, xs[c])) * Math.max(0, Math.min(w.y1, ys[r + 1]) - Math.max(w.y0, ys[r]));
                if (area) hits.push({ r: r, c: c, area: area });
            }
            hits.sort(function (a, b) { return b.area - a.area; });
            var ambiguous = hits.length > 1 || !hits.length || (hits[0].area < (w.x1 - w.x0) * (w.y1 - w.y0) * .95);
            if (ambiguous || w.confidence < 80) issues.push({ word: clone(w), reason: !hits.length ? '未归属' : ambiguous ? '跨边界' : '低置信', row: hits.length ? hits[0].r : null, col: hits.length ? hits[0].c : null });
            if (hits.length) buckets[hits[0].r][hits[0].c].push({ word: w, ambiguous: ambiguous });
        });
        buckets.forEach(function (row, r) { row.forEach(function (list, c) {
            if (!list.length) return;
            var v = doc.cells[r][c], ws = list.map(function (item) { return item.word; });
            v.text = groupRows(ws).map(function (line) { return line.words.sort(function (a, b) { return a.x0 - b.x0; }).map(function (w) { return w.text; }).join(' '); }).join('\n');
            v.confidence = Math.min.apply(null, ws.map(function (w) { return w.confidence; }));
            v.source = { imageId: origin.imageId, ambiguous: list.some(function (item) { return item.ambiguous; }), boxes: ws.map(function (w) { return { id: w.id, x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 }; }) };
            v.reviewed = false;
        }); });
        return { doc: validate(doc), issues: issues };
    }
    function preprocess(input, width, height, mode) {
        check(integer(width, 1, 4096) && integer(height, 1, 4096) && width * height <= 6000000 && input.length === width * height * 4, 'OCR 工作图尺寸或像素缓冲无效。');
        check(['auto', 'light', 'dark'].indexOf(mode) >= 0, '预处理模式无效。');
        var pixels = new Uint8ClampedArray(input.length), sum = 0, count = 0, i;
        for (i = 0; i < input.length; i += 64) if (input[i + 3] > 128) { sum += .299 * input[i] + .587 * input[i + 1] + .114 * input[i + 2]; count++; }
        var invert = mode === 'dark' || (mode === 'auto' && count > 0 && sum / count < 128), bg = invert ? 0 : 255;
        for (i = 0; i < input.length; i += 4) {
            var a = input[i + 3] / 255, g = (.299 * input[i] + .587 * input[i + 1] + .114 * input[i + 2]) * a + bg * (1 - a);
            if (invert) g = 255 - g;
            g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128));
            pixels[i] = pixels[i + 1] = pixels[i + 2] = g; pixels[i + 3] = 255;
        }
        function detect(horizontal) {
            var across = horizontal ? width : height, along = horizontal ? height : width, lines = [], active = [];
            for (var p = 0; p < along; p++) {
                var run = 0, longest = 0;
                for (var q = 0; q < across; q++) {
                    var at = (horizontal ? p * width + q : q * width + p) * 4;
                    run = pixels[at] < 100 ? run + 1 : 0; longest = Math.max(longest, run);
                }
                if (longest >= across * .6 && longest > 30) active.push(p);
                else if (active.length) { lines.push(Math.round((active[0] + active[active.length - 1]) / 2)); active = []; }
            }
            if (active.length) lines.push(Math.round((active[0] + active[active.length - 1]) / 2));
            return lines;
        }
        var xs = detect(false), ys = detect(true), intersections = 0;
        xs.forEach(function (x) { ys.forEach(function (y) { if (pixels[(y * width + x) * 4] < 150) intersections++; }); });
        var trusted = xs.length >= 2 && ys.length >= 2 && intersections >= xs.length * ys.length * .85;
        if (trusted) {
            // 只清除检测到的网格线，坐标保持不变；OCR 词框仍对应工作图。
            xs.forEach(function (x) { for (var y = 0; y < height; y++) for (var d = -1; d <= 1; d++) if (x + d >= 0 && x + d < width) pixels.fill(255, (y * width + x + d) * 4, (y * width + x + d) * 4 + 4); });
            ys.forEach(function (y) { for (var d = -1; d <= 1; d++) if (y + d >= 0 && y + d < height) pixels.fill(255, (y + d) * width * 4, (y + d + 1) * width * 4); });
        }
        return { pixels: pixels, grid: { xs: trusted ? xs : [], ys: trusted ? ys : [] }, inverted: invert };
    }
    return { LIMITS: LIMITS, clone: clone, create: create, validate: validate, parse: parse, nonempty: nonempty,
        color: color, foreground: foreground, range: range, apply: apply, History: History,
        html: html, tsv: tsv, markdown: markdown, latex: latex, workbook: workbook,
        normalizeWords: normalizeWords, infer: infer, reconstruct: reconstruct, boundaries: boundaries, preprocess: preprocess };
}));

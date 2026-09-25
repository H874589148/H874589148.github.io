/* 计算页共用的纯图纸构造辅助；端点一律来自真实库引脚。 */
(function (root) {
    'use strict';
    function eng(value, unit) {
        if (!Number.isFinite(value)) return '未设定';
        if (value === 0) return '0 ' + (unit || '');
        var prefixes = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
        for (var i = 0; i < prefixes.length; i++) if (Math.abs(value) >= prefixes[i][0]) return Number((value / prefixes[i][0]).toPrecision(6)) + ' ' + prefixes[i][1] + (unit || '');
        return value.toExponential(5) + ' ' + (unit || '');
    }
    function builder(R) {
        R = R || root.Razavi;
        var doc = { items: [], groups: [] }, parts = {}, counter = 0;
        function uid() { return 'fig-' + (++counter); }
        function C(id, type, x, y, rot, text) {
            if (parts[id]) throw new Error('器件 ID 重复：' + id);
            var it = { kind: 'comp', id: id, type: type, x: x, y: y, rot: rot || 0, text: text || '' };
            parts[id] = it; doc.items.push(it); return it;
        }
        function P(id, name) {
            var ps = R.portsWorld(parts[id]);
            var p = typeof name === 'number' ? ps[name] : ps.find(function (pin) { return pin.n === name; });
            if (!p) throw new Error('未知引脚：' + id + '.' + name);
            return [p.x, p.y];
        }
        function W() {
            var pts = Array.from(arguments).filter(function (p, i, all) { return !i || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1]; });
            if (pts.length < 2) return;
            var it = { kind: 'wire', id: uid(), pts: pts.map(function (p) { return { x: p[0], y: p[1] }; }) }; doc.items.push(it); return it;
        }
        function T(x, y, text, anchor) {
            var it = { kind: 'label', id: uid(), x: x, y: y, text: text, anchor: anchor || 'middle', size: 13 }; doc.items.push(it); return it;
        }
        function G(node, id) {
            var c = C(id || uid(), 'ground', node[0], node[1], 0), p = P(c.id, 0);
            c.x += node[0] - p[0]; c.y += node[1] - p[1]; return c;
        }
        function J(node, id) { return C(id || uid(), 'dot', node[0], node[1]); }
        function B(id, type, a, b, label) {
            var c = C(id, type, 0, 0, 0, ''), ps = R.portsWorld(c);
            if (ps.length !== 2 || (a[0] !== b[0] && a[1] !== b[1])) throw new Error('支路需要正交的双端器件');
            var direction = Math.atan2(b[1] - a[1], b[0] - a[0]);
            var base = Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x);
            c.rot = ((Math.round((direction - base) / (Math.PI / 2)) % 4) + 4) % 4;
            ps = R.portsWorld(c);
            c.x = (a[0] + b[0] - ps[0].x - ps[1].x) / 2;
            c.y = (a[1] + b[1] - ps[0].y - ps[1].y) / 2;
            W(a, P(id, 0)); W(P(id, 1), b);
            if (label) {
                var horizontal = a[1] === b[1];
                var t = T(c.x + (horizontal ? 0 : 22), c.y + (horizontal ? -25 : -8), label, horizontal ? 'middle' : 'start');
                doc.groups.push({ id: uid(), members: [id, t.id] });
            }
            return c;
        }
        function pack(title, context) { return { doc: doc, title: title, context: context || {} }; }
        return { doc: doc, parts: parts, C: C, P: P, W: W, T: T, G: G, J: J, B: B, pack: pack };
    }
    function render(doc, options) {
        return root.Razavi.docSvg(doc, Object.assign({ stroke: 'var(--color-text)', textColor: 'var(--color-text)',
            editorText: true, font: root.Razavi.TEXT_FONTS.latin, margin: 28 }, options || {})).str;
    }
    root.CircuitFigure = { builder: builder, eng: eng, render: render };
    if (typeof module === 'object' && module.exports) module.exports = root.CircuitFigure;
})(typeof window !== 'undefined' ? window : globalThis);

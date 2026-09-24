/* 共享电路几何连通：只处理导线/引脚，不施加数字驱动或模拟支路规则。 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CircuitConnectivity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function world(c, p) {
        var x = p.x * (c.fh ? -1 : 1), y = p.y * (c.fv ? -1 : 1);
        var t = (c.rot || 0) * Math.PI / 2, co = Math.round(Math.cos(t)), si = Math.round(Math.sin(t));
        return { x: c.x + co * x - si * y, y: c.y + si * x + co * y, n: p.n };
    }
    function key(x, y) { return Math.round(x * 1e6) + ',' + Math.round(y * 1e6); }
    function interior(p, a, b) {
        var dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
        if (!length) return false;
        var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
        if (t <= 0.001 || t >= 0.999) return false;
        return Math.pow(p.x - a.x - t * dx, 2) + Math.pow(p.y - a.y - t * dy, 2) <= 0.25;
    }
    function build(doc, portsWorld) {
        if (!doc || !Array.isArray(doc.items)) throw new Error('画布数据格式不正确');
        var points = [], segments = [], pins = new Map(), buckets = new Map();
        function add(p) {
            var i = points.length, k = key(p.x, p.y);
            points.push(p);
            if (!buckets.has(k)) buckets.set(k, []);
            buckets.get(k).push(i);
            return i;
        }
        doc.items.forEach(function (it) {
            if (it.kind === 'comp') {
                var map = new Map();
                pins.set(it.id, map);
                portsWorld(it).forEach(function (p) {
                    map.set(p.n, add({ x: p.x, y: p.y, comp: it, pin: p.n }));
                });
            } else if (it.kind === 'wire') {
                var ps = (it.pts || []).filter(function (p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); });
                var ids = ps.map(function (p) { return add({ x: p.x, y: p.y }); });
                for (var i = 1; i < ps.length; i++) segments.push([ids[i - 1], ids[i]]);
            }
        });
        var parent = points.map(function (_, i) { return i; });
        function find(i) {
            while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
            return i;
        }
        function union(a, b) { parent[find(a)] = find(b); }
        segments.forEach(function (s) { union(s[0], s[1]); });
        buckets.forEach(function (ids) { for (var i = 1; i < ids.length; i++) union(ids[0], ids[i]); });
        points.forEach(function (p, i) {
            segments.forEach(function (s) { if (interior(p, points[s[0]], points[s[1]])) union(i, s[0]); });
        });
        var nets = new Map();
        points.forEach(function (p, i) {
            var r = find(i);
            if (!nets.has(r)) nets.set(r, []);
            nets.get(r).push(p);
        });
        function netOf(id, pin) {
            var m = pins.get(id), i = m && m.get(pin);
            return i === undefined ? -1 : find(i);
        }
        return { points: points, nets: nets, netOf: netOf };
    }
    return { build: build, world: world };
});

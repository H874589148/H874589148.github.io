/* 模拟网表与参数契约；浏览器、Node 共用，不依赖 DOM。 */
(function (root, factory) {
    var api = factory(typeof module === 'object' && module.exports ? require('../../js/circuit-connectivity.js') : root.CircuitConnectivity);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TFNetlist = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Connectivity) {
    'use strict';
    var PREFIX = { G: 9, M: 6, k: 3, '': 0, m: -3, u: -6, n: -9, p: -12, f: -15 };
    var TYPES = { resistor: 'R', capacitor: 'C', 'transconductance-4t': 'gm' };
    var DEVICES = ['tf-in', 'tf-out', 'transconductance-4t', 'resistor', 'capacitor', 'ground', 'dot'];
    function validName(name) {
        return typeof name === 'string' && name.length <= 64 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !['s', 'j', 'e', 'pi', '__proto__', 'constructor', 'prototype'].includes(name);
    }
    function valueOf(a, kind) {
        if (!a || a.version !== 1 || !validName(a.symbol)) throw new Error('符号名需唯一、以字母或下划线开头，且不能是 s/j/e/pi 等保留字');
        if (!Object.prototype.hasOwnProperty.call(PREFIX, a.prefix)) throw new Error('请选择有效数量级');
        if (typeof a.value !== 'string' || a.value.length > 64) throw new Error(a.symbol + '：数值格式或长度不正确');
        var src = a.value.trim();
        if (!src) return null;
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(src)) throw new Error(a.symbol + '：请输入有限十进制数或科学计数法');
        var exponent = /e([+-]?\d+)$/i.exec(src);
        if (exponent && Math.abs(Number(exponent[1])) > 400) throw new Error(a.symbol + '：数值指数超限');
        var v = Number(src) * Math.pow(10, PREFIX[a.prefix]);
        if (!Number.isFinite(v) || (v === 0 && Number(src) !== 0) || Math.abs(v) > 1e150 || (v !== 0 && Math.abs(v) < 1e-150)) throw new Error(a.symbol + '：数值超出安全范围（非零值 1e-150～1e150）');
        if (/^[-+]?0*(?:\.0*)?(?:e[+-]?\d+)?$/i.test(src) === false && v === 0) throw new Error(a.symbol + '：数值下溢');
        if (kind === 'R' && v <= 0) throw new Error(a.symbol + '：电阻必须大于零，短路请使用导线');
        if (kind === 'C' && v < 0) throw new Error(a.symbol + '：电容不能为负');
        return v;
    }
    function validateDoc(doc) {
        if (!doc || !Array.isArray(doc.items) || doc.items.length > 1000) throw new Error('工程格式无效或对象超过 1000 项');
        var ids = new Set(), names = new Set(), points = 0;
        doc.items.forEach(function (it) {
            if (!it || typeof it.id !== 'string' || !it.id || ids.has(it.id)) throw new Error('对象 ID 缺失或重复');
            ids.add(it.id);
            if (it.stroke != null && (typeof it.stroke !== 'string' || !/^(?:#[0-9a-f]{3,8}|none|black|white|currentColor|var\(--[a-z0-9-]+\)|rgba?\([\d.,%\s]+\))$/i.test(it.stroke))) throw new Error('对象颜色格式无效');
            if (it.sw != null && (!Number.isFinite(it.sw) || it.sw < 0 || it.sw > 100)) throw new Error('对象线宽无效');
            if (it.dash != null && (typeof it.dash !== 'string' || !/^(?:[\d.,\s]*|none)$/.test(it.dash))) throw new Error('对象虚线格式无效');
            if (it.text != null && (typeof it.text !== 'string' || it.text.length > 20000)) throw new Error('对象文字格式无效或过长');
            if (!['comp', 'wire', 'label'].includes(it.kind)) throw new Error('未知画布对象');
            var ps = it.kind === 'wire' ? it.pts : [it];
            if (!Array.isArray(ps) || (it.kind === 'wire' && ps.length < 2)) throw new Error('导线至少需要两个端点');
            points += ps.length;
            if (points > 4000 || ps.some(function (p) { return !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e7 || Math.abs(p.y) > 1e7; })) throw new Error('坐标无效或导线顶点过多');
            if (it.kind === 'comp') {
                if (!DEVICES.includes(it.type)) throw new Error('不支持的模拟器件：' + it.type);
                if (it.rot != null && ![0, 1, 2, 3].includes(it.rot)) throw new Error('器件旋转值无效');
                if (TYPES[it.type] && it.analysis) {
                    valueOf(it.analysis, TYPES[it.type]);
                    if (names.has(it.analysis.symbol)) throw new Error('参数名称重复：' + it.analysis.symbol);
                    names.add(it.analysis.symbol);
                }
                if (it.type === 'tf-in' || it.type === 'tf-out') {
                    if (!validName(it.text)) throw new Error('输入输出名称不合法');
                    if (names.has(it.text)) throw new Error('名称重复：' + it.text);
                    names.add(it.text);
                }
            }
        });
        if (doc.inputKind != null && !['voltage', 'current'].includes(doc.inputKind)) throw new Error('文档激励类型无效');
        if (doc.groups != null && (!Array.isArray(doc.groups) || doc.groups.some(function (g) { return !g || !Array.isArray(g.members) || g.members.some(function (id) { return !ids.has(id); }); }))) throw new Error('分组数据无效');
        return doc;
    }
    function build(doc, portsWorld, inputKind) {
        validateDoc(doc);
        if (!['voltage', 'current'].includes(inputKind)) throw new Error('激励类型无效');
        var comps = doc.items.filter(function (it) { return it.kind === 'comp'; });
        var ins = comps.filter(function (c) { return c.type === 'tf-in'; }), outs = comps.filter(function (c) { return c.type === 'tf-out'; });
        if (ins.length !== 1 || outs.length !== 1) throw new Error('需要恰好一个模拟输入和一个模拟输出');
        var grounds = comps.filter(function (c) { return c.type === 'ground'; });
        if (!grounds.length) throw new Error('请放置公共地并连接参考端');
        var active = comps.filter(function (c) { return TYPES[c.type]; });
        if (active.length > 24 || active.filter(function (c) { return c.type === 'capacitor'; }).length > 8) throw new Error('最多 24 个 gm/R/C 器件，其中电容最多 8 个');
        var graph = Connectivity.build(doc, portsWorld), gnd = new Set();
        grounds.forEach(function (c) { portsWorld(c).forEach(function (p) { gnd.add(graph.netOf(c.id, p.n)); }); });
        var roots = [], mapping = [], warnings = [];
        function node(c, p) {
            var r = graph.netOf(c.id, p.n);
            if (gnd.has(r)) return 0;
            if (!roots.includes(r)) roots.push(r);
            return roots.indexOf(r) + 1;
        }
        var cp = new Map();
        comps.forEach(function (c) {
            var ns = {};
            portsWorld(c).forEach(function (p) {
                var r = graph.netOf(c.id, p.n), n = node(c, p);
                ns[p.n] = n;
                mapping.push({ id: c.id, name: c.analysis ? c.analysis.symbol : c.text || c.type, pin: p.n, node: n });
                if (c.type !== 'dot' && c.type !== 'ground') {
                    var others = graph.nets.get(r).filter(function (pt) { return pt.comp && pt.comp.id !== c.id && pt.comp.type !== 'dot'; });
                    if (!others.length) throw new Error((c.analysis ? c.analysis.symbol : c.text || c.type) + ' 的 ' + p.n + ' 引脚悬空');
                }
            });
            cp.set(c.id, ns);
        });
        if (roots.length > 8) throw new Error('电气节点超过 8 个非地节点');
        var input = cp.get(ins[0].id).out, output = cp.get(outs[0].id).in;
        if (!input) throw new Error('输入不能直接短接地');
        var devices = active.map(function (c) {
            var a = c.analysis;
            if (!a) throw new Error((c.text || c.id) + ' 缺少参数；请双击补填');
            var kind = TYPES[c.type], v = valueOf(a, kind), ns = cp.get(c.id);
            var nodes = kind === 'gm' ? [ns.cp, ns.cn, ns.op, ns.on] : [ns['1'], ns['2']];
            if (nodes.some(function (n) { return n === undefined; })) throw new Error('符号引脚契约不匹配：' + c.type);
            if (kind !== 'gm' && nodes[0] === nodes[1]) warnings.push(a.symbol + ' 两端同网，支路被旁路');
            if (v === 0) warnings.push(a.symbol + ' 为零，该支路已禁用');
            return { id: c.id, kind: kind, nodes: nodes, symbol: a.symbol, value: a.value, prefix: a.prefix, numeric: v };
        });
        /* 结构连通检查不将公共地当作跨越所有独立电路的信号通路。 */
        var adjacency = Array.from({ length: roots.length + 1 }, function () { return new Set(); });
        devices.forEach(function (d) { d.nodes.filter(Boolean).forEach(function (a) { d.nodes.filter(Boolean).forEach(function (b) { adjacency[a].add(b); }); }); });
        var seen = new Set([input]), todo = [input];
        while (todo.length) adjacency[todo.pop()].forEach(function (n) { if (!seen.has(n)) { seen.add(n); todo.push(n); } });
        if (roots.some(function (_, i) { return !seen.has(i + 1); })) throw new Error('存在与输入网络隔离的电路或连接点，请连接或移除');
        return { nodeCount: roots.length, input: input, output: output, inputKind: inputKind, inputName: ins[0].text, outputName: outs[0].text, devices: devices, mapping: mapping, warnings: warnings };
    }
    function label(a, type) { return a.symbol + (a.value.trim() ? ' = ' + a.value + ' ' + a.prefix + (type === 'resistor' ? 'Ω' : type === 'capacitor' ? 'F' : 'S') : '（未赋值）'); }
    return { PREFIX: PREFIX, TYPES: TYPES, DEVICES: DEVICES, validName: validName, valueOf: valueOf, validateDoc: validateDoc, build: build, label: label };
});

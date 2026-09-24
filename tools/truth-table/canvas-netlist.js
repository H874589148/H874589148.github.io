/* tools/truth-table/canvas-netlist.js
   电路示意图编辑器 doc → 真值表 IR 提取（纯函数，浏览器 window.TTNetlist / Node module.exports 双端可用）

   输入：circuit-sketch 的文档对象 { items:[comp/wire/label] }，
        以及引脚查询函数 portsOf(type, variant) → [{x,y,n}]（浏览器传 Razavi.ports）
   输出：engine.js 的 IR { inputs, signals:[{name,op,args,temp}], outputs:[{name,ref}] }

   连通规则（主流 EDA 约定）：
   - wire 折线端点重合、引脚点重合 → 同一网络
   - T 接：点落在导线线段内部（容差 0.5）→ 连接
   - 十字交叉不连接，除非交叉点是某 wire 端点或有 dot 连接点（dot 引脚参与上述点规则自然成立） */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.TTNetlist = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
'use strict';

/* 支持的组合逻辑门：编辑器符号 id → 引擎运算名 */
var GATE_MAP = {
    'and-gate': 'and', 'or-gate': 'or', 'nand-gate': 'nand', 'nor-gate': 'nor',
    'xor-gate': 'xor', 'xnor-gate': 'xnor', 'inverter': 'not', 'buffer': 'buf'
};
var IO_TYPES = ['tt-in', 'tt-out', 'tt-const0', 'tt-const1', 'dot'];
var VALID_NAME = /^[A-Za-z_]\w*$/;
var TOL2 = 0.25;   // T 接容差 0.5 的平方

/* 引脚世界坐标：局部坐标 + comp 的 fh/fv 镜像、rot×90° 旋转、平移（与 render.js / circuit-sketch 同款变换） */
function pinWorld(c, p) {
    var sx = c.fh ? -1 : 1, sy = c.fv ? -1 : 1;
    var px = p.x * sx, py = p.y * sy;
    var th = (c.rot || 0) * Math.PI / 2;
    var cos = Math.round(Math.cos(th)), sin = Math.round(Math.sin(th));
    return { x: c.x + cos * px - sin * py, y: c.y + sin * px + cos * py };
}

function ptKey(x, y) { return Math.round(x * 1e6) + ',' + Math.round(y * 1e6); }

/* 点是否落在线段内部（不含端点附近；端点连接由坐标重合规则处理） */
function onSegInterior(px, py, s) {
    if (px < Math.min(s.ax, s.bx) - 0.5 || px > Math.max(s.ax, s.bx) + 0.5 ||
        py < Math.min(s.ay, s.by) - 0.5 || py > Math.max(s.ay, s.by) + 0.5) return false;
    var dx = s.bx - s.ax, dy = s.by - s.ay;
    var t = ((px - s.ax) * dx + (py - s.ay) * dy) / (dx * dx + dy * dy);
    if (t <= 0.001 || t >= 0.999) return false;
    var qx = s.ax + t * dx, qy = s.ay + t * dy;
    return (px - qx) * (px - qx) + (py - qy) * (py - qy) <= TOL2;
}

function buildIRFromDoc(doc, portsOf) {
    if (!doc || !Array.isArray(doc.items)) throw new Error('画布数据格式不正确');
    if (typeof portsOf !== 'function') throw new Error('缺少引脚查询函数 portsOf');

    var comps = [], wires = [];
    doc.items.forEach(function (it) {
        if (it.kind === 'comp') comps.push(it);
        else if (it.kind === 'wire') wires.push(it);
    });

    /* 不支持的器件提前明确报错（含触发器等时序器件） */
    var bad = [];
    comps.forEach(function (c) {
        if (!GATE_MAP[c.type] && IO_TYPES.indexOf(c.type) < 0 && bad.indexOf(c.type) < 0) bad.push(c.type);
    });
    if (bad.length) {
        throw new Error('画布包含无法生成真值表的器件：' + bad.join('、') +
            '。仅支持 8 种组合逻辑门（与/或/与非/或非/异或/同或/非/缓冲）、逻辑输入、逻辑输出、常量与连接点；触发器等时序器件请移除');
    }

    /* ---- 收集点（引脚 + 折线顶点）与线段 ---- */
    var points = [];       // {x, y, comp|null, pin|null}
    var pinIdx = [];       // 引脚点在 points 中的下标
    comps.forEach(function (c) {
        portsOf(c.type, c.variant).forEach(function (p) {
            var w = pinWorld(c, p);
            pinIdx.push(points.length);
            points.push({ x: w.x, y: w.y, comp: c, pin: p.n });
        });
    });
    var segments = [];     // {ax, ay, bx, by}
    wires.forEach(function (wr) {
        var pts = (wr.pts || []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); });
        for (var i = 0; i + 1 < pts.length; i++) {
            if (pts[i].x === pts[i + 1].x && pts[i].y === pts[i + 1].y) continue;
            segments.push({ ax: pts[i].x, ay: pts[i].y, bx: pts[i + 1].x, by: pts[i + 1].y });
        }
        pts.forEach(function (p) { points.push({ x: p.x, y: p.y, comp: null, pin: null }); });
    });

    /* ---- 并查集求连通域 ---- */
    var parent = points.map(function (_, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    function union(i, j) { var a = find(i), b = find(j); if (a !== b) parent[b] = a; }

    /* 规则 0：坐标分桶（供重合与端点查找复用） */
    var buckets = new Map();
    points.forEach(function (p, i) {
        var k = ptKey(p.x, p.y);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(i);
    });

    /* 规则 1：导线本身连通——每段折线的两个端点属于同一网络 */
    segments.forEach(function (s) {
        var a = buckets.get(ptKey(s.ax, s.ay)), b = buckets.get(ptKey(s.bx, s.by));
        if (a && b) union(a[0], b[0]);
    });

    /* 规则 2：坐标重合的点（引脚-引脚、引脚-顶点、顶点-顶点） */
    buckets.forEach(function (ids) { for (var i = 1; i < ids.length; i++) union(ids[0], ids[i]); });

    /* 规则 3：点落在线段内部（T 接 / dot 压线） */
    points.forEach(function (p, i) {
        segments.forEach(function (s) {
            if (onSegInterior(p.x, p.y, s)) {
                var end = buckets.get(ptKey(s.ax, s.ay));
                if (end) union(i, end[0]);
            }
        });
    });

    /* ---- 每个网络的驱动者 / 负载 ---- */
    function isGate(c) { return !!GATE_MAP[c.type]; }
    function netOfPin(comp, pin) {
        for (var i = 0; i < pinIdx.length; i++) {
            var p = points[pinIdx[i]];
            if (p.comp === comp && p.pin === pin) return find(pinIdx[i]);
        }
        return -1;
    }
    var netInfo = new Map();   // root → {drivers:[], loads:[]}
    function net(root) {
        if (!netInfo.has(root)) netInfo.set(root, { drivers: [], loads: [] });
        return netInfo.get(root);
    }
    comps.forEach(function (c) {
        portsOf(c.type, c.variant).forEach(function (p) {
            var root = netOfPin(c, p.n);
            if (root < 0) return;
            if (isGate(c)) {
                if (p.n === 'Y') net(root).drivers.push({ kind: 'gate', comp: c });
                else net(root).loads.push({ kind: 'gate-in', comp: c, pin: p.n });
            } else if (c.type === 'tt-in') net(root).drivers.push({ kind: 'input', comp: c });
            else if (c.type === 'tt-const0' || c.type === 'tt-const1') net(root).drivers.push({ kind: 'const', comp: c });
            else if (c.type === 'tt-out') net(root).loads.push({ kind: 'output', comp: c });
            /* dot：连接媒介，非驱动非负载 */
        });
    });

    /* ---- 命名：IO 取 comp.text，空则自动分配；门统一 g1、g2… ---- */
    var used = new Set();
    function userName(c, label) {
        var t = (c.text || '').trim();
        if (!t) return null;
        if (!VALID_NAME.test(t)) throw new Error(label + '的名称「' + t + '」不合法：需以字母或下划线开头，仅含字母、数字、下划线（双击器件改名）');
        if (used.has(t)) throw new Error('信号名重复：' + t + '（输入、输出与门的名字不能相同，请双击器件改名）');
        used.add(t);
        return t;
    }
    function autoName(prefixes) {
        for (var i = 0; i < prefixes.length; i++) {
            if (!used.has(prefixes[i])) { used.add(prefixes[i]); return prefixes[i]; }
        }
        var base = prefixes[0], k = 1;
        while (used.has(base + k)) k++;
        used.add(base + k);
        return base + k;
    }
    var letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

    var inComps = comps.filter(function (c) { return c.type === 'tt-in'; });
    var outComps = comps.filter(function (c) { return c.type === 'tt-out'; });
    var gateComps = comps.filter(isGate);

    var inputName = new Map(), outputName = new Map(), gateName = new Map();
    /* 先收集用户命名（同时完成查重），再自动分配 */
    inComps.forEach(function (c) { var n = userName(c, '逻辑输入'); if (n) inputName.set(c.id, n); });
    outComps.forEach(function (c) { var n = userName(c, '逻辑输出'); if (n) outputName.set(c.id, n); });
    inComps.forEach(function (c) { if (!inputName.has(c.id)) inputName.set(c.id, autoName(letters)); });
    outComps.forEach(function (c) { if (!outputName.has(c.id)) outputName.set(c.id, autoName(['y', 'y1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7', 'y8', 'y9'])); });
    gateComps.forEach(function (c, i) {
        var nm = 'g' + (i + 1), k = i + 1;
        while (used.has(nm)) nm = 'g' + (++k);
        used.add(nm); gateName.set(c.id, nm);
    });

    if (!inComps.length) throw new Error('画布中至少需要一个「逻辑输入」器件（位于「输入输出」分组，默认引线向右）');
    if (!outComps.length) throw new Error('画布中至少需要一个「逻辑输出」器件（位于「输入输出」分组，默认引线向左）');

    /* ---- 网络求值：唯一驱动者检查 ---- */
    function resolveDriver(root, loadDesc) {
        var info = netInfo.get(root);
        var drivers = info ? info.drivers : [];
        if (!drivers.length) throw new Error(loadDesc + '所在的连线网络没有任何驱动（请连接门输出、逻辑输入或常量）');
        if (drivers.length > 1) {
            var names = drivers.map(function (d) {
                return d.kind === 'input' ? '逻辑输入 ' + inputName.get(d.comp.id)
                    : d.kind === 'const' ? '常量 ' + (d.comp.type === 'tt-const1' ? '1' : '0')
                    : '门 ' + gateName.get(d.comp.id) + ' 的输出';
            });
            throw new Error('多个驱动者连接到同一连线网络：' + names.join(' 与 ') + '，请分开');
        }
        var d = drivers[0];
        if (d.kind === 'input') return inputName.get(d.comp.id);
        if (d.kind === 'const') return { const: d.comp.type === 'tt-const1' ? 1 : 0 };
        return gateName.get(d.comp.id);
    }

    /* ---- 生成信号与输出 ---- */
    var signals = gateComps.map(function (c) {
        var op = GATE_MAP[c.type];
        var args = portsOf(c.type, c.variant)
            .filter(function (p) { return p.n !== 'Y'; })
            .map(function (p) {
                return resolveDriver(netOfPin(c, p.n), '门 ' + gateName.get(c.id) + '（' + c.type + '）的输入引脚 ' + p.n + ' 悬空');
            });
        return { name: gateName.get(c.id), op: op, args: args, temp: false };
    });
    var outputs = outComps.map(function (c) {
        return { name: outputName.get(c.id), ref: resolveDriver(netOfPin(c, 'in'), '逻辑输出 ' + outputName.get(c.id) + ' 没有连接任何信号') };
    });

    return { inputs: inComps.map(function (c) { return inputName.get(c.id); }), signals: signals, outputs: outputs };
}

return { GATE_MAP: GATE_MAP, buildIRFromDoc: buildIRFromDoc };
});

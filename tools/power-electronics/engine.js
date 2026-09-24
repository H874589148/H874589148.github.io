/* 理想开关电路的周期稳态求解；时间归一化为 t/T，状态按工作尺度归一化。 */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PowerElectronics = api;
}(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict';
    var VERSION = '1.0';
    var ASSUMPTIONS = '理想器件、恒流负载、周期稳态；忽略损耗、ESR/ESL、寄生、死区、启动及控制环路；周期解不代表启动或闭环稳定。';
    var FIELDS = {
        Vin: { label: '输入电压 Vin', unit: 'V', factor: 1, value: 12 },
        Iout: { label: '负载电流 Iout', unit: 'A', factor: 1, value: 2 },
        fsw: { label: '开关频率 fsw', unit: 'kHz', factor: 1e3, value: 500 },
        D: { label: '占空比 D = ton/T', unit: '%', factor: 0.01, value: 50 },
        L: { label: '电感 L', unit: 'µH', factor: 1e-6, value: 10 },
        Lm: { label: '原边励磁电感 Lm', unit: 'µH', factor: 1e-6, value: 10 },
        Lr: { label: '谐振电感 Lr', unit: 'µH', factor: 1e-6, value: 10 },
        Cr: { label: '谐振电容 Cr', unit: 'nF', factor: 1e-9, value: 47 },
        Cout: { label: '输出电容 Cout', unit: 'µF', factor: 1e-6, value: 100 },
        n: { label: '变压器匝比 n = Np/Ns', unit: '', factor: 1, value: 1 },
        L1: { label: '第一相电感 L1', unit: 'µH', factor: 1e-6, value: 10 },
        L2: { label: '第二相电感 L2', unit: 'µH', factor: 1e-6, value: 10 },
        Cf: { label: '飞跨电容 Cf', unit: 'µF', factor: 1e-6, value: 100 }
    };
    var SPECS = {
        buck: { name: 'Buck', fields: ['Vin', 'Iout', 'fsw', 'D', 'L', 'Cout'], description: '降压变换器；二极管续流自动判定 CCM/DCM，或同步 PWM 允许反向电流。小纹波 CCM：Vo≈D·Vin，ΔIL≈Vin·D·(1−D)/(L·fsw)，ΔVo≈ΔIL/(8·fsw·Cout)。固定其他参数时，平均负载变化不必改变纯电容纹波。' },
        boost: { name: 'Boost', fields: ['Vin', 'Iout', 'fsw', 'D', 'L', 'Cout'], description: '升压变换器；自动检测二极管截止。小纹波 CCM：Vo≈Vin/(1−D)，iCout=iD−Iout；断流期开关节点为 Vin。' },
        buckboost: { name: 'Buck-Boost', fields: ['Vin', 'Iout', 'fsw', 'D', 'L', 'Cout'], description: '反相升降压；Vout 相对地为负。小纹波 CCM：Vo≈−Vin·D/(1−D)。Iout 为从地流向负输出的负载电流幅值，iCout 正方向为输出流向地。' },
        flyback: { name: 'Flyback', fields: ['Vin', 'Iout', 'fsw', 'D', 'Lm', 'n', 'Cout'], description: '低侧开关反激；Lm 折算至原边，n=Np/Ns。退磁时 isec=n·im。小纹波 CCM：Vo≈Vin·D/[n·(1−D)]；不包含漏感尖峰。' },
        llc: { name: 'LLC', fields: ['Vin', 'Iout', 'fsw', 'Lr', 'Cr', 'Lm', 'n', 'Cout'], description: '半桥互补 50%、零死区，原边并联 Lm，副边四二极管全桥整流。Cr 的电流为 ir，原边传能电流为 ir−im。整流导通由电流和钳位电压决定；频率区间不能单独保证 ZVS。' },
        dsd: { name: 'DSD', fields: ['Vin', 'Iout', 'fsw', 'D', 'L1', 'L2', 'Cf', 'Cout'], description: 'Double-step-Down：四开关、两电感、一个串联飞跨电容。Q1/Q3 相差 T/2，Q2/Q4 分别互补，每相 D≤50%。有限 Cf 参与状态方程；对称小纹波时 Vo≈D·Vin/2、Vcf≈Vin/2。同步轻载允许负电流。' }
    };
    function defaults(topo) {
        var p = { topo: topo, mode: 'auto' };
        SPECS[topo].fields.forEach(function (k) { p[k] = FIELDS[k].value * FIELDS[k].factor; });
        if (topo === 'dsd') p.D = 0.25;
        if (topo === 'llc') { p.Lm = 47e-6; p.fsw = 1 / (2 * Math.PI * Math.sqrt(p.Lr * p.Cr)); }
        return p;
    }
    function fail(message, code) { var e = new Error(message); e.code = code || 'MODEL'; throw e; }
    function validate(input) {
        if (!input || !Object.prototype.hasOwnProperty.call(SPECS, input.topo)) fail('未知拓扑', 'INPUT');
        var p = { topo: input.topo, mode: input.mode || 'auto' };
        SPECS[p.topo].fields.forEach(function (k) {
            var v = input[k];
            if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
                if (k === 'Iout' && v === 0) fail('空载工作不在当前模型范围，请输入大于零的 Iout', 'INPUT');
                fail(FIELDS[k].label + ' 必须为有限正数，不能留空', 'INPUT');
            }
            p[k] = v;
        });
        if (p.D !== undefined && (p.D < 0.01 || p.D > (p.topo === 'dsd' ? 0.5 : 0.99))) fail('占空比超出允许范围', 'INPUT');
        if (p.topo === 'buck' && !['auto', 'sync'].includes(p.mode)) fail('Buck 模式无效', 'INPUT');
        if (!Number.isFinite(1 / p.fsw)) fail('开关周期溢出', 'INPUT');
        return p;
    }
    function norm(a) { return Math.max.apply(null, a.map(Math.abs)); }
    function add(a, b, k) { return a.map(function (v, i) { return v + k * b[i]; }); }
    function linear(A, b) {
        var n = b.length, m = A.map(function (r, i) { return r.concat(b[i]); });
        for (var k = 0; k < n; k++) {
            var best = k;
            for (var j = k + 1; j < n; j++) if (Math.abs(m[j][k]) > Math.abs(m[best][k])) best = j;
            if (!Number.isFinite(m[best][k]) || Math.abs(m[best][k]) < 1e-13) fail('周期映射奇异或病态，无法可靠确定稳态', 'SINGULAR');
            var swap = m[k]; m[k] = m[best]; m[best] = swap;
            for (j = k + 1; j < n; j++) {
                var r = m[j][k] / m[k][k];
                for (var c = k; c <= n; c++) m[j][c] -= r * m[k][c];
            }
        }
        var x = new Array(n);
        for (k = n - 1; k >= 0; k--) {
            var s = m[k][n];
            for (j = k + 1; j < n; j++) s -= m[k][j] * x[j];
            x[k] = s / m[k][k];
        }
        return x;
    }
    function budget(options) {
        options = options || {};
        return { count: 0, limit: options.maxEvaluations === undefined ? 1000000 : options.maxEvaluations,
            expires: Date.now() + (options.timeoutMs === undefined ? 10000 : options.timeoutMs),
            check: function () { if (++this.count > this.limit || Date.now() > this.expires) fail('求解超时或计算预算耗尽，请调整参数后重试', 'BUDGET'); } };
    }
    function setup(p, b) {
        var isLlc = p.topo === 'llc', isDsd = p.topo === 'dsd';
        var v = p.topo === 'boost' ? p.Vin / (1 - p.D) : p.topo === 'buck' ? p.Vin * p.D :
            isDsd ? p.Vin * p.D / 2 : isLlc ? p.Vin / (2 * p.n) : p.Vin * p.D / ((1 - p.D) * (p.n || 1));
        var i = isLlc ? Math.max(p.Iout / p.n, p.Vin / (p.fsw * p.Lr)) :
            isDsd ? Math.max(p.Iout, p.Vin / (p.fsw * Math.min(p.L1, p.L2))) :
            Math.max(p.Iout / ((p.n || 1) * (1 - p.D)), p.Vin / (p.fsw * (p.L || p.Lm)));
        var scales = isLlc ? [i, i, p.Vin, Math.max(v, p.Vin / p.n)] :
            isDsd ? [i, i, p.Vin, Math.max(v, p.Vin)] : [i, Math.max(v, p.Vin)];
        if (scales.some(function (x) { return !Number.isFinite(x) || x <= 1e-100 || x > 1e100; })) fail('参数动态范围过大', 'RANGE');
        return { p: p, b: b, scales: scales, voltage: v, current: i,
            to: function (x) { return x.map(function (z, k) { return z / scales[k]; }); },
            from: function (x) { return x.map(function (z, k) { return z * scales[k]; }); } };
    }
    function phases(p) {
        if (p.topo === 'llc') return [{ end: 0.5, g: 1 }, { end: 1, g: 0 }];
        if (p.topo === 'dsd') return [{ end: p.D, g: 1 }, { end: 0.5, g: 0 }, { end: 0.5 + p.D, g: 2 }, { end: 1, g: 0 }];
        return [{ end: p.D, g: 1 }, { end: 1, g: 0 }];
    }
    /* 单位均为 SI；m 为二极管状态，LLC 为 −1/0/+1。 */
    function equations(p, g, m, x) {
        var i = x[0], v = x[x.length - 1], n = p.n || 1, di, dv;
        if (p.topo === 'dsd') return [((g === 1 ? p.Vin - x[2] : 0) - v) / p.L1,
            ((g === 2 ? x[2] : 0) - v) / p.L2, (g === 1 ? i : g === 2 ? -x[1] : 0) / p.Cf,
            (i + x[1] - p.Iout) / p.Cout];
        if (p.topo === 'llc') {
            var vp = m ? m * n * v : (g * p.Vin - x[2]) * p.Lm / (p.Lr + p.Lm);
            di = (g * p.Vin - x[2] - vp) / p.Lr;
            return [di, vp / p.Lm, i / p.Cr, ((m ? n * m * (i - x[1]) : 0) - p.Iout) / p.Cout];
        }
        if (p.topo === 'buck') { di = (g * p.Vin - v) / p.L; dv = (i - p.Iout) / p.Cout; }
        else {
            di = g ? p.Vin / (p.L || p.Lm) : ((p.topo === 'boost' ? p.Vin : 0) - n * v) / (p.L || p.Lm);
            dv = ((!g && m ? n * i : 0) - p.Iout) / p.Cout;
        }
        if (!g && !m) di = 0;
        return [di, dv];
    }
    function rhs(c, g, m, y) {
        c.b.check();
        return equations(c.p, g, m, c.from(y)).map(function (v, k) { return v / (c.p.fsw * c.scales[k]); });
    }
    /* Dormand–Prince 5(4)，阶段间不跨开关或二极管事件。 */
    function step(c, g, m, y, h) {
        var K = [rhs(c, g, m, y)];
        var rows = [[1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9],
            [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
            [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
            [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
        rows.forEach(function (row) {
            var z = y.map(function (v, i) { return v + h * row.reduce(function (s, a, j) { return s + a * K[j][i]; }, 0); });
            K.push(rhs(c, g, m, z));
        });
        var a5 = rows[5], a4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
        var out = y.map(function (v, i) { return v + h * a5.reduce(function (s, a, j) { return s + a * K[j][i]; }, 0); });
        var err = norm(y.map(function (v, i) {
            var d = h * a4.reduce(function (s, a, j) { return s + ((a5[j] || 0) - a) * K[j][i]; }, 0);
            return d / (1e-11 + 1e-9 * Math.max(Math.abs(v), Math.abs(out[i])));
        }));
        if (!out.every(Number.isFinite) || !Number.isFinite(err)) fail('状态数值溢出，请检查参数范围', 'RANGE');
        return { y: out, err: err };
    }
    function freeVoltage(c, g, y) {
        var p = c.p, x = c.from(y);
        return (g * p.Vin - x[2]) * p.Lm / (p.Lr + p.Lm);
    }
    function classify(c, g, y, fixed) {
        var p = c.p;
        if (p.topo === 'dsd' || fixed || (p.topo === 'buck' && p.mode === 'sync')) return 1;
        if (p.topo !== 'llc') {
            if (g || y[0] > 1e-11) return 1;
            return equations(p, g, 1, c.from(y))[0] > 0 ? 1 : 0;
        }
        var j = y[0] - y[1];
        if (Math.abs(j) > 1e-10) return j > 0 ? 1 : -1;
        var x = c.from(y), vf = freeVoltage(c, g, y), clamp = p.n * x[3], eps = p.Vin * 1e-11;
        if (vf > clamp + eps) return 1;
        if (vf < -clamp - eps) return -1;
        // 恰在钳位边界时以开路导数判别进入方向，避免零时间反复切换。
        var probe = add(y, rhs(c, g, 0, y), 1e-9), vp = freeVoltage(c, g, probe), cp = p.n * probe[3] * c.scales[3];
        if (Math.abs(vf - clamp) < eps * 4 && vp > cp) return 1;
        if (Math.abs(vf + clamp) < eps * 4 && vp < -cp) return -1;
        return 0;
    }
    function guards(c, g, m, y, fixed) {
        var p = c.p;
        if (fixed || p.topo === 'dsd' || (p.topo === 'buck' && p.mode === 'sync')) return [];
        if (p.topo === 'llc') {
            if (m) return [m * (y[0] - y[1])];
            var v = freeVoltage(c, g, y) / p.Vin, limit = p.n * y[3] * c.scales[3] / p.Vin;
            return [limit - v, limit + v];
        }
        if (g) return [];
        if (m) return [y[0]];
        // Buck 和反激等的正输出不能在截止时重新产生正电流；Boost 可在 vo<Vin 时重导通。
        return p.topo === 'boost' ? [(y[1] * c.scales[1] - p.Vin) / p.Vin] : [];
    }
    function cycle(c, initial, options) {
        options = options || {};
        var y = initial.slice(), t = 0, h = 1 / 128, trace = [], events = [], fixed = options.fixed;
        var maxH = options.maxStep || 1 / 64, end = options.end || 1;
        function point(g, m) { if (options.trace) trace.push({ t: t, x: c.from(y), g: g, m: m }); }
        phases(c.p).some(function (phase) {
            if (phase.end <= t + 1e-14) return false;
            var stop = Math.min(phase.end, end), g = phase.g, m = classify(c, g, y, fixed), iterations = 0;
            point(g, m);
            while (t < stop - 1e-14) {
                if (++iterations > 100000) fail('事件抖振或积分步长过小', 'EVENT');
                h = Math.min(h, maxH, stop - t);
                if (h < 1e-13) fail('所需积分精度超出当前计算范围', 'PRECISION');
                var trial = step(c, g, m, y, h);
                if (trial.err > 1) { h *= Math.max(0.1, 0.9 * Math.pow(trial.err, -0.2)); continue; }
                var ga = guards(c, g, m, y, fixed), gb = guards(c, g, m, trial.y, fixed), hit = -1;
                for (var k = 0; k < ga.length; k++) if (ga[k] >= -1e-11 && gb[k] < -1e-12) { hit = k; break; }
                if (hit >= 0) {
                    var lo = 0, hi = h, ev = trial.y;
                    for (var z = 0; z < 42 && hi - lo > 1e-11; z++) {
                        var mid = (lo + hi) / 2, test = step(c, g, m, y, mid).y;
                        if (guards(c, g, m, test, fixed)[hit] < 0) { hi = mid; ev = test; } else lo = mid;
                    }
                    y = ev; t += hi;
                    if (c.p.topo === 'llc' && m) y[1] = y[0];
                    else if (c.p.topo !== 'llc' && m) y[0] = 0;
                    point(g, m);
                    var old = m;
                    m = c.p.topo === 'llc' ? (old ? classify(c, g, y, fixed) : (hit === 0 ? 1 : -1)) : (old ? 0 : 1);
                    if (m === old) m = 0;
                    events.push({ t: t, from: old, to: m, g: g }); point(g, m);
                    h = Math.min(maxH, Math.max(h / 2, 1e-8));
                } else {
                    y = trial.y; t += h; point(g, m);
                    h *= Math.min(4, Math.max(0.2, trial.err ? 0.9 * Math.pow(trial.err, -0.2) : 4));
                }
                if (events.length > 256) fail('单周期事件过多，请检查参数', 'EVENT');
            }
            t = stop;
            return t >= end - 1e-14;
        });
        return { y: y, trace: trace, events: events };
    }
    function affine(c) {
        var n = c.scales.length, zero = new Array(n).fill(0), q = cycle(c, zero, { fixed: true }).y;
        var cols = zero.map(function (_, j) {
            var e = zero.slice(); e[j] = 1;
            return cycle(c, e, { fixed: true }).y.map(function (v, i) { return (i === j ? 1 : 0) - (v - q[i]); });
        });
        return linear(zero.map(function (_, i) { return cols.map(function (col) { return col[i]; }); }), q);
    }
    function shoot(fun, seed, valid) {
        var x = seed.slice(), f = fun(x);
        for (var iter = 0; iter < 40; iter++) {
            var size = norm(f);
            if (size < 2e-10) return x;
            var cols = x.map(function (v, j) {
                var h = 2e-6 * Math.max(1, Math.abs(v)), xp = x.slice(); xp[j] += h;
                var fp = fun(xp);
                return fp.map(function (w, i) { return (w - f[i]) / h; });
            });
            var dx = linear(x.map(function (_, i) { return cols.map(function (col) { return col[i]; }); }), f.map(function (v) { return -v; }));
            var accepted = false;
            for (var a = 1; a >= 1 / 1024; a /= 2) {
                var next = add(x, dx, a);
                if (valid && !valid(next)) continue;
                var nf = fun(next);
                if (norm(nf) < size) { x = next; f = nf; accepted = true; break; }
            }
            if (!accepted) fail('周期稳态迭代未收敛；该负载可能无可用工作点，请调整频率、占空比或储能参数', 'CONVERGENCE');
        }
        fail('周期稳态迭代达到上限', 'CONVERGENCE');
    }
    function seedDcm(c) {
        var p = c.p, a = p.D * p.D * p.Vin * p.Vin, v;
        if (p.topo === 'buck') v = a / (p.D * p.D * p.Vin + 2 * p.L * p.fsw * p.Iout);
        else if (p.topo === 'boost') v = p.Vin + a / (2 * p.L * p.fsw * p.Iout);
        else v = a / (2 * (p.L || p.Lm) * p.fsw * p.Iout);
        return v / c.scales[1];
    }
    function solveInitial(c) {
        var p = c.p;
        if (p.topo !== 'llc') {
            var a = affine(c);
            if (p.topo === 'dsd' || (p.topo === 'buck' && p.mode === 'sync')) return a;
            var check = cycle(c, a, { fixed: true, trace: true });
            if (check.trace.every(function (pt) { return pt.x[0] >= -1e-10 * c.current; })) return a;
            var base = seedDcm(c), last;
            for (var s = 0; s < 3; s++) {
                try {
                    var v = shoot(function (z) { return [cycle(c, [0, z[0]]).y[1] - z[0]]; }, [base * [1, 0.75, 1.5][s]], function (z) { return z[0] > 0; });
                    var initial = [0, v[0]], run = cycle(c, initial);
                    if (norm(run.y.map(function (y, j) { return y - initial[j]; })) < 1e-8) return initial;
                } catch (err) { if (err.code === 'BUDGET') throw err; last = err; }
            }
            if (last) throw last;
            fail('未找到满足断流边界的周期解，请调整占空比、负载或储能参数', 'CONVERGENCE');
        }
        // 对称半桥的半周期 shooting 同时约束磁通、Cr 偏置及输出电荷；最终仍核验完整周期。
        var roots = [], lastError;
        // 基波近似仅用于 shooting 初值，最终结果完全由时域方程给出。
        var w = 2 * Math.PI * p.fsw, X = w * p.Lr - 1 / (w * p.Cr), Xm = w * p.Lm;
        var Ip = Math.PI * p.Iout / (2 * p.n), V1 = 2 * p.Vin / Math.PI;
        var Vm = Math.sqrt(Math.max(V1 * V1 - X * X * Ip * Ip, V1 * V1 * 0.01)) / Math.max(0.1, 1 + X / Xm);
        var angle = -Math.atan2(X * Ip, Vm * (1 + X / Xm));
        for (var k = 0; k < 3; k++) {
            var v0 = Vm * Math.PI / (4 * p.n) * [1, 0.8, 1.2][k];
            var im = -Vm / Xm * Math.cos(angle), ir = Ip * Math.sin(angle) + im;
            var sine = Ip * Math.cos(angle) + Vm / Xm * Math.sin(angle);
            var guess = c.to([ir, im, p.Vin / 2 - sine / (w * p.Cr), v0]);
            if (k === 1) {
                var vmid = p.Vin / (2 * p.n), imag = -p.n * vmid / (4 * p.Lm * p.fsw);
                guess = c.to([imag, imag, p.Vin / 2 - p.Iout / (4 * p.n * p.Cr * p.fsw), vmid]);
            }
            try {
                var valid = function (z) { return z[3] > 0 && norm(z) < 1e6; };
                var residual = function (z) { return cycle(c, z).y.map(function (v, j) { return v - z[j]; }); };
                var root;
                try { root = shoot(residual, guess, valid); }
                catch (error) {
                    if (error.code === 'BUDGET') throw error;
                    var symmetric = shoot(function (z) {
                        var e = cycle(c, z, { end: 0.5 }).y;
                        return [e[0] + z[0], e[1] + z[1], e[2] + z[2] - p.Vin / c.scales[2], e[3] - z[3]];
                    }, guess, valid);
                    root = shoot(residual, symmetric, valid);
                }
                var full = cycle(c, root, { trace: true });
                if (norm(full.y.map(function (v, j) { return v - root[j]; })) > 1e-8) fail('LLC 候选工作点未通过完整周期闭合检查，请调整频率或负载', 'PRECISION');
                if (full.trace.some(function (pt) { return pt.x[3] <= 0; })) fail('LLC 候选工作点的输出极性失效，请调整频率或负载', 'POLARITY');
                if (!roots.some(function (other) { return norm(root.map(function (v, j) { return v - other[j]; })) < 1e-5; })) roots.push(root);
            } catch (err) { if (err.code === 'BUDGET') throw err; lastError = err; }
        }
        if (roots.length > 1) fail('检测到多个有效周期工作点，请调整参数；不自动选择其中一个', 'MULTIPLE');
        if (!roots.length) {
            if (lastError) throw lastError;
            fail('未可靠求得 LLC 周期稳态，请调整频率、负载或谐振参数', 'CONVERGENCE');
        }
        return roots[0];
    }
    function quantities(p, pt) {
        var x = pt.x, g = pt.g, m = pt.m, i = x[0], v = x[x.length - 1], n = p.n || 1;
        var q = {}, iin = 0;
        if (p.topo === 'dsd') {
            q = { Q1: +(g === 1), Q2: +(g !== 1), Q3: +(g === 2), Q4: +(g !== 2),
                vA: g === 1 ? p.Vin - x[2] : 0, vB: g === 2 ? x[2] : 0,
                i1: i, i2: x[1], iSum: i + x[1], iCf: g === 1 ? i : g === 2 ? -x[1] : 0,
                vCf: x[2], iCout: i + x[1] - p.Iout, Vout: v };
            iin = g === 1 ? i : 0;
        } else if (p.topo === 'llc') {
            q = { Q1: g, Q2: 1 - g, vHB: g * p.Vin, ir: i, im: x[1], iTransfer: i - x[1],
                isec: m ? n * m * (i - x[1]) : 0, vCr: x[2],
                vp: m ? m * n * v : (g * p.Vin - x[2]) * p.Lm / (p.Lr + p.Lm), Vout: v };
            q.iCout = q.isec - p.Iout; iin = g * i;
        } else if (p.topo === 'flyback') {
            q = { Q1: g, im: i, ipri: g ? i : 0, isec: !g && m ? n * i : 0,
                VDS: g ? 0 : m ? p.Vin + n * v : p.Vin, Vout: v };
            q.iCout = q.isec - p.Iout; iin = q.ipri;
        } else {
            var inv = p.topo === 'buckboost', buck = p.topo === 'buck';
            q = { Q1: g, iL: i, iD: !g && m ? i : 0, Vout: inv ? -v : v };
            q.Vsw = buck ? (g ? p.Vin : m ? 0 : v) : inv ? (g ? p.Vin : m ? -v : 0) : (g ? 0 : m ? v : p.Vin);
            q.iCout = (buck ? i - p.Iout : q.iD - p.Iout) * (inv ? -1 : 1);
            if (buck && p.mode === 'sync') { q.Q2 = 1 - g; q.iReturn = q.iD; delete q.iD; }
            iin = p.topo === 'boost' ? i : g * i;
        }
        q.Pin = p.Vin * iin; q.Pout = v * p.Iout;
        return q;
    }
    var LABELS = { Q1: 'Q1 驱动', Q2: 'Q2 驱动', Q3: 'Q3 驱动', Q4: 'Q4 驱动',
        iL: 'iL 电感电流', iD: 'iD 二极管电流', iReturn: '同步续流支路电流', Vsw: 'Vsw 对地节点电压',
        Vout: 'Vout 输出电压', iCout: 'iCout 输出电容电流', im: 'im 原边励磁电流', ipri: 'ipri 原边绕组电流',
        isec: 'isec 副边整流电流', VDS: '主开关 VDS', vA: 'vA 第一相节点', vB: 'vB 第二相节点',
        i1: 'i1 第一相电感电流', i2: 'i2 第二相电感电流', iSum: 'i1+i2 合成电流', iCf: 'iCf 飞跨电容电流 X→A',
        vCf: 'vCf 飞跨电容电压 X−A', vHB: 'vHB 半桥节点', ir: 'ir 谐振电流', iTransfer: 'ir−im 原边传能电流',
        vCr: 'vCr 谐振电容电压', vp: 'vp 原边绕组电压' };
    function stats(data) {
        var min = Infinity, max = -Infinity, mean = 0, square = 0;
        data.forEach(function (pt, j) {
            min = Math.min(min, pt.v); max = Math.max(max, pt.v);
            if (j) {
                var a = data[j - 1], dt = pt.t - a.t;
                mean += dt * (pt.v + a.v) / 2;
                square += dt * (a.v * a.v + a.v * pt.v + pt.v * pt.v) / 3;
            }
        });
        return { min: min, max: max, mean: mean, rms: Math.sqrt(Math.max(0, square)), pp: max - min };
    }
    function analyze(c, run, initial) {
        var p = c.p, traces = {}, all = run.trace;
        all.forEach(function (pt) {
            var q = quantities(p, pt);
            Object.keys(q).forEach(function (key) { if (!traces[key]) traces[key] = []; traces[key].push({ t: pt.t, v: q[key] }); });
        });
        var channels = Object.keys(traces).filter(function (key) { return !['Pin', 'Pout'].includes(key); }).map(function (key) {
            return { id: key, label: LABELS[key], unit: key[0] === 'Q' ? '逻辑' : key[0] === 'i' ? 'A' : 'V',
                data: traces[key], stats: stats(traces[key]) };
        });
        var closure = norm(run.y.map(function (v, j) { return v - initial[j]; }));
        var pin = stats(traces.Pin).mean, pout = stats(traces.Pout).mean;
        var powerError = Math.abs(pin - pout) / Math.max(p.Vin * c.current, Math.abs(pout), 1e-100);
        var balance = new Array(initial.length).fill(0);
        all.forEach(function (pt, j) {
            if (!j) return;
            var prev = all[j - 1], dt = pt.t - prev.t;
            if (!dt) return;
            var a = equations(p, prev.g, prev.m, prev.x), b = equations(p, pt.g, pt.m, pt.x);
            a.forEach(function (v, k) { balance[k] += dt * (v + b[k]) / (2 * p.fsw * c.scales[k]); });
        });
        return { channels: channels, diagnostics: { closure: closure, powerError: powerError, balanceError: norm(balance),
            balances: balance, Pin: pin, Pout: pout } };
    }
    function enrich(c, run) {
        // 在连续区间内补入状态极值，特别是 iCout=0 对应的电压峰谷。
        var result = [], list = run.trace;
        function slopes(pt) {
            var d = equations(c.p, pt.g, pt.m, pt.x);
            if (c.p.topo === 'dsd') d.push(d[0] + d[1]);
            if (c.p.topo === 'llc') d.push(d[0] - d[1]);
            return d;
        }
        list.forEach(function (b, j) {
            if (j) {
                var a = list[j - 1], dt = b.t - a.t;
                if (dt > 1e-10 && a.g === b.g && a.m === b.m) {
                    var da = slopes(a), db = slopes(b), points = [];
                    da.forEach(function (v, k) {
                        if (v * db[k] >= 0) return;
                        var lo = 0, hi = dt, y;
                        for (var n = 0; n < 26; n++) {
                            var h = (lo + hi) / 2;
                            y = c.from(step(c, a.g, a.m, c.to(a.x), h).y);
                            if (slopes({ g: a.g, m: a.m, x: y })[k] * v > 0) lo = h; else hi = h;
                        }
                        points.push({ t: a.t + (lo + hi) / 2, x: y, g: a.g, m: a.m });
                    });
                    points.sort(function (a, b) { return a.t - b.t; });
                    result.push.apply(result, points);
                }
            }
            result.push(b);
        });
        run.trace = result; return run;
    }
    function solve(input, options) {
        var p = validate(input), b = budget(options), c = setup(p, b), initial = solveInitial(c);
        var samples = p.topo === 'llc' ? 4096 : 2048;
        var coarse = cycle(c, initial, { trace: true, maxStep: 2 / samples });
        var fine = enrich(c, cycle(c, initial, { trace: true, maxStep: 1 / samples }));
        var old = analyze(c, coarse, initial), result = analyze(c, fine, initial), d = result.diagnostics;
        if (fine.trace.some(function (pt) { return pt.x[pt.x.length - 1] <= 0; })) fail('输出电压极性失效，当前参数没有可用的带载周期稳态', 'POLARITY');
        if (p.topo !== 'llc' && p.topo !== 'dsd' && !(p.topo === 'buck' && p.mode === 'sync') && fine.trace.some(function (pt) { return pt.x[0] < -1e-8 * c.current; })) fail('二极管导通约束失效', 'CONSTRAINT');
        if (p.topo === 'llc' && fine.trace.some(function (pt) { return pt.m && pt.m * (pt.x[0] - pt.x[1]) < -1e-8 * c.current; })) fail('整流电流方向不符合导通状态', 'CONSTRAINT');
        if (d.closure > 1e-8 || d.powerError > 1e-6 || d.balanceError > 1e-6) fail('周期闭合或守恒精度不足，结果已拒绝；请调整参数', 'PRECISION');
        var maxChange = 0;
        result.channels.forEach(function (ch, j) {
            ['mean', 'pp'].forEach(function (key) {
                var floor = (ch.unit === 'A' ? c.current : p.Vin) * 1e-7;
                var change = Math.abs(ch.stats[key] - old.channels[j].stats[key]) / Math.max(Math.abs(ch.stats[key]), key === 'mean' ? ch.stats.rms : 0, floor);
                maxChange = Math.max(maxChange, change);
            });
        });
        if (maxChange > 0.001) fail('采样加密后读数未达到 0.1% 一致性，结果已拒绝', 'PRECISION');
        d.refinement = maxChange; d.evaluations = b.count;
        var idle = 0;
        fine.trace.forEach(function (pt, j) { if (j && !fine.trace[j - 1].m) idle += pt.t - fine.trace[j - 1].t; });
        var mode;
        if (p.topo === 'llc') mode = '整流' + (idle > 1e-8 ? '含截止区间' : '连续传能') + '（周期稳态）';
        else if (p.topo === 'dsd' || (p.topo === 'buck' && p.mode === 'sync')) mode = '同步 PWM（允许反向电流）';
        else {
            var min = Math.min.apply(null, fine.trace.map(function (pt) { return pt.x[0]; }));
            mode = idle > 1e-8 ? 'DCM' : Math.abs(min) < c.current * 1e-7 ? '临界导通' : 'CCM';
        }
        return { version: VERSION, params: p, period: 1 / p.fsw, mode: mode, assumptions: ASSUMPTIONS,
            channels: result.channels, diagnostics: d, events: fine.events, phases: phases(p),
            state: { initial: c.from(initial), final: c.from(fine.y) },
            reference: p.topo === 'llc' ? { fr: 1 / (2 * Math.PI * Math.sqrt(p.Lr * p.Cr)), fm: 1 / (2 * Math.PI * Math.sqrt((p.Lr + p.Lm) * p.Cr)) } : {},
            warnings: [ASSUMPTIONS].concat(p.topo === 'llc' ? ['三组初值搜索完整周期工作点；未发现其他解不代表已证明全局唯一。'] : []) };
    }
    function csv(result) {
        if (!result || !result.channels || !result.params) fail('没有可导出的有效结果');
        function cell(x) { return '"' + String(x).replace(/"/g, '""') + '"'; }
        var lines = ['# PowerElectronics ' + result.version, '# ' + result.assumptions,
            '# params_SI=' + JSON.stringify(result.params), '# diagnostics=' + JSON.stringify(result.diagnostics),
            '# mode=' + result.mode].concat(result.warnings.map(function (w) { return '# ' + w; }));
        lines.push(['time_s'].concat(result.channels.map(function (ch) { return ch.id + '_' + (ch.unit === '逻辑' ? 'logic' : ch.unit); })).map(cell).join(','));
        result.channels[0].data.forEach(function (pt, i) {
            lines.push([pt.t * result.period].concat(result.channels.map(function (ch) { return ch.data[i].v; })).join(','));
        });
        return '\uFEFF' + lines.join('\r\n');
    }
    return { version: VERSION, fields: FIELDS, specs: SPECS, defaults: defaults, validate: validate, solve: solve, csv: csv,
        equations: equations, quantities: quantities, stats: stats,
        testing: { setup: setup, cycle: cycle, budget: budget, step: step, phases: phases } };
}));

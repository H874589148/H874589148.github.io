/* 整数 N 电荷泵 PLL：固定无源网络的连续时间小信号模型。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./jitter-core.js'), require('./phase-noise.js'));
    else root.PLLCore = factory(root.JitterCore, root.PhaseNoise);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (J, PN) {
    'use strict';
    var KB = 1.380649e-23, LIMIT = 50000;
    function z(re, im) { return { re: re || 0, im: im || 0 }; }
    function add(a, b) { return z(a.re + b.re, a.im + b.im); }
    function sub(a, b) { return z(a.re - b.re, a.im - b.im); }
    function scale(a, k) { return z(a.re * k, a.im * k); }
    function mul(a, b) { return z(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
    function div(a, b) {
        var d = b.re * b.re + b.im * b.im;
        if (!(d > 0) || !Number.isFinite(d)) throw new Error('复数传递函数出现奇点或溢出');
        return z((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
    }
    function inv(a) { return div(z(1), a); }
    function abs2(a) { return a.re * a.re + a.im * a.im; }
    function finiteComplex(a) { J.finite(a.re, '复数实部'); J.finite(a.im, '复数虚部'); return a; }
    function defaults() {
        return { topology: 'A', fref: 10e6, referenceDivider: 1, feedbackDivider: 10, outputDivider: 1,
            icp: 1e-3, kvco: 20e6, r2: 330, c1: 100e-12, c2: 10e-9, r3: 1e3, c3: 100e-12, temperature: 300,
            cpWhite: 10e-12, cpCorner: 0, low: 1e3, high: 1e6, plotLow: 10, plotHigh: 1e6,
            sources: { reference: true, vco: true, cp: true, r2: true, r3: true },
            referenceNoise: PN.reference(), vcoNoise: PN.vco() };
    }
    function parameters(input) {
        var p = Object.assign(defaults(), input || {}), b = p.topology === 'B';
        if (!b && p.topology !== 'A') throw new Error('PLL 拓扑无效');
        ['fref', 'icp', 'kvco', 'r2', 'c1', 'c2', 'temperature', 'low', 'high', 'plotLow', 'plotHigh'].forEach(function (key) { J.positive(p[key], key); });
        ['referenceDivider', 'feedbackDivider', 'outputDivider'].forEach(function (key) {
            if (!Number.isInteger(p[key]) || p[key] < 1 || p[key] > 1e6) throw new Error('分频比须为 1～1000000 的整数');
        });
        if (b) { J.positive(p.r3, 'R3'); J.positive(p.c3, 'C3'); }
        J.nonnegative(p.cpWhite, 'CP 白噪声'); J.nonnegative(p.cpCorner, 'CP 拐点');
        if (!(p.low < p.high && p.high < p.fref * p.feedbackDivider / p.referenceDivider / p.outputDivider)) throw new Error('积分频段须有效且低于输出载波');
        if (!(p.plotLow < p.plotHigh)) throw new Error('绘图起止频率无效');
        p.pfd = p.fref / p.referenceDivider; p.vcoFrequency = p.pfd * p.feedbackDivider; p.outputFrequency = p.vcoFrequency / p.outputDivider;
        p.kphi = p.icp / (2 * Math.PI); p.kv = 2 * Math.PI * p.kvco;
        if (p.high > p.pfd / 10) throw new Error('积分上限不得超过 fPFD/10，连续时间模型不支持该定量频段');
        p.referenceData = PN.normalize(p.referenceNoise); p.vcoData = PN.normalize(p.vcoNoise);
        PN.at(p.referenceData, p.low); PN.at(p.referenceData, p.high); PN.at(p.vcoData, p.low); PN.at(p.vcoData, p.high);
        p.sources = Object.assign(defaults().sources, p.sources || {});
        return p;
    }
    function admittance(p, s) {
        return add(mul(s, z(p.c1)), div(mul(s, z(p.c2)), add(z(1), scale(s, p.r2 * p.c2))));
    }
    function impedance(p, f) {
        var w = 2 * Math.PI * f, s = z(0, w), ya = admittance(p, s), za = inv(ya);
        if (p.topology === 'A') return finiteComplex(za);
        return finiteComplex(inv(add(mul(ya, add(z(1), scale(s, p.r3 * p.c3))), mul(s, z(p.c3)))));
    }
    function response(p, f) {
        var s = z(0, 2 * Math.PI * f), zf = impedance(p, f), g = mul(scale(zf, p.kphi), div(z(p.kv), s));
        var closed = add(z(1), scale(g, 1 / p.feedbackDivider));
        return { z: zf, g: g, t: scale(g, 1 / p.feedbackDivider), closed: closed,
            reference: div(g, scale(closed, p.referenceDivider * p.outputDivider)),
            vco: div(z(1), scale(closed, p.outputDivider)),
            cp: div(mul(zf, div(z(p.kv), s)), scale(closed, p.outputDivider)) };
    }
    function controlTransfer(p, f, node) {
        var s = z(0, 2 * Math.PI * f), r = response(p, f), ya = admittance(p, s);
        if (node === 'a') return r.cp;
        if (node === 'r2') {
            /* R2 Norton 源跨接 A/X；B 拓扑把 R3-C3 对 A 节点的负载一并纳入。 */
            var loaded = ya;
            if (p.topology === 'B') loaded = add(loaded, div(mul(s, z(p.c3)), add(z(1), scale(s, p.r3 * p.c3))));
            var za = inv(loaded), series = add(z(p.r2), inv(mul(s, z(p.c2))));
            var coefficient = scale(div(za, series), p.r2);
            if (p.topology === 'B') coefficient = div(coefficient, add(z(1), scale(s, p.r3 * p.c3)));
            return mul(coefficient, div(r.cp, r.z));
        }
        if (node === 'r3') {
            if (p.topology !== 'B') return z(0);
            /* R3 Norton 源跨接 A/B，开路控压系数为 R3·Ya·ZB。 */
            return mul(scale(ya, p.r3), r.cp);
        }
        throw new Error('未知滤波器噪声节点');
    }
    function coefficients(p) {
        var k = p.icp * p.kvco / p.feedbackDivider;
        if (p.topology === 'A') return [p.r2 * p.c1 * p.c2, p.c1 + p.c2, k * p.r2 * p.c2, k];
        return [p.r2 * p.r3 * p.c1 * p.c2 * p.c3,
            p.r2 * p.c1 * p.c2 + p.r3 * p.c3 * (p.c1 + p.c2) + p.r2 * p.c2 * p.c3,
            p.c1 + p.c2 + p.c3, k * p.r2 * p.c2, k];
    }
    function routh(p) {
        var a = coefficients(p), tests;
        /* 比例形式避免构造首末系数跨度极大的 Routh 表。 */
        if (a.length === 4) {
            var q3 = a[1] / a[0] * a[2] - a[3];
            tests = [q3];
        } else {
            var q4 = a[1] / a[0] * a[2] - a[3];
            if (!(q4 > 0)) tests = [q4];
            else tests = [q4, a[3] - a[1] * a[1] * a[4] / (a[0] * q4)];
        }
        var scales = a.length === 4 ? [Math.abs(a[1] / a[0] * a[2]) + Math.abs(a[3])] :
            [Math.abs(a[1] / a[0] * a[2]) + Math.abs(a[3]), Math.abs(a[3]) + Math.abs(a[1] * a[1] * a[4] / (a[0] * (a[1] / a[0] * a[2] - a[3])))];
        var critical = tests.some(function (v, i) { return Math.abs(v) <= (scales[i] || 1) * 1e-13; });
        return { stable: !critical && tests.every(function (v) { return v > 0; }), critical: critical,
            criteria: tests, coefficients: a };
    }
    function bisect(fn, a, b) {
        var fa = fn(a);
        for (var i = 0; i < 65; i++) { var m = (a + b) / 2, fm = fn(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
        return (a + b) / 2;
    }
    function scan(p) {
        /* 图按用户频段绘制；交越分析额外搜索至 fPFD，不能因画布边界漏报。 */
        var n = 800, a = Math.log(p.plotLow), b = Math.log(Math.max(p.plotHigh, p.pfd)), points = [], phase = null;
        for (var i = 0; i <= n; i++) {
            var f = Math.exp(a + (b - a) * i / n), r = response(p, f), raw = Math.atan2(r.t.im, r.t.re);
            if (phase !== null) raw += Math.round((phase - raw) / (2 * Math.PI)) * 2 * Math.PI;
            phase = raw;
            points.push({ f: f, response: r, magnitude: 20 * Math.log10(Math.hypot(r.t.re, r.t.im)), phase: raw });
        }
        var crossings = [], phaseCrossings = [], bandwidths = [];
        function find(key, target) {
            var out = [];
            for (var i = 1; i < points.length; i++) {
                var x0 = points[i - 1], x1 = points[i];
                if ((x0[key] - target) * (x1[key] - target) < 0) {
                    var x = bisect(function (v) {
                        var r = response(p, Math.exp(v));
                        if (key === 'magnitude') return 20 * Math.log10(Math.hypot(r.t.re, r.t.im)) - target;
                        var expected = x0.phase + (x1.phase - x0.phase) * (v - Math.log(x0.f)) / (Math.log(x1.f) - Math.log(x0.f));
                        var raw = Math.atan2(r.t.im, r.t.re);
                        raw += Math.round((expected - raw) / (2 * Math.PI)) * 2 * Math.PI;
                        return raw - target;
                    }, Math.log(x0.f), Math.log(x1.f));
                    var f = Math.exp(x), r = response(p, f), phaseValue = x0.phase + (x1.phase - x0.phase) * (x - Math.log(x0.f)) / (Math.log(x1.f) - Math.log(x0.f));
                    out.push({ f: f, phase: phaseValue, magnitude: 20 * Math.log10(Math.hypot(r.t.re, r.t.im)) });
                }
            }
            return out;
        }
        crossings = find('magnitude', 0); phaseCrossings = find('phase', -Math.PI);
        for (var k = 1; k < points.length; k++) {
            var m0 = abs2(points[k - 1].response.t) / abs2(points[k - 1].response.closed), m1 = abs2(points[k].response.t) / abs2(points[k].response.closed);
            if ((m0 - .5) * (m1 - .5) < 0) {
                var bx = bisect(function (x) { var r = response(p, Math.exp(x)); return abs2(r.t) / abs2(r.closed) - .5; }, Math.log(points[k - 1].f), Math.log(points[k].f));
                bandwidths.push(Math.exp(bx));
            }
        }
        var crossover = crossings[0] || null;
        return { points: points, crossings: crossings, crossover: crossover,
            phaseMargin: crossover ? 180 + crossover.phase * 180 / Math.PI : null,
            gainMargin: phaseCrossings.length ? -phaseCrossings[0].magnitude : null,
            bandwidth: bandwidths.length ? bandwidths[0] : null, rangeLimited: !crossover || !phaseCrossings.length };
    }
    function spectral(p, f, source) {
        var r = response(p, f), noise;
        if (source === 'reference') noise = 2 * PN.at(p.referenceData, f).p * abs2(r.reference);
        else if (source === 'vco') noise = 2 * PN.at(p.vcoData, f).p * abs2(r.vco);
        else if (source === 'cp') noise = p.cpWhite * p.cpWhite * (1 + p.cpCorner / f) * abs2(r.cp);
        else if (source === 'r2') noise = 4 * KB * p.temperature / p.r2 * abs2(controlTransfer(p, f, 'r2'));
        else if (source === 'r3') noise = p.topology === 'B' ? 4 * KB * p.temperature / p.r3 * abs2(controlTransfer(p, f, 'r3')) : 0;
        else throw new Error('未知 PLL 噪声源');
        return J.nonnegative(noise, '输出相位 PSD');
    }
    function integrateLog(fn, a, b, tolerance, counter) {
        /* 只夹紧对数区间端点的舍入漂移，不扩大任何输入谱的覆盖范围。 */
        function sample(x) { return fn(Math.max(Math.exp(a), Math.min(Math.exp(b), Math.exp(x)))) * Math.exp(x); }
        var mid = (a + b) / 2, fa = sample(a), fm = sample(mid), fb = sample(b), h = b - a;
        counter.n += 3;
        var whole = h * (fa + 4 * fm + fb) / 6;
        if (fa === 0 && fm === 0 && fb === 0) return 0;
        var initialError = tolerance * Math.max(Math.abs(whole), Number.MIN_VALUE);
        function recurse(x0, x1, f0, fm0, f1, full, error, depth) {
            if (counter.n > LIMIT) throw new Error('PLL 积分超过 50000 次函数评估，未收敛');
            var m = (x0 + x1) / 2, leftMid = (x0 + m) / 2, rightMid = (m + x1) / 2;
            var fl = sample(leftMid), fr = sample(rightMid); counter.n += 2;
            var left = (m - x0) * (f0 + 4 * fl + fm0) / 6, right = (x1 - m) * (fm0 + 4 * fr + f1) / 6;
            var delta = left + right - full;
            if (Math.abs(delta) <= 15 * error) return left + right + delta / 15;
            if (depth >= 24) throw new Error('PLL 自适应积分达到最大深度，未满足相对误差目标');
            return recurse(x0, m, f0, fl, fm0, left, error / 2, depth + 1) + recurse(m, x1, fm0, fr, f1, right, error / 2, depth + 1);
        }
        var value = recurse(a, b, fa, fm, fb, whole, initialError, 0);
        if (!Number.isFinite(value)) throw new Error('PLL 积分结果无效');
        return value;
    }
    function analyze(input) {
        var p = parameters(input), stable = routh(p), sweep = scan(p), warnings = [];
        if (!stable.stable) warnings.push(stable.critical ? '环路处于临界或数值无法可靠判定状态。' : '闭环 Routh–Hurwitz 判据不稳定。');
        if (sweep.phaseMargin !== null && sweep.phaseMargin < 45) warnings.push('相位裕度小于 45°，可能存在明显振铃。');
        if (sweep.crossover && sweep.crossover.f > p.pfd / 10) warnings.push('开环交越高于 fPFD/10，连续时间近似不可靠，禁止传递为 ADC 预算。');
        if (!sweep.crossover) warnings.push('分析频段内未找到 0 dB 交越，不宣称无限稳定裕度。');
        var result = { parameters: p, stability: stable, sweep: sweep, warnings: warnings,
            valid: stable.stable && !(sweep.crossover && sweep.crossover.f > p.pfd / 10), contributions: {}, seconds: null, phaseRms: null };
        if (!result.valid) return result;
        var total = 0, counter = { n: 0 }, enabled = Object.keys(p.sources).filter(function (key) { return p.sources[key] && (key !== 'r3' || p.topology === 'B'); });
        var features = [1 / (2 * Math.PI * p.r2 * p.c2), 1 / (2 * Math.PI * p.r2 * (p.c1 + p.c2)), sweep.crossover && sweep.crossover.f, sweep.bandwidth];
        if (p.topology === 'B') features.push(1 / (2 * Math.PI * p.r3 * p.c3));
        var knots = [p.low, p.high].concat(p.referenceData.points.map(function (v) { return v.f; }), p.vcoData.points.map(function (v) { return v.f; }), features)
            .filter(function (f) { return Number.isFinite(f) && f >= p.low && f <= p.high; }).sort(function (a, b) { return a - b; }).filter(function (f, i, all) { return !i || f !== all[i - 1]; });
        enabled.forEach(function (source) {
            var variance = 0;
            for (var i = 1; i < knots.length; i++) variance += integrateLog(function (f) { return spectral(p, f, source); }, Math.log(knots[i - 1]), Math.log(knots[i]), 1e-5, counter);
            result.contributions[source] = { variance: variance, jitter: Math.sqrt(variance) / (2 * Math.PI * p.outputFrequency) };
            total += variance;
        });
        result.phaseVariance = total; result.phaseRms = Math.sqrt(total); result.seconds = result.phaseRms / (2 * Math.PI * p.outputFrequency);
        result.evaluations = counter.n;
        result.curve = sweep.points.filter(function (point) { return point.f >= p.low && point.f <= p.high; }).map(function (point) {
            var f = point.f, sum = 0, sources = {};
            enabled.forEach(function (source) { sources[source] = spectral(p, f, source); sum += sources[source]; });
            return { f: f, ssbDb: sum > 0 ? 10 * Math.log10(sum / 2) : null, sources: sources };
        });
        return result;
    }
    return { KB: KB, LIMIT: LIMIT, defaults: defaults, parameters: parameters, z: z, add: add, sub: sub, mul: mul, div: div,
        admittance: admittance, impedance: impedance, response: response, controlTransfer: controlTransfer, coefficients: coefficients,
        routh: routh, scan: scan, spectral: spectral, integrateLog: integrateLog, analyze: analyze };
}));

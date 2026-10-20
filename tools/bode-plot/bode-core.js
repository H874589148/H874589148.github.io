/* Bode 纯计算：严格单位解析、RC 换算、对数域频响、刻度与交越求解。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.BodeCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var PREFIX = { '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12,
        m: 1e-3, u: 1e-6, 'μ': 1e-6, 'µ': 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };
    var MIN = 1e-150, MAX = 1e150;
    function positive(v) {
        if (!Number.isFinite(v) || v < MIN || v > MAX)
            throw new Error('请输入正数，SI 数值安全范围为 1e-150～1e150');
        return v;
    }
    function parseQuantity(text, unit) {
        var match = String(text).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([^\s]*)$/);
        if (!match) throw new Error('请输入数值，可附工程单位或科学计数法');
        var suffix = match[2];
        var ending = unit === 'Hz' ? /Hz$/i : unit === 'Ω' ? /(?:Ω|Ω|ohms?)$/i : /F$/;
        // 小写 f 是 femto 前缀，电容单位 F 区分大小写。
        suffix = suffix.replace(ending, '');
        if (!Object.prototype.hasOwnProperty.call(PREFIX, suffix))
            throw new Error('单位无效：需要 ' + unit + ' 或其工程前缀（M 与 m 不同）');
        return positive(Number(match[1]) * PREFIX[suffix]);
    }
    function rcFrequency(r, c) {
        positive(r); positive(c);
        return positive(Math.exp(-Math.log(2 * Math.PI) - Math.log(r) - Math.log(c)));
    }
    function frequencyRange(start, end) {
        var a = parseQuantity(start, 'Hz'), b = parseQuantity(end, 'Hz');
        if (!(a < b)) throw new Error('频率范围必须满足 0 < 起点 < 终点');
        if (Math.log10(b) - Math.log10(a) < 1e-8) throw new Error('起止频率过于接近，请扩大范围');
        return { fStart: a, fEnd: b };
    }
    function sliderDomain(range, previous) {
        return { min: Math.max(-150, Math.min(previous ? previous.min : -3, Math.floor(Math.log10(range.fStart)))),
            max: Math.min(150, Math.max(previous ? previous.max : 12, Math.ceil(Math.log10(range.fEnd)))) };
    }
    function slideRange(range, side, logValue) {
        var low = Math.log10(range.fStart), high = Math.log10(range.fEnd);
        var gap = Math.min(0.01, (high - low) / 2);
        if (side === 'start') low = Math.min(logValue, high - gap);
        else high = Math.max(logValue, low + gap);
        return { fStart: Math.pow(10, low), fEnd: Math.pow(10, high) };
    }
    function format(v, unit, digits) {
        if (!Number.isFinite(v)) return '—';
        if (v === 0) return '0' + (unit ? ' ' + unit : '');
        var levels = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
            [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
        var abs = Math.abs(v), n = digits || 6;
        for (var i = 0; i < levels.length; i++) {
            if (abs >= levels[i][0] && abs < 1e15)
                return Number((v / levels[i][0]).toPrecision(n)) + ' ' + levels[i][1] + (unit || '');
        }
        return v.toExponential(n - 1) + (unit ? ' ' + unit : '');
    }
    function prepare(gainDb, poles, zeros) {
        if (!Number.isFinite(gainDb) || Math.abs(gainDb) > 1e6) throw new Error('增益须为有限数，且 |dB| ≤ 1e6');
        var counts = new Map();
        function add(list, sign) {
            list.forEach(function (p) {
                var f = positive(typeof p === 'number' ? p : p.freq);
                counts.set(f, (counts.get(f) || 0) + sign);
            });
        }
        add(poles, -1); add(zeros, 1);
        var factors = [];
        counts.forEach(function (count, f) { if (count) factors.push({ f: f, log: Math.log(f), count: count }); });
        return { gainDb: gainDb, factors: factors, unity: gainDb === 0 && factors.length === 0 };
    }
    function response(f, model) {
        var log = Math.log(positive(f)), mag = model.gainDb, phase = 0, slope = 0, phaseSlope = 0;
        model.factors.forEach(function (p) {
            var t = log - p.log, e = Math.exp(-2 * Math.abs(t));
            // log(1 + exp(2t)) 的稳定形式，不先构造巨大线性增益。
            mag += p.count * (20 * Math.max(t, 0) + 10 * Math.log1p(e)) / Math.LN10;
            phase += p.count * (t > 0 ? Math.PI / 2 - Math.atan(Math.exp(-t)) : Math.atan(Math.exp(t))) * 180 / Math.PI;
            slope += p.count * 20 * (t >= 0 ? 1 / (1 + e) : e / (1 + e));
            phaseSlope += p.count * 180 / Math.PI * Math.LN10 * Math.exp(-Math.abs(t)) / (1 + e);
        });
        return { mag: mag, phase: phase, slope: slope, phaseSlope: phaseSlope };
    }
    function bisect(fn, a, b) {
        var va = fn(a);
        for (var i = 0; i < 70; i++) {
            var mid = (a + b) / 2, vm = fn(mid);
            if (vm === 0 || b - a < 1e-12) return mid;
            if ((va < 0) !== (vm < 0)) b = mid;
            else { a = mid; va = vm; }
        }
        return (a + b) / 2;
    }
    function crossings(model, logs, key, target, derivative) {
        var fn = function (x) { return response(Math.pow(10, x), model)[key] - target; };
        var df = function (x) { return response(Math.pow(10, x), model)[derivative]; };
        var knots = logs.slice(), critical = [], result = [];
        // 加入极值点，让同一粗采样区间内的下降/上升双交越也可被分开。
        for (var i = 1; i < logs.length; i++) {
            var d0 = df(logs[i - 1]), d1 = df(logs[i]);
            if (d0 * d1 < 0) critical.push(bisect(df, logs[i - 1], logs[i]));
            else if (i > 1 && d0 === 0 && df(logs[i - 2]) * d1 < 0) critical.push(logs[i - 1]);
        }
        knots = knots.concat(critical).sort(function (a, b) { return a - b; });
        function add(x, touch) {
            if (result.some(function (r) { return Math.abs(Math.log10(r.f) - x) < 1e-8; })) return;
            var f = Math.pow(10, x), h = response(f, model), d = h[derivative];
            result.push({ f: f, phase: h.phase, pm: 180 + h.phase, mag: h.mag,
                direction: touch || Math.abs(d) < 1e-10 ? 'touch' : d < 0 ? 'down' : 'up' });
        }
        for (var k = 0; k < knots.length; k++) {
            var v = fn(knots[k]);
            // 排除数值饱和造成的「整片 0」；精确落在采样点或范围端点的交越保留。
            if (v === 0 && Math.abs(df(knots[k])) > 1e-10) add(knots[k]);
            if (k && ((fn(knots[k - 1]) < 0 && v > 0) || (fn(knots[k - 1]) > 0 && v < 0)))
                add(bisect(fn, knots[k - 1], knots[k]));
        }
        // 极值恰好触及目标线时保留几何接触点，但不把它作为下降交越。
        critical.forEach(function (x) { if (Math.abs(fn(x)) <= 1e-12) add(x, true); });
        return result.sort(function (a, b) { return a.f - b.f; });
    }
    function sweep(model, range) {
        var a = Math.log10(range.fStart), b = Math.log10(range.fEnd);
        var n = Math.min(8000, Math.max(500, Math.ceil((b - a) * 120))), logs = [];
        for (var i = 0; i <= n; i++) logs.push(a + (b - a) * i / n);
        model.factors.forEach(function (p) {
            var x = Math.log10(p.f);
            if (x > a && x < b) logs.push(x);
        });
        logs = Array.from(new Set(logs)).sort(function (x, y) { return x - y; });
        var cross = model.unity ? [] : crossings(model, logs, 'mag', 0, 'slope');
        var pc = crossings(model, logs, 'phase', -180, 'phaseSlope');
        var primary = cross.find(function (c) { return c.direction === 'down'; }) || null;
        var phaseCross = pc.find(function (c) { return c.direction === 'down'; }) || null;
        // 显式采样交越点，让极窄的交越也能显示在曲线上。
        cross.concat(pc).forEach(function (c) { logs.push(Math.log10(c.f)); });
        logs.sort(function (x, y) { return x - y; });
        var points = logs.map(function (x) { var f = Math.pow(10, x); return Object.assign({ f: f }, response(f, model)); });
        return { points: points, crossings: cross, primary: primary, phaseCrossings: pc,
            gm: phaseCross ? -phaseCross.mag : null, unity: model.unity };
    }
    function axis(values, height, phase) {
        var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('响应超出数值范围');
        var pad = Math.max(phase ? 10 : 1, (hi - lo) * 0.08);
        lo -= pad; hi += pad;
        var target = Math.max(5, Math.min(8, Math.floor(height / 40)));
        if (phase) {
            lo = Math.min(-200, lo); hi = Math.max(100, hi);
            var step = 45 * Math.max(1, Math.ceil((hi - lo) / target / 45));
            var ticks = [];
            for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
            return { min: lo, max: hi, step: step, ticks: ticks };
        }
        var base = Math.floor(Math.log10((hi - lo) / target)), best = null;
        for (var power = base - 1; power <= base + 1; power++) {
            [1, 2, 5].forEach(function (factor) {
                var step = factor * Math.pow(10, power), min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step;
                var count = Math.round((max - min) / step), score = Math.abs(count - target);
                if (!best || score < best.score) best = { min: min, max: max, step: step, count: count, score: score };
            });
        }
        best.ticks = [];
        for (var j = 0; j <= best.count; j++) best.ticks.push(Number((best.min + j * best.step).toPrecision(12)));
        return best;
    }
    return { parseQuantity: parseQuantity, rcFrequency: rcFrequency, frequencyRange: frequencyRange,
        sliderDomain: sliderDomain, slideRange: slideRange, format: format, prepare: prepare,
        response: response, sweep: sweep, axis: axis };
}));

/* SSB 相噪解析与积分：dB/log(f) 插值，线性谱分段幂律积分。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./jitter-core.js'));
    else root.PhaseNoise = factory(root.JitterCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (J) {
    'use strict';
    var LIMIT = 2000;
    function clone(points) { return points.map(function (p) { return { f: p.f, db: p.db }; }); }
    function normalize(points) {
        if (!Array.isArray(points) || points.length < 1 || points.length > LIMIT) throw new Error('相噪表需要 1～2000 个有效点');
        var sorted = false, out = points.map(function (p, i) {
            if (!p || typeof p !== 'object') throw new Error('第 ' + (i + 1) + ' 个相噪点无效');
            var f = J.positive(Number(p.f), '频偏'), db = J.finite(Number(p.db), '相噪');
            if (f > 1e15 || Math.abs(db) > 3000) throw new Error('相噪点超出数值范围');
            return { f: f, db: db, p: Math.pow(10, db / 10) };
        }).sort(function (a, b) { return a.f - b.f; });
        out.forEach(function (p, i) {
            if (i && p.f === out[i - 1].f) throw new Error('重复频偏 ' + p.f + ' Hz，请删除或合并后再计算');
            if (i && p.f !== points[i].f) sorted = true;
            if (!(p.p > 0)) throw new Error('相噪线性功率下溢，请检查 dBc/Hz 数值');
        });
        return { points: out, sorted: sorted };
    }
    function locate(data, f) {
        var p = data.points || data;
        /* 数学边界 exp(log(f)) 可产生 1 ulp 往返误差，仅在端点处夹紧。 */
        if (Math.abs(f / p[0].f - 1) < 1e-14) f = p[0].f;
        if (Math.abs(f / p[p.length - 1].f - 1) < 1e-14) f = p[p.length - 1].f;
        if (f < p[0].f || f > p[p.length - 1].f) throw new Error('积分频段超出相噪数据覆盖范围，不外推');
        if (p.length === 1 || f === p[0].f) return { i: 0, t: 0 };
        if (f === p[p.length - 1].f) return { i: p.length - 2, t: 1 };
        var lo = 0, hi = p.length - 1;
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (p[mid].f <= f) lo = mid; else hi = mid; }
        return { i: lo, t: Math.log(f / p[lo].f) / Math.log(p[lo + 1].f / p[lo].f) };
    }
    function at(data, f) {
        var p = data.points || data;
        if (Math.abs(f / p[0].f - 1) < 1e-14) f = p[0].f;
        if (Math.abs(f / p[p.length - 1].f - 1) < 1e-14) f = p[p.length - 1].f;
        var q = locate(data, f);
        if (p.length === 1) return { f: f, db: p[0].db, p: p[0].p };
        var a = p[q.i], b = p[q.i + 1], db = a.db + q.t * (b.db - a.db);
        return { f: f, db: db, p: Math.pow(10, db / 10) };
    }
    function segment(a, b, x0, x1) {
        var f0 = Math.max(x0, a.f), f1 = Math.min(x1, b.f);
        if (!(f1 > f0)) return 0;
        var alpha = Math.LN10 * (b.db - a.db) / 10 / Math.log(b.f / a.f) + 1;
        var logRatio = Math.log(f1 / f0), f0db = a.db + (b.db - a.db) * Math.log(f0 / a.f) / Math.log(b.f / a.f);
        var p0 = Math.pow(10, f0db / 10), result;
        if (Math.abs(alpha) < 1e-7) result = p0 * f0 * logRatio * (1 + alpha * logRatio / 2);
        else result = p0 * f0 * Math.expm1(alpha * logRatio) / alpha;
        if (!(result >= 0) || !Number.isFinite(result)) throw new Error('相噪分段积分溢出或无效');
        return result;
    }
    function integrate(points, carrier, low, high) {
        J.positive(carrier, '载波'); J.positive(low, '积分下限'); J.positive(high, '积分上限');
        if (!(low < high && high < carrier)) throw new Error('积分须满足 0 < 下限 < 上限 < 载波');
        var data = normalize(points), p = data.points;
        if (p.length < 2) {
            if (low < p[0].f || high > p[0].f) throw new Error('单点平坦谱须明确标注，并保证积分频段与该频偏定义一致');
        }
        locate(data, low); locate(data, high);
        var ssb = 0, segments = [], knots = [low].concat(p.map(function (v) { return v.f; }).filter(function (f) { return f > low && f < high; })).concat([high]);
        for (var k = 1; k < knots.length; k++) {
            var a = at(data, knots[k - 1]), b = at(data, knots[k]), part = segment(a, b, knots[k - 1], knots[k]);
            ssb += part; segments.push({ low: knots[k - 1], high: knots[k], variance: 2 * part });
        }
        var phaseVariance = 2 * ssb, phaseRms = Math.sqrt(phaseVariance), seconds = phaseRms / (2 * Math.PI * carrier);
        J.finite(seconds, '积分抖动');
        segments.forEach(function (s) { s.fraction = phaseVariance ? s.variance / phaseVariance : 0; });
        var cumulative = knots.map(function (f) {
            var v = 0;
            for (var i = 1; i < knots.length && knots[i] <= f; i++) v += segment(at(data, knots[i - 1]), at(data, knots[i]), knots[i - 1], knots[i]);
            return { f: f, jitter: Math.sqrt(2 * v) / (2 * Math.PI * carrier) };
        });
        return { ssbPower: ssb, phaseVariance: phaseVariance, phaseRms: phaseRms,
            phaseDeg: phaseRms * 180 / Math.PI, seconds: seconds, segments: segments,
            cumulative: cumulative, points: p, sorted: data.sorted,
            warning: phaseRms > 0.1 ? '相位 RMS 较大，小相位噪声近似可能不准确。' : '' };
    }
    function csvEscape(value) { var s = String(value); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    function parse(text, unit) {
        if (!Object.prototype.hasOwnProperty.call(J.FREQ, unit)) throw new Error('频偏单位无效');
        var scale = J.FREQ[unit], rows = String(text).replace(/^\uFEFF/, '').split(/\r\n?|\n/), points = [], header = false;
        rows.forEach(function (line, index) {
            var clean = line.replace(/#.*$/, '').trim(); if (!clean) return;
            var fields = clean.split(/[;,\t]|\s+/).filter(Boolean);
            if (fields.length !== 2) throw new Error('第 ' + (index + 1) + ' 行需要频偏与相噪两列');
            if (!header && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(fields[0]) &&
                /(?:freq|offset|频偏)/i.test(fields[0]) && /(?:dbc|phase|相噪)/i.test(fields[1])) { header = true; return; }
            var f = J.number(fields[0], scale, '第 ' + (index + 1) + ' 行频偏');
            var db = J.number(fields[1], 1, '第 ' + (index + 1) + ' 行相噪');
            points.push({ f: f, db: db });
        });
        var data = normalize(points);
        return { points: data.points, sorted: data.sorted };
    }
    function toText(points, unit) {
        var scale = J.FREQ[unit] || 1;
        return 'offset(' + unit + '),phaseNoise(dBc/Hz)\n' + normalize(points).points.map(function (p) {
            return Number((p.f / scale).toPrecision(15)) + ',' + Number(p.db.toPrecision(15));
        }).join('\n');
    }
    function flat() { return [{ f: 1e3, db: -140 }, { f: 1e6, db: -140 }]; }
    function shaped() { return [{ f: 1e2, db: -100 }, { f: 1e3, db: -120 }, { f: 1e4, db: -140 }, { f: 1e5, db: -155 }, { f: 1e6, db: -160 }]; }
    function reference() { return [10, 100, 1e3, 1e4, 1e5, 1e6].map(function (f, i) { return { f: f, db: [-100, -125, -145, -155, -160, -160][i] }; }); }
    function vco() { return [10, 100, 1e3, 1e4, 1e5, 1e6].map(function (f, i) { return { f: f, db: [-30, -60, -90, -110, -130, -150][i] }; }); }
    return { LIMIT: LIMIT, normalize: normalize, at: at, segment: segment, integrate: integrate,
        parse: parse, toText: toText, csvEscape: csvEscape, flat: flat, shaped: shaped, reference: reference, vco: vco };
}));

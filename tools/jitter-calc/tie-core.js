/* TIE/边沿序列：先用十进制整数消除绝对时间，再做统计。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./jitter-core.js'));
    else root.TieCore = factory(root.JitterCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (J) {
    'use strict';
    var LIMIT = 100000, MAX_FILE = 5 * 1024 * 1024;
    function decimal(text, line) {
        var s = String(text).trim(), m = s.match(/^([+-]?)(\d*\.?\d*)(?:[eE]([+-]?\d+))?$/);
        if (!m || !/\d/.test(m[2])) throw new Error('第 ' + line + ' 行不是有效的十进制时间');
        if (Math.abs(Number(m[3] || 0)) > 30) throw new Error('第 ' + line + ' 行十进制指数超出 ±30');
        var parts = m[2].split('.'), digits = (parts[0] + (parts[1] || '')).replace(/^0+(?=\d)/, '');
        if (digits.length > 40) throw new Error('第 ' + line + ' 行超过 40 位有效数字');
        var exponent = Number(m[3] || 0) - (parts[1] || '').length;
        return { negative: m[1] === '-', integer: BigInt(digits || '0'), exponent: exponent };
    }
    function rescale(d, exponent) {
        if (d.exponent < exponent) { d.integer *= 10n ** BigInt(exponent - d.exponent); d.exponent = exponent; }
        return d;
    }
    function difference(a, b) {
        var exponent = Math.min(a.exponent, b.exponent), x = rescale(a, exponent).integer, y = rescale(b, exponent).integer;
        var value = (a.negative ? -x : x) - (b.negative ? -y : y), abs = value < 0n ? -value : value;
        return { value: Number(abs) * Math.pow(10, exponent), negative: value < 0n };
    }
    function rows(text) {
        if (String(text).length > MAX_FILE) throw new Error('文本超过 5 MiB 限制');
        return String(text).replace(/^\uFEFF/, '').split(/\r\n?|\n/).map(function (line, i) {
            var clean = line.replace(/#.*$/, '').trim(); if (!clean) return null;
            var fields = clean.split(/[;,\t]|\s+/).filter(Boolean);
            if (fields.length !== 1) throw new Error('第 ' + (i + 1) + ' 行需要单列时间');
            if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(fields[0])) {
                if (/^(?:time|timestamp|tie|时间|边沿)/i.test(fields[0])) return null;
                throw new Error('第 ' + (i + 1) + ' 行时间格式无效');
            }
            return decimal(fields[0], i + 1);
        }).filter(function (v) { return v !== null; });
    }
    function sequence(text, mode, unit, nominalFrequency) {
        if (!Object.prototype.hasOwnProperty.call(J.TIME, unit)) throw new Error('时间单位无效');
        var scale = J.TIME[unit], decimals = rows(text);
        if (decimals.length < 2 || decimals.length > LIMIT) throw new Error('时间序列需要 2～100000 个点');
        var out = [], origin = decimals[0], period = 1 / J.positive(nominalFrequency, '标称频率'), warnings = [];
        decimals.forEach(function (d, i) {
            var differenceSeconds = mode === 'edges' ? difference(d, origin) :
                { value: Number(d.integer) * Math.pow(10, d.exponent), negative: d.negative };
            var value = differenceSeconds.value * scale;
            if (mode === 'edges') {
                var previous = i ? difference(decimals[i], decimals[i - 1]).value * scale : period;
                if (i && previous <= 0) throw new Error('第 ' + (i + 1) + ' 个边沿未严格递增');
                if (i && (previous < period * 0.5 || previous > period * 1.5)) warnings.push('第 ' + (i + 1) + ' 个边沿间隔与标称周期相差超过 50%，请核查漏采或标称频率');
                value -= i * period;
            } else if (mode !== 'tie') throw new Error('时间序列模式无效');
            out.push(differenceSeconds.negative ? -value : value);
        });
        out.forEach(function (v) { J.finite(v, 'TIE'); });
        return { values: out, warnings: warnings, count: out.length };
    }
    function stats(values) {
        if (!Array.isArray(values) || !values.length) throw new Error('统计样本为空');
        var mean = 0, m2 = 0, min = Infinity, max = -Infinity;
        values.forEach(function (value, i) {
            J.finite(value, '统计样本');
            var delta = value - mean; mean += delta / (i + 1); m2 += delta * (value - mean);
            min = Math.min(min, value); max = Math.max(max, value);
        });
        var rms = Math.sqrt(values.reduce(function (sum, v) { return sum + v * v; }, 0) / values.length);
        return { count: values.length, mean: mean, standardDeviation: Math.sqrt(Math.max(0, m2 / values.length)),
            rms: rms, min: min, max: max, peakToPeak: max - min, maxAbsolute: Math.max(Math.abs(min), Math.abs(max)) };
    }
    function linearFit(values) {
        var n = values.length, meanX = (n - 1) / 2, meanY = values.reduce(function (s, v) { return s + v; }, 0) / n;
        var numerator = 0, denominator = 0;
        values.forEach(function (v, i) { numerator += (i - meanX) * (v - meanY); denominator += (i - meanX) ** 2; });
        var slope = denominator ? numerator / denominator : 0;
        return { intercept: meanY - slope * meanX, slope: slope };
    }
    function analyze(input) {
        var values = input.values.slice(), mode = input.detrend || 'mean', fit = linearFit(values), processed;
        if (mode === 'none') processed = values.slice();
        else if (mode === 'mean') processed = values.map(function (v) { return v - stats(values).mean; });
        else if (mode === 'linear') processed = values.map(function (v, i) { return v - fit.intercept - fit.slope * i; });
        else throw new Error('去趋势模式无效');
        var result = { raw: stats(values), processed: stats(processed), values: values, detrended: processed,
            mode: mode, fit: fit, warnings: (input.warnings || []).slice() };
        var nominal = J.positive(input.nominalFrequency, '标称频率'), fittedPeriod = 1 / nominal + fit.slope;
        result.fittedFrequency = fittedPeriod > 0 ? 1 / fittedPeriod : null;
        result.ppm = fittedPeriod > 0 ? (result.fittedFrequency / nominal - 1) * 1e6 : null;
        if (input.consecutive) {
            if (values.length < 3) { result.period = null; result.cycle = null; result.warning = '周期与周期间统计至少需要 3 个连续边沿。'; }
            else {
                var p = values.slice(1).map(function (v, i) { return v - values[i]; });
                var c = values.slice(2).map(function (v, i) { return v - 2 * values[i + 1] + values[i]; });
                result.period = stats(p); result.cycle = stats(c);
                result.periodValues = p; result.cycleValues = c;
            }
        }
        return result;
    }
    function histogram(values, bins) {
        var s = stats(values), n = Math.max(1, Math.min(40, bins || 20));
        if (s.max === s.min) return [{ min: s.min, max: s.max, count: values.length }];
        var width = (s.max - s.min) / n, out = Array.from({ length: n }, function (_, i) { return { min: s.min + i * width, max: s.min + (i + 1) * width, count: 0 }; });
        values.forEach(function (v) { out[Math.min(n - 1, Math.floor((v - s.min) / width))].count++; });
        return out;
    }
    function thin(values, maximum) {
        var n = Math.min(maximum || 2000, 2000);
        if (values.length <= n) return values.map(function (v, i) { return { index: i, value: v }; });
        var buckets = Math.floor(n / 2), out = [], size = values.length / buckets;
        for (var i = 0; i < buckets; i++) {
            var start = Math.floor(i * size), end = Math.floor((i + 1) * size), low = start, high = start;
            for (var k = start; k < end; k++) { if (values[k] < values[low]) low = k; if (values[k] > values[high]) high = k; }
            [low, high].sort(function (a, b) { return a - b; }).forEach(function (index) { out.push({ index: index, value: values[index] }); });
        }
        return out;
    }
    function example(kind) {
        var n = 64, out = [];
        for (var i = 0; i < n; i++) {
            var value = kind === 'offset' ? 2e-12 : kind === 'drift' ? 2e-12 + i * 1e-14 : 5e-12 * Math.sin(2 * Math.PI * i / 16);
            out.push(Number(value.toPrecision(16)));
        }
        return out;
    }
    return { LIMIT: LIMIT, MAX_FILE: MAX_FILE, decimal: decimal, difference: difference, sequence: sequence,
        stats: stats, linearFit: linearFit, analyze: analyze, histogram: histogram, thin: thin, example: example };
}));

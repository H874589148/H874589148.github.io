/* Jitter 换算、RSS 预算与 ADC 性能；所有输入输出均使用 SI。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.JitterCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var TIME = { s: 1, ns: 1e-9, ps: 1e-12, fs: 1e-15 };
    var FREQ = { Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9 };
    function finite(v, label) {
        if (!Number.isFinite(v)) throw new Error((label || '数值') + '必须是有限数');
        return v;
    }
    function number(value, scale, label) {
        if (typeof value === 'string' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) {
            throw new Error((label || '数值') + '格式无效');
        }
        return finite(Number(value) * (scale === undefined ? 1 : scale), label);
    }
    function positive(v, label) {
        finite(v, label);
        if (!(v > 0)) throw new Error((label || '数值') + '必须大于 0');
        return v;
    }
    function nonnegative(v, label) {
        finite(v, label);
        if (!(v >= 0)) throw new Error((label || '数值') + '不能小于 0');
        return v;
    }
    function time(value, unit, label, zero) {
        if (!Object.prototype.hasOwnProperty.call(TIME, unit)) throw new Error('时间单位无效');
        var v = number(value, TIME[unit], label);
        return zero ? nonnegative(v, label) : positive(v, label);
    }
    function frequency(value, unit, label) {
        if (!Object.prototype.hasOwnProperty.call(FREQ, unit)) throw new Error('频率单位无效');
        return positive(number(value, FREQ[unit], label), label);
    }
    function convert(seconds, carrier, bitRate) {
        positive(seconds, '时间抖动'); positive(carrier, '载波频率'); positive(bitRate, '比特率');
        var phase = 2 * Math.PI * carrier * seconds, ui = bitRate * seconds;
        return finiteResult({ seconds: seconds, phaseRad: phase, phaseDeg: phase * 180 / Math.PI, ui: ui, uiPercent: ui * 100 });
    }
    function timeFrom(source, value, carrier, bitRate) {
        positive(carrier, '载波频率'); positive(bitRate, '比特率'); positive(value, '换算输入');
        if (source === 'time') return value;
        if (source === 'rad') return value / (2 * Math.PI * carrier);
        if (source === 'deg') return value * Math.PI / (180 * 2 * Math.PI * carrier);
        if (source === 'ui') return value / bitRate;
        if (source === 'percent') return value / (100 * bitRate);
        throw new Error('未知换算源');
    }
    function rss(values, target) {
        if (!Array.isArray(values) || !values.length || values.length > 16) throw new Error('RSS 需要 1～16 个分量');
        var sum = 0, normalized = values.map(function (v) { return nonnegative(v, 'RSS 分量'); });
        normalized.forEach(function (v) { sum += v ** 2; finite(sum, '平方和'); });
        var total = Math.hypot.apply(Math, normalized), result = { total: total, sumSquares: sum };
        if (target !== undefined) {
            positive(target, '目标抖动');
            result.remaining = total < target ? target * Math.sqrt(Math.max(0, 1 - (total / target) ** 2)) : 0;
        }
        finiteResult(result);
        if (target !== undefined) result.status = total < target ? 'ok' : total === target ? 'exhausted' : 'unreachable';
        return result;
    }
    function edge(voltageNoise, slewRate) {
        positive(voltageNoise, '积分电压噪声'); positive(Math.abs(slewRate), '阈值处边沿斜率');
        return finite(voltageNoise / Math.abs(slewRate), '边沿抖动');
    }
    function scaling(ratio, phaseNoiseDb, phaseRms) {
        positive(ratio, '理想倍分频比'); finite(phaseNoiseDb, '输入相噪'); nonnegative(phaseRms, '相位 RMS');
        return finiteResult({ phaseNoiseDb: phaseNoiseDb + 20 * Math.log10(ratio), phaseRms: phaseRms * ratio });
    }
    function baseline(input) {
        var mode = input.mode || 'ideal';
        if (mode === 'jitter') return { mode: mode, db: null, kind: null };
        if (mode === 'ideal') {
            positive(input.bits, '位数');
            return { mode: mode, db: 6.02 * input.bits + 1.76, kind: 'sinad' };
        }
        if (mode !== 'snr' && mode !== 'sinad') throw new Error('基线模式无效');
        return { mode: mode, db: positive(input.baselineDb, '基线性能'), kind: mode };
    }
    function adc(input) {
        var fin = positive(input.fin, '模拟输入频率'), fs = positive(input.fs, '采样率');
        var components = ['clock', 'aperture', 'buffer'].map(function (key) { return nonnegative(input[key], key + ' 抖动'); });
        var total = rss(components).total, x = finite(2 * Math.PI * fin * total, 'ADC 归一化时间误差');
        var snrJitter = x === 0 ? Infinity : -20 * Math.log10(x), base = baseline(input), performance, kind, bits;
        if (base.db === null) {
            performance = snrJitter; kind = 'snr';
        } else {
            var q = Math.pow(10, -base.db / 10) + x * x;
            finite(q, 'ADC 噪声功率比');
            performance = -10 * Math.log10(q); kind = base.kind;
        }
        bits = Number.isFinite(performance) ? (performance - 1.76) / 6.02 : Infinity;
        var maxFin = budget(input).maxFin;
        return {
            total: total, clock: components[0], aperture: components[1], buffer: components[2],
            snrJitter: snrJitter, performance: performance, baseline: base, kind: kind,
            equivalentBits: bits, bitLabel: kind === 'sinad' ? 'ENOB' : '噪声受限等效位数',
            loss: base.db === null ? null : base.db - performance,
            maxFin: maxFin, undersampled: fin >= fs / 2, smallErrorWarning: x > 0.2,
            sources: { clock: components[0], aperture: components[1], buffer: components[2] }
        };
    }
    function budget(input) {
        var base = baseline(input), target = positive(input.targetDb, '目标性能');
        var qTarget = Math.pow(10, -target / 10), qBase = base.db === null ? 0 : Math.pow(10, -base.db / 10);
        var qAllow = qTarget - qBase, zeroTolerance = Number.EPSILON * 8 * Math.max(qTarget, qBase);
        if (Math.abs(qAllow) <= zeroTolerance) qAllow = 0;
        var fixed = nonnegative(input.aperture, 'aperture 抖动') ** 2 + nonnegative(input.buffer, 'buffer 抖动') ** 2;
        var total = qAllow > 0 ? Math.sqrt(qAllow) / (2 * Math.PI * positive(input.fin, '模拟输入频率')) : 0;
        var remaining = qAllow - fixed * Math.pow(2 * Math.PI * input.fin, 2);
        var clock = remaining > 0 ? Math.sqrt(remaining) / (2 * Math.PI * input.fin) : 0;
        finite(qAllow, 'ADC 可用噪声功率比'); finite(fixed, 'ADC 固定抖动平方和'); finite(remaining, 'ADC 剩余噪声功率比');
        return { qAllow: qAllow, total: total, clock: clock,
            status: qAllow < 0 || remaining < 0 ? 'unreachable' : qAllow === 0 || remaining === 0 ? 'exhausted' : 'ok',
            maxFin: qAllow > 0 ? fixed === 0 ? Infinity : Math.sqrt(qAllow / fixed) / (2 * Math.PI) : null };
    }
    function finiteResult(obj) {
        Object.keys(obj).forEach(function (key) { finite(obj[key], key); });
        return obj;
    }
    return { TIME: TIME, FREQ: FREQ, finite: finite, number: number, positive: positive, nonnegative: nonnegative,
        time: time, frequency: frequency, convert: convert, timeFrom: timeFrom, rss: rss, edge: edge,
        scaling: scaling, baseline: baseline, adc: adc, budget: budget };
}));

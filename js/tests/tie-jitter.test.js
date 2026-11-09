/* 运行：node --test js/tests/tie-jitter.test.js。 */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../../tools/jitter-calc/tie-core.js');
const near = (actual, expected, relative = 1e-11, absolute = 0) => assert.ok(
    Math.abs(actual - expected) <= absolute + relative * Math.abs(expected), `${actual} != ${expected}`);
const analyze = (values, extra = {}) => T.analyze({ values, nominalFrequency: 1e8, detrend: 'mean', ...extra });

test('常量偏置、线性漂移和正弦示例使用总体标准差与线性拟合', () => {
    const offset = analyze(T.example('offset'));
    near(offset.raw.mean, 2e-12, 1e-12, 1e-18); near(offset.raw.standardDeviation, 0, 0, 1e-27);
    near(offset.processed.mean, 0, 0, 1e-27);
    const drift = analyze(T.example('drift'), { detrend: 'linear' });
    near(drift.fit.slope, 1e-14, 1e-11, 1e-20);
    near(drift.fittedFrequency, 1 / (1e-8 + 1e-14));
    near(drift.ppm, (1e-8 / (1e-8 + 1e-14) - 1) * 1e6);
    near(drift.processed.standardDeviation, 0, 0, 2e-26);
    const sine = analyze(T.example('sine'), { detrend: 'none' });
    near(sine.raw.standardDeviation, 5e-12 / Math.sqrt(2), 1e-12, 1e-18);
});

test('单列 TIE 保留绝对偏置与符号，只有边沿时间戳消除 t0', () => {
    const sequence = T.sequence('2\n2\n-1', 'tie', 'ps', 1e8);
    near(sequence.values[0], 2e-12, 0, 1e-27); near(sequence.values[1], 2e-12, 0, 1e-27);
    near(sequence.values[2], -1e-12, 0, 1e-27); near(analyze(sequence.values).raw.mean, 1e-12, 1e-12, 1e-18);
});

test('周期和周期间始终从原始序列差分，显示去趋势不改变结果', () => {
    const values = [2e-12, 3e-12, 6e-12, 10e-12];
    for (const detrend of ['none', 'mean', 'linear']) {
        const r = analyze(values, { detrend, consecutive: true });
        [1e-12, 3e-12, 4e-12].forEach((v, i) => near(r.periodValues[i], v, 1e-12, 1e-18));
        [2e-12, 1e-12].forEach((v, i) => near(r.cycleValues[i], v, 1e-12, 1e-18));
    }
    assert.equal(analyze(values).period, undefined);
    const short = analyze([0, 1e-12], { consecutive: true });
    assert.equal(short.period, null); assert.match(short.warning, /至少需要 3/);
});

test('大绝对边沿先用十进制整数差分，恢复 ps 级 TIE', () => {
    const text = ['1000000000.000000000000000000', '1000000000.000000010001000000', '1000000000.000000020003000000'].join('\r\n');
    const sequence = T.sequence(text, 'edges', 's', 1e8);
    near(sequence.values[0], 0, 0, 1e-27); near(sequence.values[1], 1e-12, 1e-9, 1e-18);
    near(sequence.values[2], 3e-12, 1e-9, 1e-18);
    const r = analyze(sequence.values, { consecutive: true });
    near(r.periodValues[0], 1e-12, 1e-8, 1e-18); near(r.periodValues[1], 2e-12, 1e-8, 1e-18);
    near(r.cycleValues[0], 1e-12, 1e-8, 1e-18);
});

test('边沿递增、漏采提示、单列格式和原行号均可验证', () => {
    const sequence = T.sequence('\uFEFFtime(s)\n# comment\n0\n2e-8\n', 'edges', 's', 1e8);
    assert.match(sequence.warnings[0], /漏采/);
    assert.throws(() => T.sequence('0\n0\n', 'edges', 's', 1e8), /严格递增/);
    assert.throws(() => T.sequence('0\n1,2\n', 'tie', 's', 1e8), /第 2 行/);
    assert.throws(() => T.sequence('0\nbad\n', 'tie', 's', 1e8), /第 2 行/);
    assert.throws(() => T.sequence('0\n1e31\n', 'tie', 's', 1e8), /指数超出/);
});

test('40 位有效数字包含尾随零但不计前导零', () => {
    assert.doesNotThrow(() => T.decimal('0.000' + '1'.repeat(40), 1));
    assert.doesNotThrow(() => T.decimal('1' + '0'.repeat(39), 1));
    assert.throws(() => T.decimal('1' + '0'.repeat(40), 1), /40 位有效数字/);
    assert.throws(() => T.decimal('0.' + '0'.repeat(50) + '1'.repeat(41), 1), /40 位有效数字/);
});

test('直方图统计全量，趋势抽稀保留桶极值且不超过 2000 点', () => {
    const values = Array.from({ length: 10001 }, (_, i) => i === 5000 ? -100 : i === 7000 ? 200 : Math.sin(i));
    const bins = T.histogram(values, 40);
    assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), values.length);
    const thin = T.thin(values);
    assert.ok(thin.length <= 2000 && thin.length > 1000);
    assert.ok(thin.some(p => p.value === -100)); assert.ok(thin.some(p => p.value === 200));
});

/* 运行：node --test js/tests/jitter-core.test.js。 */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const J = require('../../tools/jitter-calc/jitter-core.js');
const near = (actual, expected, relative = 1e-12, absolute = 0) => assert.ok(
    Math.abs(actual - expected) <= absolute + relative * Math.abs(expected), `${actual} != ${expected}`);
const adcInput = () => ({ fin: 1e8, fs: 2.5e8, clock: 1e-12, aperture: 0, buffer: 0,
    mode: 'jitter', targetDb: 70 });

test('时间、相位和 UI 双向换算保持载波与比特率口径', () => {
    const r = J.convert(1e-12, 1e8, 1e9);
    near(r.phaseRad, 2 * Math.PI * 1e-4); near(r.phaseDeg, .036);
    near(r.ui, .001); near(r.uiPercent, .1);
    for (const [source, value] of [['time', 1e-12], ['rad', r.phaseRad], ['deg', r.phaseDeg], ['ui', r.ui], ['percent', r.uiPercent]])
        near(J.timeFrom(source, value, 1e8, 1e9), 1e-12, 1e-12, 1e-18);
});

test('RSS 合成、精确零裕量和不可达状态均保留数值结果', () => {
    const r = J.rss([3e-12, 4e-12], 6e-12);
    near(r.total, 5e-12, 1e-12, 1e-18); near(r.remaining, Math.sqrt(11) * 1e-12, 1e-12, 1e-18);
    assert.equal(r.status, 'ok');
    assert.equal(J.rss([3e-12, 4e-12], 5e-12).status, 'exhausted');
    assert.equal(J.rss([3e-12, 4e-12], 4e-12).status, 'unreachable');
    assert.throws(() => J.rss(Array(17).fill(1)), /1～16/);
});

test('边沿斜率与理想倍分频使用独立公式基准', () => {
    near(J.edge(1e-3, -1e9), 1e-12, 1e-12, 1e-18);
    const r = J.scaling(2, -140, .01);
    near(r.phaseNoiseDb, -140 + 20 * Math.log10(2)); near(r.phaseRms, .02);
});

test('ADC 1 ps 基准、位数标签和 6.0206 dB 缩放正确', () => {
    const r = J.adc(adcInput());
    near(r.snrJitter, 64.0364026328377); near(r.performance, 64.0364026328377);
    near(r.equivalentBits, 10.344917380870053); assert.equal(r.bitLabel, '噪声受限等效位数');
    const doubledF = J.adc({ ...adcInput(), fin: 2e8 });
    const doubledT = J.adc({ ...adcInput(), clock: 2e-12 });
    near(r.performance - doubledF.performance, 20 * Math.log10(2));
    near(r.performance - doubledT.performance, 20 * Math.log10(2));
    const sinad = J.adc({ ...adcInput(), mode: 'sinad', baselineDb: 74 });
    assert.equal(sinad.bitLabel, 'ENOB');
});

test('ADC 在功率比域合成基线，反推总预算、clock 和最大 fin 一致', () => {
    const input = { ...adcInput(), aperture: 1e-13, mode: 'ideal', bits: 12 };
    const r = J.adc(input), budget = J.budget(input);
    const x = 2 * Math.PI * input.fin * Math.hypot(1e-12, 1e-13);
    const expected = -10 * Math.log10(10 ** (-74 / 10) + x * x);
    near(r.performance, expected); near(r.loss, 74 - expected);
    const qAllow = 10 ** (-70 / 10) - 10 ** (-74 / 10);
    near(budget.qAllow, qAllow); near(budget.total, Math.sqrt(qAllow) / (2 * Math.PI * input.fin));
    near(budget.clock, Math.sqrt(qAllow - (2 * Math.PI * input.fin * 1e-13) ** 2) / (2 * Math.PI * input.fin));
    near(budget.maxFin, Math.sqrt(qAllow) / (2 * Math.PI * 1e-13)); near(r.maxFin, budget.maxFin);
    assert.equal(J.budget({ ...input, targetDb: 75 }).status, 'unreachable');
    assert.equal(J.budget({ ...input, targetDb: 74 }).status, 'unreachable');
    assert.equal(J.budget({ ...input, aperture: 0, targetDb: 74 }).status, 'exhausted');
    assert.equal(J.budget({ ...input, aperture: 0, targetDb: 70 }).maxFin, Infinity);
});

test('ADC 零抖动使用无穷极限，欠采样和大时间误差明确标记', () => {
    const zero = J.adc({ ...adcInput(), clock: 0 });
    assert.equal(zero.snrJitter, Infinity); assert.equal(zero.performance, Infinity);
    assert.equal(zero.maxFin, Infinity);
    assert.equal(J.adc({ ...adcInput(), fin: 1.3e8 }).undersampled, true);
    assert.equal(J.adc({ ...adcInput(), clock: 1e-9 }).smallErrorWarning, true);
    for (const value of ['', 'NaN', 'Infinity', '0x10', '1e309']) assert.throws(() => J.number(value, 1, '输入'));
});

/* 运行：node --test js/tests/phase-noise.test.js。 */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const PN = require('../../tools/jitter-calc/phase-noise.js');
const near = (actual, expected, relative = 1e-11, absolute = 0) => assert.ok(
    Math.abs(actual - expected) <= absolute + relative * Math.abs(expected), `${actual} != ${expected}`);

test('平坦相噪基准为 224.9665113507958 fs，分段贡献和累计曲线闭合', () => {
    const r = PN.integrate(PN.flat(), 1e8, 1e3, 1e6);
    near(r.seconds, 224.9665113507958e-15, 1e-12, 1e-18);
    near(r.phaseVariance, 2 * 999000 * 1e-14);
    near(r.segments.reduce((s, v) => s + v.variance, 0), r.phaseVariance);
    near(r.cumulative.at(-1).jitter, r.seconds, 1e-12, 1e-18);
    near(r.segments[0].fraction, 1);
});

test('dB/log(f) 插值对应 1/f 与 1/f² 线性谱的解析积分', () => {
    const oneOverF = PN.integrate([{ f: 1e3, db: -100 }, { f: 1e4, db: -110 }], 1e9, 1e3, 1e4);
    near(oneOverF.ssbPower, 1e-10 * 1e3 * Math.log(10));
    const oneOverF2 = PN.integrate([{ f: 1e3, db: -100 }, { f: 1e4, db: -120 }], 1e9, 1e3, 1e4);
    near(oneOverF2.ssbPower, 1e-10 * 1e3 * (1 - 1e3 / 1e4));
    near(PN.at(PN.normalize([{ f: 1e3, db: -100 }, { f: 1e4, db: -120 }]), Math.sqrt(1e7)).db, -110);
});

test('积分边界自动插值且端点浮点往返不误报，真实越界仍拒绝', () => {
    const points = [{ f: 1e3, db: -140 }, { f: 1e4, db: -130 }, { f: 1e5, db: -150 }];
    const r = PN.integrate(points, 1e8, 1500, 90000);
    assert.equal(r.segments.length, 2);
    const data = PN.normalize(points), high = Math.exp(Math.log(1e5));
    near(PN.at(data, high).db, -150);
    assert.throws(() => PN.integrate(points, 1e8, 999, 1e5), /不外推/);
    assert.throws(() => PN.integrate(points, 1e8, 1e3, 100001), /不外推/);
});

test('文本导入支持 BOM、CRLF、表头、注释、分隔符并报告原行号', () => {
    const parsed = PN.parse('\uFEFFoffset(kHz),phaseNoise(dBc/Hz)\r\n1,-140 # flat\r\n1000\t-140\r\n', 'kHz');
    assert.equal(parsed.points.length, 2); assert.equal(parsed.points[1].f, 1e6);
    assert.throws(() => PN.parse('1,-140\n2\n', 'kHz'), /第 2 行/);
    assert.throws(() => PN.parse('1,-140\n1e3x,-140\n', 'kHz'), /第 2 行/);
    assert.equal(PN.parse('1000,-140\n100,-130', 'Hz').sorted, true);
    assert.throws(() => PN.parse('1,-140\n1,-150', 'kHz'), /重复频偏/);
});

test('相噪点数、频率区间、下溢和小相位近似均有明确边界', () => {
    assert.throws(() => PN.integrate(PN.flat(), 1e6, 1e3, 1e6), /上限 < 载波/);
    assert.throws(() => PN.normalize([{ f: 1, db: -3001 }]), /数值范围/);
    assert.throws(() => PN.normalize([{ f: 1e16, db: -100 }]), /数值范围/);
    assert.throws(() => PN.normalize([]), /1～2000/);
    const large = PN.integrate([{ f: 1e3, db: 0 }, { f: 1e6, db: 0 }], 1e8, 1e3, 1e6);
    assert.match(large.warning, /小相位噪声近似/);
});

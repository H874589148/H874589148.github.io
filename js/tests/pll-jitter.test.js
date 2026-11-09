/* 运行：node --test js/tests/pll-jitter.test.js。 */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../../tools/jitter-calc/pll-core.js');
const PN = require('../../tools/jitter-calc/phase-noise.js');
const near = (actual, expected, relative = 1e-9, absolute = 0) => assert.ok(
    Math.abs(actual - expected) <= absolute + relative * Math.abs(expected), `${actual} != ${expected}`);
const abs = z => Math.hypot(z.re, z.im), scale = (z, k) => ({ re: z.re * k, im: z.im * k });
const validInput = topology => ({ topology, sources: { reference: true, vco: true, cp: true, r2: true, r3: true } });

/* 独立复数节点求解器，用于核对滤波器和跨阻噪声注入，不调用控制传函公式。 */
function solve(matrix, vector) {
    const a = matrix.map((row, i) => row.map(z => ({ ...z })).concat([{ ...vector[i] }]));
    for (let k = 0; k < a.length; k++) {
        const pivot = a[k][k];
        for (let j = k; j <= a.length; j++) a[k][j] = P.div(a[k][j], pivot);
        for (let i = 0; i < a.length; i++) if (i !== k) {
            const factor = a[i][k];
            for (let j = k; j <= a.length; j++) a[i][j] = P.sub(a[i][j], P.mul(factor, a[k][j]));
        }
    }
    return a.map(row => row.at(-1));
}
function nodal(p, f, injection) {
    const s = P.z(0, 2 * Math.PI * f), g2 = P.z(1 / p.r2), g3 = P.z(p.topology === 'B' ? 1 / p.r3 : 0);
    const c1 = P.mul(s, P.z(p.c1)), c2 = P.mul(s, P.z(p.c2)), c3 = P.mul(s, P.z(p.topology === 'B' ? p.c3 : 0));
    if (p.topology === 'A') {
        const v = solve([[P.add(c1, g2), scale(g2, -1)], [scale(g2, -1), P.add(c2, g2)]], injection.slice(0, 2).map(v => P.z(v)));
        return [v[0], v[1], v[0]];
    }
    const m = [[P.add(P.add(c1, g2), g3), scale(g2, -1), scale(g3, -1)],
        [scale(g2, -1), P.add(c2, g2), P.z(0)], [scale(g3, -1), P.z(0), P.add(c3, g3)]];
    return solve(m, injection.map(v => P.z(v)));
}

test('A/B 阻抗和 CP 跨阻与独立三节点方程一致', () => {
    for (const topology of ['A', 'B']) {
        const p = P.parameters({ topology });
        for (const f of [10, 1e3, 1e5, 1e6]) {
            const v = nodal(p, f, [1, 0, 0]);
            near(abs(v[2]), abs(P.impedance(p, f)), 1e-8);
            const r = P.response(p, f);
            near(abs(r.t), abs(r.g) / p.feedbackDivider);
            near(abs(r.reference), abs(r.g) / abs(scale(r.closed, p.referenceDivider * p.outputDivider)));
        }
    }
});

test('R2/R3 Norton 热噪声按两端节点求传函，包含 B 拓扑负载', () => {
    for (const topology of ['A', 'B']) {
        const p = P.parameters({ topology });
        for (const f of [1e3, 1e5, 1e6]) {
            const r = P.response(p, f);
            const r2v = nodal(p, f, [1, -1, 0])[2];
            const expectedR2 = P.mul(r2v, P.div(r.cp, r.z));
            near(abs(P.controlTransfer(p, f, 'r2')), abs(expectedR2), 1e-8);
            if (topology === 'A') assert.equal(abs(P.controlTransfer(p, f, 'r3')), 0);
            else {
                const r3v = nodal(p, f, [1, 0, -1])[2];
                const expectedR3 = P.mul(r3v, P.div(r.cp, r.z));
                near(abs(P.controlTransfer(p, f, 'r3')), abs(expectedR3), 1e-8);
            }
        }
    }
});

test('R/N/D 与 2π 常数、低频参考和低频 VCO 渐近口径正确', () => {
    const p = P.parameters({ referenceDivider: 2, feedbackDivider: 20, outputDivider: 4, high: 4e5 });
    near(p.pfd, 5e6); near(p.vcoFrequency, 1e8); near(p.outputFrequency, 2.5e7);
    near(p.kphi, p.icp / (2 * Math.PI)); near(p.kv, 2 * Math.PI * p.kvco);
    const low = P.response(p, 1);
    near(abs(low.reference), p.feedbackDivider / (p.referenceDivider * p.outputDivider), 1e-5);
    const high = P.response(p, 1e9);
    near(abs(high.vco), 1 / p.outputDivider, 1e-5);
});

test('Routh 稳定、临界和负系数分支不输出无效稳态 RMS', () => {
    for (const topology of ['A', 'B']) assert.equal(P.routh(P.parameters({ topology })).stable, true);
    const critical = P.parameters(); critical.icp = 0;
    assert.equal(P.routh(critical).critical, true);
    const unstable = P.parameters(); unstable.icp = -1e-3;
    assert.equal(P.routh(unstable).stable, false);
    const saved = P.analyze; assert.equal(typeof saved, 'function');
});

test('开环交越使用 T=G/N，PM/闭环带宽由响应独立复核', () => {
    for (const topology of ['A', 'B']) {
        const p = P.parameters({ topology }), sweep = P.scan(p), f = sweep.crossover.f, r = P.response(p, f);
        near(abs(r.t), 1, 1e-8);
        near(sweep.phaseMargin, 180 + sweep.crossover.phase * 180 / Math.PI, 1e-10);
        const closed = P.response(p, sweep.bandwidth);
        near(abs(closed.t) / abs(closed.closed), Math.SQRT1_2, 1e-8);
    }
});

test('默认 A/B 逐源方差合成和积分抖动数值基准', () => {
    const expected = {
        A: { fc: 113041.86658086583, pm: 65.56473872081726, bw: 151336.28811688023, jitter: 6.348342311449331e-13 },
        B: { fc: 111626.46902020136, pm: 60.07130250272448, bw: 162741.69149419933, jitter: 8.376275994892477e-13 }
    };
    for (const topology of ['A', 'B']) {
        const r = P.analyze(validInput(topology)), e = expected[topology];
        assert.equal(r.valid, true); near(r.sweep.crossover.f, e.fc, 1e-8); near(r.sweep.phaseMargin, e.pm, 1e-8);
        near(r.sweep.bandwidth, e.bw, 1e-8); near(r.seconds, e.jitter, 2e-6, 1e-18);
        near(Object.values(r.contributions).reduce((sum, v) => sum + v.variance, 0), r.phaseVariance, 1e-10);
        assert.ok(r.evaluations < P.LIMIT);
    }
});

test('相对误差自适应积分包含 df=f dln(f)，加密积分复核总方差', () => {
    const counter = { n: 0 };
    const value = P.integrateLog(f => 1 / (f * f), Math.log(10), Math.log(1000), 1e-10, counter);
    near(value, 1 / 10 - 1 / 1000, 1e-9);
    const p = P.parameters(), r = P.analyze();
    const knots = [p.low, ...p.referenceData.points.map(v => v.f).filter(f => f > p.low && f < p.high), p.high];
    let total = 0, evaluations = { n: 0 };
    for (const source of Object.keys(r.contributions)) for (let i = 1; i < knots.length; i++)
        total += P.integrateLog(f => P.spectral(p, f, source), Math.log(knots[i - 1]), Math.log(knots[i]), 1e-8, evaluations);
    near(total, r.phaseVariance, 5e-5);
    assert.equal(P.integrateLog(() => 0, 0, 1, 1e-5, { n: 0 }), 0);
});

test('PFD 积分边界、相噪覆盖和连续近似禁用传递均有防护', () => {
    assert.throws(() => P.parameters({ high: 1.01e6 }), /fPFD\/10/);
    assert.throws(() => P.parameters({ referenceNoise: [{ f: 1e3, db: -140 }, { f: 1e5, db: -150 }] }), /覆盖范围/);
    const fast = P.analyze({ icp: 1, c1: 1e-15, c2: 1e-12, r2: 1 });
    if (fast.sweep.crossover && fast.sweep.crossover.f > fast.parameters.pfd / 10) {
        assert.equal(fast.valid, false); assert.equal(fast.seconds, null);
        assert.ok(fast.warnings.some(w => /禁止传递/.test(w)));
    }
});

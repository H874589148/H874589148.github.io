'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const UI = require('../script.js');
const { reference } = require('./reference.js');
const cache = new Map();
function solve(topo, changes = {}) {
    const p = { ...E.defaults(topo), ...changes }, key = JSON.stringify(p);
    if (!cache.has(key)) cache.set(key, E.solve(p));
    return cache.get(key);
}
function ch(r, id) { const found = r.channels.find(c => c.id === id); assert.ok(found, id); return found; }
function close(actual, expected, rel = 1e-3, abs = 1e-9) {
    assert.ok(Math.abs(actual - expected) <= Math.max(abs, Math.abs(expected) * rel), `${actual} ≠ ${expected}`);
}
function balanced(r) {
    assert.ok(r.diagnostics.closure <= 1e-8);
    assert.ok(r.diagnostics.powerError <= 1e-6);
    assert.ok(r.diagnostics.balanceError <= 1e-6);
    assert.ok(r.diagnostics.refinement <= 1e-3);
    close(r.diagnostics.Pin, r.diagnostics.Pout, 1e-5);
    for (const channel of r.channels) {
        assert.ok(channel.data.every(pt => Number.isFinite(pt.v) && Number.isFinite(pt.t)));
        close(channel.data[0].t, 0); close(channel.data.at(-1).t, 1);
        for (let i = 1; i < channel.data.length; i++) assert.ok(channel.data[i].t >= channel.data[i - 1].t);
    }
    close(ch(r, 'iCout').stats.mean, 0, 0, 1e-6);
}
for (const topo of Object.keys(E.specs)) {
    test(topo + ' 默认稳态、守恒与 CSV 同源', () => {
        const r = solve(topo); balanced(r);
        const lines = E.csv(r).replace(/^\uFEFF/, '').split('\r\n').filter(line => !line.startsWith('#'));
        assert.equal(lines.length, r.channels[0].data.length + 1);
        for (const i of [0, Math.floor(r.channels[0].data.length / 3), r.channels[0].data.length - 1]) {
            const row = lines[i + 1].split(',').map(Number);
            close(row[0], r.channels[0].data[i].t * r.period, 1e-12, 1e-18);
            r.channels.forEach((c, j) => assert.equal(row[j + 1], c.data[i].v));
        }
        const copy = structuredClone(E.defaults(topo)); E.solve(copy); assert.deepEqual(copy, E.defaults(topo));
    });
}
test('Buck 的 1.5mV 基准及 C、L、fs、平均负载的物理关联', () => {
    const a = solve('buck');
    close(ch(a, 'Vout').stats.mean, 6); close(ch(a, 'iL').stats.pp, 0.6); close(ch(a, 'Vout').stats.pp, 0.0015);
    close(ch(solve('buck', { Cout: 200e-6 }), 'Vout').stats.pp, 0.00075);
    const fast = solve('buck', { fsw: 1e6 }); close(ch(fast, 'iL').stats.pp, 0.3); close(ch(fast, 'Vout').stats.pp, 0.000375);
    close(ch(solve('buck', { L: 20e-6 }), 'Vout').stats.pp, 0.00075);
    const loaded = solve('buck', { Iout: 3 }); close(ch(loaded, 'iL').stats.mean, 3); close(ch(loaded, 'Vout').stats.pp, ch(a, 'Vout').stats.pp, 1e-7);
});
test('Buck DCM 实际零流区间、9V 增益与同步反向电流', () => {
    const r = solve('buck', { Iout: 0.1 }); balanced(r); assert.equal(r.mode, 'DCM');
    close(ch(r, 'Vout').stats.mean, 9); close(ch(r, 'iL').stats.max, 0.3);
    const event = r.events.find(e => e.to === 0); close(event.t - 0.5, 1 / 6);
    const i = ch(r, 'iL'), sw = ch(r, 'Vsw'), vo = ch(r, 'Vout');
    i.data.forEach((pt, j) => { assert.ok(pt.v >= -1e-9); if (pt.t > event.t + 1e-6) { close(pt.v, 0); close(sw.data[j].v, vo.data[j].v, 1e-12); } });
    const sync = solve('buck', { Iout: 0.1, mode: 'sync' }); assert.ok(ch(sync, 'iL').stats.min < 0); close(ch(sync, 'Vout').stats.mean, 6);
    assert.match(sync.mode, /同步/); assert.ok(!sync.channels.some(c => c.id === 'iD'));
});
for (const [topo, target] of [['boost', 24], ['buckboost', -12], ['flyback', 12]]) {
    test(topo + ' CCM/DCM 不截取负电流，极性及电流源一致', () => {
        const r = solve(topo); close(ch(r, 'Vout').stats.mean, target); close(ch(r, topo === 'flyback' ? 'im' : 'iL').stats.pp, 1.2);
        const light = solve(topo, { Iout: 0.1 }); balanced(light); assert.equal(light.mode, 'DCM');
        assert.ok(ch(light, topo === 'flyback' ? 'isec' : 'iD').stats.min >= -1e-8);
        close(ch(light, topo === 'flyback' ? 'isec' : 'iD').stats.mean, 0.1, 1e-5);
        if (topo === 'buckboost') {
            assert.ok(ch(light, 'Vout').stats.max < 0);
            assert.ok(ch(light, 'Vsw').stats.min < 0);
        }
    });
}
test('Flyback 匝比、原副边映射、Lm 变化及真实退磁电流', () => {
    const r = solve('flyback', { n: 2 }); balanced(r);
    close(ch(r, 'Vout').stats.mean, 6); close(ch(r, 'im').stats.pp, 1.2); close(ch(r, 'im').stats.mean, 2, 1e-3);
    close(ch(r, 'isec').stats.mean, 2, 1e-5);
    r.channels[0].data.forEach((pt, j) => {
        const gate = ch(r, 'Q1').data[j].v, im = ch(r, 'im').data[j].v;
        close(ch(r, 'ipri').data[j].v, gate ? im : 0);
        close(ch(r, 'isec').data[j].v, gate ? 0 : 2 * im);
    });
    close(ch(solve('flyback', { n: 2, Lm: 20e-6 }), 'im').stats.pp, 0.6);
});
test('CCM/DCM 临界附近连续且保留非网格对齐事件', () => {
    for (const topo of ['buck', 'boost', 'buckboost', 'flyback']) {
        const d = 0.3731, n = topo === 'flyback' ? 2 : 1, L = 10e-6, f = 500e3;
        const ripple = (topo === 'buck' ? 12 * (1 - d) : 12) * d / (L * f);
        const critical = ripple / 2 * (topo === 'buck' ? 1 : n * (1 - d));
        const a = solve(topo, { D: d, n, Cout: 0.01, Iout: critical * 0.999 });
        const b = solve(topo, { D: d, n, Cout: 0.01, Iout: critical * 1.001 });
        assert.equal(a.mode, 'DCM'); assert.equal(b.mode, 'CCM');
        close(ch(a, 'Vout').stats.mean, ch(b, 'Vout').stats.mean, 0.003);
        assert.ok(a.events.some(e => e.t > d && e.t < 1));
    }
});
test('DSD 两相真实电流、Cf 纹波及 187.5µV 输出基准', () => {
    const r = solve('dsd');
    close(ch(r, 'Vout').stats.mean, 1.5); close(ch(r, 'Vout').stats.pp, 187.5e-6);
    for (const id of ['i1', 'i2']) { close(ch(r, id).stats.mean, 1); close(ch(r, id).stats.pp, 0.225); }
    close(ch(r, 'iSum').stats.pp, 0.15); close(ch(r, 'vCf').stats.mean, 6); close(ch(r, 'vCf').stats.pp, 0.005);
    close(ch(r, 'iCf').stats.mean, 0, 0, 1e-7);
    r.channels[0].data.forEach((pt, j) => {
        const q1 = ch(r, 'Q1').data[j].v, q3 = ch(r, 'Q3').data[j].v;
        assert.ok(!(q1 && q3)); assert.equal(q1 + ch(r, 'Q2').data[j].v, 1); assert.equal(q3 + ch(r, 'Q4').data[j].v, 1);
        close(ch(r, 'iSum').data[j].v, ch(r, 'i1').data[j].v + ch(r, 'i2').data[j].v);
    });
});
test('DSD 最大占空比、不等电感、轻载反流及大电容极限', () => {
    for (const D of [0.49, 0.5]) balanced(solve('dsd', { D }));
    assert.throws(() => solve('dsd', { D: 0.51 }), /占空比/);
    const unbalanced = solve('dsd', { L2: 20e-6 }); balanced(unbalanced);
    assert.ok(ch(unbalanced, 'i1').stats.pp > 1.9 * ch(unbalanced, 'i2').stats.pp);
    assert.ok(ch(solve('dsd', { Iout: 0.1 }), 'i1').stats.min < 0);
    const large = solve('dsd', { Cf: 0.01, Cout: 0.01 }); close(ch(large, 'Vout').stats.mean, 1.5, 1e-6);
    close(ch(solve('dsd', { Cf: 200e-6 }), 'vCf').stats.pp, 0.0025, 1e-3);
});
for (const ratio of [0.8, 1, 1.3]) {
    test('LLC fs/fr=' + ratio + '：真实幅值、整流与 Cr 电流', () => {
        const p = E.defaults('llc'), r = solve('llc', { Iout: 0.1, fsw: p.fsw * ratio }); balanced(r);
        close(ch(r, 'isec').stats.mean, 0.1, 1e-5);
        close(ch(r, 'vCr').stats.mean, 6, 1e-5);
        const ir = ch(r, 'ir'), im = ch(r, 'im'), is = ch(r, 'isec'), vc = ch(r, 'vCr'), vo = ch(r, 'Vout');
        for (let j = 1; j < ir.data.length; j++) {
            close(is.data[j].v, Math.abs(ir.data[j].v - im.data[j].v), 1e-5, 1e-7);
            const dt = (vc.data[j].t - vc.data[j - 1].t) * r.period;
            if (dt > 0) close((vc.data[j].v - vc.data[j - 1].v) * p.Cr / dt, (ir.data[j].v + ir.data[j - 1].v) / 2, 0.001, 1e-6);
            else { close(vc.data[j].v, vc.data[j - 1].v); close(vo.data[j].v, vo.data[j - 1].v); }
        }
    });
}
test('LLC 负载及全部无源/匝比参数实际参与', () => {
    const base = { Iout: 0.1, fsw: E.defaults('llc').fsw * 1.3 }, r = solve('llc', base);
    for (const key of ['Vin', 'Iout', 'fsw', 'Lr', 'Cr', 'Lm', 'n', 'Cout']) {
        const p = { ...E.defaults('llc'), ...base }, changed = solve('llc', { ...base, [key]: p[key] * 1.05 });
        const id = key === 'Cout' ? 'Vout' : key === 'Lm' ? 'im' : 'ir';
        assert.ok(Math.abs(ch(changed, id).stats.pp - ch(r, id).stats.pp) > 1e-8, key + ' 不应被忽略');
    }
    assert.throws(() => solve('llc', { fsw: 500e3, Iout: 2 }), /稳态|工作点|奇异/);
});
for (const [topo, overrides] of [['dsd', {}], ['dsd', { L2: 17e-6, Cf: 5e-6 }], ['llc', { Iout: 0.1, fsw: E.defaults('llc').fsw * 0.8 }], ['llc', { Iout: 0.1, fsw: E.defaults('llc').fsw * 1.3 }], ['llc', {}]]) {
    test(topo + ' 独立 RK4 及步长减半交叉验证 ' + JSON.stringify(overrides), () => {
        const r = solve(topo, overrides), a = reference(r.params, r.state.initial, 16384), b = reference(r.params, r.state.initial, 32768);
        const ids = topo === 'dsd' ? ['i1', 'i2', 'vCf', 'Vout'] : ['ir', 'im', 'vCr', 'Vout'];
        ids.forEach((id, i) => {
            close(a.final[i], b.final[i], 0.001, 1e-6);
            close(b.final[i], r.state.initial[i], 0.001, 1e-6);
            close(b.metrics[i].pp, ch(r, id).stats.pp, 0.001, 1e-7);
            close(b.metrics[i].mean, ch(r, id).stats.mean, 0.001, 1e-6);
        });
    });
}
test('输入拒绝、空载、隐藏字段隔离和求解预算', () => {
    for (const topo of Object.keys(E.specs)) {
        for (const key of E.specs[topo].fields) for (const value of [0, -1, NaN, Infinity, undefined, '2']) {
            assert.throws(() => E.solve({ ...E.defaults(topo), [key]: value }), Error);
        }
        assert.throws(() => E.solve(E.defaults(topo), { maxEvaluations: 1 }), e => e.code === 'BUDGET');
    }
    assert.throws(() => solve('buck', { Iout: 0 }), /空载/);
    const invalidHidden = { ...E.defaults('buck'), Lr: NaN, Cr: -1 }; assert.deepEqual(E.validate(invalidHidden), E.defaults('buck'));
    assert.throws(() => E.solve({ ...E.defaults('llc'), Cr: Number.MIN_VALUE }), /范围|溢出|精度/);
    for (const key of ['Cout', 'Cf']) {
        try { const r = solve('dsd', { [key]: 1e-12 }); balanced(r); }
        catch (err) { assert.ok(['BUDGET', 'PRECISION', 'POLARITY', 'SINGULAR', 'EVENT'].includes(err.code), err.code); }
    }
});
/* 参数依赖矩阵：指标使用幅值比较；非 D 参数不改变逻辑驱动占比。
 * Buck CCM 中 Iout/L/Cout/fsw 不改变平均输出；其余有限电容模型不强求理想闭式增益完全不变。
 * LLC 的负载、谐振元件和匝比耦合影响 ir，Lm 影响 im；Cout 直接影响输出纹波。 */
const matrix = {
    buck: { Vin: ['Vout', 'mean', 1], Iout: ['iL', 'mean', 1], fsw: ['iL', 'pp', -1], D: ['Vout', 'mean', 1], L: ['iL', 'pp', -1], Cout: ['Vout', 'pp', -1] },
    boost: { Vin: ['Vout', 'mean', 1], Iout: ['iL', 'mean', 1], fsw: ['iL', 'pp', -1], D: ['Vout', 'mean', 1], L: ['iL', 'pp', -1], Cout: ['Vout', 'pp', -1] },
    buckboost: { Vin: ['Vout', 'mean', 1], Iout: ['iL', 'mean', 1], fsw: ['iL', 'pp', -1], D: ['Vout', 'mean', 1], L: ['iL', 'pp', -1], Cout: ['Vout', 'pp', -1] },
    flyback: { Vin: ['Vout', 'mean', 1], Iout: ['im', 'mean', 1], fsw: ['im', 'pp', -1], D: ['Vout', 'mean', 1], Lm: ['im', 'pp', -1], n: ['Vout', 'mean', -1], Cout: ['Vout', 'pp', -1] },
    dsd: { Vin: ['Vout', 'mean', 1], Iout: ['iSum', 'mean', 1], fsw: ['i1', 'pp', -1], D: ['Vout', 'mean', 1], L1: ['i1', 'pp', -1], L2: ['i2', 'pp', -1], Cf: ['vCf', 'pp', -1], Cout: ['Vout', 'pp', -1] },
    llc: { Vin: ['ir', 'pp'], Iout: ['ir', 'pp'], fsw: ['ir', 'pp'], Lr: ['ir', 'pp'], Cr: ['ir', 'pp'], Lm: ['im', 'pp'], n: ['ir', 'pp'], Cout: ['Vout', 'pp'] }
};
for (const [topo, relations] of Object.entries(matrix)) test(topo + ' 完整参数依赖矩阵与不变项', () => {
    assert.deepEqual(Object.keys(relations).sort(), E.specs[topo].fields.slice().sort());
    const overrides = topo === 'llc' ? { Iout: 0.1, fsw: E.defaults(topo).fsw * 1.3 } : {}, base = solve(topo, overrides);
    for (const [key, [id, metric, direction]] of Object.entries(relations)) {
        const changed = solve(topo, { ...overrides, [key]: base.params[key] * 1.05 }); balanced(changed);
        const diff = Math.abs(ch(changed, id).stats[metric]) - Math.abs(ch(base, id).stats[metric]);
        assert.ok(direction ? direction * diff > 1e-8 : Math.abs(diff) > 1e-8, key + '→' + id + '.' + metric);
        if (key !== 'D') close(ch(changed, 'Q1').stats.mean, ch(base, 'Q1').stats.mean, 1e-10);
        if (topo === 'buck' && ['Iout', 'L', 'Cout', 'fsw'].includes(key)) close(ch(changed, 'Vout').stats.mean, ch(base, 'Vout').stats.mean, 1e-9);
    }
});
for (const topo of Object.keys(E.specs)) test(topo + ' 逐段 KVL/KCL 与二极管约束', () => {
    for (const Iout of [0.1, 2]) {
        const r = solve(topo, { Iout }), p = r.params, ids = Object.fromEntries(r.channels.map(c => [c.id, c]));
        const points = r.channels[0].data.length;
        function at(id, j) { return ids[id].data[j].v; }
        function average(id, j) { return (at(id, j - 1) + at(id, j)) / 2; }
        for (let j = 1; j < points; j++) {
            const dt = (r.channels[0].data[j].t - r.channels[0].data[j - 1].t) * r.period;
            if (dt <= r.period * 1e-9) continue;
            const rate = id => (at(id, j) - at(id, j - 1)) / dt, avg = id => average(id, j), g = at('Q1', j);
            const eq = (left, right) => close(left, right, 2e-4, 2e-6);
            eq(p.Cout * rate('Vout'), avg('iCout'));
            if (topo === 'dsd') {
                eq(p.L1 * rate('i1'), avg('vA') - avg('Vout')); eq(p.L2 * rate('i2'), avg('vB') - avg('Vout'));
                eq(p.Cf * rate('vCf'), avg('iCf')); eq(avg('iCout') + p.Iout, avg('i1') + avg('i2'));
            } else if (topo === 'llc') {
                eq(p.Lr * rate('ir'), avg('vHB') - avg('vCr') - avg('vp')); eq(p.Lm * rate('im'), avg('vp'));
                eq(p.Cr * rate('vCr'), avg('ir')); eq(avg('iCout') + p.Iout, avg('isec'));
                eq(at('isec', j), p.n * Math.abs(at('ir', j) - at('im', j)));
                assert.ok(Math.abs(at('vp', j)) <= p.n * at('Vout', j) + 2e-6);
            } else if (topo === 'buck') {
                eq(p.L * rate('iL'), avg('Vsw') - avg('Vout')); eq(avg('iCout') + p.Iout, avg('iL'));
            } else {
                const transfer = topo === 'flyback' ? 'isec' : 'iD', i = topo === 'flyback' ? 'im' : 'iL';
                const flowing = Math.abs(avg(transfer)) > 1e-9;
                const offV = topo === 'boost' ? p.Vin - avg('Vout') : topo === 'buckboost' ? avg('Vout') : -p.n * avg('Vout');
                eq((p.L || p.Lm) * rate(i), g ? p.Vin : flowing ? offV : 0);
                eq((topo === 'buckboost' ? -1 : 1) * avg('iCout') + p.Iout, avg(transfer));
                if (topo === 'flyback') {
                    eq(at('ipri', j), g ? at(i, j) : 0); eq(at('isec', j), !g && flowing ? p.n * at(i, j) : 0);
                    eq(at('VDS', j), g ? 0 : flowing ? p.Vin + p.n * at('Vout', j) : p.Vin);
                }
            }
        }
    }
});
test('计算时限、极端占空比和明显大纹波失败保护', () => {
    for (const topo of Object.keys(E.specs)) assert.throws(() => E.solve(E.defaults(topo), { timeoutMs: -1 }), e => e.code === 'BUDGET');
    for (const topo of ['buck', 'boost', 'buckboost', 'flyback', 'dsd']) {
        for (const D of [0.01, topo === 'dsd' ? 0.5 : 0.99]) {
            try { balanced(solve(topo, { D })); }
            catch (err) { assert.ok(['BUDGET', 'PRECISION', 'POLARITY', 'SINGULAR', 'CONVERGENCE', 'CONSTRAINT', 'EVENT'].includes(err.code), err.message); }
        }
    }
    for (const ratio of [0.8, 1.3]) {
        try { balanced(solve('llc', { fsw: E.defaults('llc').fsw * ratio, Iout: 2 })); }
        catch (err) { assert.ok(['BUDGET', 'PRECISION', 'POLARITY', 'SINGULAR', 'CONVERGENCE', 'MULTIPLE'].includes(err.code), err.message); }
    }
});
test('统计不是固定幅值归一化，真实时间光标与毫伏显示', () => {
    const r = solve('buck'); assert.match(UI.format(ch(r, 'Vout').stats.pp, 'V'), /mV/);
    close(UI.sample(ch(r, 'iL').data, 0.5), 2.3, 1e-3);
    const square = [{ t: 0, v: 0 }, { t: 0.5, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 1 }];
    assert.equal(UI.sample(square, 0.5), 1); close(E.stats(square).mean, 0.5); close(E.stats(square).rms, Math.sqrt(0.5));
});

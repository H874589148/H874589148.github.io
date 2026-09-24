/* 加载真实 Razavi 符号和渲染器，核验器件端口网络；不代替浏览器目视验收。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const G = require('../../../js/circuit-connectivity.js');
const context = {}; context.window = context; vm.createContext(context);
for (const file of ['razavi/razavi-symbols.js', 'razavi/render.js', 'tools/power-electronics/topologies.js']) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8'), context);
}
const R = context.Razavi, F = context.PEFigures;
function check(topo, mode, groups) {
    const doc = F.build(topo, mode), graph = G.build(doc, R.portsWorld);
    const groundNets = new Set(doc.items.filter(c => c.type === 'ground').map(c => graph.netOf(c.id, R.portsWorld(c)[0].n)));
    const isolated = ['flyback', 'llc'].includes(topo);
    function net(pin) {
        const [id, name] = pin.split('.'), n = graph.netOf(id, name);
        assert.notEqual(n, -1, pin + ' 不存在');
        return !isolated && groundNets.has(n) ? 'GND' : n;
    }
    const seen = new Set();
    for (const group of groups) {
        const n = net(group[0]); assert.ok(!seen.has(n), group.join('、') + ' 与其他节点短接'); seen.add(n);
        group.forEach(pin => assert.equal(net(pin), n, pin + ' 连接错误'));
    }
    for (const part of doc.items.filter(c => c.kind === 'comp' && !['ground', 'dot'].includes(c.type))) {
        assert.ok(R.portsWorld(part).length >= 2);
        R.portsWorld(part).forEach(pin => assert.ok(groups.some(g => g.includes(part.id + '.' + pin.n)), part.id + '.' + pin.n + ' 未覆盖'));
    }
    const svg = F.render(topo, mode);
    assert.match(svg, /^<svg/); assert.ok(!/NaN|undefined/.test(svg)); assert.match(svg, /var\(--color-text\)/);
    return { doc, graph };
}
const output = (invert = false) => ['Cout.1', 'Iout.' + (invert ? '-' : '+')];
const ground = (invert = false) => ['Vin.-', 'Cout.2', 'Iout.' + (invert ? '+' : '-')];
test('Buck 二极管、同步续流及负载极性', () => {
    for (const mode of ['auto', 'sync']) check('buck', mode, [
        ['Vin.+', 'Q1.1'], ['Q1.2', 'L.1', 'return.' + (mode === 'sync' ? '1' : 'K')],
        ['L.2', ...output()], [...ground(), 'return.' + (mode === 'sync' ? '2' : 'A')]
    ]);
});
test('Boost 开关、升压二极管及节点', () => check('boost', 'auto', [
    ['Vin.+', 'L.1'], ['L.2', 'Q1.1', 'D.A'], ['D.K', ...output()], ['Q1.2', ...ground()]
]));
test('反相 Buck-Boost 电感方向、二极管和负负载电流', () => check('buckboost', 'auto', [
    ['Vin.+', 'Q1.1'], ['Q1.2', 'L.1', 'D.K'], ['D.A', ...output(true)], ['L.2', ...ground(true)]
]));
test('DSD 四开关两电感、X−A 飞跨电容和公共输出', () => check('dsd', 'auto', [
    ['Vin.+', 'Q1.1'], ['Q1.2', 'Cf.1', 'Q3.1'], ['Cf.2', 'Q2.1', 'L1.1'], ['Q3.2', 'Q4.1', 'L2.1'],
    ['L1.2', 'L2.2', ...output()], ['Q2.2', 'Q4.2', ...ground()]
]));
test('Flyback 并联 Lm、低侧开关及原副边隔离', () => check('flyback', 'auto', [
    ['Vin.+', 'Lm.1', 'T.P1'], ['Lm.2', 'T.P2', 'Q1.1'], ['Q1.2', 'Vin.-'],
    ['T.S1', 'D.A'], ['D.K', ...output()], ['T.S2', 'Cout.2', 'Iout.-']
]));
test('LLC 半桥、串联谐振、并联励磁和四二极管整流，不误接交叉线', () => check('llc', 'auto', [
    ['Vin.+', 'Q1.1'], ['Q1.2', 'Q2.1', 'Lr.1'], ['Lr.2', 'Cr.1'], ['Cr.2', 'Lm.1', 'T.P1'],
    ['Vin.-', 'Q2.2', 'Lm.2', 'T.P2'], ['T.S1', 'D1.A', 'D3.K'], ['T.S2', 'D2.A', 'D4.K'],
    ['D1.K', 'D2.K', ...output()], ['D3.A', 'D4.A', 'Cout.2', 'Iout.-']
]));

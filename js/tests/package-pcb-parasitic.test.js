/* 运行：node --test js/tests/package-pcb-parasitic.test.js。DOM 替身不替代独立浏览器验收。 */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const C = require('../../tools/package-pcb-parasitic/parasitic-core.js');
const UI = require('../../tools/package-pcb-parasitic/script.js');
const { environment } = require('./handoff-harness.js');
const root = path.resolve(__dirname, '../..'), code = file => fs.readFileSync(path.join(root, file), 'utf8');
const near = (actual, expected, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * tolerance, `${actual} != ${expected}`);
const clone = value => JSON.parse(JSON.stringify(value));
const pcbInput = () => ({ length: .01, width: .0002, thickness: 35e-6, height: .0002, er: 4.3, frequency: 1e8 });

test('键合线默认组独立数值基准', () => {
    const result = C.bond({ length: .002, diameter: 25e-6 });
    near(result.resistance, 0.09778479703566051);
    near(result.inductance, 2.0073283983175087e-9);
    near(result.ratio, 80);
});

test('PCB 默认组阻抗、分布电感与趋肤电阻基准', () => {
    const result = C.pcb(pcbInput());
    near(result.impedance, 66.03525216633928);
    near(result.effectivePermittivity, 2.7125);
    near(result.inductancePerMeter, 3.6277722222966124e-7);
    near(result.inductance, 3.6277722222966125e-9);
    near(result.dcResistance, 0.02457142857142857);
    near(result.acResistance, 0.05874284280151221);
    near(result.skinDepth, 0.000006600614287034597);
    assert.equal(result.skinMode, 'skin');
});

test('趋肤分支连续、低频回到直流且频率升高电阻不减', () => {
    const input = pcbInput(), delta = input.thickness / 2;
    const boundary = C.RHO_COPPER / (Math.PI * delta * delta * C.MU0);
    input.frequency = 1;
    assert.equal(C.pcb(input).acResistance, C.pcb(input).dcResistance);
    input.frequency = boundary;
    assert.equal(C.pcb(input).acResistance, C.pcb(input).dcResistance);
    input.frequency = boundary * 1.000001;
    near(C.pcb(input).acResistance, C.pcb(input).dcResistance, 2e-6);
    let previous = 0;
    for (const f of [1, 1e4, 1e6, 1e8, 1e9, 1e10]) {
        input.frequency = f;
        const result = C.pcb(input);
        assert.ok(result.acResistance >= result.dcResistance && result.acResistance >= previous);
        previous = result.acResistance;
    }
});

test('几何尺寸和单位缩放保持物理口径', () => {
    const b = C.bond({ length: .002, diameter: 25e-6 });
    near(C.bond({ length: .004, diameter: 25e-6 }).resistance, b.resistance * 2);
    near(C.bond({ length: .002, diameter: 50e-6 }).resistance, b.resistance / 4);
    const p = C.pcb(pcbInput());
    const changed = pcbInput(); changed.width *= 2; changed.thickness *= 2;
    near(C.pcb(changed).dcResistance, p.dcResistance / 4);
    assert.equal(C.UNITS.mil, 25.4e-6);
    assert.equal(C.UNITS.oz, 35e-6);
});

test('单位切换保持数值，非法输入不部分修改状态', () => {
    const state = C.defaults(), original = clone(state);
    C.changeUnit(state, 'bond', 'diameter', 'mil');
    near(C.readGroup(state, 'bond').diameter, 25e-6);
    near(Number(state.bond.diameter), 25 / 25.4);
    C.changeUnit(state, 'pcb', 'length', 'cm');
    near(C.readGroup(state, 'pcb').length, .01);
    C.changeUnit(state, 'pcb', 'thickness', 'oz');
    near(C.readGroup(state, 'pcb').thickness, 35e-6);
    state.pcb.length = 'bad';
    const before = clone(state);
    assert.throws(() => C.changeUnit(state, 'pcb', 'length', 'mm'), /格式无效/);
    assert.deepEqual(state, before);
    assert.ok(original.bond.diameterUnit !== state.bond.diameterUnit);
});

test('严格拒绝非法几何、介电常数及超出公式定义域的输入', () => {
    for (const value of ['', ' ', '1A', 'NaN', 'Infinity', '1e309', '0x10', '1.2.3']) assert.throws(() => C.number(value, 1, '测试'));
    assert.throws(() => C.bond({ length: 0, diameter: 25e-6 }), /大于 0/);
    assert.throws(() => C.bond({ length: 1e-6, diameter: 25e-6 }), /有效范围/);
    assert.throws(() => C.pcb({ ...pcbInput(), er: .9 }), /不能小于 1/);
    assert.throws(() => C.pcb({ ...pcbInput(), height: 1e-6 }), /公式无效/);
    assert.throws(() => C.pcb({ ...pcbInput(), frequency: 0 }), /大于 0/);
});

test('版本化存档逐字段回落且不继承非法标签', () => {
    const state = C.defaults();
    state.tab = 'pcb'; state.bond.length = '-1'; state.bond.diameter = '30'; state.pcb.thickness = '2'; state.pcb.thicknessUnit = 'oz';
    const restored = C.restore(JSON.stringify(state));
    assert.equal(restored.tab, 'pcb'); assert.equal(restored.bond.length, '2'); assert.equal(restored.bond.diameter, '30');
    assert.equal(restored.pcb.thickness, '2'); assert.equal(restored.pcb.thicknessUnit, 'oz');
    assert.deepEqual(C.restore('{broken'), C.defaults());
    assert.deepEqual(C.restore(JSON.stringify({ version: 99, tab: 'pcb' })), C.defaults());
});

test('所有示例均调用核心计算，预设应用保持 SI 数值', () => {
    assert.ok(C.bondExamples().length >= 6 && C.pcbExamples().length >= 6);
    for (const example of C.bondExamples()) {
        assert.deepEqual(example.result, C.bond(example.input));
        const values = C.readGroup({ bond: UI.presetState('bond', example.input) }, 'bond');
        near(values.length, example.input.length); near(values.diameter, example.input.diameter);
    }
    for (const example of C.pcbExamples()) {
        assert.deepEqual(example.result, C.pcb(example.input));
        const values = C.readGroup({ pcb: UI.presetState('pcb', example.input) }, 'pcb');
        for (const key of Object.keys(example.input)) near(values[key], example.input[key], 1e-12);
    }
});

const outputIds = ['ppStorageStatus', 'bondTab', 'pcbTab', 'bondPanel', 'pcbPanel', 'bondFields', 'pcbFields', 'bondExamples', 'pcbExamples', 'bondReset', 'pcbReset', 'bondError', 'pcbError',
    'bond-resistance', 'bond-inductance', 'bond-ratio', 'pcb-dcResistance', 'pcb-acResistance', 'pcb-inductancePerMeter', 'pcb-inductance', 'pcb-impedance', 'pcb-effectivePermittivity', 'pcb-skinDepth', 'pcb-skinMode'];
function mount(setup) {
    const h = environment(); outputIds.forEach(h.get);
    if (setup) setup(h);
    h.s.ParasiticCore = C; h.run('tools/package-pcb-parasitic/script.js');
    return h;
}
function field(h, group, key, unit) {
    const index = Object.keys(C.FIELDS[group]).indexOf(key), box = h.get(group + 'Fields').children[index];
    return box.children[1].children[unit ? 1 : 0];
}

test('真实页面脚本实时计算、错误清空结果且存档保留最后有效值', () => {
    const h = mount(), input = field(h, 'bond', 'diameter');
    assert.match(h.get('bond-resistance').textContent, /mΩ/);
    assert.match(h.get('bond-inductance').textContent, /nH/);
    const savedBefore = h.s.localStorage.getItem('ee-package-pcb-parasitic');
    input.value = '0'; input.fire('input');
    assert.equal(h.get('bond-resistance').textContent, '—');
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.match(h.get('bondError').textContent, /没有有效结果/);
    assert.equal(h.s.localStorage.getItem('ee-package-pcb-parasitic'), savedBefore);
    input.value = '50'; input.fire('input');
    assert.notEqual(h.get('bond-resistance').textContent, '—');
    assert.equal(JSON.parse(h.s.localStorage.getItem('ee-package-pcb-parasitic')).bond.diameter, '50');
});

test('标签键盘、单位换算、示例应用与重置均操作实际控件', () => {
    const h = mount();
    h.get('bondTab').fire('keydown', { key: 'ArrowRight' });
    assert.equal(h.get('pcbPanel').hidden, false); assert.equal(h.get('bondPanel').hidden, true);
    assert.equal(h.get('pcbTab').getAttribute('aria-selected'), 'true');
    h.get('pcbTab').fire('keydown', { key: 'Home' });
    assert.equal(h.get('bondPanel').hidden, false);
    const unit = field(h, 'bond', 'diameter', true); unit.value = 'mil'; unit.fire('change');
    near(Number(field(h, 'bond', 'diameter').value), 25 / 25.4);
    const firstPreset = h.get('bondExamples').children[0], button = firstPreset.children.at(-1).children[0];
    button.click();
    assert.equal(field(h, 'bond', 'length').value, '1'); assert.equal(field(h, 'bond', 'diameter').value, '20');
    h.get('bondReset').click();
    assert.equal(field(h, 'bond', 'length').value, '2'); assert.equal(field(h, 'bond', 'diameter').value, '25');
    assert.equal(h.get('bondExamples').children.length, C.bondExamples().length);
    assert.equal(h.get('pcbExamples').children.length, C.pcbExamples().length);
});

test('存储读写失败不阻断计算并给出真实提示', () => {
    const read = mount(h => { h.s.localStorage.failRead = true; });
    assert.notEqual(read.get('bond-resistance').textContent, '—');
    const write = mount(h => { h.s.localStorage.failWrite = true; });
    assert.match(write.get('ppStorageStatus').textContent, /存储不可用/);
    assert.notEqual(write.get('pcb-dcResistance').textContent, '—');
});

test('首页、图标、页面资源与公式静态集成完整', () => {
    const home = code('index.html'), common = code('js/common.js'), html = code('tools/package-pcb-parasitic/index.html');
    assert.match(home, /tools\/package-pcb-parasitic\/index\.html/);
    assert.match(home, /'icon-parasitic': 'parasitic'/);
    assert.match(home, /'tools\/package-pcb-parasitic\/':[^\n]+键合线/);
    assert.match(common, /parasitic: '<svg/);
    assert.match(html, /parasitic-core\.js/); assert.match(html, /\.\.\/\.\.\/js\/common\.js/);
    assert.match(html, /R_\{dc\}|R_\{dc\}/); assert.match(html, /IPC-2141A/);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    outputIds.forEach(id => assert.ok(ids.includes(id), `缺少 ${id}`));
});

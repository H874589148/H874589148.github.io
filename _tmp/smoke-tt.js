/* t6 冒烟测试：truth-table 模块 engine.js + canvas-netlist.js
   运行：node _tmp/smoke-tt.js  （exit 0 = 全部通过） */
'use strict';
const fs = require('fs');
const ROOT = 'F:/GitHub/H874589148.github.io';

const engine = require(ROOT + '/tools/truth-table/engine.js');
const netlist = require(ROOT + '/tools/truth-table/canvas-netlist.js');

/* 真实 Razavi.ports：bundle + render.js 在同一 window 沙箱中加载（含新增 tt-* AUX 符号） */
const bundleSrc = fs.readFileSync(ROOT + '/razavi/razavi-symbols.js', 'utf8');
const renderSrc = fs.readFileSync(ROOT + '/razavi/render.js', 'utf8');
const win = {};
new Function('window', bundleSrc +
    ';window.RAZAVI_CATEGORIES=RAZAVI_CATEGORIES;window.RAZAVI_CATALOG=RAZAVI_CATALOG;window.RAZAVI_SYMBOLS=RAZAVI_SYMBOLS;' +
    renderSrc)(win);
const Razavi = win.Razavi;
const portsOf = (t, v) => Razavi.ports(t, v);

const { maskToBits, bitAt } = engine;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('PASS', name); }
    else { fail++; console.log('FAIL', name, extra == null ? '' : extra); }
}
function throwsWith(name, fn, keyword) {
    try { fn(); fail++; console.log('FAIL', name, '未抛错'); }
    catch (e) { ok(name, e.message.indexOf(keyword) >= 0, e.message); }
}
function evalText(src) { return engine.evaluateIR(engine.buildIRFromText(src)); }
function outBits(res, name) {
    const i = res.ir.outputs.findIndex(o => o.name === name);
    const bits = maskToBits(res.outMasks[i]);
    const arr = [];
    for (let r = 0; r < res.R; r++) arr.push(bitAt(bits, r));
    return arr.join('');
}
function inBit(res, name, r) {
    return bitAt(maskToBits(res.env.get(name)), r);
}

/* ================= engine.js ================= */

/* 1. 多数表决器 */
{
    const res = evalText(engine.TEXT_EXAMPLES.majority);
    let good = res.n === 3 && res.R === 8;
    for (let r = 0; r < 8; r++) {
        const a = inBit(res, 'a', r), b = inBit(res, 'b', r), c = inBit(res, 'c', r);
        const expect = (a & b) | (a & c) | (b & c);
        if (outBits(res, 'maj')[r] !== String(expect)) good = false;
    }
    ok('engine: 多数表决器 8 行', good, outBits(res, 'maj'));
}

/* 2. 全加器（多输出 + 显式 output 声明） */
{
    const res = evalText(engine.TEXT_EXAMPLES.adder);
    let good = res.ir.outputs.length === 2;
    for (let r = 0; r < 8; r++) {
        const a = inBit(res, 'a', r), b = inBit(res, 'b', r), ci = inBit(res, 'cin', r);
        const s = a ^ b ^ ci, co = (a & b) | ((a ^ b) & ci);
        if (outBits(res, 'sum')[r] !== String(s) || outBits(res, 'carry')[r] !== String(co)) good = false;
    }
    ok('engine: 全加器 sum/carry 8 行', good);
}

/* 3. 常量电路（无输入，1 行） */
{
    const res = evalText(engine.TEXT_EXAMPLES.constant);
    ok('engine: 常量电路 R=1 且输出恒 1', res.n === 0 && res.R === 1 && outBits(res, 'y') === '1');
}

/* 4. 2 选 1 选择器文本示例 */
{
    const res = evalText(engine.TEXT_EXAMPLES.mux);
    let good = true;
    for (let r = 0; r < 8; r++) {
        const a = inBit(res, 'a', r), b = inBit(res, 'b', r), s = inBit(res, 's', r);
        if (outBits(res, 'y')[r] !== String(s ? a : b)) good = false;
    }
    ok('engine: mux 文本示例 8 行', good);
}

/* 5. 门函数与运算符别名 */
{
    const res = evalText('input a, b\ny1 = nand(a, b)\ny2 = nor(a, b)\ny3 = xor(a, b)\ny4 = xnor(a, b)\ny5 = not(a)\ny6 = buf(b)\ny7 = a * b + 1\ny8 = ~(a && b) ^ b');
    const expect = {
        y1: '1110', y2: '1000', y3: '0110', y4: '1001',
        y5: '1010', y6: '0011', y7: '1111', y8: '1101'
    };
    /* 行序：r 的 bit0=a、bit1=b；各 y 均未被引用故全部为输出 */
    let good = true;
    ['y1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7', 'y8'].forEach(nm => {
        const got = outBits(res, nm);
        if (got !== expect[nm]) { good = false; console.log('  mismatch', nm, got, expect[nm]); }
    });
    ok('engine: 门函数 nand/nor/xor/xnor/not/buf 与别名 * + &&', good);
}

/* 6. 循环依赖报错 */
throwsWith('engine: 循环依赖报错', () => evalText('a = b\nb = a'), '循环依赖');

/* 7. 语法错误报行号 */
throwsWith('engine: 非法字符报行号', () => evalText('input a\ny = a & @'), '第 2 行');

/* 8. 超过 20 输入报错 */
{
    const inputs = [];
    for (let i = 0; i < 21; i++) inputs.push('x' + i);
    throwsWith('engine: 21 输入超出上限', () => engine.evaluateIR({ inputs, signals: [], outputs: [{ name: 'y', ref: 'x0' }] }), '上限');
}

/* ================= canvas-netlist.js ================= */

function comp(id, type, x, y, text, extra) {
    const c = { kind: 'comp', id, type, x, y, rot: 0, fh: false, fv: false, text: text || '', stroke: '#1a1a1a', sw: 1.5, dash: '' };
    return extra ? Object.assign(c, extra) : c;
}
function wire(id, pts) { return { kind: 'wire', id, pts, stroke: '#1a1a1a', sw: 1.5, dash: '' }; }

/* 9. script.js 中真实 EXAMPLE_DOC → IR → 真值表 */
{
    const src = fs.readFileSync(ROOT + '/tools/truth-table/script.js', 'utf8');
    const m = src.match(/var EXAMPLE_DOC = (\(function \(\) \{[\s\S]*?\}\)\(\));/);
    if (!m) { ok('netlist: EXAMPLE_DOC 提取', false, '正则未匹配'); }
    else {
        const exDoc = eval(m[1]);
        const ir = netlist.buildIRFromDoc(exDoc, portsOf);
        const res = engine.evaluateIR(ir);
        let good = res.n === 3 && res.R === 8;
        const names = ir.inputs.join(',');
        for (let r = 0; r < 8; r++) {
            const a = inBit(res, 'a', r), b = inBit(res, 'b', r), s = inBit(res, 's', r);
            const expect = (a & s) | (b & (s ^ 1));
            if (outBits(res, 'y')[r] !== String(expect)) good = false;
        }
        ok('netlist: EXAMPLE_DOC 2 选 1 选择器 8 行', good, 'inputs=' + names + ' signals=' + ir.signals.map(g => g.name + ':' + g.op).join(' '));
        ok('netlist: EXAMPLE_DOC 输入顺序 a,b,s', names === 'a,b,s', names);
    }
}

/* 10. 门输入悬空（无驱动网络）报错 */
{
    const doc = { groups: [], items: [
        comp('i1', 'tt-in', 100, 100, 'a'),
        comp('i2', 'and-gate', 200, 100),
        comp('i3', 'tt-out', 300, 100, 'y'),
        wire('w1', [{ x: 132, y: 100 }, { x: 170, y: 90 }]),          // a → and.A
        wire('w2', [{ x: 230, y: 100 }, { x: 268, y: 100 }])           // and.Y → y（and.B 悬空）
    ] };
    throwsWith('netlist: 门输入悬空报错', () => netlist.buildIRFromDoc(doc, portsOf), '没有任何驱动');
}

/* 11. 多驱动冲突报错 */
{
    const doc = { groups: [], items: [
        comp('i1', 'tt-in', 100, 100, 'a'),
        comp('i2', 'tt-in', 100, 200, 'b'),
        comp('i3', 'tt-out', 300, 150, 'y'),
        wire('w1', [{ x: 132, y: 100 }, { x: 268, y: 100 }, { x: 268, y: 150 }]),
        wire('w2', [{ x: 132, y: 200 }, { x: 268, y: 200 }, { x: 268, y: 150 }])
    ] };
    throwsWith('netlist: 多驱动冲突报错', () => netlist.buildIRFromDoc(doc, portsOf), '多个驱动者');
}

/* 12. 时序器件明确报错 */
{
    const doc = { groups: [], items: [comp('i1', 'd-flip-flop', 100, 100), comp('i2', 'tt-in', 60, 100, 'a'), comp('i3', 'tt-out', 200, 100, 'y')] };
    throwsWith('netlist: 时序器件报错', () => netlist.buildIRFromDoc(doc, portsOf), '时序');
}

/* 13/14. 缺输入 / 缺输出报错 */
throwsWith('netlist: 缺逻辑输入报错', () => netlist.buildIRFromDoc({ groups: [], items: [comp('i1', 'tt-out', 300, 100, 'y')] }, portsOf), '逻辑输入');
throwsWith('netlist: 缺逻辑输出报错', () => netlist.buildIRFromDoc({ groups: [], items: [comp('i1', 'tt-in', 100, 100, 'a')] }, portsOf), '逻辑输出');

/* 15/16. IO 名称非法 / 重复报错 */
{
    const badName = { groups: [], items: [
        comp('i1', 'tt-in', 100, 100, '1abc'), comp('i2', 'tt-out', 300, 100, 'y'),
        wire('w1', [{ x: 132, y: 100 }, { x: 268, y: 100 }])
    ] };
    throwsWith('netlist: IO 名称非法报错', () => netlist.buildIRFromDoc(badName, portsOf), '不合法');
    const dup = { groups: [], items: [
        comp('i1', 'tt-in', 100, 100, 'a'), comp('i2', 'tt-in', 100, 200, 'a'), comp('i3', 'tt-out', 300, 100, 'y'),
        wire('w1', [{ x: 132, y: 100 }, { x: 268, y: 100 }])
    ] };
    throwsWith('netlist: IO 名称重复报错', () => netlist.buildIRFromDoc(dup, portsOf), '重复');
}

/* 17. T 接：引脚落在导线线段内部 → 连接 */
{
    const doc = { groups: [], items: [
        comp('i1', 'tt-in', 100, 100, 'a'),                                  // out (132,100)
        comp('i2', 'and-gate', 162, 160),                                    // A(132,150) B(132,170) Y(192,160)
        comp('i3', 'tt-out', 224, 160, 'y'),                                 // in (192,160)
        wire('w1', [{ x: 132, y: 100 }, { x: 132, y: 200 }])                 // 纵线，A/B 引脚均 T 接
    ] };
    const res = engine.evaluateIR(netlist.buildIRFromDoc(doc, portsOf));
    ok('netlist: T 接连通（y = a&a）', outBits(res, 'y') === '01', outBits(res, 'y'));
}

/* 18. 十字交叉无 dot → 不连接（缓冲门输入无驱动报错） */
{
    const mk = withDot => {
        const items = [
            comp('i1', 'tt-in', 100, 100, 'a'),                              // out (132,100)
            comp('i2', 'buffer', 200, 200),                                  // A(170,200) Y(220,200)
            comp('i3', 'tt-out', 252, 200, 'y'),                             // in (220,200)
            wire('w1', [{ x: 132, y: 100 }, { x: 200, y: 100 }]),            // 横线（ dangling 端）
            wire('w2', [{ x: 170, y: 50 }, { x: 170, y: 200 }])              // 纵线 → buffer.A，交于 (170,100)
        ];
        if (withDot) items.push(comp('i4', 'dot', 170, 100));
        return { groups: [], items };
    };
    throwsWith('netlist: 交叉无 dot 不连接', () => netlist.buildIRFromDoc(mk(false), portsOf), '没有任何驱动');
    /* 19. 加 dot 后连通：y = buf(a) = a */
    const res = engine.evaluateIR(netlist.buildIRFromDoc(mk(true), portsOf));
    ok('netlist: 交叉有 dot 连接（y = a）', outBits(res, 'y') === '01', outBits(res, 'y'));
}

/* 20. 常量驱动 + 自动命名（空 text 的 tt-in → a，tt-out → y） */
{
    const doc = { groups: [], items: [
        comp('i1', 'tt-in', 100, 100),                                       // 自动命名 a
        comp('i2', 'tt-const1', 100, 200),                                   // const 1, out (118,200)
        comp('i3', 'or-gate', 200, 100),                                     // A(170,90) B(170,110) Y(230,100)
        comp('i4', 'tt-out', 300, 100),                                      // 自动命名 y, in (268,100)
        wire('w1', [{ x: 132, y: 100 }, { x: 132, y: 90 }, { x: 170, y: 90 }]),
        wire('w2', [{ x: 118, y: 200 }, { x: 150, y: 200 }, { x: 150, y: 110 }, { x: 170, y: 110 }]),
        wire('w3', [{ x: 230, y: 100 }, { x: 268, y: 100 }])
    ] };
    const ir = netlist.buildIRFromDoc(doc, portsOf);
    const res = engine.evaluateIR(ir);
    ok('netlist: 常量驱动 or → 恒 1 + 自动命名', ir.inputs.join(',') === 'a' && ir.outputs[0].name === 'y' && outBits(res, 'y') === '11',
        ir.inputs.join(',') + '/' + ir.outputs[0].name + '/' + outBits(res, 'y'));
}

/* 21. 旋转/镜像后的引脚变换：and-gate rot=1（90°） */
{
    /* and-gate rot=1 时：局部 (-30,-10) → (10,-30)，(-30,10) → (-10,-30)，(30,0) → (0,30) */
    const doc = { groups: [], items: [
        comp('i1', 'tt-in', 110, 100, 'a'),                                  // out (142,100)
        comp('i2', 'tt-in', 90, 100, 'b', { fh: true }),                     // fh: out 局部(32,0)→(-32,0) → (58,100)
        comp('i3', 'and-gate', 100, 230, '', { rot: 1 }),                    // A(110,200) B(90,200) Y(100,260)
        comp('i4', 'tt-out', 100, 330, 'y'),                                 // in (68,330) → 用线连
        wire('w1', [{ x: 142, y: 100 }, { x: 142, y: 200 }, { x: 110, y: 200 }]),
        wire('w2', [{ x: 58, y: 100 }, { x: 58, y: 200 }, { x: 90, y: 200 }]),
        wire('w3', [{ x: 100, y: 260 }, { x: 100, y: 300 }, { x: 68, y: 300 }, { x: 68, y: 330 }])
    ] };
    const res = engine.evaluateIR(netlist.buildIRFromDoc(doc, portsOf));
    ok('netlist: rot/fh 引脚变换（y = a&b）', outBits(res, 'y') === '0001', outBits(res, 'y'));
}

console.log('----------------------------------------');
console.log('smoke-tt: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

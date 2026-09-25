/* DPI 五张图纸；计算边界保持独立，未知电池/负载不填入假设数值。 */
(function (root) {
    'use strict';
    var titles = { bench: '完整 DPI 测试台', block: '隔直电容网络', ban: 'BAN 交流等效网络', injection: '单频注入等效网络', monitor: 'OUT2 监测网络' };
    function build(kind, p, R) {
        if (!titles[kind]) throw new Error('未知 DPI 图纸');
        var F = root.CircuitFigure, b = F.builder(R), focus = {};
        function value(id, unit, name) { return (name || id) + '\n' + F.eng(p[id], unit); }
        function B(id, type, a, z, label, target) {
            var part = b.B(id, type, a, z, label);
            if (target) {
                focus[id] = target;
                var group = b.doc.groups[b.doc.groups.length - 1];
                if (group && group.members.includes(id)) group.members.forEach(function (member) { focus[member] = target; });
            }
            return part;
        }
        function block(x, y, prefix) {
            if (p.parasitic) {
                B(prefix + 'ESR', 'resistor', [x, y], [x + 180, y], value('esr', 'Ω', 'ESR'), 'block');
                B(prefix + 'ESL', 'inductor-compact', [x + 180, y], [x + 360, y], value('esl', 'H', 'ESL'), 'block');
                B(prefix + 'Cblock', 'capacitor', [x + 360, y], [x + 600, y], value('cb', 'F', 'C_block'), 'block');
                b.W([x + 360, y], [x + 360, y + 110]); b.W([x + 600, y], [x + 600, y + 110]);
                B(prefix + 'Rleak', 'resistor', [x + 360, y + 110], [x + 600, y + 110], value('leak', 'Ω', 'R_leak'), 'block');
                b.J([x + 360, y]); b.J([x + 600, y]);
            } else B(prefix + 'Cblock', 'capacitor', [x, y], [x + 600, y], value('cb', 'F', 'C_block'), 'block');
            return [x + 600, y];
        }
        function ban(x, y, prefix, reverse, supply) {
            var e = [x, y], d = [x + 340, y];
            if (reverse) { e = [x + 340, y]; d = [x, y]; }
            B(prefix + 'Lban', 'inductor-compact', e, d, value('lb', 'H', 'L_BAN' + (supply ? ' · VDD' : '')), 'ban');
            if (!supply) { B(prefix + 'Rext', 'resistor', e, [e[0], y + 210], value('rext', 'Ω', 'R_ext'), 'ban'); b.G([e[0], y + 210]); }
            B(prefix + 'Rban', 'resistor', d, [d[0], y + 105], value('rb', 'Ω', 'R_BAN'), 'ban');
            B(prefix + 'Cban', 'capacitor', [d[0], y + 105], [d[0], y + 230], value('cban', 'F', 'C_BAN'), 'ban');
            b.J(d); b.G([d[0], y + 230]); return { e: e, d: d };
        }
        function monitor(x, y) {
            B('Rm', 'resistor', [x, y], [x + 220, y], value('rm', 'Ω', 'R_M'), 'monitor');
            b.W([x + 220, y], [x + 460, y], [x + 700, y], [x + 880, y]);
            [['Cm', 'capacitor', 'cm', 'F', 220], ['Rin', 'resistor', 'rin', 'Ω', 460], ['Cin', 'capacitor', 'cin', 'F', 700]].forEach(function (v) {
                var node = [x + v[4], y];
                B(v[0], v[1], node, [node[0], y + 180], value(v[2], v[3], v[0] === 'Cm' ? 'C_M' : v[0] === 'Rin' ? 'R_in' : 'C_in'), 'monitor');
                b.J(node); b.G([node[0], y + 180]);
            });
            b.T(x + 870, y - 20, '示波器监测端');
        }
        function source(x, y) {
            B('Vs', 'voltage-source', [x, y], [x, y + 150], 'v_s（开路）', 'rf'); b.G([x, y + 150]);
            B('R0', 'resistor', [x, y], [x + 220, y], value('r0', 'Ω', 'R_s = R_0'), 'rf');
            b.T(x, y + 230, 'P_av = ' + (Number.isFinite(p.p) ? p.p + ' dBm' : '未设定') + '\nf_DPI = ' + F.eng(p.f, 'Hz'));
            return [x + 220, y];
        }
        if (kind === 'block') {
            block(50, 100, ''); b.J([50, 100], 'RF'); b.J([650, 100], 'DUT-port');
            b.T(50, 75, 'RF 侧'); b.T(650, 75, 'DUT 侧');
            b.T(350, 290, p.parasitic ? 'ESR + ESL + (C_block ∥ R_leak)' : '理想电容：不包含 ESR、ESL 或泄漏支路');
        } else if (kind === 'ban') {
            var net = ban(80, 80, '', false, false);
            b.J(net.e, 'E'); b.J(net.d, 'D'); b.T(80, 50, '外部端 E'); b.T(490, 60, 'DUT 端 D');
            b.T(350, 375, p.useBan ? 'DUT 端看入：(R_ext + sL_BAN) ∥ (R_BAN + 1/sC_BAN)' : '当前 OUT1 计算未接入 BAN；本图仅说明连接');
        } else if (kind === 'monitor') {
            monitor(40, 80); b.J([40, 80], 'OUT2'); b.T(40, 55, 'OUT2');
            b.T(470, 340, '监测支路不经过 BAN；示波器输入为 R_in ∥ C_in');
        } else if (kind === 'injection') {
            var src = source(40, 100), end = block(src[0], src[1], '');
            var node = [end[0] + 100, end[1]]; b.W(end, node); b.J(node, 'OUT1'); b.T(node[0], 75, 'OUT1 / V_DUT');
            b.C('Zdut', 'block', node[0], 330, 0, 'Z_DUT'); b.W(node, b.P('Zdut', 'T')); b.W(b.P('Zdut', 'B'), [node[0], 420]); b.G([node[0], 420]);
            b.T(node[0], 480, 'Z_DUT = ' + F.eng(p.rd, 'Ω') + ' + j(' + F.eng(p.xd, 'Ω') + ')\n恒定复阻抗，不等同于固定 L/C');
            if (p.useBan) { var load = ban(node[0] + 240, 100, '', true, false); b.W(node, load.d); }
        } else {
            b.C('DUT', 'dut-5t', 620, 600, 0, '');
            b.T(620, 516, 'VDD'); b.T(548, 590, 'IN'); b.T(620, 685, 'GND'); b.T(675, 550, 'OUT1'); b.T(675, 635, 'OUT2');
            B('VDC', 'voltage-source', [40, 70], [40, 230], '电池 / DC\n未设定', 'ban'); b.G([40, 230]);
            var power = ban(40, 70, 'supply-', false, true); b.W(power.d, [620, 70], b.P('DUT', 'VDD'));
            B('Vdrive', 'voltage-source', [40, 600], [40, 780], '同板驱动\n未设定', 'monitor'); b.G([40, 780]);
            B('Lrf', 'inductor-compact', [40, 600], b.P('DUT', 'IN'), value('lrf', 'H', 'L_RF_BLOCK'), 'monitor');
            b.W(b.P('DUT', 'GND'), [620, 780]); b.G([620, 780]);
            var rf = source(820, 70), rfEnd = block(rf[0], rf[1], '');
            b.W(rfEnd, [rfEnd[0], 390], [900, 390], [900, 560], b.P('DUT', 'OUT1')); b.J([900, 560], 'OUT1');
            if (p.useBan) {
                ban(900, 560, 'out1-', true, false);
                b.T(1280, 850, '线束负载未设定；R_ext 为所选交流等效终端');
            } else b.T(1240, 560, 'OUT1 外部 BAN 支路未接入');
            b.W(b.P('DUT', 'OUT2'), [780, 640], [780, 940], [1040, 940]); b.J([820, 940], 'OUT2');
            B('Rload', 'resistor', [820, 940], [820, 1120], '同板负载\n未设定', 'monitor'); b.G([820, 1120]);
            monitor(1040, 940);
            b.T(620, 1250, 'VDD 供电 BAN 始终保留；OUT1 注入、OUT2 监测独立。DUT 内部电路及未知负载不参与本页等效求解。');
        }
        var pack = b.pack(titles[kind], { module: 'dpi-calc', figure: kind, inputs: Object.assign({}, p) });
        pack.focus = focus; return pack;
    }
    root.DPIFigures = { build: build, titles: titles };
    if (typeof module === 'object' && module.exports) module.exports = root.DPIFigures;
})(typeof window !== 'undefined' ? window : globalThis);

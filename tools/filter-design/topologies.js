/* 七种滤波网络：展示与传输共用真实可编辑文档。 */
(function (root) {
    'use strict';
    var names = { 'rc-lp': '一阶 RC 低通', 'rc-hp': '一阶 RC 高通', 'sk-lp': 'Sallen–Key 低通',
        'sk-hp': 'Sallen–Key 高通', 'rc-bp': 'RC-CR 带通（理想缓冲级联）', 'mfb-bp': 'MFB 带通', 'notch': '双 T 陷波（标称配比）' };
    function build(arch, values, R) {
        if (!names[arch]) throw new Error('未知滤波器架构');
        var F = root.CircuitFigure, b = F.builder(R), c = values || {};
        function branch(id, a, z) { return b.B(id, id[0] === 'R' ? 'resistor' : 'capacitor', a, z, id + (values ? '\n' + F.eng(c[id], id[0] === 'R' ? 'Ω' : 'F') : '')); }
        function io(id, node) { b.J(node, id); b.T(node[0], node[1] - 20, id); }
        function amplifier(x, y, following) {
            var op = b.C('U1', 'opamp', x, y, 0, 'U1'); op.fv = !!following;
            return { plus: b.P('U1', 'IN+'), minus: b.P('U1', 'IN-'), out: b.P('U1', 'OUT') };
        }
        var vin = [40, 140], out;
        io('Vin', vin);
        if (arch === 'rc-lp' || arch === 'rc-hp') {
            branch(arch === 'rc-lp' ? 'R1' : 'C1', vin, [260, 140]);
            branch(arch === 'rc-lp' ? 'C1' : 'R1', [260, 140], [260, 300]);
            b.G([260, 300]); b.J([260, 140]); out = [440, 140]; b.W([260, 140], out);
        } else if (arch === 'sk-lp' || arch === 'sk-hp') {
            var hp = arch === 'sk-hp', op = amplifier(620, 150, true);
            branch(hp ? 'C1' : 'R1', vin, [260, 140]); branch(hp ? 'C2' : 'R2', [260, 140], [480, 140]);
            b.W([480, 140], op.plus); branch(hp ? 'R2' : 'C2', [480, 140], [480, 290]); b.G([480, 290]);
            b.W([260, 140], [260, 30]); branch(hp ? 'R1' : 'C1', [260, 30], [740, 30]);
            b.W([740, 30], [740, 150], op.out); b.W(op.minus, [540, 160], [540, 350], [740, 350], [740, 150]);
            [[260, 140], [480, 140], [740, 150]].forEach(function (n) { b.J(n); });
            out = [830, 150]; b.W([740, 150], out); b.T(630, 400, '理想电压跟随器；不计运放噪声');
        } else if (arch === 'rc-bp') {
            var follower = amplifier(430, 150, true);
            branch('C1', vin, [240, 140]); branch('R1', [240, 140], [240, 290]); b.G([240, 290]);
            b.J([240, 140]); b.W([240, 140], follower.plus);
            b.W(follower.minus, [350, 160], [350, 340], [510, 340], [510, 150], follower.out);
            b.J([510, 150]); branch('R2', [510, 150], [760, 150]); branch('C2', [760, 150], [760, 290]);
            b.G([760, 290]); b.J([760, 150]); out = [940, 150]; b.W([760, 150], out);
            b.T(480, 400, '理想缓冲隔离两级；面积仅计 RC，噪声估算不含运放');
        } else if (arch === 'mfb-bp') {
            var amp = amplifier(620, 150, false);
            branch('R1', vin, [260, 140]); branch('R2', [260, 140], [260, 290]); b.G([260, 290]);
            branch('C1', [260, 140], [480, 140]); b.W([480, 140], amp.minus);
            b.W(amp.plus, [550, 160], [550, 230]); b.G([550, 230]);
            b.W([260, 140], [260, 30]); branch('C2', [260, 30], [740, 30]); b.W([740, 30], [740, 150], amp.out);
            b.W([480, 140], [480, 340]); branch('R3', [480, 340], [740, 340]); b.W([740, 340], [740, 150]);
            [[260, 140], [480, 140], [740, 150]].forEach(function (n) { b.J(n); });
            out = [840, 150]; b.W([740, 150], out); b.T(540, 405, '理想运放；反相带通；R/C 可独立取值');
        } else {
            b.W(vin, [40, 30]); branch('R1', [40, 30], [300, 30]); branch('R2', [300, 30], [560, 30]);
            branch('C3', [300, 30], [300, 120]); b.G([300, 120]); b.J([300, 30]);
            b.W(vin, [40, 240]); branch('C1', [40, 240], [300, 240]); branch('C2', [300, 240], [560, 240]);
            branch('R3', [300, 240], [300, 370]); b.G([300, 370]); b.J([300, 240]);
            b.W([560, 30], [560, 140], [560, 240]); out = [670, 140]; b.W([560, 140], out); b.J([560, 140]);
            b.T(360, 435, '标称：R1=R2=2R3；C1=C2=C3/2；Q=1/4');
        }
        io('Vout', out);
        return b.pack(names[arch], { module: 'filter-design', architecture: arch, values: Object.assign({}, c) });
    }
    root.FilterFigures = { build: build, names: names };
    if (typeof module === 'object' && module.exports) module.exports = root.FilterFigures;
})(typeof window !== 'undefined' ? window : globalThis);

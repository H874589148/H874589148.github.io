/* 六种拓扑均由 Razavi 标准器件、端口和连线组成；不包含自绘器件路径。 */
(function (root) {
    'use strict';
    function build(topo, mode, R) {
        R = R || root.Razavi;
        if (!R) throw new Error('Razavi 器件库未加载');
        var items = [], parts = {};
        function C(id, type, x, y, rot, text) {
            var c = { kind: 'comp', id: id, type: type, x: x, y: y, rot: rot || 0, text: text || '' };
            parts[id] = c; items.push(c); return c;
        }
        function P(id, name) {
            var passive = ['capacitor', 'inductor-compact'].includes(parts[id].type);
            var pinName = passive ? (name === '+' ? '1' : name === '-' ? '2' : name) : name;
            var pin = R.portsWorld(parts[id]).find(function (p) { return p.n === pinName; });
            if (!pin) throw new Error('未知器件端口：' + id + '.' + name);
            return [pin.x, pin.y];
        }
        function W() { items.push({ kind: 'wire', pts: Array.from(arguments).map(function (p) { return { x: p[0], y: p[1] }; }) }); }
        function T(x, y, text, anchor) { items.push({ kind: 'label', x: x, y: y, text: text, anchor: anchor || 'middle', size: 13 }); }
        function J(x, y, text) { C('j' + items.length, 'dot', x, y); if (text) T(x, y - 14, text); }
        function G(id, x, y, text) { C(id, 'ground', x, y + 10); if (text) T(x, y + 45, text); }
        function input(x, top, bottom) {
            C('Vin', 'voltage-source', x, (top + bottom) / 2, 0, 'Vin');
            W(P('Vin', '+'), [x, top]); W(P('Vin', '-'), [x, bottom]); G('gp', x, bottom);
        }
        function output(x, top, bottom, invert, isolated) {
            C('Cout', 'capacitor', x, (top + bottom) / 2, 0, 'Cout');
            C('Iout', 'current-source', x + 100, (top + bottom) / 2, invert ? 2 : 0, 'Iout');
            W([x, top], P('Cout', '+')); W(P('Cout', '-'), [x, bottom]);
            var load = R.portsWorld(parts.Iout).sort(function (a, b) { return a.y - b.y; });
            W([x, top], [x + 100, top], [load[0].x, load[0].y]);
            W([load[1].x, load[1].y], [x + 100, bottom], [x, bottom]);
            G('go', x, bottom, isolated ? '副边参考 0s' : '');
            J(x, top, 'Vout ' + (invert ? '(−)' : '(+)')); T(x - 28, top + 35, '+'); T(x - 28, bottom - 12, '−');
            T(x + 100, bottom + 45, invert ? 'Iout：0→Vout' : 'Iout：Vout→0');
            T(x - 30, (top + bottom) / 2 + 35, 'iCout ↓', 'end');
        }
        if (topo === 'buck' || topo === 'boost' || topo === 'buckboost') {
            input(40, 60, 230); output(430, 60, 230, topo === 'buckboost'); W([40, 230], [430, 230]);
            if (topo === 'buck') {
                C('Q1', 'simple-switch', 130, 60, 0, 'Q1'); C('L', 'inductor-compact', 320, 60, 3, 'L');
                W([40, 60], P('Q1', '1')); W(P('Q1', '2'), [230, 60], P('L', '+')); W(P('L', '-'), [430, 60]);
                var sync = mode === 'sync'; C('return', sync ? 'simple-switch' : 'diode', 230, 150, sync ? 1 : 3, sync ? 'Q2' : 'D');
                W([230, 60], P('return', sync ? '1' : 'K')); W(P('return', sync ? '2' : 'A'), [230, 230]);
                J(230, 60, 'Vsw'); J(230, 230); T(320, 99, 'iL →');
            } else if (topo === 'boost') {
                C('L', 'inductor-compact', 130, 60, 3, 'L'); C('D', 'diode', 320, 60, 0, 'D'); C('Q1', 'simple-switch', 230, 150, 1, 'Q1');
                W([40, 60], P('L', '+')); W(P('L', '-'), [230, 60], P('D', 'A')); W(P('D', 'K'), [430, 60]);
                W([230, 60], P('Q1', '1')); W(P('Q1', '2'), [230, 230]); J(230, 60, 'Vsw'); J(230, 230); T(130, 100, 'iL →');
            } else {
                C('Q1', 'simple-switch', 130, 60, 0, 'Q1'); C('L', 'inductor-compact', 230, 150, 0, 'L'); C('D', 'diode', 320, 60, 2, 'D');
                W([40, 60], P('Q1', '1')); W(P('Q1', '2'), [230, 60], P('D', 'K')); W(P('D', 'A'), [430, 60]);
                W([230, 60], P('L', '+')); W(P('L', '-'), [230, 230]); J(230, 60, 'Vsw'); J(230, 230); T(265, 174, 'iL ↓');
            }
        } else if (topo === 'dsd') {
            input(40, 60, 300); output(650, 60, 300, false);
            C('Q1', 'simple-switch', 130, 60, 0, 'Q1'); C('Cf', 'capacitor', 310, 60, 3, 'Cf：X−A');
            C('L1', 'inductor-compact', 510, 60, 3, 'L1'); C('L2', 'inductor-compact', 510, 240, 3, 'L2');
            C('Q2', 'simple-switch', 410, 130, 1, 'Q2'); C('Q3', 'simple-switch', 230, 150, 1, 'Q3'); C('Q4', 'simple-switch', 330, 300, 1, 'Q4');
            W([40, 60], P('Q1', '1')); W(P('Q1', '2'), [230, 60], P('Cf', '+'));
            W(P('Cf', '-'), [410, 60], P('L1', '+')); W(P('L1', '-'), [650, 60]);
            W([230, 60], P('Q3', '1')); W(P('Q3', '2'), [230, 240], [330, 240], P('L2', '+'));
            W(P('L2', '-'), [590, 240], [590, 60]); J(590, 60);
            W([410, 60], P('Q2', '1')); W(P('Q2', '2'), [410, 175]); G('g2', 410, 175);
            W([330, 240], P('Q4', '1')); W(P('Q4', '2'), [330, 345]); G('g4', 330, 345);
            J(230, 60, 'X'); J(410, 60, 'A'); J(330, 240, 'B'); T(510, 100, 'i1 →'); T(510, 275, 'i2 →');
            T(310, 100, '+ vCf −；iCf →');
            T(460, 390, 'Q2=¬Q1；Q4=¬Q3；Q3 延迟 T/2；D≤0.5');
            T(460, 415, '所有地为同一参考 0；vA、vB、Vout 均相对地');
        } else if (topo === 'flyback') {
            input(40, 60, 280); output(530, 100, 280, false, true);
            C('T', 'transformer-4t', 290, 150, 0, 'n = Np/Ns'); C('Lm', 'inductor-compact', 180, 150, 0, 'Lm');
            C('Q1', 'simple-switch', 270, 230, 1, 'Q1'); C('D', 'diode', 420, 100, 0, 'D');
            W([40, 60], [180, 60], [270, 60], P('T', 'P1')); W([180, 60], P('Lm', '+'));
            W(P('Lm', '-'), [180, 190], [270, 190]); W(P('T', 'P2'), [270, 190], P('Q1', '1'));
            W(P('Q1', '2'), [270, 280], [40, 280]); J(180, 60); J(270, 190, 'VDS');
            W(P('T', 'S1'), [340, 130], [340, 100], P('D', 'A')); W(P('D', 'K'), [530, 100]);
            W(P('T', 'S2'), [340, 170], [340, 280], [530, 280]);
            T(280, 125, '•'); T(300, 187, '•'); T(155, 190, 'im ↓'); T(40, 325, '原边参考 0p');
            T(340, 360, '0p 与 0s 隔离；副边下端为同名端，关断时向输出传能');
            T(340, 385, 'ipri：Vin→原边网络；isec：D→输出；VDS：漏极对 0p');
        } else if (topo === 'llc') {
            input(40, 30, 300); output(810, 30, 300, false, true);
            C('Q1', 'simple-switch', 140, 80, 1, 'Q1'); C('Q2', 'simple-switch', 140, 220, 1, 'Q2');
            W([40, 30], [140, 30], P('Q1', '1')); W(P('Q1', '2'), [140, 150], P('Q2', '1')); W(P('Q2', '2'), [140, 300], [40, 300]);
            C('Lr', 'inductor-compact', 230, 150, 3, 'Lr'); C('Cr', 'capacitor', 300, 150, 3, 'Cr');
            C('Lm', 'inductor-compact', 360, 220, 0, 'Lm'); C('T', 'transformer-4t', 450, 220, 0, 'n = Np/Ns');
            W([140, 150], P('Lr', '+')); W(P('Lr', '-'), P('Cr', '+')); W(P('Cr', '-'), [360, 150], [430, 150], P('T', 'P1'));
            W([360, 150], P('Lm', '+')); W(P('Lm', '-'), [360, 300]); W(P('T', 'P2'), [430, 300], [140, 300]);
            J(140, 150, 'vHB'); J(360, 150, 'vp'); J(360, 300); T(440, 195, '•'); T(460, 195, '•');
            // 全桥：两列上管阴极共接正输出，下管阳极共接副边参考地。
            C('D1', 'diode', 570, 90, 3, 'D1'); C('D2', 'diode', 710, 90, 3, 'D2');
            C('D3', 'diode', 570, 240, 3, 'D3'); C('D4', 'diode', 710, 240, 3, 'D4');
            W([570, 30], P('D1', 'K')); W([570, 30], [710, 30], [810, 30]); W([710, 30], P('D2', 'K')); J(710, 30);
            W(P('D1', 'A'), [570, 150], P('D3', 'K')); W(P('D2', 'A'), [710, 150], P('D4', 'K'));
            W(P('D3', 'A'), [570, 300], [710, 300], [810, 300]); W(P('D4', 'A'), [710, 300]); J(710, 300);
            W(P('T', 'S1'), [500, 200], [500, 150], [570, 150]); J(570, 150, 'a');
            W(P('T', 'S2'), [520, 240], [520, 340], [760, 340], [760, 150], [710, 150]); J(710, 150, 'b');
            T(40, 345, '原边参考 0p'); T(430, 395, '仅带实心连接点的交叉相连；0p 与 0s 隔离；驱动 50%、零死区');
            T(430, 420, 'ir：Lr→Cr；vCr：左(+)右(−)；im：Lm 向下；vp：原边上(+)下(−)');
            T(430, 445, 'ir−im：流入变压器原边；isec：整流桥→正输出');
        } else throw new Error('未知拓扑');
        return { items: items };
    }
    var api = { build: build, render: function (topo, mode) {
        return root.Razavi.docSvg(build(topo, mode), { stroke: 'var(--color-text)', textColor: 'var(--color-text)',
            className: 'topo-svg', margin: 24, font: 'Arial, Microsoft YaHei, sans-serif' }).str;
    } };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PEFigures = api;
}(typeof window !== 'undefined' ? window : globalThis));

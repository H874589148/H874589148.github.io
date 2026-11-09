/* PLL 功能框图和真实 Razavi R/C 滤波器连接图。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(root);
    else root.PLLFigure = factory(root);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    function build(p) {
        var F = root.CircuitFigure, b = F.builder(), eng = F.eng;
        var cp = b.C('cp', 'block', 0, 0, 0, 'PFD / CP');
        var vco = b.C('vco', 'block', 650, 0, 0, 'VCO');
        var feedback = b.C('feedback', 'block', 450, 210, 0, '÷ N = ' + p.feedbackDivider);
        var out = b.C('out', 'block', 830, 0, 0, '÷ D = ' + p.outputDivider);
        b.W([-160, 0], b.P('cp', 'L')); b.T(-165, -14, 'fref / R', 'end');
        b.W(b.P('cp', 'R'), [100, 0]);
        b.W(b.P('vco', 'R'), b.P('out', 'L'));
        b.W(b.P('out', 'R'), [940, 0]); b.T(945, -14, '输出', 'start');
        b.W([720, 0], [720, 210], b.P('feedback', 'R'));
        b.W(b.P('feedback', 'L'), [-90, 210], [-90, 0], b.P('cp', 'B'));
        b.J([720, 0]);
        b.T(330, -85, '连续时间相位域小信号框图');
        var a = [280, 0];
        b.W([100, 0], a); b.J([160, 0]); b.J(a, 'nodeA'); b.T(a[0], -50, 'CP 节点');
        b.B('C1', 'capacitor', [160, 0], [160, 100], 'C1=' + eng(p.c1, 'F'));
        b.G([160, 100], 'g1');
        b.B('R2', 'resistor', a, [280, 55], 'R2=' + eng(p.r2, 'Ω'));
        b.B('C2', 'capacitor', [280, 55], [280, 120], 'C2=' + eng(p.c2, 'F'));
        b.G([280, 120], 'g2');
        b.T(220, 160, 'R2 热噪声：串联支路内');
        if (p.topology === 'B') {
            var node = [440, 0];
            b.B('R3', 'resistor', a, [410, 0], 'R3=' + eng(p.r3, 'Ω'));
            b.W([410, 0], node); b.J(node, 'nodeB'); b.T(480, -50, 'VCO 控制端');
            b.B('C3', 'capacitor', node, [440, 100], 'C3=' + eng(p.c3, 'F'));
            b.G([440, 100], 'g3'); b.T(450, 160, 'R3 热噪声：A/B 两端');
            b.W(node, [610, 0], b.P('vco', 'L'));
        } else {
            b.W(a, [610, 0], b.P('vco', 'L')); b.T(480, -50, 'VCO 控制端');
        }
        return b.pack('PLL 拓扑 ' + p.topology, { topology: p.topology });
    }
    function render(p) { return root.CircuitFigure.render(build(p).doc, { margin: 30 }); }
    return { build: build, render: render };
}));

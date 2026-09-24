/* 示例的导线显式连接真实 Razavi 引脚；不依赖元件标签隐式接网。 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TFExamples = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var names = { gm: '单级 gm-RC', rc: 'RC 低通', cascade: '两级 gm-RC', coupling: '两级跨节点耦合电容', parallel: '并联 gm', transimpedance: '跨阻 R∥C', integrator: '纯电容跨阻积分器' };
    function create(key, R) {
        if (!Object.prototype.hasOwnProperty.call(names, key)) throw new Error('未知示例');
        var doc = { items: [], groups: [] }, id = 0;
        function comp(type, x, y, name, value, prefix, rot) {
            var it = { kind: 'comp', id: 'i' + (++id), type: type, x: x, y: y, rot: rot || 0, fh: false, fv: false, text: name || '', stroke: '#1a1a1a', sw: 1.5, dash: '' };
            if (value !== undefined) {
                it.analysis = { version: 1, symbol: name, value: String(value), prefix: prefix || '' };
                it.text = name + ' = ' + value + ' ' + (prefix || '') + (type === 'resistor' ? 'Ω' : type === 'capacitor' ? 'F' : 'S');
            }
            doc.items.push(it); return it;
        }
        function pin(it, n) { var p = R.portsWorld(it).find(function (p) { return p.n === n; }); return { x: p.x, y: p.y }; }
        function wire() { var pts = Array.from(arguments).map(function (p) { return Array.isArray(p) ? { x: p[0], y: p[1] } : p; }); doc.items.push({ kind: 'wire', id: 'i' + (++id), pts: pts, stroke: '#1a1a1a', sw: 1.5, dash: '' }); }
        function ground(p, x, y) { var g = comp('ground', x, y); wire(p, [x, p.y], pin(g, '0')); }
        function load(type, x, symbol, value, prefix) {
            var c = comp(type, x, 280, symbol, value, prefix);
            wire([x, 160], pin(c, '1')); ground(pin(c, '2'), x, 340); return c;
        }
        function gm(x, y, symbol, value) {
            var g = comp('transconductance-4t', x, y, symbol, value, 'm');
            ground(pin(g, 'cn'), x - 40, y + 80); ground(pin(g, 'on'), x + 40, y + 80); return g;
        }
        var current = key === 'transimpedance' || key === 'integrator';
        var input = comp('tf-in', 60, 160, current ? 'Iin' : 'Vin'); input.inputKind = current ? 'current' : 'voltage';
        var two = key === 'cascade' || key === 'coupling';
        var output = comp('tf-out', two ? 1100 : 720, 160, 'Vout');
        if (current) {
            wire(pin(input, 'out'), pin(output, 'in'));
            if (key !== 'integrator') load('resistor', 400, 'R1', 10, 'k');
            load('capacitor', 520, 'C1', 10, 'p');
        } else if (key === 'rc') {
            var r = comp('resistor', 240, 160, 'R1', 1, 'k', 1);
            wire(pin(input, 'out'), pin(r, '2')); wire(pin(r, '1'), pin(output, 'in'));
            load('capacitor', 440, 'C1', 1, 'n');
        } else {
            var g1 = gm(240, 180, 'gm1', 1);
            wire(pin(input, 'out'), pin(g1, 'cp'));
            load('resistor', 400, 'R1', two ? 100 : 10, 'k'); load('capacitor', 520, 'C1', 10, 'p');
            if (two) {
                var g2 = gm(680, 180, 'gm2', 2);
                wire(pin(g1, 'op'), pin(g2, 'cp')); wire(pin(g2, 'op'), pin(output, 'in'));
                load('resistor', 840, 'R2', 50, 'k'); load('capacitor', 960, 'C2', 20, 'p');
                if (key === 'coupling') {
                    var cc = comp('capacitor', 580, 60, 'Cc', 2, 'p', 1);
                    wire([560, 160], pin(cc, '2')); wire(pin(cc, '1'), [1020, 60], [1020, 160]);
                }
            } else {
                wire(pin(g1, 'op'), pin(output, 'in'));
                if (key === 'parallel') {
                    var gp = gm(240, 420, 'gm2', 2);
                    wire([140, 160], [140, 400], pin(gp, 'cp'));
                    wire(pin(gp, 'op'), [620, 400], [620, 160]);
                }
            }
        }
        return { version: 1, doc: doc, inputKind: current ? 'current' : 'voltage', frequency: { auto: true, min: 1, max: 1e9 } };
    }
    return { names: names, create: create };
});

/* tools/filter-design/script.js
   滤波器设计：6 种架构 / 最小面积 RC 求解 / 热噪声与积分噪声 */

var KB = 1.380649e-23;

var el = {};
['arch', 'fc', 'fL', 'fH', 'f0', 'q0', 'fst', 'astop', 'rhoR', 'rhoC', 'tempK',
 'fcField', 'fLField', 'fHField', 'f0Field', 'qField', 'stopInfo',
 'compFields', 'optBtn', 'compBody', 'areaInfo', 'noiseInfo', 'topoFig'
].forEach(function (id) { el[id] = document.getElementById(id); });

/* 每种架构的频率字段与可编辑器件字段 */
var ARCHS = {
    'rc-lp':  { freq: ['fc'],       comps: [['R1', 'R'], ['C1', 'C']] },
    'rc-hp':  { freq: ['fc'],       comps: [['R1', 'R'], ['C1', 'C']] },
    'sk-lp':  { freq: ['fc'],       comps: [['R1', 'R1 = R2'], ['C2', 'C2（C1 = 2·C2）']] },
    'sk-hp':  { freq: ['fc'],       comps: [['C1', 'C1 = C2'], ['R1', 'R1（R2 = 2·R1）']] },
    'rc-bp':  { freq: ['fL', 'fH'], comps: [['R1', 'R1（高通臂 fL）'], ['C1', 'C1（高通臂）'], ['R2', 'R2（低通臂 fH）'], ['C2', 'C2（低通臂）']] },
    'mfb-bp': { freq: ['f0', 'q0'], comps: [['C1', 'C1 = C2'], ['R1', 'R1（R2、R3 自动）']] },
    'notch':  { freq: ['f0'],       comps: [['R1', 'R（R1=R2，R3=R/2）'], ['C1', 'C（C1=C2，C3=2C）']] }
};

var comp = {};   // 当前器件取值（SI 单位）

/* ---- 解析：频率/器件值支持工程记号（大小写敏感：M=Mega，m=milli） ---- */
function parseVal(str) {
    str = String(str).trim();
    if (!str) return NaN;
    var m = str.match(/^([\d.eE+-]+)\s*([a-zA-Zμµ]*)$/);
    if (!m) return NaN;
    var v = parseFloat(m[1]);
    if (isNaN(v)) return NaN;
    var suf = m[2];
    if (/^meg$/i.test(suf)) return v * 1e6;
    var table = { '': 1, 'k': 1e3, 'K': 1e3, 'M': 1e6, 'G': 1e9, 'g': 1e9, 'T': 1e12,
                  'm': 1e-3, 'u': 1e-6, 'μ': 1e-6, 'µ': 1e-6, 'n': 1e-9, 'p': 1e-12, 'f': 1e-15 };
    if (!(suf in table)) return NaN;
    return v * table[suf];
}

function fmt(v, unit) { return formatEngineering(v) + ' ' + unit; }

/* ---- 参数读取 ---- */
function getSpecs() {
    return {
        arch:  el.arch.value,
        fc:    parseVal(el.fc.value),
        fL:    parseVal(el.fL.value),
        fH:    parseVal(el.fH.value),
        f0:    parseVal(el.f0.value),
        q:     parseFloat(el.q0.value),
        fst:   parseVal(el.fst.value),
        astop: parseFloat(el.astop.value),
        rhoR:  parseFloat(el.rhoR.value),          // Ω/µm²
        rhoC:  parseFloat(el.rhoC.value),          // fF/µm²
        T:     parseFloat(el.tempK.value)
    };
}

function validSpecs(s) {
    if (!(s.rhoR > 0) || !(s.rhoC > 0) || !(s.T > 0)) return '版图密度与温度必须为正数。';
    if (s.arch === 'rc-bp') {
        if (!(s.fL > 0) || !(s.fH > 0) || s.fH <= s.fL) return '带通需要 fH > fL > 0。';
    } else if (s.arch === 'mfb-bp') {
        if (!(s.f0 > 0)) return 'f0 必须为正数。';
        if (!(s.q > Math.SQRT1_2)) return 'MFB（增益 -1）要求 Q > 0.71。';
    } else if (s.arch === 'notch') {
        if (!(s.f0 > 0)) return 'f0 必须为正数。';
    } else {
        if (!(s.fc > 0)) return 'fc 必须为正数。';
    }
    return null;
}

/* ---- 最小面积闭式解 ---- */
function designOptimal(s) {
    var rhoR = s.rhoR, rhoCf = s.rhoC * 1e-15;   // F/µm²
    var c = {}, w;
    switch (s.arch) {
        case 'rc-lp': case 'rc-hp':
            w = 2 * Math.PI * s.fc;
            c.R1 = Math.sqrt(rhoR / (w * rhoCf));
            c.C1 = 1 / (w * c.R1);
            break;
        case 'sk-lp':
            w = 2 * Math.PI * s.fc;
            c.R1 = Math.sqrt(3 * rhoR / (2 * Math.SQRT2 * w * rhoCf));
            c.C2 = 1 / (w * Math.SQRT2 * c.R1);
            break;
        case 'sk-hp':
            w = 2 * Math.PI * s.fc;
            c.C1 = Math.sqrt(3 * rhoCf / (2 * Math.SQRT2 * w * rhoR));
            c.R1 = 1 / (w * Math.SQRT2 * c.C1);
            break;
        case 'rc-bp':
            c.R1 = Math.sqrt(rhoR / (2 * Math.PI * s.fL * rhoCf));
            c.C1 = 1 / (2 * Math.PI * s.fL * c.R1);
            c.R2 = Math.sqrt(rhoR / (2 * Math.PI * s.fH * rhoCf));
            c.C2 = 1 / (2 * Math.PI * s.fH * c.R2);
            break;
        case 'mfb-bp':
            w = 2 * Math.PI * s.f0;
            var K = (s.q + 2 * s.q + s.q / (2 * s.q * s.q - 1)) / w;
            c.C1 = Math.sqrt(K * rhoCf / (2 * rhoR));
            solveFrom('C1', c.C1, s, c);
            break;
        case 'notch':
            w = 2 * Math.PI * s.f0;
            c.R1 = Math.sqrt(1.6 * rhoR / (w * rhoCf));
            c.C1 = 1 / (w * c.R1);
            break;
    }
    return c;
}

/* ---- 用户改某项，按频率约束求其余 ---- */
function solveFrom(key, val, s, c) {
    var w;
    switch (s.arch) {
        case 'rc-lp': case 'rc-hp':
            w = 2 * Math.PI * s.fc;
            if (key === 'R1') c.C1 = 1 / (w * val); else c.R1 = 1 / (w * val);
            break;
        case 'sk-lp':
            w = 2 * Math.PI * s.fc;
            if (key === 'R1') c.C2 = 1 / (w * Math.SQRT2 * val); else c.R1 = 1 / (w * Math.SQRT2 * val);
            break;
        case 'sk-hp':
            w = 2 * Math.PI * s.fc;
            if (key === 'C1') c.R1 = 1 / (w * Math.SQRT2 * val); else c.C1 = 1 / (w * Math.SQRT2 * val);
            break;
        case 'rc-bp':
            if (key === 'R1') c.C1 = 1 / (2 * Math.PI * s.fL * val);
            else if (key === 'C1') c.R1 = 1 / (2 * Math.PI * s.fL * val);
            else if (key === 'R2') c.C2 = 1 / (2 * Math.PI * s.fH * val);
            else c.R2 = 1 / (2 * Math.PI * s.fH * val);
            break;
        case 'mfb-bp':
            w = 2 * Math.PI * s.f0;
            var C;
            if (key === 'C1') { C = val; c.R1 = s.q / (w * C); }
            else { c.R1 = val; C = s.q / (w * val); c.C1 = C; }
            c.R2 = s.q / (w * C * (2 * s.q * s.q - 1));
            c.R3 = 2 * s.q / (w * C);
            break;
        case 'notch':
            w = 2 * Math.PI * s.f0;
            if (key === 'R1') c.C1 = 1 / (w * val); else c.R1 = 1 / (w * val);
            break;
    }
}

/* ---- 传递函数 |H(f)|（由设计约束保证，与具体 RC 取值无关） ---- */
function respH(s, f) {
    var u;
    switch (s.arch) {
        case 'rc-lp': u = f / s.fc; return 1 / Math.sqrt(1 + u * u);
        case 'rc-hp': u = f / s.fc; return u / Math.sqrt(1 + u * u);
        case 'sk-lp': u = f / s.fc; return 1 / Math.sqrt(Math.pow(1 - u * u, 2) + 2 * u * u);
        case 'sk-hp': u = f / s.fc; return u * u / Math.sqrt(Math.pow(1 - u * u, 2) + 2 * u * u);
        case 'rc-bp':
            var uL = f / s.fL, uH = f / s.fH;
            return (uL / Math.sqrt(1 + uL * uL)) / Math.sqrt(1 + uH * uH);
        case 'mfb-bp':
            u = f / s.f0;
            return 1 / Math.sqrt(1 + s.q * s.q * Math.pow(u - 1 / u, 2));
        case 'notch':
            u = f / s.f0;
            return Math.abs(1 - u * u) / Math.sqrt(Math.pow(1 - u * u, 2) + 16 * u * u);
    }
    return 1;
}

/* ---- 噪声电阻和 / 器件清单 ---- */
function sumR(s, c) {
    switch (s.arch) {
        case 'rc-lp': case 'rc-hp': return c.R1;
        case 'sk-lp': return 2 * c.R1;
        case 'sk-hp': return 3 * c.R1;
        case 'rc-bp': return c.R1 + c.R2;
        case 'mfb-bp': return c.R1 + c.R2 + c.R3;
        case 'notch': return 2.5 * c.R1;
    }
    return 0;
}

function compList(s, c) {
    switch (s.arch) {
        case 'rc-lp': case 'rc-hp':
            return [['R1', c.R1, 'R'], ['C1', c.C1, 'C']];
        case 'sk-lp':
            return [['R1', c.R1, 'R'], ['R2', c.R1, 'R'], ['C1', 2 * c.C2, 'C'], ['C2', c.C2, 'C']];
        case 'sk-hp':
            return [['C1', c.C1, 'C'], ['C2', c.C1, 'C'], ['R1', c.R1, 'R'], ['R2', 2 * c.R1, 'R']];
        case 'rc-bp':
            return [['R1', c.R1, 'R'], ['C1', c.C1, 'C'], ['R2', c.R2, 'R'], ['C2', c.C2, 'C']];
        case 'mfb-bp':
            return [['C1', c.C1, 'C'], ['C2', c.C1, 'C'], ['R1', c.R1, 'R'], ['R2', c.R2, 'R'], ['R3', c.R3, 'R']];
        case 'notch':
            return [['R1', c.R1, 'R'], ['R2', c.R1, 'R'], ['R3', c.R1 / 2, 'R'],
                    ['C1', c.C1, 'C'], ['C2', c.C1, 'C'], ['C3', 2 * c.C1, 'C']];
    }
    return [];
}

/* ---- 拓扑示意图（手绘风 SVG，位号与结果表一致） ---- */
function _p(d) { return '<path d="' + d + '" class="tw"/>'; }
function _w(x1, y1, x2, y2) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="tw"/>'; }
function _d(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="3" class="td"/>'; }
function _t(x, y, s, anchor) { return '<text x="' + x + '" y="' + y + '" class="tl"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + s + '</text>'; }
function _res(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len, uy = dy / len, px = -uy, py = ux;
    var lead = 8, amp = 7, n = 6, seg = (len - 2 * lead) / n;
    var d = 'M' + x1 + ',' + y1 + ' L' + (x1 + ux * lead).toFixed(1) + ',' + (y1 + uy * lead).toFixed(1);
    for (var i = 1; i < n; i++) {
        var t = lead + seg * i, off = (i % 2 ? amp : -amp);
        d += ' L' + (x1 + ux * t + px * off).toFixed(1) + ',' + (y1 + uy * t + py * off).toFixed(1);
    }
    d += ' L' + (x2 - ux * lead).toFixed(1) + ',' + (y2 - uy * lead).toFixed(1) + ' L' + x2 + ',' + y2;
    return _p(d);
}
function _cap(x, y, vert) {
    if (vert) return _p('M' + x + ',' + (y - 14) + ' L' + x + ',' + (y - 4) + ' M' + (x - 9) + ',' + (y - 4) + ' L' + (x + 9) + ',' + (y - 4) +
                        ' M' + (x - 9) + ',' + (y + 4) + ' L' + (x + 9) + ',' + (y + 4) + ' M' + x + ',' + (y + 4) + ' L' + x + ',' + (y + 14));
    return _p('M' + (x - 14) + ',' + y + ' L' + (x - 4) + ',' + y + ' M' + (x - 4) + ',' + (y - 9) + ' L' + (x - 4) + ',' + (y + 9) +
              ' M' + (x + 4) + ',' + (y - 9) + ' L' + (x + 4) + ',' + (y + 9) + ' M' + (x + 4) + ',' + y + ' L' + (x + 14) + ',' + y);
}
function _gnd(x, y) {
    return _p('M' + x + ',' + y + ' L' + x + ',' + (y + 8) + ' M' + (x - 10) + ',' + (y + 8) + ' L' + (x + 10) + ',' + (y + 8) +
              ' M' + (x - 6) + ',' + (y + 13) + ' L' + (x + 6) + ',' + (y + 13) + ' M' + (x - 2.5) + ',' + (y + 18) + ' L' + (x + 2.5) + ',' + (y + 18));
}
function _gndL(x, y) {
    return _p('M' + x + ',' + y + ' L' + (x - 8) + ',' + y + ' M' + (x - 8) + ',' + (y - 10) + ' L' + (x - 8) + ',' + (y + 10) +
              ' M' + (x - 13) + ',' + (y - 6) + ' L' + (x - 13) + ',' + (y + 6) + ' M' + (x - 18) + ',' + (y - 2.5) + ' L' + (x - 18) + ',' + (y + 2.5));
}
function _op(x, y) {
    return _p('M' + (x - 25) + ',' + (y - 22) + ' L' + (x - 25) + ',' + (y + 22) + ' L' + (x + 28) + ',' + y + ' Z') +
           _t(x - 21, y - 6, '+') + _t(x - 21, y + 16, '−');
}
function _svg(w, h, body) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" class="topo-svg">' + body + '</svg>';
}

var TOPO_SVGS = {
    'rc-lp': _svg(260, 160,
        _t(18, 50, 'Vin') + _w(30, 60, 40, 60) +
        _res(40, 60, 120, 60) + _t(80, 42, 'R1', 'middle') +
        _w(120, 60, 210, 60) + _d(150, 60) +
        _w(150, 60, 150, 74) + _cap(150, 88, true) + _gnd(150, 102) + _t(166, 92, 'C1') +
        _t(242, 50, 'Vout', 'end')),
    'rc-hp': _svg(260, 160,
        _t(18, 50, 'Vin') + _w(30, 60, 41, 60) +
        _cap(55, 60, false) + _t(55, 42, 'C1', 'middle') +
        _w(69, 60, 210, 60) + _d(150, 60) +
        _res(150, 60, 150, 112) + _gnd(150, 112) + _t(166, 92, 'R1') +
        _t(242, 50, 'Vout', 'end')),
    'sk-lp': _svg(340, 200,
        _t(12, 60, 'Vin') + _w(24, 70, 35, 70) +
        _res(35, 70, 105, 70) + _t(70, 52, 'R1', 'middle') +
        _w(105, 70, 135, 70) + _d(120, 70) +
        _res(135, 70, 205, 70) + _t(170, 52, 'R2', 'middle') +
        _w(205, 70, 215, 70) + _d(215, 70) +
        _w(215, 70, 215, 90) + _w(215, 90, 235, 90) +
        _d(225, 90) + _w(225, 90, 225, 104) + _cap(225, 118, true) + _gnd(225, 132) + _t(241, 122, 'C2') +
        _w(120, 70, 120, 40) + _w(120, 40, 136, 40) + _cap(150, 40, false) + _w(164, 40, 300, 40) + _w(300, 40, 300, 100) +
        _t(150, 25, 'C1 = 2C2', 'middle') +
        _op(260, 100) +
        _w(288, 100, 320, 100) + _d(300, 100) + _t(322, 90, 'Vout', 'end') +
        _w(300, 100, 300, 158) + _w(300, 158, 210, 158) + _w(210, 158, 210, 110) + _w(210, 110, 235, 110)),
    'sk-hp': _svg(340, 200,
        _t(12, 60, 'Vin') + _w(24, 70, 31, 70) +
        _cap(45, 70, false) + _t(45, 52, 'C1', 'middle') +
        _w(59, 70, 95, 70) + _d(95, 70) +
        _res(95, 70, 95, 112) + _gnd(95, 112) + _t(111, 95, 'R1') +
        _w(95, 70, 111, 70) + _cap(125, 70, false) + _t(125, 52, 'C2', 'middle') +
        _w(139, 70, 185, 70) + _d(185, 70) +
        _w(185, 70, 185, 90) + _w(185, 90, 235, 90) +
        _d(210, 90) + _w(210, 90, 210, 40) + _res(210, 40, 280, 40) + _w(280, 40, 300, 40) + _w(300, 40, 300, 100) +
        _t(245, 25, 'R2 = 2R1', 'middle') +
        _op(260, 100) +
        _w(288, 100, 320, 100) + _d(300, 100) + _t(322, 90, 'Vout', 'end') +
        _w(300, 100, 300, 158) + _w(300, 158, 195, 158) + _w(195, 158, 195, 110) + _w(195, 110, 235, 110)),
    'rc-bp': _svg(330, 170,
        _t(18, 50, 'Vin') + _w(30, 60, 41, 60) +
        _cap(55, 60, false) + _t(55, 42, 'C1', 'middle') +
        _w(69, 60, 110, 60) + _d(110, 60) +
        _res(110, 60, 110, 108) + _gnd(110, 108) + _t(96, 90, 'R1', 'end') +
        _w(110, 60, 140, 60) + _res(140, 60, 215, 60) + _t(177, 42, 'R2', 'middle') +
        _w(215, 60, 250, 60) + _d(250, 60) +
        _w(250, 60, 250, 74) + _cap(250, 88, true) + _gnd(250, 102) + _t(266, 92, 'C2') +
        _w(250, 60, 300, 60) + _t(312, 50, 'Vout', 'end')),
    'mfb-bp': _svg(340, 205,
        _t(12, 80, 'Vin') + _w(24, 90, 35, 90) +
        _res(35, 90, 105, 90) + _t(70, 72, 'R1', 'middle') +
        _w(105, 90, 120, 90) + _d(120, 90) +
        _res(120, 90, 120, 132) + _gnd(120, 132) + _t(136, 115, 'R2') +
        _w(120, 90, 136, 90) + _cap(150, 90, false) + _t(150, 72, 'C1', 'middle') +
        _w(164, 90, 190, 90) + _d(190, 90) +
        _w(190, 90, 190, 120) + _w(190, 120, 235, 120) +
        _w(190, 90, 190, 50) + _w(190, 50, 196, 50) + _cap(210, 50, false) + _t(210, 35, 'C2', 'middle') +
        _w(224, 50, 300, 50) + _w(300, 50, 300, 110) +
        _d(205, 120) + _w(205, 120, 205, 165) + _res(205, 165, 275, 165) + _w(275, 165, 300, 165) + _w(300, 165, 300, 110) +
        _t(240, 185, 'R3', 'middle') +
        _op(260, 110) + _w(235, 100, 222, 100) + _gndL(222, 100) +
        _w(288, 110, 320, 110) + _d(300, 110) + _t(322, 100, 'Vout', 'end')),
    'notch': _svg(300, 240,
        _t(10, 105, 'Vin') + _w(22, 110, 35, 110) + _d(35, 110) +
        _w(35, 110, 35, 60) + _w(35, 60, 55, 60) +
        _res(55, 60, 125, 60) + _t(90, 42, 'R1', 'middle') +
        _w(125, 60, 145, 60) + _d(145, 60) +
        _res(145, 60, 215, 60) + _t(180, 42, 'R2', 'middle') +
        _w(215, 60, 235, 60) +
        _w(145, 60, 145, 76) + _cap(145, 90, true) + _gnd(145, 104) + _t(163, 94, 'C3=2C') +
        _w(35, 110, 35, 160) + _w(35, 160, 51, 160) +
        _cap(65, 160, false) + _t(65, 142, 'C1', 'middle') +
        _w(79, 160, 145, 160) + _d(145, 160) +
        _w(145, 160, 156, 160) + _cap(170, 160, false) + _t(170, 142, 'C2', 'middle') +
        _w(184, 160, 235, 160) +
        _res(145, 160, 145, 205) + _gnd(145, 205) + _t(163, 190, 'R3=R/2') +
        _w(235, 60, 235, 110) + _w(235, 160, 235, 110) + _d(235, 110) +
        _w(235, 110, 275, 110) + _t(280, 100, 'Vout'))
};

/* ---- 器件字段渲染（仅架构切换时重建 DOM） ---- */
function renderCompFields(s) {
    var html = '';
    ARCHS[s.arch].comps.forEach(function (pair) {
        html += '<div class="field"><label>' + pair[1] + '</label>' +
                '<div class="iu-row"><input type="text" data-key="' + pair[0] + '">' +
                '<span class="unit">' + (pair[0][0] === 'R' ? 'Ω' : 'F') + '</span></div></div>';
    });
    el.compFields.innerHTML = html;
}

function fillCompInputs(exceptKey) {
    var inps = el.compFields.querySelectorAll('input');
    for (var i = 0; i < inps.length; i++) {
        var k = inps[i].getAttribute('data-key');
        if (k === exceptKey) continue;
        inps[i].value = formatEngineering(comp[k]);
    }
}

function applyArchVisibility(s) {
    var fs = ARCHS[s.arch].freq;
    el.fcField.style.display = fs.indexOf('fc') >= 0 ? '' : 'none';
    el.fLField.style.display = fs.indexOf('fL') >= 0 ? '' : 'none';
    el.fHField.style.display = fs.indexOf('fH') >= 0 ? '' : 'none';
    el.f0Field.style.display = fs.indexOf('f0') >= 0 ? '' : 'none';
    el.qField.style.display = fs.indexOf('q0') >= 0 ? '' : 'none';
    el.topoFig.innerHTML = TOPO_SVGS[s.arch] || '';
}

/* ---- 结果渲染 ---- */
function renderResults(s) {
    /* 器件表 + 面积 */
    var list = compList(s, comp);
    var rhoCf = s.rhoC * 1e-15;
    var html = '', aR = 0, aC = 0;
    list.forEach(function (row) {
        var area = row[2] === 'R' ? row[1] / s.rhoR : row[1] / rhoCf;
        if (row[2] === 'R') aR += area; else aC += area;
        html += '<tr><td>' + row[0] + '</td><td>' + fmt(row[1], row[2] === 'R' ? 'Ω' : 'F') + '</td>' +
                '<td>' + formatEngineering(area) + '</td></tr>';
    });
    el.compBody.innerHTML = html;
    el.areaInfo.textContent = '总面积 ≈ ' + formatEngineering(aR + aC) + ' µm²（R ' +
        formatEngineering(aR) + ' + C ' + formatEngineering(aC) + '）';

    /* 阻带校验 */
    if (s.fst > 0 && !isNaN(s.astop)) {
        var atten = -20 * Math.log10(Math.max(respH(s, s.fst), 1e-12));
        var txt = 'fst = ' + formatEngineering(s.fst) + 'Hz 处实际衰减 ≈ ' + atten.toFixed(1) +
                  ' dB（目标 ' + s.astop + ' dB → ' + (atten >= s.astop ? '满足' : '不满足') + '）';
        var nReq = null;
        if ((s.arch === 'rc-lp' || s.arch === 'sk-lp') && s.fst > s.fc) {
            nReq = Math.ceil(s.astop / (20 * Math.log10(s.fst / s.fc)));
        } else if ((s.arch === 'rc-hp' || s.arch === 'sk-hp') && s.fst < s.fc) {
            nReq = Math.ceil(s.astop / (20 * Math.log10(s.fc / s.fst)));
        }
        if (nReq !== null && isFinite(nReq) && nReq > 0) {
            txt += '；按 20n dB/dec 估算约需 ' + nReq + ' 阶';
        }
        el.stopInfo.textContent = txt;
    } else {
        el.stopInfo.textContent = '';
    }

    /* 绘图频段 */
    var fref = s.arch === 'rc-bp' ? Math.sqrt(s.fL * s.fH) : ((s.arch === 'mfb-bp' || s.arch === 'notch') ? s.f0 : s.fc);
    var fLo = fref / 100, fHi = fref * 100, N = 400;
    var freqs = [], mags = [], noise = [];
    var Rsum = sumR(s, comp);
    var en2c = 4 * KB * s.T * Rsum;   // V²/Hz
    var integ = 0, fPrev = null, ePrev = 0;
    for (var i = 0; i <= N; i++) {
        var f = fLo * Math.pow(fHi / fLo, i / N);
        var h = respH(s, f);
        freqs.push(f);
        mags.push(20 * Math.log10(Math.max(h, 1e-9)));
        var en = Math.sqrt(en2c) * h * 1e9;   // nV/√Hz
        noise.push(Math.max(en, 1e-6));
        if (fPrev !== null) integ += 0.5 * (en2c * h * h + ePrev) * (f - fPrev);
        fPrev = f; ePrev = en2c * h * h;
    }
    var vrms = Math.sqrt(integ);
    el.noiseInfo.textContent = 'ΣRᵢ = ' + fmt(Rsum, 'Ω') + ' ｜ 输出积分噪声 ≈ ' +
        fmt(vrms, 'Vrms') + '（' + formatEngineering(fLo) + 'Hz ~ ' + formatEngineering(fHi) + 'Hz 频段内数值积分）';

    /* 特征频率标记 */
    var markers = [];
    if (s.arch === 'rc-bp') { markers.push({ f: s.fL }, { f: s.fH }); }
    else if (s.arch === 'mfb-bp' || s.arch === 'notch') { markers.push({ f: s.f0 }); }
    else { markers.push({ f: s.fc }); }
    if (s.fst > 0) markers.push({ f: s.fst, accent: true });

    drawPlot('magCanvas', freqs, mags, {
        color: '#3a5a8c', yMin: -90, yMax: 5, yGrid: [-80, -60, -40, -20, -3, 0], yUnit: ' dB', markers: markers
    });
    drawPlot('noiseCanvas', freqs, noise, {
        color: '#c0583a', yLog: true, yUnit: ' nV/√Hz', markers: markers
    });
}

/* ---- Canvas 绘制（对数频轴） ---- */
function drawPlot(canvasId, freqs, vals, opts) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.width;
    var h = canvas.clientHeight || canvas.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var PAD = { top: 16, right: 20, bottom: 34, left: 60 };
    var cw = w - PAD.left - PAD.right;
    var ch = h - PAD.top - PAD.bottom;

    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, w, h);

    var yMin, yMax, yGrid;
    if (opts.yLog) {
        var mn = Infinity, mx = -Infinity;
        vals.forEach(function (v) { if (v < mn) mn = v; if (v > mx) mx = v; });
        var lo = Math.floor(Math.log10(mn)), hi = Math.ceil(Math.log10(mx));
        yMin = lo; yMax = hi; yGrid = [];
        for (var d = lo; d <= hi; d++) yGrid.push(d);
    } else {
        yMin = opts.yMin; yMax = opts.yMax; yGrid = opts.yGrid;
    }

    var logFmin = Math.log10(freqs[0]);
    var logFmax = Math.log10(freqs[freqs.length - 1]);

    function xPos(f) { return PAD.left + (Math.log10(f) - logFmin) / (logFmax - logFmin) * cw; }
    function yPos(v) {
        var t = opts.yLog ? Math.log10(v) : v;
        return PAD.top + (1 - (t - yMin) / (yMax - yMin)) * ch;
    }

    /* 频率网格 */
    var dec = Math.ceil(logFmin);
    while (dec <= logFmax) {
        var xg = xPos(Math.pow(10, dec));
        ctx.beginPath();
        ctx.moveTo(xg, PAD.top);
        ctx.lineTo(xg, PAD.top + ch);
        ctx.strokeStyle = '#e8e2d8';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#8a8a8a';
        ctx.font = '11px Fira Code, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(formatEngineering(Math.pow(10, dec)) + 'Hz', xg, PAD.top + ch + 16);
        dec++;
    }

    /* Y 网格 */
    yGrid.forEach(function (gv) {
        var y = yPos(opts.yLog ? Math.pow(10, gv) : gv);
        if (y < PAD.top - 1 || y > PAD.top + ch + 1) return;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(PAD.left + cw, y);
        ctx.strokeStyle = gv === 0 ? '#b8b0a0' : '#e8e2d8';
        ctx.lineWidth = gv === 0 ? 1.5 : 1;
        ctx.stroke();
        ctx.fillStyle = '#8a8a8a';
        ctx.font = '11px Fira Code, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(opts.yLog ? '1e' + gv : String(gv), PAD.left - 4, y + 4);
    });

    /* 轴框 */
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD.left, PAD.top, cw, ch);

    /* 特征频率标记 */
    (opts.markers || []).forEach(function (mk) {
        if (mk.f <= freqs[0] || mk.f >= freqs[freqs.length - 1]) return;
        var x = xPos(mk.f);
        ctx.beginPath();
        ctx.moveTo(x, PAD.top);
        ctx.lineTo(x, PAD.top + ch);
        ctx.strokeStyle = mk.accent ? '#c0583a' : '#b8b0a0';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
    });

    /* 曲线 */
    ctx.beginPath();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    for (var i = 0; i < freqs.length; i++) {
        var px = xPos(freqs[i]);
        var py = yPos(vals[i]);
        py = Math.max(PAD.top, Math.min(PAD.top + ch, py));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();
}

/* ---- 主流程 ---- */
function fullUpdate() {
    var s = getSpecs();
    var err = validSpecs(s);
    applyArchVisibility(s);
    if (err) {
        el.stopInfo.textContent = err;
        el.compBody.innerHTML = '';
        el.areaInfo.textContent = '';
        el.noiseInfo.textContent = '';
        return;
    }
    renderCompFields(s);
    comp = designOptimal(s);
    fillCompInputs(null);
    renderResults(s);
}

function refreshAfterEdit(editedKey) {
    var s = getSpecs();
    if (validSpecs(s)) return;
    fillCompInputs(editedKey);
    renderResults(s);
}

/* 器件字段：事件委托 */
el.compFields.addEventListener('input', function (e) {
    var inp = e.target;
    if (inp.tagName !== 'INPUT') return;
    var key = inp.getAttribute('data-key');
    var v = parseVal(inp.value);
    if (!(v > 0)) return;
    var s = getSpecs();
    if (validSpecs(s)) return;
    comp[key] = v;
    solveFrom(key, v, s, comp);
    fillCompInputs(key);
    renderResults(s);
});

el.optBtn.addEventListener('click', function () {
    var s = getSpecs();
    if (validSpecs(s)) return;
    comp = designOptimal(s);
    fillCompInputs(null);
    renderResults(s);
});

/* 规格输入：重新设计 */
['fc', 'fL', 'fH', 'f0', 'q0', 'fst', 'astop', 'rhoR', 'rhoC', 'tempK'].forEach(function (id) {
    el[id].addEventListener('input', fullUpdate);
    el[id].addEventListener('change', fullUpdate);
});
el.arch.addEventListener('change', fullUpdate);

/* ---- 初始化 ---- */
fullUpdate();

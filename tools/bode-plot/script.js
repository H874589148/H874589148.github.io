/* tools/bode-plot/script.js - Bode 图绘制（纯 Canvas，无第三方依赖） */

/* ========== 数据结构 ========== */
var poles = [];   // [{freq: Hz}]
var zeros = [];   // [{freq: Hz}]
var poleCount = 0;
var zeroCount = 0;

/* 绘区边距（drawCanvas 与鼠标取点共用）与最近绘制频率范围 */
var PLOT_PAD = { top: 16, right: 20, bottom: 36, left: 54 };
var lastRange = { fStart: 1, fEnd: 1e8 };

/* ========== 初始化 ========== */
loadPreset('singlePole');

/* ========== 直流增益单位联动 (dB <-> V/V) ========== */
function getGainK() {
    // 返回线性增益 K（供 calcH 使用）
    var v = parseFloat(document.getElementById('dcGain').value) || 0;
    var unit = document.getElementById('dcUnit').value;
    return unit === 'dB' ? Math.pow(10, v / 20) : v;
}

function updateGainConv() {
    var v = parseFloat(document.getElementById('dcGain').value);
    var unit = document.getElementById('dcUnit').value;
    var conv = document.getElementById('dcConv');
    if (isNaN(v)) { conv.textContent = ''; return; }
    if (unit === 'dB') {
        var vv = Math.pow(10, v / 20);
        conv.textContent = fmtNum(v) + ' dB = ' + fmtNum(vv) + ' V/V';
    } else {
        if (v <= 0) { conv.textContent = fmtNum(v) + ' V/V （需 > 0 才能换算 dB）'; return; }
        var db = 20 * Math.log10(v);
        conv.textContent = fmtNum(v) + ' V/V = ' + fmtNum(db) + ' dB';
    }
}

function onGainUnitChange() {
    // 切换单位时把当前值换算并回填另一种表示
    var el = document.getElementById('dcGain');
    var unit = document.getElementById('dcUnit').value;
    var v = parseFloat(el.value);
    if (!isNaN(v)) {
        if (unit === 'vv') {
            // 之前是 dB，现在显示 V/V
            el.value = fmtNum(Math.pow(10, v / 20));
        } else {
            // 之前是 V/V，现在显示 dB
            el.value = v > 0 ? fmtNum(20 * Math.log10(v)) : 0;
        }
    }
    updateGainConv();
    drawBode();
}

function fmtNum(x) {
    if (!isFinite(x)) return '∞';
    var r = Math.round(x * 1000) / 1000;
    return (Math.abs(r) >= 1e4 || (r !== 0 && Math.abs(r) < 1e-3)) ? r.toExponential(2) : String(r);
}

document.getElementById('dcGain').addEventListener('input', function(){ updateGainConv(); drawBode(); });
document.getElementById('dcUnit').addEventListener('change', onGainUnitChange);
updateGainConv();

/* ========== 极点/零点管理 ========== */
function addPole(freq) {
    freq = freq || 10000;
    hidePresetInfo();
    poleCount++;
    var id = 'p' + poleCount;
    poles.push({ id: id, freq: freq });
    renderPZList('poleList', poles, 'pole');
    drawBode();
}

function addZero(freq) {
    freq = freq || 1000;
    hidePresetInfo();
    zeroCount++;
    var id = 'z' + zeroCount;
    zeros.push({ id: id, freq: freq });
    renderPZList('zeroList', zeros, 'zero');
    drawBode();
}

function removePZ(type, id) {
    hidePresetInfo();
    if (type === 'pole') {
        poles = poles.filter(function(p){ return p.id !== id; });
        renderPZList('poleList', poles, 'pole');
    } else {
        zeros = zeros.filter(function(z){ return z.id !== id; });
        renderPZList('zeroList', zeros, 'zero');
    }
    drawBode();
}

function renderPZList(containerId, list, type) {
    var el = document.getElementById(containerId);
    el.innerHTML = '';
    list.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'pz-row';
        row.innerHTML =
            '<span class="pz-type">' + (type === 'pole' ? 'fp' : 'fz') + '</span>' +
            '<input type="number" value="' + item.freq + '" step="any" min="0" ' +
                'onchange="updatePZ(\'' + type + '\',\'' + item.id + '\',this.value)">' +
            '<span class="pz-unit">Hz</span>' +
            '<button class="pz-del" onclick="removePZ(\'' + type + '\',\'' + item.id + '\')" title="删除">×</button>';
        el.appendChild(row);
    });
}

function updatePZ(type, id, val) {
    var freq = parseFloat(val);
    if (isNaN(freq) || freq <= 0) return;
    hidePresetInfo();
    var list = type === 'pole' ? poles : zeros;
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { list[i].freq = freq; break; }
    }
    drawBode();
}

/* ========== 预设配置 ========== */
function loadPreset(name) {
    poles = []; zeros = [];
    poleCount = 0; zeroCount = 0;

    var presets = {
        singlePole: {
            dc: 20,
            poles: [10000],
            zeros: []
        },
        typeII: {
            dc: 40,
            poles: [0.001, 100000],  // 原点极点用 0.001 近似
            zeros: [1000]
        },
        typeIII: {
            dc: 60,
            poles: [0.001, 50000, 200000],
            zeros: [500, 2000]
        },
        notch: {
            dc: 0,
            poles: [5000, 5000],
            zeros: [5000]
        }
    };

    var cfg = presets[name];
    if (!cfg) return;

    // 预设 dc 字段统一以 dB 标注
    document.getElementById('dcUnit').value = 'dB';
    document.getElementById('dcGain').value = cfg.dc;
    updateGainConv();
    cfg.poles.forEach(function(f){ addPole(f); });
    cfg.zeros.forEach(function(f){ addZero(f); });
    updatePresetInfo(name);
}

/* ========== Bode 计算 ========== */
function calcH(f) {
    var w = 2 * Math.PI * f;
    var K = getGainK();  // 统一用线性增益参与计算

    // 传递函数 H(jω) = K * Π(1 + jω/wz) / Π(1 + jω/wp)
    // 对于原点极点近似为 0.001Hz -> 实际是积分器
    var magNum = K;
    var phaseNum = 0;  // degrees

    zeros.forEach(function(z) {
        var wz = 2 * Math.PI * z.freq;
        var re = 1;
        var im = w / wz;
        magNum *= Math.sqrt(re*re + im*im);
        phaseNum += Math.atan2(im, re) * 180 / Math.PI;
    });

    var magDen = 1;
    var phaseDen = 0;

    poles.forEach(function(p) {
        var wp = 2 * Math.PI * Math.max(p.freq, 1e-6);
        var re = 1;
        var im = w / wp;
        magDen *= Math.sqrt(re*re + im*im);
        phaseDen += Math.atan2(im, re) * 180 / Math.PI;
    });

    var mag = 20 * Math.log10(magNum / magDen);
    var phase = phaseNum - phaseDen;
    return { mag: mag, phase: phase };
}

/* ========== Canvas 绘制 ========== */
function drawBode() {
    var fStart = parseFloat(document.getElementById('freqStart').value) || 1;
    var fEnd   = parseFloat(document.getElementById('freqEnd').value)   || 1e8;
    if (fStart <= 0) fStart = 0.01;
    if (fEnd <= fStart) fEnd = fStart * 1000;

    var N = 500;  // 采样点数
    var freqs = [];
    for (var i = 0; i <= N; i++) {
        freqs.push(Math.pow(10, Math.log10(fStart) + i * (Math.log10(fEnd) - Math.log10(fStart)) / N));
    }

    var mags = [], phases = [];
    freqs.forEach(function(f) {
        var h = calcH(f);
        mags.push(h.mag);
        phases.push(h.phase);
    });

    // 零极点标记（曲线对应频率处：极点红 ×，零点蓝 ○）
    var magMk = [], phMk = [];
    poles.concat(zeros).forEach(function (it, idx) {
        var kind = idx < poles.length ? 'pole' : 'zero';
        var h = calcH(Math.max(it.freq, 1e-6));
        magMk.push({ f: it.freq, y: h.mag, kind: kind });
        phMk.push({ f: it.freq, y: h.phase, kind: kind });
    });

    drawCanvas('magCanvas', freqs, mags, {
        color: '#3a5a8c',
        yLabel: 'dB',
        yUnit: 'dB',
        gridLines: [-40,-20,0,20,40,60,80],
        zeroLine: 0,
        markers: magMk
    });

    drawCanvas('phaseCanvas', freqs, phases, {
        color: '#c0583a',
        yLabel: '°',
        yUnit: '°',
        gridLines: [-180,-135,-90,-45,0,45,90],
        zeroLine: -180,
        markers: phMk
    });

    lastRange.fStart = freqs[0];
    lastRange.fEnd = freqs[freqs.length - 1];

    // 计算裕度
    calcMargins(freqs, mags, phases);
}

function drawCanvas(canvasId, freqs, vals, opts) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.width;
    var h = canvas.clientHeight || canvas.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var PAD = PLOT_PAD;
    var cw = w - PAD.left - PAD.right;
    var ch = h - PAD.top - PAD.bottom;

    // 背景
    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, w, h);

    // 确定 Y 轴范围
    var yMin = Math.min.apply(null, vals) - 10;
    var yMax = Math.max.apply(null, vals) + 10;
    // 对 phase 固定范围
    if (opts.yUnit === '°') { yMin = -200; yMax = 100; }

    var logFmin = Math.log10(freqs[0]);
    var logFmax = Math.log10(freqs[freqs.length - 1]);

    function xPos(f) { return PAD.left + (Math.log10(f) - logFmin) / (logFmax - logFmin) * cw; }
    function yPos(v) { return PAD.top + (1 - (v - yMin) / (yMax - yMin)) * ch; }

    // 网格 - 频率（对数刻度）
    ctx.strokeStyle = '#e8e2d8';
    ctx.lineWidth = 1;
    var dec = Math.floor(logFmin);
    while (dec <= logFmax) {
        for (var m = 1; m <= 9; m++) {
            var fGrid = m * Math.pow(10, dec);
            if (fGrid >= freqs[0] && fGrid <= freqs[freqs.length-1]) {
                var x = xPos(fGrid);
                ctx.beginPath();
                ctx.moveTo(x, PAD.top);
                ctx.lineTo(x, PAD.top + ch);
                ctx.strokeStyle = m === 1 ? '#d0c8b8' : '#e8e2d8';
                ctx.stroke();
            }
        }
        dec++;
    }

    // 网格 - Y 轴
    opts.gridLines.forEach(function(v) {
        var y = yPos(v);
        if (y < PAD.top || y > PAD.top + ch) return;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(PAD.left + cw, y);
        ctx.strokeStyle = v === 0 || v === -180 ? '#b8b0a0' : '#e8e2d8';
        ctx.lineWidth = v === 0 || v === -180 ? 1.5 : 1;
        ctx.stroke();

        // Y 轴标签
        ctx.fillStyle = '#8a8a8a';
        ctx.font = '11px Fira Code, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(v + opts.yUnit, PAD.left - 4, y + 4);
    });

    // X 轴标签
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '11px Fira Code, monospace';
    ctx.textAlign = 'center';
    dec = Math.floor(logFmin);
    while (dec <= logFmax) {
        var f = Math.pow(10, dec);
        if (f >= freqs[0] && f <= freqs[freqs.length-1]) {
            var x = xPos(f);
            ctx.fillText(fmtFreq(f), x, PAD.top + ch + 16);
        }
        dec++;
    }

    // 轴框
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD.left, PAD.top, cw, ch);

    // 绘制曲线（手绘效果：轻微抖动）
    ctx.beginPath();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (var i = 0; i < freqs.length; i++) {
        var px = xPos(freqs[i]);
        var py = yPos(vals[i]);
        // 限制在绘图区
        py = Math.max(PAD.top, Math.min(PAD.top + ch, py));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 零极点标记：极点红 ×，零点蓝 ○ + 频率文字
    if (opts.markers) {
        opts.markers.forEach(function (mk) {
            if (mk.f < freqs[0] || mk.f > freqs[freqs.length - 1]) return;
            var mx = xPos(Math.max(mk.f, 1e-9));
            var my = Math.max(PAD.top + 6, Math.min(PAD.top + ch - 6, yPos(mk.y)));
            ctx.lineWidth = 2;
            if (mk.kind === 'pole') {
                ctx.strokeStyle = '#c0583a';
                ctx.beginPath();
                ctx.moveTo(mx - 5, my - 5); ctx.lineTo(mx + 5, my + 5);
                ctx.moveTo(mx + 5, my - 5); ctx.lineTo(mx - 5, my + 5);
                ctx.stroke();
            } else {
                ctx.strokeStyle = '#3a5a8c';
                ctx.beginPath();
                ctx.arc(mx, my, 5, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.fillStyle = mk.kind === 'pole' ? '#c0583a' : '#3a5a8c';
            ctx.font = '10px Fira Code, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(fmtFreq(mk.f), mx, mk.kind === 'pole' ? my - 10 : my + 18);
        });
    }
}

function fmtFreq(f) {
    if (f >= 1e6) return (f/1e6).toFixed(0) + 'M';
    if (f >= 1e3) return (f/1e3).toFixed(0) + 'k';
    return f.toFixed(0);
}

function calcMargins(freqs, mags, phases) {
    // 穿越频率（0dB 点）
    var fc = null;
    var pm = null;
    for (var i = 1; i < mags.length; i++) {
        if (mags[i-1] > 0 && mags[i] <= 0) {
            // 线性插值
            var t = (0 - mags[i-1]) / (mags[i] - mags[i-1]);
            fc = freqs[i-1] * Math.pow(freqs[i]/freqs[i-1], t);
            var phaseAtFc = phases[i-1] + t * (phases[i] - phases[i-1]);
            pm = phaseAtFc + 180;
            break;
        }
    }

    // 相位穿越频率（-180° 点）
    var fpc = null;
    var gm = null;
    for (var i = 1; i < phases.length; i++) {
        if (phases[i-1] > -180 && phases[i] <= -180) {
            var t = (-180 - phases[i-1]) / (phases[i] - phases[i-1]);
            fpc = freqs[i-1] * Math.pow(freqs[i]/freqs[i-1], t);
            var magAtFpc = mags[i-1] + t * (mags[i] - mags[i-1]);
            gm = -magAtFpc;
            break;
        }
    }

    var disp = document.getElementById('marginDisplay');
    disp.style.display = 'flex';

    document.getElementById('pmVal').textContent = pm !== null ? pm.toFixed(1) + '°' : '> 180°（稳定）';
    document.getElementById('gmVal').textContent = gm !== null ? gm.toFixed(1) + ' dB' : '∞（稳定）';
    document.getElementById('fcVal').textContent = fc !== null ? fmtFreq(fc) + 'Hz' : 'N/A';
}

/* ========== Type-II / Type-III 预设拓扑公式卡 ========== */
/* 手绘 SVG helpers（与 filter-design 同风格） */
function _p(d) { return '<path d="' + d + '" class="tw"/>'; }
function _w(x1, y1, x2, y2) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="tw"/>'; }
function _d(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="3" class="td"/>'; }
function _t(x, y, s, anchor) { return '<text x="' + x + '" y="' + y + '" class="tl"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + s + '</text>'; }
function _gnd(x, y) {
    return _p('M' + x + ',' + y + ' L' + x + ',' + (y + 8) + ' M' + (x - 10) + ',' + (y + 8) + ' L' + (x + 10) + ',' + (y + 8) +
              ' M' + (x - 6) + ',' + (y + 13) + ' L' + (x + 6) + ',' + (y + 13) + ' M' + (x - 2.5) + ',' + (y + 18) + ' L' + (x + 2.5) + ',' + (y + 18));
}
function _svg(w, h, body) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" class="topo-svg">' + body + '</svg>';
}
/* 折线电阻（任意方向）：两端引线 lead=8，6 段锯齿、幅 7 */
function _res(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len, uy = dy / len, px = -uy, py = ux;
    var lead = 8, amp = 7, n = 6, seg = (len - 2 * lead) / n;
    var d = 'M' + x1 + ',' + y1 + ' L' + (x1 + ux * lead) + ',' + (y1 + uy * lead);
    for (var i = 1; i < n; i++) {
        var s = lead + i * seg, off = (i % 2 ? amp : -amp);
        d += ' L' + (x1 + ux * s + px * off).toFixed(1) + ',' + (y1 + uy * s + py * off).toFixed(1);
    }
    d += ' L' + (x2 - ux * lead) + ',' + (y2 - uy * lead) + ' L' + x2 + ',' + y2;
    return _p(d);
}
/* 电容：_capH 水平线竖板（线在 x±4 断开）；_capV 竖直线横板（线在 y±4 断开） */
function _capH(x, y) { return _w(x - 4, y - 9, x - 4, y + 9) + _w(x + 4, y - 9, x + 4, y + 9); }
function _capV(x, y) { return _w(x - 9, y - 4, x + 9, y - 4) + _w(x - 9, y + 4, x + 9, y + 4); }
/* 运放：输入脚 (x-25, y∓12)，输出 (x+28, y)；− 上 + 下 */
function _op(x, y) {
    return _p('M' + (x - 25) + ',' + (y - 28) + ' L' + (x - 25) + ',' + (y + 28) + ' L' + (x + 28) + ',' + y + ' Z') +
           _t(x - 20, y - 8, '−') + _t(x - 20, y + 20, '+');
}

/* Type-II：Vin→R1→反相端；反馈 C1 与 (R2 串 C2) 并联；同相端接地 */
var TYPE2_SVG = _svg(400, 190,
    _t(8, 92, 'Vin') + _w(36, 88, 58, 88) +
    _res(58, 88, 142, 88) + _t(100, 74, 'R1', 'middle') +
    _w(142, 88, 245, 88) + _d(185, 88) +
    _op(270, 100) +
    _w(245, 112, 245, 146) + _gnd(245, 146) +
    _w(298, 100, 346, 100) + _t(352, 96, 'Vout') + _d(320, 100) +
    _w(320, 100, 320, 30) +
    _w(320, 30, 254, 30) + _capH(250, 30) + _w(246, 30, 185, 30) +
    _d(320, 56) + _w(320, 56, 286, 56) +
    _res(286, 56, 222, 56) + _w(222, 56, 204, 56) + _capH(200, 56) + _w(196, 56, 185, 56) +
    _w(185, 30, 185, 88) + _d(185, 56) +
    _t(250, 16, 'C1', 'middle') + _t(254, 44, 'R2', 'middle') + _t(200, 74, 'C2', 'middle'));

/* Type-III：输入侧 R1 串联 (R3 ∥ C3) 到地，反馈网络同 Type-II */
var TYPE3_SVG = _svg(400, 210,
    _t(8, 92, 'Vin') + _w(36, 88, 54, 88) +
    _res(54, 88, 138, 88) + _t(96, 74, 'R1', 'middle') +
    _w(138, 88, 245, 88) + _d(185, 88) +
    _op(270, 100) +
    _w(245, 112, 245, 146) + _gnd(245, 146) +
    _w(298, 100, 350, 100) + _t(356, 96, 'Vout') + _d(322, 100) +
    _w(322, 100, 322, 30) +
    _w(322, 30, 254, 30) + _capH(250, 30) + _w(246, 30, 185, 30) +
    _d(322, 56) + _w(322, 56, 288, 56) +
    _res(288, 56, 224, 56) + _w(224, 56, 206, 56) + _capH(202, 56) + _w(198, 56, 185, 56) +
    _w(185, 30, 185, 104) + _d(185, 56) +
    _w(158, 104, 212, 104) +
    _w(158, 104, 158, 116) + _res(158, 116, 158, 152) + _w(158, 152, 158, 160) + _gnd(158, 160) +
    _w(212, 104, 212, 124) + _capV(212, 128) + _w(212, 132, 212, 160) + _gnd(212, 160) +
    _t(250, 16, 'C1', 'middle') + _t(256, 44, 'R2', 'middle') + _t(202, 74, 'C2', 'middle') +
    _t(150, 138, 'R3', 'end') + _t(224, 132, 'C3'));

var PRESET_INFO = {
    typeII:
        '<h3>Type-II 补偿器：运放 + R1 输入，C1 ∥ (R2 串 C2) 反馈</h3>' +
        '<div class="preset-info-body">' +
            '<div class="preset-info-fig">' + TYPE2_SVG + '</div>' +
            '<div class="preset-info-formulas">' +
                '<div class="formula-box">' +
                    'f<sub>p1</sub> = 0（原点极点，积分器）<br>' +
                    'f<sub>z1</sub> = 1 / (2π·R<sub>2</sub>C<sub>1</sub>)<br>' +
                    'f<sub>p2</sub> = 1 / (2π·R<sub>2</sub>·C<sub>1</sub>C<sub>2</sub>/(C<sub>1</sub>+C<sub>2</sub>)) ≈ 1 / (2π·R<sub>2</sub>C<sub>2</sub>)（C<sub>1</sub>≫C<sub>2</sub>）' +
                '</div>' +
                '<div class="info-box" style="margin:0;">' +
                    'G(s) = −(1+sR<sub>2</sub>C<sub>1</sub>) / [s·R<sub>1</sub>(C<sub>1</sub>+C<sub>2</sub>)(1+sR<sub>2</sub>·C<sub>1</sub>C<sub>2</sub>/(C<sub>1</sub>+C<sub>2</sub>))]，中频增益 ≈ R<sub>2</sub>/R<sub>1</sub>。<br>' +
                    '左侧预设：f<sub>p1</sub> 以 0.001 Hz 近似原点极点；f<sub>z1</sub>=1kHz、f<sub>p2</sub>=100kHz 可按上式由器件值换算。' +
                '</div>' +
            '</div>' +
        '</div>',
    typeIII:
        '<h3>Type-III 补偿器：输入 R1 串 (R3 ∥ C3)，反馈网络同 Type-II</h3>' +
        '<div class="preset-info-body">' +
            '<div class="preset-info-fig">' + TYPE3_SVG + '</div>' +
            '<div class="preset-info-formulas">' +
                '<div class="formula-box">' +
                    'f<sub>p1</sub> = 0（原点极点，积分器）<br>' +
                    'f<sub>z1</sub> = 1 / (2π·R<sub>2</sub>C<sub>1</sub>)<br>' +
                    'f<sub>z2</sub> = 1 / (2π·(R<sub>1</sub>+R<sub>3</sub>)C<sub>3</sub>)<br>' +
                    'f<sub>p2</sub> ≈ 1 / (2π·R<sub>2</sub>C<sub>2</sub>)（C<sub>1</sub>≫C<sub>2</sub>）<br>' +
                    'f<sub>p3</sub> = 1 / (2π·R<sub>3</sub>C<sub>3</sub>)' +
                '</div>' +
                '<div class="info-box" style="margin:0;">' +
                    'Type-III 在 Type-II 基础上由 R<sub>3</sub>C<sub>3</sub> 引入第二对零极点，常用于电压模式 Buck（LC 双极点输出级）补偿。<br>' +
                    '左侧预设：f<sub>z1</sub>=500Hz、f<sub>z2</sub>=2kHz 与 f<sub>p2</sub>=50kHz、f<sub>p3</sub>=200kHz 对应；f<sub>p1</sub> 以 0.001 Hz 近似原点极点。' +
                '</div>' +
            '</div>' +
        '</div>'
};

function updatePresetInfo(name) {
    var el = document.getElementById('presetInfo');
    if (typeof PRESET_INFO !== 'undefined' && PRESET_INFO[name]) {
        el.innerHTML = PRESET_INFO[name];
        el.style.display = '';
    } else {
        el.style.display = 'none';
    }
}
function hidePresetInfo() {
    document.getElementById('presetInfo').style.display = 'none';
}

/* ========== 传递函数表达式解析（s 多项式分式） ========== */
/* 支持 s、s^2/s²/s³、科学计数法、+ - * / 与括号、隐式乘法（如 2e4*s、2(s+1)）；
   不支持延迟项 e^(−sτ) 与超越函数（明确报错）。 */

function tokenizeTF(src) {
    var toks = [];
    var i = 0;
    while (i < src.length) {
        var ch = src[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (/[0-9.]/.test(ch)) {
            var m = src.slice(i).match(/^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/);
            if (!m) throw new Error('数字解析失败（位置 ' + (i + 1) + '）');
            toks.push({ t: 'num', v: parseFloat(m[0]) });
            i += m[0].length;
            continue;
        }
        if (ch === 's' || ch === 'S') { toks.push({ t: 's' }); i++; continue; }
        if (ch === 'e' || ch === 'E') {
            throw new Error('检测到字母 e：仅支持 s 的多项式分式，不支持延迟项 e^(−sτ) 或自然常数 e');
        }
        if ('+-*/^()'.indexOf(ch) >= 0) { toks.push({ t: ch }); i++; continue; }
        if (ch === '²') { toks.push({ t: '^' }); toks.push({ t: 'num', v: 2 }); i++; continue; }
        if (ch === '³') { toks.push({ t: '^' }); toks.push({ t: 'num', v: 3 }); i++; continue; }
        if (/[a-zA-Z]/.test(ch)) throw new Error('无法识别的符号「' + ch + '」：仅支持 s 的多项式分式，不支持延迟项/超越函数');
        throw new Error('无法识别的字符「' + ch + '」');
    }
    return toks;
}

/* 多项式运算（系数升幂数组） */
function pAdd(a, b) { var n = Math.max(a.length, b.length), r = []; for (var i = 0; i < n; i++) r.push((a[i] || 0) + (b[i] || 0)); return r; }
function pSub(a, b) { var n = Math.max(a.length, b.length), r = []; for (var i = 0; i < n; i++) r.push((a[i] || 0) - (b[i] || 0)); return r; }
function pMul(a, b) {
    var r = [], i, j;
    for (i = 0; i < a.length + b.length - 1; i++) r.push(0);
    for (i = 0; i < a.length; i++) for (j = 0; j < b.length; j++) r[i + j] += a[i] * b[j];
    return r;
}
function pScale(a, c) { return a.map(function (v) { return v * c; }); }
function pPow(a, n) { var r = [1]; for (var i = 0; i < n; i++) r = pMul(r, a); return r; }

/* 递归下降解析：expr → 升幂系数数组 */
function parsePolyStr(str) {
    var toks = tokenizeTF(str);
    var pos = 0;
    function peek() { return toks[pos]; }
    function parseFactor() {
        var tk = peek();
        if (!tk) throw new Error('表达式不完整');
        if (tk.t === '+') { pos++; return parseFactor(); }
        if (tk.t === '-') { pos++; return pScale(parseFactor(), -1); }
        var base;
        if (tk.t === 'num') { pos++; base = [tk.v]; }
        else if (tk.t === 's') { pos++; base = [0, 1]; }
        else if (tk.t === '(') {
            pos++;
            base = parseExpr();
            if (!peek() || peek().t !== ')') throw new Error('括号不匹配');
            pos++;
        } else throw new Error('此处应为数字、s 或括号');
        if (peek() && peek().t === '^') {
            pos++;
            var e = peek();
            if (!e || e.t !== 'num' || e.v !== Math.floor(e.v) || e.v < 0 || e.v > 8)
                throw new Error('幂指数仅支持 0~8 的非负整数');
            pos++;
            base = pPow(base, e.v);
        }
        return base;
    }
    function parseTerm() {
        var left = parseFactor();
        while (peek()) {
            var tk = peek();
            if (tk.t === '*') { pos++; left = pMul(left, parseFactor()); }
            else if (tk.t === '/') {
                pos++;
                var d = parseFactor();
                if (d.length > 1 || d[0] === 0) throw new Error('除法仅支持除以常数；分母请整体写在最外层 / 右侧');
                left = pScale(left, 1 / d[0]);
            }
            else if (tk.t === 'num' || tk.t === 's' || tk.t === '(') { left = pMul(left, parseFactor()); }  // 隐式乘法
            else break;
        }
        return left;
    }
    function parseExpr() {
        var left = parseTerm();
        while (peek() && (peek().t === '+' || peek().t === '-')) {
            var op = toks[pos++].t;
            left = op === '+' ? pAdd(left, parseTerm()) : pSub(left, parseTerm());
        }
        return left;
    }
    var r = parseExpr();
    if (pos < toks.length) throw new Error('表达式存在无法解析的剩余部分');
    /* 去除高次零系数（含浮点尘埃） */
    var cmax = 0;
    r.forEach(function (v) { cmax = Math.max(cmax, Math.abs(v)); });
    while (r.length > 1 && Math.abs(r[r.length - 1]) <= cmax * 1e-12) r.pop();
    return r;
}

/* 按最外层 / 拆分为 分子/分母 两个多项式 */
function parseTFExpr(src) {
    var depth = 0, slash = -1;
    for (var i = 0; i < src.length; i++) {
        var ch = src[i];
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth < 0) throw new Error('括号不匹配'); }
        else if (ch === '/' && depth === 0) {
            if (slash >= 0) throw new Error('仅支持一个最外层除号（分子 / 分母）');
            slash = i;
        }
    }
    if (depth !== 0) throw new Error('括号不匹配');
    var num = parsePolyStr(slash >= 0 ? src.slice(0, slash) : src);
    var den = slash >= 0 ? parsePolyStr(src.slice(slash + 1)) : [1];
    if (den.length === 1 && den[0] === 0) throw new Error('分母不能为 0');
    var nz = false;
    num.forEach(function (v) { if (v !== 0) nz = true; });
    if (!nz) throw new Error('分子不能为 0');
    return { num: num, den: den };
}

/* 剥去原点因子（s^k）：返回 {co: 剩余升幂系数, n: 原点根个数} */
function stripOrigin(co) {
    var n = 0;
    while (n < co.length - 1 && co[n] === 0) n++;
    return { co: co.slice(n), n: n };
}

/* 综合除法降阶：升幂多项式 ÷ (s − r) */
function deflateAsc(co, r) {
    var rev = co.slice().reverse();
    var q = [rev[0]];
    for (var i = 1; i < rev.length - 1; i++) q.push(rev[i] + r * q[i - 1]);
    return q.reverse();
}

/* 牛顿迭代求实根（多起点；失败返回 null） */
function newtonRealRoot(co) {
    function f(x) { var v = 0; for (var i = co.length - 1; i >= 0; i--) v = v * x + co[i]; return v; }
    function df(x) { var v = 0; for (var i = co.length - 1; i >= 1; i--) v = v * x + i * co[i]; return v; }
    var starts = [1, -1, 10, -10, 100, -100, 1e3, -1e3, 1e4, -1e4, 1e-2, -1e-2, 1e-4, -1e-4, 1e6, -1e6];
    for (var s = 0; s < starts.length; s++) {
        var x = starts[s];
        for (var it = 0; it < 200; it++) {
            var fv = f(x);
            if (fv === 0) return x;
            var dv = df(x);
            if (dv === 0) break;
            var nx = x - fv / dv;
            if (!isFinite(nx)) break;
            if (Math.abs(nx - x) <= 1e-12 * Math.max(1, Math.abs(nx))) {
                if (Math.abs(f(nx)) <= 1e-6 * Math.max(1, Math.abs(co[0]))) return nx;
                break;
            }
            x = nx;
        }
    }
    return null;
}

/* 多项式求根（升幂系数，常数项非零）：≤2 次解析，≥3 次牛顿 + 综合除法降阶 */
function polyRoots(co) {
    var roots = [];
    while (co.length > 3) {
        var r = newtonRealRoot(co);
        if (r === null) throw new Error('高次多项式未找到实根（可能全为复根）：请拆分为低次因式相乘的形式');
        roots.push({ re: r, im: 0 });
        co = deflateAsc(co, r);
    }
    if (co.length === 3) {
        var a = co[2], b = co[1], c = co[0];
        var disc = b * b - 4 * a * c;
        if (disc >= 0) {
            var sq = Math.sqrt(disc);
            var q = -0.5 * (b + (b >= 0 ? sq : -sq));   // 数值稳定形式
            roots.push({ re: q / a, im: 0 });
            roots.push({ re: c / q, im: 0 });
        } else {
            var re = -b / (2 * a), im = Math.sqrt(-disc) / (2 * a);
            roots.push({ re: re, im: im });
            roots.push({ re: re, im: -im });
        }
    } else if (co.length === 2) {
        roots.push({ re: -co[0] / co[1], im: 0 });
    }
    return roots;
}

/* 解析 TF 表达式并载入零极点列表 + 直流增益 */
function applyTF() {
    var src = document.getElementById('tfExpr').value.trim();
    var msg = document.getElementById('tfMsg');
    function fail(t) { msg.textContent = '✗ ' + t; msg.className = 'hint tf-err'; }
    if (!src) { fail('请输入传递函数表达式，例如 (s+1e4)/(s^2+2e4*s+1e8)'); return; }
    try {
        var tf = parseTFExpr(src);
        var sn = stripOrigin(tf.num);   // 原点零点（s 因子）
        var sd = stripOrigin(tf.den);   // 原点极点
        var gain = sn.co[0] / sd.co[0];
        if (!isFinite(gain) || gain === 0) throw new Error('直流增益无效');
        var zRoots = polyRoots(sn.co);
        var pRoots = polyRoots(sd.co);
        var hasComplex = false, hasRHP = false;
        function fOf(r) {
            if (Math.abs(r.im) > 1e-6 * Math.max(1, Math.abs(r.re))) hasComplex = true;
            if (r.re > 1e-6 * Math.max(1, Math.abs(r.im))) hasRHP = true;
            var a = Math.sqrt(r.re * r.re + r.im * r.im);
            return Math.max(a, 1e-3) / (2 * Math.PI);
        }
        poles = []; zeros = []; poleCount = 0; zeroCount = 0;
        zRoots.forEach(function (r) { zeroCount++; zeros.push({ id: 'z' + zeroCount, freq: fOf(r) }); });
        pRoots.forEach(function (r) { poleCount++; poles.push({ id: 'p' + poleCount, freq: fOf(r) }); });
        var k;
        for (k = 0; k < sn.n; k++) { zeroCount++; zeros.push({ id: 'z' + zeroCount, freq: 0.001 }); }  // 原点零点近似
        for (k = 0; k < sd.n; k++) { poleCount++; poles.push({ id: 'p' + poleCount, freq: 0.001 }); }  // 原点极点近似

        document.getElementById('dcUnit').value = 'dB';
        document.getElementById('dcGain').value = fmtNum(20 * Math.log10(Math.abs(gain)));
        updateGainConv();
        renderPZList('poleList', poles, 'pole');
        renderPZList('zeroList', zeros, 'zero');
        hidePresetInfo();
        drawBode();

        var note = '✓ 已载入：直流增益 ' + fmtNum(20 * Math.log10(Math.abs(gain))) + ' dB，' +
            zeros.length + ' 个零点，' + poles.length + ' 个极点（按 |根|/2π 折算）。';
        if (sn.n + sd.n > 0) note += ' 原点零/极点以 0.001 Hz 近似。';
        if (gain < 0) note += ' 原增益为负：额外 180° 相位未计入。';
        if (hasComplex) note += ' 含共轭复根：已折算为同频一阶因子，谐振峰形仅为近似。';
        if (hasRHP) note += ' 含右半平面根：幅频按 |根| 折算，相频与实际不同。';
        msg.textContent = note;
        msg.className = 'hint';
    } catch (err) {
        fail(err.message);
    }
}

document.getElementById('tfApply').addEventListener('click', applyTF);
document.getElementById('tfExpr').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); applyTF(); }
});

/* ========== 鼠标取点（十字准线 + 读数框） ========== */
function setupProbe(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;
    var wrap = canvas.parentElement;   // .bode-plot-wrap
    var ov = document.createElement('canvas');
    ov.className = 'bode-probe';
    wrap.appendChild(ov);
    var tip = document.createElement('div');
    tip.className = 'bode-tip';
    tip.style.display = 'none';
    wrap.appendChild(tip);

    canvas.addEventListener('mousemove', function (e) {
        var w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        var dpr = window.devicePixelRatio || 1;
        ov.width = w * dpr;
        ov.height = h * dpr;
        var oc = ov.getContext('2d');
        oc.scale(dpr, dpr);
        oc.clearRect(0, 0, w, h);

        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var PAD = PLOT_PAD;
        var cw = w - PAD.left - PAD.right, ch = h - PAD.top - PAD.bottom;
        if (x < PAD.left || x > PAD.left + cw || y < PAD.top || y > PAD.top + ch) {
            tip.style.display = 'none';
            return;
        }
        var lf = Math.log10(lastRange.fStart) +
            (x - PAD.left) / cw * (Math.log10(lastRange.fEnd) - Math.log10(lastRange.fStart));
        var f = Math.pow(10, lf);
        var hv = calcH(f);
        /* 十字准线 */
        oc.strokeStyle = 'rgba(74,74,74,0.55)';
        oc.lineWidth = 1;
        oc.setLineDash([4, 4]);
        oc.beginPath();
        oc.moveTo(x, PAD.top); oc.lineTo(x, PAD.top + ch);
        oc.moveTo(PAD.left, y); oc.lineTo(PAD.left + cw, y);
        oc.stroke();
        oc.setLineDash([]);
        /* 读数框 */
        tip.textContent = 'f = ' + formatEngineering(f) + 'Hz ｜ |H| = ' + hv.mag.toFixed(2) +
            ' dB ｜ ∠H = ' + hv.phase.toFixed(1) + '°';
        tip.style.display = '';
        var tx = x + 14, ty = y + 12;
        if (tx > w - 220) tx = x - 224;
        if (ty > h - 36) ty = y - 34;
        tip.style.left = tx + 'px';
        tip.style.top = ty + 'px';
    });
    canvas.addEventListener('mouseleave', function () {
        var oc = ov.getContext('2d');
        oc.clearRect(0, 0, ov.width, ov.height);
        tip.style.display = 'none';
    });
}
setupProbe('magCanvas');
setupProbe('phaseCanvas');

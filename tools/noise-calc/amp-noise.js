/* tools/noise-calc/amp-noise.js
   放大器结构噪声子标签页：五管 OTA / 套筒式 / 折叠式共源共栅
   （依赖 script.js 的全局常量 k 与 common.js 的 formatEngineering） */

/* ---- tab 切换 ---- */
(function initTabs() {
    var nav = document.getElementById('noiseTabs');
    nav.addEventListener('click', function (e) {
        var btn = e.target.closest('.tab-btn');
        if (!btn) return;
        var key = btn.getAttribute('data-tab');
        var btns = nav.querySelectorAll('.tab-btn');
        var pns = document.querySelectorAll('.tab-panel');
        var i;
        for (i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i] === btn);
        for (i = 0; i < pns.length; i++) pns[i].classList.toggle('active', pns[i].getAttribute('data-panel') === key);
    });
})();

var ae = {};
['ampType', 'ampFig', 'ampT', 'ampGamma', 'ampCox', 'ampKFn', 'ampKFp', 'ampFL', 'ampFH',
 'ampId1', 'ampVov1', 'ampW1', 'ampL1', 'ampIdL', 'ampVovL', 'ampWL', 'ampLL',
 'ampIdF', 'ampVovF', 'ampWF', 'ampLF', 'foldRow', 'ampGmInfo',
 'ampVth', 'ampFc', 'ampVrms', 'ampCanvas'
].forEach(function (id) { ae[id] = document.getElementById(id); });

/* ---- 手绘 SVG helpers（与 filter-design 同风格） ---- */
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
/* MOS 简化符号：栅在左，沟道中心 (x,y)；D 上 S 下，引线端 (x+12, y∓18) */
function _nmos(x, y) {
    return _p('M' + (x - 12) + ',' + y + ' L' + (x - 2) + ',' + y + ' M' + (x - 2) + ',' + (y - 10) + ' L' + (x - 2) + ',' + (y + 10)) +
           '<line x1="' + (x + 2) + '" y1="' + (y - 10) + '" x2="' + (x + 2) + '" y2="' + (y + 10) + '" class="tw thick"/>' +
           _p('M' + (x + 2) + ',' + (y - 6) + ' L' + (x + 12) + ',' + (y - 6) + ' L' + (x + 12) + ',' + (y - 18) +
              ' M' + (x + 2) + ',' + (y + 6) + ' L' + (x + 12) + ',' + (y + 6) + ' L' + (x + 12) + ',' + (y + 18));
}
function _pmos(x, y) {
    return _p('M' + (x - 12) + ',' + y + ' L' + (x - 11) + ',' + y + ' M' + (x - 3) + ',' + y + ' L' + (x - 2) + ',' + y +
              ' M' + (x - 2) + ',' + (y - 10) + ' L' + (x - 2) + ',' + (y + 10)) +
           '<circle cx="' + (x - 7) + '" cy="' + y + '" r="4" class="tw tc"/>' +
           '<line x1="' + (x + 2) + '" y1="' + (y - 10) + '" x2="' + (x + 2) + '" y2="' + (y + 10) + '" class="tw thick"/>' +
           _p('M' + (x + 2) + ',' + (y - 6) + ' L' + (x + 12) + ',' + (y - 6) + ' L' + (x + 12) + ',' + (y - 18) +
              ' M' + (x + 2) + ',' + (y + 6) + ' L' + (x + 12) + ',' + (y + 6) + ' L' + (x + 12) + ',' + (y + 18));
}

var AMP_FIGS = {
    /* 五管 OTA：M1/M2 输入对，M3/M4 电流镜负载（M3 二极管连接），M5 尾电流 */
    'ota5': _svg(380, 290,
        _w(60, 20, 320, 20) + _t(60, 12, 'VDD') +
        _pmos(120, 60) + _pmos(240, 60) +
        _w(132, 42, 132, 20) + _w(252, 42, 252, 20) +
        _p('M228,60 L228,90 L96,90 L96,60 L108,60') +
        _w(132, 78, 132, 132) + _d(132, 90) +
        _w(252, 78, 252, 132) +
        _d(252, 108) + _w(252, 108, 300, 108) + _t(304, 103, 'Vout') +
        _nmos(120, 150) + _nmos(240, 150) +
        _w(108, 150, 76, 150) + _t(72, 145, 'Vin+', 'end') +
        _w(228, 150, 268, 150) + _t(272, 145, 'Vin−') +
        _w(132, 168, 132, 190) + _w(252, 168, 252, 190) + _w(132, 190, 252, 190) + _d(192, 190) +
        _nmos(180, 230) + _w(192, 212, 192, 190) +
        _w(192, 248, 192, 258) + _gnd(192, 258) +
        _w(168, 230, 144, 230) + _t(140, 225, 'Vb', 'end') +
        _t(138, 64, 'M3') + _t(258, 64, 'M4') +
        _t(138, 154, 'M1') + _t(258, 154, 'M2') + _t(206, 234, 'M5')),
    /* 套筒式共源共栅：M7/M8 PMOS 负载，M5/M6 PMOS casc，M3/M4 NMOS casc，M1/M2 输入对，M0 尾管 */
    'telescopic': _svg(380, 340,
        _w(60, 16, 320, 16) + _t(60, 9, 'VDD') +
        _pmos(120, 56) + _pmos(240, 56) +
        _w(132, 38, 132, 16) + _w(252, 38, 252, 16) +
        _w(108, 56, 88, 56) + _t(84, 51, 'Vb2', 'end') +
        _w(228, 56, 288, 56) + _t(292, 51, 'Vb2') +
        _pmos(120, 106) + _pmos(240, 106) +
        _w(132, 74, 132, 88) + _w(252, 74, 252, 88) +
        _w(108, 106, 88, 106) + _t(84, 101, 'Vb3', 'end') +
        _w(228, 106, 288, 106) + _t(292, 101, 'Vb3') +
        _nmos(120, 156) + _nmos(240, 156) +
        _w(132, 124, 132, 138) + _w(252, 124, 252, 138) +
        _d(252, 131) + _w(252, 131, 304, 131) + _t(308, 126, 'Vout') +
        _w(108, 156, 88, 156) + _t(84, 151, 'Vb1', 'end') +
        _w(228, 156, 288, 156) + _t(292, 151, 'Vb1') +
        _nmos(120, 206) + _nmos(240, 206) +
        _w(132, 174, 132, 188) + _w(252, 174, 252, 188) +
        _w(108, 206, 76, 206) + _t(72, 201, 'Vin+', 'end') +
        _w(228, 206, 268, 206) + _t(272, 201, 'Vin−') +
        _w(132, 224, 132, 244) + _w(252, 224, 252, 244) + _w(132, 244, 252, 244) + _d(192, 244) +
        _nmos(180, 282) + _w(192, 264, 192, 244) +
        _w(192, 300, 192, 310) + _gnd(192, 310) +
        _w(168, 282, 148, 282) + _t(144, 277, 'Vb', 'end') +
        _t(140, 32, 'M7') + _t(258, 32, 'M8') +
        _t(138, 110, 'M5') + _t(258, 110, 'M6') +
        _t(138, 160, 'M3') + _t(258, 160, 'M4') +
        _t(142, 222, 'M1') + _t(262, 222, 'M2') + _t(206, 286, 'M0')),
    /* 折叠式：M3/M4 PMOS 偏置电流源；M5/M6 NMOS cascode；M7/M8 NMOS 折叠电流源；M1/M2 输入对 + M0 尾管 */
    'folded': _svg(400, 380,
        _w(60, 16, 340, 16) + _t(60, 9, 'VDD') +
        _pmos(100, 56) + _pmos(280, 56) +
        _w(112, 38, 112, 16) + _w(292, 38, 292, 16) +
        _w(88, 56, 68, 56) + _t(64, 51, 'Vb1', 'end') +
        _w(268, 56, 296, 56) + _t(300, 51, 'Vb1') +
        _w(112, 74, 112, 102) + _w(292, 74, 292, 102) +
        _nmos(100, 120) + _nmos(280, 120) +
        _w(88, 120, 68, 120) + _t(64, 115, 'Vb2', 'end') +
        _w(268, 120, 296, 120) + _t(300, 115, 'Vb2') +
        _d(292, 96) + _w(292, 96, 336, 96) + _t(340, 91, 'Vout') +
        _w(112, 138, 112, 192) + _w(292, 138, 292, 192) +
        _nmos(100, 210) + _nmos(280, 210) +
        _w(88, 210, 68, 210) + _t(64, 205, 'Vb3', 'end') +
        _w(268, 210, 296, 210) + _t(300, 205, 'Vb3') +
        _w(112, 228, 112, 240) + _gnd(112, 240) +
        _w(292, 228, 292, 240) + _gnd(292, 240) +
        _nmos(170, 250) + _nmos(240, 250) +
        _w(182, 232, 182, 156) + _w(182, 156, 112, 156) + _d(112, 156) +
        _w(252, 232, 252, 156) + _w(252, 156, 292, 156) + _d(292, 156) +
        _w(158, 250, 132, 250) + _t(128, 245, 'Vin+', 'end') +
        _w(228, 250, 254, 250) + _t(258, 245, 'Vin−') +
        _w(182, 268, 182, 286) + _w(252, 268, 252, 286) + _w(182, 286, 252, 286) + _d(217, 286) +
        _nmos(205, 322) + _w(217, 286, 217, 304) +
        _w(217, 340, 217, 352) + _gnd(217, 352) +
        _w(193, 322, 172, 322) + _t(168, 317, 'Vb', 'end') +
        _t(128, 62, 'M3') + _t(312, 62, 'M4') +
        _t(128, 126, 'M5') + _t(312, 126, 'M6') +
        _t(128, 216, 'M7') + _t(312, 216, 'M8') +
        _t(150, 274, 'M1', 'end') + _t(266, 274, 'M2') + _t(234, 326, 'M0'))
};

/* ---- 噪声计算 ---- */
function num(el) { return parseFloat(el.value); }

function ampUpdate() {
    var type = ae.ampType.value;
    ae.foldRow.style.display = type === 'folded' ? '' : 'none';
    ae.ampFig.innerHTML = AMP_FIGS[type] || '';

    var T = num(ae.ampT), gamma = num(ae.ampGamma);
    var cox = num(ae.ampCox) * 1e-3;                 // fF/µm² → F/m²
    var KFn = num(ae.ampKFn), KFp = num(ae.ampKFp);
    var fL = num(ae.ampFL), fH = num(ae.ampFH);

    var gm1 = 2 * num(ae.ampId1) * 1e-6 / (num(ae.ampVov1) * 1e-3);
    var gmL = 2 * num(ae.ampIdL) * 1e-6 / (num(ae.ampVovL) * 1e-3);
    var gmF = type === 'folded' ? 2 * num(ae.ampIdF) * 1e-6 / (num(ae.ampVovF) * 1e-3) : 0;
    var W1L1 = num(ae.ampW1) * num(ae.ampL1) * 1e-12;
    var WLLL = num(ae.ampWL) * num(ae.ampLL) * 1e-12;
    var WFLF = num(ae.ampWF) * num(ae.ampLF) * 1e-12;

    if (!(T > 0) || !(gamma > 0) || !(cox > 0) || !(gm1 > 0) || !(gmL > 0) ||
        !(W1L1 > 0) || !(WLLL > 0) || !(fL > 0) || !(fH > fL) ||
        (type === 'folded' && (!(gmF > 0) || !(WFLF > 0)))) {
        ae.ampVth.textContent = '-';
        ae.ampFc.textContent = '-';
        ae.ampVrms.textContent = '-';
        ae.ampGmInfo.textContent = '请检查参数：所有参数需为正，且 fH > fL。';
        return;
    }

    var rL = gmL / gm1, rF = gmF / gm1;
    var kTg8 = 8 * k * T * gamma;
    var vth2, A1f;
    if (type === 'folded') {
        vth2 = 2 * (kTg8 / gm1) * (1 + rF + rL);
        A1f = 2 * (KFn / (cox * W1L1) + rF * rF * KFn / (cox * WFLF) + rL * rL * KFp / (cox * WLLL));
    } else {
        vth2 = 2 * (kTg8 / gm1) * (1 + rL);
        A1f = 2 * (KFn / (cox * W1L1) + rL * rL * KFp / (cox * WLLL));
    }
    var fc = A1f / vth2;
    var vrms = Math.sqrt(vth2 * (fH - fL) + A1f * Math.log(fH / fL));

    ae.ampVth.textContent = formatEngineering(Math.sqrt(vth2) * 1e9) + ' nV/√Hz';
    ae.ampFc.textContent = formatEngineering(fc) + ' Hz';
    ae.ampVrms.textContent = formatEngineering(vrms) + ' Vrms';
    ae.ampGmInfo.textContent = 'gm1 = ' + formatEngineering(gm1) + ' S ｜ gmL/gm1 = ' + rL.toFixed(3) +
        (type === 'folded' ? ' ｜ gmF/gm1 = ' + rF.toFixed(3) : '');

    drawAmpPlot(vth2, A1f, fL, fH);
}

/* ---- log-log 噪声谱（热平台 + 1/f 斜线 + 合成） ---- */
function drawAmpPlot(vth2, A1f, fL, fH) {
    var canvas = ae.ampCanvas;
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

    var N = 300, i;
    var loF = Math.log10(fL), hiF = Math.log10(fH);
    var freqs = [], th = [], fl = [], tot = [];
    var vth = Math.sqrt(vth2) * 1e9;
    var ymin = vth, ymax = vth;
    for (i = 0; i <= N; i++) {
        var f = fL * Math.pow(10, (hiF - loF) * i / N);
        var vf = Math.sqrt(A1f / f) * 1e9;
        var vt = Math.sqrt(vth2 + A1f / f) * 1e9;
        freqs.push(f); th.push(vth); fl.push(vf); tot.push(vt);
        if (vt < ymin) ymin = vt;
        if (vf > ymax) ymax = vf;
        if (vt > ymax) ymax = vt;
    }
    var yLo = Math.floor(Math.log10(Math.max(ymin, 1e-3)));
    var yHi = Math.ceil(Math.log10(ymax));

    function xPos(f) { return PAD.left + (Math.log10(f) - loF) / (hiF - loF) * cw; }
    function yPos(v) { return PAD.top + (1 - (Math.log10(v) - yLo) / (yHi - yLo)) * ch; }

    /* 频率网格 */
    var dec = Math.ceil(loF);
    while (dec <= hiF) {
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
    /* 幅值网格 */
    for (var d = yLo; d <= yHi; d++) {
        var y = yPos(Math.pow(10, d));
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(PAD.left + cw, y);
        ctx.strokeStyle = '#e8e2d8';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#8a8a8a';
        ctx.font = '11px Fira Code, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('1e' + d, PAD.left - 4, y + 4);
    }
    /* 轴框 */
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD.left, PAD.top, cw, ch);

    /* 1/f 拐角标记 */
    var fc = A1f / vth2;
    if (fc > fL && fc < fH) {
        var xf = xPos(fc);
        ctx.beginPath();
        ctx.moveTo(xf, PAD.top);
        ctx.lineTo(xf, PAD.top + ch);
        ctx.strokeStyle = '#b8b0a0';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function plot(vals, color, dash, width) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        if (dash) ctx.setLineDash(dash);
        for (var i = 0; i < vals.length; i++) {
            var px = xPos(freqs[i]);
            var py = Math.max(PAD.top, Math.min(PAD.top + ch, yPos(vals[i])));
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    plot(fl, '#8a8a8a', [2, 3], 1.5);
    plot(th, '#3a5a8c', [5, 4], 1.5);
    plot(tot, '#c0583a', null, 2.5);

    /* 图例 */
    ctx.font = '12px Patrick Hand, cursive';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c0583a';
    ctx.fillText('— 总噪声', PAD.left + cw - 170, PAD.top + 16);
    ctx.fillStyle = '#3a5a8c';
    ctx.fillText('- - 热噪声', PAD.left + cw - 170, PAD.top + 32);
    ctx.fillStyle = '#8a8a8a';
    ctx.fillText('·· 1/f 噪声', PAD.left + cw - 88, PAD.top + 16);
}

/* ---- 事件绑定与初始化 ---- */
['ampT', 'ampGamma', 'ampCox', 'ampKFn', 'ampKFp', 'ampFL', 'ampFH',
 'ampId1', 'ampVov1', 'ampW1', 'ampL1', 'ampIdL', 'ampVovL', 'ampWL', 'ampLL',
 'ampIdF', 'ampVovF', 'ampWF', 'ampLF'
].forEach(function (id) {
    ae[id].addEventListener('input', ampUpdate);
    ae[id].addEventListener('change', ampUpdate);
});
ae.ampType.addEventListener('change', ampUpdate);

ampUpdate();

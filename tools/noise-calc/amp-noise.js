/* tools/noise-calc/amp-noise.js
   放大器结构噪声子标签页：五管 OTA / 套筒式 / 折叠式共源共栅
   （依赖 script.js 的全局常量 k 与 common.js 的 formatEngineering；
    拓扑图统一由 razavi/render.js + razavi/figures.js 渲染） */

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
['ampType', 'ampFig', 'ampEditBtn', 'ampT', 'ampGamma', 'ampCox', 'ampKFn', 'ampKFp', 'ampFL', 'ampFH',
 'ampId1', 'ampVov1', 'ampW1', 'ampL1', 'ampIdL', 'ampVovL', 'ampWL', 'ampLL',
 'ampIdF', 'ampVovF', 'ampWF', 'ampLF', 'foldRow', 'ampGmInfo',
 'ampVth', 'ampFc', 'ampVrms', 'ampCanvas'
].forEach(function (id) { ae[id] = document.getElementById(id); });

/* ---- 拓扑结构图：共享标准图（RAZAVI_FIGURES）经 Razavi 渲染器绘制 ---- */
function ampFigSvg(type) {
    var fig = window.RAZAVI_FIGURES && RAZAVI_FIGURES[type];
    if (!fig || !window.Razavi) return '';
    return Razavi.docSvg(fig.doc, {
        className: 'topo-svg', sw: 2,
        stroke: 'var(--color-border-sketch)', textColor: 'var(--color-text-secondary)',
        font: "'Patrick Hand','Caveat',cursive"
    }).str;
}

/* ---- 噪声计算 ---- */
function num(el) { return parseFloat(el.value); }

function ampUpdate() {
    var type = ae.ampType.value;
    ae.foldRow.style.display = type === 'folded' ? '' : 'none';
    ae.ampFig.innerHTML = ampFigSvg(type);

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

/* 跳转电路编辑器：载入对应共享标准图继续编辑 */
ae.ampEditBtn.addEventListener('click', function () {
    location.href = '../circuit-sketch/index.html?fig=' + ae.ampType.value;
});

ampUpdate();

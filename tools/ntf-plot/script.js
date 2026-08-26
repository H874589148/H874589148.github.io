/* tools/ntf-plot/script.js
   NTF 绘制：z 域系数输入 / |NTF|² 频谱 / 带内积分噪声与峰值（Lee 准则） */

var el = {};
['coefB', 'coefA', 'fs', 'osr', 'rangeMode', 'fMin', 'fMax', 'yMode', 'xMode', 'ntfTpl',
 'msgLine', 'statFB', 'statIB', 'statIBDb', 'statPeak', 'statLee',
 'chartTitle', 'ntfCanvas'
].forEach(function (id) { el[id] = document.getElementById(id); });

/* ---- 工程记号解析（大小写敏感：M=Mega，m=milli） ---- */
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
                  'm': 1e-3, 'u': 1e-6, 'μ': 1e-6, 'µ': 1e-6, 'n': 1e-9, 'p': 1e-12 };
    if (!(suf in table)) return NaN;
    return v * table[suf];
}

/* ---- 系数解析：空格/逗号/分号分隔 ---- */
function parseCoeffs(str) {
    var toks = String(str).split(/[\s,;，、]+/).filter(function (t) { return t !== ''; });
    if (!toks.length) return null;
    var out = [];
    for (var i = 0; i < toks.length; i++) {
        var v = parseFloat(toks[i]);
        if (!isFinite(v)) return null;
        out.push(v);
    }
    return out;
}

/* ---- 单位圆求值 |H(e^{jω})|² ---- */
function evalH2(b, a, w) {
    var br = 0, bi = 0, ar = 0, ai = 0, k, c, s;
    for (k = 0; k < b.length; k++) {
        c = Math.cos(k * w); s = Math.sin(k * w);
        br += b[k] * c; bi -= b[k] * s;
    }
    for (k = 0; k < a.length; k++) {
        c = Math.cos(k * w); s = Math.sin(k * w);
        ar += a[k] * c; ai -= a[k] * s;
    }
    var den = ar * ar + ai * ai;
    if (den < 1e-24) return Infinity;   /* 单位圆上（附近）有极点 */
    return (br * br + bi * bi) / den;
}

/* ---- 数值辅助 ---- */
function niceStep(range, target) {
    var raw = range / target;
    if (!(raw > 0) || !isFinite(raw)) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var cands = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < cands.length; i++) {
        if (cands[i] * mag >= raw * 0.999) return cands[i] * mag;
    }
    return 10 * mag;
}

function setMsg(text, isErr) {
    el.msgLine.textContent = text || '';
    el.msgLine.className = isErr ? 'hint err' : 'hint';
}

function setStats(fb, ib, peak, hasInf) {
    el.statFB.textContent = formatEngineering(fb) + 'Hz';
    if (!isFinite(ib)) {
        el.statIB.textContent = '∞';
        el.statIBDb.textContent = '带内存在极点（分母为零）';
    } else {
        el.statIB.textContent = formatEngineering(ib);
        el.statIBDb.textContent = ib > 0 ? '= ' + (10 * Math.log10(ib)).toFixed(2) + ' dB' : '= -∞ dB（零点在带内）';
    }
    if (hasInf || !isFinite(peak)) {
        el.statPeak.textContent = '∞';
        el.statLee.textContent = '分母在 0~fs/2 内存在零点 → 调制器不稳定';
        el.statLee.className = 'rsub bad';
    } else {
        var peakDb = 10 * Math.log10(Math.max(peak, 1e-300));
        el.statPeak.textContent = peakDb.toFixed(2) + ' dB';
        var leeDb = 10 * Math.log10(1.5 * 1.5);   /* |NTF|=1.5 → |NTF|²=3.52dB */
        if (peakDb <= leeDb) {
            el.statLee.textContent = '满足 Lee 准则经验值（≤ 1.5 ≈ ' + leeDb.toFixed(1) + ' dB）';
            el.statLee.className = 'rsub ok';
        } else {
            el.statLee.textContent = '超过 Lee 准则 1.5（' + leeDb.toFixed(1) + ' dB），单比特量化可能不稳定';
            el.statLee.className = 'rsub bad';
        }
    }
}

/* ---- 绘图（线性频轴） ---- */
function drawChart(freqs, ys, opts) {
    var canvas = el.ntfCanvas;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.width;
    var h = canvas.clientHeight || canvas.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var PAD = { top: 18, right: 20, bottom: 36, left: 64 };
    var cw = w - PAD.left - PAD.right;
    var ch = h - PAD.top - PAD.bottom;

    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, w, h);

    var fmin = freqs[0], fmax = freqs[freqs.length - 1];
    var logX = !!opts.logX;
    var lfmin = logX ? Math.log10(fmin) : 0, lfmax = logX ? Math.log10(fmax) : 0;
    function xPos(f) {
        return logX ? PAD.left + (Math.log10(f) - lfmin) / (lfmax - lfmin) * cw
                    : PAD.left + (f - fmin) / (fmax - fmin) * cw;
    }
    function yPos(v) { return PAD.top + (1 - (v - opts.yMin) / (opts.yMax - opts.yMin)) * ch; }

    /* X 网格 */
    ctx.font = '11px Fira Code, monospace';
    if (logX) {
        var dec = Math.floor(lfmin);
        while (dec <= lfmax + 1e-9) {
            [1, 2, 5].forEach(function (m) {
                var fg = m * Math.pow(10, dec);
                if (fg < fmin * 0.999 || fg > fmax * 1.001) return;
                var xg = xPos(fg);
                ctx.beginPath();
                ctx.moveTo(xg, PAD.top);
                ctx.lineTo(xg, PAD.top + ch);
                ctx.strokeStyle = m === 1 ? '#d0c8b8' : '#e8e2d8';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.fillStyle = '#8a8a8a';
                ctx.textAlign = 'center';
                ctx.fillText(formatEngineering(fg) + 'Hz', xg, PAD.top + ch + 16);
            });
            dec++;
        }
    } else {
        /* 线性轴 nice 刻度 */
        var xStep = niceStep(fmax - fmin, 6);
        for (var ft = Math.ceil(fmin / xStep) * xStep; ft <= fmax + 1e-9; ft += xStep) {
            var xg2 = xPos(ft);
            ctx.beginPath();
            ctx.moveTo(xg2, PAD.top);
            ctx.lineTo(xg2, PAD.top + ch);
            ctx.strokeStyle = '#e8e2d8';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#8a8a8a';
            ctx.textAlign = 'center';
            ctx.fillText(formatEngineering(ft) + 'Hz', xg2, PAD.top + ch + 16);
        }
    }

    /* Y 网格 */
    opts.yGrid.forEach(function (gv) {
        var y = yPos(gv);
        if (y < PAD.top - 1 || y > PAD.top + ch + 1) return;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(PAD.left + cw, y);
        ctx.strokeStyle = gv === 0 ? '#b8b0a0' : '#e8e2d8';
        ctx.lineWidth = gv === 0 ? 1.5 : 1;
        ctx.stroke();
        ctx.fillStyle = '#8a8a8a';
        ctx.textAlign = 'right';
        ctx.fillText(opts.db ? String(Math.round(gv)) : formatEngineering(gv), PAD.left - 6, y + 4);
    });
    /* Y 轴单位 */
    ctx.fillStyle = '#8a8a8a';
    ctx.textAlign = 'left';
    ctx.fillText(opts.db ? 'dB' : '|NTF|²', 6, PAD.top - 6);

    /* 轴框 */
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD.left, PAD.top, cw, ch);

    /* 信号带宽标记 fB */
    if (opts.fB > fmin && opts.fB < fmax) {
        var xb = xPos(opts.fB);
        ctx.beginPath();
        ctx.moveTo(xb, PAD.top);
        ctx.lineTo(xb, PAD.top + ch);
        ctx.strokeStyle = '#3a5a8c';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#3a5a8c';
        ctx.textAlign = 'left';
        ctx.font = '12px Patrick Hand, cursive';
        ctx.fillText('fB', xb + 4, PAD.top + 14);
    }

    /* 曲线 */
    ctx.beginPath();
    ctx.strokeStyle = '#c0583a';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    for (var i = 0; i < freqs.length; i++) {
        var px = xPos(freqs[i]);
        var py = yPos(ys[i]);
        py = Math.max(PAD.top, Math.min(PAD.top + ch, py));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    /* 峰值位置标注（带内/带外归属） */
    if (opts.peak && opts.peak.f >= fmin && opts.peak.f <= fmax) {
        var px2 = xPos(opts.peak.f);
        var py2 = yPos(opts.peak.v);
        py2 = Math.max(PAD.top, Math.min(PAD.top + ch, py2));
        ctx.beginPath();
        ctx.arc(px2, py2, 4.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#c0583a';
        ctx.lineWidth = 2;
        ctx.stroke();
        var inBand = opts.peak.f <= opts.fB;
        var label = '峰值 ' + (opts.db ? opts.peak.v.toFixed(1) + ' dB' : formatEngineering(opts.peak.v)) +
            ' @ ' + formatEngineering(opts.peak.f) + 'Hz' + (inBand ? '（带内!）' : '（带外）');
        ctx.fillStyle = '#c0583a';
        ctx.font = '11px Patrick Hand, cursive';
        var nearRight = px2 > PAD.left + cw - 190;
        ctx.textAlign = nearRight ? 'right' : 'left';
        ctx.fillText(label, nearRight ? px2 - 8 : px2 + 8, Math.max(PAD.top + 12, py2 - 8));
    }
}

/* ---- 主流程 ---- */
function compute() {
    var b = parseCoeffs(el.coefB.value);
    var a = parseCoeffs(el.coefA.value);
    var fs = parseVal(el.fs.value);
    var osr = parseFloat(el.osr.value);

    if (!b) { setMsg('分子系数 b 无法解析：请用空格/逗号分隔数字（示例：1 -2 1）。', true); return; }
    if (!a) { setMsg('分母系数 a 无法解析：请用空格/逗号分隔数字（示例：1 -1 0.5）。', true); return; }
    var aAllZero = a.every(function (v) { return v === 0; });
    if (aAllZero) { setMsg('分母系数 a 不能全为 0。', true); return; }
    if (!(fs > 0)) { setMsg('采样频率 fs 必须为正数。', true); return; }
    if (!(osr >= 1)) { setMsg('OSR 必须 ≥ 1。', true); return; }

    var fB = fs / (2 * osr);

    /* 频率范围 */
    var mode = el.rangeMode.value;
    var fLo, fHi;
    if (mode === 'band') { fLo = 0; fHi = fB; }
    else if (mode === 'nyquist') { fLo = 0; fHi = fs / 2; }
    else {
        fLo = parseVal(el.fMin.value);
        fHi = parseVal(el.fMax.value);
        if (!(fLo >= 0) || !(fHi > fLo)) { setMsg('自定义范围需要 fmax > fmin ≥ 0。', true); return; }
    }

    /* 显示曲线：600 点（线性/对数频轴） */
    var N = 600;
    var freqs = [], ys = [], dbMode = el.yMode.value === 'db';
    var logX = el.xMode.value === 'log';
    var fLoEff = fLo;
    if (logX && fLoEff <= 0) fLoEff = fHi / 1e4;   /* 对数轴起点不能为 0 */
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < N; i++) {
        var f = logX ? fLoEff * Math.pow(fHi / fLoEff, i / (N - 1))
                     : fLo + (fHi - fLo) * i / (N - 1);
        var h2 = evalH2(b, a, 2 * Math.PI * f / fs);
        if (!isFinite(h2)) h2 = 1e12;   /* 显示截断 */
        var v = dbMode ? 10 * Math.log10(Math.max(h2, 1e-12)) : h2;
        freqs.push(f); ys.push(v);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
    }

    /* 带内积分噪声功率：0~fB 内 |NTF|² 均值（梯形积分，2048 点） */
    var M = 2048, integ = 0, prevH = null, hasInfBand = false;
    for (var j = 0; j <= M; j++) {
        var fj = fB * j / M;
        var hj = evalH2(b, a, 2 * Math.PI * fj / fs);
        if (!isFinite(hj)) { hasInfBand = true; hj = 1e12; }
        if (prevH !== null) integ += 0.5 * (hj + prevH) * (fB / M);
        prevH = hj;
    }
    var ib = hasInfBand ? Infinity : integ / fB;

    /* 峰值：扫描 0~fs/2（与显示范围无关），记录峰值频率 */
    var peak = 0, peakF = 0, hasInf = false;
    for (var p = 0; p <= M; p++) {
        var fp = (fs / 2) * p / M;
        var hp = evalH2(b, a, 2 * Math.PI * fp / fs);
        if (!isFinite(hp)) { hasInf = true; break; }
        if (hp > peak) { peak = hp; peakF = fp; }
    }

    setStats(fB, ib, peak, hasInf);

    /* Y 轴范围 */
    var yMin, yMax, yGrid = [];
    if (dbMode) {
        yMax = Math.min(120, Math.max(20, Math.ceil(mx / 20) * 20));
        yMin = Math.floor(mn / 20) * 20;
        if (yMax - yMin > 200) yMin = yMax - 200;
        for (var g = yMin; g <= yMax; g += 20) yGrid.push(g);
        el.chartTitle.textContent = '|NTF|² 频谱（dB，' + (logX ? '对数' : '线性') + '频轴）';
    } else {
        var yStep = niceStep(mx, 5);
        yMax = Math.ceil(mx / yStep) * yStep;
        if (!(yMax > 0)) yMax = yStep;
        yMin = 0;
        for (var t = 0; t <= yMax + 1e-12; t += yStep) yGrid.push(t);
        el.chartTitle.textContent = '|NTF|² 频谱（线性，' + (logX ? '对数' : '线性') + '频轴）';
    }

    setMsg('阶数：分子 ' + (b.length - 1) + ' 阶 / 分母 ' + (a.length - 1) + ' 阶 ｜ 显示范围 ' +
        formatEngineering(fLo) + 'Hz ~ ' + formatEngineering(fHi) + 'Hz（600 点' + (logX ? '对数' : '线性') + '）', false);

    var peakV = dbMode ? 10 * Math.log10(Math.max(peak, 1e-12)) : peak;
    drawChart(freqs, ys, { db: dbMode, yMin: yMin, yMax: yMax, yGrid: yGrid, fB: fB, logX: logX,
        peak: hasInf ? null : { f: peakF, v: peakV } });
}

/* ---- 事件 ---- */
['coefB', 'coefA', 'fs', 'osr', 'fMin', 'fMax'].forEach(function (id) {
    el[id].addEventListener('input', compute);
    el[id].addEventListener('change', compute);
});
el.yMode.addEventListener('change', compute);
el.xMode.addEventListener('change', compute);

/* ---- NTF 模板（z⁻¹ 升幂系数；教学示例，极点均在单位圆内） ---- */
var NTF_TEMPLATES = {
    ntf1:  { b: '1 -1',      a: '1 0',             desc: '1 阶：(1−z⁻¹)' },
    cifb2: { b: '1 -2 1',    a: '1 -1 0.5',        desc: '2 阶 CIFB：极点 0.5±0.5j' },
    cifb3: { b: '1 -3 3 -1', a: '1 -1.5 1 -0.25',  desc: '3 阶 CIFB：极点 0.5, 0.5±0.5j' },
    crff3: { b: '1 -3 3 -1', a: '1 -1.8 1.08 -0.216', desc: '3 阶 CRFF：三重极点 0.6' }
};
el.ntfTpl.addEventListener('change', function () {
    var t = NTF_TEMPLATES[el.ntfTpl.value];
    if (!t) return;
    el.coefB.value = t.b;
    el.coefA.value = t.a;
    compute();
    setMsg('已载入模板：' + t.desc, false);
});
el.rangeMode.addEventListener('change', function () {
    var custom = el.rangeMode.value === 'custom';
    el.fMin.disabled = !custom;
    el.fMax.disabled = !custom;
    compute();
});

/* ---- 初始化 ---- */
compute();

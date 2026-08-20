/* tools/miller-comp/script.js
   两级放大器密勒补偿 Bode 图（纯 Canvas，无第三方依赖） */

var IN_IDS = ['gm1','ro1','co1','gm2','ro2','co2','cc','rz'];
IN_IDS.forEach(function(id){
    var el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', update);
        el.addEventListener('change', update);
    }
});

/* 调零电阻单位切换：保持物理阻值不变，换算滑块读数 */
var rzSlider = document.getElementById('rz');
var rzUnitSel = document.getElementById('rzUnit');
var rzFactorPrev = 1;
rzUnitSel.addEventListener('change', function () {
    var phys = parseFloat(rzSlider.value) * rzFactorPrev;   // 旧单位下的欧姆值
    var f = parseFloat(rzUnitSel.value);
    rzSlider.value = Math.max(0, Math.min(1000, phys / f));
    rzFactorPrev = f;
    update();
});

/* 频率范围：预设填充；手动修改任一频率控件即转为“自定义” */
var fPreset = document.getElementById('fPreset');
fPreset.addEventListener('change', function () {
    if (fPreset.value !== 'custom') {
        var v = fPreset.value.split('|');
        document.getElementById('fStartVal').value = v[0];
        document.getElementById('fStartUnit').value = v[1];
        document.getElementById('fEndVal').value = v[2];
        document.getElementById('fEndUnit').value = v[3];
    }
    update();
});
['fStartVal','fStartUnit','fEndVal','fEndUnit'].forEach(function (id) {
    var el = document.getElementById(id);
    function h() { fPreset.value = 'custom'; update(); }
    el.addEventListener('input', h);
    el.addEventListener('change', h);
});

function getParams() {
    return {
        gm1: parseFloat(document.getElementById('gm1').value) * 1e-3,   // mA/V -> S
        ro1: parseFloat(document.getElementById('ro1').value) * 1e3,    // kΩ -> Ω
        co1: parseFloat(document.getElementById('co1').value) * 1e-12,  // pF -> F
        gm2: parseFloat(document.getElementById('gm2').value) * 1e-3,
        ro2: parseFloat(document.getElementById('ro2').value) * 1e3,
        co2: parseFloat(document.getElementById('co2').value) * 1e-12,
        cc:  parseFloat(document.getElementById('cc').value) * 1e-12,
        rz:  parseFloat(rzSlider.value) * parseFloat(rzUnitSel.value)  // Ω（含单位换算）
    };
}

/* 由参数导出增益、极点、零点（弧频 rad/s） */
function calcModel(p) {
    var Adc = p.gm1 * p.ro1 * p.gm2 * p.ro2;                 // 线性
    var wp1 = 1 / (p.gm2 * p.ro2 * p.ro1 * p.cc);            // 主极点
    var wp2 = p.gm2 * p.cc / (p.co1 * p.co2 + p.cc * (p.co1 + p.co2)); // 次极点
    var tau = p.cc * (1 / p.gm2 - p.rz);                     // 零点时间常数（含符号）
    // 零点因子 (1 - jω·tau)：tau>0 为右半平面零点，tau<0 为左半平面
    return { Adc: Adc, wp1: wp1, wp2: wp2, tau: tau };
}

/* 计算频率 f 处的幅值(dB)与相位(deg) */
function calcH(f, m) {
    var w = 2 * Math.PI * f;
    // 分子零点 (1 - jω·tau)
    var zRe = 1, zIm = -w * m.tau;
    var magNum = m.Adc * Math.sqrt(zRe * zRe + zIm * zIm);
    var phase = Math.atan2(zIm, zRe) * 180 / Math.PI;
    // 分母两极点
    [m.wp1, m.wp2].forEach(function(wp) {
        var re = 1, im = w / wp;
        magNum /= Math.sqrt(re * re + im * im);
        phase -= Math.atan2(im, re) * 180 / Math.PI;
    });
    return { mag: 20 * Math.log10(magNum), phase: phase };
}

function update() {
    var p = getParams();
    document.getElementById('ccVal').textContent = (Math.round(p.cc * 1e13) / 10) + ' pF';
    var rzU = parseFloat(rzUnitSel.value);
    var rzLabel = rzU === 1 ? 'Ω' : (rzU === 1e3 ? 'kΩ' : 'MΩ');
    document.getElementById('rzVal').textContent = parseFloat((p.rz / rzU).toPrecision(4)) + ' ' + rzLabel;

    // 参数无效时清空
    if ([p.gm1,p.ro1,p.gm2,p.ro2,p.cc].some(function(x){ return isNaN(x) || x <= 0; })) {
        ['rAdc','rPm','rGm','rGbw','rFp1','rFp2','rFz','rInvGm'].forEach(function(id){ setText(id,'N/A'); });
        return;
    }

    var m = calcModel(p);

    // 与频率轴无关的结果先显示
    var fp1 = m.wp1 / (2 * Math.PI);
    var fp2 = m.wp2 / (2 * Math.PI);
    var fz  = m.tau !== 0 ? 1 / (2 * Math.PI * Math.abs(m.tau)) : Infinity;
    var gbw = p.gm1 / (2 * Math.PI * p.cc);

    setText('rAdc', (20 * Math.log10(m.Adc)).toFixed(1) + ' dB  (' + fmtEng(m.Adc, '') + 'V/V)');
    setText('rGbw', fmtEng(gbw, 'Hz'));
    setText('rFp1', fmtEng(fp1, 'Hz'));
    setText('rFp2', fmtEng(fp2, 'Hz'));
    setText('rInvGm', fmtEng(1 / p.gm2, 'Ω'));
    if (!isFinite(fz)) {
        setText('rFz', '∞ (Rz=1/gm2)');
    } else {
        setText('rFz', fmtEng(fz, 'Hz') + (m.tau > 0 ? '  (RHP)' : '  (LHP)'));
    }

    // 频率轴范围校验：非法时仅跳过绘图与裕度计算
    var fr = getFreqRange();
    markFreqInvalid(fr.ok);
    if (!fr.ok) {
        setText('rPm', '—');
        setText('rGm', '—');
        return;
    }

    // 频率轴
    var N = 500;
    var freqs = [], mags = [], phases = [];
    for (var i = 0; i <= N; i++) {
        var f = Math.pow(10, Math.log10(fr.fStart) + i * (Math.log10(fr.fEnd) - Math.log10(fr.fStart)) / N);
        var h = calcH(f, m);
        freqs.push(f); mags.push(h.mag); phases.push(h.phase);
    }

    drawCanvas('magCanvas', freqs, mags, { color: '#3a5a8c', yUnit: 'dB', gridLines: [-40,-20,0,20,40,60,80,100], phase: false });
    drawCanvas('phaseCanvas', freqs, phases, { color: '#c0583a', yUnit: '°', gridLines: [-270,-225,-180,-135,-90,-45,0], phase: true });

    // 相位/增益裕度
    var margins = calcMargins(freqs, mags, phases);
    setText('rPm', margins.pm !== null ? margins.pm.toFixed(1) + '°' : '> 180° (稳定)');
    setText('rGm', margins.gm !== null ? margins.gm.toFixed(1) + ' dB' : '∞ (稳定)');
}

function calcMargins(freqs, mags, phases) {
    var pm = null, gm = null;
    for (var i = 1; i < mags.length; i++) {
        if (mags[i-1] > 0 && mags[i] <= 0) {
            var t = (0 - mags[i-1]) / (mags[i] - mags[i-1]);
            var ph = phases[i-1] + t * (phases[i] - phases[i-1]);
            pm = ph + 180;
            break;
        }
    }
    for (var j = 1; j < phases.length; j++) {
        if (phases[j-1] > -180 && phases[j] <= -180) {
            var t2 = (-180 - phases[j-1]) / (phases[j] - phases[j-1]);
            var mg = mags[j-1] + t2 * (mags[j] - mags[j-1]);
            gm = -mg;
            break;
        }
    }
    return { pm: pm, gm: gm };
}

/* 读取频率轴范围（Hz），含有效性校验 */
function getFreqRange() {
    var s = parseFloat(document.getElementById('fStartVal').value) * parseFloat(document.getElementById('fStartUnit').value);
    var e = parseFloat(document.getElementById('fEndVal').value) * parseFloat(document.getElementById('fEndUnit').value);
    return { ok: isFinite(s) && isFinite(e) && s > 0 && e > s, fStart: s, fEnd: e };
}

function markFreqInvalid(ok) {
    ['fStartVal', 'fEndVal'].forEach(function (id) {
        document.getElementById(id).style.borderColor = ok ? '' : '#c0583a';
    });
}

/* ========== Canvas 绘制 ========== */
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

    var PAD = { top: 16, right: 20, bottom: 36, left: 54 };
    var cw = w - PAD.left - PAD.right;
    var ch = h - PAD.top - PAD.bottom;

    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, w, h);

    var yMin, yMax;
    if (opts.phase) { yMin = -270; yMax = 30; }
    else { yMin = Math.min.apply(null, vals) - 10; yMax = Math.max.apply(null, vals) + 10; }

    var logFmin = Math.log10(freqs[0]);
    var logFmax = Math.log10(freqs[freqs.length - 1]);

    function xPos(f) { return PAD.left + (Math.log10(f) - logFmin) / (logFmax - logFmin) * cw; }
    function yPos(v) { return PAD.top + (1 - (v - yMin) / (yMax - yMin)) * ch; }

    // 频率网格
    var dec = Math.floor(logFmin);
    while (dec <= logFmax) {
        for (var mm = 1; mm <= 9; mm++) {
            var fGrid = mm * Math.pow(10, dec);
            if (fGrid >= freqs[0] && fGrid <= freqs[freqs.length-1]) {
                var x = xPos(fGrid);
                ctx.beginPath();
                ctx.moveTo(x, PAD.top);
                ctx.lineTo(x, PAD.top + ch);
                ctx.strokeStyle = mm === 1 ? '#d0c8b8' : '#e8e2d8';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
        dec++;
    }

    // Y 网格
    opts.gridLines.forEach(function(v) {
        var y = yPos(v);
        if (y < PAD.top || y > PAD.top + ch) return;
        var hot = (v === 0 || v === -180);
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(PAD.left + cw, y);
        ctx.strokeStyle = hot ? '#b8b0a0' : '#e8e2d8';
        ctx.lineWidth = hot ? 1.5 : 1;
        ctx.stroke();
        ctx.fillStyle = '#8a8a8a';
        ctx.font = '11px Fira Code, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(v + opts.yUnit, PAD.left - 4, y + 4);
    });

    // X 标签
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '11px Fira Code, monospace';
    ctx.textAlign = 'center';
    dec = Math.floor(logFmin);
    while (dec <= logFmax) {
        var f = Math.pow(10, dec);
        if (f >= freqs[0] && f <= freqs[freqs.length-1]) {
            ctx.fillText(fmtFreq(f), xPos(f), PAD.top + ch + 16);
        }
        dec++;
    }

    // 轴框
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD.left, PAD.top, cw, ch);

    // 曲线
    ctx.beginPath();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (var i = 0; i < freqs.length; i++) {
        var px = xPos(freqs[i]);
        var py = yPos(vals[i]);
        py = Math.max(PAD.top, Math.min(PAD.top + ch, py));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();
}

/* ========== 工具 ========== */
function fmtFreq(f) {
    if (f >= 1e9) return (f/1e9) + 'G';
    if (f >= 1e6) return (f/1e6) + 'M';
    if (f >= 1e3) return (f/1e3) + 'k';
    if (f >= 1) return String(f);
    return String(f);
}

function fmtEng(num, unit) {
    if (!isFinite(num) || num === 0) return '0 ' + unit;
    var prefixes = [
        {v:1e12,s:'T'},{v:1e9,s:'G'},{v:1e6,s:'M'},{v:1e3,s:'k'},
        {v:1,s:''},{v:1e-3,s:'m'},{v:1e-6,s:'µ'},{v:1e-9,s:'n'},
        {v:1e-12,s:'p'},{v:1e-15,s:'f'}
    ];
    var absN = Math.abs(num);
    for (var i = 0; i < prefixes.length; i++) {
        if (absN >= prefixes[i].v * 0.9999) {
            return (num / prefixes[i].v).toPrecision(4).replace(/\.?0+$/, '') + ' ' + prefixes[i].s + unit;
        }
    }
    return num.toExponential(2) + ' ' + unit;
}

function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
}

/* ========== 初始化 ========== */
update();

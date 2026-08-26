/* tools/bandgap/script.js
   Bandgap 设计计算集：核心参数链 / Trim 位设计 / VBE(T) / 小换算集
   一阶工程近似，用于快速估算。 */

var kB = 1.380649e-23;   // 玻尔兹曼 J/K
var qE = 1.602177e-19;   // 元电荷 C

function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.toggle('active', p.id === 'tab-' + name); });
}

/* ========== TAB 1 核心参数链（正解/反解 + 零温漂判据） ========== */
var coreLast = null;   /* 最近一次有效计算（供复制参数表 / 导出 PNG 复用） */

var coModeEl = document.getElementById('coMode');
coModeEl.addEventListener('change', function () {
    var inv = coModeEl.value === 'inv';
    document.getElementById('coVrefField').style.display = inv ? 'none' : '';
    document.getElementById('coRField').style.display = inv ? '' : 'none';
    calcCore();
});
['coN','coVref','coI','coVbe','coT','coR1','coR2'].forEach(function(id){
    document.getElementById(id).addEventListener('input', calcCore);
});
function calcCore() {
    var inv  = coModeEl.value === 'inv';
    var N    = parseFloat(document.getElementById('coN').value);
    var IuA  = parseFloat(document.getElementById('coI').value);       // µA（反解时仅作记录）
    var Vbe  = parseFloat(document.getElementById('coVbe').value);
    var T    = parseFloat(document.getElementById('coT').value);

    var bad = isNaN(N) || isNaN(Vbe) || isNaN(T) || N <= 1 || T <= 0;
    var Vref, K, R1, R2, dVbe;
    if (!bad) {
        var Vt = kB * T / qE;                 // 热电压
        dVbe = Vt * Math.log(N);              // ΔVBE
        if (inv) {
            R1 = parseFloat(document.getElementById('coR1').value) * 1e3;  // kΩ -> Ω
            R2 = parseFloat(document.getElementById('coR2').value) * 1e3;
            bad = isNaN(R1) || isNaN(R2) || R1 <= 0 || R2 <= 0;
            if (!bad) { K = R2 / R1; Vref = Vbe + K * dVbe; }
        } else {
            Vref = parseFloat(document.getElementById('coVref').value);
            bad = isNaN(Vref) || isNaN(IuA) || IuA <= 0;
            if (!bad) {
                K = (Vref - Vbe) / dVbe;      // 系数 = R2/R1
                R1 = dVbe / (IuA * 1e-6);     // ΔVBE 落在 R1 上
                R2 = K * R1;
            }
        }
    }
    if (bad) {
        ['coResVref','coResDvbe','coResK','coResR1','coResR2','coResKtc','coResTc'].forEach(function(id){ setText(id,'N/A'); });
        coreLast = null;
        document.getElementById('zcBar').className = 'zc-bar';
        var zt = document.getElementById('zcText');
        zt.className = 'hint';
        zt.textContent = '输入无效，无法判定。';
        return;
    }
    // 零温漂：K_tc·(k/q)·ln(N) = 2mV/K
    var Ktc = 2e-3 / ((kB / qE) * Math.log(N));
    // 残余温漂（一阶）：dVref/dT = (K−Ktc)·(k/q)·ln(N)
    var resTc = (K - Ktc) * (kB / qE) * Math.log(N) * 1e3;   // mV/K
    var dev = K / Ktc - 1;

    setText('coResVref', Vref.toPrecision(5) + ' V');
    setText('coResDvbe', (dVbe * 1e3).toPrecision(4) + ' mV');
    setText('coResK', K.toPrecision(4));
    setText('coResR1', fmtEng(R1, 'Ω'));
    setText('coResR2', fmtEng(R2, 'Ω'));
    setText('coResKtc', Ktc.toPrecision(4));
    setText('coResTc', (resTc >= 0 ? '+' : '') + resTc.toPrecision(2) + ' mV/K');

    coreLast = { inv: inv, N: N, Vref: Vref, IuA: IuA, Vbe: Vbe, T: T,
                 dVbe: dVbe, K: K, R1: R1, R2: R2, Ktc: Ktc, resTc: resTc, dev: dev };
    updateZcBar();
}

/* ---- 零温漂判据条：K 与 K_TC 双标记 + 偏差着色 ---- */
function updateZcBar() {
    var d = coreLast;
    var maxV = Math.max(d.K, d.Ktc) * 1.25;
    if (!(maxV > 0)) maxV = 1;
    document.getElementById('zcK').style.left = (d.K / maxV * 100) + '%';
    document.getElementById('zcKtc').style.left = (d.Ktc / maxV * 100) + '%';
    var ad = Math.abs(d.dev);
    var cls = ad < 0.02 ? 'ok' : ad < 0.05 ? 'warn' : 'bad';
    document.getElementById('zcBar').className = 'zc-bar ' + cls;
    var grade = cls === 'ok' ? '接近零温漂' : cls === 'warn' ? '略有偏差，可接受' : '偏差较大，建议调整 Vref 或 N';
    var txt = document.getElementById('zcText');
    txt.className = 'hint zc-' + cls;
    txt.textContent = 'K = ' + d.K.toPrecision(4) + '，K_TC = ' + d.Ktc.toPrecision(4) +
        '，偏差 ' + (d.dev * 100).toFixed(2) + '% → 残余温漂约 ' +
        (d.resTc >= 0 ? '+' : '') + d.resTc.toFixed(3) + ' mV/K（' + grade + '）';
}

/* ---- 参数表：TSV 复制 / PNG 导出（2x 位图 + 零温漂条） ---- */
function coreParamRows() {
    var d = coreLast;
    return [
        ['求解方向', d.inv ? '反解（R1/R2 → Vref）' : '正解（Vref → R1/R2）'],
        ['面积比 N', String(d.N)],
        ['Vref（实际）', d.Vref.toPrecision(5) + ' V'],
        ['I_PTAT', isNaN(d.IuA) ? '—' : d.IuA + ' µA'],
        ['Vbe', d.Vbe + ' V'],
        ['T', d.T + ' K'],
        ['ΔVbe', (d.dVbe * 1e3).toPrecision(4) + ' mV'],
        ['K = R2/R1', d.K.toPrecision(4)],
        ['R1', fmtEng(d.R1, 'Ω')],
        ['R2', fmtEng(d.R2, 'Ω')],
        ['K_TC（零温漂）', d.Ktc.toPrecision(4)],
        ['K 偏差', (d.dev * 100).toFixed(2) + ' %'],
        ['残余温漂 dVref/dT', (d.resTc >= 0 ? '+' : '') + d.resTc.toPrecision(3) + ' mV/K']
    ];
}

document.getElementById('coCopy').addEventListener('click', function () {
    if (!coreLast) return;
    var btn = this;
    var text = coreParamRows().map(function (r) { return r.join('\t'); }).join('\n');
    copyTextToClipboard(text, function (ok) {
        btn.textContent = ok ? '已复制 ✓' : '复制失败';
        setTimeout(function () { btn.textContent = '复制参数表（TSV，可粘 Excel）'; }, 1200);
    });
});

document.getElementById('coPng').addEventListener('click', function () {
    if (!coreLast) return;
    var d = coreLast, rows = coreParamRows();
    var S = 2, W = 620, pad = 26, rowH = 30, barH = 100;
    var H = pad * 2 + 44 + rows.length * rowH + barH;
    var cv = document.createElement('canvas');
    cv.width = W * S; cv.height = H * S;
    var ctx = cv.getContext('2d');
    ctx.scale(S, S);
    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, W, H);
    /* 标题 */
    ctx.fillStyle = '#2a2a2a';
    ctx.font = '700 22px "Patrick Hand", "Comic Sans MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Bandgap 核心参数表', pad, pad + 20);
    /* 参数行（斑马纹） */
    ctx.font = '14px "Fira Code", monospace';
    rows.forEach(function (r, i) {
        var y = pad + 44 + i * rowH;
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(58,90,140,0.06)';
            ctx.fillRect(pad - 6, y + 4, W - pad * 2 + 12, rowH);
        }
        ctx.fillStyle = '#6a6a6a';
        ctx.textAlign = 'left';
        ctx.fillText(r[0], pad, y + 22);
        ctx.fillStyle = '#2a2a2a';
        ctx.textAlign = 'right';
        ctx.fillText(r[1], W - pad, y + 22);
    });
    /* 零温漂条 */
    var barY = pad + 44 + rows.length * rowH + 44;
    var trackW = W - pad * 2;
    var ad = Math.abs(d.dev);
    var col = ad < 0.02 ? '#3a7d44' : ad < 0.05 ? '#c8a03a' : '#c0583a';
    var maxV = Math.max(d.K, d.Ktc) * 1.25 || 1;
    ctx.fillStyle = '#e8e2d8';
    ctx.fillRect(pad, barY, trackW, 10);
    function marker(v, color, label) {
        var x = pad + v / maxV * trackW;
        var nearRight = x > pad + trackW - 90;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, barY - 14); ctx.lineTo(x, barY + 16); ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = '12px "Fira Code", monospace';
        ctx.textAlign = nearRight ? 'right' : 'left';
        ctx.fillText(label + ' = ' + v.toPrecision(4), x + (nearRight ? -4 : 4), barY - 18);
    }
    marker(d.K, '#c0583a', 'K');
    marker(d.Ktc, '#3a5a8c', 'K_TC');
    ctx.fillStyle = col;
    ctx.font = '13px "Fira Code", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('偏差 ' + (d.dev * 100).toFixed(2) + '% → 残余温漂约 ' +
        (d.resTc >= 0 ? '+' : '') + d.resTc.toFixed(3) + ' mV/K', pad, barY + 34);
    /* 下载 */
    var a = document.createElement('a');
    a.download = 'bandgap-params.png';
    a.href = cv.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

/* ========== TAB 2 Trim 位设计 ========== */
['trSigma','trLsb','trVref'].forEach(function(id){
    document.getElementById(id).addEventListener('input', calcTrim);
});
function calcTrim() {
    var sigma = parseFloat(document.getElementById('trSigma').value);   // mV (1σ)
    var lsb   = parseFloat(document.getElementById('trLsb').value);     // mV
    var Vref  = parseFloat(document.getElementById('trVref').value);    // V

    if ([sigma,lsb].some(isNaN) || sigma <= 0 || lsb <= 0) {
        ['trResRange','trResSteps','trResBits','trResLevels','trResPpm'].forEach(function(id){ setText(id,'N/A'); });
        document.getElementById('trBody').innerHTML = '';
        return;
    }
    var range = 3 * sigma;                       // ±3σ
    var steps = Math.ceil(6 * sigma / lsb);      // 覆盖 6σ
    var bits  = Math.max(1, Math.ceil(Math.log2(steps)));
    var levels = Math.pow(2, bits);
    var ppm = !isNaN(Vref) && Vref > 0 ? (lsb / 2) / (Vref * 1e3) * 1e6 : NaN;  // 残差 ±LSB/2

    setText('trResRange', '±' + range.toPrecision(3) + ' mV');
    setText('trResSteps', steps + ' 步');
    setText('trResBits', bits + ' bit');
    setText('trResLevels', levels + ' 档');
    setText('trResPpm', isNaN(ppm) ? 'N/A' : '±' + ppm.toPrecision(3) + ' ppm');

    // 二进制加权电阻网络分档表
    var tbody = document.getElementById('trBody');
    tbody.innerHTML = '';
    var cum = 0;
    for (var i = bits - 1; i >= 0; i--) {
        var weight = Math.pow(2, i);
        var step = weight * lsb;
        cum += step;
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>b' + i + '</td><td>×' + weight + '</td><td>' + step.toPrecision(3) +
            '</td><td>' + cum.toPrecision(3) + '</td>';
        tbody.appendChild(tr);
    }
}

/* ========== TAB 3 VBE(T)/ΔVBE ========== */
['vbT','vbN','vbVbe0','vbSlope'].forEach(function(id){
    document.getElementById(id).addEventListener('input', calcVbe);
});
function calcVbe() {
    var Tc    = parseFloat(document.getElementById('vbT').value);      // °C
    var N     = parseFloat(document.getElementById('vbN').value);
    var Vbe0  = parseFloat(document.getElementById('vbVbe0').value);
    var slope = parseFloat(document.getElementById('vbSlope').value);  // mV/K

    if ([Tc,N,Vbe0,slope].some(isNaN) || N <= 1) {
        ['vbResVt','vbResDvbe','vbResVbe','vbResSlope'].forEach(function(id){ setText(id,'N/A'); });
        return;
    }
    var Tk = Tc + 273.15;
    var Vt = kB * Tk / qE;
    var dVbe = Vt * Math.log(N);
    var Vbe = Vbe0 + slope * 1e-3 * (Tc - 27);
    var dVbeSlope = (kB / qE) * Math.log(N) * 1e3;  // mV/K

    setText('vbResVt', (Vt * 1e3).toPrecision(4) + ' mV');
    setText('vbResDvbe', (dVbe * 1e3).toPrecision(4) + ' mV');
    setText('vbResVbe', Vbe.toPrecision(5) + ' V');
    setText('vbResSlope', '+' + dVbeSlope.toPrecision(3) + ' mV/K');
}

/* ========== TAB 4 小换算集 ========== */
// ppm <-> mV
var cvVref = document.getElementById('cvVref');
var cvPpm  = document.getElementById('cvPpm');
var cvMv   = document.getElementById('cvMv');
function ppmToMv() {
    var vref = parseFloat(cvVref.value), ppm = parseFloat(cvPpm.value);
    if (isNaN(vref) || isNaN(ppm)) return;
    cvMv.value = parseFloat((ppm * 1e-6 * vref * 1e3).toPrecision(6));
}
function mvToPpm() {
    var vref = parseFloat(cvVref.value), mv = parseFloat(cvMv.value);
    if (isNaN(vref) || isNaN(mv) || vref <= 0) return;
    cvPpm.value = parseFloat((mv * 1e-3 / vref * 1e6).toPrecision(6));
}
cvPpm.addEventListener('input', ppmToMv);
cvMv.addEventListener('input', mvToPpm);
cvVref.addEventListener('input', ppmToMv);

// dB <-> 倍数
var cvDb = document.getElementById('cvDb');
var cvRatio = document.getElementById('cvRatio');
cvDb.addEventListener('input', function(){
    var db = parseFloat(cvDb.value);
    if (isNaN(db)) return;
    cvRatio.value = parseFloat(Math.pow(10, db / 20).toPrecision(6));
});
cvRatio.addEventListener('input', function(){
    var r = parseFloat(cvRatio.value);
    if (isNaN(r) || r <= 0) return;
    cvDb.value = parseFloat((20 * Math.log10(r)).toPrecision(6));
});

// ln(N) 表
function buildLnTable() {
    var Ns = [2,3,4,5,6,8,10,12,16,20,24];
    var Vt = kB * 300 / qE;
    var tbody = document.getElementById('lnBody');
    tbody.innerHTML = '';
    Ns.forEach(function(n){
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + n + '</td><td>' + Math.log(n).toFixed(4) + '</td><td>' +
            (Vt * Math.log(n) * 1e3).toFixed(3) + '</td>';
        tbody.appendChild(tr);
    });
}

/* ========== 工具 ========== */
function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
}
function fmtEng(num, unit) {
    if (!isFinite(num) || num === 0) return '0 ' + unit;
    var prefixes = [
        {v:1e9,s:'G'},{v:1e6,s:'M'},{v:1e3,s:'k'},{v:1,s:''},
        {v:1e-3,s:'m'},{v:1e-6,s:'µ'},{v:1e-9,s:'n'}
    ];
    var absN = Math.abs(num);
    for (var i = 0; i < prefixes.length; i++) {
        if (absN >= prefixes[i].v * 0.9999) {
            return (num / prefixes[i].v).toPrecision(4).replace(/\.?0+$/, '') + ' ' + prefixes[i].s + unit;
        }
    }
    return num.toExponential(2) + ' ' + unit;
}

/* ========== 初始化 ========== */
calcCore();
calcTrim();
calcVbe();
ppmToMv();
buildLnTable();

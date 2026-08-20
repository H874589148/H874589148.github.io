/* tools/bandgap/script.js
   Bandgap 设计计算集：核心参数链 / Trim 位设计 / VBE(T) / 小换算集
   一阶工程近似，用于快速估算。 */

var kB = 1.380649e-23;   // 玻尔兹曼 J/K
var qE = 1.602177e-19;   // 元电荷 C

function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.toggle('active', p.id === 'tab-' + name); });
}

/* ========== TAB 1 核心参数链 ========== */
['coN','coVref','coI','coVbe','coT'].forEach(function(id){
    document.getElementById(id).addEventListener('input', calcCore);
});
function calcCore() {
    var N    = parseFloat(document.getElementById('coN').value);
    var Vref = parseFloat(document.getElementById('coVref').value);
    var I    = parseFloat(document.getElementById('coI').value) * 1e-6;  // µA -> A
    var Vbe  = parseFloat(document.getElementById('coVbe').value);
    var T    = parseFloat(document.getElementById('coT').value);

    if ([N,Vref,I,Vbe,T].some(isNaN) || N <= 1 || I <= 0 || T <= 0) {
        ['coResVref','coResDvbe','coResK','coResR1','coResR2','coResKtc'].forEach(function(id){ setText(id,'N/A'); });
        return;
    }
    var Vt = kB * T / qE;                 // 热电压
    var dVbe = Vt * Math.log(N);          // ΔVBE
    var K = (Vref - Vbe) / dVbe;          // 系数 = R2/R1
    var R1 = dVbe / I;                    // ΔVBE 落在 R1 上
    var R2 = K * R1;
    var actualVref = Vbe + K * dVbe;      // 回代校验
    // 零温漂：K_tc·(k/q)·ln(N) = 2mV/K
    var Ktc = 2e-3 / ((kB / qE) * Math.log(N));

    setText('coResVref', actualVref.toPrecision(5) + ' V');
    setText('coResDvbe', (dVbe * 1e3).toPrecision(4) + ' mV');
    setText('coResK', K.toPrecision(4));
    setText('coResR1', fmtEng(R1, 'Ω'));
    setText('coResR2', fmtEng(R2, 'Ω'));
    setText('coResKtc', Ktc.toPrecision(4));
}

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

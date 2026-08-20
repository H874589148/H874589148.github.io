/* tools/current-mirror/script.js
   四标签：Pelgrom 模型 / 0.18µm 速算表 / 1-σ 速查表 / BJT 带隙失配
   数据内嵌自 "0.18um BCDA mismatch calculation&look-up tables.xlsx" */

/* ========== 标签切换 ========== */
function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.toggle('active', p.id === 'tab-' + name); });
}

/* ============================================================
   TAB 1 — Pelgrom 通用模型
   ============================================================ */
['Avt','Ab','mW','mL','Vov'].forEach(function(id){
    document.getElementById(id).addEventListener('input', computePelgrom);
});

function computePelgrom() {
    var Avt  = parseFloat(document.getElementById('Avt').value);
    var Ab   = parseFloat(document.getElementById('Ab').value);
    var W    = parseFloat(document.getElementById('mW').value);
    var L    = parseFloat(document.getElementById('mL').value);
    var Vov  = parseFloat(document.getElementById('Vov').value);

    if ([Avt,Ab,W,L,Vov].some(isNaN) || W<=0 || L<=0 || Vov<=0) {
        ['resMain','resVT','resBeta','resArea'].forEach(function(id){ setText(id,'N/A'); });
        return;
    }
    var WL = W * L;
    var sig_VT_abs = Avt / Math.sqrt(WL);
    var term_VT    = (2 * sig_VT_abs * 1e-3) / Vov;
    var term_beta  = (Ab / 100) / Math.sqrt(WL);
    var sig_total  = Math.sqrt(term_VT*term_VT + term_beta*term_beta);

    setText('resMain', (sig_total*100).toPrecision(4) + ' %  (1σ)');
    setText('resVT',   (term_VT*100).toPrecision(4) + ' %');
    setText('resBeta', (term_beta*100).toPrecision(4) + ' %');
    setText('resArea', WL.toPrecision(4) + ' μm²');
    buildSweepTable(Avt, Ab, L, Vov);
}

function buildSweepTable(Avt, Ab, L, Vov) {
    var widths = [1, 2, 4, 8, 10, 16, 20, 32, 50, 100];
    var tbody = document.getElementById('sweepBody');
    tbody.innerHTML = '';
    widths.forEach(function(W) {
        var WL = W * L;
        var sig_VT = (2 * (Avt / Math.sqrt(WL)) * 1e-3) / Vov;
        var sig_b  = (Ab / 100) / Math.sqrt(WL);
        var sig    = Math.sqrt(sig_VT*sig_VT + sig_b*sig_b) * 100;
        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' + W + '</td><td>' + WL.toFixed(1) + '</td>' +
            '<td class="' + (sig < 1 ? 'good' : sig < 2 ? 'warn' : 'bad') + '">' + sig.toPrecision(3) + ' %</td>' +
            '<td>' + (sig*3).toPrecision(3) + ' %</td>';
        tbody.appendChild(tr);
    });
}

/* ============================================================
   TAB 2 — 0.18µm 平方律速算（工艺常数内嵌）
   avth0 [V·m], u0, cox [F/m²]
   ============================================================ */
var DEV = {
    n50: { name: 'n50 (5V NMOS)', avth0: 8e-9,   u0: 0.0463, cox: 0.00275678913738019 },
    p50: { name: 'p50 (5V PMOS)', avth0: 6.7e-9, u0: 0.0136, cox: 0.00271771653543307 },
    n18: { name: 'n18 (1.8V NMOS)', avth0: 3.65e-9, u0: 0.028, cox: 0.00823747016706444 },
    p18: { name: 'p18 (1.8V PMOS)', avth0: 3e-9,  u0: 0.0095, cox: 0.00808313817330211 }
};

['cDev','cId','cW','cL'].forEach(function(id){
    document.getElementById(id).addEventListener('input', computeCalc);
    document.getElementById(id).addEventListener('change', computeCalc);
});

function computeCalc() {
    var d  = DEV[document.getElementById('cDev').value];
    var Id = parseFloat(document.getElementById('cId').value) * 1e-6;   // µA -> A
    var W  = parseFloat(document.getElementById('cW').value);           // µm
    var L  = parseFloat(document.getElementById('cL').value);           // µm
    if (!d || isNaN(Id) || isNaN(W) || isNaN(L) || W<=0 || L<=0 || Id<=0) {
        ['cResSig','cResVth','cResVov','cResGm'].forEach(function(id){ setText(id,'N/A'); });
        return;
    }
    var Wm = W * 1e-6, Lm = L * 1e-6;
    var dVth = d.avth0 / Math.sqrt(Wm * Lm);              // V
    var Vov  = Math.sqrt(2 * Id / (d.u0 * d.cox) * (L / W)); // V
    var gm   = 2 * Id / Vov;                              // S
    var sig  = 2 * dVth / Vov * 100;                      // %

    setText('cResSig', sig.toPrecision(4) + ' %');
    setText('cResVth', (dVth*1e3).toPrecision(4) + ' mV');
    setText('cResVov', (Vov*1e3).toPrecision(4) + ' mV');
    setText('cResGm',  (gm*1e6).toPrecision(4) + ' µS');
}

function buildDevTable() {
    var tbody = document.getElementById('cDevTable');
    tbody.innerHTML = '';
    Object.keys(DEV).forEach(function(k){
        var d = DEV[k];
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + d.name + '</td><td>' + d.avth0.toExponential(2) + '</td><td>' +
            d.u0 + '</td><td>' + d.cox.toPrecision(4) + '</td>';
        tbody.appendChild(tr);
    });
}

/* ============================================================
   TAB 3 — 前仿 1-σ% 速查表
   每张表：L 数组(µm)，列头(ID/W 组合)，data[行][列] = 1-σ%
   ============================================================ */
var LUT = {
    n50: {
        title: '5V NMOS',
        cols: ['ID=1µA / W=1.2µm', 'ID=10µA / W=12µm', 'ID=100µA / W=120µm', 'ID=1mA / W=1200µm'],
        L: [0.6,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
        data: [
            [34.8,11.3,3.57,1.15],[17.6,5.62,1.77,0.573],[7.62,2.41,0.759,0.243],
            [5.08,1.61,0.509,0.163],[3.86,1.23,0.389,0.124],[3.12,0.998,0.315,0.1],
            [2.63,0.841,0.266,0.0845],[2.27,0.727,0.23,0.073],[1.99,0.64,0.202,0.0643],
            [1.78,0.572,0.181,0.0574],[1.61,0.516,0.163,0.0519],[1.47,0.471,0.149,0.0473],
            [1.35,0.433,0.137,0.0435],[1.25,0.401,0.127,0.0402],[1.16,0.373,0.118,0.0374],
            [1.08,0.349,0.11,0.035]
        ]
    },
    p50: {
        title: '5V PMOS',
        cols: ['ID=1µA / W=2.3µm', 'ID=10µA / W=23µm', 'ID=100µA / W=230µm', 'ID=1mA / W=2300µm'],
        L: [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7],
        data: [
            [14.6,4.55,1.44,0.44],[5.96,1.89,0.598,0.182],[4.04,1.28,0.405,0.124],
            [3.08,0.997,0.309,0.0947],[2.49,0.79,0.25,0.0768],[2.09,0.663,0.21,0.0646],
            [1.8,0.571,0.181,0.0557],[1.58,0.501,0.159,0.049],[1.4,0.446,0.141,0.0437],
            [1.27,0.402,0.127,0.0394],[1.15,0.366,0.116,0.0359],[1.06,0.336,0.106,0.033],
            [0.975,0.31,0.0981,0.0305],[0.906,0.288,0.0912,0.0284]
        ]
    },
    n18: {
        title: '1.8V NMOS',
        cols: ['ID=10µA / W=1.2µm', 'ID=100µA / W=12µm', 'ID=1mA / W=120µm'],
        L: [0.2,0.5,1,1.5,2,2.5,3,3.5,4],
        data: [
            [12.4,3.92,1.236],[5.53,1.74,0.551],[3.01,0.948,0.3],[2.11,0.663,0.21],
            [1.63,0.515,0.163],[1.34,0.424,0.134],[1.15,0.362,0.115],[1,0.318,0.1],
            [0.897,0.284,0.0898]
        ]
    },
    p18: {
        title: '1.8V PMOS',
        cols: ['ID=1µA / W=0.45µm', 'ID=10µA / W=4.5µm', 'ID=100µA / W=45µm', 'ID=1mA / W=450µm'],
        L: [0.2,0.5,1,1.5,2,2.5,3],
        data: [
            [17.9,6.88,2.21,0.684],[7.51,2.56,0.808,0.245],[4.07,1.31,0.416,0.126],
            [2.8,0.884,0.279,0.0851],[2.13,0.665,0.21,0.0644],[1.72,0.534,0.169,0.052],
            [1.44,0.447,0.141,0.0436]
        ]
    }
};

/* 同面积同功耗对比表（速查表 sheet 前 4 行） */
var LUT_CMP = [
    { dev: 'n50', wl: '12.5 / 4',  area: 50,   id: 10, vdsat: 207, sig: 1.224 },
    { dev: 'n18', wl: '8 / 6.25',  area: 50,   id: 10, vdsat: 205, sig: 0.475 },
    { dev: 'p50', wl: '25.0 / 2',  area: 50,   id: 10, vdsat: 201, sig: 0.969 },
    { dev: 'p18', wl: '16.67 / 3', area: 50.01, id: 10, vdsat: 209, sig: 0.414 }
];

function renderLut() {
    var key = document.getElementById('lutDev').value;
    var t = LUT[key];
    // 表格
    var html = '<thead><tr><th>L (µm)</th>';
    t.cols.forEach(function(c){ html += '<th>' + c + '</th>'; });
    html += '</tr></thead><tbody>';
    t.L.forEach(function(l, ri){
        html += '<tr><td class="lut-lcol">' + l + '</td>';
        t.data[ri].forEach(function(v){ html += '<td>' + v + '</td>'; });
        html += '</tr>';
    });
    html += '</tbody>';
    document.getElementById('lutTable').innerHTML = html;

    // 填充 L 下拉
    var lSel = document.getElementById('lutL');
    lSel.innerHTML = t.L.map(function(l,i){ return '<option value="' + i + '">' + l + ' µm</option>'; }).join('');
    // 填充列下拉
    var cSel = document.getElementById('lutCol');
    cSel.innerHTML = t.cols.map(function(c,i){ return '<option value="' + i + '">' + c + '</option>'; }).join('');

    highlightLut();
}

function highlightLut() {
    var key = document.getElementById('lutDev').value;
    var t = LUT[key];
    var ri = parseInt(document.getElementById('lutL').value, 10);
    var ci = parseInt(document.getElementById('lutCol').value, 10);
    var table = document.getElementById('lutTable');
    var rows = table.querySelectorAll('tbody tr');
    rows.forEach(function(tr, r){
        var cells = tr.querySelectorAll('td');
        cells.forEach(function(td, c){
            td.classList.remove('hit','hit-row','hit-col');
            if (c === 0) return;               // L 标签列
            var col = c - 1;
            if (r === ri && col === ci) td.classList.add('hit');
            else if (r === ri) td.classList.add('hit-row');
            else if (col === ci) td.classList.add('hit-col');
        });
    });
    if (!isNaN(ri) && !isNaN(ci)) {
        var val = t.data[ri][ci];
        document.getElementById('lutHit').innerHTML =
            '命中：<strong>' + t.title + '</strong> ｜ L=' + t.L[ri] + 'µm ｜ ' + t.cols[ci] +
            ' → 1-σ = <strong>' + val + ' %</strong>';
    }
}

function buildCmpTable() {
    var tbody = document.getElementById('cmpBody');
    tbody.innerHTML = '';
    LUT_CMP.forEach(function(r){
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + r.dev + '</td><td>' + r.wl + '</td><td>' + r.area + '</td><td>' +
            r.id + '</td><td>' + r.vdsat + '</td>' +
            '<td class="' + (r.sig < 0.5 ? 'good' : r.sig < 1 ? 'warn' : 'bad') + '">' + r.sig + '</td>';
        tbody.appendChild(tr);
    });
}

/* ============================================================
   TAB 4 — BJT / 带隙失配
   ============================================================ */
var BJT_DEVS = ['2×2 PNP', '5×5 PNP', '10×10 PNP', '2×2 NPN'];
var BJT_IE   = ['2 µA', '4 µA', '6 µA', '8 µA'];

/* σ(TC1) 分解 @ I_E=4µA：[Mismatch, Process, All] × 4 器件 */
var BJT_TC1_DECOMP = {
    Mismatch: [0.125, 0.063, 0.045, 0.142],
    Process:  [0.531, 0.509, 0.471, 0.506],
    All:      [0.546, 0.513, 0.474, 0.520]
};
/* σ(TC1) vs I_E（All），行=I_E，列=器件 */
var BJT_TC1_IE = [
    [0.553, 0.503, 0.463, 0.509],
    [0.546, 0.513, 0.474, 0.520],
    [0.537, 0.517, 0.480, 0.523],
    [0.525, 0.519, 0.484, 0.523]
];
/* σ(VBG%) vs I_E @27°C（All） */
var BJT_VBG_IE = [
    [0.3666, 0.3587, 0.3585, 0.3836],
    [0.3713, 0.3615, 0.3601, 0.3840],
    [0.3747, 0.3634, 0.3609, 0.3841],
    [0.3811, 0.3689, 0.3657, 0.3875]
];
/* VBG 均值(V) 与标准差(V)：[mean, std] × 器件，按 I_E 行 */
var BJT_VBG_STAT = [
    [[1.228,0.004502],[1.229,0.004409],[1.240,0.004445],[1.254,0.004810]],
    [[1.228,0.004559],[1.230,0.004447],[1.241,0.004469],[1.254,0.004815]],
    [[1.230,0.004609],[1.231,0.004473],[1.241,0.004479],[1.255,0.004820]],
    [[1.231,0.004691],[1.231,0.004541],[1.242,0.004542],[1.255,0.004863]]
];

function renderBjt() {
    var dev = parseInt(document.getElementById('bjtDev').value, 10);
    var ie  = parseInt(document.getElementById('bjtIe').value, 10);
    setText('bjtTc',  BJT_TC1_IE[ie][dev].toFixed(3) + ' %');
    setText('bjtVbg', BJT_VBG_IE[ie][dev].toFixed(4) + ' %');
    setText('bjtVbgMean', BJT_VBG_STAT[ie][dev][0].toFixed(4) + ' V');
    setText('bjtVbgStd',  (BJT_VBG_STAT[ie][dev][1]*1e3).toFixed(3) + ' mV');
}

function buildBjtTables() {
    // TC1 分解
    var tb = document.getElementById('tc1Body');
    tb.innerHTML = '';
    ['Mismatch','Process','All'].forEach(function(k){
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + k + '</td>' + BJT_TC1_DECOMP[k].map(function(v){ return '<td>' + v.toFixed(3) + '</td>'; }).join('');
        tb.appendChild(tr);
    });
    // TC1 vs IE
    var tie = document.getElementById('tcIeBody');
    tie.innerHTML = '';
    BJT_TC1_IE.forEach(function(row, i){
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + BJT_IE[i] + '</td>' + row.map(function(v){ return '<td>' + v.toFixed(3) + '</td>'; }).join('');
        tie.appendChild(tr);
    });
    // VBG vs IE
    var vie = document.getElementById('vbgIeBody');
    vie.innerHTML = '';
    BJT_VBG_IE.forEach(function(row, i){
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + BJT_IE[i] + '</td>' + row.map(function(v){ return '<td>' + v.toFixed(4) + '</td>'; }).join('');
        vie.appendChild(tr);
    });
}

/* ========== 工具 ========== */
function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
}

/* ========== 初始化 ========== */
computePelgrom();
buildDevTable();
computeCalc();
renderLut();
buildCmpTable();
buildBjtTables();
renderBjt();

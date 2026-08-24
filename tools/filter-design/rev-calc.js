/* tools/filter-design/rev-calc.js
   反向计算子标签页：器件值 → 特征频率 / 幅频曲线 / 输出噪声谱
   （依赖 script.js 的全局：TOPO_SVGS、drawPlot、parseVal、fmt、KB 与 common.js 的 formatEngineering） */

/* ---- tab 切换 ---- */
(function initFdTabs() {
    var nav = document.getElementById('fdTabs');
    nav.addEventListener('click', function (e) {
        var btn = e.target.closest('.tab-btn');
        if (!btn) return;
        var key = btn.getAttribute('data-tab');
        var btns = nav.querySelectorAll('.tab-btn');
        var pns = document.querySelectorAll('.tab-panel');
        var i;
        for (i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i] === btn);
        for (i = 0; i < pns.length; i++) pns[i].classList.toggle('active', pns[i].getAttribute('data-panel') === key);
        if (key === 'rev') revUpdate();   // 隐藏时 canvas 宽度为 0，切回后按实际尺寸重画
    });
})();

/* 反算页器件字段：全独立输入（不假设配比；notch 例外，按标称配比 R3=R/2、C3=2C 输入代表值 R、C） */
var REV_ARCHS = {
    'rc-lp':  { comps: [['R1', 'R1'], ['C1', 'C1']],
                def: { R1: '10k', C1: '10n' } },
    'rc-hp':  { comps: [['R1', 'R1'], ['C1', 'C1']],
                def: { R1: '10k', C1: '10n' } },
    'sk-lp':  { comps: [['R1', 'R1'], ['R2', 'R2'], ['C1', 'C1'], ['C2', 'C2']],
                def: { R1: '10k', R2: '10k', C1: '20n', C2: '10n' } },
    'sk-hp':  { comps: [['C1', 'C1'], ['C2', 'C2'], ['R1', 'R1'], ['R2', 'R2']],
                def: { C1: '10n', C2: '10n', R1: '10k', R2: '20k' } },
    'rc-bp':  { comps: [['R1', 'R1（高通臂）'], ['C1', 'C1（高通臂）'], ['R2', 'R2（低通臂）'], ['C2', 'C2（低通臂）']],
                def: { R1: '16k', C1: '10n', R2: '1.6k', C2: '10n' } },
    'mfb-bp': { comps: [['R1', 'R1'], ['R2', 'R2'], ['R3', 'R3'], ['C1', 'C1'], ['C2', 'C2']],
                def: { R1: '10k', R2: '1.5k', R3: '20k', C1: '10n', C2: '10n' } },
    'notch':  { comps: [['R', 'R（R1=R2=R，R3=R/2）'], ['C', 'C（C1=C2=C，C3=2C）']],
                def: { R: '10k', C: '1n' } }
};

var re = {};
['rArch', 'rTopoFig', 'rCompFields', 'rTemp', 'rFst', 'rResultBody', 'rNoiseInfo']
    .forEach(function (id) { re[id] = document.getElementById(id); });

/* ---- 器件字段渲染（架构切换时重建并填入示例值） ---- */
function renderRevFields() {
    var arch = re.rArch.value;
    var def = REV_ARCHS[arch].def;
    var html = '';
    REV_ARCHS[arch].comps.forEach(function (pair) {
        html += '<div class="field"><label>' + pair[1] + '</label>' +
                '<div class="iu-row"><input type="text" data-key="' + pair[0] + '" value="' + def[pair[0]] + '">' +
                '<span class="unit">' + (pair[0][0] === 'R' ? 'Ω' : 'F') + '</span></div></div>';
    });
    re.rCompFields.innerHTML = html;
    re.rTopoFig.innerHTML = TOPO_SVGS[arch] || '';
}

/* 读取并校验器件值（全部为正才返回对象，否则 null） */
function revReadComps() {
    var inps = re.rCompFields.querySelectorAll('input');
    var c = {};
    for (var i = 0; i < inps.length; i++) {
        var v = parseVal(inps[i].value);
        if (!(v > 0)) return null;
        c[inps[i].getAttribute('data-key')] = v;
    }
    return c;
}

/* ---- 通用传递函数 |H(f)|（不假设配比，可评估非标称器件值） ---- */
function revH(arch, c, f) {
    var w = 2 * Math.PI * f, u, A, B;
    switch (arch) {
        case 'rc-lp': u = w * c.R1 * c.C1; return 1 / Math.sqrt(1 + u * u);
        case 'rc-hp': u = w * c.R1 * c.C1; return u / Math.sqrt(1 + u * u);
        case 'sk-lp':
            A = c.R1 * c.R2 * c.C1 * c.C2; B = w * c.C2 * (c.R1 + c.R2);
            return 1 / Math.sqrt(Math.pow(1 - w * w * A, 2) + B * B);
        case 'sk-hp':
            A = c.R1 * c.R2 * c.C1 * c.C2; B = w * (c.R1 * (c.C1 + c.C2) + c.R2 * c.C2);
            return w * w * A / Math.sqrt(Math.pow(1 - w * w * A, 2) + B * B);
        case 'rc-bp':
            var uL = w * c.R1 * c.C1, uH = w * c.R2 * c.C2;
            return (uL / Math.sqrt(1 + uL * uL)) / Math.sqrt(1 + uH * uH);
        case 'mfb-bp':
            var G12 = 1 / c.R1 + 1 / c.R2;
            A = c.C1 * c.C2 * c.R3; B = w * (c.C1 + c.C2);
            return (w * c.C1 * c.R3 / c.R1) / Math.sqrt(Math.pow(G12 - w * w * A, 2) + B * B);
        case 'notch':
            u = f * 2 * Math.PI * c.R * c.C;   // u = f/f0，f0 = 1/(2πRC)
            return Math.abs(1 - u * u) / Math.sqrt(Math.pow(1 - u * u, 2) + 16 * u * u);
    }
    return 1;
}

/* ---- 特征频率 / ΣR / 绘图参考频率 ---- */
function revFeatures(arch, c) {
    var rows = [], marks = [], sumR = 0, fref = 1, w0, Q, f0;
    function row(k, v) { rows.push([k, v]); }
    switch (arch) {
        case 'rc-lp':
        case 'rc-hp':
            f0 = 1 / (2 * Math.PI * c.R1 * c.C1);
            row('特征频率 fc', fmt(f0, 'Hz'));
            fref = f0; marks = [f0]; sumR = c.R1;
            break;
        case 'sk-lp':
            w0 = 1 / Math.sqrt(c.R1 * c.R2 * c.C1 * c.C2);
            Q = Math.sqrt(c.R1 * c.R2 * c.C1 * c.C2) / (c.C2 * (c.R1 + c.R2));
            f0 = w0 / (2 * Math.PI);
            row('特征频率 f0', fmt(f0, 'Hz'));
            row('品质因数 Q', Q.toFixed(3));
            fref = f0; marks = [f0]; sumR = c.R1 + c.R2;
            break;
        case 'sk-hp':
            w0 = 1 / Math.sqrt(c.R1 * c.R2 * c.C1 * c.C2);
            Q = Math.sqrt(c.R1 * c.R2 * c.C1 * c.C2) / (c.R1 * (c.C1 + c.C2) + c.R2 * c.C2);
            f0 = w0 / (2 * Math.PI);
            row('特征频率 f0', fmt(f0, 'Hz'));
            row('品质因数 Q', Q.toFixed(3));
            fref = f0; marks = [f0]; sumR = c.R1 + c.R2;
            break;
        case 'rc-bp':
            var fL = 1 / (2 * Math.PI * c.R1 * c.C1), fH = 1 / (2 * Math.PI * c.R2 * c.C2);
            row('下转折频率 fL（高通臂）', fmt(fL, 'Hz'));
            row('上转折频率 fH（低通臂）', fmt(fH, 'Hz'));
            if (fH <= fL) row('提示', 'fH ≤ fL，带通形态不成立（两转折交叉）');
            fref = Math.sqrt(fL * fH); marks = [fL, fH]; sumR = c.R1 + c.R2;
            break;
        case 'mfb-bp':
            var G12 = 1 / c.R1 + 1 / c.R2;
            w0 = Math.sqrt(G12 / (c.R3 * c.C1 * c.C2));
            Q = w0 * c.C1 * c.C2 * c.R3 / (c.C1 + c.C2);
            var H0 = c.C1 * c.R3 / (c.R1 * (c.C1 + c.C2));   // 中频增益模值
            f0 = w0 / (2 * Math.PI);
            row('中心频率 f0', fmt(f0, 'Hz'));
            row('品质因数 Q', Q.toFixed(3));
            row('中频增益 H0', '−' + formatEngineering(H0) + '（模值 ' + (20 * Math.log10(H0)).toFixed(1) + ' dB）');
            fref = f0; marks = [f0]; sumR = c.R1 + c.R2 + c.R3;
            break;
        case 'notch':
            f0 = 1 / (2 * Math.PI * c.R * c.C);
            row('陷波频率 f0', fmt(f0, 'Hz'));
            row('品质因数 Q', '0.25（标称配比固定）');
            fref = f0; marks = [f0]; sumR = 2.5 * c.R;
            break;
    }
    return { rows: rows, marks: marks, sumR: sumR, fref: fref };
}

/* ---- 主更新 ---- */
function revUpdate() {
    var arch = re.rArch.value;
    var T = parseFloat(re.rTemp.value);
    var c = revReadComps();
    if (!c || !(T > 0)) {
        re.rResultBody.innerHTML = '<tr><td colspan="2">请检查：所有器件值与温度需为正数。</td></tr>';
        re.rNoiseInfo.textContent = '';
        return;
    }
    var fe = revFeatures(arch, c);

    /* 结果表 + 可选 fst 校验 */
    var html = '';
    fe.rows.forEach(function (r) { html += '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; });
    var fst = parseVal(re.rFst.value);
    if (fst > 0) {
        var atten = -20 * Math.log10(Math.max(revH(arch, c, fst), 1e-12));
        html += '<tr><td>fst = ' + formatEngineering(fst) + 'Hz 处衰减</td><td>≈ ' + atten.toFixed(1) + ' dB</td></tr>';
    }
    re.rResultBody.innerHTML = html;

    /* 绘图频段：fref/100 ~ fref×100 */
    var fLo = fe.fref / 100, fHi = fe.fref * 100, N = 400;
    var freqs = [], mags = [], noise = [];
    var en2c = 4 * KB * T * fe.sumR;   // V²/Hz
    var integ = 0, fPrev = null, ePrev = 0;
    for (var i = 0; i <= N; i++) {
        var f = fLo * Math.pow(fHi / fLo, i / N);
        var h = revH(arch, c, f);
        freqs.push(f);
        mags.push(20 * Math.log10(Math.max(h, 1e-9)));
        var en = Math.sqrt(en2c) * h * 1e9;   // nV/√Hz
        noise.push(Math.max(en, 1e-6));
        if (fPrev !== null) integ += 0.5 * (en2c * h * h + ePrev) * (f - fPrev);
        fPrev = f; ePrev = en2c * h * h;
    }
    re.rNoiseInfo.textContent = 'ΣRᵢ = ' + fmt(fe.sumR, 'Ω') + ' ｜ 绘图频段内输出积分噪声 ≈ ' +
        fmt(Math.sqrt(integ), 'Vrms') + '（' + formatEngineering(fLo) + 'Hz ~ ' + formatEngineering(fHi) + 'Hz）';

    var marks = fe.marks.map(function (f) { return { f: f }; });
    if (fst > 0) marks.push({ f: fst, accent: true });
    drawPlot('rMagCanvas', freqs, mags, {
        color: '#3a5a8c', yMin: -90, yMax: 5, yGrid: [-80, -60, -40, -20, -3, 0], yUnit: ' dB', markers: marks
    });
    drawPlot('rNoiseCanvas', freqs, noise, {
        color: '#c0583a', yLog: true, yUnit: ' nV/√Hz', markers: marks
    });
}

/* ---- 事件绑定与初始化 ---- */
re.rArch.addEventListener('change', function () { renderRevFields(); revUpdate(); });
re.rCompFields.addEventListener('input', function (e) {
    if (e.target.tagName !== 'INPUT') return;
    revUpdate();
});
['rTemp', 'rFst'].forEach(function (id) {
    re[id].addEventListener('input', revUpdate);
    re[id].addEventListener('change', revUpdate);
});

renderRevFields();
revUpdate();

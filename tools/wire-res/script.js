/* tools/wire-res/script.js
   版图寄生计算：走线段（长度/宽度/金属层）→ 段阻值 / 对衬底电容 / 占比 / IR 压降
   支持 M1~M9/M_user 层预设（Rs 与单位衬底电容可手改）、温度系数修正、
   所有段同电流或逐段独立电流（总压降 = Σ(Ii×Ri)）、最差段（瓶颈）高亮
   （依赖 common.js 的 formatEngineering） */

var wr = {};
['wrCurrent', 'wrCurrentLabel', 'wrIMode', 'wrIFill', 'wrTemp', 'wrAlpha', 'wrAdd',
 'wrThI', 'wrBody', 'wrTotal', 'wrLayers', 'wrBottleneck', 'wrHint']
    .forEach(function (id) { wr[id] = document.getElementById(id); });

/* 金属层预设：rs 方块电阻（mΩ/□）、csub 单位面积对衬底电容（fF/µm²），
   典型量级可按工艺手册改写；选层自动带出默认值，手改任一项层标记回 M_user */
var LAYERS = [
    { key: 'M_user', name: 'M_user（自定义）', rs: null, csub: null },
    { key: 'M1', name: 'M1', rs: 80, csub: 0.39 },
    { key: 'M2', name: 'M2', rs: 80, csub: 0.31 },
    { key: 'M3', name: 'M3', rs: 80, csub: 0.29 },
    { key: 'M4', name: 'M4', rs: 70, csub: 0.21 },
    { key: 'M5', name: 'M5', rs: 60, csub: 0.19 },
    { key: 'M6', name: 'M6', rs: 50, csub: 0.11 },
    { key: 'M7', name: 'M7', rs: 40, csub: 0.09 },
    { key: 'M8', name: 'M8', rs: 20, csub: 0.07 },
    { key: 'M9', name: 'M9', rs: 8,  csub: 0.06 }
];

function layerPreset(key) {
    for (var i = 0; i < LAYERS.length; i++) if (LAYERS[i].key === key) return LAYERS[i];
    return null;
}

/* 默认 3 段示例（M1 层默认值），可删除或继续添加 */
var segs = [
    { L: 100, W: 2, Rs: 80, csub: 0.39, layer: 'M1', Ii: null },
    { L: 50, W: 0.5, Rs: 80, csub: 0.39, layer: 'M1', Ii: null },
    { L: 10, W: 10, Rs: 80, csub: 0.39, layer: 'M1', Ii: null }
];
var currMode = 'same';   // 'same' 所有段电流相同 | 'each' 各段电流不同

function fmtOhm(mOhm) { return formatEngineering(mOhm * 1e-3) + ' Ω'; }
function fmtCap(fF) { return formatEngineering(fF * 1e-15) + ' F'; }
function numVal(v) { return (v === null || v === undefined || !isFinite(v)) ? '' : v; }

function cellText(cls, i, txt) {
    var td = wr.wrBody.querySelector('.' + cls + '[data-i="' + i + '"]');
    if (td) td.textContent = txt;
}

/* 结构变化（增/删段、切换电流模式）时重建表格；数值编辑仅更新计算列，不打断输入 */
function renderRows() {
    var each = currMode === 'each';
    wr.wrThI.style.display = each ? '' : 'none';
    var html = '';
    segs.forEach(function (s, i) {
        var opts = LAYERS.map(function (L) {
            return '<option value="' + L.key + '"' + (s.layer === L.key ? ' selected' : '') + '>' + L.name + '</option>';
        }).join('');
        html += '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td><select class="wr-layer" data-i="' + i + '" title="选择金属层自动带出默认 Rs 与 Csub，仍可手改">' + opts + '</select></td>' +
            '<td><input type="number" data-i="' + i + '" data-k="L" value="' + numVal(s.L) + '" step="any" min="0"></td>' +
            '<td><input type="number" data-i="' + i + '" data-k="W" value="' + numVal(s.W) + '" step="any" min="0"></td>' +
            '<td><input type="number" data-i="' + i + '" data-k="Rs" value="' + numVal(s.Rs) + '" step="any" min="0"></td>' +
            '<td><input type="number" data-i="' + i + '" data-k="csub" value="' + numVal(s.csub) + '" step="any" min="0" title="单位面积对衬底电容 fF/µm²"></td>' +
            '<td class="wr-nsq" data-i="' + i + '">-</td>' +
            '<td class="wr-r" data-i="' + i + '">-</td>' +
            '<td class="wr-c" data-i="' + i + '">—</td>' +
            '<td class="wr-pct" data-i="' + i + '">-</td>' +
            (each ? '<td><input type="number" data-i="' + i + '" data-k="Ii" value="' + numVal(s.Ii) + '" step="any" min="0" placeholder="mA"></td>' : '') +
            '<td class="wr-v" data-i="' + i + '">—</td>' +
            '<td><button class="btn wr-del" data-i="' + i + '" type="button" title="删除本段">×</button></td>' +
            '</tr>';
    });
    wr.wrBody.innerHTML = html;
}

function update() {
    var each = currMode === 'each';
    var I = parseFloat(wr.wrCurrent.value);         // mA：same 模式全局电流 / each 模式统一填充基准
    var hasI = isFinite(I) && I > 0;
    var T = parseFloat(wr.wrTemp.value);            // °C（基准 27°C）
    var alpha = parseFloat(wr.wrAlpha.value);       // ppm/°C
    var hasTc = isFinite(T) && isFinite(alpha) && alpha >= 0;
    var tc = hasTc ? 1 + alpha * (T - 27) * 1e-6 : 1;
    if (!(tc > 0)) tc = 1;                          // 极端输入防御

    var sum = 0, sumC = 0, rs = [], cs = [];
    segs.forEach(function (s, i) {
        var ok = s.L > 0 && s.W > 0 && s.Rs > 0;
        var r = ok ? s.Rs * (s.L / s.W) * tc : NaN; // mΩ（温度修正后）
        rs.push(r);
        if (isFinite(r)) sum += r;
        var okc = s.L > 0 && s.W > 0 && s.csub > 0;
        var c = okc ? s.L * s.W * s.csub : NaN;     // fF：面积 L×W × 单位衬底电容
        cs.push(c);
        if (isFinite(c)) sumC += c;
        cellText('wr-nsq', i, ok ? (s.L / s.W).toFixed(2) : '-');
        cellText('wr-r', i, ok ? fmtOhm(r) : '-');
        cellText('wr-c', i, okc ? fmtCap(c) : '—');
    });

    /* 段压降：same 用全局 I，each 用各段 Ii（未填则该段不算） */
    var vs = [], vSum = 0, anyV = false;
    segs.forEach(function (s, i) {
        var r = rs[i], v = NaN;
        if (isFinite(r)) {
            if (each) {
                if (s.Ii > 0) v = s.Ii * 1e-3 * r * 1e-3;
            } else if (hasI) {
                v = I * 1e-3 * r * 1e-3;
            }
        }
        vs.push(v);
        if (isFinite(v)) { vSum += v; anyV = true; }
        cellText('wr-pct', i, (isFinite(r) && sum > 0) ? (r / sum * 100).toFixed(1) + ' %' : '-');
        cellText('wr-v', i, isFinite(v) ? formatEngineering(v) + ' V' : '—');
    });

    /* 最差段（压降最大）高亮 + 瓶颈提示条 */
    var rows = wr.wrBody.querySelectorAll('tr');
    rows.forEach(function (tr) { tr.classList.remove('wr-worst'); });
    var worst = -1, worstV = 0;
    vs.forEach(function (v, i) {
        if (isFinite(v) && v > worstV) { worstV = v; worst = i; }
    });
    if (worst >= 0 && vSum > 0 && rows[worst]) {
        rows[worst].classList.add('wr-worst');
        wr.wrBottleneck.style.display = '';
        wr.wrBottleneck.textContent = '瓶颈：第 ' + (worst + 1) + ' 段压降 ' + formatEngineering(worstV) +
            ' V（占总压降 ' + (worstV / vSum * 100).toFixed(1) + '%），建议加宽该段或换用更低 Rs 的金属层';
    } else {
        wr.wrBottleneck.style.display = 'none';
    }

    /* 分层小计（按层 ΣR 与 ΣC） */
    var byLayer = {};
    segs.forEach(function (s, i) {
        var k = s.layer || 'M_user';
        if (!byLayer[k]) byLayer[k] = { r: 0, c: 0 };
        if (isFinite(rs[i])) byLayer[k].r += rs[i];
        if (isFinite(cs[i])) byLayer[k].c += cs[i];
    });
    if (sum > 0 || sumC > 0) {
        var parts = [];
        LAYERS.forEach(function (L) {
            var b = byLayer[L.key];
            if (!b) return;
            var seg = [];
            if (b.r > 0) seg.push(fmtOhm(b.r) + (sum > 0 ? '（' + (b.r / sum * 100).toFixed(1) + '%）' : ''));
            if (b.c > 0) seg.push(fmtCap(b.c));
            if (seg.length) parts.push(L.key + ' = ' + seg.join(' ｜ '));
        });
        wr.wrLayers.textContent = parts.length ? '分层小计：' + parts.join(' ｜ ') : '';
    } else {
        wr.wrLayers.textContent = '';
    }

    var tNote = (hasTc && T !== 27) ? '（已按 T=' + T + '°C 修正，×' + parseFloat(tc.toFixed(6)) + '）' : '';
    if (segs.length === 0) {
        wr.wrTotal.textContent = '尚未添加走线段（点「+ 添加走线段」开始）';
    } else {
        var txt = '总阻抗 Rtot ≈ ' + fmtOhm(sum) + '（共 ' + segs.length + ' 段）' + tNote;
        if (sumC > 0) txt += ' ｜ 总对衬底电容 Ctot ≈ ' + fmtCap(sumC);
        wr.wrTotal.textContent = txt;
    }
    if (segs.length > 0 && anyV) {
        wr.wrHint.textContent = each ?
            '总压降 Σ(Ii×Ri) ≈ ' + formatEngineering(vSum) + ' V（各段独立电流压降求和）' :
            '总压降 IR ≈ ' + formatEngineering(vSum) + ' V（I = ' + I + ' mA，Rtot = ' + formatEngineering(sum * 1e-3) + ' Ω）';
    } else {
        wr.wrHint.textContent = '';
    }
}

/* ---- 事件绑定与初始化 ---- */
wr.wrBody.addEventListener('input', function (e) {
    var inp = e.target;
    if (inp.tagName !== 'INPUT') return;
    var i = +inp.getAttribute('data-i'), k = inp.getAttribute('data-k');
    segs[i][k] = inp.value === '' ? null : parseFloat(inp.value);
    if (k === 'Rs' || k === 'csub') {   // 手改默认参数 → 层标记回 M_user
        segs[i].layer = 'M_user';
        var sel = wr.wrBody.querySelector('select.wr-layer[data-i="' + i + '"]');
        if (sel) sel.value = 'M_user';
    }
    update();
});
wr.wrBody.addEventListener('change', function (e) {
    var sel = e.target;
    if (sel.tagName !== 'SELECT' || !sel.classList.contains('wr-layer')) return;
    var i = +sel.getAttribute('data-i');
    var L = layerPreset(sel.value);
    segs[i].layer = sel.value;
    if (L && L.rs !== null) {   // 选层自动带出默认 Rs 与 Csub（仍可手改）
        segs[i].Rs = L.rs;
        segs[i].csub = L.csub;
        var inpR = wr.wrBody.querySelector('input[data-i="' + i + '"][data-k="Rs"]');
        if (inpR) inpR.value = L.rs;
        var inpC = wr.wrBody.querySelector('input[data-i="' + i + '"][data-k="csub"]');
        if (inpC) inpC.value = L.csub;
    }
    update();
});
wr.wrBody.addEventListener('click', function (e) {
    var btn = e.target.closest('.wr-del');
    if (!btn) return;
    segs.splice(+btn.getAttribute('data-i'), 1);
    renderRows();
    update();
});
wr.wrAdd.addEventListener('click', function () {
    segs.push({ L: 10, W: 1, Rs: 80, csub: 0.39, layer: 'M1', Ii: null });
    renderRows();
    update();
});
wr.wrIMode.addEventListener('change', function () {
    currMode = wr.wrIMode.value === 'each' ? 'each' : 'same';
    var each = currMode === 'each';
    wr.wrCurrentLabel.textContent = each ? '统一填充值（点右侧按钮填入所有段，可再逐段微调）' : '通过电流 I（可选，填写后显示各段压降）';
    wr.wrIFill.style.display = each ? '' : 'none';
    wr.wrCurrent.placeholder = each ? '填入后点「统一填充」' : '留空则不算压降';
    renderRows();
    update();
});
wr.wrIFill.addEventListener('click', function () {
    var I = parseFloat(wr.wrCurrent.value);
    if (!isFinite(I) || I <= 0) return;
    segs.forEach(function (s) { s.Ii = I; });
    renderRows();
    update();
});
wr.wrCurrent.addEventListener('input', update);
wr.wrCurrent.addEventListener('change', update);
wr.wrTemp.addEventListener('input', update);
wr.wrTemp.addEventListener('change', update);
wr.wrAlpha.addEventListener('input', update);
wr.wrAlpha.addEventListener('change', update);

renderRows();
update();

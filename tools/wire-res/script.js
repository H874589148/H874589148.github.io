/* tools/wire-res/script.js
   版图寄生阻抗快速计算：走线段（长度/宽度/方块电阻）→ 段阻值 / 占比 / 总阻抗 / IR 压降
   支持金属层预设与分层小计、温度系数修正、最差段（瓶颈）高亮
   （依赖 common.js 的 formatEngineering） */

var wr = {};
['wrCurrent', 'wrTemp', 'wrAlpha', 'wrAdd', 'wrBody', 'wrTotal', 'wrLayers', 'wrBottleneck', 'wrHint']
    .forEach(function (id) { wr[id] = document.getElementById(id); });

/* 金属层预设（典型量级 mΩ/□，可按工艺手册改写；选层自动带出 Rs） */
var LAYERS = [
    { key: 'custom', name: '自定义', rs: null },
    { key: 'M1',   name: 'M1',  rs: 80 },
    { key: 'M2',   name: 'M2',  rs: 40 },
    { key: 'M3',   name: 'M3',  rs: 40 },
    { key: 'M4',   name: 'M4',  rs: 40 },
    { key: 'M5',   name: 'M5',  rs: 40 },
    { key: 'MTOP', name: 'MTOP（厚顶层）', rs: 15 }
];

function layerPreset(key) {
    for (var i = 0; i < LAYERS.length; i++) if (LAYERS[i].key === key) return LAYERS[i];
    return null;
}

/* 默认 3 段示例（M1：Rs = 80 mΩ/□ 量级） */
var segs = [
    { L: 100, W: 2, Rs: 80, layer: 'M1' },
    { L: 50, W: 0.5, Rs: 80, layer: 'M1' },
    { L: 10, W: 10, Rs: 80, layer: 'M1' }
];

function fmtOhm(mOhm) { return formatEngineering(mOhm * 1e-3) + ' Ω'; }

function cellText(cls, i, txt) {
    var td = wr.wrBody.querySelector('.' + cls + '[data-i="' + i + '"]');
    if (td) td.textContent = txt;
}

/* 结构变化（增/删段）时重建表格；数值编辑仅更新计算列，不打断输入 */
function renderRows() {
    var html = '';
    segs.forEach(function (s, i) {
        var opts = LAYERS.map(function (L) {
            return '<option value="' + L.key + '"' + (s.layer === L.key ? ' selected' : '') + '>' + L.name + '</option>';
        }).join('');
        html += '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td><select class="wr-layer" data-i="' + i + '" title="选择金属层自动带出典型 Rs，仍可手改">' + opts + '</select></td>' +
            '<td><input type="number" data-i="' + i + '" data-k="L" value="' + s.L + '" step="any" min="0"></td>' +
            '<td><input type="number" data-i="' + i + '" data-k="W" value="' + s.W + '" step="any" min="0"></td>' +
            '<td><input type="number" data-i="' + i + '" data-k="Rs" value="' + s.Rs + '" step="any" min="0"></td>' +
            '<td class="wr-nsq" data-i="' + i + '">-</td>' +
            '<td class="wr-r" data-i="' + i + '">-</td>' +
            '<td class="wr-pct" data-i="' + i + '">-</td>' +
            '<td class="wr-v" data-i="' + i + '">—</td>' +
            '<td><button class="btn wr-del" data-i="' + i + '" type="button" title="删除本段">×</button></td>' +
            '</tr>';
    });
    wr.wrBody.innerHTML = html;
}

function update() {
    var I = parseFloat(wr.wrCurrent.value);         // mA，可空
    var hasI = isFinite(I) && I > 0;
    var T = parseFloat(wr.wrTemp.value);            // °C（基准 27°C）
    var alpha = parseFloat(wr.wrAlpha.value);       // ppm/°C
    var hasTc = isFinite(T) && isFinite(alpha) && alpha >= 0;
    var tc = hasTc ? 1 + alpha * (T - 27) * 1e-6 : 1;
    if (!(tc > 0)) tc = 1;                          // 极端输入防御

    var sum = 0, rs = [];
    segs.forEach(function (s, i) {
        var ok = s.L > 0 && s.W > 0 && s.Rs > 0;
        var r = ok ? s.Rs * (s.L / s.W) * tc : NaN; // mΩ（温度修正后）
        rs.push(r);
        if (isFinite(r)) sum += r;
        cellText('wr-nsq', i, ok ? (s.L / s.W).toFixed(2) : '-');
        cellText('wr-r', i, ok ? fmtOhm(r) : '-');
    });
    segs.forEach(function (s, i) {
        var r = rs[i];
        cellText('wr-pct', i, (isFinite(r) && sum > 0) ? (r / sum * 100).toFixed(1) + ' %' : '-');
        cellText('wr-v', i, (isFinite(r) && hasI) ? formatEngineering(I * 1e-3 * r * 1e-3) + ' V' : '—');
    });

    /* 最差段（IR 压降最大）高亮 + 瓶颈提示条 */
    var rows = wr.wrBody.querySelectorAll('tr');
    rows.forEach(function (tr) { tr.classList.remove('wr-worst'); });
    var worst = -1, worstR = 0;
    if (hasI) {
        rs.forEach(function (r, i) {
            if (isFinite(r) && r > worstR) { worstR = r; worst = i; }
        });
    }
    if (worst >= 0 && sum > 0 && rows[worst]) {
        rows[worst].classList.add('wr-worst');
        var vWorst = I * 1e-3 * worstR * 1e-3;
        wr.wrBottleneck.style.display = '';
        wr.wrBottleneck.textContent = '瓶颈：第 ' + (worst + 1) + ' 段压降 ' + formatEngineering(vWorst) +
            ' V（占总压降 ' + (worstR / sum * 100).toFixed(1) + '%），建议加宽该段或换用更低 Rs 的金属层';
    } else {
        wr.wrBottleneck.style.display = 'none';
    }

    /* 分层小计（按层 ΣR 与占比） */
    var byLayer = {};
    segs.forEach(function (s, i) {
        if (!isFinite(rs[i])) return;
        var k = s.layer || 'custom';
        byLayer[k] = (byLayer[k] || 0) + rs[i];
    });
    if (sum > 0) {
        var parts = [];
        LAYERS.forEach(function (L) {
            if (byLayer[L.key] === undefined) return;
            parts.push(L.name + ' = ' + fmtOhm(byLayer[L.key]) + '（' + (byLayer[L.key] / sum * 100).toFixed(1) + '%）');
        });
        wr.wrLayers.textContent = parts.length ? '分层小计：' + parts.join(' ｜ ') : '';
    } else {
        wr.wrLayers.textContent = '';
    }

    var tNote = (hasTc && T !== 27) ? '（已按 T=' + T + '°C 修正，×' + parseFloat(tc.toFixed(6)) + '）' : '';
    if (segs.length === 0) {
        wr.wrTotal.textContent = '尚未添加走线段（点「+ 添加走线段」开始）';
    } else {
        wr.wrTotal.textContent = '总阻抗 Rtot ≈ ' + fmtOhm(sum) + '（共 ' + segs.length + ' 段）' + tNote;
    }
    wr.wrHint.textContent = (hasI && segs.length > 0) ?
        '总压降 IR ≈ ' + formatEngineering(I * 1e-3 * sum * 1e-3) + ' V（I = ' + I + ' mA，Rtot = ' + formatEngineering(sum * 1e-3) + ' Ω）' : '';
}

/* ---- 事件绑定与初始化 ---- */
wr.wrBody.addEventListener('input', function (e) {
    var inp = e.target;
    if (inp.tagName !== 'INPUT') return;
    var i = +inp.getAttribute('data-i'), k = inp.getAttribute('data-k');
    segs[i][k] = parseFloat(inp.value);
    if (k === 'Rs') {   // 手改 Rs → 层标记回「自定义」
        segs[i].layer = 'custom';
        var sel = wr.wrBody.querySelector('select.wr-layer[data-i="' + i + '"]');
        if (sel) sel.value = 'custom';
    }
    update();
});
wr.wrBody.addEventListener('change', function (e) {
    var sel = e.target;
    if (sel.tagName !== 'SELECT' || !sel.classList.contains('wr-layer')) return;
    var i = +sel.getAttribute('data-i');
    var L = layerPreset(sel.value);
    segs[i].layer = sel.value;
    if (L && L.rs !== null) {   // 选层自动带出 Rs（仍可手改）
        segs[i].Rs = L.rs;
        var inp = wr.wrBody.querySelector('input[data-i="' + i + '"][data-k="Rs"]');
        if (inp) inp.value = L.rs;
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
    segs.push({ L: 10, W: 1, Rs: 80, layer: 'M1' });
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

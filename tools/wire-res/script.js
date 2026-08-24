/* tools/wire-res/script.js
   版图寄生阻抗快速计算：走线段（长度/宽度/方块电阻）→ 段阻值 / 占比 / 总阻抗 / IR 压降
   （依赖 common.js 的 formatEngineering） */

var wr = {};
['wrCurrent', 'wrAdd', 'wrBody', 'wrTotal', 'wrHint']
    .forEach(function (id) { wr[id] = document.getElementById(id); });

/* 默认 3 段示例（顶层金属 Rs = 80 mΩ/□ 量级） */
var segs = [
    { L: 100, W: 2, Rs: 80 },
    { L: 50, W: 0.5, Rs: 80 },
    { L: 10, W: 10, Rs: 80 }
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
        html += '<tr>' +
            '<td>' + (i + 1) + '</td>' +
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
    var sum = 0, rs = [];
    segs.forEach(function (s, i) {
        var ok = s.L > 0 && s.W > 0 && s.Rs > 0;
        var r = ok ? s.Rs * (s.L / s.W) : NaN;      // mΩ
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

    if (segs.length === 0) {
        wr.wrTotal.textContent = '尚未添加走线段（点「+ 添加走线段」开始）';
    } else {
        wr.wrTotal.textContent = '总阻抗 Rtot ≈ ' + fmtOhm(sum) + '（共 ' + segs.length + ' 段）';
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
    segs.push({ L: 10, W: 1, Rs: 80 });
    renderRows();
    update();
});
wr.wrCurrent.addEventListener('input', update);
wr.wrCurrent.addEventListener('change', update);

renderRows();
update();

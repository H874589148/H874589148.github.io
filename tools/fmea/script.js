/* tools/fmea/script.js
   FMEA 工作台：失效模式查询（中英对照点击复制）+ S/O/D 打分参考 + 迷你 FMEDA 计算
   （依赖 common.js 的 formatEngineering / copyTextToClipboard 与 data.js 的 FMEA_DATA / SOD_DATA） */

'use strict';

function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
}

/* ============================================
   TAB 1 失效模式查询：大类 → 元器件 → 子元器件
   ============================================ */
var qCat = document.getElementById('fmCat');
var qComp = document.getElementById('fmComp');
var qSub = document.getElementById('fmSub');
var qDescZh = document.getElementById('fmDescZh');
var qDescEn = document.getElementById('fmDescEn');
var qModeBody = document.getElementById('fmModeBody');
var qCopyHint = document.getElementById('fmCopyHint');

function fillSelect(sel, labels) {
    sel.innerHTML = '';
    labels.forEach(function (t, i) {
        var o = document.createElement('option');
        o.value = String(i);
        o.textContent = t;
        sel.appendChild(o);
    });
}

function currentSub() {
    var cat = FMEA_DATA[Object.keys(FMEA_DATA)[qCat.selectedIndex]];
    return cat.items[qComp.selectedIndex].subs[qSub.selectedIndex];
}

function renderModes() {
    var sub = currentSub();
    qDescZh.textContent = sub.zh;
    qDescEn.textContent = sub.en;
    var html = '';
    sub.modes.forEach(function (m) {
        html += '<tr data-zh="' + m[0] + '" data-en="' + m[1] + '">' +
            '<td>' + m[0] + '</td><td>' + m[1] + '</td><td>' + m[2] + '</td></tr>';
    });
    qModeBody.innerHTML = html;
}

qCat.addEventListener('change', function () {
    var cat = FMEA_DATA[Object.keys(FMEA_DATA)[qCat.selectedIndex]];
    fillSelect(qComp, cat.items.map(function (it) { return it.comp; }));
    qComp.selectedIndex = 0;
    qComp.dispatchEvent(new Event('change'));
});
qComp.addEventListener('change', function () {
    var cat = FMEA_DATA[Object.keys(FMEA_DATA)[qCat.selectedIndex]];
    fillSelect(qSub, cat.items[qComp.selectedIndex].subs.map(function (s) { return s.sub; }));
    qSub.selectedIndex = 0;
    renderModes();
});
qSub.addEventListener('change', renderModes);

/* 点击行复制「中文 / English」 */
qModeBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (!tr) return;
    var text = tr.getAttribute('data-zh') + ' / ' + tr.getAttribute('data-en');
    copyTextToClipboard(text, function (ok) {
        if (ok) {
            tr.classList.add('copied');
            setTimeout(function () { tr.classList.remove('copied'); }, 600);
            qCopyHint.textContent = '已复制：' + text;
            setTimeout(function () { qCopyHint.textContent = '点击表内任意行复制「中文 / English」对照'; }, 1500);
        } else {
            qCopyHint.textContent = '复制失败，请手动选择文本';
        }
    });
});

/* 初始化三级联动 */
(function initQuery() {
    fillSelect(qCat, Object.keys(FMEA_DATA).map(function (k) { return FMEA_DATA[k].name; }));
    qCat.selectedIndex = 0;
    var cat = FMEA_DATA[Object.keys(FMEA_DATA)[0]];
    fillSelect(qComp, cat.items.map(function (it) { return it.comp; }));
    fillSelect(qSub, cat.items[0].subs.map(function (s) { return s.sub; }));
    renderModes();
})();

/* ============================================
   TAB 2 S / O / D 打分参考
   ============================================ */
['S', 'O', 'D'].forEach(function (k) {
    var def = SOD_DATA[k];
    var html = '<thead><tr><th>级</th><th>通用锚点</th><th>汽车电子示例</th></tr></thead><tbody>';
    def.rows.forEach(function (r) {
        html += '<tr><td class="sod-lv">' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>';
    });
    document.getElementById('sod' + k).innerHTML = html + '</tbody>';
});

/* ============================================
   TAB 3 FMEDA：失效率换算 + 迷你 FMEDA 表 + ASIL 对照
   ============================================ */
var cvFit = document.getElementById('cvFit');
var cvMtbf = document.getElementById('cvMtbf');
var cvLam = document.getElementById('cvLam');

function trim6(v) { return parseFloat(v.toPrecision(6)); }

/* FIT ↔ MTBF(h) ↔ λ(/h) 三向互算：改谁算谁，其余联动 */
cvFit.addEventListener('input', function () {
    var fit = parseFloat(cvFit.value);
    if (!(fit > 0)) { cvMtbf.value = ''; cvLam.value = ''; return; }
    var lam = fit * 1e-9;
    cvLam.value = trim6(lam);
    cvMtbf.value = trim6(1 / lam);
});
cvMtbf.addEventListener('input', function () {
    var mtbf = parseFloat(cvMtbf.value);
    if (!(mtbf > 0)) { cvFit.value = ''; cvLam.value = ''; return; }
    var lam = 1 / mtbf;
    cvLam.value = trim6(lam);
    cvFit.value = trim6(lam * 1e9);
});
cvLam.addEventListener('input', function () {
    var lam = parseFloat(cvLam.value);
    if (!(lam > 0)) { cvFit.value = ''; cvMtbf.value = ''; return; }
    cvFit.value = trim6(lam * 1e9);
    cvMtbf.value = trim6(1 / lam);
});

/* ---- 迷你 FMEDA 表 ---- */
var fmedaBody = document.getElementById('fmedaBody');

function addFmedaRow(name, lam, s, l, dc) {
    var tr = document.createElement('tr');
    tr.innerHTML =
        '<td><input class="fm-name" type="text" value="' + name + '"></td>' +
        '<td><input class="fm-lam" type="number" min="0" step="any" value="' + lam + '"></td>' +
        '<td><input class="fm-s" type="number" min="0" max="100" step="any" value="' + s + '"></td>' +
        '<td><input class="fm-l" type="number" min="0" max="100" step="any" value="' + l + '"></td>' +
        '<td><input class="fm-dc" type="number" min="0" max="100" step="any" value="' + dc + '"></td>' +
        '<td><button class="btn fm-del" type="button" title="删除该行">×</button></td>';
    fmedaBody.appendChild(tr);
}

fmedaBody.addEventListener('input', updateFmeda);
fmedaBody.addEventListener('click', function (e) {
    if (!e.target.classList.contains('fm-del')) return;
    var tr = e.target.closest('tr');
    if (tr) tr.remove();
    updateFmeda();
});
document.getElementById('fmedaAdd').addEventListener('click', function () {
    addFmedaRow('器件', 10, 0, 0, 90);
    updateFmeda();
});

/* ASIL 目标：SPFM/LFM 为 ≥（%），PMHF 为 <（FIT） */
var ASIL_TARGETS = {
    spfm: { B: 90, C: 97, D: 99 },
    lfm:  { B: 60, C: 80, D: 90 },
    pmhf: { B: 100, C: 100, D: 10 }
};

function asilCell(id, v, target, isGe) {
    var cell = document.getElementById(id);
    var base = (isGe ? '≥' : '<') + target + (id.indexOf('Pmhf') >= 0 ? ' FIT' : '%');
    if (!isFinite(v)) { cell.className = ''; cell.textContent = base; return; }
    var ok = isGe ? v >= target : v < target;
    cell.className = ok ? 'asil-pass' : 'asil-fail';
    cell.textContent = base + ' ｜ ' + (ok ? '达标' : '不达标');
}

function updateFmeda() {
    var sumLam = 0, sumSpf = 0, sumMpf = 0, latRes = 0;
    fmedaBody.querySelectorAll('tr').forEach(function (tr) {
        function num(cls) {
            var v = parseFloat(tr.querySelector(cls).value);
            return isFinite(v) ? v : 0;
        }
        var lam = num('.fm-lam'), s = num('.fm-s'), l = num('.fm-l'), dc = num('.fm-dc');
        var spf = lam * s / 100;          // 单点 + 残余故障
        var mpf = lam * l / 100;          // 潜伏多点故障
        sumLam += lam;
        sumSpf += spf;
        sumMpf += mpf;
        latRes += mpf * (1 - dc / 100);   // 安全机制未覆盖的潜伏残余
    });

    var spfm = sumLam > 0 ? (1 - sumSpf / sumLam) * 100 : NaN;
    var lfmDen = sumLam - sumSpf;
    var lfm = lfmDen > 0 ? (1 - sumMpf / lfmDen) * 100 : NaN;
    var pmhf = sumSpf + latRes;

    document.getElementById('sumLam').textContent = formatEngineering(sumLam) + ' FIT';
    document.getElementById('sumSpf').textContent = formatEngineering(sumSpf) + ' FIT';
    document.getElementById('sumMpf').textContent = formatEngineering(sumMpf) + ' FIT';
    document.getElementById('vSpfm').textContent = isFinite(spfm) ? spfm.toFixed(2) + ' %' : '—';
    document.getElementById('vLfm').textContent = isFinite(lfm) ? lfm.toFixed(2) + ' %' : '—';
    document.getElementById('vPmhf').textContent = formatEngineering(pmhf) + ' FIT';

    asilCell('asSpfmB', spfm, ASIL_TARGETS.spfm.B, true);
    asilCell('asSpfmC', spfm, ASIL_TARGETS.spfm.C, true);
    asilCell('asSpfmD', spfm, ASIL_TARGETS.spfm.D, true);
    asilCell('asLfmB', lfm, ASIL_TARGETS.lfm.B, true);
    asilCell('asLfmC', lfm, ASIL_TARGETS.lfm.C, true);
    asilCell('asLfmD', lfm, ASIL_TARGETS.lfm.D, true);
    asilCell('asPmhfB', pmhf, ASIL_TARGETS.pmhf.B, false);
    asilCell('asPmhfC', pmhf, ASIL_TARGETS.pmhf.C, false);
    asilCell('asPmhfD', pmhf, ASIL_TARGETS.pmhf.D, false);
}

/* 预置两行示例：演示 SPFM 达 C 不达 D、PMHF 达 B/C 不达 D */
addFmedaRow('电阻 R1', 10, 10, 5, 90);
addFmedaRow('MCU 内核', 500, 2, 1, 95);
updateFmeda();

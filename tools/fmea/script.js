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

/* ============================================
   TAB 1/2 ISO 26262-11 失效模式表（fm-data.js：表30 数字 / 表36 模拟·混合信号）
   开关1：全局查看 / 选择查看；开关2：中文 / English；任意组合下行点击复制中英对照
   ============================================ */
(function () {
    if (typeof FM_SHEETS === 'undefined') return;

    /* 双语 UI 文案：[zh, en] */
    var UI = {
        modeGlobal: ['全局查看', 'Global'],
        modeSelect: ['选择查看', 'By part'],
        partLabel: ['元器件名称', 'Part / subpart'],
        placeholder: ['— 请选择元器件 —', '— Select a part —'],
        hint: ['点击表内任意行复制「中文 / English」对照', 'Click any row to copy the "中文 / English" pair'],
        copied: ['已复制：', 'Copied: '],
        copyFail: ['复制失败，请手动选择文本', 'Copy failed, please select the text manually']
    };

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function br(s) { return esc(s).replace(/\n/g, '<br>'); }
    /* 脚注 / 来源行是 "中文　/　English" 单串，按全角分隔符拆分 */
    function splitBi(s) {
        var m = String(s).split(/\u3000[\/|]\u3000/);
        return m.length === 2 ? [m[0].trim(), m[1].trim()] : [s, s];
    }

    function createSheetViewer(rootId, sheet) {
        var root = document.getElementById(rootId);
        if (!root) return;
        var els = {
            segMode: root.querySelector('.seg-mode'),
            segLang: root.querySelector('.seg-lang'),
            caption: root.querySelector('.fms-caption'),
            picker: root.querySelector('.fms-picker'),
            partLabel: root.querySelector('.fms-part-label'),
            select: root.querySelector('.fms-part'),
            desc: root.querySelector('.fms-desc'),
            head: root.querySelector('.fms-head'),
            body: root.querySelector('.fms-body'),
            hint: root.querySelector('.fms-hint'),
            meta: root.querySelector('.fms-meta')
        };
        var state = { mode: 'global', lang: 'zh' };
        var langIdx = function () { return state.lang === 'en' ? 1 : 0; };
        var T = function (pair) { return pair[langIdx()]; };

        /* 元器件清单：按出现顺序去重；cat 供模拟表 optgroup 分组 */
        var parts = [], partMap = {}, curCat = null;
        sheet.rows.forEach(function (r) {
            if (r.t === 'cat') { curCat = { zh: r.zh, en: r.en }; return; }
            var key = r.p[0];
            if (!partMap[key]) {
                partMap[key] = { zh: r.p[0], en: r.p[1], cat: curCat, rows: [] };
                parts.push(partMap[key]);
            }
            partMap[key].rows.push(r);
        });

        function renderSegLabels() {
            var mb = els.segMode.querySelectorAll('.seg-btn');
            mb[0].textContent = T(UI.modeGlobal);
            mb[1].textContent = T(UI.modeSelect);
            els.partLabel.textContent = T(UI.partLabel);
        }

        /* 下拉选项（模拟表按大类 optgroup 分组），语言切换时重建并保持选中 */
        function renderOptions() {
            var prev = els.select.value;
            els.select.innerHTML = '';
            var ph = document.createElement('option');
            ph.value = '';
            ph.textContent = T(UI.placeholder);
            els.select.appendChild(ph);
            var hasCat = parts.some(function (p) { return p.cat; });
            var groupMap = {};
            parts.forEach(function (p, i) {
                var o = document.createElement('option');
                o.value = String(i);
                o.textContent = state.lang === 'en' ? p.en : p.zh;
                if (hasCat && p.cat) {
                    var gk = p.cat.zh;
                    if (!groupMap[gk]) {
                        groupMap[gk] = document.createElement('optgroup');
                        groupMap[gk].label = state.lang === 'en' ? p.cat.en : p.cat.zh;
                        els.select.appendChild(groupMap[gk]);
                    }
                    groupMap[gk].appendChild(o);
                } else {
                    els.select.appendChild(o);
                }
            });
            els.select.value = prev;
        }

        function renderHead() {
            els.head.innerHTML = sheet.head[state.lang].map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('');
        }

        /* 数据行 → html；copyList 与渲染行一一对应，供点击复制 */
        function rowHtml(r, copyList) {
            var li = langIdx();
            copyList.push(r.p[0] + '：' + r.m[0] + ' / ' + r.p[1] + ': ' + r.m[1]);
            return '<tr data-i="' + (copyList.length - 1) + '">' +
                '<td>' + br(r.p[li]) + '</td><td>' + br(r.f[li]) + '</td><td>' + br(r.m[li]) + '</td></tr>';
        }

        function renderBody() {
            var li = langIdx();
            var copyList = [];
            var html = '';
            if (state.mode === 'global') {
                sheet.rows.forEach(function (r) {
                    if (r.t === 'cat') {
                        html += '<tr class="fms-cat"><td colspan="3">' + br(li === 1 ? r.en : r.zh) + '</td></tr>';
                    } else {
                        html += rowHtml(r, copyList);
                    }
                });
            } else {
                var p = els.select.value === '' ? null : parts[+els.select.value];
                if (p) {
                    p.rows.forEach(function (r) { html += rowHtml(r, copyList); });
                } else {
                    html = '<tr class="fms-empty"><td colspan="3">' + T(UI.placeholder) + '</td></tr>';
                }
            }
            els.body._copy = copyList;
            els.body.innerHTML = html;
        }

        /* 选择查看：显示该元器件的功能/简要描述（去重） */
        function renderDesc() {
            var p = els.select.value === '' ? null : parts[+els.select.value];
            if (state.mode !== 'select' || !p) { els.desc.innerHTML = ''; return; }
            var li = langIdx();
            var seen = {}, html = '';
            p.rows.forEach(function (r) {
                var t = r.f[li];
                if (t && !seen[t]) {
                    seen[t] = true;
                    html += '<p>' + br(t) + '</p>';
                }
            });
            els.desc.innerHTML = html;
        }

        function renderMeta() {
            var li = langIdx();
            var html = '';
            sheet.foots.forEach(function (f) {
                html += '<p>' + br(splitBi(f)[li]) + '</p>';
            });
            if (sheet.src) {
                var sp = sheet.src.split(/ \/ Source:\s*/);
                html += '<p>' + br(li === 1 && sp[1] ? 'Source: ' + sp[1] : sp[0]) + '</p>';
            }
            els.meta.innerHTML = html;
        }

        function renderAll() {
            renderSegLabels();
            els.caption.textContent = sheet.caption[state.lang];
            renderHead();
            renderOptions();
            els.picker.hidden = state.mode !== 'select';
            renderDesc();
            renderBody();
            els.hint.textContent = T(UI.hint);
            renderMeta();
        }

        els.segMode.addEventListener('click', function (e) {
            var btn = e.target.closest('.seg-btn');
            if (!btn || btn.dataset.mode === state.mode) return;
            state.mode = btn.dataset.mode;
            els.segMode.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
            els.picker.hidden = state.mode !== 'select';
            renderDesc();
            renderBody();
        });
        els.segLang.addEventListener('click', function (e) {
            var btn = e.target.closest('.seg-btn');
            if (!btn || btn.dataset.lang === state.lang) return;
            state.lang = btn.dataset.lang;
            els.segLang.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
            renderAll();
        });
        els.select.addEventListener('change', function () {
            renderDesc();
            renderBody();
        });

        /* 点击行复制「元器件：失效模式 中文 / English」（四种开关组合均有效） */
        els.body.addEventListener('click', function (e) {
            var tr = e.target.closest('tr');
            if (!tr || tr.getAttribute('data-i') === null) return;
            var text = els.body._copy[+tr.getAttribute('data-i')];
            copyTextToClipboard(text, function (ok) {
                if (ok) {
                    tr.classList.add('copied');
                    setTimeout(function () { tr.classList.remove('copied'); }, 600);
                    els.hint.textContent = T(UI.copied) + text;
                    setTimeout(function () { els.hint.textContent = T(UI.hint); }, 1500);
                } else {
                    els.hint.textContent = T(UI.copyFail);
                }
            });
        });

        renderAll();
    }

    createSheetViewer('tab-fmdigital', FM_SHEETS[0]);
    createSheetViewer('tab-fmanalog', FM_SHEETS[1]);
})();

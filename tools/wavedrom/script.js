/* tools/wavedrom/script.js
   WaveDrom 波形编辑器：JSON 编辑 + 图形化点击编辑，双向同步
   （库：js/vendor/wavedrom.min.js，加载失败回退 CDN） */

'use strict';

var jsonEl = document.getElementById('wdJson');
var errEl = document.getElementById('wdErr');
var outEl = document.getElementById('wdOut');
var panelEl = document.getElementById('wdPanel');
var menuEl = document.getElementById('wdMenu');
var panelText = document.getElementById('wdPanelText');
var panelColor = document.getElementById('wdPanelColor');

var source = null;      // WaveJSON 对象
var geom = null;        // {ov, laneX, laneYs[], slotW}
var panelCtx = null;    // 数据槽面板上下文 {lane, ci}
var menuCtx = null;     // 右键菜单上下文 {lane, ci}

var DEFAULT_SRC = {
    signal: [
        { name: 'clk',   wave: 'p.......' },
        { name: 'div2',  wave: '0.1.0.1.' },
        { name: 'div4',  wave: '0...1...' },
        { name: 'state', wave: '2.2.2.2.', data: ['IDLE', 'RUN', 'CAL', 'DONE'] }
    ]
};

/* ============================================
   wave 字符串工具（'|' 为时间标记，渲染上占半槽宽）
   ============================================ */
function hscaleOf() { return (source.config && parseFloat(source.config.hscale)) || 1; }

/* data 字符（2~9）下标 → data 数组序号 */
function dataIndexAt(wave, ci) {
    var cnt = -1;
    for (var i = 0; i <= ci; i++) if (/[2-9]/.test(wave[i])) cnt++;
    return cnt;
}

/* lane.data 统一读出为数组（WaveDrom 允许数组或空格分隔字符串） */
function laneData(lane) {
    if (!lane.data) return [];
    return Array.isArray(lane.data) ? lane.data.slice() : String(lane.data).split(/\s+/);
}

/* ============================================
   渲染 + 热区层
   ============================================ */
function commit() {
    jsonEl.value = JSON.stringify(source, null, 2);
    render();
}

function render() {
    closePanel();
    closeMenu();
    outEl.innerHTML = '';
    if (!window.WaveDrom) { errEl.textContent = 'WaveDrom 库未加载。'; return; }
    try {
        /* 传深拷贝，防止库内部写回污染源对象 */
        window.WaveDrom.renderWaveForm(0, JSON.parse(JSON.stringify(source)), outEl);
    } catch (e) {
        errEl.textContent = '渲染失败：' + e.message;
        return;
    }
    buildOverlay();
}

/* 从渲染结果的 SVG 结构提取几何（名字区宽 / 各 lane 顶 y / 槽宽），建透明热区层 */
function buildOverlay() {
    geom = null;
    var svgEl = outEl.querySelector('svg');
    if (!svgEl) return;
    var w, h;
    var vb = svgEl.getAttribute('viewBox');
    if (vb) {
        var p = vb.trim().split(/[\s,]+/);
        w = parseFloat(p[2]); h = parseFloat(p[3]);
    } else {
        w = svgEl.width.baseVal.value; h = svgEl.height.baseVal.value;
    }
    var ov = document.createElement('div');
    ov.className = 'wd-overlay';
    ov.style.width = w + 'px';
    ov.style.height = h + 'px';
    /* 对齐 svg 在 outEl 内的实际位置（outEl 有 padding，绝对定位相对其内缘） */
    ov.style.left = svgEl.offsetLeft + 'px';
    ov.style.top = svgEl.offsetTop + 'px';
    outEl.appendChild(ov);

    /* lanes 组 translate = (波形区起始 x,  lanes y 偏移)；wavelane 子组 y 相对 lanes 组 */
    var laneX = 0, lanesY = 0;
    var lanesG = svgEl.querySelector('g[id^="lanes_"]');
    if (lanesG) {
        var m = /translate\(\s*([\d.eE+-]+)(?:[ ,]\s*([\d.eE+-]+))?/.exec(lanesG.getAttribute('transform') || '');
        if (m) { laneX = parseFloat(m[1]); lanesY = parseFloat(m[2] || '0'); }
    }
    var laneYs = [];
    svgEl.querySelectorAll('g').forEach(function (g) {
        if (!/^wavelane_\d+_\d+$/.test(g.id)) return;
        var m2 = /translate\(\s*[\d.eE+-]+[ ,]\s*([\d.eE+-]+)/.exec(g.getAttribute('transform') || '');
        laneYs.push(lanesY + (m2 ? parseFloat(m2[1]) : 0));
    });
    var hscale = hscaleOf();
    geom = { ov: ov, laneX: laneX, laneYs: laneYs, halfW: 20 * hscale };
    bindOverlay(ov);
}

function hitLane(x, y) {
    if (!geom || !source) return null;
    for (var i = 0; i < geom.laneYs.length; i++) {
        var y0 = geom.laneYs[i] - 5;
        var y1 = (i + 1 < geom.laneYs.length ? geom.laneYs[i + 1] : geom.laneYs[i] + 30) - 5;
        if (y >= y0 && y < y1) return { lane: i, isName: x < geom.laneX };
    }
    return null;
}

/* x（相对波形区起点，px）→ wave 字符串下标；普通字符占 2 半槽、'|' 占 1 半槽；点中 '|' 或界外返回 -1 */
function charIndexAtX(lane, relX) {
    if (relX < 0) return -1;
    var pos = 0;
    for (var i = 0; i < lane.wave.length; i++) {
        pos += lane.wave[i] === '|' ? 1 : 2;
        if (relX < pos * geom.halfW) return lane.wave[i] === '|' ? -1 : i;
    }
    return -1;
}

/* 命中 wave lane 的合法槽位；返回 {lane, ci, ch} 或 null */
function hitSlot(x, y) {
    var g = hitLane(x, y);
    if (!g || g.isName) return null;
    var lane = source.signal[g.lane];
    if (!lane || !lane.wave) return null;
    var ci = charIndexAtX(lane, x - geom.laneX);
    if (ci < 0) return null;
    return { lane: g.lane, ci: ci, ch: lane.wave[ci] };
}

function bindOverlay(ov) {
    /* 单击：电平循环 / 数据槽面板 */
    ov.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMenu();
        var h = hitSlot(e.offsetX, e.offsetY);
        if (!h) { closePanel(); return; }
        var lane = source.signal[h.lane];
        if (/[2-9]/.test(h.ch)) { openPanel(h.lane, h.ci, e.clientX, e.clientY); return; }
        closePanel();
        var cyc = ['0', '1', 'x', 'z', '.'];
        var next = cyc[(cyc.indexOf(h.ch) + 1) % cyc.length];
        lane.wave = lane.wave.slice(0, h.ci) + next + lane.wave.slice(h.ci + 1);
        commit();
    });
    /* 双击信号名：重命名 */
    ov.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        var g = hitLane(e.offsetX, e.offsetY);
        if (!g || !g.isName) return;
        var lane = source.signal[g.lane];
        if (!lane) return;
        var t = prompt('信号名：', lane.name || '');
        if (t !== null) { lane.name = t; commit(); }
    });
    /* 右键：插入 / 删除时间槽 */
    ov.addEventListener('contextmenu', function (e) {
        var h = hitSlot(e.offsetX, e.offsetY);
        if (!h) return;
        e.preventDefault();
        e.stopPropagation();
        closePanel();
        menuCtx = { lane: h.lane, ci: h.ci };
        menuEl.style.display = 'block';
        menuEl.style.left = Math.min(e.clientX, window.innerWidth - 190) + 'px';
        menuEl.style.top = Math.min(e.clientY, window.innerHeight - 90) + 'px';
    });
}

/* ============================================
   数据槽编辑面板
   ============================================ */
for (var ci2 = 2; ci2 <= 9; ci2++) {
    var opt = document.createElement('option');
    opt.value = String(ci2);
    opt.textContent = '色块 ' + ci2;
    panelColor.appendChild(opt);
}

function openPanel(li, ci, cx, cy) {
    panelCtx = { lane: li, ci: ci };
    var lane = source.signal[li];
    var data = laneData(lane);
    panelText.value = data[dataIndexAt(lane.wave, ci)] || '';
    panelColor.value = lane.wave[ci];
    panelEl.style.display = 'block';
    panelEl.style.left = Math.min(cx, window.innerWidth - 240) + 'px';
    panelEl.style.top = Math.min(cy, window.innerHeight - 220) + 'px';
}
function closePanel() { panelEl.style.display = 'none'; panelCtx = null; }
function closeMenu() { menuEl.style.display = 'none'; menuCtx = null; }

document.getElementById('wdPanelOk').addEventListener('click', function () {
    if (!panelCtx) return;
    var lane = source.signal[panelCtx.lane];
    var di = dataIndexAt(lane.wave, panelCtx.ci);
    var data = laneData(lane);
    while (data.length <= di) data.push('');
    data[di] = panelText.value;
    lane.data = data;
    lane.wave = lane.wave.slice(0, panelCtx.ci) + panelColor.value + lane.wave.slice(panelCtx.ci + 1);
    closePanel();
    commit();
});
document.getElementById('wdPanelDel').addEventListener('click', function () {
    if (!panelCtx) return;
    deleteSlot(source.signal[panelCtx.lane], panelCtx.ci);
    closePanel();
    commit();
});

/* 删除某 lane 的 ci 字符（data 槽同步删 data 项） */
function deleteSlot(lane, ci) {
    if (/[2-9]/.test(lane.wave[ci]) && lane.data) {
        var data = laneData(lane);
        data.splice(dataIndexAt(lane.wave, ci), 1);
        if (data.length) lane.data = data; else delete lane.data;
    }
    lane.wave = lane.wave.slice(0, ci) + lane.wave.slice(ci + 1);
}

/* 右键菜单动作 */
document.getElementById('wdMenuIns').addEventListener('click', function () {
    if (!menuCtx) return;
    var lane = source.signal[menuCtx.lane];
    lane.wave = lane.wave.slice(0, menuCtx.ci) + '.' + lane.wave.slice(menuCtx.ci);
    closeMenu();
    commit();
});
document.getElementById('wdMenuDel').addEventListener('click', function () {
    if (!menuCtx) return;
    deleteSlot(source.signal[menuCtx.lane], menuCtx.ci);
    closeMenu();
    commit();
});

/* 点击页面其他位置关闭浮层 */
document.addEventListener('click', function (e) {
    if (panelCtx && !panelEl.contains(e.target)) closePanel();
    if (menuCtx && !menuEl.contains(e.target)) closeMenu();
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closePanel(); closeMenu(); }
});

/* ============================================
   工具栏
   ============================================ */
document.getElementById('addSig').addEventListener('click', function () {
    source.signal.push({ name: 'sig' + (source.signal.length + 1), wave: '0.1.0.1.' });
    commit();
});
document.getElementById('addClk').addEventListener('click', function () {
    source.signal.push({ name: 'clk' + (source.signal.length + 1), wave: 'p.......' });
    commit();
});
document.getElementById('insSlot').addEventListener('click', function () {
    source.signal.forEach(function (l) { if (l.wave) l.wave += '.'; });
    commit();
});
document.getElementById('delSlot').addEventListener('click', function () {
    source.signal.forEach(function (l) {
        if (!l.wave) return;
        var i = l.wave.length - 1;
        while (i >= 0 && l.wave[i] === '|') i--;
        if (i >= 0) deleteSlot(l, i);
    });
    commit();
});

/* ============================================
   JSON 双向同步（手动编辑防抖 300ms，语法错误红字提示不中断）
   ============================================ */
var debTimer = null;
jsonEl.addEventListener('input', function () {
    clearTimeout(debTimer);
    debTimer = setTimeout(function () {
        try {
            var d = JSON.parse(jsonEl.value);
            if (!d || !Array.isArray(d.signal)) throw new Error('顶层需要 "signal" 数组');
            source = d;
            errEl.textContent = '';
            render();
        } catch (e) {
            errEl.textContent = 'JSON 语法错误：' + e.message;
        }
    }, 300);
});

/* ============================================
   导出 SVG / PNG
   ============================================ */
function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

function exportSvgStr() {
    var svgEl = outEl.querySelector('svg');
    if (!svgEl) return null;
    var str = svgEl.outerHTML;
    if (str.indexOf('xmlns') < 0) str = str.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    str = str.replace(/(<svg[^>]*>)/, '$1<rect width="100%" height="100%" fill="#ffffff"/>');
    return str;
}

document.getElementById('expSvg').addEventListener('click', function () {
    var str = exportSvgStr();
    if (!str) return;
    download('waveform.svg', new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + str], { type: 'image/svg+xml' }));
});

document.getElementById('expPng').addEventListener('click', function () {
    var str = exportSvgStr();
    var svgEl = outEl.querySelector('svg');
    if (!str || !svgEl) return;
    var w = svgEl.viewBox && svgEl.viewBox.baseVal ? svgEl.viewBox.baseVal.width : svgEl.width.baseVal.value;
    var h = svgEl.viewBox && svgEl.viewBox.baseVal ? svgEl.viewBox.baseVal.height : svgEl.height.baseVal.value;
    var img = new Image();
    img.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = w * 2; cv.height = h * 2;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (bl) { if (bl) download('waveform.png', bl); });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
});

/* ============================================
   启动（WaveDrom 本地加载，失败回退 CDN）
   ============================================ */
function init() {
    source = JSON.parse(JSON.stringify(DEFAULT_SRC));
    jsonEl.value = JSON.stringify(source, null, 2);
    render();
}

if (window.WaveDrom) {
    init();
} else {
    var cdn = document.createElement('script');
    cdn.src = 'https://cdnjs.cloudflare.com/ajax/libs/wavedrom/3.5.0/wavedrom.min.js';
    cdn.onload = init;
    cdn.onerror = function () { errEl.textContent = 'WaveDrom 库加载失败：本地 vendor 与 CDN 均不可用。'; };
    document.head.appendChild(cdn);
}

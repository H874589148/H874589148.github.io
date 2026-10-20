/* tools/bode-plot/script.js - Bode 图绘制（纯 Canvas，无第三方依赖） */

/* ========== 数据结构 ========== */
var poles = [];   // [{freq: Hz}]
var zeros = [];   // [{freq: Hz}]
var poleCount = 0;
var zeroCount = 0;

/* 输入草稿与已生效快照隔离；读数框、图与摘要只使用同一有效快照。 */
var lastRange = { fStart: 1, fEnd: 1e8 };
var lastPlot = null;
var approximation = '';
var sliderBounds = { min: -3, max: 12 };
var gainUnit = 'dB';
var drawFrame = 0;
function byId(id) { return document.getElementById(id); }
function setError(input, message) { input.setAttribute('aria-invalid', String(!!message)); }
function scheduleDraw() {
    byId('plotStatus').textContent = '参数正在更新；图表与读数暂为上次有效结果。';
    byId('plotStatus').classList.add('is-stale');
    if (!drawFrame) drawFrame = requestAnimationFrame(function () { drawFrame = 0; drawBode(); });
}
function markUnapplied(reason) {
    byId('plotStatus').textContent = '参数未生效：' + reason + '；曲线、裕度和鼠标读数保留上次有效结果。';
    byId('plotStatus').classList.add('is-stale');
}

/* ========== 直流增益单位联动 (dB <-> V/V) ========== */
function getGainDb() {
    var text = byId('dcGain').value.trim(), v = Number(text);
    if (!text || !Number.isFinite(v)) throw new Error('请输入有限的直流增益');
    if (byId('dcUnit').value === 'vv') {
        if (v <= 0) throw new Error('V/V 增益须大于 0；反相增益请使用传递函数表达式并留意近似提示');
        v = 20 * Math.log10(v);
    }
    if (Math.abs(v) > 1e6) throw new Error('增益安全范围为 |dB| ≤ 1e6');
    return v;
}

function updateGainConv() {
    var input = byId('dcGain'), conv = byId('dcConv'), gainDb, error = '';
    try { gainDb = getGainDb(); }
    catch (err) { error = err.message; }
    byId('gainError').textContent = error; setError(input, error);
    if (error) { conv.textContent = ''; return null; }
    var v = Number(input.value);
    if (byId('dcUnit').value === 'dB') {
        var vv = Math.pow(10, v / 20);
        conv.textContent = !Number.isFinite(vv) || vv === 0 ? fmtNum(v) + ' dB（线性换算超出浮点范围，可继续使用 dB 绘图）' : fmtNum(v) + ' dB = ' + fmtNum(vv) + ' V/V';
    } else {
        conv.textContent = fmtNum(v) + ' V/V = ' + fmtNum(gainDb) + ' dB';
    }
    return gainDb;
}

function onGainUnitChange() {
    var el = byId('dcGain'), select = byId('dcUnit'), unit = select.value;
    var v = Number(el.value), converted = unit === 'vv' ? Math.pow(10, v / 20) : 20 * Math.log10(v);
    if (!el.value.trim() || !Number.isFinite(v) || !Number.isFinite(converted) || (unit === 'vv' && converted <= 0)) {
        select.value = gainUnit;
        byId('gainError').textContent = '当前值不能换算为目标单位，请修正输入或继续使用 dB。';
        return;
    }
    el.value = String(converted); gainUnit = unit;
    updateGainConv(); drawBode();
}

function fmtNum(x) {
    if (!isFinite(x)) return '∞';
    return x !== 0 && (Math.abs(x) >= 1e6 || Math.abs(x) < 1e-3) ? x.toExponential(5) : String(Number(x.toPrecision(7)));
}

function onGainInput() {
    // 字段反馈不等待绘图帧；后台暂停 rAF 时也能清除旧换算值并提示错误。
    hidePresetInfo();
    var gainDb = updateGainConv();
    scheduleDraw();
    if (gainDb === null) markUnapplied('请修正标红输入');
}
['input', 'change', 'blur'].forEach(function (event) { byId('dcGain').addEventListener(event, onGainInput); });
document.getElementById('dcUnit').addEventListener('change', onGainUnitChange);
updateGainConv();

/* ========== 极点/零点管理 ========== */
function addPole(freq) {
    freq = freq || 10000;
    hidePresetInfo();
    poleCount++;
    var id = 'p' + poleCount;
    poles.push({ id: id, freq: freq });
    renderPZList('poleList', poles, 'pole');
    drawBode();
}

function addZero(freq) {
    freq = freq || 1000;
    hidePresetInfo();
    zeroCount++;
    var id = 'z' + zeroCount;
    zeros.push({ id: id, freq: freq });
    renderPZList('zeroList', zeros, 'zero');
    drawBode();
}

function removePZ(type, id) {
    hidePresetInfo();
    if (type === 'pole') {
        poles = poles.filter(function(p){ return p.id !== id; });
        renderPZList('poleList', poles, 'pole');
    } else {
        zeros = zeros.filter(function(z){ return z.id !== id; });
        renderPZList('zeroList', zeros, 'zero');
    }
    drawBode();
}

function initPZ(item) {
    if (!item.mode) { item.mode = 'frequency'; item.text = String(item.freq) + ' Hz'; item.r = ''; item.c = ''; }
    return item;
}
function readPZ(item) {
    initPZ(item);
    var card = byId('item-' + item.id), error = '', values = {}, missing = [];
    var keys = item.mode === 'rc' ? ['r', 'c'] : ['text'];
    keys.forEach(function (key) {
        var input = card.querySelector('[data-field="' + key + '"]');
        if (item.mode === 'rc' && !item[key].trim()) {
            missing.push(key.toUpperCase()); setError(input, ''); return;
        }
        try { values[key] = BodeCore.parseQuantity(item[key], key === 'r' ? 'Ω' : key === 'c' ? 'F' : 'Hz'); setError(input, ''); }
        catch (err) { setError(input, err.message); error += (key === 'r' ? 'R：' : key === 'c' ? 'C：' : '') + err.message + '；'; }
    });
    if (!error && !missing.length) {
        try { item.freq = item.mode === 'rc' ? BodeCore.rcFrequency(values.r, values.c) : values.text; }
        catch (err) {
            error = 'RC 换算失败：' + err.message;
            keys.forEach(function (key) { setError(card.querySelector('[data-field="' + key + '"]'), error); });
        }
    }
    card.querySelector('.input-error').textContent = error;
    card.querySelector('.pz-result').textContent = error ? '参数未生效' : missing.length ? '待输入 ' + missing.join('、') : 'f = ' + BodeCore.format(item.freq, 'Hz');
    return error ? 'invalid' : missing.length ? 'pending' : 'valid';
}
function renderPZList(containerId, list, type) {
    var el = byId(containerId); el.innerHTML = '';
    list.forEach(function (item, index) {
        initPZ(item);
        var card = document.createElement('div'), id = item.id;
        card.className = 'pz-card'; card.id = 'item-' + id;
        card.innerHTML = '<div class="pz-row"><span class="pz-type">' + (type === 'pole' ? 'fp' : 'fz') + (index + 1) + '</span>' +
            '<select aria-label="' + (type === 'pole' ? '极点' : '零点') + (index + 1) + '输入模式"><option value="frequency">直接频率</option><option value="rc">RC 换算</option></select>' +
            '<button type="button" class="pz-del" title="删除此项" aria-label="删除此项">×</button></div>' +
            '<div class="pz-frequency"><label for="freq-' + id + '">频率（Hz）</label><input id="freq-' + id + '" data-field="text" type="text" placeholder="10kHz 或 1e4"></div>' +
            '<div class="pz-rc"><div><label for="r-' + id + '">等效 R（Ω）</label><input id="r-' + id + '" data-field="r" type="text" placeholder="10kΩ"></div>' +
            '<div><label for="c-' + id + '">电容 C（F）</label><input id="c-' + id + '" data-field="c" type="text" placeholder="10pF"></div></div>' +
            '<p class="pz-result"></p><p class="input-error" id="error-' + id + '" role="status"></p>';
        el.appendChild(card);
        var select = card.querySelector('select'); select.value = item.mode;
        card.querySelector('.pz-frequency').hidden = item.mode === 'rc';
        card.querySelector('.pz-rc').hidden = item.mode !== 'rc';
        card.querySelectorAll('input').forEach(function (input) {
            input.value = item[input.dataset.field]; input.spellcheck = false;
            input.setAttribute('aria-describedby', 'error-' + id);
            input.addEventListener('input', function () {
                item[input.dataset.field] = input.value; hidePresetInfo(); scheduleDraw();
            });
        });
        select.addEventListener('change', function () {
            if (item.mode === 'rc' && select.value === 'frequency') {
                readPZ(item); item.text = String(item.freq) + ' Hz';
            }
            item.mode = select.value; hidePresetInfo();
            renderPZList(containerId, list, type);
            byId('item-' + id).querySelector('select').focus(); drawBode();
        });
        card.querySelector('.pz-del').addEventListener('click', function () { removePZ(type, id); });
        readPZ(item);
    });
}

/* ========== 预设配置 ========== */
function loadPreset(name) {
    var presets = {
        singlePole: {
            dc: 20,
            poles: [10000],
            zeros: []
        },
        typeII: {
            dc: 40,
            poles: [0.001, 100000],  // 原点极点用 0.001 近似
            zeros: [1000]
        },
        typeIII: {
            dc: 60,
            poles: [0.001, 50000, 200000],
            zeros: [500, 2000]
        },
        notch: {
            dc: 0,
            poles: [5000, 5000],
            zeros: [5000]
        }
    };

    var cfg = presets[name];
    if (!cfg) return;
    poles = []; zeros = [];
    poleCount = 0; zeroCount = 0;

    // 预设 dc 字段统一以 dB 标注
    document.getElementById('dcUnit').value = 'dB';
    document.getElementById('dcGain').value = cfg.dc;
    updateGainConv();
    gainUnit = 'dB';
    cfg.poles.forEach(function(f){ poles.push({ id: 'p' + (++poleCount), freq: f }); });
    cfg.zeros.forEach(function(f){ zeros.push({ id: 'z' + (++zeroCount), freq: f }); });
    approximation = name === 'typeII' || name === 'typeIII' ? '原点极点以 0.001 Hz 一阶因子近似，增益归一化与理想积分器不同。' :
        name === 'notch' ? '保留原简化参数：双极点与同频零点相消后为单极点低通，并不是真正的陷波响应。' : '';
    byId('tfMsg').textContent = '';
    renderPZList('poleList', poles, 'pole'); renderPZList('zeroList', zeros, 'zero');
    updatePresetInfo(name); drawBode();
}

/* ========== 有效参数、滑块与绘图快照 ========== */
function calcH(f) { return lastPlot ? BodeCore.response(f, lastPlot.model) : { mag: NaN, phase: NaN }; }
function syncSliders(range) {
    sliderBounds = BodeCore.sliderDomain(range, sliderBounds);
    ['Start', 'End'].forEach(function (side) {
        var el = byId('freq' + side + 'Slider'), value = range['f' + side];
        el.min = sliderBounds.min; el.max = sliderBounds.max; el.value = Math.log10(value);
        el.setAttribute('aria-valuetext', BodeCore.format(value, 'Hz'));
    });
    byId('sliderDomain').textContent = '滑块量程：' + BodeCore.format(Math.pow(10, sliderBounds.min), 'Hz') + ' ～ ' + BodeCore.format(Math.pow(10, sliderBounds.max), 'Hz');
}
function redrawLastPlot() {
    if (!lastPlot) return;
    BodePlot.draw(byId('magCanvas'), lastPlot, false);
    BodePlot.draw(byId('phaseCanvas'), lastPlot, true);
    document.querySelectorAll('.bode-probe').forEach(function (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); });
    document.querySelectorAll('.bode-tip').forEach(function (tip) { tip.style.display = 'none'; });
}
function drawBode() {
    if (drawFrame) { cancelAnimationFrame(drawFrame); drawFrame = 0; }
    var range, gainDb, valid = true, pending = false, rangeError = '';
    ['freqStart', 'freqEnd'].forEach(function (id) {
        try { BodeCore.parseQuantity(byId(id).value, 'Hz'); setError(byId(id), ''); }
        catch (err) { rangeError += (id === 'freqStart' ? '起点：' : '终点：') + err.message + '；'; setError(byId(id), err.message); }
    });
    if (!rangeError) {
        try { range = BodeCore.frequencyRange(byId('freqStart').value, byId('freqEnd').value); }
        catch (err) { rangeError = err.message; setError(byId('freqStart'), rangeError); setError(byId('freqEnd'), rangeError); }
    }
    byId('rangeError').textContent = rangeError;
    if (rangeError) valid = false; else syncSliders(range);
    gainDb = updateGainConv();
    if (gainDb === null) valid = false;
    poles.concat(zeros).forEach(function (item) {
        var state = readPZ(item);
        if (state === 'invalid') valid = false;
        else if (state === 'pending') pending = true;
    });
    if (!valid || pending) {
        markUnapplied(valid ? 'RC 参数待输入，请补全 R、C' : '请修正标红输入'); return;
    }
    try {
        var model = BodeCore.prepare(gainDb, poles, zeros), result = BodeCore.sweep(model, range);
        var markers = poles.concat(zeros).map(function (item, i) {
            return Object.assign({ f: item.freq, kind: i < poles.length ? 'pole' : 'zero' }, BodeCore.response(item.freq, model));
        });
        lastPlot = { model: model, result: result, range: range, markers: markers, approximation: approximation };
        lastRange = range;
        redrawLastPlot(); renderMargins(result);
        byId('plotStatus').textContent = '已生效：' + BodeCore.format(range.fStart, 'Hz') + ' ～ ' + BodeCore.format(range.fEnd, 'Hz') + '；极点 × / 零点 ○；虚线为 0 dB 交越。';
        byId('plotStatus').classList.remove('is-stale');
        byId('modelNotice').hidden = !approximation;
        byId('modelNotice').textContent = approximation ? '基于近似模型：' + approximation + ' 图中裕度不代表原系统的实际稳定性。' : '';
    } catch (err) {
        byId('plotStatus').textContent = '参数未生效：' + err.message;
        byId('plotStatus').classList.add('is-stale');
    }
}
function renderMargins(result) {
    var c = result.primary;
    byId('marginDisplay').style.display = 'flex';
    byId('pmVal').textContent = c ? c.pm.toFixed(2) + '°' : '—';
    byId('gmVal').textContent = result.gm === null ? '未找到交越' : result.gm.toFixed(2) + ' dB';
    byId('fcVal').textContent = c ? BodeCore.format(c.f, 'Hz') : result.unity ? '无唯一交越' : '未找到下降交越';
    var message = result.unity ? '全频段为 0 dB，无唯一交越频率，PM 不定义。' :
        !result.crossings.length ? '当前频率范围内未找到 0 dB 交越，请检查频率范围。' :
        !c ? '当前范围只有上升交越或相切点，无下降交越；不指定 UGB 与主 PM。' :
        '主交越取最低频下降点，图上标记与以下列表使用同一份计算结果。';
    if (result.gm === null) message += ' 当前范围未找到 −180° 下降交越，不能据此判定稳定性。';
    byId('marginMessage').textContent = message;
    byId('crossingTableWrap').hidden = !result.crossings.length;
    byId('crossingRows').innerHTML = '';
    result.crossings.forEach(function (cross, index) {
        var row = document.createElement('tr');
        if (cross === c) row.className = 'is-primary';
        [(cross === c ? '★ ' : '') + '#' + (index + 1) + ' ' + ({ down: '下降', up: '上升', touch: '相切' })[cross.direction],
            BodeCore.format(cross.f, 'Hz'), cross.phase.toFixed(2) + '°', cross.pm.toFixed(2) + '°'].forEach(function (value) {
            var cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
        });
        byId('crossingRows').appendChild(row);
    });
}
['Start', 'End'].forEach(function (side) {
    byId('freq' + side).addEventListener('input', scheduleDraw);
    function slide() {
        var range;
        try { range = BodeCore.frequencyRange(byId('freqStart').value, byId('freqEnd').value); }
        catch (err) { range = lastRange; }
        range = BodeCore.slideRange(range, side.toLowerCase(), Number(byId('freq' + side + 'Slider').value));
        byId('freqStart').value = String(Number(range.fStart.toPrecision(12))) + ' Hz';
        byId('freqEnd').value = String(Number(range.fEnd.toPrecision(12))) + ' Hz';
        syncSliders(range); scheduleDraw();
    }
    byId('freq' + side + 'Slider').addEventListener('input', slide);
    byId('freq' + side + 'Slider').addEventListener('keydown', function (e) {
        // step=any 保持手输频率的精确位置，同时提供确定的键盘步长。
        var changes = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05, PageDown: -1, PageUp: 1 };
        if (!(e.key in changes) && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        this.value = e.key === 'Home' ? this.min : e.key === 'End' ? this.max : Number(this.value) + changes[e.key];
        slide();
    });
});
var redrawFrame = 0;
function scheduleRedraw() {
    if (!redrawFrame) redrawFrame = requestAnimationFrame(function () { redrawFrame = 0; redrawLastPlot(); });
}
window.addEventListener('resize', scheduleRedraw);
new MutationObserver(scheduleRedraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
if (document.fonts) document.fonts.ready.then(scheduleRedraw);

/* ========== Type-II / Type-III 预设拓扑公式卡 ========== */
/* 手绘 SVG helpers（与 filter-design 同风格） */
function _p(d) { return '<path d="' + d + '" class="tw"/>'; }
function _w(x1, y1, x2, y2) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="tw"/>'; }
function _d(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="3" class="td"/>'; }
function _t(x, y, s, anchor) { return '<text x="' + x + '" y="' + y + '" class="tl"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + s + '</text>'; }
function _gnd(x, y) {
    return _p('M' + x + ',' + y + ' L' + x + ',' + (y + 8) + ' M' + (x - 10) + ',' + (y + 8) + ' L' + (x + 10) + ',' + (y + 8) +
              ' M' + (x - 6) + ',' + (y + 13) + ' L' + (x + 6) + ',' + (y + 13) + ' M' + (x - 2.5) + ',' + (y + 18) + ' L' + (x + 2.5) + ',' + (y + 18));
}
function _svg(w, h, body) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" class="topo-svg">' + body + '</svg>';
}
/* 折线电阻（任意方向）：两端引线 lead=8，6 段锯齿、幅 7 */
function _res(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len, uy = dy / len, px = -uy, py = ux;
    var lead = 8, amp = 7, n = 6, seg = (len - 2 * lead) / n;
    var d = 'M' + x1 + ',' + y1 + ' L' + (x1 + ux * lead) + ',' + (y1 + uy * lead);
    for (var i = 1; i < n; i++) {
        var s = lead + i * seg, off = (i % 2 ? amp : -amp);
        d += ' L' + (x1 + ux * s + px * off).toFixed(1) + ',' + (y1 + uy * s + py * off).toFixed(1);
    }
    d += ' L' + (x2 - ux * lead) + ',' + (y2 - uy * lead) + ' L' + x2 + ',' + y2;
    return _p(d);
}
/* 电容：_capH 水平线竖板（线在 x±4 断开）；_capV 竖直线横板（线在 y±4 断开） */
function _capH(x, y) { return _w(x - 4, y - 9, x - 4, y + 9) + _w(x + 4, y - 9, x + 4, y + 9); }
function _capV(x, y) { return _w(x - 9, y - 4, x + 9, y - 4) + _w(x - 9, y + 4, x + 9, y + 4); }
/* 运放：输入脚 (x-25, y∓12)，输出 (x+28, y)；− 上 + 下 */
function _op(x, y) {
    return _p('M' + (x - 25) + ',' + (y - 28) + ' L' + (x - 25) + ',' + (y + 28) + ' L' + (x + 28) + ',' + y + ' Z') +
           _t(x - 20, y - 8, '−') + _t(x - 20, y + 20, '+');
}

/* Type-II：Vin→R1→反相端；反馈 C1 与 (R2 串 C2) 并联；同相端接地 */
var TYPE2_SVG = _svg(400, 190,
    _t(8, 92, 'Vin') + _w(36, 88, 58, 88) +
    _res(58, 88, 142, 88) + _t(100, 74, 'R1', 'middle') +
    _w(142, 88, 245, 88) + _d(185, 88) +
    _op(270, 100) +
    _w(245, 112, 245, 146) + _gnd(245, 146) +
    _w(298, 100, 346, 100) + _t(352, 96, 'Vout') + _d(320, 100) +
    _w(320, 100, 320, 30) +
    _w(320, 30, 254, 30) + _capH(250, 30) + _w(246, 30, 185, 30) +
    _d(320, 56) + _w(320, 56, 286, 56) +
    _res(286, 56, 222, 56) + _w(222, 56, 204, 56) + _capH(200, 56) + _w(196, 56, 185, 56) +
    _w(185, 30, 185, 88) + _d(185, 56) +
    _t(250, 16, 'C1', 'middle') + _t(254, 44, 'R2', 'middle') + _t(200, 74, 'C2', 'middle'));

/* Type-III：输入侧 R1 串联 (R3 ∥ C3) 到地，反馈网络同 Type-II */
var TYPE3_SVG = _svg(400, 210,
    _t(8, 92, 'Vin') + _w(36, 88, 54, 88) +
    _res(54, 88, 138, 88) + _t(96, 74, 'R1', 'middle') +
    _w(138, 88, 245, 88) + _d(185, 88) +
    _op(270, 100) +
    _w(245, 112, 245, 146) + _gnd(245, 146) +
    _w(298, 100, 350, 100) + _t(356, 96, 'Vout') + _d(322, 100) +
    _w(322, 100, 322, 30) +
    _w(322, 30, 254, 30) + _capH(250, 30) + _w(246, 30, 185, 30) +
    _d(322, 56) + _w(322, 56, 288, 56) +
    _res(288, 56, 224, 56) + _w(224, 56, 206, 56) + _capH(202, 56) + _w(198, 56, 185, 56) +
    _w(185, 30, 185, 104) + _d(185, 56) +
    _w(158, 104, 212, 104) +
    _w(158, 104, 158, 116) + _res(158, 116, 158, 152) + _w(158, 152, 158, 160) + _gnd(158, 160) +
    _w(212, 104, 212, 124) + _capV(212, 128) + _w(212, 132, 212, 160) + _gnd(212, 160) +
    _t(250, 16, 'C1', 'middle') + _t(256, 44, 'R2', 'middle') + _t(202, 74, 'C2', 'middle') +
    _t(150, 138, 'R3', 'end') + _t(224, 132, 'C3'));

var PRESET_INFO = {
    typeII:
        '<h3>Type-II 补偿器：运放 + R1 输入，C1 ∥ (R2 串 C2) 反馈</h3>' +
        '<div class="preset-info-body">' +
            '<div class="preset-info-fig">' + TYPE2_SVG + '</div>' +
            '<div class="preset-info-formulas">' +
                '<div class="formula-box">' +
                    'f<sub>p1</sub> = 0（原点极点，积分器）<br>' +
                    'f<sub>z1</sub> = 1 / (2π·R<sub>2</sub>C<sub>1</sub>)<br>' +
                    'f<sub>p2</sub> = 1 / (2π·R<sub>2</sub>·C<sub>1</sub>C<sub>2</sub>/(C<sub>1</sub>+C<sub>2</sub>)) ≈ 1 / (2π·R<sub>2</sub>C<sub>2</sub>)（C<sub>1</sub>≫C<sub>2</sub>）' +
                '</div>' +
                '<div class="info-box" style="margin:0;">' +
                    'G(s) = −(1+sR<sub>2</sub>C<sub>1</sub>) / [s·R<sub>1</sub>(C<sub>1</sub>+C<sub>2</sub>)(1+sR<sub>2</sub>·C<sub>1</sub>C<sub>2</sub>/(C<sub>1</sub>+C<sub>2</sub>))]，中频增益 ≈ R<sub>2</sub>/R<sub>1</sub>。<br>' +
                    '左侧预设：f<sub>p1</sub> 以 0.001 Hz 近似原点极点；f<sub>z1</sub>=1kHz、f<sub>p2</sub>=100kHz 可按上式由器件值换算。' +
                '</div>' +
            '</div>' +
        '</div>',
    typeIII:
        '<h3>Type-III 补偿器：输入 R1 串 (R3 ∥ C3)，反馈网络同 Type-II</h3>' +
        '<div class="preset-info-body">' +
            '<div class="preset-info-fig">' + TYPE3_SVG + '</div>' +
            '<div class="preset-info-formulas">' +
                '<div class="formula-box">' +
                    'f<sub>p1</sub> = 0（原点极点，积分器）<br>' +
                    'f<sub>z1</sub> = 1 / (2π·R<sub>2</sub>C<sub>1</sub>)<br>' +
                    'f<sub>z2</sub> = 1 / (2π·(R<sub>1</sub>+R<sub>3</sub>)C<sub>3</sub>)<br>' +
                    'f<sub>p2</sub> ≈ 1 / (2π·R<sub>2</sub>C<sub>2</sub>)（C<sub>1</sub>≫C<sub>2</sub>）<br>' +
                    'f<sub>p3</sub> = 1 / (2π·R<sub>3</sub>C<sub>3</sub>)' +
                '</div>' +
                '<div class="info-box" style="margin:0;">' +
                    'Type-III 在 Type-II 基础上由 R<sub>3</sub>C<sub>3</sub> 引入第二对零极点，常用于电压模式 Buck（LC 双极点输出级）补偿。<br>' +
                    '左侧预设：f<sub>z1</sub>=500Hz、f<sub>z2</sub>=2kHz 与 f<sub>p2</sub>=50kHz、f<sub>p3</sub>=200kHz 对应；f<sub>p1</sub> 以 0.001 Hz 近似原点极点。' +
                '</div>' +
            '</div>' +
        '</div>'
};

function updatePresetInfo(name) {
    var el = document.getElementById('presetInfo');
    if (typeof PRESET_INFO !== 'undefined' && PRESET_INFO[name]) {
        el.innerHTML = PRESET_INFO[name];
        el.style.display = '';
    } else {
        el.style.display = 'none';
    }
}
function hidePresetInfo() {
    document.getElementById('presetInfo').style.display = 'none';
}

/* ========== 传递函数表达式解析（s 多项式分式） ========== */
/* 支持 s、s^2/s²/s³、科学计数法、+ - * / 与括号、隐式乘法（如 2e4*s、2(s+1)）；
   不支持延迟项 e^(−sτ) 与超越函数（明确报错）。 */

function tokenizeTF(src) {
    var toks = [];
    var i = 0;
    while (i < src.length) {
        var ch = src[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (/[0-9.]/.test(ch)) {
            var m = src.slice(i).match(/^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/);
            if (!m) throw new Error('数字解析失败（位置 ' + (i + 1) + '）');
            toks.push({ t: 'num', v: parseFloat(m[0]) });
            i += m[0].length;
            continue;
        }
        if (ch === 's' || ch === 'S') { toks.push({ t: 's' }); i++; continue; }
        if (ch === 'e' || ch === 'E') {
            throw new Error('检测到字母 e：仅支持 s 的多项式分式，不支持延迟项 e^(−sτ) 或自然常数 e');
        }
        if ('+-*/^()'.indexOf(ch) >= 0) { toks.push({ t: ch }); i++; continue; }
        if (ch === '²') { toks.push({ t: '^' }); toks.push({ t: 'num', v: 2 }); i++; continue; }
        if (ch === '³') { toks.push({ t: '^' }); toks.push({ t: 'num', v: 3 }); i++; continue; }
        if (/[a-zA-Z]/.test(ch)) throw new Error('无法识别的符号「' + ch + '」：仅支持 s 的多项式分式，不支持延迟项/超越函数');
        throw new Error('无法识别的字符「' + ch + '」');
    }
    return toks;
}

/* 多项式运算（系数升幂数组） */
function pAdd(a, b) { var n = Math.max(a.length, b.length), r = []; for (var i = 0; i < n; i++) r.push((a[i] || 0) + (b[i] || 0)); return r; }
function pSub(a, b) { var n = Math.max(a.length, b.length), r = []; for (var i = 0; i < n; i++) r.push((a[i] || 0) - (b[i] || 0)); return r; }
function pMul(a, b) {
    var r = [], i, j;
    for (i = 0; i < a.length + b.length - 1; i++) r.push(0);
    for (i = 0; i < a.length; i++) for (j = 0; j < b.length; j++) r[i + j] += a[i] * b[j];
    return r;
}
function pScale(a, c) { return a.map(function (v) { return v * c; }); }
function pPow(a, n) { var r = [1]; for (var i = 0; i < n; i++) r = pMul(r, a); return r; }

/* 递归下降解析：expr → 升幂系数数组 */
function parsePolyStr(str) {
    var toks = tokenizeTF(str);
    var pos = 0;
    function peek() { return toks[pos]; }
    function parseFactor() {
        var tk = peek();
        if (!tk) throw new Error('表达式不完整');
        if (tk.t === '+') { pos++; return parseFactor(); }
        if (tk.t === '-') { pos++; return pScale(parseFactor(), -1); }
        var base;
        if (tk.t === 'num') { pos++; base = [tk.v]; }
        else if (tk.t === 's') { pos++; base = [0, 1]; }
        else if (tk.t === '(') {
            pos++;
            base = parseExpr();
            if (!peek() || peek().t !== ')') throw new Error('括号不匹配');
            pos++;
        } else throw new Error('此处应为数字、s 或括号');
        if (peek() && peek().t === '^') {
            pos++;
            var e = peek();
            if (!e || e.t !== 'num' || e.v !== Math.floor(e.v) || e.v < 0 || e.v > 8)
                throw new Error('幂指数仅支持 0~8 的非负整数');
            pos++;
            base = pPow(base, e.v);
        }
        return base;
    }
    function parseTerm() {
        var left = parseFactor();
        while (peek()) {
            var tk = peek();
            if (tk.t === '*') { pos++; left = pMul(left, parseFactor()); }
            else if (tk.t === '/') {
                pos++;
                var d = parseFactor();
                if (d.length > 1 || d[0] === 0) throw new Error('除法仅支持除以常数；分母请整体写在最外层 / 右侧');
                left = pScale(left, 1 / d[0]);
            }
            else if (tk.t === 'num' || tk.t === 's' || tk.t === '(') { left = pMul(left, parseFactor()); }  // 隐式乘法
            else break;
        }
        return left;
    }
    function parseExpr() {
        var left = parseTerm();
        while (peek() && (peek().t === '+' || peek().t === '-')) {
            var op = toks[pos++].t;
            left = op === '+' ? pAdd(left, parseTerm()) : pSub(left, parseTerm());
        }
        return left;
    }
    var r = parseExpr();
    if (pos < toks.length) throw new Error('表达式存在无法解析的剩余部分');
    /* 去除高次零系数（含浮点尘埃） */
    var cmax = 0;
    r.forEach(function (v) { cmax = Math.max(cmax, Math.abs(v)); });
    while (r.length > 1 && Math.abs(r[r.length - 1]) <= cmax * 1e-12) r.pop();
    return r;
}

/* 按最外层 / 拆分为 分子/分母 两个多项式 */
function parseTFExpr(src) {
    var depth = 0, slash = -1;
    for (var i = 0; i < src.length; i++) {
        var ch = src[i];
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth < 0) throw new Error('括号不匹配'); }
        else if (ch === '/' && depth === 0) {
            if (slash >= 0) throw new Error('仅支持一个最外层除号（分子 / 分母）');
            slash = i;
        }
    }
    if (depth !== 0) throw new Error('括号不匹配');
    var num = parsePolyStr(slash >= 0 ? src.slice(0, slash) : src);
    var den = slash >= 0 ? parsePolyStr(src.slice(slash + 1)) : [1];
    if (den.length === 1 && den[0] === 0) throw new Error('分母不能为 0');
    var nz = false;
    num.forEach(function (v) { if (v !== 0) nz = true; });
    if (!nz) throw new Error('分子不能为 0');
    return { num: num, den: den };
}

/* 剥去原点因子（s^k）：返回 {co: 剩余升幂系数, n: 原点根个数} */
function stripOrigin(co) {
    var n = 0;
    while (n < co.length - 1 && co[n] === 0) n++;
    return { co: co.slice(n), n: n };
}

/* 综合除法降阶：升幂多项式 ÷ (s − r) */
function deflateAsc(co, r) {
    var rev = co.slice().reverse();
    var q = [rev[0]];
    for (var i = 1; i < rev.length - 1; i++) q.push(rev[i] + r * q[i - 1]);
    return q.reverse();
}

/* 牛顿迭代求实根（多起点；失败返回 null） */
function newtonRealRoot(co) {
    function f(x) { var v = 0; for (var i = co.length - 1; i >= 0; i--) v = v * x + co[i]; return v; }
    function df(x) { var v = 0; for (var i = co.length - 1; i >= 1; i--) v = v * x + i * co[i]; return v; }
    var starts = [1, -1, 10, -10, 100, -100, 1e3, -1e3, 1e4, -1e4, 1e-2, -1e-2, 1e-4, -1e-4, 1e6, -1e6];
    for (var s = 0; s < starts.length; s++) {
        var x = starts[s];
        for (var it = 0; it < 200; it++) {
            var fv = f(x);
            if (fv === 0) return x;
            var dv = df(x);
            if (dv === 0) break;
            var nx = x - fv / dv;
            if (!isFinite(nx)) break;
            if (Math.abs(nx - x) <= 1e-12 * Math.max(1, Math.abs(nx))) {
                if (Math.abs(f(nx)) <= 1e-6 * Math.max(1, Math.abs(co[0]))) return nx;
                break;
            }
            x = nx;
        }
    }
    return null;
}

/* 多项式求根（升幂系数，常数项非零）：≤2 次解析，≥3 次牛顿 + 综合除法降阶 */
function polyRoots(co) {
    var roots = [];
    while (co.length > 3) {
        var r = newtonRealRoot(co);
        if (r === null) throw new Error('高次多项式未找到实根（可能全为复根）：请拆分为低次因式相乘的形式');
        roots.push({ re: r, im: 0 });
        co = deflateAsc(co, r);
    }
    if (co.length === 3) {
        var a = co[2], b = co[1], c = co[0];
        var disc = b * b - 4 * a * c;
        if (disc >= 0) {
            var sq = Math.sqrt(disc);
            var q = -0.5 * (b + (b >= 0 ? sq : -sq));   // 数值稳定形式
            roots.push({ re: q / a, im: 0 });
            roots.push({ re: c / q, im: 0 });
        } else {
            var re = -b / (2 * a), im = Math.sqrt(-disc) / (2 * a);
            roots.push({ re: re, im: im });
            roots.push({ re: re, im: -im });
        }
    } else if (co.length === 2) {
        roots.push({ re: -co[0] / co[1], im: 0 });
    }
    return roots;
}

/* 解析 TF 表达式并载入零极点列表 + 直流增益 */
function applyTF() {
    var src = document.getElementById('tfExpr').value.trim();
    var msg = document.getElementById('tfMsg');
    function fail(t) { msg.textContent = '✗ ' + t; msg.className = 'hint tf-err'; }
    if (!src) { fail('请输入传递函数表达式，例如 (s+1e4)/(s^2+2e4*s+1e8)'); return; }
    try {
        var tf = parseTFExpr(src);
        var sn = stripOrigin(tf.num);   // 原点零点（s 因子）
        var sd = stripOrigin(tf.den);   // 原点极点
        var gain = sn.co[0] / sd.co[0];
        if (!isFinite(gain) || gain === 0) throw new Error('直流增益无效');
        var zRoots = polyRoots(sn.co);
        var pRoots = polyRoots(sd.co);
        var hasComplex = false, hasRHP = false;
        function fOf(r) {
            if (r.im !== 0) hasComplex = true;
            if (r.re > 0) hasRHP = true;
            return BodeCore.parseQuantity(String(Math.hypot(r.re, r.im) / (2 * Math.PI)), 'Hz');
        }
        // 先构建候选列表并校验，失败时不破坏现有输入与有效图。
        var nextPoles = [], nextZeros = [];
        zRoots.forEach(function (r) { nextZeros.push({ id: 'z' + (nextZeros.length + 1), freq: fOf(r) }); });
        pRoots.forEach(function (r) { nextPoles.push({ id: 'p' + (nextPoles.length + 1), freq: fOf(r) }); });
        var k;
        for (k = 0; k < sn.n; k++) nextZeros.push({ id: 'z' + (nextZeros.length + 1), freq: 0.001 });
        for (k = 0; k < sd.n; k++) nextPoles.push({ id: 'p' + (nextPoles.length + 1), freq: 0.001 });
        BodeCore.prepare(20 * Math.log10(Math.abs(gain)), nextPoles, nextZeros);
        poles = nextPoles; zeros = nextZeros; poleCount = poles.length; zeroCount = zeros.length;
        var notes = [];
        if (sn.n + sd.n > 0) notes.push('原点根以 0.001 Hz 一阶因子替代，归一化与理想积分/微分因子不同');
        if (gain < 0) notes.push('负增益的额外 180° 相位未计入');
        if (hasComplex) notes.push('复根以同频一阶实因子替代');
        if (hasRHP) notes.push('右半平面根仅按模折算，相位与实际不同');
        approximation = notes.join('；');
        gainUnit = 'dB';
        document.getElementById('dcUnit').value = 'dB';
        document.getElementById('dcGain').value = String(20 * Math.log10(Math.abs(gain)));
        updateGainConv();
        renderPZList('poleList', poles, 'pole');
        renderPZList('zeroList', zeros, 'zero');
        hidePresetInfo();
        drawBode();

        var note = '✓ 已载入：直流增益 ' + fmtNum(20 * Math.log10(Math.abs(gain))) + ' dB，' +
            zeros.length + ' 个零点，' + poles.length + ' 个极点（按 |根|/2π 折算）。';
        if (sn.n + sd.n > 0) note += ' 原点零/极点以 0.001 Hz 近似。';
        if (gain < 0) note += ' 原增益为负：额外 180° 相位未计入。';
        if (hasComplex) note += ' 含共轭复根：已折算为同频一阶因子，谐振峰形仅为近似。';
        if (hasRHP) note += ' 含右半平面根：幅频按 |根| 折算，相频与实际不同。';
        msg.textContent = note;
        msg.className = 'hint';
    } catch (err) {
        fail(err.message);
    }
}

document.getElementById('tfApply').addEventListener('click', applyTF);
document.getElementById('tfExpr').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); applyTF(); }
});

/* ========== 鼠标取点（十字准线 + 读数框） ========== */
function setupProbe(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;
    var wrap = canvas.parentElement;   // .bode-plot-wrap
    var ov = document.createElement('canvas');
    ov.className = 'bode-probe';
    wrap.appendChild(ov);
    var tip = document.createElement('div');
    tip.className = 'bode-tip';
    tip.style.display = 'none';
    wrap.appendChild(tip);

    canvas.addEventListener('mousemove', function (e) {
        var w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        var dpr = window.devicePixelRatio || 1;
        ov.width = w * dpr;
        ov.height = h * dpr;
        var oc = ov.getContext('2d');
        oc.scale(dpr, dpr);
        oc.clearRect(0, 0, w, h);

        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        if (!lastPlot || !canvas._bodeGeometry) return;
        var PAD = canvas._bodeGeometry.pad;
        var cw = w - PAD.left - PAD.right, ch = h - PAD.top - PAD.bottom;
        if (x < PAD.left || x > PAD.left + cw || y < PAD.top || y > PAD.top + ch) {
            tip.style.display = 'none';
            return;
        }
        var lf = Math.log10(lastRange.fStart) +
            (x - PAD.left) / cw * (Math.log10(lastRange.fEnd) - Math.log10(lastRange.fStart));
        var f = Math.pow(10, lf);
        var hv = calcH(f);
        /* 十字准线 */
        oc.strokeStyle = BodePlot.palette().ink;
        oc.lineWidth = 1;
        oc.setLineDash([4, 4]);
        oc.beginPath();
        oc.moveTo(x, PAD.top); oc.lineTo(x, PAD.top + ch);
        oc.moveTo(PAD.left, y); oc.lineTo(PAD.left + cw, y);
        oc.stroke();
        oc.setLineDash([]);
        /* 读数框 */
        tip.textContent = 'f = ' + BodeCore.format(f, 'Hz') + ' ｜ |H| = ' + hv.mag.toFixed(2) +
            ' dB ｜ ∠H = ' + hv.phase.toFixed(2) + '°' + (lastPlot.approximation ? '（近似模型）' : '');
        tip.style.display = '';
        tip.style.width = Math.min(320, w) + 'px';
        tip.style.left = Math.max(0, Math.min(w - tip.offsetWidth, x + 14)) + 'px';
        tip.style.top = Math.max(0, Math.min(h - tip.offsetHeight, y + 12)) + 'px';
    });
    canvas.addEventListener('mouseleave', function () {
        var oc = ov.getContext('2d');
        oc.clearRect(0, 0, ov.width, ov.height);
        tip.style.display = 'none';
    });
}
setupProbe('magCanvas');
setupProbe('phaseCanvas');
loadPreset('singlePole');

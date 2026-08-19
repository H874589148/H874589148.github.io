/* tools/bode-plot/script.js - Bode 图绘制（纯 Canvas，无第三方依赖） */

/* ========== 数据结构 ========== */
var poles = [];   // [{freq: Hz}]
var zeros = [];   // [{freq: Hz}]
var poleCount = 0;
var zeroCount = 0;

/* ========== 初始化 ========== */
loadPreset('singlePole');

/* ========== 极点/零点管理 ========== */
function addPole(freq) {
    freq = freq || 10000;
    poleCount++;
    var id = 'p' + poleCount;
    poles.push({ id: id, freq: freq });
    renderPZList('poleList', poles, 'pole');
    drawBode();
}

function addZero(freq) {
    freq = freq || 1000;
    zeroCount++;
    var id = 'z' + zeroCount;
    zeros.push({ id: id, freq: freq });
    renderPZList('zeroList', zeros, 'zero');
    drawBode();
}

function removePZ(type, id) {
    if (type === 'pole') {
        poles = poles.filter(function(p){ return p.id !== id; });
        renderPZList('poleList', poles, 'pole');
    } else {
        zeros = zeros.filter(function(z){ return z.id !== id; });
        renderPZList('zeroList', zeros, 'zero');
    }
    drawBode();
}

function renderPZList(containerId, list, type) {
    var el = document.getElementById(containerId);
    el.innerHTML = '';
    list.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'pz-row';
        row.innerHTML =
            '<span class="pz-type">' + (type === 'pole' ? 'fp' : 'fz') + '</span>' +
            '<input type="number" value="' + item.freq + '" step="any" min="0" ' +
                'onchange="updatePZ(\'' + type + '\',\'' + item.id + '\',this.value)">' +
            '<span class="pz-unit">Hz</span>' +
            '<button class="pz-del" onclick="removePZ(\'' + type + '\',\'' + item.id + '\')" title="删除">×</button>';
        el.appendChild(row);
    });
}

function updatePZ(type, id, val) {
    var freq = parseFloat(val);
    if (isNaN(freq) || freq <= 0) return;
    var list = type === 'pole' ? poles : zeros;
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { list[i].freq = freq; break; }
    }
    drawBode();
}

/* ========== 预设配置 ========== */
function loadPreset(name) {
    poles = []; zeros = [];
    poleCount = 0; zeroCount = 0;

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

    document.getElementById('dcGain').value = cfg.dc;
    cfg.poles.forEach(function(f){ addPole(f); });
    cfg.zeros.forEach(function(f){ addZero(f); });
}

/* ========== Bode 计算 ========== */
function calcH(f) {
    var w = 2 * Math.PI * f;
    var KdB = parseFloat(document.getElementById('dcGain').value) || 0;
    var K = Math.pow(10, KdB / 20);

    // 传递函数 H(jω) = K * Π(1 + jω/wz) / Π(1 + jω/wp)
    // 对于原点极点近似为 0.001Hz -> 实际是积分器
    var magNum = K;
    var phaseNum = 0;  // degrees

    zeros.forEach(function(z) {
        var wz = 2 * Math.PI * z.freq;
        var re = 1;
        var im = w / wz;
        magNum *= Math.sqrt(re*re + im*im);
        phaseNum += Math.atan2(im, re) * 180 / Math.PI;
    });

    var magDen = 1;
    var phaseDen = 0;

    poles.forEach(function(p) {
        var wp = 2 * Math.PI * Math.max(p.freq, 1e-6);
        var re = 1;
        var im = w / wp;
        magDen *= Math.sqrt(re*re + im*im);
        phaseDen += Math.atan2(im, re) * 180 / Math.PI;
    });

    var mag = 20 * Math.log10(magNum / magDen);
    var phase = phaseNum - phaseDen;
    return { mag: mag, phase: phase };
}

/* ========== Canvas 绘制 ========== */
function drawBode() {
    var fStart = parseFloat(document.getElementById('freqStart').value) || 1;
    var fEnd   = parseFloat(document.getElementById('freqEnd').value)   || 1e8;
    if (fStart <= 0) fStart = 0.01;
    if (fEnd <= fStart) fEnd = fStart * 1000;

    var N = 500;  // 采样点数
    var freqs = [];
    for (var i = 0; i <= N; i++) {
        freqs.push(Math.pow(10, Math.log10(fStart) + i * (Math.log10(fEnd) - Math.log10(fStart)) / N));
    }

    var mags = [], phases = [];
    freqs.forEach(function(f) {
        var h = calcH(f);
        mags.push(h.mag);
        phases.push(h.phase);
    });

    drawCanvas('magCanvas', freqs, mags, {
        color: '#3a5a8c',
        yLabel: 'dB',
        yUnit: 'dB',
        gridLines: [-40,-20,0,20,40,60,80],
        zeroLine: 0
    });

    drawCanvas('phaseCanvas', freqs, phases, {
        color: '#c0583a',
        yLabel: '°',
        yUnit: '°',
        gridLines: [-180,-135,-90,-45,0,45,90],
        zeroLine: -180
    });

    // 计算裕度
    calcMargins(freqs, mags, phases);
}

function drawCanvas(canvasId, freqs, vals, opts) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.width;
    var h = canvas.clientHeight || canvas.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var PAD = { top: 16, right: 20, bottom: 36, left: 54 };
    var cw = w - PAD.left - PAD.right;
    var ch = h - PAD.top - PAD.bottom;

    // 背景
    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, w, h);

    // 确定 Y 轴范围
    var yMin = Math.min.apply(null, vals) - 10;
    var yMax = Math.max.apply(null, vals) + 10;
    // 对 phase 固定范围
    if (opts.yUnit === '°') { yMin = -200; yMax = 100; }

    var logFmin = Math.log10(freqs[0]);
    var logFmax = Math.log10(freqs[freqs.length - 1]);

    function xPos(f) { return PAD.left + (Math.log10(f) - logFmin) / (logFmax - logFmin) * cw; }
    function yPos(v) { return PAD.top + (1 - (v - yMin) / (yMax - yMin)) * ch; }

    // 网格 - 频率（对数刻度）
    ctx.strokeStyle = '#e8e2d8';
    ctx.lineWidth = 1;
    var dec = Math.floor(logFmin);
    while (dec <= logFmax) {
        for (var m = 1; m <= 9; m++) {
            var fGrid = m * Math.pow(10, dec);
            if (fGrid >= freqs[0] && fGrid <= freqs[freqs.length-1]) {
                var x = xPos(fGrid);
                ctx.beginPath();
                ctx.moveTo(x, PAD.top);
                ctx.lineTo(x, PAD.top + ch);
                ctx.strokeStyle = m === 1 ? '#d0c8b8' : '#e8e2d8';
                ctx.stroke();
            }
        }
        dec++;
    }

    // 网格 - Y 轴
    opts.gridLines.forEach(function(v) {
        var y = yPos(v);
        if (y < PAD.top || y > PAD.top + ch) return;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(PAD.left + cw, y);
        ctx.strokeStyle = v === 0 || v === -180 ? '#b8b0a0' : '#e8e2d8';
        ctx.lineWidth = v === 0 || v === -180 ? 1.5 : 1;
        ctx.stroke();

        // Y 轴标签
        ctx.fillStyle = '#8a8a8a';
        ctx.font = '11px Fira Code, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(v + opts.yUnit, PAD.left - 4, y + 4);
    });

    // X 轴标签
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '11px Fira Code, monospace';
    ctx.textAlign = 'center';
    dec = Math.floor(logFmin);
    while (dec <= logFmax) {
        var f = Math.pow(10, dec);
        if (f >= freqs[0] && f <= freqs[freqs.length-1]) {
            var x = xPos(f);
            ctx.fillText(fmtFreq(f), x, PAD.top + ch + 16);
        }
        dec++;
    }

    // 轴框
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD.left, PAD.top, cw, ch);

    // 绘制曲线（手绘效果：轻微抖动）
    ctx.beginPath();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (var i = 0; i < freqs.length; i++) {
        var px = xPos(freqs[i]);
        var py = yPos(vals[i]);
        // 限制在绘图区
        py = Math.max(PAD.top, Math.min(PAD.top + ch, py));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();
}

function fmtFreq(f) {
    if (f >= 1e6) return (f/1e6).toFixed(0) + 'M';
    if (f >= 1e3) return (f/1e3).toFixed(0) + 'k';
    return f.toFixed(0);
}

function calcMargins(freqs, mags, phases) {
    // 穿越频率（0dB 点）
    var fc = null;
    var pm = null;
    for (var i = 1; i < mags.length; i++) {
        if (mags[i-1] > 0 && mags[i] <= 0) {
            // 线性插值
            var t = (0 - mags[i-1]) / (mags[i] - mags[i-1]);
            fc = freqs[i-1] * Math.pow(freqs[i]/freqs[i-1], t);
            var phaseAtFc = phases[i-1] + t * (phases[i] - phases[i-1]);
            pm = phaseAtFc + 180;
            break;
        }
    }

    // 相位穿越频率（-180° 点）
    var fpc = null;
    var gm = null;
    for (var i = 1; i < phases.length; i++) {
        if (phases[i-1] > -180 && phases[i] <= -180) {
            var t = (-180 - phases[i-1]) / (phases[i] - phases[i-1]);
            fpc = freqs[i-1] * Math.pow(freqs[i]/freqs[i-1], t);
            var magAtFpc = mags[i-1] + t * (mags[i] - mags[i-1]);
            gm = -magAtFpc;
            break;
        }
    }

    var disp = document.getElementById('marginDisplay');
    disp.style.display = 'flex';

    document.getElementById('pmVal').textContent = pm !== null ? pm.toFixed(1) + '°' : '> 180°（稳定）';
    document.getElementById('gmVal').textContent = gm !== null ? gm.toFixed(1) + ' dB' : '∞（稳定）';
    document.getElementById('fcVal').textContent = fc !== null ? fmtFreq(fc) + 'Hz' : 'N/A';
}

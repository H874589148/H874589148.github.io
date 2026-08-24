/* tools/least-squares/script.js
   最小二乘直线拟合：y = a·x + b ｜ 附 R²、散点+拟合线绘图、坐标范围手动/自动
   （依赖 common.js 的 formatEngineering） */

var le = {};
['lsqX', 'lsqY', 'lsqHint', 'xMin', 'xMax', 'yMin', 'yMax', 'lsqAuto',
 'lsqA', 'lsqB', 'lsqR2', 'lsqN', 'lsqCanvas']
    .forEach(function (id) { le[id] = document.getElementById(id); });

var autoRange = true;   // 范围框被手动修改 → 转手动；「自动范围」按钮恢复

/* 解析数据文本：逗号 / 分号 / 顿号 / 空格 / 换行分隔，无法解析的 token 计数跳过 */
function parseSeries(txt) {
    var toks = txt.split(/[\s,;，、]+/).filter(function (t) { return t !== ''; });
    var vals = [], bad = 0;
    toks.forEach(function (t) {
        var v = parseFloat(t);
        if (isFinite(v)) vals.push(v); else bad++;
    });
    return { vals: vals, bad: bad };
}

function showHint(txt, isErr) {
    le.lsqHint.textContent = txt;
    le.lsqHint.style.color = isErr ? '#c0583a' : '';
}

function clearResults(msg) {
    showHint(msg, true);
    le.lsqA.textContent = '-';
    le.lsqB.textContent = '-';
    le.lsqR2.textContent = '-';
    le.lsqN.textContent = '-';
    var canvas = le.lsqCanvas;
    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

/* 数据 min~max 外扩 10%（跨度为 0 时兜底 ±1） */
function autoLim(v) {
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
    var d = (mx - mn) * 0.1;
    if (!(d > 0)) d = Math.max(Math.abs(mx) * 0.1, 1);
    return [mn - d, mx + d];
}

function trimNum(v) { return parseFloat(v.toPrecision(6)); }

function update() {
    var px = parseSeries(le.lsqX.value), py = parseSeries(le.lsqY.value);
    var xs = px.vals, ys = py.vals;
    var warn = (px.bad + py.bad) > 0 ? '已忽略 ' + (px.bad + py.bad) + ' 个无法解析的项；' : '';

    if (xs.length !== ys.length) {
        return clearResults(warn + 'x 与 y 个数不一致（x：' + xs.length + ' 个，y：' + ys.length + ' 个）');
    }
    var n = xs.length;
    if (n < 2) return clearResults(warn + '至少需要 2 组数据点');

    var mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var sxx = 0, sxy = 0;
    for (i = 0; i < n; i++) {
        sxx += (xs[i] - mx) * (xs[i] - mx);
        sxy += (xs[i] - mx) * (ys[i] - my);
    }
    if (sxx < 1e-300) return clearResults(warn + 'x 数据全部相同，无法拟合直线');

    var a = sxy / sxx, b = my - a * mx;
    var ssres = 0, sstot = 0;
    for (i = 0; i < n; i++) {
        var res = ys[i] - (a * xs[i] + b);
        ssres += res * res;
        sstot += (ys[i] - my) * (ys[i] - my);
    }
    var r2 = sstot > 1e-300 ? 1 - ssres / sstot : 1;

    le.lsqA.textContent = formatEngineering(a);
    le.lsqB.textContent = formatEngineering(b);
    le.lsqR2.textContent = r2.toFixed(4);
    le.lsqN.textContent = n;
    showHint(warn, false);

    /* 坐标范围：自动模式按数据外扩 10% 回填；手动模式尊重用户输入 */
    if (autoRange) {
        var xr = autoLim(xs), yr = autoLim(ys);
        le.xMin.value = trimNum(xr[0]); le.xMax.value = trimNum(xr[1]);
        le.yMin.value = trimNum(yr[0]); le.yMax.value = trimNum(yr[1]);
    }
    var x0 = parseFloat(le.xMin.value), x1 = parseFloat(le.xMax.value);
    var y0 = parseFloat(le.yMin.value), y1 = parseFloat(le.yMax.value);
    if (!(x1 > x0) || !(y1 > y0)) {
        autoRange = true;
        showHint(warn + '坐标范围非法（需 max > min），已恢复自动范围', true);
        update();
        return;
    }
    drawFit(xs, ys, a, b, r2, x0, x1, y0, y1);
}

/* ---- 绘图：网格 + 轴框 + 散点（空心圆）+ 拟合直线 + 表达式标注 ---- */
function drawFit(xs, ys, a, b, r2, x0, x1, y0, y1) {
    var canvas = le.lsqCanvas;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.width;
    var h = canvas.clientHeight || canvas.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var PAD = { top: 16, right: 20, bottom: 40, left: 64 };
    var cw = w - PAD.left - PAD.right;
    var ch = h - PAD.top - PAD.bottom;
    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, w, h);

    function xPos(x) { return PAD.left + (x - x0) / (x1 - x0) * cw; }
    function yPos(y) { return PAD.top + (1 - (y - y0) / (y1 - y0)) * ch; }

    /* 网格与刻度（5 等分） */
    ctx.font = '11px Fira Code, monospace';
    var i, v, p;
    for (i = 0; i <= 5; i++) {
        v = x0 + (x1 - x0) * i / 5;
        p = xPos(v);
        ctx.beginPath();
        ctx.moveTo(p, PAD.top); ctx.lineTo(p, PAD.top + ch);
        ctx.strokeStyle = '#e8e2d8'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#8a8a8a'; ctx.textAlign = 'center';
        ctx.fillText(formatEngineering(v), p, PAD.top + ch + 16);
        v = y0 + (y1 - y0) * i / 5;
        p = yPos(v);
        ctx.beginPath();
        ctx.moveTo(PAD.left, p); ctx.lineTo(PAD.left + cw, p);
        ctx.strokeStyle = '#e8e2d8'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#8a8a8a'; ctx.textAlign = 'right';
        ctx.fillText(formatEngineering(v), PAD.left - 6, p + 4);
    }

    /* 零线（若在原点范围内） */
    ctx.strokeStyle = '#b8b0a0';
    ctx.lineWidth = 1.2;
    if (y0 < 0 && y1 > 0) {
        ctx.beginPath(); ctx.moveTo(PAD.left, yPos(0)); ctx.lineTo(PAD.left + cw, yPos(0)); ctx.stroke();
    }
    if (x0 < 0 && x1 > 0) {
        ctx.beginPath(); ctx.moveTo(xPos(0), PAD.top); ctx.lineTo(xPos(0), PAD.top + ch); ctx.stroke();
    }

    /* 轴框 */
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD.left, PAD.top, cw, ch);

    /* 裁剪到绘图区：拟合线贯穿当前 x 范围，散点越界不画出框 */
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, cw, ch);
    ctx.clip();

    ctx.beginPath();
    ctx.strokeStyle = '#3a5a8c';
    ctx.lineWidth = 2.5;
    ctx.moveTo(xPos(x0), yPos(a * x0 + b));
    ctx.lineTo(xPos(x1), yPos(a * x1 + b));
    ctx.stroke();

    ctx.strokeStyle = '#c0583a';
    ctx.lineWidth = 2;
    for (i = 0; i < xs.length; i++) {
        ctx.beginPath();
        ctx.arc(xPos(xs[i]), yPos(ys[i]), 4, 0, 2 * Math.PI);
        ctx.stroke();
    }
    ctx.restore();

    /* 图内左上标注：表达式（系数工程记号，b 负值自动变号）与 R² */
    function sgnNum(val, lead) {
        var s = formatEngineering(Math.abs(val));
        if (val < 0) return lead ? '−' + s : '− ' + s;
        return lead ? s : '+ ' + s;
    }
    ctx.font = '14px Patrick Hand, cursive';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3a5a8c';
    ctx.fillText('y = ' + sgnNum(a, true) + '·x ' + sgnNum(b, false), PAD.left + 12, PAD.top + 22);
    ctx.fillStyle = '#c0583a';
    ctx.fillText('R² = ' + r2.toFixed(4), PAD.left + 12, PAD.top + 40);
}

/* ---- 事件绑定与初始化 ---- */
['lsqX', 'lsqY'].forEach(function (id) {
    le[id].addEventListener('input', update);
});
['xMin', 'xMax', 'yMin', 'yMax'].forEach(function (id) {
    le[id].addEventListener('input', function () { autoRange = false; update(); });
});
le.lsqAuto.addEventListener('click', function () { autoRange = true; update(); });

update();

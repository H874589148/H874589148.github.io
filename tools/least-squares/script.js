/* 最小二乘拟合：线性 / 二次 / 幂律 / 对数 ｜ 附 R²、残差图（±2σ 异常点标红）、
   x 输入框支持逐行两列 CSV 粘贴、散点+拟合曲线绘图、坐标范围手动/自动
   （依赖 common.js 的 formatEngineering） */

var le = {};
['lsqX', 'lsqY', 'lsqHint', 'lsqType', 'xMin', 'xMax', 'yMin', 'yMax', 'lsqAuto',
 'lsqResBody', 'lsqCanvas', 'lsqResCanvas', 'lsqOutHint', 'lsqChartLabel',
 'lsqTitle', 'lsqXLabel', 'lsqYLabel', 'lsqShowCoord']
    .forEach(function (id) { le[id] = document.getElementById(id); });

var autoRange = true;   // 范围框被手动修改 → 转手动；「自动范围」按钮恢复
var labelPos = [];      // 每个数据点的坐标标签像素偏移 {dx,dy}（相对散点锚点）
var labelRects = [];    // 本次绘制的标签屏幕矩形（拖拽命中检测）
var labelAnchors = [];  // 本次绘制的散点屏幕坐标

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

/* 逐行两列 CSV 检测：≥2 个非空行、每行恰好 2 个数值 token → 判定为成对数据 */
function parsePairs(txt) {
    var lines = txt.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) return null;
    var xs = [], ys = [];
    for (var i = 0; i < lines.length; i++) {
        var toks = lines[i].trim().split(/[,;\t，、\s]+/).filter(function (t) { return t !== ''; });
        if (toks.length !== 2) return null;
        var a = parseFloat(toks[0]), b = parseFloat(toks[1]);
        if (!isFinite(a) || !isFinite(b)) return null;
        xs.push(a); ys.push(b);
    }
    return { xs: xs, ys: ys };
}

function showHint(txt, isErr) {
    le.lsqHint.textContent = txt;
    le.lsqHint.style.color = isErr ? '#c0583a' : '';
}

function clearCanvas(canvas) {
    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

function clearResults(msg) {
    showHint(msg, true);
    le.lsqResBody.innerHTML = '';
    le.lsqOutHint.textContent = '';
    le.lsqChartLabel.textContent = '散点与拟合曲线';
    labelRects = [];
    labelAnchors = [];
    clearCanvas(le.lsqCanvas);
    clearCanvas(le.lsqResCanvas);
}

/* 数据 min~max 外扩 10%（跨度为 0 时兜底 ±1） */
function autoLim(v) {
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
    var d = (mx - mn) * 0.1;
    if (!(d > 0)) d = Math.max(Math.abs(mx) * 0.1, 1);
    return [mn - d, mx + d];
}

function trimNum(v) { return parseFloat(v.toPrecision(6)); }

/* 带符号工程记号：lead=true 为首项（负号紧贴），否则为后续项（± 分隔） */
function fmtSigned(v, lead) {
    var s = formatEngineering(Math.abs(v));
    if (v < 0) return lead ? '−' + s : '− ' + s;
    return lead ? s : '+ ' + s;
}

/* 普通最小二乘直线 v = a·u + b */
function linearFit(us, vs) {
    var n = us.length, mu = 0, mv = 0, i;
    for (i = 0; i < n; i++) { mu += us[i]; mv += vs[i]; }
    mu /= n; mv /= n;
    var sxx = 0, sxy = 0;
    for (i = 0; i < n; i++) {
        sxx += (us[i] - mu) * (us[i] - mu);
        sxy += (us[i] - mu) * (vs[i] - mv);
    }
    if (sxx < 1e-300) throw new Error('x 数据全部相同（或变换后相同），无法拟合');
    var a = sxy / sxx;
    return { a: a, b: mv - a * mu };
}

/* 3×3 部分主元高斯消元，奇异返回 null（二次拟合正规方程用） */
function gauss3(A, b) {
    var M = [A[0].slice(), A[1].slice(), A[2].slice()];
    var x = b.slice();
    var col, row, k;
    for (col = 0; col < 3; col++) {
        var piv = col;
        for (row = col + 1; row < 3; row++) {
            if (Math.abs(M[row][col]) > Math.abs(M[piv][col])) piv = row;
        }
        if (Math.abs(M[piv][col]) < 1e-300) return null;
        if (piv !== col) {
            var t = M[piv]; M[piv] = M[col]; M[col] = t;
            var t2 = x[piv]; x[piv] = x[col]; x[col] = t2;
        }
        for (row = col + 1; row < 3; row++) {
            var f = M[row][col] / M[col][col];
            for (k = col; k < 3; k++) M[row][k] -= f * M[col][k];
            x[row] -= f * x[col];
        }
    }
    var sol = [0, 0, 0];
    for (col = 2; col >= 0; col--) {
        var s = x[col];
        for (k = col + 1; k < 3; k++) s -= M[col][k] * sol[k];
        sol[col] = s / M[col][col];
    }
    return sol;
}

/* 按类型构造拟合：返回 { fn, np, paramRows, formula, label }；不满足前提时抛错 */
function computeFit(type, xs, ys) {
    var n = xs.length, i;
    if (type === 'quad') {
        if (n < 3) throw new Error('二次拟合至少需要 3 组数据点');
        var s = [0, 0, 0, 0, 0], sy = 0, sxy = 0, sx2y = 0;
        for (i = 0; i < n; i++) {
            var x = xs[i], y = ys[i];
            var p2 = x * x, p3 = p2 * x, p4 = p2 * p2;
            s[0] += 1; s[1] += x; s[2] += p2; s[3] += p3; s[4] += p4;
            sy += y; sxy += x * y; sx2y += p2 * y;
        }
        var sol = gauss3(
            [[s[4], s[3], s[2]],
             [s[3], s[2], s[1]],
             [s[2], s[1], s[0]]],
            [sx2y, sxy, sy]);
        if (!sol) throw new Error('正规方程奇异，无法二次拟合（x 数据可能全部相同）');
        var qa = sol[0], qb = sol[1], qc = sol[2];
        return {
            fn: function (v) { return qa * v * v + qb * v + qc; },
            np: 3,
            paramRows: [['二次项 a', qa], ['一次项 b', qb], ['常数项 c', qc]],
            formula: 'y = ' + fmtSigned(qa, true) + '·x² ' + fmtSigned(qb, false) + '·x ' + fmtSigned(qc, false),
            label: '散点与拟合曲线（y = a·x² + b·x + c）'
        };
    }
    if (type === 'power') {
        for (i = 0; i < n; i++) {
            if (!(xs[i] > 0) || !(ys[i] > 0)) {
                throw new Error('幂律拟合 y = a·xᵇ 要求所有 x > 0 且 y > 0');
            }
        }
        var us = xs.map(Math.log), vs = ys.map(Math.log);
        var lp = linearFit(us, vs);         // ln y = b·ln x + ln a
        var pA = Math.exp(lp.b), pB = lp.a;
        return {
            fn: function (v) { return pA * Math.pow(v, pB); },
            np: 2,
            paramRows: [['系数 a', pA], ['指数 b', pB]],
            formula: 'y = ' + formatEngineering(pA) + '·x^' + formatEngineering(pB),
            label: '散点与拟合曲线（y = a·xᵇ）'
        };
    }
    if (type === 'log') {
        for (i = 0; i < n; i++) {
            if (!(xs[i] > 0)) throw new Error('对数拟合 y = a·ln(x) + b 要求所有 x > 0');
        }
        var ul = xs.map(Math.log);
        var ll = linearFit(ul, ys);
        var la = ll.a, lb = ll.b;
        return {
            fn: function (v) { return la * Math.log(v) + lb; },
            np: 2,
            paramRows: [['系数 a', la], ['截距 b', lb]],
            formula: 'y = ' + fmtSigned(la, true) + '·ln(x) ' + fmtSigned(lb, false),
            label: '散点与拟合曲线（y = a·ln(x) + b）'
        };
    }
    var lf = linearFit(xs, ys);
    var la2 = lf.a, lb2 = lf.b;
    return {
        fn: function (v) { return la2 * v + lb2; },
        np: 2,
        paramRows: [['斜率 a', la2], ['截距 b', lb2]],
        formula: 'y = ' + fmtSigned(la2, true) + '·x ' + fmtSigned(lb2, false),
        label: '散点与拟合直线（y = a·x + b）'
    };
}

function update() {
    var pairs = parsePairs(le.lsqX.value);
    var xs, ys, warn = '';
    if (pairs) {
        xs = pairs.xs; ys = pairs.ys;
        warn = '检测到逐行「x, y」两列数据（CSV），已按行解析并忽略 y 输入框；';
    } else {
        var px = parseSeries(le.lsqX.value), py = parseSeries(le.lsqY.value);
        xs = px.vals; ys = py.vals;
        if (px.bad + py.bad > 0) warn = '已忽略 ' + (px.bad + py.bad) + ' 个无法解析的项；';
        if (xs.length !== ys.length) {
            return clearResults(warn + 'x 与 y 个数不一致（x：' + xs.length + ' 个，y：' + ys.length + ' 个）');
        }
    }
    var n = xs.length;
    if (n < 2) return clearResults(warn + '至少需要 2 组数据点');
    /* 标签偏移按点序号保留：数据增多补默认、减少截断 */
    if (labelPos.length > n) labelPos.length = n;
    while (labelPos.length < n) labelPos.push({ dx: 8, dy: -10 });

    var fit;
    try {
        fit = computeFit(le.lsqType.value, xs, ys);
    } catch (err) {
        return clearResults(warn + err.message);
    }

    var my = 0, i;
    for (i = 0; i < n; i++) my += ys[i];
    my /= n;
    var res = [], ssres = 0, sstot = 0;
    for (i = 0; i < n; i++) {
        res.push(ys[i] - fit.fn(xs[i]));
        ssres += res[i] * res[i];
        sstot += (ys[i] - my) * (ys[i] - my);
    }
    var r2 = sstot > 1e-300 ? 1 - ssres / sstot : 1;
    /* σ：残差标准差（自由度 n − 参数个数）；|残差| > 2σ 判异常点 */
    var sigma = Math.sqrt(ssres / Math.max(1, n - fit.np));
    var outliers = [], outIdx = [];
    for (i = 0; i < n; i++) {
        var isOut = sigma > 0 && Math.abs(res[i]) > 2 * sigma;
        outliers.push(isOut);
        if (isOut) outIdx.push(i + 1);
    }

    /* 结果表：参数行随拟合类型变化 + R² + σ + n */
    var html = '';
    fit.paramRows.forEach(function (row) {
        html += '<tr><td>' + row[0] + '</td><td>' + formatEngineering(row[1]) + '</td></tr>';
    });
    html += '<tr><td>R²（决定系数）</td><td>' + r2.toFixed(4) + '</td></tr>';
    html += '<tr><td>残差标准差 σ</td><td>' + formatEngineering(sigma) + '</td></tr>';
    html += '<tr><td>数据点数 n</td><td>' + n + '</td></tr>';
    le.lsqResBody.innerHTML = html;
    le.lsqChartLabel.textContent = fit.label;
    le.lsqOutHint.textContent = outIdx.length
        ? '异常点（|残差| > 2σ，σ = ' + formatEngineering(sigma) + '）：第 ' + outIdx.join('、') + ' 点'
        : '无异常点（所有 |残差| ≤ 2σ，σ = ' + formatEngineering(sigma) + '）';
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
    drawFit(xs, ys, fit, r2, x0, x1, y0, y1, outliers);
    drawResiduals(xs, res, sigma, outliers, x0, x1);
}

/* ---- 绘图：网格 + 轴框 + 散点（异常点实心标红）+ 拟合曲线 + 表达式标注 ---- */
function drawFit(xs, ys, fit, r2, x0, x1, y0, y1, outliers) {
    var canvas = le.lsqCanvas;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.width;
    var h = canvas.clientHeight || canvas.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var title = le.lsqTitle.value.trim();
    var xLabel = le.lsqXLabel.value.trim();
    var yLabel = le.lsqYLabel.value.trim();
    /* PAD 随标注有无自适应：图标题占顶部、y 轴标题占左侧 */
    var PAD = { top: title ? 40 : 16, right: 20, bottom: 40, left: yLabel ? 88 : 64 };
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

    /* 裁剪到绘图区：散点越界不画出框 */
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, cw, ch);
    ctx.clip();

    /* 拟合曲线：200 点采样折线；非有限值或远超 y 范围时断线（幂律/对数可能发散） */
    var yLim = Math.max(Math.abs(y0), Math.abs(y1)) * 10 + 1;
    ctx.beginPath();
    ctx.strokeStyle = '#3a5a8c';
    ctx.lineWidth = 2.5;
    var pen = false;
    for (i = 0; i <= 200; i++) {
        var fx = x0 + (x1 - x0) * i / 200;
        var fy = fit.fn(fx);
        if (!isFinite(fy) || Math.abs(fy) > yLim) { pen = false; continue; }
        if (pen) ctx.lineTo(xPos(fx), yPos(fy));
        else ctx.moveTo(xPos(fx), yPos(fy));
        pen = true;
    }
    ctx.stroke();

    /* 散点：异常点（|残差| > 2σ）实心红大点，正常点空心圆 */
    for (i = 0; i < xs.length; i++) {
        ctx.beginPath();
        if (outliers[i]) {
            ctx.fillStyle = '#c0583a';
            ctx.arc(xPos(xs[i]), yPos(ys[i]), 5, 0, 2 * Math.PI);
            ctx.fill();
        } else {
            ctx.strokeStyle = '#c0583a';
            ctx.lineWidth = 2;
            ctx.arc(xPos(xs[i]), yPos(ys[i]), 4, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }
    ctx.restore();

    /* 图表标题与轴标题（用户可填，含单位；y 轴标题竖排） */
    if (title) {
        ctx.font = 'bold 17px Patrick Hand, cursive';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#2c2c2c';
        ctx.fillText(title, PAD.left + cw / 2, 25);
    }
    if (xLabel) {
        ctx.font = '13px Patrick Hand, cursive';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#5a5a5a';
        ctx.fillText(xLabel, PAD.left + cw / 2, PAD.top + ch + 34);
    }
    if (yLabel) {
        ctx.save();
        ctx.translate(16, PAD.top + ch / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = '13px Patrick Hand, cursive';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#5a5a5a';
        ctx.fillText(yLabel, 0, 0);
        ctx.restore();
    }

    /* 散点屏幕锚点 + 可拖动的坐标标签（clip 之外，允许标签出绘图框） */
    labelAnchors = [];
    labelRects = [];
    for (i = 0; i < xs.length; i++) labelAnchors.push({ x: xPos(xs[i]), y: yPos(ys[i]) });
    if (le.lsqShowCoord.checked) {
        ctx.font = '11px Fira Code, monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#5a5a5a';
        for (i = 0; i < xs.length; i++) {
            var lp = labelPos[i];
            var txt = '(' + formatEngineering(xs[i]) + ', ' + formatEngineering(ys[i]) + ')';
            var px = labelAnchors[i].x + lp.dx, py = labelAnchors[i].y + lp.dy;
            ctx.fillText(txt, px, py);
            var tw = ctx.measureText(txt).width;
            labelRects.push({ x: px - 3, y: py - 11, w: tw + 6, h: 14 });
        }
    }

    /* 图内左上标注：拟合表达式（随类型切换）与 R² */
    ctx.font = '14px Patrick Hand, cursive';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3a5a8c';
    ctx.fillText(fit.formula, PAD.left + 12, PAD.top + 22);
    ctx.fillStyle = '#c0583a';
    ctx.fillText('R² = ' + r2.toFixed(4), PAD.left + 12, PAD.top + 40);
}

/* ---- 残差图：杆图 + 零线 + ±2σ 红色虚线；x 轴与主图对齐（PAD.left 一致） ---- */
function drawResiduals(xs, res, sigma, outliers, x0, x1) {
    var canvas = le.lsqResCanvas;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.width;
    var h = canvas.clientHeight || canvas.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var PAD = { top: 10, right: 20, bottom: 24, left: le.lsqYLabel.value.trim() ? 88 : 64 };
    var cw = w - PAD.left - PAD.right;
    var ch = h - PAD.top - PAD.bottom;
    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, w, h);

    var maxAbs = 2 * sigma, i;
    for (i = 0; i < res.length; i++) maxAbs = Math.max(maxAbs, Math.abs(res[i]));
    maxAbs *= 1.15;
    if (!(maxAbs > 0)) maxAbs = 1;

    function xPos(x) { return PAD.left + (x - x0) / (x1 - x0) * cw; }
    function yPos(r) { return PAD.top + (1 - (r + maxAbs) / (2 * maxAbs)) * ch; }

    /* y 刻度：±maxAbs 与 0 */
    ctx.font = '10px Fira Code, monospace';
    ctx.fillStyle = '#8a8a8a';
    ctx.textAlign = 'right';
    [-maxAbs, 0, maxAbs].forEach(function (v) {
        ctx.fillText(formatEngineering(v), PAD.left - 6, yPos(v) + 3);
    });

    /* 零线 */
    ctx.strokeStyle = '#b8b0a0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, yPos(0)); ctx.lineTo(PAD.left + cw, yPos(0));
    ctx.stroke();

    /* ±2σ 参考虚线（σ > 0 时） */
    if (sigma > 0) {
        ctx.strokeStyle = '#c0583a';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        [2 * sigma, -2 * sigma].forEach(function (v) {
            ctx.beginPath();
            ctx.moveTo(PAD.left, yPos(v)); ctx.lineTo(PAD.left + cw, yPos(v));
            ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.font = '10px Fira Code, monospace';
        ctx.fillStyle = '#c0583a';
        ctx.textAlign = 'right';
        ctx.fillText('+2σ', PAD.left + cw - 4, yPos(2 * sigma) - 3);
        ctx.fillText('−2σ', PAD.left + cw - 4, yPos(-2 * sigma) + 11);
    }

    /* 轴框 */
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(PAD.left, PAD.top, cw, ch);

    /* 残差杆（裁剪到绘图区）：异常点红色、正常点蓝色 */
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, cw, ch);
    ctx.clip();
    for (i = 0; i < res.length; i++) {
        var px = xPos(xs[i]);
        var col = outliers[i] ? '#c0583a' : '#3a5a8c';
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, yPos(0));
        ctx.lineTo(px, yPos(res[i]));
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(px, yPos(res[i]), 3, 0, 2 * Math.PI);
        ctx.fill();
    }
    ctx.restore();
}

/* ---- 事件绑定与初始化 ---- */
['lsqX', 'lsqY'].forEach(function (id) {
    le[id].addEventListener('input', update);
});
le.lsqType.addEventListener('change', update);
['xMin', 'xMax', 'yMin', 'yMax'].forEach(function (id) {
    le[id].addEventListener('input', function () { autoRange = false; update(); });
});
['lsqTitle', 'lsqXLabel', 'lsqYLabel'].forEach(function (id) {
    le[id].addEventListener('input', update);
});
le.lsqShowCoord.addEventListener('change', update);
le.lsqAuto.addEventListener('click', function () { autoRange = true; update(); });

/* ---- 坐标标签拖拽：命中标签矩形后跟随鼠标（纯像素偏移） ---- */
var dragLabel = -1;
function hitLabel(mx, my) {
    for (var i = labelRects.length - 1; i >= 0; i--) {
        var r = labelRects[i];
        if (mx >= r.x - 6 && mx <= r.x + r.w + 6 && my >= r.y - 6 && my <= r.y + r.h + 6) return i;
    }
    return -1;
}
le.lsqCanvas.addEventListener('mousedown', function (e) {
    if (!le.lsqShowCoord.checked) return;
    var rect = le.lsqCanvas.getBoundingClientRect();
    var idx = hitLabel(e.clientX - rect.left, e.clientY - rect.top);
    if (idx >= 0) { dragLabel = idx; e.preventDefault(); }
});
window.addEventListener('mousemove', function (e) {
    if (dragLabel < 0) return;
    var rect = le.lsqCanvas.getBoundingClientRect();
    labelPos[dragLabel] = {
        dx: e.clientX - rect.left - labelAnchors[dragLabel].x,
        dy: e.clientY - rect.top - labelAnchors[dragLabel].y
    };
    update();
});
window.addEventListener('mouseup', function () { dragLabel = -1; });
le.lsqCanvas.addEventListener('mousemove', function (e) {
    if (dragLabel >= 0) { le.lsqCanvas.style.cursor = 'move'; return; }
    if (!le.lsqShowCoord.checked) { le.lsqCanvas.style.cursor = ''; return; }
    var rect = le.lsqCanvas.getBoundingClientRect();
    le.lsqCanvas.style.cursor =
        hitLabel(e.clientX - rect.left, e.clientY - rect.top) >= 0 ? 'move' : '';
});

update();

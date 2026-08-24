/* tools/layout-match/script.js
   版图失配快速计算：M×N 网格 + 方向/径向浓度梯度 → 组间失配 / 质心 / INL-DNL */

var GROUP_COLORS = ['#3a5a8c', '#c0583a', '#4a7c59', '#8c6bb1', '#b8860b', '#2e7d8c', '#a04a6e', '#5a5a5a'];

/* ---- 状态 ---- */
var state = {
    grid: [],                 // grid[r][c] = 组号（0 = dummy/空）
    dims: null,               // {rows, cols} 上次渲染尺寸
    center: { x: 0, y: 0 },   // 径向中心（格心坐标，单位：格）
    pickingCenter: false
};

/* ---- 元素索引 ---- */
var el = {};
['rows', 'cols', 'groups', 'gradDir', 'gradPol', 'gradOrder', 'gradSlope', 'slopeUnit',
 'centerField', 'centerBtn', 'centerInfo',
 'gridTable', 'centerDot', 'gridInfo',
 'statBody', 'centroidInfo', 'mmTable', 'mmHint', 'ratioBox',
 'inlOrder', 'inlSummary', 'inlBody'
].forEach(function (id) { el[id] = document.getElementById(id); });

/* ---- 参数读取 ---- */
function clampInt(v, min, max, def) {
    var n = parseInt(v, 10);
    if (isNaN(n)) n = def;
    return Math.max(min, Math.min(max, n));
}

function getParams() {
    var s = parseFloat(el.gradSlope.value);
    if (!isFinite(s) || s < 0) s = 0;
    return {
        rows: clampInt(el.rows.value, 1, 16, 4),
        cols: clampInt(el.cols.value, 1, 16, 4),
        K:    clampInt(el.groups.value, 1, 8, 2),
        dir:  el.gradDir.value,
        sign: el.gradPol.value === 'l2h' ? 1 : -1,   // 低→高 沿指向递增；高→低 递减
        order: el.gradOrder.value === '2' ? 2 : 1,   // 梯度阶数：1 线性 / 2 抛物
        s:    s / 100                                 // %/格ⁿ → 比例/格ⁿ
    };
}

/* 网格固定 16×16 分配，显示窗口为 rows×cols —— 尺寸变化不丢已填数据；
   尺寸变化时仅重置径向中心为几何中心 */
function initGrid() {
    for (var r = 0; r < 16; r++) {
        var row = [];
        for (var c = 0; c < 16; c++) row.push(0);
        state.grid.push(row);
    }
}

function ensureDims(p) {
    if (!state.dims || state.dims.rows !== p.rows || state.dims.cols !== p.cols) {
        state.center = { x: p.cols / 2, y: p.rows / 2 };
        state.dims = { rows: p.rows, cols: p.cols };
    }
}

/* ---- 梯度模型 ---- */
function cellDist(r, c, p) {
    switch (p.dir) {
        case 'lr': return c;
        case 'rl': return p.cols - 1 - c;
        case 'tb': return r;
        case 'bt': return p.rows - 1 - r;
        case 'tl2br': return r + c;                      // 左上 d=0 → 右下 d 最大
        case 'bl2tr': return (p.rows - 1 - r) + c;      // 左下 d=0 → 右上 d 最大
        case 'radial':
            var dx = (c + 0.5) - state.center.x;
            var dy = (r + 0.5) - state.center.y;
            return Math.sqrt(dx * dx + dy * dy);
    }
    return 0;
}

function maxDist(p) {
    if (p.dir !== 'radial') {
        if (p.dir === 'lr' || p.dir === 'rl') return p.cols - 1;
        if (p.dir === 'tb' || p.dir === 'bt') return p.rows - 1;
        return (p.cols - 1) + (p.rows - 1);   // 斜向：横纵各跨一遍
    }
    var m = 0, cx = state.center.x, cy = state.center.y;
    [[0, 0], [p.cols, 0], [0, p.rows], [p.cols, p.rows]].forEach(function (pt) {
        m = Math.max(m, Math.sqrt((pt[0] - cx) * (pt[0] - cx) + (pt[1] - cy) * (pt[1] - cy)));
    });
    return m;
}

function cellValue(r, c, p) { return 1 + p.sign * p.s * Math.pow(cellDist(r, c, p), p.order); }

function heatColor(v, maxDev) {
    var dev = v - 1;
    if (maxDev < 1e-12 || Math.abs(dev) < 1e-12) return 'transparent';
    var a = 0.10 + 0.30 * Math.abs(dev) / maxDev;
    return dev > 0 ? 'rgba(192,88,58,' + a.toFixed(3) + ')' : 'rgba(58,90,140,' + a.toFixed(3) + ')';
}

/* ---- 组统计 ---- */
function groupStats(p) {
    var map = {};
    for (var r = 0; r < p.rows; r++) {
        for (var c = 0; c < p.cols; c++) {
            var g = state.grid[r][c];
            if (g <= 0) continue;
            if (!map[g]) map[g] = { id: g, n: 0, sumV: 0, sumX: 0, sumY: 0 };
            map[g].n++;
            map[g].sumV += cellValue(r, c, p);
            map[g].sumX += c + 0.5;
            map[g].sumY += r + 0.5;
        }
    }
    return Object.keys(map).map(Number).sort(function (a, b) { return a - b; }).map(function (id) {
        var s = map[id];
        return { id: id, n: s.n, mean: s.sumV / s.n, cx: s.sumX / s.n, cy: s.sumY / s.n };
    });
}

/* ---- 渲染：网格 ---- */
function renderGrid(p, maxDev) {
    var html = '';
    for (var r = 0; r < p.rows; r++) {
        html += '<tr>';
        for (var c = 0; c < p.cols; c++) {
            var g = state.grid[r][c];
            var v = cellValue(r, c, p);
            var style = 'background:' + heatColor(v, maxDev) + ';';
            if (g > 0) style += 'color:' + GROUP_COLORS[(g - 1) % GROUP_COLORS.length] + ';';
            html += '<td data-r="' + r + '" data-c="' + c + '"' + (g === 0 ? ' class="dummy"' : '') +
                    ' style="' + style + '" title="(' + (c + 1) + ',' + (r + 1) + ')  v = ' + v.toFixed(4) + '">' +
                    (g > 0 ? g : '') + '</td>';
        }
        html += '</tr>';
    }
    el.gridTable.innerHTML = html;
    if (p.dir === 'radial') {
        el.centerDot.style.display = 'block';
        el.centerDot.style.left = (state.center.x / p.cols * 100) + '%';
        el.centerDot.style.top = (state.center.y / p.rows * 100) + '%';
    } else {
        el.centerDot.style.display = 'none';
    }
}

/* ---- 渲染：结果 ---- */
function renderStats(p, stats) {
    var html = '';
    if (stats.length === 0) {
        html = '<tr><td colspan="6">请点击网格填入组号（0 = dummy 不参与统计）</td></tr>';
    } else {
        var ref = stats[0];
        stats.forEach(function (st) {
            var dRel = st.id === ref.id ? '—（参考）' : ((st.mean - ref.mean) / ref.mean * 100).toFixed(4) + ' %';
            html += '<tr><td class="grp" style="color:' + GROUP_COLORS[(st.id - 1) % GROUP_COLORS.length] + '">' + st.id + '</td>' +
                    '<td>' + st.n + '</td><td>' + st.mean.toFixed(5) + '</td><td>' + dRel + '</td>' +
                    '<td>' + st.cx.toFixed(2) + '</td><td>' + st.cy.toFixed(2) + '</td></tr>';
        });
    }
    el.statBody.innerHTML = html;

    if (stats.length >= 2) {
        var best = { d: -1, a: 0, b: 0 };
        for (var i = 0; i < stats.length; i++) {
            for (var j = i + 1; j < stats.length; j++) {
                var d = Math.sqrt(Math.pow(stats[i].cx - stats[j].cx, 2) + Math.pow(stats[i].cy - stats[j].cy, 2));
                if (d > best.d) best = { d: d, a: i, b: j };
            }
        }
        el.centroidInfo.textContent = '最大质心距 = ' + best.d.toFixed(2) + ' 格（组 ' + stats[best.a].id + ' ↔ 组 ' + stats[best.b].id +
            '）；一阶梯度下质心重合则失配为零。';
    } else {
        el.centroidInfo.textContent = '';
    }
}

function renderMismatch(p, stats) {
    if (stats.length < 2) {
        el.mmTable.innerHTML = '';
        el.mmHint.textContent = '至少需要 2 个非空组才能计算组间失配。';
        el.ratioBox.style.display = 'none';
        return;
    }
    el.mmHint.textContent = '';
    var html = '<thead><tr><th>Δ%</th>';
    stats.forEach(function (st) { html += '<th>组 ' + st.id + '</th>'; });
    html += '</tr></thead><tbody>';
    stats.forEach(function (si) {
        html += '<tr><th>组 ' + si.id + '</th>';
        stats.forEach(function (sj) {
            html += si.id === sj.id ? '<td>—</td>' :
                    '<td>' + ((si.mean - sj.mean) / sj.mean * 100).toFixed(4) + '</td>';
        });
        html += '</tr>';
    });
    el.mmTable.innerHTML = html + '</tbody>';

    /* 镜像比例误差（恰好 2 组且均值均为正时） */
    if (stats.length === 2 && stats[0].mean > 0 && stats[1].mean > 0) {
        var a = stats[0], b = stats[1];
        var ideal = b.n / a.n;
        var actual = b.n * b.mean / (a.n * a.mean);
        var err = (actual / ideal - 1) * 100;
        el.ratioBox.textContent = '镜像比例（组 ' + a.id + ' : 组 ' + b.id + '）：理想 1 : ' + ideal.toFixed(3) +
            '，实际 1 : ' + actual.toFixed(4) + '，比例误差 ' + (err >= 0 ? '+' : '') + err.toFixed(4) + ' %';
        el.ratioBox.style.display = '';
    } else {
        el.ratioBox.style.display = 'none';
    }
}

function renderInl(p, stats) {
    if (stats.length < 2) {
        el.inlBody.innerHTML = '';
        el.inlSummary.textContent = '至少需要 2 个非空组才能累加传输曲线。';
        return;
    }
    var order = stats.slice();
    if (el.inlOrder.value === 'desc') order.reverse();   // stats 已升序，reverse → 降序

    var steps = order.map(function (st) { return st.n * st.mean; });
    var total = steps.reduce(function (a, b) { return a + b; }, 0);
    var lsb = total / steps.length;

    var html = '', inl = 0, maxInl = 0, maxDnl = 0;
    order.forEach(function (st, k) {
        var dnl = steps[k] / lsb - 1;
        inl += dnl;
        maxDnl = Math.max(maxDnl, Math.abs(dnl));
        maxInl = Math.max(maxInl, Math.abs(inl));
        html += '<tr><td>' + (k + 1) + '</td>' +
                '<td class="grp" style="color:' + GROUP_COLORS[(st.id - 1) % GROUP_COLORS.length] + '">' + st.id + '</td>' +
                '<td>' + steps[k].toFixed(5) + '</td>' +
                '<td>' + (dnl >= 0 ? '+' : '') + dnl.toFixed(4) + '</td>' +
                '<td>' + (inl >= 0 ? '+' : '') + inl.toFixed(4) + '</td></tr>';
    });
    el.inlBody.innerHTML = html;
    el.inlSummary.textContent = '平均 LSB = ' + lsb.toFixed(5) + '；max|INL| = ' + maxInl.toFixed(4) +
        ' LSB，max|DNL| = ' + maxDnl.toFixed(4) + ' LSB（INL 末端归零：以平均 LSB 归一）。';
}

/* ---- 主更新 ---- */
function update() {
    var p = getParams();
    ensureDims(p);

    /* 中心点控件仅径向模式可用 */
    var isRadial = p.dir === 'radial';
    el.centerField.style.display = isRadial ? '' : 'none';
    if (!isRadial) {
        state.pickingCenter = false;
        el.centerBtn.textContent = '点选中心点';
    }
    el.centerInfo.textContent = isRadial ?
        '当前中心：(' + state.center.x.toFixed(1) + ', ' + state.center.y.toFixed(1) + ') 格' : '';

    /* 网格 + 热力 */
    var maxDev = 0;
    for (var r = 0; r < p.rows; r++) {
        for (var c = 0; c < p.cols; c++) {
            maxDev = Math.max(maxDev, Math.abs(cellValue(r, c, p) - 1));
        }
    }
    renderGrid(p, maxDev);

    /* 网格信息行 */
    var md = maxDist(p);
    var totalGrad = p.s * Math.pow(md, p.order) * 100;
    el.slopeUnit.textContent = p.order === 2 ? '%/格²' : '%/格';
    el.gridInfo.textContent = '阵列 ' + p.rows + '×' + p.cols + ' ｜ 全阵列总梯度 ≈ ' +
        totalGrad.toFixed(2) + ' %（max d = ' + md.toFixed(2) + ' 格，斜率 ' + (p.s * 100) +
        (p.order === 2 ? ' %/格²' : ' %/格') + '）';

    /* 统计与结果 */
    var stats = groupStats(p);
    renderStats(p, stats);
    renderMismatch(p, stats);
    renderInl(p, stats);
}

/* ---- 快捷填充 ---- */
function fillWith(fn) {
    var p = getParams();
    for (var r = 0; r < p.rows; r++) {
        for (var c = 0; c < p.cols; c++) {
            state.grid[r][c] = fn(r, c, p);
        }
    }
    update();
}

document.getElementById('fillSame').addEventListener('click', function () { fillWith(function () { return 1; }); });
document.getElementById('fillInter').addEventListener('click', function () { fillWith(function (r, c) { return (c % 2) + 1; }); });
document.getElementById('fillCC').addEventListener('click', function () {
    fillWith(function (r, c, p) {
        return (Math.min(c, p.cols - 1 - c) + Math.min(r, p.rows - 1 - r)) % 2 + 1;
    });
});
document.getElementById('fillRand').addEventListener('click', function () {
    fillWith(function (r, c, p) { return 1 + Math.floor(Math.random() * p.K); });
});
document.getElementById('fillClear').addEventListener('click', function () { fillWith(function () { return 0; }); });

/* ---- 网格点击：循环改组号 / 点选中心 ---- */
el.gridTable.addEventListener('click', function (e) {
    var td = e.target;
    if (td.tagName !== 'TD') return;
    var r = +td.getAttribute('data-r'), c = +td.getAttribute('data-c');
    if (state.pickingCenter) {
        state.center = { x: c + 0.5, y: r + 0.5 };
        state.pickingCenter = false;
        el.centerBtn.textContent = '点选中心点';
    } else {
        var p = getParams();
        state.grid[r][c] = (state.grid[r][c] + 1) % (p.K + 1);
    }
    update();
});

el.centerBtn.addEventListener('click', function () {
    state.pickingCenter = !state.pickingCenter;
    el.centerBtn.textContent = state.pickingCenter ? '点击网格中一格…' : '点选中心点';
});

/* ---- 控件监听 ---- */
['rows', 'cols', 'groups', 'gradDir', 'gradPol', 'gradOrder', 'gradSlope', 'inlOrder'].forEach(function (id) {
    el[id].addEventListener('input', update);
    el[id].addEventListener('change', update);
});

/* ---- 初始化 ---- */
initGrid();
update();

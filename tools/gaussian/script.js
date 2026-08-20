/* tools/gaussian/script.js
   正态分布置信区间：PDF 曲线 + 区间阴影 + 概率计算（erf 数值近似） */

/* ===== erf 数值近似（Abramowitz & Stegun 7.1.26，精度 ~1.5e-7） ===== */
function erf(x) {
    var sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return sign * y;
}
function Phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
function pdf(x, mu, sigma) {
    var d = (x - mu) / sigma;
    return Math.exp(-0.5 * d * d) / (sigma * Math.sqrt(2 * Math.PI));
}

/* ===== 输入监听 ===== */
['mu','sigma','za','zb'].forEach(function(id){
    document.getElementById(id).addEventListener('input', update);
});

function setSigmaRange(n) {
    document.getElementById('za').value = -n;
    document.getElementById('zb').value = n;
    update();
}
function setTail(which) {
    if (which === 'lower') document.getElementById('za').value = -4;
    else document.getElementById('zb').value = 4;
    update();
}

function update() {
    var mu = parseFloat(document.getElementById('mu').value);
    var sigma = parseFloat(document.getElementById('sigma').value);
    var za = parseFloat(document.getElementById('za').value);
    var zb = parseFloat(document.getElementById('zb').value);

    if (isNaN(mu) || isNaN(sigma) || sigma <= 0) {
        ['rP','rTail','rPhiA','rPhiB'].forEach(function(id){ setText(id, 'N/A'); });
        return;
    }
    // 保证 za <= zb
    if (za > zb) { var t = za; za = zb; zb = t; }

    var a = mu + za * sigma;
    var b = mu + zb * sigma;

    setText('aVal', fmt(a));
    setText('bVal', fmt(b));
    setText('zaVal', za.toFixed(2));
    setText('zbVal', zb.toFixed(2));

    var phiA = Phi(za), phiB = Phi(zb);
    var P = phiB - phiA;

    setText('rP', (P * 100).toPrecision(5) + ' %');
    setText('rTail', ((1 - P) * 100).toPrecision(5) + ' %');
    setText('rPhiA', phiA.toPrecision(5));
    setText('rPhiB', phiB.toPrecision(5));

    drawPdf(mu, sigma, a, b);
    buildStdTable();
}

/* ===== Canvas 绘制 ===== */
function drawPdf(mu, sigma, a, b) {
    var canvas = document.getElementById('pdfCanvas');
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.width;
    var h = canvas.clientHeight || canvas.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var PAD = { top: 16, right: 20, bottom: 34, left: 40 };
    var cw = w - PAD.left - PAD.right;
    var ch = h - PAD.top - PAD.bottom;

    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, w, h);

    var xMin = mu - 4 * sigma, xMax = mu + 4 * sigma;
    var yMax = pdf(mu, mu, sigma) * 1.1;

    function xPos(x) { return PAD.left + (x - xMin) / (xMax - xMin) * cw; }
    function yPos(y) { return PAD.top + (1 - y / yMax) * ch; }

    // 网格（σ 刻度）
    ctx.strokeStyle = '#e8e2d8';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '11px Fira Code, monospace';
    ctx.textAlign = 'center';
    for (var k = -4; k <= 4; k++) {
        var xv = mu + k * sigma;
        var x = xPos(xv);
        ctx.beginPath();
        ctx.moveTo(x, PAD.top);
        ctx.lineTo(x, PAD.top + ch);
        ctx.strokeStyle = k === 0 ? '#d0c8b8' : '#ece6dc';
        ctx.stroke();
        ctx.fillText((k >= 0 ? '+' : '') + k + 'σ', x, PAD.top + ch + 15);
    }

    // 区间阴影
    ctx.fillStyle = 'rgba(58,90,140,0.22)';
    ctx.beginPath();
    var started = false;
    for (var xi = a; xi <= b + 1e-9; xi += (xMax - xMin) / 400) {
        var xc = Math.max(xMin, Math.min(xMax, xi));
        var px = xPos(xc), py = yPos(pdf(xc, mu, sigma));
        if (!started) { ctx.moveTo(px, yPos(0)); ctx.lineTo(px, py); started = true; }
        else ctx.lineTo(px, py);
    }
    if (started) {
        ctx.lineTo(xPos(Math.min(xMax, b)), yPos(0));
        ctx.closePath();
        ctx.fill();
    }

    // 边界线 a / b
    [a, b].forEach(function(v, idx) {
        if (v < xMin || v > xMax) return;
        var x = xPos(v);
        ctx.beginPath();
        ctx.moveTo(x, PAD.top);
        ctx.lineTo(x, PAD.top + ch);
        ctx.strokeStyle = '#c0583a';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#c0583a';
        ctx.fillText(idx === 0 ? 'a' : 'b', x, PAD.top - 4);
    });

    // PDF 曲线
    ctx.beginPath();
    ctx.strokeStyle = '#3a5a8c';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    var N = 400;
    for (var i = 0; i <= N; i++) {
        var x2 = xMin + (xMax - xMin) * i / N;
        var px2 = xPos(x2), py2 = yPos(pdf(x2, mu, sigma));
        if (i === 0) ctx.moveTo(px2, py2);
        else ctx.lineTo(px2, py2);
    }
    ctx.stroke();

    // 轴框
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD.left, PAD.top, cw, ch);
}

/* ===== 常用对称区间表 ===== */
function buildStdTable() {
    var body = document.getElementById('stdBody');
    if (body.dataset.built) return;   // 静态表，只构建一次
    body.dataset.built = '1';
    [1, 1.645, 1.96, 2, 2.576, 3].forEach(function(k){
        var P = Phi(k) - Phi(-k);
        var tr = document.createElement('tr');
        var label = (k === 1.645 || k === 1.96 || k === 2.576) ? '±' + k + 'σ' : '±' + k + 'σ';
        tr.innerHTML = '<td>' + label + '</td><td>' + (P * 100).toPrecision(5) + ' %</td><td>' +
            ((1 - P) * 100).toPrecision(4) + ' %</td><td>' + ((1 - Phi(k)) * 100).toPrecision(4) + ' %</td>';
        body.appendChild(tr);
    });
}

/* ===== 工具 ===== */
function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
}
function fmt(x) {
    var r = Math.round(x * 1000) / 1000;
    return (Math.abs(r) >= 1e4 || (r !== 0 && Math.abs(r) < 1e-3)) ? r.toExponential(2) : String(r);
}

/* ===== 初始化 ===== */
update();

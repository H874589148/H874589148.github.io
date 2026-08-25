/* tools/random-gen/script.js
   随机数生成（范围/数量/可选不重复 → 卡片+统计）与摇骰子（约 3s 减速定格） */

var el = {};
['rMin', 'rMax', 'rNum', 'rNoDup', 'rGenBtn', 'rHint', 'rCards', 'rStats',
 'diceBox', 'diceBtn', 'diceRes', 'diceCount']
    .forEach(function (id) { el[id] = document.getElementById(id); });

/* ---- tab 切换 ---- */
(function initTabs() {
    var nav = document.getElementById('rgTabs');
    nav.addEventListener('click', function (e) {
        var btn = e.target.closest('.tab-btn');
        if (!btn) return;
        var key = btn.getAttribute('data-tab');
        nav.querySelectorAll('.tab-btn').forEach(function (b) {
            b.classList.toggle('active', b === btn);
        });
        document.querySelectorAll('.tab-panel').forEach(function (p) {
            p.classList.toggle('active', p.getAttribute('data-panel') === key);
        });
    });
})();

/* ================= Tab1：随机数生成 ================= */
function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

function generate() {
    var min = Math.ceil(parseFloat(el.rMin.value));
    var max = Math.floor(parseFloat(el.rMax.value));
    var n = Math.floor(parseFloat(el.rNum.value));
    var noDup = el.rNoDup.checked;

    if (!(min <= max)) {
        el.rHint.textContent = '请检查：下限需 ≤ 上限（整数区间）';
        el.rHint.style.color = '#c0583a';
        el.rCards.innerHTML = ''; el.rStats.textContent = '';
        return;
    }
    if (!(n >= 1)) {
        el.rHint.textContent = '请检查：数量需 ≥ 1';
        el.rHint.style.color = '#c0583a';
        el.rCards.innerHTML = ''; el.rStats.textContent = '';
        return;
    }
    if (n > 200) {
        el.rHint.textContent = '数量上限为 200，已按 200 生成';
        el.rHint.style.color = '#c0583a';
        n = 200;
    } else {
        el.rHint.textContent = '';
        el.rHint.style.color = '';
    }

    var vals = [];
    if (noDup) {
        var span = max - min + 1;
        if (n > span) {
            el.rHint.textContent = '不重复抽取时数量不能超过范围大小（' + span + ' 个）';
            el.rHint.style.color = '#c0583a';
            el.rCards.innerHTML = ''; el.rStats.textContent = '';
            return;
        }
        var pool = [];
        for (var v = min; v <= max; v++) pool.push(v);
        /* Fisher-Yates 洗牌后取前 n 个 */
        for (var i = pool.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
        vals = pool.slice(0, n);
    } else {
        for (var k = 0; k < n; k++) vals.push(randInt(min, max));
    }

    /* 卡片渲染 */
    var html = '';
    vals.forEach(function (v) { html += '<div class="rng-card">' + v + '</div>'; });
    el.rCards.innerHTML = html;

    /* 统计 */
    var sum = 0, mn = Infinity, mx = -Infinity;
    vals.forEach(function (v) {
        sum += v;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
    });
    el.rStats.textContent = '个数 ' + n + ' ｜ 最小 ' + mn + ' ｜ 最大 ' + mx +
        ' ｜ 均值 ' + (sum / n).toFixed(2) + ' ｜ 总和 ' + sum;
}

el.rGenBtn.addEventListener('click', generate);
['rMin', 'rMax', 'rNum'].forEach(function (id) {
    el[id].addEventListener('keydown', function (e) { if (e.key === 'Enter') generate(); });
});

/* ================= Tab2：摇骰子 =================
   九宫格点位（viewBox 120×120，格点 x/y ∈ {32, 60, 88}） */
var DICE_DOTS = {
    1: [[60, 60]],
    2: [[32, 32], [88, 88]],
    3: [[32, 32], [60, 60], [88, 88]],
    4: [[32, 32], [88, 32], [32, 88], [88, 88]],
    5: [[32, 32], [88, 32], [60, 60], [32, 88], [88, 88]],
    6: [[32, 32], [32, 60], [32, 88], [88, 32], [88, 60], [88, 88]]
};

/* 单颗骰子 SVG（viewBox 120×120） */
function diceSvg(face) {
    var dots = '';
    DICE_DOTS[face].forEach(function (p) {
        dots += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="9.5"/>';
    });
    return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="dice-svg">' +
        '<rect x="8" y="8" width="104" height="104" rx="18" class="dice-body"/>' + dots + '</svg>';
}

/* 渲染一排骰子；数量多时单颗自适应缩小 */
function renderAll(faces) {
    var sz = Math.min(180, Math.floor(560 / faces.length));
    var html = '';
    faces.forEach(function (f) {
        html += '<div class="dice-slot" style="width:' + sz + 'px;height:' + sz + 'px;">' + diceSvg(f) + '</div>';
    });
    el.diceBox.innerHTML = html;
}

function diceCount() { return parseInt(el.diceCount.value, 10) || 1; }

var rolling = false;
function rollDice() {
    if (rolling) return;
    rolling = true;
    el.diceBtn.disabled = true;
    el.diceCount.disabled = true;
    el.diceBox.classList.add('shaking');
    el.diceRes.textContent = '滚动中…';

    var n = diceCount();
    var dur = 2500 + Math.random() * 1000;   // 总时长 2.5~3.5 s 随机
    var t0 = performance.now();
    var delay = 90;                          // 初始翻面间隔，末段指数增大（减速）
    (function tick() {
        var faces = [];
        for (var i = 0; i < n; i++) faces.push(randInt(1, 6));
        renderAll(faces);
        if (performance.now() - t0 >= dur) {
            var sum = 0;
            faces.forEach(function (f) { sum += f; });
            el.diceRes.textContent = '点数：' + faces.join('　') + (n > 1 ? ' ｜ 总和 ' + sum : '');
            el.diceBox.classList.remove('shaking');
            el.diceBtn.disabled = false;
            el.diceCount.disabled = false;
            rolling = false;
            return;
        }
        delay *= 1.08;
        setTimeout(tick, delay);
    })();
}

el.diceBtn.addEventListener('click', rollDice);
el.diceBox.addEventListener('click', rollDice);
el.diceCount.addEventListener('change', function () {
    if (rolling) return;
    var faces = [];
    for (var i = 0; i < diceCount(); i++) faces.push(randInt(1, 6));
    renderAll(faces);
    el.diceRes.textContent = '点击骰子或按钮开始';
});

/* ---- 初始化 ---- */
generate();
renderAll([5]);

/* 24点求解器：精确分数 + 两两合并递归（状态剪枝）+ 交换/结合律规范化去重。
   纯函数部分与 UI 解耦，可通过 module.exports 在 Node 中独立测试。 */
(function (root) {
'use strict';

/* ==================== 精确分数 ==================== */
function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a || 1;
}
function frac(n, d) {
    if (d === 0) return null;
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d);
    return { n: n / g, d: d / g };
}
function fAdd(a, b) { return frac(a.n * b.d + b.n * a.d, a.d * b.d); }
function fSub(a, b) { return frac(a.n * b.d - b.n * a.d, a.d * b.d); }
function fMul(a, b) { return frac(a.n * b.n, a.d * b.d); }
function fDiv(a, b) { return b.n === 0 ? null : frac(a.n * b.d, a.d * b.n); }
function fIs24(f) { return f.n === 24 * f.d; }
function fEq(a, b) { return a.n === b.n && a.d === b.d; }

/* ==================== 表达式规范化 ==================== */
/* 节点：{leaf:true, v} 或 {op:'+'|'-'|'*'|'/', l, r} */
function flatten(node, op, out) {
    if (!node.leaf && node.op === op) { flatten(node.l, op, out); flatten(node.r, op, out); }
    else out.push(node);
}
/* ---- 代数规范化键（解法去重与状态剪枝共用） ----
   ×/÷ 链展开为「分子因子/分母因子」多重集，+/− 链展开为带符号项多重集，
   因子与项递归规范化并排序。交换律、结合律，以及 ×/÷、+/− 间的重结合
   （如 a×(b÷c) ≡ (a×b)÷c、a−(b−c) ≡ a−b+c）都会得到相同的键。 */
function mulKey(num, den) {
    var n = num.slice().sort().join('*');
    return den.length ? '(' + n + ')/(' + den.slice().sort().join('*') + ')' : '(' + n + ')';
}
function fracFactors(node) {
    if (node.leaf || node.op === '+' || node.op === '-') return { num: [factorKey(node)], den: [] };
    var a = fracFactors(node.l), b = fracFactors(node.r);
    return node.op === '*'
        ? { num: a.num.concat(b.num), den: a.den.concat(b.den) }
        : { num: a.num.concat(b.den), den: a.den.concat(b.num) };
}
function sumTerms(node, sign, out) {
    if (!node.leaf && node.op === '+') { sumTerms(node.l, sign, out); sumTerms(node.r, sign, out); }
    else if (!node.leaf && node.op === '-') { sumTerms(node.l, sign, out); sumTerms(node.r, -sign, out); }
    else out.push((sign > 0 ? '+' : '-') + factorKey(node));
}
function sumKey(node) {
    var t = [];
    sumTerms(node, 1, t);
    return '(' + t.sort().join('') + ')';
}
function factorKey(node) {
    if (node.leaf) return String(node.v);
    if (node.op === '+' || node.op === '-') return sumKey(node);
    var f = fracFactors(node);
    return mulKey(f.num, f.den);
}
function canonKey(node) { return factorKey(node); }
/* 展示用结构键：兼容求解器二叉节点与 normalize 产出的多操作数节点 */
function dispKey(node) {
    if (node.leaf) return String(node.v);
    if (node.parts) return '(' + node.parts.map(dispKey).sort().join(node.op) + ')';
    return '(' + dispKey(node.l) + node.op + dispKey(node.r) + ')';
}
/* 规范化树：连加/连乘展开为多操作数并排序（叶子按数值，复合式按键） */
function normalize(node) {
    if (node.leaf) return node;
    if (node.op === '+' || node.op === '*') {
        var parts = [];
        flatten(node, node.op, parts);
        parts = parts.map(normalize).sort(function (x, y) {
            var rx = x.leaf ? 0 : 1, ry = y.leaf ? 0 : 1;
            if (rx !== ry) return rx - ry;
            if (x.leaf) return x.v - y.v;
            var a = dispKey(x), b = dispKey(y);
            return a < b ? -1 : a > b ? 1 : 0;
        });
        return { op: node.op, parts: parts };
    }
    return { op: node.op, l: normalize(node.l), r: normalize(node.r) };
}
function precOf(op) { return (op === '+' || op === '-') ? 1 : 2; }
function symOf(op) { return op === '+' ? ' + ' : op === '-' ? ' − ' : op === '*' ? ' × ' : ' ÷ '; }
function fmtNode(node, parentPrec, isRight, parentOp) {
    if (node.leaf) return String(node.v);
    var p = precOf(node.op), s;
    if (node.parts) {
        s = node.parts.map(function (c) { return fmtNode(c, p, false, node.op); }).join(symOf(node.op));
    } else {
        s = fmtNode(node.l, p, false, node.op) + symOf(node.op) + fmtNode(node.r, p, true, node.op);
    }
    var need = p < parentPrec || (p === parentPrec && isRight && (parentOp === '-' || parentOp === '/'));
    return need ? '(' + s + ')' : s;
}
function fmtExpr(node) { return fmtNode(normalize(node), 0, false, ''); }

/* ==================== 求解：两两合并递归 + 状态剪枝 ==================== */
function solve24(numbers) {
    var items = numbers.map(function (v) { return { f: frac(v, 1), node: { leaf: true, v: v } }; });
    var found = new Map();       // canonKey -> 表达式树（仅保留一种等价写法）
    var seenStates = new Set();  // 已展开的规范化状态（值与结构均等价的状态只展开一次）
    function stateKey(list) {
        return list.map(function (it) { return canonKey(it.node); }).sort().join('|');
    }
    function rec(list) {
        if (list.length === 1) {
            if (fIs24(list[0].f)) {
                var key = canonKey(list[0].node);
                if (!found.has(key)) found.set(key, list[0].node);
            }
            return;
        }
        var skey = stateKey(list);
        if (seenStates.has(skey)) return;
        seenStates.add(skey);
        for (var i = 0; i < list.length; i++) {
            for (var j = i + 1; j < list.length; j++) {
                var a = list[i], b = list[j];
                var rest = [];
                for (var k = 0; k < list.length; k++) if (k !== i && k !== j) rest.push(list[k]);
                var same = canonKey(a.node) === canonKey(b.node);
                var combos = [
                    { f: fAdd(a.f, b.f), node: { op: '+', l: a.node, r: b.node } },
                    { f: fMul(a.f, b.f), node: { op: '*', l: a.node, r: b.node } },
                    { f: fSub(a.f, b.f), node: { op: '-', l: a.node, r: b.node } },
                    { f: fDiv(a.f, b.f), node: { op: '/', l: a.node, r: b.node } }
                ];
                /* a 与 b 规范化相同（含同值）时，反向减/除产生等价式，跳过以减枝 */
                if (!same) {
                    combos.push({ f: fSub(b.f, a.f), node: { op: '-', l: b.node, r: a.node } });
                    combos.push({ f: fDiv(b.f, a.f), node: { op: '/', l: b.node, r: a.node } });
                }
                for (var c = 0; c < combos.length; c++) {
                    if (!combos[c].f) continue;   // 除零
                    rec(rest.concat([combos[c]]));
                }
            }
        }
    }
    rec(items);
    /* 兜底：不同代表树格式化后仍可能得到相同字符串，最终再按字符串去重一次 */
    return Array.from(new Set(Array.from(found.values()).map(fmtExpr)));
}

var api = { solve24: solve24, canonKey: canonKey, fmtExpr: fmtExpr, frac: frac };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.P24 = api;
if (typeof document === 'undefined') return;

/* ==================== UI ==================== */
var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
var SUITS = ['♠', '♥', '♣', '♦'];

function renderAnswers(el, nums, solutions) {
    var head = nums.join('、');
    if (!solutions.length) {
        el.innerHTML = '<p class="ans-none">无解</p><p class="hint">「' + esc(head) + '」无法用 ＋ − × ÷ 凑出 24。</p>';
        return;
    }
    el.innerHTML = '<p class="ans-count">共 ' + solutions.length + ' 种解法（' + esc(head) + '）</p><ol>' +
        solutions.map(function (s) { return '<li>' + esc(s) + ' = 24</li>'; }).join('') + '</ol>';
}

/* ---- Tab 1：计算器 ---- */
var inputs = Array.prototype.slice.call(document.querySelectorAll('#numInputs .num-input'));
var values = [null, null, null, null];
var selected = 0;

function paintInputs() {
    inputs.forEach(function (inp, i) {
        inp.value = values[i] === null ? '' : values[i];
        inp.classList.toggle('filled', values[i] !== null);
        inp.classList.toggle('active', i === selected);
    });
}
function firstEmpty(from) {
    for (var i = 0; i < 4; i++) {
        var idx = (from + i) % 4;
        if (values[idx] === null) return idx;
    }
    return -1;
}
inputs.forEach(function (inp, i) {
    inp.addEventListener('click', function () { selected = i; paintInputs(); });
});
var pad = $('numPad');
for (var n = 1; n <= 13; n++) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'num-key';
    btn.textContent = n;
    btn.setAttribute('data-num', n);
    pad.appendChild(btn);
}
pad.addEventListener('click', function (e) {
    var b = e.target.closest('.num-key');
    if (!b) return;
    var num = Number(b.getAttribute('data-num'));
    var idx = selected >= 0 ? selected : firstEmpty(0);
    if (idx < 0) idx = 3;
    values[idx] = num;
    selected = firstEmpty(idx + 1);   // 填满后 selected = -1（无选中）
    paintInputs();
});
$('calcClear').addEventListener('click', function () {
    values = [null, null, null, null];
    selected = 0;
    paintInputs();
    $('calcAnswers').innerHTML = '<p class="hint">输入四个数字后点击「计算」。</p>';
});
$('calcRun').addEventListener('click', function () {
    if (values.some(function (v) { return v === null; })) {
        $('calcAnswers').innerHTML = '<p class="ans-none">请先把四个数字填完整。</p>';
        return;
    }
    renderAnswers($('calcAnswers'), values, solve24(values));
});
paintInputs();

/* ---- Tab 2：游戏 ---- */
var pokerRow = $('pokerRow');
var hand = null;   // [{rank:1..13, suit:0..3}]
function rankText(r) { return RANKS[r - 1]; }
function isRed(s) { return s === 1 || s === 3; }
function paintHand(dealt) {
    pokerRow.innerHTML = '';
    for (var i = 0; i < 4; i++) {
        var card = document.createElement('div');
        if (!hand) {
            card.className = 'poker-card empty';
            card.innerHTML = '<span class="pip">?</span>';
        } else {
            var c = hand[i];
            card.className = 'poker-card' + (isRed(c.suit) ? ' red' : '') + (dealt ? ' dealt' : '');
            card.setAttribute('aria-label', rankText(c.rank) + SUITS[c.suit]);
            card.innerHTML = '<span class="corner tl">' + rankText(c.rank) + '<br>' + SUITS[c.suit] + '</span>' +
                '<span class="pip">' + SUITS[c.suit] + '</span>' +
                '<span class="corner br">' + rankText(c.rank) + '<br>' + SUITS[c.suit] + '</span>';
        }
        pokerRow.appendChild(card);
    }
}
$('gameDeal').addEventListener('click', function () {
    var deck = [];
    for (var r = 1; r <= 13; r++) for (var s = 0; s < 4; s++) deck.push({ rank: r, suit: s });
    for (var i = deck.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    hand = deck.slice(0, 4);
    paintHand(true);
    $('gameAnswers').innerHTML = '<p class="hint">牌已发好，先心算，再点「解答」。</p>';
});
$('gameSolve').addEventListener('click', function () {
    if (!hand) {
        $('gameAnswers').innerHTML = '<p class="ans-none">请先点击「生成」发牌。</p>';
        return;
    }
    var nums = hand.map(function (c) { return c.rank; });
    renderAnswers($('gameAnswers'), nums, solve24(nums));
});
paintHand(false);

/* ---- Tab 切换（ARIA + 键盘方向键） ---- */
function switchTab(name, focus) {
    ['calc', 'game'].forEach(function (key) {
        var active = key === name, btn = $('tab-' + key);
        $('panel-' + key).hidden = !active;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
        btn.tabIndex = active ? 0 : -1;
    });
    if (focus) $('tab-' + name).focus();
}
var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
tabs.forEach(function (btn, i) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    btn.addEventListener('keydown', function (e) {
        var next;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = tabs.length - 1;
        if (next !== undefined) { e.preventDefault(); switchTab(tabs[next].dataset.tab, true); }
    });
});
})(typeof window !== 'undefined' ? window : globalThis);

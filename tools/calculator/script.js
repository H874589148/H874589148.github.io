/* tools/calculator/script.js
   科学计算器：自写 shunting-yard 表达式解析（无第三方库） */

var el = {};
['exprLine', 'resultLine', 'keypad', 'degBtn', 'histList', 'histHint'
].forEach(function (id) { el[id] = document.getElementById(id); });

var tokens = [];        /* 表达式 token 序列 */
var ans = 0;            /* 上一次计算结果 */
var deg = true;         /* DEG(true) / RAD(false) */
var justEval = false;   /* 刚按过 = */
var history = [];       /* 最近 10 条 {tokens, text, result} */

/* ---------- token 分类 ---------- */
var FUNC_RE = /^(sin|cos|tan|asin|acos|atan|ln|log|exp|√)\($/;
function isNumTok(t) { return /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t); }
function isConstTok(t) { return t === 'π' || t === 'e' || t === 'Ans'; }
function isFuncTok(t) { return FUNC_RE.test(t); }
function isOpTok(t) { return t === '+' || t === '-' || t === '×' || t === '÷' || t === '^'; }
function isValTok(t) { return isNumTok(t) || isConstTok(t) || t === ')' || t === '!'; }

/* ---------- shunting-yard 求值 ---------- */
function prec(o) { return (o === '+' || o === '-') ? 1 : (o === '×' || o === '÷') ? 2 : o === 'u-' ? 3 : o === '^' ? 4 : 0; }
function rightAssoc(o) { return o === '^' || o === 'u-'; }

function evaluate(rawTokens) {
    if (!rawTokens.length) throw new Error('表达式为空');
    /* 记录符号（ε/δ/Σ/lim/→）不参与求值 */
    for (var si = 0; si < rawTokens.length; si++) {
        if (/^(ε|δ|Σ|lim|→)$/.test(rawTokens[si])) {
            throw new Error('ε/δ/Σ/lim/→ 为记录符号，请移除后再计算');
        }
    }

    /* 预处理 1：负数字面量位于"值"之后 → 拆成二元 '-' + 正数 */
    var tokens = [];
    rawTokens.forEach(function (t) {
        if (isNumTok(t) && t[0] === '-' && tokens.length && isValTok(tokens[tokens.length - 1])) {
            tokens.push('-', t.slice(1));
        } else tokens.push(t);
    });

    /* 预处理 2：自动补全右括号（func token 自带一个 '('） */
    var open = 0, i;
    tokens.forEach(function (t) {
        if (t === '(' || isFuncTok(t)) open++;
        else if (t === ')') { open--; if (open < 0) throw new Error('括号不匹配：多余的 )'); }
    });
    for (i = 0; i < open; i++) tokens.push(')');

    /* 中缀 → RPN */
    var out = [], ops = [], prevVal = false;
    function pushOp(sym) {
        var p = prec(sym);
        while (ops.length) {
            var top = ops[ops.length - 1];
            if (top === '(' || isFuncTok(top)) break;
            var tp = prec(top);
            if (tp > p || (tp === p && !rightAssoc(sym))) out.push(ops.pop());
            else break;
        }
        ops.push(sym);
    }
    tokens.forEach(function (t) {
        if (isNumTok(t) || isConstTok(t)) {
            if (prevVal) pushOp('×');          /* 隐式乘法：2π、3(4+5) */
            out.push(t); prevVal = true;
        } else if (isFuncTok(t) || t === '(') {
            if (prevVal) pushOp('×');
            ops.push(t); prevVal = false;
        } else if (t === '!') {
            if (!prevVal) throw new Error('! 前缺少操作数');
            out.push('!'); prevVal = true;      /* 后缀运算直接输出，绑定左侧值 */
        } else if (isOpTok(t)) {
            if (t === '-' && !prevVal) ops.push('u-');
            else {
                if (!prevVal) throw new Error('运算符 "' + t + '" 前缺少操作数');
                pushOp(t);
            }
            prevVal = false;
        } else if (t === ')') {
            while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop());
            if (!ops.length) throw new Error('括号不匹配');
            ops.pop();
            if (ops.length && isFuncTok(ops[ops.length - 1])) out.push(ops.pop());
            prevVal = true;
        } else {
            throw new Error('无法识别的符号：' + t);
        }
    });
    while (ops.length) out.push(ops.pop());
    if (!out.length) throw new Error('表达式为空');

    /* RPN 求值 */
    var st = [];
    out.forEach(function (tk) {
        if (isNumTok(tk)) { st.push(parseFloat(tk)); return; }
        if (tk === 'π') { st.push(Math.PI); return; }
        if (tk === 'e') { st.push(Math.E); return; }
        if (tk === 'Ans') { st.push(ans); return; }
        if (tk === '!') {
            if (!st.length) throw new Error('表达式不完整');
            var n = st.pop();
            if (n < 0 || n !== Math.floor(n)) throw new Error('n! 仅支持非负整数');
            if (n > 170) throw new Error('n! 超过 170（数值溢出）');
            var r = 1;
            for (var k = 2; k <= n; k++) r *= k;
            st.push(r);
            return;
        }
        if (tk === 'u-') {
            if (!st.length) throw new Error('表达式不完整');
            st.push(-st.pop());
            return;
        }
        if (isOpTok(tk)) {
            if (st.length < 2) throw new Error('表达式不完整');
            var b = st.pop(), a = st.pop(), r2;
            if (tk === '+') r2 = a + b;
            else if (tk === '-') r2 = a - b;
            else if (tk === '×') r2 = a * b;
            else if (tk === '÷') { if (b === 0) throw new Error('除数为 0'); r2 = a / b; }
            else {
                r2 = Math.pow(a, b);
                if (isNaN(r2)) throw new Error('无效运算（结果不是实数）');
            }
            st.push(r2);
            return;
        }
        if (isFuncTok(tk)) {
            if (!st.length) throw new Error('表达式不完整');
            var x = st.pop(), fn = tk.slice(0, -1), v;
            var xa = (deg && (fn === 'sin' || fn === 'cos' || fn === 'tan')) ? x * Math.PI / 180 : x;
            switch (fn) {
                case 'sin': v = Math.sin(xa); break;
                case 'cos': v = Math.cos(xa); break;
                case 'tan': v = Math.tan(xa); break;
                case 'asin': if (Math.abs(x) > 1) throw new Error('asin 要求 |x| ≤ 1'); v = Math.asin(x); break;
                case 'acos': if (Math.abs(x) > 1) throw new Error('acos 要求 |x| ≤ 1'); v = Math.acos(x); break;
                case 'atan': v = Math.atan(x); break;
                case 'ln': if (x <= 0) throw new Error('ln 要求 x > 0'); v = Math.log(x); break;
                case 'log': if (x <= 0) throw new Error('log 要求 x > 0'); v = Math.log10(x); break;
                case 'exp': v = Math.exp(x); break;
                case '√': if (x < 0) throw new Error('√ 要求 x ≥ 0'); v = Math.sqrt(x); break;
                default: throw new Error('未知函数');
            }
            if (deg && (fn === 'asin' || fn === 'acos' || fn === 'atan')) v = v * 180 / Math.PI;
            st.push(v);
        }
    });
    if (st.length !== 1) throw new Error('表达式不完整');
    var res = st[0];
    if (isNaN(res)) throw new Error('结果无效');
    if (!isFinite(res)) throw new Error('数值溢出');
    return res;
}

/* ---------- 结果格式化：12 位有效数字 ---------- */
function fmtResult(v) {
    if (v === 0) return '0';
    var av = Math.abs(v);
    if (av >= 1e12 || av < 1e-10) {
        var s = v.toExponential(7);
        s = s.replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
        return s.replace('e+', 'e');
    }
    return String(parseFloat(v.toPrecision(12)));
}

/* ---------- 显示 ---------- */
function tokensToText(ts) {
    return ts.map(function (t) {
        if (isOpTok(t)) return ' ' + t + ' ';
        return t;
    }).join('');
}

function setResult(text, cls) {
    el.resultLine.textContent = text;
    el.resultLine.className = 'calc-result' + (cls ? ' ' + cls : '');
}

function update() {
    if (tokens.length) el.exprLine.textContent = tokensToText(tokens);
    else el.exprLine.innerHTML = '<span class="expr-placeholder">0</span>';
    if (!tokens.length) { setResult('', ''); return; }
    try {
        var v = evaluate(tokens);
        setResult('= ' + fmtResult(v), justEval ? '' : 'preview');
    } catch (err) {
        if (justEval) setResult(err.message, 'err');
        else setResult('', '');
    }
}

/* ---------- 历史 ---------- */
function renderHistory() {
    el.histList.innerHTML = '';
    el.histHint.style.display = history.length ? 'none' : '';
    history.forEach(function (h) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hist-item';
        var se = document.createElement('span');
        se.className = 'hist-expr';
        se.textContent = h.text;
        var sr = document.createElement('span');
        sr.className = 'hist-res';
        sr.textContent = '= ' + h.result;
        btn.appendChild(se);
        btn.appendChild(sr);
        btn.addEventListener('click', function () {
            tokens = h.tokens.slice();
            justEval = false;
            update();
        });
        li.appendChild(btn);
        el.histList.appendChild(li);
    });
}

/* ---------- 按键逻辑 ---------- */
function doEquals() {
    if (!tokens.length) return;
    try {
        var v = evaluate(tokens);
        var text = tokensToText(tokens);
        history.unshift({ tokens: tokens.slice(), text: text, result: fmtResult(v) });
        if (history.length > 10) history.pop();
        renderHistory();
        ans = v;
        tokens = [fmtResult(v)];
        justEval = true;
        update();
    } catch (err) {
        setResult(err.message, 'err');
    }
}

function negateLast() {
    if (!tokens.length) return;
    var i = tokens.length - 1, last = tokens[i];
    if (isNumTok(last)) tokens[i] = last[0] === '-' ? last.slice(1) : '-' + last;
}

function press(k) {
    if (k === 'DEG') {
        deg = !deg;
        el.degBtn.textContent = deg ? 'DEG' : 'RAD';
        update();
        return;
    }
    if (k === 'C') { tokens = []; justEval = false; update(); return; }
    if (k === '⌫') {
        if (!tokens.length) return;
        var last = tokens[tokens.length - 1];
        if (isNumTok(last) && last.length > 1) {
            var trimmed = last.slice(0, -1);
            if (trimmed === '-' || !isNumTok(trimmed)) tokens.pop();
            else tokens[tokens.length - 1] = trimmed;
        } else tokens.pop();
        justEval = false;
        update();
        return;
    }
    if (k === '=') { doEquals(); return; }

    /* = 之后的接续规则：运算符/后缀在结果上继续，其余重新开始 */
    if (justEval) {
        if (!(isOpTok(k) || k === '!' || k === 'sq' || k === '±' || k === '⌫')) tokens = [];
        justEval = false;
    }

    if (k === '±') { negateLast(); update(); return; }

    var lastT = tokens[tokens.length - 1];

    if (/^[0-9]$/.test(k)) {
        if (lastT !== undefined && isNumTok(lastT) && !/e/i.test(lastT)) tokens[tokens.length - 1] = lastT + k;
        else tokens.push(k);
    } else if (k === '.') {
        if (lastT !== undefined && isNumTok(lastT) && !/e/i.test(lastT)) {
            if (lastT.indexOf('.') < 0) tokens[tokens.length - 1] = lastT + '.';
        } else tokens.push('0.');
    } else if (isOpTok(k)) {
        if (!tokens.length) {
            if (k === '-') tokens.push('-');
        } else if (isOpTok(lastT)) {
            if (k === '-' && lastT !== '-') tokens.push('-');      /* 允许 5×-3 */
            else tokens[tokens.length - 1] = k;                     /* 替换上一个运算符 */
        } else if (lastT === '(' || isFuncTok(lastT)) {
            if (k === '-') tokens.push('-');
        } else tokens.push(k);
    } else if (k === ')') {
        var open = 0;
        tokens.forEach(function (t) {
            if (t === '(' || isFuncTok(t)) open++;
            else if (t === ')') open--;
        });
        if (open > 0 && lastT !== undefined && (isValTok(lastT) || isNumTok(lastT))) tokens.push(')');
    } else if (k === '!') {
        if (lastT !== undefined && isValTok(lastT)) tokens.push('!');
    } else if (k === 'sq') {
        if (lastT !== undefined && isValTok(lastT)) { tokens.push('^', '2'); }
    } else if (k === '10^(') {
        tokens.push('10', '^', '(');
    } else if (k === 'e^(') {
        tokens.push('e', '^', '(');
    } else {
        tokens.push(k);   /* 函数（含 '('）、常量 π/e/Ans */
    }
    update();
}

/* ---------- 事件 ---------- */
el.keypad.addEventListener('click', function (e) {
    var btn = e.target.closest('.key');
    if (!btn) return;
    press(btn.getAttribute('data-k'));
});

document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k >= '0' && k <= '9') press(k);
    else if (k === '.') press('.');
    else if (k === '+') press('+');
    else if (k === '-') press('-');
    else if (k === '*') press('×');
    else if (k === '/') { e.preventDefault(); press('÷'); }
    else if (k === '^') press('^');
    else if (k === '(') press('(');
    else if (k === ')') press(')');
    else if (k === '!') press('!');
    else if (k === 'Enter' || k === '=') { e.preventDefault(); press('='); }
    else if (k === 'Backspace') press('⌫');
    else if (k === 'Escape' || k === 'Delete') press('C');
    else if (k === 'p' || k === 'P') press('π');
    else return;
});

/* ---------- 复制结果 ---------- */
document.getElementById('copyResBtn').addEventListener('click', function () {
    var t = el.resultLine.textContent.replace(/^=\s*/, '');
    if (!t) return;
    var btn = this;
    copyTextToClipboard(t, function (ok) {
        btn.textContent = ok ? '已复制 ✓' : '复制失败';
        setTimeout(function () { btn.textContent = '复制结果'; }, 1200);
    });
});

/* ---------- 初始化 ---------- */
update();
renderHistory();

/* tools/base-converter/script.js - 进制转换逻辑 */

var inputEl = document.getElementById('inputValue');
var baseEl = document.getElementById('inputBase');
var errorEl = document.getElementById('errorBox');

// 实时监听输入
inputEl.addEventListener('input', convert);
baseEl.addEventListener('change', convert);

function convert() {
    var raw = inputEl.value.trim().toUpperCase();
    var base = parseInt(baseEl.value);

    // 清空旧状态
    setResult('resultBin', '-');
    setResult('resultOct', '-');
    setResult('resultDec', '-');
    setResult('resultHex', '-');
    showError(null);

    if (raw === '' || raw === '-') return;

    // 处理负号
    var isNegative = raw.charAt(0) === '-';
    var numStr = isNegative ? raw.slice(1) : raw;

    if (numStr === '') return;

    // 验证字符合法性
    var validChars = {
        2: /^[01]+$/,
        8: /^[0-7]+$/,
        10: /^[0-9]+$/,
        16: /^[0-9A-F]+$/
    };

    if (!validChars[base].test(numStr)) {
        showError('输入包含非法字符（当前进制为 ' + base + ' 进制）');
        return;
    }

    // 转为 BigInt 保证大数精度
    var decValue;
    try {
        decValue = BigInt(isNegative ? '-' : '') + BigInt('0') + parseBigInt(numStr, base);
        if (isNegative) decValue = -parseBigInt(numStr, base);
    } catch(e) {
        showError('解析错误：' + e.message);
        return;
    }

    // 输出各进制
    setResult('resultBin', formatBase(decValue, 2));
    setResult('resultOct', formatBase(decValue, 8));
    setResult('resultDec', formatBase(decValue, 10));
    setResult('resultHex', formatBase(decValue, 16).toUpperCase());
}

// 将字符串按指定进制解析为 BigInt
function parseBigInt(str, base) {
    var bigBase = BigInt(base);
    var result = BigInt(0);
    var digits = '0123456789ABCDEF';
    for (var i = 0; i < str.length; i++) {
        result = result * bigBase + BigInt(digits.indexOf(str.charAt(i)));
    }
    return result;
}

// BigInt 转指定进制字符串
function formatBase(bigNum, base) {
    if (bigNum === BigInt(0)) return '0';
    var isNeg = bigNum < BigInt(0);
    var absVal = isNeg ? -bigNum : bigNum;
    var digits = '0123456789abcdef';
    var bigBase = BigInt(base);
    var result = '';
    while (absVal > BigInt(0)) {
        result = digits[Number(absVal % bigBase)] + result;
        absVal = absVal / bigBase;
    }
    return isNeg ? '-' + result : result;
}

function setResult(id, val) {
    var el = document.getElementById(id);
    el.textContent = val;
    el.classList.toggle('updated', val !== '-');
}

function showError(msg) {
    if (msg) {
        errorEl.textContent = '⚠ ' + msg;
        errorEl.style.display = 'block';
    } else {
        errorEl.style.display = 'none';
    }
}

// 复制结果到剪贴板
function copyResult(id) {
    var val = document.getElementById(id).textContent;
    if (val === '-' || val === '') return;
    navigator.clipboard.writeText(val).then(function() {
        var btn = event.target;
        var orig = btn.textContent;
        btn.textContent = '已复制!';
        setTimeout(function() { btn.textContent = orig; }, 1200);
    }).catch(function() {
        // 降级方案
        var area = document.createElement('textarea');
        area.value = val;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
    });
}

function clearAll() {
    inputEl.value = '';
    convert();
    inputEl.focus();
}

/* tools/complement-code/script.js - 定点原码/反码/补码转换（BigInt 实现，支持任意位宽 + 小数位） */

var inputEl = document.getElementById('inputVal');
var modeEl = document.getElementById('inputMode');
var errEl = document.getElementById('errBox');
var widthBadgeEl = document.getElementById('widthBadge');
var rangeHintEl = document.getElementById('rangeHint');

inputEl.addEventListener('input', compute);
modeEl.addEventListener('change', compute);
document.getElementById('intBits').addEventListener('input', compute);
document.getElementById('fracBits').addEventListener('input', compute);

/* 快捷位宽：设 I = N-1, F = 0 */
function setWidth(n) {
    document.getElementById('intBits').value = n - 1;
    document.getElementById('fracBits').value = 0;
    compute();
}

/* 读取位宽配置 */
function getConfig() {
    var I = parseInt(document.getElementById('intBits').value, 10);
    var F = parseInt(document.getElementById('fracBits').value, 10);
    if (isNaN(I) || I < 0) I = 0;
    if (isNaN(F) || F < 0) F = 0;
    if (I > 128) I = 128;
    if (F > 128) F = 128;
    var N = 1 + I + F;
    return { I: I, F: F, N: N };
}

function compute() {
    var cfg = getConfig();
    var N = cfg.N, F = cfg.F, I = cfg.I;

    // 更新位宽显示
    if (widthBadgeEl) widthBadgeEl.textContent = N + ' bit  (S' + I + '.' + F + ')';

    var twoF = 1n << BigInt(F);
    var maxPosCode = (1n << BigInt(N - 1)) - 1n;   // 最大正码值
    var minNegCode = -(1n << BigInt(N - 1));       // 最小负码值

    // 范围提示
    if (rangeHintEl) {
        rangeHintEl.textContent = '真值范围 [' + codeToTrueDecimal(minNegCode, F) +
            ', ' + codeToTrueDecimal(maxPosCode, F) + ']，分辨率 ' + codeToTrueDecimal(1n, F);
    }

    clearResults();
    showErr(null);

    var raw = inputEl.value.trim();
    if (raw === '' || raw === '-') return;

    var mode = modeEl.value;
    var codeValue;  // BigInt 整数码值（真值 × 2^F）

    if (mode === 'decimal') {
        if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(raw)) { showErr('请输入有效的十进制数（可含小数）'); return; }
        var fval = parseFloat(raw);
        if (isNaN(fval)) { showErr('请输入有效的十进制数'); return; }
        // 量化为码值：round(val × 2^F)
        var scaled = Math.round(fval * Math.pow(2, F));
        codeValue = BigInt(scaled);
        if (codeValue > maxPosCode || codeValue < minNegCode) {
            showErr('超出 ' + N + ' 位有符号范围 [' + codeToTrueDecimal(minNegCode, F) +
                ', ' + codeToTrueDecimal(maxPosCode, F) + ']');
            return;
        }
    } else {
        // 二进制输入：去掉小数点后按 N 位校验
        var bin = raw.replace(/\./g, '');
        if (!/^[01]+$/.test(bin)) { showErr('二进制只含 0 和 1'); return; }
        if (bin.length !== N) { showErr('请输入 ' + N + ' 位二进制（当前 ' + bin.length + ' 位）'); return; }
        if (mode === 'bin_original') codeValue = smToCode(bin);
        else if (mode === 'bin_ones') codeValue = onesToCode(bin);
        else if (mode === 'bin_twos') codeValue = twosToCode(bin);
    }

    // 由码值计算三种编码
    var smCode, onesCode, twosCode;
    var smDec, onesDec, twosDec;

    if (codeValue >= 0n) {
        smCode = bigToBin(codeValue, N);
        onesCode = smCode;
        twosCode = smCode;
        smDec = onesDec = twosDec = codeToTrueDecimal(codeValue, F);
    } else if (codeValue === minNegCode) {
        smCode = 'N/A（超出原码范围）';
        onesCode = 'N/A（反码溢出）';
        twosCode = '1' + repeatChar('0', N - 1);
        smDec = 'N/A';
        onesDec = 'N/A';
        twosDec = codeToTrueDecimal(codeValue, F);
    } else {
        var absVal = -codeValue;
        var magBits = bigToBin(absVal, N - 1);
        smCode = '1' + magBits;
        onesCode = '1' + invertBits(magBits);
        twosCode = addOneToBin(onesCode);
        smDec = onesDec = twosDec = codeToTrueDecimal(codeValue, F);
    }

    setResult('resSM', insertPoint(smCode, F));
    setResult('resSMDec', smDec);
    setResult('resOnes', insertPoint(onesCode, F));
    setResult('resOnesDec', onesDec);
    setResult('resTwos', insertPoint(twosCode, F));
    setResult('resTwosDec', twosDec);

    renderBits('bvSM', smCode, cfg);
    renderBits('bvOnes', onesCode, cfg);
    renderBits('bvTwos', twosCode, cfg);
}

/* ---- 码值 ↔ 二进制 ---- */
function bigToBin(v, width) {
    // v >= 0 的 BigInt 转 width 位二进制
    var s = v.toString(2);
    while (s.length < width) s = '0' + s;
    return s;
}

function repeatChar(c, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += c;
    return s;
}

function invertBits(str) {
    return str.split('').map(function(b){ return b === '0' ? '1' : '0'; }).join('');
}

function addOneToBin(str) {
    var arr = str.split('').map(Number);
    var carry = 1;
    for (var i = arr.length - 1; i >= 0 && carry; i--) {
        var sum = arr[i] + carry;
        arr[i] = sum % 2;
        carry = Math.floor(sum / 2);
    }
    return arr.join('');
}

function binToBig(bin) {
    // 无符号二进制串 → BigInt
    return bin.length ? BigInt('0b' + bin) : 0n;
}

/* ---- 二进制编码 → 码值（BigInt） ---- */
function smToCode(bin) {
    var sign = bin.charAt(0);
    var mag = binToBig(bin.slice(1));
    return sign === '0' ? mag : -mag;
}

function onesToCode(bin) {
    if (bin.charAt(0) === '0') return binToBig(bin);
    var mag = binToBig(invertBits(bin.slice(1)));
    return -mag;
}

function twosToCode(bin) {
    if (bin.charAt(0) === '0') return binToBig(bin);
    var inv = invertBits(bin);
    var mag = binToBig(inv) + 1n;
    return -mag;
}

/* ---- 码值 → 真值十进制字符串（精确小数） ---- */
function codeToTrueDecimal(codeValue, F) {
    var neg = codeValue < 0n;
    var abs = neg ? -codeValue : codeValue;
    var twoF = 1n << BigInt(F);
    var intPart = abs / twoF;
    var fracNum = abs % twoF;
    var s = (neg ? '-' : '') + intPart.toString();
    if (F > 0 && fracNum > 0n) {
        // fracNum / 2^F = fracNum·5^F / 10^F -> F 位十进制
        var five = 5n ** BigInt(F);
        var fracDigits = (fracNum * five).toString();
        while (fracDigits.length < F) fracDigits = '0' + fracDigits;
        fracDigits = fracDigits.replace(/0+$/, '');
        if (fracDigits.length) s += '.' + fracDigits;
    }
    return s;
}

/* ---- 显示：在整数位与小数位之间插入小数点 ---- */
function insertPoint(binStr, F) {
    if (typeof binStr !== 'string' || binStr.indexOf('N/A') >= 0) return binStr;
    if (F <= 0) return binStr;
    var splitAt = binStr.length - F;
    return binStr.slice(0, splitAt) + '.' + binStr.slice(splitAt);
}

/* ---- UI 函数 ---- */
function setResult(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = (val === undefined || val === null) ? '-' : val;
}

function clearResults() {
    ['resSM','resSMDec','resOnes','resOnesDec','resTwos','resTwosDec'].forEach(function(id){
        setResult(id, '-');
    });
    ['bvSM','bvOnes','bvTwos'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

function showErr(msg) {
    if (msg) {
        errEl.textContent = '⚠ ' + msg;
        errEl.style.display = 'block';
    } else {
        errEl.style.display = 'none';
    }
}

function renderBits(containerId, binStr, cfg) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    if (typeof binStr !== 'string' || binStr.indexOf('N/A') >= 0) {
        el.innerHTML = '<span style="color:var(--color-text-muted);font-size:0.9rem;">' + binStr + '</span>';
        return;
    }
    var N = cfg.N, F = cfg.F;
    var intEnd = N - F;   // [0]=符号，[1..intEnd-1]=整数，[intEnd..]=小数
    for (var i = 0; i < binStr.length; i++) {
        // 小数点标记
        if (F > 0 && i === intEnd) {
            var dot = document.createElement('div');
            dot.className = 'bit-dot';
            dot.textContent = '.';
            el.appendChild(dot);
        }
        var cell = document.createElement('div');
        cell.className = 'bit-cell';
        cell.textContent = binStr.charAt(i);
        if (i === 0) cell.classList.add('sign');
        else if (i >= intEnd) cell.classList.add('frac');
        else cell.classList.add('intpart');
        if (binStr.charAt(i) === '1' && i !== 0) cell.classList.add('one');
        el.appendChild(cell);
    }
}

/* 初始渲染 */
compute();

/* tools/complement-code/script.js - 原码反码补码转换逻辑 */

var inputEl = document.getElementById('inputVal');
var modeEl = document.getElementById('inputMode');
var widthEl = document.getElementById('bitWidth');
var errEl = document.getElementById('errBox');

inputEl.addEventListener('input', compute);
modeEl.addEventListener('change', compute);
widthEl.addEventListener('change', compute);

function compute() {
    var raw = inputEl.value.trim();
    var mode = modeEl.value;
    var bits = parseInt(widthEl.value);
    var maxPos = (1 << (bits - 1)) - 1;   // e.g. 127 for 8-bit
    var minNeg = -(1 << (bits - 1));       // e.g. -128

    clearResults();
    showErr(null);

    if (raw === '' || raw === '-') return;

    var decVal; // 十进制真值

    if (mode === 'decimal') {
        decVal = parseInt(raw, 10);
        if (isNaN(decVal)) { showErr('请输入有效的十进制整数'); return; }
        if (decVal > maxPos || decVal < minNeg) {
            showErr('超出 ' + bits + ' 位有符号范围 [' + minNeg + ', ' + maxPos + ']'); return;
        }
    } else if (mode === 'bin_original') {
        if (!/^[01]+$/.test(raw)) { showErr('原码只含 0 和 1'); return; }
        if (raw.length !== bits) { showErr('请输入 ' + bits + ' 位二进制原码'); return; }
        decVal = smToDecimal(raw);
    } else if (mode === 'bin_ones') {
        if (!/^[01]+$/.test(raw)) { showErr('反码只含 0 和 1'); return; }
        if (raw.length !== bits) { showErr('请输入 ' + bits + ' 位二进制反码'); return; }
        decVal = onesToDecimal(raw);
    } else if (mode === 'bin_twos') {
        if (!/^[01]+$/.test(raw)) { showErr('补码只含 0 和 1'); return; }
        if (raw.length !== bits) { showErr('请输入 ' + bits + ' 位二进制补码'); return; }
        decVal = twosToDecimal(raw);
    }

    // 计算三种编码
    var smCode, onesCode, twosCode;
    var smDec, onesDec, twosDec;

    if (decVal >= 0) {
        // 正数：三种相同
        smCode = decToBin(decVal, bits);
        onesCode = smCode;
        twosCode = smCode;
        smDec = onesDec = twosDec = decVal;
    } else if (decVal === minNeg) {
        // 最小负数（如 -128）：无原码，反码特殊
        smCode = 'N/A（超出范围）';
        onesCode = 'N/A（全1+1溢出）';
        twosCode = decToBin(0, bits); // 用全0表示符号位后
        twosCode = '1' + twosCode.slice(1); // 10...0
        // 直接计算
        twosCode = '1' + padLeft('0', bits - 1);
        smDec = 'N/A';
        onesDec = 'N/A';
        twosDec = decVal;
    } else {
        // 普通负数
        var absVal = -decVal;
        var absBin = decToBin(absVal, bits - 1); // magnitude部分
        smCode = '1' + absBin;
        onesCode = '1' + invertBits(absBin);
        twosCode = addOneToBin(onesCode);
        smDec = decVal;
        onesDec = decVal;
        twosDec = decVal;
    }

    setResult('resSM', smCode);
    setResult('resSMDec', smDec);
    setResult('resOnes', onesCode);
    setResult('resOnesDec', onesDec);
    setResult('resTwos', twosCode);
    setResult('resTwosDec', twosDec);

    // 位可视化
    renderBits('bvSM', smCode, bits);
    renderBits('bvOnes', onesCode, bits);
    renderBits('bvTwos', twosCode, bits);
}

/* ---- 编码转换辅助函数 ---- */
function decToBin(val, width) {
    return padLeft(val.toString(2), width);
}

function padLeft(str, width) {
    while (str.length < width) str = '0' + str;
    return str;
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

function smToDecimal(bin) {
    var sign = bin.charAt(0);
    var mag = parseInt(bin.slice(1), 2);
    return sign === '0' ? mag : -mag;
}

function onesToDecimal(bin) {
    if (bin.charAt(0) === '0') return parseInt(bin, 2);
    // 负数：取反得原码magnitude
    var mag = parseInt(invertBits(bin.slice(1)), 2);
    return -mag;
}

function twosToDecimal(bin) {
    if (bin.charAt(0) === '0') return parseInt(bin, 2);
    // 负数：取反+1
    var inv = invertBits(bin);
    var mag = parseInt(addOneToBin(inv), 2);
    return -mag;
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

function renderBits(containerId, binStr, bits) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    if (typeof binStr !== 'string' || binStr.indexOf('N/A') >= 0) {
        el.innerHTML = '<span style="color:var(--color-text-muted);font-size:0.9rem;">' + binStr + '</span>';
        return;
    }
    for (var i = 0; i < binStr.length; i++) {
        var cell = document.createElement('div');
        cell.className = 'bit-cell';
        cell.textContent = binStr.charAt(i);
        if (i === 0) cell.classList.add('sign');
        else if (binStr.charAt(i) === '1') cell.classList.add('one');
        el.appendChild(cell);
    }
}

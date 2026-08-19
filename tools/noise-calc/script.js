/* tools/noise-calc/script.js - 噪声计算逻辑 */

var k = 1.38065e-23;  // 玻尔兹曼常数 J/K
var q = 1.60218e-19;  // 元电荷 C

// 监听所有输入
['thR','thT','thBW','shI','shBW','fKf','fCox','fW','fL','fFreq','fR'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', computeAll);
});

computeAll(); // 初始计算

function computeAll() {
    calcThermal();
    calcShot();
    calcFlicker();
}

/* ---- 热噪声 ---- */
function calcThermal() {
    var R = parseFloat(document.getElementById('thR').value);
    var T = parseFloat(document.getElementById('thT').value);
    var BW = parseFloat(document.getElementById('thBW').value);

    if (isNaN(R) || isNaN(T) || isNaN(BW) || R < 0 || T < 0 || BW < 0) {
        ['thSd','thVrms','thIn'].forEach(function(id){ setText(id, 'N/A'); });
        return;
    }

    var Sn = 4 * k * T * R;           // V²/Hz
    var Vn_sd = Math.sqrt(Sn);        // V/√Hz
    var Vrms = Math.sqrt(Sn * BW);    // V (rms)
    var In_sd = Math.sqrt(Sn) / R;    // A/√Hz

    setText('thSd',  fmtEng(Vn_sd, 'V/√Hz'));
    setText('thVrms', fmtEng(Vrms, 'V'));
    setText('thIn',  fmtEng(In_sd, 'A/√Hz'));
}

/* ---- 散粒噪声 ---- */
function calcShot() {
    var I = parseFloat(document.getElementById('shI').value);
    var BW = parseFloat(document.getElementById('shBW').value);

    if (isNaN(I) || isNaN(BW) || I < 0 || BW < 0) {
        ['shSd','shIrms'].forEach(function(id){ setText(id, 'N/A'); });
        return;
    }

    var Sin = 2 * q * I;              // A²/Hz
    var In_sd = Math.sqrt(Sin);       // A/√Hz
    var Irms = Math.sqrt(Sin * BW);   // A (rms)

    setText('shSd',  fmtEng(In_sd, 'A/√Hz'));
    setText('shIrms', fmtEng(Irms, 'A'));
}

/* ---- 闪烁噪声 ---- */
function calcFlicker() {
    var Kf = parseFloat(document.getElementById('fKf').value);
    var Cox = parseFloat(document.getElementById('fCox').value);
    var W = parseFloat(document.getElementById('fW').value);
    var L = parseFloat(document.getElementById('fL').value);
    var f = parseFloat(document.getElementById('fFreq').value);
    var R = parseFloat(document.getElementById('fR').value);

    if (isNaN(Kf)||isNaN(Cox)||isNaN(W)||isNaN(L)||isNaN(f)||
        Cox<=0||W<=0||L<=0||f<=0) {
        setText('flickVn','N/A');
        setText('flickFc','N/A');
        return;
    }

    var Sv = Kf / (Cox * W * L * f);  // V²/Hz
    var Vn = Math.sqrt(Sv);            // V/√Hz

    setText('flickVn', fmtEng(Vn, 'V/√Hz'));

    // 转角频率 fc：1/f噪声谱密度 = 热噪声谱密度 => Kf/(Cox*W*L*fc) = 4kTR
    // 需要等效热噪声R
    if (!isNaN(R) && R > 0) {
        var thSn = 4 * k * 300 * R;  // 默认T=300K
        var fc = Kf / (Cox * W * L * thSn);
        setText('flickFc', fmtEng(fc, 'Hz'));
    } else {
        setText('flickFc', '请输入等效R');
    }
}

/* ---- 工具函数 ---- */
function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
}

// 格式化为工程记号
function fmtEng(num, unit) {
    if (!isFinite(num) || num === 0) return '0 ' + unit;
    var prefixes = [
        {v:1e12,s:'T'},{v:1e9,s:'G'},{v:1e6,s:'M'},{v:1e3,s:'k'},
        {v:1,s:''},{v:1e-3,s:'m'},{v:1e-6,s:'μ'},{v:1e-9,s:'n'},
        {v:1e-12,s:'p'},{v:1e-15,s:'f'}
    ];
    var absN = Math.abs(num);
    for (var i = 0; i < prefixes.length; i++) {
        if (absN >= prefixes[i].v * 0.9999) {
            var val = num / prefixes[i].v;
            return val.toPrecision(4).replace(/\.?0+$/, '') + ' ' + prefixes[i].s + unit;
        }
    }
    return num.toExponential(3) + ' ' + unit;
}

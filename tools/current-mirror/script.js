/* tools/current-mirror/script.js - 电流镜失配计算（Pelgrom 模型） */

['Avt','Ab','mW','mL','Vov'].forEach(function(id){
    document.getElementById(id).addEventListener('input', compute);
});

compute();

function compute() {
    var Avt  = parseFloat(document.getElementById('Avt').value);  // mV·μm
    var Ab   = parseFloat(document.getElementById('Ab').value);   // %·μm
    var W    = parseFloat(document.getElementById('mW').value);   // μm
    var L    = parseFloat(document.getElementById('mL').value);   // μm
    var Vov  = parseFloat(document.getElementById('Vov').value);  // V

    if ([Avt,Ab,W,L,Vov].some(isNaN) || W<=0 || L<=0 || Vov<=0) {
        setText('resMain', 'N/A');
        setText('resVT', 'N/A');
        setText('resBeta', 'N/A');
        setText('resArea', 'N/A');
        return;
    }

    // 转换单位：Avt mV·μm -> V·m (注意：WL 是 μm²，需统一单位)
    // σ²(ΔVT) = Avt² / WL  (单位一致在 μm 体系下直接用)
    // σ(ΔI/I) due to VT: 2σ(ΔVT) / Vov  [gm/Id = 2/Vov]
    // σ(ΔI/I) due to β: σ(Δβ/β) = Ab / √WL
    var WL = W * L;  // μm²

    var sig_VT_abs  = Avt / Math.sqrt(WL);           // mV
    var term_VT     = (2 * sig_VT_abs * 1e-3) / Vov; // V->1, unitless fraction
    var term_beta   = (Ab / 100) / Math.sqrt(WL);    // unitless fraction

    var sig_total = Math.sqrt(term_VT * term_VT + term_beta * term_beta);

    setText('resMain', (sig_total * 100).toPrecision(4) + ' %  (1σ)');
    setText('resVT',   (term_VT  * 100).toPrecision(4) + ' %');
    setText('resBeta', (term_beta* 100).toPrecision(4) + ' %');
    setText('resArea', WL.toPrecision(4) + ' μm²');

    buildSweepTable(Avt, Ab, L, Vov);
}

function buildSweepTable(Avt, Ab, L, Vov) {
    var widths = [1, 2, 4, 8, 10, 16, 20, 32, 50, 100];
    var tbody = document.getElementById('sweepBody');
    tbody.innerHTML = '';
    widths.forEach(function(W) {
        var WL = W * L;
        var sig_VT  = (2 * (Avt / Math.sqrt(WL)) * 1e-3) / Vov;
        var sig_b   = (Ab / 100) / Math.sqrt(WL);
        var sig     = Math.sqrt(sig_VT*sig_VT + sig_b*sig_b) * 100;
        var sig3    = sig * 3;

        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' + W + '</td>' +
            '<td>' + (WL).toFixed(1) + '</td>' +
            '<td class="' + (sig < 1 ? 'good' : sig < 2 ? 'warn' : 'bad') + '">' +
                sig.toPrecision(3) + ' %</td>' +
            '<td>' + sig3.toPrecision(3) + ' %</td>';
        tbody.appendChild(tr);
    });
}

function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
}

/* tools/power-electronics/script.js - 电力电子拓扑波形绘制 */

var currentTopo = 'buck';

/* ========== 拓扑描述 ========== */
var topoDesc = {
    buck: 'Buck（降压）变换器：V<sub>out</sub> = D × V<sub>in</sub>，电感电流连续（CCM）模式。显示开关管驱动信号、电感电流、输出电压纹波。',
    boost: 'Boost（升压）变换器：V<sub>out</sub> = V<sub>in</sub> / (1-D)，CCM 模式。显示开关管驱动信号、电感电流、输出节点电压。',
    buckboost: 'Buck-Boost（升降压）变换器：V<sub>out</sub> = -D/(1-D) × V<sub>in</sub>（反相），CCM 模式。',
    flyback: 'Flyback（反激）变换器：V<sub>out</sub> = D/(1-D) × V<sub>in</sub>/n，CCM 模式。显示原副边电流与磁化电流。',
    llc: 'LLC 谐振变换器：半桥 50% 占空比（含死区）驱动，变频调节增益。f<sub>r</sub> = 1/(2π√(L<sub>r</sub>C<sub>r</sub>)) 为谐振频率，f<sub>m</sub> = 1/(2π√((L<sub>r</sub>+L<sub>m</sub>)C<sub>r</sub>)) 为第二谐振点。波形为分段工程近似：f<sub>s</sub>&gt;f<sub>r</sub> 时 i<sub>r</sub> 为准正弦；f<sub>m</sub>&lt;f<sub>s</sub>&lt;f<sub>r</sub> 时出现励磁平台（i<sub>r</sub>=i<sub>m</sub>，副边截止）；f<sub>s</sub>≈f<sub>r</sub> 时 i<sub>r</sub> 为半周期正弦、与 i<sub>m</sub> 端点相接。',
    dsd: 'DSD（Double Step-Down，串联电容两相交错 Buck）：V<sub>out</sub> = D×V<sub>in</sub>/2。两相交错 180° 驱动，飞跨电容稳压 V<sub>in</sub>/2，开关节点摆幅 V<sub>in</sub>/2、等效频率 2×f<sub>sw</sub>；电感纹波按 (V<sub>in</sub>/2−V<sub>out</sub>)·D/(L·f<sub>sw</sub>) 估算。'
};

/* ========== 初始化 ========== */
document.getElementById('vin').addEventListener('input', drawWave);
document.getElementById('iLoad').addEventListener('input', drawWave);
document.getElementById('fsw').addEventListener('input', drawWave);
document.getElementById('lval').addEventListener('input', drawWave);
document.getElementById('cout').addEventListener('input', drawWave);
document.getElementById('ncycle').addEventListener('change', drawWave);
document.getElementById('lrval').addEventListener('input', drawWave);
document.getElementById('crval').addEventListener('input', drawWave);
document.getElementById('lmval').addEventListener('input', drawWave);
selectTopo('buck');

/* ========== 拓扑切换 ========== */
function selectTopo(name) {
    currentTopo = name;
    document.querySelectorAll('.topo-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.topo === name);
    });
    document.getElementById('topoDesc').innerHTML = topoDesc[name] || '';
    /* LLC：50% 固定占空比 + 谐振参数；隐藏占空比/L/Cout */
    var isLlc = (name === 'llc');
    document.getElementById('dutyField').style.display = isLlc ? 'none' : '';
    document.getElementById('lField').style.display = isLlc ? 'none' : '';
    document.getElementById('coutField').style.display = isLlc ? 'none' : '';
    document.getElementById('lrField').style.display = isLlc ? '' : 'none';
    document.getElementById('crField').style.display = isLlc ? '' : 'none';
    document.getElementById('lmField').style.display = isLlc ? '' : 'none';
    drawWave();
}

function updateDuty(val) {
    document.getElementById('dutyVal').textContent = val + '%';
    drawWave();
}

/* ========== 获取参数 ========== */
function getParams() {
    return {
        D: parseFloat(document.getElementById('dutySlider').value) / 100,
        Vin: parseFloat(document.getElementById('vin').value) || 12,
        IL: parseFloat(document.getElementById('iLoad').value) || 2,
        fsw: (parseFloat(document.getElementById('fsw').value) || 500) * 1e3,   // kHz -> Hz
        L: (parseFloat(document.getElementById('lval').value) || 10) * 1e-6,     // µH -> H
        Cout: (parseFloat(document.getElementById('cout').value) || 100) * 1e-6, // µF -> F
        Lr: (parseFloat(document.getElementById('lrval').value) || 10) * 1e-6,   // µH -> H
        Cr: (parseFloat(document.getElementById('crval').value) || 47) * 1e-9,   // nF -> F
        Lm: (parseFloat(document.getElementById('lmval').value) || 47) * 1e-6,   // µH -> H
        Ncycle: parseInt(document.getElementById('ncycle').value, 10) || 2
    };
}

/* ========== 纹波 / CCM-DCM 计算 ==========
   统一用电感导通压降 Von 与导通时间 D·T 求 ΔI_L：ΔI_L = Von·D/(L·fsw)
   Buck: Von = Vin·(1-D)，I_L均值 = IL(负载)；其余拓扑 Von = Vin，I_L均值 = IL/(1-D) */
function calcRipple(topo, D, Vin, IL, L, fsw) {
    var Von, ILavg;
    switch (topo) {
        case 'buck':
            Von = Vin * (1 - D); ILavg = IL; break;
        case 'dsd':
            Von = (Vin / 2) * (1 - D); ILavg = IL; break;
        case 'boost':
        case 'buckboost':
        case 'flyback':
        default:
            Von = Vin; ILavg = IL / Math.max(1 - D, 1e-6); break;
    }
    var deltaI = Von * D / Math.max(L * fsw, 1e-12);
    var ripplePct = deltaI / Math.max(ILavg, 1e-9);
    // 临界电感：ΔI_L/2 = I_L均值 时的 L
    var Lcrit = Von * D / (2 * fsw * Math.max(ILavg, 1e-9));
    var ccm = (deltaI / 2) < ILavg;  // 最小电流 > 0 为 CCM
    return { deltaI: deltaI, ILavg: ILavg, ripplePct: ripplePct, Lcrit: Lcrit, ccm: ccm };
}

/* ========== 直流工作点计算 ========== */
function calcDC(topo, D, Vin, IL) {
    switch(topo) {
        case 'buck':
            return { Vout: D * Vin, gain: 'V_out = D×V_in' };
        case 'boost':
            return { Vout: Vin / (1 - D), gain: 'V_out = V_in/(1-D)' };
        case 'buckboost':
            return { Vout: D / (1 - D) * Vin, gain: 'V_out = D/(1-D)×V_in' };
        case 'flyback':
            var n = 1; // 默认匝比 1:1
            return { Vout: D / (1 - D) * Vin / n, gain: 'V_out = D/(1-D)×V_in/n' };
        case 'dsd':
            return { Vout: D * Vin / 2, gain: 'V_out = D×V_in/2' };
        default:
            return { Vout: 0, gain: '-' };
    }
}

/* ========== 波形数据生成（单周期，t ∈ [0,1]） ========== */
function getWaveforms(topo, D, Vin, IL, deltaI, Cout, fsw) {
    var pts = 200;
    var waveforms = [];
    var dtR = (1 / fsw) / pts;  // 每步对应的真实时间 (s)

    switch(topo) {
        case 'buck': {
            var Vout = D * Vin;
            var Vsw_data = [], IL_data = [], iLarr = [];
            for (var i = 0; i <= pts; i++) {
                var t = i / pts;
                Vsw_data.push({ t: t, v: t < D ? Vin : 0 });
                var iL = (t < D)
                    ? (IL - deltaI/2) + (t / D) * deltaI
                    : (IL + deltaI/2) - ((t - D) / (1 - D)) * deltaI;
                iLarr.push(iL);
                IL_data.push({ t: t, v: iL });
            }
            // 输出电压纹波：对电容电流 (i_L - I_out) 积分（抛物线型）
            var Vo_data = buildCapIntegral(iLarr, IL, dtR, Cout, Vout, pts);
            waveforms = [
                { label: 'V_SW (开关节点电压)', data: Vsw_data, color: '#3a5a8c', unit: 'V', ymax: Vin * 1.2, ymin: -1 },
                { label: 'I_L (电感电流)', data: IL_data, color: '#c0583a', unit: 'A', ymax: IL + deltaI, ymin: Math.max(0, IL - deltaI * 1.2) },
                Vo_data
            ];
            break;
        }
        case 'boost': {
            var Vout = Vin / (1 - D);
            var dVo = IL * D / Math.max(Cout * fsw, 1e-12);
            var VD_data = [], IL_data2 = [], Vo2 = [];
            var ILavg = IL / Math.max(1 - D, 1e-6);
            for (var i = 0; i <= pts; i++) {
                var t = i / pts;
                VD_data.push({ t: t, v: t < D ? 0 : Vout });
                var iL = (t < D)
                    ? (ILavg - deltaI/2) + (t / D) * deltaI
                    : (ILavg + deltaI/2) - ((t - D) / (1 - D)) * deltaI;
                IL_data2.push({ t: t, v: iL });
                // 导通期电容放电下降，关断期二极管充电上升（锅齿型）
                var vr = (t < D) ? (dVo/2 - (t/D)*dVo) : (-dVo/2 + ((t-D)/(1-D))*dVo);
                Vo2.push({ t: t, v: Vout + vr });
            }
            waveforms = [
                { label: 'V_D (二极管阳极电压)', data: VD_data, color: '#3a5a8c', unit: 'V', ymax: Vout * 1.2, ymin: -2 },
                { label: 'I_L (电感电流)', data: IL_data2, color: '#c0583a', unit: 'A', ymax: ILavg + deltaI, ymin: Math.max(0, ILavg - deltaI * 1.2) },
                { label: 'V_out (输出电压纹波)', data: Vo2, color: '#4a7a4a', unit: 'V', ymax: Vout + dVo, ymin: Vout - dVo }
            ];
            break;
        }
        case 'buckboost': {
            var Vout = D / (1 - D) * Vin;
            var dVo = IL * D / Math.max(Cout * fsw, 1e-12);
            var Vsw_bb = [], IL_bb = [], Vo3 = [];
            var ILavg = IL / Math.max(1 - D, 1e-6);
            for (var i = 0; i <= pts; i++) {
                var t = i / pts;
                Vsw_bb.push({ t: t, v: t < D ? Vin + Vout : 0 });
                var iL = (t < D)
                    ? (ILavg - deltaI/2) + (t / D) * deltaI
                    : (ILavg + deltaI/2) - ((t - D) / (1 - D)) * deltaI;
                IL_bb.push({ t: t, v: Math.max(0, iL) });
                var vr = (t < D) ? (dVo/2 - (t/D)*dVo) : (-dVo/2 + ((t-D)/(1-D))*dVo);
                Vo3.push({ t: t, v: Vout + vr });
            }
            waveforms = [
                { label: 'V_SW (开关节点)', data: Vsw_bb, color: '#3a5a8c', unit: 'V', ymax: (Vin+Vout)*1.15, ymin: -1 },
                { label: 'I_L (电感电流)', data: IL_bb, color: '#c0583a', unit: 'A', ymax: ILavg + deltaI, ymin: 0 },
                { label: 'V_out (输出电压纹波)', data: Vo3, color: '#4a7a4a', unit: 'V', ymax: Vout + dVo, ymin: Vout - dVo }
            ];
            break;
        }
        case 'flyback': {
            var n = 1;
            var Vout = D / (1 - D) * Vin / n;
            var dVo = IL * D / Math.max(Cout * fsw, 1e-12);
            var Ipri = [], Isec = [], Vo4 = [];
            var Ipk = IL / (1-D);
            var magRipple = Ipk * 0.4;
            for (var i = 0; i <= pts; i++) {
                var t = i / pts;
                var ip, is;
                if (t < D) {
                    ip = (t / D) * (Ipk + magRipple/2) - magRipple/2;
                    ip = Math.max(0, ip);
                    is = 0;
                } else {
                    ip = 0;
                    is = Ipk * (1 - (t - D) / (1 - D));
                    is = Math.max(0, is);
                }
                Ipri.push({ t: t, v: ip });
                Isec.push({ t: t, v: is });
                var vr = (t < D) ? (dVo/2 - (t/D)*dVo) : (-dVo/2 + ((t-D)/(1-D))*dVo);
                Vo4.push({ t: t, v: Vout + vr });
            }
            waveforms = [
                { label: 'I_pri (一次侧电流)', data: Ipri, color: '#3a5a8c', unit: 'A', ymax: (Ipk + magRipple) * 1.2, ymin: 0 },
                { label: 'I_sec (二次侧电流)', data: Isec, color: '#c0583a', unit: 'A', ymax: Ipk * 1.2, ymin: 0 },
                { label: 'V_out (输出电压纹波)', data: Vo4, color: '#4a7a4a', unit: 'V', ymax: Vout + dVo, ymin: Vout - dVo }
            ];
            break;
        }
        case 'dsd': {
            /* 串联电容两相交错 Buck：Q1/Q2 交错 180°，Vsw 摆幅 Vin/2、等效 2 倍频 */
            var Vout = D * Vin / 2;
            var Vhalf = Vin / 2;
            var Dc = Math.min(D, 0.5);   // 交错不重叠约束（D>0.5 时 Vsw 恒为高）
            var Q1d = [], Q2d = [], Vsw_d = [], ILd = [], Vcf_d = [];
            var iLarr2 = [];
            var dVcf = Math.max(Vhalf * 0.02, 0.05);   // 飞跨电容小纹波（示意）
            for (var i = 0; i <= pts; i++) {
                var t = i / pts;
                var q1 = t < D;
                var q2 = ((t + 0.5) % 1) < D;
                Q1d.push({ t: t, v: q1 ? 1 : 0 });
                Q2d.push({ t: t, v: q2 ? 1 : 0 });
                Vsw_d.push({ t: t, v: (q1 || q2) ? Vhalf : 0 });
                // 电感电流：2 倍频三角纹波（每半周期前 Dc 段上升）
                var s = t % 0.5;
                var iL;
                if (s < Dc) iL = (IL - deltaI / 2) + (s / Dc) * deltaI;
                else iL = (IL + deltaI / 2) - ((s - Dc) / Math.max(0.5 - Dc, 1e-6)) * deltaI;
                iLarr2.push(iL);
                ILd.push({ t: t, v: iL });
                // 飞跨电容电压 ≈ Vin/2 + 小三角纹波
                var vc = (s < Dc) ? (-dVcf / 2 + (s / Dc) * dVcf) : (dVcf / 2 - ((s - Dc) / Math.max(0.5 - Dc, 1e-6)) * dVcf);
                Vcf_d.push({ t: t, v: Vhalf + vc });
            }
            var Vo_d = buildCapIntegral(iLarr2, IL, dtR, Cout, Vout, pts);
            waveforms = [
                { label: 'V_GS Q1 (主开关驱动)', data: Q1d, color: '#3a5a8c', unit: 'V', ymax: 1.4, ymin: -0.2 },
                { label: 'V_GS Q2 (交错 180°)', data: Q2d, color: '#7a5a8c', unit: 'V', ymax: 1.4, ymin: -0.2 },
                { label: 'V_SW (开关节点, 0~V_in/2)', data: Vsw_d, color: '#3a5a8c', unit: 'V', ymax: Vhalf * 1.35, ymin: -Vhalf * 0.1 },
                { label: 'I_L (电感电流, 2×f_sw)', data: ILd, color: '#c0583a', unit: 'A', ymax: IL + deltaI, ymin: Math.max(0, IL - deltaI * 1.2) },
                { label: 'V_CF (飞跨电容 ≈ V_in/2)', data: Vcf_d, color: '#4a7a4a', unit: 'V', ymax: Vhalf + dVcf * 2, ymin: Vhalf - dVcf * 2 },
                Vo_d
            ];
            break;
        }
    }
    return waveforms;
}

/* 对电容电流 (i_L - I_out) 积分得输出电压纹波（Buck 型，抛物线） */
function buildCapIntegral(iLarr, Iout, dtR, Cout, Vout, pts) {
    var vArr = [], v = 0, sum = 0;
    for (var i = 0; i <= pts; i++) {
        v += (iLarr[i] - Iout) * dtR / Math.max(Cout, 1e-12);
        vArr.push(v);
        sum += v;
    }
    var mean = sum / (pts + 1);
    var data = [], vmin = Infinity, vmax = -Infinity;
    for (var j = 0; j <= pts; j++) {
        var vv = Vout + (vArr[j] - mean);
        data.push({ t: j / pts, v: vv });
        if (vv < vmin) vmin = vv;
        if (vv > vmax) vmax = vv;
    }
    var pad = Math.max((vmax - vmin) * 0.3, 1e-6);
    return { label: 'V_out (输出电压纹波)', data: data, color: '#4a7a4a', unit: 'V', ymax: vmax + pad, ymin: vmin - pad };
}

/* ========== 主绘制函数 ========== */
function drawWave() {
    var p = getParams();
    if (currentTopo === 'llc') { drawWaveLlc(p); return; }
    var dc = calcDC(currentTopo, p.D, p.Vin, p.IL);
    var rip = calcRipple(currentTopo, p.D, p.Vin, p.IL, p.L, p.fsw);
    var waveforms = getWaveforms(currentTopo, p.D, p.Vin, p.IL, rip.deltaI, p.Cout, p.fsw);

    // 输出电压纹波（供显示）
    var dVo;
    if (currentTopo === 'buck') dVo = rip.deltaI / (8 * p.Cout * p.fsw);
    else if (currentTopo === 'dsd') dVo = rip.deltaI / (8 * p.Cout * 2 * p.fsw);   // 等效 2 倍频
    else dVo = p.IL * p.D / (p.Cout * p.fsw);

    // 更新直流显示
    var dcEl = document.getElementById('dcParams');
    dcEl.innerHTML =
        '<div class="dc-row"><span>V_out</span><span class="dc-val">' + dc.Vout.toFixed(2) + ' V</span></div>' +
        '<div class="dc-row"><span>公式</span><span class="dc-val" style="font-size:0.8rem;">' + dc.gain + '</span></div>' +
        '<div class="dc-row"><span>D</span><span class="dc-val">' + (p.D*100).toFixed(0) + '%</span></div>' +
        '<div class="dc-row"><span>ΔI_L</span><span class="dc-val">' + fmtSI(rip.deltaI, 'A') + '</span></div>' +
        '<div class="dc-row"><span>纹波率</span><span class="dc-val">' + (rip.ripplePct*100).toFixed(1) + '%</span></div>' +
        '<div class="dc-row"><span>工作模式</span><span class="dc-val" style="color:' + (rip.ccm ? 'var(--color-primary)' : 'var(--color-accent)') + ';">' + (rip.ccm ? 'CCM' : 'DCM') + '</span></div>' +
        '<div class="dc-row"><span>L<sub>crit</sub></span><span class="dc-val">' + fmtSI(rip.Lcrit, 'H') + '</span></div>' +
        '<div class="dc-row"><span>ΔV_out</span><span class="dc-val">' + fmtSI(dVo, 'V') + '</span></div>';

    // 绘制波形（按显示周期数重复）
    drawWaveCanvas('waveCanvas', waveforms, p.D, p.Ncycle);
}

/* ========== LLC 谐振变换器（分段工程近似，归一化波形） ========== */
function drawWaveLlc(p) {
    var fr = 1 / (2 * Math.PI * Math.sqrt(Math.max(p.Lr * p.Cr, 1e-24)));
    var fm = 1 / (2 * Math.PI * Math.sqrt(Math.max((p.Lr + p.Lm) * p.Cr, 1e-24)));
    var fs = p.fsw;
    var region, rColor;
    if (fs > fr * 1.02) { region = '高于谐振（fs > fr）'; rColor = 'var(--color-primary)'; }
    else if (fs >= fr * 0.98) { region = '谐振点附近（fs ≈ fr）'; rColor = 'var(--color-primary)'; }
    else if (fs > fm) { region = '欠谐振（fm < fs < fr）'; rColor = 'var(--color-accent)'; }
    else { region = '低于 fm（增益异常区）'; rColor = 'var(--color-accent)'; }

    var dcEl = document.getElementById('dcParams');
    dcEl.innerHTML =
        '<div class="dc-row"><span>f_r = 1/(2π√(L_r·C_r))</span><span class="dc-val">' + fmtSI(fr, 'Hz') + '</span></div>' +
        '<div class="dc-row"><span>f_m = 1/(2π√((L_r+L_m)C_r))</span><span class="dc-val">' + fmtSI(fm, 'Hz') + '</span></div>' +
        '<div class="dc-row"><span>f_s（当前开关频率）</span><span class="dc-val">' + fmtSI(fs, 'Hz') + '</span></div>' +
        '<div class="dc-row"><span>L_n = L_m/L_r</span><span class="dc-val">' + (p.Lm / Math.max(p.Lr, 1e-12)).toFixed(1) + '</span></div>' +
        '<div class="dc-row"><span>工作区</span><span class="dc-val" style="color:' + rColor + ';">' + region + '</span></div>';

    drawWaveCanvas('waveCanvas', genLlcWaveforms(fs / fr, p.Vin), 0.5, p.Ncycle);
}

/* 归一化波形模型：im 幅值 0.8，谐振附加环流幅值 1.2；
   半周期相位 θ∈[0,π]，θR=π·fs/fr 内谐振（ic≠0），其后为励磁平台（ic=0，ir=im，副边截止）；
   fs≥fr 时 θR=π：全谐振无平台，fs=fr 时 ir 恰为半周期正弦、与 im 端点相接 */
function genLlcWaveforms(rr, Vin) {
    var pts = 200;
    var Im = 0.8, Iadd = 1.2;
    var thR = rr >= 1 ? Math.PI : Math.PI * rr;
    var Q1 = [], Q2 = [], Vsw = [], ir = [], im = [], vcr = [], isec = [];
    var i, t, te, ph, th, sgn, ic, imv;
    var vRaw = [], v = 0, vSum = 0;
    for (i = 0; i <= pts; i++) {
        t = i / pts;
        Q1.push({ t: t, v: t < 0.47 ? 1 : 0 });
        Q2.push({ t: t, v: (t >= 0.53 && t < 0.97) ? 1 : 0 });
        Vsw.push({ t: t, v: t < 0.5 ? Vin : 0 });
        te = (t >= 1) ? 0 : t;               // 末端取周期闭合值
        ph = (te % 0.5) / 0.5;               // 半周期相位 ∈ [0,1)
        th = Math.PI * ph;
        sgn = te < 0.5 ? 1 : -1;
        imv = sgn * (2 * ph - 1) * Im;       // 分段三角：−Im→+Im→−Im
        if (th < thR) ic = sgn * Iadd * Math.sin(Math.PI * th / thR);
        else ic = 0;
        ir.push({ t: t, v: imv + ic });
        im.push({ t: t, v: imv });
        isec.push({ t: t, v: Math.abs(ic) });
        v += ic / pts;                       // v_Cr = ∫(ir−im)dt（归一化）
        vRaw.push(v);
        vSum += v;
    }
    var vMean = vSum / (pts + 1), vMax = 1e-9;
    for (i = 0; i <= pts; i++) {
        vRaw[i] -= vMean;
        if (Math.abs(vRaw[i]) > vMax) vMax = Math.abs(vRaw[i]);
    }
    for (i = 0; i <= pts; i++) {
        vcr.push({ t: i / pts, v: vRaw[i] / vMax });   // 归一化到 ±1
    }
    var iMax = (Im + Iadd) * 1.15;
    return [
        { label: 'V_GS Q1 (50% − 死区)', data: Q1, color: '#3a5a8c', unit: 'V', ymax: 1.4, ymin: -0.2 },
        { label: 'V_GS Q2', data: Q2, color: '#7a5a8c', unit: 'V', ymax: 1.4, ymin: -0.2 },
        { label: 'V_SW (半桥节点)', data: Vsw, color: '#3a5a8c', unit: 'V', ymax: Vin * 1.15, ymin: -Vin * 0.08 },
        { label: 'i_r (谐振电流, 归一化)', data: ir, color: '#c0583a', unit: 'pu', ymax: iMax, ymin: -iMax },
        { label: 'i_m (励磁电流, 归一化)', data: im, color: '#c0893a', unit: 'pu', ymax: Im * 1.5, ymin: -Im * 1.5 },
        { label: 'v_Cr (谐振电容电压, 归一化)', data: vcr, color: '#4a7a4a', unit: 'pu', ymax: 1.35, ymin: -1.35 },
        { label: 'i_sec (副边整流 |i_r−i_m|)', data: isec, color: '#7a5a8c', unit: 'pu', ymax: Iadd * 1.3, ymin: -0.12 }
    ];
}

/* 工程记号格式化 */
function fmtSI(x, unit) {
    var ax = Math.abs(x);
    var pfx = '', v = x;
    if (ax === 0) { return '0 ' + unit; }
    if (ax >= 1e3) { v = x/1e3; pfx = 'k'; }
    else if (ax >= 1) { v = x; pfx = ''; }
    else if (ax >= 1e-3) { v = x*1e3; pfx = 'm'; }
    else if (ax >= 1e-6) { v = x*1e6; pfx = 'µ'; }
    else if (ax >= 1e-9) { v = x*1e9; pfx = 'n'; }
    else { v = x*1e12; pfx = 'p'; }
    return v.toFixed(2) + ' ' + pfx + unit;
}

/* ========== Canvas 绘制 ========== */
function drawWaveCanvas(canvasId, waveforms, D, Ncycle) {
    Ncycle = Ncycle || 1;
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;

    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 700;
    var rowH = 160;  // 每行波形高度
    var totalH = waveforms.length * rowH + 20;
    canvas.width = w * dpr;
    canvas.height = totalH * dpr;
    canvas.style.height = totalH + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fffcf7';
    ctx.fillRect(0, 0, w, totalH);

    var PAD = { top: 12, right: 20, bottom: 30, left: 60 };

    waveforms.forEach(function(wave, idx) {
        var offsetY = idx * rowH;
        var cw = w - PAD.left - PAD.right;
        var ch = rowH - PAD.top - PAD.bottom;

        var yMin = wave.ymin;
        var yMax = wave.ymax;
        if (yMax === yMin) { yMax += 1; yMin -= 1; }

        function xPos(gt) { return PAD.left + (gt / Ncycle) * cw; }  // gt ∈ [0, Ncycle]
        function yPos(v) { return offsetY + PAD.top + (1 - (v - yMin) / (yMax - yMin)) * ch; }

        // 背景
        ctx.fillStyle = 'rgba(248,244,236,0.5)';
        ctx.fillRect(PAD.left, offsetY + PAD.top, cw, ch);

        // 占空比阴影（每个周期）
        ctx.fillStyle = 'rgba(58,90,140,0.08)';
        for (var c = 0; c < Ncycle; c++) {
            ctx.fillRect(xPos(c), offsetY + PAD.top, xPos(c + D) - xPos(c), ch);
        }

        // 网格线
        ctx.strokeStyle = '#e8e2d8';
        ctx.lineWidth = 1;
        // Y 轴3条线
        [0.25, 0.5, 0.75].forEach(function(r) {
            var y = offsetY + PAD.top + r * ch;
            ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left+cw, y); ctx.stroke();
        });
        // X轴 每周期的 D 分界与周期分界
        for (var c = 0; c < Ncycle; c++) {
            var xD = xPos(c + D);
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = '#aaa';
            ctx.beginPath(); ctx.moveTo(xD, offsetY+PAD.top); ctx.lineTo(xD, offsetY+PAD.top+ch); ctx.stroke();
            ctx.setLineDash([]);
            if (c > 0) {
                var xC = xPos(c);
                ctx.strokeStyle = '#d0c8b8';
                ctx.beginPath(); ctx.moveTo(xC, offsetY+PAD.top); ctx.lineTo(xC, offsetY+PAD.top+ch); ctx.stroke();
            }
        }

        // 坐标轴框
        ctx.strokeStyle = '#4a4a4a';
        ctx.lineWidth = 2;
        ctx.strokeRect(PAD.left, offsetY+PAD.top, cw, ch);

        // Y 轴标签
        ctx.fillStyle = '#8a8a8a';
        ctx.font = '11px Fira Code, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(yMax.toFixed(1), PAD.left - 3, offsetY + PAD.top + 8);
        ctx.fillText(yMin.toFixed(1), PAD.left - 3, offsetY + PAD.top + ch);
        var ymid = (yMax + yMin) / 2;
        ctx.fillText(ymid.toFixed(1), PAD.left - 3, offsetY + PAD.top + ch/2 + 4);

        // X 轴标签
        ctx.textAlign = 'center';
        ctx.fillText('0', PAD.left, offsetY+PAD.top+ch+16);
        for (var c = 0; c < Ncycle; c++) {
            ctx.fillText(currentTopo === 'llc' ? 'T/2' : 'D', xPos(c + D), offsetY+PAD.top+ch+16);
            ctx.fillText(Ncycle > 1 ? (c+1) + 'T' : 'T', xPos(c + 1), offsetY+PAD.top+ch+16);
        }

        // 波形标签
        ctx.fillStyle = wave.color;
        ctx.font = 'bold 12px Patrick Hand, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(wave.label, PAD.left+4, offsetY+PAD.top+14);

        // 绘制波形（按周期重复）
        ctx.beginPath();
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        var first = true;
        for (var c = 0; c < Ncycle; c++) {
            wave.data.forEach(function(pt) {
                var px = xPos(c + pt.t);
                var py = yPos(pt.v);
                py = Math.max(offsetY+PAD.top, Math.min(offsetY+PAD.top+ch, py));
                if (first) { ctx.moveTo(px, py); first = false; }
                else ctx.lineTo(px, py);
            });
        }
        ctx.stroke();
    });

    // 底部 X 轴说明
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '12px Patrick Hand, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('← 时间 (' + Ncycle + ' 个开关周期 T) →', w / 2, totalH - 6);
}

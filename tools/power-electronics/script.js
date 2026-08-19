/* tools/power-electronics/script.js - 电力电子拓扑波形绘制 */

var currentTopo = 'buck';

/* ========== 拓扑描述 ========== */
var topoDesc = {
    buck: 'Buck（降压）变换器：V<sub>out</sub> = D × V<sub>in</sub>，电感电流连续（CCM）模式。显示开关管驱动信号、电感电流、输出电压纹波。',
    boost: 'Boost（升压）变换器：V<sub>out</sub> = V<sub>in</sub> / (1-D)，CCM 模式。显示开关管驱动信号、电感电流、输出节点电压。',
    buckboost: 'Buck-Boost（升降压）变换器：V<sub>out</sub> = -D/(1-D) × V<sub>in</sub>（反相），CCM 模式。',
    flyback: 'Flyback（反激）变换器：V<sub>out</sub> = D/(1-D) × V<sub>in</sub>/n，CCM 模式。显示原副边电流与磁化电流。'
};

/* ========== 初始化 ========== */
document.getElementById('vin').addEventListener('input', drawWave);
document.getElementById('iLoad').addEventListener('input', drawWave);
document.getElementById('ripple').addEventListener('input', drawWave);
selectTopo('buck');

/* ========== 拓扑切换 ========== */
function selectTopo(name) {
    currentTopo = name;
    document.querySelectorAll('.topo-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.topo === name);
    });
    document.getElementById('topoDesc').innerHTML = topoDesc[name] || '';
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
        ripplePct: parseFloat(document.getElementById('ripple').value) / 100 || 0.3
    };
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
        default:
            return { Vout: 0, gain: '-' };
    }
}

/* ========== 波形数据生成 ========== */
function getWaveforms(topo, D, Vin, IL, ripplePct) {
    var T = 1;  // 归一化为 1 个周期
    var pts = 200;
    var waveforms = [];

    var deltaI = IL * ripplePct;

    switch(topo) {
        case 'buck': {
            var Vout = D * Vin;
            var Vsw_data = [], IL_data = [];
            for (var i = 0; i <= pts; i++) {
                var t = i / pts;
                Vsw_data.push({ t: t, v: t < D ? Vin : 0 });
                var iL;
                if (t < D) {
                    // 上升：从 IL-ΔI/2 到 IL+ΔI/2
                    iL = (IL - deltaI/2) + (t / D) * deltaI;
                } else {
                    iL = (IL + deltaI/2) - ((t - D) / (1 - D)) * deltaI;
                }
                IL_data.push({ t: t, v: iL });
            }
            waveforms = [
                { label: 'V_SW (开关节点电压)', data: Vsw_data, color: '#3a5a8c', unit: 'V', ymax: Vin * 1.2, ymin: -1 },
                { label: 'I_L (电感电流)', data: IL_data, color: '#c0583a', unit: 'A', ymax: IL + deltaI, ymin: Math.max(0, IL - deltaI * 1.2) }
            ];
            break;
        }
        case 'boost': {
            var Vout = Vin / (1 - D);
            var VD_data = [], IL_data2 = [];
            for (var i = 0; i <= pts; i++) {
                var t = i / pts;
                // 二极管电压（导通时为 Vout，关断时近似 0）
                VD_data.push({ t: t, v: t < D ? 0 : Vout });
                var iL;
                if (t < D) {
                    iL = (IL - deltaI/2) + (t / D) * deltaI;
                } else {
                    iL = (IL + deltaI/2) - ((t - D) / (1 - D)) * deltaI;
                }
                IL_data2.push({ t: t, v: iL });
            }
            waveforms = [
                { label: 'V_D (二极管阳极电压)', data: VD_data, color: '#3a5a8c', unit: 'V', ymax: Vout * 1.2, ymin: -2 },
                { label: 'I_L (电感电流)', data: IL_data2, color: '#c0583a', unit: 'A', ymax: IL + deltaI, ymin: Math.max(0, IL - deltaI * 1.2) }
            ];
            break;
        }
        case 'buckboost': {
            var Vout = D / (1 - D) * Vin;
            var Vsw_bb = [], IL_bb = [];
            for (var i = 0; i <= pts; i++) {
                var t = i / pts;
                Vsw_bb.push({ t: t, v: t < D ? Vin + Vout : 0 });
                var iL;
                if (t < D) {
                    iL = deltaI/2 * (2*t/D - 1) + IL;
                } else {
                    iL = deltaI/2 * (1 - 2*(t-D)/(1-D)) + IL;
                }
                IL_bb.push({ t: t, v: Math.max(0, iL) });
            }
            waveforms = [
                { label: 'V_SW (开关节点)', data: Vsw_bb, color: '#3a5a8c', unit: 'V', ymax: (Vin+Vout)*1.15, ymin: -1 },
                { label: 'I_L (电感电流)', data: IL_bb, color: '#c0583a', unit: 'A', ymax: IL + deltaI, ymin: 0 }
            ];
            break;
        }
        case 'flyback': {
            var n = 1;
            var Vout = D / (1 - D) * Vin / n;
            var Ipri = [], Isec = [];
            var Ipk = IL / (1-D);
            var magRipple = Ipk * 0.4;
            for (var i = 0; i <= pts; i++) {
                var t = i / pts;
                var ip, is;
                if (t < D) {
                    // 一次侧导通：磁化电流线性上升
                    ip = (t / D) * (Ipk + magRipple/2) - magRipple/2;
                    ip = Math.max(0, ip);
                    is = 0;
                } else {
                    ip = 0;
                    // 二次侧导通：电流从峰值线性下降
                    is = Ipk * (1 - (t - D) / (1 - D));
                    is = Math.max(0, is);
                }
                Ipri.push({ t: t, v: ip });
                Isec.push({ t: t, v: is });
            }
            waveforms = [
                { label: 'I_pri (一次侧电流)', data: Ipri, color: '#3a5a8c', unit: 'A', ymax: (Ipk + magRipple) * 1.2, ymin: 0 },
                { label: 'I_sec (二次侧电流)', data: Isec, color: '#c0583a', unit: 'A', ymax: Ipk * 1.2, ymin: 0 }
            ];
            break;
        }
    }
    return waveforms;
}

/* ========== 主绘制函数 ========== */
function drawWave() {
    var p = getParams();
    var dc = calcDC(currentTopo, p.D, p.Vin, p.IL);
    var waveforms = getWaveforms(currentTopo, p.D, p.Vin, p.IL, p.ripplePct);

    // 更新直流显示
    var dcEl = document.getElementById('dcParams');
    dcEl.innerHTML =
        '<div class="dc-row"><span>V_out</span><span class="dc-val">' + dc.Vout.toFixed(2) + ' V</span></div>' +
        '<div class="dc-row"><span>公式</span><span class="dc-val" style="font-size:0.8rem;">' + dc.gain + '</span></div>' +
        '<div class="dc-row"><span>D</span><span class="dc-val">' + (p.D*100).toFixed(0) + '%</span></div>';

    // 绘制波形
    drawWaveCanvas('waveCanvas', waveforms, p.D);
}

/* ========== Canvas 绘制 ========== */
function drawWaveCanvas(canvasId, waveforms, D) {
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

        function xPos(t) { return PAD.left + t * cw; }
        function yPos(v) { return offsetY + PAD.top + (1 - (v - yMin) / (yMax - yMin)) * ch; }

        // 背景
        ctx.fillStyle = 'rgba(248,244,236,0.5)';
        ctx.fillRect(PAD.left, offsetY + PAD.top, cw, ch);

        // 占空比阴影
        ctx.fillStyle = 'rgba(58,90,140,0.08)';
        ctx.fillRect(PAD.left, offsetY + PAD.top, D * cw, ch);

        // 网格线
        ctx.strokeStyle = '#e8e2d8';
        ctx.lineWidth = 1;
        // Y 轴3条线
        [0.25, 0.5, 0.75].forEach(function(r) {
            var y = offsetY + PAD.top + r * ch;
            ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left+cw, y); ctx.stroke();
        });
        // X轴 D 线
        var xD = xPos(D);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#aaa';
        ctx.beginPath(); ctx.moveTo(xD, offsetY+PAD.top); ctx.lineTo(xD, offsetY+PAD.top+ch); ctx.stroke();
        ctx.setLineDash([]);

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
        ctx.fillText('D=' + (D*100).toFixed(0)+'%', xD, offsetY+PAD.top+ch+16);
        ctx.fillText('T', PAD.left+cw, offsetY+PAD.top+ch+16);

        // 波形标签
        ctx.fillStyle = wave.color;
        ctx.font = 'bold 12px Patrick Hand, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(wave.label, PAD.left+4, offsetY+PAD.top+14);

        // 绘制波形
        ctx.beginPath();
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        wave.data.forEach(function(pt, i) {
            var px = xPos(pt.t);
            var py = yPos(pt.v);
            py = Math.max(offsetY+PAD.top, Math.min(offsetY+PAD.top+ch, py));
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });
        ctx.stroke();
    });

    // 底部 X 轴说明
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '12px Patrick Hand, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('← 时间 (1 个开关周期 T) →', w / 2, totalH - 6);
}

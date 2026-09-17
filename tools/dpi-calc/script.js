/* DPI 计算：纯函数采用 SI 单位；UI 与计算分离，所有电路器件调用 Razavi。 */
(function (root) {
'use strict';
var TAU = 2 * Math.PI;
function z(re, im) { return { re: re, im: im || 0 }; }
function add(a, b) { return z(a.re + b.re, a.im + b.im); }
function mul(a, b) { return z(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
function div(a, b) {
    var d = b.re * b.re + b.im * b.im;
    if (!d) throw new Error('阻抗分母为零，当前理想模型存在奇点。');
    return z((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}
function parallel(a, b) { return div(mul(a, b), add(a, b)); }
function abs(a) { return Math.hypot(a.re, a.im); }
function dbmToW(dbm) {
    if (!Number.isFinite(dbm) || dbm < -300 || dbm > 300) throw new Error('功率请输入 −300～300 dBm 的有限数值。');
    return Math.pow(10, dbm / 10) * 1e-3;
}
function wToDbm(w) {
    if (!Number.isFinite(w) || w <= 0) throw new Error('线性功率必须为正数；0 mW 对应 −∞ dBm 的极限。');
    var dbm = 10 * Math.log10(w * 1e3);
    if (dbm < -300 || dbm > 300) throw new Error('线性功率超出本工具的 −300～300 dBm 数值范围。');
    return dbm;
}
function power(dbm, r0) {
    if (!Number.isFinite(r0) || r0 <= 0) throw new Error('参考阻抗必须为正数。');
    var w = dbmToW(dbm), rms = Math.sqrt(w * r0), pk = Math.SQRT2 * rms;
    return { w: w, rms: rms, pk: pk, pp: 2 * pk, sourcePk: 2 * pk, sourcePp: 4 * pk };
}
function block(p, f) {
    var w = TAU * f;
    if (!p.parasitic) return z(0, -1 / (w * p.cb));
    return add(z(p.esr, w * p.esl), div(z(1), z(1 / p.leak, w * p.cb)));
}
function ban(p, f) {
    var w = TAU * f;
    return parallel(z(p.rext, w * p.lb), z(p.rb, -1 / (w * p.cban)));
}
function impedances(p, f) {
    var zb = block(p, f), zd = z(p.rd, p.xd), zn = p.useBan ? ban(p, f) : null;
    var eq = zn ? parallel(zd, zn) : zd;
    return { block: zb, ban: zn, dut: zd, eq: eq, h: div(eq, add(z(p.r0), add(zb, eq))) };
}
function network(p, f) {
    var r = impedances(p, f), source = power(p.p, p.r0);
    r.vpk = source.sourcePk * abs(r.h);
    r.pdut = r.vpk * r.vpk / 2 * div(z(1), r.dut).re;
    return r;
}
function monitor(p, f) {
    var rp = p.rm * p.rin / (p.rm + p.rin), ct = p.cm + p.cin;
    return { ideal: 1 / (TAU * p.rm * p.cm), loaded: 1 / (TAU * rp * ct),
        h0: p.rin / (p.rm + p.rin), h: div(z(1), z(1 + p.rm / p.rin, TAU * f * p.rm * ct)), xl: TAU * f * p.lrf };
}
function srf(p) { return p.parasitic && p.esl > 0 ? 1 / (TAU * Math.sqrt(p.esl * p.cb)) : null; }
/* BAN 的零电纳点不等于阻抗幅值峰值；退化的全频实阻抗不标成孤立谐振。 */
function banZero(p) {
    if (!p.useBan) return null;
    var den = p.cban * p.lb * (p.lb - p.cban * p.rb * p.rb);
    var w2 = (p.lb - p.cban * p.rext * p.rext) / den;
    return den && Number.isFinite(w2) && w2 > 0 ? Math.sqrt(w2) / TAU : null;
}
var api = { dbmToW: dbmToW, wToDbm: wToDbm, power: power, block: block, ban: ban,
    impedances: impedances, network: network, monitor: monitor, srf: srf, banZero: banZero };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.DPI = api;
if (typeof document === 'undefined') return;

var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
function num(v) { return Number.isFinite(v) ? String(Number(v.toPrecision(6))) : '—'; }
function eng(v, unit) {
    if (!Number.isFinite(v)) return '—';
    if (v === 0) return '0 ' + unit;
    var ps = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'μ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
    for (var i = 0; i < ps.length; i++) if (Math.abs(v) >= ps[i][0]) return num(v / ps[i][0]) + ' ' + ps[i][1] + unit;
    return v.toExponential(4) + ' ' + unit;
}
function complex(v) { return num(v.re) + (v.im < 0 ? ' − j' : ' + j') + num(Math.abs(v.im)) + ' Ω'; }
function results(id, rows) {
    $(id).innerHTML = rows.map(function (r) { return '<div class="result-item"><span class="result-label">' + esc(r[0]) + '</span><span class="result-value">' + esc(r[1]) + '</span></div>'; }).join('');
}
var units = {
    freq: [['Hz', 1], ['kHz', 1e3], ['MHz', 1e6], ['GHz', 1e9]],
    res: [['Ω', 1], ['kΩ', 1e3], ['MΩ', 1e6]],
    cap: [['pF', 1e-12], ['nF', 1e-9], ['μF', 1e-6]],
    ind: [['nH', 1e-9], ['μH', 1e-6], ['mH', 1e-3]],
    dbm: [['dBm', 1]]
};
var defs = {}, groups = {};
function field(id, label, value, kind, scale, min, max, hint) {
    return { id: id, label: label, value: value, units: units[kind], scale: scale, min: min, max: max, hint: hint || '' };
}
function fields(container, list) {
    groups[container] = list.map(function (d) { return d.id; });
    $(container).innerHTML = list.map(function (d) {
        defs[d.id] = d;
        var unit = d.units.length === 1 ? '<span class="unit">' + esc(d.units[0][0]) + '</span>' :
            '<select id="unit-' + d.id + '" aria-label="' + esc(d.label + '单位') + '">' + d.units.map(function (u) {
                return '<option value="' + u[1] + '"' + (u[1] === d.scale ? ' selected' : '') + '>' + u[0] + '</option>';
            }).join('') + '</select>';
        return '<div class="field"><label for="dpi-' + d.id + '">' + esc(d.label) + '</label><div class="input-unit-row"><input type="number" id="dpi-' + d.id + '" step="any" value="' + d.value + '" min="' + d.min / d.scale + '" max="' + d.max / d.scale + '" aria-describedby="hint-' + d.id + '">' + unit + '</div><small id="hint-' + d.id + '">' + esc(d.hint) + '</small></div>';
    }).join('');
    list.forEach(function (d) {
        var input = $('dpi-' + d.id), select = $('unit-' + d.id);
        input.addEventListener('input', function () { d.id === 'convR' ? renderConvert() : update(); });
        if (select) select.addEventListener('change', function () {
            var next = Number(select.value), v = input.valueAsNumber;
            if (Number.isFinite(v)) input.value = String(Number((v * d.scale / next).toPrecision(15)));
            d.scale = next; input.min = d.min / next; input.max = d.max / next;
            d.id === 'convR' ? renderConvert() : update();
        });
    });
}
fields('rfFields', [
    field('f', '注入频率 f_DPI', 1, 'freq', 1e6, 1, 1e12, '默认 1 MHz；支持 1 Hz～1 THz 的数值估算'),
    field('p', '源可用功率 P_av', 37, 'dbm', 1, -300, 300, 'CW；与实际吸收功率分开显示'),
    field('r0', '源内阻 / 参考阻抗 R_0', 50, 'res', 1, 1e-6, 1e12, 'R_s = R_0；论文为 50 Ω')
]);
fields('blockFields', [field('cb', '隔直电容 C_block', 6.8, 'cap', 1e-9, 1e-18, 1, '论文 6.8 nF / 0805')]);
fields('parasiticFields', [
    field('esr', 'ESR', .1, 'res', 1, 0, 1e12, '演示值；可取 0'),
    field('esl', 'ESL', 1, 'ind', 1e-9, 0, 1e3, '演示值；可取 0，此时无自谐振'),
    field('leak', '泄漏电阻 R_leak', 100, 'res', 1e6, 1e-6, 1e15, '演示值；仅与 C 并联')
]);
fields('banFields', [
    field('lb', 'L_BAN', 5, 'ind', 1e-6, 1e-15, 1e3, '论文典型值 5 μH'),
    field('rb', 'R_BAN', 150, 'res', 1, 1e-6, 1e12, '与 C_BAN 串联接地'),
    field('cban', 'C_BAN', 6.8, 'cap', 1e-9, 1e-18, 1, '论文典型值 6.8 nF'),
    field('rext', 'BAN 外部终端 R_ext', 0, 'res', 1, 0, 1e12, '演示假设：0 Ω 为理想电源的交流地')
]);
fields('dutFields', [
    field('rd', 'DUT 阻抗实部 R_DUT', 50, 'res', 1, 1e-6, 1e12, '演示假设，不是论文的 DUT 数据；必须 > 0'),
    field('xd', 'DUT 阻抗虚部 X_DUT', 0, 'res', 1, -1e12, 1e12, '正值感性、负值容性；扫频时保持常数')
]);
fields('monitorFields', [
    field('rm', '监测串联电阻 R_M', 10, 'res', 1e3, 1e-6, 1e12, '正文 10 kΩ / Fig.5 为 150 kΩ'),
    field('cm', '监测电容 C_M', 10, 'cap', 1e-9, 1e-18, 1, '论文典型值 10 nF'),
    field('rin', '示波器输入电阻 R_in', 1, 'res', 1e6, 1e-6, 1e15, '论文典型值 1 MΩ'),
    field('cin', '示波器输入电容 C_in', 10, 'cap', 1e-12, 0, 1, '论文典型值 10 pF；可取 0'),
    field('lrf', '输入驱动隔离 L_RF_BLOCK', 5, 'ind', 1e-6, 0, 1e3, 'II-F 典型值 5 μH')
]);
fields('sweepFields', [
    field('flo', '扫频起点', 1, 'freq', 1e6, 1, 1e12),
    field('fhi', '扫频终点', 1000, 'freq', 1e6, 1, 1e12)
]);
fields('convertFields', [field('convR', '匹配负载 / 源内阻 R_0', 50, 'res', 1, 1e-6, 1e12, '只影响电压，不影响 dBm ↔ mW')]);
function raw(id) { return $('dpi-' + id).valueAsNumber * defs[id].scale; }
function read(ids) {
    var p = {}, errors = [];
    ids.forEach(function (id) {
        var d = defs[id], v = raw(id), ok = Number.isFinite(v) && v >= d.min && v <= d.max;
        $('dpi-' + id).setAttribute('aria-invalid', String(!ok));
        if (!ok) errors.push(d.label + '：请输入 ' + num(d.min / d.scale) + '～' + num(d.max / d.scale) + ' ' + d.units.filter(function (u) { return u[1] === d.scale; })[0][0]);
        p[id] = v;
    });
    if (errors.length) throw new Error(errors.join('；'));
    return p;
}
function netParams(withPower, withFrequency) {
    var ids = ['r0', 'cb', 'rd', 'xd'];
    if (withPower) ids.push('p');
    if (withFrequency) ids.push('f');
    var parasitic = $('blockModel').value === 'parasitic', useBan = $('useBan').checked;
    if (parasitic) ids = ids.concat(groups.parasiticFields);
    if (useBan) ids = ids.concat(groups.banFields);
    return Object.assign(read(ids), { parasitic: parasitic, useBan: useBan });
}
function setValue(id, si) { $('dpi-' + id).value = String(Number((si / defs[id].scale).toPrecision(15))); }
function attempt(errorId, resultId, fn) {
    try { fn(); $(errorId).textContent = ''; }
    catch (e) { $(errorId).textContent = e.message; results(resultId, [['当前结果', '— 参数无效，请检查输入']]); }
}
function powerRows(v) {
    return [['可用功率 P_av', eng(v.w, 'W')], ['理想源开路 V_s,pk', eng(v.sourcePk, 'V')], ['理想源开路 V_s,pp', eng(v.sourcePp, 'V')],
        ['匹配负载 V_L,pk', eng(v.pk, 'V')], ['匹配负载 V_L,pp', eng(v.pp, 'V')], ['匹配负载 V_L,rms', eng(v.rms, 'V')]];
}
function update() {
    var parasitic = $('blockModel').value === 'parasitic';
    $('parasiticFields').hidden = !parasitic;
    ['parasiticFields', 'banFields'].forEach(function (id) {
        var enabled = id === 'banFields' ? $('useBan').checked : parasitic;
        $(id).querySelectorAll('input, select').forEach(function (el) { el.disabled = !enabled; if (!enabled) el.removeAttribute('aria-invalid'); });
    });
    attempt('rfError', 'rfResults', function () {
        var p = read(['p', 'r0']); results('rfResults', powerRows(power(p.p, p.r0)));
    });
    attempt('networkError', 'networkResults', function () {
        var p = netParams(true, true), n = network(p, p.f);
        results('networkResults', [['Z_block（复阻抗）', complex(n.block)], ['|Z_block|', eng(abs(n.block), 'Ω')],
            ['|Z_BAN|（DUT 端看入）', n.ban ? eng(abs(n.ban), 'Ω') : '未接入'], ['|Z_eq|', eng(abs(n.eq), 'Ω')],
            ['分压 |V_DUT / V_s|', num(abs(n.h)) + ' V/V'], ['分压相位', num(Math.atan2(n.h.im, n.h.re) * 180 / Math.PI) + '°'],
            ['DUT 端 V_pk / V_pp', eng(n.vpk, 'V') + ' / ' + eng(2 * n.vpk, 'V')], ['DUT 端 V_rms', eng(n.vpk / Math.SQRT2, 'V')],
            ['DUT 吸收功率', eng(n.pdut, 'W')], ['DUT 吸收功率 / dBm', n.pdut > 0 ? num(10 * Math.log10(n.pdut * 1e3)) + ' dBm' : '0 W（−∞ dBm 极限）']]);
    });
    attempt('monitorError', 'monitorResults', function () {
        var p = read(groups.monitorFields.concat(['f'])), m = monitor(p, p.f);
        results('monitorResults', [['理想 RC 截止频率', eng(m.ideal, 'Hz')], ['带示波器负载截止频率', eng(m.loaded, 'Hz')],
            ['DC 增益 H_0', num(m.h0) + ' V/V'], ['f_DPI 处 |H_M|', num(abs(m.h)) + ' V/V'],
            ['f_DPI 处监测增益', num(20 * Math.log10(abs(m.h))) + ' dB'], ['|Z_RF_BLOCK|', eng(m.xl, 'Ω')]]);
    });
    drawSchematics(); renderSweep();
}

/* 所有 R/C/L/源/地/端口来自现有 Razavi；矩形仅用于系统功能块。 */
var ink = 'var(--color-text)', accent = 'var(--color-primary)';
var svgOpts = { stroke: ink, textColor: ink, font: 'Arial, Microsoft YaHei, sans-serif' };
function comp(type, x, y, rot) { return Razavi.itemSvg({ kind: 'comp', type: type, x: x, y: y, rot: rot || 0 }, svgOpts); }
function wire() {
    return Razavi.itemSvg({ kind: 'wire', pts: Array.prototype.map.call(arguments, function (p) { return { x: p[0], y: p[1] }; }) }, svgOpts);
}
function text(x, y, s, anchor, color) { return Razavi.itemSvg({ kind: 'label', x: x, y: y, text: s, size: 13, anchor: anchor || 'middle', stroke: color || ink }, svgOpts); }
function ground(x, y) { return comp('ground', x, y + 10); }
function dot(x, y) { return comp('dot', x, y); }
function box(x, y, w, h, label, target) {
    return '<g' + (target ? ' data-focus="' + target + '" tabindex="0" role="button" aria-label="' + esc('定位参数：' + label) + '"' : '') + '><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4" style="fill:var(--color-card-bg);stroke:var(--color-text)" stroke-width="1.5"/>' + text(x + w / 2, y + h / 2 + 5, label) + '</g>';
}
function figure(id, w, h, body) { $(id).innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '"><title>' + esc($(id).getAttribute('aria-label')) + '</title>' + body + '</svg>'; }
function labelValue(id, unit) {
    var d = defs[id], v = raw(id);
    return Number.isFinite(v) && v >= d.min && v <= d.max ? (unit === 'dBm' ? num(v) + ' dBm' : eng(v, unit)) : '—';
}
function drawSchematics() {
    if (!root.Razavi) {
        ['benchFigure', 'blockFigure', 'banFigure', 'injectionFigure', 'monitorFigure'].forEach(function (id) { $(id).textContent = '器件库未加载，请检查 razavi 脚本路径。'; });
        return;
    }
    // 完整测试台按 Fig.6 的五个 DUT 引脚组织，监测支路不穿过 BAN。
    var s = box(410, 145, 180, 200, 'DUT') + text(450, 164, 'VDD') + text(438, 233, 'IN') + text(500, 329, 'GND') + text(560, 204, 'OUT1') + text(560, 284, 'OUT2');
    s += comp('voltage-source', 80, 100) + text(80, 48, '电池 / DC') + wire([80, 80], [80, 70], [180, 70]);
    s += box(180, 50, 120, 40, 'BAN · 电源', 'ban') + wire([300, 70], [450, 70], [450, 145]) + wire([240, 90], [240, 115]) + ground(240, 115) + ground(80, 120);
    s += comp('voltage-source', 80, 270) + text(80, 218, '同板驱动') + wire([80, 250], [80, 230], [180, 230]);
    s += box(180, 210, 150, 40, 'L_RF_BLOCK', 'monitor') + wire([330, 230], [410, 230]) + ground(80, 290) + text(255, 275, labelValue('lrf', 'H'));
    s += wire([500, 345], [500, 378]) + ground(500, 378);
    s += wire([590, 200], [675, 200], [720, 200]) + dot(675, 200) + box(720, 180, 100, 40, 'BAN · OUT1', 'ban');
    s += wire([770, 220], [770, 238]) + ground(770, 238) + wire([820, 200], [920, 200], [920, 230]) + comp('resistor', 920, 250) + ground(920, 270) + text(920, 180, '线束负载');
    s += box(610, 35, 130, 40, 'RF 源 + R_s', 'rf') + box(610, 105, 130, 40, '隔直 C_block', 'block');
    s += wire([675, 75], [675, 105]) + wire([675, 145], [675, 200]) + text(815, 62, labelValue('p', 'dBm'), 'start') + text(815, 88, labelValue('f', 'Hz'), 'start');
    s += wire([590, 280], [650, 280], [720, 280]) + dot(650, 280) + wire([650, 280], [650, 340]) + comp('resistor', 650, 360) + ground(650, 380) + text(700, 375, '同板负载');
    s += box(720, 260, 110, 40, 'R_M / C_M', 'monitor') + wire([775, 300], [775, 320]) + ground(775, 320);
    s += wire([830, 280], [850, 280]) + box(850, 260, 100, 40, '示波器', 'monitor') + wire([900, 300], [900, 330]) + ground(900, 330);
    figure('benchFigure', 1000, 425, s);

    if ($('blockModel').value === 'parasitic') {
        s = text(35, 92, 'RF侧', 'start') + wire([80, 90], [110, 90]) + comp('resistor', 130, 90, 1) + text(130, 58, 'ESR ' + labelValue('esr', 'Ω'));
        s += wire([150, 90], [230, 90]) + comp('inductor-compact', 250, 90, 1) + text(250, 58, 'ESL ' + labelValue('esl', 'H'));
        s += wire([270, 90], [330, 90], [390, 90]) + comp('capacitor', 410, 90, 1) + wire([430, 90], [510, 90], [600, 90]);
        s += text(420, 58, 'C ' + labelValue('cb', 'F')) + dot(330, 90) + dot(510, 90);
        s += wire([330, 90], [330, 155], [390, 155]) + comp('resistor', 410, 155, 1) + wire([430, 155], [510, 155], [510, 90]);
        s += text(410, 191, 'R_leak ' + labelValue('leak', 'Ω')) + text(605, 94, 'DUT侧', 'start');
    } else {
        s = text(80, 94, 'RF侧') + wire([110, 90], [310, 90]) + comp('capacitor', 330, 90, 1) + wire([350, 90], [570, 90]) + text(620, 94, 'DUT侧');
        s += text(330, 57, 'C_block = ' + labelValue('cb', 'F')) + text(330, 150, '理想模式：不包含 ESR / ESL / 漏电支路');
    }
    figure('blockFigure', 700, 220, s);

    s = text(120, 32, '外部端口 E') + comp('resistor', 120, 155) + text(40, 195, 'R_ext ' + labelValue('rext', 'Ω'), 'start') + ground(120, 175);
    s += wire([120, 135], [120, 75], [250, 75]) + comp('inductor-compact', 270, 75, 1) + wire([290, 75], [390, 75], [600, 75]);
    s += dot(390, 75) + wire([390, 75], [390, 95]) + comp('resistor', 390, 115) + wire([390, 135], [390, 160]) + comp('capacitor', 390, 180) + ground(390, 200);
    s += text(270, 45, 'L_BAN ' + labelValue('lb', 'H')) + text(420, 119, 'R_BAN ' + labelValue('rb', 'Ω'), 'start') + text(420, 184, 'C_BAN ' + labelValue('cban', 'F'), 'start');
    s += text(610, 79, 'DUT端 D', 'start') + text(390, 250, $('useBan').checked ? '交流等效：E端由 R_ext 对参考地终接' : '当前计算未接入 BAN（上图仅说明连接）');
    figure('banFigure', 750, 280, s);

    s = comp('voltage-source', 65, 130) + ground(65, 150) + text(65, 195, 'v_s') + wire([65, 110], [65, 70], [130, 70]) + comp('resistor', 150, 70, 1) + text(150, 43, 'R_0');
    s += wire([170, 70], [230, 70]) + box(230, 50, 105, 40, 'Z_block', 'block') + wire([335, 70], [430, 70], [430, 120]);
    s += box(385, 120, 90, 40, 'Z_DUT', 'ban') + wire([430, 160], [430, 190]) + ground(430, 190) + text(430, 43, 'OUT1 / V_DUT', 'start');
    if ($('useBan').checked) s += dot(430, 70) + wire([430, 70], [620, 70], [620, 120]) + box(570, 120, 100, 40, 'Z_BAN', 'ban') + wire([620, 160], [620, 190]) + ground(620, 190);
    figure('injectionFigure', 740, 230, s);

    s = text(40, 74, 'OUT2', 'start') + wire([90, 70], [150, 70]) + comp('resistor', 170, 70, 1) + text(170, 40, 'R_M ' + labelValue('rm', 'Ω'));
    s += wire([190, 70], [300, 70], [480, 70], [620, 70], [710, 70]) + text(715, 74, '监测', 'start');
    [300, 480, 620].forEach(function (x) { s += dot(x, 70) + wire([x, 70], [x, 115]) + wire([x, 155], [x, 190]) + ground(x, 190); });
    s += comp('capacitor', 300, 135) + comp('resistor', 480, 135) + comp('capacitor', 620, 135);
    s += text(300, 230, 'C_M ' + labelValue('cm', 'F')) + text(480, 230, 'R_in ' + labelValue('rin', 'Ω')) + text(650, 255, 'C_in ' + labelValue('cin', 'F'));
    figure('monitorFigure', 770, 285, s);
}

var chartData = null;
function renderSweep() {
    try {
        var p = netParams(false, false), range = read(['flo', 'fhi']);
        if (range.flo >= range.fhi) throw new Error('扫频起点必须小于终点。');
        var lo = Math.log10(range.flo), span = Math.log10(range.fhi) - lo, points = [];
        for (var i = 0; i <= 600; i++) {
            var f = Math.pow(10, lo + span * i / 600), n = impedances(p, f);
            points.push({ f: f, block: abs(n.block), ban: n.ban ? abs(n.ban) : null, eq: abs(n.eq) });
        }
        var fs = srf(p), fb = banZero(p), msg = [];
        if (fs) msg.push('隔直电容忽略漏电的近似自谐振：' + eng(fs, 'Hz') + (fs < range.flo || fs > range.fhi ? '（在当前范围外）' : '（点划线）') + '。');
        else msg.push('当前隔直模型没有有限自谐振点（理想电容或 ESL = 0）。');
        if (fb) msg.push('当前终端条件下 BAN 零电纳点：' + eng(fb, 'Hz') + '；不等同于 |Z| 峰值' + (fb < range.flo || fb > range.fhi ? '，在当前范围外。' : '（点划线）。'));
        else msg.push(p.useBan ? '当前终端与 RLC 参数下，BAN 无孤立的有限频率零电纳点。' : 'BAN 未接入，已隐藏其曲线。');
        $('resonanceInfo').textContent = msg.join(' ');
        var snapshot = ['隔直模型：' + (p.parasitic ? '含 ESR / ESL / R_leak' : '理想'), 'BAN：' + (p.useBan ? '接入' : '未接入')];
        Object.keys(p).forEach(function (id) { if (defs[id]) snapshot.push(defs[id].label + ' = ' + num(p[id]) + '（SI）'); });
        $('sweepSummary').textContent = snapshot.join('\n');
        $('sweepError').textContent = '';
        chartData = { points: points, lo: range.flo, hi: range.fhi, fs: fs, fb: fb };
    } catch (e) {
        $('sweepError').textContent = e.message;
        $('resonanceInfo').textContent = '参数无效，频响与标记已清空。';
        $('sweepSummary').textContent = '—'; chartData = null;
    }
    drawChart();
}
function drawChart() {
    var canvas = $('impedanceChart'), rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    var w = Math.max(240, rect.width), h = rect.height || 380, dpr = Math.min(root.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var style = getComputedStyle(document.documentElement), color = function (key) { return style.getPropertyValue(key).trim(); };
    var fg = color('--color-text-secondary'), grid = color('--color-border'), blue = color('--color-primary'), orange = color('--color-accent');
    ctx.clearRect(0, 0, w, h); ctx.font = '12px Arial'; ctx.fillStyle = fg;
    if (!chartData) { ctx.fillText('参数无效，请检查输入。', 20, 35); return; }
    var data = chartData, values = [], series = [{ key: 'block', color: blue, dash: [] }, { key: 'ban', color: orange, dash: [9, 5] }, { key: 'eq', color: fg, dash: [3, 4] }];
    data.points.forEach(function (pt) { series.forEach(function (s) { var v = pt[s.key]; if (Number.isFinite(v) && v > 0) values.push(Math.log10(v)); }); });
    var min = Math.floor(Math.min.apply(null, values)), max = Math.ceil(Math.max.apply(null, values));
    if (min === max) { min--; max++; }
    var left = w < 450 ? 55 : 72, right = w - 18, top = 35, bottom = h - 50;
    var logLo = Math.log10(data.lo), logHi = Math.log10(data.hi);
    function x(f) { return left + (Math.log10(f) - logLo) / (logHi - logLo) * (right - left); }
    function y(logv) { return bottom - (logv - min) / (max - min) * (bottom - top); }
    ctx.lineWidth = .7; ctx.strokeStyle = grid;
    var yStep = Math.max(1, Math.ceil((max - min) / 7));
    for (var j = min; j <= max; j += yStep) {
        ctx.beginPath(); ctx.moveTo(left, y(j)); ctx.lineTo(right, y(j)); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText('1e' + j, left - 8, y(j) + 4);
    }
    var ticks = w < 450 ? 3 : 6;
    for (var k = 0; k <= ticks; k++) {
        var freq = Math.pow(10, logLo + (logHi - logLo) * k / ticks), xp = x(freq);
        ctx.beginPath(); ctx.moveTo(xp, top); ctx.lineTo(xp, bottom); ctx.stroke();
        ctx.textAlign = k === 0 ? 'left' : (k === ticks ? 'right' : 'center'); ctx.fillText(eng(freq, ''), xp, bottom + 20);
    }
    ctx.textAlign = 'left'; ctx.fillText('|Z| / Ω', 8, 17); ctx.textAlign = 'right'; ctx.fillText('f / Hz（log）', right, h - 5);
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
    series.forEach(function (s) {
        ctx.beginPath(); ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash(s.dash); var started = false;
        data.points.forEach(function (pt) {
            var v = pt[s.key];
            if (!Number.isFinite(v) || v <= 0) { started = false; return; }
            var xp = x(pt.f), yp = y(Math.log10(v));
            if (started) ctx.lineTo(xp, yp); else ctx.moveTo(xp, yp);
            started = true;
        }); ctx.stroke();
    });
    ctx.restore();
    var markers = [{ f: raw('f'), label: 'f_DPI', color: fg }, { f: data.fs, label: 'SRF≈', color: blue }, { f: data.fb, label: 'BAN B=0', color: orange }];
    markers.forEach(function (m, index) {
        if (!(m.f >= data.lo && m.f <= data.hi)) return;
        var xp = x(m.f); ctx.strokeStyle = m.color; ctx.setLineDash([6, 3, 1, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xp, top); ctx.lineTo(xp, bottom); ctx.stroke();
        ctx.fillStyle = m.color; ctx.textAlign = xp > w * .7 ? 'right' : 'left'; ctx.fillText(m.label, xp, 14 + index * 13);
    });
    ctx.setLineDash([]);
}

/* 双向换算：以最近编辑的功率字段为准，阻抗变化不反复舍入功率。 */
var convertDirection = 'dbm', convertW = null, linearScale = .001;
function syncConvert(direction) {
    convertDirection = direction || convertDirection;
    $('applyStatus').textContent = '';
    try {
        if (convertDirection === 'dbm') {
            convertW = dbmToW($('convertDbm').valueAsNumber);
            $('convertLinear').value = String(Number((convertW / linearScale).toPrecision(15)));
        } else {
            var w = $('convertLinear').valueAsNumber * linearScale;
            var dbm = wToDbm(w); convertW = w;
            $('convertDbm').value = String(Number(dbm.toPrecision(15)));
        }
        $('convertDbm').setAttribute('aria-invalid', 'false'); $('convertLinear').setAttribute('aria-invalid', 'false');
        renderConvert();
    } catch (e) {
        convertW = null;
        var input = convertDirection === 'dbm' ? $('convertDbm') : $('convertLinear');
        var other = convertDirection === 'dbm' ? $('convertLinear') : $('convertDbm');
        input.setAttribute('aria-invalid', 'true'); other.value = ''; other.setAttribute('aria-invalid', 'false');
        $('convertError').textContent = e.message; results('convertResults', [['当前结果', '— 参数无效']]); $('applyPower').disabled = true;
    }
}
function renderConvert() {
    $('applyStatus').textContent = '';
    if (convertW === null) return;
    try {
        var r = read(['convR']).convR, dbm = wToDbm(convertW), p = power(dbm, r);
        results('convertResults', [['功率 / dBm', num(dbm) + ' dBm'], ['功率 / W', num(convertW) + ' W'], ['功率 / mW', num(convertW * 1e3) + ' mW'], ['功率 / μW', num(convertW * 1e6) + ' μW']].concat(powerRows(p).slice(1)));
        $('convertError').textContent = ''; $('applyPower').disabled = false;
    } catch (e) { $('convertError').textContent = e.message; results('convertResults', [['当前结果', '— 参数无效']]); $('applyPower').disabled = true; }
}
$('convertDbm').addEventListener('input', function () { syncConvert('dbm'); });
$('convertLinear').addEventListener('input', function () { syncConvert('linear'); });
$('convertUnit').addEventListener('change', function () {
    var next = Number(this.value), current = $('convertLinear').valueAsNumber;
    if (Number.isFinite(current)) $('convertLinear').value = String(Number((current * linearScale / next).toPrecision(15)));
    linearScale = next; syncConvert();
});
$('applyPower').addEventListener('click', function () {
    if (convertW === null) return;
    try {
        var r = read(['convR']).convR;
        setValue('p', wToDbm(convertW)); setValue('r0', r); update();
        $('applyStatus').textContent = '已应用到拓扑参数，其他网络参数保持不变。';
    } catch (e) { $('applyStatus').textContent = e.message; }
});
$('powerTable').innerHTML = [-30, -10, 0, 10, 20, 30, 37, 40].map(function (dbm) {
    var p = power(dbm, 50); return '<tr><td>' + dbm + '</td><td>' + num(p.w * 1e3) + '</td><td>' + num(p.rms) + '</td><td>' + num(p.pp) + '</td></tr>';
}).join('');

function switchTab(name, focus) {
    ['bench', 'response', 'convert'].forEach(function (key) {
        var active = key === name, btn = $('tab-' + key);
        $('panel-' + key).hidden = !active; btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active)); btn.tabIndex = active ? 0 : -1;
    });
    if (focus) $('tab-' + name).focus();
    if (name === 'response') drawChart();
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
function focusParams(target) {
    switchTab('bench'); var card = $('params-' + target);
    if (card) { card.focus({ preventScroll: true }); card.scrollIntoView({ block: 'start' }); }
}
document.querySelector('main').addEventListener('click', function (e) {
    var target = e.target.closest('[data-focus]'); if (target) focusParams(target.dataset.focus);
});
document.querySelector('main').addEventListener('keydown', function (e) {
    var target = e.target.closest('[data-focus]');
    if (target && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); focusParams(target.dataset.focus); }
});
$('showResponse').addEventListener('click', function () { switchTab('response', true); });
$('editParams').addEventListener('click', function () { focusParams('ban'); });
$('blockModel').addEventListener('change', update);
$('useBan').addEventListener('change', update);
$('monitorText').addEventListener('click', function () { setValue('rm', 1e4); update(); });
$('monitorFigurePreset').addEventListener('click', function () { setValue('rm', 150e3); update(); });
var initial = {};
Object.keys(defs).forEach(function (id) { initial[id] = defs[id].value * defs[id].scale; });
$('resetBench').addEventListener('click', function () {
    Object.keys(initial).forEach(function (id) { if (id !== 'convR') setValue(id, initial[id]); });
    $('blockModel').value = 'ideal'; $('useBan').checked = true; update();
});
var resizeFrame;
root.addEventListener('resize', function () { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(drawChart); });
new MutationObserver(drawChart).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
update(); syncConvert('dbm');
})(typeof window !== 'undefined' ? window : globalThis);

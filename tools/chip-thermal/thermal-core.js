/* 芯片发热估算：纯数值层。热阻表与二维等效模型使用不同的、明确标注的口径。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ThermalCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function finite(v, name) {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error((name || '结果') + '：数值超范围或无效');
        return v;
    }
    function positive(v, name) {
        finite(v, name);
        if (!(v > 0)) throw new Error(name + '须大于 0');
        return v;
    }
    function nonnegative(v, name) {
        finite(v, name);
        if (v < 0) throw new Error(name + '不能为负数');
        return v;
    }
    function temperature(v, name) {
        finite(v, name);
        if (v <= -273.15) throw new Error(name + '须高于绝对零度');
        return v;
    }
    function number(raw, factor) {
        var s = String(raw).trim();
        if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) throw new Error('请输入完整数值（可用科学计数法），单位请用下拉框选择');
        return finite(Number(s) * (factor === undefined ? 1 : positive(factor, '单位因子')), '输入');
    }
    function convert(raw, oldFactor, newFactor) {
        return String(Number(finite(number(raw, oldFactor) / positive(newFactor, '单位因子'), '单位换算').toPrecision(14)));
    }
    function series(raw, factor, kind) {
        var parts = String(raw).trim().split(/[\s,，]+/);
        if (!String(raw).trim() || parts.length > 50) throw new Error('序列须包含 1～50 个数值');
        var values = parts.map(function (s) {
            var v = number(s, factor);
            return kind === 'temperature' ? temperature(v, '结温') : nonnegative(v, '电流');
        });
        return Array.from(new Set(values)).sort(function (a, b) { return a - b; });
    }
    function resistanceAt(r25, tcr, t) {
        positive(r25, '25℃ 导通电阻'); finite(tcr, 'TCR'); temperature(t, '温度');
        return positive(r25 * (1 + tcr / 100 * (t - 25)), '温度修正电阻（线性模型失效）');
    }
    function conduction(r25, tcr, theta, ambient, current) {
        positive(theta, '热阻'); nonnegative(current, '电流');
        var ra = resistanceAt(r25, tcr, ambient), a = tcr / 100;
        var g = finite(theta * current * current * r25 * a, '热反馈系数');
        var critical = a > 0 ? finite(1 / Math.sqrt(theta * r25 * a), '临界电流') : null;
        if (g >= 1) return { status: 'runaway', g: g, critical: critical };
        var resistance = positive(ra / (1 - g), '最终电阻');
        var power = finite(current * current * resistance, '功耗');
        return { status: 1 - g < 0.05 ? 'sensitive' : 'ok', resistance: resistance, power: power,
            temperature: finite(ambient + theta * power, '稳态结温'), g: g, critical: critical };
    }
    function maxCurrent(r25, tcr, theta, ambient, limit) {
        positive(theta, '热阻'); resistanceAt(r25, tcr, ambient); temperature(limit, '允许结温');
        if (limit < ambient) return { status: 'ambient-over-limit' };
        var resistance = resistanceAt(r25, tcr, limit);
        var power = finite((limit - ambient) / theta, '允许功耗');
        return { status: 'ok', resistance: resistance, power: power, current: finite(Math.sqrt(power / resistance), '允许电流') };
    }
    function constantDrop(voltage, theta, ambient, current) {
        nonnegative(voltage, '压降幅值'); positive(theta, '热阻'); temperature(ambient, '环境温度'); nonnegative(current, '电流');
        var power = finite(voltage * current, '主管功耗');
        return { power: power, temperature: finite(ambient + theta * power, '稳态结温') };
    }
    function dimensions(area, aspect) {
        positive(area, '面积'); positive(aspect, '长宽比');
        var width = positive(Math.sqrt(area) * Math.sqrt(aspect), '长度');
        return { width: width, height: positive(area / width, '宽度') };
    }
    function geometry(c) {
        var die = dimensions(c.area, c.aspect), n = c.n;
        if (!Number.isInteger(n) || n < 4 || n > 128) throw new Error('网格须为 4～128 的整数');
        positive(c.thickness, '厚度'); positive(c.diffusivity, '热扩散率'); positive(c.heatCapacity, '体积热容'); positive(c.theta, '热阻');
        if (!Array.isArray(c.sources) || c.sources.length < 1 || c.sources.length > 8) throw new Error('须有 1～8 个热源，首项为主管');
        var rects = [];
        c.sources.forEach(function (s, index) {
            if (index !== 0 && !s.enabled) return;
            var d = dimensions(s.area, s.aspect), name = index === 0 ? '主管' : '热源 ' + (index + 1);
            finite(s.x, name + ' X'); finite(s.y, name + ' Y'); nonnegative(s.power, name + '功耗');
            var left = s.x * die.width - d.width / 2, bottom = s.y * die.height - d.height / 2;
            var epsX = die.width * 1e-12, epsY = die.height * 1e-12;
            if (left < -epsX || bottom < -epsY || left + d.width > die.width + epsX || bottom + d.height > die.height + epsY) throw new Error(name + '超出芯片边界');
            if (d.width < 2 * die.width / n - epsX || d.height < 2 * die.height / n - epsY) throw new Error(name + '小于两个网格单元，请提高网格或调整模型');
            var rect = { index: index, name: typeof s.name === 'string' ? s.name.slice(0, 60) : name,
                left: left, bottom: bottom, width: d.width, height: d.height, area: s.area, power: s.power };
            rects.forEach(function (r) {
                var ox = Math.min(left + d.width, r.left + r.width) - Math.max(left, r.left);
                var oy = Math.min(bottom + d.height, r.bottom + r.height) - Math.max(bottom, r.bottom);
                if (ox > epsX && oy > epsY) throw new Error(name + '与热源 ' + (r.index + 1) + '重叠');
            });
            rects.push(rect);
        });
        return { width: die.width, height: die.height, n: n, dx: die.width / n, dy: die.height / n, rects: rects };
    }
    // 散热标定只与主管几何及材料有关；附加源不得改变此键。
    function modelKey(c) {
        var s = c.sources[0];
        return JSON.stringify([c.area, c.aspect, c.thickness, c.diffusivity, c.heatCapacity, c.theta, c.n, s.area, s.aspect, s.x, s.y]);
    }
    function overlapArea(g, r, x, y) {
        var w = Math.max(0, Math.min((x + 1) * g.dx, r.left + r.width) - Math.max(x * g.dx, r.left));
        var h = Math.max(0, Math.min((y + 1) * g.dy, r.bottom + r.height) - Math.max(y * g.dy, r.bottom));
        return w * h;
    }
    // 返回 W/m²；使用实际交叠面积而非单元中心判断，保证热源总功率守恒。
    function raster(g, rects) {
        var q = new Float64Array(g.n * g.n), cellArea = positive(g.dx * g.dy, '单元面积');
        rects.forEach(function (r) {
            var density = finite(r.power / r.area, '功率密度');
            for (var y = 0; y < g.n; y++) for (var x = 0; x < g.n; x++) {
                q[y * g.n + x] += density * overlapArea(g, r, x, y) / cellArea;
            }
        });
        return q;
    }
    function basis(n) {
        var b = new Float64Array(n * n);
        for (var k = 0; k < n; k++) for (var x = 0; x < n; x++) {
            b[k * n + x] = Math.sqrt((k === 0 ? 1 : 2) / n) * Math.cos(Math.PI * k * (x + 0.5) / n);
        }
        return b;
    }
    function transform(data, n, b, inverse) {
        var tmp = new Float64Array(n * n), out = new Float64Array(n * n), y, x, k, sum;
        if (!inverse) {
            for (y = 0; y < n; y++) for (k = 0; k < n; k++) {
                sum = 0;
                for (x = 0; x < n; x++) sum += b[k * n + x] * data[y * n + x];
                tmp[y * n + k] = sum;
            }
            for (k = 0; k < n; k++) for (x = 0; x < n; x++) {
                sum = 0;
                for (y = 0; y < n; y++) sum += b[k * n + y] * tmp[y * n + x];
                out[k * n + x] = sum;
            }
        } else {
            for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
                sum = 0;
                for (k = 0; k < n; k++) sum += b[k * n + y] * data[k * n + x];
                tmp[y * n + x] = sum;
            }
            for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
                sum = 0;
                for (k = 0; k < n; k++) sum += b[k * n + x] * tmp[y * n + k];
                out[y * n + x] = sum;
            }
        }
        return out;
    }
    function modalSteady(model, modes, beta) {
        var coeff = new Float64Array(modes.length);
        for (var i = 0; i < coeff.length; i++) coeff[i] = modes[i] / (model.rates[i] + beta);
        return transform(coeff, model.n, model.basis, true);
    }
    function peak(values) {
        var p = -Infinity;
        for (var i = 0; i < values.length; i++) p = Math.max(p, finite(values[i], '热图温升'));
        return p;
    }
    function createModel(c) {
        var g = geometry(c), n = g.n, capacity = positive(c.heatCapacity * c.thickness, '面热容');
        var m = { key: modelKey(c), n: n, geometry: g, basis: basis(n), rates: new Float64Array(n * n), capacity: capacity };
        for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
            var lx = 4 * Math.pow(Math.sin(Math.PI * x / (2 * n)), 2) / (g.dx * g.dx);
            var ly = 4 * Math.pow(Math.sin(Math.PI * y / (2 * n)), 2) / (g.dy * g.dy);
            m.rates[y * n + x] = finite(c.diffusivity * (lx + ly), '扩散速率');
        }
        var unit = Object.assign({}, g.rects[0], { power: 1 });
        var source = raster(g, [unit]);
        for (var i = 0; i < source.length; i++) source[i] = finite(source[i] / capacity, '单位功率温升率');
        m.mainModes = transform(source, n, m.basis, false);
        var low = positive(1 / (c.theta * capacity * c.area), '标定下界'), high = low;
        var p = peak(modalSteady(m, m.mainModes, high)), iter = 0;
        while (p > c.theta * (1 + 1e-6) && iter++ < 80) {
            high = finite(high * 2, '标定上界');
            p = peak(modalSteady(m, m.mainModes, high));
        }
        if (p > c.theta * (1 + 1e-4)) throw new Error('散热标定未找到有效区间');
        var beta = high;
        for (iter = 0; iter < 64; iter++) {
            beta = Math.exp((Math.log(low) + Math.log(high)) / 2);
            p = peak(modalSteady(m, m.mainModes, beta));
            if (Math.abs(p / c.theta - 1) <= 1e-6) break;
            if (p > c.theta) low = beta; else high = beta;
        }
        m.error = Math.abs(p / c.theta - 1);
        if (m.error > 1e-4) throw new Error('散热标定未达到精度要求');
        m.beta = beta;
        return m;
    }
    function solve(c, model) {
        var g = geometry(c);
        temperature(c.ambient, '环境温度'); temperature(c.initial, '初始结温');
        temperature(c.threshold, '提醒阈值'); nonnegative(c.time, '时间');
        var m = model || createModel(c);
        if (m.key !== modelKey(c)) throw new Error('热模型缓存与当前参数不匹配');
        var q = raster(g, g.rects), totalPower = 0;
        g.rects.forEach(function (r) { totalPower = finite(totalPower + r.power, '总功耗'); });
        for (var i = 0; i < q.length; i++) q[i] = finite(q[i] / m.capacity, '温升率');
        var modes = transform(q, m.n, m.basis, false), coeff = new Float64Array(q.length);
        for (i = 0; i < coeff.length; i++) {
            var rate = m.rates[i] + m.beta;
            coeff[i] = modes[i] / rate * (c.steady ? 1 : -Math.expm1(-rate * c.time));
        }
        var u = transform(coeff, m.n, m.basis, true);
        var initial = c.steady ? 0 : (c.initial - c.ambient) * Math.exp(-m.beta * c.time);
        var values = new Float64Array(u.length), min = Infinity, max = -Infinity, mainMax = -Infinity, sum = 0, hot = 0, maxIndex = 0;
        for (i = 0; i < values.length; i++) {
            var t = !c.steady && c.time === 0 ? c.initial : finite(c.ambient + initial + u[i], '温度');
            values[i] = t; min = Math.min(min, t); sum += t;
            if (t > max) { max = t; maxIndex = i; }
            if (t > c.threshold) hot++;
            if (overlapArea(g, g.rects[0], i % m.n, Math.floor(i / m.n)) > 0) mainMax = Math.max(mainMax, t);
        }
        return { values: values, min: min, max: max, mean: finite(sum / values.length, '平均温度'), mainMax: mainMax,
            maxIndex: maxIndex, totalPower: totalPower, hotArea: hot * g.dx * g.dy, hotFraction: hot / values.length,
            beta: m.beta, calibrationError: m.error, heff: finite(m.beta * m.capacity, '等效散热系数'),
            conductivity: finite(c.diffusivity * c.heatCapacity, '导热率'), width: g.width, height: g.height, n: m.n, rects: g.rects };
    }
    return { number: number, convert: convert, series: series, finite: finite, positive: positive, nonnegative: nonnegative,
        temperature: temperature, resistanceAt: resistanceAt, conduction: conduction, maxCurrent: maxCurrent,
        constantDrop: constantDrop, dimensions: dimensions, geometry: geometry, modelKey: modelKey,
        raster: raster, overlapArea: overlapArea, basis: basis, transform: transform, createModel: createModel, solve: solve };
}));

/* 测试侧独立 RK4：手写 DSD/LLC 方程和整流事件，不调用生产积分器或 RHS。 */
'use strict';
function plus(a, b, k) { return a.map((v, i) => v + k * b[i]); }
function derivative(p, gate, rect, x) {
    if (p.topo === 'dsd') return [((gate === 1 ? p.Vin - x[2] : 0) - x[3]) / p.L1,
        ((gate === 2 ? x[2] : 0) - x[3]) / p.L2, (gate === 1 ? x[0] : gate === 2 ? -x[1] : 0) / p.Cf,
        (x[0] + x[1] - p.Iout) / p.Cout];
    if (!rect) {
        const currentSlope = (gate * p.Vin - x[2]) / (p.Lr + p.Lm);
        return [currentSlope, currentSlope, x[0] / p.Cr, -p.Iout / p.Cout];
    }
    const primaryVoltage = rect * p.n * x[3];
    return [(gate * p.Vin - x[2] - primaryVoltage) / p.Lr, primaryVoltage / p.Lm,
        x[0] / p.Cr, (p.n * rect * (x[0] - x[1]) - p.Iout) / p.Cout];
}
function rk4(p, g, m, x, h) {
    const a = derivative(p, g, m, x), b = derivative(p, g, m, plus(x, a, h / 2));
    const c = derivative(p, g, m, plus(x, b, h / 2)), d = derivative(p, g, m, plus(x, c, h));
    return x.map((v, i) => v + h / 6 * (a[i] + 2 * b[i] + 2 * c[i] + d[i]));
}
function free(p, g, x) { return (g * p.Vin - x[2]) * p.Lm / (p.Lr + p.Lm); }
function pick(p, g, x) {
    if (Math.abs(x[0] - x[1]) > 1e-8) return Math.sign(x[0] - x[1]);
    const v = free(p, g, x);
    const bound = p.n * x[3], slope = -x[0] / p.Cr * p.Lm / (p.Lr + p.Lm), loadSlope = -p.n * p.Iout / p.Cout;
    if (v > bound + 1e-9 || Math.abs(v - bound) <= 1e-9 && slope > loadSlope) return 1;
    if (v < -bound - 1e-9 || Math.abs(v + bound) <= 1e-9 && slope < -loadSlope) return -1;
    return 0;
}
function guard(p, g, m, x) { return m ? m * (x[0] - x[1]) : p.n * x[3] - Math.abs(free(p, g, x)); }
function reference(p, initial, count) {
    const T = 1 / p.fsw, h0 = T / count;
    const phases = p.topo === 'dsd' ? [[p.D, 1], [0.5, 0], [0.5 + p.D, 2], [1, 0]] : [[0.5, 1], [1, 0]];
    let time = 0, x = initial.slice(), data = [{ t: 0, x: x.slice() }], events = 0;
    for (const [end, gate] of phases) {
        let rect = p.topo === 'llc' ? pick(p, gate, x) : 1;
        const stop = end * T;
        while (time < stop - T * 1e-12) {
            const h = Math.min(h0, stop - time);
            let next = rk4(p, gate, rect, x, h);
            if (p.topo === 'llc' && guard(p, gate, rect, x) >= -1e-9 && guard(p, gate, rect, next) < -1e-10) {
                let a = 0, b = h;
                for (let j = 0; j < 24; j++) {
                    const mid = (a + b) / 2, trial = rk4(p, gate, rect, x, mid);
                    if (guard(p, gate, rect, trial) < 0) b = mid; else a = mid;
                }
                next = rk4(p, gate, rect, x, b); time += b;
                if (rect) { next[1] = next[0]; rect = pick(p, gate, next); }
                else rect = Math.sign(free(p, gate, next));
                if (++events > 100) throw new Error('独立参考求解发生事件抖振');
            } else time += h;
            x = next; data.push({ t: time / T, x: x.slice() });
        }
    }
    const metrics = initial.map((_, i) => {
        let min = Infinity, max = -Infinity, mean = 0;
        data.forEach((pt, j) => {
            min = Math.min(min, pt.x[i]); max = Math.max(max, pt.x[i]);
            if (j) mean += (pt.t - data[j - 1].t) * (pt.x[i] + data[j - 1].x[i]) / 2;
        });
        return { min, max, mean, pp: max - min };
    });
    return { final: x, metrics, events };
}
module.exports = { reference, derivative };

/* 小规模 gm-RC MNA：精确有理多项式、受限符号展开、复数根与直接交流求解。 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TFEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var Z = [0n, 1n], O = [1n, 1n], POW = { G: 9, M: 6, k: 3, '': 0, m: -3, u: -6, n: -9, p: -12, f: -15 };
    function abs(a) { return a < 0n ? -a : a; }
    function gcd(a, b) { a = abs(a); b = abs(b); while (b) { var c = a % b; a = b; b = c; } return a; }
    function q(n, d) {
        if (!d) throw new Error('除数为零');
        if (!n) return Z;
        if (d < 0n) { n = -n; d = -d; }
        var g = gcd(n, d); n /= g; d /= g;
        if (n.toString(2).length + d.toString(2).length > 65536) throw new Error('精确系数超过资源限制');
        return [n, d];
    }
    function qa(a, b) { return q(a[0] * b[1] + b[0] * a[1], a[1] * b[1]); }
    function qm(a, b) { return q(a[0] * b[0], a[1] * b[1]); }
    function qn(a) { return [-a[0], a[1]]; }
    function qd(a, b) { return q(a[0] * b[1], a[1] * b[0]); }
    function decimal(src, prefix) {
        var m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(src.trim());
        if (!m || !(m[2] || m[3]) || src.length > 64 || !Object.prototype.hasOwnProperty.call(POW, prefix)) throw new Error('无效精确数值');
        if (Math.abs(Number(m[4] || 0)) > 400) throw new Error('数值指数超限');
        var n = BigInt((m[1] === '-' ? '-' : '') + ((m[2] || '') + (m[3] || '')));
        if (!n) return Z;
        var exp = Number(m[4] || 0) - (m[3] || '').length + POW[prefix];
        if (Math.abs(exp) > 400) throw new Error('数值指数超限');
        return exp >= 0 ? q(n * 10n ** BigInt(exp), 1n) : q(n, 10n ** BigInt(-exp));
    }
    function qnumber(a) {
        if (!a[0]) return 0;
        var n = abs(a[0]).toString(), d = a[1].toString();
        var v = Number(n.slice(0, 16)) / Number(d.slice(0, 16)) * Math.pow(10, Math.max(0, n.length - 16) - Math.max(0, d.length - 16));
        return a[0] < 0n ? -v : v;
    }
    function trim(p) { while (p.length > 1 && p[p.length - 1][0] === 0n) p.pop(); return p; }
    function pzero(p) { return p.length === 1 && p[0][0] === 0n; }
    function padd(a, b) { return trim(Array.from({ length: Math.max(a.length, b.length) }, function (_, i) { return qa(a[i] || Z, b[i] || Z); })); }
    function pneg(a) { return a.map(qn); }
    function pmul(a, b) {
        var c = Array.from({ length: a.length + b.length - 1 }, function () { return Z; });
        a.forEach(function (x, i) { b.forEach(function (y, j) { c[i + j] = qa(c[i + j], qm(x, y)); }); });
        return trim(c);
    }
    function pdiv(a, b) {
        if (pzero(b)) throw new Error('多项式除数为零');
        var r = a.slice(), out = Array.from({ length: Math.max(1, a.length - b.length + 1) }, function () { return Z; });
        while (!pzero(r) && r.length >= b.length) {
            var k = r.length - b.length, v = qd(r[r.length - 1], b[b.length - 1]);
            out[k] = v;
            b.forEach(function (x, i) { r[i + k] = qa(r[i + k], qn(qm(x, v))); });
            trim(r);
        }
        return { quotient: trim(out), remainder: r };
    }
    function monic(a) { return pzero(a) ? a : a.map(function (x) { return qd(x, a[a.length - 1]); }); }
    function pgcd(a, b) { while (!pzero(b)) { var r = pdiv(a, b).remainder; a = b; b = r; } return monic(a); }
    function derivative(a) { return a.length === 1 ? [Z] : a.slice(1).map(function (x, i) { return qm(x, [BigInt(i + 1), 1n]); }); }
    var PR = { zero: [Z], one: [O], add: padd, neg: pneg, mul: pmul };
    function bits(x) { var n = 0; while (x) { x &= x - 1; n++; } return n; }
    /* 按行选列的子集动态规划，环上只用加法与乘法。 */
    function determinant(a, ring, check) {
        var n = a.length, dp = new Array(1 << n); dp[0] = ring.one;
        for (var mask = 1; mask < dp.length; mask++) {
            if (check) check();
            var row = bits(mask) - 1, sum = ring.zero;
            for (var j = 0; j < n; j++) if (mask & (1 << j)) {
                var term = ring.mul(dp[mask ^ (1 << j)], a[row][j]);
                if (bits(mask >>> (j + 1)) % 2) term = ring.neg(term);
                sum = ring.add(sum, term);
            }
            dp[mask] = sum;
        }
        return dp[dp.length - 1];
    }
    function assemble(net, ring, parameter) {
        var n = net.nodeCount + (net.inputKind === 'voltage' ? 1 : 0);
        var a = Array.from({ length: n }, function () { return Array.from({ length: n }, function () { return ring.zero; }); });
        var b = Array.from({ length: n }, function () { return ring.zero; });
        function stamp(i, j, v, sign) { if (i && j) a[i - 1][j - 1] = ring.add(a[i - 1][j - 1], sign < 0 ? ring.neg(v) : v); }
        net.devices.forEach(function (d, k) {
            var v = parameter(d, k), p = d.nodes;
            if (d.kind === 'gm') {
                stamp(p[2], p[0], v, 1); stamp(p[2], p[1], v, -1);
                stamp(p[3], p[0], v, -1); stamp(p[3], p[1], v, 1);
            } else {
                stamp(p[0], p[0], v, 1); stamp(p[1], p[1], v, 1);
                stamp(p[0], p[1], v, -1); stamp(p[1], p[0], v, -1);
            }
        });
        if (net.inputKind === 'voltage') {
            stamp(net.input, n, ring.one, 1); stamp(n, net.input, ring.one, 1); b[n - 1] = ring.one;
        } else b[net.input - 1] = ring.one;
        return { a: a, b: b };
    }
    function replaced(a, b, col) { return a.map(function (row, i) { return row.map(function (v, j) { return j === col ? b[i] : v; }); }); }
    function exactSystem(net) {
        return assemble(net, PR, function (d) {
            var v = decimal(d.value, d.prefix);
            if (d.kind === 'R') v = qd(O, v);
            return d.kind === 'C' ? [Z, v] : [v];
        });
    }
    function fmt(x) { return x === 0 ? '0' : Number(x.toPrecision(10)).toString(); }
    function polyText(p) {
        var terms = [];
        for (var i = p.length - 1; i >= 0; i--) if (p[i]) terms.push((p[i] < 0 ? '-' : terms.length ? '+' : '') + fmt(Math.abs(p[i])) + (i ? '*s' + (i > 1 ? '^' + i : '') : ''));
        return terms.join(' ') || '0';
    }
    function asNumbers(p) {
        return p.map(function (v) {
            var n = qnumber(v);
            if (!Number.isFinite(n) || (v[0] && !n)) throw new Error('系数动态范围超出双精度显示范围，请调整参数');
            return n;
        });
    }
    /* 复数运算，除法先缩放，避免计算模平方时溢出。 */
    function c(re, im) { return { re: re, im: im === undefined ? 0 : im }; }
    function ca(a, b) { return c(a.re + b.re, a.im + b.im); }
    function cn(a) { return c(-a.re, -a.im); }
    function cm(a, b) { return c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); }
    function cd(a, b) {
        var s = Math.max(Math.abs(b.re), Math.abs(b.im));
        if (!s) return c(NaN, NaN);
        var r = b.re / s, i = b.im / s, d = r * r + i * i;
        return c((a.re / s * r + a.im / s * i) / d, (a.im / s * r - a.re / s * i) / d);
    }
    function norm(a) { return Math.hypot(a.re, a.im); }
    function evalPoly(p, z) { var out = c(0); for (var i = p.length - 1; i >= 0; i--) out = ca(cm(out, z), c(p[i])); return out; }
    function scaledPoly(p, z) {
        var zm = Math.max(Math.abs(z.re), Math.abs(z.im)), zn = zm ? c(z.re / zm, z.im / zm) : c(0);
        var v = c(0), log = -Infinity;
        for (var i = p.length - 1; i >= 0; i--) {
            var product = cm(v, zn), pl = zm ? log + Math.log(zm) : -Infinity;
            var al = p[i] ? Math.log(Math.abs(p[i])) : -Infinity, common = Math.max(pl, al);
            if (common === -Infinity) { v = c(0); log = -Infinity; continue; }
            var ps = Math.exp(pl - common), as = Math.exp(al - common);
            v = ca(c(product.re * ps, product.im * ps), c(Math.sign(p[i]) * as));
            var magnitude = Math.max(Math.abs(v.re), Math.abs(v.im));
            log = magnitude ? common + Math.log(magnitude) : -Infinity;
            v = magnitude ? c(v.re / magnitude, v.im / magnitude) : c(0);
        }
        return { v: v, log: log };
    }
    function evalRatio(num, den, z) {
        var a = scaledPoly(num, z), b = scaledPoly(den, z);
        if (b.log === -Infinity) return c(NaN, NaN);
        if (a.log === -Infinity) return c(0);
        var v = cd(a.v, b.v), scale = Math.exp(a.log - b.log);
        return c(v.re * scale, v.im * scale);
    }
    function residual(p, z) {
        var bound = 0, r = norm(z);
        for (var i = p.length - 1; i >= 0; i--) bound = bound * r + Math.abs(p[i]);
        return norm(evalPoly(p, z)) / Math.max(bound, Number.MIN_VALUE);
    }
    function simpleRoots(p) {
        var n = p.length - 1;
        if (!n) return [];
        var scale = Math.exp((Math.log(Math.abs(p[0])) - Math.log(Math.abs(p[n]))) / n);
        if (!Number.isFinite(scale) || !scale) throw new Error('根的尺度超出数值范围');
        var logs = p.map(function (x, i) { return x ? Math.log(Math.abs(x)) + i * Math.log(scale) : -Infinity; });
        var max = Math.max.apply(null, logs), a = logs.map(function (x, i) { return Math.sign(p[i]) * Math.exp(x - max); });
        if (!a[n] || !a[0]) throw new Error('根的系数尺度过大');
        var zs;
        if (n === 1) zs = [c(-a[0] / a[1])];
        else if (n === 2) {
            var disc = a[1] * a[1] - 4 * a[2] * a[0];
            if (disc < 0) zs = [c(-a[1] / (2 * a[2]), Math.sqrt(-disc) / (2 * a[2])), c(-a[1] / (2 * a[2]), -Math.sqrt(-disc) / (2 * a[2]))];
            else { var v = -0.5 * (a[1] + (a[1] >= 0 ? 1 : -1) * Math.sqrt(disc)); zs = [c(v / a[2]), c(a[0] / v)]; }
        } else {
            var da = a.slice(1).map(function (x, i) { return (i + 1) * x; });
            var radius = 2 * Math.max.apply(null, a.slice(0, -1).map(function (x, i) { return Math.pow(Math.abs(x / a[n]), 1 / (n - i)); }));
            var success = false;
            for (var attempt = 0; attempt < 3 && !success; attempt++) {
                zs = Array.from({ length: n }, function (_, k) { var theta = 2 * Math.PI * (k + 0.37 + attempt * 0.19) / n; return c(radius * Math.cos(theta), radius * Math.sin(theta)); });
                for (var it = 0; it < 1000; it++) {
                    var next = zs.map(function (z, k) {
                        var correction = cd(evalPoly(a, z), evalPoly(da, z)), repulsion = c(0);
                        zs.forEach(function (other, j) { if (j !== k) repulsion = ca(repulsion, cd(c(1), ca(z, cn(other)))); });
                        return ca(z, cn(cd(correction, ca(c(1), cn(cm(correction, repulsion))))));
                    });
                    zs = next;
                    if (zs.every(function (z) { return Number.isFinite(norm(z)) && residual(a, z) <= 1e-12; })) { success = true; break; }
                }
            }
            if (!success) throw new Error('复数求根未收敛');
        }
        if (zs.some(function (z) { return residual(a, z) > 1e-8 || !Number.isFinite(norm(z)); })) throw new Error('根的残差不合格');
        zs.forEach(function (z) {
            if (Math.abs(z.im) <= 1e-10 * Math.abs(z.re) && residual(a, c(z.re)) <= 1e-12) z.im = 0;
            if (z.im && !zs.some(function (w) { return Math.hypot(z.re - w.re, z.im + w.im) < 1e-7 * Math.max(1, norm(z)); })) throw new Error('复根共轭配对失败');
        });
        return zs.map(function (z) { return { re: z.re * scale, im: z.im * scale, multiplicity: 1 }; });
    }
    function roots(p) {
        if (pzero(p)) return { ok: false, roots: [], error: '零多项式没有离散的有限根列表' };
        try {
            var result = [], a = p.slice(), origin = 0;
            while (a.length > 1 && !a[0][0]) { origin++; a.shift(); }
            if (origin) result.push({ re: 0, im: 0, multiplicity: origin });
            a = monic(a);
            var g = pgcd(a, derivative(a)), w = pdiv(a, g).quotient, multiplicity = 1;
            while (w.length > 1) {
                var y = pgcd(w, g), z = pdiv(w, y).quotient;
                simpleRoots(asNumbers(z)).forEach(function (r) { r.multiplicity = multiplicity; result.push(r); });
                w = y; g = pdiv(g, y).quotient; multiplicity++;
            }
            return { ok: true, roots: result.sort(function (a, b) { return a.re - b.re || a.im - b.im; }) };
        } catch (err) { return { ok: false, roots: [], error: '未可靠求得：' + err.message }; }
    }
    function numeric(net) {
        var missing = net.devices.filter(function (d) { return !d.value.trim(); }).map(function (d) { return d.symbol; });
        if (missing.length) return { missing: missing };
        var sys = exactSystem(net), rawDen = determinant(sys.a, PR);
        if (pzero(rawDen)) throw new Error('节点方程恒奇异：检查浮置网络、受控源约束及零值支路');
        var rawNum = net.output ? determinant(replaced(sys.a, sys.b, net.output - 1), PR) : [Z];
        var common = pgcd(rawNum, rawDen), num = pdiv(rawNum, common).quotient, den = pdiv(rawDen, common).quotient;
        var factor = den[0][0] ? den[0] : den[den.length - 1];
        num = num.map(function (x) { return qd(x, factor); }); den = den.map(function (x) { return qd(x, factor); });
        var ns = asNumbers(num), ds = asNumbers(den);
        var nz = pzero(num), zr = nz ? { ok: true, roots: [], zeroTransfer: true } : roots(num), pr = roots(den), hidden = roots(common);
        var warnings = net.warnings.slice();
        if (common.length > 1) warnings.push('已精确约去 ' + (common.length - 1) + ' 阶公因子；请同时检查被隐藏的内部模态');
        if (hidden.ok && hidden.roots.some(function (r) { return r.re >= 0; })) warnings.push('被相消的内部模态包含右半平面或虚轴根，不能据可见传递函数判定电路稳定');
        if (!zr.ok) warnings.push(zr.error); if (!pr.ok) warnings.push(pr.error); if (!hidden.ok) warnings.push('内部模态：' + hidden.error);
        if (pr.ok && pr.roots.some(function (r) { return r.re >= 0; })) warnings.push('传递函数含右半平面或虚轴极点');
        if (zr.ok && pr.ok && zr.roots.some(function (z) { return pr.roots.some(function (p) { return Math.hypot(z.re - p.re, z.im - p.im) / Math.max(1, norm(z), norm(p)) < 1e-5; }); })) warnings.push('存在接近的零极点，未自动作近似相消');
        return { missing: [], num: ns, den: ds, exactNum: num, exactDen: den, rawDen: rawDen, zeros: zr, poles: pr, hidden: hidden, zeroTransfer: nz, warnings: warnings,
            text: nz ? '0' : '(' + polyText(ns) + ')/(' + polyText(ds) + ')', latex: nz ? '0' : '\\frac{' + tex(polyText(ns)) + '}{' + tex(polyText(ds)) + '}' };
    }
    function tex(s) {
        return s.replace(/\d+(?:\.\d+)?(?:e[+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|\^(-?\d+)|\*/gi, function (token, exponent) {
            if (exponent !== undefined) return '^{' + exponent + '}';
            if (token === '*') return '\\,';
            if (/^\d/.test(token)) return token.replace(/e([+-]?\d+)/i, '\\times 10^{$1}');
            return token === 's' ? 's' : '\\mathrm{' + token.replace(/_/g, '\\_') + '}';
        });
    }
    /* 符号环使用整数系数与 Laurent 单项式，R 的指数可为 -1。 */
    function symbolic(net, limits) {
        limits = limits || {};
        var names = ['s'].concat(net.devices.map(function (d) { return d.symbol; })), count = 0, start = Date.now(), building = true;
        var zeroKey = names.map(function () { return 0; }).join(','), zero = new Map(), one = new Map([[zeroKey, 1n]]);
        function check() { if (building) return; if (count > (limits.terms == null ? 50000 : limits.terms) || Date.now() - start > (limits.ms == null ? 5000 : limits.ms)) throw new Error('符号展开超过预算'); }
        function add(a, b) {
            var out = new Map(a);
            b.forEach(function (v, k) { var x = (out.get(k) || 0n) + v; if (x) out.set(k, x); else out.delete(k); });
            count += out.size; check(); return out;
        }
        function neg(a) { return new Map(Array.from(a, function (t) { return [t[0], -t[1]]; })); }
        function mul(a, b) {
            var out = new Map();
            a.forEach(function (v, k) { var x = k.split(',').map(Number); b.forEach(function (w, l) {
                var y = l.split(',').map(Number), key = x.map(function (e, i) { return e + y[i]; }).join(',');
                var z = (out.get(key) || 0n) + v * w; if (z) out.set(key, z); else out.delete(key);
                count++; check();
            }); });
            return out;
        }
        function text(p) {
            var grouped = new Map();
            p.forEach(function (v, key) {
                var es = key.split(',').map(Number), power = es[0], factors = [];
                for (var i = 1; i < es.length; i++) if (es[i]) factors.push(names[i] + (es[i] === 1 ? '' : '^' + es[i]));
                var body = factors.join('*');
                if (abs(v) !== 1n || !body) body = abs(v).toString() + (body ? '*' + body : '');
                if (!grouped.has(power)) grouped.set(power, []);
                var ts = grouped.get(power); ts.push((v < 0n ? '-' : ts.length ? '+' : '') + body);
            });
            return Array.from(grouped.keys()).sort(function (a, b) { return b - a; }).map(function (i) {
                var ts = grouped.get(i).join(' '); return i ? '(' + ts + ')*s' + (i === 1 ? '' : '^' + i) : '(' + ts + ')';
            }).join(' + ') || '0';
        }
        var ring = { zero: zero, one: one, add: add, neg: neg, mul: mul };
        var sys = assemble(net, ring, function (d, i) { var es = names.map(function () { return 0; }); es[0] = d.kind === 'C' ? 1 : 0; es[i + 1] = d.kind === 'R' ? -1 : 1; return new Map([[es.join(','), 1n]]); });
        var matrix = { a: sys.a.map(function (row) { return row.map(text); }), b: sys.b.map(text), outputColumn: net.output, variables: Array.from({ length: sys.a.length }, function (_, i) { return i < net.nodeCount ? 'V(n' + (i + 1) + ')' : 'I(Vin)'; }) };
        var fallback = { expanded: false, text: net.output ? 'det(Aout(s))/det(A(s))' : '0', latex: net.output ? '\\frac{\\det A_{out}(s)}{\\det A(s)}' : '0', matrix: matrix };
        building = false;
        if (limits.matrixOnly) return fallback;
        try {
            var den = determinant(sys.a, ring, check), num = net.output ? determinant(replaced(sys.a, sys.b, net.output - 1), ring, check) : zero;
            if (!den.size) throw new Error('符号节点方程恒奇异');
            /* 同时除去共同的 Laurent 单项式，得到常见的 R、C、gm 正幂形式。 */
            var entries = Array.from(den.keys()).concat(Array.from(num.keys())).map(function (key) { return key.split(',').map(Number); });
            var minima = names.map(function (_, i) { return Math.min.apply(null, entries.map(function (es) { return es[i]; })); });
            function reduce(p) { return new Map(Array.from(p, function (t) { return [t[0].split(',').map(function (v, i) { return Number(v) - minima[i]; }).join(','), t[1]]; })); }
            num = reduce(num); den = reduce(den);
            var first = den.values().next().value; if (first < 0n) { num = neg(num); den = neg(den); }
            var nt = text(num), dt = text(den), result = num.size ? '(' + nt + ')/(' + dt + ')' : '0';
            if (result.length > (limits.characters || 20000)) throw new Error('公式长度超过展示预算');
            return { expanded: true, text: result, latex: num.size ? '\\frac{' + tex(nt) + '}{' + tex(dt) + '}' : '0', matrix: matrix,
                terms: { names: names, num: Array.from(num, function (t) { return [t[0], t[1].toString()]; }), den: Array.from(den, function (t) { return [t[0], t[1].toString()]; }) } };
        } catch (err) {
            if (err.message.includes('恒奇异')) throw err;
            fallback.reason = err.message + '；保留精确矩阵表达（未展开）'; return fallback;
        }
    }
    function acSystem(net) {
        var sys = exactSystem(net);
        return { a: sys.a.map(function (row) { return row.map(function (p) { return [qnumber(p[0]), qnumber(p[1] || Z)]; }); }), b: sys.b.map(function (p) { return qnumber(p[0]); }) };
    }
    function solveComplex(a, b) {
        var n = a.length;
        for (var i = 0; i < n; i++) {
            var scale = Math.max.apply(null, a[i].map(norm));
            if (!scale || !Number.isFinite(scale)) return null;
            a[i] = a[i].map(function (v) { return c(v.re / scale, v.im / scale); }); b[i] = c(b[i].re / scale, b[i].im / scale);
        }
        var columns = Array.from({ length: n }, function (_, j) { return Math.max.apply(null, a.map(function (row) { return norm(row[j]); })); });
        if (columns.some(function (s) { return !s || !Number.isFinite(s); })) return null;
        a = a.map(function (row) { return row.map(function (v, j) { return c(v.re / columns[j], v.im / columns[j]); }); });
        for (var k = 0; k < n; k++) {
            var pivot = k;
            for (i = k + 1; i < n; i++) if (norm(a[i][k]) > norm(a[pivot][k])) pivot = i;
            if (norm(a[pivot][k]) < 1e-15) return null;
            var row = a[k]; a[k] = a[pivot]; a[pivot] = row; var rhs = b[k]; b[k] = b[pivot]; b[pivot] = rhs;
            for (i = k + 1; i < n; i++) {
                var f = cd(a[i][k], a[k][k]); a[i][k] = c(0);
                for (var j = k + 1; j < n; j++) a[i][j] = ca(a[i][j], cn(cm(f, a[k][j])));
                b[i] = ca(b[i], cn(cm(f, b[k])));
            }
        }
        var x = new Array(n);
        for (i = n - 1; i >= 0; i--) { var r = b[i]; for (j = i + 1; j < n; j++) r = ca(r, cn(cm(a[i][j], x[j]))); x[i] = cd(r, a[i][i]); }
        x = x.map(function (v, j) { return c(v.re / columns[j], v.im / columns[j]); });
        return x.every(function (v) { return Number.isFinite(norm(v)); }) ? x : null;
    }
    function response(sys, output, f) {
        var a = sys.a.map(function (row) { return row.map(function (v) { return c(v[0], 2 * Math.PI * f * v[1]); }); });
        var x = solveComplex(a, sys.b.map(function (v) { return c(v); }));
        return x ? (output ? x[output - 1] : c(0)) : null;
    }
    function sweep(net, result, range) {
        range = range || { auto: true };
        var rr = (result.poles.ok ? result.poles.roots : []).concat(result.zeros.ok ? result.zeros.roots : []);
        var frequencies = rr.map(function (r) { return norm(r) / (2 * Math.PI); }).filter(function (f) { return f > 0 && Number.isFinite(f); });
        var lo = range.auto ? (frequencies.length ? Math.min.apply(null, frequencies) / 100 : 1) : Number(range.min);
        var hi = range.auto ? (frequencies.length ? Math.max.apply(null, frequencies) * 100 : 1e9) : Number(range.max);
        if (!(lo > 0 && hi > lo && Number.isFinite(hi)) || lo < 1e-150 || hi > 1e150) throw new Error('频率范围需满足 0 < fmin < fmax，且在安全范围内');
        var fs = [], i;
        for (i = 0; i < 800; i++) fs.push(Math.exp(Math.log(lo) + Math.log(hi / lo) * i / 799));
        frequencies.forEach(function (f) { for (var j = -40; j <= 40; j++) { var v = f * Math.pow(10, j / 100); if (v >= lo && v <= hi) fs.push(v); } });
        fs = Array.from(new Set(fs)).sort(function (a, b) { return a - b; }).slice(0, 5000);
        var sys = acSystem(net), previous = null, broken = 0, mismatches = 0;
        var rows = fs.map(function (f, index) {
            var h = response(sys, net.output, f);
            if (h && result.zeroTransfer) h = c(0);
            var mag = h && norm(h), phase = null, db = null;
            if (h && mag > 0) {
                phase = Math.atan2(h.im, h.re) * 180 / Math.PI;
                if (phase > 179.999999) phase -= 360;
                if (previous != null) { while (phase - previous > 180) phase -= 360; while (phase - previous < -180) phase += 360; }
                previous = phase; db = 20 * Math.log10(mag);
                if (index % 37 === 0) { var ref = evalRatio(result.num, result.den, c(0, 2 * Math.PI * f)); if (!Number.isFinite(norm(ref)) || norm(ca(h, cn(ref))) / Math.max(1e-30, mag, norm(ref)) > 1e-6) mismatches++; }
            } else { previous = null; if (!h) broken++; }
            return { f: f, re: h ? h.re : null, im: h ? h.im : null, magnitude: h ? mag : null, db: db, phase: phase };
        });
        return { min: lo, max: hi, rows: rows, warnings: (broken ? ['有 ' + broken + ' 个频点奇异或数值病态，已断开曲线'] : []).concat(mismatches ? ['MNA 与多项式抽样对照出现差异，请检查参数动态范围；结果暂不可作为可靠数据'] : []), reliable: !mismatches };
    }
    return { decimal: decimal, numeric: numeric, symbolic: symbolic, sweep: sweep, roots: roots, acSystem: acSystem, response: response, evalRatio: evalRatio,
        poly: { add: padd, mul: pmul, gcd: pgcd, div: pdiv }, rational: { make: q, number: qnumber }, complex: { make: c, norm: norm }, polyText: polyText };
});

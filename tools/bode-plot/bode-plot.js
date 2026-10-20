/* Canvas 显示层：主题配色、自适应坐标与交越/裕度标记。 */
var BodePlot = (function () {
    'use strict';
    function palette() {
        var css = getComputedStyle(document.documentElement);
        function color(name) { return css.getPropertyValue('--color-' + name).trim(); }
        return { bg: color('card-bg'), grid: color('bg-grid'), border: color('border'),
            text: color('text-secondary'), ink: color('border-sketch'), primary: color('primary'), accent: color('accent') };
    }
    function draw(canvas, snapshot, phase) {
        var dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        var ctx = canvas.getContext('2d'), colors = palette(), key = phase ? 'phase' : 'mag';
        ctx.scale(dpr, dpr);
        ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, w, h);
        ctx.font = '11px Consolas, monospace';
        var points = snapshot.result.points;
        var axis = BodeCore.axis(points.map(function (p) { return p[key]; }), h - 82, phase);
        function tick(v) { return Math.abs(v) >= 1e6 ? v.toExponential(1) : String(Number(v.toPrecision(6))); }
        var width = Math.max.apply(null, axis.ticks.concat(phase ? [-180] : [0]).map(function (v) { return ctx.measureText(tick(v)).width; }));
        var pad = { top: 48, right: 16, bottom: 36, left: Math.max(42, width + 12) };
        var cw = Math.max(1, w - pad.left - pad.right), ch = Math.max(1, h - pad.top - pad.bottom);
        var a = Math.log10(snapshot.range.fStart), b = Math.log10(snapshot.range.fEnd);
        function xPos(f) { return pad.left + (Math.log10(f) - a) / (b - a) * cw; }
        function yPos(v) { return pad.top + (axis.max - v) / (axis.max - axis.min) * ch; }
        canvas._bodeGeometry = { pad: pad, width: w, height: h, axis: axis };
        function line(x1, y1, x2, y2, color, thickness, dash) {
            ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = thickness || 1;
            ctx.setLineDash(dash || []); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
        }
        var tickEvery = Math.max(1, Math.ceil((b - a) / Math.max(1, Math.floor(cw / 65))));
        var labelX = -Infinity;
        for (var dec = Math.floor(a); dec <= Math.ceil(b); dec++) {
            for (var m = 1; m <= (cw / (b - a) > 80 ? 9 : 1); m++) {
                var f = m * Math.pow(10, dec);
                if (f < snapshot.range.fStart || f > snapshot.range.fEnd) continue;
                var x = xPos(f);
                if (m !== 1 || dec % tickEvery === 0) line(x, pad.top, x, h - pad.bottom, m === 1 ? colors.border : colors.grid);
                if (m === 1 && dec % tickEvery === 0) {
                    var txt = BodeCore.format(f, 'Hz', 3), tw = ctx.measureText(txt).width;
                    var lx = Math.max(tw / 2, Math.min(w - tw / 2, x));
                    if (lx - tw / 2 > labelX + 6) {
                        ctx.fillStyle = colors.text; ctx.textAlign = 'center'; ctx.fillText(txt, lx, h - pad.bottom + 17);
                        labelX = lx + tw / 2;
                    }
                }
            }
        }
        if (labelX === -Infinity) {
            ctx.fillStyle = colors.text; ctx.textAlign = 'left';
            ctx.fillText(BodeCore.format(snapshot.range.fStart, 'Hz', 4), pad.left, h - 18);
            ctx.textAlign = 'right'; ctx.fillText(BodeCore.format(snapshot.range.fEnd, 'Hz', 4), w - pad.right, h - 18);
        }
        axis.ticks.forEach(function (v) {
            var y = yPos(v);
            line(pad.left, y, w - pad.right, y, colors.grid);
            ctx.fillStyle = colors.text; ctx.textAlign = 'right'; ctx.fillText(tick(v), pad.left - 6, y + 4);
        });
        var reference = phase ? -180 : 0;
        if (reference >= axis.min && reference <= axis.max) {
            var ry = yPos(reference);
            line(pad.left, ry, w - pad.right, ry, colors.ink, 1.5, phase ? [6, 4] : []);
            // 参考线不一定是自动刻度的整数倍，单独标注并擦除相邻刻度文字。
            ctx.fillStyle = colors.bg; ctx.fillRect(0, ry - 9, pad.left - 2, 18);
            ctx.fillStyle = colors.ink; ctx.textAlign = 'right'; ctx.fillText(String(reference), pad.left - 6, ry + 4);
        }
        ctx.fillStyle = colors.text; ctx.textAlign = 'left'; ctx.fillText(phase ? '°' : 'dB', 4, 14);
        if (snapshot.approximation) {
            ctx.textAlign = 'right'; ctx.fillStyle = colors.accent; ctx.fillText('基于近似模型', w - pad.right, 14);
        }
        ctx.strokeStyle = colors.ink; ctx.lineWidth = 1.5; ctx.strokeRect(pad.left, pad.top, cw, ch);
        ctx.save(); ctx.beginPath(); ctx.rect(pad.left, pad.top, cw, ch); ctx.clip();
        ctx.beginPath(); ctx.strokeStyle = phase ? colors.accent : colors.primary; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        points.forEach(function (p, i) { if (!i) ctx.moveTo(xPos(p.f), yPos(p[key])); else ctx.lineTo(xPos(p.f), yPos(p[key])); });
        ctx.stroke(); ctx.restore();
        var occupied = [];
        function label(text, x, y, color, required) {
            ctx.font = '11px Consolas, monospace';
            while (ctx.measureText(text).width > cw - 8 && text.length > 5) text = text.slice(0, -2) + '…';
            var tw = ctx.measureText(text).width + 8;
            var left = Math.max(pad.left, Math.min(w - pad.right - tw, x));
            var shifts = [0, -18, 18, -36, 36];
            for (var i = 0; i < shifts.length; i++) {
                var top = Math.max(20, Math.min(h - pad.bottom - 17, y + shifts[i]));
                var box = { x: left, y: top, w: tw, h: 16 };
                var overlap = occupied.some(function (r) { return box.x < r.x + r.w && box.x + box.w > r.x && box.y < r.y + r.h && box.y + box.h > r.y; });
                if (!overlap || (required && i === shifts.length - 1)) {
                    occupied.push(box); ctx.fillStyle = colors.bg; ctx.fillRect(left, top, tw, 16);
                    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(text, left + 4, top + 12); return;
                }
            }
        }
        var primary = snapshot.result.primary;
        // 主交越优先布局，其余交越仍绘制标记，完整数值可在图下列表查看。
        var crosses = snapshot.result.crossings.slice().sort(function (x, y) { return x === primary ? -1 : y === primary ? 1 : x.f - y.f; });
        crosses.forEach(function (c) {
            var main = c === primary, x = xPos(c.f), y = yPos(phase ? c.phase : 0);
            var color = main ? colors.accent : colors.text, index = snapshot.result.crossings.indexOf(c) + 1;
            line(x, pad.top, x, h - pad.bottom, color, main ? 1.8 : 1, [5, 4]);
            ctx.fillStyle = colors.bg; ctx.strokeStyle = color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, main ? 5 : 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            label((main && !phase ? 'fc/UGB #' : 'fc #') + index + (main ? ' ' + BodeCore.format(c.f, 'Hz') : ''), x + 7, 24, color, main);
            if (phase && main) {
                var refY = yPos(-180), dx = x + (x < pad.left + cw / 2 ? 12 : -12);
                line(dx, refY, dx, y, color, 2);
                line(dx - 4, refY, dx + 4, refY, color, 2); line(dx - 4, y, dx + 4, y, color, 2);
                label('PM ' + c.pm.toFixed(2) + '°', dx + 6, (y + refY) / 2 - 8, color, true);
                label('φ ' + c.phase.toFixed(2) + '°', x + 7, y - 20, color, false);
            }
        });
        snapshot.markers.forEach(function (mk) {
            if (mk.f < snapshot.range.fStart || mk.f > snapshot.range.fEnd) return;
            var x = xPos(mk.f), y = yPos(mk[key]), color = mk.kind === 'pole' ? colors.accent : colors.primary;
            ctx.strokeStyle = color; ctx.lineWidth = 2;
            if (mk.kind === 'pole') { line(x - 4, y - 4, x + 4, y + 4, color, 2); line(x - 4, y + 4, x + 4, y - 4, color, 2); }
            else { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke(); }
            label(BodeCore.format(mk.f, 'Hz', 4), x + 5, y - 20, color, false);
        });
    }
    return { draw: draw, palette: palette };
}());

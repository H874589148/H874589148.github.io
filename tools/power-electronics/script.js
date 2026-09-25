/* 参数、任务生命周期及 Canvas 展示；物理计算只调用独立引擎。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
    else { root.PEUI = factory(root.PowerElectronics); root.PEUI.mount(root); }
}(typeof window !== 'undefined' ? window : globalThis, function (E) {
    'use strict';
    function format(x, unit) {
        if (!Number.isFinite(x)) return '—';
        var a = Math.abs(x), f = 1, prefix = '';
        var levels = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
        if (unit !== '逻辑' && a) {
            for (var j = 0; j < levels.length; j++) if (a >= levels[j][0]) { f = levels[j][0]; prefix = levels[j][1]; break; }
        }
        var value = a < 1e-15 && a ? x.toExponential(3) : Number((x / f).toPrecision(5)).toString();
        return value + (unit && unit !== '逻辑' ? ' ' + prefix + unit : '');
    }
    function parseInputs(topo, raw, unit, mode) {
        var p = { topo: topo, mode: mode }, spec = E.specs[topo];
        if (!spec) throw new Error('未知拓扑');
        spec.fields.forEach(function (key) {
            var text = raw[key], factor = key === 'Iout' && unit === 'mA' ? 1e-3 : E.fields[key].factor;
            if (typeof text !== 'string' || !text.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) throw new Error(E.fields[key].label + ' 请输入有效数值');
            p[key] = Number(text) * factor;
        });
        return E.validate(p);
    }
    function convertCurrent(value, from, to) {
        if (from === to || !String(value).trim()) return value;
        var number = Number(value);
        return Number.isFinite(number) ? String(number * (from === 'A' ? 1000 : 0.001)) : value;
    }
    function sample(data, t) {
        var lo = 0, hi = data.length;
        while (lo < hi) { var m = (lo + hi) >>> 1; if (data[m].t <= t) lo = m + 1; else hi = m; }
        var a = data[Math.max(0, lo - 1)], b = data[Math.min(lo, data.length - 1)];
        return b.t > a.t ? a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t) : a.v;
    }
    function createRunner(factory, notify, timers) {
        timers = timers || { set: setTimeout, clear: clearTimeout };
        var revision = 0, worker = null, timeout = null;
        function invalidate() {
            revision++;
            if (worker) worker.terminate(); worker = null;
            if (timeout !== null) timers.clear(timeout); timeout = null;
        }
        function start(params) {
            invalidate(); var id = revision, w;
            function finish(state, value) {
                if (id !== revision || worker !== w) return;
                invalidate(); notify(state, value);
            }
            try {
                w = factory(); worker = w;
                w.onmessage = function (event) {
                    var d = event.data;
                    if (!d || d.id !== id) return;
                    if (d.ok) finish('ready', d.result); else finish('error', (d.code ? '[' + d.code + '] ' : '') + d.error);
                };
                w.onerror = function () { finish('error', '计算 Worker 加载或执行失败，请通过 HTTP(S) 打开页面并检查脚本。'); };
                w.onmessageerror = function () { finish('error', '计算结果传输失败，请重试。'); };
                timeout = timers.set(function () { finish('error', '计算超时，任务已停止。'); }, 11000);
                notify('running'); w.postMessage({ id: id, params: params });
            } catch (err) { invalidate(); notify('error', err.message || '无法创建 Worker'); }
        }
        return { start: start, invalidate: invalidate };
    }
    function mount(window) {
        var document = window.document, $ = function (id) { return document.getElementById(id); };
        var topo = 'buck', stores = {}, result = null, stale = true, debounce = null, cards = [], locks = {};
        var timerApi = { set: window.setTimeout.bind(window), clear: window.clearTimeout.bind(window) };
        function status(text, error) { $('calculationStatus').textContent = text; $('calculationStatus').classList.toggle('error', !!error); }
        function markStale() {
            stale = true; $('exportCsv').disabled = true; $('waveArea').classList.add('is-stale');
            $('dcParams').classList.add('is-stale'); $('diagnostics').classList.add('is-stale');
            cards.forEach(function (item) { if (!item.cursor.textContent.startsWith('旧结果')) item.cursor.textContent = '旧结果（已过期） · ' + item.cursor.textContent; });
        }
        var runner = createRunner(function () { return new window.Worker('worker.js'); }, function (state, value) {
            $('cancelCalculation').disabled = state !== 'running'; $('waveArea').setAttribute('aria-busy', String(state === 'running'));
            if (state === 'running') status('正在求周期稳态；旧结果已过期，不可导出。');
            if (state === 'error') { markStale(); status(value + ' 旧结果已过期，不代表当前输入。', true); }
            if (state === 'ready') {
                result = value; stale = false; $('exportCsv').disabled = false;
                ['waveArea', 'dcParams', 'diagnostics'].forEach(function (id) { $(id).classList.remove('is-stale'); });
                status('周期稳态已求得 · ' + result.mode + ' · 已通过周期闭合、守恒及采样加密检查。');
                showResult();
            }
        }, timerApi);
        function initStore(name) {
            if (stores[name]) return stores[name];
            var p = E.defaults(name), raw = {};
            E.specs[name].fields.forEach(function (key) { raw[key] = String(Number((p[key] / E.fields[key].factor).toPrecision(14))); });
            return (stores[name] = { raw: raw, unit: 'A', mode: 'auto' });
        }
        var currentFigure = null;
        $('topoFig').classList.add('circuit-figure-scroll');
        var figureLink = window.CircuitHandoff.toolbar($('topoFig'), '电力电子', function () {
            if (!currentFigure) throw new Error('请先修正当前输入');
            return window.CircuitHandoff.clone(currentFigure);
        });
        function schematic() {
            $('topoFig').dataset.topo = topo; currentFigure = null;
            var s = stores[topo], p = null, error = '';
            try { p = parseInputs(topo, s.raw, s.unit, s.mode); } catch (err) { error = err.message; }
            try {
                var pack = window.PEFigures.pack(topo, s.mode, p);
                $('topoFig').innerHTML = window.CircuitFigure.render(pack.doc);
                currentFigure = p ? pack : null;
            } catch (err) { $('topoFig').textContent = '电路图加载失败：' + err.message; error = err.message; }
            figureLink.set(!!currentFigure, error ? error + '；图纸不使用旧数值。' : '');
        }
        function cancelPending() { if (debounce !== null) window.clearTimeout(debounce); debounce = null; runner.invalidate(); }
        function start() {
            debounce = null;
            try { var s = stores[topo]; runner.start(parseInputs(topo, s.raw, s.unit, s.mode)); }
            catch (err) { $('cancelCalculation').disabled = true; $('waveArea').setAttribute('aria-busy', 'false'); status(err.message + '；未生成当前输入的结果。', true); }
        }
        function changed() {
            schematic(); cancelPending(); markStale(); $('cancelCalculation').disabled = false; $('waveArea').setAttribute('aria-busy', 'true');
            status('参数已改变；旧结果已过期，等待重新计算。'); debounce = window.setTimeout(start, 150);
        }
        function select(name) {
            cancelPending(); topo = name; var s = initStore(name); locks = {}; result = null; cards = [];
            $('waveArea').replaceChildren(); $('dcParams').textContent = '等待当前拓扑计算'; $('diagnostics').textContent = '尚无当前拓扑结果';
            document.querySelectorAll('.topo-btn[data-topo]').forEach(function (btn) {
                var active = btn.dataset.topo === name; btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', String(active));
            });
            $('parameterFields').replaceChildren();
            E.specs[name].fields.forEach(function (key) {
                var def = E.fields[key], field = document.createElement('div'); field.className = 'field';
                var label = document.createElement('label'); label.htmlFor = 'param-' + key; label.textContent = def.label;
                var line = document.createElement('div'); line.className = 'pe-input-line';
                var input = document.createElement('input'); input.type = 'number'; input.id = 'param-' + key; input.step = 'any'; input.min = key === 'D' ? '1' : '0';
                if (key === 'D') input.max = topo === 'dsd' ? '50' : '99';
                input.value = s.raw[key]; input.required = true;
                input.addEventListener('input', function () { s.raw[key] = input.value; changed(); });
                line.appendChild(input);
                if (key === 'Iout') {
                    var selectUnit = document.createElement('select'); selectUnit.id = 'iLoadUnit'; selectUnit.setAttribute('aria-label', '负载电流单位');
                    ['A', 'mA'].forEach(function (u) { var opt = document.createElement('option'); opt.value = opt.textContent = u; selectUnit.appendChild(opt); });
                    selectUnit.value = s.unit;
                    selectUnit.addEventListener('change', function () {
                        s.raw.Iout = convertCurrent(s.raw.Iout, s.unit, selectUnit.value); s.unit = selectUnit.value; input.value = s.raw.Iout; changed();
                    }); line.appendChild(selectUnit);
                } else { var unit = document.createElement('span'); unit.textContent = def.unit; line.appendChild(unit); }
                field.append(label, line); $('parameterFields').appendChild(field);
            });
            $('modeField').hidden = name !== 'buck'; $('modeSel').value = s.mode;
            $('topoDescText').textContent = E.specs[name].description; changed();
        }
        function row(label, value) {
            var el = document.createElement('div'); el.className = 'dc-row';
            var name = document.createElement('span'); name.textContent = label;
            var data = document.createElement('span'); data.className = 'dc-val'; data.textContent = value; el.append(name, data); return el;
        }
        function showResult() {
            $('dcParams').replaceChildren();
            var vo = result.channels.find(function (ch) { return ch.id === 'Vout'; });
            [['平均 Vout', format(vo.stats.mean, 'V')], ['ΔVout 峰峰值', format(vo.stats.pp, 'V')], ['工作模式', result.mode],
                ['开关周期 T', format(result.period, 's')], ['输入功率', format(result.diagnostics.Pin, 'W')], ['输出功率', format(result.diagnostics.Pout, 'W')]]
                .forEach(function (r) { $('dcParams').appendChild(row(r[0], r[1])); });
            result.channels.filter(function (ch) { return ['iL', 'im', 'i1', 'i2', 'iSum', 'vCf'].includes(ch.id); }).forEach(function (ch) {
                $('dcParams').appendChild(row('Δ' + ch.id, format(ch.stats.pp, ch.unit)));
            });
            Object.keys(result.reference).forEach(function (key) { $('dcParams').appendChild(row(key, format(result.reference[key], 'Hz'))); });
            $('diagnostics').textContent = JSON.stringify({ 模型: result.assumptions, 输入_SI: result.params, 模式: result.mode,
                周期闭合归一化残差: result.diagnostics.closure, 电荷及伏秒归一化残差: result.diagnostics.balances,
                功率归一化误差: result.diagnostics.powerError, 采样加密最大变化: result.diagnostics.refinement,
                计算次数: result.diagnostics.evaluations, 边界提示: result.warnings, 切换事件_t除以T: result.events }, null, 2);
            $('waveArea').replaceChildren(); cards = [];
            result.channels.forEach(function (ch) {
                var card = document.createElement('section'); card.className = 'paper-card pe-channel'; card.dataset.channel = ch.id;
                var title = document.createElement('h3'); title.textContent = ch.label;
                var metrics = document.createElement('dl'); metrics.className = 'pe-metrics';
                [['最小', 'min'], ['最大', 'max'], ['平均', 'mean'], ['RMS', 'rms'], ['峰峰值', 'pp']].forEach(function (pair) {
                    var box = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
                    dt.textContent = pair[0]; dd.textContent = format(ch.stats[pair[1]], ch.unit); box.append(dt, dd); metrics.appendChild(box);
                });
                var canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', ch.label + '；数值见上方统计');
                canvas.setAttribute('role', 'img'); canvas.tabIndex = 0;
                var cursor = document.createElement('p'); cursor.className = 'pe-cursor'; cursor.textContent = '移动指针查看读数；聚焦图形后按 ←/→ 移动光标。';
                card.append(title, metrics, canvas, cursor); $('waveArea').appendChild(card);
                var item = { channel: ch, canvas: canvas, cursor: cursor, position: null }; cards.push(item);
                canvas.addEventListener('pointermove', function (event) {
                    var rect = canvas.getBoundingClientRect(); item.position = Math.max(0, Math.min(1, (event.clientX - rect.left - 92) / Math.max(1, rect.width - 108))); draw(item);
                });
                canvas.addEventListener('pointerleave', function () { item.position = null; draw(item); });
                canvas.addEventListener('keydown', function (event) {
                    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                    event.preventDefault(); item.position = Math.max(0, Math.min(1, (item.position || 0) + (event.key === 'ArrowRight' ? 0.005 : -0.005))); draw(item);
                });
            });
            redraw();
        }
        function draw(item) {
            if (!result) return;
            var ch = item.channel, canvas = item.canvas, ctx = canvas.getContext('2d'); if (!ctx) return;
            var w = Math.max(160, canvas.clientWidth || 600), h = 200, dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = h + 'px'; ctx.scale(dpr, dpr);
            var css = window.getComputedStyle(document.documentElement);
            var ink = css.getPropertyValue('--color-text').trim() || '#444', grid = css.getPropertyValue('--color-border').trim() || '#ccc';
            var accent = css.getPropertyValue('--color-primary').trim() || '#3a5a8c', bg = css.getPropertyValue('--color-card-bg').trim() || '#fff';
            var top = 24, left = 92, right = w - 16, bottom = 160, count = Number($('ncycle').value);
            var ac = ch.id === 'Vout' && $('voltageView').value === 'ac', offset = ac ? ch.stats.mean : 0;
            var lo = ch.stats.min - offset, hi = ch.stats.max - offset, pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 1e-6, 1e-12);
            var key = result.params.topo + ':' + ch.id + ':' + (ac ? 'ac' : 'dc'), locked = $('axisMode').value === 'locked';
            var range = locked && locks[key] ? locks[key] : [lo - pad, hi + pad];
            if (locked && !locks[key]) locks[key] = range.slice();
            var clipped = lo < range[0] || hi > range[1];
            function X(t) { return left + t / count * (right - left); }
            function Y(v) { return bottom - (v - range[0]) / (range[1] - range[0]) * (bottom - top); }
            ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.font = '11px monospace'; ctx.fillStyle = ink;
            ctx.textAlign = 'left';
            var hint = ac ? 'Δvo；平均 ' + format(ch.stats.mean, 'V') : ch.unit === '逻辑' ? '逻辑 0/1，非 VGS' : ch.unit;
            ctx.fillText(hint + (clipped ? ' · 超出锁定范围' : ''), left, 14, right - left);
            for (var r = 0; r <= 4; r++) {
                var value = range[0] + (range[1] - range[0]) * r / 4, y = Y(value);
                ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
                ctx.fillStyle = ink; ctx.textAlign = 'right'; ctx.fillText(format(value, ch.unit), left - 8, y + 4);
            }
            for (var c = 0; c < count; c++) {
                result.phases.forEach(function (phase, i) {
                    var startTime = i ? result.phases[i - 1].end : 0;
                    if (phase.g) { ctx.globalAlpha = 0.065; ctx.fillStyle = accent; ctx.fillRect(X(c + startTime), top, X(c + phase.end) - X(c + startTime), bottom - top); ctx.globalAlpha = 1; }
                    ctx.setLineDash([4, 4]); ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(X(c + phase.end), top); ctx.lineTo(X(c + phase.end), bottom); ctx.stroke();
                });
                result.events.forEach(function (event) {
                    ctx.setLineDash([2, 3]); ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(X(c + event.t), top); ctx.lineTo(X(c + event.t), bottom); ctx.stroke();
                });
                ctx.setLineDash([]); ctx.textAlign = 'center'; ctx.fillStyle = ink;
                ctx.fillText(format((c + 1) * result.period, 's'), X(c + 1), bottom + 18);
            }
            ctx.textAlign = 'center'; ctx.fillText('0', left, bottom + 18); ctx.fillText('阴影：主开关导通；虚线：开关/二极管事件', w / 2, 196, w - 8);
            ctx.save(); ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
            ctx.beginPath(); ctx.strokeStyle = accent; ctx.lineWidth = 1.8;
            for (c = 0; c < count; c++) {
                ch.data.forEach(function (pt, j) { var x = X(c + pt.t), y = Y(pt.v - offset); if (!c && !j) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
            }
            ctx.stroke(); ctx.restore();
            if (item.position !== null) {
                var time = item.position * count, local = time === count ? 1 : time % 1, reading = sample(ch.data, local);
                ctx.strokeStyle = ink; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(X(time), top); ctx.lineTo(X(time), bottom); ctx.stroke(); ctx.setLineDash([]);
                item.cursor.textContent = (stale ? '旧结果（已过期） · ' : '') + 't=' + format(time * result.period, 's') + ' · ' + ch.id + '=' + format(reading, ch.unit) + (ac ? ' · Δvo=' + format(reading - offset, 'V') : '');
            } else item.cursor.textContent = (stale ? '旧结果（已过期） · ' : '') + '移动指针查看读数；聚焦图形后按 ←/→ 移动光标。';
        }
        function redraw() {
            cards.forEach(draw);
            $('scaleHint').textContent = $('axisMode').value === 'locked' ? '纵轴已锁定：参数改变后保留范围；超范围会在对应图上提示。' : '自动缩放：曲线高度相近不代表纹波相同，请比较峰峰值和刻度。';
        }
        document.querySelectorAll('.topo-btn[data-topo]').forEach(function (btn) { btn.addEventListener('click', function () { select(btn.dataset.topo); }); });
        $('modeSel').addEventListener('change', function () { stores[topo].mode = $('modeSel').value; changed(); });
        $('recalculate').addEventListener('click', function () { cancelPending(); markStale(); start(); });
        $('cancelCalculation').addEventListener('click', function () {
            cancelPending(); markStale(); $('cancelCalculation').disabled = true; $('waveArea').setAttribute('aria-busy', 'false'); status('计算已取消；旧结果已过期，不可导出。');
        });
        ['ncycle', 'voltageView', 'axisMode'].forEach(function (id) { $(id).addEventListener('change', function () { if (id === 'axisMode') locks = {}; redraw(); }); });
        $('exportCsv').addEventListener('click', function () {
            if (stale || !result) return;
            var blob = new window.Blob([E.csv(result)], { type: 'text/csv;charset=utf-8' }), url = window.URL.createObjectURL(blob);
            var link = document.createElement('a'); link.href = url; link.download = result.params.topo + '-steady-state.csv'; document.body.appendChild(link); link.click(); link.remove();
            window.setTimeout(function () { window.URL.revokeObjectURL(url); }, 1000);
        });
        new window.MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        if (window.ResizeObserver) new window.ResizeObserver(redraw).observe($('waveArea')); else window.addEventListener('resize', redraw);
        window.addEventListener('beforeunload', cancelPending); select('buck');
    }
    return { format: format, parseInputs: parseInputs, convertCurrent: convertCurrent, sample: sample, createRunner: createRunner, mount: mount };
}));

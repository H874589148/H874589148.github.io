/* TF 宿主：同源画布协议、独立工程存档、Worker 生命周期及结果展示。 */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var fmt = function (n) { return n == null || !Number.isFinite(n) ? '—' : n === 0 ? '0' : Number(n.toPrecision(8)).toString(); };
    var KEY = 'ee-transfer-function-v1', frame = $('ckFrame'), connected = false, initialized = false, transaction = false;
    var waiters = new Map(), requestId = 0, revision = -1, docRevision = -1, latestDoc = null, kind = 'voltage';
    var worker = null, timer = null, job = 0, sequence = 0, pending = false, current = null, storeLocked = false;
    var charts = {}, plottedNumeric = null, plottedSweep = null, mathPromise = null, mathSequence = 0;
    var frequency = { auto: true, min: 1, max: 1e9 };
    function status(text, error) { $('status').textContent = text; $('status').dataset.error = String(!!error); }
    function storage(text, error) { $('storageStatus').textContent = text; $('storageStatus').dataset.error = String(!!error); }
    function frequencyValid(f) {
        if (!f || typeof f.auto !== 'boolean' || !Number.isFinite(f.min) || !Number.isFinite(f.max) || f.min < 1e-150 || f.max > 1e150 || f.max <= f.min) throw new Error('频率范围需满足 0 < 起始 < 终止，且在 1e-150～1e150 Hz 内');
        return { auto: f.auto, min: f.min, max: f.max };
    }
    function projectValid(p) {
        if (!p || p.version !== 1 || !['voltage', 'current'].includes(p.inputKind)) throw new Error('不是受支持的 TF v1 工程');
        TFNetlist.validateDoc(p.doc);
        return { version: 1, doc: p.doc, inputKind: p.inputKind, frequency: frequencyValid(p.frequency) };
    }
    function frequencyUI() {
        $('autoFrequency').checked = frequency.auto; $('frequencyMin').value = frequency.min; $('frequencyMax').value = frequency.max;
        $('frequencyMin').disabled = $('frequencyMax').disabled = frequency.auto;
    }
    function readFrequency() {
        return frequencyValid({ auto: $('autoFrequency').checked, min: Number($('frequencyMin').value), max: Number($('frequencyMax').value) });
    }
    function persist() {
        if (!initialized || transaction || !latestDoc || docRevision !== revision) return;
        if (storeLocked) { storage('原存档无法读取，已保留；请先导出备份或明确载入示例/工程、清空后再保存。', true); return; }
        try {
            localStorage.setItem(KEY, JSON.stringify({ version: 1, doc: latestDoc, inputKind: kind, frequency: frequency }));
            storage('TF 工程已自动保存（独立存档）');
        } catch (err) { storage('保存失败：' + err.message + '；请导出工程 JSON 备份。', true); }
    }
    function request(type, data) {
        return new Promise(function (resolve, reject) {
            if (!connected) return reject(new Error('画布尚未就绪'));
            var id = 'tf-' + (++requestId);
            var timeout = setTimeout(function () { waiters.delete(id); reject(new Error('画布响应超时，请检查页面是否加载完整')); }, type === 'tf-export' ? 15000 : 5000);
            waiters.set(id, { resolve: resolve, reject: reject, timer: timeout, type: type === 'tf-get-doc' ? 'tf-doc' : 'tf-ack' });
            try { frame.contentWindow.postMessage(Object.assign({ type: type, requestId: id }, data || {}), location.origin); }
            catch (err) { clearTimeout(timeout); waiters.delete(id); reject(err); }
        });
    }
    function syncTheme() {
        if (connected) request('tf-set-theme', { theme: Theme.get() }).catch(function (err) { status('画布主题同步失败：' + err.message, true); });
    }
    function snapshot() {
        return request('tf-get-doc').then(function (d) {
            if (d.editing) throw new Error('请先确认或取消画布中的参数或文字草稿');
            if (!d.doc || !['voltage', 'current'].includes(d.inputKind)) throw new Error('画布响应格式无效');
            accept(d); return d;
        });
    }
    CircuitHandoff.toolbar(frame.parentNode, '传递函数', function () {
        if (transaction) throw new Error('正在载入工程，请稍后重试');
        return snapshot().then(function (d) {
            var doc = CircuitHandoff.clone(d.doc);
            doc.analysisContext = { version: 1, kind: 'tf' }; doc.inputKind = d.inputKind;
            return { doc: doc, title: '当前小信号画布', context: { module: 'transfer-function', analysis: 'tf', inputKind: d.inputKind } };
        });
    });
    function stop() {
        sequence++; pending = false;
        if (worker) worker.terminate(); worker = null;
        clearTimeout(timer); timer = null; updateActions();
    }
    function expire() {
        stop();
        if (current) { current.stale = true; $('stale').hidden = false; $('resultState').textContent = '结果已过期'; }
        updateActions();
    }
    function accept(d) {
        if (!Number.isInteger(d.revision) || d.revision < revision) return;
        if (d.revision !== revision) { revision = d.revision; if (current && current.revision !== revision || pending) expire(); }
        if (['voltage', 'current'].includes(d.inputKind)) { kind = d.inputKind; $('inputKind').value = kind; }
        if (d.doc) { latestDoc = d.doc; docRevision = d.revision; persist(); }
    }
    function updateActions() {
        document.querySelectorAll('[data-editor-action]').forEach(function (el) { el.disabled = !initialized || transaction; });
        $('cancel').disabled = !worker && !pending;
        $('results').setAttribute('aria-busy', String(!!worker || pending));
        var fresh = !!current && !current.stale && !worker && !pending && !transaction;
        $('copySymbolic').disabled = $('copySymbolicTex').disabled = !fresh || !current.symbolic;
        $('copyNumeric').disabled = $('copyNumericTex').disabled = !fresh || !current.numeric || !!current.numeric.missing.length;
        $('exportCsv').disabled = !fresh || !current.sweep || !current.sweep.reliable;
    }
    async function replaceProject(project, ask) {
        if (transaction) return;
        project = projectValid(project);
        if (ask) {
            await snapshot();
            if (!confirm('替换当前图纸？画布内 Ctrl+Z 可恢复图纸。')) return;
        }
        transaction = true; expire(); updateActions();
        try {
            await request('tf-load-doc', { doc: project.doc, inputKind: project.inputKind });
            frequency = project.frequency; frequencyUI();
            var d = await snapshot();
            kind = d.inputKind; initialized = true;
            if (ask) storeLocked = false;
            status('图纸已载入；点击「生成传递函数」开始计算。');
        } finally { transaction = false; updateActions(); persist(); }
    }
    function issue(message) { if (current) { current.notes.push(message); renderDiagnostics(); } }
    function deadline(ms, stage) {
        clearTimeout(timer);
        timer = setTimeout(function () {
            if (current && current.symbolic && !current.symbolic.expanded) current.symbolic.reason = '符号未完成展开，保留精确矩阵表达';
            stop(); issue(stage + '超时，后台任务已终止；已完成的结果保留。');
            status(stage + '超时。可调整电路或参数后重新生成。', true); renderResults();
        }, ms);
    }
    async function generate() {
        stop(); var ticket = sequence; pending = true; updateActions();
        try {
            var f = readFrequency(), d = await snapshot();
            if (ticket !== sequence) return;
            var net = TFNetlist.build(d.doc, Razavi.portsWorld, d.inputKind);
            frequency = f; persist();
            current = { revision: d.revision, frequency: JSON.stringify(f), inputKind: d.inputKind, net: net, notes: [], stale: false, symbolic: null, numeric: null, sweep: null };
            clearCharts(); renderResults();
            var id = ++job, w = new Worker('worker.js'); worker = w; pending = false;
            status('正在精确计算数值传递函数与直接 MNA 扫频…'); updateActions(); deadline(15000, '数值计算');
            w.onmessage = function (event) {
                var m = event.data;
                if (worker !== w || !m || m.jobId !== id || m.revision !== revision || current.stale) return;
                if (m.type === 'matrix' || m.type === 'symbolic') current.symbolic = m.symbolic;
                else if (m.type === 'numeric') current.numeric = m.numeric;
                else if (m.type === 'sweep') current.sweep = m.sweep;
                else if (m.type === 'issue') issue(m.message);
                else if (m.type === 'stage' && m.stage === 'symbolic') { deadline(5000, '符号展开'); status('数值通道已结束，正在展开符号表达式…'); }
                else if (m.type === 'done') { stop(); status(current.notes.length ? '计算结束，部分通道有诊断，请查看下方信息。' : '计算完成。请结合内部模态与诊断使用结果。'); }
                else if (m.type === 'error') { stop(); issue('后台计算失败：' + m.message); status('计算失败，请查看诊断。', true); }
                renderResults();
            };
            w.onerror = function (e) { if (worker !== w) return; e.preventDefault(); stop(); issue('Worker 错误：' + (e.message || '脚本加载失败')); status('后台任务异常，未转到主线程重试。', true); renderResults(); };
            w.onmessageerror = function () { if (worker !== w) return; stop(); issue('Worker 数据无法解码'); status('后台响应无效，请重新生成。', true); renderResults(); };
            w.postMessage({ type: 'compute', jobId: id, revision: d.revision, net: net, frequency: f });
        } catch (err) {
            if (ticket !== sequence) return;
            stop(); if (current) { current.stale = true; $('stale').hidden = false; } updateActions(); status(err.message, true);
        }
    }
    function table(headers, rows) { return '<table><thead><tr>' + headers.map(function (s) { return '<th>' + esc(s) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (row) { return '<tr>' + row.map(function (s) { return '<td>' + esc(s) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; }
    function rootPosition(r) { return fmt(r.re) + (r.im < 0 ? ' − j' : ' + j') + fmt(Math.abs(r.im)); }
    function rootRows(label, set) {
        if (!set.ok) return [[label, set.error, '—', '—', '—']];
        if (!set.roots.length) return [[label, set.zeroTransfer ? '零传递：不定义离散有限零点' : '无有限根', '—', '—', '—']];
        return set.roots.map(function (r) { return [label, rootPosition(r), r.multiplicity, r.re === 0 ? (r.im === 0 ? '原点' : '虚轴') : r.re > 0 ? '右半平面' : '左半平面', fmt(Math.hypot(r.re, r.im) / (2 * Math.PI))]; });
    }
    function renderDiagnostics() {
        if (!current) return;
        var notes = current.net.warnings.concat(current.notes, current.numeric && current.numeric.warnings || [], current.sweep && current.sweep.warnings || []);
        if (current.symbolic && current.symbolic.reason) notes.push(current.symbolic.reason);
        if (current.numeric && current.numeric.zeroTransfer) notes.push('传递函数恒为零：幅值为零（−∞ dB），相位未定义，曲线不伪造有限值。');
        $('diagnostics').innerHTML = Array.from(new Set(notes)).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    }
    function renderResults() {
        if (!current) return;
        var n = current.numeric, s = current.symbolic, net = current.net;
        $('stale').hidden = !current.stale;
        $('resultState').textContent = current.stale ? '结果已过期' : worker || pending ? '计算中' : current.notes.length ? '含诊断 / 部分结果' : n && n.missing.length ? '仅符号结果' : '计算结果';
        $('resultIdentity').textContent = (current.inputKind === 'current' ? 'Zt(s)' : 'H(s)') + ' = ' + net.outputName + ' / ' + net.inputName + ' · ' + (current.inputKind === 'current' ? 'Ω / dBΩ' : 'V/V / dB') + ' · ' + net.nodeCount + ' 个非地节点 · ' + net.devices.length + ' 个器件 · revision ' + current.revision;
        $('parameters').querySelector('tbody').innerHTML = net.devices.map(function (d) { var unit = d.kind === 'R' ? 'Ω' : d.kind === 'C' ? 'F' : 'S'; return '<tr>' + [d.symbol, d.kind, d.value.trim() ? d.value + ' ' + d.prefix + unit : '未赋值', d.numeric == null ? '—' : fmt(d.numeric) + ' ' + unit].map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('');
        $('symbolicText').textContent = s ? s.text : '等待符号结果'; $('symbolicState').textContent = s ? s.expanded ? '已展开' : '未展开 · 精确矩阵形式' : '';
        $('numericText').textContent = n ? n.missing.length ? '缺少参数：' + n.missing.join('、') + '；仅生成符号式。' : n.text : '数值结果尚不可用';
        $('coefficients').textContent = n && !n.missing.length ? 'N = [' + n.num.slice().reverse().map(fmt).join(', ') + ']\nD = [' + n.den.slice().reverse().map(fmt).join(', ') + ']\n精确 N = [' + n.exactNum.slice().reverse().map(function (q) { return q[0] + '/' + q[1]; }).join(', ') + ']\n精确 D = [' + n.exactDen.slice().reverse().map(function (q) { return q[0] + '/' + q[1]; }).join(', ') + ']' : '—';
        $('roots').innerHTML = n && !n.missing.length ? table(['类别', 'σ ± jω / rad/s', '重数', '位置', '|s|/(2π) / Hz'], rootRows('零点', n.zeros).concat(rootRows('极点', n.poles), rootRows('精确相消模态', n.hidden))) : '等待完整参数的数值结果';
        if (s) {
            $('matrix').textContent = 'x = [' + s.matrix.variables.join(', ') + ']ᵀ\nA(s) =\n' + s.matrix.a.map(function (row) { return '[ ' + row.join(' , ') + ' ]'; }).join('\n') + '\nb = [' + s.matrix.b.join(', ') + ']ᵀ\n输出列 = ' + s.matrix.outputColumn + (s.matrix.outputColumn === 0 ? '（输出接地）' : '') + (n && n.rawDen ? '\n约分前特征分母（s 升幂精确系数）= [' + n.rawDen.map(function (q) { return q[0] + '/' + q[1]; }).join(', ') + ']' : '');
            $('mapping').innerHTML = table(['器件', '对象 ID', '引脚', '节点'], net.mapping.map(function (p) { return [p.name, p.id, p.pin, 'n' + p.node]; }));
        } else { $('matrix').textContent = '等待矩阵'; $('mapping').textContent = ''; }
        renderDiagnostics(); drawCharts(); updateActions(); renderMath();
    }
    function clearCharts() { Object.keys(charts).forEach(function (key) { charts[key].destroy(); }); charts = {}; plottedNumeric = plottedSweep = null; }
    function color(name) { return getComputedStyle(document.documentElement).getPropertyValue('--color-' + name).trim(); }
    function chartOptions(xTitle, yTitle, log) {
        return { responsive: true, maintainAspectRatio: false, animation: false, normalized: true, parsing: false,
            interaction: { mode: 'nearest', intersect: false, axis: log ? 'x' : 'xy' },
            plugins: { legend: { display: !log, labels: { color: color('text') } }, tooltip: { callbacks: {} } },
            scales: {
                x: { type: log ? 'logarithmic' : 'linear', title: { display: true, text: xTitle, color: color('text') }, ticks: { color: color('text-secondary'), callback: function (v) { return fmt(v); }, maxTicksLimit: 8 }, grid: { color: color('bg-grid') } },
                y: { title: { display: true, text: yTitle, color: color('text') }, ticks: { color: color('text-secondary') }, grid: { color: color('bg-grid') } }
            }
        };
    }
    function drawCharts() {
        if (!current || !window.Chart) return;
        var n = current.numeric, sw = current.sweep;
        if (n && !n.missing.length && plottedNumeric !== n) {
            if (charts.poles) charts.poles.destroy();
            var po = chartOptions('σ / rad/s', 'jω / rad/s', false);
            po.scales.x.suggestedMin = po.scales.y.suggestedMin = 0; po.scales.x.suggestedMax = po.scales.y.suggestedMax = 0;
            po.plugins.tooltip.callbacks.label = function (ctx) { return ctx.dataset.label + '：' + rootPosition(ctx.raw.root) + '，重数 ' + ctx.raw.root.multiplicity; };
            charts.poles = new Chart($('poleChart'), { type: 'scatter', options: po, data: { datasets: [['零点', n.zeros, 'circle', 'primary'], ['极点', n.poles, 'crossRot', 'accent'], ['精确相消模态', n.hidden, 'triangle', 'text-muted']].map(function (s) { return { label: s[0], data: s[1].ok ? s[1].roots.map(function (r) { return { x: r.re, y: r.im, root: r }; }) : [], pointStyle: s[2], pointRadius: 6, pointBorderWidth: 2, borderColor: color(s[3]), backgroundColor: color('card-bg') }; }) } });
            plottedNumeric = n;
        }
        if (sw && plottedSweep !== sw) {
            [['magnitudeChart', 'db', current.inputKind === 'current' ? '幅值 / dBΩ（相对 1 Ω）' : '幅值 / dB（相对 1 V/V）', 'primary'], ['phaseChart', 'phase', '相位 / °', 'accent']].forEach(function (cfg) {
                if (charts[cfg[0]]) charts[cfg[0]].destroy();
                var options = chartOptions('频率 / Hz', cfg[2], true);
                options.plugins.tooltip.callbacks.title = function (rows) { return rows.length ? fmt(rows[0].parsed.x) + ' Hz' : ''; };
                options.plugins.tooltip.callbacks.label = function (ctx) { var r = sw.rows[ctx.dataIndex]; return ['幅值：' + fmt(r.db) + (current.inputKind === 'current' ? ' dBΩ' : ' dB'), '相位：' + fmt(r.phase) + '°', 'Re：' + fmt(r.re) + '，Im：' + fmt(r.im)]; };
                charts[cfg[0]] = new Chart($(cfg[0]), { type: 'line', options: options, data: { datasets: [{ data: sw.rows.map(function (r) { return { x: r.f, y: r[cfg[1]] }; }), borderColor: color(cfg[3]), borderWidth: 2, pointRadius: 0, pointHitRadius: 5, spanGaps: false, tension: 0 }] } });
            });
            $('sweepStatus').textContent = fmt(sw.min) + ' ～ ' + fmt(sw.max) + ' Hz · ' + sw.rows.length + ' 点 · ' + (sw.reliable ? 'MNA / N(s)/D(s) 抽样对照通过' : '数值对照存在差异，CSV 导出已禁用');
            plottedSweep = sw;
        } else if (!sw) $('sweepStatus').textContent = '暂无频响结果；完整参数下将直接求解 MNA。';
    }
    function loadMath() {
        if (mathPromise) return mathPromise;
        mathPromise = new Promise(function (resolve, reject) {
            window.MathJax = { startup: { typeset: false }, options: { enableMenu: false }, svg: { fontCache: 'local' } };
            var script = document.createElement('script'), timeout = setTimeout(function () { reject(new Error('加载超时')); }, 8000);
            script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js'; script.async = true;
            script.onload = function () { clearTimeout(timeout); if (MathJax.startup && MathJax.startup.promise) MathJax.startup.promise.then(resolve, reject); else reject(new Error('MathJax 未初始化')); };
            script.onerror = function () { clearTimeout(timeout); reject(new Error('加载失败')); }; document.head.appendChild(script);
        });
        return mathPromise;
    }
    function renderMath() {
        var token = ++mathSequence, cur = current;
        $('symbolicMath').textContent = $('numericMath').textContent = '';
        if (!cur || !cur.symbolic) return;
        loadMath().then(async function () {
            if (token !== mathSequence) return;
            for (var part of [['symbolicMath', cur.symbolic], ['numericMath', cur.numeric]]) {
                if (!part[1] || !part[1].latex) continue;
                var node = await MathJax.tex2svgPromise(part[1].latex, { display: true });
                if (token !== mathSequence) return;
                $(part[0]).replaceChildren(node);
            }
            $('mathStatus').textContent = 'MathJax 排版已就绪；纯文本和 LaTeX 均可复制。';
        }).catch(function () { $('mathStatus').textContent = 'MathJax 不可用，已保留完整纯文本；计算与图表不受影响。'; });
    }
    function download(text, name, type) {
        var url = URL.createObjectURL(new Blob([text], { type: type })), a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    async function freshResult() {
        var r = current, d = await snapshot();
        if (!r || r !== current || r.stale || worker || pending || r.revision !== d.revision || r.frequency !== JSON.stringify(readFrequency())) throw new Error('结果已过期或未完成，请重新生成');
        return r;
    }
    function action(fn) { return function () { Promise.resolve().then(fn).catch(function (err) { status(err.message, true); }); }; }
    $('generate').addEventListener('click', generate);
    $('cancel').addEventListener('click', function () { stop(); issue('已取消计算，未完成部分不作为计算成功；已返回的精确结果保留。'); status('计算已取消。'); renderResults(); });
    $('inputKind').addEventListener('change', action(async function () {
        var next = $('inputKind').value; $('inputKind').value = kind;
        await request('tf-set-input-kind', { inputKind: next }); await snapshot();
        status('激励已切换，请重新生成；单位将随电压增益或跨阻变化。');
    }));
    Object.keys(TFExamples.names).forEach(function (key) { var opt = document.createElement('option'); opt.value = key; opt.textContent = TFExamples.names[key]; $('example').appendChild(opt); });
    $('example').addEventListener('change', action(async function () { var key = $('example').value; $('example').value = ''; if (key) await replaceProject(TFExamples.create(key, Razavi), true); }));
    $('clear').addEventListener('click', action(function () { return replaceProject({ version: 1, doc: { items: [], groups: [] }, inputKind: kind, frequency: frequency }, true); }));
    $('importProject').addEventListener('click', function () { $('projectFile').click(); });
    $('projectFile').addEventListener('change', action(async function () {
        var file = $('projectFile').files[0]; $('projectFile').value = ''; if (!file) return;
        if (file.size > 2 * 1024 * 1024) throw new Error('工程文件不能超过 2 MB');
        var project; try { project = projectValid(JSON.parse(await file.text())); } catch (err) { throw new Error('工程未导入：' + err.message); }
        await replaceProject(project, true);
    }));
    $('exportProject').addEventListener('click', action(async function () { var d = await snapshot(); download(JSON.stringify({ version: 1, doc: d.doc, inputKind: d.inputKind, frequency: readFrequency() }, null, 2), 'transfer-function.json', 'application/json'); }));
    ['Svg', 'Png'].forEach(function (fmt) { $('export' + fmt).addEventListener('click', action(function () { return request('tf-export', { format: fmt.toLowerCase() }); })); });
    ['Symbolic', 'Numeric'].forEach(function (name) { ['', 'Tex'].forEach(function (suffix) {
        $('copy' + name + suffix).addEventListener('click', action(async function () {
            var r = await freshResult(), value = r[name.toLowerCase()];
            if (!value || !value.text) throw new Error('没有可复制的表达式');
            var text = suffix ? value.latex : value.text;
            if (name === 'Symbolic' && !value.expanded) text += '\nA(s)x=b*u\n' + $('matrix').textContent;
            copyTextToClipboard(text, function (ok) { status(ok ? '已复制表达式。' : '复制失败，请手动选择纯文本复制。', !ok); });
        }));
    }); });
    $('exportCsv').addEventListener('click', action(async function () {
        var r = await freshResult(); if (!r.sweep || !r.sweep.reliable) throw new Error('没有可靠的频响数据可导出');
        var text = '# gain_type=' + (r.inputKind === 'current' ? 'transimpedance_V_per_A' : 'voltage_V_per_V') + '\r\nfrequency_Hz,real,imag,magnitude,magnitude_dB,phase_deg\r\n';
        text += r.sweep.rows.map(function (row) { return [row.f, row.re, row.im, row.magnitude, row.db, row.phase].map(function (v) { return v == null ? '' : String(v); }).join(','); }).join('\r\n');
        download(text, 'transfer-function-frequency.csv', 'text/csv;charset=utf-8');
    }));
    ['autoFrequency', 'frequencyMin', 'frequencyMax'].forEach(function (id) { $(id).addEventListener('input', function () {
        $('frequencyMin').disabled = $('frequencyMax').disabled = $('autoFrequency').checked; expire();
        try { frequency = readFrequency(); persist(); status('频率设置已改变，请重新生成。'); } catch (err) { status(err.message, true); }
    }); });
    window.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); action(async function () { await snapshot(); persist(); })(); } });
    window.addEventListener('message', function (event) {
        if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
        var d = event.data;
        if (!d || typeof d !== 'object' || !Number.isInteger(d.revision) || d.revision < 0) return;
        if (d.type === 'tf-ready' && !connected) {
            connected = true; clearTimeout(readyTimer); syncTheme();
            replaceProject(initial, false).catch(function (err) { status('初始化失败：' + err.message, true); }); return;
        }
        if (d.type === 'tf-doc' || d.type === 'tf-ack') {
            var w = waiters.get(d.requestId);
            if (!w || d.type !== w.type) return;
            clearTimeout(w.timer); waiters.delete(d.requestId);
            if (d.error) w.reject(new Error(String(d.error))); else w.resolve(d); return;
        }
        if (d.type === 'tf-doc-changed' && initialized && !transaction) accept(d);
        if (d.type === 'tf-save' && initialized) action(async function () { await snapshot(); persist(); })();
        if (d.type === 'tf-theme-changed' && ['light', 'dark'].includes(d.theme) && Theme.get() !== d.theme) Theme.set(d.theme);
    });
    new MutationObserver(function () { syncTheme(); if (current) { clearCharts(); drawCharts(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('beforeunload', function () { persist(); if (worker) worker.terminate(); });
    var initial = TFExamples.create('gm', Razavi);
    try { var saved = localStorage.getItem(KEY); if (saved) initial = projectValid(JSON.parse(saved)); }
    catch (err) { storeLocked = true; storage('原 TF 存档读取失败，未覆盖原数据：' + err.message, true); }
    var readyTimer = setTimeout(function () { if (!initialized) status('画布未连接。请通过 HTTP(S) 打开页面，并检查本地脚本加载。', true); }, 15000);
    frequencyUI(); updateActions();
    frame.src = '../circuit-sketch/index.html?embed=tf&devices=tf-in,tf-out,transconductance-4t,resistor,capacitor,ground,dot';
})();

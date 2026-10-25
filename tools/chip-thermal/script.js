/* 芯片发热估算：表单、表格、Worker 接线及热图。数值公式只在 thermal-core.js 中实现。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./thermal-core.js'));
    else { root.ChipThermalUI = factory(root.ThermalCore); root.ChipThermalUI.mount(document, root); }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
    'use strict';
    var TABS = ['current', 'limit', 'drop'], STORE = 'ee-chip-thermal';
    function def(label, value, units, kind) { return { label: label, value: value, units: units || [['', 1]], kind: kind || 'number' }; }
    var AMPS = [['A', 1], ['mA', 1e-3]], AREAS = [['mm²', 1e-6], ['µm²', 1e-12]];
    var DEFS = {
        ambient: def('环境温度 Ta', '25', [['℃', 1]], 'temperature'), theta: def('结到环境热阻 RθJA', '40', [['℃/W', 1]], 'positive'),
        threshold: def('结温提醒阈值', '150', [['℃', 1]], 'temperature'),
        r25: def('25℃ 导通电阻 R25', '50', [['mΩ', 1e-3], ['Ω', 1]], 'positive'), tcr: def('TCR（相对 R25）', '0.4', [['%/℃', 1]]),
        currentList: def('预设负载电流序列', '0, 0.1, 0.2, 0.5, 1, 2, 3, 5, 8, 10', AMPS, 'current-series'),
        limitList: def('预设允许结温序列', '85, 100, 125, 150, 175, 200', [['℃', 1]], 'temperature-series'),
        currentCustom: def('自定义负载电流', '1', AMPS, 'nonnegative'), limitCustom: def('自定义允许结温', '150', [['℃', 1]], 'temperature'),
        dropCustom: def('自定义负载电流', '1', AMPS, 'nonnegative'), voltage: def('主管两端压降幅值 |VDS|', '0.5', [['V', 1], ['mV', 1e-3]], 'nonnegative'),
        area: def('芯片总面积', '4', AREAS, 'positive'), aspect: def('芯片长宽比（X/Y）', '1', null, 'positive'),
        thickness: def('芯片厚度', '300', [['µm', 1e-6], ['mm', 1e-3]], 'positive'),
        diffusivity: def('热扩散率 α', '80', [['mm²/s', 1e-6]], 'positive'), heatCapacity: def('体积热容 Cv', '1.63', [['MJ/(m³·K)', 1e6]], 'positive'),
        initial: def('初始结温 T0', '25', [['℃', 1]], 'temperature'), n: def('温度网格', '64', null, 'grid'),
        time: def('观察时刻', '10', [['ms', 1e-3], ['s', 1]], 'nonnegative'), timeEnd: def('时间滑块上限', '1', [['s', 1], ['ms', 1e-3]], 'positive'),
        colorLow: def('色标下限', '25', [['℃', 1]], 'temperature'), colorHigh: def('色标上限', '150', [['℃', 1]], 'temperature')
    };
    var SOURCE_DEFS = {
        name: def('热源名称', '', null, 'text'), area: def('区域面积', '0.0625', AREAS, 'positive'), aspect: def('长宽比（X/Y）', '1', null, 'positive'),
        x: def('中心 X', '25', [['%', 0.01]]), y: def('中心 Y', '25', [['%', 0.01]]),
        power: def('固定功耗', '0.1', [['W', 1], ['mW', 1e-3]], 'nonnegative')
    };
    function object(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    function rawFields(defs, saved) {
        saved = object(saved);
        var input = object(saved.input), units = object(saved.units), out = { input: {}, units: {} };
        Object.keys(defs).forEach(function (k) {
            out.input[k] = typeof input[k] === 'string' ? input[k].slice(0, defs[k].kind.indexOf('series') !== -1 ? 4096 : 256) : defs[k].value;
            var u = units[k];
            out.units[k] = typeof u === 'string' && defs[k].units.some(function (p) { return String(p[1]) === u; }) ? u : String(defs[k].units[0][1]);
        });
        return out;
    }
    function sourceState(main, saved) {
        var s = rawFields(SOURCE_DEFS, saved), old = object(saved), inp = object(old.input);
        if (typeof inp.name !== 'string') s.input.name = main ? '主功率管' : '附加热源';
        s.input.name = s.input.name.slice(0, 60);
        if (main) {
            if (typeof inp.area !== 'string') s.input.area = '0.25';
            if (typeof inp.x !== 'string') s.input.x = '50';
            if (typeof inp.y !== 'string') s.input.y = '50';
        }
        s.enabled = main || old.enabled === true;
        return s;
    }
    function restore(raw) {
        var saved;
        try { saved = object(JSON.parse(raw)); } catch (e) { saved = {}; }
        if (saved.version !== undefined && saved.version !== 1) saved = {};
        var s = rawFields(DEFS, saved);
        s.version = 1; s.tab = TABS.indexOf(saved.tab) !== -1 ? saved.tab : 'current';
        s.follow = saved.follow !== false; s.steady = saved.steady === true; s.paletteDefault = saved.paletteDefault !== false;
        s.selection = typeof saved.selection === 'string' && /^(?:custom|i:[+\-\deE.]+)$/.test(saved.selection) ? saved.selection : 'custom';
        s.sources = Array.isArray(saved.sources) && saved.sources.length ? saved.sources.slice(0, 8).map(function (v, i) { return sourceState(i === 0, v); }) : [sourceState(true)];
        if (['64', '128'].indexOf(s.input.n) === -1) s.input.n = '64';
        return s;
    }
    function read(s, key, defs) {
        var d = (defs || DEFS)[key], factor = Number(s.units[key]);
        if (d.kind === 'text') return s.input[key].slice(0, 60);
        if (d.kind.indexOf('series') !== -1) return C.series(s.input[key], factor, d.kind === 'temperature-series' ? 'temperature' : 'current');
        var v = C.number(s.input[key], factor);
        if (d.kind === 'positive') C.positive(v, d.label);
        if (d.kind === 'nonnegative') C.nonnegative(v, d.label);
        if (d.kind === 'temperature') C.temperature(v, d.label);
        if (d.kind === 'grid' && v !== 64 && v !== 128) throw new Error('网格仅支持 64 或 128');
        return v;
    }
    function changeUnit(s, key, newUnit, defs) {
        var d = (defs || DEFS)[key];
        if (!d.units.some(function (p) { return String(p[1]) === newUnit; })) throw new Error('未知单位');
        var old = Number(s.units[key]), next = Number(newUnit), selection;
        if (s.input[key].trim()) {
            if (d.kind.indexOf('series') !== -1) {
                var values = read(s, key, defs), converted = values.map(function (v) { return C.convert(String(v), 1, next); });
                if (key === 'currentList' && s.selection && s.selection !== 'custom') {
                    var index = values.indexOf(C.number(s.selection.slice(2)));
                    if (index !== -1) selection = 'i:' + C.number(converted[index], next);
                }
                s.input[key] = converted.join(', ');
            } else s.input[key] = C.convert(s.input[key], old, next);
        }
        s.units[key] = newUnit;
        if (selection) s.selection = selection;
    }
    function selectedCurrent(s) {
        if (s.selection === 'custom') return read(s, 'dropCustom');
        var value = C.number(s.selection.slice(2)), list = read(s, 'currentList');
        if (list.indexOf(value) === -1) throw new Error('所选电流已不在序列中');
        return value;
    }
    function buildConfig(s) {
        var ambient = read(s, 'ambient'), theta = read(s, 'theta'), current = selectedCurrent(s);
        var voltage = read(s, 'voltage'), power = C.constantDrop(voltage, theta, ambient, current).power;
        var time = read(s, 'time');
        if (read(s, 'timeEnd') < time) throw new Error('时间滑块上限不能小于观察时刻');
        var c = { ambient: ambient, theta: theta, threshold: read(s, 'threshold'), mainCurrent: current, voltage: voltage,
            area: read(s, 'area'), aspect: read(s, 'aspect'), thickness: read(s, 'thickness'), diffusivity: read(s, 'diffusivity'),
            heatCapacity: read(s, 'heatCapacity'), initial: s.follow ? ambient : read(s, 'initial'), n: read(s, 'n'), time: time, steady: s.steady,
            sources: s.sources.map(function (src, i) {
                if (i !== 0 && !src.enabled) return { enabled: false };
                return { name: read(src, 'name', SOURCE_DEFS), enabled: true, area: read(src, 'area', SOURCE_DEFS), aspect: read(src, 'aspect', SOURCE_DEFS),
                    x: read(src, 'x', SOURCE_DEFS), y: read(src, 'y', SOURCE_DEFS), power: i === 0 ? power : read(src, 'power', SOURCE_DEFS) };
            }) };
        C.geometry(c);
        return c;
    }
    function fmt(v) { return Number.isFinite(v) ? String(Number(v.toPrecision(7))) : '—'; }
    function tableData(s, tab) {
        var list = [], error = '', commonError = '', ambient, theta, threshold, r25, tcr, voltage;
        try { list = read(s, tab === 'limit' ? 'limitList' : 'currentList'); } catch (e) { error = e.message; }
        try {
            ambient = read(s, 'ambient'); theta = read(s, 'theta'); threshold = read(s, 'threshold');
            if (tab === 'drop') voltage = read(s, 'voltage');
            else { r25 = read(s, 'r25'); tcr = read(s, 'tcr'); C.resistanceAt(r25, tcr, ambient); }
        } catch (e) { commonError = e.message; }
        function row(key, valueFn) {
            var val, cells = Array(tab === 'drop' ? 3 : 4).fill('—'), alert = false;
            try {
                val = valueFn();
                if (commonError) throw new Error(commonError);
                var v, note = '正常（仅热模型）';
                if (tab === 'current') {
                    v = C.conduction(r25, tcr, theta, ambient, val);
                    if (v.status === 'runaway') { cells[3] = '模型预测热失稳／无稳定热平衡'; alert = true; }
                    else {
                        if (v.status === 'sensitive') note = '接近失稳，参数敏感';
                        if (v.temperature > threshold) note = '超温；' + note;
                        alert = v.temperature > threshold || v.status === 'sensitive';
                        cells = [fmt(v.temperature), fmt(v.resistance), fmt(v.power), note];
                    }
                } else if (tab === 'limit') {
                    v = C.maxCurrent(r25, tcr, theta, ambient, val);
                    if (v.status === 'ambient-over-limit') { cells[3] = '环境温度已超过允许结温'; alert = true; }
                    else { alert = val > threshold; cells = [fmt(v.resistance), fmt(v.power), fmt(v.current), alert ? '高于提醒阈值，核对器件额定' : note]; }
                } else {
                    v = C.constantDrop(voltage, theta, ambient, val); alert = v.temperature > threshold;
                    cells = [fmt(v.power), fmt(v.temperature), alert ? '超温（主管单独工作）' : note];
                }
            } catch (e) { cells[cells.length - 1] = e.message; alert = true; }
            return { key: key, value: val, cells: cells, alert: alert };
        }
        var rows = list.map(function (v) { return row('i:' + v, function () { return v; }); });
        rows.push(row('custom', function () { return read(s, tab + 'Custom'); }));
        return { rows: rows, error: [error, commonError].filter(Boolean).join('；'), exportable: !error && !commonError,
            headers: tab === 'current' ? ['负载电流 (A)', '稳态结温 (℃)', '最终电阻 (Ω)', '功耗 (W)', '状态'] : tab === 'limit' ? ['允许结温 (℃)', '导通电阻 (Ω)', '允许功耗 (W)', '最大电流 (A)', '状态'] : ['主管电流 (A)', '主管功耗 (W)', '稳态结温 (℃)', '状态'] };
    }
    function tableTSV(s, tab) {
        var d = tableData(s, tab);
        if (!d.exportable) throw new Error('当前参数或序列无效，不能导出');
        var lines = ['芯片发热估算 · ' + (tab === 'drop' ? '主管单独发热，未含其他热源' : '连续直流，线性电阻模型'),
            'Ta=' + fmt(read(s, 'ambient')) + ' ℃；RθJA=' + fmt(read(s, 'theta')) + ' ℃/W；提醒阈值=' + fmt(read(s, 'threshold')) + ' ℃'];
        lines.push(tab === 'drop' ? '|VDS|=' + fmt(read(s, 'voltage')) + ' V' : 'R25=' + fmt(read(s, 'r25')) + ' Ω；TCR=' + fmt(read(s, 'tcr')) + ' %/℃');
        lines.push(d.headers.join('\t'));
        d.rows.forEach(function (r) { lines.push([fmt(r.value) + (r.key === 'custom' ? '（自定义）' : '')].concat(r.cells).join('\t')); });
        return lines.join('\n');
    }
    function mount(doc, win) {
        var $ = function (id) { return doc.getElementById(id); }, state;
        try { state = restore(win.localStorage.getItem(STORE)); } catch (e) { state = restore(null); }
        var controls = {}, records = [], sourceViews = [], tables = {}, seq = 0;
        var worker = null, busy = false, timer = null, requestId = 0, latest = null, valid = false, plotBox = null, pending = null;
        var workerFailed = false;
        function node(tag, text, cls) { var el = doc.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; }
        function empty(el) { while (el.firstChild) el.removeChild(el.firstChild); }
        function save() {
            try { win.localStorage.setItem(STORE, JSON.stringify(state)); $('storageStatus').textContent = '设置已保存在本机；示例值不代表具体器件。'; }
            catch (e) { $('storageStatus').textContent = '本机存储不可用，本次仍可计算；刷新后可能丢失输入。'; }
        }
        function control(parent, obj, key, defs, source) {
            var d = defs[key], id = source ? 'source-' + (++seq) + '-' + key : key;
            var box = node('div', undefined, 'field-control' + (d.kind.indexOf('series') !== -1 ? ' wide' : ''));
            var label = node('label', d.label); label.htmlFor = id; box.appendChild(label);
            var row = node('div', undefined, 'unit-row'), input = node(d.kind === 'grid' ? 'select' : 'input');
            input.id = id;
            if (d.kind === 'grid') ['64', '128'].forEach(function (v) { var o = node('option', v + ' × ' + v); o.value = v; input.appendChild(o); });
            else { input.type = 'text'; input.spellcheck = false; input.autocomplete = 'off'; input.maxLength = d.kind === 'text' ? 60 : d.kind.indexOf('series') !== -1 ? 4096 : 256; }
            input.value = obj.input[key]; row.appendChild(input);
            var select = null;
            if (d.units.length > 1) {
                select = node('select'); select.setAttribute('aria-label', d.label + '单位');
                d.units.forEach(function (u) { var o = node('option', u[0]); o.value = String(u[1]); select.appendChild(o); });
                select.value = obj.units[key]; row.appendChild(select);
            } else if (d.units[0][0]) row.appendChild(node('span', d.units[0][0], 'unit-label'));
            box.appendChild(row);
            var error = node('span', '', 'field-error'); error.id = id + '-error'; input.setAttribute('aria-describedby', error.id); box.appendChild(error); parent.appendChild(box);
            var r = { obj: obj, key: key, defs: defs, input: input, select: select, error: error, source: source };
            records.push(r); if (!source) controls[key] = r;
            function changed() {
                obj.input[key] = input.value;
                if (key === 'time' && !source) state.steady = false;
                if (!source && (key === 'colorLow' || key === 'colorHigh')) state.paletteDefault = false;
                update(source || (key !== 'colorLow' && key !== 'colorHigh'));
            }
            input.addEventListener('input', changed); input.addEventListener('change', changed);
            if (select) select.addEventListener('change', function () {
                try { changeUnit(obj, key, select.value, defs); input.value = obj.input[key]; error.textContent = ''; update(!(!source && (key === 'colorLow' || key === 'colorHigh'))); }
                catch (e) { select.value = obj.units[key]; error.textContent = e.message; input.setAttribute('aria-invalid', 'true'); }
            });
            return r;
        }
        function validateControls() {
            records.forEach(function (r) {
                var mainPower = r.source && r.obj === state.sources[0] && r.key === 'power';
                var skipped = (r.source && !r.obj.enabled) || mainPower || (!r.source && r.key === 'initial' && state.follow);
                r.input.disabled = mainPower || (!r.source && r.key === 'initial' && state.follow);
                if (r.select) r.select.disabled = mainPower;
                try { if (!skipped) read(r.obj, r.key, r.defs); r.error.textContent = ''; r.input.removeAttribute('aria-invalid'); }
                catch (e) { r.error.textContent = e.message; r.input.setAttribute('aria-invalid', 'true'); }
            });
        }
        function sourceEditors() {
            records = records.filter(function (r) { return !r.source; }); sourceViews = []; empty($('sourceList'));
            state.sources.forEach(function (src, i) {
                var box = node('details', undefined, 'source-card'); box.open = true;
                var heading = node('summary', (i + 1) + ' · ' + src.input.name); box.appendChild(heading);
                var bar = node('div', undefined, 'toolbar'), label = node('label', undefined, 'check'), enabled = node('input');
                enabled.type = 'checkbox'; enabled.checked = src.enabled; enabled.disabled = i === 0;
                label.appendChild(enabled); label.appendChild(node('span', i === 0 ? '主管（功耗跟随所选电流）' : '启用固定功耗热源')); bar.appendChild(label);
                enabled.addEventListener('change', function () { src.enabled = enabled.checked; update(true); });
                if (i > 0) {
                    var del = node('button', '删除', 'btn'); del.type = 'button'; del.setAttribute('aria-label', '删除热源 ' + (i + 1)); bar.appendChild(del);
                    del.addEventListener('click', function () { state.sources.splice(state.sources.indexOf(src), 1); sourceEditors(); update(true); $('addSource').focus(); });
                }
                box.appendChild(bar);
                var fields = node('div', undefined, 'fields-grid'); box.appendChild(fields);
                var powerInput;
                Object.keys(SOURCE_DEFS).forEach(function (key) { var r = control(fields, src, key, SOURCE_DEFS, true); if (key === 'power') powerInput = r; });
                var summary = node('p', '', 'source-summary'); box.appendChild(summary); $('sourceList').appendChild(box);
                sourceViews.push({ source: src, heading: heading, summary: summary, powerInput: powerInput });
            });
            $('addSource').disabled = state.sources.length >= 8;
            $('sourceLimit').textContent = state.sources.length + '/8 个热源；新增源默认关闭，配置后启用。';
        }
        function selectRadio(key, text) {
            var label = node('label', undefined, 'current-choice'), radio = node('input'); radio.type = 'radio'; radio.name = 'heat-current'; radio.value = key;
            label.appendChild(radio); label.appendChild(node('span', text));
            radio.addEventListener('change', function () { if (radio.checked) { state.selection = key; $('selectionNotice').textContent = ''; update(true); } });
            return { label: label, radio: radio };
        }
        function setupTables() {
            TABS.forEach(function (tab) {
                var custom = $(tab + 'CustomRow'), customCells = [];
                var radio;
                if (tab === 'drop') { radio = selectRadio('custom', '使用自定义行'); $(tab + 'CustomCell').appendChild(radio.label); }
                control($(tab + 'CustomCell'), state, tab + 'Custom', DEFS, false);
                for (var i = 0; i < (tab === 'drop' ? 3 : 4); i++) { var td = node('td'); custom.appendChild(td); customCells.push(td); }
                tables[tab] = { signature: null, presets: [], custom: { tr: custom, cells: customCells, radio: radio && radio.radio } };
            });
        }
        function renderTables() {
            TABS.forEach(function (tab) {
                var data = tableData(state, tab), table = tables[tab], presets = data.rows.slice(0, -1), sig = presets.map(function (r) { return r.key; }).join('|');
                if (table.signature !== sig) {
                    table.signature = sig; table.presets = []; empty($(tab + 'Rows'));
                    presets.forEach(function (r) {
                        var tr = node('tr'), head = node('td'), cells = [], radio;
                        if (tab === 'drop') { radio = selectRadio(r.key, fmt(r.value)); head.appendChild(radio.label); } else head.textContent = fmt(r.value);
                        tr.appendChild(head);
                        r.cells.forEach(function () { var td = node('td'); tr.appendChild(td); cells.push(td); });
                        $(tab + 'Rows').appendChild(tr); table.presets.push({ tr: tr, cells: cells, radio: radio && radio.radio });
                    });
                }
                data.rows.forEach(function (r, i) {
                    var view = i === presets.length ? table.custom : table.presets[i];
                    view.tr.className = r.alert ? 'row-alert' : '';
                    view.cells.forEach(function (td, k) { td.textContent = r.cells[k]; });
                    if (view.radio) view.radio.checked = state.selection === r.key;
                });
                $(tab + 'Error').textContent = data.error;
                if (state.tab === tab) $('copyTable').disabled = !data.exportable;
            });
            try {
                var r = C.conduction(read(state, 'r25'), read(state, 'tcr'), read(state, 'theta'), read(state, 'ambient'), 0);
                $('criticalNotice').textContent = r.critical === null ? '该 TCR 下无正温度系数失稳临界电流，仍须核对电阻模型及 SOA。' : '线性模型临界电流 Icrit ≈ ' + fmt(r.critical) + ' A；不是允许工作电流。g≥1 表示无稳定热平衡。';
            } catch (e) { $('criticalNotice').textContent = e.message; }
        }
        function palette() {
            var low = read(state, 'colorLow'), high = read(state, 'colorHigh');
            if (!(low < high)) throw new Error('色标下限须小于上限');
            return { low: low, high: high };
        }
        function sync() {
            TABS.forEach(function (tab) {
                $('panel-' + tab).hidden = state.tab !== tab;
                $('tab-' + tab).setAttribute('aria-selected', String(state.tab === tab)); $('tab-' + tab).tabIndex = state.tab === tab ? 0 : -1;
            });
            $('resistanceBlock').hidden = state.tab === 'drop'; $('currentSeriesBlock').hidden = state.tab === 'limit';
            $('initialFollow').checked = state.follow;
            if (state.follow) controls.initial.input.value = state.input.ambient; else controls.initial.input.value = state.input.initial;
            $('steadyBtn').setAttribute('aria-pressed', String(state.steady)); $('transientBtn').setAttribute('aria-pressed', String(!state.steady));
            try {
                var list = read(state, 'currentList');
                if (state.selection !== 'custom' && list.indexOf(C.number(state.selection.slice(2))) === -1) {
                    state.selection = 'custom'; $('selectionNotice').textContent = '所选预设已移除，热图改用自定义行。';
                }
            } catch (e) { /* 无效序列不猜测新的所选电流。 */ }
            try { $('timeSlider').max = read(state, 'timeEnd'); $('timeSlider').value = read(state, 'time'); } catch (e) { /* 保留最后有效滑块。 */ }
            if (state.paletteDefault) {
                try {
                    var ta = read(state, 'ambient'), t0 = state.follow ? ta : read(state, 'initial');
                    state.input.colorLow = String(Math.min(ta, t0)); state.input.colorHigh = String(Math.max(read(state, 'threshold'), ta + 1, t0 + 1));
                    controls.colorLow.input.value = state.input.colorLow; controls.colorHigh.input.value = state.input.colorHigh;
                } catch (e) { /* 无效输入不重置色标。 */ }
            }
            sourceViews.forEach(function (v, i) {
                v.heading.textContent = (i + 1) + ' · ' + v.source.input.name;
                try {
                    var a = read(v.source, 'area', SOURCE_DEFS), d = C.dimensions(a, read(v.source, 'aspect', SOURCE_DEFS));
                    v.summary.textContent = '面积 ' + fmt(a * 1e6) + ' mm²（芯片占比 ' + fmt(a / read(state, 'area') * 100) + '%），尺寸 ' + fmt(d.width * 1e3) + ' × ' + fmt(d.height * 1e3) + ' mm' + (!v.source.enabled ? '；未启用' : '');
                } catch (e) { v.summary.textContent = e.message; }
                if (i === 0) {
                    try { v.powerInput.input.value = fmt(C.constantDrop(read(state, 'voltage'), read(state, 'theta'), read(state, 'ambient'), selectedCurrent(state)).power / Number(v.source.units.power)); }
                    catch (e) { v.powerInput.input.value = ''; }
                }
            });
            try { var die = C.dimensions(read(state, 'area'), read(state, 'aspect')); $('materialInfo').textContent = '芯片尺寸 ' + fmt(die.width * 1e3) + ' × ' + fmt(die.height * 1e3) + ' mm；推导导热率 k = ' + fmt(read(state, 'diffusivity') * read(state, 'heatCapacity')) + ' W/(m·K)。'; }
            catch (e) { $('materialInfo').textContent = e.message; }
        }
        function invalidate(message) {
            valid = false; $('exportPng').disabled = true; $('fitColor').disabled = true;
            $('heatStatus').textContent = (latest ? '旧结果，当前参数未生效。' : '') + message;
            $('heatCanvas').setAttribute('data-stale', 'true');
            $('probe').textContent = '当前参数尚无有效热图，暂停坐标读数。';
        }
        function stopPending() {
            requestId++; win.clearTimeout(timer); timer = null; pending = null;
            if (busy && worker) { worker.terminate(); worker = null; }
            busy = false;
        }
        function computeHeat() {
            stopPending(); invalidate(state.tab === 'drop' ? '等待计算…' : '切换到第三页后计算。');
            if (state.tab !== 'drop') return;
            var config;
            try { config = buildConfig(state); palette(); } catch (e) { invalidate(e.message); return; }
            if (!win.Worker || workerFailed) { invalidate('当前环境无法使用 Worker。三个基础表格仍可使用；热图需要支持 Worker 的浏览器及 HTTP(S) 页面。'); return; }
            var id = requestId;
            timer = win.setTimeout(function () {
                if (id !== requestId) return;
                timer = null;
                try {
                    if (!worker) {
                        worker = new win.Worker('thermal-worker.js');
                        var owner = worker;
                        worker.onmessage = function (event) {
                            var data = event.data;
                            if (worker !== owner || data.id !== requestId || !pending) return;
                            busy = false;
                            if (data.error) { invalidate(data.error); pending = null; return; }
                            latest = { result: data.result, config: pending }; pending = null;
                            valid = true; displayHeat();
                        };
                        worker.onerror = function () {
                            if (worker !== owner) return;
                            stopPending(); workerFailed = true;
                            if (worker) { worker.terminate(); worker = null; }
                            invalidate('Worker 加载或运行失败。基础表格不受影响；请检查页面资源后刷新重试。');
                        };
                    }
                    pending = config; busy = true; $('heatStatus').textContent = (latest ? '旧结果，当前参数未生效。' : '') + '正在计算二维模型与散热标定…';
                    worker.postMessage({ id: id, config: config });
                } catch (e) { busy = false; pending = null; if (worker) worker.terminate(); worker = null; invalidate('无法启动热图计算：' + e.message); }
            }, 150);
        }
        function color(name) { return win.getComputedStyle(doc.documentElement).getPropertyValue(name).trim(); }
        function rgb(css) {
            if (css[0] === '#') { var hex = css.slice(1); if (hex.length === 3) hex = hex.split('').map(function (s) { return s + s; }).join(''); return [0, 2, 4].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); }); }
            return (css.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(Number);
        }
        function drawHeat() {
            if (!latest) return;
            var result = latest.result, cfg = latest.config, p = palette(), canvas = $('heatCanvas'), ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('当前环境不支持 Canvas 2D');
            canvas.width = 1000; canvas.height = 810 + result.rects.length * 24;
            var cold = color('--color-primary'), mid = color('--color-bg-paper'), hot = color('--color-accent'), text = color('--color-text'), bg = color('--color-card-bg');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = text; ctx.font = '18px sans-serif'; ctx.fillText('芯片发热估算 · 简化二维等效模型（不是封装级热仿真）', 32, 28);
            ctx.font = '15px sans-serif';
            ctx.fillText((cfg.steady ? '稳态' : 't = ' + fmt(cfg.time) + ' s') + '；主管 I = ' + fmt(cfg.mainCurrent) + ' A；|VDS| = ' + fmt(cfg.voltage) + ' V；总功耗 = ' + fmt(result.totalPower) + ' W', 32, 54);
            var scale = Math.min(740 / result.width, 490 / result.height), w = result.width * scale, h = result.height * scale;
            var x0 = 85 + (740 - w) / 2, y0 = 90 + (490 - h) / 2;
            plotBox = { x: x0, y: y0, width: w, height: h };
            var buffer = node('canvas'); buffer.width = result.n; buffer.height = result.n;
            var bctx = buffer.getContext('2d'), image = bctx.createImageData(result.n, result.n), colors = [rgb(cold), rgb(mid), rgb(hot)];
            for (var y = 0; y < result.n; y++) for (var x = 0; x < result.n; x++) {
                var z = Math.max(0, Math.min(1, (result.values[y * result.n + x] - p.low) / (p.high - p.low))) * 2;
                var side = z < 1 ? 0 : 1, f = z - side, dest = ((result.n - 1 - y) * result.n + x) * 4;
                for (var k = 0; k < 3; k++) image.data[dest + k] = Math.round(colors[side][k] * (1 - f) + colors[side + 1][k] * f);
                image.data[dest + 3] = 255;
            }
            bctx.putImageData(image, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(buffer, x0, y0, w, h);
            ctx.strokeStyle = text; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, w, h);
            for (k = 0; k <= 4; k++) {
                ctx.textAlign = 'center'; ctx.fillText(fmt(result.width * 1e3 * k / 4), x0 + w * k / 4, y0 + h + 23);
                ctx.textAlign = 'right'; ctx.fillText(fmt(result.height * 1e3 * k / 4), x0 - 10, y0 + h * (1 - k / 4) + 5);
            }
            ctx.textAlign = 'center'; ctx.fillText('X (mm)', x0 + w / 2, y0 + h + 45);
            ctx.textAlign = 'left'; ctx.fillText('Y (mm)', x0 - 65, Math.max(78, y0 - 12));
            result.rects.forEach(function (r) {
                var left = x0 + r.left * scale, top = y0 + (result.height - r.bottom - r.height) * scale;
                ctx.strokeStyle = bg; ctx.lineWidth = 4; ctx.strokeRect(left, top, r.width * scale, r.height * scale);
                ctx.strokeStyle = text; ctx.lineWidth = 1.5; ctx.strokeRect(left, top, r.width * scale, r.height * scale);
                ctx.fillStyle = bg; ctx.fillRect(left + 2, top + 2, 22, 20); ctx.fillStyle = text; ctx.fillText(String(r.index + 1), left + 6, top + 17);
            });
            var px = x0 + (result.maxIndex % result.n + 0.5) / result.n * w, py = y0 + (1 - (Math.floor(result.maxIndex / result.n) + 0.5) / result.n) * h;
            ctx.strokeStyle = text; ctx.beginPath(); ctx.moveTo(px - 6, py); ctx.lineTo(px + 6, py); ctx.moveTo(px, py - 6); ctx.lineTo(px, py + 6); ctx.stroke();
            var gradient = ctx.createLinearGradient(0, 580, 0, 90); gradient.addColorStop(0, cold); gradient.addColorStop(0.5, mid); gradient.addColorStop(1, hot);
            ctx.fillStyle = gradient; ctx.fillRect(858, 90, 24, 490); ctx.fillStyle = text;
            for (k = 0; k <= 4; k++) ctx.fillText(fmt(p.high - (p.high - p.low) * k / 4), 890, 95 + 490 * k / 4);
            ctx.fillText('℃', 858, 78); ctx.fillText('＋：最高温单元', 830, 620);
            ctx.fillText('峰值 ' + fmt(result.max) + ' ℃；平均 ' + fmt(result.mean) + ' ℃；主管区域峰值 ' + fmt(result.mainMax) + ' ℃', 32, 660);
            ctx.fillText('Ta=' + fmt(cfg.ambient) + ' ℃；T0=' + fmt(cfg.initial) + ' ℃；RθJA=' + fmt(cfg.theta) + ' ℃/W；β=' + fmt(result.beta) + ' s⁻¹', 32, 687);
            ctx.fillText('α=' + fmt(cfg.diffusivity * 1e6) + ' mm²/s；Cv=' + fmt(cfg.heatCapacity / 1e6) + ' MJ/(m³·K)；厚度=' + fmt(cfg.thickness * 1e6) + ' µm；网格=' + cfg.n + '²', 32, 712);
            ctx.fillText('超 ' + fmt(cfg.threshold) + ' ℃面积≈' + fmt(result.hotArea * 1e6) + ' mm²（' + fmt(result.hotFraction * 100) + '%）；色标 ' + fmt(p.low) + '～' + fmt(p.high) + ' ℃', 32, 738);
            ctx.fillText(result.min < p.low || result.max > p.high ? '注意：存在色标外温度，端点颜色饱和；数值未截断。' : '散热仅按主管单源标定；附加源在同一边界下叠加。', 32, 764);
            result.rects.forEach(function (r, i) { ctx.fillText((r.index + 1) + ' · ' + r.name + '：' + fmt(r.area * 1e6) + ' mm²，' + fmt(r.power) + ' W', 32, 794 + i * 24, 940); });
        }
        function displayHeat() {
            if (!latest) return;
            try { drawHeat(); } catch (e) { invalidate(e.message); return; }
            if (!valid) return;
            var r = latest.result, c = latest.config, p = palette();
            $('heatStatus').textContent = '当前结果有效 · 简化模型；主管单源标定误差 ' + fmt(r.calibrationError * 100) + '%。' + (r.min < p.low || r.max > p.high ? '存在色标外温度，数值未截断。' : '');
            $('heatCanvas').setAttribute('data-stale', 'false'); $('exportPng').disabled = false; $('fitColor').disabled = false;
            $('heatTitle').textContent = (c.steady ? '稳态' : 't = ' + fmt(c.time) + ' s') + ' ｜ 主管 I = ' + fmt(c.mainCurrent) + ' A ｜ 主管 P = ' + fmt(c.voltage * c.mainCurrent) + ' W ｜ 全部热源 P = ' + fmt(r.totalPower) + ' W';
            $('heatSummary').textContent = '全芯片最高 ' + fmt(r.max) + ' ℃；平均 ' + fmt(r.mean) + ' ℃；主管区域最高 ' + fmt(r.mainMax) + ' ℃。超 ' + fmt(c.threshold) + ' ℃面积约 ' + fmt(r.hotArea * 1e6) + ' mm²（' + fmt(r.hotFraction * 100) + '%）。β=' + fmt(r.beta) + ' s⁻¹，heff=' + fmt(r.heff) + ' W/(m²·K)。';
            $('thinWarning').textContent = !c.steady && c.time > 0 && c.time < c.thickness * c.thickness / c.diffusivity ? '该时刻短于 d²/α，厚度方向可能尚未均温，二维薄层近似精度有限。' : '';
            $('probe').textContent = '点击或悬停热图查看单元坐标和温度；色彩表示温度，编号轮廓表示面积。';
        }
        function update(recompute) {
            sync(); validateControls(); renderTables(); save();
            if (recompute) computeHeat();
            else {
                // 色标不改变物理参数；只可重新激活同一物理快照，不能激活过期结果。
                try {
                    palette();
                    if (latest && state.tab === 'drop' && JSON.stringify(buildConfig(state)) === JSON.stringify(latest.config)) {
                        valid = true; displayHeat();
                    } else if (state.tab === 'drop' && !busy && timer === null) computeHeat();
                    else if (latest) displayHeat();
                } catch (e) { invalidate(e.message); }
            }
        }
        function probe(event) {
            if (!valid || !plotBox) return;
            var canvas = $('heatCanvas'), bounds = canvas.getBoundingClientRect(), r = latest.result;
            var x = (event.clientX - bounds.left) / bounds.width * canvas.width, y = (event.clientY - bounds.top) / bounds.height * canvas.height;
            var b = plotBox;
            if (x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) return;
            var ix = Math.min(r.n - 1, Math.floor((x - b.x) / b.width * r.n));
            var iy = Math.min(r.n - 1, Math.floor((1 - (y - b.y) / b.height) * r.n));
            $('probe').textContent = '单元中心 X=' + fmt((ix + 0.5) / r.n * r.width * 1e3) + ' mm，Y=' + fmt((iy + 0.5) / r.n * r.height * 1e3) + ' mm；T=' + fmt(r.values[iy * r.n + ix]) + ' ℃。';
        }
        function copySnapshot(text) {
            function fallback() {
                var ta = node('textarea'), focused = doc.activeElement, ok = false;
                try { ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px'; doc.body.appendChild(ta); ta.select(); ok = doc.execCommand('copy'); }
                catch (e) { ok = false; }
                finally { if (ta.parentNode) ta.parentNode.removeChild(ta); if (focused && focused.focus) focused.focus({ preventScroll: true }); }
                $('copyStatus').textContent = ok ? '已复制当次表格' : '复制失败，请检查剪贴板权限';
            }
            try { if (win.navigator.clipboard && win.navigator.clipboard.writeText) win.navigator.clipboard.writeText(text).then(function () { $('copyStatus').textContent = '已复制当次表格'; }, fallback); else fallback(); }
            catch (e) { fallback(); }
        }
        var groups = { commonFields: ['ambient', 'theta', 'threshold'], resistanceFields: ['r25', 'tcr'], currentSeriesFields: ['currentList'],
            limitSeriesFields: ['limitList'], voltageFields: ['voltage'], heatFields: ['area', 'aspect', 'thickness', 'diffusivity', 'heatCapacity', 'initial', 'n'], timeFields: ['time', 'timeEnd'], colorFields: ['colorLow', 'colorHigh'] };
        Object.keys(groups).forEach(function (group) { groups[group].forEach(function (key) { control($(group), state, key, DEFS, false); }); });
        setupTables(); sourceEditors();
        TABS.forEach(function (tab, index) {
            $('tab-' + tab).addEventListener('click', function () { state.tab = tab; update(true); });
            $('tab-' + tab).addEventListener('keydown', function (e) {
                var target = e.key === 'ArrowRight' ? (index + 1) % 3 : e.key === 'ArrowLeft' ? (index + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1;
                if (target !== -1) { e.preventDefault(); state.tab = TABS[target]; update(true); $('tab-' + state.tab).focus(); }
            });
        });
        $('initialFollow').addEventListener('change', function () { state.follow = this.checked; update(true); });
        $('addSource').addEventListener('click', function () { if (state.sources.length < 8) { state.sources.push(sourceState(false)); sourceEditors(); update(true); } });
        $('timeSlider').addEventListener('input', function () { state.input.time = C.convert(this.value, 1, Number(state.units.time)); controls.time.input.value = state.input.time; state.steady = false; update(true); });
        $('steadyBtn').addEventListener('click', function () { state.steady = true; update(true); });
        $('transientBtn').addEventListener('click', function () { state.steady = false; update(true); });
        $('defaultColor').addEventListener('click', function () { state.paletteDefault = true; update(false); });
        $('fitColor').addEventListener('click', function () {
            if (!valid) return;
            state.paletteDefault = false; state.input.colorLow = String(latest.result.min); state.input.colorHigh = String(Math.max(latest.result.max, latest.result.min + 1));
            controls.colorLow.input.value = state.input.colorLow; controls.colorHigh.input.value = state.input.colorHigh; update(false);
        });
        $('exportPng').addEventListener('click', function () {
            if (!valid) return;
            try { drawHeat(); var a = node('a'); a.download = '芯片发热估算.png'; a.href = $('heatCanvas').toDataURL('image/png'); doc.body.appendChild(a); a.click(); doc.body.removeChild(a); }
            catch (e) { $('heatStatus').textContent = 'PNG 导出失败：' + e.message; }
        });
        $('copyTable').addEventListener('click', function () { try { copySnapshot(tableTSV(state, state.tab)); } catch (e) { $('copyStatus').textContent = e.message; } });
        $('heatCanvas').addEventListener('pointermove', probe); $('heatCanvas').addEventListener('click', probe);
        if (win.MutationObserver) new win.MutationObserver(function () { if (latest) displayHeat(); }).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        win.addEventListener('beforeunload', function () { stopPending(); if (worker) worker.terminate(); });
        update(true);
        return { getState: function () { return state; }, update: update, isHeatValid: function () { return valid; } };
    }
    return { DEFS: DEFS, SOURCE_DEFS: SOURCE_DEFS, restore: restore, sourceState: sourceState, read: read, changeUnit: changeUnit,
        selectedCurrent: selectedCurrent, buildConfig: buildConfig, tableData: tableData, tableTSV: tableTSV, mount: mount };
}));

/* 五标签交互；物理计算只调用独立核心，展示状态与原始文本分离。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(
        require('./jitter-core.js'), require('./phase-noise.js'), require('./tie-core.js'), require('./pll-core.js'));
    else {
        root.JitterUI = factory(root.JitterCore, root.PhaseNoise, root.TieCore, root.PLLCore);
        root.JitterUI.instance = root.JitterUI.mount(document, root);
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (J, PN, T, PLL) {
    'use strict';
    var STORE = 'ee-jitter-calc', VERSION = 1, MAX_FILE = 5 * 1024 * 1024;
    var TABS = ['convert', 'phase', 'pll', 'adc', 'tie'];
    var FREQ = J.FREQ, TIME = J.TIME;
    var U = {
        bit: { 'bit/s': 1, 'Mbit/s': 1e6, 'Gbit/s': 1e9 },
        sample: { 'S/s': 1, 'MS/s': 1e6, 'GS/s': 1e9 },
        voltage: { V: 1, mV: 1e-3 }, slew: { 'V/s': 1, 'V/µs': 1e6, 'V/ns': 1e9 },
        current: { A: 1, 'mA': 1e-3, 'µA': 1e-6 }, kvco: { 'Hz/V': 1, 'kHz/V': 1e3, 'MHz/V': 1e6 },
        resistance: { 'Ω': 1, 'kΩ': 1e3 }, capacitance: { F: 1, 'µF': 1e-6, 'nF': 1e-9, 'pF': 1e-12 },
        currentNoise: { 'A/√Hz': 1, 'pA/√Hz': 1e-12 }, phase: { rad: 1, '°': Math.PI / 180 }
    };
    function field(key, label, units, options) { return Object.assign({ key: key, label: label, units: units }, options || {}); }
    var FIELDS = {
        convert: [
            field('carrier', '载波 fc', FREQ, { container: 'convertFields' }),
            field('bitRate', '比特率 Rb', U.bit, { container: 'convertFields' }),
            field('rssValues', '已知 RSS 分量', TIME, { container: 'rssFields', raw: true }),
            field('target', '目标总抖动', TIME, { container: 'rssFields' }),
            field('voltageNoise', '积分电压噪声', U.voltage, { container: 'edgeFields' }),
            field('slewRate', '阈值边沿斜率', U.slew, { container: 'edgeFields', signed: true }),
            field('ratio', '理想倍/分频比 M', null, { container: 'scalingFields' }),
            field('phaseNoiseDb', '输入 SSB 相噪 / dBc/Hz', null, { container: 'scalingFields' }),
            field('phaseRms', '输入相位 RMS', U.phase, { container: 'scalingFields', zero: true })
        ],
        phase: [field('carrier', '载波 fc', FREQ), field('low', '积分下限', FREQ), field('high', '积分上限', FREQ)],
        pll: [
            field('fref', '参考频率 fref', FREQ), field('referenceDivider', '参考分频 R', null, { integer: true }),
            field('feedbackDivider', '反馈分频 N', null, { integer: true }), field('outputDivider', '输出分频 D', null, { integer: true }),
            field('icp', '电荷泵电流 Icp', U.current), field('kvco', 'VCO 增益 Kvco', U.kvco),
            field('r2', 'R2', U.resistance), field('c1', 'C1', U.capacitance), field('c2', 'C2', U.capacitance),
            field('r3', 'R3（拓扑 B）', U.resistance), field('c3', 'C3（拓扑 B）', U.capacitance),
            field('temperature', '温度', null, { unitName: 'K' }), field('cpWhite', 'CP 白噪声', U.currentNoise, { zero: true }),
            field('cpCorner', 'CP 1/f 拐点', FREQ, { zero: true }), field('low', '积分下限', FREQ), field('high', '积分上限', FREQ),
            field('plotLow', '绘图下限', FREQ), field('plotHigh', '绘图上限', FREQ)
        ],
        adc: [
            field('fin', '模拟输入频率 fin', FREQ), field('fs', '采样率 fs', U.sample),
            field('clock', 'clock 抖动', TIME, { zero: true }), field('aperture', 'aperture 抖动', TIME, { zero: true }),
            field('buffer', 'buffer 抖动', TIME, { zero: true }), field('bits', '理想位数 N', null),
            field('baselineDb', '用户基线', null, { unitName: 'dB' }), field('targetDb', '目标性能', null, { unitName: 'dB' })
        ],
        tie: [field('nominalFrequency', '标称频率', FREQ)]
    };
    var DEF = {};
    Object.keys(FIELDS).forEach(function (group) {
        DEF[group] = {}; FIELDS[group].forEach(function (def) { DEF[group][def.key] = def; });
    });
    var SOURCE_NAMES = { reference: '参考', vco: 'VCO', cp: '电荷泵', r2: 'R2 热噪声', r3: 'R3 热噪声' };
    var OUTPUTS = {
        convert: ['seconds', 'phaseRad', 'phaseDeg', 'ui', 'uiPercent', 'rssTotal', 'rssRemaining', 'rssStatus', 'edgeJitter', 'scaledNoise', 'scaledPhase'],
        phase: ['seconds', 'phaseRms', 'phaseDeg', 'ssbPower'],
        pll: ['seconds', 'crossover', 'phaseMargin', 'bandwidth', 'frequencies', 'gainMargin', 'stability', 'phaseRms'],
        adc: ['total', 'snrJitter', 'performance', 'equivalentBits', 'loss', 'budgetTotal', 'budgetClock', 'maxFin'],
        tie: ['rawMean', 'rawStd', 'rawRms', 'rawMin', 'rawMax', 'rawPeak', 'processedMean', 'processedStd', 'processedRms',
            'processedMin', 'processedMax', 'processedPeak', 'slope', 'frequency', 'ppm', 'period', 'cycle']
    };
    var CHARTS = {
        convert: [], phase: ['phaseNoiseChart', 'phaseCumulativeChart'],
        pll: ['pllLoopChart', 'pllPhaseChart', 'pllNoiseChart'], adc: ['adcChart'], tie: ['tieTrendChart', 'tieHistogramChart']
    };
    function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
    function tieExample(kind) {
        return T.example(kind).map(function (value) { return Number((value / 1e-12).toPrecision(14)); }).join('\n');
    }
    function defaults() {
        return {
            tab: 'convert',
            convert: { source: 'time', value: '1', unit: 'ps', carrier: '100', carrierUnit: 'MHz', bitRate: '1', bitRateUnit: 'Gbit/s',
                rssValues: '3, 4', rssValuesUnit: 'ps', target: '6', targetUnit: 'ps', voltageNoise: '1', voltageNoiseUnit: 'mV',
                slewRate: '1', slewRateUnit: 'V/ns', ratio: '2', phaseNoiseDb: '-140', phaseRms: '0.01', phaseRmsUnit: 'rad' },
            phase: { carrier: '100', carrierUnit: 'MHz', low: '1', lowUnit: 'kHz', high: '1', highUnit: 'MHz',
                offsetUnit: 'kHz', text: PN.toText(PN.flat(), 'kHz') },
            pll: { topology: 'A', fref: '10', frefUnit: 'MHz', referenceDivider: '1', feedbackDivider: '10', outputDivider: '1',
                icp: '1', icpUnit: 'mA', kvco: '20', kvcoUnit: 'MHz/V', r2: '330', r2Unit: 'Ω', c1: '100', c1Unit: 'pF',
                c2: '10', c2Unit: 'nF', r3: '1', r3Unit: 'kΩ', c3: '100', c3Unit: 'pF', temperature: '300',
                cpWhite: '10', cpWhiteUnit: 'pA/√Hz', cpCorner: '0', cpCornerUnit: 'Hz', low: '1', lowUnit: 'kHz',
                high: '1', highUnit: 'MHz', plotLow: '10', plotLowUnit: 'Hz', plotHigh: '1', plotHighUnit: 'MHz',
                sources: { reference: true, vco: true, cp: true, r2: true, r3: true }, offsetUnit: 'Hz',
                referenceText: PN.toText(PN.reference(), 'Hz'), vcoText: PN.toText(PN.vco(), 'Hz') },
            adc: { mode: 'ideal', fin: '100', finUnit: 'MHz', fs: '250', fsUnit: 'MS/s', clock: '1', clockUnit: 'ps',
                aperture: '100', apertureUnit: 'fs', buffer: '0', bufferUnit: 'fs', bits: '12', baselineDb: '74', targetDb: '70', source: null },
            tie: { mode: 'tie', unit: 'ps', detrend: 'mean', nominalFrequency: '100', nominalFrequencyUnit: 'MHz', consecutive: false, text: tieExample('sine') }
        };
    }
    function read(state, group, key) {
        var def = DEF[group][key], value = state[group][key];
        if (def.raw) return String(value).trim();
        var unit = def.units ? state[group][key + 'Unit'] : null;
        if (def.units && !Object.prototype.hasOwnProperty.call(def.units, unit)) throw new Error(def.label + '单位无效');
        var result = J.number(value, def.units ? def.units[unit] : 1, def.label);
        if (def.integer && !Number.isInteger(result)) throw new Error(def.label + '必须是整数');
        if (def.signed) return result;
        return def.zero ? J.nonnegative(result, def.label) : J.positive(result, def.label);
    }
    function list(state) {
        var text = read(state, 'convert', 'rssValues');
        if (!Object.prototype.hasOwnProperty.call(TIME, state.convert.rssValuesUnit)) throw new Error('RSS 时间单位无效');
        if (!text) throw new Error('RSS 分量不能为空');
        var values = text.split(/[;,\s]+/).filter(Boolean).map(function (token) {
            return J.nonnegative(J.number(token, TIME[state.convert.rssValuesUnit], 'RSS 分量'), 'RSS 分量');
        });
        return values;
    }
    function compute(group, state) {
        var s = state[group];
        if (group === 'convert') {
            var carrier = read(state, group, 'carrier'), bitRate = read(state, group, 'bitRate');
            if (!Object.prototype.hasOwnProperty.call(TIME, s.unit) && s.source === 'time') throw new Error('时间单位无效');
            var input = J.positive(J.number(s.value, 1, '换算输入'), '换算输入');
            var seconds = s.source === 'time' ? J.time(s.value, s.unit, '时间抖动') : J.timeFrom(s.source, input, carrier, bitRate);
            return { conversion: J.convert(seconds, carrier, bitRate), rss: J.rss(list(state), read(state, group, 'target')),
                edge: J.edge(read(state, group, 'voltageNoise'), read(state, group, 'slewRate')),
                scaling: J.scaling(read(state, group, 'ratio'), J.finite(J.number(s.phaseNoiseDb, 1, '输入相噪'), '输入相噪'), read(state, group, 'phaseRms')) };
        }
        if (group === 'phase') {
            var parsed = PN.parse(s.text, s.offsetUnit);
            var result = PN.integrate(parsed.points, read(state, group, 'carrier'), read(state, group, 'low'), read(state, group, 'high'));
            result.sorted = parsed.sorted; return result;
        }
        if (group === 'pll') {
            var referenceNoise = PN.parse(s.referenceText, s.offsetUnit).points, vcoNoise = PN.parse(s.vcoText, s.offsetUnit).points;
            return PLL.analyze({ topology: s.topology, fref: read(state, group, 'fref'), referenceDivider: read(state, group, 'referenceDivider'),
                feedbackDivider: read(state, group, 'feedbackDivider'), outputDivider: read(state, group, 'outputDivider'),
                icp: read(state, group, 'icp'), kvco: read(state, group, 'kvco'), r2: read(state, group, 'r2'), c1: read(state, group, 'c1'),
                c2: read(state, group, 'c2'), r3: read(state, group, 'r3'), c3: read(state, group, 'c3'), temperature: read(state, group, 'temperature'),
                cpWhite: read(state, group, 'cpWhite'), cpCorner: read(state, group, 'cpCorner'), low: read(state, group, 'low'),
                high: read(state, group, 'high'), plotLow: read(state, group, 'plotLow'), plotHigh: read(state, group, 'plotHigh'),
                sources: clone(s.sources), referenceNoise: referenceNoise, vcoNoise: vcoNoise });
        }
        if (group === 'adc') return { result: J.adc({ fin: read(state, group, 'fin'), fs: read(state, group, 'fs'), clock: read(state, group, 'clock'),
            aperture: read(state, group, 'aperture'), buffer: read(state, group, 'buffer'), mode: s.mode, bits: read(state, group, 'bits'),
            baselineDb: read(state, group, 'baselineDb'), targetDb: read(state, group, 'targetDb') }),
            budget: J.budget({ fin: read(state, group, 'fin'), aperture: read(state, group, 'aperture'), buffer: read(state, group, 'buffer'),
                mode: s.mode, bits: read(state, group, 'bits'), baselineDb: read(state, group, 'baselineDb'), targetDb: read(state, group, 'targetDb') }) };
        if (group === 'tie') {
            var sequence = T.sequence(s.text, s.mode, s.unit, read(state, group, 'nominalFrequency'));
            return T.analyze({ values: sequence.values, warnings: sequence.warnings, nominalFrequency: read(state, group, 'nominalFrequency'),
                detrend: s.detrend, consecutive: s.mode === 'edges' && s.consecutive });
        }
        throw new Error('未知计算标签');
    }
    function restore(text) {
        var state = defaults(), parsed;
        try { parsed = JSON.parse(text); } catch (e) { return state; }
        if (!parsed || parsed.version !== VERSION) return state;
        if (TABS.indexOf(parsed.tab) >= 0) state.tab = parsed.tab;
        TABS.forEach(function (group) {
            var saved = parsed[group]; if (!saved || typeof saved !== 'object') return;
            Object.keys(state[group]).forEach(function (key) {
                if (group === 'tie' && key === 'text') return;
                if (!Object.prototype.hasOwnProperty.call(saved, key)) return;
                var expected = state[group][key];
                if (expected === null && saved[key] === null) { state[group][key] = null; return; }
                if (group === 'adc' && key === 'source' && saved[key] && typeof saved[key] === 'object') { state.adc.source = clone(saved[key]); return; }
                if (expected !== null && typeof saved[key] === typeof expected) {
                    if (key === 'sources') {
                        if (!saved.sources) return;
                        Object.keys(expected).forEach(function (source) {
                            if (typeof saved.sources[source] === 'boolean') state[group].sources[source] = saved.sources[source];
                        });
                    } else state[group][key] = clone(saved[key]);
                }
            });
        });
        ['convert', 'phase', 'pll', 'adc'].forEach(function (group) {
            try { compute(group, state); } catch (e) { state[group] = defaults()[group]; }
        });
        try { read(state, 'tie', 'nominalFrequency'); } catch (e) { state.tie = defaults().tie; }
        return state;
    }
    function fmt(value, digits) {
        if (value === null || value === undefined) return '—';
        if (value === Infinity) return '∞'; if (value === -Infinity) return '−∞';
        if (!Number.isFinite(value)) return '—';
        if (value === 0) return '0';
        return Number(value.toPrecision(digits || 7)).toString();
    }
    function sci(value) { return Number.isFinite(value) ? value.toExponential(6) : fmt(value); }
    function time(value) {
        if (!Number.isFinite(value)) return fmt(value); if (value === 0) return '0 s';
        var a = Math.abs(value), unit = a >= 1 ? ['s', 1] : a >= 1e-3 ? ['ms', 1e-3] : a >= 1e-6 ? ['µs', 1e-6] :
            a >= 1e-9 ? ['ns', 1e-9] : a >= 1e-12 ? ['ps', 1e-12] : a >= 1e-15 ? ['fs', 1e-15] : ['as', 1e-18];
        return fmt(value / unit[1]) + ' ' + unit[0];
    }
    function frequency(value) {
        if (!Number.isFinite(value)) return fmt(value) + (value === Infinity ? ' Hz' : '');
        var unit = Math.abs(value) >= 1e9 ? ['GHz', 1e9] : Math.abs(value) >= 1e6 ? ['MHz', 1e6] : Math.abs(value) >= 1e3 ? ['kHz', 1e3] : ['Hz', 1];
        return fmt(value / unit[1]) + ' ' + unit[0];
    }
    function mount(doc, win) {
        var $ = function (id) { return doc.getElementById(id); }, state, controls = {}, lastValid, results = {}, summaries = {}, exports = {}, timers = {};
        try { state = restore(win.localStorage.getItem(STORE)); } catch (e) { state = defaults(); $('jitterStorageStatus').textContent = '本机存储读取受限，已使用默认参数。'; }
        lastValid = clone(state);
        function node(tag, text, className) { var el = doc.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
        function save() {
            var snapshot = { version: VERSION, tab: state.tab };
            TABS.forEach(function (group) { snapshot[group] = clone(lastValid[group]); });
            delete snapshot.tie.text;
            try { win.localStorage.setItem(STORE, JSON.stringify(snapshot)); $('jitterStorageStatus').textContent = '有效参数与当前标签已保存在本机；TIE 原文未保存。'; }
            catch (e) { $('jitterStorageStatus').textContent = '本机存储不可用；计算仍可进行，刷新后可能丢失输入。'; }
        }
        function unitName(def, group, key) { return def.units ? state[group][key + 'Unit'] : def.unitName || ''; }
        function buildFields(group) {
            controls[group] = {};
            FIELDS[group].forEach(function (def) {
                var box = node('div', undefined, 'jitter-field'), label = node('label', def.label), row = node('div', undefined, 'jitter-unit-row');
                var input = node('input'); input.type = 'text'; input.id = group + '-' + def.key; input.inputMode = 'decimal'; input.autocomplete = 'off';
                label.htmlFor = input.id; input.value = state[group][def.key]; row.appendChild(input);
                var unit = null;
                if (def.units) {
                    unit = node('select'); unit.id = input.id + '-unit'; unit.setAttribute('aria-label', def.label + '单位');
                    Object.keys(def.units).forEach(function (name) { var option = node('option', name); option.value = name; unit.appendChild(option); });
                    unit.value = state[group][def.key + 'Unit']; row.appendChild(unit);
                }
                box.append(label, row); $(def.container || group + 'Fields').appendChild(box);
                controls[group][def.key] = { input: input, unit: unit, box: box, def: def };
                input.addEventListener('input', function () {
                    state[group][def.key] = input.value;
                    if (group === 'adc' && (def.key === 'clock' || def.key === 'fs') && state.adc.source) state.adc.source.modified = true;
                    schedule(group);
                });
                if (unit) unit.addEventListener('change', function () {
                    var oldUnit = state[group][def.key + 'Unit'], next = unit.value;
                    try {
                        if (!def.raw) {
                            var si = J.number(input.value, def.units[oldUnit], def.label);
                            input.value = fmt(si / def.units[next], 12); state[group][def.key] = input.value;
                        }
                        state[group][def.key + 'Unit'] = next;
                        if (group === 'adc' && (def.key === 'clock' || def.key === 'fs') && state.adc.source) state.adc.source.modified = true;
                        schedule(group);
                    } catch (err) { unit.value = oldUnit; invalidate(group, err); }
                });
            });
        }
        function sync(group) {
            FIELDS[group].forEach(function (def) {
                var c = controls[group][def.key]; c.input.value = state[group][def.key];
                if (c.unit) c.unit.value = state[group][def.key + 'Unit'];
            });
            if (group === 'convert') { $('convertSource').value = state.convert.source; $('convert-value').value = state.convert.value; syncConvertUnits(); }
            if (group === 'phase') { $('phaseText').value = state.phase.text; $('phaseOffsetUnit').value = state.phase.offsetUnit; }
            if (group === 'pll') {
                $('pllTopology').value = state.pll.topology; $('pllReferenceText').value = state.pll.referenceText; $('pllVcoText').value = state.pll.vcoText;
                $('pllOffsetUnit').value = state.pll.offsetUnit;
                Object.keys(SOURCE_NAMES).forEach(function (source) { $('pll-source-' + source).checked = !!state.pll.sources[source]; });
                updateTopology();
            }
            if (group === 'adc') { $('adcMode').value = state.adc.mode; updateBaseline(); renderSource(); }
            if (group === 'tie') {
                $('tieMode').value = state.tie.mode; $('tieUnit').value = state.tie.unit; $('tieDetrend').value = state.tie.detrend;
                $('tieConsecutive').checked = !!state.tie.consecutive; $('tieText').value = state.tie.text; updateTieMode();
            }
        }
        function syncConvertUnits() {
            var source = state.convert.source, units = source === 'time' ? Object.keys(TIME) : source === 'rad' ? ['rad'] : source === 'deg' ? ['°'] : source === 'ui' ? ['UI'] : ['%UI'];
            var select = $('convert-unit'); select.textContent = '';
            units.forEach(function (name) { var option = node('option', name); option.value = name; select.appendChild(option); });
            if (units.indexOf(state.convert.unit) < 0) state.convert.unit = units[0]; select.value = state.convert.unit;
        }
        function updateTopology() {
            var b = state.pll.topology === 'B';
            ['r3', 'c3'].forEach(function (key) { controls.pll[key].box.hidden = !b; });
            $('pll-source-r3').disabled = !b;
        }
        function updateBaseline() {
            controls.adc.bits.box.hidden = state.adc.mode !== 'ideal';
            controls.adc.baselineDb.box.hidden = state.adc.mode !== 'snr' && state.adc.mode !== 'sinad';
        }
        function updateTieMode() { $('tieConsecutive').disabled = state.tie.mode !== 'edges'; }
        function set(group, id, value) { $(group + '-' + id).textContent = value; }
        function clearTable(id) { $(id).textContent = ''; }
        function clearGroup(group) {
            OUTPUTS[group].forEach(function (id) { set(group, id, '—'); });
            CHARTS[group].forEach(function (id) { if (win.JitterPlots) win.JitterPlots.clear(id); });
            if (group === 'phase') { clearTable('phaseSegments'); $('phaseApplyAdc').disabled = true; }
            if (group === 'pll') { clearTable('pllContributions'); $('pllApplyAdc').disabled = true; $('pllFigure').innerHTML = ''; }
            if (group === 'adc') clearTable('adcExamples');
            results[group] = null; summaries[group] = null; exports[group] = null;
        }
        function invalidate(group, err) {
            clearGroup(group); $(group + 'Error').textContent = err ? err.message : '输入已修改，请重新解析。';
            if (group === 'pll') clearTable('pllContributions');
        }
        function warnings(group, messages) {
            var list = $(group + 'Warnings'); list.textContent = '';
            (messages || []).filter(Boolean).forEach(function (message) { list.appendChild(node('li', message)); });
        }
        function parameterRows(group) {
            var rows = [];
            FIELDS[group].forEach(function (def) { rows.push(['参数', def.label, state[group][def.key], unitName(def, group, def.key)]); });
            if (group === 'convert') rows.push(['参数', '换算源', state.convert.source, state.convert.unit]);
            if (group === 'phase') rows.push(['参数', '相噪表频偏单位', state.phase.offsetUnit, '']);
            if (group === 'pll') rows.push(['参数', '拓扑', state.pll.topology, ''], ['参数', '相噪表频偏单位', state.pll.offsetUnit, '']);
            if (group === 'adc') rows.push(['参数', '基线模式', state.adc.mode, '']);
            if (group === 'tie') rows.push(['参数', '输入模式', state.tie.mode, ''], ['参数', '去趋势', state.tie.detrend, ''], ['参数', '连续边沿确认', String(!!state.tie.consecutive), '']);
            return rows;
        }
        function finish(group, rows) {
            exports[group] = rows; summaries[group] = rows.map(function (row) { return row.join('：'); }).join('\n');
        }
        function plot(id, config) { if (win.JitterPlots) win.JitterPlots.update(id, config); }
        function dataset(label, points) { return { label: label, data: points }; }
        function renderConvert(r) {
            set('convert', 'seconds', time(r.conversion.seconds) + '；' + sci(r.conversion.seconds) + ' s');
            set('convert', 'phaseRad', fmt(r.conversion.phaseRad) + ' rad'); set('convert', 'phaseDeg', fmt(r.conversion.phaseDeg) + ' °');
            set('convert', 'ui', fmt(r.conversion.ui) + ' UI'); set('convert', 'uiPercent', fmt(r.conversion.uiPercent) + ' %UI');
            set('convert', 'rssTotal', time(r.rss.total)); set('convert', 'rssRemaining', time(r.rss.remaining));
            set('convert', 'rssStatus', r.rss.status === 'ok' ? '可达' : r.rss.status === 'exhausted' ? '预算恰好用尽，只允许零剩余误差' : '不可达：已知分量已超过目标');
            set('convert', 'edgeJitter', time(r.edge)); set('convert', 'scaledNoise', fmt(r.scaling.phaseNoiseDb) + ' dBc/Hz');
            set('convert', 'scaledPhase', fmt(r.scaling.phaseRms) + ' rad；同频段时间 RMS 不变');
            var rows = parameterRows('convert'); rows.push(['结果', '时间 RMS', sci(r.conversion.seconds), 's'], ['结果', 'RSS 合成', sci(r.rss.total), 's'],
                ['结果', '剩余预算', sci(r.rss.remaining), 's'], ['结果', '预算状态', r.rss.status, ''], ['结果', '边沿抖动', sci(r.edge), 's']); finish('convert', rows);
        }
        function renderPhase(r) {
            set('phase', 'seconds', time(r.seconds) + '；' + sci(r.seconds) + ' s'); set('phase', 'phaseRms', fmt(r.phaseRms) + ' rad');
            set('phase', 'phaseDeg', fmt(r.phaseDeg) + ' °'); set('phase', 'ssbPower', sci(r.ssbPower)); $('phaseApplyAdc').disabled = false;
            plot('phaseNoiseChart', { xTitle: '频偏 / Hz', yTitle: 'SSB / dBc/Hz', data: { datasets: [dataset('输入相噪', r.points.map(function (p) { return { x: p.f, y: p.db }; }))] } });
            plot('phaseCumulativeChart', { xTitle: '积分上限 / Hz', yTitle: '累计时间 RMS / fs', data: { datasets: [dataset('累计 RMS', r.cumulative.map(function (p) { return { x: p.f, y: p.jitter * 1e15 }; }))] } });
            clearTable('phaseSegments'); r.segments.forEach(function (s) {
                var row = node('tr'); [fmt(s.low), fmt(s.high), sci(s.variance), fmt(s.fraction * 100) + ' %'].forEach(function (v) { row.appendChild(node('td', v)); }); $('phaseSegments').appendChild(row);
            });
            var messages = []; if (r.sorted) messages.push('输入频偏已自动排序。'); if (r.warning) messages.push(r.warning); warnings('phase', messages);
            var rows = parameterRows('phase'); rows.push(['结果', '积分抖动', sci(r.seconds), 's'], ['结果', '相位 RMS', fmt(r.phaseRms), 'rad'], ['结果', '积分功率比', sci(r.ssbPower), '']);
            r.segments.forEach(function (s, i) { rows.push(['分段 ' + (i + 1), fmt(s.low) + '～' + fmt(s.high) + ' Hz', sci(s.variance), 'rad²']); });
            messages.forEach(function (m) { rows.push(['警告', m, '', '']); }); finish('phase', rows);
        }
        function renderPll(r) {
            var p = r.parameters, sweep = r.sweep;
            set('pll', 'seconds', r.seconds === null ? '不输出：模型未通过稳定性/连续近似检查' : time(r.seconds) + '；' + sci(r.seconds) + ' s');
            set('pll', 'crossover', sweep.crossover ? frequency(sweep.crossover.f) : '分析范围内未找到'); set('pll', 'phaseMargin', sweep.phaseMargin === null ? '—' : fmt(sweep.phaseMargin) + ' °');
            set('pll', 'bandwidth', sweep.bandwidth ? frequency(sweep.bandwidth) : '分析范围内未找到');
            set('pll', 'frequencies', frequency(p.pfd) + ' / ' + frequency(p.vcoFrequency) + ' / ' + frequency(p.outputFrequency));
            set('pll', 'gainMargin', sweep.gainMargin === null ? '分析范围内无 −180° 交越，不宣称无限裕度' : fmt(sweep.gainMargin) + ' dB');
            set('pll', 'stability', r.stability.stable ? '稳定（连续小信号特征多项式）' : r.stability.critical ? '临界或数值不可靠' : '不稳定');
            set('pll', 'phaseRms', r.phaseRms === null ? '—' : fmt(r.phaseRms) + ' rad；' + r.evaluations + ' 次函数评估');
            $('pllApplyAdc').disabled = !r.valid;
            if (win.PLLFigure) $('pllFigure').innerHTML = win.PLLFigure.render(p);
            var points = sweep.points.filter(function (v) { return v.f >= p.plotLow && v.f <= p.plotHigh; });
            plot('pllLoopChart', { xTitle: '频率 / Hz', yTitle: '|T| / dB', data: { datasets: [dataset('开环 T=G/N', points.map(function (v) { return { x: v.f, y: v.magnitude }; }))] } });
            plot('pllPhaseChart', { xTitle: '频率 / Hz', yTitle: '相位 / °', data: { datasets: [dataset('开环相位', points.map(function (v) { return { x: v.f, y: v.phase * 180 / Math.PI }; }))] } });
            plot('pllNoiseChart', { xTitle: '频偏 / Hz', yTitle: '输出 SSB / dBc/Hz', data: { datasets: [dataset('总输出相噪', (r.curve || []).map(function (v) { return { x: v.f, y: v.ssbDb }; }))] } });
            clearTable('pllContributions'); Object.keys(r.contributions).forEach(function (source) {
                var c = r.contributions[source], row = node('tr');
                [SOURCE_NAMES[source], sci(c.variance), time(c.jitter), fmt(c.variance / r.phaseVariance * 100) + ' %'].forEach(function (v) { row.appendChild(node('td', v)); }); $('pllContributions').appendChild(row);
            });
            var messages = r.warnings.slice(); if (r.phaseRms > 0.1) messages.push('输出相位 RMS 较大，小相位近似可能不准确。'); warnings('pll', messages);
            var rows = parameterRows('pll'); rows.push(['结果', 'fPFD', fmt(p.pfd), 'Hz'], ['结果', 'fVCO', fmt(p.vcoFrequency), 'Hz'], ['结果', 'fout', fmt(p.outputFrequency), 'Hz'],
                ['结果', '交越', sweep.crossover ? fmt(sweep.crossover.f) : '未找到', 'Hz'], ['结果', '相位裕度', fmt(sweep.phaseMargin), '°'],
                ['结果', '闭环带宽', fmt(sweep.bandwidth), 'Hz'], ['结果', '积分抖动', sci(r.seconds), 's']);
            Object.keys(r.contributions).forEach(function (source) { rows.push(['贡献', SOURCE_NAMES[source], sci(r.contributions[source].variance), 'rad²']); });
            messages.forEach(function (m) { rows.push(['警告', m, '', '']); }); finish('pll', rows);
        }
        function adcInput(fin) {
            return { fin: fin, fs: read(state, 'adc', 'fs'), clock: read(state, 'adc', 'clock'), aperture: read(state, 'adc', 'aperture'), buffer: read(state, 'adc', 'buffer'),
                mode: state.adc.mode, bits: read(state, 'adc', 'bits'), baselineDb: read(state, 'adc', 'baselineDb'), targetDb: read(state, 'adc', 'targetDb') };
        }
        function renderSource() {
            var s = state.adc.source;
            $('adcSource').textContent = !s ? '当前使用手动输入，没有上游快照。' : '来源：' + (s.type === 'pll' ? 'PLL 拓扑 ' + s.topology : '相噪积分') +
                '；积分 ' + frequency(s.low) + '～' + frequency(s.high) + '；clock=' + time(s.clockSeconds) + '，fs=' + frequency(s.fs) + (s.modified ? '；clock/fs 已手动修改，上游快照未变。' : '。');
        }
        function renderAdc(bundle) {
            var r = bundle.result, b = bundle.budget;
            set('adc', 'total', time(r.total)); set('adc', 'snrJitter', fmt(r.snrJitter) + (r.snrJitter === Infinity ? '' : ' dB'));
            set('adc', 'performance', fmt(r.performance) + (r.performance === Infinity ? '' : ' dB')); set('adc', 'equivalentBits', fmt(r.equivalentBits) + ' bit');
            $('adc-bitLabel').textContent = r.bitLabel; set('adc', 'loss', r.loss === null ? '仅抖动模式，无独立基线' : fmt(r.loss) + ' dB');
            set('adc', 'budgetTotal', b.status === 'unreachable' && b.qAllow <= 0 ? '目标不可达' : time(b.total));
            set('adc', 'budgetClock', b.status === 'ok' ? time(b.clock) : b.status === 'exhausted' ? '0：只允许零剩余误差' : '不可达');
            set('adc', 'maxFin', b.maxFin === null ? '不可达' : frequency(b.maxFin)); renderSource();
            var messages = []; if (r.undersampled) messages.push('fin ≥ fs/2，当前为欠采样条件；公式仍使用模拟输入频率。');
            if (r.smallErrorWarning) messages.push('2πfinσtotal 较大，小时间误差近似可能失效。');
            if (b.status === 'unreachable') messages.push('目标性能在现有基线或固定抖动分量下不可达。');
            if (b.status === 'exhausted') messages.push('目标预算恰好用尽，只允许零 clock 裕量。'); warnings('adc', messages);
            var baseFin = read(state, 'adc', 'fin'), low = Math.max(1e3, baseFin / 100), high = baseFin * 100, curves = [];
            [100e-15, 300e-15, 1e-12, 3e-12, r.total].forEach(function (jitter, index) {
                var points = [];
                for (var i = 0; i <= 70; i++) {
                    var f = Math.exp(Math.log(low) + (Math.log(high) - Math.log(low)) * i / 70);
                    if (jitter === 0) points.push({ x: f, y: null });
                    else { var input = adcInput(f); input.clock = jitter; input.aperture = 0; input.buffer = 0; input.mode = 'jitter'; var v = J.adc(input).snrJitter; points.push({ x: f, y: Number.isFinite(v) ? v : null }); }
                }
                curves.push(dataset(index === 4 ? '当前总抖动（仅抖动）' : time(jitter), points));
            });
            var baseline = [];
            for (var k = 0; k <= 70; k++) { var f = Math.exp(Math.log(low) + (Math.log(high) - Math.log(low)) * k / 70), v = J.adc(adcInput(f)).performance; baseline.push({ x: f, y: Number.isFinite(v) ? v : null }); }
            curves.push(dataset('当前总抖动＋基线', baseline)); plot('adcChart', { xTitle: '模拟输入频率 fin / Hz', yTitle: 'SNR / SINAD / dB', data: { datasets: curves } });
            clearTable('adcExamples'); [1e7, 1e8, 5e8].forEach(function (f) {
                var v = J.adc(adcInput(f)), row = node('tr'); [frequency(f), fmt(v.snrJitter) + ' dB', fmt(v.performance) + ' dB', fmt(v.equivalentBits) + ' bit'].forEach(function (x) { row.appendChild(node('td', x)); }); $('adcExamples').appendChild(row);
            });
            var rows = parameterRows('adc'); rows.push(['结果', '总抖动', sci(r.total), 's'], ['结果', '仅抖动 SNR', fmt(r.snrJitter), 'dB'], ['结果', r.kind, fmt(r.performance), 'dB'],
                ['结果', r.bitLabel, fmt(r.equivalentBits), 'bit'], ['结果', '基线损失', fmt(r.loss), 'dB'], ['预算', '状态', b.status, ''],
                ['预算', '总 RMS', sci(b.total), 's'], ['预算', 'clock RMS', sci(b.clock), 's'], ['预算', '最大 fin', fmt(b.maxFin), 'Hz']);
            if (state.adc.source) rows.push(['来源', state.adc.source.type, $('adcSource').textContent, '']); messages.forEach(function (m) { rows.push(['警告', m, '', '']); }); finish('adc', rows);
        }
        function statsRow(group, prefix, stats) {
            set(group, prefix + 'Mean', time(stats.mean)); set(group, prefix + 'Std', time(stats.standardDeviation)); set(group, prefix + 'Rms', time(stats.rms));
            set(group, prefix + 'Min', time(stats.min)); set(group, prefix + 'Max', time(stats.max)); set(group, prefix + 'Peak', time(stats.peakToPeak));
        }
        function renderTie(r) {
            statsRow('tie', 'raw', r.raw); statsRow('tie', 'processed', r.processed); set('tie', 'slope', time(r.fit.slope) + ' / 样本');
            set('tie', 'frequency', r.fittedFrequency === null ? '拟合周期非正，无法给出频率' : frequency(r.fittedFrequency)); set('tie', 'ppm', r.ppm === null ? '—' : fmt(r.ppm) + ' ppm');
            function differenceStats(s) { return !s ? '未启用或样本不足' : time(s.standardDeviation) + ' / ' + time(s.rms) + ' / ' + time(s.peakToPeak); }
            set('tie', 'period', differenceStats(r.period)); set('tie', 'cycle', differenceStats(r.cycle));
            var raw = T.thin(r.values), processed = T.thin(r.detrended);
            plot('tieTrendChart', { logX: false, xTitle: '样本序号', yTitle: 'TIE / s', data: { datasets: [dataset('原始', raw.map(function (p) { return { x: p.index, y: p.value }; })), dataset('处理后', processed.map(function (p) { return { x: p.index, y: p.value }; }))] } });
            var bins = T.histogram(r.detrended, 24);
            plot('tieHistogramChart', { type: 'bar', logX: false, xTitle: '处理后 TIE  bin 中心 / s', yTitle: '样本数', data: { datasets: [dataset('样本数', bins.map(function (bin) { return { x: (bin.min + bin.max) / 2, y: bin.count }; }))] } });
            var messages = r.warnings.slice(); if (r.warning) messages.push(r.warning); if (state.tie.mode === 'edges' && !state.tie.consecutive) messages.push('尚未确认连续同极性边沿，周期与周期间结果未启用。'); warnings('tie', messages);
            var rows = parameterRows('tie'); rows.push(['结果', '样本数', String(r.raw.count), ''], ['原始', '均值', sci(r.raw.mean), 's'], ['原始', '标准差', sci(r.raw.standardDeviation), 's'],
                ['处理后', '均值', sci(r.processed.mean), 's'], ['处理后', '标准差', sci(r.processed.standardDeviation), 's'], ['处理后', 'RMS', sci(r.processed.rms), 's'],
                ['处理后', '峰峰值', sci(r.processed.peakToPeak), 's'], ['拟合', '斜率', sci(r.fit.slope), 's/样本'], ['拟合', '频率', fmt(r.fittedFrequency), 'Hz'], ['拟合', '频偏', fmt(r.ppm), 'ppm']);
            if (r.period) rows.push(['周期', '标准差', sci(r.period.standardDeviation), 's'], ['周期', '峰峰值', sci(r.period.peakToPeak), 's']);
            if (r.cycle) rows.push(['周期间', '标准差', sci(r.cycle.standardDeviation), 's'], ['周期间', '峰峰值', sci(r.cycle.peakToPeak), 's']);
            messages.forEach(function (m) { rows.push(['警告', m, '', '']); }); finish('tie', rows);
        }
        function locate(group, err) {
            var found = false;
            FIELDS[group].forEach(function (def) {
                var c = controls[group][def.key]; c.input.setAttribute('aria-invalid', 'false');
                if (found) return;
                try { if (def.key === 'rssValues') list(state); else read(state, group, def.key); }
                catch (fieldError) { c.input.setAttribute('aria-invalid', 'true'); found = true; }
            });
            $(group + 'Error').textContent = found ? '请修正标记的输入；当前没有有效结果。详细：' + err.message : err.message;
        }
        function calculate(group) {
            $(group + 'Error').textContent = ''; warnings(group, []);
            FIELDS[group].forEach(function (def) { controls[group][def.key].input.setAttribute('aria-invalid', 'false'); });
            try {
                var result = compute(group, state); results[group] = result; lastValid[group] = clone(state[group]);
                if (group === 'convert') renderConvert(result); else if (group === 'phase') renderPhase(result); else if (group === 'pll') renderPll(result);
                else if (group === 'adc') renderAdc(result); else renderTie(result); save(); return true;
            } catch (err) { clearGroup(group); locate(group, err); return false; }
        }
        function schedule(group) {
            if (group === 'tie') { invalidate(group); return; }
            if (timers[group]) { win.clearTimeout(timers[group]); delete timers[group]; }
            if (group === 'pll') timers[group] = win.setTimeout(function () { delete timers[group]; calculate(group); }, 200);
            else calculate(group);
        }
        function activate(name, focus) {
            if (TABS.indexOf(name) < 0) name = 'convert'; state.tab = name;
            TABS.forEach(function (tab) { var selected = tab === name; $(tab + 'Tab').setAttribute('aria-selected', String(selected)); $(tab + 'Tab').tabIndex = selected ? 0 : -1; $(tab + 'Panel').hidden = !selected; });
            if (focus) $(name + 'Tab').focus(); save();
        }
        function applyToADC(type) {
            var r = results[type]; if (!r || (type === 'pll' && !r.valid) || !Number.isFinite(r.seconds)) return false;
            var fs = type === 'pll' ? r.parameters.outputFrequency : read(state, 'phase', 'carrier');
            var message = '将把 ' + time(r.seconds) + ' 复制为 ADC clock，并将 ' + frequency(fs) + ' 视为采样率 fs。保留 fin、aperture 和 buffer。是否继续？';
            if (!win.confirm(message)) return false;
            state.adc.clock = fmt(r.seconds / 1e-12, 13); state.adc.clockUnit = 'ps'; state.adc.fs = fmt(fs / 1e6, 13); state.adc.fsUnit = 'MS/s';
            state.adc.source = type === 'pll' ? { type: 'pll', clockSeconds: r.seconds, fs: fs, low: r.parameters.low, high: r.parameters.high, topology: r.parameters.topology,
                model: { fref: r.parameters.fref, R: r.parameters.referenceDivider, N: r.parameters.feedbackDivider, D: r.parameters.outputDivider,
                    icp: r.parameters.icp, kvco: r.parameters.kvco, r2: r.parameters.r2, c1: r.parameters.c1, c2: r.parameters.c2, r3: r.parameters.r3, c3: r.parameters.c3 } } :
                { type: 'phase', clockSeconds: r.seconds, fs: fs, low: read(state, 'phase', 'low'), high: read(state, 'phase', 'high'), points: clone(r.points) };
            sync('adc'); calculate('adc'); activate('adc', false); return true;
        }
        function reset(group) { state[group] = clone(defaults()[group]); sync(group); calculate(group); }
        function copy(group) {
            if (!summaries[group]) { $(group + 'Error').textContent = '没有可复制的有效结果。'; return; }
            var text = 'Jitter 综合计算 / ' + group + '\n' + summaries[group];
            if (win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText) {
                win.navigator.clipboard.writeText(text).then(function () { $(group + 'Error').textContent = '结果摘要已复制。'; }, function () { $(group + 'Error').textContent = '浏览器拒绝剪贴板访问。'; });
            } else $(group + 'Error').textContent = '当前浏览器不支持剪贴板接口，请使用 CSV 导出。';
        }
        function download(group) {
            if (!exports[group]) { $(group + 'Error').textContent = '没有可导出的有效结果。'; return; }
            var lines = ['section,item,value,unit'].concat(exports[group].map(function (row) { return row.map(PN.csvEscape).join(','); }));
            var blob = new win.Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), url = win.URL.createObjectURL(blob);
            var a = node('a'); a.href = url; a.download = 'jitter-' + group + '.csv'; a.click(); win.URL.revokeObjectURL(url);
        }
        function importFile(group) {
            var input = $(group + 'File'), file = input.files && input.files[0]; if (!file) return;
            if ((file.size || String(file.content || '').length) > MAX_FILE) { invalidate(group, new Error('文件超过 5 MiB 限制')); return; }
            var reader = new win.FileReader();
            reader.onerror = function () { invalidate(group, new Error('文件读取失败')); };
            reader.onload = function () {
                if (group === 'phase') { state.phase.text = String(reader.result); $('phaseText').value = state.phase.text; }
                else { state.tie.text = String(reader.result); state.tie.consecutive = false; $('tieText').value = state.tie.text; $('tieConsecutive').checked = false; }
                calculate(group); input.value = '';
            };
            reader.readAsText(file, 'utf-8');
        }
        TABS.forEach(buildFields);
        Object.keys(SOURCE_NAMES).forEach(function (source) {
            var label = node('label'), input = node('input'); input.type = 'checkbox'; input.id = 'pll-source-' + source; input.checked = !!state.pll.sources[source];
            input.addEventListener('change', function () { state.pll.sources[source] = input.checked; schedule('pll'); }); label.append(input, node('span', SOURCE_NAMES[source])); $('pllSources').appendChild(label);
        });
        TABS.forEach(function (group, index) {
            sync(group);
            $(group + 'Tab').addEventListener('click', function () { activate(group, false); });
            $(group + 'Tab').addEventListener('keydown', function (event) {
                var next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'ArrowRight' ? (index + 1) % TABS.length : -1;
                if (next >= 0) { event.preventDefault(); activate(TABS[next], true); }
            });
            $(group + 'Reset').addEventListener('click', function () { reset(group); }); $(group + 'Copy').addEventListener('click', function () { copy(group); }); $(group + 'Export').addEventListener('click', function () { download(group); });
        });
        $('convertSource').addEventListener('change', function () { state.convert.source = $('convertSource').value; syncConvertUnits(); calculate('convert'); });
        $('convert-value').addEventListener('input', function () { state.convert.value = $('convert-value').value; calculate('convert'); });
        $('convert-unit').addEventListener('change', function () { state.convert.unit = $('convert-unit').value; calculate('convert'); });
        $('phaseParse').addEventListener('click', function () { calculate('phase'); });
        $('phaseText').addEventListener('input', function () { state.phase.text = $('phaseText').value; invalidate('phase'); });
        $('phaseOffsetUnit').addEventListener('change', function () { state.phase.offsetUnit = $('phaseOffsetUnit').value; invalidate('phase'); });
        [['phaseFlat', PN.flat], ['phaseShaped', PN.shaped]].forEach(function (item) { $(item[0]).addEventListener('click', function () { state.phase.text = PN.toText(item[1](), state.phase.offsetUnit); $('phaseText').value = state.phase.text; calculate('phase'); }); });
        $('phaseFile').addEventListener('change', function () { importFile('phase'); }); $('phaseApplyAdc').addEventListener('click', function () { applyToADC('phase'); });
        $('pllParse').addEventListener('click', function () { calculate('pll'); });
        $('pllTopology').addEventListener('change', function () { state.pll.topology = $('pllTopology').value; updateTopology(); schedule('pll'); });
        $('pllReferenceText').addEventListener('input', function () { state.pll.referenceText = $('pllReferenceText').value; invalidate('pll'); });
        $('pllVcoText').addEventListener('input', function () { state.pll.vcoText = $('pllVcoText').value; invalidate('pll'); });
        $('pllOffsetUnit').addEventListener('change', function () { state.pll.offsetUnit = $('pllOffsetUnit').value; invalidate('pll'); });
        $('pllApplyAdc').addEventListener('click', function () { applyToADC('pll'); });
        $('adcMode').addEventListener('change', function () { state.adc.mode = $('adcMode').value; updateBaseline(); calculate('adc'); });
        $('tieParse').addEventListener('click', function () { calculate('tie'); });
        ['Mode', 'Unit', 'Detrend'].forEach(function (name) { $('tie' + name).addEventListener('change', function () {
            var key = name === 'Mode' ? 'mode' : name === 'Unit' ? 'unit' : 'detrend'; state.tie[key] = $('tie' + name).value;
            if (name === 'Mode') { state.tie.consecutive = false; $('tieConsecutive').checked = false; updateTieMode(); } invalidate('tie');
        }); });
        $('tieText').addEventListener('input', function () { state.tie.text = $('tieText').value; state.tie.consecutive = false; $('tieConsecutive').checked = false; invalidate('tie'); });
        $('tieConsecutive').addEventListener('change', function () { state.tie.consecutive = $('tieConsecutive').checked; invalidate('tie'); });
        [['tieOffset', 'offset'], ['tieDrift', 'drift'], ['tieSine', 'sine']].forEach(function (item) { $(item[0]).addEventListener('click', function () {
            state.tie.mode = 'tie'; state.tie.unit = 'ps'; state.tie.text = tieExample(item[1]); state.tie.consecutive = false; sync('tie'); calculate('tie');
        }); });
        $('tieFile').addEventListener('change', function () { importFile('tie'); });
        TABS.forEach(calculate); activate(state.tab, false);
        return { state: state, results: results, calculate: calculate, activate: activate, applyToADC: applyToADC, save: save, summaries: summaries, exports: exports };
    }
    return { STORE: STORE, FIELDS: FIELDS, defaults: defaults, restore: restore, compute: compute, mount: mount,
        fmt: fmt, time: time, frequency: frequency };
}));

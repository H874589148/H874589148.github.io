/* 页面交互；所有物理数值与示例结果均由 parasitic-core.js 计算。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./parasitic-core.js'));
    else { root.ParasiticUI = factory(root.ParasiticCore); root.ParasiticUI.mount(document, root); }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
    'use strict';
    var STORE = 'ee-package-pcb-parasitic';
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function digits(value) { return String(Number(value.toPrecision(5))); }
    function ohm(value) { return Math.abs(value) < 1 ? digits(value * 1e3) + ' mΩ' : digits(value) + ' Ω'; }
    function henry(value) { return digits(value * 1e9) + ' nH'; }
    function perMeter(value) { return digits(value * 1e6) + ' nH/mm'; }
    function micrometre(value) { return digits(value * 1e6) + ' µm'; }
    function frequency(value) {
        if (value >= 1e9) return digits(value / 1e9) + ' GHz';
        if (value >= 1e6) return digits(value / 1e6) + ' MHz';
        if (value >= 1e3) return digits(value / 1e3) + ' kHz';
        return digits(value) + ' Hz';
    }
    function presetState(group, input) {
        var state = C.defaults()[group];
        function set(key, value, unit) { state[key] = String(Number(value.toPrecision(14))); state[key + 'Unit'] = unit; }
        if (group === 'bond') {
            set('length', input.length / C.UNITS.mm, 'mm');
            set('diameter', input.diameter / C.UNITS.um, 'um');
        } else {
            set('length', input.length / C.UNITS.mm, 'mm');
            set('width', input.width / C.UNITS.mm, 'mm');
            set('thickness', input.thickness / C.UNITS.oz, 'oz');
            set('height', input.height / C.UNITS.mm, 'mm');
            set('er', input.er, '1');
            var unit = input.frequency >= 1e9 ? 'GHz' : 'MHz';
            set('frequency', input.frequency / C.UNITS[unit], unit);
        }
        return state;
    }
    function mount(doc, win) {
        var $ = function (id) { return doc.getElementById(id); }, state, controls = { bond: {}, pcb: {} };
        var lastValid = { bond: null, pcb: null };
        try { state = C.restore(win.localStorage.getItem(STORE)); } catch (e) { state = C.defaults(); }
        lastValid.bond = clone(state.bond); lastValid.pcb = clone(state.pcb);

        function node(tag, text, className) {
            var el = doc.createElement(tag);
            if (text !== undefined) el.textContent = text;
            if (className) el.className = className;
            return el;
        }
        function save() {
            var snapshot = { version: 1, tab: state.tab, bond: lastValid.bond, pcb: lastValid.pcb };
            try {
                win.localStorage.setItem(STORE, JSON.stringify(snapshot));
                $('ppStorageStatus').textContent = '有效参数与当前标签已保存在本机。';
            } catch (e) {
                $('ppStorageStatus').textContent = '本机存储不可用；本次仍可计算，刷新后可能丢失输入。';
            }
        }
        function sync(group) {
            Object.keys(C.FIELDS[group]).forEach(function (key) {
                controls[group][key].input.value = state[group][key];
                controls[group][key].unit.value = state[group][key + 'Unit'];
            });
        }
        function buildFields(group, container) {
            Object.keys(C.FIELDS[group]).forEach(function (key) {
                var def = C.FIELDS[group][key], id = group + '-' + key;
                var box = node('div', undefined, 'pp-field'), label = node('label', def.label);
                label.htmlFor = id;
                var row = node('div', undefined, 'pp-unit-row');
                var input = node('input'); input.type = 'text'; input.id = id; input.inputMode = 'decimal';
                input.autocomplete = 'off'; input.spellcheck = false; input.value = state[group][key];
                input.setAttribute('aria-describedby', id + '-error');
                var unit = node('select'); unit.id = id + '-unit'; unit.setAttribute('aria-label', def.label + '单位');
                def.units.forEach(function (name) {
                    var option = node('option', name === 'um' ? 'µm' : name); option.value = name; unit.appendChild(option);
                });
                unit.value = state[group][key + 'Unit'];
                var error = node('span', '', 'pp-field-error'); error.id = id + '-error';
                row.append(input, unit); box.append(label, row, error); container.appendChild(box);
                controls[group][key] = { input: input, unit: unit, error: error };
                input.addEventListener('input', function () { state[group][key] = input.value; calculate(group); });
                unit.addEventListener('change', function () {
                    try {
                        C.changeUnit(state, group, key, unit.value);
                        input.value = state[group][key];
                        calculate(group);
                    } catch (err) {
                        unit.value = state[group][key + 'Unit'];
                        error.textContent = err.message;
                        input.setAttribute('aria-invalid', 'true');
                    }
                });
            });
        }
        function setOutputs(group, values) {
            Object.keys(values).forEach(function (id) { $(group + '-' + id).textContent = values[id]; });
        }
        function clearOutputs(group) {
            var ids = group === 'bond' ? ['resistance', 'inductance', 'ratio'] :
                ['dcResistance', 'acResistance', 'inductancePerMeter', 'inductance', 'impedance', 'effectivePermittivity', 'skinDepth', 'skinMode'];
            var empty = {};
            ids.forEach(function (id) { empty[id] = '—'; });
            setOutputs(group, empty);
        }
        function calculate(group) {
            Object.keys(controls[group]).forEach(function (key) {
                controls[group][key].error.textContent = '';
                controls[group][key].input.setAttribute('aria-invalid', 'false');
            });
            $(group + 'Error').textContent = '';
            try {
                var values = C.readGroup(state, group);
                if (group === 'bond') {
                    var b = C.bond(values);
                    setOutputs(group, { resistance: ohm(b.resistance), inductance: henry(b.inductance), ratio: digits(b.ratio) });
                } else {
                    var p = C.pcb(values);
                    setOutputs(group, {
                        dcResistance: ohm(p.dcResistance), acResistance: ohm(p.acResistance),
                        inductancePerMeter: perMeter(p.inductancePerMeter), inductance: henry(p.inductance),
                        impedance: digits(p.impedance) + ' Ω', effectivePermittivity: digits(p.effectivePermittivity),
                        skinDepth: micrometre(p.skinDepth), skinMode: p.skinMode === 'dc' ? '低频极限：Rac = Rdc' : '趋肤薄层：Aδ = 2δ(w + t) − 4δ²'
                    });
                }
                lastValid[group] = clone(state[group]);
                save();
                return true;
            } catch (err) {
                clearOutputs(group);
                var located = false;
                Object.keys(C.FIELDS[group]).forEach(function (key) {
                    if (located) return;
                    try { C.readField(state, group, key); } catch (fieldError) {
                        controls[group][key].error.textContent = fieldError.message;
                        controls[group][key].input.setAttribute('aria-invalid', 'true');
                        located = true;
                    }
                });
                $(group + 'Error').textContent = located ? '请修正标记的输入；当前没有有效结果。' : err.message;
                return false;
            }
        }
        function activate(name, focus) {
            state.tab = name === 'pcb' ? 'pcb' : 'bond';
            ['bond', 'pcb'].forEach(function (tab) {
                var selected = tab === state.tab, button = $(tab + 'Tab');
                button.setAttribute('aria-selected', String(selected));
                button.tabIndex = selected ? 0 : -1;
                $(tab + 'Panel').hidden = !selected;
            });
            if (focus) $(state.tab + 'Tab').focus();
            save();
        }
        function applyPreset(group, input) {
            state[group] = presetState(group, input);
            sync(group); calculate(group);
        }
        function cell(row, text) { var td = node('td', text); row.appendChild(td); }
        function buildExamples() {
            C.bondExamples().forEach(function (example) {
                var row = node('tr');
                cell(row, example.name); cell(row, digits(example.input.length * 1e3));
                cell(row, digits(example.input.diameter * 1e6)); cell(row, ohm(example.result.resistance));
                cell(row, henry(example.result.inductance));
                var td = node('td'), button = node('button', '应用此组', 'btn pp-apply'); button.type = 'button';
                button.addEventListener('click', function () { applyPreset('bond', example.input); });
                td.appendChild(button); row.appendChild(td); $('bondExamples').appendChild(row);
            });
            C.pcbExamples().forEach(function (example) {
                var row = node('tr'), input = example.input;
                cell(row, example.name); cell(row, digits(input.length * 1e3)); cell(row, digits(input.width * 1e3));
                cell(row, digits(input.thickness / C.UNITS.oz)); cell(row, digits(input.height * 1e3));
                cell(row, digits(input.er)); cell(row, frequency(input.frequency));
                cell(row, ohm(example.result.dcResistance)); cell(row, ohm(example.result.acResistance));
                cell(row, henry(example.result.inductance));
                var td = node('td'), button = node('button', '应用此组', 'btn pp-apply'); button.type = 'button';
                button.addEventListener('click', function () { applyPreset('pcb', example.input); });
                td.appendChild(button); row.appendChild(td); $('pcbExamples').appendChild(row);
            });
        }
        buildFields('bond', $('bondFields')); buildFields('pcb', $('pcbFields')); buildExamples();
        ['bond', 'pcb'].forEach(function (group) {
            $(group + 'Reset').addEventListener('click', function () {
                state[group] = C.defaults()[group]; sync(group); calculate(group);
            });
            $(group + 'Tab').addEventListener('click', function () { activate(group, false); });
            $(group + 'Tab').addEventListener('keydown', function (event) {
                var next = event.key === 'Home' ? 'bond' : event.key === 'End' ? 'pcb' :
                    event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? (group === 'bond' ? 'pcb' : 'bond') : '';
                if (next) { event.preventDefault(); activate(next, true); }
            });
            calculate(group);
        });
        activate(state.tab, false);
        return { calculate: calculate, activate: activate, state: state };
    }
    return { mount: mount, presetState: presetState, digits: digits, ohm: ohm, henry: henry, perMeter: perMeter, frequency: frequency };
}));

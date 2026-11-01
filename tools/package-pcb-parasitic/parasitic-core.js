/* 封装/PCB 寄生估算：SI 单位纯计算与存档校验，不依赖 DOM。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ParasiticCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var RHO_GOLD = 2.4e-8, RHO_COPPER = 1.72e-8;
    var MU0 = 4 * Math.PI * 1e-7, C0 = 299792458;
    var UNITS = {
        '1': 1, mm: 1e-3, cm: 1e-2, um: 1e-6, mil: 2.54e-5,
        oz: 35e-6, Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9
    };
    var FIELDS = {
        bond: {
            length: { label: '键合线长度', units: ['mm'], positive: true },
            diameter: { label: '键合线直径', units: ['um', 'mil'], positive: true }
        },
        pcb: {
            length: { label: '走线长度', units: ['mm', 'cm'], positive: true },
            width: { label: '走线宽度', units: ['mm', 'mil'], positive: true },
            thickness: { label: '铜厚', units: ['um', 'oz'], positive: true },
            height: { label: '介质厚度', units: ['mm', 'mil'], positive: true },
            er: { label: '相对介电常数', units: ['1'], min: 1 },
            frequency: { label: '正弦频率', units: ['Hz', 'kHz', 'MHz', 'GHz'], positive: true }
        }
    };
    var BOND_PRESETS = [
        { name: '细线 / 短线', length: 1e-3, diameter: 20e-6 },
        { name: '常规 1 mil', length: 1e-3, diameter: 25e-6 },
        { name: '常规 1 mil', length: 2e-3, diameter: 25e-6 },
        { name: '常规 1 mil', length: 3e-3, diameter: 25e-6 },
        { name: '长键合线', length: 5e-3, diameter: 25e-6 },
        { name: '较粗线径', length: 2e-3, diameter: 32e-6 },
        { name: '粗线径', length: 2e-3, diameter: 50e-6 }
    ];
    var PCB_PRESETS = [
        { name: '细信号线', length: 10e-3, width: 0.15e-3, thickness: 35e-6, height: 0.2e-3, er: 4.3, frequency: 10e6 },
        { name: '常规信号线', length: 10e-3, width: 0.2e-3, thickness: 35e-6, height: 0.2e-3, er: 4.3, frequency: 100e6 },
        { name: '约 50 Ω 几何', length: 20e-3, width: 0.35e-3, thickness: 35e-6, height: 0.2e-3, er: 4.3, frequency: 100e6 },
        { name: '宽电源线', length: 20e-3, width: 1e-3, thickness: 35e-6, height: 0.2e-3, er: 4.3, frequency: 1e6 },
        { name: '2 oz 厚铜', length: 20e-3, width: 0.5e-3, thickness: 70e-6, height: 0.2e-3, er: 4.3, frequency: 100e6 },
        { name: '1 GHz 趋肤估算', length: 10e-3, width: 0.2e-3, thickness: 35e-6, height: 0.2e-3, er: 4.3, frequency: 1e9 }
    ];

    function defaults() {
        return {
            version: 1,
            tab: 'bond',
            bond: { length: '2', lengthUnit: 'mm', diameter: '25', diameterUnit: 'um' },
            pcb: { length: '10', lengthUnit: 'mm', width: '0.2', widthUnit: 'mm', thickness: '35', thicknessUnit: 'um', height: '0.2', heightUnit: 'mm', er: '4.3', erUnit: '1', frequency: '100', frequencyUnit: 'MHz' }
        };
    }
    function finite(value, label) {
        if (!Number.isFinite(value)) throw new Error((label || '数值') + '必须是有限数');
        return value;
    }
    function number(value, scale, label) {
        var text = typeof value === 'string' ? value.trim() : value;
        if (text === '' || (typeof text === 'string' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))) {
            throw new Error((label || '数值') + '格式无效');
        }
        return finite(Number(text) * scale, label);
    }
    function check(value, def) {
        finite(value, def.label);
        if (def.positive && !(value > 0)) throw new Error(def.label + '必须大于 0');
        if (def.min !== undefined && !(value >= def.min)) throw new Error(def.label + '不能小于 ' + def.min);
        return value;
    }
    function readField(state, group, key) {
        var def = FIELDS[group][key], unit = state[group][key + 'Unit'];
        if (def.units.indexOf(unit) === -1) throw new Error(def.label + '单位无效');
        return check(number(state[group][key], UNITS[unit], def.label), def);
    }
    function readGroup(state, group) {
        var out = {};
        Object.keys(FIELDS[group]).forEach(function (key) { out[key] = readField(state, group, key); });
        return out;
    }
    function restore(raw) {
        var fallback = defaults(), saved;
        try { saved = raw && typeof raw === 'object' ? raw : JSON.parse(raw || 'null'); } catch (e) { return fallback; }
        if (!saved || saved.version !== 1) return fallback;
        fallback.tab = saved.tab === 'pcb' ? 'pcb' : 'bond';
        ['bond', 'pcb'].forEach(function (group) {
            Object.keys(FIELDS[group]).forEach(function (key) {
                var def = FIELDS[group][key], source = saved[group];
                if (!source || typeof source !== 'object') return;
                var value = source[key], unit = source[key + 'Unit'];
                if (typeof value === 'string' && value.length <= 64 && def.units.indexOf(unit) !== -1) {
                    try { check(number(value, UNITS[unit], def.label), def); fallback[group][key] = value; fallback[group][key + 'Unit'] = unit; } catch (e) { /* 单字段损坏不影响其他有效字段。 */ }
                }
            });
        });
        return fallback;
    }
    function changeUnit(state, group, key, nextUnit) {
        var def = FIELDS[group] && FIELDS[group][key];
        if (!def || def.units.indexOf(nextUnit) === -1) throw new Error('未知字段或单位');
        var oldUnit = state[group][key + 'Unit'];
        if (def.units.indexOf(oldUnit) === -1) throw new Error('原单位无效');
        var si = check(number(state[group][key], UNITS[oldUnit], def.label), def);
        var converted = si / UNITS[nextUnit];
        finite(converted, def.label);
        state[group][key] = String(Number(converted.toPrecision(14)));
        state[group][key + 'Unit'] = nextUnit;
        return state;
    }
    function validResult(values) {
        Object.keys(values).forEach(function (key) { finite(values[key], key); });
        return values;
    }
    function bond(input) {
        var l = check(input.length, FIELDS.bond.length), d = check(input.diameter, FIELDS.bond.diameter);
        var ratio = finite(4 * l / d, '长径比');
        var resistance = 4 * RHO_GOLD * l / (Math.PI * d * d);
        var bracket = Math.log(ratio) + Math.tanh(ratio) / 4 - 1;
        var inductance = MU0 * l / (2 * Math.PI) * bracket;
        if (!(inductance > 0)) throw new Error('长径比过小，超出直圆导线自感近似的有效范围');
        validResult({ resistance: resistance, inductance: inductance, ratio: ratio });
        return { resistance: resistance, inductance: inductance, ratio: l / d };
    }
    function pcb(input) {
        ['length', 'width', 'thickness', 'height', 'frequency'].forEach(function (key) { check(input[key], FIELDS.pcb[key]); });
        var er = check(input.er, FIELDS.pcb.er), l = input.length, w = input.width, t = input.thickness;
        var impedanceArgument = finite(5.98 * input.height / (0.8 * w + t), '微带几何比值');
        var impedance = 87 / Math.sqrt(er + 1.41) * Math.log(impedanceArgument);
        if (!(impedance > 0)) throw new Error('当前微带几何使阻抗公式无效，请核对介质厚度、线宽与铜厚');
        var effectivePermittivity = 0.475 * er + 0.67;
        var inductancePerMeter = impedance * Math.sqrt(effectivePermittivity) / C0;
        var inductance = inductancePerMeter * l;
        var dcResistance = RHO_COPPER * l / (w * t);
        var skinDepth = Math.sqrt(RHO_COPPER / (Math.PI * input.frequency * MU0));
        var skinMode = 2 * skinDepth >= Math.min(w, t) ? 'dc' : 'skin';
        var effectiveArea = w * t;
        if (skinMode === 'skin') effectiveArea = 2 * skinDepth * (w + t) - 4 * skinDepth * skinDepth;
        var acResistance = RHO_COPPER * l / effectiveArea;
        validResult({ impedance: impedance, effectivePermittivity: effectivePermittivity, inductancePerMeter: inductancePerMeter,
            inductance: inductance, dcResistance: dcResistance, acResistance: acResistance, skinDepth: skinDepth, effectiveArea: effectiveArea });
        if (!(acResistance >= dcResistance)) throw new Error('趋肤计算出现非物理结果');
        return { impedance: impedance, effectivePermittivity: effectivePermittivity, inductancePerMeter: inductancePerMeter,
            inductance: inductance, dcResistance: dcResistance, acResistance: acResistance, skinDepth: skinDepth, skinMode: skinMode, effectiveArea: effectiveArea };
    }
    function bondExamples() { return BOND_PRESETS.map(function (p) { return { name: p.name, input: { length: p.length, diameter: p.diameter }, result: bond(p) }; }); }
    function pcbExamples() { return PCB_PRESETS.map(function (p) { return { name: p.name, input: { length: p.length, width: p.width, thickness: p.thickness, height: p.height, er: p.er, frequency: p.frequency }, result: pcb(p) }; }); }

    return {
        RHO_GOLD: RHO_GOLD, RHO_COPPER: RHO_COPPER, MU0: MU0, C0: C0,
        UNITS: UNITS, FIELDS: FIELDS, defaults: defaults, restore: restore,
        number: number, readField: readField, readGroup: readGroup, changeUnit: changeUnit,
        bond: bond, pcb: pcb, bondExamples: bondExamples, pcbExamples: pcbExamples
    };
}));

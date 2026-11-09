/* 运行：node --test js/tests/jitter-ui.test.js。DOM 替身不替代真实浏览器验收。 */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { environment, settle } = require('./handoff-harness.js');
const J = require('../../tools/jitter-calc/jitter-core.js'), PN = require('../../tools/jitter-calc/phase-noise.js');
const T = require('../../tools/jitter-calc/tie-core.js'), PLL = require('../../tools/jitter-calc/pll-core.js');
const UI = require('../../tools/jitter-calc/script.js');
const root = path.resolve(__dirname, '../..'), code = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = code('tools/jitter-calc/index.html');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
function mount(setup) {
    const h = environment(); ids.forEach(h.get);
    h.s.JitterCore = J; h.s.PhaseNoise = PN; h.s.TieCore = T; h.s.PLLCore = PLL;
    h.s.MutationObserver = class { observe() {} };
    h.s.FileReader = class { readAsText(file) { this.result = file.content; this.onload(); } };
    if (setup) setup(h);
    h.run('tools/jitter-calc/plots.js'); h.run('tools/jitter-calc/pll-figure.js'); h.run('tools/jitter-calc/script.js');
    const get = h.get;
    h.get = id => h.s.document.body.all().find(el => el.id === id) || get(id);
    return h;
}
const app = h => h.s.JitterUI.instance;
const saved = h => JSON.parse(h.s.localStorage.getItem('ee-jitter-calc'));

test('真实页面脚本以默认参数计算五标签，TIE 原文不进入存档', () => {
    const h = mount(), a = app(h);
    assert.match(h.get('convert-rssTotal').textContent, /ps/); assert.match(h.get('phase-seconds').textContent, /fs/);
    assert.match(h.get('pll-seconds').textContent, /s/); assert.equal(h.get('pllApplyAdc').disabled, false);
    assert.match(h.get('adc-performance').textContent, /dB/); assert.notEqual(h.get('tie-processedStd').textContent, '—');
    assert.equal(a.results.phase.seconds > 0, true); assert.equal(a.results.pll.valid, true);
    const store = saved(h); assert.equal(store.version, 1); assert.equal(store.tie.text, undefined);
    assert.ok(store.phase.text.includes('phaseNoise')); assert.ok(store.pll.referenceText.includes('phaseNoise'));
});

test('五标签方向键、Home/End、焦点与 ARIA 状态同步', () => {
    const h = mount();
    h.get('convertTab').fire('keydown', { key: 'ArrowRight' }); assert.equal(h.get('phasePanel').hidden, false);
    h.get('phaseTab').fire('keydown', { key: 'End' }); assert.equal(h.get('tiePanel').hidden, false);
    h.get('tieTab').fire('keydown', { key: 'ArrowRight' }); assert.equal(h.get('convertPanel').hidden, false);
    h.get('convertTab').fire('keydown', { key: 'ArrowLeft' }); assert.equal(h.get('tiePanel').hidden, false);
    h.get('tieTab').fire('keydown', { key: 'Home' }); assert.equal(h.get('convertTab').getAttribute('aria-selected'), 'true');
    assert.equal(saved(h).tab, 'convert');
});

test('单位切换保持物理值，非法输入清空结果并保留最后有效存档', () => {
    const h = mount(), before = saved(h), total = h.get('adc-total').textContent;
    const unit = h.get('adc-clock-unit'); unit.value = 'fs'; unit.fire('change');
    assert.equal(Number(h.get('adc-clock').value), 1000); assert.equal(h.get('adc-total').textContent, total);
    const low = h.get('phase-low'); low.value = '0'; low.fire('input');
    assert.equal(h.get('phase-seconds').textContent, '—'); assert.equal(h.get('phaseApplyAdc').disabled, true);
    assert.equal(low.getAttribute('aria-invalid'), 'true'); assert.equal(saved(h).phase.low, before.phase.low);
    low.value = '1'; low.fire('input'); assert.notEqual(h.get('phase-seconds').textContent, '—');
    const pll = h.get('pll-icp'); pll.value = 'bad'; pll.fire('input'); h.tick(200);
    assert.equal(h.get('pll-seconds').textContent, '—'); assert.equal(h.get('pllApplyAdc').disabled, true);
});

test('相噪文本与文件导入报告排序，文本修改后禁用旧结果', () => {
    const h = mount();
    h.get('phaseText').value = '1000000,-140\n1000,-140'; h.get('phaseText').fire('input');
    assert.equal(h.get('phase-seconds').textContent, '—');
    h.get('phaseOffsetUnit').value = 'Hz'; h.get('phaseOffsetUnit').fire('change'); h.get('phaseParse').click();
    assert.match(h.get('phaseWarnings').children.map(el => el.textContent).join(' '), /自动排序/); assert.notEqual(h.get('phase-seconds').textContent, '—');
    h.get('phaseOffsetUnit').value = 'kHz'; h.get('phaseOffsetUnit').fire('change');
    const file = h.get('phaseFile'); file.files = [{ content: '\uFEFFoffset(kHz),phaseNoise(dBc/Hz)\r\n1,-140\r\n1000,-140\r\n', size: 60 }]; file.fire('change');
    assert.match(h.get('phase-seconds').textContent, /fs/);
    h.get('phaseShaped').click(); assert.ok(app(h).results.phase.points.length > 2);
});

test('PLL 拓扑 B、200 ms 防抖和相噪文本错误均操作实际控件', () => {
    const h = mount(), topology = h.get('pllTopology'); topology.value = 'B'; topology.fire('change');
    assert.equal(app(h).results.pll.parameters.topology, 'A'); h.tick(199); assert.equal(app(h).results.pll.parameters.topology, 'A');
    h.tick(200); assert.equal(app(h).results.pll.parameters.topology, 'B'); assert.ok(app(h).results.pll.contributions.r3);
    assert.match(h.get('pllFigure').innerHTML, /R3/); assert.equal(h.get('pll-r3').parentNode.parentNode.hidden, false);
    h.get('pllReferenceText').value = 'bad'; h.get('pllReferenceText').fire('input'); assert.equal(h.get('pll-seconds').textContent, '—');
    h.get('pllParse').click(); assert.match(h.get('pllError').textContent, /格式无效|时间|频偏/);
});

test('相噪应用到 ADC 需确认，保留 fin/aperture/buffer 并冻结来源快照', () => {
    const h = mount(), original = { fin: h.get('adc-fin').value, aperture: h.get('adc-aperture').value, buffer: h.get('adc-buffer').value };
    h.s.confirm = () => false; assert.equal(app(h).applyToADC('phase'), false); assert.equal(app(h).state.adc.source, null);
    h.s.confirm = () => true; assert.equal(app(h).applyToADC('phase'), true);
    assert.equal(h.get('adc-fin').value, original.fin); assert.equal(h.get('adc-aperture').value, original.aperture); assert.equal(h.get('adc-buffer').value, original.buffer);
    const displayedClock = Number(h.get('adc-clock').value), expectedClock = app(h).results.phase.seconds / 1e-12;
    assert.ok(Math.abs(displayedClock - expectedClock) <= expectedClock * 1e-12);
    assert.equal(Number(h.get('adc-fs').value), 100); assert.match(h.get('adcSource').textContent, /相噪积分/);
    const snapshot = app(h).state.adc.source.clockSeconds, clock = h.get('adc-clock').value;
    h.get('phase-carrier').value = '200'; h.get('phase-carrier').fire('input'); assert.equal(h.get('adc-clock').value, clock);
    assert.equal(app(h).state.adc.source.clockSeconds, snapshot);
    h.get('adc-clock').value = '2'; h.get('adc-clock').fire('input'); assert.match(h.get('adcSource').textContent, /已手动修改/);
});

test('PLL 应用快照保存拓扑、频段和模型参数', () => {
    const h = mount(); h.s.confirm = () => true; assert.equal(app(h).applyToADC('pll'), true);
    const source = app(h).state.adc.source; assert.equal(source.type, 'pll'); assert.equal(source.topology, 'A');
    assert.equal(source.low, 1e3); assert.equal(source.high, 1e6); assert.equal(source.model.N, 10);
    assert.equal(Number(h.get('adc-fs').value), 100);
});

test('TIE 只有确认连续边沿后才输出周期，编辑原文会撤销确认', () => {
    const h = mount(), mode = h.get('tieMode'); mode.value = 'edges'; mode.fire('change');
    h.get('tieUnit').value = 's'; h.get('tieUnit').fire('change');
    h.get('tieText').value = '0\n0.000000010001\n0.000000020003'; h.get('tieText').fire('input');
    h.get('tieParse').click(); assert.equal(h.get('tie-period').textContent, '未启用或样本不足');
    const confirm = h.get('tieConsecutive'); confirm.checked = true; confirm.fire('change'); h.get('tieParse').click();
    assert.match(h.get('tie-period').textContent, /ps/); assert.match(h.get('tie-cycle').textContent, /ps/);
    h.get('tieText').value += '\n0.000000030006'; h.get('tieText').fire('input');
    assert.equal(confirm.checked, false); assert.equal(h.get('tie-period').textContent, '—');
    h.get('tieOffset').click(); assert.match(h.get('tie-rawMean').textContent, /ps/);
});

test('存档损坏、未知版本和非法组安全回落，读写异常不阻断计算', () => {
    assert.deepEqual(UI.restore('{broken'), UI.defaults()); assert.deepEqual(UI.restore(JSON.stringify({ version: 99 })), UI.defaults());
    const state = UI.defaults(); state.tab = 'adc'; state.adc.clock = '-1'; state.phase.carrier = '200';
    const restored = UI.restore(JSON.stringify({ version: 1, ...state }));
    assert.equal(restored.tab, 'adc'); assert.equal(restored.adc.clock, '1'); assert.equal(restored.phase.carrier, '200');
    const read = mount(h => { h.s.localStorage.failRead = true; }); assert.notEqual(read.get('adc-performance').textContent, '—');
    const write = mount(h => { h.s.localStorage.failWrite = true; }); assert.match(write.get('jitterStorageStatus').textContent, /存储不可用/);
    assert.notEqual(write.get('pll-seconds').textContent, '—');
});

test('复制摘要和 CSV 导出包含单位、基线、拓扑、频段和去趋势', async () => {
    let copied = '', blob = null; const h = mount(h => {
        h.s.navigator = { clipboard: { writeText(text) { copied = text; return Promise.resolve(); } } };
        h.s.URL = { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL() {} };
    });
    h.get('pllCopy').click(); await settle(); assert.match(copied, /拓扑/); assert.match(copied, /积分下限/);
    h.get('pllExport').click(); assert.ok(blob); const csv = await blob.text(); assert.match(csv, /section,item,value,unit/); assert.match(csv, /相位裕度/);
    h.get('adcCopy').click(); await settle(); assert.match(copied, /基线模式/);
    h.get('tieCopy').click(); await settle(); assert.match(copied, /去趋势/);
});

test('主题重建销毁全部旧图表并更新调色板', () => {
    const h = mount(env => {
        const s = env.s; s.instances = [];
        s.getComputedStyle = () => ({ getPropertyValue(name) {
            const dark = s.document.documentElement.getAttribute('data-theme') === 'dark';
            if (name === '--color-primary') return dark ? '#9abcdd' : '#3a5a8c';
            return dark ? '#e8e4dc' : '#2c2c2c';
        } });
        s.Chart = class { constructor(context, config) { this.config = config; this.destroyed = false; s.instances.push(this); }
            destroy() { this.destroyed = true; } };
        for (const id of ['phaseNoiseChart', 'phaseCumulativeChart', 'pllLoopChart', 'pllPhaseChart', 'pllNoiseChart', 'adcChart', 'tieTrendChart', 'tieHistogramChart']) env.get(id).getContext = () => ({});
    }), s = h.s;
    const first = s.instances.slice(), before = first[0].config.data.datasets[0].borderColor;
    assert.equal(first.length, 8); s.document.documentElement.setAttribute('data-theme', 'dark'); s.JitterPlots.theme();
    assert.equal(s.instances.length, 16); assert.ok(first.every(chart => chart.destroyed));
    const after = s.instances[8].config.data.datasets[0].borderColor; assert.notEqual(after, before);
});

test('首页、图标、脚本依赖、ARIA 和静态公式集成完整', () => {
    const home = code('index.html'), common = code('js/common.js'), style = code('tools/jitter-calc/style.css');
    assert.match(style, /@media \(max-width: 900px\)[\s\S]+?grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(style, /@media \(max-width: 600px\)/); assert.match(style, /\.jitter-table-wrap \{[^}]*overflow-x: auto/);
    assert.match(home, /tools\/jitter-calc\/index\.html/); assert.match(home, /'icon-jitter': 'jitter'/);
    assert.match(home, /'tools\/jitter-calc\/':[^\n]+PLL/); assert.match(common, /jitter: '<svg/);
    for (const file of ['jitter-core.js', 'phase-noise.js', 'tie-core.js', 'pll-core.js', 'plots.js', 'pll-figure.js', 'script.js']) assert.match(html, new RegExp(file.replace('.', '\\.')));
    assert.match(html, /\.\.\/\.\.\/lib\/chart\.min\.js/); assert.match(html, /\.\.\/\.\.\/razavi\/figure-utils\.js/);
    assert.match(html, /MT-007/); assert.match(html, /SNAA106C/); assert.equal(new Set(ids).size, ids.length);
    for (const group of ['convert', 'phase', 'pll', 'adc', 'tie']) {
        assert.ok(ids.includes(group + 'Error'), group + 'Error'); assert.ok(ids.includes(group + 'Warnings'), group + 'Warnings');
    }
    assert.equal((html.match(/role="tab"/g) || []).length, 5); assert.equal((html.match(/role="tabpanel"/g) || []).length, 5);
});

/* 运行：node --test js/tests/sim-log.test.js；真实布局、Word/WPS 粘贴与 LaTeX 编译另验。 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../../tools/sim-log/script');
const marked = require('../../lib/marked.min.js');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'tools/sim-log/index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'tools/sim-log/script.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'tools/sim-log/style.css'), 'utf8');
const defaults = { label: { bold: true, italic: false, color: 'auto' }, value: { bold: false, italic: true, color: 'auto' } };
const fieldValues = s => Object.fromEntries(M.buildFields(s).map(f => [f.label, f.value]));
const attr = (s, key) => (s.match(new RegExp('\\b' + key + '="([^"]*)"')) || [])[1];
function optionsOf(id) {
    const content = html.match(new RegExp('<select\\b[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</select>'))[1];
    return [...content.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(m => ({ value: attr(m[1], 'value'), selected: /\bselected\b/.test(m[1]) }));
}

// 轻量 DOM / Clipboard 模拟只验证状态与事件，不冒充真实浏览器或 Office 验收。
function harness({ raw = null, storageThrows = false, clipboard, execResult = true, execThrows = false } = {}) {
    let stored = raw;
    const timers = [], writes = [], copies = [], nodes = {};
    const emitter = obj => Object.assign(obj, {
        listeners: {},
        addEventListener(type, fn) { (this.listeners[type] ||= new Set()).add(fn); },
        removeEventListener(type, fn) { this.listeners[type]?.delete(fn); },
        emit(type, detail = {}) {
            const event = { target: this, prevented: false, preventDefault() { this.prevented = true; }, ...detail };
            for (const fn of this.listeners[type] || []) fn.call(this, event);
            return event;
        }
    });
    function element(tag = 'div') {
        let value = '';
        return emitter({
            tagName: tag.toUpperCase(), checked: false, disabled: false, hidden: false,
            style: {}, attributes: {}, innerHTML: '', textContent: '', options: null, children: [], parentNode: null,
            get value() { return value; },
            set value(v) { value = String(v); if (this.options && !this.options.some(o => o.value === value)) value = ''; },
            setAttribute(k, v) { this.attributes[k] = v; },
            removeAttribute(k) { delete this.attributes[k]; },
            appendChild(child) { this.children.push(child); child.parentNode = this; },
            removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; },
            focus() { document.activeElement = this; },
            select() { this.focus(); }
        });
    }
    for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
        const [, tag, attrs, id] = match;
        const node = nodes[id] = element(tag);
        if (tag === 'select') node.options = optionsOf(id);
        node.value = node.options ? (node.options.find(o => o.selected) || node.options[0]).value : attr(attrs, 'value') || '';
        node.checked = /\bchecked\b/.test(attrs);
        node.disabled = /\bdisabled\b/.test(attrs);
        node.hidden = /\bhidden\b/.test(attrs);
    }
    for (const id of ['copyWordBtn', 'copyMdBtn', 'copyLatexBtn']) nodes[id].textContent = id;
    const selection = { ranges: [], get rangeCount() { return this.ranges.length; }, getRangeAt(i) { return this.ranges[i]; }, removeAllRanges() { this.ranges = []; }, addRange(r) { this.ranges.push(r); } };
    const document = emitter({
        body: element('body'), activeElement: null,
        getElementById(id) { assert.ok(nodes[id], '存在 DOM 节点 ' + id); return nodes[id]; },
        createElement: element,
        createRange() { return { selectNodeContents() {}, cloneRange() { return this; } }; },
        execCommand(command) {
            assert.equal(command, 'copy');
            if (execThrows) throw new Error('复制被拒绝');
            const data = {};
            this.emit('copy', { clipboardData: { setData(k, v) { data[k] = v; } } });
            copies.push(data);
            return execResult;
        }
    });
    document.activeElement = document.body;
    class ClipboardItem { constructor(data) { this.data = data; } }
    const defaultClipboard = {
        write(items) { writes.push(items[0].data); return Promise.resolve(); },
        writeText(text) { writes.push(text); return Promise.resolve(); }
    };
    const context = {
        document, window: { getSelection: () => selection, ClipboardItem }, ClipboardItem, Blob,
        navigator: { clipboard: clipboard === undefined ? defaultClipboard : clipboard },
        localStorage: {
            getItem(key) { assert.equal(key, 'ee-sim-log'); if (storageThrows) throw new Error('存储被禁用'); return stored; },
            setItem(key, value) { assert.equal(key, 'ee-sim-log'); if (storageThrows) throw new Error('存储被禁用'); stored = value; }
        },
        setTimeout(fn) { timers.push(fn); }
    };
    vm.runInNewContext(source, context, { filename: 'sim-log/script.js' });
    return {
        nodes, writes, copies, document, selection,
        get raw() { return stored; },
        state() { return JSON.parse(stored); },
        change(id, value, type = 'change') {
            if (typeof value === 'boolean') nodes[id].checked = value; else nodes[id].value = value;
            nodes[id].emit(type);
        },
        click(id) { nodes[id].emit('click'); },
        flushTimers() { timers.splice(0).forEach(fn => fn()); }
    };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('默认样式与 HTML 表单、白名单完全一致', () => {
    assert.deepEqual(M.normalizeFormat(), defaults);
    for (const [key, values] of Object.entries(M.OPTIONS)) assert.deepEqual(optionsOf(key).map(o => o.value), values, key);
    for (const group of ['label', 'value']) assert.deepEqual(optionsOf(group + 'Color').map(o => o.value), ['auto', 'blue', 'red', 'gray']);
    const h = harness();
    assert.deepEqual(h.state(), M.normalizeState({}));
    assert.equal(h.nodes.parasiticTypeWrap.hidden, true);
    assert.equal(h.nodes.parasiticType.disabled, true);
    assert.match(h.nodes.simlogPreview.innerHTML, /font-weight:bold;font-style:normal;color:var\(--color-text\)/);
    assert.match(h.nodes.simlogPreview.innerHTML, /font-weight:normal;font-style:italic;color:var\(--color-text\)/);
});

test('旧记录保留原值；后仿不推断提参类型', () => {
    const old = { simPath: '../sim/amp_tb/', simMode: '后仿', simType: 'mc', mcCount: '__custom__', mcCountCustom: '300', mcMode: 'local' };
    const h = harness({ raw: JSON.stringify(old) });
    for (const [key, value] of Object.entries(old)) assert.equal(h.state()[key], value);
    assert.deepEqual(h.state().format, defaults);
    assert.equal(h.state().parasiticType, '');
    assert.equal(h.nodes.parasiticTypeWrap.hidden, false);
    assert.match(h.nodes.simlogPreview.innerHTML, /（待选择）/);
    assert.doesNotMatch(h.nodes.simlogPreview.innerHTML, /R\+C\+CC/);
});

test('损坏 JSON、null、数组和非法字段类型安全回退', () => {
    for (const raw of [null, '', '{bad', 'null', '[]', '42', 'true', '"字符串"']) {
        assert.deepEqual(M.parseState(raw), M.normalizeState({}));
        assert.doesNotThrow(() => harness({ raw }));
    }
    const s = M.normalizeState({ simMode: '未知', simType: 'toString', parasiticType: 'C', tempPreset: '<script>', simPath: {}, mcCount: 100 });
    assert.equal(s.simMode, '前仿');
    assert.equal(s.parasiticType, '');
    assert.equal(s.mcCount, '100');
    assert.equal(s.simPath, '');
    assert.equal(s.tempPreset, '-50–160 °C');
});

test('格式只接受布尔值和字符串颜色白名单，默认对象不被污染', () => {
    for (const color of ['toString', '__proto__', 'blue;display:none', ['blue'], { a: 1 }, null]) {
        assert.deepEqual(M.normalizeFormat({ label: { bold: 'false', italic: 1, color }, value: { bold: null, italic: 'true', color } }), defaults);
    }
    const f = M.normalizeFormat(); f.label.bold = false;
    assert.deepEqual(M.normalizeFormat(), defaults);
});

test('前仿省略提参，后仿五种选项在所有输出中一致', () => {
    assert.deepEqual(M.PARASITIC_TYPES, ['R+C+CC', 'R+C', 'R', 'C+CC', 'No R/C']);
    for (const parasiticType of ['', ...M.PARASITIC_TYPES]) {
        for (const simMode of ['前仿', '后仿']) {
            const fields = M.buildFields({ simMode, parasiticType });
            for (const build of [M.buildPlain, M.buildHtml, M.buildMd, M.buildLatex]) {
                const text = build(fields);
                assert.equal(text.includes('寄生提参'), simMode === '后仿');
                if (simMode === '后仿') assert.ok(text.includes(build === M.buildMd ? M.mdEscape(parasiticType || '（待选择）') : parasiticType || '（待选择）'));
            }
            if (simMode === '后仿') assert.deepEqual(fields.slice(-2), [
                { label: '仿真方式', value: '后仿' }, { label: '寄生提参', value: parasiticType || '（待选择）' }
            ]);
        }
    }
});

test('tt、Corner、MC 及电压温度自定义分支无回退', () => {
    assert.deepEqual(Object.keys(fieldValues({})), ['仿真路径', '仿真类型', '电压', '温度', '仿真方式']);
    assert.equal(fieldValues({ simType: 'corner' })['Corner 个数'], '49');
    const mc = fieldValues({ simType: 'mc', mcCount: '__custom__', mcCountCustom: '300', mcMode: 'local', voltPreset: '__custom__', voltCustom: '1.7, 1.8 V', tempPreset: '__custom__', tempCustom: '-40, 27, 125 °C' });
    assert.equal(mc['MC 个数'], '300'); assert.equal(mc['MC 模式'], 'local（失配）');
    assert.equal(mc['电压'], '1.7, 1.8 V'); assert.equal(mc['温度'], '-40, 27, 125 °C');
    assert.equal(fieldValues({ simType: 'mc', mcCount: '200' })['MC 模式'], 'global（工艺）');
    assert.equal(fieldValues({ simType: 'mc', mcCount: '200' })['MC 个数'], '200');
});

test('字段名和值的 16 种强调组合正确；Markdown 实际解析保留相同强调', () => {
    const fields = [{ label: '字段', value: '结果' }];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        const format = { label: { bold: !!(a & 1), italic: !!(a & 2) }, value: { bold: !!(b & 1), italic: !!(b & 2) } };
        const rich = M.buildHtml(fields, format), md = M.buildMd(fields, format), tex = M.buildLatex(fields, format);
        for (const group of ['label', 'value']) {
            const style = format[group];
            const span = rich.match(new RegExp('class="simlog-' + group + '" style="([^"]*)"'))[1];
            assert.ok(span.includes('font-weight:' + (style.bold ? 'bold' : 'normal')));
            assert.ok(span.includes('font-style:' + (style.italic ? 'italic' : 'normal')));
        }
        const parsed = marked.parse(md);
        assert.equal((parsed.match(/<strong>/g) || []).length, Number(format.label.bold) + Number(format.value.bold));
        assert.equal((parsed.match(/<em>/g) || []).length, Number(format.label.italic) + Number(format.value.italic));
        assert.equal((tex.match(/\\textbf\{/g) || []).length, Number(format.label.bold) + Number(format.value.bold));
        assert.equal((tex.match(/\\textit\{/g) || []).length, Number(format.label.italic) + Number(format.value.italic));
        assert.doesNotMatch(rich, /<(strong|em)\b/);
        assert.doesNotMatch(md, /<span|style=|color:/);
        assert.equal(M.buildPlain(fields), '字段：结果');
    }
});

test('四种颜色使用主题预览与固定文档色，LaTeX 条件声明 xcolor', () => {
    const palette = { auto: ['--color-text', '000000'], blue: ['--color-primary', '3a5a8c'], red: ['--color-accent', 'c0583a'], gray: ['--color-text-secondary', '5a5a5a'] };
    for (const [key, [variable, hex]] of Object.entries(palette)) for (const group of ['label', 'value']) {
        const fields = [{ label: '字段', value: '值' }], format = { [group]: { color: key } };
        assert.ok(M.buildHtml(fields, format, 'preview').includes('color:var(' + variable + ')'));
        const word = M.buildHtml(fields, format, 'word');
        assert.ok(word.includes('color:#' + hex)); assert.doesNotMatch(word, /var\(/);
        const tex = M.buildLatex(fields, format);
        assert.equal(tex.includes('\\usepackage{xcolor}'), key !== 'auto');
        if (key !== 'auto') {
            assert.ok(tex.includes('\\textcolor[HTML]{' + hex + '}'));
            assert.ok(tex.includes('\\textcolor[HTML]{000000}'));
        } else assert.doesNotMatch(tex, /textcolor|xcolor/);
        assert.equal(M.buildMd(fields, format), M.buildMd(fields));
    }
});

test('HTML/Markdown 特殊字符不注入标签，路径内容与强调均保留', () => {
    const value = 'F:\\sim\\amp_tb\\中文*路径* <img src=x> &quot; [A](B) `code` # $ % {x} ~ ^ ! |';
    const fields = [{ label: '路径', value }];
    const rich = M.buildHtml(fields), md = M.buildMd(fields), rendered = marked.parse(md);
    assert.doesNotMatch(rich, /<img/); assert.doesNotMatch(rendered, /<img|<a\b|<code>/);
    assert.match(rendered, /amp_tb/);
    assert.equal((rendered.match(/<em>/g) || []).length, 1);
    const text = rendered.replace(/<[^>]*>/g, '').trim().replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    assert.equal(text, '路径：' + value);
    assert.equal(M.buildPlain(fields), '路径：' + value);
});

test('LaTeX 单次转义反斜杠、下划线及花括号不损坏自身命令', () => {
    assert.equal(M.latexEscape('F:\\sim\\amp_tb\\{x} #$%&~^'), 'F:\\textbackslash{}sim\\textbackslash{}amp\\_tb\\textbackslash{}\\{x\\} \\#\\$\\%\\&\\textasciitilde{}\\textasciicircum{}');
    assert.doesNotMatch(M.buildLatex(M.buildFields({ simPath: 'F:\\sim\\amp_tb' })), /textbackslash\\\{/);
    const tex = M.buildLatex([{ label: '名称', value: '值' }]);
    assert.match(tex, /\\heiti/); assert.match(tex, /\\kaishu/); assert.match(tex, /ctex/);
});

test('前后仿切换只隐藏输出，原提参选择及格式均保留', () => {
    const h = harness();
    h.change('simMode', '后仿'); h.change('parasiticType', 'No R/C'); h.change('valueColor', 'red');
    assert.equal(h.nodes.parasiticType.disabled, false);
    assert.match(h.nodes.simlogPreview.innerHTML, /No R\/C/);
    h.change('simMode', '前仿');
    assert.equal(h.nodes.parasiticTypeWrap.hidden, true); assert.equal(h.nodes.parasiticType.disabled, true);
    assert.doesNotMatch(h.nodes.simlogPreview.innerHTML, /寄生提参|No R\/C/);
    assert.equal(h.state().parasiticType, 'No R/C');
    const restored = harness({ raw: h.raw }); restored.change('simMode', '后仿');
    assert.match(restored.nodes.simlogPreview.innerHTML, /No R\/C/);
    assert.equal(restored.nodes.valueColor.value, 'red');
});

test('实时更新、刷新恢复与仅重置样式，不清空表单', () => {
    const h = harness();
    h.change('simPath', '../sim/new_tb/', 'input'); h.change('simMode', '后仿'); h.change('parasiticType', 'R+C');
    h.change('labelBold', false); h.change('labelItalic', true); h.change('labelColor', 'blue');
    h.change('valueBold', true); h.change('valueItalic', false); h.change('valueColor', 'gray');
    const state = h.state();
    assert.deepEqual(state.format.label, { bold: false, italic: true, color: 'blue' });
    assert.deepEqual(state.format.value, { bold: true, italic: false, color: 'gray' });
    assert.match(h.nodes.simlogPreview.innerHTML, /new_tb/);
    const restored = harness({ raw: h.raw });
    assert.deepEqual(restored.state(), state);
    assert.equal(restored.nodes.labelBold.checked, false); assert.equal(restored.nodes.valueBold.checked, true);
    restored.click('resetFormatBtn');
    assert.deepEqual(restored.state(), { ...state, format: defaults });
    assert.deepEqual(harness({ raw: restored.raw }).state(), { ...state, format: defaults });
});

test('Corner/MC 子字段显隐及 Corner 滚轮下限维持现有行为', () => {
    const h = harness();
    h.change('simType', 'corner'); assert.equal(h.nodes.cornerCountWrap.style.display, '');
    assert.equal(h.nodes.cornerCount.value, '49');
    assert.equal(h.nodes.cornerCount.emit('wheel', { deltaY: -1 }).prevented, true);
    assert.equal(h.nodes.cornerCount.value, '50');
    h.change('cornerCount', '1'); h.nodes.cornerCount.emit('wheel', { deltaY: 1 }); assert.equal(h.nodes.cornerCount.value, '1');
    h.change('simType', 'mc'); h.change('mcCount', '__custom__');
    assert.equal(h.nodes.cornerCountWrap.style.display, 'none'); assert.equal(h.nodes.mcCountCustomWrap.style.display, '');
    h.change('voltPreset', '__custom__'); h.change('tempPreset', '__custom__');
    assert.equal(h.nodes.voltCustomWrap.style.display, ''); assert.equal(h.nodes.tempCustomWrap.style.display, '');
    h.change('simType', 'tt'); assert.equal(h.nodes.mcCountWrap.style.display, 'none'); assert.equal(h.nodes.mcModeWrap.style.display, 'none');
});

test('Word 剪贴板同时写入内联 HTML 和无样式纯文本', async () => {
    const h = harness(); h.change('simMode', '后仿'); h.change('parasiticType', 'R+C+CC'); h.change('valueColor', 'red');
    h.click('copyWordBtn'); await settle();
    assert.deepEqual(Object.keys(h.writes[0]), ['text/html', 'text/plain']);
    const rich = await h.writes[0]['text/html'].text(), plain = await h.writes[0]['text/plain'].text();
    assert.match(rich, /color:#c0583a/); assert.doesNotMatch(rich, /var\(/); assert.match(plain, /寄生提参：R\+C\+CC/);
    assert.doesNotMatch(plain, /<span|font-weight|textcolor/);
    assert.equal(h.nodes.copyWordBtn.textContent, '已复制');
    h.flushTimers(); assert.equal(h.nodes.copyWordBtn.disabled, false);
});

test('Markdown 与 LaTeX 复制应用当前样式和提参内容', async () => {
    const h = harness(); h.change('simMode', '后仿'); h.change('parasiticType', 'C+CC'); h.change('labelBold', false); h.change('valueBold', true); h.change('valueColor', 'blue');
    h.click('copyMdBtn'); h.click('copyLatexBtn'); await settle();
    assert.equal(h.writes[0], M.buildMd(M.buildFields(h.state()), h.state().format));
    assert.equal(h.writes[1], M.buildLatex(M.buildFields(h.state()), h.state().format));
    assert.doesNotMatch(h.writes[0], /span|textcolor|color:/);
    assert.match(h.writes[1], /textcolor\[HTML\]\{3a5a8c\}/);
});

test('复制降级检查 false/异常，不假报成功，并清理容器', () => {
    for (const execResult of [true, false]) for (const id of ['copyWordBtn', 'copyMdBtn', 'copyLatexBtn']) {
        const h = harness({ clipboard: null, execResult });
        h.click(id);
        assert.equal(h.nodes[id].textContent, execResult ? '已复制' : '复制失败');
        assert.equal(h.nodes.copyHolder.innerHTML, '');
        assert.equal(h.nodes.copyHolder.attributes.contenteditable, undefined);
        assert.equal(h.document.body.children.length, 0);
        assert.equal(h.document.listeners.copy.size, 0);
        if (id === 'copyWordBtn') assert.deepEqual(Object.keys(h.copies[0]), ['text/plain', 'text/html']);
        h.flushTimers(); assert.equal(h.nodes[id].disabled, false);
    }
    const failed = harness({ clipboard: null, execThrows: true }); failed.click('copyWordBtn');
    assert.equal(failed.nodes.copyWordBtn.textContent, '复制失败');
    assert.equal(failed.nodes.copyHolder.innerHTML, '');
});

test('Clipboard 拒绝或同步抛错均回退，Word 回退不混入等待期间的新数据', async () => {
    for (const method of ['write', 'writeText']) {
        const h = harness({ clipboard: { [method]() { throw new Error('拒绝'); } } });
        h.click(method === 'write' ? 'copyWordBtn' : 'copyMdBtn'); await settle();
        assert.equal(h.copies.length, 1);
    }
    let reject;
    const h = harness({ clipboard: { write() { return new Promise((resolve, fail) => { reject = fail; }); } } });
    h.change('simPath', '原始数据'); h.click('copyWordBtn'); h.change('simPath', '新数据');
    reject(new Error('拒绝')); await settle();
    assert.match(h.copies[0]['text/plain'], /原始数据/); assert.doesNotMatch(h.copies[0]['text/html'], /新数据/);
});

test('禁用存储仍能编辑、复制；页首主题恢复也容错', async () => {
    const h = harness({ storageThrows: true }); h.change('simMode', '后仿'); h.change('parasiticType', 'R'); h.click('copyWordBtn'); await settle();
    assert.match(h.nodes.simlogPreview.innerHTML, /寄生提参/); assert.equal(h.nodes.copyWordBtn.textContent, '已复制');
    const headScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.doesNotThrow(() => vm.runInNewContext(headScript, { localStorage: { getItem() { throw new Error('禁用'); } } }));
});

test('入口与脚本语法保持有效；窄屏、隐藏与焦点规则存在', () => {
    const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.equal((home.match(/href="tools\/sim-log\/index.html"/g) || []).length, 1);
    assert.match(home, /寄生 提参 提取 parasitic extraction/);
    for (const page of [html, home]) for (const script of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
    assert.match(css, /max-width:\s*900px/); assert.match(css, /overflow-wrap:\s*anywhere/);
    assert.match(css, /#parasiticTypeWrap\[hidden\]\s*\{\s*display:\s*none/);
    assert.match(css, /:focus-visible/); assert.match(css, /flex-wrap:\s*wrap/);
    assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i);
});

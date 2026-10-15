/* 仿真结果规范收集：字段联动、实时格式化预览与 Word / Markdown / LaTeX 三格式复制 */
(function () {
    'use strict';

    var STORE_KEY = 'ee-sim-log';
    var PARASITIC_TYPES = ['R+C+CC', 'R+C', 'R', 'C+CC', 'No R/C'];
    var COLORS = {
        auto: { css: '--color-text', hex: '000000' },
        blue: { css: '--color-primary', hex: '3a5a8c' },
        red: { css: '--color-accent', hex: 'c0583a' },
        gray: { css: '--color-text-secondary', hex: '5a5a5a' }
    };
    var DEFAULTS = {
        simPath: '', simType: 'tt', cornerCount: '49', mcCount: '100', mcCountCustom: '',
        mcMode: 'global', voltPreset: '1.62–1.98 V', voltCustom: '',
        tempPreset: '-50–160 °C', tempCustom: '', simMode: '前仿', parasiticType: ''
    };
    var OPTIONS = {
        simType: ['tt', 'corner', 'mc'],
        mcCount: ['30', '50', '100', '200', '500', '1000', '2000', '5000', '__custom__'],
        mcMode: ['global', 'local'],
        voltPreset: ['1.62–1.98 V', '1.7–1.9 V', '1.65–1.95 V', '1.08–1.32 V', '2.97–3.63 V', '4.5–5.5 V', '4.5 V, 5 V, 5.5 V', '1.8 V', '3.3 V', '__custom__'],
        tempPreset: ['-50–160 °C', '-40–150 °C', '-40–125 °C', '-40–85 °C', '-20–85 °C', '0–70 °C', '25 °C', '27 °C', '125 °C', '__custom__'],
        simMode: ['前仿', '后仿'], parasiticType: [''].concat(PARASITIC_TYPES)
    };
    function objectOrEmpty(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }
    function normalizeFormat(format) {
        format = objectOrEmpty(format);
        var result = {};
        ['label', 'value'].forEach(function (group) {
            var value = objectOrEmpty(format[group]);
            result[group] = {
                bold: typeof value.bold === 'boolean' ? value.bold : group === 'label',
                italic: typeof value.italic === 'boolean' ? value.italic : group === 'value',
                color: typeof value.color === 'string' && Object.prototype.hasOwnProperty.call(COLORS, value.color) ? value.color : 'auto'
            };
        });
        return result;
    }
    function normalizeState(state) {
        state = objectOrEmpty(state);
        var result = {};
        Object.keys(DEFAULTS).forEach(function (key) {
            var value = state[key];
            result[key] = typeof value === 'string' && (!OPTIONS[key] || OPTIONS[key].indexOf(value) !== -1)
                ? value : DEFAULTS[key];
        });
        result.format = normalizeFormat(state.format);
        return result;
    }
    function parseState(raw) {
        try { return normalizeState(JSON.parse(raw)); }
        catch (e) { return normalizeState({}); }
    }

    /* ---------- 字段组装 ---------- */
    function field(label, value) { return { label: label, value: String(value == null ? '' : value).trim() }; }

    function buildFields(state) {
        var s = normalizeState(state), t = s.simType;
        var f = [field('仿真路径', s.simPath)];
        if (t === 'corner') {
            f.push(field('仿真类型', 'Corner 扫描（PVT）'));
            f.push(field('Corner 个数', s.cornerCount));
        } else if (t === 'mc') {
            f.push(field('仿真类型', 'Monte Carlo'));
            f.push(field('MC 个数', s.mcCount === '__custom__' ? s.mcCountCustom : s.mcCount));
            f.push(field('MC 模式', s.mcMode === 'global' ? 'global（工艺）' : 'local（失配）'));
        } else {
            f.push(field('仿真类型', '仅 tt（单点）'));
        }
        f.push(field('电压', s.voltPreset === '__custom__' ? s.voltCustom : s.voltPreset));
        f.push(field('温度', s.tempPreset === '__custom__' ? s.tempCustom : s.tempPreset));
        f.push(field('仿真方式', s.simMode));
        if (s.simMode === '后仿') f.push(field('寄生提参', s.parasiticType || '（待选择）'));
        return f;
    }

    /* ---------- 转义 ---------- */
    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    /* 单次映射不会再次转义生成命令的花括号。 */
    function latexEscape(s) {
        var escaped = { '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' };
        return s.replace(/[\\#$%&_{}~^]/g, function (ch) { return escaped[ch] || '\\' + ch; });
    }
    function mdEscape(s) { return s.replace(/[\\`*_{}\[\]()#+\-.!|<>~&]/g, '\\$&'); }

    /* ---------- 三种格式（同一字段模型输出） ---------- */
    var FONTS = {
        label: "'SimHei','Heiti SC','Microsoft YaHei',sans-serif",
        value: "'KaiTi','STKaiti','DFKai-SB',serif"
    };
    function htmlStyle(group, format, target) {
        var style = format[group], color = COLORS[style.color];
        return 'font-family:' + FONTS[group] + ';font-weight:' + (style.bold ? 'bold' : 'normal')
            + ';font-style:' + (style.italic ? 'italic' : 'normal') + ';color:'
            + (target === 'preview' ? 'var(' + color.css + ')' : '#' + color.hex) + ';';
    }
    function buildHtml(fields, format, target) {
        format = normalizeFormat(format);
        var rows = fields.map(function (f) {
            return '<p style="margin:0 0 6pt 0;line-height:1.9;">'
                + '<span class="simlog-label" style="' + htmlStyle('label', format, target) + '">'
                + escapeHtml(f.label) + '：</span>'
                + '<span class="simlog-value" style="' + htmlStyle('value', format, target) + '">'
                + escapeHtml(f.value || '（待填写）') + '</span></p>';
        });
        return '<div style="font-size:11pt;font-weight:normal;font-style:normal;">' + rows.join('') + '</div>';
    }

    function buildPlain(fields) {
        return fields.map(function (f) { return f.label + '：' + (f.value || '（待填写）'); }).join('\n');
    }

    function mdStyled(text, style) {
        var marks = (style.bold ? '**' : '') + (style.italic ? '*' : '');
        return marks + mdEscape(text) + marks;
    }
    function buildMd(fields, format) {
        format = normalizeFormat(format);
        return fields.map(function (f) {
            return '- ' + mdStyled(f.label, format.label) + '：' + mdStyled(f.value || '（待填写）', format.value);
        }).join('\n');
    }

    function latexStyled(text, style, group, useColor) {
        var result = latexEscape(text);
        if (style.italic) result = '\\textit{' + result + '}';
        if (style.bold) result = '\\textbf{' + result + '}';
        if (useColor) result = '\\textcolor[HTML]{' + COLORS[style.color].hex + '}{' + result + '}';
        return '{\\normalfont\\normalcolor' + (group === 'label' ? '\\heiti ' : '\\kaishu ') + result + '}';
    }
    function buildLatex(fields, format) {
        format = normalizeFormat(format);
        var useColor = format.label.color !== 'auto' || format.value.color !== 'auto';
        var items = fields.map(function (f) {
            return '  \\item ' + latexStyled(f.label, format.label, 'label', useColor) + '：'
                + latexStyled(f.value || '（待填写）', format.value, 'value', useColor);
        });
        return '% 使用 XeLaTeX / ctexart，或加载 ctex 宏包（默认黑色正文）\n'
            + (useColor ? '% 需在导言区加载 \\usepackage{xcolor}\n' : '')
            + '\\begin{itemize}\n' + items.join('\n') + '\n\\end{itemize}';
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            PARASITIC_TYPES: PARASITIC_TYPES, COLORS: COLORS, DEFAULTS: DEFAULTS, OPTIONS: OPTIONS,
            normalizeFormat: normalizeFormat, normalizeState: normalizeState, parseState: parseState,
            buildFields: buildFields, buildHtml: buildHtml, buildPlain: buildPlain, buildMd: buildMd,
            buildLatex: buildLatex, escapeHtml: escapeHtml, mdEscape: mdEscape, latexEscape: latexEscape
        };
    }
    if (typeof document === 'undefined') return;

    var $ = function (id) { return document.getElementById(id); };
    var els = {}, formats = {}, outputs = {};
    Object.keys(DEFAULTS).forEach(function (key) { els[key] = $(key); });
    ['label', 'value'].forEach(function (group) {
        formats[group] = { bold: $(group + 'Bold'), italic: $(group + 'Italic'), color: $(group + 'Color') };
    });

    /* ---------- 联动显隐 ---------- */
    function syncVisibility() {
        var t = els.simType.value, isMc = t === 'mc';
        $('cornerCountWrap').style.display = t === 'corner' ? '' : 'none';
        $('mcCountWrap').style.display = isMc ? '' : 'none';
        $('mcModeWrap').style.display = isMc ? '' : 'none';
        $('mcCountCustomWrap').style.display = isMc && els.mcCount.value === '__custom__' ? '' : 'none';
        $('voltCustomWrap').style.display = els.voltPreset.value === '__custom__' ? '' : 'none';
        $('tempCustomWrap').style.display = els.tempPreset.value === '__custom__' ? '' : 'none';
        var isPost = els.simMode.value === '后仿';
        $('parasiticTypeWrap').hidden = !isPost;
        els.parasiticType.disabled = !isPost;
    }
    function readState() {
        var state = { format: {} };
        Object.keys(els).forEach(function (key) { state[key] = els[key].value; });
        Object.keys(formats).forEach(function (group) {
            state.format[group] = {
                bold: formats[group].bold.checked, italic: formats[group].italic.checked,
                color: formats[group].color.value
            };
        });
        return normalizeState(state);
    }
    function applyFormat(format) {
        format = normalizeFormat(format);
        Object.keys(formats).forEach(function (group) {
            formats[group].bold.checked = format[group].bold;
            formats[group].italic.checked = format[group].italic;
            formats[group].color.value = format[group].color;
        });
    }

    /* ---------- 渲染与持久化 ---------- */
    function render() {
        syncVisibility();
        var state = readState(), fields = buildFields(state);
        outputs.html = buildHtml(fields, state.format, 'word');
        outputs.plain = buildPlain(fields);
        outputs.md = buildMd(fields, state.format);
        outputs.latex = buildLatex(fields, state.format);
        $('simlogPreview').innerHTML = buildHtml(fields, state.format, 'preview');
        saveState(state);
    }

    function saveState(state) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式等场景忽略 */ }
    }

    function loadState() {
        var state;
        try { state = parseState(localStorage.getItem(STORE_KEY)); } catch (e) { state = normalizeState({}); }
        Object.keys(els).forEach(function (key) { els[key].value = state[key]; });
        applyFormat(state.format);
    }

    /* ---------- 复制 ---------- */
    function flash(btn, text) {
        var orig = btn.textContent;
        btn.textContent = text || '已复制';
        btn.disabled = true;
        setTimeout(function () { btn.textContent = orig; btn.disabled = false; }, 2000);
    }

    /* execCommand 兜底：富文本经离屏 contenteditable 容器，纯文本经离屏 textarea */
    function copyViaExec(html, plain, btn) {
        var holder, ta, sel, savedRanges = [], copied = false;
        var focused = document.activeElement;
        function onCopy(event) {
            if (!event.clipboardData) return;
            event.clipboardData.setData('text/plain', plain);
            if (html) event.clipboardData.setData('text/html', html);
            event.preventDefault();
        }
        try {
            if (html) {
                holder = $('copyHolder');
                holder.innerHTML = html;
                holder.setAttribute('contenteditable', 'true');
                var range = document.createRange();
                range.selectNodeContents(holder);
                sel = window.getSelection();
                for (var i = 0; i < sel.rangeCount; i++) savedRanges.push(sel.getRangeAt(i).cloneRange());
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                ta = document.createElement('textarea');
                ta.value = plain;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
            }
            document.addEventListener('copy', onCopy);
            copied = document.execCommand('copy');
        } catch (e) {
            copied = false;
        } finally {
            document.removeEventListener('copy', onCopy);
            if (sel) {
                sel.removeAllRanges();
                savedRanges.forEach(function (range) { sel.addRange(range); });
            }
            if (holder) { holder.removeAttribute('contenteditable'); holder.innerHTML = ''; }
            if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
            if (focused && focused.focus) focused.focus({ preventScroll: true });
        }
        flash(btn, copied ? '已复制' : '复制失败');
    }

    /* Word 格式：text/html + text/plain 双 flavor，失败回退 execCommand */
    function copyWord() {
        var btn = $('copyWordBtn');
        var html = outputs.html, plain = outputs.plain;
        var fail = function () { copyViaExec(html, plain, btn); };
        if (navigator.clipboard && window.ClipboardItem) {
            try {
                var item = new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([plain], { type: 'text/plain' })
                });
                navigator.clipboard.write([item]).then(function () { flash(btn); }, fail);
            } catch (e) {
                fail();
            }
        } else {
            fail();
        }
    }

    function copyText(text, btnId) {
        var btn = $(btnId);
        var fail = function () { copyViaExec('', text, btn); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try { navigator.clipboard.writeText(text).then(function () { flash(btn); }, fail); }
            catch (e) { fail(); }
        } else {
            fail();
        }
    }

    /* ---------- 初始化 ---------- */
    function init() {
        loadState();
        Object.keys(els).forEach(function (k) {
            els[k].addEventListener('change', render);
            els[k].addEventListener('input', render);
        });
        Object.keys(formats).forEach(function (group) {
            Object.keys(formats[group]).forEach(function (key) {
                formats[group][key].addEventListener('change', render);
            });
        });
        $('resetFormatBtn').addEventListener('click', function () { applyFormat(null); render(); });
        /* Corner 个数：悬停滚轮直接步进（无需先聚焦），并阻止页面随滚轮滚动 */
        $('cornerCount').addEventListener('wheel', function (e) {
            e.preventDefault();
            var v = parseInt(this.value, 10);
            if (isNaN(v)) v = 0;
            v += (e.deltaY < 0 ? 1 : -1);
            if (v < 1) v = 1;
            this.value = v;
            render();
        }, { passive: false });
        $('copyWordBtn').addEventListener('click', copyWord);
        $('copyMdBtn').addEventListener('click', function () { copyText(outputs.md, 'copyMdBtn'); });
        $('copyLatexBtn').addEventListener('click', function () { copyText(outputs.latex, 'copyLatexBtn'); });
        render();
    }

    init();
})();

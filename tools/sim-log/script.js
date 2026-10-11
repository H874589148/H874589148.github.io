/* 仿真结果规范收集：字段联动、实时格式化预览与 Word / Markdown / LaTeX 三格式复制 */
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var STORE_KEY = 'ee-sim-log';

    var els = {
        simPath: $('simPath'),
        simType: $('simType'),
        cornerCount: $('cornerCount'),
        mcCount: $('mcCount'),
        mcCountCustom: $('mcCountCustom'),
        mcMode: $('mcMode'),
        voltPreset: $('voltPreset'),
        voltCustom: $('voltCustom'),
        tempPreset: $('tempPreset'),
        tempCustom: $('tempCustom'),
        simMode: $('simMode')
    };
    var wraps = {
        cornerCount: $('cornerCountWrap'),
        mcCount: $('mcCountWrap'),
        mcCountCustom: $('mcCountCustomWrap'),
        mcMode: $('mcModeWrap'),
        voltCustom: $('voltCustomWrap'),
        tempCustom: $('tempCustomWrap')
    };
    var outputs = { html: '', plain: '', md: '', latex: '' };

    /* ---------- 联动显隐 ---------- */
    function syncVisibility() {
        var t = els.simType.value;
        var isMc = t === 'mc';
        wraps.cornerCount.style.display = t === 'corner' ? '' : 'none';
        wraps.mcCount.style.display = isMc ? '' : 'none';
        wraps.mcMode.style.display = isMc ? '' : 'none';
        wraps.mcCountCustom.style.display = (isMc && els.mcCount.value === '__custom__') ? '' : 'none';
        wraps.voltCustom.style.display = els.voltPreset.value === '__custom__' ? '' : 'none';
        wraps.tempCustom.style.display = els.tempPreset.value === '__custom__' ? '' : 'none';
    }

    /* ---------- 字段组装 ---------- */
    function field(label, value) { return { label: label, value: String(value == null ? '' : value).trim() }; }

    function buildFields() {
        var t = els.simType.value;
        var f = [field('仿真路径', els.simPath.value)];
        if (t === 'corner') {
            f.push(field('仿真类型', 'Corner 扫描（PVT）'));
            f.push(field('Corner 个数', els.cornerCount.value));
        } else if (t === 'mc') {
            f.push(field('仿真类型', 'Monte Carlo'));
            f.push(field('MC 个数', els.mcCount.value === '__custom__' ? els.mcCountCustom.value : els.mcCount.value));
            f.push(field('MC 模式', els.mcMode.value === 'global' ? 'global（工艺）' : 'local（失配）'));
        } else {
            f.push(field('仿真类型', '仅 tt（单点）'));
        }
        f.push(field('电压', els.voltPreset.value === '__custom__' ? els.voltCustom.value : els.voltPreset.value));
        f.push(field('温度', els.tempPreset.value === '__custom__' ? els.tempCustom.value : els.tempPreset.value));
        f.push(field('仿真方式', els.simMode.value));
        return f;
    }

    /* ---------- 转义 ---------- */
    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    /* LaTeX 特殊字符：注意先处理反斜杠本身 */
    function latexEscape(s) {
        return s.replace(/\\/g, '\\textbackslash{}')
                .replace(/([#$%&_{}])/g, '\\$1')
                .replace(/~/g, '\\textasciitilde{}')
                .replace(/\^/g, '\\textasciicircum{}');
    }
    function mdEscape(s) { return s.replace(/\*/g, '\\*'); }

    /* ---------- 三种格式（同一字段模型输出） ---------- */
    var LABEL_STYLE = 'font-family:\'SimHei\',\'Heiti SC\',\'Microsoft YaHei\',sans-serif;font-weight:bold;';
    var VALUE_STYLE = 'font-family:\'KaiTi\',\'STKaiti\',\'DFKai-SB\',serif;font-style:italic;';
    var EMPTY_HTML = '<span class="simlog-empty" style="color:#8a8a8a;font-style:normal;">（待填写）</span>';

    function buildHtml(fields) {
        var rows = fields.map(function (f) {
            var v = f.value
                ? '<em class="simlog-value" style="' + VALUE_STYLE + '">' + escapeHtml(f.value) + '</em>'
                : EMPTY_HTML;
            return '<p style="margin:0 0 6pt 0;line-height:1.9;">'
                + '<strong class="simlog-label" style="' + LABEL_STYLE + '">' + escapeHtml(f.label) + '：</strong>'
                + v + '</p>';
        });
        return '<div style="font-size:11pt;">' + rows.join('') + '</div>';
    }

    function buildPlain(fields) {
        return fields.map(function (f) { return f.label + '：' + (f.value || '（待填写）'); }).join('\n');
    }

    function buildMd(fields) {
        return fields.map(function (f) {
            return '- **' + f.label + '**：*' + mdEscape(f.value || '（待填写）') + '*';
        }).join('\n');
    }

    function buildLatex(fields) {
        var items = fields.map(function (f) {
            return '  \\item \\textbf{' + latexEscape(f.label) + '}：{\\kaishu\\textit{'
                + latexEscape(f.value || '（待填写）') + '}}';
        });
        return '% 需 ctex 宏包（XeLaTeX / ctexart）\n\\begin{itemize}\n' + items.join('\n') + '\n\\end{itemize}';
    }

    /* ---------- 渲染与持久化 ---------- */
    function render() {
        syncVisibility();
        var fields = buildFields();
        outputs.html = buildHtml(fields);
        outputs.plain = buildPlain(fields);
        outputs.md = buildMd(fields);
        outputs.latex = buildLatex(fields);
        $('simlogPreview').innerHTML = outputs.html;
        saveState();
    }

    function saveState() {
        var s = {};
        Object.keys(els).forEach(function (k) { s[k] = els[k].value; });
        try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* 隐私模式等场景忽略 */ }
    }

    function loadState() {
        var s;
        try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { s = {}; }
        Object.keys(els).forEach(function (k) {
            if (typeof s[k] === 'string' && s[k] !== '') els[k].value = s[k];
        });
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
        try {
            if (html) {
                var holder = $('copyHolder');
                holder.innerHTML = html;
                holder.setAttribute('contenteditable', 'true');
                var range = document.createRange();
                range.selectNodeContents(holder);
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('copy');
                sel.removeAllRanges();
                holder.removeAttribute('contenteditable');
                holder.innerHTML = '';
            } else {
                var ta = document.createElement('textarea');
                ta.value = plain;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            flash(btn);
        } catch (e) {
            flash(btn, '复制失败');
        }
    }

    /* Word 格式：text/html + text/plain 双 flavor，失败回退 execCommand */
    function copyWord() {
        var btn = $('copyWordBtn');
        var fail = function () { copyViaExec(outputs.html, outputs.plain, btn); };
        if (navigator.clipboard && window.ClipboardItem) {
            try {
                var item = new ClipboardItem({
                    'text/html': new Blob([outputs.html], { type: 'text/html' }),
                    'text/plain': new Blob([outputs.plain], { type: 'text/plain' })
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
            navigator.clipboard.writeText(text).then(function () { flash(btn); }, fail);
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

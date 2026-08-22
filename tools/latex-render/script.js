/* tools/latex-render/script.js
   LaTeX 实时渲染：MathJax v3(tex-svg) / 导出 SVG·PNG·JPG / 符号查找表 */

/* MathJax 配置必须在本文件（同步脚本）中设置，早于 tex-svg.js 执行 */
var mathjaxReady = false;
window.MathJax = {
    tex: { packages: { '[+]': ['ams', 'boldsymbol', 'configmacros'] } },
    svg: { fontCache: 'local' },   /* 字形 defs 内嵌每个公式 SVG：显示与导出均自包含 */
    options: { enableAssistiveMml: false },
    startup: {
        typeset: false,
        ready: function () {
            MathJax.startup.defaultReady();
            mathjaxReady = true;
            doRender();
        }
    }
};

var el = {};
['texInput', 'renderPreview', 'renderMsg', 'copyMsg',
 'btnCopy', 'btnSvg', 'btnPng', 'btnJpg', 'symTable'
].forEach(function (id) { el[id] = document.getElementById(id); });

function setMsg(text, isErr) {
    el.renderMsg.textContent = text || '';
    el.renderMsg.className = isErr ? 'hint err' : 'hint';
}

/* MathJax 加载失败（离线等）：静默降级 */
function onMathJaxFail() {
    el.renderPreview.innerHTML = '<span class="preview-hint">MathJax 加载失败：请检查网络后刷新页面</span>';
    setMsg('渲染引擎未加载（需联网），预览与导出不可用，其余功能不受影响。', true);
}

/* ---- 渲染（300ms 防抖） ---- */
var debounceTimer = null;
function scheduleRender() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doRender, 300);
}

function doRender() {
    if (!mathjaxReady) return;
    var tex = el.texInput.value;
    if (!tex.trim()) {
        el.renderPreview.innerHTML = '<span class="preview-hint">输入为空</span>';
        setMsg('', false);
        return;
    }
    /* 完整排版管线：样式表与字体缓存随 typeset 自动注入，
       避免 tex2svgPromise 独立转换导致的 assistive-mml 副本可见 / 字形引用悬空问题 */
    el.renderPreview.textContent = '\\[' + tex + '\\]';
    MathJax.typesetClear([el.renderPreview]);
    MathJax.typesetPromise([el.renderPreview]).then(function () {
        var err = el.renderPreview.querySelector('[data-mjx-error]');
        if (err) setMsg('语法错误：' + err.getAttribute('data-mjx-error'), true);
        else setMsg('', false);
    }).catch(function (err) {
        setMsg('语法错误：' + (err && err.message ? err.message : String(err)), true);
    });
}

el.texInput.addEventListener('input', scheduleRender);

/* ---- 光标处插入 ---- */
function insertAtCursor(text) {
    var ta = el.texInput;
    var s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    var pos = s + text.length;
    /* 结构命令：光标移到第一个占位符处便于替换 */
    var ph = text.search(/[abnx]\}/);
    if (ph > 0) pos = s + ph + 1;
    ta.selectionStart = ta.selectionEnd = pos;
    ta.focus();
    doRender();
}

/* ---- 复制源码 ---- */
var copyTimer = null;
function setCopyMsg(text, isErr) {
    el.copyMsg.textContent = text;
    el.copyMsg.className = isErr ? 'hint err' : 'hint ok';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(function () { el.copyMsg.textContent = ''; el.copyMsg.className = 'hint'; }, 2000);
}
el.btnCopy.addEventListener('click', function () {
    var text = el.texInput.value;
    function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); setCopyMsg('已复制到剪贴板'); }
        catch (e) { setCopyMsg('复制失败，请手动选择复制', true); }
        ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { setCopyMsg('已复制到剪贴板'); }, fallback);
    } else fallback();
});

/* ---- 导出 ---- */
function getSvg() { return el.renderPreview.querySelector('svg'); }

function serializeSvg(svg, wpx, hpx) {
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.style.color = '#222';
    if (wpx && hpx) {
        clone.setAttribute('width', wpx);
        clone.setAttribute('height', hpx);
    }
    return new XMLSerializer().serializeToString(clone);
}

function downloadBlob(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 200);
}

function noSvg() { setMsg('暂无可导出的公式（请先输入并成功渲染）。', true); }

el.btnSvg.addEventListener('click', function () {
    var svg = getSvg();
    if (!svg) { noSvg(); return; }
    var str = serializeSvg(svg);
    downloadBlob('formula.svg', new Blob([str], { type: 'image/svg+xml;charset=utf-8' }));
    setMsg('', false);
});

function exportRaster(kind) {   /* kind: 'png' | 'jpeg' */
    var svg = getSvg();
    if (!svg) { noSvg(); return; }
    var rect = svg.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) { noSvg(); return; }
    var scale = 3;
    var wpx = Math.max(1, Math.round(rect.width * scale));
    var hpx = Math.max(1, Math.round(rect.height * scale));
    var str = serializeSvg(svg, wpx, hpx);
    var img = new Image();
    img.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = wpx;
        cv.height = hpx;
        var ctx = cv.getContext('2d');
        if (kind === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, wpx, hpx); }
        ctx.drawImage(img, 0, 0, wpx, hpx);
        cv.toBlob(function (blob) {
            if (blob) { downloadBlob('formula.' + (kind === 'jpeg' ? 'jpg' : 'png'), blob); setMsg('', false); }
            else setMsg('导出失败。', true);
        }, 'image/' + kind, 0.95);
    };
    img.onerror = function () { setMsg('导出失败：浏览器无法栅格化 SVG。', true); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
}
el.btnPng.addEventListener('click', function () { exportRaster('png'); });
el.btnJpg.addEventListener('click', function () { exportRaster('jpeg'); });

/* ---- 符号查找表（8 组）：[组名, [[标签, 代码]...], 是否符号字形] ---- */
var SYMS = [
    ['希腊字母', [
        ['α', '\\alpha'], ['β', '\\beta'], ['γ', '\\gamma'], ['δ', '\\delta'],
        ['ε', '\\varepsilon'], ['ζ', '\\zeta'], ['η', '\\eta'], ['θ', '\\theta'],
        ['λ', '\\lambda'], ['μ', '\\mu'], ['ν', '\\nu'], ['ξ', '\\xi'],
        ['π', '\\pi'], ['ρ', '\\rho'], ['σ', '\\sigma'], ['τ', '\\tau'],
        ['φ', '\\varphi'], ['χ', '\\chi'], ['ψ', '\\psi'], ['ω', '\\omega'],
        ['Γ', '\\Gamma'], ['Δ', '\\Delta'], ['Θ', '\\Theta'], ['Λ', '\\Lambda'],
        ['Π', '\\Pi'], ['Σ', '\\Sigma'], ['Φ', '\\Phi'], ['Ψ', '\\Psi'], ['Ω', '\\Omega']
    ], true],
    ['运算符', [
        ['×', '\\times'], ['÷', '\\div'], ['·', '\\cdot'], ['±', '\\pm'], ['∓', '\\mp'],
        ['⊕', '\\oplus'], ['⊗', '\\otimes'], ['∘', '\\circ'], ['∪', '\\cup'], ['∩', '\\cap'],
        ['∨', '\\vee'], ['∧', '\\wedge'], ['∑', '\\sum'], ['∏', '\\prod'],
        ['∫', '\\int'], ['∮', '\\oint'], ['∂', '\\partial'], ['∇', '\\nabla'],
        ['∞', '\\infty'], ['∝', '\\propto']
    ], true],
    ['关系符号', [
        ['=', '='], ['≠', '\\neq'], ['≈', '\\approx'], ['≡', '\\equiv'], ['~', '\\sim'],
        ['≅', '\\cong'], ['≜', '\\triangleq'], ['≤', '\\leq'], ['≥', '\\geq'],
        ['≪', '\\ll'], ['≫', '\\gg'], ['∈', '\\in'], ['∋', '\\ni'],
        ['⊂', '\\subset'], ['⊆', '\\subseteq'], ['⊥', '\\perp'], ['∥', '\\parallel']
    ], true],
    ['箭头', [
        ['→', '\\rightarrow'], ['←', '\\leftarrow'], ['⇒', '\\Rightarrow'], ['⇐', '\\Leftarrow'],
        ['↔', '\\leftrightarrow'], ['⇔', '\\Leftrightarrow'], ['↦', '\\mapsto'],
        ['↑', '\\uparrow'], ['↓', '\\downarrow'], ['⟶', '\\longrightarrow'],
        ['⟹', '\\Longrightarrow'], ['↗', '\\nearrow'], ['↘', '\\searrow']
    ], true],
    ['数学结构', [
        ['a⁄b', '\\frac{a}{b}'], ['√x', '\\sqrt{x}'], ['ⁿ√x', '\\sqrt[n]{x}'],
        ['xⁿ', 'x^{n}'], ['xₙ', 'x_{n}'], ['Σᵢⁿ', '\\sum_{i=1}^{n}'], ['Πᵢⁿ', '\\prod_{i=1}^{n}'],
        ['∫ₐᵇ', '\\int_{a}^{b}'], ['limₓ→₀', '\\lim_{x \\to 0}'], ['|x|', '\\left| x \\right|'],
        ['‖x‖', '\\left\\| x \\right\\|'], ['(n k)', '\\binom{n}{k}'],
        ['矩阵', '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}'],
        ['d/dx', '\\frac{\\mathrm{d}}{\\mathrm{d}x}'], ['∂/∂x', '\\frac{\\partial}{\\partial x}']
    ], false],
    ['括号', [
        ['( )', '( )'], ['[ ]', '[ ]'], ['{ }', '\\{ \\}'], ['⟨ ⟩', '\\langle \\rangle'],
        ['⌊ ⌋', '\\lfloor \\rfloor'], ['⌈ ⌉', '\\lceil \\rceil'], ['| x |', '| x |'],
        ['自适应()', '\\left(  \\right)'], ['自适应[]', '\\left[  \\right]'], ['自适应{}', '\\left\\{  \\right\\}']
    ], false],
    ['函数', [
        ['sin', '\\sin'], ['cos', '\\cos'], ['tan', '\\tan'], ['cot', '\\cot'],
        ['sec', '\\sec'], ['csc', '\\csc'], ['arcsin', '\\arcsin'], ['arccos', '\\arccos'],
        ['arctan', '\\arctan'], ['sinh', '\\sinh'], ['cosh', '\\cosh'], ['tanh', '\\tanh'],
        ['ln', '\\ln'], ['log', '\\log'], ['lg', '\\lg'], ['exp', '\\exp'],
        ['min', '\\min'], ['max', '\\max'], ['lim', '\\lim'], ['sup', '\\sup'],
        ['inf', '\\inf'], ['det', '\\det'], ['arg', '\\arg'], ['deg', '\\deg']
    ], false],
    ['常用符号', [
        ['ℝ', '\\mathbb{R}'], ['ℤ', '\\mathbb{Z}'], ['ℕ', '\\mathbb{N}'], ['ℂ', '\\mathbb{C}'],
        ['∀', '\\forall'], ['∃', '\\exists'], ['¬', '\\neg'], ['∅', '\\emptyset'],
        ['∠', '\\angle'], ['°', '^\\circ'], ['…', '\\ldots'], ['⋯', '\\cdots'],
        ['∵', '\\because'], ['∴', '\\therefore'], ['ℏ', '\\hbar'], ['ℜ', '\\Re'],
        ['ℑ', '\\Im'], ['′', '\\prime'], ['d', '\\mathrm{d}'], ['µ', '\\,\\text{µ}']
    ], true]
];

function escAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

(function renderSymTable() {
    var nav = '<div class="tab-nav">';
    var panels = '';
    SYMS.forEach(function (g, gi) {
        nav += '<button type="button" class="tab-btn' + (gi === 0 ? ' active' : '') +
               '" data-tab="' + gi + '">' + g[0] + '</button>';
        panels += '<div class="tab-panel' + (gi === 0 ? ' active' : '') + '" data-panel="' + gi + '"><div class="chip-grid">';
        g[1].forEach(function (it) {
            panels += '<button type="button" class="chip2' + (g[2] ? ' glyph' : '') +
                      '" data-code="' + escAttr(it[1]) + '" title="' + escAttr(it[1]) + '">' +
                      '<span class="chip2-sym">' + it[0] + '</span>' +
                      '<span class="chip2-code">' + escAttr(it[1]) + '</span></button>';
        });
        panels += '</div></div>';
    });
    el.symTable.innerHTML = nav + panels;
})();

el.symTable.addEventListener('click', function (e) {
    var tab = e.target.closest('.tab-btn');
    if (tab) {
        var idx = tab.getAttribute('data-tab');
        var btns = el.symTable.querySelectorAll('.tab-btn');
        var pns = el.symTable.querySelectorAll('.tab-panel');
        var i;
        for (i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i] === tab);
        for (i = 0; i < pns.length; i++) pns[i].classList.toggle('active', pns[i].getAttribute('data-panel') === idx);
        return;
    }
    var chip = e.target.closest('.chip2');
    if (!chip) return;
    insertAtCursor(chip.getAttribute('data-code'));
});

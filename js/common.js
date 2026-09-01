/* ============================================
   common.js - 公共工具函数
   ============================================ */

// 页面标题动态设置
function setPageTitle(title) {
  document.title = title + ' - EE工具箱';
}

// 返回首页路径（根据当前页面深度自动计算）
function getHomePath() {
  var depth = window.location.pathname.split('/').length - 2;
  if (depth <= 0) return 'index.html';
  return '../'.repeat(depth) + 'index.html';
}

// 生成手绘风格 SVG 图标（简单线条风格）
var Icons = {
  calculator: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="32" height="36" rx="4"/><line x1="14" y1="14" x2="34" y2="14"/><line x1="14" y1="22" x2="18" y2="22"/><line x1="22" y1="22" x2="26" y2="22"/><line x1="30" y1="22" x2="34" y2="22"/><line x1="14" y1="30" x2="18" y2="30"/><line x1="22" y1="30" x2="26" y2="30"/><line x1="30" y1="30" x2="34" y2="30"/><line x1="14" y1="38" x2="26" y2="38"/><line x1="30" y1="34" x2="34" y2="42"/></svg>',
  binary: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round"><text x="6" y="20" font-family="monospace" font-size="14" fill="#4a4a4a" stroke="none">01</text><text x="24" y="20" font-family="monospace" font-size="14" fill="#4a4a4a" stroke="none">10</text><text x="6" y="40" font-family="monospace" font-size="14" fill="#3a5a8c" stroke="none">FF</text><text x="24" y="40" font-family="monospace" font-size="14" fill="#c0583a" stroke="none">0x</text></svg>',
  wave: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round"><path d="M4 24 Q10 8, 16 24 Q22 40, 28 24 Q34 8, 40 24 L44 24"/><line x1="4" y1="24" x2="44" y2="24" stroke="#b8b0a0" stroke-width="1" stroke-dasharray="3 3"/></svg>',
  noise: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2" stroke-linecap="round"><line x1="4" y1="38" x2="44" y2="38" stroke="#b8b0a0" stroke-width="1"/><path d="M4 36 L8 32 L10 35 L14 28 L18 30 L22 24 L26 26 L30 20 L34 22 L38 16 L42 18 L44 12" stroke="#3a5a8c" stroke-width="2.5"/><circle cx="22" cy="24" r="2" fill="#c0583a"/></svg>',
  circuit: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="16" x2="16" y2="16"/><line x1="16" y1="10" x2="16" y2="22"/><line x1="12" y1="10" x2="20" y2="10"/><line x1="12" y1="22" x2="20" y2="22"/><line x1="20" y1="16" x2="32" y2="16"/><line x1="32" y1="10" x2="32" y2="22"/><line x1="28" y1="10" x2="36" y2="10"/><line x1="28" y1="22" x2="36" y2="22"/><line x1="36" y1="16" x2="44" y2="16"/><path d="M24 22 L24 32 L20 36 L28 40 L24 44" stroke="#c0583a" stroke-width="2"/></svg>',
  bode: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="6" y2="42"/><line x1="6" y1="42" x2="44" y2="42"/><path d="M8 14 L16 14 Q24 14, 28 28 L36 42" stroke="#3a5a8c" stroke-width="2.5"/><path d="M8 30 L20 30 Q28 30, 32 38 L36 42" stroke="#c0583a" stroke-width="2" stroke-dasharray="4 3"/></svg>',
  power: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="14" width="16" height="20" rx="2"/><line x1="22" y1="24" x2="30" y2="24"/><path d="M30 18 L38 24 L30 30" fill="none"/><line x1="38" y1="24" x2="44" y2="24"/><line x1="10" y1="18" x2="18" y2="18" stroke="#3a5a8c"/><line x1="10" y1="30" x2="18" y2="30" stroke="#3a5a8c"/></svg>',
  book: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8 C8 8, 24 6, 24 12 L24 40 C24 34, 8 36, 8 36 Z"/><path d="M40 8 C40 8, 24 6, 24 12 L24 40 C24 34, 40 36, 40 36 Z"/><line x1="12" y1="16" x2="20" y2="15" stroke="#3a5a8c" stroke-width="1.5"/><line x1="12" y1="22" x2="20" y2="21" stroke="#3a5a8c" stroke-width="1.5"/><line x1="28" y1="15" x2="36" y2="16" stroke="#c0583a" stroke-width="1.5"/><line x1="28" y1="21" x2="36" y2="22" stroke="#c0583a" stroke-width="1.5"/></svg>',
  game: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="12" width="36" height="24" rx="6"/><circle cx="16" cy="24" r="3"/><circle cx="32" cy="20" r="2" fill="#3a5a8c"/><circle cx="36" cy="24" r="2" fill="#c0583a"/><line x1="13" y1="24" x2="19" y2="24" stroke-width="1.5"/><line x1="16" y1="21" x2="16" y2="27" stroke-width="1.5"/></svg>',
  miller: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14 L18 24 L8 34 Z"/><path d="M22 14 L32 24 L22 34 Z"/><line x1="18" y1="24" x2="22" y2="24"/><path d="M20 10 L20 6 L30 6 M28 4 L28 8" stroke="#c0583a" stroke-width="2"/><line x1="20" y1="6" x2="20" y2="14" stroke="#c0583a" stroke-width="2"/><line x1="32" y1="24" x2="40" y2="24"/><line x1="36" y1="20" x2="36" y2="28" stroke="#3a5a8c"/></svg>',
  bandgap: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="40" x2="42" y2="40"/><line x1="10" y1="40" x2="10" y2="12"/><path d="M10 20 Q24 6, 38 20" stroke="#3a5a8c" stroke-width="2.5"/><line x1="10" y1="28" x2="38" y2="28" stroke="#c0583a" stroke-width="2" stroke-dasharray="4 3"/><text x="26" y="24" font-family="monospace" font-size="9" fill="#c0583a" stroke="none">Vref</text></svg>',
  gaussian: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="38" x2="43" y2="38"/><path d="M6 37 C16 37, 18 12, 24 12 C30 12, 32 37, 42 37" stroke="#3a5a8c" stroke-width="2.5"/><path d="M17 37 L17 26 M24 37 L24 12 M31 37 L31 26" stroke="#c0583a" stroke-width="1.2" fill="none"/><line x1="17" y1="37" x2="31" y2="37" stroke="#c0583a" stroke-width="3"/></svg>',
  links: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 28 L28 20"/><path d="M17 23 L12 28 A6 6 0 0 0 20 36 L25 31" stroke="#3a5a8c"/><path d="M31 25 L36 20 A6 6 0 0 0 28 12 L23 17" stroke="#c0583a"/></svg>',
  layout: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="32" height="32" rx="2"/><line x1="18.5" y1="8" x2="18.5" y2="40"/><line x1="29.5" y1="8" x2="29.5" y2="40"/><line x1="8" y1="18.5" x2="40" y2="18.5"/><line x1="8" y1="29.5" x2="40" y2="29.5"/><rect x="19.5" y="19.5" width="9" height="9" fill="#c0583a" stroke="none" opacity="0.55"/><rect x="9.5" y="9.5" width="8" height="8" fill="#3a5a8c" stroke="none" opacity="0.45"/><rect x="30.5" y="30.5" width="8" height="8" fill="#3a5a8c" stroke="none" opacity="0.45"/></svg>',
  filter: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="6" y2="42"/><line x1="6" y1="42" x2="44" y2="42"/><path d="M8 16 L22 16 Q30 17, 34 26 L40 40" stroke="#3a5a8c" stroke-width="2.5"/><line x1="26" y1="8" x2="26" y2="42" stroke="#b8b0a0" stroke-width="1" stroke-dasharray="3 3"/><circle cx="26" cy="20" r="2" fill="#c0583a" stroke="none"/></svg>',
  ntf: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="6" y2="42"/><line x1="6" y1="42" x2="44" y2="42"/><path d="M8 38 Q20 36, 28 24 Q34 12, 42 8" stroke="#c0583a" stroke-width="2.5"/><line x1="8" y1="30" x2="42" y2="30" stroke="#3a5a8c" stroke-width="1.5" stroke-dasharray="4 3"/></svg>',
  tex: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><text x="5" y="34" font-family="serif" font-style="italic" font-size="26" fill="#3a5a8c" stroke="none">∑</text><line x1="27" y1="19" x2="43" y2="19" stroke="#c0583a"/><text x="31" y="14" font-family="serif" font-size="11" fill="#4a4a4a" stroke="none">a</text><text x="31" y="33" font-family="serif" font-size="11" fill="#4a4a4a" stroke="none">b</text></svg>',
  wire: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 38 L18 38 L18 22 L34 22 L34 10 L42 10"/><circle cx="6" cy="38" r="2.2" fill="#4a4a4a" stroke="none"/><circle cx="42" cy="10" r="2.2" fill="#4a4a4a" stroke="none"/><circle cx="18" cy="30" r="2.5" fill="#c0583a" stroke="none"/><circle cx="34" cy="16" r="2.5" fill="#3a5a8c" stroke="none"/></svg>',
  lsq: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="6" y2="42"/><line x1="6" y1="42" x2="44" y2="42"/><line x1="10" y1="37" x2="40" y2="13" stroke="#3a5a8c"/><circle cx="14" cy="33" r="2.4" stroke="#c0583a" stroke-width="2"/><circle cx="22" cy="30" r="2.4" stroke="#c0583a" stroke-width="2"/><circle cx="29" cy="24" r="2.4" stroke="#c0583a" stroke-width="2"/><circle cx="37" cy="18" r="2.4" stroke="#c0583a" stroke-width="2"/></svg>',
  dice: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="34" height="34" rx="8"/><circle cx="16.5" cy="16.5" r="2.8" fill="#c0583a" stroke="none"/><circle cx="31.5" cy="16.5" r="2.8" fill="#c0583a" stroke="none"/><circle cx="24" cy="24" r="2.8" fill="#3a5a8c" stroke="none"/><circle cx="16.5" cy="31.5" r="2.8" fill="#c0583a" stroke="none"/><circle cx="31.5" cy="31.5" r="2.8" fill="#c0583a" stroke="none"/></svg>',
  schematic: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 10 L16 38 L36 24 Z"/><line x1="6" y1="17" x2="16" y2="17"/><line x1="6" y1="31" x2="16" y2="31"/><line x1="36" y1="24" x2="44" y2="24"/><line x1="24" y1="16" x2="24" y2="8" stroke="#c0583a"/><line x1="24" y1="33" x2="24" y2="40" stroke="#3a5a8c"/><line x1="18" y1="17" x2="22" y2="17"/><line x1="18" y1="31" x2="22" y2="31"/><line x1="20" y1="29" x2="20" y2="33"/></svg>',
  waveform: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 32 L10 32 L10 16 L20 16 L20 32 L28 32 L28 16 L36 16 L36 32 L44 32" stroke="#3a5a8c"/><rect x="28.5" y="16.5" width="7" height="15" fill="#c0583a" opacity="0.35" stroke="none"/><line x1="4" y1="41" x2="44" y2="41" stroke="#b8b0a0" stroke-width="1" stroke-dasharray="3 3"/></svg>',
  fmea: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#4a4a4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="7" width="27" height="36" rx="3"/><rect x="12" y="4" width="15" height="6" rx="2"/><path d="M11 16 L13.5 18.5 L17 14.5" stroke="#4a7c59" stroke-width="2"/><path d="M11 24 L13.5 26.5 L17 22.5" stroke="#4a7c59" stroke-width="2"/><path d="M11 32 L13.5 34.5 L17 30.5" stroke="#4a7c59" stroke-width="2"/><line x1="20" y1="16" x2="29" y2="16"/><line x1="20" y1="24" x2="29" y2="24"/><line x1="20" y1="32" x2="29" y2="32"/><line x1="40" y1="16" x2="40" y2="27" stroke="#c0583a" stroke-width="3"/><circle cx="40" cy="33.5" r="2.2" fill="#c0583a" stroke="none"/></svg>'
};

// 格式化数字显示
function formatNumber(num, decimals) {
  if (decimals === undefined) decimals = 6;
  if (Math.abs(num) >= 1e6 || (Math.abs(num) < 1e-4 && num !== 0)) {
    return num.toExponential(decimals);
  }
  return parseFloat(num.toFixed(decimals)).toString();
}

// 格式化工程记号（如 1.5k, 2.3M, 4.7u）
function formatEngineering(num) {
  var prefixes = [
    { val: 1e12, sym: 'T' },
    { val: 1e9, sym: 'G' },
    { val: 1e6, sym: 'M' },
    { val: 1e3, sym: 'k' },
    { val: 1, sym: '' },
    { val: 1e-3, sym: 'm' },
    { val: 1e-6, sym: 'μ' },
    { val: 1e-9, sym: 'n' },
    { val: 1e-12, sym: 'p' },
    { val: 1e-15, sym: 'f' }
  ];
  var absNum = Math.abs(num);
  for (var i = 0; i < prefixes.length; i++) {
    if (absNum >= prefixes[i].val) {
      return (num / prefixes[i].val).toFixed(3).replace(/\.?0+$/, '') + ' ' + prefixes[i].sym;
    }
  }
  return num.toString();
}

// 解析工程记号输入
function parseEngineering(str) {
  str = str.trim().toLowerCase();
  var multipliers = {
    't': 1e12, 'g': 1e9, 'meg': 1e6, 'm': 1e6,
    'k': 1e3, '': 1,
    'm': 1e-3, 'u': 1e-6, 'n': 1e-9, 'p': 1e-12, 'f': 1e-15
  };
  // 先尝试直接解析数字
  var num = parseFloat(str);
  if (!isNaN(num)) return num;
  // 尝试解析带后缀的
  var match = str.match(/^([\d.eE+-]+)\s*([tgmegkumnμpf])$/);
  if (match) {
    var val = parseFloat(match[1]);
    var suffix = match[2];
    if (suffix === 'μ') suffix = 'u';
    if (multipliers[suffix] !== undefined) {
      return val * multipliers[suffix];
    }
  }
  return NaN;
}

/* ============================================
   公共：一键复制文本（clipboard API + execCommand 降级）
   done(ok) 可选回调
   ============================================ */
function copyTextToClipboard(text, done) {
  function legacy() {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (done) done(true);
    } catch (e) { if (done) done(false); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { if (done) done(true); }, legacy);
  } else legacy();
}

/* ============================================
   公共：最小 PDF 导出（canvas 位图 JPEG 嵌入，白底，零依赖）
   canvas 视为 2x 位图：PDF 页面尺寸 = canvas 像素 / 2（72dpi 点）
   ============================================ */
function downloadPdfFromCanvas(canvas, filename) {
  var dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  var bin = atob(dataUrl.split(',')[1]);
  var imgLen = bin.length;
  var pw = canvas.width / 2, ph = canvas.height / 2;

  function enc(s) {
    var a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
    return a;
  }
  var imgBytes = new Uint8Array(imgLen);
  for (var j = 0; j < imgLen; j++) imgBytes[j] = bin.charCodeAt(j);

  var content = 'q\n' + pw + ' 0 0 ' + ph + ' 0 0 cm\n/Im0 Do\nQ\n';
  var parts = [], offsets = [], pos = 0;
  function push(s) { var a = (typeof s === 'string') ? enc(s) : s; parts.push(a); pos += a.length; }
  function mark() { offsets.push(pos); }

  push('%PDF-1.4\n');
  mark(); push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  mark(); push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  mark(); push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>\nendobj\n');
  mark(); push('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + canvas.width + ' /Height ' + canvas.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + imgLen + ' >>\nstream\n');
  push(imgBytes);
  push('\nendstream\nendobj\n');
  mark(); push('5 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream\nendobj\n');

  var xrefPos = pos;
  var xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (var k = 0; k < 5; k++) xref += ('0000000000' + offsets[k]).slice(-10) + ' 00000 n \n';
  push(xref);
  push('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n');

  var blob = new Blob(parts, { type: 'application/pdf' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

/* ============================================
   公共：白天/黑夜模式切换
   data-theme 挂在 <html>，localStorage 键 ee-theme（'light'|'dark'，无记录=白天）
   各页面 <head> 内联脚本负责首屏防闪白；本模块负责按钮图标/切换/注入
   ============================================ */
var Theme = {
  KEY: 'ee-theme',
  SUN: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.2" y1="5.2" x2="7" y2="7"/><line x1="17" y1="17" x2="18.8" y2="18.8"/><line x1="5.2" y1="18.8" x2="7" y2="17"/><line x1="17" y1="7" x2="18.8" y2="5.2"/></svg>',
  MOON: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13.5A8.5 8.5 0 1 1 10.5 4 6.8 6.8 0 0 0 20 13.5z"/></svg>',

  get: function () {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  },
  set: function (theme) {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem(Theme.KEY, theme); } catch (e) {}
    Theme.refreshAll();
  },
  toggle: function () {
    Theme.set(Theme.get() === 'dark' ? 'light' : 'dark');
  },
  /* 同步页面内所有切换按钮的图标与提示 */
  refreshAll: function () {
    var dark = Theme.get() === 'dark';
    var btns = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < btns.length; i++) {
      btns[i].innerHTML = dark ? Theme.MOON : Theme.SUN;
      btns[i].setAttribute('title', dark ? '切换到白天模式' : '切换到黑夜模式');
      btns[i].setAttribute('aria-label', dark ? '切换到白天模式' : '切换到黑夜模式');
    }
  },
  bind: function (btn) {
    if (!btn) return;
    btn.addEventListener('click', Theme.toggle);
    Theme.refreshAll();
  },
  /* 工具页：顶部导航条右侧自动注入切换按钮 */
  injectNav: function () {
    var nav = document.querySelector('.top-nav');
    if (!nav || nav.querySelector('.theme-toggle')) return;
    var btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.type = 'button';
    nav.appendChild(btn);
    Theme.bind(btn);
  }
};
Theme.injectNav();

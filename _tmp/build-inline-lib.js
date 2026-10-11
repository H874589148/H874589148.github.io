// 将 svg/parts-core.svg 与 svg/parts-outfits.svg 内联进 games/life/index.html
// 作用：file:// 直接打开页面时浏览器禁止 fetch，内联副本保证人物正常加载。
// 用法：修改 svg/*.svg 后运行 node _tmp/build-inline-lib.js 重新生成内联块。
const fs = require('fs');
const path = require('path');
const dir = 'f:/GitHub/H874589148.github.io/games/life/';
const core = fs.readFileSync(path.join(dir, 'svg/parts-core.svg'), 'utf8').trim();
const outfits = fs.readFileSync(path.join(dir, 'svg/parts-outfits.svg'), 'utf8').trim();

const block =
'<!-- ============================================================\n' +
'     人物部件库 · 内联快照（由 svg/parts-core.svg / svg/parts-outfits.svg 生成）\n' +
'     作用：file:// 直接打开页面时浏览器禁止 fetch，此副本保证人物正常加载与换装。\n' +
'     同步约定：修改 svg/*.svg 后运行 node _tmp/build-inline-lib.js 重新生成。\n' +
'     ============================================================ -->\n' +
'<script type="text/svg" id="life-lib-core">\n' + core + '\n</script>\n' +
'<script type="text/svg" id="life-lib-outfits">\n' + outfits + '\n</script>';

const BEGIN = '<!--__LIFE_PARTS_INLINE__-->';
const END = '<!--__LIFE_PARTS_INLINE_END__-->';
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
if (html.indexOf(BEGIN) < 0) {
  html = html.replace('<script src="data.js">', BEGIN + '\n' + block + '\n' + END + '\n\n<script src="data.js">');
} else {
  html = html.replace(new RegExp(BEGIN + '[\\s\\S]*?' + END), BEGIN + '\n' + block + '\n' + END);
}
fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
console.log('inline lib injected:', block.length, 'chars; index.html total:', html.length, 'chars');

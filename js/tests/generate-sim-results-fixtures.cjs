/* 固定合成截图生成器；只用于基准，不代表用户实际仿真截图准确率。 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), { createCanvas, GlobalFonts } = require(path.join(root, '_tmp/sim-results/node_modules/@napi-rs/canvas'));
const dir = path.join(__dirname, 'fixtures/sim-results'); fs.mkdirSync(dir, { recursive: true });
for (const [file, family] of [['C:/Windows/Fonts/arial.ttf', 'FixtureArial'], ['C:/Windows/Fonts/msyh.ttc', 'FixtureChinese']]) if (fs.existsSync(file)) GlobalFonts.registerFromPath(file, family);
const rows = [['Metric', 'Value', 'Unit'], ['Voltage', '-0.25', 'V'], ['Current', '00123', 'uA'], ['Gain', '100', 'dB']];
const fixtures = [];
for (const type of ['lined', 'wireless', 'dark', 'chinese']) {
    const canvas = createCanvas(1040, 380), ctx = canvas.getContext('2d'), dark = type === 'dark';
    const matrix = type === 'chinese' ? [['指标', '数值', '单位'], ['电压', '-0.25', 'V'], ['电流', '00123', 'uA'], ['增益', '100', 'dB']] : rows;
    ctx.fillStyle = dark ? '#20252b' : '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = dark ? '#ffffff' : '#000000'; ctx.font = '30px ' + (type === 'chinese' ? 'FixtureChinese, Microsoft YaHei' : 'FixtureArial, Arial'); ctx.textBaseline = 'middle';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ctx.fillText(matrix[r][c], 55 + c * 330, 65 + r * 85);
    if (type !== 'wireless') {
        ctx.strokeStyle = dark ? '#ffffff' : '#000000'; ctx.lineWidth = 2;
        for (let r = 0; r <= 4; r++) { ctx.beginPath(); ctx.moveTo(25, 22 + r * 85); ctx.lineTo(1015, 22 + r * 85); ctx.stroke(); }
        for (let c = 0; c <= 3; c++) { ctx.beginPath(); ctx.moveTo(25 + c * 330, 22); ctx.lineTo(25 + c * 330, 362); ctx.stroke(); }
    }
    const buffer = canvas.toBuffer('image/png'); fs.writeFileSync(path.join(dir, type + '.png'), buffer);
    fixtures.push({ file: type + '.png', lang: type === 'chinese' ? 'chi_sim+eng' : 'eng', rows: matrix, sha256: crypto.createHash('sha256').update(buffer).digest('hex') });
}
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ source: '固定合成截图，非用户截图；字体及像素以随附 PNG 为准。', fixtures }, null, 2) + '\n');
console.log('已生成 4 张固定 OCR 基准截图。');

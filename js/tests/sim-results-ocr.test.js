/* 真实引擎集成；缺依赖明确标记未执行，不以模拟回包代替 OCR。 */
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), C = require('../../tools/sim-log/result-core');
const deps = path.join(root, '_tmp/sim-results/node_modules'), fixtureDir = path.join(__dirname, 'fixtures/sim-results');
const available = fs.existsSync(path.join(deps, 'tesseract.js/package.json')) && fs.existsSync(path.join(deps, '@napi-rs/canvas/package.json'));
const missing = '未执行真实 OCR：请在 F 盘 _tmp/sim-results 安装锁定测试依赖（见 vendor-sim-results.cjs 与 fixtures 清单）。';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
test('本地资源版本、SHA-256、语言包和双核心完整', async () => {
    for (const manifest of ['lib/ocr/manifest.json', 'lib/exceljs/4.4.0/manifest.json']) {
        const data = JSON.parse(fs.readFileSync(path.join(root, manifest), 'utf8'));
        for (const entry of data.resources) { const bytes = fs.readFileSync(path.join(root, entry.file)); assert.equal(bytes.length, entry.bytes); assert.equal(hash(bytes), entry.sha256, entry.file); }
    }
    for (const variant of ['lstm', 'simd-lstm']) await WebAssembly.compile(fs.readFileSync(path.join(root, 'lib/ocr/core/6.0.0/tesseract-core-' + variant + '.wasm')));
});
test('真实 Tesseract 6.0.1：有线、无线、深底、中文截图结构与关键数值', { skip: available ? false : missing, timeout: 120000 }, async t => {
    const T = require(path.join(deps, 'tesseract.js')), canvas = require(path.join(deps, '@napi-rs/canvas'));
    assert.equal(require(path.join(deps, 'tesseract.js/package.json')).version, '6.0.1');
    assert.equal(require(path.join(deps, 'tesseract.js-core/package.json')).version, '6.0.0');
    for (const name of ['tesseract-core-lstm.wasm', 'tesseract-core-simd-lstm.wasm']) assert.equal(hash(fs.readFileSync(path.join(deps, 'tesseract.js-core', name))), hash(fs.readFileSync(path.join(root, 'lib/ocr/core/6.0.0', name))));
    const fixtures = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'manifest.json'))).fixtures;
    let worker, language;
    try {
        for (const fixture of fixtures) await t.test(fixture.file, async () => {
            const input = fs.readFileSync(path.join(fixtureDir, fixture.file)); assert.equal(hash(input), fixture.sha256);
            const image = await canvas.loadImage(input), cv = canvas.createCanvas(image.width, image.height), ctx = cv.getContext('2d'); ctx.drawImage(image, 0, 0);
            const prepared = C.preprocess(ctx.getImageData(0, 0, image.width, image.height).data, image.width, image.height, 'auto');
            ctx.putImageData(new canvas.ImageData(prepared.pixels, image.width, image.height), 0, 0);
            if (language !== fixture.lang) {
                if (worker) await worker.terminate();
                worker = await T.createWorker(fixture.lang, 1, { langPath: path.join(root, 'lib/ocr/lang'), cacheMethod: 'none', gzip: true, logger() {}, errorHandler() {} }); language = fixture.lang;
            }
            await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
            const result = await worker.recognize(cv.toBuffer('image/png'), {}, { blocks: true });
            const normalized = C.normalizeWords(result.data); assert.ok(normalized.words.length > 5); assert.equal(normalized.rejected.length, 0);
            const grid = C.infer(normalized.words, image.width, image.height, prepared.grid);
            const rebuilt = C.reconstruct(normalized.words, grid, image.width, image.height, { kind: 'ocr', imageId: fixture.file, name: fixture.file });
            assert.equal(rebuilt.doc.rows.length, 4); assert.equal(rebuilt.doc.cols.length, 3);
            const actual = rebuilt.doc.cells.map(row => row.map(cell => cell.text));
            for (let r = 1; r < 4; r++) assert.equal(actual[r][1], fixture.rows[r][1], fixture.file + ' 第 ' + r + ' 行数值');
            if (fixture.lang === 'eng') assert.equal(actual[1][0], 'Voltage');
            else assert.equal(actual[1][0].replace(/ /g, ''), '电压');
            assert.equal(grid.kind, fixture.file === 'wireless.png' ? 'alignment' : 'grid');
        });
    } finally { if (worker) await worker.terminate(); }
});

/* 将固定 npm 依赖生成到同站目录；不运行安装脚本、不使用 CDN 回退。 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), installed = path.join(root, '_tmp/sim-results/node_modules');
// 重建依赖：node js/tests/vendor-sim-results.cjs --install；自测：node --test js/tests/sim-results*.test.js。
if (process.argv.includes('--install')) {
    const temp = path.join(root, '_tmp'), prefix = path.dirname(installed);
    const npm = process.env.SIM_RESULTS_NPM_CLI || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    const packages = ['tesseract.js@6.0.1', 'tesseract.js-core@6.0.0', '@tesseract.js-data/eng@1.0.0', '@tesseract.js-data/chi_sim@1.0.0', 'exceljs@4.4.0', '@napi-rs/canvas@0.1.80'];
    const result = require('node:child_process').spawnSync(process.execPath, [npm, 'install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error', '--progress=false', '--update-notifier=false', ...packages], {
        cwd: root, stdio: 'inherit', env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp, npm_config_cache: path.join(temp, 'npm-cache') }
    });
    if (result.status !== 0) throw Error('测试依赖安装失败：' + (result.error || result.status));
}
const lock = require(path.join(installed, '../package-lock.json'));
const entries = [];
function copy(pkg, version, source, destination) {
    const info = require(path.join(installed, pkg, 'package.json'));
    if (info.version !== version) throw Error(pkg + ' 版本不匹配');
    const content = fs.readFileSync(path.join(installed, pkg, source));
    const output = path.join(root, destination); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, content);
    entries.push({ file: destination, package: pkg, version, source: 'https://registry.npmjs.org/' + pkg + '/-/' + pkg.split('/').pop() + '-' + version + '.tgz', member: source,
        packageIntegrity: lock.packages['node_modules/' + pkg].integrity, bytes: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') });
}
copy('tesseract.js', '6.0.1', 'dist/tesseract.min.js', 'lib/ocr/tesseract/6.0.1/tesseract.min.js');
copy('tesseract.js', '6.0.1', 'dist/worker.min.js', 'lib/ocr/tesseract/6.0.1/worker.min.js');
for (const name of ['tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm']) copy('tesseract.js-core', '6.0.0', name, 'lib/ocr/core/6.0.0/' + name);
for (const lang of ['eng', 'chi_sim']) copy('@tesseract.js-data/' + lang, '1.0.0', '4.0.0_best_int/' + lang + '.traineddata.gz', 'lib/ocr/lang/' + lang + '.traineddata.gz');
copy('exceljs', '4.4.0', 'dist/exceljs.min.js', 'lib/exceljs/4.4.0/exceljs.min.js');
for (const [pkg, version, dest] of [['tesseract.js', '6.0.1', 'lib/ocr/tesseract/6.0.1'], ['tesseract.js-core', '6.0.0', 'lib/ocr/core/6.0.0'], ['@tesseract.js-data/eng', '1.0.0', 'lib/ocr/lang/eng'], ['@tesseract.js-data/chi_sim', '1.0.0', 'lib/ocr/lang/chi_sim'], ['exceljs', '4.4.0', 'lib/exceljs/4.4.0']]) {
    const licenses = fs.readdirSync(path.join(installed, pkg)).filter(name => /^(license|copying|notice)/i.test(name));
    if (!licenses.length) {
        if (!pkg.startsWith('@tesseract.js-data/')) throw Error(pkg + ' 缺少许可证');
        // npm 包仅声明 MIT，未附许可证；保留元数据，并随训练数据附上游 Apache-2.0 条款。
        copy(pkg, version, 'package.json', dest + '/package.json');
        copy('tesseract.js-core', '6.0.0', 'LICENSE', dest + '/APACHE-2.0.txt');
    }
    for (const name of licenses) copy(pkg, version, name, dest + '/' + name);
    const dist = path.join(installed, pkg, 'dist');
    if (fs.existsSync(dist)) for (const name of fs.readdirSync(dist).filter(name => /LICENSE/.test(name))) copy(pkg, version, 'dist/' + name, dest + '/' + name);
}
for (const dir of ['lib/ocr', 'lib/exceljs/4.4.0']) {
    const list = entries.filter(entry => entry.file.startsWith(dir + '/'));
    fs.writeFileSync(path.join(root, dir, 'manifest.json'), JSON.stringify({ format: 1, languageLicense: { upstream: 'https://github.com/naptha/tessdata/blob/gh-pages/LICENSE', license: 'Apache-2.0', note: '训练数据上游许可证为 Apache-2.0；npm 包元数据的 MIT 声明另行原样保留，未分发包内其他代码。' }, resources: list }, null, 2) + '\n');
}
console.log('已生成 ' + entries.length + ' 个固定版本资源/许可证及 SHA-256 清单。');

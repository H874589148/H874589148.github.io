/* 本地图片与 OCR 生命周期；不访问编辑器 DOM，不配置任何上传端点。 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./result-core'));
    else root.SimResultsOCR = factory(root.SimResultsCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
    'use strict';
    var scripts = new Map();
    function loadScript(win, url, globalName) {
        if (win[globalName]) return Promise.resolve(win[globalName]);
        if (scripts.has(url)) return scripts.get(url);
        var promise = new Promise(function (resolve, reject) {
            var script = win.document.createElement('script'), timer;
            function fail() { win.clearTimeout(timer); script.remove(); scripts.delete(url); reject(new Error('本地资源加载失败，请检查资源后重试：' + url)); }
            script.src = url; script.onload = function () { win.clearTimeout(timer); if (win[globalName]) resolve(win[globalName]); else fail(); };
            script.onerror = fail; timer = win.setTimeout(fail, 45000); win.document.head.appendChild(script);
        });
        scripts.set(url, promise); return promise;
    }
    function isTextTarget(target) { return !!target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable); }
    function pastedImages(event, active) {
        if (!active || isTextTarget(event.target) || !event.clipboardData) return [];
        return Array.from(event.clipboardData.items || []).filter(function (v) { return v.kind === 'file'; }).map(function (v) { return v.getAsFile(); }).filter(Boolean);
    }
    function fileCheck(files) {
        if (!files || files.length !== 1) throw new Error('一次只能导入一张图片。');
        var f = files[0];
        if (['image/png', 'image/jpeg', 'image/webp'].indexOf(f.type) < 0) throw new Error('仅支持 PNG、JPEG、WebP 图片。');
        if (!f.size || f.size > 15 * 1024 * 1024) throw new Error('图片不能为空，且不能超过 15 MiB。');
        return f;
    }
    function cropCheck(crop, image) {
        if (!crop || !['x', 'y', 'width', 'height'].every(function (key) { return Number.isFinite(crop[key]); }) || crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1 || crop.x + crop.width > image.width || crop.y + crop.height > image.height) throw new Error('裁剪区域必须位于原图内且至少为 1×1 像素。');
        return C.clone(crop);
    }
    function workSize(crop) {
        var scale = Math.min(1, 4096 / Math.max(crop.width, crop.height), Math.sqrt(6000000 / (crop.width * crop.height)));
        return { width: Math.max(1, Math.floor(crop.width * scale)), height: Math.max(1, Math.floor(crop.height * scale)), scale: scale };
    }
    function Controller(win, onState) {
        this.win = win; this.onState = onState || function () {}; this.image = null; this.crop = null;
        this.sequence = 0; this.imageSequence = 0; this.job = null; this.engine = null; this.engineLang = ''; this.recognition = null;
    }
    Controller.prototype.releaseImage = function () {
        if (this.image && this.image.bitmap.close) this.image.bitmap.close();
        this.image = null; this.crop = null; this.recognition = null;
    };
    Controller.prototype.importFiles = async function (files) {
        this.cancel(); var seq = ++this.imageSequence; this.releaseImage();
        var file = fileCheck(files), bitmap;
        if (this.win.createImageBitmap) bitmap = await this.win.createImageBitmap(file);
        else {
            var win = this.win;
            bitmap = await new Promise(function (resolve, reject) {
                var img = new win.Image(), url = win.URL.createObjectURL(file);
                img.onload = function () { win.URL.revokeObjectURL(url); resolve(img); };
                img.onerror = function () { win.URL.revokeObjectURL(url); reject(new Error('图片解码失败，文件可能损坏。')); }; img.src = url;
            });
        }
        if (seq !== this.imageSequence) { if (bitmap.close) bitmap.close(); return null; }
        var width = bitmap.width, height = bitmap.height;
        if (!width || !height || width * height > 20000000) { if (bitmap.close) bitmap.close(); throw new Error('解码后的原图不能超过 20 MP。'); }
        this.image = { id: 'image-' + Date.now().toString(36) + '-' + seq, name: file.name || '粘贴截图', width: width, height: height, bitmap: bitmap };
        this.crop = { x: 0, y: 0, width: width, height: height };
        this.onState({ state: 'ready', message: '图片就绪，请选择目标表并点击转换。' }); return this.image;
    };
    Controller.prototype.setCrop = function (crop) { if (!this.image) throw new Error('请先导入图片。'); this.cancel(); this.crop = cropCheck(crop, this.image); this.recognition = null; };
    Controller.prototype.cancel = function (reason) {
        ++this.sequence;
        var job = this.job; this.job = null;
        if (job) {
            this.win.clearTimeout(job.timer); if (job.pixelWorker) job.pixelWorker.terminate();
            job.reject(new Error(reason || '已取消转换，原表保持不变。'));
        }
        if (this.engine && job) { Promise.resolve(this.engine.terminate()).catch(function () {}); this.engine = null; this.engineLang = ''; }
    };
    Controller.prototype.dispose = function () { this.cancel(); ++this.imageSequence; this.releaseImage(); if (this.engine) { this.engine.terminate(); this.engine = null; } };
    Controller.prototype.run = async function (options) {
        if (!this.image) throw new Error('请先导入图片。');
        if (['eng', 'chi_sim+eng'].indexOf(options.lang) < 0) throw new Error('识别语言无效。');
        this.cancel();
        var self = this, win = this.win, seq = ++this.sequence, image = this.image, crop = cropCheck(this.crop, image), size = workSize(crop), job;
        var cancelled = new Promise(function (_, reject) { job = { id: seq, imageId: image.id, crop: crop, reject: reject }; });
        this.job = job;
        function current() { return self.job === job && self.sequence === seq && self.image === image; }
        function guard() { if (!current()) throw new Error('旧识别任务已失效。'); }
        function state(message) { if (current()) self.onState({ state: 'running', message: message, scale: size.scale }); }
        job.timer = win.setTimeout(function () { if (current()) self.cancel('完整转换超过 120 秒，已取消；原表保留，请裁剪后重试。'); }, 120000);
        async function execute() {
            state('正在准备工作图（缩放 ' + (size.scale * 100).toFixed(1) + '%）…');
            var canvas = win.document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
            var ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(image.bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
            var pixels = ctx.getImageData(0, 0, size.width, size.height);
            var processed = await new Promise(function (resolve, reject) {
                var worker = new win.Worker('result-image-worker.js'); job.pixelWorker = worker;
                worker.onmessage = function (event) {
                    if (!current() || event.data.id !== seq) return;
                    worker.terminate(); job.pixelWorker = null;
                    if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data);
                };
                worker.onerror = function () { if (!current()) return; worker.terminate(); job.pixelWorker = null; reject(new Error('图片 Worker 失败，请重试。')); };
                worker.postMessage({ id: seq, width: size.width, height: size.height, mode: options.mode, buffer: pixels.data.buffer }, [pixels.data.buffer]);
            });
            guard();
            ctx.putImageData(new win.ImageData(new Uint8ClampedArray(processed.buffer), size.width, size.height), 0, 0);
            state('正在加载本站 OCR 引擎与语言资源；首次加载可能较大…');
            var blob = await new Promise(function (resolve, reject) { canvas.toBlob(function (value) { if (value) resolve(value); else reject(new Error('工作图编码失败。')); }, 'image/png'); }); guard();
            var buffer = await blob.arrayBuffer(); guard();
            if (!self.engine) self.engine = new win.Worker('result-ocr-worker.js');
            var owner = self.engine;
            var raw = await new Promise(function (resolve, reject) {
                owner.onmessage = function (event) {
                    if (!current() || self.engine !== owner || event.data.id !== seq) return;
                    if (event.data.error) {
                        owner.terminate(); self.engine = null;
                        reject(new Error('OCR 引擎或本地资源失败，请重试：' + event.data.error));
                    } else if (event.data.progress) {
                        var p = event.data.progress, stages = { 'loading tesseract core': '加载核心', 'initializing tesseract': '初始化核心', 'loading language traineddata': '加载语言', 'initializing api': '初始化识别', 'recognizing text': '识别文字' };
                        state((stages[p.status] || 'OCR 处理') + (Number.isFinite(p.progress) ? ' ' + Math.round(p.progress * 100) + '%' : ''));
                    } else resolve(event.data);
                };
                owner.onerror = function () { if (!current() || self.engine !== owner) return; owner.terminate(); self.engine = null; reject(new Error('OCR Worker 无法加载，原表保留，请检查本站资源后重试。')); };
                owner.postMessage({ id: seq, lang: options.lang, buffer: buffer }, [buffer]);
            }); guard();
            state('正在重建行列结构…');
            var normalized = C.normalizeWords(raw.data), words = normalized.words;
            if (!words.length) throw new Error('未识别到带位置的文字，请调整裁剪或预处理。可另行选择手工建表。');
            var origin = { kind: 'ocr', imageId: image.id, name: image.name, crop: crop, width: size.width, height: size.height };
            guard();
            self.recognition = { imageId: image.id, crop: crop, width: size.width, height: size.height, scale: size.scale, grid: { xs: [0, size.width], ys: [0, size.height], kind: 'manual' }, words: words, rejected: normalized.rejected, origin: origin };
            var grid = C.infer(words, size.width, size.height, processed.grid);
            self.recognition.grid = grid;
            var rebuilt = C.reconstruct(words, grid, size.width, size.height, origin);
            return { doc: rebuilt.doc, issues: rebuilt.issues, recognition: self.recognition };
        }
        try { return await Promise.race([execute(), cancelled]); }
        finally {
            if (this.job === job) { win.clearTimeout(job.timer); if (job.pixelWorker) job.pixelWorker.terminate(); this.job = null; }
        }
    };
    return { Controller: Controller, loadScript: loadScript, pastedImages: pastedImages, fileCheck: fileCheck, cropCheck: cropCheck, workSize: workSize };
}));

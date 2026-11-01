/* 可终止的 OCR 宿主：取消宿主也终止其子 Worker，覆盖引擎尚未初始化的阶段。 */
'use strict';
var engine = null, language = '', current = null;
self.onmessage = async function (event) {
    var task = event.data; current = task;
    function send(payload) { if (current === task) self.postMessage(Object.assign({ id: task.id }, payload)); }
    try {
        if (!self.Tesseract) importScripts('../../lib/ocr/tesseract/6.0.1/tesseract.min.js');
        if (engine && language !== task.lang) { await engine.terminate(); engine = null; }
        if (!engine) {
            engine = await Tesseract.createWorker(task.lang, 1, {
                workerPath: new URL('../../lib/ocr/tesseract/6.0.1/worker.min.js', self.location.href).href,
                corePath: new URL('../../lib/ocr/core/6.0.0/', self.location.href).href,
                langPath: new URL('../../lib/ocr/lang/', self.location.href).href,
                workerBlobURL: false, gzip: true, cacheMethod: 'none',
                logger: function (progress) {
                    if (current && (!progress.userJobId || !progress.userJobId.startsWith('result-') || progress.userJobId === 'result-' + current.id)) self.postMessage({ id: current.id, progress: progress });
                },
                errorHandler: function (err) { if (current) self.postMessage({ id: current.id, error: String(err) }); }
            });
            language = task.lang;
        }
        await engine.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
        var result = await engine.recognize(task.buffer, {}, { blocks: true }, 'result-' + task.id);
        send({ data: result.data });
    } catch (err) { send({ error: err.message || String(err) }); }
};

/* 后台任务仅处理本地数据；宿主通过 terminate 实现硬取消和分阶段超时。 */
'use strict';
importScripts('engine.js');
self.onmessage = function (event) {
    var d = event.data;
    if (!d || d.type !== 'compute' || typeof d.jobId !== 'number' || !Number.isInteger(d.revision) || !d.net) return;
    function send(type, payload) { self.postMessage(Object.assign({ type: type, jobId: d.jobId, revision: d.revision }, payload || {})); }
    try {
        send('matrix', { symbolic: TFEngine.symbolic(d.net, { matrixOnly: true }) });
        try {
            var numeric = TFEngine.numeric(d.net);
            send('numeric', { numeric: numeric });
            if (!numeric.missing.length) {
                try { send('sweep', { sweep: TFEngine.sweep(d.net, numeric, d.frequency) }); }
                catch (err) { send('issue', { message: '扫频失败：' + err.message }); }
            }
        } catch (err) { send('issue', { message: '数值计算失败：' + err.message }); }
        send('stage', { stage: 'symbolic' });
        send('symbolic', { symbolic: TFEngine.symbolic(d.net) });
        send('done');
    } catch (err) { send('error', { message: err.message || '后台计算失败' }); }
};

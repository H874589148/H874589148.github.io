/* 独立 Worker；取消由宿主 terminate 完成，不让迟到结果覆盖新输入。 */
'use strict';
importScripts('engine.js');
self.onmessage = function (event) {
    var message = event.data;
    if (!message || !Number.isInteger(message.id) || !message.params) return;
    try {
        var result = self.PowerElectronics.solve(message.params);
        self.postMessage({ id: message.id, ok: true, result: result });
    } catch (err) {
        self.postMessage({ id: message.id, ok: false, code: err.code || 'MODEL', error: err.message || '计算失败' });
    }
};

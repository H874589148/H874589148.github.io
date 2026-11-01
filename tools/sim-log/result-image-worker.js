/* 图片像素处理只在独立 Worker 中运行。 */
'use strict';
importScripts('result-core.js');
self.onmessage = function (event) {
    var task = event.data;
    try {
        var result = SimResultsCore.preprocess(new Uint8ClampedArray(task.buffer), task.width, task.height, task.mode);
        self.postMessage({ id: task.id, buffer: result.pixels.buffer, grid: result.grid, inverted: result.inverted }, [result.pixels.buffer]);
    } catch (err) { self.postMessage({ id: task.id, error: err.message }); }
};

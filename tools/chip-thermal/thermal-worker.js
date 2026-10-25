/* 只缓存主管标定模型；附加热源和功耗变化不重新拟合散热。 */
'use strict';
importScripts('thermal-core.js');
var cachedModel = null;
self.onmessage = function (event) {
    var request = event.data;
    try {
        ThermalCore.geometry(request.config);
        var key = ThermalCore.modelKey(request.config);
        if (!cachedModel || cachedModel.key !== key) cachedModel = ThermalCore.createModel(request.config);
        var result = ThermalCore.solve(request.config, cachedModel);
        self.postMessage({ id: request.id, result: result }, [result.values.buffer]);
    } catch (error) {
        self.postMessage({ id: request.id, error: error.message || '热图计算失败' });
    }
};

/* TF 专用参数草稿会话；不改变通用富文本编辑语义。 */
window.CircuitParameterEditor = (function () {
    'use strict';
    function create(options) {
        var dialog = document.getElementById('ckParameterDialog'), form = dialog.querySelector('form');
        var name = dialog.querySelector('[name="symbol"]'), value = dialog.querySelector('[name="value"]');
        var prefix = dialog.querySelector('[name="prefix"]'), unit = dialog.querySelector('[data-unit]'), error = dialog.querySelector('[role="alert"]');
        var item = null, api = { active: false };
        function close(data) {
            api.active = false; item = null; dialog.close(); options.finish(data);
        }
        api.open = function (it, initial) {
            item = it; api.active = true;
            name.value = initial.symbol; value.value = initial.value; prefix.value = initial.prefix;
            unit.textContent = it.type === 'resistor' ? 'Ω' : it.type === 'capacitor' ? 'F' : 'S';
            error.textContent = ''; dialog.showModal(); value.focus(); value.select();
        };
        api.notify = function () { value.focus(); };
        api.cancel = function () { if (api.active) close(null); };
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var a = { version: 1, symbol: name.value, value: value.value.trim(), prefix: prefix.value };
            try {
                TFNetlist.valueOf(a, TFNetlist.TYPES[item.type]);
                if (options.duplicate(a.symbol, item.id)) throw new Error('名称已被其他器件或输入输出使用');
                close(a);
            } catch (err) { error.textContent = err.message; }
        });
        dialog.querySelector('[data-cancel]').addEventListener('click', api.cancel);
        dialog.addEventListener('cancel', function (e) { e.preventDefault(); api.cancel(); });
        dialog.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.isComposing) return;
            if (e.key === 'Escape') { e.preventDefault(); api.cancel(); }
            if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); form.requestSubmit(); }
        });
        return api;
    }
    return { create: create };
})();

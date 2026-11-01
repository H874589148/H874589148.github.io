/* 主标签存档与初始化独立于旧设置脚本。 */
(function (win) {
    'use strict';
    var doc = win.document, names = ['settings', 'results'], current = 'settings', editor = null;
    function activate(name, focus) {
        if (name !== 'settings' && name !== 'results') name = 'settings';
        if (current === 'results' && name !== current && editor && !editor.beforeLeave()) return;
        if (name === 'results' && !editor) {
            try { editor = win.SimResultsEditor.init(win); }
            catch (err) { doc.getElementById('sim-ui-warning').textContent = '结果编辑器初始化失败：' + err.message; return; }
        }
        names.forEach(function (key) {
            var tab = doc.getElementById('sim-tab-' + key), selected = name === key;
            tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
            doc.getElementById('sim-panel-' + key).hidden = !selected;
        });
        current = name; if (editor) editor.setActive(name === 'results');
        if (focus) doc.getElementById('sim-tab-' + name).focus();
        try { win.localStorage.setItem('ee-sim-log-ui', JSON.stringify({ version: 1, tab: name })); }
        catch (_) { doc.getElementById('sim-ui-warning').textContent = '标签未保存：本机存储不可用。'; }
    }
    names.forEach(function (name, index) {
        var tab = doc.getElementById('sim-tab-' + name);
        tab.addEventListener('click', function () { activate(name, false); });
        tab.addEventListener('keydown', function (event) {
            var target;
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') target = names[1 - index];
            else if (event.key === 'Home') target = names[0]; else if (event.key === 'End') target = names[1];
            if (target) { event.preventDefault(); activate(target, true); }
        });
    });
    var saved;
    try { saved = JSON.parse(win.localStorage.getItem('ee-sim-log-ui')); } catch (_) { saved = null; }
    activate(saved && saved.version === 1 ? saved.tab : 'settings', false);
}(window));

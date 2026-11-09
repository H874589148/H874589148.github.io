/* Chart.js 生命周期；仅接收计算核心的数据，不复制物理公式。 */
(function (root) {
    'use strict';
    var charts = {}, specs = {};
    function colors() {
        var css = getComputedStyle(document.documentElement);
        return { text: css.getPropertyValue('--color-text').trim() || '#333',
            secondary: css.getPropertyValue('--color-text-secondary').trim() || '#666',
            grid: css.getPropertyValue('--color-border').trim() || '#ccc',
            paper: css.getPropertyValue('--color-bg-paper').trim() || '#fff',
            primary: css.getPropertyValue('--color-primary').trim() || '#267',
            accent: css.getPropertyValue('--color-accent').trim() || '#a55' };
    }
    function clear(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } delete specs[id]; }
    function update(id, config) {
        clear(id); specs[id] = config;
        if (typeof root.Chart !== 'function') return;
        var canvas = document.getElementById(id); if (!canvas || !canvas.getContext) return;
        var c = colors(), context = canvas.getContext('2d'); if (!context) return;
        var palette = [c.primary, c.accent, '#3b82a0', '#8b6fb0', '#718355', '#bc7a35'];
        config.data.datasets.forEach(function (set, i) {
            set.borderColor = palette[i % palette.length]; set.backgroundColor = set.borderColor;
            set.pointRadius = 0; set.borderWidth = 1.7; set.tension = 0;
        });
        var options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
            interaction: { mode: 'nearest', intersect: false },
            plugins: { legend: { labels: { color: c.text, boxWidth: 22 } }, tooltip: { titleColor: c.text, bodyColor: c.text,
                footerColor: c.text, backgroundColor: c.paper, borderColor: c.grid, borderWidth: 1, callbacks: { label: function (item) {
                var x = Number(item.parsed.x), y = Number(item.parsed.y);
                return item.dataset.label + ': x=' + (x >= 1e3 || x < .01 ? x.toExponential(3) : x.toPrecision(4)) + ', y=' + y.toPrecision(5);
            } } } },
            scales: { x: { type: 'linear', title: { display: true, color: c.secondary, text: config.xTitle || '' },
                ticks: { color: c.secondary, callback: function (v) { return Number(v).toExponential(0).replace('e+', 'e'); } }, grid: { color: c.grid } },
                y: { type: 'linear', title: { display: true, color: c.secondary, text: config.yTitle || '' }, ticks: { color: c.secondary }, grid: { color: c.grid } } }
        }, config.options || {});
        options.scales.x.type = config.logX === false ? 'linear' : 'logarithmic';
        if (config.logY) options.scales.y.type = 'logarithmic';
        options.scales.x.title.text = config.xTitle || ''; options.scales.y.title.text = config.yTitle || '';
        charts[id] = new root.Chart(context, { type: config.type || 'line', data: config.data, options: options });
    }
    function theme() {
        var previous = specs;
        Object.keys(charts).forEach(function (id) { charts[id].destroy(); });
        charts = {}; specs = {};
        Object.keys(previous).forEach(function (id) { update(id, previous[id]); });
    }
    if (typeof MutationObserver === 'function') new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    root.JitterPlots = { update: update, clear: clear, theme: theme };
    if (typeof module === 'object' && module.exports) module.exports = root.JitterPlots;
}(typeof window !== 'undefined' ? window : globalThis));

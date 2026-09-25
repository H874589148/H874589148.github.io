/* 同源图纸副本传输；不读取或自动覆盖主编辑器存档。 */
(function (root) {
    'use strict';
    var PREFIX = 'ee-circuit-handoff-v1:', SESSION = 'ee-circuit-copy-v1:';
    var TTL = 10 * 60 * 1000, WAIT = 15000, LIMIT = 2 * 1024 * 1024;
    function fail(message) { throw new Error(message); }
    function bytes(s) { return new TextEncoder().encode(s).length; }
    function text(s, max) { return typeof s === 'string' && s.length <= max; }
    function finite(n) { return typeof n === 'number' && Number.isFinite(n); }
    function point(p) { return p && finite(p.x) && finite(p.y) && Math.abs(p.x) <= 1e7 && Math.abs(p.y) <= 1e7; }
    function keys(value, allowed) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail('对象结构无效');
        Object.keys(value).forEach(function (k) { if (allowed.indexOf(k) < 0) fail('不支持的字段：' + k); });
    }
    function safe(value, depth) {
        if (depth > 24) fail('文档嵌套过深');
        if (typeof value === 'number' && !finite(value)) fail('包含非有限数值');
        if (value && typeof value === 'object') Object.keys(value).forEach(function (k) {
            if (['__proto__', 'constructor', 'prototype'].indexOf(k) >= 0) fail('包含危险字段');
            safe(value[k], depth + 1);
        });
        else if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) fail('只能传输 JSON 数据');
    }
    function clone(value) {
        safe(value, 0);
        var s = JSON.stringify(value);
        if (bytes(s) > LIMIT) fail('图纸超过 2 MiB 上限');
        return JSON.parse(s);
    }
    function rich(r) {
        keys(r, ['version', 'align', 'lines']);
        if (r.version !== 1 || !['start', 'middle', 'end'].includes(r.align) || !Array.isArray(r.lines) || !r.lines.length) fail('富文本格式无效');
        var length = 0;
        r.lines.forEach(function (line) {
            keys(line, ['runs']);
            if (!Array.isArray(line.runs)) fail('富文本行无效');
            line.runs.forEach(function (run) {
                keys(run, ['text', 'bold', 'italic', 'script', 'size']);
                if (!text(run.text, 20000) || /[\r\n]/.test(run.text)) fail('富文本内容无效');
                length += run.text.length;
                ['bold', 'italic'].forEach(function (k) { if (run[k] != null && typeof run[k] !== 'boolean') fail('富文本样式无效'); });
                if (run.size != null && (!finite(run.size) || run.size < 6 || run.size > 144)) fail('富文本字号无效');
                if (run.script != null && !['normal', 'super', 'sub'].includes(run.script)) fail('富文本上下标无效');
            });
        });
        if (length > 20000) fail('富文本过长');
    }
    function validateDoc(value, R) {
        var d = clone(value), ids = new Set(), groupIds = new Set(), grouped = new Set(), vertices = 0;
        R = R || root.Razavi;
        var symbols = R.metaAll();
        keys(d, ['items', 'groups', 'version', 'inputKind', 'analysisContext']);
        if (d.version != null && d.version !== 1) fail('未知图纸版本');
        if (!Array.isArray(d.items) || d.items.length > 5000) fail('图纸对象上限为 5000');
        if (d.inputKind != null && !['voltage', 'current'].includes(d.inputKind)) fail('输入类型无效');
        if (d.analysisContext != null) {
            keys(d.analysisContext, ['version', 'kind']);
            if (d.analysisContext.version !== 1 || d.analysisContext.kind !== 'tf') fail('分析上下文无效');
        }
        d.items.forEach(function (it) {
            keys(it, ['kind', 'id', 'type', 'x', 'y', 'rot', 'fh', 'fv', 'variant', 'text', 'richText', 'stroke', 'sw', 'dash', 'pts', 'anchor', 'size', 'analysis', 'inputKind']);
            if (!text(it.id, 128) || !it.id || ids.has(it.id)) fail('对象 ID 缺失或重复');
            ids.add(it.id);
            if (!['comp', 'wire', 'label'].includes(it.kind)) fail('未知图纸对象');
            if (it.stroke != null && (!text(it.stroke, 80) || !/^(#[0-9a-fA-F]{3,8}|currentColor|none|[a-zA-Z]+|var\(--[a-zA-Z0-9_-]+\))$/.test(it.stroke))) fail('颜色无效');
            if (it.sw != null && (!finite(it.sw) || it.sw <= 0 || it.sw > 100)) fail('线宽无效');
            if (it.dash != null && (!text(it.dash, 100) || !/^(?:\d+(?:\.\d+)?[ ,]*)*$/.test(it.dash))) fail('线型无效');
            if (it.text != null && !text(it.text, 20000)) fail('标注无效或过长');
            if (it.richText != null) rich(it.richText);
            if (it.kind === 'wire') {
                if (!Array.isArray(it.pts) || it.pts.length < 2 || !it.pts.every(function (p) { keys(p, ['x', 'y']); return point(p); })) fail('导线顶点无效');
                vertices += it.pts.length;
            } else {
                if (!point(it)) fail('坐标无效');
                if (it.kind === 'comp') {
                    if (!Object.prototype.hasOwnProperty.call(symbols, it.type)) fail('未知器件：' + it.type);
                    if (it.rot != null && ![0, 1, 2, 3].includes(it.rot)) fail('旋转值无效');
                    ['fh', 'fv'].forEach(function (k) { if (it[k] != null && typeof it[k] !== 'boolean') fail('镜像值无效'); });
                    if (it.variant != null && (typeof it.variant !== 'string' || (it.variant !== '' && !(R.variantOptions(it.type) || []).some(function (v) { return v.id === it.variant; })))) fail('器件变体无效');
                }
                if (it.anchor != null && !['start', 'middle', 'end'].includes(it.anchor)) fail('对齐方式无效');
                if (it.size != null && (!finite(it.size) || it.size < 6 || it.size > 144)) fail('字号无效');
            }
            if (it.inputKind != null && !['voltage', 'current'].includes(it.inputKind)) fail('器件输入类型无效');
            if (it.analysis != null) {
                var a = it.analysis;
                keys(a, ['version', 'symbol', 'value', 'prefix']);
                if (it.kind !== 'comp' || !['resistor', 'capacitor', 'transconductance-4t'].includes(it.type) || a.version !== 1 ||
                    !text(a.symbol, 64) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(a.symbol) || /^(s|j|e|pi|__proto__|constructor|prototype)$/.test(a.symbol) ||
                    !text(a.value, 100) || !['G', 'M', 'k', '', 'm', 'u', 'n', 'p', 'f'].includes(a.prefix)) fail('分析参数无效');
                var factor = { G: 1e9, M: 1e6, k: 1e3, '': 1, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 }[a.prefix];
                var numeric = Number(a.value) * factor;
                if (a.value !== '' && (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(a.value) || !finite(numeric) ||
                    (it.type === 'resistor' && numeric <= 0) || (it.type === 'capacitor' && numeric < 0))) fail('分析数值无效');
            }
        });
        if (vertices > 20000) fail('图纸顶点上限为 20000');
        if (d.groups == null) d.groups = [];
        if (!Array.isArray(d.groups) || d.groups.length > 5000) fail('分组无效');
        d.groups.forEach(function (g) {
            keys(g, ['id', 'members']);
            if (!text(g.id, 128) || !g.id || ids.has(g.id) || groupIds.has(g.id) || !Array.isArray(g.members) || !g.members.length) fail('分组 ID 或成员无效');
            groupIds.add(g.id);
            g.members.forEach(function (id) { if (!ids.has(id) || grouped.has(id)) fail('分组引用缺失或重复'); grouped.add(id); });
        });
        return d;
    }
    function supported() { if (!root.location || !/^https?:$/.test(root.location.protocol)) fail('请在同源 HTTP(S) 页面中使用图纸互通'); }
    function validToken(token) { if (!/^[a-f0-9]{32}$/.test(token)) fail('图纸链接无效，请返回源页面重新打开'); return token; }
    function cleanup(storage, now) {
        var remove = [];
        for (var i = 0; i < storage.length; i++) {
            var k = storage.key(i);
            if (!k || k.indexOf(PREFIX) !== 0) continue;
            try { var r = JSON.parse(storage.getItem(k)); if (finite(r.expiresAt) && r.expiresAt <= now) remove.push(k); } catch (_) { /* 不清理无法确认过期的记录 */ }
        }
        remove.forEach(function (k) { storage.removeItem(k); });
    }
    function store(storage, token, record) {
        var s = JSON.stringify(record);
        if (bytes(s) > LIMIT) fail('图纸超过 2 MiB 上限');
        storage.setItem(PREFIX + validToken(token), s);
    }
    function create(source) {
        supported();
        var s = root.localStorage, now = Date.now(), random = new Uint8Array(16);
        cleanup(s, now); root.crypto.getRandomValues(random);
        var token = Array.from(random, function (n) { return n.toString(16).padStart(2, '0'); }).join('');
        store(s, token, { version: 1, status: 'pending', createdAt: now, expiresAt: now + TTL, source: source, title: '', context: {}, doc: null, error: '' });
        return token;
    }
    function read(token) {
        supported();
        var s = root.localStorage.getItem(PREFIX + validToken(token));
        if (!s) fail('图纸链接已失效，请返回源页面重新打开');
        if (bytes(s) > LIMIT) fail('图纸记录过大');
        var r = JSON.parse(s); safe(r, 0);
        keys(r, ['version', 'status', 'createdAt', 'expiresAt', 'source', 'title', 'doc', 'context', 'error', 'receivedAt']);
        if (r.receivedAt != null && !finite(r.receivedAt)) fail('接收标记无效');
        if (r.version !== 1 || !['pending', 'ready', 'error'].includes(r.status) || !finite(r.createdAt) || !finite(r.expiresAt) ||
            r.expiresAt <= Date.now() || r.expiresAt - r.createdAt > TTL || !text(r.source, 200) || !text(r.title, 300) || !text(r.error, 2000)) fail('图纸记录无效或已过期，请重新打开');
        if (r.status === 'ready') r.doc = validateDoc(r.doc);
        return r;
    }
    function publish(token, pack, error) {
        var r = read(token);
        if (r.status !== 'pending') fail('图纸请求已经完成');
        if (error) { r.status = 'error'; r.error = String(error.message || error).slice(0, 2000); }
        else {
            if (!pack || !text(pack.title, 300)) fail('缺少图纸标题');
            r.doc = validateDoc(pack.doc); r.title = pack.title; r.context = clone(pack.context || {}); r.status = 'ready';
        }
        store(root.localStorage, token, r);
    }
    function wait(token, timeout) {
        return new Promise(function (resolve, reject) {
            supported(); validToken(token); cleanup(root.localStorage, Date.now());
            var started = Date.now(), timer;
            function end(err, value) { clearInterval(timer); root.removeEventListener('storage', poll); if (err) reject(err); else resolve(value); }
            function poll() {
                try {
                    var r = read(token);
                    if (r.status === 'error') return end(new Error(r.error || '源页面取图失败'));
                    if (r.status === 'ready') return end(null, r);
                    if (Date.now() - started >= (timeout == null ? WAIT : timeout)) end(new Error('取图等待超时，请返回源页面重新打开'));
                } catch (e) { end(e); }
            }
            timer = setInterval(poll, 150); root.addEventListener('storage', poll); poll();
        });
    }
    function saveSession(token, record) { root.sessionStorage.setItem(SESSION + validToken(token), JSON.stringify(clone(record))); }
    function loadSession(token) {
        var s = root.sessionStorage.getItem(SESSION + validToken(token));
        if (!s) return null;
        if (bytes(s) > LIMIT) fail('副本会话过大');
        var r = clone(JSON.parse(s));
        if (r.version !== 1 || !text(r.title, 300) || !text(r.source, 200)) fail('副本会话无效');
        r.doc = validateDoc(r.doc); return r;
    }
    function consume(token) { root.localStorage.removeItem(PREFIX + validToken(token)); }
    function acknowledge(token) {
        var r = read(token); r.receivedAt = Date.now(); store(root.localStorage, token, r);
    }
    function receipt(token, show) {
        var timer, done = false;
        function finish(message) {
            if (done) return;
            done = true; clearTimeout(timer); root.removeEventListener('storage', check); show(message);
        }
        function check() {
            try {
                var raw = root.localStorage.getItem(PREFIX + token);
                if (!raw || JSON.parse(raw).receivedAt != null) finish('编辑器已接收独立副本，不回写本页。');
            } catch (_) { finish('无法确认新页接收状态，请检查编辑器或重新打开。'); }
        }
        timer = setTimeout(function () { finish('新页尚未响应，请检查是否已打开，或重新点击链接。'); }, WAIT);
        root.addEventListener('storage', check); check();
    }
    /* 保留原生新标签链接的用户激活；快照完成不依赖 opener。 */
    function bind(anchor, source, getter, status) {
        anchor.target = '_blank'; anchor.rel = 'noopener'; anchor.href = '../circuit-sketch/index.html';
        anchor.title = '新标签页打开当前图纸副本，不回写本页';
        var serial = 0;
        function show(s, seq) { if (status && seq === serial) status.textContent = s; }
        function activate(e) {
            if (e.type === 'auxclick' && e.button !== 1) return;
            if (anchor.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
            var seq = ++serial, token;
            try {
                token = create(source);
                anchor.href = '../circuit-sketch/index.html#handoff=' + token;
                show('正在准备当前图纸副本…', seq);
                Promise.resolve(getter()).then(function (pack) {
                    publish(token, pack); show('副本已就绪，等待编辑器接收…', seq);
                    receipt(token, function (message) { show(message, seq); });
                }).catch(function (err) {
                    try { publish(token, null, err); } catch (_) { /* 目标页有超时保护 */ }
                    show('取图失败：' + err.message, seq);
                });
            } catch (err) {
                if (!token) e.preventDefault();
                else try { publish(token, null, err); } catch (_) { /* 存储失败 */ }
                show('无法打开图纸：' + err.message, seq);
            }
        }
        anchor.addEventListener('click', activate);
        anchor.addEventListener('auxclick', activate);
        anchor.addEventListener('contextmenu', activate);
    }
    function toolbar(container, source, getter) {
        var bar = root.document.createElement('div'); bar.className = 'circuit-handoff-bar';
        var status = root.document.createElement('span'); status.className = 'circuit-handoff-status'; status.setAttribute('role', 'status');
        var a = root.document.createElement('a'); a.textContent = '在电路编辑器中编辑此图';
        bar.appendChild(status); bar.appendChild(a); container.parentNode.insertBefore(bar, container);
        bind(a, source, getter, status);
        return { anchor: a, status: status, set: function (enabled, message) { a.setAttribute('aria-disabled', String(!enabled)); status.textContent = message || ''; } };
    }
    var api = { validateDoc: validateDoc, clone: clone, create: create, read: read, publish: publish, wait: wait,
        cleanup: cleanup, saveSession: saveSession, loadSession: loadSession, consume: consume, acknowledge: acknowledge, bind: bind, toolbar: toolbar,
        PREFIX: PREFIX, SESSION: SESSION, TTL: TTL, WAIT: WAIT, LIMIT: LIMIT };
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CircuitHandoff = api;
})(typeof window !== 'undefined' ? window : globalThis);

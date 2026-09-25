/* Node 测试边界：真实产品脚本、内存存储及可控时钟；不模拟浏览器排版。 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const base = path.resolve(__dirname, '../..');
const plain = x => JSON.parse(JSON.stringify(x));
const code = file => fs.readFileSync(path.join(base, file), 'utf8');
class Storage {
    constructor() { this.data = new Map(); this.writes = []; this.failRead = false; this.failWrite = false; }
    get length() { return this.data.size; }
    key(i) { return [...this.data.keys()][i]; }
    getItem(k) { if (this.failRead) throw Error('存储读取受限'); return this.data.get(k) ?? null; }
    setItem(k, v) { if (this.failWrite) throw Error('存储配额不足'); this.data.set(k, String(v)); this.writes.push(k); }
    removeItem(k) { if (this.failWrite) throw Error('存储不可写'); this.data.delete(k); }
}
class Element {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {}; this.style = {};
        this.className = ''; this.value = ''; this.textContent = ''; this.hidden = false; this.innerHTML = ''; this.clientWidth = 1000; this.clientHeight = 600;
        this.classList = { contains: c => this.className.split(' ').includes(c), add: (...cs) => { this.className += ' ' + cs.join(' '); },
            remove: (...cs) => { this.className = this.className.split(' ').filter(c => !cs.includes(c)).join(' '); },
            toggle: (c, on) => { this.classList[on ? 'add' : 'remove'](c); } };
    }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] ?? null; }
    removeAttribute(k) { delete this.attributes[k]; }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    append(...cs) { cs.forEach(c => this.appendChild(c)); }
    removeChild(c) { this.children = this.children.filter(el => el !== c); c.parentNode = null; }
    insertBefore(c, ref) { c.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? 0 : i, 0, c); return c; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
    fire(type, extra = {}) { const event = { type, target: this, preventDefault() { this.prevented = this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...extra }; for (const f of (this.listeners[type] || []).slice()) { f.call(this, event); if (event.stopped) break; } return event; }
    click() { return this.fire('click'); }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    get valueAsNumber() { return this.value.trim() === '' ? NaN : Number(this.value); }
    querySelectorAll() { return []; }
    querySelector() { return null; }
    closest() { return null; }
    contains(el) { return el === this || this.children.some(c => c.contains(el)); }
    focus() {}
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }; }
    getContext() { return null; }
    all() { return [this, ...this.children.flatMap(c => c.all())]; }
}
function environment(extra = {}) {
    let now = 1000000, sequence = 0;
    const timers = new Map(), events = new Element(), body = new Element('body'), elements = new Map();
    const get = id => { if (!elements.has(id)) { const el = new Element(); el.id = id; body.appendChild(el); elements.set(id, el); } return elements.get(id); };
    const s = { console, TextEncoder, URLSearchParams, Uint8Array, Blob, structuredClone,
        location: { protocol: 'https:', origin: 'https://example.test', hash: '', search: '' },
        crypto: require('node:crypto').webcrypto, localStorage: new Storage(), sessionStorage: new Storage(),
        Date: class extends Date { static now() { return now; } },
        setTimeout: (fn, ms) => { timers.set(++sequence, { fn, ms, repeat: false }); return sequence; },
        setInterval: (fn, ms) => { timers.set(++sequence, { fn, ms, repeat: true }); return sequence; },
        clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
        requestAnimationFrame: () => 0, cancelAnimationFrame() {},
        addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
        document: { body, documentElement: new Element('html'), getElementById: get, createElement: t => new Element(t), createElementNS: (ns, t) => new Element(t),
            querySelector: sel => get(sel), querySelectorAll: () => [], addEventListener: events.addEventListener.bind(events) },
        alert() {}, confirm: () => true, getComputedStyle: () => ({ getPropertyValue: () => '#111' }), ...extra };
    s.window = s; s.globalThis = s; s.parent = { postMessage() {} };
    vm.createContext(s);
    function run(file, source) { return vm.runInContext(source === undefined ? code(file) : source, s, { filename: file }); }
    for (const file of ['razavi/razavi-symbols.js', 'razavi/render.js', 'razavi/figure-utils.js', 'js/circuit-handoff.js']) run(file);
    return { s, run, get, events, timers, tick(ms) {
        now += ms;
        for (const [id, t] of [...timers]) if (t.ms <= ms && timers.has(id)) { if (!t.repeat) timers.delete(id); t.fn(); }
    } };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function editor(options = {}) {
    const h = environment(options.storage || {}), s = h.s, messages = [], alerts = [];
    s.innerWidth = options.width || 1440;
    s.Theme = { get: () => 'light', toggle() {}, set() {} };
    s.MutationObserver = class { observe() {} }; s.ResizeObserver = class { observe() {} };
    s.CircuitTextEditor = { create: () => ({ reposition() {}, notify() {}, focus() {}, cancel() {}, open() {}, start() {} }) };
    s.parent.postMessage = (d, origin) => messages.push({ d, origin }); s.alert = m => alerts.push(m);
    s.FileReader = class { readAsText(file) { this.result = file.content; this.onload(); } };
    const dialog = h.get('ckParameterDialog'), children = new Map();
    dialog.querySelector = selector => { if (!children.has(selector)) { const e = new Element(selector === 'form' ? 'form' : 'input'); e.select = () => {}; children.set(selector, e); } return children.get(selector); };
    dialog.close = () => {}; dialog.showModal = () => {};
    const menu = h.get('ckMenubar'), actions = {};
    for (const key of ['palette', 'templates', 'props', 'reset']) {
        const b = new Element('button'); b.setAttribute('data-action', 'window-' + key);
        b.setAttribute('role', key === 'reset' ? 'menuitem' : 'menuitemcheckbox');
        b.closest = sel => sel === 'button' ? b : null; b.hasAttribute = name => name in b.attributes;
        menu.appendChild(b); actions[key] = b;
    }
    menu.querySelectorAll = selector => selector === '[data-action]' ? Object.values(actions) : [];
    const panelNodes = {};
    for (const [key, id] of Object.entries({ palette: 'ckPalette', templates: 'ckTemplates', props: 'ckProps' })) {
        const p = h.get(id), hd = h.get(id + 'Hd'), close = new Element('button');
        close.setAttribute('data-close-panel', key); hd.appendChild(close); p.appendChild(hd);
        p.querySelector = selector => selector === '[data-close-panel]' ? close : selector === '.ck-panel-hd' ? hd : null;
        hd.hasPointerCapture = () => false; hd.setPointerCapture = () => {}; hd.releasePointerCapture = () => {};
        p.offsetWidth = 210; p.offsetHeight = 200; panelNodes[key] = { panel: p, hd, close };
    }
    const templateButtons = ['diffpair', 'curmirror', 'ota5', 'telescopic', 'folded'].map(key => {
        const b = new Element('button'); b.setAttribute('data-tpl', key); panelNodes.templates.panel.appendChild(b); return b;
    });
    s.document.querySelectorAll = selector => selector === '.ck-tpl-list [data-tpl]' ? templateButtons : [];
    s.document.activeElement = s.document.body;
    h.get('ckCanvas').focus = () => { s.document.activeElement = h.get('ckCanvas'); };
    s.document.elementFromPoint = () => h.get('ckCanvas');
    h.get('ckCanvas').createSVGPoint = () => ({ x: 0, y: 0, matrixTransform(m) { return { x: this.x * m.a + m.e, y: this.y * m.d + m.f }; } });
    h.get('world').getScreenCTM = () => ({ a: s.viewTransform.scale, b: 0, d: s.viewTransform.scale, e: s.viewTransform.x, f: s.viewTransform.y, inverse: () => ({ a: 1 / s.viewTransform.scale, d: 1 / s.viewTransform.scale, e: -s.viewTransform.x / s.viewTransform.scale, f: -s.viewTransform.y / s.viewTransform.scale }) });
    for (const file of ['js/circuit-connectivity.js', 'tools/transfer-function/canvas-netlist.js', 'tools/circuit-sketch/parameter-editor.js', 'razavi/figures.js']) h.run(file);
    const mainKey = 'ee-circuit-sketch-v2';
    const document0 = { items: [{ kind: 'comp', id: 'i7', type: 'resistor', x: 55.5, y: 79.25, rot: 3, fh: true, text: 'R1' }, { kind: 'wire', id: 'i12', pts: [{ x: 10, y: 20 }, { x: 40, y: 20 }] }], groups: [] };
    if (!options.storage) s.localStorage.setItem(mainKey, JSON.stringify({ items: [{ kind: 'label', id: 'main', x: 0, y: 0, text: '原主存档' }], groups: [] }));
    if (options.copy !== false) {
        const token = options.token || s.CircuitHandoff.create('测试来源');
        if (!options.token && !options.pending) s.CircuitHandoff.publish(token, { doc: options.doc || document0, title: '当前测试图', context: {} });
        s.location.hash = '#handoff=' + token; h.token = token;
    }
    s.location.search = options.search || '';
    const before = s.localStorage.getItem(mainKey); s.localStorage.writes = [];
    if (options.sessionFail) s.sessionStorage.failWrite = true;
    if (options.setup) options.setup(h);
    h.run('tools/circuit-sketch/script.js');
    return { ...h, messages, alerts, before, dialog, children, actions, panelNodes, templateButtons,
        import(doc) { const el = h.get('impFile'); el.files = [{ content: JSON.stringify(doc) }]; el.fire('change'); } };
}
module.exports = { environment, editor, Element, Storage, code, plain, settle, base };

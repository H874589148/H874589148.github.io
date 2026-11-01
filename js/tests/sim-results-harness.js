/* 界面/Worker 生命周期测试桩，不用于宣称浏览器排版或 OCR 准确率。 */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..'), html = fs.readFileSync(path.join(root, 'tools/sim-log/index.html'), 'utf8');
class Element {
    constructor(tag, document) {
        this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.events = {}; this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this._text = '';
        const classes = new Set(); this.classList = { toggle: (k, v) => { if (v) classes.add(k); else classes.delete(k); }, contains: k => classes.has(k) };
    }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children.forEach(c => { c.parentElement = null; }); this.children = []; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    replaceChildren(...children) { this.textContent = ''; children.forEach(c => this.appendChild(c)); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.parentElement = null; }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k]; }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    removeEventListener(type, fn) { this.events[type] = (this.events[type] || []).filter(f => f !== fn); }
    fire(type, data = {}) {
        const event = { target: this, key: '', preventDefault() { this.prevented = true; }, ...data };
        for (const fn of this.events[type] || []) fn(event); return event;
    }
    focus() { this.ownerDocument.activeElement = this; }
    select() { this.focus(); this.selected = true; }
    setSelectionRange() {}
    scrollIntoView() {}
    setPointerCapture() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
    closest(selector) {
        const matches = selector.includes('[data-row]') ? this.dataset.row || this.dataset.rowHeader || this.dataset.colHeader : selector === 'td' && this.tagName === 'TD';
        return matches ? this : this.parentElement ? this.parentElement.closest(selector) : null;
    }
    click() { this.ownerDocument.downloads.push(this.download); this.fire('click'); }
}
function environment(options = {}) {
    const document = new Element('document'); document.ownerDocument = document; document.downloads = []; const nodes = {};
    document.createElement = tag => {
        const element = new Element(tag, document);
        if (tag === 'canvas') {
            element.width = 100; element.height = 100; element.draws = [];
            element.getContext = () => ({ drawImage() {}, clearRect() {}, strokeRect(...args) { element.draws.push(args); }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, putImageData() {}, getImageData: () => ({ data: new Uint8ClampedArray(element.width * element.height * 4).fill(255) }) });
            element.toBlob = cb => cb(new Blob(['fixture'], { type: 'image/png' }));
        }
        return element;
    };
    document.createTextNode = text => { const el = new Element('text', document); el.textContent = text; return el; };
    document.body = document.createElement('body'); document.head = document.createElement('head'); document.documentElement = document.createElement('html');
    document.getElementById = id => nodes[id];
    for (const match of html.matchAll(/<(input|select|textarea|button|div|p|section|table|canvas|fieldset|span|label)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const [, tag, attrs, id] = match, el = document.createElement(tag); el.id = id; el.value = (attrs.match(/\bvalue="([^"]*)"/) || [])[1] || ''; el.checked = /\bchecked\b/.test(attrs); el.disabled = /\bdisabled\b/.test(attrs); el.hidden = /\bhidden\b/.test(attrs);
        if (tag === 'select') {
            const inside = html.slice(match.index + match[0].length).split('</select>')[0];
            const values = [...inside.matchAll(/<option value="([^"]*)"([^>]*)>/g)]; const value = values.find(m => /selected/.test(m[2])) || values[0]; el.value = value ? value[1] : '';
        }
        nodes[id] = el;
    }
    document.execCommand = () => options.exec !== false;
    const stores = new Map(Object.entries(options.stores || {})), timers = new Map(), workers = [], events = {}, writes = []; let tid = 0;
    const win = {
        document, Blob, URL: class extends URL { static createObjectURL() { return 'blob:test'; } static revokeObjectURL() {} }, ImageData: class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } },
        location: { href: 'https://local.test/tools/sim-log/index.html' },
        navigator: { clipboard: { writeText: async text => { writes.push(text); if (options.copyFails) throw Error('拒绝'); }, write: async data => { writes.push(data); if (options.copyFails) throw Error('拒绝'); } } },
        ClipboardItem: class { constructor(data) { this.data = data; } },
        localStorage: { getItem(k) { if (options.storageThrows) throw Error('配额'); return stores.get(k) || null; }, setItem(k, v) { if (options.storageThrows) throw Error('配额'); stores.set(k, v); } },
        setTimeout: (fn, delay) => { timers.set(++tid, { fn, delay }); return tid; }, clearTimeout: id => timers.delete(id),
        getSelection: () => ({ rangeCount: 0, removeAllRanges() {}, addRange() {} }),
        getComputedStyle: () => ({ getPropertyValue: () => '#336699' }),
        confirm: () => options.confirm !== false, createImageBitmap: async file => { if (file.broken) throw Error('损坏图片'); return { width: file.width || 100, height: file.height || 100, close() { this.closed = true; } }; },
        addEventListener: (type, fn) => { (events[type] ||= []).push(fn); },
        Worker: class {
            constructor(url) { this.url = url; workers.push(this); }
            postMessage(data) { this.payload = data; }
            terminate() { this.terminated = true; }
            emit(data) { if (this.onmessage) this.onmessage({ data }); }
        }
    };
    win.window = win;
    const get = id => nodes[id.startsWith('sim-') ? id : 'sr-' + id];
    return { win, document, nodes, get, stores, timers, workers, writes, events, options,
        click: id => get(id).fire('click'),
        cell: (r, c) => get('table').children[1].children[r].children[c + 1],
        tableClick: (target, extra = {}) => get('table').fire('click', { target, ...extra }),
        key: (key, extra = {}) => get('table').fire('keydown', { key, ...extra }) };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
module.exports = { Element, environment, settle, html, root };

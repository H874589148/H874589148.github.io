/* 执行真实挂件代码与事件；DOM／尺寸替身不证明浏览器排版、真实鼠标命中或触屏体验。 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { Element, code } = require('./handoff-harness');

function widget(options = {}, screen = {}) {
    let now = 0, sequence = 0, s;
    const timers = new Map(), frames = new Map(), drawings = [], audios = [];
    const coarse = !!screen.coarse;
    class Node extends Element {
        constructor(tag) { super(tag); this.tabIndex = -1; }
        fire(type, extra = {}) {
            const e = { type, target: this, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true,
                clientX: 100, clientY: 100, preventDefault() { this.defaultPrevented = true; },
                stopPropagation() { this.stopped = true; }, ...extra };
            let node = this;
            const bubbles = !['pointerenter', 'pointerleave', 'resize', 'blur'].includes(type);
            do {
                e.currentTarget = node;
                for (const fn of [...(node.listeners[type] || [])]) fn(e);
                node = bubbles && !e.stopped ? node.parentNode : null;
            } while (node);
            return e;
        }
        focus() {
            const old = doc.activeElement;
            if (old === this) return;
            doc.activeElement = this;
            if (old) old.fire('focusout', { relatedTarget: this });
            this.fire('focusin', { relatedTarget: old });
        }
        setPointerCapture(id) { this.capture = id; }
        releasePointerCapture(id) {
            if (this.capture !== id) return;
            this.capture = null;
            this.fire('lostpointercapture', { pointerId: id });
        }
        getContext() { return { clearRect() {}, drawImage: (...args) => drawings.push(args) }; }
        toolbarWidth() {
            const count = this.children[0].children.filter(n => n.classList.contains('ym-btn')).length;
            return count * ((coarse ? 44 : 30) + 4) + 11;
        }
        get offsetWidth() {
            if (this.style.width) return parseFloat(this.style.width);
            if (this.classList.contains('ym-toolbar')) return Math.min(this.toolbarWidth(), parseFloat(this.style.maxWidth) || 1000);
            if (this.classList.contains('ym-bubble')) {
                const text = this.children.find(n => n.classList.contains('ym-bubble-text'))?.textContent || '';
                return Math.min(text.length * 7 + (coarse ? 62 : 46), parseFloat(this.style.maxWidth) || 220);
            }
            return 0;
        }
        get offsetHeight() {
            if (this.style.height) return parseFloat(this.style.height);
            if (this.classList.contains('ym-toolbar')) {
                const scrollbar = this.offsetWidth < this.toolbarWidth() ? 8 : 0;
                return Math.min((coarse ? 54 : 40) + scrollbar, parseFloat(this.style.maxHeight) || 1000);
            }
            if (this.classList.contains('ym-bubble')) {
                const text = this.children.find(n => n.classList.contains('ym-bubble-text'))?.textContent || '';
                const lineWidth = Math.max(7, this.offsetWidth - (coarse ? 62 : 46));
                return Math.min(Math.max(coarse ? 48 : 42, Math.ceil(text.length * 7 / lineWidth) * 20 + 22), parseFloat(this.style.maxHeight) || 1000);
            }
            return 0;
        }
        getBoundingClientRect() {
            const width = this.offsetWidth, height = this.offsetHeight;
            let left = parseFloat(this.style.left) || 0, top = parseFloat(this.style.top) || 0;
            if (this.classList.contains('yuexinmiao-widget')) {
                if (!this.style.left) left = s.innerWidth - width - parseFloat(this.style.right);
                if (!this.style.top) top = s.innerHeight - height - parseFloat(this.style.bottom);
            } else if (this.parentNode && this.parentNode !== doc) {
                const parent = this.parentNode.getBoundingClientRect();
                left += parent.left; top += parent.top;
            }
            return { left, top, width, height, right: left + width, bottom: top + height };
        }
    }
    const doc = new Node('document'), body = new Node('body'), mount = new Node('div'), events = new Node('window');
    doc.body = body; doc.appendChild(body); body.appendChild(mount); doc.activeElement = body;
    doc.createElement = tag => new Node(tag);
    doc.querySelector = () => mount;
    s = { console, document: doc, innerWidth: screen.width || 1280, innerHeight: screen.height || 800,
        performance: { now: () => now }, Math: Object.create(Math),
        setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout: id => timers.delete(id),
        requestAnimationFrame: fn => { const id = ++sequence; frames.set(id, fn); return id; },
        cancelAnimationFrame: id => frames.delete(id),
        addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
        Audio: class extends Node {
            constructor() {
                super('audio'); audios.push(this);
                this.paused = true; this.ended = false; this.error = null; this.readyState = 0;
                this.currentTime = 0; this.requests = []; this.sources = []; this.loadCalls = 0; this.pauseCalls = 0;
            }
            get src() { return this.getAttribute('src') || ''; }
            set src(value) { this.sources.push(value); this.setAttribute('src', value); }
            load() {
                this.loadCalls++; this.currentTime = 0; this.paused = true; this.ended = false;
                this.error = null; this.readyState = 0;
            }
            play() {
                if (this.throwOnPlay) throw this.throwOnPlay;
                this.paused = false;
                const request = {};
                const promise = new Promise((resolve, reject) => { request.resolve = resolve; request.reject = reject; });
                this.requests.push(request);
                return promise;
            }
            pause() { this.pauseCalls++; this.paused = true; this.fire('pause'); }
            start() {
                this.readyState = 4; this.paused = false; this.ended = false;
                this.fire('playing'); this.requests.at(-1).resolve();
            }
            finish() { this.ended = true; this.paused = true; this.fire('pause'); this.fire('ended'); }
        },
        Image: class {
            constructor() { this.complete = false; }
            load() { this.complete = true; if (this.onload) this.onload(); }
        }
    };
    s.Math.random = () => 0;
    s.window = s;
    vm.createContext(s);
    vm.runInContext(code('js/yuexinmiao-widget.js'), s);
    const w = s.YuexinmiaoWidget.init({ autoIdle: false, speak: false, messages: ['甲', '乙', '丙'], ...options });
    function advance(ms) {
        const end = now + ms;
        for (;;) {
            const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            const [id, timer] = next;
            now = timer.at; timers.delete(id); timer.fn();
        }
        now = end;
    }
    function frame(ms = 125) {
        now += ms;
        const callbacks = [...frames.values()]; frames.clear();
        callbacks.forEach(fn => fn(now));
    }
    return { w, s, doc, body, mount, events, timers, frames, drawings, audios, advance, frame, Node };
}
function rect(node) { return node.getBoundingClientRect(); }
function separated(a, b) { return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top; }
function inside(r, width, height) {
    assert.ok(r.left >= 8 && r.top >= 8 && r.right <= width - 8 && r.bottom <= height - 8, JSON.stringify(r));
}
function drag(h, type, x, y, extra = {}) { return h.w.stage.fire(type, { clientX: x, clientY: y, ...extra }); }

test('生成六个功能入口和隐藏按钮，默认收起且不占 Tab 顺序', () => {
    const { w } = widget();
    assert.equal(w.controls.length, 7);
    assert.deepEqual(Array.from(w.controls, n => n.title), ['换姿势和对话', '只换对话', '小游戏合集', '识谱练习', '24点计算器', '暂无可播放音乐', '隐藏看板娘']);
    assert.equal(w.root.all().some(n => n.tagName === 'SELECT'), false);
    assert.equal(w.toolbar.inert, true);
    assert.equal(w.toolbar.getAttribute('aria-hidden'), 'true');
    assert.equal(w.stage.tabIndex, 0);
    for (const node of w.controls) {
        assert.equal(node.tabIndex, -1);
        assert.equal(node.title, node.getAttribute('aria-label'));
    }
    assert.equal(w.controls[2].tagName, 'A');
    assert.equal(w.controls[3].href, 'games/sight-reading/index.html');
    assert.equal(w.controls[4].href, 'games/24point/index.html');
    assert.match(w.controls[4].innerHTML, />24</);
});

test('随机姿势和台词连续不重复，26种非 idle 姿势均可到达且保持循环', () => {
    const { w, s } = widget();
    for (let i = 0; i < 60; i++) {
        const previous = w.state?.name, text = w.bubbleText.textContent;
        w.randomBtn.click();
        assert.notEqual(w.state.name, previous);
        assert.notEqual(w.bubbleText.textContent, text);
        assert.equal(w.loop, true);
    }
    const states = new Set();
    for (let i = 0; i < 26; i++) {
        w.play('idle');
        s.Math.random = () => (i + 0.1) / 26;
        w.randomAction(); states.add(w.state.name);
    }
    assert.equal(states.size, 26);
    assert.equal(states.has('idle'), false);
});

test('只换对话不触碰动画类型、帧进度、累积时长、循环和完成回调', () => {
    const { w } = widget();
    const done = () => {};
    w.play('dancing', { loop: true, then: done }); w.frame = 2; w.acc = 31;
    const before = [w.state, w.frame, w.acc, w.loop, w._then];
    w.talkBtn.click();
    assert.deepEqual([w.state, w.frame, w.acc, w.loop, w._then], before);
    w._update(125);
    assert.equal(w.frame, 3);
    w.play('waving', { loop: false, then: done }); w.frame = 1;
    w.talkBtn.click();
    assert.equal(w.frame, 1); assert.equal(w.loop, false); assert.equal(w._then, done);
});

test('单条和重复文本台词安全降级，空或无效列表不显示空气泡', () => {
    for (const messages of [['唯一一句'], ['唯一一句', '唯一一句']]) {
        const { w } = widget({ messages });
        w.randomTalk(); w.randomTalk();
        assert.equal(w.bubbleText.textContent, '唯一一句');
        assert.equal(w.bubble.classList.contains('ym-show'), true);
    }
    for (const messages of [[], ['', ' ', null, 42]]) {
        const { w } = widget({ messages });
        w.randomAction(); w.randomTalk();
        assert.equal(w.bubble.classList.contains('ym-show'), false);
        assert.equal(w.bubbleText.textContent, '');
        assert.equal(w._bubbleTimer, null);
    }
    const { w } = widget({ messages: ['甲', '甲', '乙'] });
    w.say('甲'); w.hideBubble(); w.randomTalk();
    assert.equal(w.bubbleText.textContent, '乙');
});

test('手动台词重置3200ms气泡时限并取消即将触发的自动冒泡', () => {
    const h = widget({ speak: true }), { w, timers } = h;
    w.img.load(); w.play('idle');
    h.advance(19999);
    const oldTimer = w._speakTimer;
    w.randomTalk(); const manual = w.bubbleText.textContent;
    assert.equal(timers.has(oldTimer), false);
    h.advance(3199);
    assert.equal(w.bubbleText.textContent, manual);
    assert.equal(w.bubble.classList.contains('ym-show'), true);
    h.advance(1);
    assert.equal(w.bubble.classList.contains('ym-show'), false);
    h.advance(16799);
    assert.equal(w.bubbleText.textContent, manual);
    h.advance(1);
    assert.notEqual(w.bubbleText.textContent, manual);
    w.randomTalk(); h.advance(3000); w.randomTalk(); h.advance(3000);
    assert.equal(w.bubble.classList.contains('ym-show'), true);
    h.advance(200); assert.equal(w.bubble.classList.contains('ym-show'), false);
});

test('菜单和手动气泡阻止新的自动动作，手动姿势不被待机调度打断', () => {
    const h = widget({ autoIdle: true, speak: true }), { w } = h;
    w.img.load(); w.play('idle'); w._setMenu(true);
    h.advance(20000);
    assert.equal(w.state.name, 'idle'); assert.equal(w.bubbleText.textContent, '');
    w._setMenu(false); w.say('手动常驻'); h.advance(30000);
    assert.equal(w.state.name, 'idle'); assert.equal(w.bubbleText.textContent, '手动常驻');
    w.hideBubble(); h.advance(4000);
    assert.equal(w.state.name, 'waving');
    w.randomAction(); const selected = w.state;
    h.advance(60000); assert.equal(w.state, selected);
});

test('悬停跨区保持打开，离开200ms收起，键盘焦点阻止意外关闭', () => {
    const h = widget(), { w } = h;
    w.root.fire('pointerenter');
    assert.equal(w.menuOpen, true); assert.equal(w.toolbar.inert, false);
    assert.ok(w.controls.every(n => n.tabIndex === 0));
    w.root.fire('pointerleave'); h.advance(150); w.root.fire('pointerenter'); h.advance(100);
    assert.equal(w.menuOpen, true);
    w.root.fire('pointerleave'); h.advance(199); assert.equal(w.menuOpen, true);
    h.advance(1); assert.equal(w.menuOpen, false);
    w.stage.focus(); assert.equal(w.menuOpen, true);
    w.talkBtn.focus(); w.root.fire('pointerleave'); h.advance(201);
    assert.equal(w.menuOpen, true);
    h.body.focus(); h.advance(200);
    assert.equal(w.menuOpen, false); assert.ok(w.controls.every(n => n.tabIndex === -1));
});

test('Escape 收起并返回角色焦点而不立即重开，键盘单次激活不重复执行', () => {
    const h = widget(), { w } = h;
    w.stage.focus(); w.randomBtn.focus();
    w.randomBtn.fire('keydown', { key: 'Escape' });
    assert.equal(w.menuOpen, false); assert.equal(h.doc.activeElement, w.stage);
    w.stage.fire('keydown', { key: 'Enter' }); const pose = w.state, text = w.bubbleText.textContent;
    w.stage.fire('keydown', { key: 'Enter', repeat: true });
    assert.equal(w.state, pose); assert.equal(w.bubbleText.textContent, text);
    const e = w.stage.fire('keydown', { key: ' ' });
    assert.equal(e.defaultPrevented, true); assert.notEqual(w.state, pose);
});

test('触屏通过更多按钮切换菜单，聚焦不会抵消展开，点击外部收起', () => {
    const h = widget({}, { coarse: true }), { w } = h;
    w.root.fire('pointerenter', { pointerType: 'touch' }); assert.equal(w.menuOpen, false);
    w.moreBtn.focus(); w.moreBtn.click();
    assert.equal(w.menuOpen, true); assert.equal(w._pinned, true);
    w.root.fire('pointerleave', { pointerType: 'touch' }); h.advance(1000);
    assert.equal(w.menuOpen, true);
    w.moreBtn.click(); assert.equal(w.menuOpen, false);
    w.moreBtn.click(); h.body.fire('pointerdown', { pointerType: 'touch' });
    assert.equal(w.menuOpen, false); assert.equal(w._pinned, false);
});

test('按钮和原生链接不触发角色拖拽或额外换姿势，支持修饰键导航', () => {
    const h = widget(), { w } = h;
    w.randomAction(); const pose = w.state;
    w._setMenu(true); w.talkBtn.fire('pointerdown'); w.talkBtn.fire('pointerup'); w.talkBtn.click();
    assert.equal(w.state, pose); assert.equal(w._pointer, null);
    for (const link of w.controls.slice(2, 5)) {
        const e = link.fire('click', { ctrlKey: true });
        assert.equal(e.defaultPrevented, undefined);
        assert.equal(w.state, pose); assert.equal(link.getAttribute('target'), null);
    }
});

test('4px以内抖动不移动角色，累积移动超过阈值才拖拽，释放回到idle', () => {
    const h = widget(), { w } = h;
    const initial = rect(w.root);
    w.play('music', { loop: true });
    drag(h, 'pointerdown', 100, 100); drag(h, 'pointermove', 102, 102);
    assert.equal(w.dragging, false); assert.deepEqual(rect(w.root), initial);
    assert.equal(w.state.name, 'music');
    drag(h, 'pointerup', 102, 102);
    assert.notEqual(w.state.name, 'music'); assert.equal(w.loop, true);
    assert.deepEqual(rect(w.root), initial);
    drag(h, 'pointerdown', 100, 100);
    for (let x = 101; x <= 105; x++) drag(h, 'pointermove', x, 100);
    assert.equal(w.dragging, true); assert.equal(w.state.name, 'running-right');
    const text = w.bubbleText.textContent;
    drag(h, 'pointerup', 105, 100);
    assert.equal(w.state.name, 'idle'); assert.equal(w.dragging, false);
    assert.equal(w._pointer, null); assert.equal(w.bubbleText.textContent, text);
});

test('指针取消、捕获丢失及窗口失焦均不误点击，右键和第二根指针不干扰', () => {
    for (const end of ['pointercancel', 'lostpointercapture', 'blur']) {
        const h = widget(), { w } = h;
        w.play('dancing', { loop: true });
        drag(h, 'pointerdown', 100, 100, { button: 2 }); assert.equal(w._pointer, null);
        drag(h, 'pointerdown', 100, 100);
        drag(h, 'pointerdown', 100, 100, { pointerId: 2, isPrimary: false });
        drag(h, 'pointermove', 130, 100, { pointerId: 2 }); assert.equal(w.dragging, false);
        if (end === 'blur') h.events.fire('blur'); else drag(h, end, 100, 100);
        assert.equal(w.state.name, 'dancing'); assert.equal(w._pointer, null);
        drag(h, 'pointerdown', 100, 100); drag(h, 'pointermove', 110, 100);
        if (end === 'blur') h.events.fire('blur'); else drag(h, end, 110, 100);
        assert.equal(w.state.name, 'idle'); assert.equal(w.dragging, false);
        drag(h, 'pointerup', 110, 100); assert.equal(w.bubbleText.textContent, '');
    }
});

test('初始工具栏位于脚下，气泡距头顶6px且不随菜单展开上移', () => {
    for (const coarse of [false, true]) for (const width of [320, 1280]) {
        const { w } = widget({}, { width, height: 480, coarse });
        w.say('贴近角色的气泡', 3200);
        const character = rect(w.root), bubble = rect(w.bubble);
        assert.equal(480 - character.bottom, 80);
        assert.equal(character.top - bubble.bottom, 6);
        w._setMenu(true);
        assert.deepEqual(rect(w.root), character);
        assert.deepEqual(rect(w.bubble), bubble);
        assert.equal(rect(w.toolbar).top - character.bottom, 6);
        assert.equal(w.root.classList.contains('ym-toolbar-above'), false);
        assert.equal(rect(w.bridge).top, character.bottom);
        assert.equal(rect(w.bridge).height, 6);
        assert.equal(rect(w.bridge).bottom, rect(w.toolbar).top);
        inside(rect(w.toolbar), width, 480);
        assert.equal(rect(w.toolbar).height, coarse ? (width < 363 ? 62 : 54) : 40);
        assert.equal(w.toolbar.toolbarWidth(), coarse ? 347 : 249);
        w._setMenu(false);
        assert.deepEqual(rect(w.bubble), bubble);
    }
});

test('超窄触屏横排宽度受视口约束，保留横向滚动区域', () => {
    const { w } = widget({}, { width: 240, height: 480, coarse: true });
    w._setMenu(true);
    assert.equal(w.toolbar.style.maxWidth, '224px');
    inside(rect(w.toolbar), 240, 480);
    assert.equal(rect(w.toolbar).top - rect(w.root).bottom, 6);
});

test('定位算法：开关菜单及更换气泡不移动角色，底边翻转和短视口约束正确', () => {
    for (const coarse of [false, true]) for (const height of [200, 800]) {
        const h = widget({}, { width: 320, height, coarse }), { w } = h;
        for (const [x, y] of [[8, 8], [184, 8], [8, height - 147], [184, height - 147]]) {
            w._moveTo(x, y);
            const initial = rect(w.root);
            w._setMenu(true); w.say('测试较长的气泡，工具栏需要避让，角色不能跟随文本移动。', 3200);
            assert.deepEqual(rect(w.root), initial);
            inside(rect(w.toolbar), 320, height); inside(rect(w.bubble), 320, height);
            assert.ok(separated(rect(w.toolbar), rect(w.bubble)));
            const expectedAbove = initial.bottom + 6 + w.toolbar.offsetHeight > height - 8 && initial.top - w.toolbar.offsetHeight - 6 >= 8;
            assert.equal(w.root.classList.contains('ym-toolbar-above'), expectedAbove);
            w.hideBubble(); w._setMenu(false);
            assert.deepEqual(rect(w.root), initial);
        }
    }
});

test('窗口缩小后角色重新约束至可见区域，工具栏仍在视口内', () => {
    const h = widget(), { w, s } = h;
    w._moveTo(1100, 600); w._setMenu(true);
    s.innerWidth = 320; s.innerHeight = 480; h.events.fire('resize');
    inside(rect(w.root), 320, 480); inside(rect(w.toolbar), 320, 480);
});

test('隐藏清除定时器和动画，唤回后手动动作不被旧完成回调覆盖', () => {
    const h = widget({ speak: true, autoIdle: true }), { w } = h;
    w.img.load(); w.randomAction(); w._setMenu(true); w.hideBtn.focus(); w.hideBtn.click();
    assert.equal(w.hidden, true); assert.equal(w.root.inert, true); assert.equal(w.menuOpen, false);
    assert.equal(h.doc.activeElement, w.showBtn); assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
    h.advance(100000); assert.equal(h.timers.size, 0);
    w.showBtn.click();
    assert.equal(h.doc.activeElement, w.stage); assert.equal(w.state.name, 'waving');
    assert.equal(w.menuOpen, false); assert.equal(w.bubbleText.textContent, '回来啦～');
    w.randomAction(); const selected = w.state;
    w._update(1000); h.advance(1000);
    assert.equal(w.state, selected); assert.equal(w.loop, true); assert.equal(h.frames.size, 1);
});

test('异步图片加载不覆盖提前选择的姿势，隐藏时加载不启动动画', () => {
    const h = widget(), { w } = h;
    w.randomAction(); const pose = w.state;
    w.img.load(); assert.equal(w.state, pose); h.frame(); assert.equal(h.drawings.length, 1);
    const other = widget(); other.w.hide(); other.w.img.load();
    assert.equal(other.frames.size, 0); assert.equal(other.w._ready, true);
    other.w.show(); assert.equal(other.frames.size, 1);
});

test('销毁和反复初始化不泄漏监听、定时器、DOM或图片回调', () => {
    const h = widget({ autoIdle: true, speak: true }), { w, s } = h;
    w.img.load(); w.randomAction(); w._queueMenuClose();
    const oldImageCallback = w.img.onload;
    const count = () => [h.doc.listeners.pointerdown.length, h.events.listeners.resize.length, h.events.listeners.blur.length];
    assert.deepEqual(count(), [1, 1, 1]);
    s.YuexinmiaoWidget.init({ autoIdle: false, speak: false });
    assert.equal(w._destroyed, true); assert.equal(w.img.onload, null); assert.equal(w._listeners.length, 0);
    assert.equal(h.mount.children.length, 2); assert.deepEqual(count(), [1, 1, 1]);
    oldImageCallback(); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
    s.YuexinmiaoWidget.destroy();
    assert.equal(h.mount.children.length, 0); assert.deepEqual(count(), [0, 0, 0]);
    assert.equal(s.YuexinmiaoWidget.get(), null);
});

test('双击气泡切换和现有公开API兼容', () => {
    const { w, s } = widget();
    for (const name of ['init', 'get', 'play', 'say', 'show', 'hide', 'destroy']) assert.equal(typeof s.YuexinmiaoWidget[name], 'function');
    s.YuexinmiaoWidget.play('love', { loop: true }); s.YuexinmiaoWidget.say('外部问候');
    assert.equal(w.state.name, 'love'); assert.equal(w.bubbleText.textContent, '外部问候');
    w.stage.fire('dblclick'); assert.equal(w.bubble.classList.contains('ym-show'), false);
    w.stage.fire('dblclick'); assert.equal(w.bubble.classList.contains('ym-show'), true);
    w.bubbleClose.focus(); w.bubbleClose.click();
    assert.equal(w.bubbleClose.tabIndex, -1);
});

test('音乐按钮懒创建Audio，随机选曲并支持断点续播与自然换曲', () => {
    const tracks = [{ file: '甲.mp3', title: '甲' }, { file: '目录/乙 #%.MP3' }];
    const { w, audios } = widget({ music: { baseUrl: 'assets/music/', tracks } });
    assert.equal(w.controls[5], w.audioBtn);
    assert.equal(w.audioBtn.title, '随机播放音乐');
    assert.equal(audios.length, 0);
    w.audioBtn.click();
    assert.equal(audios.length, 1);
    const audio = audios[0];
    assert.equal(audio.preload, 'none');
    assert.equal(audio.sources[0], 'assets/music/' + tracks[0].file.split('/').map(encodeURIComponent).join('/'));
    assert.equal(w.audioBtn.title, '取消加载音乐：甲');
    audio.start();
    assert.equal(w._musicStatus, 'playing');
    assert.equal(w.audioBtn.title, '暂停音乐：甲');
    assert.equal(w.audioBtn.classList.contains('ym-audio-playing'), true);
    audio.currentTime = 37;
    w.audioBtn.click();
    assert.equal(w._musicStatus, 'paused');
    assert.equal(audio.paused, true); assert.equal(audio.currentTime, 37);
    assert.equal(audio.loadCalls, 1); assert.equal(audio.sources.length, 1);
    w.audioBtn.click();
    assert.equal(w._musicStatus, 'loading');
    assert.equal(audio.loadCalls, 1); assert.equal(audio.sources.length, 1);
    audio.start();
    assert.equal(audio.currentTime, 37); assert.equal(w._musicStatus, 'playing');
    audio.finish();
    assert.equal(w._musicTrack.file, tracks[1].file);
    assert.equal(w._musicTrack.title, '乙 #%');
    assert.equal(audio.sources[1], 'assets/music/' + tracks[1].file.split('/').map(encodeURIComponent).join('/'));
    assert.equal(audio.loadCalls, 2); assert.equal(w.audioBtn.title, '取消加载音乐：乙 #%');
    audio.start();
    assert.equal(w._musicStatus, 'playing');
});

test('单曲自然结束后重播同一首，加载中可取消且过期回调不劫持状态', async () => {
    const { w, audios } = widget({ music: { tracks: [{ file: '甲.mp3', title: '甲' }] } });
    w.audioBtn.click(); const audio = audios[0];
    audio.start(); audio.finish();
    assert.equal(w._musicTrack.file, '甲.mp3');
    assert.equal(audio.sources[0], audio.sources[1]);
    assert.equal(audio.loadCalls, 2); assert.equal(audio.readyState, 0);

    const other = widget({ music: { tracks: [{ file: '甲.mp3' }, { file: '乙.mp3' }] } }), ow = other.w;
    ow.audioBtn.click();
    const oa = other.audios[0];
    ow.audioBtn.click();
    assert.equal(ow._musicStatus, 'paused');
    ow.audioBtn.click();
    assert.equal(ow._musicStatus, 'loading');
    oa.requests[0].reject(new Error('旧请求失败'));
    await Promise.resolve();
    assert.equal(ow._musicStatus, 'loading');
    oa.start();
    assert.equal(ow._musicStatus, 'playing');
    oa.fire('pause'); oa.fire('ended'); oa.fire('error');
    assert.equal(ow._musicStatus, 'playing');
    oa.readyState = 1; oa.fire('waiting');
    assert.equal(ow._musicStatus, 'loading');
    oa.readyState = 4; oa.fire('playing');
    assert.equal(ow._musicStatus, 'playing');
    ow.audioBtn.click();
    assert.equal(ow._musicStatus, 'paused');
    oa.fire('playing');
    assert.equal(ow._musicStatus, 'paused');
    oa.requests[1].resolve();
    await Promise.resolve();
    assert.equal(ow._musicStatus, 'paused');
});

test('音乐失败给出安全提示并可手动重试，空清单不创建Audio', async () => {
    const rejected = widget({ music: { tracks: [{ file: '甲.mp3', title: '甲' }] } });
    const rw = rejected.w, rejectedAudios = rejected.audios;
    rw.audioBtn.click();
    const error = new Error('自动播放被拒绝'); error.name = 'NotAllowedError';
    rejectedAudios[0].requests[0].reject(error);
    await Promise.resolve();
    assert.equal(rw._musicStatus, 'error');
    assert.equal(rw.audioBtn.title, '播放失败，点击重试：甲');
    assert.equal(rw.bubbleText.textContent, '浏览器阻止了播放，请再次点击音乐按钮。');
    rw.audioBtn.click(); rejectedAudios[0].start();
    assert.equal(rw._musicStatus, 'playing');

    const throwing = widget({ music: { tracks: [{ file: '甲.mp3' }] } }), tw = throwing.w;
    const originalPlay = throwing.s.Audio.prototype.play;
    throwing.s.Audio = class extends throwing.s.Audio {
        play() { throw new Error('同步失败'); }
    };
    tw.audioBtn.click();
    assert.equal(tw._musicStatus, 'error');
    assert.equal(tw.bubbleText.textContent, '音乐加载或播放失败，请再次点击重试。');
    throwing.audios[0].play = function play() { return originalPlay.call(this); };
    tw.audioBtn.click(); throwing.audios[0].start();
    assert.equal(tw._musicStatus, 'playing');

    const errored = widget({ music: { tracks: [{ file: '甲.mp3' }] } }), ew = errored.w;
    ew.audioBtn.click();
    errored.audios[0].error = { code: 9 };
    errored.audios[0].fire('error');
    assert.equal(ew._musicStatus, 'error');
    assert.equal(ew.bubbleText.textContent, '音乐加载或播放失败，请再次点击重试。');
    ew.audioBtn.click(); errored.audios[0].start();
    assert.equal(ew._musicStatus, 'playing');

    const empty = widget();
    empty.w.audioBtn.click();
    assert.equal(empty.audios.length, 0);
    assert.equal(empty.w._musicStatus, 'idle');
    assert.equal(empty.w.bubbleText.textContent, '暂无可播放音乐');
});

test('音乐配置过滤危险路径和坏条目，曲名只作文本展示', () => {
    const { w, s, audios } = widget({ music: { tracks: [
        null, { file: 'C:/bad.mp3' }, { file: '../bad.mp3' }, { file: 'a//b.mp3' },
        { file: '甲.mp3' }, { file: '甲.mp3', title: '重复' },
        { file: '目录/乙 #%.m4a' }, { file: '<img onerror>.mp3', title: '<b>标题</b>' },
        { file: '\uD800.mp3' }
    ] } });
    assert.equal(JSON.stringify(w.cfg.music.tracks.map(track => track.file)), JSON.stringify(['甲.mp3', '目录/乙 #%.m4a', '<img onerror>.mp3']));
    assert.equal(JSON.stringify(w.cfg.music.tracks.map(track => track.title)), JSON.stringify(['甲', '乙 #%', '<b>标题</b>']));
    s.Math.random = () => 0.99;
    w.audioBtn.click();
    assert.equal(audios.length, 1);
    const audio = audios[0];
    assert.equal(audio.sources[0], 'assets/music/' + encodeURIComponent('<img onerror>.mp3'));
    assert.equal(w.audioBtn.title, '取消加载音乐：<b>标题</b>');
    assert.doesNotMatch(w.audioBtn.innerHTML, /<b>/);
});

test('音乐与显隐独立，pagehide和destroy才停止并复位音源', () => {
    const h = widget({ music: { tracks: [{ file: '甲.mp3' }, { file: '乙.mp3' }] } });
    const { w, events, s, audios } = h;
    w.audioBtn.click(); const audio = audios[0]; audio.start();
    events.fire('blur'); w._setMenu(true); w._setMenu(false);
    assert.equal(w._musicStatus, 'playing'); assert.equal(audio.paused, false);
    w.hide();
    assert.equal(w.hidden, true); assert.equal(w._musicStatus, 'playing'); assert.equal(audio.paused, false);
    audio.currentTime = 20; audio.finish(); audio.start();
    assert.equal(w._musicTrack.file, '乙.mp3'); assert.equal(w._musicStatus, 'playing');
    const sources = audio.sources.length, time = audio.currentTime;
    w.show();
    assert.equal(audio.paused, false); assert.equal(audio.sources.length, sources);
    assert.equal(audio.currentTime, time); assert.equal(w._musicStatus, 'playing');
    events.fire('pagehide');
    assert.equal(w._musicTrack, null); assert.equal(w._musicStatus, 'idle');
    assert.equal(audio.paused, true); assert.equal(audio.getAttribute('src'), null); assert.equal(audio.currentTime, 0);
    s.YuexinmiaoWidget.destroy();
    assert.equal(w._destroyed, true); assert.equal(w._audio, null); assert.equal(audio.getAttribute('src'), null);
});

test('辅助技术click可以激活角色，真实指针click不重复执行', () => {
    const { w } = widget();
    w.stage.fire('click', { detail: 0, pointerType: '' });
    const pose = w.state, text = w.bubbleText.textContent;
    assert.ok(pose);
    w.stage.fire('click', { detail: 1, pointerType: 'mouse' });
    w.stage.fire('click', { detail: 0, pointerType: 'touch' });
    assert.equal(w.state, pose); assert.equal(w.bubbleText.textContent, text);
});

test('动画完成回调中隐藏或销毁不重新排帧，隐藏后的离开事件不产生菜单计时器', () => {
    for (const action of ['hide', 'destroy']) {
        const h = widget(), { w } = h;
        w.img.load();
        w.play('waving', { loop: false, then: () => w[action]() });
        w.frame = 3;
        h.frame(100);
        assert.equal(h.frames.size, 0); assert.equal(h.drawings.length, 0);
        w.root.fire('pointerleave');
        assert.equal(h.timers.size, 0);
    }
});

test('两处真实页面提供正确相对链接，兼容站点子目录，24点默认计算器', () => {
    for (const file of ['index.html', 'games/index.html']) {
        const html = code(file); let config;
        const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
        scripts.forEach(source => new vm.Script(source));
        const source = scripts.find(source => source.includes('YuexinmiaoWidget.init'));
        const page = { window: {}, YuexinmiaoWidget: { init: value => { config = value; } } };
        vm.runInNewContext(code('assets/music/playlist.js'), page);
        vm.runInNewContext(source, page);
        const manifestPath = file === 'index.html' ? 'assets/music/playlist.js' : '../assets/music/playlist.js';
        assert.ok(html.includes('src="' + manifestPath + '"'));
        assert.ok(html.indexOf('src="' + manifestPath + '"') < html.indexOf('YuexinmiaoWidget.init'));
        const h = widget(config);
        assert.ok(config.music.tracks.length > 0);
        for (const track of config.music.tracks) for (const prefix of ['https://example.test/', 'https://example.test/project/', 'file:///F:/site/']) {
            const relative = track.file.split('/').map(encodeURIComponent).join('/');
            assert.equal(new URL(config.music.baseUrl + relative, prefix + file).href, prefix + 'assets/music/' + relative);
        }
        assert.equal(config.bottom, 80);
        const mobile = widget(config, { width: 320, height: 480, coarse: true });
        mobile.w._setMenu(true);
        assert.equal(rect(mobile.w.toolbar).top - rect(mobile.w.root).bottom, 6);
        inside(rect(mobile.w.toolbar), 320, 480);
        const targets = ['games/index.html', 'games/sight-reading/index.html', 'games/24point/index.html'];
        for (const prefix of ['https://example.test/', 'https://example.test/project/', 'file:///F:/site/']) {
            h.w.controls.slice(2, 5).forEach((link, i) => {
                assert.equal(new URL(link.href, prefix + file).href, prefix + targets[i]);
            });
        }
    }
    const calc = code('games/24point/index.html');
    assert.match(calc, /id="tab-calc"[^>]*aria-selected="true"/);
    assert.match(calc, /id="panel-game"[^>]*hidden/);
});

test('首页被注释的游戏入口不再阻断图标渲染和主题切换', () => {
    const html = code('index.html');
    const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .map(match => match[1])
        .find(source => source.includes('动态渲染 SVG 图标'));
    const visibleHtml = html.replace(/<!--[\s\S]*?-->/g, '');
    const existingIds = new Set([...visibleHtml.matchAll(/ id="([^"]+)"/g)].map(match => match[1]));
    const expectedIcons = [...visibleHtml.matchAll(/<div class="card-icon" id="([^"]+)"><\/div>/g)].map(match => match[1]);
    const elements = new Map(), requested = [], storage = new Map();
    function element(id) {
        return {
            id,
            innerHTML: '',
            attributes: {},
            listeners: {},
            setAttribute(name, value) { this.attributes[name] = String(value); },
            addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
            click() { (this.listeners.click || []).forEach(fn => fn.call(this, { type: 'click' })); }
        };
    }
    const documentElement = {
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name] ?? null; },
        removeAttribute(name) { delete this.attributes[name]; }
    };
    const document = {
        documentElement,
        getElementById(id) {
            requested.push(id);
            if (!existingIds.has(id)) return null;
            if (!elements.has(id)) elements.set(id, element(id));
            return elements.get(id);
        },
        querySelector() { return null; },
        querySelectorAll(selector) {
            return selector === '.theme-toggle' && elements.has('themeToggle') ? [elements.get('themeToggle')] : [];
        }
    };
    const context = {
        console,
        document,
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value))
        }
    };
    vm.createContext(context);
    vm.runInContext(code('js/common.js'), context);
    vm.runInContext(source, context);

    assert.ok(expectedIcons.length >= 20);
    for (const id of expectedIcons) assert.match(elements.get(id).innerHTML, /^<svg /, id);
    for (const id of ['icon-sightreading', 'icon-metronome', 'icon-game']) {
        assert.ok(requested.includes(id));
        assert.equal(elements.has(id), false);
    }
    const toggle = elements.get('themeToggle');
    assert.match(toggle.innerHTML, /<svg /);
    toggle.click();
    assert.equal(documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(storage.get('ee-theme'), 'dark');
    assert.equal(toggle.attributes.title, '切换到白天模式');
    toggle.click();
    assert.equal(documentElement.getAttribute('data-theme'), null);
    assert.equal(storage.get('ee-theme'), 'light');
});

test('样式约束：不依赖纯hover，不硬编码配色，保留触屏尺寸和键盘焦点', () => {
    const css = code('css/yuexinmiao-widget.css');
    assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i);
    assert.doesNotMatch(css, /ym-select|yuexinmiao-widget:hover/);
    assert.match(css, /\.ym-menu-open \.ym-toolbar/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/);
    assert.match(css, /width: 30px;[\s\S]*height: 30px;/);
    assert.match(css, /width: 18px; height: 18px;/);
    assert.match(css, /width: 44px; height: 44px;/);
    assert.match(css, /\.ym-toolbar-list\s*\{[^}]*flex-direction: row;[^}]*gap: 4px;[^}]*padding: 4px;[^}]*overflow: auto;/);
    assert.match(css, /\.ym-divider\s*\{[^}]*border-left:/);
    assert.match(css, /prefers-reduced-motion/);
});

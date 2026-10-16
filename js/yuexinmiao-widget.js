/*!
 * yuexinmiao-widget v1.0.0
 * 月薪喵 网页看板娘挂件 —— 由 Codex 桌宠包 (yuexinmiao-codex-pet) 转制
 * 把月薪喵精灵图渲染为可嵌入网页右下角的桌宠挂件。
 *
 * 用法：
 *   <link rel="stylesheet" href="yuexinmiao-widget.css">
 *   <div id="yuexinmiao-root"></div>
 *   <script src="/js/yuexinmiao-widget.js"></script>
 *   <script>
 *     YuexinmiaoWidget.init({
 *       mount: '#yuexinmiao-root',
 *       spritesheet: 'assets/images/spritesheet.webp'
 *     });
 *   </script>
 *
 * 无任何外部依赖，纯原生 HTML/CSS/JS。
 */
(function () {
  'use strict';

  /* ---------- 精灵图与动画规范（来自仓库 README / CODEX_PET_SPEC） ---------- */
  // 图集 1536 x 5616，单元 192 x 208，8 列 x 27 行，WebP RGBA
  var FRAME = { cols: 8, rows: 27, cellW: 192, cellH: 208 };

  var ANIMS = [
    { name: 'idle',          frames: 6, fps: 8  }, // row 0
    { name: 'running-right', frames: 8, fps: 12 }, // row 1
    { name: 'running-left',  frames: 8, fps: 12 }, // row 2
    { name: 'waving',        frames: 4, fps: 10 }, // row 3
    { name: 'jumping',       frames: 5, fps: 10 }, // row 4
    { name: 'failed',        frames: 8, fps: 10 }, // row 5
    { name: 'waiting',       frames: 6, fps: 8  }, // row 6
    { name: 'running',       frames: 6, fps: 12 }, // row 7
    { name: 'review',        frames: 6, fps: 8 },  // row 8
    { name: 'dancing',       frames: 6, fps: 8 },  // row 9
    { name: 'steal-right',   frames: 8, fps: 12 }, // row 10
    { name: 'steal-left',    frames: 8, fps: 12 }, // row 11
    { name: 'toilet',        frames: 4, fps: 10 }, // row 12
    { name: 'music',         frames: 5, fps: 10 }, // row 13
    { name: 'ohh',           frames: 8, fps: 10 }, // row 14
    { name: 'sofa',          frames: 6, fps: 8 },  // row 15
    { name: 'working',       frames: 6, fps: 12 }, // row 16
    { name: 'thinking',      frames: 6, fps: 8 },  // row 17
    { name: 'fat',           frames: 6, fps: 8 },  // row 18
    { name: 'walking-right', frames: 8, fps: 12 }, // row 19
    { name: 'walking-left',  frames: 8, fps: 12 }, // row 20
    { name: 'bye',           frames: 4, fps: 10 }, // row 21
    { name: 'jump',          frames: 5, fps: 10 }, // row 22
    { name: 'sad',           frames: 8, fps: 10 }, // row 23
    { name: 'love',          frames: 6, fps: 8 },  // row 24
    { name: 'tap',           frames: 6, fps: 12 }, // row 25
    { name: 'pat',           frames: 6, fps: 8 }   // row 26
  ];
  var ANIM_BY_NAME = {};
  ANIMS.forEach(function (a, i) { a.row = i; ANIM_BY_NAME[a.name] = a; });

  var LOOP_STATES = { idle: 1, waiting: 1, 'running-right': 1, 'running-left': 1, running: 1 };

  /* ---------- 默认台词 ---------- */
  var DEFAULT_MESSAGES = [
    '喵~又来搬砖啦？',
    '今天也要好好……工作哦！',
    '月薪到账，快乐加倍！',
    '点击我，可以换姿势~',
    '拖动我，陪你跑两步~',
    '别盯着我看啦，会害羞的喵。',
    '摸鱼一时爽，一直摸鱼……嘿嘿。',
    '码到 bug 了？深呼吸，喵~~~',
    '不要久坐，多起来走动走动哦！',
    '今天的运动目标完成了吗？',
    '今天过得怎么样？',
    '嗨~快来逗我玩吧！',
    '深夜时要爱护眼睛呀',
    '我在草地上写你名字~',
    '把我放首页，不许撤！',
    '我要出门捉蝴蝶啦！',
    '今天是个好天气呢',
    '我要出门追风啦！',
    '喵~',
    '快看看这里都有什么呢？',
    '好东西要让更多人知道才行哦~',
    '我真的特别爱你',
    '一人做事一人当，当当做事当当当',
    '再忙也要好好吃饭',
  ];

  function defaults(opts) {
    opts = opts || {};
    return {
      mount: opts.mount || '#yuexinmiao-root',
      spritesheet: opts.spritesheet || 'assets/images/spritesheet.webp',
      width: opts.width || 128,                 // 显示宽度（px），高度按比例自适应
      bottom: opts.bottom != null ? opts.bottom : 80,
      right: opts.right != null ? opts.right : 24,
      messages: (Array.isArray(opts.messages) ? opts.messages : DEFAULT_MESSAGES).filter(function (text) {
        return typeof text === 'string' && text.trim();
      }),
      links: {
        games: (opts.links && opts.links.games) || 'games/index.html',
        sightReading: (opts.links && opts.links.sightReading) || 'games/sight-reading/index.html',
        calculator: (opts.links && opts.links.calculator) || 'games/24point/index.html'
      },
      autoIdle: opts.autoIdle !== false,        // 是否随机触发小动作
      speak: opts.speak !== false               // 是否自动冒泡
    };
  }

  /* ---------- 工具 ---------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randExcept(arr, current) {
    var choices = arr.filter(function (value) { return value !== current; });
    return rand(choices.length ? choices : arr);
  }
  function icon(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var ICONS = {
    random: icon('<path d="M3 6h3c5 0 7 12 12 12h3M17 14l4 4-4 4M3 18h3c2 0 3-2 4-4M14 8c1-1 2-2 4-2h3M17 2l4 4-4 4"/>'),
    talk: icon('<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z"/><path d="M7 10h10M7 14h6"/>'),
    games: icon('<path d="M7 6h10c3 0 5 10 4 12s-4 0-6-3H9c-2 3-5 5-6 3S4 6 7 6Z"/><path d="M6 10v4M4 12h4M16 10h.01M18 13h.01"/>'),
    music: icon('<path d="M9 17V5l11-2v12M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>'),
    hide: icon('<path d="m6 6 12 12M18 6 6 18"/>'),
    more: icon('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>')
  };
  var FUN_STATES = ANIMS.filter(function (a) { return a.name !== 'idle'; }).map(function (a) { return a.name; });

  /* ---------- 挂件主体 ---------- */
  function Widget(opts) {
    this.cfg = defaults(opts);
    this.state = null;
    this.loop = true;
    this.frame = 0;
    this.acc = 0;
    this.last = 0;
    this.dragging = false;
    this.hidden = false;
    this._idleTimer = null;
    this._speakTimer = null;
    this._bubbleTimer = null;
    this._menuTimer = null;
    this._raf = null;
    this._listeners = [];
    this._pointer = null;
    this._destroyed = false;
    this._ready = false;
    this._hovered = false;
    this._pinned = false;
    this._manualBubble = false;
    this._lastMessage = null;
    this.menuOpen = false;
    this._build();
    this._load();
  }

  Widget.prototype._build = function () {
    var cfg = this.cfg;
    var w = cfg.width;
    var h = Math.round(w * FRAME.cellH / FRAME.cellW);

    this.root = el('div', 'yuexinmiao-widget');
    this.root.style.right = cfg.right + 'px';
    this.root.style.bottom = cfg.bottom + 'px';
    this.root.style.width = w + 'px';
    this.root.style.height = h + 'px';

    // 对话气泡
    this.bubble = el('div', 'ym-bubble');
    this.bubbleClose = el('button', 'ym-bubble-close', '×');
    this.bubbleClose.type = 'button';
    this.bubbleClose.title = '关闭对话';
    this.bubbleClose.setAttribute('aria-label', '关闭对话');
    this.bubbleClose.tabIndex = -1;
    this.bubble.setAttribute('aria-hidden', 'true');
    var self = this;
    this._listen(this.bubbleClose, 'click', function () { self.hideBubble(); });
    this.bubble.appendChild(this.bubbleClose);
    this.bubbleText = el('span', 'ym-bubble-text');
    this.bubble.insertBefore(this.bubbleText, this.bubbleClose);
    this.root.appendChild(this.bubble);

    // 精灵舞台
    this.stage = el('div', 'ym-stage');
    this.stage.tabIndex = 0;
    this.stage.setAttribute('role', 'button');
    this.stage.setAttribute('aria-label', '月薪喵，点击换姿势和对话，可拖动');
    this.stage.setAttribute('aria-controls', 'ym-actions');
    this.stage.setAttribute('aria-expanded', 'false');
    this.stage.style.width = w + 'px';
    this.stage.style.height = h + 'px';
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.className = 'ym-canvas';
    this.stage.appendChild(this.canvas);
    this.root.appendChild(this.stage);

    // 工具栏
    this.moreBtn = el('button', 'ym-more-btn', ICONS.more);
    this.moreBtn.type = 'button';
    this.moreBtn.title = '更多操作';
    this.moreBtn.setAttribute('aria-label', '更多操作');
    this.moreBtn.setAttribute('aria-controls', 'ym-actions');
    this.moreBtn.setAttribute('aria-expanded', 'false');
    this.root.appendChild(this.moreBtn);
    this._listen(this.moreBtn, 'click', function () {
      self._pinned = !self.menuOpen;
      self._setMenu(self._pinned);
    });
    this.bridge = el('div', 'ym-bridge');
    this.bridge.setAttribute('aria-hidden', 'true');
    this.root.appendChild(this.bridge);
    this.toolbar = el('div', 'ym-toolbar');
    this.toolbar.id = 'ym-actions';
    this.toolbar.setAttribute('role', 'group');
    this.toolbar.setAttribute('aria-label', '月薪喵功能');
    this.toolbar.setAttribute('aria-hidden', 'true');
    this.toolbar.inert = true;
    this.toolbarList = el('div', 'ym-toolbar-list');
    this.toolbar.appendChild(this.toolbarList);
    this.controls = [];
    function control(name, label, html, action, href) {
      var node = el(href ? 'a' : 'button', 'ym-btn ym-btn-' + name, html);
      node.title = label;
      node.setAttribute('aria-label', label);
      node.tabIndex = -1;
      if (href) node.href = href;
      else {
        node.type = 'button';
        self._listen(node, 'click', action);
      }
      self.toolbarList.appendChild(node);
      self.controls.push(node);
      return node;
    }
    this.randomBtn = control('random', '换姿势和对话', ICONS.random, function () { self.randomAction(); });
    this.talkBtn = control('talk', '只换对话', ICONS.talk, function () { self.randomTalk(); });
    control('games', '小游戏合集', ICONS.games, null, cfg.links.games);
    control('music', '识谱练习', ICONS.music, null, cfg.links.sightReading);
    control('number', '24点计算器', '<span aria-hidden="true">24</span>', null, cfg.links.calculator);
    this.toolbarList.appendChild(el('div', 'ym-divider'));
    this.hideBtn = control('hide', '隐藏看板娘', ICONS.hide, function () { self.hide(); });
    this.root.appendChild(this.toolbar);

    // 显示按钮（隐藏后用于唤回）
    this.showBtn = el('button', 'ym-show-btn', '喵');
    this.showBtn.type = 'button';
    this.showBtn.title = '唤回月薪喵';
    this.showBtn.setAttribute('aria-label', '唤回月薪喵');
    this._listen(this.showBtn, 'click', function () { self.show(); });

    this._bindInteraction();
    var mount = document.querySelector(cfg.mount);
    if (!mount) { mount = document.body; }
    mount.appendChild(this.root);
    mount.appendChild(this.showBtn);
    this._fitPosition();
  };

  Widget.prototype._listen = function (node, type, handler) {
    node.addEventListener(type, handler);
    this._listeners.push(function () { node.removeEventListener(type, handler); });
  };
  Widget.prototype._focusStage = function () {
    this._suppressFocusOpen = true;
    this.stage.focus({ preventScroll: true });
    this._suppressFocusOpen = false;
  };
  Widget.prototype._setMenu = function (open) {
    if (this._destroyed) return;
    open = !!open && !this.hidden && !this.dragging;
    clearTimeout(this._menuTimer);
    this._menuTimer = null;
    if (!open && this.toolbar.contains(document.activeElement)) this._focusStage();
    this.menuOpen = open;
    this.root.classList.toggle('ym-menu-open', open);
    this.toolbar.inert = !open;
    this.toolbar.setAttribute('aria-hidden', String(!open));
    this.stage.setAttribute('aria-expanded', String(open));
    this.moreBtn.setAttribute('aria-expanded', String(open));
    this.controls.forEach(function (node) { node.tabIndex = open ? 0 : -1; });
    this._positionOverlays();
  };
  Widget.prototype._queueMenuClose = function () {
    if (this.hidden || this._destroyed) return;
    var self = this;
    clearTimeout(this._menuTimer);
    this._menuTimer = setTimeout(function () {
      self._menuTimer = null;
      if (!self._hovered && !self._pinned && !self.root.contains(document.activeElement)) self._setMenu(false);
    }, 200);
  };

  /* 角色是固定锚点：工具栏与气泡的尺寸变化不能挪动角色。 */
  Widget.prototype._moveTo = function (left, top) {
    var w = this.root.offsetWidth, h = this.root.offsetHeight;
    this.root.style.left = clamp(left, 8, Math.max(8, window.innerWidth - w - 8)) + 'px';
    this.root.style.top = clamp(top, 8, Math.max(8, window.innerHeight - h - 8)) + 'px';
    this.root.style.right = 'auto';
    this.root.style.bottom = 'auto';
  };
  Widget.prototype._fitPosition = function () {
    if (this._destroyed || this.hidden) return;
    var r = this.root.getBoundingClientRect();
    if (r.left < 8 || r.top < 8 || r.right > window.innerWidth - 8 || r.bottom > window.innerHeight - 8) {
      this._moveTo(r.left, r.top);
    }
    this._positionOverlays();
  };
  Widget.prototype._positionOverlays = function () {
    if (this._destroyed || this.hidden) return;
    var r = this.root.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, gap = 6;
    this.toolbar.style.maxWidth = Math.max(0, vw - 16) + 'px';
    this.toolbar.style.maxHeight = Math.max(0, vh - 16) + 'px';
    var tw = this.toolbar.offsetWidth, th = this.toolbar.offsetHeight;
    var tx = clamp(r.right - tw, 8, Math.max(8, vw - tw - 8));
    var ty = r.bottom + gap;
    // 默认贴在脚下；拖到下边缘时才临时翻到上方。
    if (ty + th > vh - 8 && r.top - th - gap >= 8) ty = r.top - th - gap;
    ty = clamp(ty, 8, Math.max(8, vh - th - 8));
    this.toolbar.style.left = (tx - r.left) + 'px';
    this.toolbar.style.top = (ty - r.top) + 'px';
    var above = ty + th <= r.top;
    this.root.classList.toggle('ym-toolbar-above', above);
    var bx = Math.max(r.left, tx);
    this.bridge.style.left = (bx - r.left) + 'px';
    this.bridge.style.top = ((above ? ty + th : r.bottom) - r.top) + 'px';
    this.bridge.style.width = Math.max(0, Math.min(r.right, tx + tw) - bx) + 'px';
    this.bridge.style.height = Math.max(0, above ? r.top - ty - th : ty - r.bottom) + 'px';

    // 气泡以头顶为锚点，工具栏展开不能把它推远；仅在边缘发生碰撞时避让。
    var minY = 8, maxY = vh - 8;
    if (this.menuOpen) {
      if (above) minY = ty + th + gap;
      else maxY = ty - gap;
    }
    this.bubble.style.maxWidth = Math.max(0, Math.min(220, vw - 16)) + 'px';
    this.bubble.style.maxHeight = Math.max(0, maxY - minY) + 'px';
    var bh = this.bubble.offsetHeight;
    var by = r.top - bh - gap;
    var below = by < minY;
    if (below) by = r.bottom + gap;
    var compact = by < minY || by + bh > maxY;
    var bubbleX = r.right - this.bubble.offsetWidth;
    if (compact) {
      var leftSpace = r.left - gap - 8, rightSpace = vw - 8 - r.right - gap;
      if (Math.max(leftSpace, rightSpace) >= 80) {
        var onLeft = leftSpace >= rightSpace;
        this.bubble.style.maxWidth = Math.min(220, onLeft ? leftSpace : rightSpace) + 'px';
        bubbleX = onLeft ? r.left - gap - this.bubble.offsetWidth : r.right + gap;
      } else {
        // 极短视口中将气泡限制在角色这一列，优先保证工具栏可操作。
        this.bubble.style.maxWidth = Math.min(r.width, vw - 16) + 'px';
        bubbleX = r.right - this.bubble.offsetWidth;
      }
      bh = this.bubble.offsetHeight;
      by = clamp(r.top, minY, Math.max(minY, maxY - bh));
    }
    this.bubble.style.left = (clamp(bubbleX, 8, Math.max(8, vw - this.bubble.offsetWidth - 8)) - r.left) + 'px';
    this.bubble.style.top = (by - r.top) + 'px';
    this.bubble.classList.toggle('ym-bubble-below', below && !compact);
    this.bubble.classList.toggle('ym-bubble-compact', compact);
  };

  Widget.prototype._load = function () {
    var self = this;
    this.ctx = this.canvas.getContext('2d');
    this.img = new Image();
    this.img.onload = function () {
      if (self._destroyed) return;
      self._ready = true;
      if (self.hidden) return;
      // 开局先招手，再回到待机
      if (!self.state) self.play('waving', { loop: false, then: function () {
        self.play('idle', { loop: true });
        if (self.cfg.speak && !self._manualBubble) self._randomMessage(false, 3200);
      } });
      self._startLoop();
      if (self.cfg.autoIdle) self._scheduleIdle();
      if (self.cfg.speak) self._scheduleSpeak();
    };
    this.img.onerror = function () {
      self.say('精灵图加载失败：' + self.cfg.spritesheet, 5000);
    };
    this.img.src = this.cfg.spritesheet;
  };

  /* ---------- 渲染循环 ---------- */
  Widget.prototype._startLoop = function () {
    if (this._raf !== null || !this._ready || this.hidden || this._destroyed) return;
    var self = this;
    this.last = performance.now();
    function tick(now) {
      self._raf = null;
      if (self.hidden || self._destroyed) return;
      var dt = Math.min(now - self.last, 100);
      self.last = now;
      self._update(dt);
      if (self.hidden || self._destroyed) return;
      self._draw();
      self._raf = requestAnimationFrame(tick);
    }
    this._raf = requestAnimationFrame(tick);
  };

  Widget.prototype._update = function (dt) {
    var a = this.state;
    if (!a) return;
    this.acc += dt;
    var ms = 1000 / a.fps;
    while (this.acc >= ms) {
      this.acc -= ms;
      this.frame++;
      if (this.frame >= a.frames) {
        if (this.loop) {
          this.frame = 0;
        } else {
          this.frame = a.frames - 1; // 停在最后一帧
          if (this._then) {
            var cb = this._then;
            this._then = null;
            cb();
          }
          return;
        }
      }
    }
  };

  Widget.prototype._draw = function () {
    var a = this.state;
    if (!a || !this.img || !this.img.complete) return;
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    var sx = this.frame * FRAME.cellW;
    var sy = a.row * FRAME.cellH;
    ctx.drawImage(
      this.img,
      sx, sy, FRAME.cellW, FRAME.cellH,
      0, 0, this.canvas.width, this.canvas.height
    );
  };

  /* ---------- 状态控制 ---------- */
  Widget.prototype.play = function (name, opts) {
    if (this._destroyed) return;
    opts = opts || {};
    var a = ANIM_BY_NAME[name];
    if (!a) return;
    this.state = a;
    this.loop = opts.loop != null ? opts.loop : !!LOOP_STATES[name];
    this._then = opts.then || null;
    this.frame = 0;
    this.acc = 0;
  };

  Widget.prototype.randomAction = function () {
    if (this.hidden || this._destroyed) return;
    this.play(randExcept(FUN_STATES, this.state && this.state.name), { loop: true });
    this.randomTalk();
  };
  Widget.prototype.randomTalk = function () {
    if (this.hidden || this._destroyed) return;
    this._randomMessage(true, 3200);
  };
  Widget.prototype._randomMessage = function (manual, dur) {
    var message = randExcept(this.cfg.messages, this._lastMessage);
    if (message !== undefined) this.say(message, dur, manual);
    else this.hideBubble();
  };

  Widget.prototype.isBusy = function () {
    return this.state && !this.loop && this._then;
  };

  /* ---------- 随机小动作 ---------- */
  Widget.prototype._scheduleIdle = function () {
    this._stopIdle();
    if (this.hidden || this._destroyed || !this.cfg.autoIdle) return;
    var self = this;
    this._idleTimer = setTimeout(function () {
      self._idleTimer = null;
      // 仅在 idle 状态下才随机触发小动作，不打断用户点击选择的姿势
      if (self.dragging || self._pointer || self.menuOpen || self._manualBubble || self.state !== ANIM_BY_NAME['idle']) { self._scheduleIdle(); return; }
      // 待机时随机触发一个小动作，结束后回到 idle
      var actions = ['waving', 'jumping', 'waiting', 'review'];
      var act = rand(actions);
      self.play(act, { loop: false, then: function () {
        self.play('idle', { loop: true });
        self._scheduleIdle();
      } });
    }, 9000 + Math.random() * 7000);
  };

  /* ---------- 自动冒泡 ---------- */
  Widget.prototype._scheduleSpeak = function () {
    clearTimeout(this._speakTimer);
    this._speakTimer = null;
    if (this.hidden || this._destroyed || !this.cfg.speak || !this.cfg.messages.length) return;
    var self = this;
    this._speakTimer = setTimeout(function () {
      self._speakTimer = null;
      if (!self.dragging && !self._pointer && !self.menuOpen && !self._manualBubble) {
        self._randomMessage(false, 3200);
      }
      self._scheduleSpeak();
    }, 20000 + Math.random() * 15000);
  };

  /* ---------- 对话气泡 ---------- */
  Widget.prototype.say = function (text, dur, manual) {
    if (this.hidden || this._destroyed) return;
    if (text == null || !String(text).trim()) { this.hideBubble(); return; }
    this._lastMessage = String(text);
    this._manualBubble = manual !== false;
    this.bubbleText.textContent = text;
    this.bubble.classList.add('ym-show');
    this.bubble.setAttribute('aria-hidden', 'false');
    this.bubbleClose.tabIndex = 0;
    this._positionOverlays();
    var self = this;
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = null;
    if (dur) this._bubbleTimer = setTimeout(function () { self.hideBubble(); }, dur);
    if (this._manualBubble) this._scheduleSpeak();
  };
  Widget.prototype.hideBubble = function () {
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = null;
    this._manualBubble = false;
    if (this.bubble.contains(document.activeElement) && !this.hidden) this._focusStage();
    this.bubble.classList.remove('ym-show');
    this.bubble.setAttribute('aria-hidden', 'true');
    this.bubbleClose.tabIndex = -1;
  };

  /* ---------- 交互：点击换姿势 / 拖拽 ---------- */
  Widget.prototype._bindInteraction = function () {
    var self = this;
    this._listen(this.root, 'pointerenter', function (e) {
      if (e.pointerType === 'touch') return;
      self._hovered = true;
      self._setMenu(true);
    });
    this._listen(this.root, 'pointerleave', function (e) {
      if (e.pointerType === 'touch') return;
      self._hovered = false;
      self._queueMenuClose();
    });
    this._listen(this.root, 'focusin', function (e) {
      if (!self._suppressFocusOpen && e.target !== self.moreBtn) self._setMenu(true);
    });
    this._listen(this.root, 'focusout', function () { self._queueMenuClose(); });
    this._listen(this.root, 'keydown', function (e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      self._pinned = false;
      self._setMenu(false);
      self._focusStage();
    });
    this._listen(document, 'pointerdown', function (e) {
      if (!self.root.contains(e.target)) {
        self._pinned = false;
        self._setMenu(false);
      }
    });
    this._listen(window, 'resize', function () { self._fitPosition(); });
    this._listen(window, 'blur', function () {
      self._finishPointer(true);
      self._pinned = self._hovered = false;
      self._setMenu(false);
    });
    this._listen(this.stage, 'keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) self.randomAction();
      }
    });
    this._listen(this.stage, 'click', function (e) {
      // 辅助技术可能只派发 click；真实指针已经在 pointerup 中处理。
      if (e.detail === 0 && !e.pointerType) self.randomAction();
    });

    this._listen(this.stage, 'pointerdown', function (e) {
      if (self.hidden || self._pointer || e.button !== 0 || e.isPrimary === false) return;
      e.preventDefault();
      // 先在改动任何样式前读取一次 rect，避免 right 失锚后读到跳位后的错误坐标
      var rect = self.root.getBoundingClientRect();
      self._pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX,
        left: rect.left, top: rect.top, moved: false };
      self.stage.setPointerCapture(e.pointerId);
      self._stopIdle();
    });
    this._listen(this.stage, 'pointermove', function (e) {
      var p = self._pointer;
      if (!p || p.id !== e.pointerId) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!p.moved && dx * dx + dy * dy <= 16) return;
      p.moved = self.dragging = true;
      self._pinned = false;
      self.root.classList.add('ym-dragging');
      self._setMenu(false);
      self._moveTo(p.left + dx, p.top + dy);
      // 拖动方向决定跑步动画
      var vx = e.clientX - p.lastX;
      p.lastX = e.clientX;
      var name = vx > 1 ? 'running-right' : vx < -1 ? 'running-left' : 'running';
      if (self.state !== ANIM_BY_NAME[name]) self.play(name, { loop: true });
      self._positionOverlays();
    });
    this._listen(this.stage, 'pointerup', function (e) {
      if (self._pointer && self._pointer.id === e.pointerId) self._finishPointer(false);
    });
    ['pointercancel', 'lostpointercapture'].forEach(function (type) {
      self._listen(self.stage, type, function (e) {
        if (self._pointer && self._pointer.id === e.pointerId) self._finishPointer(true);
      });
    });

    // 双击：切换显示/隐藏对话气泡
    this._listen(this.stage, 'dblclick', function () {
      if (self.bubble.classList.contains('ym-show')) self.hideBubble();
      else self._randomMessage(true);
    });
  };
  Widget.prototype._finishPointer = function (cancelled) {
    var p = this._pointer;
    if (!p) return;
    this._pointer = null;
    this.dragging = false;
    this.root.classList.remove('ym-dragging');
    try { this.stage.releasePointerCapture(p.id); } catch (_) {}
    if (p.moved) this.play('idle', { loop: true });
    else if (!cancelled) this.randomAction();
    this._scheduleIdle();
    if (this._hovered && !cancelled) this._setMenu(true);
    this._fitPosition();
  };

  Widget.prototype._stopIdle = function () {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
  };

  /* ---------- 显示 / 隐藏 ---------- */
  Widget.prototype.hide = function () {
    if (this._destroyed || this.hidden) return;
    this._finishPointer(true);
    this._pinned = this._hovered = false;
    this._setMenu(false);
    this.hideBubble();
    this.hidden = true;
    this._then = null;
    this._stopIdle();
    clearTimeout(this._speakTimer);
    this._speakTimer = null;
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.root.classList.add('ym-hidden');
    this.root.inert = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.showBtn.classList.add('ym-show-on');
    this.showBtn.focus({ preventScroll: true });
    clearTimeout(this._menuTimer);
    this._menuTimer = null;
  };
  Widget.prototype.show = function () {
    if (this._destroyed || !this.hidden) return;
    this.hidden = false;
    this.root.classList.remove('ym-hidden');
    this.root.inert = false;
    this.root.removeAttribute('aria-hidden');
    this.showBtn.classList.remove('ym-show-on');
    var self = this;
    this.play('waving', { loop: false, then: function () { self.play('idle', { loop: true }); } });
    this._fitPosition();
    this._focusStage();
    this.say('回来啦～', 1800);
    this._startLoop();
    this._scheduleIdle();
  };

  Widget.prototype.destroy = function () {
    if (this._destroyed) return;
    this._finishPointer(true);
    this._destroyed = true;
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._stopIdle();
    clearTimeout(this._speakTimer);
    clearTimeout(this._bubbleTimer);
    clearTimeout(this._menuTimer);
    this._speakTimer = this._bubbleTimer = this._menuTimer = null;
    this._then = null;
    if (this.img) this.img.onload = this.img.onerror = null;
    this._listeners.forEach(function (off) { off(); });
    this._listeners = [];
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    if (this.showBtn && this.showBtn.parentNode) this.showBtn.parentNode.removeChild(this.showBtn);
  };

  /* ---------- 对外 API ---------- */
  var instance = null;
  var YuexinmiaoWidget = {
    init: function (opts) {
      if (instance) instance.destroy();
      instance = new Widget(opts);
      return instance;
    },
    get: function () { return instance; },
    play: function (name, opts) { if (instance) instance.play(name, opts); },
    say: function (text, dur) { if (instance) instance.say(text, dur); },
    show: function () { if (instance) instance.show(); },
    hide: function () { if (instance) instance.hide(); },
    destroy: function () { if (instance) { instance.destroy(); instance = null; } }
  };

  if (typeof window !== 'undefined') {
    window.YuexinmiaoWidget = YuexinmiaoWidget;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = YuexinmiaoWidget;
  }
})();

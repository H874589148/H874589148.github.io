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
  // 图集 1536 x 1872，单元 192 x 208，8 列 x 9 行，WebP RGBA
  var FRAME = { cols: 8, rows: 9, cellW: 192, cellH: 208 };

  var ANIMS = [
    { name: 'idle',          frames: 6, fps: 8  }, // row 0
    { name: 'running-right', frames: 8, fps: 12 }, // row 1
    { name: 'running-left',  frames: 8, fps: 12 }, // row 2
    { name: 'waving',        frames: 4, fps: 10 }, // row 3
    { name: 'jumping',       frames: 5, fps: 10 }, // row 4
    { name: 'failed',        frames: 8, fps: 10 }, // row 5
    { name: 'waiting',       frames: 6, fps: 8  }, // row 6
    { name: 'running',       frames: 6, fps: 12 }, // row 7
    { name: 'review',        frames: 6, fps: 8  }  // row 8
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
      bottom: opts.bottom != null ? opts.bottom : 24,
      right: opts.right != null ? opts.right : 24,
      messages: opts.messages || DEFAULT_MESSAGES,
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
    this._raf = null;
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

    // 对话气泡
    this.bubble = el('div', 'ym-bubble');
    this.bubbleClose = el('span', 'ym-bubble-close', '×');
    var self = this;
    this.bubbleClose.onclick = function () { self.hideBubble(); };
    this.bubble.appendChild(this.bubbleClose);
    this.bubbleText = el('span', 'ym-bubble-text');
    this.bubble.insertBefore(this.bubbleText, this.bubbleClose);
    this.root.appendChild(this.bubble);

    // 精灵舞台
    this.stage = el('div', 'ym-stage');
    this.stage.style.width = w + 'px';
    this.stage.style.height = h + 'px';
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.className = 'ym-canvas';
    this.stage.appendChild(this.canvas);
    this.root.appendChild(this.stage);

    // 工具栏
    this.toolbar = el('div', 'ym-toolbar');
    this.select = el('select', 'ym-select');
    ANIMS.forEach(function (a) {
      var o = el('option', null);
      o.value = a.name;
      o.textContent = a.name;
      self.select.appendChild(o);
    });
    this.select.onchange = function () {
      var v = self.select.value;
      self.play(v, { loop: !!LOOP_STATES[v] });
    };
    this.toolbar.appendChild(this.select);

    this.hideBtn = el('button', 'ym-btn ym-btn-hide', '×');
    this.hideBtn.title = '隐藏看板娘';
    this.hideBtn.onclick = function () { self.hide(); };
    this.toolbar.appendChild(this.hideBtn);
    this.root.appendChild(this.toolbar);

    // 显示按钮（隐藏后用于唤回）
    this.showBtn = el('button', 'ym-show-btn', '喵');
    this.showBtn.title = '唤回月薪喵';
    var that = this;
    this.showBtn.onclick = function () { that.show(); };

    this._bindInteraction();
    var mount = document.querySelector(cfg.mount);
    if (!mount) { mount = document.body; }
    mount.appendChild(this.root);
    mount.appendChild(this.showBtn);
  };

  Widget.prototype._load = function () {
    var self = this;
    this.ctx = this.canvas.getContext('2d');
    this.img = new Image();
    this.img.onload = function () {
      // 开局先招手，再回到待机
      self.play('waving', { loop: false, then: function () {
        self.play('idle', { loop: true });
        if (self.cfg.speak) {
          self.say(rand(self.cfg.messages), 3200);
        }
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
    var self = this;
    this.last = performance.now();
    function tick(now) {
      var dt = now - self.last;
      self.last = now;
      self._update(dt, now);
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
    opts = opts || {};
    var a = ANIM_BY_NAME[name];
    if (!a) return;
    this.state = a;
    this.loop = opts.loop != null ? opts.loop : !!LOOP_STATES[name];
    this._then = opts.then || null;
    this.frame = 0;
    this.acc = 0;
    if (this.select && this.select.value !== name) {
      this.select.value = name;
    }
  };

  Widget.prototype.isBusy = function () {
    return this.state && !this.loop && this._then;
  };

  /* ---------- 随机小动作 ---------- */
  Widget.prototype._scheduleIdle = function () {
    var self = this;
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(function () {
      // 仅在 idle 状态下才随机触发小动作，不打断用户点击选择的姿势
      if (self.hidden || self.dragging || self.state !== ANIM_BY_NAME['idle']) { self._scheduleIdle(); return; }
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
    var self = this;
    if (this._speakTimer) clearTimeout(this._speakTimer);
    this._speakTimer = setTimeout(function () {
      if (!self.hidden && !self.dragging) {
        self.say(rand(self.cfg.messages), 3200);
      }
      self._scheduleSpeak();
    }, 20000 + Math.random() * 15000);
  };

  /* ---------- 对话气泡 ---------- */
  Widget.prototype.say = function (text, dur) {
    this.bubbleText.textContent = text;
    this.bubble.classList.add('ym-show');
    var self = this;
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    if (dur) {
      this._bubbleTimer = setTimeout(function () { self.hideBubble(); }, dur);
    }
  };
  Widget.prototype.hideBubble = function () {
    this.bubble.classList.remove('ym-show');
  };

  /* ---------- 交互：点击换姿势 / 拖拽 ---------- */
  Widget.prototype._bindInteraction = function () {
    var self = this;
    var startX = 0, startY = 0, originR = 0, originB = 0, moved = false, lastX = 0;

    this.stage.addEventListener('pointerdown', function (e) {
      if (self.hidden) return;
      e.preventDefault();
      self.dragging = true;
      moved = false;
      startX = e.clientX; startY = e.clientY; lastX = e.clientX;
      // 先在改动任何样式前读取一次 rect，避免 right 失锚后读到跳位后的错误坐标
      var rect = self.root.getBoundingClientRect();
      originR = window.innerWidth - rect.right;
      originB = window.innerHeight - rect.bottom;
      self.root.style.right = 'auto';
      self.root.style.left = rect.left + 'px';
      self.stage.setPointerCapture(e.pointerId);
      self._stopIdle();
    });

    this.stage.addEventListener('pointermove', function (e) {
      if (!self.dragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      var left = self.root.offsetLeft + dx;
      var top = self.root.offsetTop + dy;
      left = clamp(left, 0, window.innerWidth - self.root.offsetWidth);
      top = clamp(top, 0, window.innerHeight - self.root.offsetHeight);
      self.root.style.left = left + 'px';
      self.root.style.top = top + 'px';
      self.root.style.bottom = 'auto';
      startX = e.clientX; startY = e.clientY;
      // 拖动方向决定跑步动画
      var vx = e.clientX - lastX; lastX = e.clientX;
      if (vx > 1 && self.state !== ANIM_BY_NAME['running-right']) {
        self.play('running-right', { loop: true });
      } else if (vx < -1 && self.state !== ANIM_BY_NAME['running-left']) {
        self.play('running-left', { loop: true });
      } else if (Math.abs(vx) <= 1 && self.state !== ANIM_BY_NAME['running']) {
        self.play('running', { loop: true });
      }
    });

    this.stage.addEventListener('pointerup', function (e) {
      if (!self.dragging) return;
      self.dragging = false;
      try { self.stage.releasePointerCapture(e.pointerId); } catch (_) {}
      self.play('idle', { loop: true });
      if (self.cfg.autoIdle) self._scheduleIdle();
      // 没有移动则视为点击 → 随机换一个非 idle 姿势并保持循环，不再回到 idle
      if (!moved) {
        var fun = ['waving', 'jumping', 'review', 'failed', 'waiting', 'running', 'running-right', 'running-left'];
        self.play(rand(fun), { loop: true });
        self.say(rand(self.cfg.messages), 2800);
      }
    });

    // 双击：切换显示/隐藏对话气泡
    this.stage.addEventListener('dblclick', function () {
      if (self.bubble.classList.contains('ym-show')) self.hideBubble();
      else self.say(rand(self.cfg.messages));
    });
  };

  Widget.prototype._stopIdle = function () {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
  };

  /* ---------- 显示 / 隐藏 ---------- */
  Widget.prototype.hide = function () {
    this.hidden = true;
    this.root.classList.add('ym-hidden');
    this.showBtn.classList.add('ym-show-on');
  };
  Widget.prototype.show = function () {
    this.hidden = false;
    this.root.classList.remove('ym-hidden');
    this.showBtn.classList.remove('ym-show-on');
    this.play('waving', { loop: false, then: function () {} });
    var self = this;
    setTimeout(function () { if (!self.dragging) self.play('idle', { loop: true }); }, 500);
    this.say('回来啦～', 1800);
    if (this.cfg.autoIdle) this._scheduleIdle();
  };

  Widget.prototype.destroy = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._idleTimer) clearTimeout(this._idleTimer);
    if (this._speakTimer) clearTimeout(this._speakTimer);
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
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

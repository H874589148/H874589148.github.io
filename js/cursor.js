/* ================================================================
 * OutlineArrowCursor · 极简描边箭头 + 彩虹粒子鼠标指针（可复用组件）
 * ----------------------------------------------------------------
 * 效果组合：指针样式 = 极简描边箭头 No.02 | 颜色 = 彩虹循环
 *           拖尾 = 粒子喷射 | 点击 = 粒子爆发
 * 提取自「鼠标指针样式实验室」预览器，封装为可直接复制的组件。
 *
 * 在任意网页中接入（两步）：
 *   1. <link rel="stylesheet" href="css/cursor.css">
 *   2. <script src="js/cursor.js"></script>
 *      <script>OutlineArrowCursor.init();</script>
 *
 * 可选配置：
 *   OutlineArrowCursor.init({
 *     color: 'rainbow',        // 'rainbow' 彩虹循环，或任意色值如 '#38bdf8'
 *     hideNativeCursor: true,  // 是否隐藏系统鼠标指针
 *     drawCursor: true,        // 是否绘制描边箭头指针（false = 保留系统鼠标、只留粒子特效）
 *     cursorScale: 1.3,        // 箭头大小倍率（0.5 ~ 2.5）
 *     trailDensity: 1,         // 拖尾粒子密度倍率（0.5 ~ 3）
 *     burstCount: 26,          // 点击爆发粒子数量
 *     zIndex: 99999            // 画布层级
 *   });
 * ================================================================ */
"use strict";
(function (global) {

  const TAU = Math.PI * 2;

  /* ---------- 默认配置 ---------- */
  const DEFAULTS = {
    color: "rainbow",
    hideNativeCursor: true,
    drawCursor: true,
    cursorScale: 1.3,
    trailDensity: 1,
    burstCount: 26,
    zIndex: 99999,
  };

  /* ---------- 颜色系统 ---------- */
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  /* colorAt(t, off)：rainbow 随时间循环变色；纯色则恒定返回 */
  function makeColorFn(color) {
    if (color === "rainbow") {
      return (t, off = 0) => `hsl(${((t * 70 + off) % 360 + 360) % 360},100%,62%)`;
    }
    return () => color;
  }
  /* 箭头第二层细描边色：彩虹模式下用深色，纯色模式按亮度自动选深/浅 */
  function makeOutlineFn(color) {
    if (color === "rainbow") return () => "rgba(10,14,26,.55)";
    if (typeof color === "string" && color.startsWith("#")) {
      const [r, g, b] = hexToRgb(color);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return () => (lum > 0.5 ? "rgba(10,14,26,.55)" : "rgba(248,250,252,.6)");
    }
    return () => "rgba(10,14,26,.55)";
  }

  /* ---------- 极简描边箭头 No.02：箭头路径 ---------- */
  function arrowPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 19 * s);
    ctx.lineTo(5 * s, 14.5 * s);
    ctx.lineTo(8.5 * s, 21.5 * s);
    ctx.lineTo(12 * s, 20 * s);
    ctx.lineTo(8.5 * s, 13 * s);
    ctx.lineTo(15 * s, 13 * s);
    ctx.closePath();
  }

  /* ---------- 组件主体 ---------- */
  const OutlineArrowCursor = {
    _cv: null,
    _ctx: null,
    _raf: 0,
    _running: false,
    _cfg: null,
    _col: null,
    _out: null,
    _mouse: { x: -999, y: -999, px: -999, py: -999, inside: false, isMouse: false },
    _particles: [],

    init(opts) {
      if (this._running) this.destroy();
      this._cfg = Object.assign({}, DEFAULTS, opts || {});
      this._col = makeColorFn(this._cfg.color);
      this._out = makeOutlineFn(this._cfg.color);

      /* 全屏覆盖画布，不拦截任何交互 */
      const cv = document.createElement("canvas");
      cv.className = "outline-arrow-cursor-canvas";
      cv.style.zIndex = this._cfg.zIndex;
      document.body.appendChild(cv);
      this._cv = cv;
      this._ctx = cv.getContext("2d");

      this._onResize = this._onResize.bind(this);
      this._onMove = this._onMove.bind(this);
      this._onLeave = this._onLeave.bind(this);
      this._onDown = this._onDown.bind(this);

      window.addEventListener("resize", this._onResize);
      window.addEventListener("pointermove", this._onMove, { passive: true });
      window.addEventListener("pointerdown", this._onDown, { passive: true });
      document.addEventListener("pointerleave", this._onLeave);
      this._onResize();

      if (this._cfg.hideNativeCursor) {
        document.documentElement.classList.add("outline-arrow-cursor-hide-native");
      }

      this._lastTs = performance.now();
      this._running = true;
      this._frame = this._frame.bind(this);
      this._raf = requestAnimationFrame(this._frame);
      return this;
    },

    destroy() {
      if (!this._running) return;
      cancelAnimationFrame(this._raf);
      window.removeEventListener("resize", this._onResize);
      window.removeEventListener("pointermove", this._onMove);
      window.removeEventListener("pointerdown", this._onDown);
      document.removeEventListener("pointerleave", this._onLeave);
      document.documentElement.classList.remove("outline-arrow-cursor-hide-native");
      if (this._cv && this._cv.parentNode) this._cv.parentNode.removeChild(this._cv);
      this._cv = null; this._ctx = null; this._running = false;
      this._particles = [];
    },

    /* ---------- 事件 ---------- */
    _onResize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._cv.width = Math.round(window.innerWidth * dpr);
      this._cv.height = Math.round(window.innerHeight * dpr);
      this._cv.style.width = window.innerWidth + "px";
      this._cv.style.height = window.innerHeight + "px";
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._W = window.innerWidth;
      this._H = window.innerHeight;
    },
    _onMove(e) {
      const m = this._mouse;
      if (!m.inside) { m.px = e.clientX; m.py = e.clientY; }
      m.x = e.clientX; m.y = e.clientY;
      m.inside = true;
      m.isMouse = e.pointerType === "mouse";
    },
    _onLeave() { this._mouse.inside = false; },
    _onDown(e) {
      this._mouse.x = e.clientX; this._mouse.y = e.clientY;
      this._mouse.inside = true;
      this._spawnBurst(e.clientX, e.clientY);
    },

    /* ---------- 粒子：拖尾喷射 ---------- */
    _spawnTrail(n, t) {
      const m = this._mouse;
      const dx = m.x - m.px, dy = m.y - m.py;
      const len = Math.hypot(dx, dy) || 1;
      for (let i = 0; i < n; i++) {
        const spread = (Math.random() - 0.5) * 90;
        const spd = 20 + Math.random() * 70;
        const vx = (-dx / len) * spd + Math.cos(spread) * spd * 0.6;
        const vy = (-dy / len) * spd + Math.sin(spread) * spd * 0.6;
        this._particles.push({
          x: m.x + (Math.random() - 0.5) * 6,
          y: m.y + (Math.random() - 0.5) * 6,
          vx, vy, life: 0, max: 0.5 + Math.random() * 0.5,
          size: 1.4 + Math.random() * 2.4, hue: Math.random() * 120,
        });
      }
    },
    /* ---------- 粒子：点击爆发（带重力） ---------- */
    _spawnBurst(x, y) {
      const count = Math.max(1, Math.round(this._cfg.burstCount));
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU, spd = 110 + Math.random() * 190;
        this._particles.push({
          x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          life: 0, max: 0.55 + Math.random() * 0.35,
          size: 1.6 + Math.random() * 2.4, hue: Math.random() * 120, grav: 260,
        });
      }
    },
    _updateParticles(dt) {
      const ps = this._particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += dt;
        if (p.life >= p.max) { ps.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= Math.pow(0.02, dt); p.vy *= Math.pow(0.02, dt);
        if (p.grav) p.vy += p.grav * dt;
      }
    },

    /* ---------- 指针本体：极简描边箭头 No.02 ---------- */
    _drawCursor(t) {
      const ctx = this._ctx, m = this._mouse;
      const col = this._col, out = this._out;
      const s = Math.max(0.2, this._cfg.cursorScale);
      ctx.save();
      ctx.translate(m.x, m.y);
      arrowPath(ctx, s);
      /* 主描边：彩虹描边 + 辉光 */
      ctx.lineWidth = 2.2; ctx.lineJoin = "round";
      ctx.shadowColor = col(t); ctx.shadowBlur = 12;
      ctx.strokeStyle = col(t); ctx.stroke();
      /* 第二层细描边：提升箭头辨识度 */
      ctx.shadowBlur = 0;
      ctx.strokeStyle = out(); ctx.lineWidth = 0.8; ctx.stroke();
      ctx.restore();
    },

    /* ---------- 主循环 ---------- */
    _frame(now) {
      if (!this._running) return;
      const dt = Math.min((now - this._lastTs) / 1000, 0.05);
      this._lastTs = now;
      const t = now / 1000;
      const m = this._mouse;

      if (m.inside && m.isMouse) {
        const moved = Math.hypot(m.x - m.px, m.y - m.py);
        if (moved > 1.2) {
          const n = Math.max(1, Math.round((Math.min(2 + (moved / 14) | 0, 5)) * this._cfg.trailDensity));
          this._spawnTrail(n, t);
        }
      }
      this._updateParticles(dt);

      const ctx = this._ctx;
      ctx.clearRect(0, 0, this._W, this._H);

      if (m.inside || this._particles.length) {
        /* 粒子渲染（拖尾喷射 + 点击爆发共用） */
        if (this._particles.length) {
          for (const p of this._particles) {
            const k = 1 - p.life / p.max;
            ctx.globalAlpha = k;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k + 0.4, 0, TAU);
            ctx.fillStyle = this._col(t, p.hue);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        /* 指针本体 */
        if (this._cfg.drawCursor && m.inside && m.isMouse) this._drawCursor(t);
      }

      m.px = m.x; m.py = m.y;
      this._raf = requestAnimationFrame(this._frame);
    },
  };

  global.OutlineArrowCursor = OutlineArrowCursor;
})(window);

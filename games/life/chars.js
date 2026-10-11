/* ================================================================
   人生长卷 · 人物组装与动画（chars.js）
   ----------------------------------------------------------------
   - 部件素材：svg/parts-core.svg（底模/发型/配饰）、svg/parts-outfits.svg（服装）
     均为「具名 <g> 部件库」，启动时 fetch + DOMParser 提取到内存 PARTS 表。
   - 渲染：按 阶段底模 → 服装 → 发型 → 配饰 层级拼装为一个内联 <svg>，
     腿/臂分组带 .p-leg-l/.p-leg-r/.p-arm-l/.p-arm-r class，由 rAF 驱动摆动。
   - 替换素材：直接用矢量编辑软件改对应 svg 文件里的 <g id>，
     保持分组 class 与骨架坐标（见 parts-core.svg 头注释）即可。
   ================================================================ */
(function () {
  'use strict';

  var CORE_URLS = ['svg/parts-core.svg', 'svg/parts-outfits.svg'];
  var INLINE_IDS = ['life-lib-core', 'life-lib-outfits'];   // index.html 内联快照
  var PARTS = Object.create(null);   // id -> 部件内部 HTML 字符串
  var ready = false;

  /* ---------- 骨架参数（与 parts-core.svg 头注释一致） ---------- */
  var RIG = {
    child: { legX: [88, 112], legHip: 226, armL: [74, 174], armR: [126, 174], propDy: 24 },
    teen:  { legX: [89, 111], legHip: 212, armL: [78, 154], armR: [122, 154], propDy: 8 },
    adult: { legX: [90, 110], legHip: 206, armL: [80, 144], armR: [120, 144], propDy: 0 },
    mid:   { legX: [90, 110], legHip: 208, armL: [78, 146], armR: [122, 146], propDy: 2 },
    elder: { legX: [90, 110], legHip: 218, armL: [82, 156], armR: [118, 156], propDy: 12 }
  };

  /* ---------- 服装元数据（pants = 腿/裤显色，长袍下被摆遮住） ---------- */
  var OUTFITS = {
    cloth:     { name: '布衣',   pants: '#6e6250' },
    shortcoat: { name: '短褐',   pants: '#6b5a44' },
    scholar:   { name: '儒衫',   pants: '#4e5a68' },
    wuxia:     { name: '劲装',   pants: '#42403a' },
    silk:      { name: '绸衫',   pants: '#5c4a38' },
    official:  { name: '官服',   pants: '#3d3a3a' },
    medic:     { name: '青囊',   pants: '#6b6b70' },
    straw:     { name: '蓑衣',   pants: '#6e6250' },
    fine:      { name: '彩衣',   pants: '#a96e80', femaleOnly: true },
    qipao:     { name: '旗袍',   pants: '#5a4a6e', femaleOnly: true },
    student:   { name: '学生装', pants: '#2f3846' },
    suit:      { name: '西装',   pants: '#3c4148' },
    work:      { name: '工装',   pants: '#4c5666' },
    sport:     { name: '运动服', pants: '#4c4c56' },
    casual:    { name: '休闲装', pants: '#6b6b70' }
  };

  /* ---------- 发型映射（era × stage × gender） ---------- */
  var ANCIENT_HAIR = {
    child: { m: 'hair-child-m', f: 'hair-child-f' },
    teen:  { m: 'hair-teen-m',  f: 'hair-teen-f'  },
    adult: { m: 'hair-adult-m', f: 'hair-adult-f' },
    mid:   { m: 'hair-mid-m',   f: 'hair-mid-f'   },
    elder: { m: 'hair-elder-m', f: 'hair-elder-f' }
  };
  var HAIR_MAP = {
    ancient: ANCIENT_HAIR,
    minguo: {
      child: ANCIENT_HAIR.child,
      teen:  { m: 'hair-modern-m', f: 'hair-modern-f' },
      adult: { m: 'hair-modern-m', f: 'hair-modern-f' },
      mid:   { m: 'hair-modern-m', f: 'hair-mid-f'     },
      elder: ANCIENT_HAIR.elder
    },
    modern: {
      child: { m: 'hair-modern-m', f: 'hair-modern-f' },
      teen:  { m: 'hair-modern-m', f: 'hair-modern-f' },
      adult: { m: 'hair-modern-m', f: 'hair-modern-f' },
      mid:   { m: 'hair-modern-m', f: 'hair-modern-f' },
      elder: ANCIENT_HAIR.elder
    }
  };

  /* ---------- 加载部件库 ----------
     主源：index.html 内联 <script type="text/svg"> 快照 —— file:// 直接打开页面时
     浏览器禁止 fetch，内联副本保证人物正常加载与换装更新；
     兜底：fetch svg/*.svg（无内联块的部署形态）。
     同步约定：修改 svg/*.svg 后运行 node _tmp/build-inline-lib.js 重新生成内联块。 */
  function parseParts(text) {
    var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    var gs = doc.querySelectorAll('g[id]');
    for (var i = 0; i < gs.length; i++) {
      PARTS[gs[i].getAttribute('id')] = gs[i].innerHTML;
    }
  }
  function fetchParts(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
      return r.text();
    }).then(parseParts);
  }
  function init() {
    if (ready) return Promise.resolve();
    var inline = 0;
    INLINE_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.textContent && el.textContent.indexOf('<svg') >= 0) {
        parseParts(el.textContent);
        inline++;
      }
    });
    if (inline >= INLINE_IDS.length) { ready = true; return Promise.resolve(); }
    return Promise.all(CORE_URLS.map(fetchParts)).then(function () {
      ready = true;
    }).catch(function (err) {
      console.error('[lifeChars] 部件库加载失败：', err);
    });
  }

  function part(id) {
    return PARTS[id] ? '<g data-part="' + id + '">' + PARTS[id] + '</g>' : '';
  }
  function outfitId(outfit, stage) {
    return 'of-' + outfit + (stage === 'child' ? '-y' : '-a');
  }

  /* ---------- 占位剪影（部件库缺失时兜底） ---------- */
  var FALLBACK_SVG =
    '<svg viewBox="0 0 200 320"><g fill="#d9c9ab" stroke="#4a382c" stroke-width="3">' +
    '<circle cx="100" cy="90" r="42"/><path d="M74,150 Q100,140 126,150 L122,240 Q100,248 78,240 Z"/>' +
    '<path d="M84,240 L96,240 L94,306 L82,306 Z M104,240 L116,240 L118,306 L106,306 Z"/></g></svg>';

  /* ---------- 渲染 ---------- */
  var lastOpts = null;
  function render(opts) {
    lastOpts = opts;
    var mount = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
    if (!mount) return;
    if (!ready) { mount.innerHTML = FALLBACK_SVG; return; }

    var stage = RIG[opts.stage] ? opts.stage : 'adult';
    var rig = RIG[stage];
    var gender = opts.gender === '女' ? 'f' : 'm';
    var bodyId = 'body-' + stage + '-' + gender;
    var ofId = outfitId(opts.outfit, stage);
    var era = HAIR_MAP[opts.era] ? opts.era : 'ancient';
    var hairId = HAIR_MAP[era][stage][gender];

    var propDy = rig.propDy;
    var propsHtml = (opts.props || []).map(function (p) {
      var inner = PARTS['prop-' + p];
      return inner ? '<g transform="translate(0 ' + propDy + ')">' + inner + '</g>' : '';
    }).join('');

    var legFill = (OUTFITS[opts.outfit] || OUTFITS.cloth).pants;

    mount.innerHTML =
      '<svg class="life-figure" viewBox="0 0 200 320" aria-hidden="true">' +
        '<g class="fig-root">' +
          '<g data-part="' + bodyId + '">' + PARTS[bodyId] + '</g>' +
          '<g data-part="' + ofId + '">' + (PARTS[ofId] || '') + '</g>' +
          '<g data-part="' + hairId + '">' + (PARTS[hairId] || '') + '</g>' +
          propsHtml +
        '</g>' +
      '</svg>';

    // 按服装给裤腿上色（长袍摆下不可见，短打露出小腿即裤色）
    var legs = mount.querySelectorAll('.leg-main');
    for (var i = 0; i < legs.length; i++) legs[i].setAttribute('fill', legFill);

    bindAnim(mount, stage);
    if (opts.walking) startWalk(); else stopWalk();
  }

  function refresh() { if (lastOpts) render(lastOpts); }

  /* ---------- 行走动画（rAF 摆动腿臂 + 身体起伏） ---------- */
  var anim = { mount: null, rig: null, raf: 0, t: 0, amp: 0, target: 0, last: 0 };

  function bindAnim(mount, stage) {
    anim.mount = mount;
    anim.rig = RIG[stage];
    anim.el = {
      legL: mount.querySelector('.p-leg-l'),
      legR: mount.querySelector('.p-leg-r'),
      armL: mount.querySelector('.p-arm-l'),
      armR: mount.querySelector('.p-arm-r'),
      root: mount.querySelector('.fig-root')
    };
  }
  function frame(ts) {
    anim.raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (ts - (anim.last || ts)) / 1000);
    anim.last = ts;
    anim.target = anim.walking ? 1 : 0;
    anim.amp += (anim.target - anim.amp) * Math.min(1, dt * 6);
    if (anim.amp > 0.01) {
      anim.t += dt * 7.2 * anim.amp;
      var s = Math.sin(anim.t), r = anim.rig;
      var legSwing = 9 * anim.amp, armSwing = 5 * anim.amp;
      if (anim.el.legL) anim.el.legL.setAttribute('transform', 'rotate(' + (s * legSwing).toFixed(2) + ' ' + r.legX[0] + ' ' + r.legHip + ')');
      if (anim.el.legR) anim.el.legR.setAttribute('transform', 'rotate(' + (-s * legSwing).toFixed(2) + ' ' + r.legX[1] + ' ' + r.legHip + ')');
      if (anim.el.armL) anim.el.armL.setAttribute('transform', 'rotate(' + (-s * armSwing).toFixed(2) + ' ' + r.armL[0] + ' ' + r.armL[1] + ')');
      if (anim.el.armR) anim.el.armR.setAttribute('transform', 'rotate(' + (s * armSwing).toFixed(2) + ' ' + r.armR[0] + ' ' + r.armR[1] + ')');
      if (anim.el.root) anim.el.root.setAttribute('transform', 'translate(0 ' + (-Math.abs(Math.sin(anim.t)) * 3 * anim.amp).toFixed(2) + ')');
    } else if (anim.el.root && anim.el.root.getAttribute('transform')) {
      // 归位
      ['legL', 'legR', 'armL', 'armR'].forEach(function (k) {
        if (anim.el[k]) anim.el[k].removeAttribute('transform');
      });
      anim.el.root.removeAttribute('transform');
    }
  }
  function ensureLoop() {
    if (!anim.raf) { anim.last = 0; anim.raf = requestAnimationFrame(frame); }
  }
  function startWalk() { anim.walking = true; ensureLoop(); }
  function stopWalk()  { anim.walking = false; ensureLoop(); }

  /* ---------- 换装/换阶段 墨晕过渡 ---------- */
  function flash(mount) {
    var el = typeof mount === 'string' ? document.querySelector(mount) : mount;
    if (!el) return;
    var veil = document.createElement('div');
    veil.className = 'ink-flash';
    el.appendChild(veil);
    setTimeout(function () { veil.remove(); }, 620);
  }

  /* ---------- 导出 ---------- */
  window.__lifeChars = {
    init: init,
    render: render,
    refresh: refresh,
    flash: flash,
    startWalk: startWalk,
    stopWalk: stopWalk,
    OUTFITS: OUTFITS,
    HAIR_MAP: HAIR_MAP,
    RIG: RIG,
    isReady: function () { return ready; },
    listParts: function () { return Object.keys(PARTS); },
    /* 调试：强制渲染指定形象。force({stage:'teen',gender:'女',era:'ancient',outfit:'wuxia',props:['sword']}) */
    force: function (o) {
      render(Object.assign({
        mount: '#figure .fig-slot', stage: 'adult', gender: '男',
        era: 'ancient', outfit: 'cloth', props: [], walking: true
      }, o));
      return 'rendered';
    }
  };
})();

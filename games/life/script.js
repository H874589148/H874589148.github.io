/* ================================================================
   人生长卷 · 游戏引擎（script.js）
   ----------------------------------------------------------------
   依赖：data.js（window.__lifeData）→ chars.js（window.__lifeChars）
   职责：开局配置 → 0-5 岁叙事 → 抉择循环（5-44 每 2-3 年 / 45+ 每 3-5 年）
         → 随机事件 → 死亡判定 → 人生长卷结局
         + localStorage 自动存档 + WebAudio 古风音效 + 一键复制
   ================================================================ */
(function () {
'use strict';

var D = window.__lifeData;
var C = window.__lifeChars;
var $ = function (id) { return document.getElementById(id); };
var R = Math.random;
var SAVE_KEY = 'ee-life-save-v1';
var AUDIO_KEY = 'ee-life-audio';

/* ================= 状态 ================= */
var state = {
  era: null, occ: null, gender: null,
  attrs: { iq: 5, eq: 5, talent: 5, body: 5, wealth: 5, power: 5 },
  age: 0, tags: [], outfit: 'cloth', stage: 'child',
  log: [], alive: true, deathCause: null, flags_ill: null, used: []
};
function tagSet() { return state.tags; }          // tags 用数组存储便于序列化
function hasTag(t) { return state.tags.indexOf(t) >= 0; }
function addTag(t) { if (!hasTag(t)) state.tags.push(t); }
var A = state.attrs;

/* ================= 存档 ================= */
function saveGame() {
  if (!state.alive || state.age < 5) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, era: state.era, occ: state.occ, gender: state.gender,
      attrs: A, age: state.age, tags: state.tags, outfit: state.outfit,
      stage: state.stage, log: state.log, flags_ill: state.flags_ill,
      used: state.used
    }));
  } catch (e) { /* 存储失败静默 */ }
}
function loadGame() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || s.v !== 1 || !s.era) return null;
    return s;
  } catch (e) { return null; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

/* ================= 音频（WebAudio 程序化古风音效） ================= */
var AudioMan = {
  ctx: null, master: null, on: false, bgmTimer: 0,
  PENTA: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25],
  ensure: function () {
    if (this.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // 简易混响（feedback delay）
    this.wet = this.ctx.createGain(); this.wet.gain.value = 0.22;
    this.delay = this.ctx.createDelay(1.0); this.delay.delayTime.value = 0.28;
    this.fb = this.ctx.createGain(); this.fb.gain.value = 0.28;
    this.delay.connect(this.fb); this.fb.connect(this.delay);
    this.delay.connect(this.wet); this.wet.connect(this.ctx.destination);
  },
  pluck: function (freq, vol, dur) {
    if (!this.on || !this.ctx) return;
    var t = this.ctx.currentTime, vol2 = vol || 0.14, dur2 = dur || 2.2;
    var o1 = this.ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq;
    var o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq / 2;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur2);
    o1.connect(g); o2.connect(g);
    g.connect(this.master); g.connect(this.delay);
    o1.start(t); o2.start(t);
    o1.stop(t + dur2); o2.stop(t + dur2);
  },
  click: function () {
    if (!this.on || !this.ctx) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.07);
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.1);
  },
  scheduleBgm: function () {
    var self = this;
    if (this.bgmTimer) clearTimeout(this.bgmTimer);
    function loop() {
      if (!self.on) return;
      if (R() < 0.82) {
        var f = self.PENTA[Math.floor(R() * self.PENTA.length)] / (R() < 0.3 ? 2 : 1);
        self.pluck(f, 0.05 + R() * 0.04, 2.8);
        if (R() < 0.22) self.pluck(f * 1.5, 0.03, 2.0);
      }
      self.bgmTimer = setTimeout(loop, 1600 + R() * 2600);
    }
    loop();
  },
  setOn: function (v) {
    this.on = v;
    try { localStorage.setItem(AUDIO_KEY, v ? '1' : '0'); } catch (e) {}
    if (v) { this.ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); this.scheduleBgm(); }
    else if (this.bgmTimer) { clearTimeout(this.bgmTimer); this.bgmTimer = 0; }
    var b = $('btnAudio');
    if (b) b.textContent = v ? '🔊' : '🔇';
  },
  init: function () {
    var pref = null;
    try { pref = localStorage.getItem(AUDIO_KEY); } catch (e) {}
    this.setOn(pref === '1');   // 默认静音
  }
};

/* ================= 文案填充 ================= */
function fillText(t) {
  return t
    .replace('{occ}', state.occ || '')
    .replace('{age}', state.age)
    .replace('{era}', state.era || '')
    .replace('{classic}', D.CLASSICS[Math.floor(R() * D.CLASSICS.length)])
    .replace('{item}', D.ZHUAZHOU[eraGroup()][0])
    .replace('{omen}', D.ZHUAZHOU[eraGroup()][1])
    .replace('{bodyword}', A.body >= 5 ? '硬朗' : '偏弱')
    .replace('{nameSchool}', A.iq >= 8 ? '顶尖学府' : '一所重点大学')
    .replace('{rankText}', A.iq + A.talent >= 14 ? '进士及第' : (A.iq >= 8 ? '举人老爷' : '秀才功名'))
    .replace('{loveResult}', A.eq + A.talent >= 10
      ? '对方红着脸点了头。年少的喜欢，干净得像山泉。'
      : '对方愣了愣，笑着说「我们还是做朋友吧」。你难过了三天，然后长大了。')
    .replace('{gongResult}', A.iq + A.eq >= 12
      ? '笔试面试一路过关，你上岸了。铁饭碗端稳。'
      : '差了两分落榜。你收拾心情，继续在社会上摸爬滚打。')
    .replace('{startupResult}', A.eq + A.talent + A.wealth >= 18
      ? '三年后公司走上正轨，你们熬过了最难的时候。'
      : '十八个月后项目关停。赔了些钱，赚了一身本事。')
    .replace('{midStartupResult}', A.wealth + A.iq + A.talent >= 18
      ? '三年后公司站稳脚跟。庆功宴上你只喝了一杯就提前回家——这个年纪，拼的是命。'
      : '两年后项目清算。你把这段经历写进简历，面试官都多问了两句。')
    .replace('{startupAfter}', R() < 0.5 ? '后来上市了，你婉拒的故事成了饭桌上的遗憾' : '没撑过第二年，你暗自庆幸')
    .replace('{investResult}', R() < 0.5 ? '赶上了风口，账面数字让你夜里笑醒' : '市场教你做人，学费交得肉疼');
}

/* ================= 引擎基础 ================= */
var clamp = function (v) { return Math.max(0, Math.min(12, v)); };
function eraGroup() { return D.ERA_OF[state.era] || 'ancient'; }

function applyEff(eff) {
  var changed = {};
  if (!eff) return changed;
  Object.keys(eff).forEach(function (k) {
    A[k] = clamp(A[k] + eff[k]);
    changed[k] = eff[k];
  });
  renderChips(changed);
  return changed;
}
function deltaText(changed) {
  var parts = [];
  Object.keys(changed || {}).forEach(function (k) {
    if (!changed[k]) return;
    var name = D.ATTRS.filter(function (a) { return a[0] === k; })[0][1];
    parts.push('<span>' + name + ' ' + (changed[k] > 0 ? '+' : '') + changed[k] + '</span>');
  });
  return parts.join('');
}
function condOk(c) {
  if (!c) return true;
  if (c.minWealth && A.wealth < c.minWealth) return false;
  if (c.maxWealth && A.wealth > c.maxWealth) return false;
  if (c.minIq && A.iq < c.minIq) return false;
  if (c.minTalent && A.talent < c.minTalent) return false;
  if (c.minEq && A.eq < c.minEq) return false;
  if (c.minBody && A.body < c.minBody) return false;
  if (c.minPower && A.power < c.minPower) return false;
  if (c.maxPower && A.power > c.maxPower) return false;
  if (c.tag && !hasTag(c.tag)) return false;
  if (c.anytag && !c.anytag.some(function (t) { return hasTag(t); })) return false;
  if (c.notag && hasTag(c.notag)) return false;
  if (c.gender && state.gender !== c.gender) return false;
  return true;
}
function eraOk(era) { return era === 'any' || era === eraGroup(); }

/* 称号评定：data 的 TITLES[].ok 以 Set 语义访问 tags，这里做兼容转换 */
function evalTitle() {
  var s = Object.assign({}, state, { tags: new Set(state.tags) });
  return D.TITLES.filter(function (x) { return x.ok(s, A); })[0] || D.DEFAULT_TITLE;
}

/* ================= 人物渲染 ================= */
function stageOf(age) {
  return age < 15 ? 'child' : age < 25 ? 'teen' : age < 35 ? 'adult' : age < 65 ? 'mid' : 'elder';
}
/* 配饰按身份标签推导：头饰 + 手持物（+老年拐杖） */
function propsOf() {
  var head = hasTag('official') ? 'hat-official' : (state.outfit === 'straw' ? 'strawhat' : null);
  var hand = null;
  if (hasTag('knight') || hasTag('wuxia')) hand = 'sword';
  else if (hasTag('doctor') || hasTag('medic_path')) hand = 'gourd';
  else if (hasTag('tycoon') || hasTag('merchant_path')) hand = 'abacus';
  else if (hasTag('sport') || hasTag('runner')) hand = 'ball';
  else if (hasTag('student') || hasTag('overseas') || hasTag('university')) hand = 'bag';
  else if (hasTag('writing') || hasTag('mentor') || hasTag('teacher')) hand = 'brush';
  else if (hasTag('fisher') || hasTag('hermit')) hand = 'fan';
  else if (hasTag('scholar') || hasTag('studious') || hasTag('craft')) hand = 'book';
  var props = [];
  if (head) props.push(head);
  if (hand) props.push(hand);
  if (state.age >= 65 && props.length < 2) props.push('cane');
  return props;
}
function renderFigure() {
  C.render({
    mount: '#figure .fig-slot', stage: state.stage, gender: state.gender,
    era: eraGroup(), outfit: state.outfit, props: propsOf(), walking: true
  });
}
function refreshStage() {
  var st = stageOf(state.age);
  if (st !== state.stage) {
    state.stage = st;
    C.flash('#figure');
    renderFigure();
  }
}
function setOutfit(o) {
  if (o && C.OUTFITS[o] && state.outfit !== o) {
    if (C.OUTFITS[o].femaleOnly && state.gender !== '女') return;
    state.outfit = o;
    C.flash('#figure');
    renderFigure();
  }
}

/* ================= HUD ================= */
var CHIP_NAME = { iq: '智', eq: '情', talent: '才', body: '体', wealth: '财', power: '势' };
function renderChips(changed) {
  var c = $('chips');
  if (!c) return;
  c.innerHTML = D.ATTRS.map(function (a) {
    var k = a[0];
    return '<span class="chip ' + (changed && changed[k] ? 'up' : '') + '">' + CHIP_NAME[k] + ' <b>' + A[k] + '</b></span>';
  }).join('');
}
function renderHud() {
  $('ageBadge').innerHTML = '年龄 <b>' + state.age + '</b> 岁 <span class="hud-sub">· ' + state.era + ' · ' +
    (C.OUTFITS[state.outfit] || C.OUTFITS.cloth).name + '</span>';
}

/* ================= 叙事面板 ================= */
function story(tag, text, delta) {
  $('storyTag').textContent = tag;
  $('storyText').textContent = text;
  $('delta').innerHTML = delta ? deltaText(delta) : '';
  var s = $('story');
  s.style.animation = 'none'; void s.offsetWidth; s.style.animation = '';
}
function showButtons(list) {
  var box = $('options');
  box.innerHTML = '';
  list.forEach(function (b) {
    var btn = document.createElement('button');
    btn.className = 'opt';
    btn.innerHTML = b.t + (b.sub ? '<small>' + b.sub + '</small>' : '');
    btn.onclick = function () { AudioMan.click(); b.fn(); };
    box.appendChild(btn);
  });
}
function continueBtn(text, fn) { showButtons([{ t: text || '继续往前走 →', fn: fn }]); }

/* ================= 死亡判定 ================= */
function deathCheckPerYear() {
  if (state.age >= 95) { die('age'); return true; }
  var p = { ancient: 0.011, minguo: 0.009, modern: 0.005 }[eraGroup()];
  p += Math.max(0, state.age - 55) * 0.0009;
  p += Math.max(0, state.age - 80) * 0.012;
  p -= A.body * 0.0006;
  if (state.flags_ill) p += 0.045;
  if (state.flags_ill === 'half') p -= 0.02;
  if (R() < p) {
    die(state.flags_ill ? 'illness' : (R() < 0.3 ? 'accident' : 'age'));
    return true;
  }
  return false;
}

/* ================= 开局 ================= */
function pickGroup(containerId, items, onPick) {
  var c = $(containerId);
  c.innerHTML = '';
  items.forEach(function (it) {
    var d = document.createElement('div');
    d.className = 'pick'; d.textContent = it;
    d.onclick = function () {
      c.querySelectorAll('.pick').forEach(function (x) { x.classList.remove('selected'); });
      d.classList.add('selected');
      AudioMan.click();
      onPick(it);
    };
    c.appendChild(d);
  });
}
function renderAttrs() {
  var c = $('attrRows');
  c.innerHTML = '';
  D.ATTRS.forEach(function (a) {
    var row = document.createElement('div');
    row.className = 'attr-row';
    row.innerHTML = '<span class="attr-name">' + a[1] + '</span><span class="attr-desc">' + a[2] + '</span>' +
      '<div class="stepper"><button data-k="' + a[0] + '" data-d="-1">−</button>' +
      '<span class="val" id="val_' + a[0] + '">' + A[a[0]] + '</span>' +
      '<button data-k="' + a[0] + '" data-d="1">＋</button></div>';
    c.appendChild(row);
  });
  c.querySelectorAll('button').forEach(function (b) {
    b.onclick = function () {
      var k = b.dataset.k, d2 = +b.dataset.d;
      var used = Object.keys(A).reduce(function (s, kk) { return s + A[kk]; }, 0);
      var nv = A[k] + d2;
      if (nv < 1 || nv > 10) return;
      if (d2 > 0 && used >= D.TOTAL_POINTS) return;
      A[k] = nv;
      $('val_' + k).textContent = nv;
      updatePoints();
      AudioMan.click();
    };
  });
  updatePoints();
}
function usedPoints() { return Object.keys(A).reduce(function (s, k) { return s + A[k]; }, 0); }
function updatePoints() {
  $('pointsLeft').textContent = D.TOTAL_POINTS - usedPoints();
  refreshBegin();
}
function refreshBegin() {
  $('btnBegin').disabled = !(state.era && state.occ && state.gender && usedPoints() === D.TOTAL_POINTS);
}
function initSetup() {
  var eras = ['西汉','盛唐','北宋','大明','清朝','民国','现代'];
  pickGroup('eraCards', eras, function (era) {
    state.era = era; state.occ = null;
    var hint = $('occHint'); if (hint) hint.style.display = 'none';
    pickGroup('occCards', D.OCCUPATIONS[eraGroup()], function (occ) { state.occ = occ; refreshBegin(); });
    refreshBegin();
  });
  pickGroup('genderCards', ['男', '女'], function (g) { state.gender = g; refreshBegin(); });
  renderAttrs();

  // 续档按钮
  var save = loadGame();
  if (save) {
    var btn = $('btnContinue');
    btn.style.display = 'block';
    btn.textContent = '继续前生 · ' + save.era + save.occ + '之' + (save.gender === '男' ? '子' : '女') + '（' + save.age + '岁）';
    btn.onclick = function () { AudioMan.click(); resumeGame(save); };
  }
}
function applyOccBonus() {
  var b = D.OCC_BONUS[state.occ];
  if (!b) return;
  Object.keys(b).forEach(function (k) { A[k] = clamp(A[k] + b[k]); });
  var excess = Object.keys(A).reduce(function (s, k) { return s + A[k]; }, 0) - D.TOTAL_POINTS;
  var donors = Object.keys(A).filter(function (k) { return !b[k]; })
    .sort(function (x, y) { return A[y] - A[x]; });
  var guard = 0;
  while (excess > 0 && guard < 200) {
    var k = donors[guard % donors.length];
    if (A[k] > 1) { A[k]--; excess--; }
    guard++;
  }
}
function enterGame() {
  $('setup').style.display = 'none';
  $('game').style.display = 'flex';
  renderChips(); renderHud(); renderFigure();
  state.log.push({ age: 0, text: '出生于' + state.era + '，' + state.occ + '之家' });
  saveGame();
  infantFlow(0);
}
$('btnBegin').onclick = function () {
  applyOccBonus();
  AudioMan.click();
  enterGame();
};

function resumeGame(s) {
  state.era = s.era; state.occ = s.occ; state.gender = s.gender;
  state.attrs = s.attrs; A = state.attrs;
  state.age = s.age; state.tags = s.tags || []; state.outfit = s.outfit || 'cloth';
  state.stage = s.stage || stageOf(s.age); state.log = s.log || [];
  state.flags_ill = s.flags_ill || null; state.used = s.used || [];
  $('setup').style.display = 'none';
  $('game').style.display = 'flex';
  renderChips(); renderHud(); renderFigure();
  nextDecision();
}

/* ================= 0-5 岁叙事 ================= */
function infantFlow(i) {
  var pool = D.INFANT_TEXTS.filter(function (t) { return eraOk(t.era); });
  if (i === 0) {
    story('出生 · ' + state.era, fillText(pool[0].text));
    continueBtn('继续 →', function () { infantFlow(1); });
    return;
  }
  if (i <= 3) {
    var t = pool[1 + Math.floor(R() * (pool.length - 1))];
    story('幼年 · ' + (i * 2 - 1) + ' 岁', fillText(t.text));
    continueBtn('继续 →', function () { infantFlow(i + 1); });
    return;
  }
  state.age = 5;
  renderHud();
  nextDecision();
}

/* ================= 抉择主循环 ================= */
function usedIds() { return state.used; }
function markUsed(id) { if (usedIds().indexOf(id) < 0) usedIds().push(id); }

function nextDecision() {
  if (!state.alive) return;
  refreshStage();
  renderHud();
  var pool = D.DECISIONS.filter(function (e) {
    return usedIds().indexOf(e.id) < 0 && state.age >= e.min && state.age <= e.max &&
      eraOk(e.era) && condOk(e.cond) &&
      e.options.some(function (o) { return condOk(o.cond); });   /* 避免全选项被过滤后卡死 */
  });
  if (!pool.length) {
    rollYears(state.age < 45 ? 2 + Math.floor(R() * 2) : 3 + Math.floor(R() * 3), function () {
      if (state.alive) nextDecision();
    });
    return;
  }
  var ev = pool[Math.floor(R() * pool.length)];
  markUsed(ev.id);
  var opts = ev.options.filter(function (o) { return condOk(o.cond); });
  story('人生抉择 · ' + state.age + ' 岁', fillText(ev.text));
  showButtons(opts.map(function (o) {
    return { t: o.t, fn: function () { chooseOption(ev, o); } };
  }));
}

function chooseOption(ev, o) {
  var changed = applyEff(o.eff);
  (o.tags || []).forEach(addTag);
  if (o.cure) state.flags_ill = null;
  if (o.halftreat) state.flags_ill = 'half';
  if (o.notreat) state.flags_ill = 'full';
  if (o.outfit) setOutfit(o.outfit);
  state.log.push({ age: state.age, text: o.t.replace(/（.*?）/g, '').slice(0, 26) });
  story('结果 · ' + state.age + ' 岁', fillText(o.say), changed);
  saveGame();
  continueBtn('继续往前走 →', function () {
    var step = state.age < 45 ? 2 + Math.floor(R() * 2) : 3 + Math.floor(R() * 3);
    rollYears(step, function () { if (state.alive) nextDecision(); });
  });
}

/* ================= 岁月推进（含随机事件） ================= */
function rollYears(step, done) {
  var cards = [];
  for (var y = 1; y <= step; y++) {
    state.age++;
    renderHud();   /* 播卡期间 HUD 年龄实时跟进 */
    if (deathCheckPerYear()) return;
    var roll = R();
    if (roll < 0.10) {
      var mPool = D.RANDOM_MAJOR.filter(function (e) {
        return eraOk(e.era) && condOk(e.cond) && !(e.requireAge && state.age < e.requireAge) &&
          usedIds().indexOf(e.id) < 0 && (R() < (e.chance || 1));
      });
      if (mPool.length) {
        var ev = mPool[Math.floor(R() * mPool.length)];
        markUsed(ev.id);
        cards.push({ tag: '变故 · ' + state.age + ' 岁', text: ev.text, eff: ev.eff, major: true, ill: ev.ill, setTag: ev.setTag, setCause: ev.setCause });
      }
    } else if (roll < 0.45) {
      var sPool = D.RANDOM_MINOR.filter(function (e) { return eraOk(e.era) && condOk(e.cond); });
      if (sPool.length) {
        var ev2 = sPool[Math.floor(R() * sPool.length)];
        cards.push({ tag: '岁月 · ' + state.age + ' 岁', text: ev2.text, eff: ev2.eff });
      }
    }
  }
  if (!cards.length) {
    cards.push({ tag: '岁月 · ' + state.age + ' 岁', text: '日子如流水，平静无波地淌过。你按部就班地长大、变老。', eff: null });
  }
  playCards(cards, 0, done);
}

function playCards(cards, i, done) {
  if (i >= cards.length) { done(); return; }
  var c = cards[i];
  var changed = applyEff(c.eff);
  if (c.ill) state.flags_ill = 'full';
  if (c.setTag) addTag(c.setTag);
  if (c.setCause) {
    /* 兵祸/饥馑：有概率直接殁于此难，体力越高越易躲过 */
    var dp = Math.max(0.05, 0.32 - A.body * 0.022);
    if (R() < dp) {
      state.log.push({ age: state.age, text: c.text.replace(/【.*?】/g, '').slice(0, 28) + '，殁于此难' });
      story(c.tag, fillText(c.text) + ' 这一劫，你终究没能迈过去。', changed);
      continueBtn('此生止步于此…', function () { die(c.setCause); });
      return;
    }
  }
  if (c.major) {
    state.log.push({ age: state.age, text: c.text.replace(/【.*?】/g, '').slice(0, 28) });
    saveGame();
  }
  story(c.tag, fillText(c.text), changed);
  if (c.ill) {
    showButtons([
      { t: '不惜代价，全力救治', sub: '财富-3，祛除病根', fn: function () {
          if (A.wealth >= 3) {
            var ch = applyEff({ wealth: -3 });
            state.flags_ill = null;
            story('救治 · ' + state.age + ' 岁', '你散尽钱财求医问药，总算把命从鬼门关拉了回来。', ch);
          } else {
            story('救治 · ' + state.age + ' 岁', '家底单薄，你只能东拼西凑勉强医治。病去如抽丝，病根未除净。', null);
            state.flags_ill = 'half';
          }
          saveGame();
          continueBtn('继续 →', function () { playCards(cards, i + 1, done); });
        } },
      { t: '能扛就扛，听天由命', sub: '体力-2，病根缠身（此后身故风险上升）', fn: function () {
          var ch = applyEff({ body: -2 });
          state.flags_ill = 'full';
          story('硬扛 · ' + state.age + ' 岁', '你咬着牙挺过了最凶险的那几天，但从此落下了病根。', ch);
          saveGame();
          continueBtn('继续 →', function () { playCards(cards, i + 1, done); });
        } }
    ]);
    return;
  }
  continueBtn('继续 →', function () { playCards(cards, i + 1, done); });
}

/* ================= 结局：人生长卷 ================= */
function logText() {
  return state.log.map(function (l) { return l.age + '岁 · ' + l.text; }).join('\n');
}
function copyShare() {
  var t = evalTitle();
  var lines = [];
  lines.push('—— 人生长卷 ——');
  lines.push('享年 ' + state.age + ' 岁 · ' + (D.DEATH_CAUSES[state.deathCause] || '寿终正寝'));
  lines.push('称号：' + t.title);
  lines.push('盖棺论定：' + t.sub);
  lines.push('');
  lines.push(logText());
  var text = lines.join('\n');
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(fallback);
  } else fallback();
  var b = $('btnCopy');
  b.textContent = '已复制 ✓';
  setTimeout(function () { b.textContent = '一键复制长卷'; }, 1600);
}
function die(cause) {
  state.alive = false;
  state.deathCause = cause;
  clearSave();

  var t = evalTitle();
  var causeText = D.DEATH_CAUSES[cause] || '寿终正寝';

  $('game').style.display = 'none';
  C.stopWalk();
  var ed = $('ending');
  ed.style.display = 'block';
  $('endTitle').textContent = t.title;
  $('endAge').textContent = '享年 ' + state.age + ' 岁 · ' + causeText + ' · 生于' + state.era;
  $('endVerdict').innerHTML =
    '你是' + state.era + '一个<b>' + state.occ + '</b>之家的孩子，性别' + state.gender + '。<br>' +
    '这一生，智商 <b>' + A.iq + '</b> · 情商 <b>' + A.eq + '</b> · 天赋 <b>' + A.talent + '</b> · 体力 <b>' + A.body + '</b> · 财富 <b>' + A.wealth + '</b> · 权力 <b>' + A.power + '</b>。<br>' +
    '盖棺论定：<b>' + t.sub + '</b>。';
  $('endLog').innerHTML =
    '<div class="li head">—— 人生长卷 · 大事记 ——</div>' +
    state.log.map(function (l) {
      return '<div class="li"><span class="y">' + l.age + '岁</span>' + l.text + '</div>';
    }).join('');
  $('btnCopy').onclick = copyShare;
  $('btnRestart').onclick = function () { AudioMan.click(); location.reload(); };
}

/* ================= 随时查看长卷 ================= */
function openScroll() {
  var ov = $('scrollOverlay');
  $('scrollList').innerHTML = state.log.length
    ? state.log.map(function (l) { return '<div class="li"><span class="y">' + l.age + '岁</span>' + l.text + '</div>'; }).join('')
    : '<div class="li">长卷尚白，此生刚启。</div>';
  ov.style.display = 'flex';
}
function closeScroll() { $('scrollOverlay').style.display = 'none'; }

/* ================= 启动 ================= */
C.init().then(function () {
  initSetup();
  AudioMan.init();
  $('btnAudio').onclick = function () { AudioMan.setOn(!AudioMan.on); };
  $('btnScroll').onclick = openScroll;
  $('scrollClose').onclick = closeScroll;
  $('scrollOverlay').onclick = function (e) { if (e.target === this) closeScroll(); };
});

/* ================= 调试句柄 ================= */
window.__life = {
  raw: function () { return state; },
  data: D,
  state: function () {
    return {
      era: state.era, occ: state.occ, gender: state.gender, age: state.age,
      attrs: Object.assign({}, A), tags: state.tags.slice(), outfit: state.outfit,
      stage: state.stage, alive: state.alive, log: state.log.length, used: state.used.length
    };
  },
  pickSetup: function (era, occ, gender) {
    document.querySelectorAll('#eraCards .pick').forEach(function (d) { if (d.textContent === era) d.click(); });
    document.querySelectorAll('#occCards .pick').forEach(function (d) { if (d.textContent === occ) d.click(); });
    document.querySelectorAll('#genderCards .pick').forEach(function (d) { if (d.textContent === gender) d.click(); });
  },
  setAttr: function (k, v) { A[k] = clamp(v); renderChips(); },
  addTag: addTag,
  begin: function () { $('btnBegin').click(); },
  clickFirst: function () {
    var b = document.querySelector('#options .opt');
    if (b) { b.click(); return true; }
    return false;
  },
  storyText: function () { return $('storyText').textContent; },
  optionsCount: function () { return document.querySelectorAll('#options .opt').length; },
  ending: function () {
    return {
      shown: $('ending').style.display === 'block',
      title: $('endTitle').textContent,
      age: $('endAge').textContent,
      logItems: document.querySelectorAll('#endLog .li').length
    };
  },
  forceAge: function (x) { state.age = x; renderHud(); refreshStage(); },
  /* 快进：自动连点第一项直到死亡或次数用尽 */
  fast: function (n) {
    var count = 0, maxN = n || 999;
    function step() {
      if (!state.alive || count >= maxN) return 'done(' + count + ')';
      count++;
      if (!window.__life.clickFirst()) return 'no-btn@' + count;
      setTimeout(step, 30);
      return 'running';
    }
    return step();
  }
};
})();

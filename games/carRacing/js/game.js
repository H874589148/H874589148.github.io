'use strict';

/* ================= 游戏主控 / UI ================= */

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const view = { w: 0, h: 0, dpr: 1 };

const SAVE_KEY = 'cartoon_rush_save_v1';
let save = { coins: 120, best: 0, body: 'sport', color: '#FF5A3C', owned: ['sport'] };

const RIVAL_NAMES = ['疾风莉莉', '老司机王叔', '铁皮博格', '橡皮丹', '涡轮强尼', '喵喵车手', '闪电阿泰'];
const RANK_BONUS = [160, 120, 95, 75, 58, 45, 34, 25];
const SCREENS = ['menu', 'garage', 'pause', 'gameover'];

let state = 'menu';   // menu | garage | countdown | race | crashed | over | paused
let rafId = null;
let lastT = 0;
let gT = 0;
let steerSmooth = 0;
let run = null;
let armedBody = null;
let armedTimer = 0;
let toastTimer = null;

/* ---------- 存档 ---------- */
function loadSave(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw){
      const d = JSON.parse(raw);
      if (d && typeof d === 'object') save = Object.assign(save, d);
    }
  }catch(e){ /* 隐私模式等场景忽略 */ }
}
function persist(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }catch(e){}
}

/* ---------- 画布 ---------- */
function resize(){
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}
window.addEventListener('resize', resize);

/* ---------- 输入 ---------- */
const input = { left: false, right: false };
const pointerMap = new Map();
let keyL = false, keyR = false;

function recomputeInput(){
  const vals = [...pointerMap.values()];
  input.left = keyL || vals.includes(-1);
  input.right = keyR || vals.includes(1);
}
function steerNow(){ return (input.right ? 1 : 0) - (input.left ? 1 : 0); }

window.addEventListener('pointerdown', e => {
  if (state !== 'race') return;
  if (e.target !== canvas) return;
  pointerMap.set(e.pointerId, e.clientX < view.w / 2 ? -1 : 1);
  recomputeInput();
});
window.addEventListener('pointerup', e => {
  pointerMap.delete(e.pointerId);
  recomputeInput();
});
window.addEventListener('pointercancel', e => {
  pointerMap.delete(e.pointerId);
  recomputeInput();
});
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'){ keyL = true; recomputeInput(); }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'){ keyR = true; recomputeInput(); }
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P'){
    if (state === 'race') pauseGame();
    else if (state === 'paused') resumeGame();
  }
  if (e.key === 'Enter' && !e.repeat){
    if (state === 'menu') startRace();
    else if (state === 'over') startRace();
  }
});
window.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'){ keyL = false; recomputeInput(); }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'){ keyR = false; recomputeInput(); }
});
window.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'race') pauseGame();
});

/* ---------- UI 基础 ---------- */
function showScreen(name){
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
}
function toast(msg){
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}
function updateMenuBadges(){
  $('menuBest').textContent = save.best;
  $('menuCoins').textContent = save.coins;
}

/* ---------- 比赛流程 ---------- */
function startRace(){
  resetTrack();
  run = {
    dist: 0, dodges: 0, near: 0, score: 0,
    countdown: 2.4, crashT: 0, over: false,
    prevPz: PLAYER_Z, shake: 0,
    floaters: [], parts: []
  };
  state = 'countdown';
  showScreen(null);
  $('hud').classList.remove('hidden');
  updateHUD();
}

function countdownUpdate(dt){
  run.countdown -= dt;
  if (run.countdown <= 0){
    state = 'race';
    addFloater('出发！', '#3ECF8E');
  }
}

function raceUpdate(dt){
  const diff = difficultyAt(position);
  const target = START_SPEED + 8500 * diff;
  speed = Math.min(target, speed + 3200 * dt);
  position += speed * dt;
  const pz = position + PLAYER_Z;
  const pSeg = segByIndex(Math.floor(pz / SEG_LEN));
  if (!pSeg) return;
  const dx = dt * 2.3 * (speed / MAX_SPEED);
  playerX += steerNow() * dx;
  playerX -= dx * (speed / MAX_SPEED) * pSeg.curve * 0.33;
  playerX = clamp(playerX, -0.9, 0.9);
  bgShift += pSeg.curve * speed * dt * 0.000012;

  ensureTrack();
  spawnCars(diff);
  updateCars(dt);

  run.dist = pz / 40;
  if (checkStatic(pz)) return;
  if (checkCars(pz)) return;
  run.prevPz = pz;
  updateHUD();
}

function checkStatic(pz){
  const segIdx = Math.floor(pz / SEG_LEN);
  for (let n = -2; n <= 1; n++){
    const seg = segByIndex(segIdx + n);
    if (!seg) continue;
    for (const spr of seg.sprites){
      if (Math.abs(spr.offset) > 1.1) continue;   // 路边装饰不碰撞
      const sprZ = seg.index * SEG_LEN + SEG_LEN * 0.5;
      if (run.prevPz < sprZ && pz >= sprZ){
        const dxl = Math.abs(playerX - spr.offset);
        const halfSum = (OB_W[spr.type] + PLAYER_W) / 2 / ROAD_W;
        if (dxl < halfSum){
          doCrash();
          return true;
        }
        if (dxl < halfSum + 0.16){
          run.near++;
          addFloater('惊险躲避 +40', '#FFC53D', 0.5, 0.66);
        } else {
          run.dodges++;
        }
      }
    }
  }
  return false;
}

function checkCars(pz){
  for (const c of cars){
    if (pz > c.z - 300 && pz < c.z + 420 && Math.abs(c.x - playerX) < 0.4){
      doCrash();
      return true;
    }
  }
  return false;
}

function doCrash(){
  state = 'crashed';
  run.crashT = 0;
  run.shake = 0.6;
  initSmoke();
}

function crashUpdate(dt){
  run.crashT += dt;
  run.shake = Math.max(0, run.shake - dt);
  speed = Math.max(0, speed - 16000 * dt);
  position += speed * dt;
  ensureTrack();
  if (run.crashT > 1.6 && !run.over){
    run.over = true;
    finishRace();
  }
}

function finishRace(){
  run.score = Math.floor(run.dist) + run.dodges * 30 + run.near * 40;
  const board = RIVAL_NAMES.map(n => ({
    name: n,
    score: Math.max(30, Math.round(run.score * rand(0.35, 1.32) + rand(-40, 150)))
  }));
  board.push({ name: '你', score: run.score, me: true });
  board.sort((a, b) => b.score - a.score);
  const rank = board.findIndex(e => e.me) + 1;
  const coinsEarned = RANK_BONUS[rank - 1] + Math.floor(run.score / 200);
  save.coins += coinsEarned;
  if (run.score > save.best) save.best = run.score;
  persist();

  $('goRank').textContent = '第 ' + rank + ' 名';
  $('goRankSub').textContent = '8 名车手同场竞技 · 排名越靠前金币越多';
  $('goScore').textContent = run.score;
  $('goDist').textContent = Math.floor(run.dist) + ' m';
  $('goDodge').textContent = (run.dodges + run.near) + ' 次';
  $('goCoins').textContent = '+' + coinsEarned + ' 金币';
  const ol = $('goBoard');
  ol.innerHTML = '';
  board.forEach((e, i) => {
    const li = document.createElement('li');
    if (e.me) li.className = 'me';
    const sp1 = document.createElement('span');
    sp1.textContent = (i + 1) + '. ' + e.name;
    const sp2 = document.createElement('span');
    sp2.textContent = e.score;
    li.appendChild(sp1);
    li.appendChild(sp2);
    ol.appendChild(li);
  });
  $('hud').classList.add('hidden');
  showScreen('gameover');
  state = 'over';
}

/* ---------- 演示模式（菜单/车库背景） ---------- */
function autopilot(dt){
  const pz = position + PLAYER_Z;
  const blocked = [false, false, false];
  const startIdx = Math.floor(pz / SEG_LEN);
  for (let n = 6; n < 80; n++){
    const seg = segByIndex(startIdx + n);
    if (!seg) break;
    for (const s of seg.sprites){
      if (Math.abs(s.offset) < 1.1) blocked[laneOfOffset(s.offset)] = true;
    }
  }
  for (const c of cars){
    if (c.z > pz && c.z < pz + 80 * SEG_LEN) blocked[laneOfOffset(c.x)] = true;
  }
  const cur = laneOfOffset(playerX);
  let target = LANE_X[cur];
  if (blocked[cur]){
    const free = [0, 1, 2].filter(l => !blocked[l]);
    if (free.length){
      free.sort((a, b) => Math.abs(LANE_X[a] - playerX) - Math.abs(LANE_X[b] - playerX));
      target = LANE_X[free[0]];
    }
  }
  playerX += clamp(target - playerX, -dt * 1.6, dt * 1.6);
}

function demoUpdate(dt){
  speed = 8500;
  position += speed * dt;
  const pSeg = segByIndex(Math.floor((position + PLAYER_Z) / SEG_LEN));
  if (pSeg) bgShift += pSeg.curve * speed * dt * 0.000012;
  autopilot(dt);
  ensureTrack();
  spawnCars(0.3);
  updateCars(dt);
}

/* ---------- 粒子与漂浮文字 ---------- */
function addFloater(text, color, xFrac, yFrac){
  run.floaters.push({ text, color: color || '#FFC53D', x: xFrac || 0.5, y: yFrac || 0.6, life: 1.2 });
}

function initSmoke(){
  run.parts = [];
  const ps = lastPlayerScreen;
  for (let i = 0; i < 16; i++){
    run.parts.push({
      px: ps.x + rand(-0.35, 0.35) * ps.w,
      py: ps.y - rand(0, 0.5) * ps.w,
      vx: rand(-60, 60),
      vy: rand(-140, -30),
      r: rand(8, 24) * (ps.w / 300),
      life: rand(0.7, 1.4)
    });
  }
}

function drawParts(ctx, dt){
  for (const p of run.parts){
    p.px += p.vx * dt;
    p.py += p.vy * dt;
    p.vy += 40 * dt;
    p.life -= dt;
    if (p.life <= 0) continue;
    ctx.globalAlpha = Math.min(0.7, p.life * 0.6);
    ctx.fillStyle = '#5A5266';
    ctx.beginPath();
    ctx.arc(p.px, p.py, p.r * (1.6 - p.life * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  run.parts = run.parts.filter(p => p.life > 0);
}

function drawFloaters(ctx, w, h, dt){
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.round(Math.min(w, h) * 0.05);
  for (const f of run.floaters){
    f.life -= dt;
    f.y -= dt * 0.07;
    if (f.life <= 0) continue;
    ctx.globalAlpha = Math.min(1, f.life * 2);
    ctx.font = '400 ' + fs + 'px "ZCOOL KuaiLe"';
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.008);
    ctx.strokeStyle = PAL.ink;
    ctx.lineJoin = 'round';
    ctx.strokeText(f.text, f.x * w, f.y * h);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x * w, f.y * h);
  }
  ctx.globalAlpha = 1;
  run.floaters = run.floaters.filter(f => f.life > 0);
}

function drawCountdown(ctx, w, h){
  const n = Math.max(1, Math.ceil(run.countdown / 0.8));
  const frac = (run.countdown % 0.8) / 0.8;
  const s = 1 + frac * 0.35;
  ctx.save();
  ctx.translate(w / 2, h * 0.38);
  ctx.scale(s, s);
  ctx.rotate(-0.05);
  ctx.font = '400 ' + Math.round(h * 0.16) + 'px "ZCOOL KuaiLe"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = h * 0.014;
  ctx.strokeStyle = PAL.ink;
  ctx.lineJoin = 'round';
  ctx.strokeText(String(n), 0, 0);
  ctx.fillStyle = n === 1 ? '#FFC53D' : '#FFF6E3';
  ctx.fillText(String(n), 0, 0);
  ctx.restore();
}

/* ---------- HUD ---------- */
function updateHUD(){
  const score = Math.floor(run.dist) + run.dodges * 30 + run.near * 40;
  $('hudScore').textContent = score;
  $('hudDist').textContent = Math.floor(run.dist) + ' m';
  $('hudSpeed').textContent = Math.round(speed / 45);
  $('hudCoins').textContent = save.coins;
}

/* ---------- 渲染 ---------- */
function render(dt){
  const w = view.w, h = view.h;
  steerSmooth += (steerNow() - steerSmooth) * Math.min(1, dt * 10);
  ctx.save();
  if (run && run.shake > 0){
    ctx.translate(rand(-1, 1) * run.shake * 16, rand(-1, 1) * run.shake * 12);
  }
  renderScene(ctx, w, h, {
    t: gT,
    color: save.color,
    body: save.body,
    steer: steerSmooth,
    spin: (state === 'crashed') ? Math.sin(run.crashT * 13) * Math.min(1, run.crashT * 2.5) * 0.55 : 0
  });
  ctx.restore();

  if (run){
    if (run.parts.length) drawParts(ctx, dt);
    if (run.floaters.length) drawFloaters(ctx, w, h, dt);
  }
  if (state === 'countdown') drawCountdown(ctx, w, h);
  if (state === 'garage') renderPreview();
}

function renderPreview(){
  const cv = $('previewCanvas');
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  c.fillStyle = 'rgba(43,33,56,0.18)';
  c.beginPath();
  c.ellipse(cv.width / 2, 330, 132, 26, 0, 0, Math.PI * 2);
  c.fill();
  drawCar(c, cv.width / 2, 326 + Math.sin(gT * 2) * 4, 250, { color: save.color, body: save.body, t: gT });
}

/* ---------- 主循环 ---------- */
function frame(ts){
  rafId = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016);
  lastT = ts;
  gT += dt;
  if (armedBody !== null){
    armedTimer -= dt;
    if (armedTimer <= 0){ armedBody = null; buildGarage(); }
  }
  if (state === 'menu' || state === 'garage') demoUpdate(dt);
  else if (state === 'countdown') countdownUpdate(dt);
  else if (state === 'race') raceUpdate(dt);
  else if (state === 'crashed') crashUpdate(dt);
  render(dt);
}

/* ---------- 暂停 ---------- */
function pauseGame(){
  if (state !== 'race') return;
  state = 'paused';
  cancelAnimationFrame(rafId);
  rafId = null;
  showScreen('pause');
}
function resumeGame(){
  if (state !== 'paused') return;
  state = 'race';
  showScreen(null);
  lastT = performance.now();
  rafId = requestAnimationFrame(frame);
}

/* ---------- 车库 ---------- */
const COIN_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#FFC53D" stroke="#2B2138" stroke-width="2.4"/><circle cx="12" cy="12" r="5" fill="none" stroke="#B87A12" stroke-width="2"/></svg>';

function openGarage(){
  resetTrack();
  state = 'garage';
  armedBody = null;
  showScreen('garage');
  buildGarage();
}

function buildGarage(){
  $('garageCoins').textContent = save.coins;
  const wrap = $('bodyCards');
  wrap.innerHTML = '';
  for (const [id, cfg] of Object.entries(CAR_BODIES)){
    const owned = save.owned.includes(id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'body-card' + (save.body === id ? ' sel' : '');
    const cv = document.createElement('canvas');
    cv.width = 150;
    cv.height = 108;
    drawCar(cv.getContext('2d'), 75, 94, 88, { color: save.color, body: id, t: 0 });
    card.appendChild(cv);
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = cfg.name;
    card.appendChild(nm);
    const pr = document.createElement('span');
    pr.className = 'pr';
    if (save.body === id){
      pr.classList.add('own');
      pr.textContent = '使用中';
    } else if (owned){
      pr.classList.add('own');
      pr.textContent = '已拥有';
    } else if (armedBody === id){
      pr.classList.add('armed');
      pr.textContent = '再点一次确认';
    } else {
      pr.innerHTML = COIN_SVG + ' ' + cfg.price;
    }
    card.appendChild(pr);
    card.addEventListener('click', () => onBodyCard(id));
    wrap.appendChild(card);
  }

  const dots = $('colorDots');
  dots.innerHTML = '';
  for (const c of CAR_COLORS){
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'dot' + (save.color === c.hex ? ' sel' : '');
    d.style.background = c.hex;
    d.title = c.name;
    d.setAttribute('aria-label', c.name);
    d.addEventListener('click', () => {
      save.color = c.hex;
      persist();
      buildGarage();
      toast(c.name + ' 车漆已上车');
    });
    dots.appendChild(d);
  }
}

function onBodyCard(id){
  if (save.owned.includes(id)){
    if (save.body !== id){
      save.body = id;
      persist();
      armedBody = null;
      buildGarage();
      toast(CAR_BODIES[id].name + ' 已上场');
    }
    return;
  }
  const price = CAR_BODIES[id].price;
  if (armedBody === id){
    if (save.coins >= price){
      save.coins -= price;
      save.owned.push(id);
      save.body = id;
      persist();
      armedBody = null;
      buildGarage();
      updateMenuBadges();
      toast('购买成功 · ' + CAR_BODIES[id].name + ' 已上场');
    } else {
      armedBody = null;
      buildGarage();
      toast('金币不足，还差 ' + (price - save.coins) + ' 枚');
    }
  } else {
    armedBody = id;
    armedTimer = 3;
    buildGarage();
    toast('再点一次确认购买 · ' + price + ' 金币');
  }
}

/* ---------- 按钮 ---------- */
$('btnStart').addEventListener('click', startRace);
$('btnGarage').addEventListener('click', openGarage);
$('btnGarageBack').addEventListener('click', () => {
  state = 'menu';
  showScreen('menu');
  updateMenuBadges();
});
$('btnPause').addEventListener('click', pauseGame);
$('btnResume').addEventListener('click', resumeGame);
$('btnQuit').addEventListener('click', () => {
  state = 'menu';
  resetTrack();
  $('hud').classList.add('hidden');
  showScreen('menu');
  updateMenuBadges();
});
$('btnRetry').addEventListener('click', startRace);
$('btnGoGarage').addEventListener('click', openGarage);
$('btnGoMenu').addEventListener('click', () => {
  state = 'menu';
  resetTrack();
  showScreen('menu');
  updateMenuBadges();
});

/* ---------- 启动 ---------- */
function init(){
  loadSave();
  resize();
  resetTrack();
  updateMenuBadges();
  if (document.fonts && document.fonts.load){
    document.fonts.load('400 40px "ZCOOL KuaiLe"');
  }
  lastT = performance.now();
  rafId = requestAnimationFrame(frame);
}
init();

'use strict';

/* ================= 伪 3D 赛道引擎 ================= */

const SEG_LEN    = 200;                       // 每段长度（世界单位）
const RUMBLE_LEN = 3;                         // 路缘交替周期
const ROAD_W     = 2000;                      // 路面半宽（世界单位）
const CAM_H      = 1350;                      // 相机高度
const DRAW_DIST  = 190;                       // 绘制段数
const FOV        = 100;
const CAM_DEPTH  = 1 / Math.tan((FOV / 2) * Math.PI / 180);
const PLAYER_Z   = CAM_H * CAM_DEPTH;         // 玩家车所在平面距相机
const PLAYER_W   = 700;                       // 玩家车世界宽度
const LANE_X     = [-0.66, 0, 0.66];          // 三车道中心（playerX 单位）
const MAX_SPEED  = 15000;
const START_SPEED = 6500;

let segments = [];      // {index,p1,p2,curve,sprites,cars,color,clip,fogA}
let trackEnd = 0;       // 已生成的绝对段数
let position  = 0;      // 相机绝对 z
let playerX   = 0;      // 横向位置（±1 = 路缘）
let speed     = 0;
let playerY   = 0;      // 玩家所在路面高度
let bgShift   = 0;      // 背景视差累计
let cars      = [];     // 对手车
let safeLane  = 1;      // 障碍生成时保证通行的车道

/* ---------- 小工具 ---------- */
const clamp    = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp     = (a, b, p) => a + (b - a) * p;
const rand     = (a, b) => a + Math.random() * (b - a);
const randInt  = (a, b) => Math.floor(rand(a, b + 1));
const randPick = arr => arr[Math.floor(Math.random() * arr.length)];

function easeInOut(a, b, p){ return a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5); }
function easeIn(a, b, p){ return a + (b - a) * Math.pow(p, 2); }

function lastY(){ return segments.length ? segments[segments.length - 1].p2.world.y : 0; }

function difficultyAt(pos){ return clamp(pos / 1500000, 0, 1); }

function laneOfOffset(off){ return clamp(Math.round(off / 0.66) + 1, 0, 2); }

/* ---------- 赛段 ---------- */
function addSegment(curve, y){
  const n = trackEnd++;
  segments.push({
    index: n,
    p1: { world: { y: lastY(), z: n * SEG_LEN }, camera: {}, screen: {} },
    p2: { world: { y: y, z: (n + 1) * SEG_LEN }, camera: {}, screen: {} },
    curve,
    sprites: [],
    cars: [],
    color: Math.floor(n / RUMBLE_LEN) % 2
  });
}

/* enter/hold/leave 为段数，curve 为弯度，dy 为总坡度高差 */
function addRoad(enter, hold, leave, curve, dy){
  const startY = lastY();
  const total = enter + hold + leave;
  let done = 0;
  for (let i = 0; i < enter; i++, done++) addSegment(easeIn(0, curve, i / enter), startY + dy * easeInOut(0, 1, (done + 1) / total));
  for (let i = 0; i < hold; i++, done++) addSegment(curve, startY + dy * easeInOut(0, 1, (done + 1) / total));
  for (let i = 0; i < leave; i++, done++) addSegment(easeIn(curve, 0, i / leave), startY + dy * easeInOut(0, 1, (done + 1) / total));
}

function segByIndex(idx){
  if (!segments.length) return null;
  const i = idx - segments[0].index;
  return (i >= 0 && i < segments.length) ? segments[i] : null;
}

/* ---------- 障碍物生成 ---------- */
function pickObstacle(){
  const r = Math.random();
  if (r < 0.3)  return 'cone';
  if (r < 0.55) return 'barrel';
  if (r < 0.76) return 'tire';
  return 'hammer';
}

/* 在 [from, to) 段上撒障碍与路边装饰，diff 为该处难度 */
function decorate(from, to, diff){
  const futureSpeed = START_SPEED + 8500 * diff;
  const timeGap = lerp(1.15, 0.6, diff);
  let i = from + 14;
  while (i < to - 6){
    const gap = Math.max(9, Math.round(timeGap * futureSpeed / SEG_LEN) + randInt(0, 5));
    if (Math.random() < 0.4) safeLane = clamp(safeLane + randPick([-1, 1]), 0, 2);
    const others = [0, 1, 2].filter(l => l !== safeLane);
    const lanes = (Math.random() < 0.18 + diff * 0.3) ? others : [randPick(others)];
    const seg = segByIndex(i);
    if (seg){
      for (const ln of lanes){
        seg.sprites.push({ type: pickObstacle(), offset: LANE_X[ln] + rand(-0.05, 0.05) });
      }
      /* 路边树 */
      if (Math.random() < 0.55){
        const side = Math.random() < 0.5 ? -1 : 1;
        seg.sprites.push({ type: 'tree', offset: side * rand(1.35, 1.95) });
      }
    }
    i += gap;
  }
}

/* ---------- 赛道块（随机路线） ---------- */
function addChunk(){
  const from = trackEnd;
  const r = Math.random();
  let bigCurve = 0;
  if (r < 0.16){
    addRoad(20, 34, 20, 0, 0);                                        // 直道
  } else if (r < 0.34){
    addRoad(28, 46, 28, randPick([2, 2.6, -2, -2.6]), 0);             // 缓弯
  } else if (r < 0.48){
    bigCurve = randPick([4.6, 5.4, -4.6, -5.4]);
    addRoad(22, 36, 22, bigCurve, 0);                                 // 急弯
  } else if (r < 0.62){
    addRoad(18, 30, 18, 0, randPick([1, -1]) * randInt(3800, 7200));  // 长上下坡
  } else if (r < 0.8){
    const c = randPick([2.6, 3.4, -2.6, -3.4]);
    addRoad(20, 24, 20, c, randInt(-2600, 2600));                     // S 弯
    addRoad(20, 24, 20, -c, randInt(-2600, 2600));
  } else {
    addRoad(24, 38, 24, randPick([2, 3, -2, -3]), randPick([1, -1]) * randInt(4200, 8200)); // 山丘弯道
  }
  const diff = difficultyAt(trackEnd * SEG_LEN);
  decorate(from, trackEnd, diff);
  /* 急弯外侧放箭头指示牌 */
  if (Math.abs(bigCurve) >= 4){
    const dir = bigCurve > 0 ? 1 : -1;
    for (let i = from + 8; i < trackEnd - 4; i += 10){
      const seg = segByIndex(i);
      if (seg) seg.sprites.push({ type: 'sign', offset: -dir * 1.28, dir });
    }
  }
}

/* ---------- 赛道维护 ---------- */
function ensureTrack(){
  while (trackEnd * SEG_LEN < position + (DRAW_DIST + 80) * SEG_LEN) addChunk();
  const drop = Math.floor(position / SEG_LEN) - segments[0].index - 60;
  if (drop > 0) segments.splice(0, drop);
}

function resetTrack(){
  segments = []; trackEnd = 0; position = 0; playerX = 0; speed = 0;
  safeLane = 1; cars = []; bgShift = 0;
  addRoad(10, 30, 10, 0, 0);            // 起步直道
  while (trackEnd < DRAW_DIST + 80) addChunk();
}

/* ---------- 对手车 ---------- */
function laneBlockedAt(z, lane){
  const idx = Math.floor(z / SEG_LEN);
  for (let n = -12; n <= 12; n++){
    const seg = segByIndex(idx + n);
    if (seg){
      for (const s of seg.sprites){
        if (Math.abs(s.offset) < 1.1 && laneOfOffset(s.offset) === lane) return true;
      }
    }
  }
  for (const o of cars){
    if (Math.abs(o.z - z) < 3200 && laneOfOffset(o.x) === lane) return true;
  }
  return false;
}

function spawnCars(diff){
  const target = 1 + Math.round(diff * 3);
  const pz = position + PLAYER_Z;
  cars = cars.filter(c => c.z > position - 2000 && c.z < pz + DRAW_DIST * SEG_LEN * 1.2);
  if (cars.length >= target || Math.random() > 0.035) return;
  const lane = randInt(0, 2);
  if (laneBlockedAt(pz + rand(0.35, 0.8) * DRAW_DIST * SEG_LEN, lane)) return;
  cars.push({
    z: pz + rand(0.35, 0.8) * DRAW_DIST * SEG_LEN,
    x: LANE_X[lane],
    lane,
    speed: (START_SPEED + 8500 * diff) * rand(0.5, 0.7),
    body: randPick(['sport', 'muscle', 'buggy']),
    color: randPick(CAR_COLORS).hex,
    changeT: rand(3, 8),
    tx: LANE_X[lane]
  });
}

function tryCarLaneChange(c){
  const nl = clamp(c.lane + randPick([-1, 1]), 0, 2);
  if (nl === c.lane) return;
  if (laneBlockedAt(c.z, nl)) return;
  c.lane = nl;
  c.tx = LANE_X[nl];
}

function updateCars(dt){
  for (const c of cars){
    c.z += c.speed * dt;
    c.changeT -= dt;
    if (c.changeT <= 0){
      c.changeT = rand(3, 8);
      tryCarLaneChange(c);
    }
    if (c.tx !== c.x){
      c.x += clamp(c.tx - c.x, -dt * 0.9, dt * 0.9);
      if (Math.abs(c.tx - c.x) < 0.02) c.x = c.tx;
    }
  }
}

function assignCarsToSegments(){
  for (const s of segments) s.cars.length = 0;
  for (const c of cars){
    const seg = segByIndex(Math.floor(c.z / SEG_LEN));
    if (seg) seg.cars.push(c);
  }
}

'use strict';

/* ================= 渲染层 ================= */

const PAL = {
  ink: '#2B2138',
  skyTop: '#5FC2E6',
  skyMid: '#A8E0EF',
  skyBot: '#FFE9C2',
  hillFar: '#B9DFB4',
  hillNear: '#8CCB92',
  grass1: '#57C48C',
  grass2: '#4FBA84',
  road1: '#706C82',
  road2: '#7A7690',
  rumble1: '#FF5A3C',
  rumble2: '#FFF3DC',
  laneMark: '#FFF6E3',
  fog: '#FFE9C2'
};

const CAR_BODIES = {
  sport:  { name: '闪电 GT',    price: 0,    desc: '低趴流线 · 大尾翼',  cabin: 0.30, spoiler: true, exhausts: 1 },
  muscle: { name: '铁拳 Muscle', price: 800,  desc: '宽体肌肉 · 双排气',  cabin: 0.32, wide: 1.07, exhausts: 2, stripes: true },
  buggy:  { name: '荒野 Buggy',  price: 1500, desc: '大轮越野 · 车顶灯',  cabin: 0.36, wheel: 1.25, lift: 8, rack: true, spare: true }
};

const CAR_COLORS = [
  { name: '熔岩红', hex: '#FF5A3C' },
  { name: '芒果黄', hex: '#FFB53C' },
  { name: '薄荷绿', hex: '#3ECF8E' },
  { name: '天空蓝', hex: '#3EA8F0' },
  { name: '葡萄紫', hex: '#9B6DF3' },
  { name: '樱花粉', hex: '#FF7BAE' },
  { name: '奶油白', hex: '#FFF3DC' },
  { name: '炭晶黑', hex: '#3A3A44' },
  { name: '海军蓝', hex: '#2E5ECC' },
  { name: '橙汁橙', hex: '#FF8A2A' }
];

const OB_W = { cone: 460, barrel: 700, tire: 780, hammer: 880, tree: 700, sign: 600 };
const OB_H = { cone: 600, barrel: 940, tire: 780, hammer: 1080, tree: 1050, sign: 820 };

let lastPlayerScreen = { x: 0, y: 0, w: 200 };

/* ---------- 基础工具 ---------- */
function shade(hex, f){
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = f > 0 ? 255 : 0, p = Math.abs(f);
  return `rgb(${Math.round(lerp(r, t, p))},${Math.round(lerp(g, t, p))},${Math.round(lerp(b, t, p))})`;
}

function rr(ctx, x, y, w, h, r){
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function poly(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color){
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function star(ctx, cx, cy, R, n, rot){
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++){
    const r = i % 2 ? R * 0.45 : R;
    const a = rot + (i * Math.PI) / n;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/* ---------- 投影 ---------- */
function project(p, cameraX, cameraY, cameraZ, w, h){
  p.camera.x = -cameraX;
  p.camera.y = p.world.y - cameraY;
  p.camera.z = p.world.z - cameraZ;
  p.screen.scale = CAM_DEPTH / p.camera.z;
  p.screen.x = Math.round(w / 2 + p.screen.scale * p.camera.x * w / 2);
  p.screen.y = Math.round(h / 2 - p.screen.scale * p.camera.y * h / 2);
  p.screen.w = Math.round(p.screen.scale * ROAD_W * w / 2);
}

/* ---------- 背景 ---------- */
const clouds = Array.from({ length: 7 }, () => ({
  x: Math.random(), y: 0.04 + Math.random() * 0.2, s: 0.5 + Math.random() * 0.9, par: 0.3 + Math.random() * 0.5
}));

function blobCloud(ctx, x, y, s){
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.arc(x + s * 0.9, y + s * 0.15, s * 0.75, 0, Math.PI * 2);
  ctx.arc(x - s * 0.9, y + s * 0.2, s * 0.65, 0, Math.PI * 2);
  ctx.arc(x + s * 0.2, y - s * 0.5, s * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawHills(ctx, w, h, horizon, seed, color, par, amp){
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, horizon + h * 0.06);
  const off = bgShift * par;
  for (let x = 0; x <= w; x += 16){
    const px = (x / w) * 6 + off * (2 + seed);
    const yy = horizon + 2 - h * amp * (0.55 + 0.3 * Math.sin(px * 1.7 + seed * 3) + 0.18 * Math.sin(px * 3.1 + seed * 7));
    ctx.lineTo(x, yy);
  }
  ctx.lineTo(w, horizon + h * 0.06);
  ctx.closePath();
  ctx.fill();
}

function drawBackground(ctx, w, h){
  const horizon = h * 0.5;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, PAL.skyTop);
  sky.addColorStop(0.7, PAL.skyMid);
  sky.addColorStop(1, PAL.skyBot);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon + 2);

  /* 太阳 */
  ctx.fillStyle = 'rgba(255,224,138,0.4)';
  ctx.beginPath();
  ctx.arc(w * 0.78, horizon - h * 0.15, h * 0.095, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFE08A';
  ctx.beginPath();
  ctx.arc(w * 0.78, horizon - h * 0.15, h * 0.052, 0, Math.PI * 2);
  ctx.fill();

  /* 云 */
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (const c of clouds){
    const cx = ((((c.x - bgShift * c.par * 0.13) % 1) + 1) % 1) * (w * 1.3) - w * 0.15;
    blobCloud(ctx, cx, c.y * h, c.s * h * 0.05);
  }

  drawHills(ctx, w, h, horizon, 1, PAL.hillFar, 0.35, 0.1);
  drawHills(ctx, w, h, horizon, 2, PAL.hillNear, 0.8, 0.065);
}

/* ---------- 路面 ---------- */
function renderSegment(ctx, w, seg, x1, y1, w1, x2, y2, w2, fogA){
  const r1 = w1 / 6, r2 = w2 / 6;
  const l1 = w1 / 26 + 1, l2 = w2 / 26 + 1;
  ctx.fillStyle = seg.color ? PAL.grass2 : PAL.grass1;
  ctx.fillRect(0, y2, w, y1 - y2 + 1);
  poly(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, seg.color ? PAL.rumble2 : PAL.rumble1);
  poly(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, seg.color ? PAL.rumble2 : PAL.rumble1);
  poly(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, seg.color ? PAL.road2 : PAL.road1);
  if (seg.color === 0){
    const lw1 = (w1 * 2) / 3, lw2 = (w2 * 2) / 3;
    poly(ctx, x1 - lw1 - l1, y1, x1 - lw1 + l1, y1, x2 - lw2 + l2, y2, x2 - lw2 - l2, y2, PAL.laneMark);
    poly(ctx, x1 + lw1 - l1, y1, x1 + lw1 + l1, y1, x2 + lw2 + l2, y2, x2 + lw2 - l2, y2, PAL.laneMark);
  }
  if (fogA > 0.02){
    ctx.globalAlpha = fogA;
    ctx.fillStyle = PAL.fog;
    ctx.fillRect(0, y2, w, y1 - y2 + 1);
    ctx.globalAlpha = 1;
  }
}

/* ---------- 卡通车（后视） ---------- */
function bodyPath(ctx, wBot, wTop, yBot, yTop, r){
  const xb = wBot / 2, xt = wTop / 2;
  ctx.beginPath();
  ctx.moveTo(-xb, yBot);
  ctx.lineTo(-xt, yTop + r);
  ctx.quadraticCurveTo(-xt, yTop, -xt + r, yTop);
  ctx.lineTo(xt - r, yTop);
  ctx.quadraticCurveTo(xt, yTop, xt, yTop + r);
  ctx.lineTo(xb, yBot);
  ctx.closePath();
}

function drawCar(ctx, cx, groundY, W, o){
  const cfg = CAR_BODIES[o.body] || CAR_BODIES.sport;
  const col = o.color || '#FF5A3C';
  ctx.save();
  ctx.translate(cx, groundY);

  /* 地面阴影 */
  ctx.fillStyle = 'rgba(43,33,56,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, -W * 0.015, W * 0.55, W * 0.085, 0, 0, Math.PI * 2);
  ctx.fill();

  if (o.spin) ctx.rotate(o.spin);
  if (o.pitch) ctx.rotate(-o.pitch);
  if (o.steer) ctx.rotate(o.steer * 0.045);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.1, W * 0.02);
  ctx.strokeStyle = PAL.ink;

  const ws = cfg.wheel || 1;
  const lift = (cfg.lift || 0) / 100;
  const wide = cfg.wide || 1;

  const wheelW = W * 0.185 * ws;
  const wheelH = W * 0.27 * ws;
  const wheelX = W * 0.325 * wide;
  const botY = -W * (0.085 + lift);
  const beltY = -W * (0.5 + lift * 0.4);
  const bodyBotW = W * 0.86 * wide;
  const bodyTopW = W * 0.72 * wide;
  const cabBotW = W * 0.6 * wide;
  const cabTopW = W * 0.46;
  const cabTopY = beltY - W * cfg.cabin;

  /* 车轮 */
  for (const sx of [-1, 1]){
    const x = sx * wheelX - wheelW / 2;
    rr(ctx, x, -wheelH, wheelW, wheelH, wheelW * 0.32);
    ctx.fillStyle = '#262031';
    ctx.fill(); ctx.stroke();
    rr(ctx, x + wheelW * 0.18, -wheelH * 0.76, wheelW * 0.64, wheelH * 0.42, wheelW * 0.2);
    ctx.fillStyle = '#57506B';
    ctx.fill();
    rr(ctx, x + wheelW * 0.24, -wheelH * 0.92, wheelW * 0.16, wheelH * 0.28, wheelW * 0.08);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
  }

  /* 车身 */
  const g = ctx.createLinearGradient(0, cabTopY, 0, botY);
  g.addColorStop(0, shade(col, 0.28));
  g.addColorStop(0.45, col);
  g.addColorStop(1, shade(col, -0.22));
  ctx.fillStyle = g;
  bodyPath(ctx, bodyBotW, bodyTopW, botY, beltY, W * 0.1);
  ctx.fill(); ctx.stroke();

  /* 肌肉车双条纹 */
  if (cfg.stripes){
    ctx.save();
    bodyPath(ctx, bodyBotW, bodyTopW, botY, beltY, W * 0.1);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,246,227,0.85)';
    ctx.fillRect(-W * 0.13, beltY, W * 0.09, botY - beltY);
    ctx.fillRect(W * 0.04, beltY, W * 0.09, botY - beltY);
    ctx.restore();
  }

  /* 保险杠 */
  rr(ctx, -bodyBotW * 0.5, botY - W * 0.002, bodyBotW, W * 0.09, W * 0.035);
  ctx.fillStyle = shade(col, -0.38);
  ctx.fill(); ctx.stroke();

  /* 排气 */
  if (cfg.exhausts && !cfg.spare){
    const ey = botY + W * 0.052;
    ctx.fillStyle = '#8B93A3';
    const xs = cfg.exhausts === 2 ? [-W * 0.07, W * 0.07] : [W * 0.26 * wide];
    for (const ex of xs){
      rr(ctx, ex - W * 0.035, ey - W * 0.022, W * 0.07, W * 0.05, W * 0.02);
      ctx.fill(); ctx.stroke();
    }
  }

  /* 尾灯 */
  const lightY = botY - W * (0.17 + lift * 0.5);
  const lightX = W * 0.3 * wide;
  for (const sx of [-1, 1]){
    ctx.save();
    ctx.shadowColor = 'rgba(255,70,50,0.9)';
    ctx.shadowBlur = W * 0.1;
    rr(ctx, sx * lightX - W * 0.075, lightY, W * 0.15, W * 0.06, W * 0.025);
    ctx.fillStyle = '#FF4438';
    ctx.fill();
    ctx.restore();
    rr(ctx, sx * lightX - W * 0.075, lightY, W * 0.15, W * 0.06, W * 0.025);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    rr(ctx, sx * lightX - W * 0.058, lightY + W * 0.012, W * 0.05, W * 0.018, W * 0.008);
    ctx.fill();
  }

  /* 座舱 */
  const cg = ctx.createLinearGradient(0, cabTopY, 0, beltY);
  cg.addColorStop(0, shade(col, 0.18));
  cg.addColorStop(1, shade(col, -0.1));
  ctx.fillStyle = cg;
  bodyPath(ctx, cabBotW, cabTopW, beltY + W * 0.01, cabTopY, W * 0.08);
  ctx.fill(); ctx.stroke();

  /* 后挡风玻璃 */
  const glass = ctx.createLinearGradient(0, cabTopY, 0, beltY);
  glass.addColorStop(0, '#CDEFF5');
  glass.addColorStop(1, '#7FB6C6');
  ctx.fillStyle = glass;
  bodyPath(ctx, cabBotW * 0.8, cabTopW * 0.82, beltY - W * 0.045, cabTopY + W * 0.045, W * 0.06);
  ctx.fill(); ctx.stroke();
  ctx.save();
  bodyPath(ctx, cabBotW * 0.8, cabTopW * 0.82, beltY - W * 0.045, cabTopY + W * 0.045, W * 0.06);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.moveTo(-cabBotW * 0.32, beltY);
  ctx.lineTo(-cabBotW * 0.1, beltY);
  ctx.lineTo(cabTopW * 0.05, cabTopY);
  ctx.lineTo(-cabTopW * 0.18, cabTopY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  /* 尾翼（运动） */
  if (cfg.spoiler){
    ctx.fillStyle = shade(col, -0.3);
    for (const sx of [-1, 1]){
      rr(ctx, sx * W * 0.22 - W * 0.022, beltY - W * 0.14, W * 0.045, W * 0.15, W * 0.015);
      ctx.fill(); ctx.stroke();
    }
    rr(ctx, -W * 0.46, beltY - W * 0.2, W * 0.92, W * 0.07, W * 0.03);
    ctx.fillStyle = shade(col, -0.15);
    ctx.fill(); ctx.stroke();
    for (const sx of [-1, 1]){
      rr(ctx, sx * W * 0.46 - W * 0.03, beltY - W * 0.24, W * 0.06, W * 0.13, W * 0.02);
      ctx.fillStyle = shade(col, -0.35);
      ctx.fill(); ctx.stroke();
    }
  }

  /* 车顶灯架（越野） */
  if (cfg.rack){
    ctx.fillStyle = '#57506B';
    rr(ctx, -cabTopW * 0.55, cabTopY - W * 0.095, cabTopW * 1.1, W * 0.045, W * 0.02);
    ctx.fill(); ctx.stroke();
    for (let i = 0; i < 4; i++){
      const lx = (i - 1.5) * cabTopW * 0.28;
      ctx.beginPath();
      ctx.arc(lx, cabTopY - W * 0.125, W * 0.036, 0, Math.PI * 2);
      ctx.fillStyle = '#FFF3C4';
      ctx.fill(); ctx.stroke();
    }
  }

  /* 备胎（越野） */
  if (cfg.spare){
    const sr = W * 0.17;
    ctx.beginPath();
    ctx.ellipse(0, botY - W * 0.13, sr, sr * 0.92, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2E2836';
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, botY - W * 0.13, sr * 0.45, sr * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#171320';
    ctx.fill(); ctx.stroke();
  }

  /* 车身徽章 */
  if (!cfg.spare){
    const by = lightY + W * 0.005;
    ctx.beginPath();
    ctx.arc(0, by, W * 0.055, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF6E3';
    ctx.fill(); ctx.stroke();
    star(ctx, 0, by, W * 0.032, 5, -Math.PI / 2);
    ctx.fillStyle = '#FF5A3C';
    ctx.fill();
  }

  /* 车身高光 */
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  rr(ctx, -bodyTopW * 0.42, beltY + W * 0.02, bodyTopW * 0.3, W * 0.035, W * 0.017);
  ctx.fill();

  ctx.restore();
}

/* ---------- 障碍物 ---------- */
function drawObstacleShape(ctx, spr, x, y, dw, dh, t){
  ctx.save();
  ctx.translate(x, y);
  const lw = Math.max(1, dw * 0.045);
  ctx.lineWidth = lw;
  ctx.strokeStyle = PAL.ink;
  ctx.lineJoin = 'round';

  if (spr.type !== 'tree' && spr.type !== 'sign'){
    ctx.fillStyle = 'rgba(43,33,56,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 0, dw * 0.55, dw * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  switch (spr.type){
    case 'cone': {
      const bw = dw * 0.9, tw = dw * 0.16, hgt = dh * 0.9;
      rr(ctx, -bw / 2 - dw * 0.06, -dw * 0.13, bw + dw * 0.12, dw * 0.15, dw * 0.05);
      ctx.fillStyle = '#E8601A';
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-bw / 2, -dw * 0.08);
      ctx.lineTo(-tw / 2, -hgt);
      ctx.quadraticCurveTo(0, -hgt - dw * 0.09, tw / 2, -hgt);
      ctx.lineTo(bw / 2, -dw * 0.08);
      ctx.closePath();
      ctx.fillStyle = '#FF7A2A';
      ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#FFF6E3';
      ctx.fillRect(-bw, -hgt * 0.62, bw * 2, hgt * 0.2);
      ctx.restore();
      break;
    }
    case 'barrel': {
      const rot = Math.sin(t * 2.2 + x * 0.013) * 0.04;
      ctx.rotate(rot);
      const bw = dw * 0.8, hgt = dh * 0.92;
      const bg = ctx.createLinearGradient(0, -hgt, 0, 0);
      bg.addColorStop(0, '#FF7A55');
      bg.addColorStop(0.5, '#F04E2E');
      bg.addColorStop(1, '#C93A1E');
      ctx.beginPath();
      ctx.moveTo(-bw / 2, 0);
      ctx.bezierCurveTo(-bw * 0.64, -hgt * 0.3, -bw * 0.64, -hgt * 0.7, -bw * 0.47, -hgt);
      ctx.lineTo(bw * 0.47, -hgt);
      ctx.bezierCurveTo(bw * 0.64, -hgt * 0.7, bw * 0.64, -hgt * 0.3, bw / 2, 0);
      ctx.closePath();
      ctx.fillStyle = bg;
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -hgt, bw * 0.47, dh * 0.07, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#FF9B77';
      ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(-bw, -hgt * 0.66, bw * 2, hgt * 0.2);
      ctx.clip();
      ctx.fillStyle = '#FFF6E3';
      ctx.fillRect(-bw, -hgt * 0.66, bw * 2, hgt * 0.2);
      ctx.fillStyle = '#2B2138';
      for (let i = -4; i < 5; i++){
        ctx.save();
        ctx.translate(i * bw * 0.22, -hgt * 0.56);
        ctx.rotate(0.5);
        ctx.fillRect(-dw * 0.03, -hgt * 0.14, dw * 0.06, hgt * 0.28);
        ctx.restore();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      rr(ctx, -bw * 0.3, -hgt * 0.86, dw * 0.07, hgt * 0.55, dw * 0.03);
      ctx.fill();
      break;
    }
    case 'tire': {
      const tire = (cx, cy, r) => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#2E2836';
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx, cy - r * 0.05, r * 0.42, r * 0.24, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#171320';
        ctx.fill();
        ctx.lineWidth = lw * 0.8;
        ctx.stroke();
        ctx.lineWidth = lw;
      };
      tire(-dw * 0.2, -dh * 0.14, dw * 0.3);
      tire(dw * 0.2, -dh * 0.14, dw * 0.3);
      tire(0, -dh * 0.5, dw * 0.3);
      break;
    }
    case 'hammer': {
      const hw = dw * 0.92, hh = dh * 0.24;
      ctx.save();
      ctx.translate(-dw * 0.16, 0);
      ctx.rotate(-0.5);
      rr(ctx, -dw * 0.05, -dh * 0.72, dw * 0.1, dh * 0.72, dw * 0.05);
      ctx.fillStyle = '#C98A4B';
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(43,33,56,0.4)';
      ctx.lineWidth = lw * 0.6;
      for (let i = 1; i <= 2; i++){
        ctx.beginPath();
        ctx.moveTo(-dw * 0.045, -dh * 0.18 * i - dh * 0.1);
        ctx.lineTo(dw * 0.045, -dh * 0.18 * i - dh * 0.1);
        ctx.stroke();
      }
      ctx.restore();
      const hg = ctx.createLinearGradient(0, -hh - dw * 0.06, 0, -dw * 0.06);
      hg.addColorStop(0, '#DDE2EC');
      hg.addColorStop(1, '#9AA3B5');
      rr(ctx, -hw / 2, -hh - dw * 0.06, hw, hh, dw * 0.09);
      ctx.fillStyle = hg;
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#FF5A3C';
      rr(ctx, -hw * 0.09, -hh - dw * 0.06, hw * 0.18, hh, dw * 0.03);
      ctx.fill();
      ctx.fillStyle = '#57506B';
      for (const sx of [-1, 1]){
        ctx.beginPath();
        ctx.arc(sx * hw * 0.34, -hh * 0.5 - dw * 0.06, dw * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'tree': {
      const th = dh * 0.52, cr = dw * 0.46;
      rr(ctx, -dw * 0.07, -th, dw * 0.14, th, dw * 0.05);
      ctx.fillStyle = '#A9713F';
      ctx.fill(); ctx.stroke();
      const blobs = [
        [0, -th - cr * 0.45, cr],
        [-cr * 0.58, -th - cr * 0.05, cr * 0.68],
        [cr * 0.58, -th - cr * 0.1, cr * 0.7]
      ];
      for (const [bx, by, br] of blobs){
        ctx.beginPath();
        ctx.arc(bx, by, br + lw * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = PAL.ink;
        ctx.fill();
      }
      for (const [bx, by, br] of blobs){
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = '#4CBB7A';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(-cr * 0.22, -th - cr * 0.7, cr * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fill();
      break;
    }
    case 'sign': {
      const ph = dh * 0.58, bw = dw * 0.95, bh = dh * 0.3;
      rr(ctx, -dw * 0.05, -ph, dw * 0.1, ph, dw * 0.04);
      ctx.fillStyle = '#8B93A3';
      ctx.fill(); ctx.stroke();
      rr(ctx, -bw / 2, -ph - bh * 0.5, bw, bh, dw * 0.09);
      ctx.fillStyle = '#3E8ED0';
      ctx.fill(); ctx.stroke();
      const dir = spr.dir || 1;
      ctx.fillStyle = '#FFF6E3';
      ctx.beginPath();
      const ay = -ph - bh * 0.5 + bh / 2;
      if (dir > 0){
        ctx.moveTo(-bw * 0.26, ay - bh * 0.22);
        ctx.lineTo(bw * 0.1, ay - bh * 0.22);
        ctx.lineTo(bw * 0.1, ay - bh * 0.34);
        ctx.lineTo(bw * 0.32, ay);
        ctx.lineTo(bw * 0.1, ay + bh * 0.34);
        ctx.lineTo(bw * 0.1, ay + bh * 0.22);
        ctx.lineTo(-bw * 0.26, ay + bh * 0.22);
      } else {
        ctx.moveTo(bw * 0.26, ay - bh * 0.22);
        ctx.lineTo(-bw * 0.1, ay - bh * 0.22);
        ctx.lineTo(-bw * 0.1, ay - bh * 0.34);
        ctx.lineTo(-bw * 0.32, ay);
        ctx.lineTo(-bw * 0.1, ay + bh * 0.34);
        ctx.lineTo(-bw * 0.1, ay + bh * 0.22);
        ctx.lineTo(bw * 0.26, ay + bh * 0.22);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawClipped(ctx, w, clipY, fn){
  if (clipY !== undefined && clipY < 1e9 && clipY > 0){
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, clipY);
    ctx.clip();
    fn();
    ctx.restore();
  } else {
    fn();
  }
}

/* ---------- 玩家车 ---------- */
function drawPlayer(ctx, w, h, o, slope){
  const speedPct = clamp(speed / MAX_SPEED, 0, 1);
  const bounce = (Math.sin(o.t * 17) * 1.4 + Math.sin(o.t * 29) * 1.1) * speedPct * (h / 500);
  const carW = Math.min(w * 0.27, h * 0.42);
  const steer = o.steer || 0;
  const x = w / 2 + steer * w * 0.015;
  const y = h * 0.95 + bounce;
  lastPlayerScreen.x = x;
  lastPlayerScreen.y = y;
  lastPlayerScreen.w = carW;
  drawCar(ctx, x, y, carW, {
    color: o.color,
    body: o.body,
    steer,
    t: o.t,
    pitch: clamp(Math.atan(slope) * 0.55, -0.3, 0.3),
    spin: o.spin || 0
  });
}

/* ---------- 主渲染 ---------- */
function renderScene(ctx, w, h, o){
  assignCarsToSegments();
  const baseSegment = segByIndex(Math.floor(position / SEG_LEN));
  if (!baseSegment) return;
  const basePercent = (position % SEG_LEN) / SEG_LEN;
  const pz = position + PLAYER_Z;
  const playerSeg = segByIndex(Math.floor(pz / SEG_LEN)) || baseSegment;
  const playerPercent = (pz % SEG_LEN) / SEG_LEN;
  playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPercent);
  const slope = (playerSeg.p2.world.y - playerSeg.p1.world.y) / SEG_LEN;

  drawBackground(ctx, w, h);

  /* 草地基底 */
  ctx.fillStyle = PAL.grass1;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);

  let maxy = h;
  let x = 0, dx = -(baseSegment.curve * basePercent);

  for (let n = 0; n < DRAW_DIST; n++){
    const seg = segByIndex(baseSegment.index + n);
    if (!seg) break;
    const fogA = 1 - Math.exp(-Math.pow(n / DRAW_DIST, 2) * 4.5);

    project(seg.p1, playerX * ROAD_W - x, playerY + CAM_H, position, w, h);
    project(seg.p2, playerX * ROAD_W - x - dx, playerY + CAM_H, position, w, h);

    x += dx;
    dx += seg.curve;

    seg.clip = maxy;
    seg.fogA = fogA;

    if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;

    renderSegment(ctx, w, seg, seg.p1.screen.x, seg.p1.screen.y, seg.p1.screen.w,
      seg.p2.screen.x, seg.p2.screen.y, seg.p2.screen.w, fogA);
    maxy = seg.p2.screen.y;
  }

  /* 障碍与对手车（由远及近覆盖） */
  for (let n = DRAW_DIST - 1; n > 0; n--){
    const seg = segByIndex(baseSegment.index + n);
    if (!seg) continue;
    if (seg.p1.camera.z <= CAM_DEPTH) continue;
    const scale = seg.p1.screen.scale;
    for (const c of seg.cars){
      const p = (c.z % SEG_LEN) / SEG_LEN;
      const cs = lerp(seg.p1.screen.scale, seg.p2.screen.scale, p);
      const cx2 = lerp(seg.p1.screen.x, seg.p2.screen.x, p) + cs * c.x * ROAD_W * w / 2;
      const cy2 = lerp(seg.p1.screen.y, seg.p2.screen.y, p);
      const cw = 700 * cs * w / 2;
      if (cw < 3) continue;
      drawClipped(ctx, w, seg.clip, () => drawCar(ctx, cx2, cy2, cw, { color: c.color, body: c.body, t: o.t }));
    }
    for (const spr of seg.sprites){
      const sx = seg.p1.screen.x + scale * spr.offset * ROAD_W * w / 2;
      const sy = seg.p1.screen.y;
      const dw = OB_W[spr.type] * scale * w / 2;
      if (dw < 2.5) continue;
      const dh = dw * OB_H[spr.type] / OB_W[spr.type];
      drawClipped(ctx, w, seg.clip, () => drawObstacleShape(ctx, spr, sx, sy, dw, dh, o.t));
    }
  }

  drawPlayer(ctx, w, h, o, slope);
}

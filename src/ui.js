import { TILE } from './constants.js';
import { PLAYER_COLORS } from './constants.js';
import { AMULET_COL, rrect } from './render.js';
import { t, heroName } from './i18n.js';

export const PIX = '"Press Start 2P", monospace';
export const SERIF = '"Cinzel Decorative", Georgia, serif';

export function txt(ctx, s, x, y, size = 10, color = '#fff', align = 'left', font = PIX, shadow = true) {
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillText(s, x + Math.max(1, size / 8), y + Math.max(1, size / 8));
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

export function wrap(ctx, s, maxW, size, font = PIX) {
  ctx.font = `${size}px ${font}`;
  const words = s.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function panel(ctx, x, y, w, h, fill = 'rgba(12,8,22,0.78)', stroke = 'rgba(255,255,255,0.14)', r = 8) {
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

// Clickable regions are rebuilt every frame by the screen's draw().
export function hit(list, x, y, w, h, action) { list.push({ x, y, w, h, action }); }
export function handleClicks(list, clicks) {
  for (const c of clicks) {
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (c.x >= b.x && c.x <= b.x + b.w && c.y >= b.y && c.y <= b.y + b.h) { b.action(c.src); break; }
    }
  }
}

function keyIcon(ctx, x, y) {
  ctx.strokeStyle = '#ffd35a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + 3, y + 4, 3, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd35a';
  ctx.fillRect(x + 6, y + 3, 7, 2); ctx.fillRect(x + 10, y + 5, 2, 3);
}
function potionIcon(ctx, x, y) {
  ctx.fillStyle = '#3aa8ff';
  ctx.beginPath(); ctx.arc(x + 5, y + 6, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#bfe8ff'; ctx.fillRect(x + 3.5, y - 1, 3, 4);
}

// ------------------------------------------------------------------ HUD
export function drawHud(ctx, app, game, showMap) {
  const { vw, vh } = app;
  const sf = app.safe || { t: 0, r: 0, b: 0, l: 0 };
  const n = game.players.length;
  const touch = app.input.touchActive;
  const gap = 8;
  const pw = Math.min(210, (vw - 24 - sf.l - sf.r - gap * (n - 1) - (vw > 700 ? 170 : touch ? 100 : 0)) / n);
  const compact = pw < 150;
  const ph = compact ? 58 : 66;
  game.players.forEach((p, i) => {
    const x = 12 + sf.l + i * (pw + gap), y = 12 + sf.t;
    panel(ctx, x, y, pw, ph, 'rgba(12,8,22,0.72)', p.hero.color + 'aa');
    ctx.fillStyle = p.hero.color;
    ctx.fillRect(x + 1, y + 1, 4, ph - 2);
    txt(ctx, `P${i + 1} ${heroName(p.heroKey).toUpperCase()}`, x + 10, y + 7, compact ? 6 : 8, p.hero.light);
    if (p.alive) {
      const low = p.hp < 200;
      const hc = low ? (Math.floor(game.time * 4) % 2 ? '#ff4a4a' : '#ffb0b0') : '#ffffff';
      txt(ctx, String(Math.max(0, Math.ceil(p.hp))), x + 10, y + 20, compact ? 11 : 14, hc);
    } else {
      txt(ctx, t('revive_hint'), x + 10, y + 22, 6, '#ff8a8a');
    }
    txt(ctx, String(p.score), x + pw - 8, y + (compact ? 21 : 23), compact ? 6 : 8, '#ffd35a', 'right');
    const iy = y + ph - 20;
    keyIcon(ctx, x + 10, iy);
    txt(ctx, 'x' + p.keys, x + 26, iy + 1, 7, '#fff');
    potionIcon(ctx, x + 50, iy);
    txt(ctx, 'x' + p.potions, x + 63, iy + 1, 7, '#fff');
    let bx = x + 92;
    for (const k in p.buffs) {
      if (bx > x + pw - 14) break;
      ctx.fillStyle = AMULET_COL[k];
      ctx.beginPath(); ctx.arc(bx + 4, iy + 4, 4, 0, Math.PI * 2); ctx.fill();
      txt(ctx, String(Math.ceil(p.buffs[k])), bx + 11, iy + 1, 6, AMULET_COL[k]);
      bx += 30;
    }
    // special cooldown bar
    const cd = Math.max(0, p.specialCd) / (p.hero.specialCd * p.mods.cd);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 8, y + ph - 6, pw - 16, 3);
    ctx.fillStyle = cd <= 0 ? p.hero.light : 'rgba(255,255,255,0.45)';
    ctx.fillRect(x + 8, y + ph - 6, (pw - 16) * (1 - cd), 3);
  });

  // level + minimap
  const mmMax = Math.min(150, vw * 0.2, vh * 0.26);
  const mmScale = Math.max(0.8, Math.min(3, mmMax / game.W, mmMax / game.H));
  const mw = game.W * mmScale;
  const right = vw - 12 - sf.r;
  const lvY = sf.t + (touch ? 50 : 12);
  txt(ctx, t('level', { n: game.levelNum }), right, lvY, 9, '#ffd35a', 'right');
  if (vw > 480 && vh > 300) drawMap(ctx, game, right - mw, lvY + 18, mmScale, 0.8);
  if (showMap) {
    const s = Math.min((vw * 0.8) / game.W, (vh * 0.75) / game.H);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, vw, vh);
    drawMap(ctx, game, (vw - game.W * s) / 2, (vh - game.H * s) / 2, s, 1);
  }

  if (game.banner) {
    const b = game.banner, a = Math.min(1, b.t, 3.2 - b.t + 0.2);
    ctx.globalAlpha = Math.max(0, a);
    const size = Math.min(48, vw / 12);
    txt(ctx, b.text, vw / 2, vh * 0.3, size, '#ffd35a', 'center', SERIF);
    txt(ctx, b.sub, vw / 2, vh * 0.3 + size * 1.4, Math.min(12, vw / 40), '#fff', 'center');
    ctx.globalAlpha = 1;
  }
  if (game.hint) {
    ctx.globalAlpha = Math.min(1, game.hint.t);
    const lines = wrap(ctx, game.hint.text, vw - 60, 8);
    const hy = touch ? sf.t + 92 : vh - 50 - sf.b;
    lines.forEach((l, i) => txt(ctx, l, vw / 2, hy + i * 14, 8, '#e8e0ff', 'center'));
    ctx.globalAlpha = 1;
  }

  // low-health vignette
  const alive = game.players.filter(p => p.alive);
  const low = alive.length && alive.some(p => p.hp < 200);
  if (low) {
    const a = 0.25 + Math.sin(game.time * 6) * 0.12;
    const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(200,0,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
  }
}

function drawMap(ctx, game, x, y, s, alpha) {
  ctx.globalAlpha = alpha;
  panel(ctx, x - 4, y - 4, game.W * s + 8, game.H * s + 8, 'rgba(8,6,14,0.7)', 'rgba(255,255,255,0.15)', 4);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(game.mini, x, y, game.W * s, game.H * s);
  ctx.imageSmoothingEnabled = true;
  const ex = Math.floor(game.exitPos.x / TILE), ey = Math.floor(game.exitPos.y / TILE);
  if (game.explored[ey * game.W + ex] && Math.floor(game.time * 3) % 2) {
    ctx.fillStyle = '#ffd35a';
    ctx.fillRect(x + ex * s - s, y + ey * s - s, s * 3, s * 3);
  }
  for (const p of game.players) {
    ctx.fillStyle = p.alive ? p.hero.light : '#777';
    ctx.beginPath(); ctx.arc(x + (p.x / TILE) * s, y + (p.y / TILE) * s, Math.max(2, s), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ touch
// Right-thumb cluster in the bottom-right corner, clear of notches.
export function layoutTouch(app) {
  const { vw, vh } = app;
  const sf = app.safe || { t: 0, r: 0, b: 0, l: 0 };
  const r = Math.max(28, Math.min(42, Math.min(vw, vh) * 0.085));
  const dx = vw - sf.r - r - 22, dy = vh - sf.b - r - 22;
  app.input.touchButtons = [
    { id: 'dash', x: dx, y: dy, r, label: '»' },
    { id: 'special', x: dx - r * 2.5, y: dy + r * 0.15, r, label: '★' },
    { id: 'potion', x: dx + r * 0.15, y: dy - r * 2.4, r: r * 0.8, label: '⚗' },
    { id: 'pause', x: vw - sf.r - 30, y: sf.t + 26, r: 18, label: 'II' },
    { id: 'map', x: vw - sf.r - 76, y: sf.t + 26, r: 18, label: '▦' },
  ];
}

export function drawTouch(ctx, app, player) {
  const inp = app.input;
  for (const b of inp.touchButtons) {
    let ready = true;
    if (player && b.id === 'special') ready = player.specialCd <= 0;
    if (player && b.id === 'dash') ready = player.dashCd <= 0;
    if (player && b.id === 'potion') ready = player.potions > 0;
    ctx.globalAlpha = ready ? 0.55 : 0.25;
    ctx.fillStyle = '#1a1428';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = player ? player.hero.light : '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = ready ? 0.95 : 0.4;
    ctx.font = `${Math.round(b.r * 0.8)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(b.label, b.x, b.y + 1);
  }
  const stick = (st, dx, dy) => {
    const sx = st ? st.sx : dx, sy = st ? st.sy : dy;
    ctx.globalAlpha = st ? 0.45 : 0.15;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 55, 0, Math.PI * 2); ctx.stroke();
    let kx = sx, ky = sy;
    if (st) {
      const ddx = st.x - st.sx, ddy = st.y - st.sy, d = Math.hypot(ddx, ddy);
      const k = d > 55 ? 55 / d : 1;
      kx = sx + ddx * k; ky = sy + ddy * k;
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(kx, ky, 22, 0, Math.PI * 2); ctx.fill();
  };
  const sf = app.safe || { l: 0, b: 0 };
  stick(inp.sticks.move, 100 + sf.l, app.vh - 110 - sf.b);
  if (!app.settings.autoAim || inp.sticks.aim) stick(inp.sticks.aim, app.vw * 0.62, app.vh - 110 - sf.b);
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'top';
}

export function playerColor(i) { return PLAYER_COLORS[i % 4]; }

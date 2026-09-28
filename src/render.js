import { TILE, T } from './constants.js';

// Every art asset is drawn procedurally so the game needs no image files.

export const THEMES = [
  { floor: [38, 36, 50], floor2: [44, 42, 58], wallTop: [96, 90, 116], wallFace: [60, 56, 76], mortar: [26, 24, 34] },
  { floor: [34, 42, 34], floor2: [40, 50, 38], wallTop: [84, 104, 76], wallFace: [52, 66, 48], mortar: [22, 28, 20] },
  { floor: [48, 28, 28], floor2: [56, 32, 30], wallTop: [124, 62, 54], wallFace: [82, 36, 32], mortar: [32, 16, 16] },
  { floor: [58, 48, 34], floor2: [66, 55, 38], wallTop: [140, 118, 80], wallFace: [98, 80, 52], mortar: [38, 30, 20] },
  { floor: [30, 40, 54], floor2: [36, 48, 64], wallTop: [120, 150, 184], wallFace: [70, 92, 120], mortar: [20, 28, 40] },
];

const c255 = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const rgb = (c, m = 0) => `rgb(${c255(c[0] + m)},${c255(c[1] + m)},${c255(c[2] + m)})`;

function h2(x, y, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function buildTileCanvas(L, theme) {
  const c = document.createElement('canvas');
  c.width = L.W * TILE;
  c.height = L.H * TILE;
  const g = c.getContext('2d');
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) drawTile(g, L, theme, x, y);
  return c;
}

export function drawTile(g, L, th, x, y) {
  const W = L.W, H = L.H;
  const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= H ? T.WALL : L.tiles[yy * W + xx]);
  const t = at(x, y), px = x * TILE, py = y * TILE, v = h2(x, y);

  if (t === T.WALL) {
    let nearFloor = false;
    for (let oy = -1; oy <= 1 && !nearFloor; oy++) for (let ox = -1; ox <= 1; ox++) if (at(x + ox, y + oy) !== T.WALL) { nearFloor = true; break; }
    if (!nearFloor) {
      g.fillStyle = rgb(th.wallTop, -52 + Math.floor(v * 6));
      g.fillRect(px, py, TILE, TILE);
      return;
    }
    const face = at(x, y + 1) !== T.WALL;
    const capH = face ? 12 : TILE;
    g.fillStyle = rgb(th.wallTop, Math.floor(v * 10) - 5);
    g.fillRect(px, py, TILE, capH);
    g.fillStyle = rgb(th.wallTop, -16);
    if (!face) {
      g.fillRect(px, py + 15, TILE, 2);
      g.fillRect(px + (y % 2 ? 8 : 22), py, 2, 15);
      g.fillRect(px + (y % 2 ? 20 : 6), py + 17, 2, 15);
    } else {
      g.fillRect(px + (x % 2 ? 10 : 24), py, 2, capH);
    }
    g.fillStyle = rgb(th.wallTop, 26);
    if (at(x, y - 1) !== T.WALL) g.fillRect(px, py, TILE, 2);
    if (at(x - 1, y) !== T.WALL) g.fillRect(px, py, 2, capH);
    if (at(x + 1, y) !== T.WALL) g.fillRect(px + TILE - 2, py, 2, capH);
    if (face) {
      g.fillStyle = rgb(th.wallTop, 34);
      g.fillRect(px, py + capH - 2, TILE, 2);
      const fy = py + capH, fh = TILE - capH;
      g.fillStyle = rgb(th.wallFace, Math.floor(v * 8) - 4);
      g.fillRect(px, fy, TILE, fh);
      g.fillStyle = rgb(th.mortar);
      for (let r = 0; r < 3; r++) {
        const yy = fy + r * 7;
        g.fillRect(px, yy, TILE, 1);
        const off = (r + x) % 2 ? 0 : 11;
        for (let bx = off; bx < TILE; bx += 22) g.fillRect(px + bx, yy, 1, 7);
      }
      const grd = g.createLinearGradient(0, fy, 0, fy + fh);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = grd;
      g.fillRect(px, fy, TILE, fh);
    }
    return;
  }

  const base = (x + y) & 1 ? th.floor : th.floor2;
  g.fillStyle = rgb(base, Math.floor(v * 8) - 4);
  g.fillRect(px, py, TILE, TILE);
  g.fillStyle = rgb(th.mortar);
  g.fillRect(px, py, TILE, 1);
  g.fillRect(px, py, 1, TILE);
  for (let k = 0; k < 4; k++) {
    g.fillStyle = h2(x, y, k + 1) > 0.5 ? rgb(base, 10) : rgb(base, -10);
    g.fillRect(px + 2 + Math.floor(h2(x, y, k + 11) * 27), py + 2 + Math.floor(h2(x, y, k + 21) * 27), 2, 2);
  }
  if (v > 0.88) {
    g.strokeStyle = rgb(th.mortar);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px + 6, py + 8);
    g.lineTo(px + 13, py + 14);
    g.lineTo(px + 11, py + 21);
    g.lineTo(px + 19, py + 26);
    g.stroke();
  } else if (v < 0.015) {
    g.fillStyle = 'rgba(225,215,195,0.3)';
    g.fillRect(px + 9, py + 15, 12, 2);
    g.fillRect(px + 8, py + 14, 2, 4);
    g.fillRect(px + 20, py + 14, 2, 4);
  }
  if (at(x, y - 1) === T.WALL) {
    const grd = g.createLinearGradient(0, py, 0, py + 14);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(px, py, TILE, 14);
  }
  if (at(x - 1, y) === T.WALL) {
    const grd = g.createLinearGradient(px, 0, px + 8, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.35)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(px, py, 8, TILE);
  }
  if (t === T.DOOR) drawDoor(g, px, py, at(x - 1, y) === T.DOOR || at(x + 1, y) === T.DOOR);
  else if (t === T.EXIT) drawExitTile(g, px, py);
}

function drawDoor(g, px, py, horiz) {
  g.fillStyle = '#3e2712';
  g.fillRect(px, py, TILE, TILE);
  g.fillStyle = '#7a5230';
  for (let i = 0; i < 4; i++) {
    if (horiz) g.fillRect(px + 1 + i * 8, py + 2, 6, TILE - 4);
    else g.fillRect(px + 2, py + 1 + i * 8, TILE - 4, 6);
  }
  g.fillStyle = '#2c2c36';
  if (horiz) { g.fillRect(px, py + 6, TILE, 4); g.fillRect(px, py + 22, TILE, 4); }
  else { g.fillRect(px + 6, py, 4, TILE); g.fillRect(px + 22, py, 4, TILE); }
  g.fillStyle = '#9aa0aa';
  for (const [a, b] of horiz ? [[4, 8], [28, 8], [4, 24], [28, 24]] : [[8, 4], [8, 28], [24, 4], [24, 28]]) g.fillRect(px + a - 1, py + b - 1, 2, 2);
  g.fillStyle = '#e2b340';
  g.fillRect(px + 12, py + 12, 8, 8);
  g.fillStyle = '#111';
  g.fillRect(px + 15, py + 14, 2, 4);
}

function drawExitTile(g, px, py) {
  g.fillStyle = '#07040c';
  g.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgb(${90 - i * 18},${76 - i * 15},${110 - i * 20})`;
    g.fillRect(px + 4 + i * 2, py + 4 + i * 6, TILE - 8 - i * 4, 4);
  }
  g.strokeStyle = '#e2b340';
  g.lineWidth = 2;
  g.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
}

// ---------------------------------------------------------------- helpers
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function ellipse(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
export function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function shadow(g, rx = 11, y = 11) { g.fillStyle = 'rgba(0,0,0,0.4)'; ellipse(g, 0, y, rx, rx * 0.36); }

// ---------------------------------------------------------------- heroes
export function drawHero(g, p, time) {
  const H = p.hero, walk = p.walk || 0;
  const flash = p.hurt > 0 && Math.floor(time * 30) % 2 === 0;
  const fx = Math.cos(p.facing) >= 0 ? 1 : -1;
  const up = Math.sin(p.facing) < -0.35;
  const bob = p.moving ? Math.abs(Math.sin(walk * 10)) * 2 : Math.sin(time * 2.2) * 0.6;
  const leg = p.moving ? Math.sin(walk * 10) * 3 : 0;

  g.save();
  g.translate(p.x, p.y);
  shadow(g);
  if (p.spinT > 0) g.rotate(time * 30);
  if (p.buffs && p.buffs.invis) g.globalAlpha = 0.4;

  g.fillStyle = '#231c28';
  g.fillRect(-6, 4 + leg * 0.3, 4, 7 - leg * 0.4);
  g.fillRect(2, 4 - leg * 0.3, 4, 7 + leg * 0.4);
  g.translate(0, -bob);

  if (up) drawWeapon(g, p, time);
  if (H.key === 'valkyrie' || H.key === 'warrior') { // cape
    g.fillStyle = H.dark;
    g.beginPath();
    g.moveTo(-8, -6); g.lineTo(8, -6); g.lineTo(10 - leg * 0.3, 8); g.lineTo(-10 + leg * 0.3, 8);
    g.closePath(); g.fill();
  }
  if (H.key === 'wizard') { // robe
    g.fillStyle = flash ? '#fff' : H.color;
    g.beginPath(); g.moveTo(-7, -7); g.lineTo(7, -7); g.lineTo(10, 10); g.lineTo(-10, 10); g.closePath(); g.fill();
    g.fillStyle = '#e8c860';
    g.fillRect(-10, 8, 20, 2);
  } else {
    g.fillStyle = flash ? '#fff' : H.color;
    rrect(g, -7, -7, 14, 13, 4); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(-7, 2, 14, 4);
    g.fillStyle = '#3a2614';
    g.fillRect(-7, 1, 14, 2);
    g.fillStyle = '#e8c860';
    g.fillRect(-1, 1, 3, 2);
  }
  // head
  g.fillStyle = flash ? '#fff' : '#f1c28e';
  circle(g, 0, -11, 5.5);
  if (!up) {
    g.fillStyle = '#1a1020';
    g.fillRect(fx * 1.5 - 2, -12, 1.6, 2);
    g.fillRect(fx * 1.5 + 1.2, -12, 1.6, 2);
  }
  switch (H.key) {
    case 'warrior':
      g.fillStyle = '#8a8f9a';
      g.beginPath(); g.arc(0, -12, 6.2, Math.PI, 0); g.fill();
      g.fillRect(-6.2, -13, 12.4, 2);
      g.fillStyle = '#f0ead8';
      g.beginPath(); g.moveTo(-6, -14); g.quadraticCurveTo(-12, -16, -11, -23); g.lineTo(-8, -16); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(6, -14); g.quadraticCurveTo(12, -16, 11, -23); g.lineTo(8, -16); g.closePath(); g.fill();
      if (!up) { g.fillStyle = '#b8582a'; g.fillRect(-4, -8, 8, 3); }
      break;
    case 'valkyrie':
      g.fillStyle = '#f2d16b';
      g.fillRect(-6, -11, 3, 10); g.fillRect(3, -11, 3, 10);
      g.fillStyle = '#c8ced8';
      g.beginPath(); g.arc(0, -12, 6.2, Math.PI, 0); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(-6, -14); g.lineTo(-13, -19); g.lineTo(-9, -12); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(6, -14); g.lineTo(13, -19); g.lineTo(9, -12); g.closePath(); g.fill();
      break;
    case 'wizard':
      if (!up) { g.fillStyle = '#eee'; g.beginPath(); g.moveTo(-5, -9); g.lineTo(5, -9); g.lineTo(0, -1); g.closePath(); g.fill(); }
      g.fillStyle = flash ? '#fff' : H.dark;
      ellipse(g, 0, -15, 10, 3);
      g.fillStyle = flash ? '#fff' : H.color;
      g.beginPath(); g.moveTo(-6, -15); g.lineTo(6, -15); g.lineTo(fx * 4, -30); g.closePath(); g.fill();
      g.fillStyle = '#ffe680';
      g.fillRect(-1 + fx, -22, 2, 2);
      break;
    case 'elf':
      g.fillStyle = '#f1c28e';
      g.beginPath(); g.moveTo(-5, -12); g.lineTo(-10, -15); g.lineTo(-5, -9); g.fill();
      g.beginPath(); g.moveTo(5, -12); g.lineTo(10, -15); g.lineTo(5, -9); g.fill();
      g.fillStyle = flash ? '#fff' : H.dark;
      g.beginPath(); g.moveTo(-6, -11); g.quadraticCurveTo(-6, -19, 0, -21); g.quadraticCurveTo(6, -19, 6, -11); g.lineTo(3, -14); g.lineTo(-3, -14); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-1, -20); g.lineTo(-fx * 7, -24); g.lineTo(2, -18); g.fill();
      break;
  }
  if (H.key === 'valkyrie') { // shield
    g.fillStyle = '#1f4fa0';
    circle(g, -fx * 8, -1, 5.5);
    g.strokeStyle = '#e8c860'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(-fx * 8, -1, 5.5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e8c860'; circle(g, -fx * 8, -1, 1.5);
  }
  if (!up) drawWeapon(g, p, time);
  g.restore();
}

function drawWeapon(g, p, time) {
  g.save();
  g.translate(0, -2);
  g.rotate(p.facing);
  switch (p.hero.shot) {
    case 'axe':
      g.fillStyle = '#6b4423'; g.fillRect(3, -1.2, 15, 2.4);
      g.fillStyle = '#cfd4dc';
      g.beginPath(); g.moveTo(14, -1); g.quadraticCurveTo(22, -9, 19, -1); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(14, 1); g.quadraticCurveTo(22, 9, 19, 1); g.closePath(); g.fill();
      break;
    case 'sword':
      g.fillStyle = '#6b4423'; g.fillRect(2, -1, 5, 2);
      g.fillStyle = '#e8c860'; g.fillRect(7, -4, 2, 8);
      g.fillStyle = '#e6ecf5'; g.fillRect(9, -1.5, 13, 3);
      g.beginPath(); g.moveTo(22, -1.5); g.lineTo(25, 0); g.lineTo(22, 1.5); g.fill();
      break;
    case 'fire': {
      g.fillStyle = '#7a5230'; g.fillRect(0, -1, 19, 2);
      const pulse = 3 + Math.sin(time * 8) * 0.8;
      g.fillStyle = 'rgba(255,140,60,0.35)'; circle(g, 20, 0, pulse + 3);
      g.fillStyle = '#ffcf6a'; circle(g, 20, 0, pulse);
      break;
    }
    case 'arrow':
      g.strokeStyle = '#8a5a2a'; g.lineWidth = 2;
      g.beginPath(); g.arc(6, 0, 10, -1.2, 1.2); g.stroke();
      g.strokeStyle = '#ddd'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(6 + Math.cos(-1.2) * 10, Math.sin(-1.2) * 10); g.lineTo(6 + Math.cos(1.2) * 10, Math.sin(1.2) * 10); g.stroke();
      break;
  }
  g.restore();
}

export function drawTomb(g, p, time) {
  g.save();
  g.translate(p.x, p.y);
  shadow(g, 10, 9);
  g.fillStyle = '#6a6a78';
  rrect(g, -8, -14, 16, 22, 6); g.fill();
  g.fillStyle = '#4a4a56';
  g.fillRect(-8, 4, 16, 4);
  g.fillStyle = p.hero.color;
  g.fillRect(-1.5, -10, 3, 12);
  g.fillRect(-5, -6, 10, 3);
  if (p.revive > 0) {
    g.strokeStyle = '#7dffa0'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, -3, 18, -Math.PI / 2, -Math.PI / 2 + (p.revive / 2.2) * Math.PI * 2); g.stroke();
  }
  g.restore();
}

// ---------------------------------------------------------------- enemies
const TIER_COL = {
  ghost: ['#e4ebff', '#a9c1ff', '#c79bff'],
  grunt: ['#b08040', '#8a8a4a', '#7a6a8a'],
  demon: ['#e04a30', '#c02a50', '#8a1a1a'],
  lobber: ['#7fc050', '#50a070', '#3a8a8a'],
  sorcerer: ['#f0c040', '#f08a30', '#e04a8a'],
  death: ['#1a1420', '#1a1420', '#1a1420'],
};

export function drawEnemy(g, e, time) {
  if (e.type === 'boss') { drawBoss(g, e, time); return; }
  const s = 0.85 + 0.1 * e.tier;
  const col = e.flash > 0 ? '#ffffff' : TIER_COL[e.type][e.tier - 1];
  const fx = Math.cos(e.face) >= 0 ? 1 : -1;
  const a = e.anim;
  g.save();
  g.translate(e.x, e.y);
  if (e.type !== 'ghost' && e.type !== 'death') shadow(g, 10 * s, 10 * s);
  g.scale(s, s);
  switch (e.type) {
    case 'ghost': {
      g.globalAlpha = 0.85;
      g.fillStyle = 'rgba(0,0,0,0.25)'; ellipse(g, 0, 13, 9, 3);
      const y0 = Math.sin(a * 4) * 2;
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(-10, 8 + y0);
      g.lineTo(-10, -3 + y0);
      g.arc(0, -3 + y0, 10, Math.PI, 0);
      g.lineTo(10, 8 + y0);
      for (let i = 0; i < 4; i++) {
        const xx = 10 - (i + 1) * 5;
        g.quadraticCurveTo(xx + 2.5, 13 + y0 + Math.sin(a * 8 + i) * 2, xx, 8 + y0);
      }
      g.closePath(); g.fill();
      g.fillStyle = '#10081a';
      ellipse(g, -3.5 + fx * 1.5, -4 + y0, 2.2, 3.2);
      ellipse(g, 3.5 + fx * 1.5, -4 + y0, 2.2, 3.2);
      ellipse(g, fx * 1.5, 3 + y0, 2.5, 1.8 + Math.sin(a * 6));
      break;
    }
    case 'grunt': {
      const sw = e.atk > 0 ? 1.4 : 0;
      g.fillStyle = '#2a1c14';
      g.fillRect(-7, 5, 5, 6); g.fillRect(2, 5, 5, 6);
      g.fillStyle = col;
      rrect(g, -10, -9, 20, 17, 6); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-10, 2, 20, 6);
      g.fillStyle = '#3a2410'; g.fillRect(-10, 0, 20, 3);
      g.fillStyle = '#ff3a2a';
      g.fillRect(-5 + fx * 2, -5, 3, 2); g.fillRect(2 + fx * 2, -5, 3, 2);
      g.fillStyle = '#f0ead8';
      g.fillRect(-5 + fx * 2, -1, 2, 3); g.fillRect(3 + fx * 2, -1, 2, 3);
      g.save();
      g.rotate(e.face + (sw ? -0.9 : 0.5));
      g.fillStyle = '#6b4423'; g.fillRect(6, -2, 12, 4);
      g.fillStyle = '#4a2c14'; circle(g, 18, 0, 4);
      g.restore();
      break;
    }
    case 'demon': {
      const flap = Math.sin(a * 10) * 4;
      g.fillStyle = e.flash > 0 ? '#fff' : '#5a1010';
      g.beginPath(); g.moveTo(-6, -4); g.lineTo(-18, -12 - flap); g.lineTo(-14, 2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(6, -4); g.lineTo(18, -12 - flap); g.lineTo(14, 2); g.closePath(); g.fill();
      g.fillStyle = col;
      rrect(g, -8, -10, 16, 20, 7); g.fill();
      g.fillStyle = '#f0ead8';
      g.beginPath(); g.moveTo(-6, -8); g.lineTo(-9, -17); g.lineTo(-2, -9); g.fill();
      g.beginPath(); g.moveTo(6, -8); g.lineTo(9, -17); g.lineTo(2, -9); g.fill();
      g.fillStyle = '#ffe23a';
      g.fillRect(-5 + fx * 2, -4, 3, 3); g.fillRect(2 + fx * 2, -4, 3, 3);
      g.strokeStyle = col; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-fx * 6, 8); g.quadraticCurveTo(-fx * 14, 12, -fx * 12, 4 + Math.sin(a * 5) * 2); g.stroke();
      break;
    }
    case 'lobber': {
      g.fillStyle = col;
      ellipse(g, 0, 2, 9, 8);
      g.fillStyle = '#fff';
      circle(g, -3 + fx * 2, -2, 3); circle(g, 3 + fx * 2, -2, 3);
      g.fillStyle = '#111';
      circle(g, -3 + fx * 3, -2, 1.4); circle(g, 3 + fx * 3, -2, 1.4);
      if (e.shootCd < 0.8) { g.fillStyle = '#8a8078'; circle(g, 0, -12, 4.5); }
      break;
    }
    case 'sorcerer': {
      g.globalAlpha = e.invis ? 0.12 : 1;
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, -16); g.lineTo(10, 11); g.lineTo(-10, 11); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.moveTo(0, -9); g.lineTo(5, 2); g.lineTo(-5, 2); g.closePath(); g.fill();
      g.fillStyle = '#7dfcff';
      g.fillRect(-3 + fx, -5, 2, 2); g.fillRect(1 + fx, -5, 2, 2);
      g.strokeStyle = '#6b4423'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(fx * 10, 10); g.lineTo(fx * 12, -14); g.stroke();
      g.fillStyle = '#7dfcff'; circle(g, fx * 12, -15, 2.5);
      break;
    }
    case 'death': {
      g.fillStyle = 'rgba(154,96,255,0.18)';
      circle(g, 0, 0, 20 + Math.sin(a * 5) * 2);
      g.fillStyle = e.flash > 0 ? '#fff' : '#120c18';
      g.beginPath(); g.moveTo(-10, -6);
      g.quadraticCurveTo(0, -20, 10, -6);
      g.lineTo(12, 12);
      for (let i = 0; i < 5; i++) g.lineTo(12 - (i + 0.5) * 4.8, 12 + ((i % 2) ? -3 : 3) + Math.sin(a * 6 + i) * 2);
      g.lineTo(-12, 12);
      g.closePath(); g.fill();
      g.fillStyle = '#e8e4da'; circle(g, 0, -6, 6);
      g.fillStyle = '#120c18';
      g.fillRect(-3.5, -8, 2.5, 3); g.fillRect(1, -8, 2.5, 3); g.fillRect(-2, -3, 4, 1.5);
      g.strokeStyle = '#8a8a96'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(fx * 12, 14); g.lineTo(fx * 12, -18); g.stroke();
      g.strokeStyle = '#d8dce6'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(fx * 12, -18); g.quadraticCurveTo(fx * 2, -24, -fx * 4, -14); g.stroke();
      break;
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- generators
export function drawGenerator(g, gen, time) {
  const col = TIER_COL[gen.type][0];
  const pulse = gen.spawnT < 0.6 ? 1 - gen.spawnT / 0.6 : 0;
  g.save();
  g.translate(gen.x, gen.y);
  g.fillStyle = 'rgba(0,0,0,0.4)'; ellipse(g, 0, 12, 15, 5);
  if (gen.type === 'ghost' || gen.type === 'death') {
    g.fillStyle = gen.flash > 0 ? '#fff' : '#2a2430';
    ellipse(g, 0, 6, 15, 8);
    g.strokeStyle = gen.flash > 0 ? '#fff' : '#e8e0cc';
    g.lineWidth = 3; g.lineCap = 'round';
    const bones = [[-10, 4, 6, -2], [-4, 8, 10, 2], [-8, -2, 4, 6], [2, -4, 12, 6]];
    for (const [x0, y0, x1, y1] of bones) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    g.lineCap = 'butt';
    g.fillStyle = gen.type === 'death' ? '#9a60ff' : '#e8e0cc';
    circle(g, 0, -5, 6);
    g.fillStyle = '#111';
    g.fillRect(-3, -7, 2, 2); g.fillRect(1, -7, 2, 2);
  } else {
    g.fillStyle = gen.flash > 0 ? '#fff' : '#3a3440';
    g.fillRect(-14, -8, 28, 20);
    g.fillStyle = gen.flash > 0 ? '#fff' : '#5a4a3a';
    g.beginPath(); g.moveTo(-16, -8); g.lineTo(0, -20); g.lineTo(16, -8); g.closePath(); g.fill();
    g.fillStyle = '#0a0610';
    rrect(g, -6, -2, 12, 14, 5); g.fill();
    g.fillStyle = col;
    g.globalAlpha = 0.4 + pulse * 0.6;
    rrect(g, -4, 0, 8, 12, 4); g.fill();
    g.globalAlpha = 1;
  }
  for (let i = 0; i < gen.tier; i++) {
    g.fillStyle = col;
    g.fillRect(-9 + i * 7, 14, 4, 3);
  }
  if (gen.hp < gen.hpPerTier * gen.maxTier) {
    const f = Math.max(0, gen.hp / (gen.hpPerTier * gen.maxTier));
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(-14, -26, 28, 4);
    g.fillStyle = '#ff5a3a'; g.fillRect(-14, -26, 28 * f, 4);
  }
  g.restore();
}

// ---------------------------------------------------------------- items
export const AMULET_COL = { invuln: '#ffd35a', rapid: '#ff6a3a', speed: '#5affd0', multi: '#ff5ae0', invis: '#9aa0ff' };

export function drawItem(g, it, time) {
  const bob = Math.sin(time * 3 + it.bob) * 2;
  g.save();
  g.translate(it.x, it.y);
  g.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(g, 0, 9, 8, 3);
  g.translate(0, bob - 2);
  switch (it.kind) {
    case 'meat':
      g.fillStyle = '#efe6d2';
      g.fillRect(3, -2, 8, 3); circle(g, 11, -3, 2); circle(g, 11, 1, 2);
      g.fillStyle = '#a0522d'; ellipse(g, -2, 0, 8, 6);
      g.fillStyle = '#c8743a'; ellipse(g, -3, -2, 5, 3);
      break;
    case 'cider':
      g.fillStyle = '#7a4a22'; rrect(g, -7, -6, 14, 14, 5); g.fill();
      g.fillStyle = '#5a3414'; g.fillRect(-3, -11, 6, 6);
      g.strokeStyle = '#5a3414'; g.lineWidth = 2;
      g.beginPath(); g.arc(7, 0, 4, -1.4, 1.4); g.stroke();
      g.fillStyle = '#e8d8b0'; g.fillRect(-5, -1, 10, 4);
      break;
    case 'potion':
      g.fillStyle = 'rgba(90,200,255,0.25)'; circle(g, 0, 1, 11);
      g.fillStyle = '#3aa8ff'; circle(g, 0, 2, 7);
      g.fillStyle = '#bfe8ff'; g.fillRect(-2.5, -9, 5, 6);
      g.fillStyle = '#8a5a2a'; g.fillRect(-2.5, -11, 5, 3);
      g.fillStyle = '#fff'; g.fillRect(-4, -1, 2, 3);
      break;
    case 'key':
      g.strokeStyle = '#ffd35a'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(-6, 0, 4, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffd35a';
      g.fillRect(-2, -1.5, 13, 3); g.fillRect(6, 1, 2, 4); g.fillRect(9, 1, 2, 3);
      break;
    case 'treasure':
      g.fillStyle = '#b8860b'; ellipse(g, 0, 4, 10, 4);
      g.fillStyle = '#ffd35a';
      for (const [x, y] of [[-5, 1], [3, 2], [0, -2], [-2, 4], [5, -1]]) ellipse(g, x, y, 3.5, 2);
      g.fillStyle = '#fff'; g.fillRect(-1, -3, 1.5, 1.5);
      break;
    case 'chest':
      g.fillStyle = '#6b4423'; g.fillRect(-10, -5, 20, 13);
      g.fillStyle = '#8a5a2a'; rrect(g, -10, -10, 20, 7, 3); g.fill();
      g.fillStyle = '#ffd35a';
      g.fillRect(-10, -4, 20, 2); g.fillRect(-2, -5, 4, 5);
      g.fillRect(-10, -10, 2, 18); g.fillRect(8, -10, 2, 18);
      break;
    case 'amulet': {
      const c = AMULET_COL[it.sub] || '#fff';
      g.globalAlpha = 0.3 + Math.sin(time * 6) * 0.15;
      g.fillStyle = c; circle(g, 0, 0, 12);
      g.globalAlpha = 1;
      g.strokeStyle = '#ffd35a'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-6, -10); g.lineTo(0, -4); g.lineTo(6, -10); g.stroke();
      g.fillStyle = c;
      g.beginPath(); g.moveTo(0, -5); g.lineTo(6, 1); g.lineTo(0, 8); g.lineTo(-6, 1); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(-2, -1, 2, 3);
      break;
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- projectiles
export const PROJ_GLOW = { fire: '#ff9a3a', efire: '#ff4a2a', bolt: '#7dfcff', storm: '#7dffb0', orb: '#7dff8a' };

export function drawProjectile(g, pr, time) {
  g.save();
  g.translate(pr.x, pr.y);
  switch (pr.kind) {
    case 'axe':
      g.rotate(pr.spin);
      g.fillStyle = '#6b4423'; g.fillRect(-7, -1.2, 14, 2.4);
      g.fillStyle = '#dfe4ec';
      g.beginPath(); g.moveTo(3, -1); g.quadraticCurveTo(10, -9, 8, -1); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(3, 1); g.quadraticCurveTo(10, 9, 8, 1); g.closePath(); g.fill();
      break;
    case 'sword':
      g.rotate(pr.spin);
      g.fillStyle = '#e8c860'; g.fillRect(-4, -4, 2, 8);
      g.fillStyle = '#f0f4fa'; g.fillRect(-2, -1.5, 12, 3);
      g.fillStyle = '#6b4423'; g.fillRect(-8, -1, 4, 2);
      break;
    case 'arrow':
    case 'storm':
      g.rotate(pr.ang);
      g.strokeStyle = pr.kind === 'storm' ? '#aaffd0' : '#c89a5a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-9, 0); g.lineTo(7, 0); g.stroke();
      g.fillStyle = '#e6ecf5';
      g.beginPath(); g.moveTo(11, 0); g.lineTo(6, -3); g.lineTo(6, 3); g.closePath(); g.fill();
      g.fillStyle = pr.kind === 'storm' ? '#5aff9a' : '#e04a3a';
      g.fillRect(-10, -3, 4, 2); g.fillRect(-10, 1, 4, 2);
      break;
    case 'fire':
    case 'efire': {
      const r = pr.kind === 'fire' ? 7 : 6;
      g.fillStyle = pr.kind === 'fire' ? 'rgba(255,120,40,0.5)' : 'rgba(255,40,20,0.5)';
      circle(g, 0, 0, r + 2 + Math.sin(time * 30) * 1.2);
      g.fillStyle = pr.kind === 'fire' ? '#ffb040' : '#ff6a3a';
      circle(g, 0, 0, r);
      g.fillStyle = '#fff5c0'; circle(g, 0, 0, r * 0.45);
      break;
    }
    case 'orb':
      g.fillStyle = 'rgba(90,255,140,0.35)'; circle(g, 0, 0, 12 + Math.sin(time * 20) * 2);
      g.fillStyle = '#3aff7a'; circle(g, 0, 0, 7);
      g.fillStyle = '#eaffef'; circle(g, -2, -2, 3);
      break;
    case 'bolt':
      g.rotate(pr.spin);
      g.fillStyle = '#7dfcff';
      g.beginPath(); g.moveTo(0, -7); g.lineTo(4, 0); g.lineTo(0, 7); g.lineTo(-4, 0); g.closePath(); g.fill();
      g.fillStyle = '#fff'; circle(g, 0, 0, 2);
      break;
  }
  g.restore();
}

export function drawLob(g, lob) {
  if (lob.t < 0) return;
  const k = lob.t / lob.dur;
  const x = lob.x0 + (lob.x1 - lob.x0) * k, y = lob.y0 + (lob.y1 - lob.y0) * k;
  const z = Math.sin(Math.PI * k) * 70;
  g.strokeStyle = `rgba(255,60,40,${0.3 + k * 0.5})`;
  g.lineWidth = 2;
  g.beginPath(); g.arc(lob.x1, lob.y1, 34 * (1.2 - k * 0.4), 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.35)'; ellipse(g, x, y + 4, 6, 2.5);
  if (lob.fire) {
    g.fillStyle = 'rgba(255,120,40,0.5)'; circle(g, x, y - z, 10);
    g.fillStyle = '#ffb040'; circle(g, x, y - z, 6);
    g.fillStyle = '#fff5c0'; circle(g, x, y - z, 3);
  } else {
    g.fillStyle = '#8a8078'; circle(g, x, y - z, 5);
    g.fillStyle = '#b0a8a0'; circle(g, x - 1.5, y - z - 1.5, 2);
  }
}

export function drawTorch(g, t, time) {
  const f = Math.sin(time * 14 + t.ph) * 1.5;
  g.fillStyle = '#4a3020';
  g.fillRect(t.x - 2, t.y - 2, 4, 9);
  g.fillStyle = '#ff7a1a';
  g.beginPath(); g.moveTo(t.x - 4, t.y - 2); g.quadraticCurveTo(t.x, t.y - 14 - f, t.x + 4, t.y - 2); g.closePath(); g.fill();
  g.fillStyle = '#ffe07a';
  g.beginPath(); g.moveTo(t.x - 2, t.y - 2); g.quadraticCurveTo(t.x, t.y - 9 - f, t.x + 2, t.y - 2); g.closePath(); g.fill();
}

// ---------------------------------------------------------------- bosses
export function drawBoss(g, e, time) {
  const a = e.anim, r = e.r, fx = Math.cos(e.face) >= 0 ? 1 : -1, flash = e.flash > 0;
  g.save();
  g.translate(e.x, e.y);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  ellipse(g, 0, r * 0.75, r * 1.1, r * 0.33);
  if (e.invis) g.globalAlpha = 0.2;
  if (e.kind === 'dragon') {
    const body = flash ? '#fff' : e.phase === 2 ? '#e8342c' : '#b8262a';
    const flap = Math.sin(a * 4) * 0.3;
    g.strokeStyle = body; g.lineWidth = r * 0.24; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-fx * r * 0.5, r * 0.25);
    g.quadraticCurveTo(-fx * r * 1.4, r * 0.7 + Math.sin(a * 3) * 6, -fx * r * 1.55, Math.sin(a * 3 + 1) * 8);
    g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = flash ? '#fff' : '#5a0e14';
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(sd * r * 0.2, -r * 0.3);
      g.lineTo(sd * r * 1.55, -r * (1.15 + flap));
      g.lineTo(sd * r * 1.25, -r * 0.35);
      g.lineTo(sd * r * 1.35, r * 0.05);
      g.lineTo(sd * r * 0.9, -r * 0.1);
      g.lineTo(sd * r * 0.5, r * 0.15);
      g.closePath(); g.fill();
    }
    g.fillStyle = body; ellipse(g, 0, 0, r * 0.8, r * 0.62);
    g.fillStyle = flash ? '#fff' : '#f0a040'; ellipse(g, fx * r * 0.1, r * 0.18, r * 0.45, r * 0.32);
    g.fillStyle = body;
    g.fillRect(-r * 0.55, r * 0.35, r * 0.28, r * 0.38); g.fillRect(r * 0.27, r * 0.35, r * 0.28, r * 0.38);
    const hx = Math.cos(e.face) * r * 0.95, hy = Math.sin(e.face) * r * 0.55 - r * 0.4;
    g.strokeStyle = body; g.lineWidth = r * 0.34;
    g.beginPath(); g.moveTo(0, -r * 0.25); g.lineTo(hx * 0.8, hy * 0.85); g.stroke();
    g.save();
    g.translate(hx, hy);
    if (fx < 0) g.scale(-1, 1);
    g.fillStyle = body; ellipse(g, 0, 0, r * 0.42, r * 0.3);
    g.fillRect(r * 0.1, -r * 0.13, r * 0.48, r * 0.24);
    g.fillStyle = '#f0ead8';
    g.beginPath(); g.moveTo(-r * 0.15, -r * 0.22); g.lineTo(-r * 0.5, -r * 0.55); g.lineTo(-r * 0.02, -r * 0.26); g.fill();
    g.fillStyle = '#ffe23a'; circle(g, r * 0.08, -r * 0.1, 3.5);
    g.fillStyle = '#1a0a0a'; g.fillRect(r * 0.3, r * 0.04, r * 0.28, 2);
    if (e.act === 'breath') {
      g.fillStyle = 'rgba(255,170,50,0.85)'; circle(g, r * 0.6, 0, 6 + Math.sin(time * 30) * 2);
    }
    g.restore();
  } else if (e.kind === 'lich') {
    g.translate(0, Math.sin(a * 2) * 4 - 8);
    const casting = ['nova', 'orbs', 'summon'].includes(e.act);
    g.fillStyle = `rgba(90,255,140,${0.1 + 0.06 * Math.sin(a * 4) + (casting ? 0.12 : 0)})`;
    circle(g, 0, 0, r * 1.5);
    g.fillStyle = flash ? '#fff' : e.phase === 2 ? '#3a1030' : '#221432';
    g.beginPath();
    g.moveTo(-r * 0.75, r * 0.95);
    g.lineTo(-r * 0.45, -r * 0.4);
    g.quadraticCurveTo(0, -r * 0.85, r * 0.45, -r * 0.4);
    g.lineTo(r * 0.75, r * 0.95);
    for (let i = 0; i < 6; i++) g.lineTo(r * 0.75 - (i + 0.5) * r * 0.25, r * (0.95 + (i % 2 ? -0.12 : 0.1)) + Math.sin(a * 6 + i) * 2);
    g.closePath(); g.fill();
    g.strokeStyle = '#7dff8a'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = flash ? '#fff' : '#e8e4da'; circle(g, 0, -r * 0.6, r * 0.32);
    g.fillStyle = '#0a0a10';
    g.fillRect(-r * 0.16, -r * 0.68, r * 0.12, r * 0.12); g.fillRect(r * 0.04, -r * 0.68, r * 0.12, r * 0.12);
    g.fillStyle = '#7dff8a';
    g.fillRect(-r * 0.13, -r * 0.65, r * 0.06, r * 0.06); g.fillRect(r * 0.07, -r * 0.65, r * 0.06, r * 0.06);
    g.fillStyle = '#e2b340';
    g.beginPath();
    g.moveTo(-r * 0.3, -r * 0.82);
    for (let i = 0; i < 5; i++) { g.lineTo(-r * 0.3 + i * r * 0.15, -r * 1.05); g.lineTo(-r * 0.22 + i * r * 0.15, -r * 0.84); }
    g.closePath(); g.fill();
    g.strokeStyle = '#5a3a22'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(fx * r * 0.6, r * 0.85); g.lineTo(fx * r * 0.72, -r * 1.05); g.stroke();
    g.fillStyle = casting ? '#b0ffc0' : '#3aff7a'; circle(g, fx * r * 0.72, -r * 1.12, casting ? 7 + Math.sin(time * 25) * 2 : 5);
  } else {
    const body = flash ? '#fff' : '#7a7468', dark = flash ? '#fff' : '#4a463e';
    if (e.act === 'windup') g.translate(Math.sin(time * 60) * 2, 0);
    const swing = e.act === 'slam' ? -r * 0.5 : Math.sin(a * 4) * 3;
    g.fillStyle = dark;
    g.fillRect(-r * 0.55, r * 0.2, r * 0.4, r * 0.55); g.fillRect(r * 0.15, r * 0.2, r * 0.4, r * 0.55);
    g.fillStyle = body; rrect(g, -r * 0.78, -r * 0.62, r * 1.56, r * 0.98, 8); g.fill();
    g.strokeStyle = e.phase === 2 ? '#ff5a2a' : '#ffae40'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-r * 0.4, -r * 0.5); g.lineTo(-r * 0.2, -r * 0.2); g.lineTo(-r * 0.35, r * 0.1);
    g.moveTo(r * 0.3, -r * 0.45); g.lineTo(r * 0.15, -r * 0.1); g.lineTo(r * 0.4, r * 0.2);
    g.stroke();
    g.fillStyle = body; rrect(g, -r * 0.32, -r * 0.98, r * 0.64, r * 0.42, 6); g.fill();
    g.fillStyle = e.act === 'windup' || e.act === 'charge' ? '#ff3a2a' : '#ffae40';
    g.fillRect(-r * 0.2 + fx * 3, -r * 0.84, r * 0.14, r * 0.1); g.fillRect(r * 0.06 + fx * 3, -r * 0.84, r * 0.14, r * 0.1);
    g.fillStyle = dark;
    circle(g, -r * 0.98, r * 0.05 + swing, r * 0.3); circle(g, r * 0.98, r * 0.05 + swing, r * 0.3);
    if (e.act === 'stun') {
      g.fillStyle = '#ffe23a';
      for (let i = 0; i < 3; i++) {
        const sa = time * 5 + (i * Math.PI * 2) / 3;
        circle(g, Math.cos(sa) * r * 0.5, -r * 1.15 + Math.sin(sa) * r * 0.15, 3);
      }
    }
  }
  g.restore();
}

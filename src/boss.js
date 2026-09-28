import { TILE, T } from './constants.js';
import { rand, pick, norm } from './util.js';
import * as R from './render.js';

// Boss fights, run by whoever simulates the game (local or online host).
// A boss lives in game.enemies with type 'boss' so shots, specials,
// potions and auto-aim all work on it without special cases.

export const BOSS_DEF = {
  dragon: { hp: 2200, r: 38, speed: 55 },
  lich: { hp: 1700, r: 24, speed: 75 },
  golem: { hp: 2600, r: 34, speed: 60 },
};
export const BOSS_ACTS = ['sleep', 'walk', 'breath', 'tail', 'meteor', 'tele', 'nova', 'orbs', 'summon', 'windup', 'charge', 'stun', 'slam', 'boulder'];

const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function spawnBoss(game, b) {
  const d = BOSS_DEF[b.kind];
  const cycle = Math.floor(game.levelNum / 15);
  const hp = d.hp * (1 + 0.4 * cycle) * (1 + 0.04 * game.levelNum) * (0.6 + 0.4 * game.players.length);
  const e = {
    type: 'boss', kind: b.kind, tier: 3, def: { points: 5000, dmg: 15 },
    x: (b.x + 0.5) * TILE, y: (b.y + 0.5) * TILE, r: d.r, hp, maxHp: hp, speed: d.speed,
    atkCd: 0, shootCd: 1, flash: 0, stun: 0, kx: 0, ky: 0, face: Math.PI, atk: 0, dead: false,
    awake: false, invis: false, anim: 0, act: 'sleep', actT: 0, cd: 2, phase: 1, parent: null,
    power: 1 + 0.25 * cycle,
  };
  game.enemies.push(e);
  game.boss = e;
  return e;
}

export function wakeBoss(game, e) {
  if (e.awake) return;
  e.awake = true;
  e.act = 'walk';
  e.cd = 2;
  game.setBanner('name_' + e.kind, 'boss_sub');
  game.say('boss_' + e.kind);
  game.sfx('roar');
  game.shake = Math.max(game.shake, 12);
  game.addEffect({ kind: 'ring', x: e.x, y: e.y, r0: e.r, r1: 260, life: 0.8, max: 0.8, color: '#ff5a3a', w: 16 });
  game.music('boss');
}

function shoot(game, e, x, y, a, speed, dmg, kind = 'efire', life = 1.6, homing = false) {
  game.projectiles.push({
    team: 1, kind, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: kind === 'orb' ? 9 : 6,
    dmg: dmg * e.power, life, ang: a, spin: 0, dead: false, homing,
  });
}

function hitArea(game, e, x, y, radius, dmg, force) {
  for (const p of game.players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < radius + p.r) { game.hurtPlayer(p, dmg * e.power); game.knockPlayer(p, x, y, force); }
  }
}

function minions(game, e) { return game.enemies.filter(o => o.parent === e && !o.dead).length; }

function arenaSpot(game, e, alive) {
  const A = game.arena;
  for (let i = 0; i < 30; i++) {
    const tx = A.x + 1 + Math.floor(Math.random() * (A.w - 2)), ty = A.y + 1 + Math.floor(Math.random() * (A.h - 2));
    if (game.solidTile(tx, ty)) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (game.boxHits(x, y, e.r * 0.8)) continue;
    if (alive.every(p => Math.hypot(p.x - x, p.y - y) > 170)) return [x, y];
  }
  return null;
}

export function updateBoss(game, e, alive, dt) {
  e.anim += dt; e.flash -= dt; e.actT -= dt; e.cd -= dt; e.atkCd -= dt;
  e.stun = 0; e.kx = 0; e.ky = 0;
  let tgt = null, td = Infinity;
  for (const p of alive) {
    if (p.buffs.invis) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < td) { td = d; tgt = p; }
  }
  if (!e.awake) {
    if (tgt && td < 9 * TILE) wakeBoss(game, e);
    else return;
  }
  if (e.phase === 1 && e.hp < e.maxHp * 0.5) {
    e.phase = 2;
    e.speed *= 1.3;
    game.setBanner('rage', 'boss_rage');
    game.say('boss_rage');
    game.sfx('roar');
    game.shake = Math.max(game.shake, 10);
    game.addEffect({ kind: 'ring', x: e.x, y: e.y, r0: e.r, r1: 220, life: 0.6, max: 0.6, color: '#ff2a2a', w: 14 });
  }
  if (tgt) {
    if (e.kind === 'dragon') dragon(game, e, tgt, td, dt);
    else if (e.kind === 'lich') lich(game, e, tgt, td, dt, alive);
    else golem(game, e, tgt, td, dt);
  }
  // body contact
  for (const p of alive) {
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < e.r + p.r + 2 && e.atkCd <= 0 && !e.invis) {
      game.hurtPlayer(p, 15 * e.power);
      game.knockPlayer(p, e.x, e.y, 260);
      e.atkCd = 0.7;
    }
    game.separate(p, e);
  }
}

function walkTo(game, e, tx, ty, dt, speed = e.speed) {
  const [nx, ny] = norm(tx - e.x, ty - e.y);
  game.moveEntity(e, nx * speed * dt, ny * speed * dt);
}

// ------------------------------------------------------------------ dragon
function dragon(game, e, tgt, td, dt) {
  const toT = Math.atan2(tgt.y - e.y, tgt.x - e.x);
  switch (e.act) {
    case 'walk':
      e.face = toT;
      if (td > 150) walkTo(game, e, tgt.x, tgt.y, dt);
      else if (td < 90) walkTo(game, e, e.x * 2 - tgt.x, e.y * 2 - tgt.y, dt, e.speed * 0.5);
      if (e.cd > 0) break;
      if (td < 120 && Math.random() < 0.6) { e.act = 'tail'; e.actT = 0.7; e.fired = false; }
      else if (e.phase === 2 && Math.random() < 0.35) {
        e.act = 'meteor'; e.actT = 1.2;
        game.sfx('roar');
        const targets = game.players.filter(p => p.alive);
        for (let i = 0; i < 5 + targets.length; i++) {
          const p = pick(targets);
          game.lobs.push({ x0: e.x, y0: e.y - e.r, x1: p.x + rand(-90, 90), y1: p.y + rand(-90, 90), t: -i * 0.12, dur: 1.1, dmg: 20 * e.power, fire: true });
        }
      } else { e.act = 'breath'; e.actT = 1.6; e.shotT = 0; e.breathA = toT; game.sfx('roar'); }
      break;
    case 'breath': {
      e.breathA += angleDiff(e.breathA, toT) * Math.min(1, dt * (e.phase === 2 ? 2 : 1.3));
      e.face = e.breathA;
      if (e.actT < 1.25) {
        e.shotT -= dt;
        const mx = e.x + Math.cos(e.face) * e.r, my = e.y + Math.sin(e.face) * e.r * 0.6 - e.r * 0.35;
        while (e.shotT <= 0) {
          e.shotT += e.phase === 2 ? 0.035 : 0.05;
          shoot(game, e, mx, my, e.breathA + rand(-0.3, 0.3) * (e.phase === 2 ? 1.4 : 1), rand(230, 300), 9, 'efire', 1.1);
        }
        if (Math.random() < 0.15) game.sfx('breath');
      }
      if (e.actT <= 0) { e.act = 'walk'; e.cd = e.phase === 2 ? rand(1.2, 2) : rand(2, 3); }
      break;
    }
    case 'tail':
      if (!e.fired && e.actT < 0.3) {
        e.fired = true;
        game.addEffect({ kind: 'ring', x: e.x, y: e.y, r0: e.r, r1: e.r + 85, life: 0.35, max: 0.35, color: '#ff6a3a', w: 14 });
        game.sfx('slam');
        game.shake = Math.max(game.shake, 6);
        hitArea(game, e, e.x, e.y, e.r + 85, 28, 380);
      }
      if (e.actT <= 0) { e.act = 'walk'; e.cd = rand(1, 1.6); }
      break;
    case 'meteor':
      if (e.actT <= 0) { e.act = 'walk'; e.cd = rand(1.5, 2.5); }
      break;
    default: e.act = 'walk';
  }
}

// ------------------------------------------------------------------ lich
function lich(game, e, tgt, td, dt, alive) {
  const toT = Math.atan2(tgt.y - e.y, tgt.x - e.x);
  e.face = toT;
  switch (e.act) {
    case 'walk': {
      if (td < 160) walkTo(game, e, e.x * 2 - tgt.x, e.y * 2 - tgt.y, dt);
      else if (td > 280) walkTo(game, e, tgt.x, tgt.y, dt);
      else walkTo(game, e, e.x - Math.sin(toT) * 50, e.y + Math.cos(toT) * 50, dt, e.speed * 0.6);
      if (e.cd > 0) break;
      const opts = ['nova', 'orbs', 'tele'];
      if (minions(game, e) < 6) opts.push('summon');
      e.act = pick(opts);
      e.fired = 0;
      e.actT = { nova: e.phase === 2 ? 1.1 : 0.8, orbs: 0.6, tele: 0.9, summon: 0.8 }[e.act];
      if (e.act === 'tele') { e.invis = true; game.sfx('tele'); game.burst(e.x, e.y, '#7dff8a', 20, 140, 0.5, 3, true); }
      break;
    }
    case 'nova': {
      const rings = e.phase === 2 ? 2 : 1;
      const due = e.fired === 0 ? e.actT < 0.45 : e.actT < 0.2;
      if (e.fired < rings && due) {
        const n = e.phase === 2 ? 22 : 16, off = e.fired * (Math.PI / n);
        for (let i = 0; i < n; i++) shoot(game, e, e.x, e.y, (i / n) * Math.PI * 2 + off, 200, 10, 'bolt', 2.5);
        e.fired++;
        game.sfx('nova');
      }
      if (e.actT <= 0) { e.act = 'walk'; e.cd = rand(1.4, 2.4) / (e.phase === 2 ? 1.4 : 1); }
      break;
    }
    case 'orbs':
      if (!e.fired && e.actT < 0.3) {
        e.fired = 1;
        const n = e.phase === 2 ? 5 : 3;
        for (let i = 0; i < n; i++) shoot(game, e, e.x, e.y, toT + (i - (n - 1) / 2) * 0.5, 120, 16, 'orb', 5, true);
        game.sfx('eshot');
      }
      if (e.actT <= 0) { e.act = 'walk'; e.cd = rand(1.4, 2.4); }
      break;
    case 'summon':
      if (!e.fired && e.actT < 0.4) {
        e.fired = 1;
        const kinds = game.levelNum >= 10 ? ['ghost', 'grunt', 'sorcerer'] : ['ghost', 'grunt'];
        for (let i = 0; i < 3 + (e.phase === 2 ? 1 : 0); i++) {
          const a = Math.random() * Math.PI * 2, x = e.x + Math.cos(a) * 60, y = e.y + Math.sin(a) * 60;
          if (game.boxHits(x, y, 10)) continue;
          const m = game.spawnEnemy(pick(kinds), 2, x, y);
          m.parent = e; m.awake = true;
          game.burst(x, y, '#7dff8a', 12, 100, 0.5, 3, true);
        }
        game.addEffect({ kind: 'ring', x: e.x, y: e.y, r0: 10, r1: 90, life: 0.5, max: 0.5, color: '#7dff8a', w: 8 });
        game.sfx('spawn');
      }
      if (e.actT <= 0) { e.act = 'walk'; e.cd = rand(2, 3); }
      break;
    case 'tele':
      if (!e.fired && e.actT < 0.45) {
        e.fired = 1;
        const spot = arenaSpot(game, e, alive);
        if (spot) { e.x = spot[0]; e.y = spot[1]; }
        game.burst(e.x, e.y, '#7dff8a', 20, 140, 0.5, 3, true);
      }
      if (e.actT <= 0) { e.invis = false; e.act = 'walk'; e.cd = rand(0.6, 1.2); }
      break;
    default: e.act = 'walk';
  }
}

// ------------------------------------------------------------------ golem
function golem(game, e, tgt, td, dt) {
  const toT = Math.atan2(tgt.y - e.y, tgt.x - e.x);
  switch (e.act) {
    case 'walk':
      e.face = toT;
      if (td > 170) walkTo(game, e, tgt.x, tgt.y, dt);
      if (e.cd > 0) break;
      const roll = Math.random();
      if (td < 130 && roll < 0.5) { e.act = 'slam'; e.actT = 0.9; e.fired = 0; }
      else if (roll < 0.8) { e.act = 'windup'; e.actT = 0.7; game.sfx('roar'); }
      else {
        e.act = 'boulder'; e.actT = 0.8;
        const targets = game.players.filter(p => p.alive);
        for (let i = 0; i < (e.phase === 2 ? 5 : 3); i++) {
          const p = targets[i % targets.length];
          game.lobs.push({ x0: e.x, y0: e.y - e.r, x1: p.x + (p.vx || 0) * 0.6 + rand(-40, 40), y1: p.y + (p.vy || 0) * 0.6 + rand(-40, 40), t: -i * 0.15, dur: 1, dmg: 22 * e.power });
        }
        game.sfx('lob');
      }
      break;
    case 'windup':
      e.face = toT;
      e.cdir = toT;
      if (e.actT <= 0) { e.act = 'charge'; e.actT = 1.3; e.hitP = new Set(); }
      break;
    case 'charge': {
      const sp = 430 * (e.phase === 2 ? 1.15 : 1), ox = e.x, oy = e.y;
      const dx = Math.cos(e.cdir) * sp * dt, dy = Math.sin(e.cdir) * sp * dt;
      game.moveEntity(e, dx, dy);
      if (Math.random() < 0.5) game.burst(e.x, e.y + e.r * 0.6, '#8a8078', 2, 60, 0.4, 3);
      for (const p of game.players) {
        if (!p.alive || e.hitP.has(p)) continue;
        if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.r + 4) {
          e.hitP.add(p);
          game.hurtPlayer(p, 32 * e.power);
          game.knockPlayer(p, e.x, e.y, 420);
        }
      }
      const moved = Math.hypot(e.x - ox, e.y - oy);
      if (moved < Math.hypot(dx, dy) * 0.5) {
        e.act = 'stun'; e.actT = e.phase === 2 ? 1.6 : 2.2;
        game.sfx('slam');
        game.shake = Math.max(game.shake, 12);
        game.burst(e.x, e.y, '#b0a090', 30, 220, 0.8, 4);
      } else if (e.actT <= 0) { e.act = 'walk'; e.cd = rand(1, 2); }
      break;
    }
    case 'stun':
      if (e.actT <= 0) { e.act = 'walk'; e.cd = rand(0.8, 1.4); }
      break;
    case 'slam': {
      const waves = e.phase === 2 ? 2 : 1;
      const due = e.fired === 0 ? e.actT < 0.4 : e.actT < 0.1;
      if (e.fired < waves && due) {
        e.fired++;
        game.waves.push({ x: e.x, y: e.y, r: e.r, speed: 260, max: 330, dmg: 22 * e.power, hit: new Set() });
        game.addEffect({ kind: 'wave', x: e.x, y: e.y, r0: e.r, r1: 330, life: (330 - e.r) / 260, max: (330 - e.r) / 260, color: '#ffb060', w: 10 });
        game.sfx('slam');
        game.shake = Math.max(game.shake, 10);
      }
      if (e.actT <= 0) { e.act = 'walk'; e.cd = rand(1.2, 2); }
      break;
    }
    case 'boulder':
      if (e.actT <= 0) { e.act = 'walk'; e.cd = rand(1.5, 2.5); }
      break;
    default: e.act = 'walk';
  }
}

// Shockwaves hurt players they pass over; dodging (i-frames) avoids them.
export function updateWaves(game, dt) {
  for (const w of game.waves) {
    w.r += w.speed * dt;
    for (const p of game.players) {
      if (!p.alive || w.hit.has(p)) continue;
      if (Math.abs(Math.hypot(p.x - w.x, p.y - w.y) - w.r) < 16) {
        w.hit.add(p);
        game.hurtPlayer(p, w.dmg);
        game.knockPlayer(p, w.x, w.y, 300);
      }
    }
  }
  game.waves = game.waves.filter(w => w.r < w.max);
}

export function bossDefeated(game, e, src) {
  game.boss = null;
  game.waves = [];
  for (let i = 0; i < 6; i++) game.burst(e.x + rand(-30, 30), e.y + rand(-30, 30), pick(['#ff9a3a', '#ffd35a', '#ffffff']), 30, 320, 1.2, 4, true);
  game.shake = 18;
  game.flash = 0.8;
  game.sfx('gen');
  game.sfx('bomb');
  const pts = 5000 * (1 + Math.floor(game.levelNum / 15));
  for (const p of game.players) if (p.alive) p.score += pts;
  if (src && src.mods) src.score += 1000;
  game.text(e.x, e.y - e.r - 20, '+' + pts, '#ffd35a', 2.5);
  for (const o of game.enemies) if (!o.dead && o !== e) game.killEnemy(o, null, true);
  for (const gen of game.generators) { gen.dead = true; game.burst(gen.x, gen.y, '#b0a090', 20, 160, 0.7, 3); }
  for (const pr of game.projectiles) if (pr.team === 1) pr.dead = true;
  game.lobs = [];
  // loot shower
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, x = e.x + Math.cos(a) * 60, y = e.y + Math.sin(a) * 60;
    if (game.solidAt(x, y)) continue;
    game.items.push({ kind: i % 3 === 0 ? 'chest' : i % 5 === 1 ? 'meat' : 'treasure', x, y, r: 11, bob: Math.random() * 6 });
  }
  const tx = Math.floor(game.exitPos.x / TILE), ty = Math.floor(game.exitPos.y / TILE);
  game.openExit(tx, ty);
  game.setBanner('boss_down', 'exit_open');
  game.say('boss_down');
  game.music(game.levelNum % 2 ? 'dungeonA' : 'dungeonB');
}

export function openExitTile(game, tx, ty) {
  game.tiles[ty * game.W + tx] = T.EXIT;
  R.drawTile(game.tileCanvas.getContext('2d'), game.level, game.theme, tx, ty);
  game.exitOpen = true;
}

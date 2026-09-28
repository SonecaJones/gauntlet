import { TILE, T, isSolid } from './constants.js';
import { HEROES, HERO_ORDER } from './heroes.js';
import { ENEMIES, ENEMY_COLORS } from './enemies.js';
import { generateLevel } from './level.js';
import * as R from './render.js';
import { clamp, lerp, rand, pick, norm } from './util.js';
import { t, heroName } from './i18n.js';

const EMPTY = { move: { x: 0, y: 0 }, aim: null, aimPoint: null, fire: false };
const START_HP = 800;
const DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const FLOW_MAX = 70;
const HASH = 64;

export class Game {
  // opts.record: keep an event log for network clients (host).
  // opts.onLevel: called after each level is generated.
  // opts.client: build an empty shell whose state comes from the network.
  constructor(app, specs, opts = {}) {
    this.app = app;
    this.ev = opts.record ? [] : null;
    this.onLevel = opts.onLevel || null;
    this.nextId = 1;
    this.audio = app.audio;
    this.players = [];
    for (const s of specs) this.addPlayer(s.ctrlId, s.hero);
    this.levelNum = 0;
    this.time = 0;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.shake = 0;
    this.flash = 0;
    this.totalKills = 0;
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d');
    this.enemies = []; this.generators = []; this.projectiles = []; this.items = [];
    this.particles = []; this.texts = []; this.lobs = []; this.effects = [];
    if (!opts.client) this.nextLevel();
  }

  addPlayer(ctrlId, heroKey) {
    const p = {
      slot: this.players.length, ctrlId, heroKey, hero: HEROES[heroKey],
      x: 0, y: 0, r: 11, vx: 0, vy: 0, hp: START_HP, score: 0, keys: 0, potions: 0,
      facing: 0, fireT: 0, dashT: 0, dashCd: 0, dashX: 0, dashY: 0, specialCd: 0,
      spinT: 0, spinTick: 0, chargeT: 0, chargeX: 0, chargeY: 0, chargeHit: null,
      iframes: 0, hurt: 0, meleeT: 0, drain: 0, alive: true, revive: 0, buffs: {},
      mods: { dmg: 1, rate: 1, speed: 1, armor: 0, pierce: 0, multi: 0, food: 1, magic: 1, cd: 1, melee: 1, gold: 1, leech: 0 },
      perks: [], warn: 0, moving: false, walk: 0, kills: 0,
    };
    this.players.push(p);
    return p;
  }

  nextLevel() {
    this.levelNum++;
    this.loadLevel(this.levelNum);
  }

  // Everything needed to draw a level; shared with the network client.
  setupLevel(L, n) {
    this.levelNum = n;
    this.level = L;
    this.W = L.W; this.H = L.H; this.tiles = L.tiles;
    this.theme = R.THEMES[Math.floor((n - 1) / 2) % R.THEMES.length];
    this.tileCanvas = R.buildTileCanvas(L, this.theme);
    this.enemies = []; this.generators = []; this.projectiles = []; this.items = [];
    this.particles = []; this.texts = []; this.lobs = []; this.effects = [];
    this.explored = new Uint8Array(L.W * L.H);
    this.exploreT = 0;
    this.mini = document.createElement('canvas');
    this.mini.width = L.W; this.mini.height = L.H;
    this.miniCtx = this.mini.getContext('2d');
    this.miniImg = this.miniCtx.createImageData(L.W, L.H);
    this.torches = L.torches.map(tc => ({ x: (tc.x + 0.5) * TILE, y: tc.y * TILE + 22, ph: Math.random() * 10 }));
    this.exitPos = { x: (L.exit.x + 0.5) * TILE, y: (L.exit.y + 0.5) * TILE };
    this.exiting = 0;
    this.darkness = Math.min(0.93, 0.82 + n * 0.01);
    this.banner = { text: t('level', { n }), sub: t('find_exit'), t: 3.2 };
    this.hint = n === 1 ? { text: t('hint1'), t: 9 } : n === 2 ? { text: t('hint2'), t: 7 } : null;
  }

  loadLevel(n, seed = (Math.random() * 1e9) | 0) {
    const L = generateLevel(n, seed, this.players.length);
    this.seed = seed;
    this.genPlayers = this.players.length;
    this.setupLevel(L, n);
    this.flow = new Int16Array(L.W * L.H);
    this.flowQ = new Int32Array(L.W * L.H);
    this.flowT = 0;
    this.levelKills = 0;

    const sx = (L.start.x + 0.5) * TILE, sy = (L.start.y + 0.5) * TILE;
    const offs = [[-14, -14], [14, -14], [-14, 14], [14, 14]];
    this.players.forEach((p, i) => {
      p.x = sx + offs[i][0]; p.y = sy + offs[i][1];
      if (!p.alive) { p.alive = true; p.hp = 300; }
      p.revive = 0; p.dashT = p.chargeT = p.spinT = 0; p.buffs = {}; p.iframes = 2; p.warn = 0;
    });
    for (const g of L.generators) this.addGenerator(g);
    for (const e of L.enemies) this.spawnEnemy(e.type, e.tier, (e.x + 0.5) * TILE, (e.y + 0.5) * TILE);
    for (const it of L.items) this.items.push({ kind: it.kind, sub: it.sub, x: (it.x + 0.5) * TILE, y: (it.y + 0.5) * TILE, r: 11, bob: Math.random() * 6 });
    this.levelTime = 0;
    this.overT = 0;
    this.complete = false;
    this.gameOver = false;
    this.computeFlow();
    this.updateCamera(0, true);
    if (n === 1) this.say(t('welcome', { hero: this.players.map(p => heroName(p.heroKey)).join(', ') }), true);
    else this.say(pick(t('level_voice')), true);
    this.onLevel?.(this);
  }

  // ------------------------------------------------------------ helpers
  say(text, force) { this.audio.say(text, force); this.ev?.push(['v', text]); }
  sfx(n) { this.audio.play(n); this.ev?.push(['s', n]); }
  addEffect(ef) {
    this.effects.push(ef);
    if (!this.ev) return;
    if (ef.kind === 'spin') this.ev.push(['e', 'spin', ef.p.slot, ef.life, ef.color]);
    else this.ev.push(['e', 'ring', Math.round(ef.x), Math.round(ef.y), ef.r0, ef.r1, ef.life, ef.color, ef.w]);
  }
  tileAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return T.WALL;
    return this.tiles[ty * this.W + tx];
  }
  solidTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return true;
    return isSolid(this.tiles[ty * this.W + tx]);
  }
  solidAt(x, y) { return this.solidTile(Math.floor(x / TILE), Math.floor(y / TILE)); }
  boxHits(x, y, h) {
    const x0 = Math.floor((x - h) / TILE), x1 = Math.floor((x + h) / TILE);
    const y0 = Math.floor((y - h) / TILE), y1 = Math.floor((y + h) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solidTile(tx, ty)) return true;
    return false;
  }
  moveEntity(e, dx, dy) {
    const h = e.r * 0.8;
    if (dx) {
      let nx = e.x + dx;
      if (this.boxHits(nx, e.y, h)) {
        nx = dx > 0 ? Math.floor((nx + h) / TILE) * TILE - h - 0.01 : Math.floor((nx - h) / TILE + 1) * TILE + h + 0.01;
        if (this.boxHits(nx, e.y, h) || Math.abs(nx - e.x) > Math.abs(dx) + 0.5) nx = e.x;
      }
      e.x = nx;
    }
    if (dy) {
      let ny = e.y + dy;
      if (this.boxHits(e.x, ny, h)) {
        ny = dy > 0 ? Math.floor((ny + h) / TILE) * TILE - h - 0.01 : Math.floor((ny - h) / TILE + 1) * TILE + h + 0.01;
        if (this.boxHits(e.x, ny, h) || Math.abs(ny - e.y) > Math.abs(dy) + 0.5) ny = e.y;
      }
      e.y = ny;
    }
  }
  los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 12);
    for (let i = 1; i < n; i++) if (this.solidAt(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
    return true;
  }
  screenToWorld(sx, sy) {
    const z = this.cam.zoom;
    return { x: (sx - this.app.vw / 2) / z + this.cam.x, y: (sy - this.app.vh / 2) / z + this.cam.y };
  }
  baseZoom() {
    const { vw, vh } = this.app;
    return clamp(Math.sqrt((vw * vh) / (22 * 13 * TILE * TILE)), 0.6, 3);
  }
  leash() {
    const z = this.baseZoom() * 0.6;
    return { x: this.app.vw / z - 4 * TILE, y: this.app.vh / z - 3 * TILE };
  }

  buildHash() {
    const m = (this.hash ||= new Map());
    m.clear();
    this.hcols = Math.ceil((this.W * TILE) / HASH) + 1;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const k = ((e.y / HASH) | 0) * this.hcols + ((e.x / HASH) | 0);
      const a = m.get(k);
      if (a) a.push(e); else m.set(k, [e]);
    }
  }
  queryEnemies(x, y, r, cb) {
    const x0 = ((x - r) / HASH) | 0, x1 = ((x + r) / HASH) | 0, y0 = ((y - r) / HASH) | 0, y1 = ((y + r) / HASH) | 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const a = this.hash.get(cy * this.hcols + cx);
      if (a) for (const e of a) if (!e.dead) cb(e);
    }
  }

  burst(x, y, color, n, speed = 120, life = 0.5, size = 3, glow = false) {
    this.ev?.push(['b', Math.round(x), Math.round(y), color, n, speed, life, size, glow ? 1 : 0]);
    if (this.particles.length > 1400) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.4), max: life, color, size: size * (0.6 + Math.random() * 0.6), glow });
    }
  }
  text(x, y, str, color = '#fff', life = 0.9, small = false) {
    this.ev?.push(['t', Math.round(x), Math.round(y), String(str), color, life, small ? 1 : 0]);
    if (this.texts.length > 90) this.texts.shift();
    this.texts.push({ x, y, str: String(str), color, life, max: life, small });
  }
  rumble(p, s, w, ms) {
    this.app.input.rumble(p.ctrlId, s, w, ms);
    this.ev?.push(['r', p.ctrlId, s, w, ms]);
  }

  // ------------------------------------------------------------ spawning
  addGenerator(g) {
    const hpPerTier = 40 * (1 + 0.06 * (this.levelNum - 1));
    this.generators.push({
      type: g.type, tier: g.tier, maxTier: g.tier, x: (g.x + 0.5) * TILE, y: (g.y + 0.5) * TILE,
      r: 15, hp: hpPerTier * g.tier, hpPerTier, spawnT: rand(0.5, 3), flash: 0, children: 0, dead: false,
    });
  }

  spawnEnemy(type, tier, x, y) {
    const d = ENEMIES[type];
    const lv = 1 + 0.07 * (this.levelNum - 1);
    const hp = type === 'death' ? 1e9 : d.hp * tier * lv;
    const e = {
      type, tier, def: d, x, y, r: d.r * (0.9 + 0.08 * tier), hp, maxHp: hp,
      speed: d.speed * (1 + 0.05 * (tier - 1)) * (0.92 + Math.random() * 0.16),
      atkCd: rand(0, 0.5), shootCd: rand(1, 3), flash: 0, stun: 0, kx: 0, ky: 0, face: 0, atk: 0,
      dead: false, awake: false, wanderT: 0, wx: 0, wy: 0, invis: false, blinkT: rand(1, 3), drained: 0,
      anim: Math.random() * 10, parent: null,
    };
    this.enemies.push(e);
    return e;
  }

  removePlayer(ctrlId) {
    const i = this.players.findIndex(p => p.ctrlId === ctrlId);
    if (i < 0) return;
    const [p] = this.players.splice(i, 1);
    this.players.forEach((q, j) => { q.slot = j; });
    this.burst(p.x, p.y, p.hero.light, 20, 120, 0.6, 3, true);
  }

  dropIn(ctrlId) {
    const hero = HERO_ORDER.find(h => !this.players.some(p => p.heroKey === h));
    const anchor = this.players.find(p => p.alive) || this.players[0];
    if (!hero || !anchor) return;
    const p = this.addPlayer(ctrlId, hero);
    p.x = anchor.x; p.y = anchor.y; p.hp = 600; p.iframes = 2;
    this.burst(p.x, p.y, p.hero.light, 30, 160, 0.7, 3, true);
    this.text(p.x, p.y - 30, t('joins', { hero: heroName(hero) }), p.hero.light, 2);
    this.say(t('joins', { hero: heroName(hero) }), true);
    this.sfx('revive');
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    this.dt = dt;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.hint) { this.hint.t -= dt; if (this.hint.t <= 0) this.hint = null; }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 28);

    if (this.exiting > 0) {
      this.exiting -= dt;
      this.updateParticles(dt);
      this.updateCamera(dt);
      if (this.exiting <= 0) this.complete = true;
      return;
    }
    this.levelTime += dt;
    const ctrls = this.app.input.controllers;

    if (this.players.length < 4) {
      for (const id in ctrls) if (ctrls[id].start && !this.players.some(p => p.ctrlId === id)) this.dropIn(id);
    }

    this.buildHash();
    for (const p of this.players) this.updatePlayer(p, ctrls[p.ctrlId], dt);
    this.updateRevives(dt);

    this.flowT -= dt;
    if (this.flowT <= 0) { this.computeFlow(); this.flowT = 0.25; }

    this.updateGenerators(dt);
    this.buildHash();
    this.updateEnemies(dt);
    this.buildHash();
    this.updateProjectiles(dt);
    this.updateLobs(dt);
    this.updateParticles(dt);

    for (const it of this.items) it.age = (it.age || 0) + dt;
    this.enemies = this.enemies.filter(e => !e.dead);
    this.generators = this.generators.filter(g => !g.dead);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.items = this.items.filter(i => !i.dead);

    this.exploreT -= dt;
    if (this.exploreT <= 0) { this.exploreT = 0.2; this.explore(); }
    this.updateCamera(dt);

    if (!this.players.some(p => p.alive)) {
      this.overT += dt;
      if (this.overT > 2.5) this.gameOver = true;
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const d = Math.pow(0.02, dt);
      p.vx *= d; p.vy *= d;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const tx of this.texts) { tx.life -= dt; tx.y -= 28 * dt; }
    this.texts = this.texts.filter(tx => tx.life > 0);
    for (const ef of this.effects) ef.life -= dt;
    this.effects = this.effects.filter(ef => ef.life > 0);
  }

  // ------------------------------------------------------------ players
  updatePlayer(p, c, dt) {
    if (!p.alive) return;
    c = c || EMPTY;
    p.fireT -= dt; p.dashCd -= dt; p.specialCd -= dt; p.iframes -= dt; p.hurt -= dt; p.meleeT -= dt;
    for (const k in p.buffs) { p.buffs[k] -= dt; if (p.buffs[k] <= 0) delete p.buffs[k]; }
    p.drain += dt;
    while (p.drain >= 1) { p.drain -= 1; p.hp -= 1; }

    let ax = 0, ay = 0, firing = false;
    if (c.aimPoint) {
      const w = this.screenToWorld(c.aimPoint.x, c.aimPoint.y);
      [ax, ay] = norm(w.x - p.x, w.y - p.y);
      firing = c.fire;
    } else if (c.aim) {
      [ax, ay] = norm(c.aim.x, c.aim.y);
      firing = c.fire;
    }
    const [mx, my, ml] = norm(c.move.x, c.move.y);
    const mag = Math.min(1, ml);
    p.moving = mag > 0.1;
    if (ax || ay) p.facing = Math.atan2(ay, ax);
    else if (p.moving) p.facing = Math.atan2(my, mx);
    if (c.fireFacing) firing = true;

    if (c.dash && p.dashCd <= 0 && p.chargeT <= 0) {
      p.dashX = p.moving ? mx : Math.cos(p.facing);
      p.dashY = p.moving ? my : Math.sin(p.facing);
      p.dashT = 0.17;
      p.dashCd = 1.1 * p.mods.cd;
      p.iframes = Math.max(p.iframes, 0.25);
      this.sfx('dash');
    }
    let vx, vy;
    if (p.chargeT > 0) {
      p.chargeT -= dt;
      vx = p.chargeX * 560; vy = p.chargeY * 560;
      this.chargeHits(p);
      this.burst(p.x, p.y, p.hero.light, 2, 40, 0.3, 3, true);
    } else if (p.dashT > 0) {
      p.dashT -= dt;
      vx = p.dashX * 520; vy = p.dashY * 520;
      this.particles.push({ x: p.x + rand(-4, 4), y: p.y + rand(-6, 6), vx: 0, vy: 0, life: 0.25, max: 0.25, color: p.hero.light, size: 5, glow: true });
    } else {
      const sp = p.hero.speed * p.mods.speed * (p.buffs.speed ? 1.35 : 1) * (firing ? 0.82 : 1) * mag;
      vx = mx * sp; vy = my * sp;
    }
    const ox = p.x, oy = p.y;
    if (vx || vy) this.movePlayer(p, vx * dt, vy * dt);
    p.vx = (p.x - ox) / dt; p.vy = (p.y - oy) / dt;
    if (p.moving) p.walk += dt;

    // push out of generators
    for (const g of this.generators) this.separate(p, g);

    if (firing && p.fireT <= 0) {
      this.fire(p);
      p.fireT = p.hero.fireDelay / (p.mods.rate * (p.buffs.rapid ? 1.8 : 1));
    }
    if (c.special && p.specialCd <= 0) this.special(p);
    if (c.potion) {
      if (p.potions > 0) { p.potions--; this.bomb(p.x, p.y, p.hero.magic * p.mods.magic, p, false); }
      else this.sfx('tink');
    }
    if (p.spinT > 0) {
      p.spinT -= dt; p.spinTick -= dt;
      if (p.spinTick <= 0) { p.spinTick = 0.1; this.spinHit(p); }
    }

    for (const it of this.items) {
      if (it.dead) continue;
      const dx = it.x - p.x, dy = it.y - p.y;
      if (dx * dx + dy * dy < (p.r + it.r) ** 2) this.pickup(p, it);
    }

    if (p.keys > 0) {
      const h = p.r + 3;
      const x0 = Math.floor((p.x - h) / TILE), x1 = Math.floor((p.x + h) / TILE);
      const y0 = Math.floor((p.y - h) / TILE), y1 = Math.floor((p.y + h) / TILE);
      outer: for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (tx >= 0 && ty >= 0 && tx < this.W && ty < this.H && this.tiles[ty * this.W + tx] === T.DOOR) {
          p.keys--;
          this.openDoor(tx, ty);
          break outer;
        }
      }
    }

    if (this.tileAt(p.x, p.y) === T.EXIT) { this.beginExit(p); return; }

    if (p.meleeT <= 0) {
      let hit = false;
      this.queryEnemies(p.x, p.y, 40, e => {
        if (hit) return;
        const rr = p.r + e.r + 5;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
          hit = this.damageEnemy(e, p.hero.melee * p.mods.melee, p, e.x - p.x, e.y - p.y, 'melee');
        }
      });
      for (const g of this.generators) {
        if (hit) break;
        const rr = p.r + g.r + 5;
        if ((g.x - p.x) ** 2 + (g.y - p.y) ** 2 < rr * rr) { this.damageGenerator(g, p.hero.melee * p.mods.melee, p); hit = true; }
      }
      if (hit) p.meleeT = 0.4;
    }

    const name = heroName(p.heroKey);
    if (p.hp < 200 && p.warn < 1) { p.warn = 1; this.say(t('needs_food', { hero: name }), true); }
    else if (p.hp < 100 && p.warn < 2) { p.warn = 2; this.say(t('about_to_die', { hero: name }), true); }
    else if (p.hp > 300) p.warn = 0;
    if (p.hp <= 0) this.killPlayer(p);
  }

  movePlayer(p, dx, dy) {
    const others = this.players.filter(o => o !== p && o.alive);
    if (others.length) {
      const lim = this.leash();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const o of others) { minX = Math.min(minX, o.x); maxX = Math.max(maxX, o.x); minY = Math.min(minY, o.y); maxY = Math.max(maxY, o.y); }
      if (dx > 0 && p.x + dx - minX > lim.x) dx = Math.max(0, minX + lim.x - p.x);
      if (dx < 0 && maxX - (p.x + dx) > lim.x) dx = Math.min(0, maxX - lim.x - p.x);
      if (dy > 0 && p.y + dy - minY > lim.y) dy = Math.max(0, minY + lim.y - p.y);
      if (dy < 0 && maxY - (p.y + dy) > lim.y) dy = Math.min(0, maxY - lim.y - p.y);
    }
    this.moveEntity(p, dx, dy);
  }

  separate(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    const d = Math.sqrt(d2) || 0.01, push = rr - d;
    this.moveEntity(a, (dx / d) * push, (dy / d) * push);
  }

  updateRevives(dt) {
    for (const p of this.players) {
      if (p.alive) continue;
      const near = this.players.some(o => o.alive && (o.x - p.x) ** 2 + (o.y - p.y) ** 2 < 36 * 36);
      if (near) {
        p.revive += dt;
        if (p.revive >= 2.2) {
          p.alive = true; p.hp = 250; p.iframes = 2; p.revive = 0; p.warn = 0;
          this.burst(p.x, p.y, '#7dffa0', 40, 180, 0.8, 3, true);
          this.say(t('revived', { hero: heroName(p.heroKey) }), true);
          this.sfx('revive');
        }
      } else p.revive = Math.max(0, p.revive - dt * 0.5);
    }
  }

  killPlayer(p) {
    p.alive = false; p.hp = 0; p.buffs = {}; p.spinT = p.chargeT = p.dashT = 0;
    this.burst(p.x, p.y, p.hero.color, 50, 220, 1, 4);
    this.shake = 10;
    this.sfx('death');
    this.rumble(p, 1, 1, 400);
    this.say(t('fallen', { hero: heroName(p.heroKey) }), true);
  }

  hurtPlayer(p, dmg, ignoreArmor = false) {
    if (!p.alive || p.iframes > 0 || p.buffs.invuln) return;
    const armor = clamp(p.hero.armor + p.mods.armor, 0, 0.8);
    const d = dmg * (1 + 0.03 * (this.levelNum - 1)) * (ignoreArmor ? 1 : 1 - armor);
    p.hp -= d;
    p.hurt = 0.15;
    this.shake = Math.max(this.shake, 3);
    this.sfx('hurt');
    this.rumble(p, 0.4, 0.6, 90);
    this.text(p.x + rand(-6, 6), p.y - 22, '-' + Math.round(d), '#ff6a6a', 0.7, true);
  }

  fire(p) {
    const n = 1 + p.mods.multi + (p.buffs.multi ? 2 : 0);
    const spd = p.hero.shotSpeed;
    for (let i = 0; i < n; i++) {
      const a = p.facing + (i - (n - 1) / 2) * 0.13;
      const cx = Math.cos(a), cy = Math.sin(a);
      this.projectiles.push({
        team: 0, owner: p, kind: p.hero.shot, x: p.x + cx * 8, y: p.y + cy * 8 - 3, vx: cx * spd, vy: cy * spd,
        r: 7, dmg: p.hero.shotDmg * p.mods.dmg, pierce: p.mods.pierce, life: 1.1, ang: a, spin: 0, hits: null, dead: false,
      });
    }
    this.sfx('shoot_' + p.hero.shot);
  }

  special(p) {
    const H = p.hero, m = p.mods.magic;
    p.specialCd = H.specialCd * p.mods.cd;
    this.rumble(p, 0.6, 0.4, 150);
    switch (H.special) {
      case 'whirlwind':
        p.spinT = 0.75; p.spinTick = 0; p.iframes = Math.max(p.iframes, 0.3);
        this.addEffect({ kind: 'spin', p, life: 0.75, max: 0.75, color: H.light });
        this.sfx('whirl');
        break;
      case 'charge':
        p.chargeX = Math.cos(p.facing); p.chargeY = Math.sin(p.facing);
        p.chargeT = 0.38; p.chargeHit = new Set(); p.iframes = Math.max(p.iframes, 0.5);
        this.sfx('charge');
        break;
      case 'nova': {
        const RR = 175;
        this.addEffect({ kind: 'ring', x: p.x, y: p.y, r0: 10, r1: RR, life: 0.45, max: 0.45, color: '#c77dff', w: 10 });
        this.queryEnemies(p.x, p.y, RR, e => {
          if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < RR * RR) { this.damageEnemy(e, 85 * m, p, e.x - p.x, e.y - p.y, 'special'); e.stun = 1.2; }
        });
        for (const g of this.generators) if ((g.x - p.x) ** 2 + (g.y - p.y) ** 2 < RR * RR) this.damageGenerator(g, 50 * m, p);
        for (const pr of this.projectiles) if (pr.team === 1 && (pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 < RR * RR) pr.dead = true;
        this.burst(p.x, p.y, '#d7a0ff', 40, 300, 0.6, 3, true);
        this.shake = Math.max(this.shake, 6);
        this.sfx('nova');
        break;
      }
      case 'storm': {
        const n = 20;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + p.facing;
          this.projectiles.push({
            team: 0, owner: p, kind: 'storm', x: p.x, y: p.y - 3, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, r: 7,
            dmg: H.shotDmg * 1.4 * p.mods.dmg * m, pierce: 1 + p.mods.pierce, life: 0.8, ang: a, spin: 0, hits: null, dead: false,
          });
        }
        this.sfx('storm');
        break;
      }
    }
  }

  spinHit(p) {
    const RR = 64, m = p.mods.magic;
    this.queryEnemies(p.x, p.y, RR, e => {
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (RR + e.r) ** 2) { this.damageEnemy(e, 30 * m * p.mods.melee, p, e.x - p.x, e.y - p.y, 'special'); e.stun = Math.max(e.stun, 0.3); }
    });
    for (const g of this.generators) if ((g.x - p.x) ** 2 + (g.y - p.y) ** 2 < (RR + g.r) ** 2) this.damageGenerator(g, 20 * m, p);
    for (const pr of this.projectiles) if (pr.team === 1 && (pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 < RR * RR) { pr.dead = true; this.burst(pr.x, pr.y, '#fff', 4, 80, 0.2); }
  }

  chargeHits(p) {
    const m = p.mods.magic;
    this.queryEnemies(p.x, p.y, 40, e => {
      if (p.chargeHit.has(e)) return;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (p.r + e.r + 8) ** 2) {
        p.chargeHit.add(e);
        this.damageEnemy(e, 60 * m, p, e.x - p.x + p.chargeX * 20, e.y - p.y + p.chargeY * 20, 'special');
        e.stun = Math.max(e.stun, 0.6);
        this.shake = Math.max(this.shake, 3);
      }
    });
    for (const g of this.generators) {
      if (p.chargeHit.has(g)) continue;
      if ((g.x - p.x) ** 2 + (g.y - p.y) ** 2 < (p.r + g.r + 8) ** 2) { p.chargeHit.add(g); this.damageGenerator(g, 40 * m, p); }
    }
  }

  bomb(x, y, power, src, small) {
    const RR = small ? 200 : 460;
    this.addEffect({ kind: 'ring', x, y, r0: 20, r1: RR, life: 0.6, max: 0.6, color: '#9fe8ff', w: 18 });
    this.flash = small ? 0.45 : 0.9;
    this.shake = Math.max(this.shake, small ? 6 : 14);
    this.sfx('bomb');
    for (const p of this.players) if (p.alive) this.rumble(p, 1, 0.8, small ? 200 : 450);
    this.queryEnemies(x, y, RR, e => {
      if ((e.x - x) ** 2 + (e.y - y) ** 2 < RR * RR) this.damageEnemy(e, 140 * power, src, e.x - x, e.y - y, 'bomb');
    });
    for (const g of this.generators) if ((g.x - x) ** 2 + (g.y - y) ** 2 < RR * RR) this.damageGenerator(g, (small ? 30 : 70) * power, src);
    this.burst(x, y, '#bff0ff', 60, 420, 0.8, 3, true);
  }

  pickup(p, it) {
    const say = (s, c) => this.text(it.x, it.y - 16, s, c, 1.1);
    switch (it.kind) {
      case 'meat':
      case 'cider': {
        const v = Math.round((it.kind === 'meat' ? 150 : 100) * p.mods.food);
        p.hp += v; say('+' + v, '#7dffa0'); this.sfx('food');
        break;
      }
      case 'potion':
        if (p.potions >= 9) return;
        p.potions++; p.score += 50; say(t('potion'), '#7ad0ff'); this.sfx('pickup');
        break;
      case 'key':
        if (p.keys >= 9) return;
        p.keys++; p.score += 50; say(t('key'), '#ffd35a'); this.sfx('key');
        break;
      case 'treasure':
      case 'chest': {
        const v = Math.round((it.kind === 'chest' ? 500 : 100) * p.mods.gold);
        p.score += v; say('+' + v, '#ffd35a'); this.sfx('coin');
        break;
      }
      case 'amulet':
        p.buffs[it.sub] = 15; p.score += 200; say(t('amulet_' + it.sub), R.AMULET_COL[it.sub]); this.sfx('powerup');
        break;
    }
    it.dead = true;
    this.burst(it.x, it.y, '#fff3b0', 10, 90, 0.4, 2, true);
  }

  openDoor(tx, ty) {
    this.ev?.push(['d', tx, ty]);
    for (const [x, y] of this.openDoorTiles(tx, ty)) this.burst((x + 0.5) * TILE, (y + 0.5) * TILE, '#8a5a2a', 8, 140, 0.6, 3);
    this.text((tx + 0.5) * TILE, ty * TILE, t('door'), '#ffd35a', 1.2);
    this.sfx('door');
    this.flowT = 0;
  }

  // Flood-fills the door group at (tx, ty) to floor and redraws it.
  openDoorTiles(tx, ty) {
    if (this.tiles[ty * this.W + tx] !== T.DOOR) return [];
    const st = [[tx, ty]];
    const opened = [];
    this.tiles[ty * this.W + tx] = T.FLOOR;
    while (st.length) {
      const [x, y] = st.pop();
      opened.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) continue;
        if (this.tiles[ny * this.W + nx] === T.DOOR) { this.tiles[ny * this.W + nx] = T.FLOOR; st.push([nx, ny]); }
      }
    }
    const g = this.tileCanvas.getContext('2d');
    for (const [x, y] of opened) R.drawTile(g, this.level, this.theme, x, y);
    return opened;
  }

  beginExit(p) {
    if (this.exiting > 0) return;
    this.exiting = 1.4;
    this.sfx('exit');
    const bonus = 100 * this.levelNum;
    for (const q of this.players) if (q.alive) q.score += bonus;
    this.burst(this.exitPos.x, this.exitPos.y, '#ffe07a', 60, 260, 1, 3, true);
    this.text(this.exitPos.x, this.exitPos.y - 30, '+' + bonus, '#ffd35a', 1.4);
  }

  // ------------------------------------------------------------ damage
  damageEnemy(e, dmg, src, kx, ky, kind) {
    if (e.dead) return false;
    if (e.type === 'sorcerer' && e.invis) return false;
    if (e.type === 'death') {
      if (kind !== 'bomb') {
        if (Math.random() < 0.25) this.text(e.x, e.y - 18, t('immune'), '#b0a8c0', 0.6, true);
        this.sfx('tink');
        return true;
      }
      dmg = e.hp;
    }
    e.hp -= dmg;
    e.flash = 0.1;
    const [nx, ny] = norm(kx, ky);
    const kb = kind === 'melee' ? 200 : kind === 'special' || kind === 'bomb' ? 280 : 110;
    e.kx += nx * kb; e.ky += ny * kb;
    if (kind !== 'bomb') this.text(e.x + rand(-6, 6), e.y - e.r - 6, Math.round(dmg), kind === 'special' ? '#ffd35a' : '#ffffff', 0.55, true);
    this.sfx('hit');
    if (e.hp <= 0) this.killEnemy(e, src);
    return true;
  }

  killEnemy(e, src, silent = false) {
    e.dead = true;
    if (e.parent) e.parent.children--;
    const col = ENEMY_COLORS[e.type];
    this.burst(e.x, e.y, col, silent ? 10 : 16, 160, 0.5, 3);
    if (silent) return;
    this.sfx('kill');
    this.totalKills++;
    this.levelKills++;
    if (src && src.mods) {
      const pts = e.def.points * e.tier;
      src.score += pts;
      src.kills++;
      if (src.mods.leech) src.hp += src.mods.leech;
      if (e.type === 'death') this.text(e.x, e.y - 20, '+' + pts, '#d7a0ff', 1.5);
    }
  }

  damageGenerator(g, dmg, src) {
    if (g.dead) return;
    g.hp -= dmg;
    g.flash = 0.1;
    this.sfx('hit');
    const nt = Math.ceil(g.hp / g.hpPerTier);
    if (g.hp > 0 && nt < g.tier) { g.tier = nt; this.burst(g.x, g.y, '#8a8078', 12, 120, 0.5, 3); }
    if (g.hp <= 0) {
      g.dead = true;
      const pts = 100 * g.maxTier;
      if (src && src.mods) { src.score += pts; }
      this.text(g.x, g.y - 20, '+' + pts, '#ffd35a', 1.2);
      this.burst(g.x, g.y, '#b0a090', 36, 220, 0.8, 4);
      this.burst(g.x, g.y, ENEMY_COLORS[g.type], 20, 160, 0.6, 3, true);
      this.shake = Math.max(this.shake, 5);
      this.sfx('gen');
    }
  }

  // ------------------------------------------------------------ AI
  computeFlow() {
    const f = this.flow, q = this.flowQ, W = this.W;
    f.fill(32767);
    let h = 0, tl = 0;
    for (const p of this.players) {
      if (!p.alive || p.buffs.invis) continue;
      const i = Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE);
      if (f[i] !== 0) { f[i] = 0; q[tl++] = i; }
    }
    while (h < tl) {
      const i = q[h++], d = f[i] + 1;
      if (d > FLOW_MAX) continue;
      const x = i % W, y = (i / W) | 0;
      if (x > 0 && !isSolid(this.tiles[i - 1]) && f[i - 1] > d) { f[i - 1] = d; q[tl++] = i - 1; }
      if (x < W - 1 && !isSolid(this.tiles[i + 1]) && f[i + 1] > d) { f[i + 1] = d; q[tl++] = i + 1; }
      if (y > 0 && !isSolid(this.tiles[i - W]) && f[i - W] > d) { f[i - W] = d; q[tl++] = i - W; }
      if (y < this.H - 1 && !isSolid(this.tiles[i + W]) && f[i + W] > d) { f[i + W] = d; q[tl++] = i + W; }
    }
  }

  steer(e, tgt, td) {
    if (!tgt) return this.wander(e);
    if (td < TILE * 1.6) return norm(tgt.x - e.x, tgt.y - e.y);
    const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE), W = this.W;
    const cur = this.flow[ty * W + tx];
    if (cur >= 32767) return this.wander(e);
    let best = cur, bx = -1, by = -1;
    for (const [ox, oy] of DIR8) {
      const nx = tx + ox, ny = ty + oy;
      if (this.solidTile(nx, ny)) continue;
      if (ox && oy && (this.solidTile(tx + ox, ty) || this.solidTile(tx, ty + oy))) continue;
      const v = this.flow[ny * W + nx];
      if (v < best) { best = v; bx = nx; by = ny; }
    }
    if (bx < 0) return norm(tgt.x - e.x, tgt.y - e.y);
    return norm((bx + 0.5) * TILE - e.x, (by + 0.5) * TILE - e.y);
  }

  wander(e) {
    e.wanderT -= this.dt;
    if (e.wanderT <= 0) {
      e.wanderT = rand(0.8, 2);
      const a = Math.random() * Math.PI * 2;
      e.wx = Math.cos(a) * 0.5; e.wy = Math.sin(a) * 0.5;
      if (Math.random() < 0.3) { e.wx = 0; e.wy = 0; }
    }
    return [e.wx, e.wy];
  }

  updateGenerators(dt) {
    const alive = this.players.filter(p => p.alive);
    const cap = 90 + 10 * this.players.length;
    let count = this.enemies.length;
    for (const g of this.generators) {
      g.flash -= dt;
      let near = Infinity;
      for (const p of alive) near = Math.min(near, Math.hypot(p.x - g.x, p.y - g.y));
      if (near > 15 * TILE) continue;
      g.spawnT -= dt;
      if (g.spawnT > 0) continue;
      const isDeath = g.type === 'death';
      g.spawnT = isDeath ? rand(10, 16) : rand(2.4, 4.6) / (1 + 0.05 * (this.levelNum - 1)) / (1 + 0.15 * (alive.length - 1));
      const maxKids = isDeath ? 1 : 4 + g.tier * 2;
      if (count >= cap || g.children >= maxKids) continue;
      const gx = Math.floor(g.x / TILE), gy = Math.floor(g.y / TILE);
      const spots = DIR8.filter(([ox, oy]) => !this.solidTile(gx + ox, gy + oy));
      if (!spots.length) continue;
      const [ox, oy] = pick(spots);
      const e = this.spawnEnemy(g.type, g.tier, (gx + ox + 0.5) * TILE + rand(-4, 4), (gy + oy + 0.5) * TILE + rand(-4, 4));
      e.parent = g; e.awake = true;
      g.children++; count++;
      this.burst(e.x, e.y, ENEMY_COLORS[g.type], 8, 80, 0.4, 2, true);
      this.sfx('spawn');
    }
  }

  updateEnemies(dt) {
    const alive = this.players.filter(p => p.alive);
    const tm = e => 1 + 0.3 * (e.tier - 1);
    const kdec = Math.pow(0.002, dt);
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash -= dt; e.atkCd -= dt; e.shootCd -= dt; e.stun -= dt; e.atk -= dt; e.anim += dt;

      let tgt = null, td = Infinity;
      for (const p of alive) {
        const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
        if (!e.awake && d < (17 * TILE) ** 2) e.awake = true;
        if (p.buffs.invis) continue;
        if (d < td) { td = d; tgt = p; }
      }
      if (!e.awake) continue;
      td = Math.sqrt(td);
      e.kx *= kdec; e.ky *= kdec;

      let dx = 0, dy = 0;
      if (e.stun <= 0) {
        [dx, dy] = this.steer(e, tgt, td);
        switch (e.type) {
          case 'lobber':
            if (tgt) {
              if (td < 110) [dx, dy] = norm(e.x - tgt.x, e.y - tgt.y);
              else if (td < 230) { dx *= 0.15; dy *= 0.15; }
              if (td < 320 && e.shootCd <= 0) { this.lob(e, tgt, tm(e)); e.shootCd = rand(2, 3.2); }
            }
            break;
          case 'demon':
            if (tgt && td < 330 && e.shootCd <= 0) {
              if (this.los(e.x, e.y, tgt.x, tgt.y)) { this.enemyShot(e, tgt, 'efire', 230, 12 * tm(e)); e.shootCd = rand(1.8, 3); }
              else e.shootCd = 0.3;
            }
            break;
          case 'sorcerer':
            e.blinkT -= dt;
            if (e.blinkT <= 0) {
              e.invis = !e.invis;
              e.blinkT = e.invis ? rand(1.2, 2) : rand(1.8, 3);
              this.burst(e.x, e.y, '#f0c040', 8, 70, 0.4, 2, true);
            }
            if (!e.invis && tgt && td < 300 && e.shootCd <= 0) {
              if (this.los(e.x, e.y, tgt.x, tgt.y)) { this.enemyShot(e, tgt, 'bolt', 260, 10 * tm(e)); e.shootCd = rand(1.5, 2.5); }
              else e.shootCd = 0.3;
            }
            break;
        }
      }

      let sx = 0, sy = 0;
      this.queryEnemies(e.x, e.y, e.r * 2, o => {
        if (o === e) return;
        const ox = e.x - o.x, oy = e.y - o.y, rr = e.r + o.r, d2 = ox * ox + oy * oy;
        if (d2 < rr * rr && d2 > 0.01) { const d = Math.sqrt(d2), push = (rr - d) / rr; sx += (ox / d) * push; sy += (oy / d) * push; }
      });
      const sp = e.stun > 0 ? 0 : e.speed;
      this.moveEntity(e, (dx * sp + sx * 110 + e.kx) * dt, (dy * sp + sy * 110 + e.ky) * dt);
      for (const p of alive) this.separate(e, p);
      for (const g of this.generators) this.separate(e, g);
      if (dx || dy) e.face = Math.atan2(dy, dx);

      // contact attacks
      for (const p of alive) {
        const rr = e.r + p.r + 3;
        if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 > rr * rr) continue;
        if (e.type === 'ghost') { this.hurtPlayer(p, e.def.dmg * tm(e)); this.killEnemy(e, null, true); break; }
        if (e.type === 'death') {
          if (p.buffs.invuln || p.iframes > 0) break;
          const d = 80 * dt;
          p.hp -= d; e.drained += d; p.hurt = 0.1;
          this.sfx('drain');
          if (e.drained >= 200) { this.burst(e.x, e.y, '#9a60ff', 30, 200, 0.8, 3, true); e.dead = true; if (e.parent) e.parent.children--; }
          break;
        }
        if (e.atkCd <= 0) { this.hurtPlayer(p, e.def.dmg * tm(e)); e.atkCd = 0.8; e.atk = 0.15; }
        break;
      }
    }
  }

  enemyShot(e, tgt, kind, speed, dmg) {
    const [nx, ny] = norm(tgt.x - e.x, tgt.y - e.y);
    this.projectiles.push({ team: 1, kind, x: e.x, y: e.y, vx: nx * speed, vy: ny * speed, r: 6, dmg, life: 2.5, ang: Math.atan2(ny, nx), spin: 0, dead: false });
    this.sfx('eshot');
  }

  lob(e, tgt, mul) {
    const lead = 0.6;
    this.lobs.push({ x0: e.x, y0: e.y - 8, x1: tgt.x + (tgt.vx || 0) * lead, y1: tgt.y + (tgt.vy || 0) * lead, t: 0, dur: 1, dmg: 15 * mul });
    this.sfx('lob');
  }

  updateLobs(dt) {
    for (const l of this.lobs) {
      l.t += dt;
      if (l.t >= l.dur) {
        l.done = true;
        this.burst(l.x1, l.y1, '#8a8078', 14, 140, 0.5, 3);
        this.sfx('boom');
        for (const p of this.players) if (p.alive && (p.x - l.x1) ** 2 + (p.y - l.y1) ** 2 < 36 * 36) this.hurtPlayer(p, l.dmg);
      }
    }
    this.lobs = this.lobs.filter(l => !l.done);
  }

  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      pr.life -= dt;
      if (pr.life <= 0) { pr.dead = true; continue; }
      pr.spin += dt * 18;
      const steps = Math.max(1, Math.ceil((Math.hypot(pr.vx, pr.vy) * dt) / 10));
      const sdx = (pr.vx * dt) / steps, sdy = (pr.vy * dt) / steps;
      for (let s = 0; s < steps && !pr.dead; s++) {
        pr.x += sdx; pr.y += sdy;
        if (this.solidAt(pr.x, pr.y)) {
          pr.dead = true;
          this.burst(pr.x - sdx, pr.y - sdy, R.PROJ_GLOW[pr.kind] || '#ddd', 5, 90, 0.25, 2, !!R.PROJ_GLOW[pr.kind]);
          break;
        }
        if (pr.team === 0) this.hitAsPlayerShot(pr); else this.hitAsEnemyShot(pr);
      }
      if (!pr.dead && (pr.kind === 'fire' || pr.kind === 'efire') && Math.random() < 0.6) {
        this.particles.push({ x: pr.x, y: pr.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.3, max: 0.3, color: R.PROJ_GLOW[pr.kind], size: 3, glow: true });
      }
    }
  }

  hitAsPlayerShot(pr) {
    for (const g of this.generators) {
      if (g.dead) continue;
      if ((pr.x - g.x) ** 2 + (pr.y - g.y) ** 2 < (pr.r + g.r) ** 2) {
        this.damageGenerator(g, pr.dmg, pr.owner);
        pr.dead = true;
        this.burst(pr.x, pr.y, '#ddd', 5, 90, 0.25, 2);
        return;
      }
    }
    this.queryEnemies(pr.x, pr.y, 30, e => {
      if (pr.dead || (pr.hits && pr.hits.has(e))) return;
      const rr = pr.r + e.r;
      if ((pr.x - e.x) ** 2 + (pr.y - e.y) ** 2 > rr * rr) return;
      if (!this.damageEnemy(e, pr.dmg, pr.owner, pr.vx, pr.vy, 'shot')) return;
      if (pr.pierce > 0) { pr.pierce--; (pr.hits ||= new Set()).add(e); }
      else pr.dead = true;
    });
    if (pr.dead) return;
    for (const it of this.items) {
      if (it.dead || (it.kind !== 'meat' && it.kind !== 'cider' && it.kind !== 'potion')) continue;
      if ((pr.x - it.x) ** 2 + (pr.y - it.y) ** 2 > (pr.r + it.r - 3) ** 2) continue;
      it.dead = true;
      pr.dead = true;
      const o = pr.owner;
      if (it.kind === 'potion') this.bomb(it.x, it.y, 0.5 * o.hero.magic * o.mods.magic, o, true);
      else {
        this.burst(it.x, it.y, '#c8743a', 16, 140, 0.5, 3);
        this.text(it.x, it.y - 16, '!!', '#ff6a6a', 1);
        this.say(t('shot_food', { hero: heroName(o.heroKey) }), true);
      }
      return;
    }
  }

  hitAsEnemyShot(pr) {
    for (const p of this.players) {
      if (!p.alive) continue;
      if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 < (pr.r + p.r) ** 2) {
        this.hurtPlayer(p, pr.dmg);
        pr.dead = true;
        this.burst(pr.x, pr.y, R.PROJ_GLOW[pr.kind] || '#f84', 8, 100, 0.3, 2, true);
        return;
      }
    }
  }

  // ------------------------------------------------------------ camera & map
  updateCamera(dt, snap = false) {
    let list = this.players.filter(p => p.alive);
    if (!list.length) list = this.players;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of list) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const { vw, vh } = this.app;
    const base = this.baseZoom();
    const need = Math.min(vw / (maxX - minX + TILE * 8), vh / (maxY - minY + TILE * 6));
    const tz = clamp(Math.min(base, need), base * 0.6, base);
    const fit = (c, half, size) => (size <= half * 2 ? size / 2 : clamp(c, half, size - half));
    if (snap) this.cam.zoom = tz;
    else this.cam.zoom = lerp(this.cam.zoom, tz, (1 - Math.pow(0.001, dt)) * 0.5);
    const tx = fit(cx, vw / 2 / this.cam.zoom, this.W * TILE), ty = fit(cy, vh / 2 / this.cam.zoom, this.H * TILE);
    if (snap) { this.cam.x = tx; this.cam.y = ty; return; }
    const k = 1 - Math.pow(0.001, dt);
    this.cam.x = lerp(this.cam.x, tx, k);
    this.cam.y = lerp(this.cam.y, ty, k);
  }

  explore() {
    const W = this.W, H = this.H, rad = 8;
    for (const p of this.players) {
      if (!p.alive) continue;
      const px = Math.floor(p.x / TILE), py = Math.floor(p.y / TILE);
      for (let y = Math.max(0, py - rad); y <= Math.min(H - 1, py + rad); y++)
        for (let x = Math.max(0, px - rad); x <= Math.min(W - 1, px + rad); x++)
          if ((x - px) ** 2 + (y - py) ** 2 <= rad * rad) this.explored[y * W + x] = 1;
    }
    const d = this.miniImg.data;
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      if (!this.explored[i]) { d[o + 3] = 0; continue; }
      const tl = this.tiles[i];
      const c = tl === T.WALL ? [120, 116, 140] : tl === T.DOOR ? [200, 140, 60] : tl === T.EXIT ? [255, 220, 90] : [40, 36, 54];
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    this.miniCtx.putImageData(this.miniImg, 0, 0);
  }

  // ------------------------------------------------------------ drawing
  draw(ctx, settings) {
    const { vw, vh } = this.app;
    const z = this.cam.zoom, time = this.time;
    const sk = settings.shake ? this.shake : 0;
    const shx = (Math.random() - 0.5) * 2 * sk, shy = (Math.random() - 0.5) * 2 * sk;
    ctx.fillStyle = '#050308';
    ctx.fillRect(0, 0, vw, vh);

    ctx.save();
    ctx.translate(Math.round(vw / 2 + shx), Math.round(vh / 2 + shy));
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);
    const hw = vw / 2 / z, hh = vh / 2 / z;
    const x0 = this.cam.x - hw - 40, x1 = this.cam.x + hw + 40, y0 = this.cam.y - hh - 40, y1 = this.cam.y + hh + 40;
    const vis = o => o.x > x0 && o.x < x1 && o.y > y0 && o.y < y1;

    const sx = clamp(Math.floor(x0), 0, this.tileCanvas.width), sy = clamp(Math.floor(y0), 0, this.tileCanvas.height);
    const sw = clamp(Math.ceil(x1), 0, this.tileCanvas.width) - sx, sh = clamp(Math.ceil(y1), 0, this.tileCanvas.height) - sy;
    if (sw > 0 && sh > 0) ctx.drawImage(this.tileCanvas, sx, sy, sw, sh, sx, sy, sw, sh);

    for (const tc of this.torches) if (vis(tc)) R.drawTorch(ctx, tc, time);
    for (const it of this.items) if (vis(it)) R.drawItem(ctx, it, time);
    for (const g of this.generators) if (vis(g)) R.drawGenerator(ctx, g, time);

    const actors = [];
    for (const e of this.enemies) if (vis(e)) actors.push(e);
    for (const p of this.players) actors.push(p);
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) {
      if (a.hero) {
        if (a.alive) {
          if (a.buffs.invuln) {
            ctx.strokeStyle = `rgba(255,211,90,${0.5 + Math.sin(time * 10) * 0.3})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(a.x, a.y - 4, 18, 0, Math.PI * 2); ctx.stroke();
          }
          R.drawHero(ctx, a, time);
        } else R.drawTomb(ctx, a, time);
      } else R.drawEnemy(ctx, a, time);
    }

    for (const pr of this.projectiles) if (vis(pr)) R.drawProjectile(ctx, pr, time);
    for (const l of this.lobs) R.drawLob(ctx, l);
    for (const p of this.particles) {
      if (p.glow) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this.drawLighting(ctx, shx, shy);

    // additive glow pass (drawn above the darkness)
    ctx.save();
    ctx.translate(Math.round(vw / 2 + shx), Math.round(vh / 2 + shy));
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (!p.glow) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    for (const pr of this.projectiles) {
      const c = R.PROJ_GLOW[pr.kind];
      if (!c || !vis(pr)) continue;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 12, 0, Math.PI * 2); ctx.fill();
    }
    for (const ef of this.effects) {
      const k = 1 - ef.life / ef.max;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = ef.color;
      if (ef.kind === 'ring') {
        ctx.lineWidth = ef.w * (1 - k) + 2;
        ctx.beginPath(); ctx.arc(ef.x, ef.y, lerp(ef.r0, ef.r1, 1 - Math.pow(1 - k, 3)), 0, Math.PI * 2); ctx.stroke();
      } else if (ef.kind === 'spin') {
        ctx.lineWidth = 5;
        for (let i = 0; i < 3; i++) {
          const a = time * 24 + (i * Math.PI * 2) / 3;
          ctx.beginPath(); ctx.arc(ef.p.x, ef.p.y - 4, 50, a, a + 1.2); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 0.5 + Math.sin(time * 4) * 0.2;
    ctx.fillStyle = '#ffd35a';
    ctx.beginPath(); ctx.arc(this.exitPos.x, this.exitPos.y, 18, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // exit label + floating text (unlit)
    if (vis(this.exitPos)) {
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(t('exit_word'), this.exitPos.x + 1, this.exitPos.y - 20);
      ctx.fillStyle = '#ffe07a';
      ctx.fillText(t('exit_word'), this.exitPos.x, this.exitPos.y - 21);
    }
    ctx.textAlign = 'center';
    for (const tx of this.texts) {
      ctx.globalAlpha = Math.min(1, (tx.life / tx.max) * 2);
      ctx.font = `${tx.small ? 7 : 9}px "Press Start 2P", monospace`;
      ctx.fillStyle = '#000';
      ctx.fillText(tx.str, tx.x + 1, tx.y + 1);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.str, tx.x, tx.y);
    }
    // off-screen / dead player indicators
    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(220,245,255,${Math.min(0.85, this.flash)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (this.exiting > 0) {
      ctx.fillStyle = `rgba(0,0,0,${1 - this.exiting / 1.4})`;
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  drawLighting(ctx, shx, shy) {
    const { vw, vh } = this.app;
    const sc = 0.5;
    const lc = this.lightCanvas, lg = this.lightCtx;
    const w = Math.ceil(vw * sc), h = Math.ceil(vh * sc);
    if (lc.width !== w || lc.height !== h) { lc.width = w; lc.height = h; }
    const z = this.cam.zoom, time = this.time;
    const toS = (x, y) => [((x - this.cam.x) * z + vw / 2 + shx) * sc, ((y - this.cam.y) * z + vh / 2 + shy) * sc];
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, w, h);
    lg.fillStyle = `rgba(4,2,10,${this.darkness})`;
    lg.fillRect(0, 0, w, h);
    lg.globalCompositeOperation = 'destination-out';
    const light = (x, y, r, a) => {
      const [lx, ly] = toS(x, y), rr = r * z * sc;
      if (lx < -rr || ly < -rr || lx > w + rr || ly > h + rr) return;
      const g = lg.createRadialGradient(lx, ly, 0, lx, ly, rr);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.55, `rgba(0,0,0,${a * 0.65})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = g;
      lg.beginPath(); lg.arc(lx, ly, rr, 0, Math.PI * 2); lg.fill();
    };
    for (const p of this.players) light(p.x, p.y, p.alive ? 210 : 90, 1);
    for (const tc of this.torches) light(tc.x, tc.y + 10, 110 + Math.sin(time * 9 + tc.ph) * 8, 0.85);
    light(this.exitPos.x, this.exitPos.y, 120, 0.9);
    for (const pr of this.projectiles) if (R.PROJ_GLOW[pr.kind]) light(pr.x, pr.y, 60, 0.7);
    for (const ef of this.effects) if (ef.kind === 'ring') light(ef.x, ef.y, ef.r1 * 1.1, ef.life / ef.max);
    for (const it of this.items) if (it.kind === 'amulet' || it.kind === 'potion') light(it.x, it.y, 40, 0.5);
    ctx.drawImage(lc, 0, 0, vw, vh);

    // warm torch tint
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const tc of this.torches) {
      const [lx, ly] = toS(tc.x, tc.y + 6);
      const x = lx / sc, y = ly / sc, r = (70 + Math.sin(time * 11 + tc.ph) * 6) * z;
      if (x < -r || y < -r || x > vw + r || y > vh + r) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,140,40,0.22)');
      g.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

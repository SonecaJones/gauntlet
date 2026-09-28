import { Game } from './game.js';
import { HEROES } from './heroes.js';
import { generateLevel } from './level.js';
import { PROJ_GLOW } from './render.js';
import { clamp, lerp, norm } from './util.js';

// Compact wire encodings for entity types.
const ET = ['ghost', 'grunt', 'demon', 'lobber', 'sorcerer', 'death'];
const PK = ['axe', 'sword', 'fire', 'arrow', 'storm', 'efire', 'bolt'];
const IK = ['meat', 'cider', 'potion', 'key', 'treasure', 'chest', 'amulet'];
const AS = ['invuln', 'rapid', 'speed', 'multi', 'invis'];
const INTERP_DELAY = 0.1;

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
function unb64(str) {
  const s = atob(str), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

// ------------------------------------------------------------------ host side
export function levelMsg(g) {
  return { t: 'level', n: g.levelNum, seed: g.seed, pc: g.genPlayers, tiles: b64(g.tiles) };
}

export function snapshot(g, paused) {
  const idOf = o => o.id || (o.id = g.nextId++);
  const buffs = b => { const o = {}; for (const k in b) o[k] = r1(b[k]); return o; };
  return {
    t: 's', tm: r2(performance.now() / 1000), lv: g.levelNum, ex: r2(g.exiting), fl: r2(g.flash), sh: r1(g.shake), pz: paused ? 1 : 0,
    p: g.players.map(p => [
      p.slot, p.heroKey, p.ctrlId, r1(p.x), r1(p.y), r2(p.facing), p.moving ? 1 : 0, Math.ceil(p.hp), p.alive ? 1 : 0,
      p.score, p.keys, p.potions, r1(Math.max(0, p.specialCd)), r1(Math.max(0, p.dashCd)), p.hurt > 0 ? 1 : 0,
      p.spinT > 0 ? 1 : 0, p.dashT > 0 ? 1 : 0, p.chargeT > 0 ? 1 : 0, r2(p.revive), buffs(p.buffs), r2(p.mods.cd),
      Math.round(p.hero.speed * p.mods.speed * (p.buffs.speed ? 1.35 : 1)),
    ]),
    e: g.enemies.map(e => [idOf(e), ET.indexOf(e.type), e.tier, r1(e.x), r1(e.y), r2(e.face), e.flash > 0 ? 1 : 0, e.invis ? 1 : 0, e.atk > 0 ? 1 : 0, e.shootCd < 0.8 ? 1 : 0, r1(e.r)]),
    g: g.generators.map(q => [idOf(q), ET.indexOf(q.type), q.tier, q.maxTier, q.x, q.y, Math.round(q.hp), r1(q.hpPerTier), r2(q.spawnT), q.flash > 0 ? 1 : 0]),
    pr: g.projectiles.map(q => [idOf(q), PK.indexOf(q.kind), r1(q.x), r1(q.y), r2(q.ang)]),
    it: g.items.map(q => [idOf(q), IK.indexOf(q.kind), q.sub ? AS.indexOf(q.sub) : -1, q.x, q.y]),
    lb: g.lobs.map(l => [r1(l.x0), r1(l.y0), r1(l.x1), r1(l.y1), r2(l.t), l.dur]),
    ev: g.ev ? g.ev.splice(0) : [],
  };
}

// Input command a guest sends to the host every frame.
export function makeCmd(c, aim) {
  const cmd = { k: 'in', mx: r2(c.move.x), my: r2(c.move.y) };
  if (aim) { cmd.ax = r2(aim[0]); cmd.ay = r2(aim[1]); }
  if (c.fire) cmd.f = 1;
  if (c.fireFacing) cmd.ff = 1;
  for (const k of ['dash', 'special', 'potion', 'confirm', 'back', 'start', 'left', 'right', 'up', 'down']) if (c[k]) cmd[k] = 1;
  return cmd;
}

// ------------------------------------------------------------------ guest side
// A Game whose state is replicated from the host. It reuses Game's drawing,
// camera, lighting and particle code; only update() differs.
export class ClientGame extends Game {
  constructor(app, myCtrl) {
    super(app, [], { client: true });
    this.isClient = true;
    this.myCtrl = myCtrl;
    this.snaps = [];
    this.offset = null;
    this.cache = { e: new Map(), g: new Map(), pr: new Map(), it: new Map(), p: new Map() };
    this.me = null;
    this.hostPaused = false;
    this.lastCmd = null;
  }

  applyLevel(m) {
    const L = generateLevel(m.n, m.seed, m.pc);
    L.tiles.set(unb64(m.tiles));
    this.setupLevel(L, m.n);
    this.snaps = [];
    for (const c of Object.values(this.cache)) c.clear();
    this.players = [];
    this.me = null;
    this.camReady = false;
  }

  pushSnap(s) {
    if (!this.level || s.lv !== this.levelNum) return;
    const now = performance.now() / 1000, o = now - s.tm;
    if (this.offset == null || o < this.offset) this.offset = o;
    else this.offset += (o - this.offset) * 0.02;
    this.snaps.push(s);
    if (this.snaps.length > 40) this.snaps.shift();
    this.latest = s;
    this.hostPaused = !!s.pz;
    this.flash = Math.max(this.flash, s.fl);
    this.shake = Math.max(this.shake, s.sh);
    this.exiting = s.ex;
    for (const e of s.ev) this.applyEvent(e);
  }

  applyEvent(e) {
    switch (e[0]) {
      case 's': this.audio.play(e[1]); break;
      case 'v': this.audio.say(e[1], true); break;
      case 'b': this.burst(e[1], e[2], e[3], e[4], e[5], e[6], e[7], !!e[8]); break;
      case 't': this.text(e[1], e[2], e[3], e[4], e[5], !!e[6]); break;
      case 'd': this.openDoorTiles(e[1], e[2]); break;
      case 'r': if (e[1] === this.myCtrl) this.app.input.rumble(this.app.net?.localId, e[2], e[3], e[4]); break;
      case 'e':
        if (e[1] === 'spin') {
          const p = this.players.find(q => q.slot === e[2]);
          if (p) this.effects.push({ kind: 'spin', p, life: e[3], max: e[3], color: e[4] });
        } else this.effects.push({ kind: 'ring', x: e[2], y: e[3], r0: e[4], r1: e[5], life: e[6], max: e[6], color: e[7], w: e[8] });
        break;
    }
  }

  // Build interpolated entity objects between snapshots A and B.
  sync(cache, A, B, k, fill) {
    const prev = new Map();
    if (B) for (const r of A) prev.set(r[0], r);
    const list = B || A, seen = new Set(), out = [];
    for (const r of list) {
      seen.add(r[0]);
      let o = cache.get(r[0]);
      if (!o) { o = { id: r[0], anim: Math.random() * 10, bob: Math.random() * 6, spin: 0, walk: 0 }; cache.set(r[0], o); }
      fill(o, r, B ? prev.get(r[0]) : null, k);
      out.push(o);
    }
    for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key);
    return out;
  }

  update(dt) {
    this.time += dt;
    this.dt = dt;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.hint) { this.hint.t -= dt; if (this.hint.t <= 0) this.hint = null; }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 28);
    if (!this.level || !this.snaps.length) return;

    const rt = performance.now() / 1000 - this.offset - INTERP_DELAY;
    let a = this.snaps[0], b = null;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].tm <= rt) { a = this.snaps[i]; b = this.snaps[i + 1] || null; break; }
    }
    const k = b ? clamp((rt - a.tm) / (b.tm - a.tm), 0, 1) : 0;
    const A = a, B = b;
    const lx = (o, r, pr, i) => { o.x = pr ? lerp(pr[i], r[i], k) : r[i]; o.y = pr ? lerp(pr[i + 1], r[i + 1], k) : r[i + 1]; };

    this.enemies = this.sync(this.cache.e, A.e, B && B.e, k, (o, r, pr) => {
      o.type = ET[r[1]]; o.tier = r[2]; lx(o, r, pr, 3); o.face = r[5];
      o.flash = r[6] ? 0.1 : 0; o.invis = !!r[7]; o.atk = r[8] ? 0.1 : -1; o.shootCd = r[9] ? 0 : 1; o.r = r[10];
      o.anim += dt;
    });
    this.generators = this.sync(this.cache.g, A.g, B && B.g, k, (o, r) => {
      o.type = ET[r[1]]; o.tier = r[2]; o.maxTier = r[3]; o.x = r[4]; o.y = r[5]; o.hp = r[6]; o.hpPerTier = r[7]; o.spawnT = r[8]; o.flash = r[9] ? 0.1 : 0; o.r = 15;
    });
    this.projectiles = this.sync(this.cache.pr, A.pr, B && B.pr, k, (o, r, pr) => {
      o.kind = PK[r[1]]; lx(o, r, pr, 2); o.ang = r[4]; o.spin += dt * 18;
      if ((o.kind === 'fire' || o.kind === 'efire') && Math.random() < 0.5) {
        this.particles.push({ x: o.x, y: o.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.3, max: 0.3, color: PROJ_GLOW[o.kind], size: 3, glow: true });
      }
    });
    this.items = this.sync(this.cache.it, A.it, null, 0, (o, r) => {
      o.kind = IK[r[1]]; o.sub = r[2] >= 0 ? AS[r[2]] : undefined; o.x = r[3]; o.y = r[4]; o.r = 11;
    });
    this.lobs = A.lb.map(l => ({ x0: l[0], y0: l[1], x1: l[2], y1: l[3], t: Math.min(l[5], l[4] + Math.max(0, rt - a.tm)), dur: l[5] }));

    // Players: others interpolated, our own predicted locally.
    const latestRows = new Map(this.latest.p.map(r => [r[2], r]));
    this.players = this.sync(this.cache.p, A.p, B && B.p, k, (o, r, pr) => {
      const mine = r[2] === this.myCtrl;
      if (!mine || !o.predicted) { lx(o, r, pr, 3); o.facing = r[5]; }
      o.slot = r[0]; o.heroKey = r[1]; o.hero = HEROES[r[1]]; o.ctrlId = r[2]; o.moving = !!r[6];
      const L = mine ? latestRows.get(r[2]) || r : r;
      o.hp = L[7]; o.alive = !!L[8]; o.score = L[9]; o.keys = L[10]; o.potions = L[11];
      o.specialCd = L[12]; o.dashCd = L[13]; o.hurt = L[14] ? 0.15 : 0; o.spinT = L[15] ? 0.1 : 0;
      o.dashT = L[16] ? 0.1 : 0; o.chargeT = L[17] ? 0.1 : 0; o.revive = L[18]; o.buffs = L[19];
      o.mods = { cd: L[20] }; o.spd = L[21]; o.r = 11;
      if (o.moving) o.walk += dt;
      if ((o.dashT > 0 || o.chargeT > 0) && o.alive) {
        this.particles.push({ x: o.x + (Math.random() - 0.5) * 8, y: o.y + (Math.random() - 0.5) * 12, vx: 0, vy: 0, life: 0.25, max: 0.25, color: o.hero.light, size: 5, glow: true });
      }
    });
    this.players.sort((p, q) => p.slot - q.slot);
    this.me = this.players.find(p => p.ctrlId === this.myCtrl) || null;

    const local = this.app.net?.local;
    const neutral = { move: { x: 0, y: 0 } };
    this.lastCmd = this.buildCmd(this.localPaused || !local ? neutral : local);
    if (this.me) this.predict(dt, this.lastCmd, latestRows.get(this.myCtrl));

    this.updateParticles(dt);
    this.exploreT -= dt;
    if (this.exploreT <= 0) { this.exploreT = 0.2; this.explore(); }
    this.updateCamera(dt, !this.camReady);
    this.camReady = true;
  }

  buildCmd(c) {
    let aim = null;
    if (c.aim) aim = norm(c.aim.x, c.aim.y);
    else if (c.aimPoint && this.me) {
      const w = this.screenToWorld(c.aimPoint.x, c.aimPoint.y);
      aim = norm(w.x - this.me.x, w.y - this.me.y);
    }
    return makeCmd({ ...c, fire: c.fire || false }, aim);
  }

  // Move our own hero immediately and ease it towards the host's position.
  predict(dt, cmd, srv) {
    const me = this.me;
    if (!srv) return;
    const sx = srv[3], sy = srv[4];
    if (!me.alive) { me.x = sx; me.y = sy; me.predicted = false; return; }
    if (!me.predicted) { me.x = sx; me.y = sy; me.predicted = true; me.pdT = 0; me.pdCd = 0; }
    const [mx, my, ml] = norm(cmd.mx, cmd.my);
    const mag = Math.min(1, ml);
    me.pdCd -= dt;
    if (cmd.dash && me.pdCd <= 0) {
      me.pdT = 0.17; me.pdCd = 1.1 * me.mods.cd;
      me.pdX = mag > 0.1 ? mx : Math.cos(me.facing); me.pdY = mag > 0.1 ? my : Math.sin(me.facing);
    }
    let vx, vy;
    if (me.pdT > 0) { me.pdT -= dt; vx = me.pdX * 520; vy = me.pdY * 520; }
    else {
      const firing = cmd.f || cmd.ff;
      const sp = me.spd * (firing ? 0.82 : 1) * mag;
      vx = mx * sp; vy = my * sp;
    }
    if (vx || vy) this.moveEntity(me, vx * dt, vy * dt);
    me.moving = mag > 0.1;
    if (cmd.ax != null) me.facing = Math.atan2(cmd.ay, cmd.ax);
    else if (me.moving) me.facing = Math.atan2(my, mx);
    // correction: the host is the authority
    const ex = sx - me.x, ey = sy - me.y, err = Math.hypot(ex, ey);
    if (err > 160) { me.x = sx; me.y = sy; return; }
    const f = me.moving ? (err > 40 ? 0.15 : 0.03) : 0.12;
    const kk = 1 - Math.pow(1 - f, dt * 60);
    this.moveEntity(me, ex * kk, ey * kk);
  }
}

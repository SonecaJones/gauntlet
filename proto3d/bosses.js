// 3D bosses for the HD-2D prototype: the Red Dragon, the Necromancer and the
// Stone Golem (Blender models from tools/blender/bosses3d.py) fighting with
// the attack patterns of src/boss.js, converted from pixels to tiles.
// The hero still can't die here; the boss can.
import * as THREE from 'three';
import { BOSS_DEF } from '../src/boss.js';
import { TILE } from '../src/constants.js';

const INFO = {
  dragon: { name: 'Dragão Vermelho', scale: 1.55, color: 0xff5a30, light: 0xff7a30, hp: 1400 },
  lich: { name: 'Necromante', scale: 1.45, color: 0x7dff8a, light: 0x5aff7a, hp: 1100, fade: true },
  golem: { name: 'Golem de Pedra', scale: 1.8, color: 0xffb060, light: 0xff9a40, hp: 1600 },
};
export const BOSS_KINDS = Object.keys(INFO);
export const bossName = kind => INFO[kind].name;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// onHeroHit(type, x, y, force): the hero was hit from (x, y), knocked back by force
export function createBoss({ scene, level, loadModel, solid, heroBlocked, shots, monsters, onHeroHit, onShake, onDefeat }) {
  const kind = level.boss.kind, I = INFO[kind], D = BOSS_DEF[kind];
  const b = {
    kind, name: I.name, x: level.boss.x + 0.5, y: level.boss.y + 0.5, r: D.r / TILE, speed: D.speed / TILE * 1.2,
    hp: I.hp, maxHp: I.hp, phase: 1, awake: false, act: 'sleep', actT: 0, cd: 2, fired: 0, angle: -Math.PI / 2, face: -Math.PI / 2,
    contactCd: 0, flash: 0, dead: false, deadT: 0, invis: false, alpha: 1, minions: [], hit,
  };
  let root = null, mixer = null, cur = null;
  const acts = {}, mats = [];
  const dir = new THREE.Vector2();

  // the boss's own light: the dragon's throat, the necromancer's staff, the golem's core
  const light = new THREE.PointLight(I.light, 0, 6, 1.6);
  scene.add(light);

  const hud = document.getElementById('boss'), hudName = document.getElementById('bossName'), hudBar = document.getElementById('bossHp');
  if (hudName) hudName.textContent = I.name;

  const ready = loadModel(kind).then(gltf => {
    root = gltf.scene;
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      o.material = [].concat(o.material).map(m => {
        m.flatShading = true;
        if (m.metalness > 0.5) { m.metalness = 0.35; m.roughness = Math.max(m.roughness, 0.45); }
        m.userData.emissive = m.emissive.clone(); m.userData.ei = m.emissiveIntensity; m.userData.opacity = m.opacity;
        if (I.fade) m.transparent = true;
        mats.push(m);
        return m;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    root.scale.setScalar(I.scale);
    scene.add(root);
    mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) acts[clip.name] = mixer.clipAction(clip);
    play('Idle');
    place();
  });

  // ---------------------------------------------------------------- animation
  // once: play a single time and hold the last frame, stretched to `dur` seconds
  function play(name, { once = false, dur = 0, fade = 0.2 } = {}) {
    const a = acts[name];
    if (!a || (a === cur && !once)) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = dur ? a.getClip().duration / dur : 1;
    a.play();
    if (cur && cur !== a) cur.crossFadeTo(a, fade, false);
    cur = a;
  }
  function begin(act, dur, anim, loop = false) {
    b.act = act; b.actT = dur; b.fired = 0;
    play(anim, loop ? { fade: 0.15 } : { once: true, dur, fade: 0.1 });
  }
  function toWalk(cd) { b.act = 'walk'; b.cd = cd; }
  function loco(moved, dt) {
    const moving = moved > b.speed * dt * 0.3;
    play(moving ? 'Walk' : 'Idle', { fade: 0.25 });
    if (acts.Walk) acts.Walk.timeScale = b.phase === 2 ? 1.3 : 1;
  }

  // ---------------------------------------------------------------- world
  // bosses never leave their arena (a charge stops at its edge like at a wall)
  const A = level.arena;
  function blockedR(x, y, r) {
    if (x - r < A.x || y - r < A.y || x + r > A.x + A.w || y + r > A.y + A.h) return true;
    if (solid(Math.floor(x), Math.floor(y))) return true;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      if (solid(Math.floor(x + Math.cos(a) * r), Math.floor(y + Math.sin(a) * r))) return true;
    }
    return false;
  }
  // returns the distance actually moved
  function step(vx, vy, dist) {
    const r = b.r * 0.8, ox = b.x, oy = b.y;
    if (!blockedR(b.x + vx * dist, b.y, r)) b.x += vx * dist;
    if (!blockedR(b.x, b.y + vy * dist, r)) b.y += vy * dist;
    return Math.hypot(b.x - ox, b.y - oy);
  }
  function arenaSpot(hero) {
    for (let i = 0; i < 40; i++) {
      const x = A.x + 1.5 + Math.random() * (A.w - 3), y = A.y + 1.5 + Math.random() * (A.h - 3);
      if (!blockedR(x, y, b.r) && Math.hypot(hero.x - x, hero.y - y) > 5.3) return [x, y];
    }
    return null;
  }

  // ground rings: shockwaves (wave: hurts the hero once when it passes) and flashes
  const ringGeo = new THREE.RingGeometry(0.88, 1, 56).rotateX(-Math.PI / 2);
  const rings = [];
  function ring(x, y, r0, r1, life, color, wave = null) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.set(x, 0.06, y);
    m.scale.setScalar(r0);
    scene.add(m);
    rings.push({ m, x, y, r0, r1, life, max: life, wave });
  }
  function updateRings(dt, hero) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const g = rings[i];
      g.life -= dt;
      const k = 1 - Math.max(0, g.life) / g.max;
      const r = g.r0 + (g.r1 - g.r0) * (g.wave ? k : 1 - (1 - k) ** 3);
      g.m.scale.setScalar(r);
      g.m.material.opacity = g.wave ? 0.9 : 1 - k;
      if (g.wave && !g.wave.hit && Math.abs(Math.hypot(hero.x - g.x, hero.y - g.y) - r) < 0.35) {
        g.wave.hit = true;
        onHeroHit('wave', g.x, g.y, 7);
      }
      if (g.wave && Math.random() < 0.5) {  // dust kicked up along the wave
        const a = Math.random() * Math.PI * 2;
        shots.burst(g.x + Math.cos(a) * r, 0.1, g.y + Math.sin(a) * r, 2, 0.6, 0.4, 0xc8a070);
      }
      if (g.life <= 0) { scene.remove(g.m); g.m.material.dispose(); rings.splice(i, 1); }
    }
  }
  function area(x, y, radius, type, force) {
    const h = heroRef;
    if (Math.hypot(h.x - x, h.y - y) < radius + 0.3) onHeroHit(type, x, y, force);
  }
  function lob(kind, tx, ty, y0) {
    const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
    shots.fire(kind, b.x, b.y, dir.set(dx / d, dy / d), 'enemy', d, y0);
  }
  const timers = [];
  const later = (t, fn) => timers.push({ t, fn });

  // ---------------------------------------------------------------- life
  function wake() {
    if (b.awake) return;
    b.awake = true;
    begin('roar', 1.3, 'Roar');
    b.cd = 1;
    onShake(0.5);
    ring(b.x, b.y, b.r, 8, 0.8, 0xff5a3a);
    if (hud) hud.hidden = false;
  }
  function rage() {
    b.phase = 2;
    b.speed *= 1.3;
    begin('roar', 1.1, 'Roar');
    b.invis = false;
    onShake(0.4);
    ring(b.x, b.y, b.r, 7, 0.6, 0xff2a2a);
    if (hud) hud.classList.add('rage');
  }
  function hit(dmg, fx, fy) {
    if (b.dead || b.alpha < 0.5) return false;
    if (!b.awake) wake();
    if (b.act === 'stun') dmg *= 2;  // a dazed golem takes double damage
    b.hp -= dmg;
    b.flash = 0.12;
    const d = Math.hypot(b.x - fx, b.y - fy) || 1;
    shots.burst(fx + (b.x - fx) / d * 0.4, 0.8, fy + (b.y - fy) / d * 0.4, 14, 2, 0.35, 0xffffff);
    if (b.hp <= 0) die();
    return true;
  }
  function die() {
    b.dead = true; b.hp = 0; b.deadT = 0;
    b.invis = false;
    play('Roar', { once: true, dur: 1.6, fade: 0.1 });
    onShake(0.8);
    ring(b.x, b.y, b.r, 9, 1, 0xffd35a);
    for (const m of b.minions) if (!m.dead) monsters.kill(m);
    timers.length = 0;
  }
  monsters.targets.push(b);

  // ---------------------------------------------------------------- dragon
  function dragon(dt, hero, d, toT) {
    const p2 = b.phase === 2;
    switch (b.act) {
      case 'walk': {
        b.face = toT;
        let mv = 0;
        if (d > 4.7) mv = step(Math.sin(toT), Math.cos(toT), b.speed * dt);
        else if (d < 2.8) mv = step(-Math.sin(toT), -Math.cos(toT), b.speed * 0.5 * dt);
        loco(mv, dt);
        if (b.cd > 0) break;
        if (d < 3.75 && Math.random() < 0.6) begin('tail', 0.7, 'Tail');
        else if (p2 && Math.random() < 0.35) {
          begin('meteor', 1.2, 'Roar');
          for (let i = 0; i < 6; i++) later(0.35 + i * 0.12, () => lob('meteor', hero.x + rand(-2.8, 2.8), hero.y + rand(-2.8, 2.8), 2.2));
        } else { begin('breath', 1.6, 'Breath', true); b.shotT = 0; b.breathA = toT; }
        break;
      }
      case 'breath': {
        b.breathA += angleDiff(b.breathA, toT) * Math.min(1, dt * (p2 ? 2 : 1.3));
        b.face = b.breathA;
        if (b.actT < 1.25) {
          const mx = b.x + Math.sin(b.face) * b.r * 1.05, my = b.y + Math.cos(b.face) * b.r * 1.05;
          b.shotT -= dt;
          while (b.shotT <= 0) {
            b.shotT += p2 ? 0.035 : 0.05;
            const a = b.breathA + rand(-0.3, 0.3) * (p2 ? 1.4 : 1), sp = rand(0.85, 1.15);
            shots.fire('flame', mx, my, dir.set(Math.sin(a) * sp, Math.cos(a) * sp), 'enemy', 4, 0.95);
          }
          light.position.set(mx, 1.1, my);
          light.intensity = 14 + Math.random() * 6;
        }
        if (b.actT <= 0) toWalk(p2 ? rand(1.2, 2) : rand(2, 3));
        break;
      }
      case 'tail':
        if (!b.fired && b.actT < 0.3) {
          b.fired = 1;
          ring(b.x, b.y, b.r, b.r + 2.66, 0.35, 0xff6a3a);
          onShake(0.3);
          area(b.x, b.y, b.r + 2.66, 'tail', 10);
        }
        if (b.actT <= 0) toWalk(rand(1, 1.6));
        break;
      case 'meteor':
        if (b.actT <= 0) toWalk(rand(1.5, 2.5));
        break;
      default: toWalk(1);
    }
  }

  // ---------------------------------------------------------------- necromancer
  function lich(dt, hero, d, toT) {
    const p2 = b.phase === 2;
    b.face = toT;
    switch (b.act) {
      case 'walk': {
        let mv;
        if (d < 5) mv = step(-Math.sin(toT), -Math.cos(toT), b.speed * dt);
        else if (d > 8.75) mv = step(Math.sin(toT), Math.cos(toT), b.speed * dt);
        else mv = step(Math.cos(toT), -Math.sin(toT), b.speed * 0.6 * dt);  // circle the hero
        loco(mv, dt);
        if (b.cd > 0) break;
        b.minions = b.minions.filter(m => !m.dead);
        const opts = ['nova', 'orbs', 'tele'];
        if (b.minions.length < 6) opts.push('summon');
        const act = pick(opts);
        if (act === 'nova') begin('nova', p2 ? 1.1 : 0.8, 'Cast');
        else if (act === 'orbs') begin('orbs', 0.6, 'Orbs');
        else if (act === 'summon') begin('summon', 0.8, 'Summon');
        else {
          begin('tele', 0.9, 'Idle', true);
          b.invis = true;
          shots.burst(b.x, 0.8, b.y, 30, 2.4, 0.5, 0x7dff8a);
        }
        break;
      }
      case 'nova': {
        const due = b.fired === 0 ? b.actT < 0.45 : b.actT < 0.2;
        if (b.fired < (p2 ? 2 : 1) && due) {
          const n = p2 ? 22 : 16, off = b.fired * Math.PI / n;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + off;
            shots.fire('hex', b.x + Math.sin(a) * 0.5, b.y + Math.cos(a) * 0.5, dir.set(Math.sin(a), Math.cos(a)), 'enemy', 4, 0.8);
          }
          ring(b.x, b.y, 0.4, 3, 0.4, 0x7dff8a);
          b.fired++;
        }
        if (b.actT <= 0) toWalk(rand(1.4, 2.4) / (p2 ? 1.4 : 1));
        break;
      }
      case 'orbs':
        if (!b.fired && b.actT < 0.3) {
          b.fired = 1;
          const n = p2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const a = toT + (i - (n - 1) / 2) * 0.5;
            shots.fire('orb', b.x + Math.sin(a) * 0.6, b.y + Math.cos(a) * 0.6, dir.set(Math.sin(a), Math.cos(a)), 'enemy', 4, 0.9);
          }
        }
        if (b.actT <= 0) toWalk(rand(1.4, 2.4));
        break;
      case 'summon':
        if (!b.fired && b.actT < 0.4) {
          b.fired = 1;
          const kinds = ['ghost', 'grunt', 'sorcerer'];
          for (let i = 0; i < 3 + (p2 ? 1 : 0); i++) {
            const a = Math.random() * Math.PI * 2, x = b.x + Math.cos(a) * 1.9, y = b.y + Math.sin(a) * 1.9;
            if (blockedR(x, y, 0.3)) continue;
            b.minions.push(monsters.spawn(pick(kinds), 2, x, y));
            shots.burst(x, 0.4, y, 16, 1.6, 0.5, 0x7dff8a);
          }
          ring(b.x, b.y, 0.3, 2.8, 0.5, 0x7dff8a);
        }
        if (b.actT <= 0) toWalk(rand(2, 3));
        break;
      case 'tele':
        if (!b.fired && b.actT < 0.45) {
          b.fired = 1;
          const spot = arenaSpot(hero);
          if (spot) { b.x = spot[0]; b.y = spot[1]; }
          shots.burst(b.x, 0.8, b.y, 30, 2.4, 0.5, 0x7dff8a);
        }
        if (b.actT <= 0) { b.invis = false; toWalk(rand(0.6, 1.2)); }
        break;
      default: toWalk(1);
    }
    light.position.set(b.x + Math.sin(b.angle - 0.6) * 0.5, 1.6, b.y + Math.cos(b.angle - 0.6) * 0.5);
    light.intensity = (b.act === 'nova' || b.act === 'summon' ? 12 : 5) * b.alpha;
  }

  // ---------------------------------------------------------------- golem
  function golem(dt, hero, d, toT) {
    const p2 = b.phase === 2;
    switch (b.act) {
      case 'walk': {
        b.face = toT;
        let mv = 0;
        if (d > 5.3) mv = step(Math.sin(toT), Math.cos(toT), b.speed * dt);
        loco(mv, dt);
        if (b.cd > 0) break;
        const roll = Math.random();
        if (d < 4 && roll < 0.5) begin('slam', 0.9, 'Slam');
        else if (roll < 0.8) begin('windup', 0.7, 'Windup');
        else {
          begin('boulder', 0.8, 'Throw');
          for (let i = 0; i < (p2 ? 5 : 3); i++) {
            later(0.5 + i * 0.15, () => lob('boulder', hero.x + heroVel.x * 0.6 + rand(-1.2, 1.2), hero.y + heroVel.y * 0.6 + rand(-1.2, 1.2), 2.2));
          }
        }
        break;
      }
      case 'windup':
        b.face = toT; b.cdir = toT;
        if (b.actT <= 0) { begin('charge', 1.3, 'Charge', true); b.hitHero = false; }
        break;
      case 'charge': {
        const sp = 11 * (p2 ? 1.15 : 1) * dt;
        b.face = b.cdir;
        const mv = step(Math.sin(b.cdir), Math.cos(b.cdir), sp);
        if (Math.random() < 0.6) shots.burst(b.x, 0.1, b.y, 2, 0.8, 0.4, 0x8a8078);
        if (!b.hitHero && d < b.r + 0.45) { b.hitHero = true; onHeroHit('charge', b.x, b.y, 12); }
        if (mv < sp * 0.5) {  // hit a wall: dazed
          begin('stun', p2 ? 1.6 : 2.2, 'Stun', true);
          onShake(0.6);
          shots.burst(b.x + Math.sin(b.cdir) * b.r, 0.8, b.y + Math.cos(b.cdir) * b.r, 40, 2.8, 0.8, 0xb0a090);
        } else if (b.actT <= 0) toWalk(rand(1, 2));
        break;
      }
      case 'stun':
        if (Math.random() < dt * 8) {  // little stars around the head
          const a = Math.random() * Math.PI * 2;
          shots.burst(b.x + Math.cos(a) * 0.4, 1.7, b.y + Math.sin(a) * 0.4, 2, 0.4, 0.5, 0xffe070);
        }
        if (b.actT <= 0) toWalk(rand(0.8, 1.4));
        break;
      case 'slam': {
        const due = b.fired === 0 ? b.actT < 0.4 : b.actT < 0.1;
        if (b.fired < (p2 ? 2 : 1) && due) {
          b.fired++;
          ring(b.x, b.y, b.r, 10.3, (10.3 - b.r) / 8.1, 0xffb060, { hit: false });
          shots.burst(b.x + Math.sin(b.face) * b.r, 0.2, b.y + Math.cos(b.face) * b.r, 40, 2.6, 0.6, 0xc8a070);
          onShake(0.5);
          if (b.fired === 1 && p2) play('Slam', { once: true, dur: 0.5, fade: 0.05 });
        }
        if (b.actT <= 0) toWalk(rand(1.2, 2));
        break;
      }
      case 'boulder':
        if (b.actT <= 0) toWalk(rand(1.5, 2.5));
        break;
      default: toWalk(1);
    }
    light.position.set(b.x + Math.sin(b.angle) * b.r * 0.8, 1.0, b.y + Math.cos(b.angle) * b.r * 0.8);
    light.intensity = b.act === 'stun' ? 1.5 : 6 + 1.5 * Math.sin(performance.now() / 150);
  }

  const AI = { dragon, lich, golem };

  // ---------------------------------------------------------------- update
  let heroRef = { x: 0, y: 0 };
  const heroVel = new THREE.Vector2(), lastHero = new THREE.Vector2(NaN, NaN);
  function update(dt, time, hero) {
    if (!root) return;
    heroRef = hero;
    if (!Number.isNaN(lastHero.x) && dt > 0) heroVel.set((hero.x - lastHero.x) / dt, (hero.y - lastHero.y) / dt);
    lastHero.copy(hero);
    updateRings(dt, hero);
    for (let i = timers.length - 1; i >= 0; i--) if ((timers[i].t -= dt) <= 0) timers.splice(i, 1)[0].fn();

    if (b.dead) {
      // roar, then crumble into the floor in a shower of sparks
      b.deadT += dt;
      if (b.deadT > 1.1) {
        const k = Math.min(1, (b.deadT - 1.1) / 1.6);
        root.position.y = -k * 1.2;
        root.scale.setScalar(I.scale * (1 - 0.3 * k));
        if (Math.random() < 0.7) shots.burst(b.x + rand(-b.r, b.r), rand(0.2, 1.4), b.y + rand(-b.r, b.r), 12, 2, 0.6, pick([I.color, 0xffd35a, 0xffffff]));
        if (b.deadT > 1.6 && !b.defeated) { b.defeated = true; onDefeat(); }
      }
      if (b.deadT > 2.8 && root.parent) { scene.remove(root); light.intensity = 0; if (hud) hud.hidden = true; }
      mixer.update(dt);
      return;
    }

    b.actT -= dt; b.cd -= dt; b.contactCd -= dt; b.flash -= dt;
    const dx = hero.x - b.x, dy = hero.y - b.y, d = Math.hypot(dx, dy) || 0.001, toT = Math.atan2(dx, dy);
    if (!b.awake && d < 9) wake();
    if (b.awake) {
      if (b.phase === 1 && b.hp < b.maxHp * 0.5) rage();
      if (b.act === 'roar') { b.face = toT; if (b.actT <= 0) toWalk(0.6); }
      else {
        if (kind === 'dragon') light.intensity = 0;
        AI[kind](dt, hero, d, toT);
      }
      // body contact pushes the hero out and hurts
      if (d < b.r + 0.3 && b.alpha > 0.5) {
        const nx = b.x + dx / d * (b.r + 0.3), ny = b.y + dy / d * (b.r + 0.3);
        if (!heroBlocked(nx, hero.y)) hero.x = nx;
        if (!heroBlocked(hero.x, ny)) hero.y = ny;
        if (b.contactCd <= 0) { b.contactCd = 0.7; onHeroHit('boss', b.x, b.y, 6); }
      }
    }
    // turn smoothly toward where the boss wants to face (the charge snaps)
    b.angle += angleDiff(b.angle, b.face) * Math.min(1, dt * (b.act === 'charge' ? 20 : 6));
    place();
    // hit flash, the rage glow and the necromancer's fading teleport
    b.alpha = THREE.MathUtils.lerp(b.alpha, b.invis ? 0 : 1, Math.min(1, dt * 10));
    const rageGlow = b.phase === 2 ? 0.25 + 0.15 * Math.sin(time * 8) : 0;
    for (const m of mats) {
      if (b.flash > 0) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 0.9; }
      else if (rageGlow && m.userData.ei < 0.5) { m.emissive.setRGB(1, 0.15, 0.05); m.emissiveIntensity = rageGlow; }
      else { m.emissive.copy(m.userData.emissive); m.emissiveIntensity = m.userData.ei; }
      if (I.fade) m.opacity = m.userData.opacity * b.alpha;
    }
    root.visible = b.alpha > 0.02;
    if (hudBar) hudBar.style.width = `${Math.max(0, b.hp / b.maxHp) * 100}%`;
    mixer.update(dt);
  }
  function place() {
    root.position.set(b.x, 0, b.y);
    root.rotation.y = b.angle;
  }

  return { ready, update, boss: b };
}

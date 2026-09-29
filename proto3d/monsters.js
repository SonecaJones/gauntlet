// 3D monsters and generators for the HD-2D prototype: Blender models from
// tools/blender/enemies3d.py with a small chase / attack / shoot AI.
// The hero can't be hurt here (it's a visual test); monsters can be killed.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ENEMIES } from '../src/enemies.js';
import { TILE } from '../src/constants.js';

// per type: model scale, reach, ranged shot, preferred distance, spark colour
const TYPES = {
  ghost: { scale: 1.0, reach: 0.8, color: 0xcfd8ff },
  grunt: { scale: 1.05, reach: 0.95, color: 0xd09050 },
  demon: { scale: 1.0, reach: 0.9, shot: 'fireball', range: 4.5, color: 0xff5a30 },
  lobber: { scale: 1.2, shot: 'rock', range: 5.5, keepAway: 2.5, color: 0x7fc050 },
  sorcerer: { scale: 1.0, reach: 0.8, shot: 'magic', range: 5, blink: true, color: 0xf0c040 },
  death: { scale: 1.05, reach: 0.8, color: 0x9a60ff, glow: 0x9a60ff },
};
export const MONSTER_TYPES = Object.keys(TYPES);
const MAX_ALIVE = 32;

export function createMonsters({ scene, level, loadModel, blocked, burst, fire, glowTex, onHeroHit }) {
  const templates = {};
  const monsters = [];
  const generators = [];
  // other things the hero can hit (bosses): { x, y, r, dead, hit(dmg, fromX, fromY) -> bool }
  const targets = [];
  let kills = 0;

  const ready = Promise.all([...MONSTER_TYPES, 'gen_bones', 'gen_hut'].map(name => loadModel(name).then(gltf => {
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      for (const m of [].concat(o.material)) {
        m.flatShading = true;
        if (m.metalness > 0.5) { m.metalness = 0.35; m.roughness = Math.max(m.roughness, 0.45); }
        if (m.transparent) { m.depthWrite = false; o.castShadow = false; }
      }
    });
    templates[name] = gltf;
  })));

  // ---------------------------------------------------------------- spawning
  function spawn(type, tier, x, y) {
    const T = TYPES[type], gltf = templates[type];
    const root = cloneSkinned(gltf.scene);
    const mats = [];
    // own materials per monster so a hit flash or a fade only touches it
    root.traverse(o => {
      if (!o.isMesh) return;
      o.material = [].concat(o.material).map(m => {
        const c = m.clone();
        c.userData.emissive = c.emissive.clone(); c.userData.ei = c.emissiveIntensity; c.userData.opacity = c.opacity;
        if (T.blink) c.transparent = true;
        mats.push(c);
        return c;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    const s = T.scale * (0.85 + 0.1 * tier);
    root.scale.setScalar(s);
    scene.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const acts = {};
    for (const clip of gltf.animations) {
      const a = mixer.clipAction(clip);
      if (clip.name === 'Attack') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      acts[clip.name] = a;
    }
    acts.Idle.play();
    acts.Idle.time = Math.random() * acts.Idle.getClip().duration;
    let glow = null;
    if (T.glow) {
      glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: T.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
      glow.scale.setScalar(1.6);
      scene.add(glow);
    }
    const base = ENEMIES[type];
    const m = {
      type, tier, x, y, root, mixer, acts, mats, glow, cur: acts.Idle,
      angle: Math.random() * Math.PI * 2, hp: base.hp * (0.7 + 0.3 * tier),
      speed: base.speed / TILE * 0.9, atkT: 0, fired: false, cd: 1 + Math.random(), flash: 0, ph: Math.random() * 10,
      spawnT: 0.4,
    };
    monsters.push(m);
    return m;
  }

  function play(m, name, fade = 0.2) {
    const a = m.acts[name];
    if (!a || m.cur === a) return;
    a.reset().play();
    m.cur.crossFadeTo(a, fade, false);
    m.cur = a;
  }

  // BFS distances from the start: one of each monster waits a few rooms
  // away (the "bestiary"), next to the monsters the level already has.
  function freeTilesFrom(sx, sy, minD, maxD) {
    const { W, H } = level;
    const dist = new Int16Array(W * H).fill(-1), q = [sy * W + sx], out = [];
    dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      if (dist[i] >= minD && dist[i] <= maxD && !blocked(x + 0.5, y + 0.5)) out.push([x, y]);
      if (dist[i] >= maxD) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = (y + dy) * W + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H || dist[n] >= 0 || blocked(x + dx + 0.5, y + dy + 0.5)) continue;
        dist[n] = dist[i] + 1; q.push(n);
      }
    }
    return out;
  }

  ready.then(() => {
    for (const e of level.enemies) spawn(e.type, e.tier, e.x + 0.5, e.y + 0.5);
    const spots = freeTilesFrom(level.start.x, level.start.y, 5, 11);
    MONSTER_TYPES.forEach((type, i) => {
      const p = spots[Math.floor((i + 0.5) / MONSTER_TYPES.length * spots.length)];
      if (p) spawn(type, 1 + (i % 3), p[0] + 0.5, p[1] + 0.5);
    });
    for (const g of level.generators) {
      const root = templates[g.type === 'ghost' || g.type === 'death' ? 'gen_bones' : 'gen_hut'].scene.clone();
      root.position.set(g.x + 0.5, 0, g.y + 0.5);
      root.scale.setScalar(0.8 + 0.1 * g.tier);
      scene.add(root);
      generators.push({ ...g, x: g.x + 0.5, y: g.y + 0.5, root, hp: 60 * g.tier, t: 2 + Math.random() * 5 });
    }
  });

  // ---------------------------------------------------------------- damage
  function kill(m) {
    const T = TYPES[m.type];
    burst(m.x, 0.5, m.y, 40, 2.6, 0.6, T.color);
    burst(m.x, 0.4, m.y, 16, 1.2, 0.8, 0xffffff);
    scene.remove(m.root);
    if (m.glow) scene.remove(m.glow);
    m.dead = true;
    kills++;
  }
  function damage(m, dmg, kx, ky) {
    m.hp -= dmg;
    m.flash = 0.12;
    burst(m.x, 0.55, m.y, 10, 1.6, 0.3, 0xffffff);
    // knockback away from the blow
    const d = Math.hypot(m.x - kx, m.y - ky) || 1, nx = m.x + (m.x - kx) / d * 0.25, ny = m.y + (m.y - ky) / d * 0.25;
    if (!blocked(nx, m.y)) m.x = nx;
    if (!blocked(m.x, ny)) m.y = ny;
    if (m.hp <= 0) kill(m);
  }
  function damageGen(g, dmg) {
    g.hp -= dmg;
    burst(g.x, 0.4, g.y, 12, 1.8, 0.4, 0xd8c8a8);
    if (g.hp <= 0) {
      burst(g.x, 0.4, g.y, 60, 3, 0.7, 0xffa040);
      scene.remove(g.root);
      g.dead = true;
    }
  }
  // melee: everything inside `range` and within `arc` radians of `angle`
  function hitArc(x, y, angle, range, arc, dmg) {
    let hit = false;
    for (const m of monsters) {
      if (m.dead) continue;
      const dx = m.x - x, dy = m.y - y, d = Math.hypot(dx, dy);
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dy) - angle), Math.cos(Math.atan2(dx, dy) - angle)));
      if (d < range && (off < arc || d < 0.45)) { damage(m, dmg, x, y); hit = true; }
    }
    for (const g of generators) {
      if (g.dead) continue;
      const dx = g.x - x, dy = g.y - y;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dy) - angle), Math.cos(Math.atan2(dx, dy) - angle)));
      if (Math.hypot(dx, dy) < range + 0.3 && off < arc) { damageGen(g, dmg); hit = true; }
    }
    for (const t of targets) {
      if (t.dead) continue;
      const dx = t.x - x, dy = t.y - y, d = Math.hypot(dx, dy);
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dy) - angle), Math.cos(Math.atan2(dx, dy) - angle)));
      // big bodies: the blow only has to reach their edge
      if (d < range + t.r * 0.8 && (off < arc + 0.3 || d < t.r + 0.3) && t.hit(dmg, x, y)) hit = true;
    }
    return hit;
  }
  // shots: first monster or generator within r; bolts also splash
  function hitAt(x, y, r, dmg, splash = 0) {
    const m = monsters.find(k => !k.dead && Math.hypot(k.x - x, k.y - y) < r + 0.15);
    const g = !m && generators.find(k => !k.dead && Math.hypot(k.x - x, k.y - y) < r + 0.35);
    if (!m && !g) {
      const t = targets.find(k => !k.dead && Math.hypot(k.x - x, k.y - y) < r + k.r * 0.85);
      return !!t && t.hit(dmg, x, y);
    }
    if (m) damage(m, dmg, x - (m.x - x), y - (m.y - y));
    if (g) damageGen(g, dmg);
    if (splash) for (const k of monsters) if (!k.dead && k !== m && Math.hypot(k.x - x, k.y - y) < splash) damage(k, dmg * 0.5, x, y);
    return true;
  }

  // ---------------------------------------------------------------- update
  const dir = new THREE.Vector2();
  function update(dt, time, hx, hy) {
    for (let i = monsters.length - 1; i >= 0; i--) if (monsters[i].dead) monsters.splice(i, 1);

    // generators keep the dungeon busy while the hero is around
    for (const g of generators) {
      if (g.dead) continue;
      if (Math.hypot(g.x - hx, g.y - hy) > 12 || monsters.length >= MAX_ALIVE) continue;
      g.t -= dt;
      if (g.t > 0) continue;
      g.t = 5 + Math.random() * 4;
      const near = monsters.filter(m => Math.hypot(m.x - g.x, m.y - g.y) < 3).length;
      if (near >= 3) continue;
      for (const [ox, oy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]]) {
        if (blocked(g.x + ox, g.y + oy)) continue;
        const m = spawn(g.type, g.tier, g.x + ox, g.y + oy);
        m.root.scale.multiplyScalar(0.01);
        burst(m.x, 0.3, m.y, 14, 1.4, 0.5, TYPES[g.type].color);
        break;
      }
    }

    for (const m of monsters) {
      const T = TYPES[m.type];
      const dx = hx - m.x, dy = hy - m.y, d = Math.hypot(dx, dy);
      const far = d > 16;
      m.root.visible = !far;
      if (m.glow) m.glow.visible = !far;
      if (far) continue;
      m.cd -= dt;
      let moving = false;
      if (m.atkT > 0) {
        m.atkT -= dt;
        const dur = m.acts.Attack.getClip().duration;
        if (!m.fired && m.atkT < dur * 0.5) {
          m.fired = true;
          const want = Math.atan2(dx, dy);
          if (T.shot) fire(T.shot, m.x, m.y, dir.set(Math.sin(want), Math.cos(want)), 'enemy', d);
          else if (d < T.reach + 0.35) onHeroHit(m.type, m.x, m.y);
        }
        if (m.atkT <= 0) play(m, 'Idle', 0.15);
      } else if (d < 8) {
        const inReach = T.reach && d < T.reach;
        const canShoot = T.shot && d < T.range && d > 1.3;
        if ((inReach || canShoot) && m.cd <= 0) {
          m.atkT = m.acts.Attack.getClip().duration;
          m.fired = false;
          m.cd = (T.shot ? 2.2 : 1.3) + Math.random() * 0.8;
          play(m, 'Attack', 0.08);
        } else if (!inReach && !(T.keepAway && d < T.keepAway) && !(T.shot && !T.reach && d < T.range * 0.8)) {
          // chase, keeping a little room between monsters
          let vx = dx / d, vy = dy / d;
          for (const o of monsters) {
            if (o === m || o.dead) continue;
            const ox = m.x - o.x, oy = m.y - o.y, od = Math.hypot(ox, oy);
            if (od < 0.6 && od > 0.001) { vx += ox / od * (0.6 - od) * 3; vy += oy / od * (0.6 - od) * 3; }
          }
          const vl = Math.hypot(vx, vy) || 1, sp = m.speed * dt;
          const nx = m.x + vx / vl * sp, ny = m.y + vy / vl * sp;
          if (!blocked(nx, m.y)) m.x = nx;
          if (!blocked(m.x, ny)) m.y = ny;
          moving = true;
        } else if (T.keepAway && d < T.keepAway) {
          const nx = m.x - dx / d * m.speed * dt, ny = m.y - dy / d * m.speed * dt;
          if (!blocked(nx, m.y)) m.x = nx;
          if (!blocked(m.x, ny)) m.y = ny;
          moving = true;
        }
      }
      if (m.atkT <= 0) play(m, moving ? 'Walk' : 'Idle');
      if (m.acts.Walk) m.acts.Walk.timeScale = Math.max(0.7, m.speed / 1.2);
      // face the hero when close, else the way it walks
      if (d < 8) {
        const want = Math.atan2(dx, dy);
        m.angle += Math.atan2(Math.sin(want - m.angle), Math.cos(want - m.angle)) * Math.min(1, dt * 8);
      }
      m.root.position.set(m.x, 0, m.y);
      m.root.rotation.y = m.angle;
      if (m.spawnT > 0) {  // grow out of the generator
        m.spawnT -= dt;
        m.root.scale.setScalar(TYPES[m.type].scale * (0.85 + 0.1 * m.tier) * (1 - Math.max(0, m.spawnT) / 0.4));
      }
      if (m.glow) { m.glow.position.set(m.x, 0.6, m.y); m.glow.material.opacity = 0.55 + 0.15 * Math.sin(time * 5 + m.ph); }
      // hit flash and the sorcerer's blinking invisibility
      if (m.flash > 0) m.flash -= dt;
      const hidden = T.blink && Math.sin(time * 0.9 + m.ph) > 0.55 && m.atkT <= 0;
      for (const mt of m.mats) {
        if (m.flash > 0) { mt.emissive.setRGB(1, 1, 1); mt.emissiveIntensity = 0.9; }
        else { mt.emissive.copy(mt.userData.emissive); mt.emissiveIntensity = mt.userData.ei; }
        if (T.blink) mt.opacity = THREE.MathUtils.lerp(mt.opacity, hidden ? 0.08 : mt.userData.opacity, Math.min(1, dt * 5));
      }
      m.mixer.update(dt);
    }
  }

  return { ready, update, hitArc, hitAt, monsters, generators, targets, get kills() { return kills; }, spawn, kill };
}

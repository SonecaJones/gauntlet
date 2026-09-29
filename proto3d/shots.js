// Projectiles and hit sparks for the HD-2D prototype.
//   hero shots:  bolt (wizard, with its own light), arrow (elf)
//   enemy shots: fireball (demon), rock (lobber, arcs), magic (sorcerer)
import * as THREE from 'three';

const KINDS = {
  bolt: { speed: 8, life: 1.2, y: 0.72, color: 0x7fd8ff, trail: 3, pop: 50, popSpeed: 3.2, hitR: 0.45, dmg: 40, splash: 1.0 },
  arrow: { speed: 13, life: 0.9, y: 0.6, color: 0xffe2a0, trail: 0, pop: 14, popSpeed: 1.6, hitR: 0.4, dmg: 26 },
  fireball: { speed: 5.5, life: 1.6, y: 0.62, color: 0xff7a2a, trail: 2, pop: 26, popSpeed: 2.2, hitR: 0.4 },
  rock: { speed: 4.2, life: 2.0, y: 0.5, color: 0xb0a898, trail: 0, pop: 12, popSpeed: 1.4, hitR: 0.4, gravity: 9 },
  magic: { speed: 6.5, life: 1.4, y: 0.7, color: 0x7dfcff, trail: 2, pop: 20, popSpeed: 2.0, hitR: 0.4 },
};

export function createShots({ scene, solid, glowTex }) {
  // sparks: additive points with a colour per particle
  const N = 400;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowTex, size: 0.08, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  }));
  points.frustumCulled = false;
  scene.add(points);
  const sparks = Array.from({ length: N }, () => ({ life: 0 }));
  const tmp = new THREE.Color();
  let cursor = 0;

  function burst(x, y, z, n, speed, life = 0.4, color = 0xffffff) {
    tmp.set(color);
    for (let k = 0; k < n; k++) {
      const d = sparks[cursor]; cursor = (cursor + 1) % N;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1, r = Math.sqrt(1 - e * e) * speed * (0.4 + Math.random() * 0.6);
      d.life = life * (0.6 + Math.random() * 0.8);
      d.x = x; d.y = y; d.z = z; d.vx = Math.cos(a) * r; d.vz = Math.sin(a) * r; d.vy = e * speed * 0.6;
      d.r = tmp.r; d.g = tmp.g; d.b = tmp.b;
    }
  }

  // one light for the wizard's bolt (always in the scene: no shader rebuilds)
  const light = new THREE.PointLight(0x66ccff, 0, 5, 1.6);
  scene.add(light);
  let flash = 0;

  const meshes = {
    bolt: () => new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0xc8f2ff })),
    fireball: () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), new THREE.MeshBasicMaterial({ color: 0xffb040 })),
    magic: () => new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: 0xb8ffff })),
    rock: () => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshStandardMaterial({ color: 0x8a8278, roughness: 0.95, flatShading: true }));
      m.castShadow = true;
      return m;
    },
    arrow: () => {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.8 }));
      shaft.rotation.x = Math.PI / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), new THREE.MeshStandardMaterial({ color: 0xc8d0e0, metalness: 0.3, roughness: 0.4 }));
      tip.rotation.x = Math.PI / 2; tip.position.z = 0.34;
      g.add(shaft, tip);
      for (let i = 0; i < 3; i++) {
        const vane = new THREE.Group();
        vane.rotation.z = i * Math.PI * 2 / 3;
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.1), new THREE.MeshStandardMaterial({ color: 0xd8261c, side: THREE.DoubleSide }));
        f.rotation.x = Math.PI / 2; f.position.set(0.02, 0, -0.25);
        vane.add(f);
        g.add(vane);
      }
      g.traverse(o => { o.castShadow = true; });
      return g;
    },
  };
  const pool = [];   // inactive shots, reused by kind
  const live = [];

  // dir: unit Vector2 on the floor plane (x, z). Rocks are lobbed to `dist`.
  function fire(kind, x, z, dir, owner, dist = 4) {
    const K = KINDS[kind];
    let s = pool.findIndex(p => p.kind === kind);
    s = s >= 0 ? pool.splice(s, 1)[0] : { kind, obj: meshes[kind]() };
    if (!s.obj.parent) scene.add(s.obj);
    s.obj.visible = true;
    s.owner = owner;
    s.x = x + dir.x * 0.45; s.z = z + dir.y * 0.45; s.y = K.y;
    s.vx = dir.x * K.speed; s.vz = dir.y * K.speed; s.vy = 0;
    s.life = K.life;
    if (K.gravity) {  // lob: flight time to reach the target, then the needed upward speed
      const t = Math.max(0.35, dist / K.speed);
      s.vy = (K.gravity * t) / 2 - K.y / t;
      s.life = t + 0.2;
    }
    s.obj.rotation.set(0, Math.atan2(dir.x, dir.y), 0);
    if (kind === 'bolt' || kind === 'magic' || kind === 'fireball') burst(s.x, s.y, s.z, 12, 1.4, 0.3, K.color);
    live.push(s);
  }

  function pop(s) {
    const K = KINDS[s.kind];
    burst(s.x, s.y, s.z, K.pop, K.popSpeed, 0.4, K.color);
    if (s.kind === 'bolt') flash = 0.3;
    s.obj.visible = false;
    pool.push(s);
  }

  // hitHero(x, z, r) -> bool, hitMonsters(x, z, r, dmg, splash) -> bool
  function update(dt, time, { hitHero, hitMonsters }) {
    let boltOn = null;
    for (let i = live.length - 1; i >= 0; i--) {
      const s = live[i], K = KINDS[s.kind];
      s.life -= dt;
      s.x += s.vx * dt; s.z += s.vz * dt;
      if (K.gravity) { s.vy -= K.gravity * dt; s.y += s.vy * dt; s.obj.rotation.x += dt * 9; }
      s.obj.position.set(s.x, s.y, s.z);
      if (s.kind === 'bolt') { s.obj.scale.setScalar(1 + 0.25 * Math.sin(time * 45)); boltOn = s; }
      if (s.kind === 'fireball' || s.kind === 'magic') { s.obj.scale.setScalar(1 + 0.3 * Math.sin(time * 38 + i)); s.obj.rotation.y += dt * 6; }
      if (K.trail) burst(s.x, s.y, s.z, K.trail, 0.5, 0.35, K.color);
      let done = s.life <= 0 || solid(Math.floor(s.x), Math.floor(s.z)) || (K.gravity && s.y <= 0.05);
      if (!done && s.owner === 'hero') done = hitMonsters(s.x, s.z, K.hitR, K.dmg, K.splash || 0);
      if (!done && s.owner === 'enemy' && s.y < 1.1) done = hitHero(s.x, s.z, K.hitR, s.kind);
      if (done) { live.splice(i, 1); pop(s); }
    }
    if (boltOn) { light.position.copy(boltOn.obj.position); light.intensity = 7; }
    else if (flash > 0) { flash -= dt; light.intensity = Math.max(0, flash / 0.3) * 14; }
    else light.intensity = 0;

    for (let i = 0; i < N; i++) {
      const d = sparks[i];
      if (d.life > 0) { d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.vx *= 0.94; d.vy *= 0.94; d.vz *= 0.94; }
      const ok = d.life > 0 && Number.isFinite(d.x);
      pos[i * 3] = ok ? d.x : 0; pos[i * 3 + 1] = ok ? d.y : -10; pos[i * 3 + 2] = ok ? d.z : 0;
      if (ok) { col[i * 3] = d.r; col[i * 3 + 1] = d.g; col[i * 3 + 2] = d.b; }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return { fire, update, burst, live, KINDS };
}

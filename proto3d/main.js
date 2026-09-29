import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { generateLevel } from '../src/level.js';
import { T } from '../src/constants.js';
import { drawItem } from '../src/render.js';
import { warrior, pixelize } from './sprite32.js';
import { createShots } from './shots.js';
import { createMonsters } from './monsters.js';
import { createBoss, BOSS_KINDS, bossName } from './bosses.js';

// ------------------------------------------------------------------ level
// ?chefe=dragon|lich|golem loads that boss's arena (levels 5, 10 and 15)
const bossKind = BOSS_KINDS.includes(new URLSearchParams(location.search).get('chefe')) ? new URLSearchParams(location.search).get('chefe') : null;
const L = generateLevel(bossKind ? 5 * (BOSS_KINDS.indexOf(bossKind) + 1) : 3, 20260929, 1);
const { W, H, tiles } = L;
const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.WALL : tiles[y * W + x]);
const solid = (x, y) => { const t = tileAt(x, y); return t === T.WALL || t === T.DOOR; };
const WALL_H = 1.25;

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06030c);
scene.fog = new THREE.FogExp2(0x0c0818, 0.045);
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 120);

// ------------------------------------------------------------------ pixel textures
function hash(x, y, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function tex(canvas, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function canvas(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  return c;
}
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

const brickTex = tex(canvas(32, 32, (g) => {
  g.fillStyle = '#1a1422'; g.fillRect(0, 0, 32, 32);
  for (let r = 0; r < 4; r++) {
    const off = r % 2 ? 8 : 0;
    for (let b = -1; b < 2; b++) {
      const x = b * 16 + off, y = r * 8, v = 0.8 + hash(b + 3, r, 7) * 0.4;
      g.fillStyle = shade('#5e5474', v); g.fillRect(x + 1, y + 1, 15, 7);
      g.fillStyle = shade('#7a6e94', v); g.fillRect(x + 1, y + 1, 15, 1);
      g.fillStyle = shade('#3e3652', v); g.fillRect(x + 1, y + 7, 15, 1);
      for (let k = 0; k < 3; k++) { g.fillStyle = shade('#4a4260', v); g.fillRect(x + 2 + Math.floor(hash(b, r, k) * 12), y + 2 + Math.floor(hash(r, b, k) * 4), 2, 1); }
    }
  }
}));
const topTex = tex(canvas(32, 32, (g) => {
  g.fillStyle = '#2a2438'; g.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 40; i++) { g.fillStyle = hash(i, 1) > 0.5 ? '#332c44' : '#221c2e'; g.fillRect(Math.floor(hash(i, 2) * 31), Math.floor(hash(i, 3) * 31), 2, 2); }
  g.fillStyle = '#3c3450'; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
}));
const woodTex = tex(canvas(32, 32, (g) => {
  g.fillStyle = '#3a2412'; g.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#7a5030' : '#6a4426'; g.fillRect(1 + i * 8, 1, 6, 30); }
  g.fillStyle = '#2c2c36'; g.fillRect(0, 6, 32, 3); g.fillRect(0, 23, 32, 3);
  g.fillStyle = '#e2b340'; g.fillRect(13, 13, 6, 6); g.fillStyle = '#111'; g.fillRect(15, 15, 2, 3);
}));
const PX = 32;
const floorCanvas = canvas(W * PX, H * PX, (g) => {
  g.fillStyle = '#07040c'; g.fillRect(0, 0, W * PX, H * PX);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tileAt(x, y);
    if (t === T.WALL) continue;
    const px = x * PX, py = y * PX, v = 0.85 + hash(x, y) * 0.3;
    g.fillStyle = shade((x + y) & 1 ? '#3c3450' : '#433a58', v); g.fillRect(px, py, PX, PX);
    g.fillStyle = '#1e1828'; g.fillRect(px, py, PX, 1); g.fillRect(px, py, 1, PX);
    g.fillStyle = shade('#524870', v); g.fillRect(px + 1, py + 1, PX - 2, 1);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = hash(x, y, k) > 0.5 ? shade('#4a4264', v) : shade('#2e2840', v);
      g.fillRect(px + 2 + Math.floor(hash(x, y, k + 9) * 27), py + 2 + Math.floor(hash(x, y, k + 19) * 27), 2, 2);
    }
    if (hash(x, y, 40) > 0.86) {
      g.strokeStyle = '#231c30'; g.lineWidth = 1; g.beginPath();
      g.moveTo(px + 6, py + 8); g.lineTo(px + 13, py + 15); g.lineTo(px + 11, py + 22); g.lineTo(px + 20, py + 27); g.stroke();
    }
    if (t === T.EXIT) drawExit(g, px, py);
  }
});
// stairs down; in a boss arena they only open once the boss falls
function drawExit(g, px, py) {
  g.fillStyle = '#07040c'; g.fillRect(px + 3, py + 3, PX - 6, PX - 6);
  for (let i = 0; i < 4; i++) { g.fillStyle = `rgb(${90 - i * 18},${76 - i * 15},${110 - i * 20})`; g.fillRect(px + 5 + i * 2, py + 5 + i * 6, PX - 10 - i * 4, 4); }
}
let exitOpen = !L.bossExitHidden;
function openExit() {
  drawExit(floorCanvas.getContext('2d'), L.exit.x * PX, L.exit.y * PX);
  floor.material.map.needsUpdate = true;
  exitOpen = true;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex(floorCanvas), roughness: 0.92, metalness: 0 }));
floor.rotation.x = -Math.PI / 2;
floor.position.set(W / 2, 0, H / 2);
floor.receiveShadow = true;
scene.add(floor);

// walls: only the ones touching a walkable tile
const wallTiles = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (tileAt(x, y) !== T.WALL) continue;
  let edge = false;
  for (let oy = -1; oy <= 1 && !edge; oy++) for (let ox = -1; ox <= 1; ox++) if (tileAt(x + ox, y + oy) !== T.WALL) { edge = true; break; }
  if (edge) wallTiles.push([x, y]);
}
const sideMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.95 });
const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 1 });
const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
const walls = new THREE.InstancedMesh(wallGeo, [sideMat, sideMat, topMat, topMat, sideMat, sideMat], wallTiles.length);
walls.castShadow = walls.receiveShadow = true;
// Walls standing between the camera and the hero turn see-through (they
// used to drop to a stub, which made the room layout hard to read).
const ghostMat = m => { const c = m.clone(); c.transparent = true; c.opacity = 0.28; c.depthWrite = false; return c; };
const wallsSeeThrough = new THREE.InstancedMesh(wallGeo, [sideMat, sideMat, topMat, topMat, sideMat, sideMat].map(ghostMat), wallTiles.length);
wallsSeeThrough.renderOrder = 2;
scene.add(walls, wallsSeeThrough);
const m4 = new THREE.Matrix4();
const wallFaded = new Uint8Array(wallTiles.length).fill(255);
function cutaway(hx, hy) {
  let dirty = false;
  const faded = wallTiles.map(([x, y], i) => {
    const dx = x + 0.5 - hx, dy = y + 0.5 - hy;
    const f = dy > 0.2 && dy < 3.5 && Math.abs(dx) < 1.6 + dy * 0.5 ? 1 : 0;
    if (f !== wallFaded[i]) dirty = true;
    return f;
  });
  if (!dirty) return;
  wallFaded.set(faded);
  let a = 0, b = 0;
  wallTiles.forEach(([x, y], i) => {
    m4.makeTranslation(x + 0.5, WALL_H / 2, y + 0.5);
    if (faded[i]) wallsSeeThrough.setMatrixAt(b++, m4); else walls.setMatrixAt(a++, m4);
  });
  walls.count = a; wallsSeeThrough.count = b;
  walls.instanceMatrix.needsUpdate = wallsSeeThrough.instanceMatrix.needsUpdate = true;
}

// doors
const doorMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 });
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (tileAt(x, y) !== T.DOOR) continue;
  const horiz = tileAt(x - 1, y) === T.DOOR || tileAt(x + 1, y) === T.DOOR || tileAt(x - 1, y) === T.WALL;
  const d = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 1 : 0.3, 1.05, horiz ? 0.3 : 1), doorMat);
  d.position.set(x + 0.5, 0.525, y + 0.5);
  d.castShadow = d.receiveShadow = true;
  scene.add(d);
}

// exit glow
const exitLight = new THREE.PointLight(0xffd35a, 8, 5, 1.5);
exitLight.position.set(L.exit.x + 0.5, 0.5, L.exit.y + 0.5);
scene.add(exitLight);

scene.add(new THREE.HemisphereLight(0x8070c0, 0x2a1830, 1.6));

// ------------------------------------------------------------------ glow sprites & torches
const glowTex = tex(canvas(32, 32, (g) => {
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,220,140,0.8)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
}));
glowTex.magFilter = THREE.LinearFilter;
const flameMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a40, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

const torches = L.torches.map(t => {
  const pos = new THREE.Vector3(t.x + 0.5, 0.95, t.y + 1.06);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.12), new THREE.MeshStandardMaterial({ color: 0x3a2618 }));
  bracket.position.set(pos.x, pos.y - 0.12, pos.z - 0.02);
  scene.add(bracket);
  const flame = new THREE.Sprite(flameMat);
  flame.position.copy(pos);
  flame.scale.setScalar(0.42);
  scene.add(flame);
  return { pos, flame, ph: Math.random() * 10 };
});

// A fixed pool of lights follows the torches nearest to the hero, so the
// shader never recompiles and phones only pay for a handful of lights.
const POOL = 6, SHADOWED = 2;
const torchLights = [];
for (let i = 0; i < POOL; i++) {
  const l = new THREE.PointLight(0xff8a3a, 0, 8.5, 1.5);
  if (i < SHADOWED) {
    l.castShadow = true;
    l.shadow.mapSize.set(256, 256);
    l.shadow.bias = -0.004;
    l.shadow.camera.near = 0.1;
  }
  scene.add(l);
  torchLights.push(l);
}

// ------------------------------------------------------------------ sprites
function spriteMesh(canvasEl, width, opts = {}) {
  const map = tex(canvasEl);
  const h = width * canvasEl.height / canvasEl.width;
  const geo = new THREE.PlaneGeometry(width, h);
  geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, metalness: 0, transparent: !!opts.opacity, opacity: opts.opacity ?? 1, emissive: opts.emissive ?? 0x000000, emissiveMap: opts.emissive ? map : null, emissiveIntensity: opts.emissiveIntensity ?? 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = 0.3;
  mesh.castShadow = !opts.noShadow;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ map, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
  mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial({ map, alphaTest: 0.5 });
  scene.add(mesh);
  return mesh;
}
function vectorSprite(size, draw) {
  return canvas(size, size, (g) => { g.imageSmoothingEnabled = false; draw(g); });
}

// hero: procedural 32-bit warrior with a 4-frame walk
const heroFrames = [0, 1, 2, 3].map(f => tex(pixelize(warrior(f))));
const hero = spriteMesh(pixelize(warrior(0)), 0.92);
hero.material.map = heroFrames[0];
const heroPos = new THREE.Vector2(L.start.x + 0.5, L.start.y + 0.5);
const heroLight = new THREE.PointLight(0xffe2b0, 5, 9, 1.4);
heroLight.castShadow = true;
heroLight.shadow.mapSize.set(512, 512);
heroLight.shadow.bias = -0.003;
scene.add(heroLight);

// 3D heroes (Blender low-poly models with Idle / Walk / Run / Attack).
// Both share the same rig, so the same layer logic drives either one.
let dbg = null;
let model = null, mixer = null, attackT = 0, modelAngle = 0, lean = 0;
let view = '3d';
// Two animation layers: legs (root, hips, legs) and upper body (spine, arms,
// head, cape), so the hero can swing the weapon while running.
const UPPER = ['chest', 'head', 'cape', 'arm_upper_L', 'arm_lower_L', 'arm_upper_R', 'arm_lower_R', 'nock', 'arrow'];
const isUpper = tr => UPPER.some(b => tr.name.startsWith(b + '.'));
const HEROES = { warrior: { label: 'Guerreiro' }, valkyrie: { label: 'Valquíria' }, wizard: { label: 'Mago', shot: 'bolt' }, elf: { label: 'Elfo', shot: 'arrow' } };
let heroName = 'warrior', acts = {}, layers = { L: null, U: null };
// models are base64 ES modules (see tools/embed-glb.mjs)
function loadModel(name) {
  return import(`./models/${name}.glb.js`).then(({ default: b64 }) => new Promise((ok, fail) => {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    new GLTFLoader().parse(bin, '', ok, fail);
  }));
}
for (const name of Object.keys(HEROES)) loadModel(name).then(gltf => onModel(name, gltf), err => console.error('model', name, err));
function onModel(name, gltf) {
  const h = HEROES[name];
  h.model = gltf.scene;
  h.model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    for (const m of [].concat(o.material)) {
      m.flatShading = true;
      // no environment map in this scene, so keep metals mostly diffuse
      if (m.metalness > 0.5) { m.metalness = 0.35; m.roughness = Math.max(m.roughness, 0.45); }
      m.needsUpdate = true;
    }
  });
  h.model.scale.setScalar(0.95);
  h.model.visible = false;
  scene.add(h.model);
  h.mixer = new THREE.AnimationMixer(h.model);
  h.acts = {};
  h.layers = { L: null, U: null };
  for (const clip of gltf.animations) {
    for (const [layer, keep] of [['L', t => !isUpper(t)], ['U', isUpper]]) {
      const a = h.mixer.clipAction(new THREE.AnimationClip(`${clip.name}:${layer}`, clip.duration, clip.tracks.filter(keep)));
      if (clip.name === 'Attack') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      h.acts[`${clip.name}:${layer}`] = a;
    }
  }
  const prev = [acts, layers];
  acts = h.acts; layers = h.layers;
  setLayer('L', 'Idle'); setLayer('U', 'Idle');
  [acts, layers] = prev;
  if (name === heroName) useHero(name);
  rendered = 0;
}
function useHero(name) {
  const h = HEROES[name];
  heroName = name;
  if (model) model.visible = false;
  if (!h.model) { model = null; applyView(); return; }
  ({ model, mixer, acts, layers } = h);
  attackT = 0;
  applyView();
}
function nextHero() {
  const names = Object.keys(HEROES);
  useHero(names[(names.indexOf(heroName) + 1) % names.length]);
}
function setLayer(layer, name, fade = 0.2) {
  const a = acts[`${name}:${layer}`], cur = layers[layer];
  if (!a || cur === a) return;
  a.reset().play();
  // keep feet in step when the upper body changes
  const other = layers[layer === 'L' ? 'U' : 'L'];
  if (other && other.getClip().name.split(':')[0] === name) a.time = other.time;
  if (cur) cur.crossFadeTo(a, fade, false);
  layers[layer] = a;
}
function attack() {
  if (!acts['Attack:U'] || attackT > 0) return;
  attackT = acts['Attack:U'].getClip().duration;
  layers.U = null;
  setLayer('U', 'Attack', 0.06);
  // the wizard's bolt leaves as the staff swings forward, the elf's arrow on
  // release; the warrior's and valkyrie's blows land mid-swing
  const shot = HEROES[heroName].shot;
  if (shot) { shotKind = shot; shotDelay = attackT * 0.5; } else meleeDelay = attackT * 0.45;
}
function applyView() {
  hero.visible = view === 'sprite' || !model;
  if (model) model.visible = view === '3d';
  const b = document.getElementById('toggle');
  if (b) b.textContent = view === '3d' ? 'Ver: Modelo 3D  ⇄' : 'Ver: Sprite 32 bits  ⇄';
  const hb = document.getElementById('hero');
  if (hb) hb.textContent = `Herói: ${HEROES[heroName].label}  ⇄`;
}
document.getElementById('hero')?.addEventListener('click', () => { nextHero(); lastInput = performance.now(); });
document.getElementById('toggle')?.addEventListener('click', () => { view = view === '3d' ? 'sprite' : '3d'; applyView(); lastInput = performance.now(); });
document.getElementById('atk')?.addEventListener('click', () => { attack(); lastInput = performance.now(); });
// B / button: masmorra → Dragão → Necromante → Golem → masmorra (reloads the level)
function nextArena() {
  const next = [null, ...BOSS_KINDS][([null, ...BOSS_KINDS].indexOf(bossKind) + 1) % (BOSS_KINDS.length + 1)];
  location.search = next ? `?chefe=${next}` : '';
}
const arenaBtn = document.getElementById('arena');
if (arenaBtn) {
  arenaBtn.textContent = `Arena: ${bossKind ? bossName(bossKind) : 'masmorra'}  ⇄`;
  arenaBtn.addEventListener('click', nextArena);
}

// loot from the real level (monsters and generators live in monsters.js)
const actors = [];
const glowItems = [];
for (const it of L.items) {
  const c = vectorSprite(28, g => { g.translate(14, 16); drawItem(g, { kind: it.kind, sub: it.sub, x: 0, y: 0, bob: 0 }, 0); });
  const shiny = it.kind === 'potion' || it.kind === 'amulet' || it.kind === 'key' || it.kind === 'chest';
  const m = spriteMesh(c, 0.62, shiny ? { emissive: 0xffffff, emissiveIntensity: 0.35 } : {});
  actors.push({ m, x: it.x + 0.5, y: it.y + 0.5, kind: 'item', ph: Math.random() * 6 });
  if (shiny) glowItems.push({ x: it.x + 0.5, y: it.y + 0.5, color: it.kind === 'potion' ? 0x3aa8ff : 0xffd35a });
}

// ------------------------------------------------------------------ particles
function particles(n, color, size) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ map: glowTex, color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  scene.add(p);
  return { p, n, data: Array.from({ length: n }, () => ({ life: 0 })) };
}
const embers = particles(160, 0xff8a3a, 0.09);
const dust = particles(120, 0x9a8ac8, 0.05);

// projectiles and sparks, monsters and generators
const shots = createShots({ scene, solid, glowTex });
let shotKind = null, shotDelay = 0, meleeDelay = 0, shake = 0, hurt = 0, hurtCd = 0;
const knock = new THREE.Vector2();
function heroHit(type, x, y, force = 0) {
  // the hero can't die in this prototype: just sparks, a shake and a counter
  // (breath puffs arrive in streams, so they count once per moment)
  if (force) knock.set(heroPos.x - x, heroPos.y - y).normalize().multiplyScalar(force);
  if (hurtCd > 0) return;
  hurtCd = 0.25;
  shots.burst(heroPos.x, 0.6, heroPos.y, 18, 2, 0.35, 0xff3030);
  shake = Math.max(shake, 0.18);
  hurt++;
}
const monsters = createMonsters({
  scene, level: L, loadModel, blocked: (x, y) => blocked(x, y), burst: shots.burst, glowTex,
  fire: (kind, x, y, dir, owner, dist) => shots.fire(kind, x, y, dir, owner, dist), onHeroHit: heroHit,
});
monsters.ready.then(() => { rendered = 0; });
// the arena's boss (only on boss levels)
const bossFight = L.boss && createBoss({
  scene, level: L, loadModel, solid, heroBlocked: (x, y) => blocked(x, y), shots, monsters, onHeroHit: heroHit,
  onShake: s => { shake = Math.max(shake, s); },
  onDefeat: () => { openExit(); victory = time; },
});
bossFight?.ready.then(() => { rendered = 0; }, err => console.error('boss', err));
let victory = 0;
const aim = new THREE.Vector2();
function updateCombat(dt) {
  if (shotDelay > 0 && (shotDelay -= dt) <= 0 && model) shots.fire(shotKind, heroPos.x, heroPos.y, aim.set(Math.sin(modelAngle), Math.cos(modelAngle)), 'hero');
  if (meleeDelay > 0 && (meleeDelay -= dt) <= 0 && model) monsters.hitArc(heroPos.x, heroPos.y, modelAngle, 1.35, 1.1, heroName === 'warrior' ? 40 : 32);
  hurtCd -= dt;
  monsters.update(dt, time, heroPos.x, heroPos.y);
  bossFight?.update(dt, time, heroPos);
  shots.update(dt, time, {
    hitHero: (x, z, r, kind) => {
      if (Math.hypot(x - heroPos.x, z - heroPos.y) > r + 0.2) return false;
      heroHit(kind, x, z, kind === 'meteor' || kind === 'boulder' ? 6 : 0);
      return true;
    },
    hitMonsters: (x, z, r, dmg, splash) => monsters.hitAt(x, z, r, dmg, splash),
    target: heroPos,
    onLand: () => { shake = Math.max(shake, 0.25); },
  });
  // knockback slides the hero, stopping at walls
  if (knock.lengthSq() > 0.01) {
    const nx = heroPos.x + knock.x * dt, ny = heroPos.y + knock.y * dt;
    if (!blocked(nx, heroPos.y)) heroPos.x = nx;
    if (!blocked(heroPos.x, ny)) heroPos.y = ny;
    knock.multiplyScalar(Math.pow(0.004, dt));
  } else knock.set(0, 0);
}

// ------------------------------------------------------------------ post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.5, 0.88);
composer.addPass(bloom);
const tilt = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(innerWidth, innerHeight) }, focus: { value: 0.47 }, amount: { value: 3.2 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 res; uniform float focus; uniform float amount; varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - focus);
      float blur = smoothstep(0.16, 0.5, d) * amount;
      vec4 c = vec4(0.0); float tot = 0.0;
      for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {
        float w = exp(-float(i * i + j * j) / 8.0);
        c += texture2D(tDiffuse, vUv + vec2(float(j), float(i)) * blur / res) * w; tot += w;
      }
      c /= tot;
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - dot(q, q) * 1.1;
      c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 0.98, 1.08), 0.5);
      gl_FragColor = c;
    }`,
});
composer.addPass(tilt);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ input
const keys = new Set();
addEventListener('keydown', e => { keys.add(e.code); lastInput = performance.now(); if (e.code === 'Space') attack(); if (e.code === 'KeyH') nextHero(); if (e.code === 'KeyB') nextArena(); if (e.code === 'KeyT') { view = view === '3d' ? 'sprite' : '3d'; applyView(); } });
addEventListener('keyup', e => keys.delete(e.code));
let stick = null, lastInput = -1e9;
renderer.domElement.addEventListener('pointerdown', e => { stick = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY }; lastInput = performance.now(); });
addEventListener('pointermove', e => { if (stick && e.pointerId === stick.id) { stick.x = e.clientX; stick.y = e.clientY; lastInput = performance.now(); } });
addEventListener('pointerup', e => { if (stick && e.pointerId === stick.id) stick = null; });

// demo walk: BFS path from the start to the exit
function pathTo(sx, sy, tx, ty) {
  const prev = new Int32Array(W * H).fill(-1), q = [sy * W + sx];
  prev[q[0]] = q[0];
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * W + nx;
      if (tileAt(nx, ny) === T.WALL || prev[n] >= 0) continue;
      prev[n] = i; q.push(n);
    }
  }
  const out = [];
  for (let i = ty * W + tx; prev[i] >= 0 && prev[i] !== i; i = prev[i]) out.push([(i % W) + 0.5, ((i / W) | 0) + 0.5]);
  return out.reverse();
}
const demoPath = pathTo(L.start.x, L.start.y, L.exit.x, L.exit.y);
let demoIdx = 0;

function blocked(x, y) {
  const r = 0.28;
  return solid(Math.floor(x - r), Math.floor(y - r)) || solid(Math.floor(x + r), Math.floor(y - r)) || solid(Math.floor(x - r), Math.floor(y + r)) || solid(Math.floor(x + r), Math.floor(y + r));
}

// ------------------------------------------------------------------ loop
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let rendered = 0, last = performance.now(), walk = 0, facingLeft = false, frames = 0, fpsT = 0, time = 0, zoom = 1;
const fpsEl = document.getElementById('fps');
function tick(now) {
  const dt = Math.max(0, Math.min(0.05, ((now || performance.now()) - last) / 1000));
  last = now || performance.now(); time += dt;

  let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (stick) { mx = (stick.x - stick.sx) / 50; my = (stick.y - stick.sy) / 50; }
  if (keys.size || stick) lastInput = Math.max(lastInput, performance.now());   // holding input is input
  const demo = now - lastInput > 3000 && demoPath.length;
  // in the demo the hero duels an awake boss: keeps its range, circles, strikes
  const bb = bossFight?.boss;
  const duel = demo && bb && bb.awake && !bb.dead && Math.hypot(bb.x - heroPos.x, bb.y - heroPos.y) < 9;
  if (duel) {
    const dx = bb.x - heroPos.x, dy = bb.y - heroPos.y, d = Math.hypot(dx, dy) || 1;
    const want = HEROES[heroName].shot ? 4.5 : bb.r + 0.9;
    mx = dx / d * (d - want) - dy / d * 0.7; my = dy / d * (d - want) + dx / d * 0.7;
  } else if (demo) {
    const [tx, ty] = demoPath[demoIdx % demoPath.length];
    mx = tx - heroPos.x; my = ty - heroPos.y;
    if (Math.hypot(mx, my) < 0.15) demoIdx = (demoIdx + 1) % demoPath.length;
    if (demoIdx === 0 && Math.hypot(mx, my) > 3) { heroPos.set(demoPath[0][0], demoPath[0][1]); }
  }
  const len = Math.hypot(mx, my);
  const moving = len > 0.1;
  if (moving) {
    const sp = 3.2 * Math.min(1, len) / len;
    const nx = heroPos.x + mx * sp * dt, ny = heroPos.y + my * sp * dt;
    if (!blocked(nx, heroPos.y)) heroPos.x = nx;
    if (!blocked(heroPos.x, ny)) heroPos.y = ny;
    if (Math.abs(mx) > 0.2) facingLeft = mx < 0;
    walk += dt * 8;
  }
  hero.material.map = heroFrames[moving ? Math.floor(walk) % 4 : 0];
  if (model) {
    model.position.set(heroPos.x, 0, heroPos.y);
    const speed = moving ? 3.2 * Math.min(1, len) : 0;
    dbg = { speed, demo: !!demo };
    if (moving) {
      const want = Math.atan2(mx, my);
      modelAngle += Math.atan2(Math.sin(want - modelAngle), Math.cos(want - modelAngle)) * Math.min(1, dt * 14);
    }
    if (duel) modelAngle = Math.atan2(bb.x - heroPos.x, bb.y - heroPos.y);
    model.rotation.y = modelAngle;
    if (duel ? (time % 0.8) < dt : demo && (time % 5) < dt) attack();
    if (attackT > 0) { attackT -= dt; if (attackT <= 0) layers.U = null; }
    const base = speed > 2.2 ? 'Run' : speed > 0.2 ? 'Walk' : 'Idle';
    setLayer('L', base);
    if (attackT <= 0) setLayer('U', base);
    // match the stride to the ground speed so the feet don't slide
    for (const k of ['Run:L', 'Run:U']) if (acts[k]) acts[k].timeScale = Math.max(0.6, speed / 2.3);
    for (const k of ['Walk:L', 'Walk:U']) if (acts[k]) acts[k].timeScale = Math.max(0.6, speed / 1.1);
    mixer.update(dt);
  }
  hero.position.set(heroPos.x, 0, heroPos.y);
  cutaway(heroPos.x, heroPos.y);
  hero.scale.x = facingLeft ? -1 : 1;
  heroLight.position.set(heroPos.x, 2.6, heroPos.y + 1.4);

  // loot bobs in place
  for (const a of actors) {
    a.ph += dt;
    a.m.position.set(a.x, 0.04 + Math.abs(Math.sin(a.ph * 2.5)) * 0.08, a.y);
  }

  // torch light pool: nearest torches to the hero
  const near = torches.map(t => [t, (t.pos.x - heroPos.x) ** 2 + (t.pos.z - heroPos.y) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, POOL);
  torchLights.forEach((l, i) => {
    const t = near[i] && near[i][0];
    if (!t) { l.intensity = 0; return; }
    l.position.set(t.pos.x, t.pos.y + 0.1, t.pos.z + 0.25);
    l.intensity = 16 + Math.sin(time * 13 + t.ph) * 1.6 + Math.sin(time * 7.3 + t.ph * 2) * 1.1;
  });
  for (const t of torches) t.flame.scale.setScalar(0.38 + Math.sin(time * 16 + t.ph) * 0.05);
  exitLight.intensity = exitOpen ? 2.2 + Math.sin(time * 3) * 0.6 : 0;

  // embers rise from nearby torches; dust drifts around the hero
  const ep = embers.p.geometry.attributes.position.array;
  embers.data.forEach((d, i) => {
    d.life -= dt;
    if (d.life <= 0 && near.length) {
      const t = near[i % near.length][0];
      d.life = 0.8 + Math.random() * 1.2;
      d.x = t.pos.x + (Math.random() - 0.5) * 0.1; d.y = t.pos.y + 0.1; d.z = t.pos.z + (Math.random() - 0.5) * 0.1;
      d.vx = (Math.random() - 0.5) * 0.3; d.vy = 0.5 + Math.random() * 0.6; d.vz = (Math.random() - 0.5) * 0.3;
    }
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    const ok = d.life > 0 && Number.isFinite(d.x);
    ep[i * 3] = ok ? d.x : 0; ep[i * 3 + 1] = ok ? d.y : -10; ep[i * 3 + 2] = ok ? d.z : 0;
  });
  embers.p.geometry.attributes.position.needsUpdate = true;
  const dp = dust.p.geometry.attributes.position.array;
  dust.data.forEach((d, i) => {
    d.life -= dt;
    if (d.life <= 0) { d.life = 3 + Math.random() * 4; d.x = heroPos.x + (Math.random() - 0.5) * 12; d.y = Math.random() * 2; d.z = heroPos.y + (Math.random() - 0.5) * 9; d.ph = Math.random() * 6; }
    dp[i * 3] = d.x + Math.sin(time * 0.7 + d.ph) * 0.3; dp[i * 3 + 1] = d.y + Math.sin(time * 0.5 + d.ph) * 0.2; dp[i * 3 + 2] = d.z;
  });
  dust.p.geometry.attributes.position.needsUpdate = true;

  updateCombat(dt);

  // camera: 3/4 view, slightly lagging behind the hero; it pulls back and
  // centres between hero and boss during a boss fight
  const portrait = innerHeight > innerWidth;
  const fight = bb && bb.awake && !bb.dead;
  zoom += ((fight ? 1.4 : 1) - zoom) * Math.min(1, dt * 1.5);
  const fx = fight ? heroPos.x * 0.7 + bb.x * 0.3 : heroPos.x, fz = fight ? heroPos.y * 0.7 + bb.y * 0.3 : heroPos.y;
  const back = (portrait ? 8.6 : 7.6) * zoom;
  camPos.set(fx, (portrait ? 9.5 : 6.4) * zoom, fz + back);
  camera.position.lerp(camPos, 1 - Math.pow(0.02, dt));
  camLook.set(camera.position.x, 0.5, camera.position.z - back - 0.3);
  camera.lookAt(camLook);
  if (shake > 0) {
    shake -= dt;
    camera.position.x += (Math.random() - 0.5) * shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
  }

  composer.render(dt);
  // Shadow maps only exist after the first frames; rebuild the shaders once
  // so every material samples them (and its own texture) correctly.
  if (++rendered === 3) scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  frames++; fpsT += dt;
  if (fpsT > 0.5) {
    const win = victory ? ` · ${bossName(bb.kind)} derrotado! A saída abriu.` : '';
    if (fpsEl) fpsEl.textContent = `${Math.round(frames / fpsT)} fps · monstros abatidos: ${monsters.kills} · golpes recebidos: ${hurt}${win}`;
    frames = 0; fpsT = 0;
  }
  requestAnimationFrame(tick);
}
camera.position.set(heroPos.x, 6.4, heroPos.y + 7.6);
requestAnimationFrame(tick);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  tilt.uniforms.res.value.set(innerWidth, innerHeight);
});

window.proto = { boss: bossFight, dbg: () => dbg, combat: () => ({ shotDelay, meleeDelay, attackT, hurt, kills: monsters.kills }), updateCombat, useHero, heroes: HEROES, shots, monsters, layers: () => [layers.L?.getClip().name, layers.U?.getClip().name], face: a => { modelAngle = a; lastInput = performance.now() + 60000; }, get model() { return model; }, attack, setView: v => { view = v; applyView(); }, camera, renderer, scene, torchLights, heroLight, hero, heroFrames, heroPos, demoPath, setDemo: i => { demoIdx = i; heroPos.set(demoPath[i][0], demoPath[i][1]); camera.position.set(heroPos.x, 6.4, heroPos.y + 7.6); } };

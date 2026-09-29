// 3D view of the running game (three.js). It only reads the game state that
// game.js / netgame.js already keep (players, enemies, projectiles, items,
// effects, camera...) and draws it with the Blender models from
// proto3d/models, so the simulation, its speed and the online mode are
// exactly the same as in 2D. The 2D canvas stays on top for the HUD, the
// floating texts and the menus; PlayScreen falls back to the 2D renderer
// while the models load, if WebGL is missing, or when 3D is turned off.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TILE, T, PLAYER_COLORS } from './constants.js';
import { drawItem, PROJ_GLOW } from './render.js';
import { t } from './i18n.js';
import { markOccluder, addSilhouette } from './silhouette.js';

const MODEL_DIR = 'proto3d/models/';
const HERO_KEYS = ['warrior', 'valkyrie', 'wizard', 'elf'];
const ENEMY_TYPES = {
  ghost: { scale: 1.0, color: 0xcfd8ff },
  grunt: { scale: 1.05, color: 0xd09050 },
  demon: { scale: 1.0, color: 0xff5a30 },
  lobber: { scale: 1.2, color: 0x7fc050 },
  sorcerer: { scale: 1.0, color: 0xf0c040, fade: true },
  death: { scale: 1.05, color: 0x9a60ff, glow: 0x9a60ff },
};
const BOSSES = {
  dragon: { scale: 1.55, light: 0xff7a30 },
  lich: { scale: 1.45, light: 0x5aff7a, fade: true },
  golem: { scale: 1.8, light: 0xff9a40 },
};
// boss act -> [animation, loops]; the act's length comes from src/boss.js
const BOSS_ANIM = {
  dragon: { breath: ['Breath', true], tail: ['Tail', false, 0.7], meteor: ['Roar', false, 1.2] },
  lich: { nova: ['Cast', false, 0.9], orbs: ['Orbs', false, 0.6], summon: ['Summon', false, 0.8], tele: ['Idle', true] },
  golem: { windup: ['Windup', false, 0.7], charge: ['Charge', true], stun: ['Stun', true], slam: ['Slam', false, 0.9], boulder: ['Throw', false, 0.8] },
};
const HERO_SHOTS = new Set(['axe', 'sword', 'fire', 'arrow', 'storm']);
// hero models: legs and upper body animate separately (run while throwing)
const UPPER = ['chest', 'head', 'cape', 'arm_upper_L', 'arm_lower_L', 'arm_upper_R', 'arm_lower_R', 'nock', 'arrow'];
const isUpper = tr => UPPER.some(b => tr.name.startsWith(b + '.'));

const WALL_H = 1.1;
const W3 = v => v / TILE;                     // world pixels -> tiles (3D units)
const faceY = a => Math.atan2(Math.cos(a), Math.sin(a));  // 2D angle -> rotation.y
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function hash(x, y, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function canvas(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  return c;
}
const rgb = (c, k = 1) => `rgb(${c.map(v => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')})`;

export class View3D {
  constructor(app) {
    this.app = app;
    const touch = app.isTouch;
    this.low = touch;  // phones: fewer lights, no shadows, no bloom
    this.el = document.createElement('canvas');
    this.el.id = 'view3d';
    this.el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;pointer-events:none;visibility:hidden;';
    document.body.prepend(this.el);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.el, antialias: !touch, alpha: true, stencil: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.25 : 1.5));
    this.renderer.shadowMap.enabled = !this.low;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.6;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050308);
    this.scene.fog = new THREE.FogExp2(0x0a0614, 0.016);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    this.hemi = new THREE.HemisphereLight(0x8070c0, 0x2a1830, 1);
    this.scene.add(this.hemi);
    if (!this.low) {
      // the stencil buffer is what lets heroes show through walls
      this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, stencilBuffer: true }));
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 0.86);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.size = [0, 0];
    this.shown = false;
    this.ready = false;
    this.lastTime = null;

    this.glowTex = this.tex(canvas(32, 32, g => {
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    }), false);
    this.glowTex.magFilter = THREE.LinearFilter;

    this.templates = {};
    this.itemTex = new Map();
    this.pools = {};
    this.views = { players: new Map(), enemies: new Map(), gens: new Map(), shots: new Map(), items: new Map(), fx: new Map(), lobs: new Map() };
    this.dying = [];
    this.frame = 0;
    this.buildShared();
    const loader = new GLTFLoader();
    const names = [...HERO_KEYS, ...Object.keys(ENEMY_TYPES), 'gen_bones', 'gen_hut', ...Object.keys(BOSSES)];
    this.loading = Promise.all(names.map(n => loader.loadAsync(MODEL_DIR + n + '.glb').then(g => { this.prepModel(g); this.templates[n] = g; })))
      .then(() => { this.ready = true; }, err => { console.warn('3D models', err); this.failed = true; });
  }

  // ---------------------------------------------------------------- helpers
  tex(c, nearest = true) {
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    if (nearest) { tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.anisotropy = 4; }
    return tx;
  }
  prepModel(gltf) {
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = !this.low; o.receiveShadow = !this.low;
      for (const m of [].concat(o.material)) {
        m.flatShading = true;
        if (m.metalness > 0.5) { m.metalness = 0.35; m.roughness = Math.max(m.roughness, 0.45); }
        if (m.transparent) { m.depthWrite = false; o.castShadow = false; }
      }
    });
  }
  // clone a model with its own materials (hit flashes and fades touch only it)
  instance(name, fade) {
    const gltf = this.templates[name];
    const root = cloneSkinned(gltf.scene);
    const mats = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      o.material = [].concat(o.material).map(m => {
        const c = m.clone();
        c.userData.emissive = c.emissive.clone(); c.userData.ei = c.emissiveIntensity; c.userData.opacity = c.opacity;
        if (fade) c.transparent = true;
        mats.push(c);
        return c;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    return { root, mats, mixer: new THREE.AnimationMixer(root), clips: gltf.animations };
  }
  tint(v, flash, glow, opacity) {
    for (const m of v.mats) {
      if (flash) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 0.9; }
      else if (glow && m.userData.ei < 0.5) { m.emissive.set(glow[0]); m.emissiveIntensity = glow[1]; }
      else { m.emissive.copy(m.userData.emissive); m.emissiveIntensity = m.userData.ei; }
      if (opacity != null) m.opacity = m.userData.opacity * opacity;
    }
  }
  play(v, name, { once = false, dur = 0, fade = 0.2, from = 0 } = {}) {
    const a = v.acts[name];
    if (!a || (a === v.cur && !once)) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = dur ? a.getClip().duration * (1 - from) / dur : 1;
    a.time = a.getClip().duration * from;
    a.play();
    if (v.cur && v.cur !== a) v.cur.crossFadeTo(a, fade, false);
    v.cur = a;
  }
  pooled(kind, make) {
    const p = this.pools[kind] || (this.pools[kind] = []);
    const v = p.pop() || make();
    v.pool = kind;
    this.scene.add(v.root);
    v.root.visible = true;
    return v;
  }
  release(v) {
    this.scene.remove(v.root);
    if (v.pool) this.pools[v.pool].push(v);
  }

  buildShared() {
    const S = this.scene;
    // lights that exist for the whole session (a fixed light count keeps
    // shaders from recompiling mid-game)
    this.torchLights = [];
    for (let i = 0; i < (this.low ? 3 : 5); i++) {
      const l = new THREE.PointLight(0xff9a4a, 0, 10, 1.3);
      S.add(l); this.torchLights.push(l);
    }
    this.playerLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffe8c0, 0, 11, 1.1);
      if (i === 0 && !this.low) {
        l.castShadow = true; l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.003; l.shadow.camera.near = 0.1;
      }
      S.add(l); this.playerLights.push(l);
    }
    this.shotLights = [];
    for (let i = 0; i < (this.low ? 1 : 2); i++) { const l = new THREE.PointLight(0xff9a3a, 0, 4.5, 1.6); S.add(l); this.shotLights.push(l); }
    this.exitLight = new THREE.PointLight(0xffd35a, 0, 5, 1.5);
    this.bossLight = new THREE.PointLight(0xff7a30, 0, 6, 1.6);
    S.add(this.exitLight, this.bossLight);

    // particles: glowing (additive) and plain (debris, blood)
    const pts = (n, additive) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const m = new THREE.PointsMaterial({
        map: this.glowTex, size: additive ? 0.16 : 0.11, vertexColors: true, transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true, fog: false, alphaTest: additive ? 0 : 0.3,
      });
      const p = new THREE.Points(geo, m);
      p.frustumCulled = false;
      S.add(p);
      return { p, n };
    };
    this.glowPts = pts(1200, true);
    this.plainPts = pts(600, false);
    this.col = new THREE.Color();

    // shared geometry and materials
    this.ringGeo = new THREE.RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2);
    this.markGeo = new THREE.RingGeometry(0.7, 1, 32).rotateX(-Math.PI / 2);
    this.flameMat = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff9a40, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.raycaster = new THREE.Raycaster();
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
    this.v3 = new THREE.Vector3();
    this.v2 = new THREE.Vector2();
  }

  // ---------------------------------------------------------------- level
  buildLevel(game) {
    if (this.levelGroup) {
      this.scene.remove(this.levelGroup);
      this.levelGroup.traverse(o => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); } });
    }
    for (const map of Object.values(this.views)) { for (const [, v] of map) this.dropView(v); map.clear(); }
    for (const d of this.dying) this.release(d.v);
    this.dying = [];
    this.level = game.level;
    this.tiles = game.tiles;
    const { W, H } = game;
    const th = game.theme;
    const G = this.levelGroup = new THREE.Group();
    this.scene.add(G);
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.WALL : this.tiles[y * W + x]);

    // floor: one pixel-art canvas for the whole level
    const PX = this.low ? 16 : 32, u = PX / 32;
    this.floorPX = PX;
    this.floorCanvas = canvas(W * PX, H * PX, g => {
      g.fillStyle = '#07040c'; g.fillRect(0, 0, W * PX, H * PX);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (at(x, y) === T.WALL) continue;
        const px = x * PX, py = y * PX, v = 0.85 + hash(x, y) * 0.3;
        g.fillStyle = rgb((x + y) & 1 ? th.floor : th.floor2, v * 1.5); g.fillRect(px, py, PX, PX);
        g.fillStyle = rgb(th.mortar, 0.9); g.fillRect(px, py, PX, Math.max(1, u)); g.fillRect(px, py, Math.max(1, u), PX);
        for (let k = 0; k < 6; k++) {
          g.fillStyle = rgb(hash(x, y, k) > 0.5 ? th.floor2 : th.mortar, v * (hash(x, y, k) > 0.5 ? 1.45 : 1.1));
          g.fillRect(px + Math.floor((2 + hash(x, y, k + 9) * 27) * u), py + Math.floor((2 + hash(x, y, k + 19) * 27) * u), Math.max(1, 2 * u), Math.max(1, 2 * u));
        }
        if (at(x, y) === T.EXIT) this.paintExit(g, x, y);
      }
    });
    this.floorTex = this.tex(this.floorCanvas);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: this.floorTex, roughness: 0.92 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, H / 2);
    floor.receiveShadow = true;
    G.add(floor);
    this.exitShown = at(game.level.exit.x, game.level.exit.y) === T.EXIT;

    // walls: bricks in the theme's colours; only walls touching the floor
    const face = th.wallFace, top = th.wallTop, mortar = th.mortar;
    const brick = this.tex(canvas(32, 32, g => {
      g.fillStyle = rgb(mortar); g.fillRect(0, 0, 32, 32);
      for (let r = 0; r < 4; r++) {
        const off = r % 2 ? 8 : 0;
        for (let b = -1; b < 2; b++) {
          const x = b * 16 + off, y = r * 8, v = 0.8 + hash(b + 3, r, 7) * 0.4;
          g.fillStyle = rgb(face, v * 1.35); g.fillRect(x + 1, y + 1, 15, 7);
          g.fillStyle = rgb(face, v * 1.7); g.fillRect(x + 1, y + 1, 15, 1);
          g.fillStyle = rgb(face, v * 0.9); g.fillRect(x + 1, y + 7, 15, 1);
        }
      }
    }));
    const topT = this.tex(canvas(32, 32, g => {
      g.fillStyle = rgb(top, 0.7); g.fillRect(0, 0, 32, 32);
      for (let i = 0; i < 40; i++) { g.fillStyle = rgb(top, hash(i, 1) > 0.5 ? 0.8 : 0.6); g.fillRect(Math.floor(hash(i, 2) * 31), Math.floor(hash(i, 3) * 31), 2, 2); }
      g.fillStyle = rgb(top, 0.95); g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
    }));
    const wallTiles = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (at(x, y) !== T.WALL) continue;
      let edge = false;
      for (let oy = -1; oy <= 1 && !edge; oy++) for (let ox = -1; ox <= 1; ox++) if (at(x + ox, y + oy) !== T.WALL) { edge = true; break; }
      if (edge) wallTiles.push([x, y]);
    }
    this.wallTiles = wallTiles;
    const box = new THREE.BoxGeometry(1, WALL_H, 1);
    const side = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95 }), cap = new THREE.MeshStandardMaterial({ map: topT, roughness: 1 });
    this.walls = new THREE.InstancedMesh(box, [side, side, cap, cap, side, side], wallTiles.length);
    this.walls.castShadow = this.walls.receiveShadow = true;
    // walls between the camera and a hero turn see-through instead of vanishing
    // walls stay solid; a hero behind one shows as a silhouette (silhouette.js)
    markOccluder([side, cap]);
    const m4 = new THREE.Matrix4();
    wallTiles.forEach(([x, y], i) => this.walls.setMatrixAt(i, m4.makeTranslation(x + 0.5, WALL_H / 2, y + 0.5)));
    G.add(this.walls);

    // doors
    this.doors = [];
    const wood = this.tex(canvas(32, 32, g => {
      g.fillStyle = '#3a2412'; g.fillRect(0, 0, 32, 32);
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#7a5030' : '#6a4426'; g.fillRect(1 + i * 8, 1, 6, 30); }
      g.fillStyle = '#2c2c36'; g.fillRect(0, 6, 32, 3); g.fillRect(0, 23, 32, 3);
      g.fillStyle = '#e2b340'; g.fillRect(13, 13, 6, 6); g.fillStyle = '#111'; g.fillRect(15, 15, 2, 3);
    }));
    const doorMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 });
    markOccluder(doorMat);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (at(x, y) !== T.DOOR) continue;
      const horiz = at(x - 1, y) === T.DOOR || at(x + 1, y) === T.DOOR || at(x - 1, y) === T.WALL;
      const d = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 1 : 0.3, 1.0, horiz ? 0.3 : 1), doorMat);
      d.position.set(x + 0.5, 0.5, y + 0.5);
      d.castShadow = d.receiveShadow = true;
      G.add(d);
      this.doors.push({ i: y * W + x, mesh: d });
    }

    // torches on the walls
    this.torches = game.level.torches.map(tc => {
      const pos = new THREE.Vector3(tc.x + 0.5, 0.9, tc.y + 1.06);
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.12), new THREE.MeshStandardMaterial({ color: 0x3a2618 }));
      bracket.position.set(pos.x, pos.y - 0.12, pos.z - 0.02);
      const flame = new THREE.Sprite(this.flameMat);
      flame.position.copy(pos);
      flame.scale.setScalar(0.42);
      G.add(bracket, flame);
      return { pos, flame, ph: Math.random() * 10 };
    });
    const dark = game.darkness ?? 0.85;
    this.hemi.intensity = 2.3 - (dark - 0.82) * 5;
    this.lastTime = null;
  }

  paintExit(g, x, y) {
    const PX = this.floorPX, u = PX / 32, px = x * PX, py = y * PX;
    g.fillStyle = '#07040c'; g.fillRect(px + 3 * u, py + 3 * u, PX - 6 * u, PX - 6 * u);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgb(${90 - i * 18},${76 - i * 15},${110 - i * 20})`;
      g.fillRect(px + (5 + i * 2) * u, py + (5 + i * 6) * u, PX - (10 + i * 4) * u, 4 * u);
    }
  }

  // ---------------------------------------------------------------- per-frame sync
  sync(map, list, make, update) {
    const f = this.frame;
    for (const o of list) {
      let v = map.get(o);
      if (!v) { v = make(o); if (!v) continue; map.set(o, v); }
      v.seen = f;
      update(o, v);
    }
    for (const [o, v] of map) if (v.seen !== f) { this.dropView(v, o); map.delete(o); }
  }
  dropView(v, o) {
    if (v.boss && o && !this.levelChanging) {  // bosses roar and sink into the floor
      this.play(v, 'Roar', { once: true, dur: 1.6, fade: 0.1 });
      this.dying.push({ v, t: 0 });
      return;
    }
    if (v.light) v.light.intensity = 0;
    if (v.extra) for (const x of v.extra) this.scene.remove(x);
    if (v.root) this.release(v);
    else if (v.obj) {
      // items, lobs and effects own their materials (and some their geometry)
      for (const o of [v.obj, v.mark]) {
        if (!o) continue;
        this.scene.remove(o);
        o.traverse(q => {
          if (q.material) for (const m of [].concat(q.material)) m.dispose();
          if (q.geometry && q.geometry !== this.ringGeo && q.geometry !== this.markGeo) q.geometry.dispose();
        });
      }
    }
  }

  // ---------------------------------------------------------------- heroes
  makeHero(p) {
    const inst = this.instance(p.heroKey, true);
    const v = { ...inst, key: p.heroKey, acts: {}, layers: { L: null, U: null }, attackT: 0, lx: p.x, ly: p.y, speed: 0, angle: faceY(p.facing) };
    for (const clip of inst.clips) {
      for (const [layer, keep] of [['L', tr => !isUpper(tr)], ['U', isUpper]]) {
        const a = v.mixer.clipAction(new THREE.AnimationClip(`${clip.name}:${layer}`, clip.duration, clip.tracks.filter(keep)));
        v.acts[`${clip.name}:${layer}`] = a;
      }
    }
    v.root.scale.setScalar(0.95);
    addSilhouette(v.root, PLAYER_COLORS[p.slot % 4]);
    this.scene.add(v.root);
    // coloured ring under each player; a tombstone for when it falls
    v.ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[p.slot % 4], transparent: true, opacity: 0.55, depthWrite: false }));
    v.ring.scale.setScalar(0.42);
    v.shield = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffd35a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    v.tomb = this.makeTomb(p.hero.color);
    v.extra = [v.ring, v.shield, v.tomb];
    this.scene.add(v.ring, v.shield, v.tomb);
    this.layer(v, 'L', 'Idle'); this.layer(v, 'U', 'Idle');
    return v;
  }
  makeTomb(color) {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x6a6a78, roughness: 0.9, flatShading: true });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.14), stone);
    slab.position.y = 0.25;
    const round = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.14, 12, 1, false, 0, Math.PI), stone);
    round.rotation.set(Math.PI / 2, 0, Math.PI / 2); round.position.y = 0.5;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0x4a4a56 }));
    base.position.y = 0.04;
    const cm = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.02), cm), c2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.02), cm);
    c1.position.set(0, 0.36, 0.08); c2.position.set(0, 0.42, 0.08);
    g.add(slab, round, base, c1, c2);
    g.traverse(o => { if (o.isMesh) o.castShadow = !this.low; });
    return g;
  }
  layer(v, layer, name, fade = 0.2) {
    const a = v.acts[`${name}:${layer}`], cur = v.layers[layer];
    if (!a || cur === a) return;
    a.reset().play();
    a.setLoop(THREE.LoopRepeat, Infinity);
    const other = v.layers[layer === 'L' ? 'U' : 'L'];
    if (other && other.getClip().name.split(':')[0] === name) a.time = other.time;
    if (cur) cur.crossFadeTo(a, fade, false);
    v.layers[layer] = a;
  }
  heroAttack(v, p) {
    // restart the swing mid-way so the throw lines up with the projectile
    const a = v.acts['Attack:U'];
    if (!a) return;
    const dur = Math.max(0.24, Math.min(0.5, (p.hero.fireDelay || 0.3) * 1.3));
    if (v.layers.U !== a) { if (v.layers.U) v.layers.U.crossFadeTo(a, 0.05, false); v.layers.U = a; }
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.time = a.getClip().duration * 0.3;
    a.timeScale = a.getClip().duration * 0.7 / dur;
    a.play();
    v.attackT = dur;
  }
  updateHero(p, v, dt, time, li) {
    const x = W3(p.x), z = W3(p.y);
    const sp = dt > 0 ? Math.hypot(p.x - v.lx, p.y - v.ly) / TILE / dt : 0;
    v.speed += (Math.min(sp, 12) - v.speed) * Math.min(1, dt * 12);
    v.lx = p.x; v.ly = p.y;
    v.root.visible = p.alive;
    v.tomb.visible = !p.alive;
    v.ring.visible = p.alive && this.playersN > 1;
    v.shield.visible = p.alive && !!(p.buffs && p.buffs.invuln);
    const light = this.playerLights[li];
    if (light) {
      light.position.set(x, 2.4, z + 1.2);
      light.intensity = p.alive ? 9 : 2.5;
      light.color.set(p.alive ? 0xffe2b0 : 0x8888aa);
    }
    if (!p.alive) { v.tomb.position.set(x, 0, z); return; }
    v.root.position.set(x, 0, z);
    v.ring.position.set(x, 0.03, z);
    v.shield.position.set(x, 0.5, z);
    v.shield.material.opacity = 0.15 + 0.08 * Math.sin(time * 10);
    const want = faceY(p.facing);
    if (p.spinT > 0) v.angle += dt * 22;  // whirlwind
    else v.angle += angleDiff(v.angle, want) * Math.min(1, dt * 18);
    v.root.rotation.set(p.chargeT > 0 ? 0.25 : 0, v.angle, 0);
    if (v.attackT > 0 && (v.attackT -= dt) <= 0) v.layers.U = null;
    const base = v.speed > 2.4 ? 'Run' : v.speed > 0.3 ? 'Walk' : 'Idle';
    this.layer(v, 'L', base);
    if (v.attackT <= 0) this.layer(v, 'U', base);
    for (const k of ['Run:L', 'Run:U']) v.acts[k] && (v.acts[k].timeScale = Math.max(0.7, v.speed / 3.2));
    for (const k of ['Walk:L', 'Walk:U']) v.acts[k] && (v.acts[k].timeScale = Math.max(0.6, v.speed / 1.4));
    const hurt = p.hurt > 0;
    this.tint(v, false, hurt ? [0xff2020, 0.6] : null, p.buffs && p.buffs.invis ? 0.3 : 1);
    v.mixer.update(dt);
  }

  // ---------------------------------------------------------------- enemies and bosses
  makeEnemy(e) {
    if (e.type === 'boss') {
      const B = BOSSES[e.kind];
      if (!B) return null;
      const inst = this.instance(e.kind, B.fade);
      const v = { ...inst, boss: true, kind: e.kind, acts: {}, cur: null, lx: e.x, ly: e.y, angle: faceY(e.face), act: e.act, phase: e.phase || 1, alpha: 1, lockT: 0 };
      for (const clip of inst.clips) v.acts[clip.name] = v.mixer.clipAction(clip);
      v.root.scale.setScalar(B.scale);
      this.scene.add(v.root);
      this.play(v, 'Idle');
      this.bossLight.color.set(B.light);
      return v;
    }
    const Ty = ENEMY_TYPES[e.type];
    if (!Ty) return null;
    const v = this.pooled(e.type, () => {
      const inst = this.instance(e.type, Ty.fade);
      const w = { ...inst, acts: {}, cur: null };
      for (const clip of inst.clips) {
        const a = w.mixer.clipAction(clip);
        if (clip.name === 'Attack') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        w.acts[clip.name] = a;
      }
      if (Ty.glow) {
        w.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: Ty.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
        w.glow.scale.setScalar(1.5);
        w.root.add(w.glow);
        w.glow.position.y = 0.6;
      }
      return w;
    });
    v.cur = null;
    for (const a of Object.values(v.acts)) a.stop();
    this.play(v, 'Idle');
    v.acts.Idle.time = Math.random() * v.acts.Idle.getClip().duration;
    v.lx = e.x; v.ly = e.y; v.speed = 0; v.atkT = 0; v.lastAtk = 0; v.alpha = 1; v.grow = 0;
    v.angle = faceY(e.face || 0);
    v.root.scale.setScalar(Ty.scale * (0.85 + 0.1 * (e.tier || 1)));
    v.base = v.root.scale.x;
    return v;
  }
  enemyAttack(v) {
    if (!v.acts.Attack) return;
    v.atkT = v.acts.Attack.getClip().duration;
    this.play(v, 'Attack', { once: true, fade: 0.08 });
  }
  updateEnemy(e, v, dt, time) {
    const x = W3(e.x), z = W3(e.y);
    const far = Math.abs(x - this.cx) > this.viewW || Math.abs(z - this.cz) > this.viewH;
    v.root.visible = !far;
    if (v.boss) return this.updateBoss(e, v, dt, time, x, z);
    if (far) { v.lx = e.x; v.ly = e.y; return; }
    const sp = dt > 0 ? Math.hypot(e.x - v.lx, e.y - v.ly) / TILE / dt : 0;
    v.speed += (Math.min(sp, 8) - v.speed) * Math.min(1, dt * 10);
    v.lx = e.x; v.ly = e.y;
    if (e.atk > 0 && v.lastAtk <= 0 && e.type !== 'ghost') this.enemyAttack(v);
    v.lastAtk = e.atk;
    if (v.atkT > 0) { if ((v.atkT -= dt) <= 0) v.cur = null; }
    else this.play(v, v.speed > 0.25 ? 'Walk' : 'Idle');
    if (v.acts.Walk) v.acts.Walk.timeScale = Math.max(0.7, v.speed / 1.3);
    v.angle += angleDiff(v.angle, faceY(e.face || 0)) * Math.min(1, dt * 10);
    v.root.position.set(x, 0, z);
    v.root.rotation.y = v.angle;
    if (v.grow < 1) { v.grow = Math.min(1, v.grow + dt * 3); v.root.scale.setScalar(v.base * v.grow); }
    const Ty = ENEMY_TYPES[e.type];
    if (Ty.fade) v.alpha += ((e.invis ? 0.1 : 1) - v.alpha) * Math.min(1, dt * 6);
    this.tint(v, e.flash > 0, null, Ty.fade ? v.alpha : null);
    if (v.glow) v.glow.material.opacity = 0.5 + 0.15 * Math.sin(time * 5 + x);
    v.mixer.update(dt);
  }
  updateBoss(e, v, dt, time, x, z) {
    const A = BOSS_ANIM[e.kind] || {};
    const sp = dt > 0 ? Math.hypot(e.x - v.lx, e.y - v.ly) / TILE / dt : 0;
    v.lx = e.x; v.ly = e.y;
    // wake-up and rage roars
    if ((v.act === 'sleep' && e.act !== 'sleep') || (e.phase === 2 && v.phase !== 2)) { this.play(v, 'Roar', { once: true, dur: 1.2, fade: 0.1 }); v.lockT = 1.2; }
    v.phase = e.phase;
    if (e.act !== v.act && A[e.act] && v.lockT <= 0) {
      const [anim, loop, dur] = A[e.act];
      this.play(v, anim, loop ? { fade: 0.15 } : { once: true, dur: dur || 0.8, fade: 0.1 });
    }
    if (e.act !== v.act && e.act === 'slam' && v.lockT <= 0) v.slams = 0;
    v.act = e.act;
    v.lockT -= dt;
    if (v.lockT <= 0 && (e.act === 'walk' || e.act === 'sleep')) this.play(v, sp > 0.3 ? 'Walk' : 'Idle', { fade: 0.25 });
    const want = faceY(e.face);
    v.angle += angleDiff(v.angle, want) * Math.min(1, dt * (e.act === 'charge' ? 20 : 6));
    v.root.position.set(x, 0, z);
    v.root.rotation.y = v.angle;
    const B = BOSSES[e.kind];
    if (B.fade) v.alpha += ((e.invis ? 0 : 1) - v.alpha) * Math.min(1, dt * 10);
    v.root.visible = v.root.visible && v.alpha > 0.02;
    const rage = e.phase === 2 ? [0xff2a0a, 0.22 + 0.12 * Math.sin(time * 8)] : null;
    this.tint(v, e.flash > 0, rage, B.fade ? v.alpha : null);
    // its light: the dragon's throat while breathing, the lich's staff, the golem's core
    const L = this.bossLight;
    if (e.kind === 'dragon') {
      L.position.set(x + Math.sin(v.angle) * 1.2, 1.1, z + Math.cos(v.angle) * 1.2);
      L.intensity = e.act === 'breath' ? 12 + Math.random() * 6 : 0;
    } else {
      L.position.set(x + Math.sin(v.angle) * 0.8, e.kind === 'lich' ? 1.6 : 1.0, z + Math.cos(v.angle) * 0.8);
      L.intensity = (e.kind === 'lich' ? 5 : 6) * v.alpha;
    }
    v.mixer.update(dt);
  }

  // ---------------------------------------------------------------- generators, items
  makeGen(g) {
    const name = g.type === 'ghost' || g.type === 'death' ? 'gen_bones' : 'gen_hut';
    const root = this.templates[name].scene.clone();
    const mats = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.userData.emissive = o.material.emissive.clone(); o.material.userData.ei = o.material.emissiveIntensity; o.material.userData.opacity = 1;
      mats.push(o.material);
    });
    this.scene.add(root);
    return { root, mats };
  }
  itemTexture(it) {
    const key = it.kind + (it.sub || '');
    if (!this.itemTex.has(key)) {
      const c = canvas(28, 28, g => { g.imageSmoothingEnabled = false; g.translate(14, 16); drawItem(g, { kind: it.kind, sub: it.sub, x: 0, y: 0, bob: 0 }, 0); });
      this.itemTex.set(key, this.tex(c));
    }
    return this.itemTex.get(key);
  }
  makeItem(it) {
    const map = this.itemTexture(it);
    const shiny = it.kind === 'potion' || it.kind === 'amulet' || it.kind === 'key' || it.kind === 'chest';
    const geo = new THREE.PlaneGeometry(0.62, 0.62).translate(0, 0.31, 0);
    const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, emissive: shiny ? 0xffffff : 0, emissiveMap: shiny ? map : null, emissiveIntensity: 0.35 });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -0.45;
    m.castShadow = !this.low;
    m.customDepthMaterial = new THREE.MeshDepthMaterial({ map, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
    m.customDistanceMaterial = new THREE.MeshDistanceMaterial({ map, alphaTest: 0.5 });
    this.scene.add(m);
    return { obj: m, ph: it.bob || Math.random() * 6 };
  }

  // ---------------------------------------------------------------- projectiles and lobs
  makeShot(pr) {
    const k = pr.kind;
    const v = this.pooled('shot_' + k, () => {
      let root;
      const basic = c => new THREE.MeshBasicMaterial({ color: c });
      const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
      if (k === 'axe') {
        root = new THREE.Group();
        const spin = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 5), std(0x6a4020));
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.16), std(0xc8d0e0, { metalness: 0.4, roughness: 0.35 }));
        blade.position.set(0, 0.13, 0.08);
        spin.add(handle, blade);
        root.add(spin); root.userData.spin = spin;
      } else if (k === 'sword') {
        root = new THREE.Group();
        const spin = new THREE.Group();
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.06), std(0xdfe6f5, { metalness: 0.5, roughness: 0.3 }));
        blade.position.y = 0.12;
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.18), std(0xe2b340, { metalness: 0.6 }));
        guard.position.y = -0.08;
        spin.add(blade, guard);
        root.add(spin); root.userData.spin = spin;
      } else if (k === 'arrow' || k === 'storm') {
        root = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.55, 5), k === 'storm' ? basic(0x9fffc0) : std(0x8a5a2a));
        shaft.rotation.x = Math.PI / 2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 4), k === 'storm' ? basic(0xeaffef) : std(0xc8d0e0, { metalness: 0.3 }));
        tip.rotation.x = Math.PI / 2; tip.position.z = 0.31;
        const fl = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.06, 0.1), k === 'storm' ? basic(0x5aff9a) : std(0xd8261c));
        fl.position.z = -0.24;
        root.add(shaft, tip, fl);
      } else {
        // glowing magic: wizard fire, demon/dragon fire, bolts, lich orbs
        root = new THREE.Group();
        const col = new THREE.Color(PROJ_GLOW[k] || '#ffffff');
        const core = new THREE.Mesh(k === 'orb' ? new THREE.IcosahedronGeometry(0.15, 1) : k === 'bolt' ? new THREE.OctahedronGeometry(0.09) : new THREE.IcosahedronGeometry(0.1, 1),
          basic(col.clone().lerp(new THREE.Color(0xffffff), 0.45)));
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        halo.scale.setScalar(k === 'orb' ? 0.8 : 0.55);
        root.add(core, halo);
        root.userData.core = core;
      }
      root.traverse(o => { if (o.isMesh && o.material.type !== 'MeshBasicMaterial') o.castShadow = !this.low; });
      return { root };
    });
    // who threw it? play that hero's or monster's attack
    if (!pr.cueDone) {
      pr.cueDone = true;
      if (HERO_SHOTS.has(k)) {
        let best = null, bd = 30 * 30;
        for (const [p, hv] of this.views.players) {
          const d = (p.x - pr.x) ** 2 + (p.y - pr.y) ** 2;
          if (d < bd && (k === 'storm' || p.hero.shot === k)) { bd = d; best = [p, hv]; }
        }
        if (best && k !== 'storm') this.heroAttack(best[1], best[0]);
      } else this.cueEnemy(pr.x, pr.y);
    }
    return v;
  }
  cueEnemy(x, y) {
    let best = null, bd = 34 * 34;
    for (const [e, ev] of this.views.enemies) {
      if (ev.boss) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = ev; }
    }
    if (best && best.atkT <= 0) this.enemyAttack(best);
  }
  updateShot(pr, v, dt, time) {
    const x = W3(pr.x), z = W3(pr.y), k = pr.kind;
    v.root.position.set(x, k === 'efire' || k === 'orb' ? 0.8 : 0.6, z);
    v.root.rotation.set(0, faceY(pr.ang || 0), 0);
    const spin = v.root.userData.spin;
    if (spin) spin.rotation.x = (pr.spin || time * 18) * 1.1;
    const core = v.root.userData.core;
    if (core) { core.rotation.y += dt * 8; core.scale.setScalar(1 + 0.25 * Math.sin(time * 40 + x * 7)); }
  }
  makeLob(l) {
    const fire = !!l.fire;
    const obj = new THREE.Mesh(new THREE.IcosahedronGeometry(fire ? 0.17 : 0.12, 0),
      fire ? new THREE.MeshBasicMaterial({ color: 0xffa040 }) : new THREE.MeshStandardMaterial({ color: 0x8a8278, roughness: 0.95, flatShading: true }));
    obj.castShadow = !this.low;
    const mark = new THREE.Mesh(this.markGeo, new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    mark.scale.setScalar(W3(fire ? 46 : 36));
    this.scene.add(obj, mark);
    this.cueEnemy(l.x0, l.y0 + 8);
    return { obj, mark };
  }
  updateLob(l, v, time) {
    const k = Math.max(0, Math.min(1, l.t / l.dur));
    const hi = l.fire ? 3 : 1.6;
    v.obj.position.set(W3(l.x0 + (l.x1 - l.x0) * k), 0.5 + 4 * hi * k * (1 - k), W3(l.y0 + 8 + (l.y1 - l.y0 - 8) * k));
    v.obj.rotation.x += 0.15;
    v.mark.position.set(W3(l.x1), 0.04, W3(l.y1));
    v.mark.material.opacity = 0.3 + 0.3 * Math.sin(time * 18);
  }

  // ---------------------------------------------------------------- effects (rings, waves, whirlwind)
  makeFx(ef) {
    if (ef.kind === 'spin') {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: ef.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      for (let i = 0; i < 3; i++) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(W3(50), 0.035, 4, 16, 1.2), mat);
        arc.rotation.set(Math.PI / 2, 0, (i * Math.PI * 2) / 3);
        g.add(arc);
      }
      this.scene.add(g);
      return { obj: g };
    }
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: ef.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.scene.add(m);
    return { obj: m };
  }
  updateFx(ef, v, time) {
    const k = 1 - ef.life / ef.max;
    if (ef.kind === 'spin') {
      v.obj.position.set(W3(ef.p.x), 0.45, W3(ef.p.y));
      v.obj.rotation.y = -time * 24;
      v.obj.children[0].material.opacity = 1 - k;
      return;
    }
    const r = W3(ef.kind === 'wave' ? ef.r0 + (ef.r1 - ef.r0) * k : ef.r0 + (ef.r1 - ef.r0) * (1 - Math.pow(1 - k, 3)));
    v.obj.position.set(W3(ef.x), 0.06, W3(ef.y));
    v.obj.scale.setScalar(Math.max(0.01, r));
    v.obj.material.opacity = ef.kind === 'wave' ? 0.9 : (1 - k) * 0.9;
  }

  // ---------------------------------------------------------------- particles
  updateParticles(game) {
    const G = this.glowPts, P = this.plainPts;
    const gp = G.p.geometry.attributes.position.array, gc = G.p.geometry.attributes.color.array;
    const pp = P.p.geometry.attributes.position.array, pc = P.p.geometry.attributes.color.array;
    let gi = 0, pi = 0;
    for (const q of game.particles) {
      if (q._h == null) q._h = q.glow ? 0.3 + Math.random() * 0.6 : 0.15 + Math.random() * 0.5;
      const a = Math.max(0, q.life / q.max);
      this.col.set(q.color);
      if (q.glow) {
        if (gi >= G.n) continue;
        gp[gi * 3] = W3(q.x); gp[gi * 3 + 1] = q._h + (1 - a) * 0.3; gp[gi * 3 + 2] = W3(q.y);
        gc[gi * 3] = this.col.r * a; gc[gi * 3 + 1] = this.col.g * a; gc[gi * 3 + 2] = this.col.b * a;
        gi++;
      } else {
        if (pi >= P.n) continue;
        pp[pi * 3] = W3(q.x); pp[pi * 3 + 1] = q._h * a; pp[pi * 3 + 2] = W3(q.y);
        pc[pi * 3] = this.col.r; pc[pi * 3 + 1] = this.col.g; pc[pi * 3 + 2] = this.col.b;
        pi++;
      }
    }
    G.p.geometry.setDrawRange(0, gi); P.p.geometry.setDrawRange(0, pi);
    for (const o of [G, P]) { o.p.geometry.attributes.position.needsUpdate = true; o.p.geometry.attributes.color.needsUpdate = true; }
  }

  // ---------------------------------------------------------------- frame
  usable(settings) { return this.ready && !this.failed && settings.view3d !== false; }
  hide() { if (this.shown) { this.el.style.visibility = 'hidden'; this.shown = false; } }

  render(game, settings) {
    const { vw, vh } = this.app;
    if (this.size[0] !== vw || this.size[1] !== vh) {
      this.size = [vw, vh];
      this.renderer.setSize(vw, vh, false);
      this.composer?.setSize(vw, vh);
      this.camera.aspect = vw / vh;
      this.camera.updateProjectionMatrix();
    }
    if (!this.shown) { this.el.style.visibility = 'visible'; this.shown = true; }
    if (game.level !== this.level) { this.levelChanging = true; this.buildLevel(game); this.levelChanging = false; }
    this.frame++;
    const time = game.time;
    const dt = this.lastTime == null ? 0 : Math.max(0, Math.min(0.1, time - this.lastTime));
    this.lastTime = time;

    // camera: the 2D camera's centre and zoom, seen from above at an angle
    const z = game.cam.zoom || 1;
    this.cx = W3(game.cam.x); this.cz = W3(game.cam.y);
    const spanW = W3(vw / z) * 0.9;
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = spanW / (2 * Math.tan(fovV / 2) * this.camera.aspect);
    const pitch = THREE.MathUtils.degToRad(52);
    const sk = settings.shake ? W3(game.shake) : 0;
    const shx = (Math.random() - 0.5) * sk, shy = (Math.random() - 0.5) * sk;
    this.camera.position.set(this.cx + shx, Math.sin(pitch) * dist + shy, this.cz + Math.cos(pitch) * dist * 0.92);
    this.camera.lookAt(this.cx + shx, 0, this.cz - 0.3 + shy);
    this.viewW = spanW / 2 + 3; this.viewH = W3(vh / z) / 2 + 4;

    // doors that were opened, the exit when it appears
    for (const d of this.doors) if (d.mesh.visible && this.tiles[d.i] !== T.DOOR) d.mesh.visible = false;
    if (game.exitOpen && !this.exitShown) {
      this.exitShown = true;
      this.paintExit(this.floorCanvas.getContext('2d'), game.level.exit.x, game.level.exit.y);
      this.floorTex.needsUpdate = true;
    }
    this.exitLight.position.set(W3(game.exitPos.x), 0.6, W3(game.exitPos.y));
    this.exitLight.intensity = game.exitOpen ? 2.4 + Math.sin(time * 3) : 0;

    // torch light pool: the torches nearest the view centre
    const near = this.torches.map(tc => [tc, (tc.pos.x - this.cx) ** 2 + (tc.pos.z - this.cz) ** 2]).sort((a, b) => a[1] - b[1]);
    this.torchLights.forEach((l, i) => {
      const tc = near[i] && near[i][0];
      if (!tc) { l.intensity = 0; return; }
      l.position.set(tc.pos.x, tc.pos.y + 0.1, tc.pos.z + 0.25);
      l.intensity = 20 + Math.sin(time * 13 + tc.ph) * 2 + Math.sin(time * 7.3 + tc.ph * 2) * 1.2;
    });
    for (const tc of this.torches) tc.flame.scale.setScalar(0.38 + Math.sin(time * 16 + tc.ph) * 0.05);

    // entities
    const V = this.views;
    this.playersN = game.players.length;
    let li = 0;
    for (const l of this.playerLights) l.intensity = 0;
    this.sync(V.players, game.players, p => (this.templates[p.heroKey] ? this.makeHero(p) : null), (p, v) => {
      if (v.key !== p.heroKey) { v.seen = -1; return; }
      this.updateHero(p, v, dt, time, li++);
    });
    this.bossLight.intensity = 0;
    this.sync(V.enemies, game.enemies, e => this.makeEnemy(e), (e, v) => this.updateEnemy(e, v, dt, time));
    this.sync(V.gens, game.generators, g => this.makeGen(g), (g, v) => {
      v.root.position.set(W3(g.x), 0, W3(g.y));
      v.root.scale.setScalar(0.72 + 0.1 * (g.tier || 1));
      this.tint(v, g.flash > 0, g.spawnT < 0.6 ? [0xffffff, (0.6 - g.spawnT) * 0.4] : null);
    });
    this.sync(V.items, game.items, it => this.makeItem(it), (it, v) => {
      v.obj.position.set(W3(it.x), 0.04 + Math.abs(Math.sin(time * 2.5 + v.ph)) * 0.08, W3(it.y));
    });
    this.sync(V.shots, game.projectiles, pr => this.makeShot(pr), (pr, v) => this.updateShot(pr, v, dt, time));
    this.sync(V.lobs, game.lobs, l => this.makeLob(l), (l, v) => this.updateLob(l, v, time));
    this.sync(V.fx, game.effects, ef => this.makeFx(ef), (ef, v) => this.updateFx(ef, v, time));
    // glowing shots light their surroundings (nearest to the view centre)
    const glowing = game.projectiles.filter(pr => PROJ_GLOW[pr.kind]);
    this.shotLights.forEach((l, i) => {
      const pr = glowing[i];
      if (!pr) { l.intensity = 0; return; }
      l.color.set(PROJ_GLOW[pr.kind]);
      l.position.set(W3(pr.x), 0.8, W3(pr.y));
      l.intensity = 5;
    });
    // fallen bosses sink into the floor
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      if (d.t > 1.1) { const k = Math.min(1, (d.t - 1.1) / 1.6); d.v.root.position.y = -k * 1.2; }
      d.v.mixer.update(dt);
      if (d.t > 2.8) { this.scene.remove(d.v.root); this.dying.splice(i, 1); }
    }
    this.updateParticles(game);

    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- menus
  // 3D heroes drawn into the 2D menu canvas (title line-up, hero cards).
  // list: [{ id, key, x, y (feet, screen px), size (px tall), facing (2D angle), active }]
  // Active heroes swing their weapon now and then. Returns false until ready.
  drawMenuHeroes(ctx, list, time) {
    if (!this.ready || this.failed) return false;
    const { vw, vh } = this.app;
    if (this.size[0] !== vw || this.size[1] !== vh) {
      this.size = [vw, vh];
      this.renderer.setSize(vw, vh, false);
      this.composer?.setSize(vw, vh);
      this.camera.aspect = vw / vh;
      this.camera.updateProjectionMatrix();
    }
    let M = this.menu;
    if (!M) {
      M = this.menu = { scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000), heroes: new Map(), last: time };
      M.cam.position.z = 2000;
      const key = new THREE.DirectionalLight(0xffe0b8, 3.2);
      key.position.set(-0.6, 1, 1.2);
      const rim = new THREE.DirectionalLight(0x8fa8ff, 2.2);
      rim.position.set(0.8, 0.6, -1);
      M.scene.add(new THREE.HemisphereLight(0x9a88d8, 0x2a1830, 1.6), key, rim);
    }
    M.cam.right = vw; M.cam.bottom = -vh; M.cam.updateProjectionMatrix();
    const dt = Math.max(0, Math.min(0.1, time - M.last));
    M.last = time;
    for (const v of M.heroes.values()) v.root.visible = false;
    for (const it of list) {
      let v = M.heroes.get(it.id);
      if (!v || v.key !== it.key) {
        if (v) M.scene.remove(v.root);
        const inst = this.instance(it.key, false);
        v = { ...inst, key: it.key, acts: {}, cur: null, next: 1 + Math.random() * 2 };
        for (const clip of inst.clips) v.acts[clip.name] = v.mixer.clipAction(clip);
        v.acts.Attack.setLoop(THREE.LoopOnce, 1);
        v.acts.Attack.clampWhenFinished = true;
        this.play(v, 'Idle');
        M.scene.add(v.root);
        M.heroes.set(it.id, v);
      }
      v.root.visible = true;
      v.root.position.set(it.x, -it.y, 0);
      v.root.scale.setScalar(it.size);
      v.root.rotation.set(0.32, faceY(it.facing), 0);
      if (it.active) {
        v.next -= dt;
        if (v.next <= 0) { v.next = 2.2 + Math.random(); this.play(v, 'Attack', { once: true, fade: 0.1 }); v.atkT = v.acts.Attack.getClip().duration; }
      }
      if (v.atkT > 0 && (v.atkT -= dt) <= 0) this.play(v, 'Idle', { fade: 0.25 });
      v.mixer.update(dt);
    }
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.render(M.scene, M.cam);
    ctx.drawImage(this.el, 0, 0, vw, vh);
    return true;
  }

  // ---------------------------------------------------------------- screen <-> world
  project(x, y, h = 0) {
    this.v3.set(W3(x), h, W3(y)).project(this.camera);
    return [(this.v3.x + 1) / 2 * this.app.vw, (1 - this.v3.y) / 2 * this.app.vh, this.v3.z < 1];
  }
  // mouse aim: the point under the cursor at chest height
  screenToWorld(sx, sy) {
    this.v2.set(sx / this.app.vw * 2 - 1, -(sy / this.app.vh) * 2 + 1);
    this.raycaster.setFromCamera(this.v2, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.aimPlane, this.v3);
    return hit ? { x: hit.x * TILE, y: hit.z * TILE } : { x: this.cx * TILE, y: this.cz * TILE };
  }
  // pixels per world pixel near the view centre (for text sizes)
  get scale() { return this.app.vw / (this.viewW * 2 - 6) / TILE; }

  // 2D layer drawn over the 3D scene: floating numbers, the exit label,
  // auto-aim reticles, revive progress, screen flashes and fades.
  drawOverlay(ctx, game) {
    const { vw, vh } = this.app, s = Math.max(1, this.scale * 1.1);
    const time = game.time;
    ctx.textAlign = 'center';
    for (const p of game.players) {
      const tg = p.autoTarget;
      if (!p.alive || !tg || tg.dead) continue;
      const [x, y] = this.project(tg.x, tg.y, 0.05);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.62);
      ctx.rotate(time * 3);
      ctx.strokeStyle = p.hero.light; ctx.globalAlpha = 0.85; ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.arc(0, 0, 17 * s * 0.7, -0.4, 0.4); ctx.stroke(); }
      ctx.restore();
    }
    for (const p of game.players) {
      if (p.alive || !(p.revive > 0)) continue;
      const [x, y] = this.project(p.x, p.y, 0.9);
      ctx.strokeStyle = '#7dffa0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 14 * s * 0.7, -Math.PI / 2, -Math.PI / 2 + (p.revive / 2.2) * Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (game.exitOpen) {
      const [x, y, ok] = this.project(game.exitPos.x, game.exitPos.y, 0.9);
      if (ok) {
        ctx.font = `${Math.round(8 * s)}px "Press Start 2P", monospace`;
        ctx.fillStyle = '#000'; ctx.fillText(t('exit_word'), x + 1, y + 1);
        ctx.fillStyle = '#ffe07a'; ctx.fillText(t('exit_word'), x, y);
      }
    }
    for (const tx of game.texts) {
      const [x, y, ok] = this.project(tx.x, tx.y, 1.1);
      if (!ok) continue;
      ctx.globalAlpha = Math.min(1, (tx.life / tx.max) * 2);
      ctx.font = `${Math.round((tx.small ? 7 : 9) * s)}px "Press Start 2P", monospace`;
      ctx.fillStyle = '#000'; ctx.fillText(tx.str, x + 1, y + 1);
      ctx.fillStyle = tx.color; ctx.fillText(tx.str, x, y);
    }
    ctx.globalAlpha = 1;
    if (game.flash > 0) { ctx.fillStyle = `rgba(220,245,255,${Math.min(0.85, game.flash)})`; ctx.fillRect(0, 0, vw, vh); }
    if (game.exiting > 0) { ctx.fillStyle = `rgba(0,0,0,${1 - game.exiting / 1.4})`; ctx.fillRect(0, 0, vw, vh); }
  }
}

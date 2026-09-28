import { T } from './constants.js';
import { rng, shuffle } from './util.js';

const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const AMULETS = ['invuln', 'rapid', 'speed', 'multi', 'invis'];

// Procedurally builds a dungeon: rooms + wide corridors (with loops), locked
// rooms whose keys are always reachable, an exit in the farthest room,
// monster generators, enemies and loot. Everything is in tile coordinates.
export function generateLevel(num, seed, playerCount = 1) {
  const R = rng(seed);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pickR = arr => arr[Math.floor(R() * arr.length)];

  const W = Math.min(44 + num * 3, 90);
  const H = Math.min(32 + num * 2, 64);
  const tiles = new Uint8Array(W * H).fill(T.WALL);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.WALL : tiles[y * W + x]);
  const set = (x, y, v) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) tiles[y * W + x] = v; };

  // --- rooms
  const rooms = [];
  const want = Math.max(7, Math.floor((W * H) / 150));
  for (let a = 0; a < 800 && rooms.length < want; a++) {
    const w = ri(5, 12), h = ri(4, 9);
    const x = ri(2, W - w - 2), y = ri(2, H - h - 2);
    if (rooms.some(r => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  if (rooms.length < 5) return generateLevel(num, seed + 7919, playerCount);
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, T.FLOOR);

  // --- corridors (2 tiles wide, L-shaped)
  const corridor = (a, b) => {
    const hline = (x0, x1, y) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + 1; x++) { set(x, y, T.FLOOR); set(x, y + 1, T.FLOOR); } };
    const vline = (y0, y1, x) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1) + 1; y++) { set(x, y, T.FLOOR); set(x + 1, y, T.FLOOR); } };
    if (R() < 0.5) { hline(a.cx, b.cx, a.cy); vline(a.cy, b.cy, b.cx); }
    else { vline(a.cy, b.cy, a.cx); hline(a.cx, b.cx, b.cy); }
  };
  const d2 = (a, b) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
  const conn = [rooms[0]], rest = rooms.slice(1);
  while (rest.length) {
    let best = null, bi = -1, bd = Infinity;
    for (const a of conn) for (let i = 0; i < rest.length; i++) { const d = d2(a, rest[i]); if (d < bd) { bd = d; best = a; bi = i; } }
    const b = rest.splice(bi, 1)[0];
    corridor(best, b);
    conn.push(b);
  }
  const loops = Math.max(2, Math.floor(rooms.length / 3));
  for (let i = 0; i < loops; i++) {
    const a = pickR(rooms);
    const others = rooms.filter(r => r !== a).sort((p, q) => d2(a, p) - d2(a, q));
    corridor(a, others[Math.min(others.length - 1, ri(1, 2))]);
  }

  const bfs = (sx, sy, passDoors) => {
    const dist = new Int32Array(W * H).fill(-1);
    const q = [sy * W + sx];
    dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of DIR4) {
        const nx = x + dx, ny = y + dy, t = at(nx, ny);
        if (t === T.WALL || (!passDoors && t === T.DOOR)) continue;
        const n = ny * W + nx;
        if (dist[n] < 0) { dist[n] = dist[i] + 1; q.push(n); }
      }
    }
    return dist;
  };
  const reachCount = (sx, sy) => { let c = 0; for (const v of bfs(sx, sy, true)) if (v >= 0) c++; return c; };
  const start = rooms[0];

  // --- pillars inside big rooms (kept only if they don't cut the map)
  let total = reachCount(start.cx, start.cy);
  for (const r of rooms) {
    if (r === start || r.w < 8 || r.h < 7 || R() < 0.35) continue;
    const pts = [[r.x + 2, r.y + 2], [r.x + r.w - 3, r.y + 2], [r.x + 2, r.y + r.h - 3], [r.x + r.w - 3, r.y + r.h - 3]];
    for (const [px, py] of pts) {
      if (at(px, py) !== T.FLOOR) continue;
      set(px, py, T.WALL);
      const c = reachCount(start.cx, start.cy);
      if (c !== total - 1) set(px, py, T.FLOOR); else total = c;
    }
  }

  // --- exit in farthest room
  const d0 = bfs(start.cx, start.cy, true);
  let exitRoom = rooms[1], far = -1;
  for (const r of rooms) { const d = d0[r.cy * W + r.cx]; if (r !== start && d > far) { far = d; exitRoom = r; } }
  set(exitRoom.cx, exitRoom.cy, T.EXIT);

  // --- locked rooms
  const locked = [];
  if (num >= 2 && R() < 0.7) locked.push(exitRoom);
  const cands = shuffle(rooms.filter(r => r !== start && r !== exitRoom && r.w * r.h >= 20), R);
  const nTreasure = Math.min(cands.length, ri(1, 2) + Math.floor(num / 5));
  for (let i = 0; i < nTreasure; i++) { cands[i].treasure = true; locked.push(cands[i]); }
  for (const r of locked) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (at(x, r.y - 1) === T.FLOOR) set(x, r.y - 1, T.DOOR);
      if (at(x, r.y + r.h) === T.FLOOR) set(x, r.y + r.h, T.DOOR);
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      if (at(r.x - 1, y) === T.FLOOR) set(r.x - 1, y, T.DOOR);
      if (at(r.x + r.w, y) === T.FLOOR) set(r.x + r.w, y, T.DOOR);
    }
  }

  // Count door groups; one key per group, all placed in the area reachable
  // from the start without opening anything -> always solvable.
  let groups = 0;
  const seen = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (tiles[i] !== T.DOOR || seen[i]) continue;
    groups++;
    const st = [i]; seen[i] = 1;
    while (st.length) {
      const j = st.pop(), x = j % W, y = (j / W) | 0;
      for (const [dx, dy] of DIR4) {
        const n = (y + dy) * W + x + dx;
        if (at(x + dx, y + dy) === T.DOOR && !seen[n]) { seen[n] = 1; st.push(n); }
      }
    }
  }

  const occ = new Uint8Array(W * H);
  occ[exitRoom.cy * W + exitRoom.cx] = 1;
  for (let y = start.y - 1; y <= start.y + start.h; y++) for (let x = start.x - 1; x <= start.x + start.w; x++) if (x >= 0 && y >= 0 && x < W && y < H) occ[y * W + x] = 2;

  const items = [];
  const region0 = bfs(start.cx, start.cy, false);
  const keyTiles = [];
  for (let i = 0; i < W * H; i++) if (region0[i] >= 6 && tiles[i] === T.FLOOR && !occ[i]) keyTiles.push(i);
  if (!keyTiles.length) for (let i = 0; i < W * H; i++) if (region0[i] >= 1 && tiles[i] === T.FLOOR && occ[i] !== 1) keyTiles.push(i);
  shuffle(keyTiles, R);
  for (let k = 0; k < groups && keyTiles.length; k++) {
    const i = keyTiles.pop();
    occ[i] = 1;
    items.push({ kind: 'key', x: i % W, y: (i / W) | 0 });
  }

  // Random free tile inside a room matching a filter.
  const roomTile = (roomFilter, minDist = 0) => {
    const pool = rooms.filter(roomFilter);
    if (!pool.length) return null;
    for (let a = 0; a < 80; a++) {
      const r = pickR(pool);
      const x = ri(r.x, r.x + r.w - 1), y = ri(r.y, r.y + r.h - 1), i = y * W + x;
      if (tiles[i] !== T.FLOOR || occ[i]) continue;
      if (minDist && (x - start.cx) ** 2 + (y - start.cy) ** 2 < minDist * minDist) continue;
      occ[i] = 1;
      return { x, y };
    }
    return null;
  };
  const notStart = r => r !== start;
  const open = r => r !== start && !r.treasure;

  // --- generators & enemies
  const pool = ['ghost', 'grunt'];
  if (num >= 2) pool.push('demon');
  if (num >= 3) pool.push('lobber');
  if (num >= 4) pool.push('sorcerer');
  const tierRoll = () => 1 + (R() < Math.min(0.15 * num, 0.7) ? 1 : 0) + (R() < Math.min(0.07 * num, 0.5) ? 1 : 0);
  const generators = [];
  const nGen = Math.min(3 + Math.floor(num * 1.2) + (playerCount - 1), 20);
  for (let i = 0; i < nGen; i++) {
    const p = roomTile(notStart, 9);
    if (p) generators.push({ ...p, type: pickR(pool), tier: tierRoll() });
  }
  if (num >= 5 && R() < 0.35) {
    const p = roomTile(open, 12);
    if (p) generators.push({ ...p, type: 'death', tier: 1 });
  }
  const enemies = [];
  const nEn = 3 + num * 2;
  for (let i = 0; i < nEn; i++) {
    const p = roomTile(notStart, 8);
    if (p) enemies.push({ ...p, type: pickR(pool), tier: tierRoll() });
  }

  // --- loot
  const put = (kind, filter, sub) => { const p = roomTile(filter); if (p) items.push({ kind, sub, ...p }); };
  const nFood = ri(3, 5);
  for (let i = 0; i < nFood; i++) put(R() < 0.5 ? 'meat' : 'cider', notStart);
  const nPot = ri(1, 2);
  for (let i = 0; i < nPot; i++) put('potion', notStart);
  const nTre = ri(4, 8);
  for (let i = 0; i < nTre; i++) put(R() < 0.15 ? 'chest' : 'treasure', open);
  if (R() < 0.35 + num * 0.03) put('amulet', open, pickR(AMULETS));
  for (const r of rooms.filter(r => r.treasure)) {
    const only = x => x === r;
    const n = ri(4, 7);
    for (let i = 0; i < n; i++) put(R() < 0.3 ? 'chest' : 'treasure', only);
    put(R() < 0.5 ? 'meat' : 'cider', only);
    put('potion', only);
    if (R() < 0.5) put('amulet', only, pickR(AMULETS));
    if (R() < 0.3) put('key', only);
  }

  // --- torches on the wall above each room
  const torches = [];
  for (const r of rooms) {
    let last = -99;
    for (let x = r.x; x < r.x + r.w; x++) {
      if (at(x, r.y - 1) === T.WALL && x - last >= 3 && R() < 0.3) { torches.push({ x, y: r.y - 1 }); last = x; }
    }
  }

  return {
    W, H, tiles, rooms, num, seed,
    start: { x: start.cx, y: start.cy },
    exit: { x: exitRoom.cx, y: exitRoom.cy },
    generators, enemies, items, torches,
  };
}

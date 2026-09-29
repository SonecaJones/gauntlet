// Procedural 32-bit pixel sprites (from the pixel-art test).

let W = 48, H = 56;
const SS = 4;
// hue-shifted 5-tone ramps, dark -> light
const RAMPS = {
  ghost: ['#2a2a5a', '#5a64a8', '#8e9ee0', '#c4d0f8', '#f4f8ff'],
  void:  ['#08040e', '#10081a', '#1a1028', '#241634', '#2e1c40'],
  skin:  ['#4a2034', '#8e4448', '#c8704e', '#eca274', '#ffd6ae'],
  steel: ['#221e38', '#454a6e', '#7682a6', '#b0bed8', '#eef6ff'],
  ivory: ['#40302e', '#806450', '#bc9c76', '#e6d2a6', '#fff8ea'],
  beard: ['#4a1c10', '#8a3a14', '#c8681c', '#f0a030', '#ffd870'],
  red:   ['#2a0a24', '#58102e', '#8e1a34', '#c42c40', '#ec5658'],
  cape:  ['#200616', '#420e28', '#661832', '#8e2840', '#b23e4e'],
  leath: ['#261214', '#4a2418', '#723e20', '#9e5e2c', '#c68842'],
  gold:  ['#562c10', '#966018', '#cc9828', '#f6ce4e', '#fff8b0'],
  boots: ['#1a1226', '#32263c', '#4c3e56', '#6c5e76', '#928aa0'],
  wood:  ['#2a160e', '#4c2c16', '#724422', '#986432', '#be8a4e'],
};
const MATS = Object.keys(RAMPS);
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RAMP_RGB = Object.fromEntries(MATS.map(m => [m, RAMPS[m].map(hex)]));

// Warrior built from lit shapes, in 48x56 "art pixel" units.
export function warrior(frame) {
  const step = [0, 1, 0, -1][frame % 4];
  const bob = frame % 2 ? -0.6 : 0;
  const S = [];
  const add = (mat, path, box) => S.push({ mat, path, box });
  const poly = pts => g => { g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); };
  const ell = (cx, cy, rx, ry) => g => g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  const rr = (x, y, w, h, r) => g => g.roundRect(x, y, w, h, r);
  const cap = (x0, y0, x1, y1, r) => g => {
    const a = Math.atan2(y1 - y0, x1 - x0);
    g.arc(x0, y0, r, a + Math.PI / 2, a - Math.PI / 2);
    g.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2);
  };
  const y = v => v + bob;
  add('cape', poly([[14, y(22)], [34, y(22)], [38, y(47)], [10, y(47)]]), [10, 22, 28, 25]);
  // legs + boots (walk cycle)
  add('boots', rr(16, y(41) + step, 7, 9, 2), [16, 41, 7, 9]);
  add('boots', rr(25, y(41) - step, 7, 9, 2), [25, 41, 7, 9]);
  add('boots', rr(14.5, y(48) + step, 9.5, 6, 2.5), [14, 48, 10, 6]);
  add('boots', rr(24.5, y(48) - step, 9.5, 6, 2.5), [24, 48, 10, 6]);
  // tunic
  add('red', g => { g.moveTo(13, y(25)); g.quadraticCurveTo(24, y(21), 35, y(25)); g.lineTo(35, y(44)); g.quadraticCurveTo(24, y(47), 13, y(44)); g.closePath(); }, [13, 22, 22, 25]);
  add('leath', rr(13.5, y(36.5), 21, 4, 1), [13, 36, 21, 4]);
  add('gold', rr(21.5, y(36), 5, 5, 1), [21, 36, 5, 5]);
  // arms
  add('red', cap(13, y(26), 11, y(31), 3.6), [8, 23, 8, 11]);
  add('skin', cap(11, y(31), 10.5, y(38) - step * 0.5, 3), [7, 29, 7, 12]);
  add('leath', cap(10.8, y(35), 10.6, y(37.5), 3.2), [7, 33, 7, 7]);
  add('red', cap(35, y(26), 37, y(31), 3.6), [32, 23, 8, 11]);
  add('skin', cap(37, y(31), 38, y(37), 3), [34, 29, 7, 11]);
  // axe
  add('wood', cap(41, y(13), 38, y(47), 1.3), [36, 12, 6, 36]);
  add('steel', g => { g.moveTo(40.5, y(10)); g.quadraticCurveTo(49, y(6), 47.5, y(15)); g.quadraticCurveTo(49, y(24), 40.5, y(20)); g.closePath(); }, [40, 6, 9, 18]);
  add('skin', ell(38.3, y(37.5), 2.8, 2.6), [35, 35, 6, 6]);
  // head
  add('skin', ell(24, y(20.5), 6.8, 6.4), [17, 14, 14, 13]);
  add('beard', g => { g.ellipse(24, y(30), 7.2, 5, 0, 0, Math.PI * 2); g.moveTo(18.5, y(31)); g.lineTo(24, y(39)); g.lineTo(29.5, y(31)); }, [16, 25, 16, 14]);
  add('beard', g => { g.ellipse(21.3, y(26.3), 3, 1.5, 0.25, 0, Math.PI * 2); g.ellipse(26.7, y(26.3), 3, 1.5, -0.25, 0, Math.PI * 2); }, [18, 25, 12, 3]);
  add('skin', ell(24, y(24.5), 1.3, 1.4), [22.5, 23, 3, 3]);
  // helmet
  add('steel', g => g.ellipse(24, y(17.5), 8.4, 7.6, 0, Math.PI, 0), [15.6, 10, 16.8, 8]);
  add('steel', rr(15, y(16.5), 18, 3, 1.2), [15, 16, 18, 3]);
  add('steel', rr(23, y(16.5), 2, 6.5, 0.8), [23, 16, 2, 7]);
  add('gold', ell(24, y(12), 1.5, 1.5), [22, 10, 3, 3]);
  // horns
  add('ivory', g => { g.moveTo(17, y(15)); g.quadraticCurveTo(9, y(14), 7.5, y(4)); g.quadraticCurveTo(12, y(10), 18.5, y(12)); g.closePath(); }, [7, 4, 12, 11]);
  add('ivory', g => { g.moveTo(31, y(15)); g.quadraticCurveTo(39, y(14), 40.5, y(4)); g.quadraticCurveTo(36, y(10), 29.5, y(12)); g.closePath(); }, [29, 4, 12, 11]);
  const decals = [[21, Math.round(21.5 + bob), 'eye'], [26, Math.round(21.5 + bob), 'eye']];
  return { shapes: S, decals };
}

export function pixelize(model) {
  W = model.w || 48; H = model.h || 56;
  const hi = document.createElement('canvas'); hi.width = W * SS; hi.height = H * SS;
  const idc = hi.getContext('2d', { willReadFrequently: true });
  const li = document.createElement('canvas'); li.width = W * SS; li.height = H * SS;
  const lc = li.getContext('2d', { willReadFrequently: true });
  idc.scale(SS, SS); lc.scale(SS, SS);
  lc.fillStyle = '#000'; lc.fillRect(0, 0, W, H);
  model.shapes.forEach((s, i) => {
    idc.beginPath(); s.path(idc); idc.fillStyle = 'rgb(' + (i + 1) + ',0,0)'; idc.fill();
    const [bx, by, bw, bh] = s.box;
    const gr = lc.createRadialGradient(bx + bw * 0.28, by + bh * 0.22, 0, bx + bw * 0.28, by + bh * 0.22, Math.max(bw, bh) * 1.15);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#aaa'); gr.addColorStop(1, '#222');
    lc.beginPath(); s.path(lc); lc.fillStyle = gr; lc.fill();
  });
  const ids = idc.getImageData(0, 0, W * SS, H * SS).data, lum = lc.getImageData(0, 0, W * SS, H * SS).data;
  const shapeAt = new Int16Array(W * H).fill(-1), light = new Float32Array(W * H);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const count = new Map(), sum = new Map();
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = ((py * SS + sy) * W * SS + px * SS + sx) * 4;
      if (ids[o + 3] < 250 || ids[o + 1] || ids[o + 2]) continue;
      const id = ids[o] - 1;
      if (id < 0) continue;
      count.set(id, (count.get(id) || 0) + 1);
      sum.set(id, (sum.get(id) || 0) + lum[o] / 255);
    }
    let best = -1, bc = 0;
    for (const [id, c] of count) if (c > bc) { bc = c; best = id; }
    if (best >= 0 && bc >= 5) { shapeAt[py * W + px] = best; light[py * W + px] = sum.get(best) / bc; }
  }
  const bayer = [[0, 0.5], [0.75, 0.25]];
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const oc = out.getContext('2d'), img = oc.createImageData(W, H), d = img.data;
  const matOf = i => model.shapes[i].mat;
  const put = (x, y, rgb) => { const o = (y * W + x) * 4; d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = shapeAt[y * W + x];
    if (id >= 0) {
      const ramp = RAMP_RGB[matOf(id)];
      let t = light[y * W + x] * 3.2 + 0.6 + (bayer[y & 1][x & 1] - 0.4) * 0.22;
      const up = y > 0 ? shapeAt[(y - 1) * W + x] : -1;
      if (up !== id && up >= 0 && matOf(up) !== matOf(id)) t -= 0.9;      // contact shadow under other parts
      if (up < 0) t += 0.6;                                                 // rim light on top edges
      put(x, y, ramp[Math.max(1, Math.min(4, Math.round(t)))]);
    } else {
      // coloured outline (sel-out): darkest tone of the neighbouring material
      let n = -1;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && shapeAt[yy * W + xx] >= 0) { n = shapeAt[yy * W + xx]; break; }
      }
      if (n >= 0) put(x, y, RAMP_RGB[matOf(n)][0]);
    }
  }
  for (const [x, y] of model.decals) { put(x, y, hex('#1c1024')); put(x, y + 1, hex('#1c1024')); put(x + (x < W / 2 ? 1 : -1), y, hex('#ffffff')); put(x, y - 1, RAMP_RGB.skin[1]); }
  oc.putImageData(img, 0, 0);
  return out;
}


// Ghost in the same procedural 32-bit style (32x32).
export function ghost(frame) {
  const w = Math.sin(frame * Math.PI / 2) * 1.2;
  const S = [];
  S.push({ mat: 'ghost', box: [5, 3, 22, 26], path: g => {
    g.moveTo(5, 16); g.bezierCurveTo(5, 1, 27, 1, 27, 16); g.lineTo(27, 27 + w);
    for (let i = 0; i < 4; i++) { const x = 27 - (i + 1) * 5.5; g.quadraticCurveTo(x + 2.75, 30 - w * (i % 2 ? 1 : -1), x, 27 + w); }
    g.closePath(); } });
  S.push({ mat: 'void', box: [10, 11, 5, 7], path: g => g.ellipse(12.5, 14.5, 2.4, 3.3, 0, 0, Math.PI * 2) });
  S.push({ mat: 'void', box: [17, 11, 5, 7], path: g => g.ellipse(19.5, 14.5, 2.4, 3.3, 0, 0, Math.PI * 2) });
  S.push({ mat: 'void', box: [13, 20, 6, 5], path: g => g.ellipse(16, 22, 2.6, 2 + Math.abs(w) * 0.5, 0, 0, Math.PI * 2) });
  return { shapes: S, decals: [], w: 32, h: 32 };
}

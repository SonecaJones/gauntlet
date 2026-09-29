import { HEROES, HERO_ORDER, PERKS } from './heroes.js';
import { Game } from './game.js';
import { Net } from './net.js';
import { drawHero } from './render.js';
import { txt, wrap, panel, hit, handleClicks, drawHud, layoutTouch, drawTouch, playerColor, PIX, SERIF } from './ui.js';
import { t, heroName, deviceName, setLang, getLang } from './i18n.js';
import { shuffle, formatTime } from './util.js';

function background(ctx, app, embers) {
  const { vw, vh } = app;
  const g = ctx.createRadialGradient(vw / 2, vh * 0.45, 10, vw / 2, vh * 0.45, Math.max(vw, vh) * 0.8);
  g.addColorStop(0, '#2a1438');
  g.addColorStop(0.5, '#120a1c');
  g.addColorStop(1, '#040208');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
  if (embers) {
    ctx.globalCompositeOperation = 'lighter';
    for (const e of embers) {
      ctx.globalAlpha = Math.min(1, e.life) * 0.8;
      ctx.fillStyle = e.c;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function updateEmbers(embers, app, dt) {
  if (embers.length < 90 && Math.random() < 0.6) {
    embers.push({ x: Math.random() * app.vw, y: app.vh + 10, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 60, life: 3 + Math.random() * 4, s: 1 + Math.random() * 2.5, c: Math.random() < 0.7 ? '#ff8a3a' : '#ffd35a' });
  }
  for (const e of embers) { e.x += e.vx * dt + Math.sin(e.y * 0.02) * 0.3; e.y += e.vy * dt; e.life -= dt; }
  for (let i = embers.length - 1; i >= 0; i--) if (embers[i].life <= 0) embers.splice(i, 1);
}

const fakeHero = (key, x, y, time, facing = Math.PI / 2, moving = true) => ({
  hero: HEROES[key], x, y, facing, moving, walk: time, hurt: 0, buffs: {}, spinT: 0,
});

// Room code badge shown in online lobbies.
function roomBadge(ctx, app) {
  const net = app.net;
  if (!net) return;
  const { vw } = app;
  const w = Math.min(260, vw - 130);
  panel(ctx, vw - w - 10, 8, w, 44, 'rgba(20,12,34,0.9)', '#7ad0ff88');
  if (net.status !== 'ready') { txt(ctx, t(net.role === 'host' ? 'creating' : 'connecting'), vw - w / 2 - 10, 24, 8, '#7ad0ff', 'center'); return; }
  txt(ctx, t('room', { code: net.code }), vw - w / 2 - 10, 15, 12, '#7ad0ff', 'center');
  if (net.role === 'host') {
    const url = net.inviteUrl();
    const lines = wrap(ctx, url, w - 12, 5);
    txt(ctx, lines[0] + (lines.length > 1 ? '…' : ''), vw - w / 2 - 10, 35, 5, '#b8c8e0', 'center');
  } else txt(ctx, t('online_guest'), vw - w / 2 - 10, 35, 6, '#b8c8e0', 'center');
}

// ================================================================== title
const MENU = ['menu_local', 'menu_host', 'menu_join'];

export class TitleScreen {
  constructor(app, message = null) {
    this.app = app;
    this.t = 0;
    this.sel = 0;
    this.message = message;
    this.embers = [];
    this.buttons = [];
    app.audio.startMusic('title');
  }
  update(dt) {
    this.t += dt;
    updateEmbers(this.embers, this.app, dt);
    const inp = this.app.input;
    if (this.t < 0.3) return;
    handleClicks(this.buttons, inp.clicks);
    if (this.done) return;
    for (const id in inp.controllers) {
      const c = inp.controllers[id];
      if (c.up) { this.sel = (this.sel + MENU.length - 1) % MENU.length; this.app.audio.play('select'); }
      if (c.down) { this.sel = (this.sel + 1) % MENU.length; this.app.audio.play('select'); }
      if (c.confirm || c.start) { this.activate(this.sel, id); return; }
    }
  }
  activate(i, id) {
    if (this.done) return;
    this.done = true;
    const app = this.app;
    app.audio.unlock();
    app.audio.play('confirm');
    if (i === 0) { app.setScreen(new SelectScreen(app, id)); return; }
    if (i === 2) { app.setScreen(new JoinScreen(app, id)); return; }
    const net = new Net(app);
    app.net = net;
    app.setScreen(new SelectScreen(app, id, 'host'));
    net.host().catch(() => {
      if (app.net === net) app.net = null;
      app.setScreen(new TitleScreen(app, t('net_fail')));
    });
  }
  draw(ctx) {
    const app = this.app, { vw, vh } = app;
    const sf = app.safe;
    this.buttons = [];
    background(ctx, app, this.embers);
    const short = vh < 520;
    const size = Math.min(vw * 0.13, 110, vh * (short ? 0.15 : 0.13));
    let y = Math.max(sf.t + (short ? 10 : 0), vh * (short ? 0.03 : 0.08));
    ctx.save();
    ctx.shadowColor = 'rgba(255,140,40,0.7)';
    ctx.shadowBlur = 30;
    ctx.font = `900 ${size}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const g = ctx.createLinearGradient(0, y, 0, y + size);
    g.addColorStop(0, '#fff2b0');
    g.addColorStop(0.5, '#ffb030');
    g.addColorStop(1, '#a04010');
    ctx.fillStyle = g;
    ctx.fillText('GAUNTLET', vw / 2, y);
    ctx.restore();
    y += size * 1.08;
    const subSize = Math.min(22, vw / 26, vh / 26);
    txt(ctx, t('subtitle'), vw / 2, y, subSize, '#ffd9a0', 'center');
    y += subSize + 12;
    if (!short) { txt(ctx, t('tagline'), vw / 2, y, Math.min(10, vw / 60), '#b8a8d0', 'center'); y += 22; }

    // hero line-up (left of the menu on short landscape screens)
    const menuW = Math.min(340, vw - 40);
    const side = short && vw > 640;
    const hs = side ? Math.min(2.2, vh / 200) : Math.min(2.6, vw / 300, vh / 300);
    if (!short || side) {
      const cx = side ? (vw - menuW - Math.max(24, sf.r + 12) + sf.l) / 2 : vw / 2;
      const baseY = side ? y + 60 * hs * 0.5 + 30 : y + 34 * hs;
      const spread = side ? 30 : 60;
      HERO_ORDER.forEach((k, i) => {
        const x = cx + (i - 1.5) * spread * hs;
        ctx.save();
        ctx.translate(side ? x : x, side ? baseY + (i % 2) * 18 * hs : baseY);
        ctx.scale(hs, hs);
        drawHero(ctx, fakeHero(k, 0, 0, this.t + i * 0.3), this.t);
        ctx.restore();
      });
      if (!side) y = baseY + 26 * hs;
    }

    // menu
    const mh = short ? 32 : 36;
    let my = y + 6;
    const mx = side ? vw - menuW - Math.max(24, sf.r + 12) : (vw - menuW) / 2;
    MENU.forEach((key, i) => {
      const sel = i === this.sel;
      panel(ctx, mx, my, menuW, mh, sel ? 'rgba(70,40,20,0.92)' : 'rgba(16,10,28,0.8)', sel ? '#ffd35a' : 'rgba(255,255,255,0.15)', 8);
      txt(ctx, (sel ? '▶ ' : '') + t(key), mx + menuW / 2, my + mh / 2 - 5, Math.min(11, vw / 34), sel ? '#ffe9a0' : '#ddd', 'center');
      hit(this.buttons, mx, my, menuW, mh, src => { this.sel = i; this.activate(i, src); });
      my += mh + 8;
    });
    const msgs = [];
    if (this.message) msgs.push([this.message, '#ff8a6a']);
    if (app.isTouch && vh > vw * 1.15) msgs.push([t('rotate_hint'), '#7ad0ff']);
    for (const [m, c] of msgs) for (const l of wrap(ctx, m, menuW, 8)) { txt(ctx, l, mx + menuW / 2, my + 2, 8, c, 'center'); my += 14; }

    const lines = app.isTouch ? [t('ctrl_touch')] : [t('ctrl_kb'), t('ctrl_pad')];
    const wrapped = lines.flatMap(l => wrap(ctx, l, vw - 40, 6));
    let cy = Math.max(my + 10, vh - sf.b - 12 - wrapped.length * 11);
    if (cy + wrapped.length * 11 <= vh) for (const w of wrapped) { txt(ctx, w, vw / 2, cy, 6, '#9a8ab8', 'center'); cy += 11; }

    const best = app.scores[0];
    if (best) txt(ctx, t('best', { n: best.score }), vw - 14 - sf.r, 14 + sf.t, 8, '#ffd35a', 'right');

    const label = getLang() === 'pt' ? 'PT | en' : 'pt | EN';
    const lx = 10 + sf.l, ly = 8 + sf.t;
    panel(ctx, lx, ly, 84, 26);
    txt(ctx, label, lx + 42, ly + 8, 8, '#fff', 'center');
    hit(this.buttons, lx, ly, 84, 26, () => {
      const nl = getLang() === 'pt' ? 'en' : 'pt';
      setLang(nl); app.settings.lang = nl; app.saveSettings();
      app.audio.play('select');
    });
    if (app.isTouch && app.canFullscreen) {
      const fx = lx + 94;
      panel(ctx, fx, ly, 40, 26);
      txt(ctx, app.isFullscreen ? '⤡' : '⤢', fx + 20, ly + 5, 14, '#fff', 'center', 'sans-serif');
      hit(this.buttons, fx, ly, 40, 26, () => app.toggleFullscreen());
    }
  }
}

// ================================================================== join
export class JoinScreen {
  constructor(app, _id, code = '') {
    this.app = app;
    this.t = 0;
    this.embers = [];
    this.buttons = [];
    this.status = '';
    const box = (this.box = document.createElement('div'));
    box.style.cssText = 'position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);display:flex;gap:8px;z-index:5;';
    const input = (this.inputEl = document.createElement('input'));
    input.id = 'room-code';
    input.maxLength = 4;
    input.value = code;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', t('enter_code'));
    input.style.cssText = 'width:7ch;font:24px "Press Start 2P",monospace;text-transform:uppercase;text-align:center;padding:12px;background:#140c22;color:#ffe9a0;border:2px solid #ffd35a;border-radius:8px;outline:none;';
    const btn = document.createElement('button');
    btn.textContent = t('join_btn');
    btn.style.cssText = 'font:12px "Press Start 2P",monospace;padding:0 16px;background:#ffd35a;color:#140c22;border:0;border-radius:8px;cursor:pointer;';
    btn.onclick = () => this.submit();
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.submit();
      if (e.key === 'Escape') this.back();
    });
    input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    box.append(input, btn);
    document.body.append(box);
    setTimeout(() => input.focus(), 50);
    if (code.length === 4) this.submit();
  }
  leave() { this.box.remove(); }
  back() { this.app.setScreen(new TitleScreen(this.app)); }
  submit() {
    const code = this.inputEl.value.trim().toUpperCase();
    if (code.length !== 4 || this.app.net) return;
    this.status = t('connecting');
    const net = new Net(this.app);
    this.app.net = net;
    net.onError = msg => { this.status = msg; };
    net.join(code).catch(() => {
      if (this.app.net === net) this.app.net = null;
      this.status = t('net_fail');
    });
  }
  update(dt) {
    this.t += dt;
    updateEmbers(this.embers, this.app, dt);
    handleClicks(this.buttons, this.app.input.clicks);
    const net = this.app.net;
    if (net && net.status === 'ready') this.status = t('waiting_host');
    for (const id in this.app.input.controllers) {
      const c = this.app.input.controllers[id];
      if (c.back && (id.startsWith('pad') || document.activeElement !== this.inputEl)) { this.back(); return; }
    }
  }
  draw(ctx) {
    const { vw, vh } = this.app;
    this.buttons = [];
    background(ctx, this.app, this.embers);
    txt(ctx, t('menu_join'), vw / 2, vh * 0.1, Math.min(20, vw / 26), '#ffd35a', 'center');
    txt(ctx, t('enter_code'), vw / 2, vh * 0.1 + 36, 9, '#cfc0e8', 'center');
    let y = vh * 0.38 + 50;
    for (const l of wrap(ctx, this.status, vw - 40, 8)) { txt(ctx, l, vw / 2, y, 8, '#7ad0ff', 'center'); y += 14; }
    panel(ctx, 10, 10, 90, 28);
    txt(ctx, '◀ ' + t('back'), 55, 19, 8, '#fff', 'center');
    hit(this.buttons, 10, 10, 90, 28, () => this.back());
  }
}

// ================================================================== select
// mode: 'local' | 'host' (online lobby owner) | 'client' (mirrors the host lobby)
export class SelectScreen {
  constructor(app, firstId, mode = 'local') {
    this.app = app;
    this.mode = mode;
    this.t = 0;
    this.slots = [];
    this.countdown = null;
    this.buttons = [];
    this.embers = [];
    if (firstId && mode !== 'client') this.join(firstId);
  }
  taken(i, except) { return this.slots.some(s => s !== except && s.ready && s.cursor === i); }
  freeFrom(i, dir, slot) {
    for (let k = 0; k < 4; k++) {
      const j = (i + dir * k + 8) % 4;
      if (!this.taken(j, slot)) return j;
    }
    return i;
  }
  join(id, at) {
    if (this.slots.length >= 4 || this.slots.some(s => s.ctrlId === id)) return;
    const s = { ctrlId: id, cursor: 0, ready: false };
    s.cursor = at != null && !this.taken(at) ? at : this.freeFrom(this.slots.length % 4, 1, s);
    this.slots.push(s);
    this.countdown = null;
    this.app.audio.play('select');
  }
  lock(s) {
    if (this.taken(s.cursor, s)) { this.app.audio.play('back'); return; }
    s.ready = true;
    this.app.audio.play('confirm');
    this.app.audio.voice('hero', HERO_ORDER[s.cursor]);
    for (const o of this.slots) if (o !== s && !o.ready && o.cursor === s.cursor) o.cursor = this.freeFrom(o.cursor, 1, o);
  }
  clickCard(i, src) {
    if (this.mode === 'client') { this.app.net?.up({ k: 'click', i }); return; }
    const s = this.slots.find(x => x.ctrlId === src);
    if (!s) { this.join(src, i); return; }
    if (s.ready) { if (s.cursor !== i) { s.ready = false; s.cursor = i; } return; }
    if (s.cursor === i) this.lock(s);
    else if (!this.taken(i, s)) { s.cursor = i; this.app.audio.play('select'); }
  }
  remoteClick(ctrlId, i) { if (typeof i === 'number' && i >= 0 && i < 4) this.clickCard(i, ctrlId); }
  removeCtrl(ctrlId) {
    const i = this.slots.findIndex(s => s.ctrlId === ctrlId);
    if (i >= 0) { this.slots.splice(i, 1); this.countdown = null; }
  }
  update(dt) {
    this.t += dt;
    updateEmbers(this.embers, this.app, dt);
    const inp = this.app.input;
    handleClicks(this.buttons, inp.clicks);
    if (this.left || this.mode === 'client') return;
    for (const id in inp.controllers) {
      const c = inp.controllers[id];
      const s = this.slots.find(x => x.ctrlId === id);
      const local = !id.startsWith('net');
      if (!s) {
        if ((c.confirm || c.start) && this.t > 0.2) this.join(id);
        else if (c.back && local && !this.slots.some(x => !x.ctrlId.startsWith('net'))) { this.back(); return; }
        continue;
      }
      if (!s.ready) {
        if (c.left || c.up) { s.cursor = this.freeFrom((s.cursor + 3) % 4, -1, s); this.app.audio.play('select'); }
        if (c.right || c.down) { s.cursor = this.freeFrom((s.cursor + 1) % 4, 1, s); this.app.audio.play('select'); }
        if (c.confirm && this.t > 0.2) this.lock(s);
        else if (c.back) {
          this.slots.splice(this.slots.indexOf(s), 1);
          this.app.audio.play('back');
          if (local && !this.slots.some(x => !x.ctrlId.startsWith('net'))) { this.back(); return; }
        }
      } else if (c.back) { s.ready = false; this.countdown = null; this.app.audio.play('back'); }
      else if (c.start && local && this.mode === 'host') { this.tryStart(); return; }
    }
    // Local games start by themselves; online hosts press COMEÇAR so guests have time to join.
    if (this.mode === 'local' && this.slots.length && this.slots.every(s => s.ready)) {
      if (this.countdown == null) this.countdown = 1.6;
      this.countdown -= dt;
      if (this.countdown <= 0) this.start();
    } else this.countdown = null;
  }
  canStart() { return this.app.net?.status === 'ready' && this.slots.some(s => s.ready); }
  tryStart() {
    if (!this.canStart()) { this.app.audio.play('back'); return; }
    this.app.audio.play('confirm');
    this.start();
  }
  back() { this.left = true; this.app.audio.play('back'); this.app.setScreen(new TitleScreen(this.app)); }
  start() {
    const app = this.app;
    const slots = this.mode === 'host' ? this.slots.filter(s => s.ready) : this.slots;
    const specs = slots.map(s => ({ ctrlId: s.ctrlId, hero: HERO_ORDER[s.cursor] }));
    const opts = this.mode === 'host' ? { record: true, onLevel: g => app.net?.sendLevel(g) } : {};
    // Remember everyone's pick so late joiners get the hero they chose.
    opts.prefs = Object.fromEntries(this.slots.map(s => [s.ctrlId, HERO_ORDER[s.cursor]]));
    app.setScreen(new PlayScreen(app, new Game(app, specs, opts)));
  }
  draw(ctx) {
    const { vw, vh } = this.app;
    const myCtrl = this.mode === 'client' ? this.app.net?.myCtrl : null;
    this.buttons = [];
    background(ctx, this.app, this.embers);
    const online = this.mode !== 'local';
    txt(ctx, t('select_title'), online && vw < 900 ? 110 : vw / 2, online && vw < 900 ? 52 : 22, Math.min(20, vw / 30), '#ffd35a', online && vw < 900 ? 'left' : 'center');
    const wide = vw > vh * 1.05;
    const cols = wide ? 4 : 2, rows = wide ? 1 : 2, gap = 14;
    const top = online ? 76 : 60;
    const cw = Math.min(250, (vw - 32 - gap * (cols - 1)) / cols);
    const ch = Math.min(wide ? 380 : 320, (vh - top - 90 - gap * (rows - 1)) / rows);
    const ox = (vw - cw * cols - gap * (cols - 1)) / 2, oy = top + Math.max(0, (vh - top - 90 - ch * rows - gap * (rows - 1)) / 2);
    HERO_ORDER.forEach((k, i) => {
      const H = HEROES[k];
      const x = ox + (i % cols) * (cw + gap), y = oy + Math.floor(i / cols) * (ch + gap);
      const here = this.slots.filter(s => s.cursor === i);
      const lockedBy = here.find(s => s.ready);
      const border = lockedBy ? playerColor(this.slots.indexOf(lockedBy)) : here.length ? '#ffffffaa' : 'rgba(255,255,255,0.12)';
      panel(ctx, x, y, cw, ch, lockedBy ? 'rgba(40,24,50,0.9)' : 'rgba(14,10,24,0.82)', border, 10);
      if (lockedBy) { ctx.lineWidth = 3; ctx.strokeStyle = border; ctx.stroke(); }
      hit(this.buttons, x, y, cw, ch, src => this.clickCard(i, src));
      const hs = Math.min(3.4, cw / 60, ch / 110);
      ctx.save();
      ctx.translate(x + cw / 2, y + 30 + 22 * hs);
      ctx.scale(hs, hs);
      drawHero(ctx, fakeHero(k, 0, 0, this.t, here.length ? Math.PI / 2 : Math.PI * 0.35, here.length > 0), this.t);
      ctx.restore();
      let ty = y + 40 + 36 * hs;
      const fs = cw < 170 ? 7 : 9;
      txt(ctx, heroName(k).toUpperCase(), x + cw / 2, ty, fs + 3, H.light, 'center');
      ty += fs + 9;
      txt(ctx, t('epi_' + k), x + cw / 2, ty, fs - 1, '#a898c0', 'center');
      ty += fs + 8;
      const bars = [['stat_speed', 'speed'], ['stat_armor', 'armor'], ['stat_shot', 'shot'], ['stat_magic', 'magic']];
      for (const [lbl, key] of bars) {
        if (ty > y + ch - 34) break;
        txt(ctx, t(lbl), x + 10, ty, fs - 2, '#ccc');
        for (let b = 0; b < 5; b++) {
          ctx.fillStyle = b < H.bars[key] ? H.color : 'rgba(255,255,255,0.12)';
          ctx.fillRect(x + cw - 10 - (5 - b) * (cw * 0.07), ty, cw * 0.06, fs - 2);
        }
        ty += fs + 4;
      }
      ty += 4;
      if (ty < y + ch - 38) { txt(ctx, `${t('special')}: ${t('sp_' + k)}`, x + 10, ty, fs - 2, '#ffd35a'); ty += fs + 6; }
      for (const l of wrap(ctx, t('desc_' + k), cw - 20, fs - 2)) {
        if (ty > y + ch - 34) break;
        txt(ctx, l, x + 10, ty, fs - 2, '#d8d0e8'); ty += fs + 3;
      }
      here.forEach((s, j) => {
        const pi = this.slots.indexOf(s);
        const cx = x + 8 + j * 46;
        panel(ctx, cx, y + 8, 42, 18, playerColor(pi), s.ctrlId === myCtrl ? '#fff' : null, 5);
        txt(ctx, s.ctrlId === myCtrl ? t('you') : `P${pi + 1}`, cx + 21, y + 13, s.ctrlId === myCtrl ? 6 : 8, '#111', 'center', PIX, false);
      });
      if (lockedBy) {
        ctx.fillStyle = playerColor(this.slots.indexOf(lockedBy));
        ctx.fillRect(x, y + ch - 26, cw, 26);
        txt(ctx, t('ready'), x + cw / 2, y + ch - 19, 10, '#111', 'center', PIX, false);
      } else if (here.length) {
        const a = 0.55 + Math.sin(this.t * 5) * 0.35;
        ctx.fillStyle = `rgba(255,211,90,${a * 0.25})`;
        ctx.fillRect(x, y + ch - 26, cw, 26);
        txt(ctx, t('tap_ready'), x + cw / 2, y + ch - 18, cw < 170 ? 6 : 7, '#ffe9a0', 'center');
      }
    });
    const sb = this.app.safe ? this.app.safe.b : 0;
    let fy = vh - 70 - sb;
    const devs = this.slots.map((s, i) => `P${i + 1}: ${deviceName(s.ctrlId)}`).join('   ');
    if (this.mode === 'host') {
      // start button for the room owner
      const ready = this.slots.filter(x => x.ready).length, ok = this.canStart();
      const bw = Math.min(360, vw - 40), bh = 38, bx = (vw - bw) / 2, by = vh - bh - 12 - sb;
      const label = !ok ? t('need_ready') : ready === this.slots.length ? '▶ ' + t('start_game') : '▶ ' + t('start_ready', { n: ready, m: this.slots.length });
      const pulse = ok ? 0.75 + Math.sin(this.t * 5) * 0.25 : 1;
      panel(ctx, bx, by, bw, bh, ok ? `rgba(90,60,10,${pulse})` : 'rgba(30,24,40,0.9)', ok ? '#ffd35a' : 'rgba(255,255,255,0.2)', 8);
      txt(ctx, label, vw / 2, by + 14, Math.min(10, vw / 40), ok ? '#ffe9a0' : '#9a8ab8', 'center');
      hit(this.buttons, bx, by, bw, bh, () => this.tryStart());
      fy = by - 36;
      if (devs) txt(ctx, devs, vw / 2, fy, 7, '#fff', 'center');
      for (const l of wrap(ctx, t('host_hint'), vw - 30, 6)) { fy += 12; txt(ctx, l, vw / 2, fy, 6, '#b8a8d0', 'center'); }
    } else {
      if (devs) for (const l of wrap(ctx, devs, vw - 30, 8)) { txt(ctx, l, vw / 2, fy, 8, '#fff', 'center'); fy += 14; }
      fy += 4;
      let hint = t('join_hint');
      if (this.countdown != null) hint = t('starting', { n: Math.ceil(this.countdown) });
      else if (this.mode === 'client' && this.slots.find(x => x.ctrlId === myCtrl)?.ready) hint = t('waiting_start');
      for (const l of wrap(ctx, hint, vw - 30, 8)) {
        txt(ctx, l, vw / 2, fy, 8, this.countdown != null ? '#ffd35a' : '#b8a8d0', 'center'); fy += 14;
      }
    }
    panel(ctx, 10, 10, 90, 28);
    txt(ctx, '◀ ' + t('back'), 55, 19, 8, '#fff', 'center');
    hit(this.buttons, 10, 10, 90, 28, () => this.back());
    roomBadge(ctx, this.app);
  }
}

// ================================================================== play
const PAUSE_ITEMS = ['resume', 'view3d', 'music', 'sfx', 'voice', 'shake', 'autoAim', 'fullscreen', 'language', 'quit'];

export class PlayScreen {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.paused = false;
    this.menu = 0;
    this.showMap = false;
    this.buttons = [];
    app.audio.startMusic(game.levelNum % 2 ? 'dungeonA' : 'dungeonB');
  }
  pause() { if (!this.paused) { this.paused = true; this.menu = 0; this.app.audio.play('select'); } }
  controllers() {
    const C = this.app.input.controllers, game = this.game;
    if (game.isClient) return this.app.net?.local ? [this.app.net.local] : [];
    return game.players.filter(p => !p.ctrlId.startsWith('net')).map(p => C[p.ctrlId]).filter(Boolean);
  }
  remoteClick() {}
  removeCtrl(ctrlId) { if (!this.game.isClient) this.game.removePlayer(ctrlId); }
  update(dt) {
    const inp = this.app.input, game = this.game;
    handleClicks(this.buttons, inp.clicks);
    const mine = this.controllers();
    game.localPaused = this.paused;
    if (this.paused) {
      this.updatePause(mine);
      if (game.isClient) game.update(dt);
      return;
    }
    if (mine.some(c => c.pause)) { this.pause(); return; }
    if (mine.some(c => c.map)) this.showMap = !this.showMap;
    game.update(dt);
    if (game.isClient) return;
    if (game.complete) this.app.setScreen(new IntermissionScreen(this.app, game));
    else if (game.gameOver) this.app.setScreen(new GameOverScreen(this.app, summarize(game)));
  }
  activate(item) {
    const s = this.app.settings, au = this.app.audio;
    switch (item) {
      case 'resume': this.paused = false; break;
      case 'music': s.music = !s.music; au.refreshMusic(); break;
      case 'sfx': s.sfx = !s.sfx; break;
      case 'voice': s.voice = !s.voice; if (!s.voice) window.speechSynthesis?.cancel(); break;
      case 'shake': s.shake = !s.shake; break;
      case 'autoAim': s.autoAim = !s.autoAim; break;
      case 'view3d': s.view3d = s.view3d === false; break;
      case 'fullscreen': this.app.toggleFullscreen(); break;
      case 'language': { const nl = getLang() === 'pt' ? 'en' : 'pt'; setLang(nl); s.lang = nl; break; }
      case 'quit': this.app.setScreen(new TitleScreen(this.app)); return;
    }
    this.app.saveSettings();
    au.play('select');
  }
  updatePause(mine) {
    for (const c of mine) {
      if (c.up) { this.menu = (this.menu + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length; this.app.audio.play('select'); }
      if (c.down) { this.menu = (this.menu + 1) % PAUSE_ITEMS.length; this.app.audio.play('select'); }
      if (c.confirm || ((c.left || c.right) && this.menu > 0 && this.menu < PAUSE_ITEMS.length - 1)) { this.activate(PAUSE_ITEMS[this.menu]); return; }
      if (c.back || c.pause) { this.paused = false; return; }
    }
  }
  draw(ctx) {
    const { vw, vh } = this.app, game = this.game;
    this.buttons = [];
    if (!game.level || (game.isClient && !game.players.length)) {
      background(ctx, this.app, null);
      txt(ctx, t('waiting_host'), vw / 2, vh / 2, 10, '#7ad0ff', 'center');
      return;
    }
    const v3 = this.app.view3d;
    if (v3 && v3.usable(this.app.settings)) {
      v3.render(game, this.app.settings);
      v3.drawn = true;
      ctx.clearRect(0, 0, vw, vh);
      v3.drawOverlay(ctx, game);
    } else game.draw(ctx, this.app.settings);
    drawHud(ctx, this.app, game, this.showMap);
    const me = game.isClient ? game.me : game.players.find(p => p.ctrlId === 'touch');
    if (this.app.input.touchActive) {
      layoutTouch(this.app);
      drawTouch(ctx, this.app, me);
    } else this.app.input.touchButtons = [];
    if (game.isClient && !game.me) {
      // Spectator: a tappable join button (phones have no ENTER/START).
      const full = game.players.length >= 4;
      const bw = Math.min(320, vw - 60), bh = 48, bx = (vw - bw) / 2, by = vh * 0.6;
      let ty = by - 14;
      for (const l of wrap(ctx, t(full ? 'game_full' : 'press_join'), vw - 40, 8).reverse()) { txt(ctx, l, vw / 2, ty, 8, '#e8e0ff', 'center'); ty -= 14; }
      if (!full) {
        const pulse = 0.75 + Math.sin(game.time * 5) * 0.25;
        panel(ctx, bx, by, bw, bh, `rgba(90,60,10,${pulse})`, '#ffd35a', 10);
        txt(ctx, '▶ ' + t('join_game'), vw / 2, by + 18, 11, '#ffe9a0', 'center');
        hit(this.buttons, bx, by, bw, bh, () => { if (this.app.net) this.app.net.wantJoin = true; this.app.audio.play('confirm'); });
      }
    }
    const hostPaused = game.isClient ? game.hostPaused : false;
    if (hostPaused && !this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, vw, vh);
      txt(ctx, t('host_paused'), vw / 2, vh / 2 - 8, 14, '#ffd35a', 'center');
    }
    if (!this.paused) return;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, vw, vh);
    const rh = Math.min(34, (vh - 110) / PAUSE_ITEMS.length);
    const w = Math.min(380, vw - 30), h = 70 + PAUSE_ITEMS.length * rh + (game.isClient ? 20 : 0);
    const x = (vw - w) / 2, y = (vh - h) / 2;
    panel(ctx, x, y, w, h, 'rgba(16,10,28,0.95)', '#ffd35a88', 12);
    txt(ctx, t('paused'), vw / 2, y + 18, 16, '#ffd35a', 'center');
    const s = this.app.settings;
    const val = { view3d: s.view3d !== false, music: s.music, sfx: s.sfx, voice: s.voice, shake: s.shake, autoAim: s.autoAim, fullscreen: this.app.isFullscreen };
    PAUSE_ITEMS.forEach((it, i) => {
      const ry = y + 56 + i * rh;
      const sel = i === this.menu;
      if (sel) { ctx.fillStyle = 'rgba(255,211,90,0.15)'; ctx.fillRect(x + 8, ry - 6, w - 16, rh - 4); }
      txt(ctx, (sel ? '▶ ' : '  ') + t(it), x + 20, ry + 2, 9, sel ? '#fff' : '#bbb');
      if (it in val) txt(ctx, val[it] ? t('on') : t('off'), x + w - 20, ry + 2, 9, val[it] ? '#7dffa0' : '#ff8a8a', 'right');
      if (it === 'language') txt(ctx, getLang().toUpperCase(), x + w - 20, ry + 2, 9, '#7ad0ff', 'right');
      hit(this.buttons, x + 8, ry - 6, w - 16, rh - 4, () => { this.menu = i; this.activate(it); });
    });
    if (game.isClient) txt(ctx, t('online_pause_note'), vw / 2, y + h - 22, 6, '#9a8ab8', 'center');
  }
}

function summarize(game) {
  return { levelNum: game.levelNum, players: game.players.map(p => ({ heroKey: p.heroKey, score: p.score })) };
}

// ================================================================== intermission
// With a game: this machine runs the choice (local or online host).
// Without one: an online guest mirroring the host's `data`.
export class IntermissionScreen {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.t = 0;
    this.cur = 0;
    this.cursor = 1;
    this.embers = [];
    this.buttons = [];
    this.data = null;
    if (game) this.options = game.players.map(() => shuffle(PERKS.slice()).slice(0, 3));
    app.audio.stopMusic();
    app.audio.play('exit');
  }
  view() {
    const g = this.game;
    return {
      lv: g.levelNum, kills: g.levelKills, time: Math.round(g.levelTime), cur: this.cur, cursor: this.cursor,
      opts: this.options.map(o => o.map(p => p.id)),
      pl: g.players.map(p => [p.heroKey, p.score, p.ctrlId]),
    };
  }
  choose(i) {
    if (!this.game) { this.app.net?.up({ k: 'click', i }); return; }
    if (this.cur >= this.game.players.length) return;
    const p = this.game.players[this.cur];
    const perk = this.options[this.cur][i];
    perk.apply(p);
    p.perks.push(perk.id);
    this.app.audio.play('powerup');
    this.cur++;
    this.cursor = 1;
    this.t = Math.min(this.t, 0.5);
    this.finishIfDone();
  }
  finishIfDone() {
    if (this.cur < this.game.players.length) return;
    this.game.nextLevel();
    this.app.setScreen(new PlayScreen(this.app, this.game));
  }
  remoteClick(ctrlId, i) {
    const p = this.game?.players[this.cur];
    if (p && p.ctrlId === ctrlId && typeof i === 'number' && i >= 0 && i < 3) this.choose(i);
  }
  removeCtrl(ctrlId) {
    if (!this.game) return;
    const i = this.game.players.findIndex(p => p.ctrlId === ctrlId);
    if (i < 0) return;
    this.game.removePlayer(ctrlId);
    this.options.splice(i, 1);
    if (i < this.cur) this.cur--;
    else if (i === this.cur) this.cursor = 1;
    if (this.game.players.length) this.finishIfDone();
  }
  update(dt) {
    this.t += dt;
    updateEmbers(this.embers, this.app, dt);
    if (this.t < 0.8) return;
    handleClicks(this.buttons, this.app.input.clicks);
    if (!this.game || this.cur >= this.game.players.length) return;
    const p = this.game.players[this.cur];
    const c = this.app.input.controllers[p.ctrlId];
    if (!c) return;
    if (c.left || c.up) { this.cursor = (this.cursor + 2) % 3; this.app.audio.play('select'); }
    if (c.right || c.down) { this.cursor = (this.cursor + 1) % 3; this.app.audio.play('select'); }
    if (c.confirm || c.start) this.choose(this.cursor);
  }
  draw(ctx) {
    const { vw, vh } = this.app;
    this.buttons = [];
    background(ctx, this.app, this.embers);
    const v = this.game ? this.view() : this.data;
    if (!v) return;
    txt(ctx, t('cleared', { n: v.lv }), vw / 2, vh * 0.08, Math.min(34, vw / 18), '#ffd35a', 'center', SERIF);
    txt(ctx, `${t('kills', { n: v.kills })}   ${t('time', { t: formatTime(v.time) })}`, vw / 2, vh * 0.08 + 50, 9, '#cfc0e8', 'center');
    const n = v.pl.length;
    const sw = Math.min(200, (vw - 30) / Math.max(1, n));
    v.pl.forEach(([heroKey, score], i) => {
      const x = vw / 2 + (i - (n - 1) / 2) * sw;
      txt(ctx, heroName(heroKey), x, vh * 0.08 + 72, 8, HEROES[heroKey].light, 'center');
      txt(ctx, String(score), x, vh * 0.08 + 86, 10, '#ffd35a', 'center');
    });
    if (v.cur >= n) return;
    const [heroKey, , ctrlId] = v.pl[v.cur];
    const H = HEROES[heroKey];
    const top = vh * 0.08 + 120;
    const mine = this.game ? !ctrlId.startsWith('net') : ctrlId === this.app.net?.myCtrl;
    txt(ctx, t(mine ? 'choose_relic' : 'waiting_relic', { hero: heroName(heroKey) }), vw / 2, top, Math.min(12, vw / 40), H.light, 'center');
    const wide = vw > 640;
    const cw = wide ? Math.min(230, (vw - 60) / 3) : Math.min(340, vw - 40);
    const ch = wide ? Math.min(180, vh - top - 60) : Math.min(90, (vh - top - 60) / 3 - 10);
    v.opts[v.cur].forEach((id, i) => {
      const perk = PERKS.find(p => p.id === id);
      const x = wide ? vw / 2 + (i - 1) * (cw + 16) - cw / 2 : (vw - cw) / 2;
      const y = wide ? top + 34 : top + 30 + i * (ch + 10);
      const sel = i === v.cursor;
      const lift = sel ? Math.sin(this.t * 5) * 3 : 0;
      panel(ctx, x, y - lift, cw, ch, sel ? 'rgba(50,30,70,0.95)' : 'rgba(16,10,28,0.9)', sel ? H.light : 'rgba(255,255,255,0.15)', 10);
      if (sel) { ctx.lineWidth = 3; ctx.stroke(); }
      if (mine) hit(this.buttons, x, y, cw, ch, () => this.choose(i));
      ctx.font = `${wide ? 44 : 30}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd35a';
      if (wide) ctx.fillText(perk.icon, x + cw / 2, y - lift + 50);
      else ctx.fillText(perk.icon, x + 34, y + ch / 2);
      const tx = wide ? x + cw / 2 : x + 70, al = wide ? 'center' : 'left';
      let ty = wide ? y - lift + 96 : y + 16;
      for (const l of wrap(ctx, t('perk_' + perk.id), wide ? cw - 20 : cw - 80, 9)) { txt(ctx, l, tx, ty, 9, '#fff', al); ty += 14; }
      ty += 6;
      for (const l of wrap(ctx, t('perkd_' + perk.id), wide ? cw - 20 : cw - 80, 7)) { txt(ctx, l, tx, ty, 7, '#cfc0e8', al); ty += 12; }
    });
  }
}

// ================================================================== game over
export class GameOverScreen {
  constructor(app, summary) {
    this.app = app;
    this.summary = summary;
    this.t = 0;
    this.embers = [];
    this.buttons = [];
    this.total = summary.players.reduce((s, p) => s + p.score, 0);
    const entry = { score: this.total, level: summary.levelNum, heroes: summary.players.map(p => p.heroKey), date: Date.now() };
    const list = app.scores.concat([entry]).sort((a, b) => b.score - a.score).slice(0, 8);
    this.rank = list.indexOf(entry);
    app.scores = list;
    app.saveScores();
    app.audio.startMusic('gameover');
    app.audio.voice('game_over');
  }
  update(dt) {
    this.t += dt;
    updateEmbers(this.embers, this.app, dt);
    if (this.t < 1.2) return;
    handleClicks(this.buttons, this.app.input.clicks);
    for (const id in this.app.input.controllers) {
      const c = this.app.input.controllers[id];
      if (id.startsWith('net')) continue;
      if (c.confirm || c.start) { this.app.setScreen(new TitleScreen(this.app)); return; }
    }
  }
  draw(ctx) {
    const { vw, vh } = this.app;
    this.buttons = [];
    background(ctx, this.app, this.embers);
    txt(ctx, t('game_over'), vw / 2, vh * 0.08, Math.min(56, vw / 11), '#ff5a3a', 'center', SERIF);
    txt(ctx, t('reached', { n: this.summary.levelNum }), vw / 2, vh * 0.08 + 76, 10, '#cfc0e8', 'center');
    txt(ctx, `${t('total')}: ${this.total}`, vw / 2, vh * 0.08 + 98, 14, '#ffd35a', 'center');
    if (this.rank === 0) txt(ctx, t('new_record'), vw / 2, vh * 0.08 + 122, 10, Math.floor(this.t * 4) % 2 ? '#7dffa0' : '#fff', 'center');
    const lw = Math.min(460, vw - 30), lx = (vw - lw) / 2;
    let y = vh * 0.08 + 150;
    txt(ctx, t('highscores'), vw / 2, y, 10, '#fff', 'center');
    y += 24;
    const fit = Math.max(1, Math.floor((vh - y - 50) / 18));
    this.app.scores.slice(0, fit).forEach((s, i) => {
      const col = i === this.rank ? '#7dffa0' : '#ddd';
      txt(ctx, `${i + 1}.`, lx, y, 9, col);
      txt(ctx, String(s.score), lx + 36, y, 9, col);
      txt(ctx, s.heroes.map(h => heroName(h)).join(' + '), lx + lw, y, 7, col, 'right');
      txt(ctx, t('level', { n: s.level }), lx + 36 + 90, y, 7, '#9a8ab8');
      y += 18;
    });
    if (this.t > 1.2 && Math.floor(this.t * 2) % 2 === 0) txt(ctx, t('press_continue'), vw / 2, vh - 40, 8, '#fff', 'center');
    hit(this.buttons, 0, 0, vw, vh, () => { if (this.t > 1.2) this.app.setScreen(new TitleScreen(this.app)); });
  }
}

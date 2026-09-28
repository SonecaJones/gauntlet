import { HEROES, HERO_ORDER, PERKS } from './heroes.js';
import { Game } from './game.js';
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

// ================================================================== title
export class TitleScreen {
  constructor(app) {
    this.app = app;
    this.t = 0;
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
      if (c.confirm || c.start) { this.go(id); return; }
    }
  }
  go(id) {
    if (this.done) return;
    this.done = true;
    this.app.audio.unlock();
    this.app.audio.play('confirm');
    this.app.setScreen(new SelectScreen(this.app, id));
  }
  draw(ctx) {
    const { vw, vh } = this.app;
    this.buttons = [];
    background(ctx, this.app, this.embers);
    const size = Math.min(vw * 0.13, 120);
    const ty = vh * 0.16;
    ctx.save();
    ctx.shadowColor = 'rgba(255,140,40,0.7)';
    ctx.shadowBlur = 30;
    ctx.font = `900 ${size}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const g = ctx.createLinearGradient(0, ty, 0, ty + size);
    g.addColorStop(0, '#fff2b0');
    g.addColorStop(0.5, '#ffb030');
    g.addColorStop(1, '#a04010');
    ctx.fillStyle = g;
    ctx.fillText('GAUNTLET', vw / 2, ty);
    ctx.restore();
    txt(ctx, t('subtitle'), vw / 2, ty + size * 1.1, Math.min(22, vw / 26), '#ffd9a0', 'center');
    txt(ctx, t('tagline'), vw / 2, ty + size * 1.1 + 34, Math.min(10, vw / 60), '#b8a8d0', 'center');

    // hero line-up
    const hs = Math.min(3.2, vw / 260);
    const baseY = vh * 0.58;
    HERO_ORDER.forEach((k, i) => {
      const x = vw / 2 + (i - 1.5) * 60 * hs;
      ctx.save();
      ctx.translate(x, baseY);
      ctx.scale(hs, hs);
      drawHero(ctx, fakeHero(k, 0, 0, this.t + i * 0.3), this.t);
      ctx.restore();
      txt(ctx, heroName(k), x, baseY + 18 * hs, Math.max(6, Math.min(9, vw / 90)), HEROES[k].light, 'center');
    });

    if (Math.floor(this.t * 2) % 2 === 0) txt(ctx, t('press_start'), vw / 2, vh * 0.72, Math.min(12, vw / 45), '#ffffff', 'center');

    const lines = [t('ctrl_kb'), t('ctrl_pad'), t('ctrl_touch')];
    let y = vh * 0.8;
    for (const l of lines) for (const w of wrap(ctx, l, vw - 40, 7)) { txt(ctx, w, vw / 2, y, 7, '#9a8ab8', 'center'); y += 13; }

    const best = this.app.scores[0];
    if (best) txt(ctx, t('best', { n: best.score }), vw - 14, 14, 8, '#ffd35a', 'right');

    // language toggle
    const label = getLang() === 'pt' ? 'PT | en' : 'pt | EN';
    panel(ctx, 10, 8, 84, 26);
    txt(ctx, label, 52, 16, 8, '#fff', 'center');
    hit(this.buttons, 10, 8, 84, 26, () => {
      const nl = getLang() === 'pt' ? 'en' : 'pt';
      setLang(nl); this.app.settings.lang = nl; this.app.saveSettings();
      this.app.audio.play('select');
    });
    hit(this.buttons, 0, 40, vw, vh - 40, src => this.go(src));
  }
}

// ================================================================== select
export class SelectScreen {
  constructor(app, firstId) {
    this.app = app;
    this.t = 0;
    this.slots = [];
    this.countdown = null;
    this.buttons = [];
    this.embers = [];
    if (firstId) this.join(firstId);
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
    this.app.audio.say(heroName(HERO_ORDER[s.cursor]), true);
    for (const o of this.slots) if (o !== s && !o.ready && o.cursor === s.cursor) o.cursor = this.freeFrom(o.cursor, 1, o);
  }
  clickCard(i, src) {
    const s = this.slots.find(x => x.ctrlId === src);
    if (!s) { this.join(src, i); return; }
    if (s.ready) { if (s.cursor !== i) { s.ready = false; s.cursor = i; } return; }
    if (s.cursor === i) this.lock(s);
    else if (!this.taken(i, s)) { s.cursor = i; this.app.audio.play('select'); }
  }
  update(dt) {
    this.t += dt;
    updateEmbers(this.embers, this.app, dt);
    const inp = this.app.input;
    handleClicks(this.buttons, inp.clicks);
    if (this.left) return;
    for (const id in inp.controllers) {
      const c = inp.controllers[id];
      const s = this.slots.find(x => x.ctrlId === id);
      if (!s) {
        if ((c.confirm || c.start) && this.t > 0.2) this.join(id);
        else if (c.back && !this.slots.length) { this.back(); return; }
        continue;
      }
      if (!s.ready) {
        if (c.left || c.up) { s.cursor = this.freeFrom((s.cursor + 3) % 4, -1, s); this.app.audio.play('select'); }
        if (c.right || c.down) { s.cursor = this.freeFrom((s.cursor + 1) % 4, 1, s); this.app.audio.play('select'); }
        if (c.confirm && this.t > 0.2) this.lock(s);
        else if (c.back) { this.slots.splice(this.slots.indexOf(s), 1); this.app.audio.play('back'); if (!this.slots.length) { this.back(); return; } }
      } else if (c.back) { s.ready = false; this.countdown = null; this.app.audio.play('back'); }
    }
    if (this.slots.length && this.slots.every(s => s.ready)) {
      if (this.countdown == null) this.countdown = 1.6;
      this.countdown -= dt;
      if (this.countdown <= 0) this.start();
    } else this.countdown = null;
  }
  back() { this.left = true; this.app.audio.play('back'); this.app.setScreen(new TitleScreen(this.app)); }
  start() {
    const game = new Game(this.app, this.slots.map(s => ({ ctrlId: s.ctrlId, hero: HERO_ORDER[s.cursor] })));
    this.app.setScreen(new PlayScreen(this.app, game));
  }
  draw(ctx) {
    const { vw, vh } = this.app;
    this.buttons = [];
    background(ctx, this.app, this.embers);
    txt(ctx, t('select_title'), vw / 2, 22, Math.min(20, vw / 30), '#ffd35a', 'center');
    const wide = vw > vh * 1.05;
    const cols = wide ? 4 : 2, rows = wide ? 1 : 2, gap = 14;
    const cw = Math.min(250, (vw - 32 - gap * (cols - 1)) / cols);
    const ch = Math.min(wide ? 380 : 320, (vh - 150 - gap * (rows - 1)) / rows);
    const ox = (vw - cw * cols - gap * (cols - 1)) / 2, oy = 60 + Math.max(0, (vh - 150 - ch * rows - gap * (rows - 1)) / 2);
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
        if (ty > y + ch - 20) break;
        txt(ctx, t(lbl), x + 10, ty, fs - 2, '#ccc');
        for (let b = 0; b < 5; b++) {
          ctx.fillStyle = b < H.bars[key] ? H.color : 'rgba(255,255,255,0.12)';
          ctx.fillRect(x + cw - 10 - (5 - b) * (cw * 0.07), ty, cw * 0.06, fs - 2);
        }
        ty += fs + 4;
      }
      ty += 4;
      if (ty < y + ch - 24) { txt(ctx, `${t('special')}: ${t('sp_' + k)}`, x + 10, ty, fs - 2, '#ffd35a'); ty += fs + 6; }
      for (const l of wrap(ctx, t('desc_' + k), cw - 20, fs - 2)) {
        if (ty > y + ch - 14) break;
        txt(ctx, l, x + 10, ty, fs - 2, '#d8d0e8'); ty += fs + 3;
      }
      // player chips
      here.forEach((s, j) => {
        const pi = this.slots.indexOf(s);
        const cx = x + 8 + j * 46;
        panel(ctx, cx, y + 8, 42, 18, playerColor(pi), null, 5);
        txt(ctx, `P${pi + 1}`, cx + 21, y + 13, 8, '#111', 'center', PIX, false);
      });
      if (lockedBy) {
        ctx.fillStyle = playerColor(this.slots.indexOf(lockedBy));
        ctx.fillRect(x, y + ch - 26, cw, 26);
        txt(ctx, t('ready'), x + cw / 2, y + ch - 19, 10, '#111', 'center', PIX, false);
      }
    });
    // footer
    let fy = vh - 70;
    const devs = this.slots.map((s, i) => `P${i + 1}: ${deviceName(s.ctrlId)}`).join('   ');
    if (devs) { txt(ctx, devs, vw / 2, fy, 8, '#fff', 'center'); }
    fy += 18;
    for (const l of wrap(ctx, this.countdown != null ? t('starting', { n: Math.ceil(this.countdown) }) : t('join_hint'), vw - 30, 8)) {
      txt(ctx, l, vw / 2, fy, 8, this.countdown != null ? '#ffd35a' : '#b8a8d0', 'center'); fy += 14;
    }
    panel(ctx, 10, 10, 90, 28);
    txt(ctx, '◀ ' + t('back'), 55, 19, 8, '#fff', 'center');
    hit(this.buttons, 10, 10, 90, 28, () => this.back());
  }
}

// ================================================================== play
const PAUSE_ITEMS = ['resume', 'music', 'sfx', 'voice', 'shake', 'language', 'quit'];

export class PlayScreen {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.paused = false;
    this.menu = 0;
    this.showMap = false;
    this.buttons = [];
    app.audio.startMusic('dungeon');
  }
  pause() { if (!this.paused) { this.paused = true; this.menu = 0; this.app.audio.play('select'); } }
  update(dt) {
    const inp = this.app.input, C = inp.controllers, game = this.game;
    handleClicks(this.buttons, inp.clicks);
    const mine = game.players.map(p => C[p.ctrlId]).filter(Boolean);
    if (this.paused) { this.updatePause(mine); return; }
    if (mine.some(c => c.pause)) { this.pause(); return; }
    if (mine.some(c => c.map)) this.showMap = !this.showMap;
    game.update(dt);
    if (game.complete) this.app.setScreen(new IntermissionScreen(this.app, game));
    else if (game.gameOver) this.app.setScreen(new GameOverScreen(this.app, game));
  }
  activate(item, dir = 1) {
    const s = this.app.settings, au = this.app.audio;
    switch (item) {
      case 'resume': this.paused = false; break;
      case 'music': s.music = !s.music; au.refreshMusic(); break;
      case 'sfx': s.sfx = !s.sfx; break;
      case 'voice': s.voice = !s.voice; if (!s.voice) window.speechSynthesis?.cancel(); break;
      case 'shake': s.shake = !s.shake; break;
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
      if (c.confirm || ((c.left || c.right) && this.menu > 0 && this.menu < 6)) { this.activate(PAUSE_ITEMS[this.menu]); return; }
      if (c.back || c.pause) { this.paused = false; return; }
    }
  }
  draw(ctx) {
    const { vw, vh } = this.app, game = this.game;
    this.buttons = [];
    game.draw(ctx, this.app.settings);
    drawHud(ctx, this.app, game, this.showMap);
    if (this.app.input.touchActive) {
      layoutTouch(this.app);
      drawTouch(ctx, this.app, game.players.find(p => p.ctrlId === 'touch'));
    } else this.app.input.touchButtons = [];
    if (!this.paused) return;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, vw, vh);
    const w = Math.min(380, vw - 30), rh = 34, h = 70 + PAUSE_ITEMS.length * rh;
    const x = (vw - w) / 2, y = (vh - h) / 2;
    panel(ctx, x, y, w, h, 'rgba(16,10,28,0.95)', '#ffd35a88', 12);
    txt(ctx, t('paused'), vw / 2, y + 18, 16, '#ffd35a', 'center');
    const s = this.app.settings;
    const val = { music: s.music, sfx: s.sfx, voice: s.voice, shake: s.shake };
    PAUSE_ITEMS.forEach((it, i) => {
      const ry = y + 56 + i * rh;
      const sel = i === this.menu;
      if (sel) { ctx.fillStyle = 'rgba(255,211,90,0.15)'; ctx.fillRect(x + 8, ry - 6, w - 16, rh - 4); }
      txt(ctx, (sel ? '▶ ' : '  ') + t(it), x + 20, ry + 2, 9, sel ? '#fff' : '#bbb');
      if (it in val) txt(ctx, val[it] ? t('on') : t('off'), x + w - 20, ry + 2, 9, val[it] ? '#7dffa0' : '#ff8a8a', 'right');
      if (it === 'language') txt(ctx, getLang().toUpperCase(), x + w - 20, ry + 2, 9, '#7ad0ff', 'right');
      hit(this.buttons, x + 8, ry - 6, w - 16, rh - 4, () => { this.menu = i; this.activate(it); });
    });
  }
}

// ================================================================== intermission
export class IntermissionScreen {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.t = 0;
    this.cur = 0;
    this.cursor = 1;
    this.embers = [];
    this.buttons = [];
    this.options = game.players.map(() => shuffle(PERKS.slice()).slice(0, 3));
    app.audio.stopMusic();
    app.audio.play('exit');
  }
  choose(i) {
    if (this.cur >= this.game.players.length) return;
    const p = this.game.players[this.cur];
    const perk = this.options[this.cur][i];
    perk.apply(p);
    p.perks.push(perk.id);
    this.app.audio.play('powerup');
    this.cur++;
    this.cursor = 1;
    this.t = Math.min(this.t, 0.5);
    if (this.cur >= this.game.players.length) {
      this.game.nextLevel();
      this.app.setScreen(new PlayScreen(this.app, this.game));
    }
  }
  update(dt) {
    this.t += dt;
    updateEmbers(this.embers, this.app, dt);
    if (this.t < 0.8) return;
    handleClicks(this.buttons, this.app.input.clicks);
    if (this.cur >= this.game.players.length) return;
    const p = this.game.players[this.cur];
    const c = this.app.input.controllers[p.ctrlId];
    if (!c) return;
    if (c.left || c.up) { this.cursor = (this.cursor + 2) % 3; this.app.audio.play('select'); }
    if (c.right || c.down) { this.cursor = (this.cursor + 1) % 3; this.app.audio.play('select'); }
    if (c.confirm || c.start) this.choose(this.cursor);
  }
  draw(ctx) {
    const { vw, vh } = this.app, game = this.game;
    this.buttons = [];
    background(ctx, this.app, this.embers);
    txt(ctx, t('cleared', { n: game.levelNum }), vw / 2, vh * 0.08, Math.min(34, vw / 18), '#ffd35a', 'center', SERIF);
    txt(ctx, `${t('kills', { n: game.levelKills })}   ${t('time', { t: formatTime(game.levelTime) })}`, vw / 2, vh * 0.08 + 50, 9, '#cfc0e8', 'center');
    const n = game.players.length;
    const sw = Math.min(200, (vw - 30) / n);
    game.players.forEach((p, i) => {
      const x = vw / 2 + (i - (n - 1) / 2) * sw;
      txt(ctx, heroName(p.heroKey), x, vh * 0.08 + 72, 8, p.hero.light, 'center');
      txt(ctx, String(p.score), x, vh * 0.08 + 86, 10, '#ffd35a', 'center');
    });
    if (this.cur >= n) return;
    const p = game.players[this.cur];
    const top = vh * 0.08 + 120;
    txt(ctx, t('choose_relic', { hero: heroName(p.heroKey) }), vw / 2, top, Math.min(12, vw / 40), p.hero.light, 'center');
    const wide = vw > 640;
    const cw = wide ? Math.min(230, (vw - 60) / 3) : Math.min(340, vw - 40);
    const ch = wide ? Math.min(180, vh - top - 60) : Math.min(90, (vh - top - 60) / 3 - 10);
    this.options[this.cur].forEach((perk, i) => {
      const x = wide ? vw / 2 + (i - 1) * (cw + 16) - cw / 2 : (vw - cw) / 2;
      const y = wide ? top + 34 : top + 30 + i * (ch + 10);
      const sel = i === this.cursor;
      const lift = sel ? Math.sin(this.t * 5) * 3 : 0;
      panel(ctx, x, y - lift, cw, ch, sel ? 'rgba(50,30,70,0.95)' : 'rgba(16,10,28,0.9)', sel ? p.hero.light : 'rgba(255,255,255,0.15)', 10);
      if (sel) { ctx.lineWidth = 3; ctx.stroke(); }
      hit(this.buttons, x, y, cw, ch, () => this.choose(i));
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
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.t = 0;
    this.embers = [];
    this.buttons = [];
    this.total = game.players.reduce((s, p) => s + p.score, 0);
    const entry = { score: this.total, level: game.levelNum, heroes: game.players.map(p => p.heroKey), date: Date.now() };
    const list = app.scores.concat([entry]).sort((a, b) => b.score - a.score).slice(0, 8);
    this.rank = list.indexOf(entry);
    app.scores = list;
    app.saveScores();
    app.audio.stopMusic();
    app.audio.say(t('game_over'), true);
  }
  update(dt) {
    this.t += dt;
    updateEmbers(this.embers, this.app, dt);
    if (this.t < 1.2) return;
    handleClicks(this.buttons, this.app.input.clicks);
    for (const id in this.app.input.controllers) {
      const c = this.app.input.controllers[id];
      if (c.confirm || c.start) { this.app.setScreen(new TitleScreen(this.app)); return; }
    }
  }
  draw(ctx) {
    const { vw, vh } = this.app;
    this.buttons = [];
    background(ctx, this.app, this.embers);
    txt(ctx, t('game_over'), vw / 2, vh * 0.08, Math.min(56, vw / 11), '#ff5a3a', 'center', SERIF);
    txt(ctx, t('reached', { n: this.game.levelNum }), vw / 2, vh * 0.08 + 76, 10, '#cfc0e8', 'center');
    txt(ctx, `${t('total')}: ${this.total}`, vw / 2, vh * 0.08 + 98, 14, '#ffd35a', 'center');
    if (this.rank === 0) txt(ctx, t('new_record'), vw / 2, vh * 0.08 + 122, 10, Math.floor(this.t * 4) % 2 ? '#7dffa0' : '#fff', 'center');
    const lw = Math.min(460, vw - 30), lx = (vw - lw) / 2;
    let y = vh * 0.08 + 150;
    txt(ctx, t('highscores'), vw / 2, y, 10, '#fff', 'center');
    y += 24;
    this.app.scores.forEach((s, i) => {
      const col = i === this.rank ? '#7dffa0' : '#ddd';
      txt(ctx, `${i + 1}.`, lx, y, 9, col);
      txt(ctx, String(s.score), lx + 36, y, 9, col);
      txt(ctx, s.heroes.map(h => heroName(h)).join(' + '), lx + lw, y, 7, col, 'right');
      txt(ctx, t('level', { n: s.level }), lx + 36 + 90, y, 7, '#9a8ab8');
      y += 18;
    });
    if (this.t > 1.2 && Math.floor(this.t * 2) % 2 === 0) txt(ctx, t('press_continue'), vw / 2, vh - 40, 8, '#fff', 'center');
    hit(this.buttons, 0, 0, vw, vh, () => this.app.setScreen(new TitleScreen(this.app)));
  }
}

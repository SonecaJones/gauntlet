import { ClientGame, levelMsg, snapshot, makeCmd } from './netgame.js';
import { TitleScreen, SelectScreen, PlayScreen, IntermissionScreen, GameOverScreen } from './screens.js';
import { t } from './i18n.js';

const EDGES = ['dash', 'special', 'potion', 'confirm', 'back', 'start', 'pause', 'map', 'left', 'right', 'up', 'down'];
const SNAP_EVERY = 0.05;
const STATE_EVERY = 0.1;

export function serverUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}

// Merges every local device into one controller (a guest plays one hero).
function mergeLocal(C, prevId) {
  const out = { move: { x: 0, y: 0 }, aim: null, aimPoint: null, fire: false, fireFacing: false };
  for (const e of EDGES) out[e] = false;
  let id = prevId;
  for (const k in C) {
    const c = C[k];
    if (c.move.x || c.move.y || c.aim || c.fire || EDGES.some(e => c[e])) id = k;
    if (!out.move.x && !out.move.y && (c.move.x || c.move.y)) out.move = c.move;
    if (!out.aim && c.aim) out.aim = c.aim;
    out.fire ||= c.fire;
    out.fireFacing ||= c.fireFacing;
    for (const e of EDGES) out[e] ||= c[e];
  }
  if (!out.aim) for (const k in C) if (C[k].aimPoint) { out.aimPoint = C[k].aimPoint; break; }
  return [out, id];
}

export class Net {
  constructor(app) {
    this.app = app;
    this.ws = null;
    this.role = null;
    this.code = null;
    this.myId = null;
    this.status = 'connecting';
    this.remote = new Map();
    this.sendT = 0;
    this.stateT = 0;
    this.local = null;
    this.localId = null;
    this.cgame = null;
    this.onError = null;
  }

  get myCtrl() { return 'net' + this.myId; }

  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(serverUrl()); } catch (e) { reject(e); return; }
      this.ws = ws;
      let opened = false;
      ws.onopen = () => { opened = true; resolve(); };
      ws.onerror = () => { if (!opened) reject(new Error('connect')); };
      ws.onclose = () => { if (opened) this.lost(); };
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onMsg(m); };
    });
  }

  async host() {
    this.role = 'host';
    await this.connect();
    this.send({ t: 'create' });
  }

  async join(code) {
    this.role = 'client';
    await this.connect();
    this.send({ t: 'join', code });
  }

  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  broadcast(d) { this.send({ t: 'to', d }); }
  sendTo(id, d) { this.send({ t: 'to', id, d }); }
  up(d) { this.send({ t: 'up', d }); }

  close() {
    this.closed = true;
    try { this.ws?.close(); } catch { /* already closed */ }
    if (this.app.net === this) this.app.net = null;
  }

  lost() {
    if (this.closed) return;
    this.closed = true;
    if (this.app.net === this) this.app.net = null;
    if (this.app.screen instanceof GameOverScreen) return;
    this.app.setScreen(new TitleScreen(this.app, t(this.role === 'client' ? 'host_left' : 'conn_lost')));
  }

  inviteUrl() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('sala', this.code);
    const srv = new URLSearchParams(location.search).get('server');
    if (srv) u.searchParams.set('server', srv);
    return u.toString();
  }

  // ------------------------------------------------------------ messages
  onMsg(m) {
    const app = this.app;
    switch (m.t) {
      case 'created': this.code = m.code; this.myId = 0; this.status = 'ready'; return;
      case 'joined': this.code = m.code; this.myId = m.id; this.status = 'ready'; return;
      case 'error':
        this.status = 'error';
        this.closed = true;
        this.ws?.close();
        if (app.net === this) app.net = null;
        this.onError?.(t(m.code));
        return;
      case 'host-left': this.lost(); return;
      // host
      case 'peer-join': this.remote.set(m.id, this.blankRemote()); this.syncPeer(m.id); return;
      case 'peer-leave': {
        this.remote.delete(m.id);
        app.screen.removeCtrl?.('net' + m.id);
        return;
      }
      case 'from': this.fromPeer(m.id, m.d); return;
      // guest
      case 'msg': this.fromHost(m.d); return;
    }
  }

  blankRemote() {
    const r = { move: { x: 0, y: 0 }, aim: null, fire: false, fireFacing: false, edges: {} };
    return r;
  }

  fromPeer(id, d) {
    if (!d) return;
    if (d.k === 'click') { this.app.screen.remoteClick?.('net' + id, d.i); return; }
    if (d.k !== 'in') return;
    const r = this.remote.get(id);
    if (!r) return;
    r.move = { x: +d.mx || 0, y: +d.my || 0 };
    r.aim = d.ax != null ? { x: +d.ax, y: +d.ay } : null;
    r.fire = !!d.f;
    r.fireFacing = !!d.ff;
    for (const e of EDGES) if (d[e]) r.edges[e] = true;
  }

  // Host: expose each guest as a regular controller ('net<id>').
  inject(C) {
    for (const [id, r] of this.remote) {
      const c = { id: 'net' + id, move: r.move, aim: r.aim, aimPoint: null, fire: r.fire, fireFacing: r.fireFacing };
      for (const e of EDGES) c[e] = !!r.edges[e];
      c.pause = false;
      c.map = false;
      r.edges = {};
      C['net' + id] = c;
    }
  }

  syncPeer(id) {
    const s = this.app.screen;
    if (s instanceof PlayScreen) { this.sendTo(id, levelMsg(s.game)); this.sendTo(id, { t: 'screen', s: 'play' }); }
    else if (s instanceof GameOverScreen) this.sendTo(id, { t: 'over', ...s.summary });
    this.stateT = 0;
  }

  sendLevel(game) { if (this.role === 'host') this.broadcast(levelMsg(game)); }

  onScreen(s) {
    if (this.role !== 'host') return;
    this.stateT = 0;
    if (s instanceof PlayScreen) this.broadcast({ t: 'screen', s: 'play' });
    else if (s instanceof GameOverScreen) this.broadcast({ t: 'over', ...s.summary });
  }

  fromHost(d) {
    if (!d) return;
    const app = this.app, s = app.screen;
    switch (d.t) {
      case 'lobby':
        if (!(s instanceof SelectScreen)) app.setScreen(new SelectScreen(app, null, 'client'));
        app.screen.slots = d.slots;
        app.screen.countdown = d.cd;
        return;
      case 'level':
        this.cgame ||= new ClientGame(app, this.myCtrl);
        this.cgame.applyLevel(d);
        return;
      case 'screen':
        if (d.s === 'play' && this.cgame && !(s instanceof PlayScreen)) app.setScreen(new PlayScreen(app, this.cgame));
        return;
      case 's': this.cgame?.pushSnap(d); return;
      case 'inter':
        if (!(s instanceof IntermissionScreen)) app.setScreen(new IntermissionScreen(app, null));
        app.screen.data = d;
        return;
      case 'over':
        if (!(s instanceof GameOverScreen)) app.setScreen(new GameOverScreen(app, d));
        return;
    }
  }

  // ------------------------------------------------------------ per frame
  beforeUpdate() {
    const C = this.app.input.controllers;
    if (this.role === 'client') [this.local, this.localId] = mergeLocal(C, this.localId);
    else this.inject(C);
  }

  afterUpdate(dt) {
    const s = this.app.screen;
    if (this.role === 'client') {
      if (this.status !== 'ready') return;
      let cmd;
      if (s instanceof PlayScreen && s.game.isClient) cmd = s.game.lastCmd || makeCmd({ move: { x: 0, y: 0 } }, null);
      else cmd = makeCmd(this.local, null);
      this.up(cmd);
      return;
    }
    this.sendT -= dt;
    this.stateT -= dt;
    if (s instanceof PlayScreen) {
      if (this.sendT <= 0) { this.sendT = SNAP_EVERY; this.broadcast(snapshot(s.game, s.paused)); }
    } else if (this.stateT <= 0) {
      this.stateT = STATE_EVERY;
      if (s instanceof SelectScreen) this.broadcast({ t: 'lobby', slots: s.slots, cd: s.countdown });
      else if (s instanceof IntermissionScreen) this.broadcast({ t: 'inter', ...s.view() });
    }
  }
}

import { NET_CONFIG } from './config.js';

// Transports move messages between host and guests. Both report events to
// Net.onMsg using the same shapes:
//   created {code} · joined {id, code} · error {code} · peer-join {id}
//   peer-leave {id} · from {id, d} (host) · msg {d} (guest)
// and call net.lost() when the connection drops.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_PEERS = 7;
const BUFFER_LIMIT = 256 * 1024;

const params = () => new URLSearchParams(location.search);

export function makeTransport(net) {
  const q = params();
  const kind = q.get('server') || q.get('transport') === 'ws' ? 'ws' : NET_CONFIG.transport;
  return kind === 'ws' ? new WsTransport(net) : new PeerTransport(net);
}

// ------------------------------------------------------------------ WebSocket
export function serverUrl() {
  const q = params().get('server');
  if (q) return q;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}

class WsTransport {
  constructor(net) { this.net = net; this.ws = null; }
  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(serverUrl()); } catch (e) { reject(e); return; }
      this.ws = ws;
      let opened = false;
      ws.onopen = () => { opened = true; resolve(); };
      ws.onerror = () => { if (!opened) reject(new Error('connect')); };
      ws.onclose = () => { if (opened) this.net.lost(); };
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.net.onMsg(m); };
    });
  }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  async host() { await this.connect(); this.send({ t: 'create' }); }
  async join(code) { await this.connect(); this.send({ t: 'join', code }); }
  broadcast(d) { this.send({ t: 'to', d }); }
  sendTo(id, d) { this.send({ t: 'to', id, d }); }
  up(d) { this.send({ t: 'up', d }); }
  kick() { /* the server drops dead sockets itself */ }
  close() { try { this.ws?.close(); } catch { /* already closed */ } }
}

// ------------------------------------------------------------------ PeerJS
let libPromise = null;
function loadPeerLib() {
  if (window.Peer) return Promise.resolve();
  libPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/peerjs.min.js', import.meta.url).href;
    s.onload = () => resolve();
    s.onerror = () => { libPromise = null; reject(new Error('lib')); };
    document.head.append(s);
  });
  return libPromise;
}

function peerOptions() {
  const o = { ...NET_CONFIG.peer };
  // ?peer=https://host:port/path points at another PeerJS server (testing).
  const q = params().get('peer');
  if (q) {
    const u = new URL(q);
    o.host = u.hostname;
    o.secure = u.protocol === 'https:';
    o.port = Number(u.port) || (o.secure ? 443 : 80);
    o.path = u.pathname;
  }
  return o;
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const p = id ? new window.Peer(id, peerOptions()) : new window.Peer(peerOptions());
    const onOpen = () => { p.off('error', onErr); resolve(p); };
    const onErr = e => { p.off('open', onOpen); p.destroy(); reject(e); };
    p.once('open', onOpen);
    p.once('error', onErr);
  });
}

function sendOn(conn, d, droppable) {
  if (!conn || !conn.open) return;
  if (droppable && conn.dataChannel && conn.dataChannel.bufferedAmount > BUFFER_LIMIT) return;
  try { conn.send(d); } catch { /* channel closing */ }
}

class PeerTransport {
  constructor(net) {
    this.net = net;
    this.peer = null;
    this.conns = new Map();
    this.nextId = 1;
    this.closed = false;
  }

  async host() {
    await loadPeerLib();
    for (let i = 0; i < 6 && !this.peer; i++) {
      let code = '';
      for (let k = 0; k < 4; k++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      try {
        this.peer = await openPeer(NET_CONFIG.roomPrefix + code);
        this.code = code;
      } catch (e) {
        if (e.type !== 'unavailable-id') throw e;
      }
    }
    if (!this.peer) throw new Error('no-code');
    this.peer.on('connection', conn => this.accept(conn));
    // Losing the signaling server only blocks new guests; games in progress go on.
    this.peer.on('disconnected', () => { if (!this.closed) this.peer.reconnect(); });
    this.peer.on('error', () => {});
    this.net.onMsg({ t: 'created', code: this.code });
  }

  accept(conn) {
    conn.on('open', () => {
      if (this.conns.size >= MAX_PEERS) {
        sendOn(conn, { _t: 'err', code: 'room_full' });
        setTimeout(() => conn.close(), 300);
        return;
      }
      const id = this.nextId++;
      conn.gid = id;
      this.conns.set(id, conn);
      sendOn(conn, { _t: 'hello', id, code: this.code });
      this.net.onMsg({ t: 'peer-join', id });
    });
    conn.on('data', d => { if (conn.gid) this.net.onMsg({ t: 'from', id: conn.gid, d }); });
    const gone = () => {
      if (conn.gid && this.conns.get(conn.gid) === conn) {
        this.conns.delete(conn.gid);
        this.net.onMsg({ t: 'peer-leave', id: conn.gid });
      }
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  async join(code) {
    await loadPeerLib();
    this.peer = await openPeer();
    const conn = (this.conn = this.peer.connect(NET_CONFIG.roomPrefix + code, { serialization: 'json', reliable: true }));
    let joined = false;
    const fail = errCode => {
      if (joined || this.closed) return;
      clearTimeout(timer);
      this.net.onMsg({ t: 'error', code: errCode });
    };
    const timer = setTimeout(() => fail('room_not_found'), 15000);
    this.peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'room_not_found' : 'net_fail'));
    this.peer.on('disconnected', () => { if (joined && !this.closed) this.peer.reconnect(); });
    conn.on('data', d => {
      if (d && d._t === 'hello') {
        joined = true;
        clearTimeout(timer);
        this.net.onMsg({ t: 'joined', id: d.id, code: d.code });
      } else if (d && d._t === 'err') fail(d.code);
      else this.net.onMsg({ t: 'msg', d });
    });
    conn.on('close', () => { if (joined) this.net.lost(); });
  }

  broadcast(d) {
    const droppable = d && d.t === 's';
    for (const c of this.conns.values()) sendOn(c, d, droppable);
  }
  sendTo(id, d) { sendOn(this.conns.get(id), d, d && d.t === 's'); }
  up(d) { sendOn(this.conn, d, false); }
  kick(id) {
    const c = this.conns.get(id);
    if (!c) return;
    this.conns.delete(id);
    try { c.close(); } catch { /* already closed */ }
    this.net.onMsg({ t: 'peer-leave', id });
  }
  close() {
    this.closed = true;
    try { this.peer?.destroy(); } catch { /* already gone */ }
  }
}

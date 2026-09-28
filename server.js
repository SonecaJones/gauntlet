// Zero-dependency server: static files + a WebSocket room relay for online play.
//   npm start  ->  http://localhost:8080  (WebSocket endpoint: /ws)
//
// The server has no game logic. The player who creates a room (the host) runs
// the simulation; the server only relays messages between host and guests.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomInt } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (path.startsWith('..')) { res.writeHead(403).end(); return; }
  try {
    const file = join(root, path || 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// ------------------------------------------------------------------ WebSocket
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 1 << 20;

class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.alive = true;
    this.onmessage = null;
    this.onclose = null;
    socket.on('data', d => this.data(d));
    socket.on('close', () => this.closed());
    socket.on('error', () => this.closed());
  }
  data(d) {
    this.alive = true;
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_FRAME) { this.close(); return; }
      const maskOff = off;
      if (masked) off += 4;
      if (this.buf.length < off + len) return;
      let payload = Buffer.from(this.buf.subarray(off, off + len));
      if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= this.buf[maskOff + (i & 3)];
      this.buf = this.buf.subarray(off + len);
      if (op === 0x8) { this.frame(0x8, Buffer.alloc(0)); this.close(); return; }
      if (op === 0x9) { this.frame(0xa, payload); continue; }
      if (op === 0xa) { this.alive = true; continue; }
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        this.frags.push(payload);
        if (!fin) continue;
        const msg = Buffer.concat(this.frags).toString('utf8');
        this.frags = [];
        this.onmessage?.(msg);
      }
    }
  }
  frame(op, data) {
    if (this.socket.destroyed) return;
    const len = data.length;
    let hdr;
    if (len < 126) hdr = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x80 | op; hdr[1] = 126; hdr.writeUInt16BE(len, 2); }
    else { hdr = Buffer.alloc(10); hdr[0] = 0x80 | op; hdr[1] = 127; hdr.writeBigUInt64BE(BigInt(len), 2); }
    this.socket.write(Buffer.concat([hdr, data]));
  }
  // Snapshots are expendable: drop them when a slow client falls behind.
  send(obj, droppable = false) {
    if (droppable && this.socket.writableLength > 256 * 1024) return;
    this.frame(0x1, Buffer.from(JSON.stringify(obj)));
  }
  close() { if (!this.socket.destroyed) this.socket.end(); this.closed(); }
  closed() {
    if (this.dead) return;
    this.dead = true;
    this.socket.destroy();
    this.onclose?.();
  }
}

// ------------------------------------------------------------------ rooms
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_PEERS = 7;
const rooms = new Map(); // code -> { host: Conn, peers: Map<id, Conn>, next }

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

function handle(conn) {
  let room = null, id = null;
  conn.onmessage = raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!room) {
      if (m.t === 'create') {
        const code = newCode();
        room = { code, host: conn, peers: new Map(), next: 1 };
        rooms.set(code, room);
        id = 0;
        conn.send({ t: 'created', code, id });
      } else if (m.t === 'join') {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) { conn.send({ t: 'error', code: 'room_not_found' }); return; }
        if (r.peers.size >= MAX_PEERS) { conn.send({ t: 'error', code: 'room_full' }); return; }
        room = r;
        id = r.next++;
        r.peers.set(id, conn);
        conn.send({ t: 'joined', code: r.code, id });
        r.host.send({ t: 'peer-join', id });
      }
      return;
    }
    if (id === 0 && m.t === 'to') {
      const out = { t: 'msg', d: m.d };
      const droppable = m.d && m.d.t === 's';
      if (m.id != null) room.peers.get(m.id)?.send(out, droppable);
      else for (const p of room.peers.values()) p.send(out, droppable);
    } else if (id !== 0 && m.t === 'up') {
      room.host.send({ t: 'from', id, d: m.d });
    }
  };
  conn.onclose = () => {
    if (!room) return;
    if (id === 0) {
      for (const p of room.peers.values()) { p.send({ t: 'host-left' }); p.close(); }
      rooms.delete(room.code);
    } else {
      room.peers.delete(id);
      room.host.send({ t: 'peer-leave', id });
    }
    room = null;
  };
}

const conns = new Set();
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (new URL(req.url, 'http://x').pathname !== '/ws' || !key) { socket.destroy(); return; }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const conn = new Conn(socket);
  conns.add(conn);
  const onclose = () => conns.delete(conn);
  handle(conn);
  const inner = conn.onclose;
  conn.onclose = () => { onclose(); inner?.(); };
});

// Keep connections alive through proxies and drop dead ones.
setInterval(() => {
  for (const c of conns) {
    if (!c.alive) { c.close(); continue; }
    c.alive = false;
    c.frame(0x9, Buffer.alloc(0));
  }
}, 25000);

server.listen(port, () => console.log(`Gauntlet Reforged: http://localhost:${port}`));

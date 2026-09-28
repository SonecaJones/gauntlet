// Online play settings. Everything here ships to the browser, so it must
// never contain secrets: only public endpoints and public keys.
export const NET_CONFIG = {
  // 'peerjs': browser-to-browser WebRTC; PeerJS is used only to find the other player.
  // 'ws':     relay through this repo's server.js (npm start).
  transport: 'peerjs',

  // Prefix for PeerJS ids, so room ABCD becomes "gauntlet-reforged-ABCD".
  roomPrefix: 'gauntlet-reforged-',

  // PeerJS options. Empty = free public PeerJS cloud + PeerJS's default
  // STUN/TURN servers. To use your own signaling server or TURN, e.g.:
  //   { host: 'peer.example.com', port: 443, path: '/', secure: true,
  //     config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' },
  //                            { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' }] } }
  peer: {},

  // A guest or host silent for this long is treated as disconnected.
  timeoutSec: 15,
};

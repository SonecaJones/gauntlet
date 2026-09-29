// Offline support: network first (so updates arrive right away), cache as fallback.
const CACHE = 'cryptfall-v9';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'src/main.js', 'src/audio.js', 'src/constants.js', 'src/enemies.js', 'src/game.js', 'src/heroes.js',
  'src/i18n.js', 'src/input.js', 'src/level.js', 'src/net.js', 'src/netgame.js', 'src/render.js',
  'src/screens.js', 'src/ui.js', 'src/util.js', 'src/config.js', 'src/transport.js', 'src/music.js', 'src/boss.js', 'src/view3d.js', 'src/silhouette.js', 'vendor/peerjs.min.js',
  'vendor/three/three.module.js', 'vendor/three/three.core.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/ws')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))),
  );
});

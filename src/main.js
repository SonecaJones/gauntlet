import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { TitleScreen, PlayScreen, JoinScreen } from './screens.js';
import { setLang } from './i18n.js';

const SETTINGS_KEY = 'gauntlet.settings';
const SCORES_KEY = 'gauntlet.scores';

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    const defLang = (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en';
    this.settings = { music: true, sfx: true, voice: true, shake: true, autoAim: true, view3d: true, lang: defLang, ...load(SETTINGS_KEY, {}) };
    setLang(this.settings.lang);
    this.scores = load(SCORES_KEY, []);
    if (!Array.isArray(this.scores)) this.scores = [];
    this.input = new Input(canvas);
    this.audio = new AudioSys(this.settings);
    this.input.onGesture = () => this.audio.unlock();
    // iOS only resumes audio from touchend/click, and pinch-zooms unless told not to.
    for (const ev of ['touchend', 'click']) window.addEventListener(ev, () => this.audio.unlock(), { passive: true });
    document.addEventListener('gesturestart', e => e.preventDefault());
    this.net = null;
    this.wakeLock = null;
    // 3D view (three.js + Blender models); the game draws in 2D until it is
    // ready, or for good if WebGL is missing.
    this.view3d = null;
    import('./view3d.js').then(m => { this.view3d = new m.View3D(this); }).catch(err => console.warn('3D view unavailable', err));

    this.safeProbe = document.createElement('div');
    this.safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
    document.body.append(this.safeProbe);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.net && this.screen instanceof PlayScreen) this.screen.pause();
      if (!document.hidden && this.screen instanceof PlayScreen) this.keepAwake(true);
    });
    const q = new URLSearchParams(location.search);
    const room = q.get('sala') || q.get('room');
    this.screen = room ? new JoinScreen(this, null, room.toUpperCase().slice(0, 4)) : new TitleScreen(this);
    this.last = performance.now();
    requestAnimationFrame(ts => this.frame(ts));
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* not available here */ });
    }
  }
  saveSettings() { save(SETTINGS_KEY, this.settings); }
  saveScores() { save(SCORES_KEY, this.scores); }
  setScreen(s) {
    this.screen?.leave?.();
    this.screen = s;
    if (s instanceof TitleScreen && this.net) this.net.close();
    this.keepAwake(s instanceof PlayScreen);
    this.net?.onScreen(s);
  }
  // Keep the phone screen on while playing.
  async keepAwake(on) {
    try {
      if (on && !this.wakeLock && navigator.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
      } else if (!on && this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch { /* not allowed */ }
  }
  get canFullscreen() { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); }
  get isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  toggleFullscreen() {
    try {
      if (this.isFullscreen) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else {
        const el = document.documentElement;
        const p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' });
        p?.catch?.(() => {});
      }
    } catch { /* unsupported */ }
  }
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.isTouch ? 1.75 : 2);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    const cs = getComputedStyle(this.safeProbe);
    this.safe = {
      t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
      b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0,
    };
  }
  frame(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - this.last) / 1000));
    this.last = ts;
    const C = this.input.poll();
    if (C.touch) C.touch.autoAim = this.settings.autoAim;
    this.net?.beforeUpdate();
    this.screen.update(dt);
    this.net?.afterUpdate(dt);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.view3d) this.view3d.drawn = false;
    this.screen.draw(ctx);
    if (this.view3d && !this.view3d.drawn) this.view3d.hide();
    this.input.endFrame();
    requestAnimationFrame(t => this.frame(t));
  }
}

window.gauntlet = new App(document.getElementById('game'));

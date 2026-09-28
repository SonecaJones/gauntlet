import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { TitleScreen, PlayScreen } from './screens.js';
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
    const defLang = (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en';
    this.settings = { music: true, sfx: true, voice: true, shake: true, lang: defLang, ...load(SETTINGS_KEY, {}) };
    setLang(this.settings.lang);
    this.scores = load(SCORES_KEY, []);
    if (!Array.isArray(this.scores)) this.scores = [];
    this.input = new Input(canvas);
    this.audio = new AudioSys(this.settings);
    this.input.onGesture = () => this.audio.unlock();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen instanceof PlayScreen) this.screen.pause();
    });
    this.screen = new TitleScreen(this);
    this.last = performance.now();
    requestAnimationFrame(ts => this.frame(ts));
  }
  saveSettings() { save(SETTINGS_KEY, this.settings); }
  saveScores() { save(SCORES_KEY, this.scores); }
  setScreen(s) { this.screen = s; }
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
  }
  frame(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - this.last) / 1000));
    this.last = ts;
    this.input.poll();
    this.screen.update(dt);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.screen.draw(ctx);
    this.input.endFrame();
    requestAnimationFrame(t => this.frame(t));
  }
}

window.gauntlet = new App(document.getElementById('game'));

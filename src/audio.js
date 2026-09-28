// All sound is synthesized with WebAudio; the narrator uses speechSynthesis.
const THROTTLE = { hit: 0.04, hurt: 0.12, tink: 0.06, kill: 0.03, shoot_arrow: 0.03, drain: 0.18, eshot: 0.08, coin: 0.03, boom: 0.05 };

export class AudioSys {
  constructor(settings) {
    this.s = settings;
    this.ctx = null;
    this.last = {};
    this.lastSay = 0;
    this.musicTimer = null;
    this.wantMusic = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.comp = c.createDynamicsCompressor();
      this.comp.connect(c.destination);
      this.sfxBus = c.createGain();
      this.sfxBus.gain.value = 0.55;
      this.sfxBus.connect(this.comp);
      this.musBus = c.createGain();
      this.musBus.gain.value = 0.3;
      this.musBus.connect(this.comp);
      this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (this.wantMusic) this.startMusic(this.wantMusic);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone({ type = 'square', f = 440, f2 = 0, dur = 0.1, vol = 0.2, a = 0.005, delay = 0, at = 0, bus }) {
    const c = this.ctx, t0 = at || c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(bus || this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.2, vol = 0.2, f = 2000, f2 = 0, q = 1, ft = 'lowpass', delay = 0, at = 0, bus }) {
    const c = this.ctx, t0 = at || c.currentTime + delay;
    const src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf;
    fl.type = ft;
    fl.frequency.setValueAtTime(f, t0);
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
    fl.Q.value = q;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(fl);
    fl.connect(g);
    g.connect(bus || this.sfxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  arp(notes, step, o) { notes.forEach((f, i) => this.tone({ ...o, f, delay: i * step })); }

  play(name) {
    if (!this.ctx || !this.s.sfx) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < (THROTTLE[name] ?? 0.02)) return;
    this.last[name] = now;
    switch (name) {
      case 'shoot_axe': this.noise({ ft: 'bandpass', f: 900, f2: 300, dur: 0.12, vol: 0.25 }); this.tone({ type: 'triangle', f: 300, f2: 120, dur: 0.1, vol: 0.1 }); break;
      case 'shoot_sword': this.noise({ ft: 'highpass', f: 3000, f2: 1200, dur: 0.08, vol: 0.2 }); this.tone({ f: 900, f2: 500, dur: 0.05, vol: 0.04 }); break;
      case 'shoot_fire': this.noise({ f: 1500, f2: 400, dur: 0.2, vol: 0.22 }); this.tone({ type: 'sawtooth', f: 200, f2: 80, dur: 0.18, vol: 0.07 }); break;
      case 'shoot_arrow': this.tone({ type: 'triangle', f: 1200, f2: 600, dur: 0.06, vol: 0.12 }); this.noise({ ft: 'highpass', f: 4000, dur: 0.04, vol: 0.08 }); break;
      case 'storm': for (let i = 0; i < 5; i++) this.tone({ type: 'triangle', f: 1400 - i * 120, f2: 500, dur: 0.07, vol: 0.1, delay: i * 0.03 }); break;
      case 'hit': this.tone({ f: 220, f2: 90, dur: 0.06, vol: 0.1 }); break;
      case 'kill': this.noise({ f: 1400, f2: 200, dur: 0.15, vol: 0.18 }); this.tone({ f: 320, f2: 60, dur: 0.12, vol: 0.08 }); break;
      case 'hurt': this.tone({ type: 'sawtooth', f: 170, f2: 70, dur: 0.15, vol: 0.18 }); break;
      case 'tink': this.tone({ f: 1800, dur: 0.03, vol: 0.05 }); break;
      case 'food': this.arp([523, 659, 784, 1046], 0.06, { type: 'triangle', dur: 0.08, vol: 0.14 }); break;
      case 'pickup': this.tone({ type: 'sine', f: 600, f2: 1300, dur: 0.15, vol: 0.18 }); break;
      case 'key': this.tone({ f: 988, dur: 0.08, vol: 0.1 }); this.tone({ f: 1319, dur: 0.14, vol: 0.1, delay: 0.08 }); break;
      case 'coin': this.tone({ f: 1319, dur: 0.05, vol: 0.08 }); this.tone({ f: 1760, dur: 0.12, vol: 0.08, delay: 0.05 }); break;
      case 'powerup': this.arp([440, 554, 659, 880, 1108, 1318], 0.05, { dur: 0.08, vol: 0.08 }); break;
      case 'door': this.noise({ f: 700, f2: 100, dur: 0.35, vol: 0.35 }); this.tone({ type: 'sawtooth', f: 90, f2: 45, dur: 0.3, vol: 0.12 }); break;
      case 'bomb': this.noise({ f: 3000, f2: 60, dur: 1.1, vol: 0.6 }); this.tone({ type: 'sine', f: 120, f2: 28, dur: 0.9, vol: 0.5 }); break;
      case 'dash': this.noise({ ft: 'bandpass', f: 700, f2: 2600, dur: 0.14, vol: 0.14, q: 2 }); break;
      case 'whirl': this.noise({ ft: 'bandpass', f: 400, f2: 1800, dur: 0.6, vol: 0.22, q: 3 }); this.tone({ type: 'sawtooth', f: 110, f2: 220, dur: 0.6, vol: 0.05 }); break;
      case 'charge': this.tone({ type: 'sawtooth', f: 150, f2: 420, dur: 0.3, vol: 0.12 }); this.noise({ ft: 'bandpass', f: 500, f2: 2000, dur: 0.3, vol: 0.15 }); break;
      case 'nova': this.tone({ type: 'sine', f: 1400, f2: 90, dur: 0.55, vol: 0.28 }); this.noise({ ft: 'highpass', f: 2000, f2: 300, dur: 0.45, vol: 0.2 }); break;
      case 'gen': this.noise({ f: 2000, f2: 80, dur: 0.6, vol: 0.4 }); this.tone({ f: 200, f2: 40, dur: 0.5, vol: 0.14 }); break;
      case 'exit': this.arp([392, 523, 659, 784, 1046, 1318, 1568], 0.07, { type: 'triangle', dur: 0.12, vol: 0.14 }); break;
      case 'death': this.arp([440, 415, 392, 330, 262, 196], 0.12, { type: 'sawtooth', dur: 0.14, vol: 0.12 }); break;
      case 'eshot': this.tone({ type: 'sawtooth', f: 420, f2: 150, dur: 0.12, vol: 0.07 }); break;
      case 'lob': this.tone({ type: 'triangle', f: 280, f2: 520, dur: 0.15, vol: 0.07 }); break;
      case 'boom': this.noise({ f: 800, f2: 90, dur: 0.25, vol: 0.22 }); break;
      case 'drain': this.tone({ type: 'sine', f: 220, f2: 90, dur: 0.22, vol: 0.14 }); break;
      case 'select': this.tone({ f: 660, dur: 0.05, vol: 0.07 }); break;
      case 'confirm': this.tone({ f: 880, dur: 0.06, vol: 0.08 }); this.tone({ f: 1320, dur: 0.12, vol: 0.08, delay: 0.06 }); break;
      case 'back': this.tone({ f: 500, f2: 300, dur: 0.1, vol: 0.07 }); break;
      case 'revive': this.arp([523, 659, 784, 1046, 1318], 0.07, { type: 'sine', dur: 0.14, vol: 0.14 }); break;
      case 'spawn': this.noise({ ft: 'bandpass', f: 300, f2: 900, dur: 0.18, vol: 0.06 }); break;
    }
  }

  // ------------------------------------------------------------ music
  startMusic(kind) {
    this.wantMusic = kind;
    if (!this.ctx) return;
    this.stopMusic();
    if (!this.s.music) return;
    this.musicKind = kind;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 40);
  }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  refreshMusic() {
    if (this.s.music && this.wantMusic) this.startMusic(this.wantMusic);
    else this.stopMusic();
  }

  schedule() {
    const c = this.ctx;
    const sd = 60 / (this.musicKind === 'title' ? 80 : 120) / 4;
    while (this.nextT < c.currentTime + 0.25) {
      this.playStep(this.step, this.nextT, sd);
      this.nextT += sd;
      this.step++;
    }
  }

  playStep(step, at, sd) {
    const bus = this.musBus;
    const f = semi => 110 * Math.pow(2, semi / 12);
    const s = step % 16;
    if (this.musicKind === 'title') {
      const prog = [[0, 'm'], [-4, 'M'], [-7, 'M'], [-5, 'M']];
      const [root, q] = prog[Math.floor(step / 16) % prog.length];
      const ch = q === 'm' ? [0, 3, 7] : [0, 4, 7];
      if (s === 0) for (const n of ch) this.tone({ type: 'sine', f: f(root + n + 12), dur: sd * 16, vol: 0.05, a: 0.4, at, bus });
      if (s === 0 || s === 8) this.tone({ type: 'triangle', f: f(root - 12), dur: sd * 7, vol: 0.18, a: 0.02, at, bus });
      if (s % 2 === 0) this.tone({ type: 'triangle', f: f(root + ch[(s / 2) % 3] + 24), dur: sd * 1.6, vol: 0.035, at, bus });
      return;
    }
    const prog = [[0, 'm'], [0, 'm'], [-4, 'M'], [-5, 'M'], [0, 'm'], [3, 'M'], [-2, 'M'], [-5, 'M']];
    const bar = Math.floor(step / 16) % prog.length;
    const [root, q] = prog[bar];
    const ch = q === 'm' ? [0, 3, 7] : [0, 4, 7];
    if ([0, 3, 6, 8, 11, 14].includes(s)) this.tone({ type: 'triangle', f: f(root - 12), dur: sd * 1.8, vol: 0.22, a: 0.01, at, bus });
    const arpN = ch[[0, 1, 2, 1][s % 4]] + (s >= 8 ? 12 : 0) + 12;
    this.tone({ type: 'square', f: f(root + arpN), dur: sd * 0.9, vol: 0.03, at, bus });
    if (s === 0 || s === 8 || (s === 10 && bar % 2)) this.tone({ type: 'sine', f: 150, f2: 40, dur: 0.16, vol: 0.4, at, bus });
    if (s === 4 || s === 12) this.noise({ ft: 'highpass', f: 1500, dur: 0.1, vol: 0.12, at, bus });
    if (s % 2 === 1) this.noise({ ft: 'highpass', f: 7000, dur: 0.03, vol: 0.05, at, bus });
    // lead phrase on every other pair of bars
    if (Math.floor(step / 32) % 2 === 1) {
      const mel = [12, -1, 15, -1, 14, 12, -1, 10, 12, -1, -1, 7, 10, -1, 8, -1];
      const n = mel[s];
      if (n >= 0 && bar % 2 === 0) this.tone({ type: 'sawtooth', f: f(root + n + 12), dur: sd * 1.8, vol: 0.035, a: 0.01, at, bus });
    }
  }

  // ------------------------------------------------------------ narrator
  say(text, force = false) {
    if (!this.s.voice || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (!force && now - this.lastSay < 2200) return;
    this.lastSay = now;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const lang = this.s.lang === 'pt' ? 'pt' : 'en';
      u.lang = lang === 'pt' ? 'pt-BR' : 'en-US';
      const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith(lang));
      if (v) u.voice = v;
      u.rate = 0.92;
      u.pitch = 0.4;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* speech not available */ }
  }
}

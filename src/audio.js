import { SONGS } from './music.js';
import { t, heroName } from './i18n.js';

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
      this.voiceBus = c.createGain();
      this.voiceBus.gain.value = 1;
      this.voiceBus.connect(this.comp);
      // NES pulse channels: 12.5%, 25% and 50% duty cycles.
      this.pulse = {};
      for (const d of [0.125, 0.25, 0.5]) {
        const n = 32, re = new Float32Array(n), im = new Float32Array(n);
        for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
        this.pulse[d] = c.createPeriodicWave(re, im);
      }
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
  // A small tracker that plays SONGS (music.js) on NES-like channels.
  startMusic(kind) {
    this.wantMusic = kind;
    if (!this.ctx) return;
    this.stopMusic();
    const song = SONGS[kind];
    if (!this.s.music || !song) return;
    this.song = song;
    this.bars = [...(song.intro || []), ...(song.loop || [])].map(b => ({
      p1: parseBar(b.p1), p2: parseBar(b.p2), tri: parseBar(b.tri), noi: parseBar(b.noi),
    }));
    this.introLen = song.intro ? song.intro.length : 0;
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

  barAt(b) {
    if (b < this.bars.length) return this.bars[b];
    if (!this.song.loop) return null;
    const loopLen = this.bars.length - this.introLen;
    return this.bars[this.introLen + ((b - this.introLen) % loopLen)];
  }

  schedule() {
    const sd = 60 / this.song.bpm / 4;
    while (this.nextT < this.ctx.currentTime + 0.25) {
      const bar = this.barAt(Math.floor(this.step / 16));
      if (!bar) { this.stopMusic(); return; }
      this.playStep(bar, this.step % 16, this.nextT, sd);
      this.nextT += sd;
      this.step++;
    }
  }

  playStep(bar, s, at, sd) {
    const duty = this.song.duty;
    const n1 = bar.p1[s], n2 = bar.p2[s], nt = bar.tri[s], nn = bar.noi[s];
    if (n1 && n1.f) this.pnote(this.pulse[duty], n1.f, at, n1.len * sd, 0.075);
    if (n2 && n2.f) this.pnote(this.pulse[0.125], n2.f, at, n2.len * sd * 0.95, 0.04);
    if (nt && nt.f) this.tnote(nt.f, at, nt.len * sd);
    if (nn && nn.d) this.drum(nn.d, at);
  }

  // Pulse note with a NES-style volume envelope and delayed vibrato.
  pnote(wave, f, at, dur, vol) {
    const c = this.ctx, bus = this.musBus;
    const o = c.createOscillator(), g = c.createGain();
    o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.004);
    g.gain.linearRampToValueAtTime(vol * 0.7, at + Math.min(0.1, dur * 0.5));
    g.gain.setValueAtTime(vol * 0.7, at + Math.max(0.01, dur - 0.03));
    g.gain.linearRampToValueAtTime(0, at + dur);
    if (dur > 0.35) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.setValueAtTime(0, at);
      lg.gain.linearRampToValueAtTime(f * 0.007, at + 0.3);
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(at);
      lfo.stop(at + dur + 0.05);
    }
    o.connect(g);
    g.connect(bus);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  // Triangle bass: no volume envelope on the NES, just on/off.
  tnote(f, at, dur) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0.2, at);
    g.gain.setValueAtTime(0.2, at + Math.max(0.01, dur - 0.015));
    g.gain.linearRampToValueAtTime(0, at + dur);
    o.connect(g);
    g.connect(this.musBus);
    o.start(at);
    o.stop(at + dur + 0.03);
  }

  drum(d, at) {
    const bus = this.musBus;
    switch (d) {
      case 'k':
        this.tone({ type: 'triangle', f: 180, f2: 45, dur: 0.12, vol: 0.45, at, bus });
        this.noise({ f: 800, f2: 200, dur: 0.05, vol: 0.12, at, bus });
        break;
      case 's': this.noise({ ft: 'bandpass', f: 1800, q: 0.8, dur: 0.13, vol: 0.3, at, bus }); break;
      case 'h': this.noise({ ft: 'highpass', f: 7500, dur: 0.035, vol: 0.07, at, bus }); break;
      case 'o': this.noise({ ft: 'highpass', f: 6500, dur: 0.16, vol: 0.07, at, bus }); break;
    }
  }

  // ------------------------------------------------------------ narrator
  // Pre-rendered voice lines (voice/<lang>/<key>[-hero].wav, see tools/make-voices.mjs)
  // run through a "demonic" effect chain. Falls back to the browser's own voice.
  voice(key, heroKey = null) {
    if (!this.s.voice) return;
    const lang = this.s.lang === 'pt' ? 'pt' : 'en';
    const id = `${lang}/${key}${heroKey ? '-' + heroKey : ''}`;
    if (!this.ctx) { this.say(this.voiceText(key, heroKey), true); return; }
    this.loadVoice(id).then(buf => this.playVoice(buf)).catch(() => this.say(this.voiceText(key, heroKey), true));
  }

  voiceText(key, heroKey) {
    if (key.startsWith('level_voice_')) return t('level_voice')[Number(key.slice(12))] || '';
    if (key === 'hero') return heroName(heroKey);
    return t(key, { hero: heroKey ? heroName(heroKey) : '' });
  }

  loadVoice(id) {
    this.voices ||= new Map();
    if (!this.voices.has(id)) {
      const url = new URL(`../voice/${id}.wav`, import.meta.url);
      const p = fetch(url)
        .then(r => { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); })
        .then(ab => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)));
      p.catch(() => this.voices.delete(id));
      this.voices.set(id, p);
    }
    return this.voices.get(id);
  }

  playVoice(buf) {
    const c = this.ctx, t0 = c.currentTime + 0.02;
    for (const n of this.voiceNodes || []) { try { n.stop(); } catch { /* already stopped */ } }
    // two slightly detuned, pitched-down copies thicken the voice
    const a = c.createBufferSource(), b = c.createBufferSource();
    a.buffer = b.buffer = buf;
    a.playbackRate.value = 0.8;
    b.playbackRate.value = 0.76;
    const mix = c.createGain(), bg = c.createGain();
    mix.gain.value = 2.2;
    bg.gain.value = 0.7;
    a.connect(mix);
    b.connect(bg);
    bg.connect(mix);
    // saturation
    const shaper = c.createWaveShaper();
    shaper.curve = (this.distCurve ||= (() => {
      const n = 1024, cu = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cu[i] = Math.tanh(3.2 * x); }
      return cu;
    })());
    shaper.oversample = '2x';
    const boom = c.createBiquadFilter();
    boom.type = 'lowshelf'; boom.frequency.value = 200; boom.gain.value = 9;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    mix.connect(shaper); shaper.connect(boom); boom.connect(lp);
    const out = c.createGain();
    out.gain.value = 0.26;
    out.connect(this.voiceBus);
    lp.connect(out);
    // ring modulation gives the growl
    const ring = c.createGain(), rg = c.createGain(), osc = c.createOscillator();
    ring.gain.value = 0;
    osc.frequency.value = 42;
    osc.connect(ring.gain);
    rg.gain.value = 0.45;
    lp.connect(ring); ring.connect(rg); rg.connect(out);
    // dungeon echo
    const verb = c.createConvolver(), wet = c.createGain();
    verb.buffer = (this.impulse ||= (() => {
      const len = Math.floor(c.sampleRate * 2.4), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      return ir;
    })());
    wet.gain.value = 0.3;
    lp.connect(verb); verb.connect(wet); wet.connect(out);

    const dur = buf.duration / 0.76;
    a.start(t0); b.start(t0); osc.start(t0);
    a.stop(t0 + dur); b.stop(t0 + dur); osc.stop(t0 + dur + 2.5);
    this.voiceNodes = [a, b, osc];
    // duck the music while the narrator speaks
    const mg = this.musBus.gain;
    mg.cancelScheduledValues(t0);
    mg.setTargetAtTime(0.1, t0, 0.05);
    mg.setTargetAtTime(0.3, t0 + dur, 0.3);
  }

  // Browser speech: used only if a voice file is missing.
  say(text, force = false) {
    if (!this.s.voice || !text || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (!force && now - this.lastSay < 2200) return;
    this.lastSay = now;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const lang = this.s.lang === 'pt' ? 'pt' : 'en';
      u.lang = lang === 'pt' ? 'pt-BR' : 'en-US';
      const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith(lang));
      if (v) u.voice = v;
      u.rate = 0.85;
      u.pitch = 0.1;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* speech not available */ }
  }
}

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Turns a bar string into 16 steps: {f, len} for notes, {d} for drums.
function parseBar(str) {
  const toks = (str || '').trim().split(/\s+/).filter(Boolean);
  const out = new Array(16).fill(null);
  for (let i = 0; i < 16 && i < toks.length; i++) {
    const tk = toks[i];
    if (tk === '-' || tk === '.') continue;
    if (/^[ksho]$/.test(tk)) { out[i] = { d: tk }; continue; }
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(tk);
    if (!m) continue;
    const midi = (Number(m[3]) + 1) * 12 + NOTE_BASE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    let len = 1;
    while (i + len < 16 && toks[i + len] === '-') len++;
    out[i] = { f: 440 * Math.pow(2, (midi - 69) / 12), len };
  }
  return out;
}

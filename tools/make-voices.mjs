// Renders the narrator lines to voice/<lang>/<key>[-hero].wav with eSpeak
// (via the meSpeak package). The game applies its "demonic" effects at
// runtime, so these files are the dry voice.
//
//   npm install && npm run voices
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setLang, t, heroName } from '../src/i18n.js';
import { HERO_ORDER } from '../src/heroes.js';

const require = createRequire(import.meta.url);
const meSpeak = require('mespeak');
meSpeak.loadConfig(require('mespeak/src/mespeak_config.json'));

const LANGS = { pt: 'mespeak/voices/pt.json', en: 'mespeak/voices/en/en-us.json' };
const PER_HERO = ['needs_food', 'about_to_die', 'shot_food', 'joins', 'revived', 'fallen', 'welcome'];
const OUT_RATE = 11025;

function lines() {
  const out = [];
  for (const h of HERO_ORDER) {
    for (const k of PER_HERO) out.push([`${k}-${h}`, t(k, { hero: heroName(h) })]);
    out.push([`hero-${h}`, heroName(h)]);
  }
  out.push(['welcome_all', t('welcome_all')], ['game_over', t('game_over')]);
  for (const k of ['boss_dragon', 'boss_lich', 'boss_golem', 'boss_rage', 'boss_down']) out.push([k, t(k)]);
  t('level_voice').forEach((s, i) => out.push([`level_voice_${i}`, s]));
  return out;
}

function toSamples(wav) {
  const b = Buffer.from(wav);
  let off = 12, rate = 22050;
  while (off < b.length) {
    const id = b.toString('ascii', off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(off + 12);
    if (id === 'data') return { rate, s: new Int16Array(b.buffer.slice(b.byteOffset + off + 8, b.byteOffset + off + 8 + size)) };
    off += 8 + size + (size & 1);
  }
  throw new Error('no data chunk');
}

function process({ rate, s }) {
  let a = 0, z = s.length - 1;
  while (a < z && Math.abs(s[a]) < 300) a++;
  while (z > a && Math.abs(s[z]) < 300) z--;
  a = Math.max(0, a - rate * 0.02);
  z = Math.min(s.length - 1, z + rate * 0.05);
  const step = rate / OUT_RATE, n = Math.floor((z - a) / step);
  const out = new Float32Array(n);
  let peak = 1;
  for (let i = 0; i < n; i++) {
    const j = a + Math.floor(i * step);
    let acc = 0, c = 0;
    for (let k = 0; k < step && j + k <= z; k++, c++) acc += s[j + k];
    out[i] = acc / Math.max(1, c);
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const g = (0.9 * 32767) / peak, pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(out[i] * g), i * 2);
  return pcm;
}

function wavFile(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(OUT_RATE, 24); h.writeUInt32LE(OUT_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// eSpeak (compiled to JS) leaks memory and crashes after ~60 lines, so each
// batch runs in a fresh process:  node make-voices.mjs <lang> <from> <to>
const BATCH = 20;
const [, , onlyLang, from, to] = globalThis.process.argv;
if (onlyLang) {
  const voiceFile = LANGS[onlyLang];
  setLang(onlyLang);
  meSpeak.loadVoice(require(voiceFile));
  const voiceId = voiceFile.replace(/^mespeak\/voices\//, '').replace(/\.json$/, '');
  mkdirSync(new URL(`../voice/${onlyLang}/`, import.meta.url), { recursive: true });
  for (const [key, text] of lines().slice(Number(from), Number(to))) {
    const raw = meSpeak.speak(text, { rawdata: 'buffer', voice: voiceId, pitch: 14, speed: 138, wordgap: 1, amplitude: 140 });
    writeFileSync(new URL(`../voice/${onlyLang}/${key}.wav`, import.meta.url), wavFile(process(toSamples(raw))));
  }
} else {
  const { execFileSync } = await import('node:child_process');
  const self = fileURLToPath(import.meta.url);
  let count = 0;
  for (const lang of Object.keys(LANGS)) {
    setLang(lang);
    const n = lines().length;
    for (let i = 0; i < n; i += BATCH) {
      execFileSync(globalThis.process.execPath, [self, lang, String(i), String(Math.min(n, i + BATCH))], { stdio: ['ignore', 'ignore', 'inherit'] });
    }
    count += n;
  }
  console.log(`${count} voice lines written to voice/`);
}

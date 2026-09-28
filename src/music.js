// Songs for the NES-style sequencer in audio.js.
//
// Each bar has up to four channels, like the NES 2A03 chip:
//   p1  lead pulse      p2  harmony pulse      tri  triangle bass      noi  drums
// A bar is 16 steps (sixteenth notes) written as space-separated tokens:
//   'D5' play a note · '-' hold the previous note · '.' silence
//   drums: 'k' kick · 's' snare · 'h' hi-hat · 'o' open hat
// Songs play `intro` once, then repeat `loop` (no loop = play once).

const CHORDS = {
  Dm: ['D4', 'F4', 'A4', 'D5'], Gm: ['G3', 'Bb3', 'D4', 'G4'], Bb: ['Bb3', 'D4', 'F4', 'Bb4'],
  A: ['A3', 'C#4', 'E4', 'A4'], F: ['F3', 'A3', 'C4', 'F4'], C: ['C4', 'E4', 'G4', 'C5'],
  Am: ['A3', 'C4', 'E4', 'A4'], G: ['G3', 'B3', 'D4', 'G4'], E: ['E3', 'G#3', 'B3', 'E4'],
};

// Broken-chord accompaniment in eighth notes.
function arp(ch) {
  const n = CHORDS[ch];
  return [0, 1, 2, 3, 2, 1, 2, 3].map(i => `${n[i]} -`).join(' ');
}

// Octave-jumping bass, the classic NES triangle figure.
function bass(ch, style = 'oct') {
  const letter = CHORDS[ch][0].replace(/\d/, '');
  const lo = `${letter}${/^(A|Bb|B)$/.test(letter) ? 1 : 2}`;
  const hi = lo.replace(/\d$/, d => String(Number(d) + 1));
  if (style === 'long') return `${lo} ${'- '.repeat(15)}`.trim();
  if (style === 'half') return `${lo} - - - - - - - ${hi} - - - - - - -`;
  return `${lo} - ${hi} - ${lo} - ${hi} - ${lo} - ${hi} - ${lo} - ${hi} -`;
}

export function transpose(bar, semis) {
  return bar.split(/\s+/).map(tok => {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(tok);
    if (!m) return tok;
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const midi = (Number(m[3]) + 1) * 12 + base + semis;
    return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }).join(' ');
}

const DRUMS = {
  rock: 'k . h . s . h . k . k h s . h h',
  drive: 'k h h h s h k h k h k h s h h o',
  soft: 'k . . . h . . . k . . . h . . .',
  fill: 'k . s . s . s s k s s s s s s s',
};

function build(chords, melody, opts = {}) {
  return chords.map((ch, i) => ({
    p1: melody[i],
    p2: opts.p2 === false ? '' : arp(ch),
    tri: bass(ch, opts.bass),
    noi: opts.drums ? (i === chords.length - 1 && opts.fill ? DRUMS.fill : DRUMS[opts.drums]) : '',
  }));
}

// ------------------------------------------------------------------ title
// Opening of J. S. Bach's Toccata and Fugue in D minor, BWV 565 (public domain).
const TOCCATA = [
  'A5 G5 A5 - - - - - - - - - . . . .',
  'G5 F5 E5 D5 C#5 - - - D5 - - - - - . .',
  'A4 G4 A4 - - - - - - - . . . . . .',
  'E4 - F4 - C#4 - - - D4 - - - - - . .',
  'A3 G3 A3 - - - - - - - . . . . . .',
  'G3 F3 E3 D3 C#3 - - - D3 - - - - - - -',
  'C#4 E4 G4 Bb4 C#5 E5 G5 Bb5 C#6 - - - - - - -',
  'D6 - - - - - - - - - - - . . . .',
];
const titleIntro = TOCCATA.map((p1, i) => ({
  p1,
  p2: i < 6 ? transpose(p1, -12) : i === 6 ? 'E4 - - - - - - - G4 - - - - - - -' : 'F#5 - - - - - - - - - - - . . . .',
  tri: i < 7 ? 'D2 - - - - - - - - - - - - - - -' : 'D2 - - - - - - - - - - - . . . .',
  noi: i === 7 ? 'k . . . . . . . . . . . . . . .' : '',
}));
const titleLoop = build(['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'C', 'A'], [
  'A4 - - - - - - - F4 - - - E4 - - -',
  'D4 - - - - - - - F4 - - - Bb4 - - -',
  'G4 - - - - - - - Bb4 - - - D5 - - -',
  'C#5 - - - - - - - E5 - - - A4 - - -',
  'D5 - - - - - - - A4 - - - F4 - - -',
  'F4 - - - - - - - D4 - - - F4 - - -',
  'E4 - - - G4 - - - C5 - - - E5 - - -',
  'C#5 - - - - - - - - - - - . . . .',
], { bass: 'half', drums: 'soft' });

// ------------------------------------------------------------------ levels
const dungeonA = build(
  ['Dm', 'Dm', 'Bb', 'A', 'Dm', 'Gm', 'A', 'A', 'F', 'C', 'Dm', 'A', 'Bb', 'C', 'A', 'Dm'],
  [
    'D5 - - . A4 - - . D5 - F5 - E5 - D5 -',
    'C#5 - D5 - E5 - F5 - E5 - D5 - A4 - - -',
    'Bb4 - - . D5 - - . F5 - - - G5 - F5 -',
    'E5 - - - C#5 - - - A4 - - - - - . .',
    'D5 - - . A4 - - . D5 - F5 - A5 - G5 -',
    'F5 - E5 - D5 - Bb4 - G5 - F5 - E5 - D5 -',
    'C#5 - E5 - A5 - G5 - F5 - E5 - D5 - C#5 -',
    'E5 - - - - - - - A4 - C#5 - E5 - A5 -',
    'A5 - - - F5 - - - C5 - F5 - A5 - C6 -',
    'G5 - - - E5 - - - C5 - E5 - G5 - Bb5 -',
    'A5 - G5 - F5 - E5 - F5 - D5 - A4 - D5 -',
    'C#5 - - - E5 - - - A5 - - - G5 - E5 -',
    'F5 - - - D5 - Bb4 - D5 - F5 - Bb5 - A5 -',
    'G5 - - - E5 - C5 - E5 - G5 - C6 - Bb5 -',
    'A5 - F5 - D5 - F5 - E5 - C#5 - A4 - C#5 -',
    'D5 - - - - - - - . . . . . . . .',
  ],
  { drums: 'rock', fill: true },
);

const dungeonB = build(
  ['Am', 'F', 'G', 'E', 'Am', 'Dm', 'E', 'Am'],
  [
    'A4 - C5 - E5 - A5 - G5 - E5 - C5 - E5 -',
    'F5 - - - C5 - A4 - C5 - F5 - A5 - F5 -',
    'G5 - - - D5 - B4 - D5 - G5 - B5 - G5 -',
    'G#5 - - - E5 - - - B4 - - - E5 - G#5 -',
    'A5 - - - E5 - C5 - A4 - C5 - E5 - A5 -',
    'F5 - E5 - D5 - C5 - D5 - F5 - A5 - F5 -',
    'E5 - G#5 - B5 - G#5 - E5 - D5 - C5 - B4 -',
    'A4 - - - - - - - . . . . E5 - G#5 -',
  ],
  { drums: 'drive', fill: true },
);

const gameover = build(['Dm', 'Gm', 'A', 'Dm'], [
  'A4 - - - - - G4 - F4 - - - E4 - - -',
  'D4 - - - F4 - - - Bb4 - - - A4 - - -',
  'G4 - - - E4 - - - C#4 - - - E4 - - -',
  'D4 - - - - - - - - - - - . . . .',
], { bass: 'long', p2: false });

export const SONGS = {
  title: { bpm: 96, duty: 0.5, intro: titleIntro, loop: titleLoop },
  dungeonA: { bpm: 132, duty: 0.25, loop: dungeonA },
  dungeonB: { bpm: 144, duty: 0.25, loop: dungeonB },
  gameover: { bpm: 72, duty: 0.5, intro: gameover, loop: null },
};

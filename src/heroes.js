// Hero classes. Numbers are tuned so each class plays differently while
// keeping the NES Gauntlet identities (strong warrior, armored valkyrie,
// magical wizard, fast elf).
export const HEROES = {
  warrior: {
    key: 'warrior', color: '#d8433a', light: '#ff8a70', dark: '#6e1a14',
    speed: 150, armor: 0.35, shotDmg: 34, shotSpeed: 430, fireDelay: 0.36,
    melee: 32, magic: 0.7, shot: 'axe', special: 'whirlwind', specialCd: 7,
    bars: { speed: 2, armor: 4, shot: 5, magic: 2 },
  },
  valkyrie: {
    key: 'valkyrie', color: '#3f7fe0', light: '#8fb8ff', dark: '#1a3570',
    speed: 165, armor: 0.5, shotDmg: 24, shotSpeed: 470, fireDelay: 0.3,
    melee: 24, magic: 0.85, shot: 'sword', special: 'charge', specialCd: 5,
    bars: { speed: 3, armor: 5, shot: 3, magic: 3 },
  },
  wizard: {
    key: 'wizard', color: '#a64be0', light: '#d7a0ff', dark: '#4a1a6e',
    speed: 158, armor: 0.1, shotDmg: 28, shotSpeed: 440, fireDelay: 0.32,
    melee: 10, magic: 1.4, shot: 'fire', special: 'nova', specialCd: 8,
    bars: { speed: 3, armor: 1, shot: 4, magic: 5 },
  },
  elf: {
    key: 'elf', color: '#3fbf5a', light: '#9ff0ae', dark: '#17552a',
    speed: 195, armor: 0.2, shotDmg: 18, shotSpeed: 560, fireDelay: 0.19,
    melee: 12, magic: 1.0, shot: 'arrow', special: 'storm', specialCd: 6,
    bars: { speed: 5, armor: 2, shot: 3, magic: 4 },
  },
};
export const HERO_ORDER = ['warrior', 'valkyrie', 'wizard', 'elf'];

// Relics offered between levels (roguelite progression).
export const PERKS = [
  { id: 'dmg', icon: '⚔', apply: p => { p.mods.dmg *= 1.2; } },
  { id: 'rate', icon: '✦', apply: p => { p.mods.rate *= 1.18; } },
  { id: 'speed', icon: '➤', apply: p => { p.mods.speed *= 1.1; } },
  { id: 'armor', icon: '⛨', apply: p => { p.mods.armor += 0.1; } },
  { id: 'pierce', icon: '➶', apply: p => { p.mods.pierce += 1; } },
  { id: 'multi', icon: '⋔', apply: p => { p.mods.multi += 1; } },
  { id: 'food', icon: '🍖', apply: p => { p.mods.food *= 1.5; } },
  { id: 'magic', icon: '✧', apply: p => { p.mods.magic *= 1.35; } },
  { id: 'cd', icon: '↻', apply: p => { p.mods.cd *= 0.75; } },
  { id: 'melee', icon: '✊', apply: p => { p.mods.melee *= 1.6; } },
  { id: 'vital', icon: '❤', apply: p => { p.hp += 300; } },
  { id: 'gold', icon: '◆', apply: p => { p.mods.gold *= 1.5; } },
  { id: 'leech', icon: '♥', apply: p => { p.mods.leech += 2; } },
];

// Base enemy stats; hp and damage scale with tier (1-3) and level.
export const ENEMIES = {
  ghost: { hp: 10, speed: 95, r: 11, dmg: 20, points: 10 },
  grunt: { hp: 26, speed: 80, r: 12, dmg: 10, points: 20 },
  demon: { hp: 34, speed: 88, r: 12, dmg: 10, points: 30 },
  lobber: { hp: 18, speed: 92, r: 10, dmg: 6, points: 30 },
  sorcerer: { hp: 28, speed: 100, r: 11, dmg: 8, points: 40 },
  death: { hp: 1, speed: 112, r: 13, dmg: 0, points: 1000 },
};
export const ENEMY_COLORS = {
  ghost: '#cfd8ff', grunt: '#b08040', demon: '#e04a30',
  lobber: '#7fc050', sorcerer: '#f0c040', death: '#9a60ff', boss: '#ff7a3a',
};

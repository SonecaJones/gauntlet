export const TILE = 32;
export const T = { FLOOR: 0, WALL: 1, DOOR: 2, EXIT: 3 };
export const isSolid = t => t === T.WALL || t === T.DOOR;
export const PLAYER_COLORS = ['#ff5a5a', '#5aa0ff', '#ffd35a', '#5aff8a'];

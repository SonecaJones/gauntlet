// Unified input: keyboard+mouse ('kbm'), gamepads ('pad0'..'pad3') and
// touch ('touch'). Every frame poll() produces one "controller" snapshot per
// device with the same shape, so game code never cares where input came from.
const DEAD = 0.22;
const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const STICK_R = 55;

function blank(id) {
  return {
    id, move: { x: 0, y: 0 }, aim: null, aimPoint: null, fire: false, fireFacing: false,
    dash: false, special: false, potion: false, confirm: false, back: false, start: false,
    pause: false, map: false, left: false, right: false, up: false, down: false,
  };
}

// The Apple Pencil (and other styluses on touch screens) plays like a finger.
const PEN_IS_TOUCH = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
const isTouch = e => e.pointerType === 'touch' || (e.pointerType === 'pen' && PEN_IS_TOUCH);

function dead(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEAD) return [0, 0];
  const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
  return [x * k, y * k];
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, left: false, right: false, leftP: false, rightP: false, active: false };
    this.clicks = [];
    this.touches = new Map();
    this.sticks = { move: null, aim: null };
    this.touchButtons = [];
    this.touchPressed = new Set();
    this.touchActive = false;
    this.padPrev = {};
    this.controllers = {};
    this.onGesture = null;
    // (x, y) -> true where a tap must still produce a real click (share button)
    this.keepClick = null;

    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      if (e.code.startsWith('Arrow')) this.mouse.active = false;
      this.onGesture?.();
    });
    window.addEventListener('keyup', e => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.left = this.mouse.right = false; this.resetTouches(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.resetTouches(); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('pointerdown', e => {
      this.onGesture?.();
      if (isTouch(e)) { this.touchStart(e); return; }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftP = true; this.clicks.push({ x: e.clientX, y: e.clientY, src: 'kbm' }); }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightP = true; }
      this.touchActive = false;
    });
    window.addEventListener('pointermove', e => {
      if (isTouch(e)) { this.touchMove(e); return; }
      if (Math.abs(e.clientX - this.mouse.x) + Math.abs(e.clientY - this.mouse.y) > 2) this.mouse.active = true;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    window.addEventListener('pointerup', e => {
      if (isTouch(e)) { this.touchEnd(e); return; }
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('pointercancel', e => { if (isTouch(e)) this.touchEnd(e); });
    canvas.addEventListener('lostpointercapture', e => { if (isTouch(e)) this.touchEnd(e); });

    // iPadOS turns a held or dragged Apple Pencil into its own gestures (text
    // selection, Scribble, drag and drop) and then stops sending it to the page
    // until a finger touches the screen. Cancelling the touch events keeps the
    // Pencil ours; pointer events still arrive. A plain finger tap keeps its
    // default so the click-based share button still works.
    const stylus = e => [...e.changedTouches].some(t => t.touchType === 'stylus');
    canvas.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      if (stylus(e) && !(t && this.keepClick?.(t.clientX, t.clientY))) e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  }

  // ------------------------------------------------------------ touch
  touchStart(e) {
    this.touchActive = true;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const x = e.clientX, y = e.clientY, w = window.innerWidth;
    this.clicks.push({ x, y, src: 'touch' });
    for (const b of this.touchButtons) {
      if ((x - b.x) ** 2 + (y - b.y) ** 2 <= (b.r + 8) ** 2) {
        this.touchPressed.add(b.id);
        this.touches.set(e.pointerId, { role: 'btn' });
        return;
      }
    }
    // A new touch always takes over its half of the screen: if the browser lost
    // the previous pointer's "up" (it happens with the Pencil), the old stick
    // would otherwise stay stuck and ignore every later touch there.
    const role = x < w * 0.5 ? 'move' : 'aim';
    const old = this.sticks[role];
    if (old) this.touches.delete(old.id);
    this.sticks[role] = { id: e.pointerId, sx: x, sy: y, x, y };
    this.touches.set(e.pointerId, { role });
  }
  touchMove(e) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    // a hovering Pencil (no tip contact) sends moves without buttons: it was lifted
    if (e.pointerType === 'pen' && e.buttons === 0 && !e.pressure) { this.touchEnd(e); return; }
    const st = this.sticks[t.role];
    if (!st) return;
    st.x = e.clientX; st.y = e.clientY;
    const dx = st.x - st.sx, dy = st.y - st.sy, d = Math.hypot(dx, dy);
    if (d > STICK_R * 1.4) { st.sx = st.x - (dx / d) * STICK_R * 1.4; st.sy = st.y - (dy / d) * STICK_R * 1.4; }
  }
  touchEnd(e) {
    const t = this.touches.get(e.pointerId);
    this.touches.delete(e.pointerId);
    if (t && this.sticks[t.role] && this.sticks[t.role].id === e.pointerId) this.sticks[t.role] = null;
  }
  resetTouches() {
    this.touches.clear();
    this.sticks.move = this.sticks.aim = null;
  }
  stickValue(st) {
    if (!st) return [0, 0];
    const dx = (st.x - st.sx) / STICK_R, dy = (st.y - st.sy) / STICK_R;
    const m = Math.hypot(dx, dy);
    return m > 1 ? [dx / m, dy / m] : [dx, dy];
  }

  // ------------------------------------------------------------ polling
  poll() {
    const C = {};
    const k = this.down, p = this.pressed;
    const any = (...codes) => codes.some(c => p.has(c));

    // keyboard + mouse
    const kb = blank('kbm');
    kb.move.x = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    kb.move.y = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
    const ax = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    const ay = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
    if (ax || ay) { kb.aim = { x: ax, y: ay }; kb.fire = true; }
    else if (this.mouse.active && !this.touchActive) { kb.aimPoint = { x: this.mouse.x, y: this.mouse.y }; kb.fire = this.mouse.left; }
    if (k.has('KeyJ')) kb.fireFacing = true;
    kb.dash = any('Space', 'ShiftLeft', 'ShiftRight');
    kb.special = any('KeyE', 'KeyK') || this.mouse.rightP;
    kb.potion = any('KeyQ', 'KeyL');
    kb.confirm = any('Enter', 'NumpadEnter', 'Space');
    kb.back = any('Escape', 'Backspace');
    kb.start = any('Enter', 'NumpadEnter');
    kb.pause = any('Escape', 'KeyP');
    kb.map = any('Tab', 'KeyM');
    kb.left = any('ArrowLeft', 'KeyA');
    kb.right = any('ArrowRight', 'KeyD');
    kb.up = any('ArrowUp', 'KeyW');
    kb.down = any('ArrowDown', 'KeyS');
    C.kbm = kb;

    // gamepads
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const id = 'pad' + gp.index;
      const c = blank(id);
      const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      const prev = this.padPrev[id] || { btn: [], lx: 0, ly: 0 };
      const edge = i => b(i) && !prev.btn[i];
      let [lx, ly] = dead(gp.axes[0] || 0, gp.axes[1] || 0);
      const dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), dy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      if (dx || dy) { lx = dx; ly = dy; }
      c.move = { x: lx, y: ly };
      const [rx, ry] = dead(gp.axes[2] || 0, gp.axes[3] || 0);
      if (Math.hypot(rx, ry) > 0.35) { c.aim = { x: rx, y: ry }; c.fire = true; }
      if (b(7) || b(2)) { c.fireFacing = true; }
      c.dash = edge(0);
      c.special = edge(5) || edge(1);
      c.potion = edge(3) || edge(4);
      c.confirm = edge(0);
      c.back = edge(1);
      c.start = edge(9);
      c.pause = edge(9);
      c.map = edge(8);
      const rawX = gp.axes[0] || 0, rawY = gp.axes[1] || 0;
      c.left = edge(14) || (rawX < -0.6 && prev.lx >= -0.6);
      c.right = edge(15) || (rawX > 0.6 && prev.lx <= 0.6);
      c.up = edge(12) || (rawY < -0.6 && prev.ly >= -0.6);
      c.down = edge(13) || (rawY > 0.6 && prev.ly <= 0.6);
      C[id] = c;
      this.padPrev[id] = { btn: gp.buttons.map((_, i) => b(i)), lx: rawX, ly: rawY };
    }

    // touch
    if (this.touchActive) {
      const c = blank('touch');
      const [mx, my] = this.stickValue(this.sticks.move);
      c.move = { x: mx, y: my };
      const [tx, ty] = this.stickValue(this.sticks.aim);
      if (Math.hypot(tx, ty) > 0.3) { c.aim = { x: tx, y: ty }; c.fire = true; }
      const tp = this.touchPressed;
      c.dash = tp.has('dash');
      c.special = tp.has('special');
      c.potion = tp.has('potion');
      c.pause = tp.has('pause');
      c.map = tp.has('map');
      C.touch = c;
    }
    this.controllers = C;
    return C;
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.leftP = this.mouse.rightP = false;
    this.clicks.length = 0;
    this.touchPressed.clear();
  }

  rumble(id, strong = 0.5, weak = 0.5, ms = 120) {
    try {
      if (id === 'touch') { navigator.vibrate?.(Math.round(ms / 2)); return; }
      if (!id || !id.startsWith('pad')) return;
      const gp = navigator.getGamepads()[Number(id.slice(3))];
      gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
    } catch { /* haptics unsupported */ }
  }
}

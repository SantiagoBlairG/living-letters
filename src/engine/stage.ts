import type { Ambient, EdgeHit, Letter, MaterialId, Pointer, Settings, World } from './types';
import { PALETTES } from './config';
import { LiveColors, css } from './color';
import { clearGlyphs, fontOf, getGlyph, inGlyph, layoutWord } from './layout';
import { calm, integrate, makeLetter, resetInputs } from './simulation';
import { Effects } from './effects';
import { Plants } from './plants';
import { Sound } from './audio';
import { CursorView } from './cursor';
import { BEHAVIORS } from './materials';
import { renderScene } from './renderer';
import { exportBlob } from './exporter';

export interface StageEvents {
  /** two quick taps on empty stage */
  onEmptyDoubleTap?(x: number, y: number): void;
  onInteract?(): void;
}

/** Owns the canvas, the single animation loop, pointer input and the world the materials act on. */
export class Stage implements World {
  letters: Letter[] = [];
  fs = 100; baseline = 0; W = 1; H = 1; t = 0;
  inten = 1; amb = 1; speed = 1;
  lift = 0;
  material: MaterialId;
  p: Pointer = {
    x: -999, y: -999, lx: -999, ly: -999, vx: 0, vy: 0, speed: 0, inside: false, touch: false,
    down: false, held: 0, downX: 0, downY: 0, travel: 0, grab: null, near: 0, active: false,
  };
  fx = new Effects();
  plants = new Plants();
  sound = new Sound();
  colors: LiveColors;
  cursor: CursorView;

  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private ready = false;
  private settings: Settings;
  private timers: { at: number; fn: () => void }[] = [];
  private reduce: MediaQueryList;
  private ro: ResizeObserver;
  private lastEmptyTap = { t: -10, x: 0, y: 0 };
  private downHit: Letter | null = null;
  private amb0: Ambient = { x: 0, y: 0, r: 0, sx: 0, sy: 0 };
  private caretOn = false;
  private caretT = 0; // time of the last keystroke, so the caret stays solid while typing
  private caretA = 0;

  constructor(private canvas: HTMLCanvasElement, settings: Settings, private events: StageEvents = {}) {
    this.ctx = canvas.getContext('2d')!;
    this.settings = { ...settings };
    this.material = settings.material;
    this.lift = BEHAVIORS[this.material].spring.lift;
    this.colors = new LiveColors(this.palette());
    this.cursor = new CursorView(this.material);
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.applyDials();

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('contextmenu', this.prevent);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.reduce.addEventListener('change', this.applyDials);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();

    // Wait for the display face so the first frame is never set in the fallback.
    const start = () => {
      if (this.ready) return;
      this.ready = true;
      clearGlyphs();
      this.relayout(false);
      this.play();
    };
    const fonts = document.fonts;
    if (fonts?.load) {
      Promise.race([fonts.load(fontOf(100), 'hello ñé Āł'), new Promise((r) => setTimeout(r, 2500))]).then(start, start);
      fonts.ready.then(() => { if (this.ready) { clearGlyphs(); this.relayout(false, true); } });
    } else start();
  }

  /* ---------- public API ---------- */

  update(next: Settings) {
    const prev = this.settings;
    this.settings = { ...next };
    if (next.palette !== prev.palette) this.colors.set(this.palette());
    if (next.material !== prev.material) {
      // leave the old material cleanly: no leftover grabs, queued impulses or momentum
      this.p.grab = null; this.timers = [];
      calm(this.letters);
      if (prev.material === 'bloom') this.plants.wither();
      this.material = next.material;
      this.cursor.setMaterial(next.material);
    }
    this.applyDials();
    if (next.word !== prev.word) { this.caretT = this.t; if (this.ready) this.relayout(true); }
  }

  /** Back to rest: positions, deformation and decorations. Word and settings stay. */
  reset() {
    this.p.grab = null; this.timers = [];
    this.fx.clear();
    this.plants.wither();
    for (const l of this.letters) {
      l.vx = l.vy = l.vr = l.vsx = l.vsy = l.vsk = 0;
      l.ox *= 0.25; l.oy *= 0.25; l.rot *= 0.25; l.sk *= 0.25;
      l.sx = 1 + (l.sx - 1) * 0.25; l.sy = 1 + (l.sy - 1) * 0.25;
    }
  }

  exportPng() { return exportBlob(this); }

  /** Shows a text caret after the word while the stage is taking keystrokes. Never part of an export. */
  setCaret(on: boolean) { this.caretOn = on; this.caretT = this.t; }

  destroy() {
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onCancel);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('contextmenu', this.prevent);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.reduce.removeEventListener('change', this.applyDials);
    this.ro.disconnect();
  }

  /* ---------- World ---------- */

  later(ms: number, fn: () => void) { this.timers.push({ at: this.t + ms / 1000, fn }); }
  cx(l: Letter) { return l.bx + l.ox; }
  cy(l: Letter) { return this.baseline - 0.3 * this.fs + l.oy; }

  /** Stage point → glyph space of a letter, in em. */
  private toGlyph(l: Letter, x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = l.m;
    const det = a * d - b * c || 1;
    const lx = (d * (x - e) - c * (y - f)) / det;
    const ly = (-b * (x - e) + a * (y - f)) / det;
    return [(lx + l.adv / 2) / this.fs, (ly - this.lift * this.fs) / this.fs];
  }

  hit(x: number, y: number): Letter | null {
    let loose: Letter | null = null;
    for (const l of this.letters) {
      if (!l.glyph) continue;
      const [gx, gy] = this.toGlyph(l, x, y);
      if (inGlyph(l.glyph, gx, gy)) return l;
      if (gx > 0 && gx < l.adv / this.fs && gy > -0.72 && gy < 0.22) loose = l; // forgiving: counters and gaps still grab
    }
    return loose;
  }

  nearestEdge(x: number, y: number, maxPx: number): EdgeHit | null {
    const max = maxPx / this.fs;
    let best: EdgeHit | null = null;
    let bd = max * max;
    for (const l of this.letters) {
      const g = l.glyph;
      if (!g) continue;
      const [gx, gy] = this.toGlyph(l, x, y);
      if (gx < -0.35 - max || gx > l.adv / this.fs + 0.35 + max || gy < -1.1 - max || gy > 0.45 + max) continue;
      const inside = inGlyph(g, gx, gy);
      if (inside) bd = Infinity;
      const e = g.edges;
      let hitI = -1;
      for (let i = 0; i < e.length; i += 4) {
        const dx = e[i] - gx, dy = e[i + 1] - gy;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; hitI = i; }
      }
      if (hitI >= 0) {
        best = { l, ex: e[hitI], ey: e[hitI + 1], nx: e[hitI + 2], ny: e[hitI + 3], dist: inside ? 0 : Math.sqrt(bd) * this.fs, inside, ix: gx, iy: gy };
      }
      if (inside) return best;
    }
    return best;
  }

  /* ---------- internals ---------- */

  private palette() { return PALETTES.find((p) => p.id === this.settings.palette) ?? PALETTES[0]; }

  private applyDials = () => {
    const calmMode = this.reduce.matches;
    const s = this.settings;
    this.inten = (0.3 + s.intensity * 1.4) * (calmMode ? 0.55 : 1);
    this.amb = calmMode ? 0 : s.motion * 2;
    this.speed = 0.35 + s.motion * 1.3;
  };

  get mobile() { return this.W < 1100; }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W; this.H = H; this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    if (this.ready) { this.relayout(false, true); this.draw(); }
  }

  /** Rebuilds letter slots. Letters that survive keep their state; with `soft` they glide to their new place. */
  private relayout(soft: boolean, keep = false) {
    const L = layoutWord(this.settings.word, this.W, this.H, this.mobile);
    const old = this.letters;
    const lift = this.lift;
    const oldPivotY = this.baseline - lift * this.fs, newPivotY = L.baseline - lift * L.fs;
    const q = this.fs / L.fs;
    let fresh = 0;
    this.letters = L.slots.map((slot, i) => {
      const prev = old[i];
      const reuse = !!prev && prev.ch === slot.ch;
      const l = reuse ? prev : makeLetter(slot.ch, i);
      const bx = L.left + slot.x + slot.adv / 2;
      if (reuse && soft) {
        l.ox += l.bx - bx; l.oy += oldPivotY - newPivotY;
        l.sx *= q; l.sy *= q;
      } else if (!reuse && !keep) {
        l.alpha = 0; l.oy = L.fs * 0.08; l.sy = 0.92; l.delay = 0.03 + fresh++ * 0.04;
      }
      l.index = i; l.bx = bx; l.adv = slot.adv; l.glyph = getGlyph(slot.ch);
      return l;
    });
    this.fs = L.fs; this.baseline = L.baseline;
    if (this.p.grab && !this.letters.includes(this.p.grab)) this.p.grab = null;
    this.plants.keepOnly(new Set(this.letters));
    this.matrices();
  }

  private matrices() {
    const mat = BEHAVIORS[this.material];
    const A = this.amb0;
    const py = this.baseline - this.lift * this.fs;
    for (const l of this.letters) {
      A.x = A.y = A.r = A.sx = A.sy = 0;
      mat.ambient(l, this, A);
      const r = l.rot + A.r, sx = l.sx + A.sx, sy = l.sy + A.sy, sk = l.sk;
      const cos = Math.cos(r), sin = Math.sin(r);
      const m = l.m;
      m[0] = cos * sx; m[1] = sin * sx;
      m[2] = -cos * sk * sy - sin * sy; m[3] = -sin * sk * sy + cos * sy;
      m[4] = l.bx + l.ox + A.x; m[5] = py + l.oy + A.y;
    }
  }

  private play() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    const p = this.p, mat = BEHAVIORS[this.material];

    if (this.timers.length) {
      const due = this.timers.filter((q) => q.at <= this.t);
      if (due.length) { this.timers = this.timers.filter((q) => q.at > this.t); due.forEach((q) => q.fn()); }
    }

    // pointer velocity, smoothed; decays to zero by itself when the hand stops
    const k = 1 - Math.exp(-dt * 16);
    p.vx += ((p.x - p.lx) / dt - p.vx) * k; p.vy += ((p.y - p.ly) / dt - p.vy) * k;
    p.lx = p.x; p.ly = p.y;
    p.speed = Math.hypot(p.vx, p.vy);
    p.active = p.touch ? p.down : p.inside;
    if (p.down) p.held += dt;

    resetInputs(this.letters);
    mat.update(this, dt);
    integrate(this.letters, mat.spring, dt, this.fs);
    this.lift += (mat.spring.lift - this.lift) * (1 - Math.exp(-dt * 8));
    this.matrices();

    // how close the pointer is to the letters — cursors react to it
    const showCursor = p.inside && !p.touch;
    let near = 0;
    if (showCursor) {
      if (this.material === 'bloom') {
        const e = this.nearestEdge(p.x, p.y, 70);
        near = e ? 1 - e.dist / 70 : 0;
      } else if (this.material === 'magnet') {
        let d = Infinity;
        for (const l of this.letters) if (l.glyph) d = Math.min(d, Math.hypot(this.cx(l) - p.x, this.cy(l) - p.y));
        near = Math.max(0, 1 - d / (this.fs * 0.7));
      }
    }
    p.near = near;

    this.plants.update(dt);
    this.fx.update(dt);
    this.colors.update(dt);
    this.cursor.update(dt, p, showCursor);
    this.caretA += ((this.caretOn ? 1 : 0) - this.caretA) * (1 - Math.exp(-dt * 14));
    this.draw();
  };

  private draw() {
    renderScene(this.ctx, this, this.dpr);
    this.drawCaret();
    this.cursor.draw(this.ctx, this.colors.now);
  }

  /** A blinking bar after the last letter; it rides along with that letter's motion. */
  private drawCaret() {
    if (this.caretA < 0.02) return;
    const since = this.t - this.caretT;
    const blink = since < 0.6 ? 1 : 0.5 + 0.5 * Math.cos((since - 0.6) * Math.PI * 1.7);
    const ctx = this.ctx, fs = this.fs;
    const last = this.letters[this.letters.length - 1];
    const x = last ? last.bx + last.adv / 2 + last.ox + fs * 0.05 : this.W / 2;
    const y = this.baseline + (last ? last.oy : 0);
    const w = Math.max(2, fs * 0.022);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = this.caretA * (0.15 + 0.85 * blink);
    ctx.fillStyle = css(this.colors.now.spark);
    ctx.beginPath();
    ctx.roundRect(x, y - fs * 0.74, w, fs * 0.8, w / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else if (this.ready) this.play();
  };

  private prevent = (e: Event) => e.preventDefault();

  private locate(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  }

  private onMove = (e: PointerEvent) => {
    const p = this.p;
    const [x, y] = this.locate(e);
    const touch = e.pointerType === 'touch';
    if (!p.inside || touch !== p.touch) { p.lx = x; p.ly = y; p.vx = p.vy = 0; }
    if (p.down) p.travel += Math.hypot(x - p.x, y - p.y);
    p.x = x; p.y = y; p.touch = touch;
    if (!touch) { p.inside = true; this.canvas.style.cursor = 'none'; }
  };

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.p.down) return;
    const p = this.p;
    const [x, y] = this.locate(e);
    p.touch = e.pointerType === 'touch';
    if (p.touch || !p.inside) { p.lx = x; p.ly = y; p.vx = p.vy = 0; }
    p.x = x; p.y = y; p.inside = true;
    p.down = true; p.held = 0; p.travel = 0; p.downX = x; p.downY = y;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    this.downHit = this.hit(x, y);
    BEHAVIORS[this.material].down(this, this.downHit);
    this.events.onInteract?.();
  };

  private finish(click: boolean) {
    const p = this.p;
    if (!p.down) return;
    BEHAVIORS[this.material].up(this, this.downHit, click);
    p.down = false; p.grab = null;
    if (click && !this.downHit) {
      const lt = this.lastEmptyTap;
      if (this.t - lt.t < 0.4 && Math.hypot(p.x - lt.x, p.y - lt.y) < 32) { lt.t = -10; this.events.onEmptyDoubleTap?.(p.x, p.y); }
      else { lt.t = this.t; lt.x = p.x; lt.y = p.y; }
    }
    if (p.touch) p.inside = false;
  }

  private onUp = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const [x, y] = this.locate(e);
    this.p.x = x; this.p.y = y;
    this.finish(this.p.travel < 8 && this.p.held < 0.45);
  };
  private onCancel = () => this.finish(false);
  private onLeave = () => { if (!this.p.down) this.p.inside = false; };
}

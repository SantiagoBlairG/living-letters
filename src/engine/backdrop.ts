import type { Stage } from './stage';
import type { ColorKey } from './types';
import { css, mix, type RGB } from './color';

/**
 * The atmosphere behind the word: a faint background in the spirit of the current material. It answers the
 * pointer (hover), the press, and clicks — every click sends a shock through it, and some materials answer
 * with something of their own (balloons pop, a garden sheds petals, the glass cracks). It is kept quiet on
 * purpose so the word stays the subject. `update` moves it once per frame; `draw` only paints, so the scene
 * can be drawn twice in one frame (for recording).
 */

type C = Record<ColorKey, RGB>;
const TAU = Math.PI * 2;
const FIRE: RGB[] = [[255, 214, 90], [255, 138, 31], [232, 56, 28]];
const WHITE: RGB = [255, 255, 255];
const SHOCK_LIFE = 1.4;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/* ---------- particles ---------- */

// short-lived bits
const CONFETTI = 0, PETAL = 1, SHARD = 2, EMBER = 3, SPLASH = 4, STREAK = 5, DUST = 6;

interface Dot {
  x: number; y: number; vx: number; vy: number; bx: number; by: number;
  s: number; c: number; ph: number; rot: number; vr: number; age: number; max: number; k: number;
}
const dot = (o: Partial<Dot>): Dot => ({
  x: 0, y: 0, vx: 0, vy: 0, bx: 0, by: 0, s: 1, c: 0, ph: Math.random() * TAU,
  rot: Math.random() * TAU, vr: 0, age: 0, max: Infinity, k: 0, ...o,
});

type Shape = 'dot' | 'ring' | 'streak' | 'ember' | 'leaf' | 'flake';
type Push = 'away' | 'swirl' | 'drag' | 'heat';
interface Spec {
  n: number; vx: [number, number]; vy: [number, number]; size: [number, number];
  sway: number; shape: Shape; colors: ColorKey[] | 'fire'; alpha: number; push: Push;
}

/** Drifting particles: count, base velocity (px/s), size, sideways sway, look, and how the pointer moves them. */
const DRIFT: Record<string, Spec> = {
  sand: { n: 190, vx: [14, 34], vy: [-2, 2], size: [0.8, 1.7], sway: 6, shape: 'dot', colors: ['spark', 'ink'], alpha: 0.26, push: 'drag' },
  'el-fire': { n: 70, vx: [-6, 6], vy: [-46, -18], size: [1, 2.6], sway: 14, shape: 'ember', colors: 'fire', alpha: 0.55, push: 'swirl' },
  'el-air': { n: 26, vx: [40, 85], vy: [-6, 6], size: [3, 6], sway: 18, shape: 'leaf', colors: ['stem', 'flower', 'spark'], alpha: 0.34, push: 'swirl' },
  'el-earth': { n: 60, vx: [-6, 6], vy: [3, 10], size: [1, 2.8], sway: 4, shape: 'dot', colors: ['ink'], alpha: 0.18, push: 'away' },
  ice: { n: 70, vx: [-6, 6], vy: [10, 28], size: [2.5, 6], sway: 14, shape: 'flake', colors: ['stem', 'ink'], alpha: 0.3, push: 'swirl' },
  'el-water': { n: 95, vx: [-8, -3], vy: [70, 120], size: [9, 18], sway: 0, shape: 'streak', colors: ['stem'], alpha: 0.24, push: 'away' },
};

interface Stem { x: number; h: number; lean: number; v: number; flower: boolean; ph: number }
interface Crack { pts: number[]; born: number; imp: Impact }
interface Impact { x: number; y: number; dead: number }
interface Ripple { x: number; y: number; born: number; big: boolean }
interface Shock { x: number; y: number; born: number }

export class Backdrop {
  private kind = '';
  private W = 0; private H = 0;
  private t = 0;
  private fade = 0; // eases in after the material changes
  // smoothed pointer, how present it is (0 when away), and whether it is pressed
  private px = 0; private py = 0; private pa = 0; private pvx = 0; private pvy = 0; private held = false;

  private dots: Dot[] = []; // the kind's own population
  private bits: Dot[] = []; // short-lived: confetti, petals, shards, embers, splashes…
  private stems: Stem[] = [];
  private trails: number[][] = []; // echo: light trails, the last one is the pointer's
  private frost: number[][] = []; // ice: crystals grown in from the corners
  private impacts: Impact[] = [];
  private cracks: Crack[] = [];
  private ripples: Ripple[] = [];
  private shocks: Shock[] = [];
  private quake = 0;

  /* ---------- events from the stage ---------- */

  press() { this.held = true; }
  release() { this.held = false; }

  /** A click: a shock through everything, and the kind's own answer. */
  click(x: number, y: number) {
    this.shocks.push({ x, y, born: this.t });
    if (this.shocks.length > 6) this.shocks.shift();
    const k = this.kind;
    if (k === 'balloon') {
      let popped = 0;
      for (const b of this.dots) {
        if (Math.hypot(b.x - x, b.y - y) > 130) continue;
        this.confetti(b.x, b.y, 16, b.c);
        b.y = this.H + b.s * 3 + rand(0, 80); b.x = rand(0, this.W); // a new one drifts up from below
        popped++;
      }
      if (!popped) this.confetti(x, y, 10, 0);
    } else if (k === 'bloom') {
      for (let i = 0; i < 18; i++) {
        const a = rand(0, TAU), sp = rand(60, 220);
        this.bit({ k: PETAL, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, s: rand(3, 6), c: i, vr: rand(-4, 4), max: rand(2.5, 4) });
      }
    } else if (k === 'explode') {
      this.impact(x, y, this.t);
      for (let i = 0; i < 16; i++) {
        const a = rand(0, TAU), sp = rand(120, 380);
        this.bit({ k: SHARD, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: rand(4, 10), vr: rand(-8, 8), max: rand(1, 1.8) });
      }
    } else if (k === 'el-fire') {
      for (let i = 0; i < 34; i++) {
        const a = -Math.PI / 2 + rand(-1.2, 1.2), sp = rand(80, 320);
        this.bit({ k: EMBER, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: rand(1, 2.6), c: i % 3, max: rand(0.8, 1.8) });
      }
    } else if (k === 'el-air') {
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * TAU, sp = rand(220, 380);
        this.bit({ k: STREAK, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: rand(18, 34), max: rand(0.5, 0.8) });
      }
    } else if (k === 'el-earth') {
      this.quake = 1;
      for (let i = 0; i < 26; i++) {
        this.bit({ k: DUST, x: x + rand(-40, 40), y: y + rand(-10, 10), vx: rand(-80, 80), vy: rand(-90, -20), s: rand(6, 16), max: rand(1.2, 2) });
      }
    } else if (k === 'el-water') {
      this.ripples.push({ x, y, born: this.t, big: true });
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI / 2 + rand(-1.3, 1.3), sp = rand(100, 300);
        this.bit({ k: SPLASH, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: rand(1.5, 3.2), max: 1.2 });
      }
    }
  }

  private bit(o: Partial<Dot>) {
    if (this.bits.length > 400) this.bits.shift();
    this.bits.push(dot(o));
  }

  private confetti(x: number, y: number, n: number, c: number) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(60, 260);
      this.bit({ k: CONFETTI, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, s: rand(3, 6), c: c + i, vr: rand(-10, 10), max: rand(1.4, 2.4) });
    }
  }

  /** The combined push of recent clicks at a point: a ring that travels outward and fades. */
  private shockAt(x: number, y: number) {
    let fx = 0, fy = 0, w = 0;
    for (const s of this.shocks) {
      const age = this.t - s.born;
      const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy) || 1;
      const r = age * 700;
      const k = Math.exp(-(((d - r) / 70) ** 2)) * (1 - age / SHOCK_LIFE);
      if (k < 0.01) continue;
      fx += (dx / d) * k; fy += (dy / d) * k; w += k;
    }
    return { fx, fy, w };
  }

  /** A crack web: rays out from the point, branches, and rings joining the rays. */
  private impact(x: number, y: number, born: number) {
    const imp: Impact = { x, y, dead: -1 };
    this.impacts.push(imp);
    const live = this.impacts.filter((i) => i.dead < 0);
    if (live.length > 5) live[0].dead = this.t;
    const R = rand(170, 330), n = 9 + Math.floor(rand(0, 4));
    const ang: number[] = [];
    for (let i = 0; i < n; i++) ang.push(((i + rand(-0.3, 0.3)) / n) * TAU);
    const rays: number[][] = [];
    ang.forEach((a0, i) => {
      let a = a0, cx = x, cy = y;
      const pts = [cx, cy], len = R * rand(0.6, 1.15);
      for (let s = 0; s < 6; s++) {
        a += rand(-0.18, 0.18);
        cx += Math.cos(a) * (len / 6); cy += Math.sin(a) * (len / 6);
        pts.push(cx, cy);
        if (s === 2 && Math.random() < 0.45) { // a branch
          const b = a + (Math.random() < 0.5 ? -1 : 1) * rand(0.4, 0.8);
          this.cracks.push({ pts: [cx, cy, cx + Math.cos(b) * len * 0.25, cy + Math.sin(b) * len * 0.25], born: born + 0.12, imp });
        }
      }
      rays.push(pts);
      this.cracks.push({ pts, born: born + i * 0.015, imp });
    });
    for (const f of [0.28, 0.52, 0.78]) { // the web's rings, chord by chord
      for (let i = 0; i < n; i++) {
        const a = rays[i], b = rays[(i + 1) % n], j = Math.round(f * 6) * 2;
        if (Math.random() < 0.2) continue;
        this.cracks.push({ pts: [a[j], a[j + 1], b[j], b[j + 1]], born: born + 0.15 + f * 0.25, imp });
      }
    }
  }

  /* ---------- per material ---------- */

  private kindOf(st: Stage) { return st.material === 'elements' ? 'el-' + st.element : st.material; }

  private reseed() {
    const { W, H } = this;
    this.dots = []; this.bits = []; this.stems = []; this.trails = []; this.frost = []; this.impacts = []; this.cracks = []; this.ripples = [];
    const spec = DRIFT[this.kind];
    if (spec) {
      for (let i = 0; i < spec.n; i++) {
        const vx = rand(...spec.vx), vy = rand(...spec.vy);
        this.dots.push(dot({ x: rand(0, W), y: rand(0, H), vx, vy, bx: vx, by: vy, s: rand(...spec.size), c: i, vr: rand(-2, 2) }));
      }
    }
    switch (this.kind) {
      case 'focus': // bokeh: soft discs of out-of-focus light
        for (let i = 0; i < 26; i++) { const vx = rand(-6, 6), vy = rand(-6, 6); this.dots.push(dot({ x: rand(0, W), y: rand(0, H), vx, vy, bx: vx, by: vy, s: rand(14, 46), c: i })); }
        break;
      case 'echo':
        for (let i = 0; i < 6; i++) this.trails.push([]);
        this.trails.push([]);
        break;
      case 'ferro': // metallic droplets that gather toward the hand
        for (let i = 0; i < 46; i++) { const x = rand(0, W), y = rand(0, H); this.dots.push(dot({ x, y, bx: x, by: y, s: rand(2, 6) })); }
        break;
      case 'ice': // frost creeping in from the four corners
        for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
          for (let i = 0; i < 9; i++) {
            const a = Math.atan2(H / 2 - cy, W / 2 - cx) + rand(-0.8, 0.8), len = rand(60, 170);
            const pts = [cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len];
            for (let b = 0; b < 4; b++) {
              const u = rand(0.25, 0.85), side = Math.random() < 0.5 ? -1 : 1, bl = len * rand(0.15, 0.3);
              const bx = cx + Math.cos(a) * len * u, by = cy + Math.sin(a) * len * u;
              pts.push(bx, by, bx + Math.cos(a + side * 0.9) * bl, by + Math.sin(a + side * 0.9) * bl);
            }
            this.frost.push(pts);
          }
        }
        break;
      case 'jelly':
        for (let i = 0; i < 5; i++) this.dots.push(dot({ bx: rand(0.1, 0.9) * W, by: rand(0.15, 0.85) * H, s: rand(0.16, 0.32) * Math.min(W, H) * 1.4 }));
        break;
      case 'melt':
        for (let i = 0; i < 24; i++) { const v = rand(8, 20); this.dots.push(dot({ x: rand(0, W), y: rand(-H, H), vy: v, by: v, s: rand(30, 100), c: rand(2.5, 6) })); }
        break;
      case 'blackhole':
        for (let i = 0; i < 180; i++) this.dots.push(dot({ x: rand(0, W), y: rand(0, H), s: rand(0.6, 1.9) }));
        break;
      case 'balloon':
        for (let i = 0; i < 16; i++) { const v = rand(-34, -14); this.dots.push(dot({ x: rand(0, W), y: rand(0, H * 1.2), vy: v, by: v, s: rand(11, 26), c: i })); }
        break;
      case 'bloom': {
        const n = Math.ceil(W / 30);
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5) * (W / n) + rand(-8, 8), edge = Math.abs(x / W - 0.5) * 2;
          this.stems.push({ x, h: rand(0.07, 0.2) * H * (0.7 + edge * 0.9), lean: 0, v: 0, flower: Math.random() < 0.4, ph: rand(0, TAU) });
        }
        for (let i = 0; i < 16; i++) this.dots.push(dot({ x: rand(0, W), y: rand(0, H), vx: rand(-8, 8), vy: rand(8, 18), bx: rand(-8, 8), by: rand(8, 18), s: rand(3, 5.5), c: i, vr: rand(-1.5, 1.5) }));
        break;
      }
      case 'explode':
        for (let i = 0; i < 3; i++) this.impact(rand(0.1, 0.9) * W, rand(0.15, 0.85) * H, -10);
        for (let i = 0; i < 20; i++) this.dots.push(dot({ x: rand(0, W), y: rand(0, H), vx: rand(-8, 8), vy: rand(-8, 8), bx: rand(-8, 8), by: rand(-8, 8), s: rand(5, 13), vr: rand(-0.6, 0.6) }));
        break;
    }
  }

  update(dt: number, st: Stage) {
    const kind = this.kindOf(st);
    if (kind !== this.kind || Math.abs(st.W - this.W) > 2 || Math.abs(st.H - this.H) > 2) {
      if (kind !== this.kind) this.fade = 0;
      this.kind = kind; this.W = st.W; this.H = st.H;
      this.reseed();
    }
    this.t += dt;
    this.fade = Math.min(1, this.fade + dt * 1.2);
    const p = st.p;
    const q = 1 - Math.exp(-dt * 10);
    this.px += (p.x - this.px) * q; this.py += (p.y - this.py) * q;
    this.pvx = p.vx; this.pvy = p.vy;
    this.pa += ((p.active ? 1 : 0) - this.pa) * (1 - Math.exp(-dt * 4));
    this.shocks = this.shocks.filter((s) => this.t - s.born < SHOCK_LIFE);
    this.quake = Math.max(0, this.quake - dt * 0.8);
    const { W, H, px, py, pa } = this;

    const spec = DRIFT[kind];
    if (spec) {
      const R = 180, m = 30;
      for (const d of this.dots) {
        const relax = Math.min(1, dt * 1.5);
        d.vx += (d.bx - d.vx) * relax; d.vy += (d.by - d.vy) * relax;
        if (pa > 0.05) {
          const dx = d.x - px, dy = d.y - py, r = Math.hypot(dx, dy) || 1;
          if (r < R) {
            const f = (1 - r / R) * pa * (this.held ? 1.8 : 1);
            if (spec.push === 'away') { d.vx += (dx / r) * 1000 * f * dt; d.vy += (dy / r) * 1000 * f * dt; }
            else if (spec.push === 'swirl') { d.vx += ((-dy / r) * 800 - (dx / r) * 120) * f * dt; d.vy += ((dx / r) * 800 - (dy / r) * 120) * f * dt; }
            else if (spec.push === 'drag') { d.vx += this.pvx * f * dt * 3; d.vy += this.pvy * f * dt * 3; }
            else { d.vy -= 640 * f * dt; }
          }
        }
        const sh = this.shockAt(d.x, d.y);
        d.vx += sh.fx * 2400 * dt; d.vy += sh.fy * 2400 * dt;
        d.x += (d.vx + Math.sin(this.t * 1.3 + d.ph) * spec.sway) * dt;
        d.y += d.vy * dt;
        d.rot += (d.vr + d.vx * 0.01) * dt;
        if (kind === 'el-water' && d.y > H + m) { // a drop lands: a ring on the water
          if (Math.random() < 0.6) this.ripples.push({ x: d.x, y: rand(H * 0.78, H * 0.98), born: this.t, big: false });
        }
        if (d.x < -m) d.x += W + 2 * m; else if (d.x > W + m) d.x -= W + 2 * m;
        if (d.y < -m) d.y += H + 2 * m; else if (d.y > H + m) d.y -= H + 2 * m;
      }
    }

    switch (kind) {
      case 'focus':
        for (const d of this.dots) {
          const sh = this.shockAt(d.x, d.y);
          d.x += (d.vx + sh.fx * 300) * dt; d.y += (d.vy + sh.fy * 300) * dt;
          if (d.x < -60) d.x += W + 120; else if (d.x > W + 60) d.x -= W + 120;
          if (d.y < -60) d.y += H + 120; else if (d.y > H + 60) d.y -= H + 120;
        }
        break;
      case 'echo': {
        // slow lights tracing loops; the last trail follows the pointer
        for (let i = 0; i < this.trails.length; i++) {
          const tr = this.trails[i];
          let x: number, y: number;
          if (i === this.trails.length - 1) { if (pa < 0.05) { tr.length = Math.max(0, tr.length - 4); continue; } x = px; y = py; }
          else {
            const tt = this.t * (0.18 + i * 0.03) + i * 1.7;
            x = W * (0.5 + 0.42 * Math.sin(tt * (1 + i * 0.13))); y = H * (0.5 + 0.38 * Math.sin(tt * 1.7 + i));
            const sh = this.shockAt(x, y); x += sh.fx * 60; y += sh.fy * 60;
          }
          tr.push(x, y);
          if (tr.length > (i === this.trails.length - 1 ? 70 : 120)) tr.splice(0, 2);
        }
        break;
      }
      case 'ferro':
        for (const d of this.dots) { // drawn toward the hand, back to their place when it leaves
          let tx = d.bx, ty = d.by;
          if (pa > 0.05) {
            const dx = px - d.bx, dy = py - d.by, r = Math.hypot(dx, dy) || 1;
            if (r < 260) { const f = (1 - r / 260) * pa * (this.held ? 0.85 : 0.55); tx += dx * f; ty += dy * f; }
          }
          const sh = this.shockAt(d.x, d.y);
          d.vx += ((tx - d.x) * 14 - d.vx * 5 + sh.fx * 3000) * dt;
          d.vy += ((ty - d.y) * 14 - d.vy * 5 + sh.fy * 3000) * dt;
          d.x += d.vx * dt; d.y += d.vy * dt;
        }
        break;
      case 'jelly':
        for (const d of this.dots) { // soft blobs pushed aside by the pointer and by clicks, springing back
          const cx = d.bx + d.x, cy = d.by + d.y;
          const dx = cx - px, dy = cy - py, r = Math.hypot(dx, dy) || 1;
          const f = Math.max(0, 1 - r / (d.s * 1.2)) * pa;
          const sh = this.shockAt(cx, cy);
          d.vx += ((dx / r) * 360 * f + sh.fx * 4000 - d.x * 12 - d.vx * 4) * dt;
          d.vy += ((dy / r) * 360 * f + sh.fy * 4000 - d.y * 12 - d.vy * 4) * dt;
          d.x += d.vx * dt; d.y += d.vy * dt;
        }
        break;
      case 'melt':
        for (const d of this.dots) { // slow drips, quicker in the heat of the pointer, and jolted by clicks
          const f = Math.max(0, 1 - Math.hypot(d.x - px, d.y - py) / 240) * pa;
          const sh = this.shockAt(d.x, d.y);
          d.vy += (d.by * (1 + f * 4 + sh.w * 10) - d.vy) * Math.min(1, dt * 3);
          d.y += d.vy * dt;
          if (d.y - d.s > H) { d.y = -rand(0, H * 0.3); d.x = rand(0, W); }
        }
        break;
      case 'balloon':
        for (const b of this.dots) { // balloons rising, nudged aside by the hand, blown by clicks
          b.vy += (b.by - b.vy) * Math.min(1, dt * 1.2);
          b.vx *= 1 - Math.min(1, dt * 1.5);
          if (pa > 0.05) {
            const dx = b.x - px, dy = b.y - py, r = Math.hypot(dx, dy) || 1;
            if (r < 160) { const f = (1 - r / 160) * pa; b.vx += (dx / r) * 700 * f * dt; b.vy += (dy / r) * 500 * f * dt; }
          }
          const sh = this.shockAt(b.x, b.y);
          b.vx += sh.fx * 1600 * dt; b.vy += sh.fy * 1600 * dt;
          b.x += (b.vx + Math.sin(this.t * 0.9 + b.ph) * 12) * dt;
          b.y += b.vy * dt;
          if (b.y < -b.s * 4) { b.y = H + b.s * 3; b.x = rand(0, W); }
          if (b.x < -40) b.x += W + 80; else if (b.x > W + 40) b.x -= W + 80;
        }
        break;
      case 'bloom':
        for (const s of this.stems) { // stems sway, lean away from the hand and bend with a click's shock
          let target = Math.sin(this.t * 0.8 + s.ph) * 0.12;
          if (pa > 0.05) {
            const dx = s.x - px;
            if (Math.abs(dx) < 170 && py > H - s.h * 2) target += Math.sign(dx || 1) * (1 - Math.abs(dx) / 170) * 0.9 * pa;
          }
          target += this.shockAt(s.x, H - s.h * 0.5).fx * 1.6;
          s.v += ((target - s.lean) * 34 - s.v * 5) * dt;
          s.lean += s.v * dt;
        }
        for (const d of this.dots) { // petals drifting down, swirling round the hand
          d.vx += (d.bx - d.vx) * Math.min(1, dt); d.vy += (d.by - d.vy) * Math.min(1, dt);
          if (pa > 0.05) {
            const dx = d.x - px, dy = d.y - py, r = Math.hypot(dx, dy) || 1;
            if (r < 170) { const f = (1 - r / 170) * pa; d.vx += (-dy / r) * 700 * f * dt; d.vy += (dx / r) * 700 * f * dt; }
          }
          const sh = this.shockAt(d.x, d.y);
          d.vx += sh.fx * 2000 * dt; d.vy += sh.fy * 2000 * dt;
          d.x += (d.vx + Math.sin(this.t + d.ph) * 14) * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
          if (d.y > H + 20) { d.y = -20; d.x = rand(0, W); }
          if (d.x < -20) d.x += W + 40; else if (d.x > W + 20) d.x -= W + 40;
        }
        break;
      case 'explode':
        for (const d of this.dots) { // floating shards, turning, fleeing the hand
          d.vx += (d.bx - d.vx) * Math.min(1, dt * 0.8); d.vy += (d.by - d.vy) * Math.min(1, dt * 0.8);
          if (pa > 0.05) {
            const dx = d.x - px, dy = d.y - py, r = Math.hypot(dx, dy) || 1;
            if (r < 160) { const f = (1 - r / 160) * pa; d.vx += (dx / r) * 600 * f * dt; d.vy += (dy / r) * 600 * f * dt; d.vr += f * 3 * dt; }
          }
          const sh = this.shockAt(d.x, d.y);
          d.vx += sh.fx * 2600 * dt; d.vy += sh.fy * 2600 * dt; d.vr += sh.w * 6 * dt;
          d.vr *= 1 - Math.min(1, dt * 0.6);
          d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
          if (d.x < -30) d.x += W + 60; else if (d.x > W + 30) d.x -= W + 60;
          if (d.y < -30) d.y += H + 60; else if (d.y > H + 30) d.y -= H + 60;
        }
        this.impacts = this.impacts.filter((i) => i.dead < 0 || this.t - i.dead < 1);
        this.cracks = this.cracks.filter((c) => this.impacts.includes(c.imp));
        break;
    }

    // short-lived bits
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.age += dt;
      if (b.age > b.max) { this.bits.splice(i, 1); continue; }
      const drag = 1 - Math.min(1, dt * (b.k === STREAK ? 3 : b.k === DUST ? 2.2 : 1.6));
      b.vx *= drag; b.vy *= drag;
      if (b.k === EMBER) b.vy -= 90 * dt;
      else if (b.k === SPLASH) b.vy += 700 * dt;
      else if (b.k === DUST) b.vy += 10 * dt;
      else if (b.k !== STREAK) b.vy += 160 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
      if (b.k === DUST) b.s += dt * 12;
    }
    this.ripples = this.ripples.filter((r) => this.t - r.born < (r.big ? 1.6 : 0.9));
    if (this.ripples.length > 60) this.ripples.splice(0, this.ripples.length - 60);
  }

  /* ---------- drawing ---------- */

  draw(ctx: CanvasRenderingContext2D, c: C) {
    if (this.fade < 0.01) return;
    const k = this.kind, t = this.t, { W, H, px, py, pa } = this;
    const a = this.fade * 1.4; // overall strength
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    const spec = DRIFT[k];
    if (k === 'el-fire') { // heat rising off the bottom of the stage, flickering, and a warmth round the hand
      const g = ctx.createLinearGradient(0, H, 0, H * 0.55);
      g.addColorStop(0, css(FIRE[1], (0.16 + 0.04 * Math.sin(t * 3.1) + 0.03 * Math.sin(t * 7.3)) * a));
      g.addColorStop(1, css(FIRE[2], 0));
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.55, W, H * 0.45);
      if (pa > 0.05) {
        const r = ctx.createRadialGradient(px, py, 0, px, py, 180);
        r.addColorStop(0, css(FIRE[0], 0.09 * pa * a)); r.addColorStop(1, css(FIRE[0], 0));
        ctx.fillStyle = r; ctx.beginPath(); ctx.arc(px, py, 180, 0, TAU); ctx.fill();
      }
    } else if (k === 'el-air') { // swooshes of wind, and a little vortex round the hand
      ctx.strokeStyle = css(c.ink, 0.1 * a); ctx.lineWidth = 1.3;
      for (let i = 0; i < 14; i++) {
        const y0 = H * ((i + 0.5) / 14);
        ctx.setLineDash([120 + (i % 3) * 50, 70 + (i % 4) * 30]);
        ctx.lineDashOffset = -t * (220 + (i % 5) * 50);
        ctx.beginPath();
        for (let x = -20; x <= W + 20; x += 16) {
          const dy = y0 - py, g = Math.exp(-((x - px) ** 2 + dy ** 2) / (2 * 140 * 140));
          const y = y0 + Math.sin(x * 0.004 + t * 0.9 + i * 1.3) * 34 + Math.sign(dy || 1) * g * 50 * pa;
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (pa > 0.05) {
        ctx.strokeStyle = css(c.ink, 0.16 * pa * a); ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) {
          const r = 26 + i * 22, s = t * (3 - i * 0.6) + i * 2;
          ctx.beginPath(); ctx.arc(px, py, r, s, s + 2.2); ctx.stroke();
        }
      }
    } else if (k === 'el-earth') { // layers of rock that heave into a mound under the hand and shake in a quake
      ctx.strokeStyle = css(mix(c.ink, c.bg, 0.25), 0.16 * a); ctx.lineWidth = 1.4;
      for (let i = 0; i < 10; i++) {
        const y0 = H * (0.5 + i * 0.052);
        ctx.beginPath();
        for (let x = -10; x <= W + 10; x += 12) {
          let y = y0 + Math.sin(x * 0.006 + i * 1.7) * 12 + Math.sin(x * 0.017 + i * 0.6) * 5;
          y -= Math.exp(-((x - px) ** 2) / (2 * 130 * 130)) * 40 * pa * (py > H * 0.35 ? 1 : 0.4) * (1 - i * 0.06);
          y += Math.sin(x * 0.05 + t * 42 + i) * this.quake * 7;
          const sh = this.shockAt(x, y0);
          y += sh.fy * 26;
          if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (k === 'el-water') { // rings where the rain lands
      for (const r of this.ripples) {
        const age = t - r.born, life = r.big ? 1.6 : 0.9;
        const rx = (r.big ? 320 : 70) * easeOut(age / life);
        ctx.strokeStyle = css(c.stem, (r.big ? 0.4 : 0.26) * (1 - age / life) * a); ctx.lineWidth = r.big ? 1.8 : 1.1;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rx, rx * (r.big ? 0.6 : 0.28), 0, 0, TAU); ctx.stroke();
      }
    }

    if (spec) {
      for (const d of this.dots) {
        const col = spec.colors === 'fire' ? FIRE[d.c % 3] : c[spec.colors[d.c % spec.colors.length]];
        let al = spec.alpha * a;
        if (spec.shape === 'ember') al *= 0.55 + 0.45 * Math.sin(t * 7 + d.ph * 3);
        if (k === 'el-fire' && pa > 0.05) al *= 1 + Math.max(0, 1 - Math.hypot(d.x - px, d.y - py) / 180) * pa;
        if (spec.shape === 'streak') {
          ctx.strokeStyle = css(col, al); ctx.lineWidth = 1.1;
          const v = Math.hypot(d.vx, d.vy) || 1;
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - (d.vx / v) * d.s, d.y - (d.vy / v) * d.s); ctx.stroke();
        } else if (spec.shape === 'flake') {
          ctx.strokeStyle = css(col, al); ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < 3; i++) { const an = d.rot + (i * Math.PI) / 3; ctx.moveTo(d.x - Math.cos(an) * d.s, d.y - Math.sin(an) * d.s); ctx.lineTo(d.x + Math.cos(an) * d.s, d.y + Math.sin(an) * d.s); }
          ctx.stroke();
        } else if (spec.shape === 'leaf') {
          ctx.fillStyle = css(col, al);
          ctx.beginPath(); ctx.ellipse(d.x, d.y, d.s * 1.6, d.s * 0.7, d.rot, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = css(col, al);
          ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, TAU); ctx.fill();
        }
      }
    }

    switch (k) {
      case 'focus': {
        // bokeh discs: wide and faint far from the hand, smaller and sharper near it, as if it were the focus
        const cols: ColorKey[] = ['spark', 'flower', 'stem', 'ink'];
        for (const d of this.dots) {
          const near = pa > 0.05 ? Math.max(0, 1 - Math.hypot(d.x - px, d.y - py) / 260) * pa : 0;
          const sh = this.shockAt(d.x, d.y).w;
          const r = d.s * (1 - 0.55 * near) * (1 + sh * 0.6);
          const col = c[cols[d.c % 4]];
          ctx.fillStyle = css(col, (0.07 + 0.08 * near) * a);
          ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, TAU); ctx.fill();
          ctx.strokeStyle = css(col, (0.08 + 0.2 * near) * a); ctx.lineWidth = 1 + near;
          ctx.stroke();
        }
        break;
      }
      case 'echo': {
        // light trails, as in a long exposure: each fades toward its tail
        const cols: ColorKey[] = ['flower', 'stem', 'spark'];
        this.trails.forEach((tr, i) => {
          const n = tr.length / 2, mine = i === this.trails.length - 1;
          for (let j = 1; j < n; j++) {
            ctx.strokeStyle = css(mine ? c.ink : c[cols[i % 3]], (j / n) * (mine ? 0.32 : 0.2) * a);
            ctx.lineWidth = mine ? 2.2 : 1.6;
            ctx.beginPath(); ctx.moveTo(tr[(j - 1) * 2], tr[(j - 1) * 2 + 1]); ctx.lineTo(tr[j * 2], tr[j * 2 + 1]); ctx.stroke();
          }
        });
        break;
      }
      case 'ferro': {
        // dark, glossy droplets; near the hand they grow little spikes toward it
        const metal = mix(c.ink, c.bg, 0.55);
        for (const d of this.dots) {
          const dx = px - d.x, dy = py - d.y, r = Math.hypot(dx, dy) || 1;
          const near = pa > 0.05 ? Math.max(0, 1 - r / 220) * pa : 0;
          ctx.fillStyle = css(metal, 0.4 * a);
          ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, TAU); ctx.fill();
          if (near > 0.05) {
            const ux = dx / r, uy = dy / r, L = d.s * (1 + near * 2.5);
            ctx.beginPath(); ctx.moveTo(d.x - uy * d.s * 0.6, d.y + ux * d.s * 0.6); ctx.lineTo(d.x + ux * L, d.y + uy * L); ctx.lineTo(d.x + uy * d.s * 0.6, d.y - ux * d.s * 0.6); ctx.fill();
          }
          ctx.fillStyle = css(WHITE, 0.16 * a);
          ctx.beginPath(); ctx.arc(d.x - d.s * 0.35, d.y - d.s * 0.35, d.s * 0.3, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'ice': {
        // frost in the corners, brighter where the hand is near and with every click
        const flash = this.shocks.length ? Math.max(0, 1 - (t - this.shocks[this.shocks.length - 1].born) * 1.5) : 0;
        const path = new Path2D();
        for (const pts of this.frost) for (let i = 0; i < pts.length; i += 4) { path.moveTo(pts[i], pts[i + 1]); path.lineTo(pts[i + 2], pts[i + 3]); }
        ctx.strokeStyle = css(mix(c.stem, WHITE, 0.5), (0.16 + 0.2 * flash) * a); ctx.lineWidth = 1.2;
        ctx.stroke(path);
        if (pa > 0.05) {
          const g = ctx.createRadialGradient(px, py, 0, px, py, 160);
          g.addColorStop(0, css(mix(c.stem, WHITE, 0.6), 0.07 * pa * a)); g.addColorStop(1, css(c.stem, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 160, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'jelly':
        for (const d of this.dots) {
          const x = d.bx + d.x + Math.sin(t * 0.4 + d.ph) * 30, y = d.by + d.y + Math.cos(t * 0.33 + d.ph) * 24;
          const r = d.s * (1 + 0.06 * Math.sin(t * 1.3 + d.ph));
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, css(c.spark, 0.1 * a)); g.addColorStop(1, css(c.spark, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        }
        break;
      case 'magnet': case 'gravity': {
        // a grid answering the pointer: filings turning toward it (magnet) — away from a click, briefly — or a
        // well it sinks into (gravity), which a click's shock ripples through
        const step = k === 'magnet' ? 42 : 36;
        const last = this.shocks[this.shocks.length - 1];
        const repel = k === 'magnet' && last && t - last.born < 0.7;
        const tx = repel ? last.x : pa > 0.05 ? px : W / 2 + Math.cos(t * 0.3) * W * 0.25;
        const ty = repel ? last.y : pa > 0.05 ? py : H / 2 + Math.sin(t * 0.4) * H * 0.2;
        const reach = Math.max(W, H) * 0.6;
        const buckets: Path2D[] = [new Path2D(), new Path2D(), new Path2D()];
        for (let y = step / 2; y < H; y += step) {
          for (let x = step / 2; x < W; x += step) {
            const dx = tx - x, dy = ty - y, r = Math.hypot(dx, dy) || 1;
            const f = Math.max(0, 1 - r / reach);
            const sh = this.shockAt(x, y);
            const b = buckets[Math.min(2, Math.floor((f + sh.w) * 3))];
            if (k === 'magnet') {
              const len = 4 + 9 * f + sh.w * 8, ux = (dx / r) * (repel ? -1 : 1), uy = (dy / r) * (repel ? -1 : 1);
              b.moveTo(x - ux * len, y - uy * len); b.lineTo(x + ux * len, y + uy * len);
            } else {
              const s = Math.min(18, 2600 / (r + 60)) * (0.3 + 0.7 * pa) * (this.held ? 1.6 : 1);
              const gx = x + (dx / r) * s + sh.fx * 22, gy = y + (dy / r) * s + sh.fy * 22;
              b.moveTo(gx + 1.4, gy); b.arc(gx, gy, 1.4, 0, TAU);
            }
          }
        }
        buckets.forEach((b, i) => {
          const al = (0.09 + i * 0.07) * a;
          if (k === 'magnet') { ctx.strokeStyle = css(c.stem, al); ctx.lineWidth = 1.3; ctx.stroke(b); }
          else { ctx.fillStyle = css(c.ink, al); ctx.fill(b); }
        });
        break;
      }
      case 'wave': case 'float': {
        // water lines with ripples from the pointer and from clicks, or air currents bending round the hand
        const water = k === 'wave', n = water ? 11 : 12;
        ctx.strokeStyle = css(water ? c.stem : c.ink, (water ? 0.13 : 0.09) * a);
        ctx.lineWidth = 1.3;
        for (let i = 0; i < n; i++) {
          const y0 = water ? H * (0.12 + (0.84 * i) / (n - 1)) : H * ((i + 0.5) / n);
          ctx.beginPath();
          for (let x = -10; x <= W + 10; x += 14) {
            let y = y0;
            if (water) {
              y += Math.sin(x * 0.012 + t * 1.1 + i) * 5;
              const r = Math.hypot(x - px, y0 - py);
              y += Math.sin(r * 0.045 - t * 5) * 11 * Math.exp(-r / 220) * pa;
              for (const s of this.shocks) {
                const age = t - s.born, d = Math.hypot(x - s.x, y0 - s.y), rr = age * 420;
                y += Math.sin((d - rr) * 0.06) * 16 * Math.exp(-(((d - rr) / 90) ** 2)) * (1 - age / SHOCK_LIFE);
              }
            } else {
              y += Math.sin(x * 0.006 + t * 0.5 + i * 1.7) * 14;
              const dy = y0 - py, g = Math.exp(-((x - px) ** 2 + dy ** 2) / (2 * 130 * 130));
              y += Math.sign(dy || 1) * g * 40 * pa + this.shockAt(x, y0).fy * 34;
            }
            if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        break;
      }
      case 'melt': {
        const g = ctx.createLinearGradient(0, H * 0.6, 0, H);
        g.addColorStop(0, css(c.flower, 0)); g.addColorStop(1, css(c.flower, 0.1 * a));
        ctx.fillStyle = g; ctx.fillRect(0, H * 0.6, W, H * 0.4);
        ctx.strokeStyle = css(c.flower, 0.12 * a);
        for (const d of this.dots) {
          ctx.lineWidth = d.c;
          ctx.beginPath(); ctx.moveTo(d.x, d.y - d.s); ctx.lineTo(d.x, d.y); ctx.stroke();
        }
        break;
      }
      case 'blackhole': {
        // stars, bent toward the pointer as light is round a mass — and, briefly, toward a click
        const col = mix(c.ink, c.spark, 0.2);
        const last = this.shocks[this.shocks.length - 1];
        const pull = last ? Math.max(0, 1 - (t - last.born)) : 0;
        for (const d of this.dots) {
          let ox = 0, oy = 0;
          if (pa > 0.01) { const dx = px - d.x, dy = py - d.y, r = Math.hypot(dx, dy) || 1, s = Math.min(28, 2600 / (r + 30)) * pa; ox += (dx / r) * s; oy += (dy / r) * s; }
          if (pull > 0) { const dx = last.x - d.x, dy = last.y - d.y, r = Math.hypot(dx, dy) || 1, s = Math.min(60, 9000 / (r + 40)) * pull; ox += (dx / r) * s; oy += (dy / r) * s; }
          const tw = 0.55 + 0.45 * Math.sin(t * 2 + d.ph * 5);
          ctx.fillStyle = css(col, 0.4 * tw * a);
          ctx.beginPath(); ctx.arc(d.x + ox, d.y + oy, d.s, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'balloon': {
        const cols: ColorKey[] = ['flower', 'stem', 'spark'];
        for (const b of this.dots) {
          const col = c[cols[b.c % 3]];
          const sway = Math.sin(t * 1.5 + b.ph) * 8;
          ctx.strokeStyle = css(c.ink, 0.16 * a); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(b.x, b.y + b.s);
          ctx.quadraticCurveTo(b.x + sway, b.y + b.s * 2.2, b.x - sway * 0.5, b.y + b.s * 3.4); ctx.stroke();
          ctx.fillStyle = css(col, 0.2 * a);
          ctx.beginPath(); ctx.ellipse(b.x, b.y, b.s * 0.82, b.s, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.moveTo(b.x - 3, b.y + b.s + 3); ctx.lineTo(b.x + 3, b.y + b.s + 3); ctx.lineTo(b.x, b.y + b.s - 1); ctx.fill();
          ctx.fillStyle = css(WHITE, 0.14 * a);
          ctx.beginPath(); ctx.ellipse(b.x - b.s * 0.3, b.y - b.s * 0.38, b.s * 0.16, b.s * 0.3, -0.5, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'bloom': {
        // a garden growing along the bottom edge: it grows in when Bloom is chosen
        const grow = easeOut(this.fade);
        for (const s of this.stems) {
          const h = s.h * grow, base = H + 2;
          const tx = s.x + s.lean * h * 0.6, ty = base - h;
          const cx = s.x + s.lean * h * 0.15, cy = base - h * 0.55;
          ctx.strokeStyle = css(c.stem, 0.32 * a); ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(s.x, base); ctx.quadraticCurveTo(cx, cy, tx, ty); ctx.stroke();
          ctx.fillStyle = css(c.stem, 0.28 * a);
          for (const [u, side] of [[0.35, 1], [0.62, -1]] as const) { // leaves along the stem
            const lx = (1 - u) ** 2 * s.x + 2 * (1 - u) * u * cx + u * u * tx;
            const ly = (1 - u) ** 2 * base + 2 * (1 - u) * u * cy + u * u * ty;
            const r = h * 0.07;
            ctx.beginPath(); ctx.ellipse(lx + side * r * 0.8, ly, r, r * 0.38, side * 0.6 + s.lean * 0.5, 0, TAU); ctx.fill();
          }
          if (s.flower) {
            const r = Math.max(2, h * 0.05);
            ctx.fillStyle = css(c.flower, 0.4 * a);
            for (let i = 0; i < 5; i++) {
              const an = (i / 5) * TAU + t * 0.2 + s.ph;
              ctx.beginPath(); ctx.ellipse(tx + Math.cos(an) * r, ty + Math.sin(an) * r, r, r * 0.55, an, 0, TAU); ctx.fill();
            }
            ctx.fillStyle = css(c.spark, 0.5 * a);
            ctx.beginPath(); ctx.arc(tx, ty, r * 0.45, 0, TAU); ctx.fill();
          } else {
            ctx.fillStyle = css(c.flower, 0.3 * a);
            ctx.beginPath(); ctx.ellipse(tx, ty, h * 0.022 + 1.5, h * 0.035 + 2, s.lean * 0.6, 0, TAU); ctx.fill();
          }
        }
        for (const d of this.dots) { // petals in the air
          ctx.fillStyle = css(c.flower, 0.34 * a);
          ctx.beginPath(); ctx.ellipse(d.x, d.y, d.s, d.s * 0.5, d.rot, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'explode': {
        // cracked glass: the web drawn as it spreads; light runs along the cracks near the hand
        const glint = 170;
        for (const imp of this.impacts) {
          const fadeOut = imp.dead >= 0 ? clamp01(1 - (t - imp.dead)) : 1;
          const path = new Path2D(), lit = new Path2D();
          for (const cr of this.cracks) {
            if (cr.imp !== imp) continue;
            const g = clamp01((t - cr.born) / 0.35);
            if (g <= 0) continue;
            const n = cr.pts.length / 2 - 1, upto = g * n;
            path.moveTo(cr.pts[0], cr.pts[1]);
            for (let i = 1; i <= n; i++) {
              const f = Math.min(1, upto - (i - 1));
              if (f <= 0) break;
              const ax = cr.pts[(i - 1) * 2], ay = cr.pts[(i - 1) * 2 + 1];
              const bx = ax + (cr.pts[i * 2] - ax) * f, by = ay + (cr.pts[i * 2 + 1] - ay) * f;
              path.lineTo(bx, by);
              if (pa > 0.05 && Math.hypot((ax + bx) / 2 - px, (ay + by) / 2 - py) < glint) { lit.moveTo(ax, ay); lit.lineTo(bx, by); }
            }
          }
          ctx.strokeStyle = css(c.ink, 0.17 * a * fadeOut); ctx.lineWidth = 1;
          ctx.stroke(path);
          if (pa > 0.05) { ctx.strokeStyle = css(c.spark, 0.5 * pa * a * fadeOut); ctx.lineWidth = 1.4; ctx.stroke(lit); }
        }
        for (const d of this.dots) { // floating shards that catch the light as they turn
          const shine = Math.max(0, Math.cos(d.rot * 2));
          const near = pa > 0.05 ? Math.max(0, 1 - Math.hypot(d.x - px, d.y - py) / 200) * pa : 0;
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const an = d.rot + (i * TAU) / 3 + (i === 1 ? 0.4 : 0), r = d.s * (i === 2 ? 0.6 : 1);
            if (i === 0) ctx.moveTo(d.x + Math.cos(an) * r, d.y + Math.sin(an) * r); else ctx.lineTo(d.x + Math.cos(an) * r, d.y + Math.sin(an) * r);
          }
          ctx.closePath();
          ctx.fillStyle = css(c.ink, (0.07 + 0.12 * shine + 0.15 * near) * a); ctx.fill();
          ctx.strokeStyle = css(c.spark, (0.12 + 0.35 * shine * (0.4 + near)) * a); ctx.lineWidth = 1; ctx.stroke();
        }
        break;
      }
    }

    // short-lived bits
    for (const b of this.bits) {
      const life = 1 - b.age / b.max;
      if (b.k === CONFETTI || b.k === PETAL) {
        const cols: ColorKey[] = b.k === PETAL ? ['flower', 'spark'] : ['flower', 'stem', 'spark'];
        ctx.fillStyle = css(c[cols[b.c % cols.length]], 0.55 * life * a);
        if (b.k === PETAL) { ctx.beginPath(); ctx.ellipse(b.x, b.y, b.s, b.s * 0.5, b.rot, 0, TAU); ctx.fill(); }
        else { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.fillRect(-b.s, -b.s * 0.4, b.s * 2, b.s * 0.8); ctx.restore(); }
      } else if (b.k === SHARD) {
        ctx.fillStyle = css(c.ink, 0.25 * life * a); ctx.strokeStyle = css(c.spark, 0.5 * life * a);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const an = b.rot + (i * TAU) / 3; if (i === 0) ctx.moveTo(b.x + Math.cos(an) * b.s, b.y + Math.sin(an) * b.s); else ctx.lineTo(b.x + Math.cos(an) * b.s, b.y + Math.sin(an) * b.s); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (b.k === EMBER) {
        ctx.fillStyle = css(FIRE[b.c % 3], 0.8 * life * a);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.s, 0, TAU); ctx.fill();
      } else if (b.k === SPLASH) {
        ctx.fillStyle = css(c.stem, 0.5 * life * a);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.s, 0, TAU); ctx.fill();
      } else if (b.k === STREAK) {
        const v = Math.hypot(b.vx, b.vy) || 1;
        ctx.strokeStyle = css(c.ink, 0.35 * life * a); ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - (b.vx / v) * b.s, b.y - (b.vy / v) * b.s); ctx.stroke();
      } else if (b.k === DUST) {
        ctx.fillStyle = css(mix(c.ink, c.bg, 0.3), 0.12 * life * a);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.s, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
}

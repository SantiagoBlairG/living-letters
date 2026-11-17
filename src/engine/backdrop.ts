import type { Stage } from './stage';
import type { ColorKey } from './types';
import { css, mix, type RGB } from './color';

/**
 * The atmosphere behind the word: a faint background in the spirit of the current material, which also
 * answers the pointer. It is kept quiet on purpose — low alpha, small marks — so the word stays the subject.
 * `update` moves it once per frame; `draw` only paints, so the scene can be drawn twice (for recording).
 */

const FIRE: RGB[] = [[255, 214, 90], [255, 138, 31], [232, 56, 28]];
const TAU = Math.PI * 2;

type Shape = 'dot' | 'ring' | 'streak' | 'ember';
type Push = 'away' | 'swirl' | 'drag' | 'heat';
interface Spec {
  n: number; vx: [number, number]; vy: [number, number]; size: [number, number];
  sway: number; shape: Shape; colors: ColorKey[] | 'fire'; alpha: number; push: Push;
}

/** Drifting particles: count, base velocity (px/s), size, sideways sway, look, and how the pointer moves them. */
const DRIFT: Record<string, Spec> = {
  balloon: { n: 22, vx: [-4, 4], vy: [-22, -8], size: [6, 22], sway: 10, shape: 'ring', colors: ['flower', 'ink'], alpha: 0.1, push: 'away' },
  bloom: { n: 60, vx: [-5, 5], vy: [-14, -4], size: [1.2, 2.8], sway: 14, shape: 'dot', colors: ['flower', 'stem', 'spark'], alpha: 0.3, push: 'swirl' },
  explode: { n: 44, vx: [-12, 12], vy: [-12, 12], size: [1, 2.2], sway: 0, shape: 'ember', colors: ['flower', 'spark'], alpha: 0.35, push: 'away' },
  sand: { n: 170, vx: [14, 34], vy: [-2, 2], size: [0.8, 1.6], sway: 6, shape: 'dot', colors: ['spark', 'ink'], alpha: 0.2, push: 'drag' },
  'el-fire': { n: 46, vx: [-6, 6], vy: [-40, -16], size: [1, 2.4], sway: 12, shape: 'ember', colors: 'fire', alpha: 0.4, push: 'heat' },
  'el-earth': { n: 60, vx: [-6, 6], vy: [3, 10], size: [1, 2.6], sway: 4, shape: 'dot', colors: ['ink'], alpha: 0.13, push: 'away' },
  'el-water': { n: 70, vx: [-8, -3], vy: [60, 110], size: [8, 16], sway: 0, shape: 'streak', colors: ['stem'], alpha: 0.16, push: 'away' },
};

interface Dot { x: number; y: number; vx: number; vy: number; bx: number; by: number; s: number; c: number; ph: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist = (x: number, y: number, px: number, py: number) => Math.hypot(x - px, y - py) || 1;

export class Backdrop {
  private dots: Dot[] = [];
  private kind = '';
  private W = 0; private H = 0;
  private t = 0;
  private fade = 0; // eases in after the material changes
  // smoothed pointer, and how present it is (0 when away)
  private px = 0; private py = 0; private pa = 0;

  private kindOf(st: Stage) { return st.material === 'elements' ? 'el-' + st.element : st.material; }

  private reseed() {
    const { W, H } = this;
    this.dots = [];
    const spec = DRIFT[this.kind];
    const add = (d: Partial<Dot>) => this.dots.push({ x: 0, y: 0, vx: 0, vy: 0, bx: 0, by: 0, s: 1, c: 0, ph: Math.random() * TAU, ...d });
    if (spec) {
      for (let i = 0; i < spec.n; i++) {
        const vx = rand(...spec.vx), vy = rand(...spec.vy);
        add({ x: rand(0, W), y: rand(0, H), vx, vy, bx: vx, by: vy, s: rand(...spec.size), c: i });
      }
    } else if (this.kind === 'jelly') {
      for (let i = 0; i < 5; i++) add({ bx: rand(0.1, 0.9) * W, by: rand(0.15, 0.85) * H, s: rand(0.16, 0.32) * Math.min(W, H) * 1.4 });
    } else if (this.kind === 'melt') {
      for (let i = 0; i < 22; i++) add({ x: rand(0, W), y: rand(-H, H), vy: rand(8, 20), by: rand(8, 20), s: rand(30, 90), c: rand(2.5, 5.5) });
    } else if (this.kind === 'blackhole') {
      for (let i = 0; i < 170; i++) add({ x: rand(0, W), y: rand(0, H), s: rand(0.6, 1.8) });
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
    this.pa += ((p.active ? 1 : 0) - this.pa) * (1 - Math.exp(-dt * 4));

    const spec = DRIFT[kind];
    const { W, H } = this;
    if (spec) {
      const R = 170, m = 30;
      for (const d of this.dots) {
        // back toward its own drift, then nudged by the pointer
        const relax = Math.min(1, dt * 1.5);
        d.vx += (d.bx - d.vx) * relax; d.vy += (d.by - d.vy) * relax;
        if (this.pa > 0.05) {
          const dx = d.x - this.px, dy = d.y - this.py, r = Math.hypot(dx, dy) || 1;
          if (r < R) {
            const f = (1 - r / R) * this.pa;
            if (spec.push === 'away') { d.vx += (dx / r) * 260 * f * dt * 4; d.vy += (dy / r) * 260 * f * dt * 4; }
            else if (spec.push === 'swirl') { d.vx += (-dy / r) * 200 * f * dt * 4; d.vy += (dx / r) * 200 * f * dt * 4; }
            else if (spec.push === 'drag') { d.vx += p.vx * f * dt * 3; d.vy += p.vy * f * dt * 3; }
            else { d.vy -= 160 * f * dt * 4; }
          }
        }
        d.x += (d.vx + Math.sin(this.t * 1.3 + d.ph) * spec.sway) * dt;
        d.y += d.vy * dt;
        if (d.x < -m) d.x += W + 2 * m; else if (d.x > W + m) d.x -= W + 2 * m;
        if (d.y < -m) d.y += H + 2 * m; else if (d.y > H + m) d.y -= H + 2 * m;
      }
    } else if (kind === 'jelly') {
      for (const d of this.dots) { // soft blobs pushed aside by the pointer, springing back
        const dx = d.bx + d.x - this.px, dy = d.by + d.y - this.py, r = Math.hypot(dx, dy) || 1;
        const f = Math.max(0, 1 - r / (d.s * 1.2)) * this.pa;
        d.vx += ((dx / r) * 90 * f - d.x * 3 - d.vx * 2.2) * dt * 4;
        d.vy += ((dy / r) * 90 * f - d.y * 3 - d.vy * 2.2) * dt * 4;
        d.x += d.vx * dt; d.y += d.vy * dt;
      }
    } else if (kind === 'melt') {
      for (const d of this.dots) { // slow drips, quicker in the heat of the pointer
        const f = Math.max(0, 1 - dist(d.x, d.y, this.px, this.py) / 220) * this.pa;
        d.vy += (d.by * (1 + f * 3) - d.vy) * Math.min(1, dt * 3);
        d.y += d.vy * dt;
        if (d.y - d.s > H) { d.y = -rand(0, H * 0.3); d.x = rand(0, W); }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, c: Record<ColorKey, RGB>) {
    if (this.fade < 0.01) return;
    // overall strength: lines and grids need a little more than particles to read at the same level
    const k = this.kind, a = this.fade * (DRIFT[this.kind] ? 1.35 : 1.9), t = this.t, { W, H } = this;
    const px = this.px, py = this.py, pa = this.pa;
    ctx.save();
    ctx.lineCap = 'round';
    const spec = DRIFT[k];
    if (spec) {
      for (const d of this.dots) {
        const col = spec.colors === 'fire' ? FIRE[d.c % 3] : c[spec.colors[d.c % spec.colors.length]];
        let al = spec.alpha * a;
        if (spec.shape === 'ember') al *= 0.55 + 0.45 * Math.sin(t * 7 + d.ph * 3);
        if (spec.push === 'heat' && pa > 0.05) al *= 1 + Math.max(0, 1 - dist(d.x, d.y, px, py) / 170) * pa;
        if (spec.shape === 'ring') {
          ctx.strokeStyle = css(col, al); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, TAU); ctx.stroke();
        } else if (spec.shape === 'streak') {
          ctx.strokeStyle = css(col, al); ctx.lineWidth = 1;
          const v = Math.hypot(d.vx, d.vy) || 1;
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - (d.vx / v) * d.s, d.y - (d.vy / v) * d.s); ctx.stroke();
        } else {
          ctx.fillStyle = css(col, al);
          ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, TAU); ctx.fill();
        }
      }
    } else if (k === 'jelly') {
      for (const d of this.dots) {
        const x = d.bx + d.x + Math.sin(t * 0.4 + d.ph) * 30, y = d.by + d.y + Math.cos(t * 0.33 + d.ph) * 24;
        const r = d.s * (1 + 0.06 * Math.sin(t * 1.3 + d.ph));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, css(c.spark, 0.07 * a)); g.addColorStop(1, css(c.spark, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    } else if (k === 'magnet' || k === 'gravity') {
      // a grid that answers the pointer: filings turning toward it (magnet), or a well it sinks into (gravity)
      const step = k === 'magnet' ? 44 : 38;
      const tx = pa > 0.05 ? px : W / 2 + Math.cos(t * 0.3) * W * 0.25;
      const ty = pa > 0.05 ? py : H / 2 + Math.sin(t * 0.4) * H * 0.2;
      const reach = Math.max(W, H) * 0.6;
      const buckets: Path2D[] = [new Path2D(), new Path2D(), new Path2D()];
      for (let y = step / 2; y < H; y += step) {
        for (let x = step / 2; x < W; x += step) {
          const dx = tx - x, dy = ty - y, r = Math.hypot(dx, dy) || 1;
          const f = Math.max(0, 1 - r / reach);
          const b = buckets[Math.min(2, Math.floor(f * 3))];
          if (k === 'magnet') {
            const len = 4 + 8 * f, ux = dx / r, uy = dy / r;
            b.moveTo(x - ux * len, y - uy * len); b.lineTo(x + ux * len, y + uy * len);
          } else {
            const s = Math.min(16, 2600 / (r + 60)) * (0.3 + 0.7 * pa);
            const gx = x + (dx / r) * s, gy = y + (dy / r) * s;
            b.moveTo(gx + 1.3, gy); b.arc(gx, gy, 1.3, 0, TAU);
          }
        }
      }
      buckets.forEach((b, i) => {
        const al = (0.05 + i * 0.05) * a;
        if (k === 'magnet') { ctx.strokeStyle = css(c.stem, al); ctx.lineWidth = 1.2; ctx.stroke(b); }
        else { ctx.fillStyle = css(c.ink, al * 1.2); ctx.fill(b); }
      });
    } else if (k === 'wave' || k === 'float' || k === 'el-air') {
      // long lines: water surfaces with ripples spreading from the pointer, or air currents bending round it
      const water = k === 'wave', n = water ? 11 : 12;
      ctx.strokeStyle = css(water ? c.stem : c.ink, (water ? 0.1 : 0.07) * a);
      ctx.lineWidth = 1.2;
      if (k === 'el-air') { ctx.setLineDash([60, 40]); ctx.lineDashOffset = -t * 140; }
      for (let i = 0; i < n; i++) {
        const y0 = water ? H * (0.12 + (0.84 * i) / (n - 1)) : H * ((i + 0.5) / n);
        ctx.beginPath();
        for (let x = -10; x <= W + 10; x += 14) {
          let y = y0;
          if (water) {
            y += Math.sin(x * 0.012 + t * 1.1 + i) * 5;
            const r = Math.hypot(x - px, y0 - py);
            y += Math.sin(r * 0.045 - t * 5) * 10 * Math.exp(-r / 220) * pa;
          } else {
            y += Math.sin(x * 0.006 + t * (k === 'el-air' ? 1.4 : 0.5) + i * 1.7) * 14;
            const dy = y0 - py, g = Math.exp(-((x - px) ** 2 + dy ** 2) / (2 * 130 * 130));
            y += Math.sign(dy || 1) * g * 40 * pa;
          }
          if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else if (k === 'melt') {
      const g = ctx.createLinearGradient(0, H * 0.6, 0, H);
      g.addColorStop(0, css(c.flower, 0)); g.addColorStop(1, css(c.flower, 0.08 * a));
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.6, W, H * 0.4);
      ctx.strokeStyle = css(c.flower, 0.09 * a);
      for (const d of this.dots) {
        ctx.lineWidth = d.c;
        ctx.beginPath(); ctx.moveTo(d.x, d.y - d.s); ctx.lineTo(d.x, d.y); ctx.stroke();
      }
    } else if (k === 'blackhole') {
      // stars, bent toward the pointer as light is round a mass
      const col = mix(c.ink, c.spark, 0.2);
      for (const d of this.dots) {
        const dx = px - d.x, dy = py - d.y, r = Math.hypot(dx, dy) || 1;
        const s = Math.min(28, 2600 / (r + 30)) * pa;
        const tw = 0.55 + 0.45 * Math.sin(t * 2 + d.ph * 5);
        ctx.fillStyle = css(col, 0.32 * tw * a);
        ctx.beginPath(); ctx.arc(d.x + (dx / r) * s, d.y + (dy / r) * s, d.s, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
}

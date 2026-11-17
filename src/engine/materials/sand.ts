import type { Letter, Material, World } from '../types';
import { calm, clamp, toLocal } from '../simulation';
import { ASC, MS, PAD_X } from '../layout';

/**
 * Sand. Each letter is drawn as itself until something touches it; then it becomes a few thousand grains
 * sampled from its own ink. Wind scatters them, they fall, and after a moment they find their way home.
 * Once every grain is back the crisp glyph returns, so a still word costs nothing.
 */

const LIFT = 0.3;
const MAX_GRAINS = 2400; // per letter

interface Pile {
  n: number;
  g: number; // grain size, px
  fs: number;
  home: Float32Array; pos: Float32Array; vel: Float32Array; // local px, pairs
  last: number; // when it was last disturbed
}
const piles = new Map<Letter, Pile>();

function sample(w: World, l: Letter, step: number): number[] {
  const gl = l.glyph!, fs = w.fs, lift = LIFT * fs, se = step / fs;
  const pts: number[] = [];
  const [x0, y0, x1, y1] = gl.box;
  for (let ey = y0; ey < y1; ey += se) {
    for (let ex = x0; ex < x1; ex += se) {
      const jx = ex + (Math.random() - 0.5) * se * 0.7, jy = ey + (Math.random() - 0.5) * se * 0.7;
      const mx = Math.round((jx + PAD_X) * MS), my = Math.round((jy + ASC) * MS);
      if (mx < 0 || my < 0 || mx >= gl.mw || my >= gl.mh) continue;
      if (gl.alpha[my * gl.mw + mx] > 110) pts.push(jx * fs - l.adv / 2, jy * fs + lift);
    }
  }
  return pts;
}

function build(w: World, l: Letter): Pile {
  let g = Math.max(2, w.fs / 85);
  let pts = sample(w, l, g);
  if (pts.length / 2 > MAX_GRAINS) { g *= Math.sqrt(pts.length / 2 / MAX_GRAINS); pts = sample(w, l, g); }
  const home = new Float32Array(pts);
  return { n: pts.length / 2, g, fs: w.fs, home, pos: new Float32Array(pts), vel: new Float32Array(pts.length), last: -10 };
}

function pile(w: World, l: Letter) {
  let s = piles.get(l);
  if (s && s.fs !== w.fs) { piles.delete(l); s = undefined; }
  if (!s) { s = build(w, l); piles.set(l, s); }
  return s;
}

export const sand: Material = {
  id: 'sand',
  accent: 'spark',
  spring: { k: 150, c: 20, rk: 150, rc: 20, sk: 200, sc: 20, limit: 0.2, lift: LIFT },

  ambient() { /* sand lies still */ },

  enter() { piles.clear(); },

  reset(w) { piles.clear(); calm(w.letters); },

  update(w, dt) {
    const p = w.p, fs = w.fs;
    for (const k of piles.keys()) if (!w.letters.includes(k)) piles.delete(k);
    const blow = Math.min(1, p.speed / (fs * 2));
    const cap = fs * 8;
    const pvx = clamp(p.vx, -cap, cap), pvy = clamp(p.vy, -cap, cap);
    const plough = p.down && p.travel > 4;

    for (const l of w.letters) {
      if (!l.glyph) continue;
      const near = p.active && Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) < fs * 0.95;
      let s = piles.get(l);
      if (!s && !near) continue;
      s = pile(w, l);
      if (!s.n) continue;
      const { pos, vel, home } = s;
      const [px, py] = toLocal(l, p.x, p.y);

      if (near) {
        // hover is wind: grains near the hand take its velocity and are blown outward
        const R = fs * (plough ? 0.13 : 0.28), R2 = R * R;
        let touched = false;
        for (let i = 0; i < s.n; i++) {
          const dx = pos[i * 2] - px, dy = pos[i * 2 + 1] - py;
          const d2 = dx * dx + dy * dy;
          if (d2 > R2) continue;
          const d = Math.sqrt(d2) || 1, f = (1 - d / R) * (1 - d / R);
          let ax: number, ay: number;
          if (plough) { ax = (dx / d) * fs * 45 * f; ay = (dy / d) * fs * 45 * f; } // drag ploughs a furrow
          else {
            ax = (pvx * 6 * blow + (dx / d) * fs * 7 * (0.25 + blow)) * f;
            ay = (pvy * 6 * blow + (dy / d) * fs * 7 * (0.25 + blow)) * f;
          }
          vel[i * 2] += ax * w.inten * dt; vel[i * 2 + 1] += ay * w.inten * dt;
          touched = true;
        }
        if (touched) {
          s.last = w.t;
          l.heatT = Math.max(l.heatT, 0.4 + blow * 0.4);
          if (blow > 0.3 || plough) w.sound.play('sand', 0.5 + blow);
        }
      }

      // freshly disturbed grains fall; then a pull home fades in and they settle back into the letter
      const ramp = clamp((w.t - s.last - 0.5) / 1.6, 0, 1);
      const k = 16 * ramp * ramp, c = 1.6 + 5 * ramp, G = fs * 5 * (1 - ramp);
      const floor = w.H - l.m[5] - 3;
      const loose = s.g * 1.5; // only grains the wind actually moved fall; the rest of the letter stands
      let err = 0;
      for (let i = 0; i < s.n; i++) {
        const ix = i * 2, iy = ix + 1;
        const ex = home[ix] - pos[ix], ey = home[iy] - pos[iy];
        const free = Math.abs(ex) + Math.abs(ey) > loose || Math.abs(vel[ix]) + Math.abs(vel[iy]) > fs * 0.3;
        vel[ix] += (ex * k - vel[ix] * c) * dt;
        vel[iy] += (ey * k - vel[iy] * c + (free ? G : 0)) * dt;
        pos[ix] += vel[ix] * dt; pos[iy] += vel[iy] * dt;
        if (pos[iy] > floor && vel[iy] > 0) { pos[iy] = floor; vel[iy] *= -0.2; vel[ix] *= 0.6; }
        const e = Math.abs(ex) + Math.abs(ey);
        if (e > err) err = e;
      }
      if (ramp >= 1 && err < 0.7 && !near) piles.delete(l); // home: back to the crisp glyph
    }
  },

  down() { /* the drag itself ploughs, in update */ },

  up(w, _hit, click) {
    if (!click) return;
    // a dust cloud: everything near the click is thrown up and out
    const p = w.p, fs = w.fs, R = fs * 0.65;
    for (const l of w.letters) {
      if (!l.glyph || Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) > R + fs * 0.6) continue;
      const s = pile(w, l);
      const [px, py] = toLocal(l, p.x, p.y);
      let hit = false;
      for (let i = 0; i < s.n; i++) {
        const dx = s.pos[i * 2] - px, dy = s.pos[i * 2 + 1] - py;
        const d = Math.hypot(dx, dy) || 1;
        if (d > R) continue;
        const f = (1 - d / R) * w.inten;
        const sp = fs * (2 + Math.random() * 3.2) * f;
        s.vel[i * 2] += (dx / d) * sp + (Math.random() - 0.5) * fs * 0.8 * f;
        s.vel[i * 2 + 1] += (dy / d) * sp - fs * (0.8 + Math.random() * 1.4) * f;
        hit = true;
      }
      if (hit) s.last = w.t;
    }
    w.fx.gust(p.x, p.y, 'spark', R * 0.6);
    w.sound.play('gust', w.inten);
  },

  drawLetter(ctx, l) {
    const s = piles.get(l);
    if (!s) return false;
    const g = s.g * 1.15, h = g / 2, pos = s.pos;
    ctx.beginPath();
    for (let i = 0; i < s.n; i++) ctx.rect(pos[i * 2] - h, pos[i * 2 + 1] - h, g, g);
    ctx.fill();
    return true;
  },
};

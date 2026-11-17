import type { Letter, Material, World } from '../types';
import { calm, clamp, toLocal, tuneF } from '../simulation';
import { ASC, MS, PAD_X } from '../layout';

/**
 * Sand. A letter at rest is drawn as itself. When the wind reaches it, it fades into a few thousand grains
 * sampled from its own ink. Grains do not leave at once: they loosen and tremble first, the exposed surface
 * goes before the inside, and only then does the wind carry them off. Later they drift home, and the
 * letter fades back to its crisp self.
 */

const LIFT = 0.3;
const MAX_GRAINS = 2400; // per letter

interface Pile {
  n: number;
  g: number; // grain size, px
  fs: number;
  tune: number;
  home: Float32Array; pos: Float32Array; vel: Float32Array; // local px, pairs
  edge: Float32Array; // 0 deep inside the stroke … 1 on its surface
  loose: Float32Array; // 0 attached … 1 detaches
  free: Uint8Array; // carried by the wind
  shade: Uint8Array; // 0..2, a little variation so it reads as sand
  mix: number; // 0 = crisp glyph, 1 = grains
  last: number; // when a grain last left or was blown
}
const piles = new Map<Letter, Pile>();

function sample(w: World, l: Letter, step: number) {
  const gl = l.glyph!, fs = w.fs, lift = LIFT * fs, se = step / fs;
  const pts: number[] = [], edge: number[] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= gl.mw || y >= gl.mh ? 0 : gl.alpha[y * gl.mw + x]);
  const [x0, y0, x1, y1] = gl.box;
  for (let ey = y0; ey < y1; ey += se) {
    for (let ex = x0; ex < x1; ex += se) {
      const jx = ex + (Math.random() - 0.5) * se * 0.7, jy = ey + (Math.random() - 0.5) * se * 0.7;
      const mx = Math.round((jx + PAD_X) * MS), my = Math.round((jy + ASC) * MS);
      if (at(mx, my) <= 110) continue;
      // how much ink surrounds this grain: few neighbours means it sits on the surface
      let ink = 0;
      for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) if (at(mx + dx, my + dy) > 110) ink++;
      pts.push(jx * fs - l.adv / 2, jy * fs + lift);
      edge.push(clamp((1 - ink / 25) * 2.4, 0, 1));
    }
  }
  return { pts, edge };
}

function build(w: World, l: Letter): Pile {
  let g = Math.max(2, (w.fs / 90) * tuneF(w.tune, 3)); // Grain size
  let s = sample(w, l, g);
  if (s.pts.length / 2 > MAX_GRAINS) { g *= Math.sqrt(s.pts.length / 2 / MAX_GRAINS); s = sample(w, l, g); }
  const n = s.pts.length / 2;
  const shade = new Uint8Array(n);
  for (let i = 0; i < n; i++) shade[i] = (Math.random() * 3) | 0;
  return {
    n, g, fs: w.fs, tune: w.tune, home: new Float32Array(s.pts), pos: new Float32Array(s.pts), vel: new Float32Array(s.pts.length),
    edge: new Float32Array(s.edge), loose: new Float32Array(n), free: new Uint8Array(n), shade, mix: 0, last: -10,
  };
}

function pile(w: World, l: Letter) {
  let s = piles.get(l);
  if (s && (s.fs !== w.fs || s.tune !== w.tune)) { piles.delete(l); s = undefined; }
  if (!s) { s = build(w, l); piles.set(l, s); }
  return s;
}

/** Lets a grain go, with a push in the direction (ux, uy) plus a little lift. */
function release(s: Pile, i: number, vx: number, vy: number, t: number) {
  s.free[i] = 1; s.loose[i] = 1;
  s.vel[i * 2] = vx; s.vel[i * 2 + 1] = vy;
  s.last = t;
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
    const blow = Math.min(1, p.speed / (fs * 2.2));
    const cap = fs * 6;
    const pvx = clamp(p.vx, -cap, cap), pvy = clamp(p.vy, -cap, cap);
    const plough = p.down && p.travel > 4;
    let detached = 0;

    for (const l of w.letters) {
      if (!l.glyph) continue;
      const near = p.active && Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) < fs;
      let s = piles.get(l);
      if (!s && !near) continue;
      s = pile(w, l);
      if (!s.n) continue;
      const { pos, vel, home, loose, free, edge } = s;
      const [px, py] = toLocal(l, p.x, p.y);
      const R = fs * (plough ? 0.14 : 0.32), R2 = R * R;
      // freed grains drift home a while after the last one left
      const ramp = clamp((w.t - s.last - 0.9) / 1.8, 0, 1);
      const k = 10 * ramp * ramp, c = 1.2 + 4 * ramp, G = fs * 2.6 * (1 - ramp);
      const floor = w.H - l.m[5] - 3;
      const jit = s.g * 0.7;
      let busy = false, anyFree = false;

      for (let i = 0; i < s.n; i++) {
        const ix = i * 2, iy = ix + 1;
        let f = 0, dx = 0, dy = 0, d = 1;
        if (near) {
          dx = pos[ix] - px; dy = pos[iy] - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < R2) { d = Math.sqrt(d2) || 1; f = (1 - d / R) * (1 - d / R); }
        }
        if (!free[i]) {
          if (f > 0) {
            if (plough) { // dragging cuts straight through: grains in the furrow leave at once
              release(s, i, (dx / d) * fs * (1.2 + Math.random()), (dy / d) * fs * (1.2 + Math.random()) - fs * 0.4, w.t);
              detached++; anyFree = true; continue;
            }
            // the surface loosens first; faster wind loosens faster
            loose[i] += dt * f * (0.3 + 2.6 * edge[i]) * (0.5 + 0.9 * blow) * w.inten;
            if (loose[i] >= 1) {
              const sp = fs * (0.25 + Math.random() * 0.45);
              release(s, i, pvx * 0.22 * blow + (dx / d) * sp, pvy * 0.22 * blow + (dy / d) * sp * 0.6 - fs * (0.15 + Math.random() * 0.35), w.t);
              detached++; anyFree = true; continue;
            }
          } else if (loose[i] > 0) loose[i] = Math.max(0, loose[i] - dt * 0.35);
          // still attached: tremble in place, more the looser it is
          const q = loose[i] * loose[i] * jit;
          pos[ix] = home[ix] + (Math.random() - 0.5) * q;
          pos[iy] = home[iy] + (Math.random() - 0.5) * q;
          if (loose[i] > 0.02) busy = true;
          continue;
        }
        // free: carried by the wind, falling slowly, then home
        anyFree = true; busy = true;
        if (f > 0 && !plough) {
          vel[ix] += (pvx * 2.2 * blow + (dx / d) * fs * 1.4) * f * w.inten * dt;
          vel[iy] += (pvy * 2.2 * blow + (dy / d) * fs * 1.4) * f * w.inten * dt;
          s.last = Math.max(s.last, w.t - 0.5);
        }
        const ex = home[ix] - pos[ix], ey = home[iy] - pos[iy];
        vel[ix] += (ex * k - vel[ix] * c) * dt;
        vel[iy] += (ey * k - vel[iy] * c + G) * dt;
        pos[ix] += vel[ix] * dt; pos[iy] += vel[iy] * dt;
        if (pos[iy] > floor && vel[iy] > 0) { pos[iy] = floor; vel[iy] *= -0.15; vel[ix] *= 0.5; }
        if (ramp > 0.3 && Math.abs(ex) + Math.abs(ey) < s.g * 0.6 && Math.abs(vel[ix]) + Math.abs(vel[iy]) < fs * 0.2) {
          free[i] = 0; loose[i] = 0; pos[ix] = home[ix]; pos[iy] = home[iy]; vel[ix] = vel[iy] = 0;
        }
      }

      // fade between the glyph and its grains instead of switching
      // only letters the wind is actually wearing away turn to sand
      const want = busy ? 1 : 0;
      s.mix += (want - s.mix) * Math.min(1, dt * (want ? 3.5 : 2.5));
      if (anyFree || busy) l.heatT = Math.max(l.heatT, 0.12 + blow * 0.25);
      if (!busy && !near && s.mix < 0.02) piles.delete(l); // home: back to the crisp glyph
    }
    if (detached) w.sound.play('sand', Math.min(1, 0.3 + detached / 60));
  },

  down() { /* the drag itself ploughs, in update */ },

  up(w, _hit, click) {
    if (!click) return;
    // a dust cloud: everything near the click lets go and is thrown up and out
    const p = w.p, fs = w.fs, R = fs * 0.6;
    for (const l of w.letters) {
      if (!l.glyph || Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) > R + fs * 0.6) continue;
      const s = pile(w, l);
      const [px, py] = toLocal(l, p.x, p.y);
      for (let i = 0; i < s.n; i++) {
        const dx = s.pos[i * 2] - px, dy = s.pos[i * 2 + 1] - py;
        const d = Math.hypot(dx, dy) || 1;
        if (d > R) continue;
        const f = (1 - d / R) * w.inten;
        const sp = fs * (1.4 + Math.random() * 2.4) * f;
        release(s, i, (dx / d) * sp + (Math.random() - 0.5) * fs * 0.6 * f, (dy / d) * sp - fs * (0.6 + Math.random() * 1.2) * f, w.t);
      }
      s.mix = Math.max(s.mix, 0.6);
    }
    w.fx.gust(p.x, p.y, 'spark', R * 0.6);
    w.sound.play('gust', w.inten);
  },

  drawLetter(ctx, l, _w, _colors, liftPx) {
    const s = piles.get(l);
    if (!s) return false;
    const a0 = ctx.globalAlpha;
    if (s.mix < 0.999) {
      ctx.globalAlpha = a0 * (1 - s.mix);
      ctx.fillText(l.ch, -l.adv / 2, liftPx);
    }
    // grains overlap so a resting letter still reads as solid; three strengths give it a fine texture
    const g = s.g * 1.5, h = g / 2, pos = s.pos;
    for (let shade = 0; shade < 3; shade++) {
      ctx.globalAlpha = a0 * s.mix * (0.82 + shade * 0.09);
      ctx.beginPath();
      for (let i = 0; i < s.n; i++) if (s.shade[i] === shade) ctx.rect(pos[i * 2] - h, pos[i * 2 + 1] - h, g, g);
      ctx.fill();
    }
    ctx.globalAlpha = a0;
    return true;
  },
};

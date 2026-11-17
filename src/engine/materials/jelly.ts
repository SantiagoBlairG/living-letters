import type { Letter, Material, World } from '../types';
import { clamp } from '../simulation';

/** Soft, elastic, with mass. Under-damped springs give the wobble; squash and stretch do the rest. */

function bounce(w: World, g: Letter) {
  const n0 = g.index;
  for (const l of w.letters) {
    const n = Math.abs(l.index - n0);
    const a = Math.pow(0.56, n) * w.inten;
    if (a < 0.05) continue;
    // a decaying wave: each neighbour dips, then hops, a beat later than the one before
    w.later(n * 62, () => { l.vsy -= 2.4 * a; l.vsx += 1.5 * a; });
    w.later(n * 62 + 85, () => {
      l.vy -= w.fs * 1.15 * a;
      l.vsy += 4.6 * a; l.vsx -= 2.8 * a;
      l.vr += (Math.random() - 0.5) * 1.6 * a;
    });
  }
}

function ripple(w: World, x: number, y: number) {
  const R = w.fs * 1.15;
  for (const l of w.letters) {
    const dx = w.cx(l) - x, dy = w.cy(l) - y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > R) continue;
    const a = Math.pow(1 - d / R, 2) * w.inten;
    w.later((d / w.fs) * 130, () => {
      l.vx += (dx / d) * w.fs * 1.5 * a; l.vy += (dy / d) * w.fs * 1.5 * a;
      l.vsy -= 2 * a; l.vsx += 1.3 * a;
    });
  }
}

export const jelly: Material = {
  id: 'jelly',
  accent: 'spark',
  spring: { k: 130, c: 9.5, rk: 110, rc: 8, sk: 210, sc: 9.5, limit: 0.42, lift: 0 },

  ambient(l, w, out) {
    const b = Math.sin(w.t * 1.25 * w.speed + l.phase) * 0.014 * w.amb;
    out.sy += b; out.sx -= b * 0.6;
  },

  update(w) {
    const p = w.p, fs = w.fs;
    for (const l of w.letters) {
      // bodies stretch along their own motion
      const hx = clamp(Math.abs(l.vx) / (fs * 7), 0, 0.14), hy = clamp(Math.abs(l.vy) / (fs * 7), 0, 0.14);
      l.sxT += hx - hy * 0.7; l.syT += hy - hx * 0.7;
    }
    const g = p.grab;
    if (g) {
      let dx = p.x - p.downX, dy = p.y - p.downY;
      const mag = Math.hypot(dx, dy);
      const m = fs * 0.5;
      if (mag > 0.001) { const q = (m * Math.tanh(mag / m)) / mag; dx *= q; dy *= q; }
      g.kMul = 2.4;
      g.tx = dx * 0.55; g.ty = dy * 0.55;
      g.skT += clamp((dx / fs) * 0.95, -0.42, 0.42);
      g.rT += clamp((dx / fs) * 0.14, -0.1, 0.1);
      g.sxT += (Math.abs(dx) / fs) * 0.4 + (dy / fs) * 0.3;
      g.syT += (-dy / fs) * 0.95;
      g.heatT = Math.min(1, 0.25 + mag / m);
      if (p.travel < 6) { g.syT -= 0.15; g.sxT += 0.1; } // held down: anticipation
      for (const l of w.letters) {
        if (l === g) continue;
        const f = Math.pow(0.3, Math.abs(l.index - g.index));
        l.fx += dx * 130 * f; l.fy += dy * 130 * f;
        l.skT += clamp((dx / fs) * 0.5, -0.3, 0.3) * f;
      }
      return;
    }
    if (!p.active) return;
    const R = Math.max(120, fs * 0.46);
    const s = 0.4 + Math.min(p.speed / 700, 1.7); // slow = caress, fast = shove
    for (const l of w.letters) {
      const dx = w.cx(l) - p.x, dy = w.cy(l) - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 2);
      const nx = dx / d, ny = dy / d;
      const F = f * s * w.inten * fs * 16;
      l.fx += nx * F; l.fy += ny * F * 0.8;
      const q = f * Math.min(1.3, s + 0.3) * w.inten;
      l.sxT += q * (-0.22 * Math.abs(nx) + 0.13 * Math.abs(ny));
      l.syT += q * (-0.22 * Math.abs(ny) + 0.13 * Math.abs(nx));
      l.skT += nx * q * 0.3;
      l.rT += nx * q * 0.09;
      l.heatT = Math.min(1, f * s);
    }
  },

  down(w, hit) {
    if (!hit) return;
    w.p.grab = hit;
    hit.vsy -= 1.6 * w.inten; hit.vsx += 1 * w.inten;
    w.sound.play('press');
  },

  up(w, _hit, click) {
    const g = w.p.grab;
    w.p.grab = null;
    if (click) {
      w.fx.ring(w.p.x, w.p.y, 'spark');
      if (g) bounce(w, g); else ripple(w, w.p.x, w.p.y);
      w.sound.play('pop', w.inten);
    } else if (g) {
      w.sound.play('boing', w.inten);
    }
  },
};

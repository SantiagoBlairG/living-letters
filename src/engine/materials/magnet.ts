import type { Material } from '../types';
import { clamp, tuneF } from '../simulation';

/** Tension and attraction. Stiff, well-damped anchors keep the word legible while the field pulls. */

export const magnet: Material = {
  id: 'magnet',
  accent: 'stem',
  spring: { k: 170, c: 17, rk: 120, rc: 13, sk: 200, sc: 20, limit: 0.5, lift: 0.3 },

  ambient(l, w, out) {
    const f = 22 + 26 * w.speed;
    out.x += Math.sin(w.t * f + l.phase * 7) * 0.5 * w.amb;
    out.y += Math.cos(w.t * f * 0.83 + l.phase2 * 5) * 0.4 * w.amb;
  },

  update(w) {
    const p = w.p, fs = w.fs;
    if (!p.active) return;
    const hold = p.down ? Math.min(1, p.held / 0.3) : 0; // the field charges up while pressed
    const R = Math.max(170, fs * 0.62) * (1 + 0.7 * hold) * tuneF(w.tune, 3);
    const strength = (1 + 1.5 * hold) * w.inten * fs * 20;
    for (const l of w.letters) {
      const dx = p.x - w.cx(l), dy = p.y - w.cy(l);
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 2);
      const soft = Math.min(1, d / (fs * 0.14)); // no singularity under the pointer
      const ux = dx / d, uy = dy / d;
      l.fx += ux * f * strength * soft; l.fy += uy * f * strength * soft;
      l.rT += clamp(ux * f * (0.22 + 0.14 * hold) * w.inten, -0.3, 0.3);
      l.skT += ux * f * 0.12 * w.inten;
      if (hold) { l.sxT -= f * 0.05 * hold; l.syT += f * 0.04 * hold; }
      l.heatT = Math.min(1, f * (0.75 + 0.5 * hold));
    }
  },

  down() {},

  up(w, _hit, click) {
    const p = w.p, fs = w.fs;
    const R = Math.max(280, fs * 1.05) * tuneF(w.tune, 3);
    const power = (click ? 1 : 0.5) * w.inten;
    for (const l of w.letters) {
      const dx = w.cx(l) - p.x, dy = w.cy(l) - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 1.5) * power;
      l.vx += (dx / d) * fs * 4.4 * f; l.vy += (dy / d) * fs * 4.4 * f;
      l.vr += (dx / d) * 2.6 * f;
    }
    w.fx.pulse(p.x, p.y, 'stem', R * (click ? 0.8 : 0.5));
    w.sound.play('pulse', power);
  },
};

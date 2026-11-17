import type { Material } from '../types';
import { clamp, tuneF } from '../simulation';

/** Lightness. Weak, slow springs and no deformation at all — letters drift, swing and come home late. */

export const float: Material = {
  id: 'float',
  accent: 'ink',
  spring: { k: 13, c: 5.2, rk: 9, rc: 4.4, sk: 70, sc: 13, limit: 0.75, lift: 0.3 },

  ambient(l, w, out) {
    const t = w.t * w.speed;
    out.x += Math.sin(t * 0.55 + l.phase) * 0.02 * w.fs * w.amb;
    out.y += Math.cos(t * 0.42 + l.phase2) * 0.032 * w.fs * w.amb;
    out.r += Math.sin(t * 0.33 + l.phase2) * 0.035 * w.amb;
  },

  update(w) {
    const p = w.p, fs = w.fs;
    const light = tuneF(1 - w.tune, 4); // Lightness: weaker springs, longer drifts
    for (const l of w.letters) { l.kMul *= light; l.rT += clamp(l.vx / (fs * 3.2), -0.3, 0.3); } // swing with your own drift
    const g = p.grab;
    if (g) {
      let dx = p.x - p.downX, dy = p.y - p.downY;
      const mag = Math.hypot(dx, dy), m = fs * 0.7;
      if (mag > 0.001) { const q = (m * Math.tanh(mag / m)) / mag; dx *= q; dy *= q; }
      g.kMul = 3.4; // the thread is stretchy: the letter trails behind the hand
      g.tx = dx; g.ty = dy;
      for (const l of w.letters) {
        if (l === g) continue;
        const f = Math.pow(0.22, Math.abs(l.index - g.index));
        l.fx += dx * 13 * f * 2; l.fy += dy * 13 * f * 2;
      }
    }
    if (!p.active) return;
    const R = Math.max(200, fs * 0.8);
    const cap = fs * 26;
    for (const l of w.letters) {
      if (l === g) continue;
      const d = Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y);
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 2) * 3.4 * w.inten;
      l.fx += clamp(p.vx * f, -cap, cap); l.fy += clamp(p.vy * f, -cap, cap);
    }
  },

  down(w, hit) { if (hit) w.p.grab = hit; },

  up(w, _hit, click) {
    const p = w.p, fs = w.fs;
    p.grab = null;
    if (!click) return;
    const R = Math.max(300, fs * 1.2);
    for (const l of w.letters) {
      const dx = w.cx(l) - p.x, dy = w.cy(l) - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 1.4) * w.inten;
      l.vx += (dx / d) * fs * 1.5 * f; l.vy += (dy / d) * fs * 1.5 * f;
      l.vr += (Math.random() - 0.5) * 1.4 * f;
    }
    w.fx.gust(p.x, p.y, 'ink', R * 0.5);
    w.sound.play('gust', w.inten);
  },
};

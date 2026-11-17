import type { Material } from '../types';
import { clamp, tuneF } from '../simulation';

/** A flat, graphic garden that only ever grows from the ink of the letters. */

let lastX = -1e4, lastY = -1e4, lastT = 0;

export const bloom: Material = {
  id: 'bloom',
  accent: 'flower',
  spring: { k: 150, c: 17, rk: 120, rc: 11, sk: 200, sc: 14, limit: 0.2, lift: 0 },

  ambient(l, w, out) {
    out.r += Math.sin(w.t * 0.5 * w.speed + l.phase) * 0.004 * w.amb;
  },

  update(w) {
    const p = w.p;
    if (!p.active) return;
    const sow = p.down;
    const sp = 1 / tuneF(w.tune, 3); // Density: growth packed closer together
    const moved = Math.hypot(p.x - lastX, p.y - lastY);
    // rate-limited in both time and distance, so growth traces the path instead of flooding it
    if (moved < (sow ? 16 : 26) * sp || w.t - lastT < (sow ? 0.045 : 0.07) || p.speed < 6) return;
    const e = w.nearestEdge(p.x, p.y, sow ? 40 : 52);
    if (!e) return;
    lastX = p.x; lastY = p.y; lastT = w.t;
    // sowing plants straight into the ink under the finger; hovering grows from the nearest edge
    const deep = sow && e.inside;
    const ax = deep ? e.ix : e.ex, ay = deep ? e.iy : e.ey;
    if (w.plants.tooClose(e.l, ax, ay, (sow ? 0.04 : 0.055) * sp)) return;
    const lean = clamp(p.vx / 500, -1, 1); // stems lean the way the hand is travelling
    w.plants.sprout(e.l, ax, ay, deep ? 0 : e.nx, deep ? -0.4 : e.ny, lean, w.inten, sow);
    e.l.vr += lean * 0.12 * w.inten;
    w.sound.play('sprout', 0.6);
  },

  down() {},

  up(w, _hit, click) {
    if (!click) return;
    const p = w.p;
    w.fx.burst(p.x, p.y, 'flower');
    const e = w.nearestEdge(p.x, p.y, 64);
    if (!e) return;
    if (e.inside) w.plants.flower(e.l, e.ix, e.iy, (Math.random() - 0.5) * 0.5, -0.4, w.inten);
    else w.plants.flower(e.l, e.ex, e.ey, e.nx, e.ny, w.inten);
    const l = e.l;
    l.vsy -= 1.5 * w.inten; l.vsx += 0.9 * w.inten;
    l.vr += (Math.random() < 0.5 ? -1 : 1) * 0.5 * w.inten;
    w.later(240, () => { l.vsy += 1.1 * w.inten; });
    w.sound.play('flower', w.inten);
  },
};

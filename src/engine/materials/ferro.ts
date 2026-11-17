import type { Letter, Material, World } from '../types';
import { calm, clamp, toLocal, tuneF } from '../simulation';
import { css, mix } from '../color';

/**
 * Ferrofluid. The letters are a glossy magnetic liquid: near the pointer, spikes rise out of their edges and
 * point at it. A click makes every edge bristle at once; holding pulls the liquid toward the hand, and the
 * spikes grow long.
 */

const LIFT = 0.3;
const SEEDS = 38; // spike roots per letter

interface Spikes { x: Float32Array; y: Float32Array; nx: Float32Array; ny: Float32Array; len: Float32Array; ph: Float32Array; fs: number }
const spikes = new Map<Letter, Spikes>();
let burst = 0;

/** Roots spread evenly round the glyph's outline (local px), with their outward normals. */
function seed(w: World, l: Letter): Spikes {
  const e = l.glyph!.edges, n = e.length / 4, fs = w.fs;
  const k = Math.min(SEEDS, n), step = n / k;
  const s: Spikes = { x: new Float32Array(k), y: new Float32Array(k), nx: new Float32Array(k), ny: new Float32Array(k), len: new Float32Array(k), ph: new Float32Array(k), fs };
  for (let i = 0; i < k; i++) {
    const j = Math.floor(i * step + Math.random() * step * 0.6) * 4;
    s.x[i] = e[j] * fs - l.adv / 2; s.y[i] = (e[j + 1] + LIFT) * fs;
    s.nx[i] = e[j + 2]; s.ny[i] = e[j + 3]; s.ph[i] = Math.random() * 6.28;
  }
  return s;
}

function get(w: World, l: Letter) {
  let s = spikes.get(l);
  if (!s || s.fs !== w.fs) { s = seed(w, l); spikes.set(l, s); }
  return s;
}

export const ferro: Material = {
  id: 'ferro',
  accent: 'stem',
  spring: { k: 120, c: 13, rk: 110, rc: 12, sk: 150, sc: 11, limit: 0.45, lift: LIFT },

  ambient(l, w, out) {
    const b = Math.sin(w.t * 1.6 * w.speed + l.phase) * 0.01 * w.amb;
    out.sy += b; out.sx -= b * 0.5;
  },

  enter() { spikes.clear(); burst = 0; },
  reset(w) { spikes.clear(); burst = 0; calm(w.letters); },

  update(w: World, dt) {
    const p = w.p, fs = w.fs;
    for (const k of spikes.keys()) if (!w.letters.includes(k)) spikes.delete(k);
    burst = Math.max(0, burst - dt * 1.6);
    const hold = p.down ? Math.min(1, p.held / 0.4) : 0;
    const maxLen = fs * 0.16 * w.inten * tuneF(w.tune, 2.5) * (1 + hold * 0.7);
    const R = fs * (0.75 + hold * 0.6);
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const s = get(w, l);
      const [px, py] = toLocal(l, p.x, p.y);
      for (let i = 0; i < s.len.length; i++) {
        let target = fs * 0.006 * (1 + Math.sin(w.t * 3 + s.ph[i])) * w.amb; // a faint ripple at rest
        if (p.active) {
          const dx = px - s.x[i], dy = py - s.y[i], d = Math.hypot(dx, dy) || 1;
          const align = (s.nx[i] * dx + s.ny[i] * dy) / d; // does this edge face the pointer?
          if (d < R && align > 0.15) target += maxLen * (1 - d / R) ** 1.5 * align ** 1.6;
        }
        target += fs * 0.09 * burst * (0.6 + 0.4 * Math.sin(s.ph[i] * 3)) * w.inten;
        // liquid: quick to rise, a little slower to settle back
        s.len[i] += (target - s.len[i]) * Math.min(1, dt * (target > s.len[i] ? 14 : 6));
      }
      // holding pulls the liquid toward the hand
      if (hold > 0) {
        const dx = p.x - w.cx(l), dy = p.y - w.cy(l), d = Math.hypot(dx, dy) || 1;
        const f = clamp(1 - d / (fs * 2.2), 0, 1) * hold * w.inten;
        l.tx += (dx / d) * Math.min(d, fs * 0.35) * f;
        l.ty += (dy / d) * Math.min(d, fs * 0.35) * f;
        l.sxT += Math.abs(dx / d) * 0.25 * f - 0.08 * f; l.syT += Math.abs(dy / d) * 0.25 * f - 0.08 * f;
        l.heatT = Math.max(l.heatT, f * 0.25);
      }
    }
  },

  down(w) { w.sound.play('press'); },

  up(w, hit, click) {
    if (!click) return;
    burst = 1;
    const fs = w.fs;
    for (const l of w.letters) {
      const dx = w.cx(l) - w.p.x, dy = w.cy(l) - w.p.y, d = Math.hypot(dx, dy) || 1;
      const f = clamp(1 - d / (fs * 1.6), 0, 1) * w.inten;
      l.vsy += 1.6 * f; l.vsx -= 1 * f;
      if (l === hit) { l.vsy += 1.2; l.vsx -= 0.6; }
    }
    w.fx.pulse(w.p.x, w.p.y, 'stem', fs * 0.5);
    w.sound.play('pulse', w.inten);
  },

  drawLetter(ctx, l, w, colors, liftPx) {
    const s = spikes.get(l);
    const fill = ctx.fillStyle;
    ctx.fillText(l.ch, -l.adv / 2, liftPx);
    if (s) { // the spikes: cones with concave sides, so they read as liquid drawn up into points
      const fs = w.fs;
      ctx.beginPath();
      for (let i = 0; i < s.len.length; i++) {
        const L = s.len[i];
        if (L < fs * 0.012) continue;
        const x = s.x[i], y = s.y[i], nx = s.nx[i], ny = s.ny[i];
        const half = Math.min(fs * 0.07, L * 0.5 + fs * 0.012), tx = -ny, ty = nx;
        const ax = x - nx * fs * 0.03, ay = y - ny * fs * 0.03; // rooted a little inside the ink
        const px = x + nx * L, py = y + ny * L;
        ctx.moveTo(ax + tx * half, ay + ty * half);
        ctx.quadraticCurveTo(x + nx * L * 0.3 + tx * half * 0.2, y + ny * L * 0.3 + ty * half * 0.2, px, py);
        ctx.quadraticCurveTo(x + nx * L * 0.3 - tx * half * 0.2, y + ny * L * 0.3 - ty * half * 0.2, ax - tx * half, ay - ty * half);
        ctx.closePath();
      }
      ctx.fill();
    }
    // the gloss of a wet metallic surface: a soft highlight across the top of the letter
    const g = l.glyph!.box, fs = w.fs;
    const top = g[1] * fs + liftPx, mid = top + (g[3] - g[1]) * fs * 0.45;
    const sheen = ctx.createLinearGradient(0, top, 0, mid);
    sheen.addColorStop(0, css(mix(colors.ink, [255, 255, 255], 0.7), 0.4));
    sheen.addColorStop(1, css(colors.ink, 0));
    ctx.fillStyle = sheen;
    ctx.fillText(l.ch, -l.adv / 2, liftPx);
    ctx.fillStyle = fill;
    return true;
  },
};

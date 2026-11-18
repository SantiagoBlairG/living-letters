import type { Letter, Material, World } from '../types';
import { calm, clamp, tuneF } from '../simulation';
import { css } from '../color';
import { fontOf } from '../layout';
import { glyphLayer } from '../glyphLayer';

/**
 * A mirage. The word shimmers like air over hot ground, with its reflection lying inverted below it. Near the
 * pointer the heat rises; a click sends a wave of heat rolling out along the word; holding makes it blaze —
 * the letters lift, warm in colour, and the air boils.
 */

const LIFT = 0.3;

interface Wave { x: number; t0: number }
const heat = new Map<Letter, number>();
const waves: Wave[] = [];
let clock = 0;
let holdHeat = 0;

const ROW = 2; // device pixels per row: thin enough that the wave reads as one continuous curve

/**
 * The glyph rendered once at screen resolution, then laid back row by row, each row pushed sideways by the
 * shimmer — so the wave bends smoothly instead of in steps. `alphaAt(v)` fades rows (0 top … 1 bottom).
 */
function shimmer(ctx: CanvasRenderingContext2D, l: Letter, fs: number, liftPx: number, amp: number, alphaAt?: (v: number) => number) {
  if (amp < 0.15 && !alphaAt) { ctx.fillText(l.ch, -l.adv / 2, liftPx); return; }
  const L = glyphLayer(ctx, l, liftPx, fs, 0.03);
  if (!L) return;
  const k = (Math.PI * 2) / (fs * 0.42), a0 = ctx.globalAlpha;
  const w = L.W / L.kx, rows = Math.ceil(L.H / ROW);
  for (let i = 0; i < rows; i++) {
    const sy = i * ROW, y = L.y0 + sy / L.ky, v = (i + 0.5) / rows;
    const al = alphaAt ? alphaAt(v) : 1;
    if (al < 0.01) continue;
    const dx = amp * Math.sin(y * k - clock * 5 + l.phase) + amp * 0.25 * Math.sin(y * k * 1.7 + clock * 3);
    ctx.globalAlpha = a0 * al;
    // a hair taller than a row, so neighbouring rows meet without seams
    ctx.drawImage(L.c, 0, sy, L.W, Math.min(ROW + 1, L.H - sy), L.x0 + dx, y, w, (ROW + 1) / L.ky);
  }
  ctx.globalAlpha = a0;
}

function ampOf(w: World, l: Letter) {
  const fs = w.fs;
  let a = fs * (0.003 + 0.016 * (heat.get(l) ?? 0)) * w.inten * tuneF(w.tune, 2.5);
  for (const v of waves) { // the click's wave, rolling out along the word
    const age = clock - v.t0, d = Math.abs(w.cx(l) - v.x) - age * fs * 2.4;
    a += fs * 0.032 * Math.exp(-((d / (fs * 0.5)) ** 2)) * (1 - age / 1.6) * w.inten;
  }
  return a;
}

export const mirage: Material = {
  id: 'mirage',
  accent: 'flower',
  spring: { k: 70, c: 10, rk: 70, rc: 10, sk: 140, sc: 12, limit: 0.4, lift: LIFT },

  ambient(l, w, out) {
    out.y += Math.sin(w.t * 0.9 * w.speed + l.phase) * 0.008 * w.fs * w.amb;
  },

  enter() { heat.clear(); waves.length = 0; holdHeat = 0; },
  reset(w) { heat.clear(); waves.length = 0; holdHeat = 0; calm(w.letters); },

  update(w: World, dt) {
    const p = w.p, fs = w.fs;
    clock = w.t;
    for (let i = waves.length - 1; i >= 0; i--) if (w.t - waves[i].t0 > 1.6) waves.splice(i, 1);
    holdHeat += ((p.down ? 1 : 0) - holdHeat) * Math.min(1, dt * (p.down ? 1.5 : 2.5));
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const d = p.active ? Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) : Infinity;
      const target = clamp(1 - d / (fs * 1.3), 0, 1) * (p.down ? 1.6 : 1);
      const h = heat.get(l) ?? 0;
      heat.set(l, h + (target - h) * Math.min(1, dt * (target > h ? 4 : 1.2)));
      const hh = heat.get(l)! * holdHeat;
      l.ty -= fs * 0.06 * hh; // hot air rises
      l.syT += 0.05 * hh;
      l.heatT = Math.max(l.heatT, hh * 0.7);
    }
  },

  down(w) { w.sound.play('press'); },

  up(w, _hit, click) {
    if (!click) return;
    waves.push({ x: w.p.x, t0: w.t });
    if (waves.length > 4) waves.shift();
    w.sound.play('gust', 0.6 * w.inten);
  },

  drawLetter(ctx, l, w, _colors, liftPx) {
    shimmer(ctx, l, w.fs, liftPx, ampOf(w, l));
    return true;
  },

  /** The reflection, under the letters: the word inverted below its baseline, wavier, fading with depth. */
  back(ctx, w, colors) {
    const fs = w.fs, liftPx = LIFT * fs, hy = w.baseline + fs * 0.04;
    ctx.font = fontOf(fs);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = css(colors.ink);
    for (const l of w.letters) {
      if (!l.glyph || l.alpha < 0.05) continue;
      const m = l.m;
      ctx.save();
      ctx.translate(0, 2 * hy);
      ctx.scale(1, -1);
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.globalAlpha = Math.min(1, l.alpha);
      // after the flip the glyph's bottom lies against the horizon: v = 1 there, fading away from it
      shimmer(ctx, l, fs, liftPx, ampOf(w, l) * 1.6 + fs * 0.007, (v) => 0.26 * v * v);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};

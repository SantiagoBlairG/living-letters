import type { Letter, Material, World } from '../types';
import { calm, clamp, tuneF } from '../simulation';
import { css } from '../color';

/**
 * A lens. Only what is near the pointer is in focus; the rest of the word falls softly out of it, swelling
 * a little as it blurs. A click racks the focus — everything blurs, then comes back sharp. Holding zooms in
 * on the point you press, blurring outward from it. With the pointer away, the whole word is in focus.
 */

const LIFT = 0.3;
const blur = new Map<Letter, number>(); // current blur, stage px
let rack = 0; // a click's blur pulse, 0..1
let zoom = 0; // how far the held zoom has gone, 0..1
let zx = 0, zy = 0; // where it zooms from
const canFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

/** Draws the glyph blurred by `b` (stage px). Uses the canvas filter, or a ring of faint copies where there is none. */
function blurred(ctx: CanvasRenderingContext2D, l: Letter, liftPx: number, b: number) {
  if (b < 0.35) { ctx.fillText(l.ch, -l.adv / 2, liftPx); return; }
  const T = ctx.getTransform(), m = l.m;
  const scale = Math.hypot(T.a, T.b) / (Math.hypot(m[0], m[1]) || 1); // canvas pixels per stage pixel
  if (canFilter) {
    ctx.filter = `blur(${(b * scale).toFixed(2)}px)`;
    ctx.fillText(l.ch, -l.adv / 2, liftPx);
    ctx.filter = 'none';
    return;
  }
  const a0 = ctx.globalAlpha, n = 8, r = b * 0.8 / (Math.hypot(m[0], m[1]) || 1);
  ctx.globalAlpha = a0 / 3;
  for (let i = 0; i < n; i++) ctx.fillText(l.ch, -l.adv / 2 + Math.cos((i / n) * 6.283) * r, liftPx + Math.sin((i / n) * 6.283) * r);
  ctx.globalAlpha = a0;
}

export const focus: Material = {
  id: 'focus',
  accent: 'spark',
  spring: { k: 90, c: 13, rk: 90, rc: 12, sk: 120, sc: 13, limit: 0.4, lift: LIFT },

  ambient(l, w, out) {
    out.y += Math.sin(w.t * 0.7 * w.speed + l.phase) * 0.006 * w.fs * w.amb;
  },

  enter() { blur.clear(); rack = 0; zoom = 0; },
  reset(w) { blur.clear(); rack = 0; zoom = 0; calm(w.letters); },

  update(w: World, dt) {
    const p = w.p, fs = w.fs;
    const depth = fs * 0.07 * w.inten * tuneF(w.tune, 2.5); // the most a letter blurs
    rack = Math.max(0, rack - dt * 1.4);
    zoom += ((p.down ? 1 : 0) - zoom) * Math.min(1, dt * (p.down ? 2.2 : 5));
    for (const l of w.letters) {
      if (!l.glyph) continue;
      let target = 0;
      if (p.active && !p.down) { // depth of field around the pointer
        const d = Math.abs(w.cx(l) - p.x) + Math.abs(w.cy(l) - p.y) * 0.4;
        target = depth * Math.pow(clamp((d - fs * 0.25) / (fs * 1.6), 0, 1), 1.2);
      }
      // a click racks focus: a blur that rises fast and settles back
      target += depth * 1.1 * Math.sin(Math.min(1, rack) * Math.PI) ;
      if (zoom > 0.01) { // the held zoom: letters swell away from the point, blurring with distance
        const dx = w.cx(l) - zx, dy = w.cy(l) - zy, d = Math.hypot(dx, dy) || 1;
        l.tx += (dx / d) * Math.min(d, fs) * 0.16 * zoom;
        l.ty += (dy / d) * Math.min(d, fs) * 0.16 * zoom;
        l.sxT += 0.14 * zoom; l.syT += 0.14 * zoom;
        target += depth * 1.4 * zoom * clamp(d / (fs * 1.2), 0, 1);
      }
      const b = blur.get(l) ?? 0;
      const nb = b + (target - b) * Math.min(1, dt * 7);
      blur.set(l, nb);
      // out of focus, a letter swells slightly, as with a real lens
      const k = nb / (fs * 0.07);
      l.sxT += 0.035 * k; l.syT += 0.035 * k;
      l.heatT = Math.max(l.heatT, (1 - clamp(k * 1.5, 0, 1)) * (p.active ? 0.35 : 0) * (target < 0.5 ? 1 : 0));
    }
  },

  down(w) {
    zx = w.p.x; zy = w.p.y;
    w.sound.play('press');
  },

  up(w, _hit, click) {
    if (!click) return;
    rack = 1;
    w.fx.ring(w.p.x, w.p.y, 'spark', w.fs * 0.35);
    w.sound.play('shutter', w.inten);
  },

  drawLetter(ctx, l, _w, _colors, liftPx) {
    blurred(ctx, l, liftPx, blur.get(l) ?? 0);
    return true;
  },

  /** The focus point itself: two thin brackets around the pointer, closing in while you hold. */
  front(ctx, w, colors) {
    const p = w.p;
    if (!p.active || p.touch) return;
    const r = 26 - zoom * 10, a = 0.5;
    ctx.strokeStyle = css(colors.spark, a);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = p.x + sx * r, cy = p.y + sy * r * 0.75;
      ctx.moveTo(cx, cy - sy * 7); ctx.lineTo(cx, cy); ctx.lineTo(cx - sx * 9, cy);
    }
    ctx.stroke();
  },
};

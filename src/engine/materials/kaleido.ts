import type { Material, World } from '../types';
import { calm, clamp } from '../simulation';
import { css, mix, type RGB } from '../color';
import { fontOf } from '../layout';

/**
 * A kaleidoscope. The word is reflected in a ring of mirrors whose centre follows the pointer, faintly,
 * behind the real letters. A click adds a mirror (up to a dozen, then back to a few); holding turns the
 * kaleidoscope, and the letters turn a little round your hand with it.
 */

const LIFT = 0.3;
const TAU = Math.PI * 2;

/** Shared with the background, which draws a rosette with the same symmetry. */
export const kaleidoState = { n: 6, rot: 0, cx: 0, cy: 0, flash: 0 };
let extra = 0;
let hold = 0;

export const kaleido: Material = {
  id: 'kaleido',
  accent: 'spark',
  spring: { k: 80, c: 10, rk: 70, rc: 9, sk: 160, sc: 12, limit: 0.5, lift: LIFT },

  ambient(l, w, out) {
    out.r += Math.sin(w.t * 0.5 * w.speed + l.phase) * 0.015 * w.amb;
  },

  enter(w) { extra = 0; hold = 0; kaleidoState.cx = w.W / 2; kaleidoState.cy = w.H / 2; },
  reset(w) { extra = 0; hold = 0; calm(w.letters); },

  update(w: World, dt) {
    const p = w.p, fs = w.fs, k = kaleidoState;
    k.n = Math.round(4 + w.tune * 6) + extra;
    hold += ((p.down ? 1 : 0) - hold) * Math.min(1, dt * (p.down ? 2 : 4));
    k.rot += dt * (0.06 * w.speed + hold * 1.4 * w.inten);
    k.flash = Math.max(0, k.flash - dt * 1.5);
    // the centre follows the pointer; with the pointer away, it drifts back to the middle of the word
    let tx = 0, ty = 0, n = 0;
    for (const l of w.letters) if (l.glyph) { tx += l.bx; ty += w.baseline - LIFT * fs; n++; }
    if (p.active) { tx = p.x; ty = p.y; } else if (n) { tx /= n; ty /= n; }
    const q = Math.min(1, dt * (p.active ? 9 : 2));
    k.cx += (tx - k.cx) * q; k.cy += (ty - k.cy) * q;
    if (hold > 0.01) { // the letters near the hand turn round it with the mirrors
      for (const l of w.letters) {
        const rx = l.bx - k.cx, ry = w.baseline - LIFT * fs - k.cy, d = Math.hypot(rx, ry);
        const f = clamp(1 - d / (fs * 2.6), 0, 1) * hold * w.inten, a = 0.22 * f;
        l.tx += rx * Math.cos(a) - ry * Math.sin(a) - rx;
        l.ty += rx * Math.sin(a) + ry * Math.cos(a) - ry;
        l.rT += a;
        l.heatT = Math.max(l.heatT, f * 0.15);
      }
    }
  },

  down(w) { w.sound.play('press'); },

  up(w, _hit, click) {
    if (!click) return;
    extra = (extra + 2) % 8; // another pair of mirrors, until it wraps round
    kaleidoState.flash = 1;
    for (const l of w.letters) l.vr += (Math.random() < 0.5 ? -1 : 1) * 0.8 * w.inten;
    w.fx.ring(w.p.x, w.p.y, 'spark', w.fs * 0.4);
    w.sound.play('flower', w.inten);
  },

  /** The reflections, behind the letters: the word turned about the centre, every other copy mirrored. */
  back(ctx, w, colors) {
    const k = kaleidoState, fs = w.fs, liftPx = LIFT * fs;
    const tints: RGB[] = [colors.spark, colors.flower, colors.stem];
    ctx.font = fontOf(fs);
    ctx.textBaseline = 'alphabetic';
    const base = (0.075 + 0.1 * k.flash + 0.04 * hold) * (w.p.active ? 1 : 0.7);
    for (let i = 1; i < k.n; i++) {
      ctx.save();
      ctx.translate(k.cx, k.cy);
      ctx.rotate((i * TAU) / k.n + k.rot);
      if (i % 2) ctx.scale(1, -1);
      ctx.translate(-k.cx, -k.cy);
      ctx.globalAlpha = base;
      ctx.fillStyle = css(mix(colors.ink, tints[i % 3], 0.55));
      for (const l of w.letters) {
        if (!l.glyph || l.alpha < 0.05) continue;
        const m = l.m;
        ctx.save();
        ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        ctx.fillText(l.ch, -l.adv / 2, liftPx);
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};

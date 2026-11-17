import type { Letter, Material, World } from '../types';
import { calm, clamp, tuneF } from '../simulation';
import { css, mix, type RGB } from '../color';
import { fontOf } from '../layout';

/**
 * Long exposure. Letters leave translucent echoes of where they have just been, tinted as they fade.
 * Hover pushes them and they smear; a click is a strobe that throws off copies; holding splits the
 * letters near the hand into ghosts that orbit them.
 */

const LIFT = 0.3;
type M = [number, number, number, number, number, number];
interface Strobe { l: Letter; m: M; vx: number; vy: number; age: number }

const trails = new Map<Letter, M[]>();
const strobes: Strobe[] = [];
let acc = 0;
let hold = 0;

const copy = (m: M): M => [m[0], m[1], m[2], m[3], m[4], m[5]];

function drawAt(ctx: CanvasRenderingContext2D, l: Letter, m: M, dx: number, dy: number, liftPx: number) {
  ctx.save();
  ctx.transform(m[0], m[1], m[2], m[3], m[4] + dx, m[5] + dy);
  ctx.fillText(l.ch, -l.adv / 2, liftPx);
  ctx.restore();
}

export const echo: Material = {
  id: 'echo',
  accent: 'flower',
  spring: { k: 55, c: 6.5, rk: 50, rc: 6, sk: 140, sc: 10, limit: 0.7, lift: LIFT },

  ambient(l, w, out) {
    const t = w.t * w.speed;
    out.x += Math.sin(t * 0.8 + l.phase) * 0.012 * w.fs * w.amb;
    out.y += Math.cos(t * 0.6 + l.phase2) * 0.016 * w.fs * w.amb;
    out.r += Math.sin(t * 0.5 + l.phase2) * 0.02 * w.amb;
  },

  enter() { trails.clear(); strobes.length = 0; hold = 0; },
  reset(w) { trails.clear(); strobes.length = 0; hold = 0; calm(w.letters); },

  update(w: World, dt) {
    const p = w.p, fs = w.fs;
    const keep = Math.round(clamp(12 * tuneF(w.tune, 3), 4, 36)); // how long the trail is, in samples
    hold += ((p.down ? 1 : 0) - hold) * Math.min(1, dt * (p.down ? 2 : 6));
    // a sample of every letter's place every 1/40 s
    acc += dt;
    if (acc > 1 / 40) {
      acc = 0;
      for (const l of w.letters) {
        if (!l.glyph) continue;
        let tr = trails.get(l);
        if (!tr) { tr = []; trails.set(l, tr); }
        tr.unshift(copy(l.m));
        if (tr.length > keep) tr.length = keep;
      }
      for (const k of trails.keys()) if (!w.letters.includes(k)) trails.delete(k);
    }
    // hover: the hand shoves letters along its path, so they smear
    if (p.active && !p.down) {
      const R = fs * 0.9, cap = fs * 10;
      const vx = clamp(p.vx, -cap, cap), vy = clamp(p.vy, -cap, cap);
      for (const l of w.letters) {
        const dx = w.cx(l) - p.x, dy = w.cy(l) - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > R) continue;
        const f = (1 - d / R) ** 2 * w.inten;
        l.fx += (vx * 9 + (dx / d) * fs * 6) * f; l.fy += (vy * 9 + (dy / d) * fs * 6) * f;
        l.rT += clamp(vx / (fs * 20), -0.2, 0.2) * f;
        l.heatT = Math.max(l.heatT, f * 0.6);
      }
    }
    for (let i = strobes.length - 1; i >= 0; i--) {
      const s = strobes[i];
      s.age += dt;
      if (s.age > 0.9) { strobes.splice(i, 1); continue; }
      s.vx *= 1 - Math.min(1, dt * 2.2); s.vy *= 1 - Math.min(1, dt * 2.2);
      s.m[4] += s.vx * dt; s.m[5] += s.vy * dt;
    }
  },

  down(w) { w.sound.play('press'); },

  up(w, _hit, click) {
    if (!click) return;
    // a strobe: a few copies of every letter near the flash, thrown out from it, fading
    const p = w.p, fs = w.fs, R = fs * 1.6;
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const dx = w.cx(l) - p.x, dy = w.cy(l) - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const f = (1 - d / R) * w.inten;
      for (let k = 1; k <= 3; k++) {
        if (strobes.length > 80) strobes.shift();
        strobes.push({ l, m: copy(l.m), vx: (dx / d) * fs * 1.6 * k * f, vy: (dy / d) * fs * 1.6 * k * f, age: (k - 1) * 0.08 });
      }
      l.vx += (dx / d) * fs * 2 * f; l.vy += (dy / d) * fs * 2 * f;
    }
    w.fx.pulse(p.x, p.y, 'flower', R * 0.4);
    w.sound.play('shutter', w.inten);
  },

  /** The echoes, under the letters: the trail of each, then the strobe copies, then the orbiting ghosts. */
  back(ctx, w, colors) {
    const fs = w.fs, liftPx = LIFT * fs, p = w.p;
    const tints: RGB[] = [colors.flower, colors.stem, colors.spark];
    ctx.font = fontOf(fs);
    ctx.textBaseline = 'alphabetic';
    for (const l of w.letters) {
      const tr = trails.get(l);
      if (!tr || !l.glyph || l.alpha < 0.05) continue;
      const cur = l.m;
      for (let i = tr.length - 1; i >= 1; i--) {
        const m = tr[i];
        // only draw the echo where the letter has actually moved
        const moved = Math.hypot(m[4] - cur[4], m[5] - cur[5]) + Math.abs(m[0] - cur[0]) * fs;
        if (moved < fs * 0.015) continue;
        const u = i / tr.length;
        ctx.globalAlpha = Math.min(1, l.alpha) * 0.32 * (1 - u) ** 1.4;
        ctx.fillStyle = css(mix(colors.ink, tints[i % 3], 0.35 + 0.5 * u));
        drawAt(ctx, l, m, 0, 0, liftPx);
      }
    }
    for (const s of strobes) {
      if (s.age < 0) continue;
      ctx.globalAlpha = 0.4 * (1 - s.age / 0.9) ** 1.5;
      ctx.fillStyle = css(mix(colors.ink, tints[(s.l.index + Math.round(s.age * 10)) % 3], 0.55));
      drawAt(ctx, s.l, s.m, 0, 0, liftPx);
    }
    if (hold > 0.02) { // holding: ghosts peel off the letters near the hand and orbit them
      for (const l of w.letters) {
        if (!l.glyph) continue;
        const d = Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y);
        const f = clamp(1 - d / (fs * 1.6), 0, 1) * hold;
        if (f < 0.02) continue;
        for (let k = 0; k < 3; k++) {
          const a = w.t * 2.6 + (k * Math.PI * 2) / 3 + l.index;
          ctx.globalAlpha = 0.3 * f;
          ctx.fillStyle = css(mix(colors.ink, tints[k] as RGB, 0.6));
          drawAt(ctx, l, l.m, Math.cos(a) * fs * 0.22 * f, Math.sin(a) * fs * 0.14 * f, liftPx);
        }
      }
    }
    ctx.globalAlpha = 1;
  },
};


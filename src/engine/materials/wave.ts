import type { Material, World } from '../types';
import { calm } from '../simulation';
import { css } from '../color';

/**
 * Water. The word floats on a surface. A click drops something in: a ring travels outward,
 * and each letter heaves and rocks as the crest passes under it. Dragging leaves a wake.
 */

interface Wave { x: number; y: number; t0: number; amp: number }
const waves: Wave[] = [];
const SPEED = 2.4; // em per second
const LEN = 0.6; // width of the crest, em
const LIFE = 3.5; // seconds

let trail = 0, lastHover = -1, lastX = 0, lastY = 0;

function drop(w: World, x: number, y: number, amp: number) {
  if (waves.length > 16) waves.shift();
  waves.push({ x, y, t0: w.t, amp });
}

export const wave: Material = {
  id: 'wave',
  accent: 'stem',
  spring: { k: 70, c: 7.5, rk: 60, rc: 6.5, sk: 150, sc: 10, limit: 0.5, lift: 0.3 },

  ambient(l, w, out) {
    // a slow swell that rolls along the word
    const t = w.t * w.speed;
    out.y += Math.sin(t * 1.15 - l.index * 0.7) * 0.014 * w.fs * w.amb;
    out.r += Math.sin(t * 0.9 - l.index * 0.7 + 1.2) * 0.022 * w.amb;
  },

  enter() { waves.length = 0; },

  reset(w) { waves.length = 0; calm(w.letters); },

  update(w) {
    const fs = w.fs, p = w.p;
    for (let i = waves.length - 1; i >= 0; i--) if (w.t - waves[i].t0 > LIFE) waves.splice(i, 1);
    const c = SPEED * fs, lam = LEN * fs;
    const hy = w.baseline - 0.3 * fs;

    for (const l of w.letters) {
      const hx = l.bx; // the letter's resting place, so the wave never chases its own effect
      for (const v of waves) {
        const age = w.t - v.t0;
        const u = (Math.hypot(hx - v.x, hy - v.y) - c * age) / lam;
        if (u < -2.5 || u > 2.5) continue;
        const env = Math.exp(-u * u) * v.amp * Math.exp(-age * 0.7) * w.inten;
        const k = Math.PI * u, side = hx >= v.x ? 1 : -1;
        l.ty -= env * Math.cos(k) * fs * 0.2; // heave on the crest, sink in the trough
        l.rT += env * Math.sin(k) * 0.28 * side; // and lean with the slope
        l.syT += env * Math.cos(k) * 0.06;
        l.heatT = Math.max(l.heatT, Math.min(1, env * 0.8));
      }
    }

    if (!p.active) { lastX = p.x; lastY = p.y; return; }
    const moved = Math.hypot(p.x - lastX, p.y - lastY);
    lastX = p.x; lastY = p.y;
    if (p.down) {
      if (p.travel > 8) { // the wake: small drops every few steps of the drag
        trail += moved;
        if (trail > fs * 0.3) { trail = 0; drop(w, p.x, p.y, 0.55); w.sound.play('sprout', 0.4); }
      }
    } else if (p.speed > fs * 1.6 && w.t - lastHover > 0.22) {
      lastHover = w.t; drop(w, p.x, p.y, 0.28); // a quick hand ripples the surface
    }
    // the hand presses the surface down and tips the letters away from it
    const R = fs * 0.8;
    for (const l of w.letters) {
      const dx = l.bx - p.x, d = Math.hypot(dx, hy - p.y);
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 2);
      l.ty += f * fs * 0.07;
      l.rT += f * (dx / (d || 1)) * 0.14;
    }
  },

  down(w) { trail = 0; lastX = w.p.x; lastY = w.p.y; },

  up(w, _hit, click) {
    if (!click) return;
    const p = w.p;
    drop(w, p.x, p.y, 1);
    w.fx.pulse(p.x, p.y, 'stem', w.fs * 0.5);
    w.sound.play('drip', w.inten);
  },

  /** The rings themselves, faint, under the letters. */
  back(ctx, w, colors) {
    const c = SPEED * w.fs, lam = LEN * w.fs;
    for (const v of waves) {
      const age = w.t - v.t0;
      const a = 0.3 * v.amp * Math.exp(-age * 1.2);
      if (a < 0.01) continue;
      const r = c * age;
      ctx.strokeStyle = css(colors.stem, a);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(v.x, v.y, r, 0, Math.PI * 2); ctx.stroke();
      if (r > lam) {
        ctx.strokeStyle = css(colors.stem, a * 0.45);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(v.x, v.y, r - lam * 0.7, 0, Math.PI * 2); ctx.stroke();
      }
    }
  },
};

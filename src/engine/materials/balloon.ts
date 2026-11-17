import type { Letter, Material, World } from '../types';
import { calm, clamp } from '../simulation';
import { css } from '../color';

/**
 * Air. Each letter is a balloon tied to a string below the word. Attention fills it —
 * hovering, or pressing and holding — until it pops into confetti and blows itself back up.
 */

const air = new Map<Letter, number>(); // 0 = slack, 1 = pops
const POP_DELAY = 0.6; // seconds a popped letter stays gone

function pop(w: World, l: Letter) {
  const fs = w.fs;
  const x = w.cx(l), y = w.cy(l);
  w.fx.confetti(x, y, fs * 0.5);
  w.fx.burst(x, y, 'flower', fs * 0.28);
  w.sound.play('bang', w.inten);
  // the bang shoves the neighbours aside
  for (const o of w.letters) {
    if (o === l) continue;
    const dx = w.cx(o) - x;
    const f = Math.max(0, 1 - Math.abs(dx) / (fs * 1.6)) * w.inten;
    if (f <= 0) continue;
    const s = Math.sign(dx) || 1;
    o.vx += s * fs * 1.6 * f; o.vr += s * 1.2 * f; o.vsy += 1.5 * f;
  }
  if (w.p.grab === l) w.p.grab = null;
  air.set(l, 0);
  // gone for a moment, then it inflates again from small, with a little overshoot
  l.alpha = 0; l.delay = POP_DELAY;
  l.ox = l.oy = l.vx = l.vy = 0; l.rot = l.vr = 0; l.sk = l.vsk = 0;
  l.sx = l.sy = 0.6; l.vsx = l.vsy = 0;
}

export const balloon: Material = {
  id: 'balloon',
  accent: 'flower',
  // pivot at the baseline, where the string is tied, so letters swing like balloons
  spring: { k: 42, c: 5.2, rk: 34, rc: 4.2, sk: 120, sc: 7, limit: 0.62, lift: 0 },

  ambient(l, w, out) {
    const t = w.t * w.speed;
    out.y += Math.sin(t * 0.9 + l.phase) * 0.02 * w.fs * w.amb;
    out.r += Math.sin(t * 0.7 + l.phase2) * 0.035 * w.amb;
  },

  enter() { air.clear(); },

  reset(w) {
    air.clear();
    for (const l of w.letters) if (l.delay > 0) l.delay = 0;
    calm(w.letters);
  },

  update(w, dt) {
    const p = w.p, fs = w.fs, g = p.grab;
    if (air.size > 64) for (const k of air.keys()) if (!w.letters.includes(k)) air.delete(k);
    let pumping = 0;
    for (const l of w.letters) {
      if (l.delay > 0 || !l.glyph) continue;
      let a = air.get(l) ?? 0;
      let gain = 0;
      if (l === g) { if (p.travel < 10) gain = 0.9; } // pressed and held still: pump it up
      else if (p.active && !g) {
        const R = fs * 0.5;
        const d = Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y);
        if (d < R) gain = (1 - d / R) * 0.75;
      }
      if (gain > 0) { a += dt * gain * (0.4 + 0.6 * w.inten); pumping = Math.max(pumping, a); }
      else a = Math.max(0, a - dt * 0.22); // slowly lets the air out
      air.set(l, a);
      if (a >= 1) { pop(w, l); continue; }
      l.sxT += a * 0.42; l.syT += a * 0.48;
      l.ty -= a * fs * 0.12; // fuller balloons tug upward on their strings
      l.heatT = Math.max(l.heatT, a * 0.9);
    }
    if (pumping > 0.35) w.sound.play('squeak', pumping);

    if (g && p.grab === g) {
      let dx = p.x - p.downX, dy = p.y - p.downY;
      const mag = Math.hypot(dx, dy), m = fs * 0.6;
      if (mag > 0.001) { const q = (m * Math.tanh(mag / m)) / mag; dx *= q; dy *= q; }
      g.kMul = 2.2;
      g.tx = dx * 0.8; g.ty = dy * 0.8;
      g.rT += clamp((dx / fs) * 0.5, -0.45, 0.45);
      g.syT += clamp((Math.abs(dy) / fs) * 0.35, 0, 0.3);
      g.sxT -= clamp((Math.abs(dy) / fs) * 0.15, 0, 0.15);
      g.heatT = Math.max(g.heatT, 0.5);
    }
  },

  down(w, hit) {
    if (!hit || hit.alpha < 0.5 || hit.delay > 0) return;
    w.p.grab = hit;
    w.sound.play('press');
  },

  up(w, _hit, click) {
    const p = w.p, fs = w.fs, g = p.grab;
    p.grab = null;
    if (click) {
      if (g) { if (g.delay <= 0) pop(w, g); return; }
      // a puff of air on empty stage: pushes letters away and fills them a little
      w.fx.ring(p.x, p.y, 'flower');
      const R = fs * 1.2;
      for (const l of w.letters) {
        if (l.delay > 0) continue;
        const dx = w.cx(l) - p.x, dy = w.cy(l) - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > R) continue;
        const f = Math.pow(1 - d / R, 1.5) * w.inten;
        l.vx += (dx / d) * fs * 1.3 * f; l.vy += (dy / d) * fs * 1.3 * f;
        air.set(l, Math.min(0.9, (air.get(l) ?? 0) + 0.25 * f));
      }
      w.sound.play('gust', w.inten * 0.7);
      return;
    }
    if (g) w.sound.play('boing', w.inten);
  },

  /** The strings, drawn behind the letters: from the bottom of each balloon to a knot below the word. */
  back(ctx, w, colors) {
    const fs = w.fs;
    ctx.lineWidth = Math.max(1, fs * 0.007);
    ctx.lineCap = 'round';
    const ay = w.baseline + fs * 0.45;
    for (const l of w.letters) {
      const gl = l.glyph;
      if (!gl || l.alpha < 0.05) continue;
      const lx = ((gl.box[0] + gl.box[2]) / 2) * fs - l.adv / 2;
      const ly = Math.max(0, gl.box[3]) * fs;
      const m = l.m;
      const sx = m[0] * lx + m[2] * ly + m[4], sy = m[1] * lx + m[3] * ly + m[5];
      const ax = l.bx + lx;
      const taut = l === w.p.grab;
      const sway = taut ? 0 : Math.sin(w.t * 1.7 + l.phase) * fs * 0.035;
      ctx.strokeStyle = css(colors.ink, (taut ? 0.6 : 0.32) * Math.min(1, l.alpha));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo((sx + ax) / 2 + sway, (sy + ay) / 2, ax, ay);
      ctx.stroke();
      // the knot
      ctx.fillStyle = css(colors.ink, 0.5 * Math.min(1, l.alpha));
      ctx.beginPath(); ctx.arc(sx, sy + 1, Math.max(1.5, fs * 0.011), 0, Math.PI * 2); ctx.fill();
    }
  },
};

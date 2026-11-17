import type { Letter, Material, World } from '../types';
import { clamp, tuneF } from '../simulation';
import { css, mix } from '../color';

/**
 * Gravity at its most extreme. The pointer is a small black hole that bends the letters toward it and
 * stretches them as they lean in. A click leaves a hole behind: letters fall into orbit, spiral in, and are
 * swallowed. Holding grows a hole under the hand. When a hole dies — or you let go of one — it turns
 * into a white hole and throws everything it took back out, and the letters fly home.
 */

const LIFT = 0.3;
const TAU = Math.PI * 2;
const WHITE = 0.6; // seconds a white hole lasts
const MAX_HOLES = 4;

interface Hole {
  x: number; y: number;
  mass: number;
  t0: number; life: number;
  eaten: Letter[];
  white: number; // when it turned white; -1 while it still pulls
  held: boolean; // following the hand while pressed
  spin: number;
}
const holes: Hole[] = [];

function eat(w: World, h: Hole, l: Letter) {
  h.eaten.push(l);
  w.fx.ring(h.x, h.y, 'spark', w.fs * 0.2);
  w.sound.play('press');
}

function whiten(w: World, h: Hole) {
  if (h.white >= 0) return;
  h.white = w.t;
  const fs = w.fs;
  for (const l of h.eaten) {
    const a = Math.random() * TAU, sp = fs * (2.5 + Math.random() * 2.5);
    l.vx = Math.cos(a) * sp; l.vy = Math.sin(a) * sp; l.vr = (Math.random() - 0.5) * 14;
  }
  h.eaten = [];
  w.fx.pulse(h.x, h.y, 'spark', fs * (0.6 + 0.3 * h.mass));
  w.fx.burst(h.x, h.y, 'flower', fs * 0.4);
  w.sound.play('boom', Math.min(1, 0.4 + h.mass * 0.3));
}

export const blackhole: Material = {
  id: 'blackhole',
  accent: 'spark',
  // the letters are free: this material moves and turns them itself, including the pull home
  spring: { k: 0, c: 0, rk: 0, rc: 0, sk: 170, sc: 11, limit: 99, lift: LIFT, free: true },

  ambient(l, w, out) {
    out.r += Math.sin(w.t * 0.6 * w.speed + l.phase) * 0.01 * w.amb;
  },

  enter() { holes.length = 0; },

  reset(w) {
    holes.length = 0;
    for (const l of w.letters) { l.fade = 0; l.ox = l.oy = l.vx = l.vy = 0; l.rot = l.vr = 0; }
  },

  update(w, dt) {
    const p = w.p, fs = w.fs, M = tuneF(w.tune, 3);
    for (const h of holes) {
      h.spin += dt * (2 + h.mass);
      h.eaten = h.eaten.filter((l) => w.letters.includes(l));
      if (h.held) { h.x = p.x; h.y = p.y; h.mass = Math.min(3, h.mass + dt * 1.3); }
      else if (h.white < 0 && w.t - h.t0 > h.life) whiten(w, h);
    }
    for (let i = holes.length - 1; i >= 0; i--) if (holes[i].white >= 0 && w.t - holes[i].white > WHITE) holes.splice(i, 1);

    const owner = new Map<Letter, Hole>();
    for (const h of holes) for (const l of h.eaten) owner.set(l, h);
    const restY = w.baseline - LIFT * fs;

    for (const l of w.letters) {
      if (!l.glyph) continue;
      const inside = owner.get(l);
      if (inside) { // swallowed: carried along inside the hole, out of sight
        l.ox = inside.x - l.bx; l.oy = inside.y - restY;
        l.vx = l.vy = l.vr = 0; l.rot += dt * 8;
        l.fade = Math.min(1, l.fade + dt * 5);
        l.sxT = l.syT = 0.6;
        continue;
      }
      l.fade = Math.max(0, l.fade - dt * 4);
      const cx = l.bx + l.ox, cy = restY + l.oy;
      let ax = 0, ay = 0, caught = false;

      const pull = (h: Hole | null, x: number, y: number, m: number, hover: boolean) => {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
        const reach = fs * (0.5 + 0.45 * m);
        if (d > reach * 1.7) return;
        // inverse-square pull, softened at the centre, with a sideways part so letters orbit as they fall
        const a = ((hover ? 1.6 : 2.4) * fs * fs * fs * m * w.inten) / (d * d + 0.04 * fs * fs);
        const ux = dx / d, uy = dy / d;
        ax += (ux - uy * 0.8) * a; ay += (uy + ux * 0.8) * a;
        // spaghettification: stretched along the line to the hole
        const f = clamp(1 - d / (reach * 1.7), 0, 1);
        l.sxT += f * 0.5 * Math.abs(ux); l.syT += f * 0.5 * Math.abs(uy); l.skT += ux * uy * f * 0.9;
        l.heatT = Math.max(l.heatT, f * f * 0.7); // only letters really close take the colour of the disk
        if (!hover && d < reach) caught = true;
        if (h && !hover && d < fs * (0.09 + 0.05 * m) && !owner.has(l)) { owner.set(l, h); eat(w, h, l); }
      };
      for (const h of holes) if (h.white < 0) pull(h, h.x, h.y, h.mass * M, false);
      if (p.active && !p.down) pull(null, p.x, p.y, 0.4 * M, true);

      if (!caught) { // free of every hole: a spring brings it home and upright
        ax += -55 * l.ox - 10 * l.vx; ay += -55 * l.oy - 10 * l.vy;
        l.rot = Math.atan2(Math.sin(l.rot), Math.cos(l.rot));
        l.vr += (-45 * l.rot - 8 * l.vr) * dt;
      } else { // in orbit: no way home, a little drag so the orbit decays inward
        ax -= l.vx * 1.1; ay -= l.vy * 1.1;
        l.vr += 2.5 * dt;
      }
      l.vx += ax * dt; l.vy += ay * dt;
      const v = Math.hypot(l.vx, l.vy), vmax = fs * 12;
      if (v > vmax) { l.vx *= vmax / v; l.vy *= vmax / v; }
      l.ox += l.vx * dt; l.oy += l.vy * dt; l.rot += l.vr * dt;
    }
  },

  down(w) {
    const p = w.p;
    holes.push({ x: p.x, y: p.y, mass: 0.6, t0: w.t, life: Infinity, eaten: [], white: -1, held: true, spin: 0 });
    w.sound.play('pulse', 0.5);
  },

  up(w, _hit, click) {
    const h = holes.find((x) => x.held);
    if (!h) return;
    h.held = false;
    if (!click) { whiten(w, h); return; } // let go of a hole you grew: it spits everything out
    // a click leaves the hole behind for a few seconds
    h.mass = Math.max(1, h.mass); h.t0 = w.t; h.life = 3.2 + h.mass;
    const live = holes.filter((x) => x.white < 0 && !x.held);
    if (live.length > MAX_HOLES) whiten(w, live[0]);
  },

  /** The holes, over the letters: a glow, the far half of the disk, the dark core, then the near half. */
  front(ctx, w, colors) {
    const fs = w.fs;
    for (const h of holes) {
      const wt = h.white >= 0 ? clamp((w.t - h.white) / WHITE, 0, 1) : 0;
      if (wt > 0) {
        ctx.fillStyle = css(colors.spark, (1 - wt) * 0.6);
        ctx.beginPath(); ctx.arc(h.x, h.y, fs * (0.1 + wt * 0.9), 0, TAU); ctx.fill();
      }
      const grow = h.held ? 1 : clamp((w.t - h.t0) / 0.25, 0, 1);
      const core = fs * (0.06 + 0.035 * h.mass) * grow * (1 - wt);
      if (core < 0.5) continue;
      const g = ctx.createRadialGradient(h.x, h.y, core * 0.8, h.x, h.y, core * 4);
      g.addColorStop(0, css(colors.flower, 0.35)); g.addColorStop(1, css(colors.flower, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(h.x, h.y, core * 4, 0, TAU); ctx.fill();
      const disk = (from: number, to: number) => {
        for (let k = 0; k < 3; k++) {
          ctx.strokeStyle = css(k ? colors.spark : colors.flower, 0.85 - k * 0.25);
          ctx.lineWidth = core * (0.28 - k * 0.06);
          ctx.setLineDash([core * 0.9, core * 0.35]);
          ctx.lineDashOffset = -h.spin * core * 3 * (1 + k * 0.3);
          ctx.beginPath(); ctx.ellipse(h.x, h.y, core * (2.1 + k * 0.45), core * (0.55 + k * 0.12), -0.25, from, to); ctx.stroke();
        }
        ctx.setLineDash([]);
      };
      disk(Math.PI, TAU);
      ctx.fillStyle = css(mix(colors.bg, [0, 0, 0], 0.85));
      ctx.beginPath(); ctx.arc(h.x, h.y, core, 0, TAU); ctx.fill();
      ctx.strokeStyle = css(colors.spark, 0.9);
      ctx.lineWidth = Math.max(1, core * 0.08);
      ctx.beginPath(); ctx.arc(h.x, h.y, core * 1.08, 0, TAU); ctx.stroke();
      disk(0, Math.PI);
    }
  },
};

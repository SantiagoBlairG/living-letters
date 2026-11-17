import type { Letter, Material, World } from '../types';
import { calm, clamp } from '../simulation';
import { css } from '../color';

/**
 * Glass. Attention cracks a letter from the point you touch; a click breaks it into shards that fly,
 * fall and bounce, then fly back and lock into place. Holding charges a blast that takes out the neighbours too.
 */

const LIFT = 0.3;
const TAU = Math.PI * 2;

interface Shard {
  poly: number[]; // polygon in the letter's local px; the glyph is clipped to it
  cx: number; cy: number; // pivot for its spin
  dx: number; dy: number; r: number; // current displacement
  vx: number; vy: number; vr: number;
  lag: number; // a little stagger, so they do not all come home at once
  home: boolean;
}
interface Shatter { t0: number; fly: number; shards: Shard[] }
interface Crack { x: number; y: number; rays: number[][]; stress: number }

const shattered = new Map<Letter, Shatter>();
const cracks = new Map<Letter, Crack>();
let charge = 0;
let shake = 0;

/** World point → the letter's local px (the space its glyph is drawn in). */
function toLocal(l: Letter, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = l.m;
  const det = a * d - b * c || 1;
  return [(d * (x - e) - c * (y - f)) / det, (-b * (x - e) + a * (y - f)) / det];
}

/** The ink box in local px. */
function box(w: World, l: Letter): [number, number, number, number] {
  const g = l.glyph!.box, fs = w.fs, lift = LIFT * fs;
  return [g[0] * fs - l.adv / 2, g[1] * fs + lift, g[2] * fs - l.adv / 2, g[3] * fs + lift];
}

function prune(w: World) {
  for (const k of shattered.keys()) if (!w.letters.includes(k)) shattered.delete(k);
  for (const k of cracks.keys()) if (!w.letters.includes(k)) cracks.delete(k);
}

function makeCrack(w: World, l: Letter, x: number, y: number): Crack {
  const fs = w.fs;
  const n = 5 + ((Math.random() * 3) | 0);
  const off = Math.random() * TAU;
  const rays: number[][] = [];
  for (let i = 0; i < n; i++) {
    let a = off + ((i + (Math.random() - 0.5) * 0.7) * TAU) / n;
    let px = x, py = y;
    const pts = [px, py];
    for (let s = 0; s < 4; s++) {
      a += (Math.random() - 0.5) * 0.9;
      const len = fs * (0.05 + Math.random() * 0.07);
      px += Math.cos(a) * len; py += Math.sin(a) * len;
      pts.push(px, py);
    }
    rays.push(pts);
  }
  const c = { x, y, rays, stress: 0 };
  cracks.set(l, c);
  return c;
}

/**
 * Breaks a letter around a local point. Shards are wedges fanned around that point, each split once more
 * along its length: the glyph is clipped to every wedge, so the pieces fit back together exactly.
 * (bx, by) is an extra push in world space, e.g. away from a blast.
 */
function shatter(w: World, l: Letter, ix: number, iy: number, power: number, bx = 0, by = 0) {
  if (!l.glyph) return;
  const fs = w.fs;
  const existing = shattered.get(l);
  if (existing) { // already in pieces: kick them again
    for (const sh of existing.shards) {
      const dx = sh.cx + sh.dx - ix, dy = sh.cy + sh.dy - iy;
      const d = Math.hypot(dx, dy) || 1;
      sh.vx += (dx / d) * fs * 1.6 * power + bx; sh.vy += (dy / d) * fs * 1.6 * power - fs * 0.8 * power + by;
      sh.vr += (Math.random() - 0.5) * 8 * power;
      sh.home = false;
    }
    existing.t0 = w.t;
    return;
  }
  const [x0, y0, x1, y1] = box(w, l);
  const px = clamp(ix, x0, x1), py = clamp(iy, y0, y1);
  const n = 7 + ((Math.random() * 3) | 0);
  const off = Math.random() * TAU;
  const angles: number[] = [];
  for (let i = 0; i < n; i++) angles.push(off + ((i + (Math.random() - 0.5) * 0.6) * TAU) / n);
  const R = fs * 2.2; // far enough to cover the glyph; the clip does the rest
  const exit = (dx: number, dy: number) => Math.min(
    dx > 0 ? (x1 - px) / dx : dx < 0 ? (x0 - px) / dx : Infinity,
    dy > 0 ? (y1 - py) / dy : dy < 0 ? (y0 - py) / dy : Infinity,
  );
  const shards: Shard[] = [];
  const add = (poly: number[], cx: number, cy: number, ux: number, uy: number, kick: number) => {
    const sp = fs * (1.1 + Math.random() * 2.1) * power * kick;
    shards.push({
      poly, cx, cy, dx: 0, dy: 0, r: 0, home: false,
      vx: ux * sp + bx, vy: uy * sp - fs * 1.1 * power + by,
      vr: (Math.random() - 0.5) * 11 * power,
      lag: Math.random() * 0.25,
    });
  };
  for (let i = 0; i < n; i++) {
    const a1 = angles[i], a2 = i === n - 1 ? angles[0] + TAU : angles[i + 1];
    const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
    const am = (a1 + a2) / 2, um = Math.cos(am), vm = Math.sin(am);
    const r1 = fs * (0.1 + Math.random() * 0.2);
    const edge = Math.max(r1, exit(um, vm));
    add([px, py, px + c1 * r1, py + s1 * r1, px + c2 * r1, py + s2 * r1], px + um * r1 * 0.6, py + vm * r1 * 0.6, um, vm, 0.55);
    add([px + c1 * r1, py + s1 * r1, px + c1 * R, py + s1 * R, px + c2 * R, py + s2 * R, px + c2 * r1, py + s2 * r1],
      px + um * (r1 + edge) / 2, py + vm * (r1 + edge) / 2, um, vm, 1);
  }
  shattered.set(l, { t0: w.t, fly: 0.85 + power * 0.45, shards });
  cracks.delete(l);
  const [wx, wy] = [l.m[0] * px + l.m[2] * py + l.m[4], l.m[1] * px + l.m[3] * py + l.m[5]];
  w.fx.burst(wx, wy, 'flower', fs * 0.25);
  w.sound.play('shatter', power);
}

/** A blast: shatters what it reaches, shoves the rest, shakes the stage. */
function blast(w: World, x: number, y: number, power: number) {
  const fs = w.fs;
  const R = fs * (0.5 + power * 2);
  for (const l of w.letters) {
    if (!l.glyph) continue;
    const dx = w.cx(l) - x, dy = w.cy(l) - y;
    const d = Math.hypot(dx, dy) || 1;
    const f = 1 - d / R;
    if (f > 0) {
      const [ix, iy] = toLocal(l, x, y);
      const push = fs * 2.2 * power * f;
      shatter(w, l, ix, iy, power * (0.55 + f * 0.6), (dx / d) * push, (dy / d) * push);
    } else if (d < R * 1.8) {
      const q = (1 - d / (R * 1.8)) * power;
      l.vx += (dx / d) * fs * 2 * q; l.vy += (dy / d) * fs * 2 * q; l.vr += (Math.random() - 0.5) * 2 * q;
    }
  }
  shake = Math.max(shake, power);
  w.fx.pulse(x, y, 'flower', R);
  w.fx.burst(x, y, 'spark', fs * 0.4);
  w.sound.play('boom', power);
}

export const explode: Material = {
  id: 'explode',
  accent: 'flower',
  spring: { k: 120, c: 12, rk: 100, rc: 10, sk: 200, sc: 14, limit: 0.4, lift: LIFT },

  ambient(_l, w, out) {
    if (shake < 0.01) return;
    out.x += (Math.random() - 0.5) * shake * w.fs * 0.05;
    out.y += (Math.random() - 0.5) * shake * w.fs * 0.05;
  },

  enter() { shattered.clear(); cracks.clear(); charge = 0; shake = 0; },

  reset(w) { shattered.clear(); cracks.clear(); charge = 0; shake = 0; calm(w.letters); },

  update(w, dt) {
    const p = w.p, fs = w.fs;
    if (shattered.size || cracks.size) prune(w);
    shake *= Math.exp(-dt * 6);

    // holding charges a blast; letters inside its reach start to tremble
    if (p.down) charge = Math.min(1, charge + dt / 1.1);
    const reach = fs * (0.5 + charge * 2);

    for (const l of w.letters) {
      if (!l.glyph || shattered.has(l)) continue;
      if (p.down && charge > 0.15) {
        const d = Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y);
        if (d < reach) {
          const q = charge * (1 - d / reach);
          l.tx += (Math.random() - 0.5) * fs * 0.03 * q; l.ty += (Math.random() - 0.5) * fs * 0.03 * q;
          l.heatT = Math.max(l.heatT, q);
        }
      }
      // hovering stresses the letter: cracks spread from where you are, and at the limit it gives
      let c = cracks.get(l);
      let gain = 0;
      if (p.active && !p.down) {
        const R = fs * 0.45;
        const d = Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y);
        if (d < R) gain = 1 - d / R;
      }
      if (gain > 0) {
        if (!c) {
          const [ix, iy] = toLocal(l, p.x, p.y);
          const [x0, y0, x1, y1] = box(w, l);
          c = makeCrack(w, l, clamp(ix, x0, x1), clamp(iy, y0, y1));
        }
        const before = c.stress;
        c.stress += dt * gain * (0.25 + 0.45 * w.inten);
        if (Math.floor(before * 5) !== Math.floor(c.stress * 5)) w.sound.play('crack', c.stress);
        if (c.stress >= 1) { shatter(w, l, c.x, c.y, 0.8); continue; }
      } else if (c) {
        c.stress -= dt * 0.12;
        if (c.stress <= 0) { cracks.delete(l); c = undefined; }
      }
      if (c) {
        l.tx += (Math.random() - 0.5) * fs * 0.012 * c.stress;
        l.heatT = Math.max(l.heatT, c.stress * 0.7);
      }
    }

    // the shards: fly, fall, bounce on the floor — then home
    const G = fs * 7;
    for (const [l, s] of shattered) {
      const age = w.t - s.t0;
      let settled = true;
      for (const sh of s.shards) {
        if (age < s.fly + sh.lag) {
          sh.vy += G * dt;
          sh.vx *= 1 - 0.5 * dt; sh.vr *= 1 - 0.7 * dt;
          sh.dx += sh.vx * dt; sh.dy += sh.vy * dt; sh.r += sh.vr * dt;
          const wy = l.m[5] + sh.cy + sh.dy;
          if (wy > w.H - 8 && sh.vy > 0) { sh.vy *= -0.35; sh.vx *= 0.6; sh.vr *= 0.6; }
          settled = false;
        } else {
          if (!sh.home) { sh.home = true; sh.r = Math.atan2(Math.sin(sh.r), Math.cos(sh.r)); }
          const k = 60, c = 12;
          sh.vx += (-k * sh.dx - c * sh.vx) * dt; sh.vy += (-k * sh.dy - c * sh.vy) * dt;
          sh.vr += (-k * sh.r - c * sh.vr) * dt;
          sh.dx += sh.vx * dt; sh.dy += sh.vy * dt; sh.r += sh.vr * dt;
          if (Math.abs(sh.dx) + Math.abs(sh.dy) > 0.6 || Math.abs(sh.r) > 0.01) settled = false;
        }
      }
      if (settled || age > s.fly + 4) {
        shattered.delete(l);
        l.vsy += 1.4; l.vsx -= 0.9; // a little click as it locks back together
        w.sound.play('press');
      }
    }
  },

  down() { charge = 0; },

  up(w, hit, click) {
    const p = w.p, power = charge;
    charge = 0;
    if (power > 0.45) { blast(w, p.x, p.y, power); return; }
    if (!click) return;
    if (hit && hit.glyph) {
      const [ix, iy] = toLocal(hit, p.x, p.y);
      shatter(w, hit, ix, iy, w.inten);
      return;
    }
    // empty stage: a small shockwave
    const fs = w.fs, R = fs * 1.1;
    for (const l of w.letters) {
      const dx = w.cx(l) - p.x, dy = w.cy(l) - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 1.5) * w.inten;
      l.vx += (dx / d) * fs * 1.8 * f; l.vy += (dy / d) * fs * 1.8 * f;
    }
    shake = Math.max(shake, 0.25 * w.inten);
    w.fx.ring(p.x, p.y, 'flower', fs * 0.4);
    w.sound.play('boom', 0.35);
  },

  /** While charging: the reach of the blast, under the letters. */
  back(ctx, w, colors) {
    const p = w.p;
    if (!p.down || charge < 0.15) return;
    const r = w.fs * (0.5 + charge * 2);
    const a = Math.min(1, (charge - 0.15) * 3);
    ctx.fillStyle = css(colors.flower, 0.06 * a);
    ctx.strokeStyle = css(colors.flower, 0.45 * a);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -w.t * 40;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  },

  drawLetter(ctx, l, _w, colors, liftPx) {
    const s = shattered.get(l);
    if (s) {
      for (const sh of s.shards) {
        ctx.save();
        ctx.translate(sh.cx + sh.dx, sh.cy + sh.dy);
        ctx.rotate(sh.r);
        ctx.translate(-sh.cx, -sh.cy);
        const q = sh.poly;
        ctx.beginPath(); ctx.moveTo(q[0], q[1]);
        for (let i = 2; i < q.length; i += 2) ctx.lineTo(q[i], q[i + 1]);
        ctx.closePath();
        ctx.clip();
        ctx.fillText(l.ch, -l.adv / 2, liftPx);
        ctx.restore();
      }
      return true;
    }
    ctx.fillText(l.ch, -l.adv / 2, liftPx);
    const c = cracks.get(l);
    if (c && c.stress > 0.02) {
      // cut in the background colour and kept inside this letter's ink box, so they never mark a neighbour
      const [x0, y0, x1, y1] = box(_w, l);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      ctx.strokeStyle = css(colors.bg);
      ctx.lineWidth = Math.max(1, _w.fs * 0.009);
      ctx.lineJoin = 'round';
      c.rays.forEach((pts, i) => {
        const show = clamp(c.stress * 1.7 - i * 0.08, 0, 1) * (pts.length / 2 - 1);
        if (show <= 0) return;
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
        const full = Math.floor(show);
        for (let s = 1; s <= full; s++) ctx.lineTo(pts[s * 2], pts[s * 2 + 1]);
        const f = show - full;
        if (f > 0 && full + 1 < pts.length / 2) {
          const ax = pts[full * 2], ay = pts[full * 2 + 1];
          ctx.lineTo(ax + (pts[full * 2 + 2] - ax) * f, ay + (pts[full * 2 + 3] - ay) * f);
        }
        ctx.stroke();
      });
      ctx.restore();
    }
    return true;
  },
};

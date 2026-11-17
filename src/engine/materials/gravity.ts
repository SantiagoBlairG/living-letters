import type { Letter, Material, World } from '../types';
import { clamp, tuneF } from '../simulation';

/**
 * Weight. Nothing holds the letters in place: each one is a rigid box, the size of its own ink,
 * that falls, lands on a corner, topples, and piles up against the others and the edges of the stage.
 */

const LIFT = 0.3; // pivot height in em — must match World.cy()
const FRICTION = 0.55;
const POINTER_R = 20;

interface Body {
  l: Letter;
  x: number; y: number; a: number; // centre of the ink box, world px, and rotation
  c: number; s: number;
  hw: number; hh: number; // half extents, px
  ox: number; oy: number; // ink centre relative to the pivot, local px
  im: number; ii: number; // inverse mass and inverse inertia (0 while held)
  rest: number; // corners resting on a wall this frame
}

let dir = 1; // 1 falls down, -1 falls up
let holdUntil = 0; // after a reset the word stands still for a moment before it drops
let grabX = 0, grabY = 0; // where on the letter it was picked up, relative to its centre
let impact = 0;

function body(w: World, l: Letter, held: boolean): Body {
  const fs = w.fs;
  const [x0, y0, x1, y1] = l.glyph!.box;
  const hw = Math.max(0.05, (x1 - x0) / 2) * fs, hh = Math.max(0.05, (y1 - y0) / 2) * fs;
  const ox = ((x0 + x1) / 2) * fs - l.adv / 2, oy = ((y0 + y1) / 2 + LIFT) * fs;
  const c = Math.cos(l.rot), s = Math.sin(l.rot);
  const m = (hw * hh * 4) / (fs * fs) + 0.05;
  return {
    l, a: l.rot, c, s, hw, hh, ox, oy, rest: 0,
    x: w.cx(l) + c * ox - s * oy, y: w.cy(l) + s * ox + c * oy,
    im: held ? 0 : 1 / m, ii: held ? 0 : 3 / (m * (hw * hw + hh * hh)),
  };
}

function store(w: World, b: Body) {
  const l = b.l;
  const c = Math.cos(b.a), s = Math.sin(b.a);
  l.rot = b.a;
  l.ox = b.x - (c * b.ox - s * b.oy) - l.bx;
  l.oy = b.y - (s * b.ox + c * b.oy) - (w.baseline - LIFT * w.fs);
}

/** One impulse at a contact point `r` (relative to the centre) against something immovable. */
function hitStatic(b: Body, rx: number, ry: number, nx: number, ny: number, e: number, quiet: number) {
  const l = b.l;
  const vn = (l.vx - l.vr * ry) * nx + (l.vy + l.vr * rx) * ny;
  if (vn >= 0) return;
  const rn = rx * ny - ry * nx;
  const j = (-(1 + (vn < -quiet ? e : 0)) * vn) / (b.im + rn * rn * b.ii);
  l.vx += j * nx * b.im; l.vy += j * ny * b.im; l.vr += rn * j * b.ii;
  if (-vn > impact) impact = -vn;
  // friction along the surface
  const tx = -ny, ty = nx;
  const vt = (l.vx - l.vr * ry) * tx + (l.vy + l.vr * rx) * ty;
  const rt = rx * ty - ry * tx;
  const jt = clamp(-vt / (b.im + rt * rt * b.ii), -FRICTION * j, FRICTION * j);
  l.vx += jt * tx * b.im; l.vy += jt * ty * b.im; l.vr += rt * jt * b.ii;
}

/** Keeps a body on the inner side of the line n·p = d. */
function wall(b: Body, nx: number, ny: number, d: number, e: number, quiet: number) {
  if (!b.im) return;
  let deep = 0;
  for (let i = 0; i < 4; i++) {
    const lx = i & 1 ? b.hw : -b.hw, ly = i & 2 ? b.hh : -b.hh;
    const rx = b.c * lx - b.s * ly, ry = b.s * lx + b.c * ly;
    const pen = d - ((b.x + rx) * nx + (b.y + ry) * ny);
    if (pen <= -0.5) continue;
    b.rest++;
    if (pen <= 0) continue;
    if (pen > deep) deep = pen;
    hitStatic(b, rx, ry, nx, ny, e, quiet);
  }
  b.x += nx * deep; b.y += ny * deep;
}

/** Box against box: separating axes for the overlap, shared corners for the point of contact. */
function collide(A: Body, B: Body, e: number, quiet: number) {
  if (!A.im && !B.im) return;
  const dx = B.x - A.x, dy = B.y - A.y;
  const reach = Math.hypot(A.hw, A.hh) + Math.hypot(B.hw, B.hh);
  if (dx * dx + dy * dy > reach * reach) return;
  let min = Infinity, nx = 0, ny = 0;
  for (let i = 0; i < 4; i++) {
    const src = i < 2 ? A : B;
    const ax = i & 1 ? -src.s : src.c, ay = i & 1 ? src.c : src.s;
    const ra = A.hw * Math.abs(ax * A.c + ay * A.s) + A.hh * Math.abs(-ax * A.s + ay * A.c);
    const rb = B.hw * Math.abs(ax * B.c + ay * B.s) + B.hh * Math.abs(-ax * B.s + ay * B.c);
    const dist = dx * ax + dy * ay;
    const ov = ra + rb - Math.abs(dist);
    if (ov <= 0) return;
    if (ov < min) { min = ov; const sg = dist < 0 ? -1 : 1; nx = ax * sg; ny = ay * sg; }
  }
  // contact point: the corners of each box that sit inside the other
  let px = 0, py = 0, n = 0;
  for (let k = 0; k < 2; k++) {
    const P = k ? B : A, Q = k ? A : B;
    for (let i = 0; i < 4; i++) {
      const lx = i & 1 ? P.hw : -P.hw, ly = i & 2 ? P.hh : -P.hh;
      const wx = P.x + P.c * lx - P.s * ly, wy = P.y + P.s * lx + P.c * ly;
      const qx = wx - Q.x, qy = wy - Q.y;
      if (Math.abs(Q.c * qx + Q.s * qy) <= Q.hw + 1.5 && Math.abs(-Q.s * qx + Q.c * qy) <= Q.hh + 1.5) { px += wx; py += wy; n++; }
    }
  }
  if (n) { px /= n; py /= n; } else { px = (A.x + B.x) / 2; py = (A.y + B.y) / 2; }

  const im = A.im + B.im;
  const push = Math.max(0, min - 0.5) * 0.7 / im;
  A.x -= nx * push * A.im; A.y -= ny * push * A.im;
  B.x += nx * push * B.im; B.y += ny * push * B.im;

  const a = A.l, b = B.l;
  const rax = px - A.x, ray = py - A.y, rbx = px - B.x, rby = py - B.y;
  const rel = (tx: number, ty: number) =>
    (b.vx - b.vr * rby - a.vx + a.vr * ray) * tx + (b.vy + b.vr * rbx - a.vy - a.vr * rax) * ty;
  const apply = (j: number, tx: number, ty: number) => {
    a.vx -= j * tx * A.im; a.vy -= j * ty * A.im; a.vr -= (rax * ty - ray * tx) * j * A.ii;
    b.vx += j * tx * B.im; b.vy += j * ty * B.im; b.vr += (rbx * ty - rby * tx) * j * B.ii;
  };
  const k = (tx: number, ty: number) => {
    const ca = rax * ty - ray * tx, cb = rbx * ty - rby * tx;
    return im + ca * ca * A.ii + cb * cb * B.ii;
  };
  const vn = rel(nx, ny);
  if (vn >= 0) return;
  const j = (-(1 + (vn < -quiet ? e : 0)) * vn) / k(nx, ny);
  apply(j, nx, ny);
  if (-vn > impact) impact = -vn;
  const tx = -ny, ty = nx;
  apply(clamp(-rel(tx, ty) / k(tx, ty), -FRICTION * j, FRICTION * j), tx, ty);
}

/** The pointer is a small solid ball: it shoves whatever it runs into and blocks what leans on it. */
function shove(w: World, b: Body) {
  const p = w.p, l = b.l;
  const dx = p.x - b.x, dy = p.y - b.y;
  const lx = b.c * dx + b.s * dy, ly = -b.s * dx + b.c * dy;
  const qx = clamp(lx, -b.hw, b.hw), qy = clamp(ly, -b.hh, b.hh);
  let ex = lx - qx, ey = ly - qy;
  const d = Math.hypot(ex, ey);
  if (d > POINTER_R) return;
  let pen: number;
  if (d > 0.001) { ex /= -d; ey /= -d; pen = POINTER_R - d; } // outside: push the box away from the ball
  else { // inside: out through the nearest face
    const fx = b.hw - Math.abs(lx), fy = b.hh - Math.abs(ly);
    if (fx < fy) { ex = lx > 0 ? -1 : 1; ey = 0; pen = fx + POINTER_R; }
    else { ex = 0; ey = ly > 0 ? -1 : 1; pen = fy + POINTER_R; }
  }
  const nx = b.c * ex - b.s * ey, ny = b.s * ex + b.c * ey;
  const rx = b.c * qx - b.s * qy, ry = b.s * qx + b.c * qy;
  const cap = w.fs * 9;
  const pvx = clamp(p.vx, -cap, cap), pvy = clamp(p.vy, -cap, cap);
  const vn = (l.vx - l.vr * ry - pvx) * nx + (l.vy + l.vr * rx - pvy) * ny;
  const want = Math.min(pen * 10, w.fs * 2);
  if (vn >= want) return;
  const rn = rx * ny - ry * nx;
  const j = ((want - vn) / (b.im + rn * rn * b.ii)) * Math.min(1, 0.45 + w.inten * 0.5);
  l.vx += j * nx * b.im; l.vy += j * ny * b.im; l.vr += rn * j * b.ii;
  l.heatT = 0.7;
}

function home(w: World) {
  for (const l of w.letters) {
    l.ox = l.oy = l.vx = l.vy = 0; l.rot = l.vr = 0;
    l.sx = l.sy = 1; l.vsx = l.vsy = 0; l.sk = l.vsk = 0;
  }
}

export const gravity: Material = {
  id: 'gravity',
  accent: 'spark',
  // Position and rotation belong to the simulation below; the springs only drive squash and stretch.
  spring: { k: 0, c: 0, rk: 0, rc: 0, sk: 190, sc: 13, limit: 99, lift: LIFT, free: true },

  ambient() { /* weight has no idle motion */ },

  enter() { dir = 1; holdUntil = 0; },

  reset(w) { dir = 1; home(w); holdUntil = w.t + 0.55; },

  update(w, dt) {
    if (w.t < holdUntil) return;
    const p = w.p, fs = w.fs;
    const grab = p.grab;
    const bodies: Body[] = [];
    for (const l of w.letters) if (l.glyph) bodies.push(body(w, l, l === grab));
    if (!bodies.length) return;

    const G = fs * 9 * w.inten * dir * tuneF(w.tune, 4); // Weight
    const e = clamp(0.1 + 0.2 * w.amb, 0, 0.55); // Motion is bounciness
    const quiet = fs * 0.5; // slower contacts than this do not bounce, so piles settle
    const floor = w.H - (w.W < 1100 ? 52 : 0); // on small screens the sheet's handle covers the bottom edge
    const vmax = fs * 16;
    const steps = clamp(Math.ceil(dt * 240), 1, 8);
    const h = dt / steps;
    impact = 0;

    for (let n = 0; n < steps; n++) {
      for (const b of bodies) {
        const l = b.l;
        if (l === grab) {
          // held: chase the hand hard enough to feel attached, soft enough to keep momentum for the throw
          const tx = clamp(p.x + grabX, b.hw, w.W - b.hw), ty = clamp(p.y + grabY, b.hh, floor - b.hh);
          l.vx = (tx - b.x) * 22; l.vy = (ty - b.y) * 22;
          l.vr *= 1 - Math.min(1, 5 * h);
          l.heatT = 1;
        } else {
          l.vy += G * h;
          l.vx *= 1 - 0.12 * h; l.vy *= 1 - 0.12 * h; l.vr *= 1 - 0.5 * h;
          if (p.active) shove(w, b);
        }
        const v = Math.hypot(l.vx, l.vy);
        if (v > vmax) { l.vx *= vmax / v; l.vy *= vmax / v; }
        l.vr = clamp(l.vr, -18, 18);
        b.x += l.vx * h; b.y += l.vy * h; b.a += l.vr * h;
        b.c = Math.cos(b.a); b.s = Math.sin(b.a);
      }
      for (let it = 0; it < 3; it++) {
        for (const b of bodies) {
          b.rest = 0;
          wall(b, 0, -1, -floor, e, quiet);
          wall(b, 0, 1, 0, e, quiet);
          wall(b, 1, 0, 0, e, quiet);
          wall(b, -1, 0, -w.W, e, quiet);
        }
        for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) collide(bodies[i], bodies[j], e, quiet);
      }
    }

    for (const b of bodies) {
      const l = b.l;
      // lying flat and barely moving: let it sleep instead of shivering
      if (b.im && b.rest >= 2 && Math.hypot(l.vx, l.vy) < fs * 0.035 && Math.abs(l.vr) < 0.08) l.vx = l.vy = l.vr = 0;
      store(w, b);
    }
    if (impact > fs * 1.6) w.sound.play('thud', impact / (fs * 6));
  },

  down(w, hit) {
    if (!hit || !hit.glyph) return;
    const b = body(w, hit, true);
    grabX = b.x - w.p.x; grabY = b.y - w.p.y;
    w.p.grab = hit;
    holdUntil = 0;
    w.sound.play('press');
  },

  up(w, _hit, click) {
    const p = w.p, fs = w.fs;
    const g = p.grab;
    p.grab = null;
    holdUntil = 0;
    if (!click) { if (g) w.sound.play('gust', Math.hypot(g.vx, g.vy) / (fs * 8)); return; }
    if (g) {
      // a tap on a letter kicks it against gravity
      g.vx = (Math.random() - 0.5) * fs * 1.6;
      g.vy = -dir * fs * 5.2 * Math.sqrt(w.inten);
      g.vr = (Math.random() - 0.5) * 9;
      g.vsy += 2.2; g.vsx -= 1.4;
      w.fx.ring(p.x, p.y, 'spark');
      w.sound.play('pop', w.inten);
      return;
    }
    // anywhere else: the world turns over
    dir = -dir;
    for (const l of w.letters) { l.vr += (Math.random() - 0.5) * 2.4; l.vy += dir * fs * 0.4; }
    w.fx.pulse(p.x, p.y, 'spark', Math.max(180, fs * 0.9));
    w.sound.play('flip', w.inten);
  },
};

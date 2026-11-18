import type { Letter, Material, World } from '../types';
import { clamp, tuneF } from '../simulation';
/**
 * Gravity at its most extreme. The pointer is a small black hole that bends letters toward it.
 * A click leaves a hole behind whose reach keeps growing: one by one, nearest first, every letter is
 * caught, falls into orbit in the plane of the disk, is stretched into a strand pointing at the centre
 * (spaghettification) and swallowed. Holding grows a hole under the hand; at full size it starts to eat
 * the interface too. When a hole has eaten everything — or you let go — it turns into a white hole and
 * throws it all back out.
 */

const LIFT = 0.3;
const TAU = Math.PI * 2;
const WHITE = 0.7; // seconds a white hole lasts
const MAX_MASS = 3;

interface Hole {
  x: number; y: number;
  mass: number;
  t0: number;
  eaten: Letter[];
  white: number; // when it turned white; -1 while it still pulls
  held: boolean; // following the hand while pressed
  spin: number;
  full: number; // when a held hole reached full size; -1 before
  devoured: boolean; // has it started eating the interface
  quiet: number; // last time it caught or swallowed something
  size: number; vs: number; // drawn radius (px) and its rate of change: a damped spring toward the target
}

/** A letter on its way in: a decaying orbit, flattened into the plane of the disk. */
interface Fall {
  h: Hole; t0: number; dur: number; r0: number; a0: number; dir: number; rot0: number;
  s: number; // how far the stretching has gone, 0..1
  d: number; // current distance from the letter's pivot to the centre of the hole, px
  q: number; // how far along the fall, 0..1
}

const FALL = 1.9; // seconds every fall takes, so letters arrive in the order they were caught, never on top of each other
const fadeIn = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const STRIPS = 36;

/**
 * Draws a falling letter in thin strips across its length (its local y axis already points at the hole).
 * Strips nearer the hole are pulled further and squeezed thinner, so the letter becomes a tapering strand
 * whose tip runs into the shadow — the part that has gone in gets long and small, as tidal forces do.
 */
function strand(ctx: CanvasRenderingContext2D, l: Letter, f: Fall, fs: number, liftPx: number) {
  const g = l.glyph!.box;
  const yt = g[1] * fs + liftPx, yb = g[3] * fs + liftPx; // far end, near end (local px)
  const s = f.s;
  const top = yt * (1 - 0.55 * s); // the far end is drawn in a little
  const tip = yb + (Math.max(f.d, yb) - yb) * s; // the near end reaches toward the centre of the hole
  const len = Math.max(2, tip - top);
  const k = 2.2 * s; // how much more the near part is stretched than the far part
  const map = (v: number) => top + (len * (v + k * v * v)) / (1 + k);
  const thin = Math.max(0.12, Math.min(1, f.d / (fs * 0.6))); // and the whole strand narrows as it goes in
  const whole = 1 - fadeIn(0.55, 1, f.q);
  if (whole < 0.01) return;

  // The strips are drawn solid on a layer of their own (so the seams between them never show), then the
  // layer is faded along the strand with one smooth gradient — the tip first, as it reaches the light
  // around the hole — and laid onto the stage, the whole of it fading as the fall ends.
  const c = ctx.canvas;
  if (!layer) layer = document.createElement('canvas');
  if (layer.width !== c.width || layer.height !== c.height) { layer.width = c.width; layer.height = c.height; }
  // only the patch of the layer the strand covers is cleared, faded and copied
  const m = ctx.getTransform();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of [[-fs, top - 2], [fs, top - 2], [-fs, top + len + 2], [fs, top + len + 2]]) {
    const X = m.a * px + m.c * py + m.e, Y = m.b * px + m.d * py + m.f;
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  const bx = Math.max(0, Math.floor(x0)), by = Math.max(0, Math.floor(y0));
  const bw = Math.min(c.width, Math.ceil(x1)) - bx, bh = Math.min(c.height, Math.ceil(y1)) - by;
  if (bw <= 0 || bh <= 0) return;
  const g2 = layer.getContext('2d')!;
  g2.setTransform(1, 0, 0, 1, 0, 0);
  g2.globalCompositeOperation = 'source-over';
  g2.clearRect(bx, by, bw, bh);
  g2.setTransform(m);
  g2.font = ctx.font; g2.textBaseline = ctx.textBaseline; g2.fillStyle = ctx.fillStyle;
  for (let i = 0; i < STRIPS; i++) {
    const v0 = i / STRIPS, v1 = (i + 1) / STRIPS, vm = (v0 + v1) / 2;
    const a = yt + (yb - yt) * v0, b = yt + (yb - yt) * v1;
    const a2 = map(v0), b2 = map(v1);
    const sy = (b2 - a2) / (b - a);
    const sx = (1 - 0.3 * s) * (1 - vm * 0.9 * s) * (s > 0 ? thin : 1);
    g2.save();
    g2.translate(0, a2 - a * sy);
    g2.scale(sx, sy);
    g2.beginPath(); g2.rect(-fs * 2, a - 0.6 / sy, fs * 4, b - a + 1.2 / sy); g2.clip();
    g2.fillText(l.ch, -l.adv / 2, liftPx);
    g2.restore();
  }
  const mid = clamp((map(0.35) - top) / len, 0, 0.99);
  const gr = g2.createLinearGradient(0, top, 0, top + len);
  gr.addColorStop(0, 'rgba(0,0,0,1)');
  gr.addColorStop(mid, 'rgba(0,0,0,1)');
  gr.addColorStop(1, `rgba(0,0,0,${1 - 0.95 * s})`);
  g2.globalCompositeOperation = 'destination-in';
  g2.fillStyle = gr;
  g2.fillRect(-fs * 3, top - fs, fs * 6, len + fs * 2);
  g2.globalCompositeOperation = 'source-over';

  const a0 = ctx.globalAlpha;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = a0 * whole;
  ctx.drawImage(layer, bx, by, bw, bh, bx, by, bw, bh);
  ctx.restore();
}
let layer: HTMLCanvasElement | null = null;

const holes: Hole[] = [];
/** True while a hole is open: the stage hides its text caret then, which looks odd pulsing next to it. */
export const holeActive = () => holes.length > 0;
const falls = new Map<Letter, Fall>();

const angleTo = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** How far a hole reaches. A placed hole's reach keeps growing until it has the whole word. */
function reach(w: World, h: Hole, M: number) {
  const fs = w.fs;
  if (h.held) return fs * (0.25 + 0.5 * h.mass * M) * (h.devoured ? 4 : 1);
  return fs * (0.35 + (w.t - h.t0) * 1.1 * M);
}

function whiten(w: World, h: Hole) {
  if (h.white >= 0) return;
  h.white = w.t;
  const fs = w.fs;
  const out = (l: Letter) => {
    const a = Math.random() * TAU, sp = fs * (2.5 + Math.random() * 2.5);
    l.vx = Math.cos(a) * sp; l.vy = Math.sin(a) * sp; l.vr = (Math.random() - 0.5) * 14;
  };
  h.eaten.forEach(out);
  for (const [l, f] of falls) if (f.h === h) { out(l); falls.delete(l); }
  h.eaten = [];
  w.fx.pulse(h.x, h.y, 'spark', fs * (0.7 + 0.3 * h.mass));
  w.fx.burst(h.x, h.y, 'flower', fs * 0.45);
  w.sound.play('boom', Math.min(1, 0.4 + h.mass * 0.3));
  if (h.devoured) w.devour(null);
}

/* ---------- drawing: built from streaks of light, after the reference render ---------- */

const HOT = '255,244,224', AMBER = '255,186,92', ORANGE = '255,118,40', RED = '196,52,16';
const COLS = [HOT, AMBER, ORANGE, RED];
const TILT = -0.38; // the disk rises to the right
/** Stable pseudo-random numbers, so each streak keeps its own look from frame to frame. */
const rnd = (i: number, k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

/**
 * One family of streaks: concentric ellipses (inner ones hotter and brighter), each drawn as long dashes
 * that slide along it — the inner ones faster, as in a real orbit — so the light visibly streams round.
 */
function streaks(
  ctx: CanvasRenderingContext2D, R: number, t: number, n: number, r0: number, r1: number,
  flat: number, from: number, to: number, bright: number, seed: number,
) {
  for (let i = 0; i < n; i++) {
    const u = (i + rnd(i, seed) * 0.8) / n; // 0 inner … 1 outer
    const r = R * (r0 + (r1 - r0) * u);
    const c = COLS[Math.min(3, Math.floor(u * 2.6 + rnd(i, seed + 1) * 0.9))];
    const a = bright * (1 - u * 0.6) * (0.45 + 0.55 * rnd(i, seed + 2));
    ctx.strokeStyle = `rgba(${c},${a.toFixed(3)})`;
    ctx.lineWidth = Math.max(0.6, R * (0.012 + 0.03 * rnd(i, seed + 3)));
    ctx.setLineDash([r * (1 + rnd(i, seed + 4) * 2.6), r * (0.02 + rnd(i, seed + 5) * 0.1)]);
    ctx.lineDashOffset = -t * R * (2.4 / Math.sqrt(r / R)) - rnd(i, seed + 6) * 1000;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * flat, 0, from, to); ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** A soft wide underlay for a family of streaks, so they glow instead of reading as wires. */
function haze(ctx: CanvasRenderingContext2D, R: number, r: number, flat: number, width: number, from: number, to: number, a: number) {
  ctx.strokeStyle = `rgba(${ORANGE},${a})`;
  ctx.lineWidth = R * width;
  ctx.beginPath(); ctx.ellipse(0, 0, R * r, R * r * flat, 0, from, to); ctx.stroke();
}

// the three families: the disk itself, the far side bent up over the top, and the faint ring under it
const DISK = { n: 28, r0: 1.35, r1: 4.3, flat: 0.085, bright: 0.9, seed: 1 };
const ARCH = { n: 36, r0: 1.1, r1: 2.15, flat: 0.95, bright: 1, seed: 2 };
const LOWER = { n: 18, r0: 1.08, r1: 1.75, flat: 0.92, bright: 0.6, seed: 3 };

function diskHalf(ctx: CanvasRenderingContext2D, R: number, t: number, near: boolean, op: GlobalCompositeOperation) {
  const L = R * DISK.r1 * 1.05;
  ctx.save();
  ctx.beginPath();
  if (near) ctx.rect(-L, 0, L * 2, L); else ctx.rect(-L, -L, L * 2, L);
  ctx.clip();
  ctx.globalCompositeOperation = op;
  haze(ctx, R, 2.6, DISK.flat * 1.2, 0.35, 0, TAU, 0.14);
  streaks(ctx, R, t, DISK.n, DISK.r0, DISK.r1, DISK.flat, 0, TAU, DISK.bright, DISK.seed);
  ctx.restore();
}

/**
 * The hole is drawn in two passes around the letters. Behind them: the bloom, the far half of the disk and
 * the black shadow — so a letter falling in is seen on top of the darkness, inside the hole. In front of
 * them: the halo — the ring beneath, the far side bent over the top, the photon ring and the near half of
 * the disk — so the letter passes under the light as it goes in, and again as it comes back out.
 * On dark backgrounds the light adds up; on light ones it is painted normally so it stays visible.
 */
function holeBack(ctx: CanvasRenderingContext2D, h: Hole, R: number, t: number, tw: number, dark: boolean) {
  const op: GlobalCompositeOperation = dark ? 'lighter' : 'source-over';
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.globalAlpha = tw;
  ctx.lineCap = 'round';
  ctx.save();
  ctx.rotate(TILT);
  ctx.scale(2, 1);
  const g = ctx.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 2.6);
  g.addColorStop(0, `rgba(${ORANGE},0.3)`); g.addColorStop(0.5, `rgba(${RED},0.08)`); g.addColorStop(1, `rgba(${RED},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R * 2.6, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.rotate(TILT);
  diskHalf(ctx, R, t, false, op);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
  ctx.restore();
}

function holeFront(ctx: CanvasRenderingContext2D, h: Hole, R: number, t: number, tw: number, dark: boolean) {
  const op: GlobalCompositeOperation = dark ? 'lighter' : 'source-over';
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.globalAlpha = tw;
  ctx.lineCap = 'round';
  ctx.rotate(TILT);
  ctx.globalCompositeOperation = op;
  // the ring of light under the shadow (the underside of the disk, lensed)
  haze(ctx, R, 1.4, LOWER.flat, 0.5, 0.05, Math.PI - 0.05, 0.12);
  streaks(ctx, R, -t * 0.8, LOWER.n, LOWER.r0, LOWER.r1, LOWER.flat, 0.05, Math.PI - 0.05, LOWER.bright, LOWER.seed);
  // the far side of the disk, bent up and over the top of the shadow
  haze(ctx, R, 1.6, ARCH.flat, 0.9, Math.PI, TAU, 0.16);
  streaks(ctx, R, t, ARCH.n, ARCH.r0, ARCH.r1, ARCH.flat, Math.PI, TAU, ARCH.bright, ARCH.seed);
  // the photon ring hugging the shadow
  ctx.strokeStyle = `rgba(${AMBER},0.85)`;
  ctx.lineWidth = Math.max(1, R * 0.016);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  // the near half of the disk crosses in front, hottest where it is closest to the hole on the left
  diskHalf(ctx, R, t, true, op);
  ctx.globalCompositeOperation = op;
  const hot = ctx.createRadialGradient(-R * 1.9, R * 0.04, 0, -R * 1.9, R * 0.04, R * 1.1);
  hot.addColorStop(0, `rgba(${HOT},0.35)`); hot.addColorStop(1, `rgba(${HOT},0)`);
  ctx.fillStyle = hot;
  ctx.beginPath(); ctx.ellipse(-R * 1.9, R * 0.04, R * 1.1, R * 0.2, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

/** How big a hole is drawn right now: its sprung size, shrinking away (eased) as it turns white. */
function drawnSize(w: World, h: Hole) {
  const wt = h.white >= 0 ? clamp((w.t - h.white) / WHITE, 0, 1) : 0;
  return { R: Math.max(0, h.size) * (1 - wt * wt * (3 - 2 * wt)), wt };
}

export const blackhole: Material = {
  id: 'blackhole',
  accent: 'flower',
  // the letters are free: this material moves, turns and stretches them itself
  spring: { k: 0, c: 0, rk: 0, rc: 0, sk: 170, sc: 11, limit: 99, lift: LIFT, free: true },

  ambient(l, w, out) {
    out.r += Math.sin(w.t * 0.6 * w.speed + l.phase) * 0.01 * w.amb;
  },

  enter(w) { holes.length = 0; falls.clear(); w.devour(null); },

  reset(w) {
    holes.length = 0; falls.clear(); w.devour(null);
    for (const l of w.letters) { l.fade = 0; l.ox = l.oy = l.vx = l.vy = 0; l.rot = l.vr = 0; }
  },

  update(w, dt) {
    const p = w.p, fs = w.fs, M = tuneF(w.tune, 3);
    const restY = w.baseline - LIFT * fs;
    for (const [l] of falls) if (!w.letters.includes(l)) falls.delete(l);

    for (const h of holes) {
      h.spin += dt * (2 + h.mass);
      // its size follows the mass on a spring with a little give: it accelerates, overshoots slightly and
      // settles, so neither growing nor the last surge before it eats the interface is ever a jump
      const target = w.fs * (0.075 + 0.045 * h.mass) * (h.devoured ? 1.5 : 1) * 1.25;
      const steps = Math.max(1, Math.ceil(dt / 0.008));
      for (let i = 0; i < steps; i++) {
        const sdt = dt / steps;
        h.vs += (70 * (target - h.size) - 10.4 * h.vs) * sdt;
        h.size += h.vs * sdt;
      }
      h.eaten = h.eaten.filter((l) => w.letters.includes(l));
      if (h.held) {
        h.x = p.x; h.y = p.y;
        h.mass = Math.min(MAX_MASS, h.mass + (MAX_MASS + 0.15 - h.mass) * dt * 1.2); // eases out as it fills
        if (h.mass >= MAX_MASS && h.full < 0) h.full = w.t;
        // at full size, after a breath, it starts on the interface
        if (h.full >= 0 && !h.devoured && w.t - h.full > 0.35) {
          h.devoured = true;
          w.devour({ x: h.x, y: h.y });
          w.sound.play('gust', 1);
        }
      } else if (h.white < 0) {
        // a placed hole lives until nothing is left falling into it, or it has been quiet a long time
        let busy = false;
        for (const f of falls.values()) if (f.h === h) busy = true;
        const left = w.letters.some((l) => l.glyph && !falls.has(l) && !holes.some((x) => x.eaten.includes(l)));
        if ((!busy && !left && w.t - h.quiet > 0.7) || w.t - h.t0 > 14) whiten(w, h);
      }
    }
    for (let i = holes.length - 1; i >= 0; i--) if (holes[i].white >= 0 && w.t - holes[i].white > WHITE) holes.splice(i, 1);

    const owner = new Map<Letter, Hole>();
    for (const h of holes) for (const l of h.eaten) owner.set(l, h);

    for (const l of w.letters) {
      if (!l.glyph) continue;
      const inside = owner.get(l);
      if (inside) { // swallowed: carried along inside the hole, out of sight
        l.ox = inside.x - l.bx; l.oy = inside.y - restY;
        l.vx = l.vy = l.vr = 0;
        l.fade = 1;
        l.sxT = l.syT = 0.3;
        continue;
      }

      const f = falls.get(l);
      if (f) {
        const h = f.h, q = clamp((w.t - f.t0) / f.dur, 0, 1);
        // the orbit decays slowly, then fast; it speeds up as it tightens, and flattens into the disk
        const r = f.r0 * (1 - Math.pow(q, 1.8));
        const a = f.a0 + f.dir * (q * 1.4 + q * q * 2.2) * Math.PI;
        const flat = 1 - 0.6 * Math.min(1, q * 2.2);
        const x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r * flat;
        l.ox = x - l.bx; l.oy = y - restY; l.vx = l.vy = 0;
        // spaghettification: the long axis turns to point at the centre, and the letter is drawn out along it
        const s = smooth(Math.min(1, q * 1.5));
        const ux = h.x - x, uy = h.y - y;
        l.rot = angleTo(f.rot0, Math.atan2(-ux, uy), s);
        l.vr = 0;
        // the stretching itself is drawn in drawLetter: it is not a plain scale but a taper toward the hole
        f.s = s; f.d = Math.hypot(ux, uy); f.q = q;
        l.skT = 0;
        l.heatT = Math.max(l.heatT, s * 0.8);
        l.fade = 0; // the strand fades itself, strip by strip
        if (q >= 1) {
          falls.delete(l);
          h.eaten.push(l); h.quiet = w.t;
          l.fade = 1; // hidden this very frame, or it would flash up whole for one frame
          w.sound.play('press');
        }
        continue;
      }
      l.fade = Math.max(0, l.fade - dt * 4);

      const cx = l.bx + l.ox, cy = restY + l.oy;
      // within reach of a hole: caught, and the fall begins
      let caught = false;
      for (const h of holes) {
        if (h.white >= 0) continue;
        const d = Math.hypot(cx - h.x, cy - h.y);
        if (d > reach(w, h, M)) continue;
        falls.set(l, {
          h, t0: w.t, dur: FALL, r0: Math.max(d, fs * 0.05),
          a0: Math.atan2(cy - h.y, cx - h.x), dir: 1, rot0: l.rot, s: 0, d, q: 0,
        });
        h.quiet = w.t;
        w.sound.play('pulse', 0.35);
        caught = true;
        break;
      }
      if (caught) continue;

      // not caught yet: leaning and stretching toward any hole nearby, but still tied home
      let ax = 0, ay = 0;
      const lean = (x: number, y: number, m: number, span: number) => {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
        if (d > span) return;
        const a = (1.6 * fs * fs * fs * m * w.inten) / (d * d + 0.04 * fs * fs);
        const ux = dx / d, uy = dy / d;
        ax += (ux - uy * 0.5) * a; ay += (uy + ux * 0.5) * a;
        const k = clamp(1 - d / span, 0, 1);
        l.sxT += k * 0.45 * Math.abs(ux); l.syT += k * 0.45 * Math.abs(uy); l.skT += ux * uy * k * 0.8;
        l.heatT = Math.max(l.heatT, k * k * 0.6);
      };
      for (const h of holes) if (h.white < 0) lean(h.x, h.y, 0.5 * h.mass * M, reach(w, h, M) * 1.8);
      if (p.active && !p.down) lean(p.x, p.y, 0.4 * M, fs * 1.3);

      ax += -55 * l.ox - 10 * l.vx; ay += -55 * l.oy - 10 * l.vy;
      l.rot = Math.atan2(Math.sin(l.rot), Math.cos(l.rot));
      l.vr += (-45 * l.rot - 8 * l.vr) * dt;
      l.vx += ax * dt; l.vy += ay * dt;
      const v = Math.hypot(l.vx, l.vy), vmax = fs * 12;
      if (v > vmax) { l.vx *= vmax / v; l.vy *= vmax / v; }
      l.ox += l.vx * dt; l.oy += l.vy * dt; l.rot += l.vr * dt;
    }
  },

  down(w) {
    const p = w.p;
    holes.push({ x: p.x, y: p.y, mass: 0.6, t0: w.t, eaten: [], white: -1, held: true, spin: 0, full: -1, devoured: false, quiet: w.t, size: 0, vs: 0 });
    w.sound.play('pulse', 0.5);
  },

  up(w, _hit, click) {
    const h = holes.find((x) => x.held);
    if (!h) return;
    h.held = false;
    if (!click) { whiten(w, h); return; } // let go of a hole you grew: it spits everything out
    // a click leaves the hole behind; its reach grows until it has taken every letter
    h.mass = Math.max(1, h.mass); h.t0 = w.t; h.quiet = w.t;
    const live = holes.filter((x) => x.white < 0 && !x.held);
    if (live.length > 3) whiten(w, live[0]);
  },

  drawLetter(ctx, l, w, _colors, liftPx) {
    const f = falls.get(l);
    if (!f || f.s < 0.01) return false;
    strand(ctx, l, f, w.fs, liftPx);
    return true;
  },

  back(ctx, w, colors) {
    const dark = colors.bg[0] * 0.3 + colors.bg[1] * 0.59 + colors.bg[2] * 0.11 < 110;
    for (const h of holes) {
      const { R, wt } = drawnSize(w, h);
      if (R >= 1) holeBack(ctx, h, R, h.spin, 1 - wt, dark);
    }
  },

  front(ctx, w, colors) {
    const dark = colors.bg[0] * 0.3 + colors.bg[1] * 0.59 + colors.bg[2] * 0.11 < 110;
    const fs = w.fs;
    for (const h of holes) {
      const { R, wt } = drawnSize(w, h);
      if (wt > 0) { // the white hole: a flash that blooms outward
        const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, fs * (0.2 + wt * 1.4));
        g.addColorStop(0, `rgba(${HOT},${(1 - wt) * 0.9})`);
        g.addColorStop(0.4, `rgba(${AMBER},${(1 - wt) * 0.45})`);
        g.addColorStop(1, `rgba(${ORANGE},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(h.x, h.y, fs * (0.2 + wt * 1.4), 0, TAU); ctx.fill();
      }
      if (R >= 1) holeFront(ctx, h, R, h.spin, 1 - wt, dark);
    }
  },
};

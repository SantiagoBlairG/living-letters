import type { Letter, Material, World } from '../types';
import { calm, clamp, tuneF } from '../simulation';

/**
 * Soap bubbles. Each letter floats inside an iridescent bubble that wobbles when the pointer comes near.
 * A click pops the bubble — droplets fly, the letter drops a little — and a new one grows round it.
 * Holding blows a stream of small bubbles from the hand, lifting the letters around it.
 */

const LIFT = 0.3;
const TAU = Math.PI * 2;
export const IRIDESCENT = ['255,128,200', '120,225,255', '255,236,140', '170,140,255'];

interface State { grow: number; wob: number; wv: number; poppedAt: number }
interface Bit { x: number; y: number; vx: number; vy: number; r: number; age: number; max: number; drop: boolean; ph: number }
const states = new Map<Letter, State>();
const bits: Bit[] = [];
let blowAcc = 0;
let clock = 0;

const st = (l: Letter) => {
  let s = states.get(l);
  if (!s) { s = { grow: 0, wob: 0, wv: 0, poppedAt: -10 }; states.set(l, s); }
  return s;
};

/** The bubble's radius around a letter, in its own px. */
const radius = (w: World, l: Letter) => {
  const g = l.glyph!.box, fs = w.fs;
  return Math.max((g[2] - g[0]) * fs, (g[3] - g[1]) * fs) * 0.54 * tuneF(w.tune, 1.6);
};

/** An iridescent ring: a rim that shifts colour round its circumference, a faint skin, and two highlights. */
export function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, alpha = 1) {
  if (r < 1) return;
  const skin = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
  skin.addColorStop(0, 'rgba(255,255,255,0)'); skin.addColorStop(1, `rgba(255,255,255,${0.1 * alpha})`);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  let rim: CanvasGradient | string;
  if ('createConicGradient' in ctx) {
    const g = ctx.createConicGradient(t * 0.6, x, y);
    IRIDESCENT.forEach((c, i) => g.addColorStop(i / IRIDESCENT.length, `rgba(${c},${0.65 * alpha})`));
    g.addColorStop(1, `rgba(${IRIDESCENT[0]},${0.65 * alpha})`);
    rim = g;
  } else rim = `rgba(${IRIDESCENT[1]},${0.6 * alpha})`;
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(0.8, r * 0.016);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${0.55 * alpha})`;
  ctx.lineWidth = Math.max(0.8, r * 0.022);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, r * 0.78, -2.65, -1.95); ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${0.6 * alpha})`;
  ctx.beginPath(); ctx.arc(x + r * 0.42, y - r * 0.5, Math.max(1, r * 0.05), 0, TAU); ctx.fill();
}

export const bubble: Material = {
  id: 'bubble',
  accent: 'stem',
  spring: { k: 45, c: 6, rk: 40, rc: 5.5, sk: 120, sc: 8, limit: 0.6, lift: LIFT },

  ambient(l, w, out) {
    const t = w.t * w.speed;
    out.y += Math.sin(t * 0.9 + l.phase) * 0.03 * w.fs * w.amb;
    out.x += Math.sin(t * 0.6 + l.phase2) * 0.012 * w.fs * w.amb;
  },

  enter() { states.clear(); bits.length = 0; },
  reset(w) { states.clear(); bits.length = 0; calm(w.letters); },

  update(w: World, dt) {
    const p = w.p, fs = w.fs;
    clock = w.t;
    for (const k of states.keys()) if (!w.letters.includes(k)) states.delete(k);
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const s = st(l);
      // a new bubble grows round the letter, with a little overshoot
      if (w.t - s.poppedAt > 0.45) s.grow += (1 - s.grow) * Math.min(1, dt * 2.6);
      if (p.active) {
        const dx = w.cx(l) - p.x, dy = w.cy(l) - p.y, d = Math.hypot(dx, dy) || 1, R = radius(w, l) * 1.5;
        if (d < R) { // the bubble wobbles and drifts away from the hand
          const f = (1 - d / R) * w.inten;
          s.wv += (Math.min(p.speed, fs * 8) / fs) * f * dt * 6 + f * dt * 2;
          l.fx += (dx / d) * fs * 8 * f; l.fy += (dy / d) * fs * 8 * f;
          l.heatT = Math.max(l.heatT, f * 0.3);
        }
        if (p.down && d < fs * 1.5) l.fy -= fs * 10 * (1 - d / (fs * 1.5)) * w.inten; // blown upward
      }
      s.wv += (-s.wob * 90 - s.wv * 5) * dt;
      s.wob = clamp(s.wob + s.wv * dt, -0.25, 0.25);
    }
    // holding blows a stream of small bubbles
    if (p.down && p.active) {
      blowAcc += dt * 14;
      while (blowAcc >= 1 && bits.length < 160) {
        blowAcc -= 1;
        bits.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * fs * 0.9, vy: -fs * (0.4 + Math.random() * 0.6), r: fs * (0.03 + Math.random() * 0.06), age: 0, max: 2.5 + Math.random() * 1.5, drop: false, ph: Math.random() * TAU });
      }
    }
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.age += dt;
      if (b.age > b.max || b.y < -50 || b.y > w.H + 50) { bits.splice(i, 1); continue; }
      if (b.drop) { b.vy += fs * 4 * dt; }
      else { b.vx += Math.sin(w.t * 2 + b.ph) * fs * 0.3 * dt; b.vy -= fs * 0.05 * dt; b.vx *= 1 - Math.min(1, dt * 0.8); }
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
  },

  down(w) { blowAcc = 0; w.sound.play('press'); },

  up(w, hit, click) {
    if (!click) return;
    const p = w.p, fs = w.fs;
    // pop the bubble you clicked (or the nearest one the click is inside)
    let target = hit;
    if (!target) for (const l of w.letters) if (l.glyph && Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) < radius(w, l)) target = l;
    if (!target) {
      for (let i = 0; i < 8; i++) bits.push({ x: p.x, y: p.y, vx: Math.cos((i / 8) * TAU) * fs * 0.8, vy: Math.sin((i / 8) * TAU) * fs * 0.8 - fs * 0.3, r: fs * 0.04, age: 0, max: 2.2, drop: false, ph: Math.random() * TAU });
      w.sound.play('pop', 0.4);
      return;
    }
    const s = st(target);
    if (s.grow < 0.3) return;
    const r = radius(w, target) * s.grow, cx = w.cx(target), cy = w.cy(target);
    for (let i = 0; i < 18; i++) { // the skin bursts into droplets
      const a = (i / 18) * TAU + Math.random() * 0.3;
      bits.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: Math.cos(a) * fs * (0.8 + Math.random()), vy: Math.sin(a) * fs * (0.8 + Math.random()) - fs * 0.4, r: Math.max(1.2, fs * 0.012), age: 0, max: 1, drop: true, ph: i });
    }
    s.grow = 0; s.poppedAt = w.t;
    target.vy += fs * 1.4; target.vsy -= 1.2; target.vsx += 0.8;
    w.sound.play('pop', w.inten);
  },

  drawLetter(ctx, l, w, _colors, liftPx) {
    ctx.fillText(l.ch, -l.adv / 2, liftPx);
    const s = states.get(l);
    if (!s || s.grow < 0.03) return true;
    const g = l.glyph!.box, fs = w.fs;
    const cx = ((g[0] + g[2]) / 2) * fs - l.adv / 2, cy = ((g[1] + g[3]) / 2) * fs + liftPx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1 + s.wob, 1 - s.wob);
    drawBubble(ctx, 0, 0, radius(w, l) * s.grow, clock + l.phase);
    ctx.restore();
    return true;
  },

  /** Blown bubbles and droplets, over the letters. */
  front(ctx) {
    for (const b of bits) {
      const life = 1 - b.age / b.max;
      if (b.drop) {
        ctx.fillStyle = `rgba(${IRIDESCENT[Math.round(b.ph) % 4]},${(0.8 * life).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      } else drawBubble(ctx, b.x, b.y, b.r, clock + b.ph, Math.min(1, life * 2));
    }
  },
};

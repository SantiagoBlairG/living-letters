import type { Letter, Material, World } from '../types';
import { calm, clamp, tuneF } from '../simulation';

/**
 * Paper. Each letter is a folded sheet. Near the pointer, the half of a letter facing it lifts along a crease
 * down the middle; a click flaps the letters over along a horizontal crease, one after another, and back;
 * holding crumples the letters under the hand into facets, which smooth out again when you let go.
 */

const LIFT = 0.3;
const FLAP = 0.85; // seconds a flap takes

interface Facet { pts: number[]; dx: number; dy: number; r: number; shade: number }
interface State {
  fold: number; vf: number; side: number; // the hover fold about the vertical crease, radians
  flapAt: number; // when its flap starts (-1: none)
  crumple: number; facets: Facet[] | null;
}
const states = new Map<Letter, State>();
let clock = 0;

function st(l: Letter) {
  let s = states.get(l);
  if (!s) { s = { fold: 0, vf: 0, side: 1, flapAt: -1, crumple: 0, facets: null }; states.set(l, s); }
  return s;
}

/** A fan of triangles over the glyph's box, each with its own way of catching the light when crumpled. */
function facets(l: Letter, fs: number, liftPx: number): Facet[] {
  const g = l.glyph!.box, pad = fs * 0.04;
  const x0 = g[0] * fs - l.adv / 2 - pad, x1 = g[2] * fs - l.adv / 2 + pad, y0 = g[1] * fs + liftPx - pad, y1 = g[3] * fs + liftPx + pad;
  const cx = (x0 + x1) / 2 + (Math.random() - 0.5) * (x1 - x0) * 0.2, cy = (y0 + y1) / 2 + (Math.random() - 0.5) * (y1 - y0) * 0.2;
  const rim: number[] = [];
  const n = 11;
  for (let i = 0; i < n; i++) { // points round the box's edge
    const u = (i + Math.random() * 0.6) / n, per = 2 * (x1 - x0) + 2 * (y1 - y0);
    let d = u * per;
    if (d < x1 - x0) rim.push(x0 + d, y0);
    else if ((d -= x1 - x0) < y1 - y0) rim.push(x1, y0 + d);
    else if ((d -= y1 - y0) < x1 - x0) rim.push(x1 - d, y1);
    else { d -= x1 - x0; rim.push(x0, y1 - d); }
  }
  const out: Facet[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push({
      pts: [cx, cy, rim[i * 2], rim[i * 2 + 1], rim[j * 2], rim[j * 2 + 1]],
      dx: (Math.random() - 0.5) * fs * 0.05, dy: (Math.random() - 0.5) * fs * 0.05,
      r: (Math.random() - 0.5) * 0.5, shade: Math.random() * 2 - 1,
    });
  }
  return out;
}

/** Draws one half of the letter (side ±1 of the crease at `at` along the axis) folded by `angle`. */
function half(ctx: CanvasRenderingContext2D, l: Letter, liftPx: number, box: number[], vertical: boolean, at: number, side: number, angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const [x0, y0, x1, y1] = box;
  ctx.save();
  if (vertical) { ctx.translate(at, 0); ctx.scale(c, 1 + 0.06 * s); ctx.translate(-at, 0); }
  else { ctx.translate(0, at); ctx.scale(1 + 0.06 * s, c); ctx.translate(0, -at); }
  ctx.beginPath();
  if (vertical) ctx.rect(side > 0 ? at : x0, y0, side > 0 ? x1 - at : at - x0, y1 - y0);
  else ctx.rect(x0, side > 0 ? at : y0, x1 - x0, side > 0 ? y1 - at : at - y0);
  ctx.clip();
  ctx.fillText(l.ch, -l.adv / 2, liftPx);
  if (s > 0.02 || c < 0) { // turning away it darkens; folded over, we see the paler back of the sheet
    ctx.fillStyle = c >= 0 ? `rgba(0,0,0,${(0.42 * s).toFixed(3)})` : `rgba(255,255,255,${(0.16 + 0.12 * s).toFixed(3)})`;
    ctx.fillText(l.ch, -l.adv / 2, liftPx);
  }
  ctx.restore();
}

export const origami: Material = {
  id: 'origami',
  accent: 'flower',
  spring: { k: 110, c: 12, rk: 100, rc: 11, sk: 170, sc: 13, limit: 0.4, lift: LIFT },

  ambient(l, w, out) {
    out.r += Math.sin(w.t * 0.6 * w.speed + l.phase) * 0.012 * w.amb;
    out.y += Math.sin(w.t * 0.8 * w.speed + l.phase2) * 0.006 * w.fs * w.amb;
  },

  enter() { states.clear(); },
  reset(w) { states.clear(); calm(w.letters); },

  update(w: World, dt) {
    const p = w.p, fs = w.fs;
    clock = w.t;
    for (const k of states.keys()) if (!w.letters.includes(k)) states.delete(k);
    const reach = 1.25 * w.inten * tuneF(w.tune, 2);
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const s = st(l);
      const dx = p.x - w.cx(l), dy = p.y - w.cy(l), d = Math.hypot(dx, dy);
      let target = 0;
      if (p.active && !p.down && d < fs * 0.9) { target = reach * (1 - d / (fs * 0.9)); s.side = dx >= 0 ? 1 : -1; }
      // paper has a little spring in it
      s.vf += ((target - s.fold) * 70 - s.vf * 10) * dt;
      s.fold = clamp(s.fold + s.vf * dt, 0, 2.6);
      // holding crumples whatever is under the hand; letting go smooths it out
      const crumpling = p.down && d < fs * 0.9;
      s.crumple += ((crumpling ? 1 : 0) - s.crumple) * Math.min(1, dt * (crumpling ? 3.5 : 2.2));
      if (crumpling) { l.sxT -= 0.25 * s.crumple; l.syT -= 0.25 * s.crumple; l.heatT = Math.max(l.heatT, 0.3 * s.crumple); }
      if (s.crumple < 0.01 && !crumpling) s.facets = null;
      if (s.flapAt >= 0 && w.t > s.flapAt + FLAP) s.flapAt = -1;
    }
    if (p.down && Math.random() < dt * 5) w.sound.play('sand', 0.5);
  },

  down(w) { w.sound.play('press'); },

  up(w, hit, click) {
    if (!click) return;
    // the letters flap over, one after another outward from the click
    const p = w.p, fs = w.fs;
    const from = hit ?? w.letters.reduce((a, b) => (Math.abs(w.cx(b) - p.x) < Math.abs(w.cx(a) - p.x) ? b : a), w.letters[0]);
    if (!from) return;
    for (const l of w.letters) {
      const s = st(l), n = Math.abs(l.index - from.index);
      if (n > 6) continue;
      s.flapAt = w.t + n * 0.07;
      w.later(n * 70, () => w.sound.play('flip', 0.5));
    }
    w.fx.ring(p.x, p.y, 'flower', fs * 0.35);
  },

  drawLetter(ctx, l, w, _colors, liftPx) {
    const s = states.get(l);
    if (!s) return false;
    const fs = w.fs, g = l.glyph!.box, pad = fs * 0.06;
    const box = [g[0] * fs - l.adv / 2 - pad, g[1] * fs + liftPx - pad, g[2] * fs - l.adv / 2 + pad, g[3] * fs + liftPx + pad];
    const fill = ctx.fillStyle;
    if (s.crumple > 0.02) { // crumpled: the sheet broken into facets, each tilted and lit differently
      if (!s.facets) s.facets = facets(l, fs, liftPx);
      const c = s.crumple;
      const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
      for (const f of s.facets) {
        ctx.save();
        ctx.translate(cx + f.dx * c, cy + f.dy * c);
        ctx.rotate(f.r * c);
        ctx.scale(1 - 0.12 * c, 1 - 0.12 * c);
        ctx.translate(-cx, -cy);
        ctx.beginPath();
        ctx.moveTo(f.pts[0], f.pts[1]); ctx.lineTo(f.pts[2], f.pts[3]); ctx.lineTo(f.pts[4], f.pts[5]); ctx.closePath();
        ctx.clip();
        ctx.fillStyle = fill;
        ctx.fillText(l.ch, -l.adv / 2, liftPx);
        ctx.fillStyle = f.shade > 0 ? `rgba(255,255,255,${(0.22 * f.shade * c).toFixed(3)})` : `rgba(0,0,0,${(-0.4 * f.shade * c).toFixed(3)})`;
        ctx.fillText(l.ch, -l.adv / 2, liftPx);
        ctx.restore();
      }
      ctx.fillStyle = fill;
      return true;
    }
    const flapping = s.flapAt >= 0 && clock >= s.flapAt;
    const vertical = !flapping;
    const angle = flapping ? Math.PI * 0.94 * Math.sin(Math.PI * clamp((clock - s.flapAt) / FLAP, 0, 1)) : s.fold;
    if (angle < 0.01) return false;
    const side = flapping ? 1 : s.side;
    const at = vertical ? (box[0] + box[2]) / 2 : (box[1] + box[3]) / 2;
    half(ctx, l, liftPx, box, vertical, at, -side, 0); // the half that stays put
    ctx.fillStyle = fill;
    half(ctx, l, liftPx, box, vertical, at, side, angle); // the half that folds
    ctx.fillStyle = fill;
    return true;
  },
};

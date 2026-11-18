import type { Letter, Material, World } from '../types';
import { calm, clamp, toLocal, tuneF } from '../simulation';
import { blit, glyphLayer } from '../glyphLayer';

/**
 * Paper. Every letter is a folded sheet: its ink is broken into flat facets along crisp creases, each lit
 * by a light that sits where the pointer is — the same light as the folded paper behind. Near the pointer
 * the folds deepen and the letter lifts toward it. A click turns the sheets over one after another,
 * showing their paler backs; holding crumples them, and they smooth out again when you let go.
 */

const LIFT = 0.3;
const FLIP = 0.9; // seconds a sheet takes to turn over

interface Tri { pts: number[]; cx: number; cy: number; n: number }
interface Crumple { pts: number[]; dx: number; dy: number; r: number; shade: number }
interface State { tris: Tri[]; fold: number; flipAt: number; crumple: number; bits: Crumple[] | null; fs: number }
const states = new Map<Letter, State>();
let clock = 0;
let lightX = 0, lightY = 0, lightOn = 0;

/** A pattern of creases over the glyph's box: a jittered grid cut into triangles, each facing its own way. */
function creases(l: Letter, fs: number): Tri[] {
  const g = l.glyph!.box, pad = fs * 0.08;
  const x0 = g[0] * fs - l.adv / 2 - pad, x1 = g[2] * fs - l.adv / 2 + pad, y0 = (g[1] + LIFT) * fs - pad, y1 = (g[3] + LIFT) * fs + pad;
  const cols = 3, rows = 4, P: number[][] = [];
  for (let j = 0; j <= rows; j++) {
    const row: number[] = [];
    for (let i = 0; i <= cols; i++) {
      const edge = i === 0 || j === 0 || i === cols || j === rows;
      row.push(x0 + ((x1 - x0) * i) / cols + (edge ? 0 : (Math.random() - 0.5) * (x1 - x0) / cols * 0.6));
      row.push(y0 + ((y1 - y0) * j) / rows + (edge ? 0 : (Math.random() - 0.5) * (y1 - y0) / rows * 0.6));
    }
    P.push(row);
  }
  const tris: Tri[] = [];
  const add = (pts: number[]) => tris.push({ pts, cx: (pts[0] + pts[2] + pts[4]) / 3, cy: (pts[1] + pts[3] + pts[5]) / 3, n: Math.random() * Math.PI * 2 });
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = [P[j][i * 2], P[j][i * 2 + 1]], b = [P[j][i * 2 + 2], P[j][i * 2 + 3]];
    const c = [P[j + 1][i * 2], P[j + 1][i * 2 + 1]], d = [P[j + 1][i * 2 + 2], P[j + 1][i * 2 + 3]];
    if ((i + j) % 2) { add([...a, ...b, ...d]); add([...a, ...d, ...c]); } else { add([...a, ...b, ...c]); add([...b, ...d, ...c]); }
  }
  return tris;
}

/** A fan of crumpled facets over the box, each tilted and lit differently. */
function crumpleBits(l: Letter, fs: number, liftPx: number): Crumple[] {
  const g = l.glyph!.box, pad = fs * 0.04;
  const x0 = g[0] * fs - l.adv / 2 - pad, x1 = g[2] * fs - l.adv / 2 + pad, y0 = g[1] * fs + liftPx - pad, y1 = g[3] * fs + liftPx + pad;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, n = 11, rim: number[] = [];
  const per = 2 * (x1 - x0) + 2 * (y1 - y0);
  for (let i = 0; i < n; i++) {
    let d = ((i + Math.random() * 0.6) / n) * per;
    if (d < x1 - x0) rim.push(x0 + d, y0);
    else if ((d -= x1 - x0) < y1 - y0) rim.push(x1, y0 + d);
    else if ((d -= y1 - y0) < x1 - x0) rim.push(x1 - d, y1);
    else { d -= x1 - x0; rim.push(x0, y1 - d); }
  }
  const out: Crumple[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push({ pts: [cx, cy, rim[i * 2], rim[i * 2 + 1], rim[j * 2], rim[j * 2 + 1]], dx: (Math.random() - 0.5) * fs * 0.05, dy: (Math.random() - 0.5) * fs * 0.05, r: (Math.random() - 0.5) * 0.5, shade: Math.random() * 2 - 1 });
  }
  return out;
}

function state(w: World, l: Letter) {
  let s = states.get(l);
  if (!s || s.fs !== w.fs) { s = { tris: creases(l, w.fs), fold: 0, flipAt: -1, crumple: 0, bits: null, fs: w.fs }; states.set(l, s); }
  return s;
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
    // the light follows the pointer; away, it rests up and to the left
    lightOn += ((p.active ? 1 : 0) - lightOn) * Math.min(1, dt * 4);
    const tx = p.active ? p.x : w.W * 0.25, ty = p.active ? p.y : w.H * 0.1;
    lightX += (tx - lightX) * Math.min(1, dt * 10); lightY += (ty - lightY) * Math.min(1, dt * 10);
    const depth = w.inten * tuneF(w.tune, 2);
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const s = state(w, l);
      const dx = p.x - w.cx(l), dy = p.y - w.cy(l), d = Math.hypot(dx, dy);
      const near = p.active && !p.down ? clamp(1 - d / (fs * 1.1), 0, 1) : 0;
      s.fold += (near * depth - s.fold) * Math.min(1, dt * 8);
      // the sheet lifts and leans toward the hand
      l.ty -= fs * 0.04 * s.fold; l.rT += clamp(dx / fs, -1, 1) * 0.08 * s.fold;
      l.sxT += 0.03 * s.fold; l.syT += 0.03 * s.fold;
      const crumpling = p.down && d < fs * 0.9;
      s.crumple += ((crumpling ? 1 : 0) - s.crumple) * Math.min(1, dt * (crumpling ? 3.5 : 2.2));
      if (crumpling) { l.sxT -= 0.25 * s.crumple; l.syT -= 0.25 * s.crumple; }
      if (s.crumple < 0.01 && !crumpling) s.bits = null;
      if (s.flipAt >= 0 && w.t > s.flipAt + FLIP) s.flipAt = -1;
    }
    if (p.down && Math.random() < dt * 5) w.sound.play('sand', 0.5);
  },

  down(w) { w.sound.play('press'); },

  up(w, hit, click) {
    if (!click) return;
    const p = w.p;
    const from = hit ?? w.letters.reduce((a, b) => (Math.abs(w.cx(b) - p.x) < Math.abs(w.cx(a) - p.x) ? b : a), w.letters[0]);
    if (!from) return;
    for (const l of w.letters) { // the sheets turn over one after another, outward from the click
      if (!l.glyph) continue;
      const n = Math.abs(l.index - from.index);
      state(w, l).flipAt = w.t + n * 0.08;
      w.later(n * 80 + 300, () => w.sound.play('flip', 0.45));
    }
    w.fx.ring(p.x, p.y, 'flower', w.fs * 0.35);
  },

  drawLetter(ctx, l, w, _colors, liftPx) {
    const s = states.get(l);
    if (!s) return false;
    const fs = w.fs, dy = liftPx - LIFT * fs;
    const fill = ctx.fillStyle;

    if (s.crumple > 0.02) { // crumpled into facets, each tilted and lit differently
      if (!s.bits) s.bits = crumpleBits(l, fs, liftPx);
      const c = s.crumple, g = l.glyph!.box;
      const cx = ((g[0] + g[2]) / 2) * fs - l.adv / 2, cy = ((g[1] + g[3]) / 2) * fs + liftPx;
      for (const f of s.bits) {
        ctx.save();
        ctx.translate(cx + f.dx * c, cy + f.dy * c); ctx.rotate(f.r * c); ctx.scale(1 - 0.12 * c, 1 - 0.12 * c); ctx.translate(-cx, -cy);
        ctx.beginPath(); ctx.moveTo(f.pts[0], f.pts[1]); ctx.lineTo(f.pts[2], f.pts[3]); ctx.lineTo(f.pts[4], f.pts[5]); ctx.closePath(); ctx.clip();
        ctx.fillStyle = fill; ctx.fillText(l.ch, -l.adv / 2, liftPx);
        ctx.fillStyle = f.shade > 0 ? `rgba(255,255,255,${(0.22 * f.shade * c).toFixed(3)})` : `rgba(0,0,0,${(-0.4 * f.shade * c).toFixed(3)})`;
        ctx.fillText(l.ch, -l.adv / 2, liftPx);
        ctx.restore();
      }
      ctx.fillStyle = fill;
      return true;
    }

    // turning over: the sheet narrows to its edge and comes back showing its back
    let turn = 1;
    if (s.flipAt >= 0 && clock >= s.flipAt) turn = Math.cos(Math.PI * 2 * clamp((clock - s.flipAt) / FLIP, 0, 1));
    const back = s.flipAt >= 0 && turn < 0;
    const g = l.glyph!.box, cx = ((g[0] + g[2]) / 2) * fs - l.adv / 2;
    ctx.save();
    if (turn !== 1) { ctx.translate(cx, 0); ctx.scale(Math.abs(turn) < 0.04 ? 0.04 * Math.sign(turn || 1) : turn, 1); ctx.translate(-cx, 0); }
    const L = glyphLayer(ctx, l, liftPx, fs, 0.1);
    if (!L) { ctx.restore(); return true; }
    const G = L.g;
    G.globalCompositeOperation = 'source-atop';
    if (back) { G.fillStyle = 'rgba(255,255,255,0.22)'; G.fillRect(L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0); }
    // each facet lit by its angle to the light
    const [lx, ly] = toLocal(l, lightX, lightY);
    const strength = 0.55 + 0.9 * s.fold + 0.3 * lightOn;
    for (const t of s.tris) {
      const toLight = Math.atan2(ly - t.cy - dy, lx - t.cx);
      let lit = Math.cos(t.n - toLight + (back ? Math.PI : 0)) * strength;
      lit = clamp(lit, -1, 1);
      G.fillStyle = lit > 0 ? `rgba(255,255,255,${(0.2 * lit).toFixed(3)})` : `rgba(0,0,0,${(0.3 * -lit).toFixed(3)})`;
      const q = t.pts;
      G.beginPath(); G.moveTo(q[0], q[1] + dy); G.lineTo(q[2], q[3] + dy); G.lineTo(q[4], q[5] + dy); G.closePath(); G.fill();
    }
    // the creases: a dark valley with a light ridge beside it
    G.lineWidth = Math.max(0.7, fs * 0.004);
    const edges = (o: number) => {
      G.beginPath();
      for (const t of s.tris) { const q = t.pts; G.moveTo(q[0] + o, q[1] + dy + o); G.lineTo(q[2] + o, q[3] + dy + o); G.lineTo(q[4] + o, q[5] + dy + o); G.closePath(); }
      G.stroke();
    };
    G.strokeStyle = 'rgba(0,0,0,0.22)'; edges(0);
    G.strokeStyle = 'rgba(255,255,255,0.12)'; edges(fs * 0.004);
    blit(ctx, L);
    ctx.restore();
    return true;
  },
};

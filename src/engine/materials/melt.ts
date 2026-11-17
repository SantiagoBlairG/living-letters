import type { Letter, Material, World } from '../types';
import { calm, clamp, toLocal } from '../simulation';
import { fontOf } from '../layout';

/**
 * Heat. A letter is cut into thin vertical columns. Where you touch, each column gives way at that height:
 * what is above stays, what is below slides down, and the row at the break smears into a drip.
 * Left alone, the drips slowly draw back up and the letter sets again.
 */

const LIFT = 0.3;

interface Melt {
  fs: number;
  R: number; // bitmap pixels per stage pixel
  x0: number; y0: number; // bitmap origin, local px
  W: number; H: number; // bitmap size, px
  cw: number; cols: number;
  bmp: HTMLCanvasElement;
  d: Float32Array; // drip length per column, bitmap px
  ym: Float32Array; // where each column broke, bitmap px
  heat: Float32Array;
  rate: Float32Array; // some columns run faster: drips, not a curtain
  ink: Uint8Array; // cols × H: does this column have ink on this row
  last: number;
}
const melts = new Map<Letter, Melt>();
let scratch: HTMLCanvasElement | null = null;

function build(w: World, l: Letter): Melt {
  const gl = l.glyph!, fs = w.fs, lift = LIFT * fs, pad = fs * 0.04;
  const R = Math.min(2, window.devicePixelRatio || 1);
  const x0 = gl.box[0] * fs - l.adv / 2 - pad, y0 = gl.box[1] * fs + lift - pad;
  const W = Math.ceil(((gl.box[2] - gl.box[0]) * fs + pad * 2) * R);
  const H = Math.ceil(((gl.box[3] - gl.box[1]) * fs + pad * 2) * R);
  const bmp = document.createElement('canvas');
  bmp.width = W; bmp.height = H;
  const c = bmp.getContext('2d')!;
  c.scale(R, R);
  c.font = fontOf(fs); c.textBaseline = 'alphabetic'; c.fillStyle = '#000';
  c.fillText(l.ch, -l.adv / 2 - x0, lift - y0);
  const cw = Math.max(2, Math.round(fs * 0.018 * R));
  const cols = Math.ceil(W / cw);
  // neighbouring columns run at similar speeds, so drips come out as rounded strands, not noise
  const rate = new Float32Array(cols);
  const ph = Math.random() * 6.28;
  for (let i = 0; i < cols; i++) rate[i] = (0.55 + 0.7 * (0.5 + 0.5 * Math.sin(i * 0.55 + ph))) * (0.85 + Math.random() * 0.3);
  const a = c.getImageData(0, 0, W, H).data;
  const ink = new Uint8Array(cols * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 128) ink[((x / cw) | 0) * H + y] = 1;
  return { fs, R, x0, y0, W, H, cw, cols, bmp, d: new Float32Array(cols), ym: new Float32Array(cols).fill(H - 1), heat: new Float32Array(cols), rate, ink, last: -10 };
}

function state(w: World, l: Letter) {
  let m = melts.get(l);
  if (m && m.fs !== w.fs) { melts.delete(l); m = undefined; }
  if (!m) { m = build(w, l); melts.set(l, m); }
  return m;
}

/** How far a drip may run: about an em, and never through the bottom of the stage. */
function maxDrip(w: World, l: Letter, m: Melt) {
  const floor = w.H - l.m[5] - (m.y0 + m.H / m.R) - 4;
  return Math.max(0, Math.min(w.fs * 1.1, floor)) * m.R;
}

/**
 * Starts a column breaking near bitmap height `by`, unless it is already running. It breaks on the nearest
 * row that has ink, so every drip is a strand of the letter. Returns false for a column with no ink at all.
 */
function breakAt(m: Melt, i: number, by: number): boolean {
  if (m.d[i] >= 0.5 || m.heat[i] >= 0.05) return true;
  const base = i * m.H, y0 = clamp(Math.round(by), 1, m.H - 1);
  for (let y = y0; y < m.H; y++) if (m.ink[base + y]) { m.ym[i] = y; return true; }
  for (let y = y0 - 1; y >= 1; y--) if (m.ink[base + y]) { m.ym[i] = y; return true; }
  return false;
}

export const melt: Material = {
  id: 'melt',
  accent: 'flower',
  spring: { k: 150, c: 20, rk: 150, rc: 20, sk: 200, sc: 20, limit: 0.2, lift: LIFT },

  ambient() { /* it only moves where it melts */ },

  enter() { melts.clear(); },

  reset(w) { melts.clear(); calm(w.letters); },

  update(w, dt) {
    const p = w.p, fs = w.fs;
    for (const k of melts.keys()) if (!w.letters.includes(k)) melts.delete(k);
    const pull = p.down && p.travel > 6;

    for (const l of w.letters) {
      const gl = l.glyph;
      if (!gl) continue;
      const [lx, ly] = toLocal(l, p.x, p.y);
      const top = gl.box[1] * fs + LIFT * fs, bottom = gl.box[3] * fs + LIFT * fs;
      const left = gl.box[0] * fs - l.adv / 2, right = gl.box[2] * fs - l.adv / 2;
      const near = p.active && lx > left - fs * 0.2 && lx < right + fs * 0.2 && ly > top - fs * 0.2 && ly < bottom + (pull ? fs * 1.2 : fs * 0.3);
      let m = melts.get(l);
      if (!m && !near) continue;
      m = state(w, l);
      const bx = (lx - m.x0) * m.R, by = (ly - m.y0) * m.R;
      const dMax = maxDrip(w, l, m);
      const grow = fs * m.R * (0.12 + 0.2 * w.inten);
      const cool = w.t - m.last > 0.9;
      let alive = false, hot = 0;

      for (let i = 0; i < m.cols; i++) {
        const cx = (i + 0.5) * m.cw;
        if (near) {
          if (pull) {
            // dragging pulls the drips down after the hand
            if (Math.abs(cx - bx) < fs * 0.14 * m.R && breakAt(m, i, by)) {
              const target = by - m.ym[i];
              if (target > m.d[i]) m.d[i] += (target - m.d[i]) * Math.min(1, dt * 12);
              m.heat[i] = 1; m.last = w.t;
            }
          } else {
            const f = Math.max(0, 1 - Math.abs(cx - bx) / (fs * 0.22 * m.R)) * (by >= 0 && by <= m.H ? 1 : 0.4);
            if (f > 0 && breakAt(m, i, by)) { m.heat[i] = Math.max(m.heat[i], f); m.last = w.t; }
          }
        }
        m.d[i] += m.heat[i] * grow * m.rate[i] * dt;
        m.heat[i] *= Math.exp(-dt * 2.5);
        if (cool) m.d[i] = Math.max(0, m.d[i] - dt * fs * m.R * (0.1 + (m.d[i] / (fs * m.R)) * 0.6));
        if (m.d[i] > dMax) m.d[i] = dMax;
        if (m.d[i] < 0.3 && m.heat[i] < 0.05) { m.d[i] = 0; m.ym[i] = m.H - 1; }
        else alive = true;
        hot = Math.max(hot, m.heat[i]);
      }
      // a little viscosity: each drip drags its neighbours along
      const q = Math.min(1, dt * 1.5);
      for (let i = 1; i < m.cols - 1; i++) m.d[i] += ((m.d[i - 1] + m.d[i + 1]) / 2 - m.d[i]) * q;

      l.heatT = Math.max(l.heatT, hot * 0.8);
      if (!alive && !near) melts.delete(l); // set again: back to the crisp glyph
    }
  },

  down() { /* dragging pulls, in update */ },

  up(w, _hit, click) {
    if (!click) return;
    // a splash: drops fly from the click, and the letters it lands on start to run
    const p = w.p, fs = w.fs;
    w.fx.splash(p.x, p.y, fs * 0.45, 'ink');
    w.sound.play('splat', w.inten);
    for (const l of w.letters) {
      if (!l.glyph || Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) > fs * 0.9) continue;
      const m = state(w, l);
      const [lx, ly] = toLocal(l, p.x, p.y);
      const bx = (lx - m.x0) * m.R, by = (ly - m.y0) * m.R;
      for (let i = 0; i < m.cols; i++) {
        const f = 1 - Math.abs((i + 0.5) * m.cw - bx) / (fs * 0.32 * m.R);
        if (f <= 0 || !breakAt(m, i, by)) continue;
        m.d[i] += fs * m.R * 0.22 * f * m.rate[i] * w.inten;
        m.heat[i] = Math.max(m.heat[i], 0.5 * f);
      }
      m.last = w.t;
    }
  },

  drawLetter(ctx, l, w) {
    const m = melts.get(l);
    if (!m) return false;
    let maxD = 0, sum = 0;
    for (let i = 0; i < m.cols; i++) { if (m.d[i] > maxD) maxD = m.d[i]; sum += m.d[i]; }
    const Ht = Math.ceil(m.H + maxD + 2);
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width < m.W || scratch.height < Ht) {
      scratch.width = Math.max(scratch.width, m.W); scratch.height = Math.max(scratch.height, Ht);
    }
    const s = scratch.getContext('2d')!;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, m.W, Ht);
    for (let i = 0; i < m.cols; i++) {
      const sx = i * m.cw, sw = Math.min(m.cw, m.W - sx);
      const d = m.d[i], ym = Math.round(m.ym[i]);
      if (d < 0.5) { s.drawImage(m.bmp, sx, 0, sw, m.H, sx, 0, sw, m.H); continue; }
      if (ym > 0) s.drawImage(m.bmp, sx, 0, sw, ym, sx, 0, sw, ym); // above the break: untouched
      s.drawImage(m.bmp, sx, ym, sw, 1, sx, ym, sw, d); // the break, smeared into a drip
      s.drawImage(m.bmp, sx, ym, sw, m.H - ym, sx, ym + d, sw, m.H - ym); // below it: slid down
    }
    // the bitmap is only a shape; colour it with the letter's current fill
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = ctx.fillStyle;
    s.fillRect(0, 0, m.W, Ht);
    s.globalCompositeOperation = 'source-over';

    // a puddle gathers under a letter that has run a lot
    const pud = sum / (m.cols * w.fs * 1.1 * m.R);
    if (pud > 0.05) {
      const cx = m.x0 + m.W / m.R / 2, cy = m.y0 + (m.H + maxD) / m.R - w.fs * 0.03;
      ctx.beginPath();
      ctx.ellipse(cx, cy, (m.W / m.R / 2) * (0.3 + pud * 0.7), w.fs * 0.022 * (0.5 + pud * 1.5), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.drawImage(scratch, 0, 0, m.W, Ht, m.x0, m.y0, m.W / m.R, Ht / m.R);
    return true;
  },
};

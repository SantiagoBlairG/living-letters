import type { ColorKey, Letter, Material, World } from '../types';
import { calm, clamp, toLocal, tuneF } from '../simulation';
import { fontOf } from '../layout';
import { css, mix, type RGB } from '../color';

/**
 * Heat. A letter is cut into thin vertical columns. Where you hover, each column gives way at that height:
 * what is above stays, what is below slides down, and the row at the break smears into a drip.
 * Press on a letter and it pours: liquid runs out of it where you hold, falls in a stream and pools on the
 * floor. Drag and you paint with it; the trail holds for a moment, then runs down too.
 * Left alone, the letter sets again and the puddle dries up.
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
  rate: Float32Array; // neighbouring columns run at similar speeds
  ink: Uint8Array; // cols × H: does this column have ink on this row
  last: number;
}

/** One blob of liquid, in stage px. Neighbouring blobs merge on screen through the goo filter. */
interface Drop {
  x: number; y: number; vx: number; vy: number;
  r: number;
  age: number;
  stick: number; // seconds it clings where it was painted before it starts to run
  settled: boolean; // on the floor, part of the puddle
  link: Drop | null; // the drop painted just before it, so a stroke stays one continuous line
}

const melts = new Map<Letter, Melt>();
const drops: Drop[] = [];
const MAX_DROPS = 700;
let pouring = false; // pressed on a letter
let supply = 1; // how much liquid the hand carries away from the letters
let lastX = 0, lastY = 0, emitAcc = 0, lastDrip = 0, lastPour = -10;
let lastDrop: Drop | null = null;
let scratch: HTMLCanvasElement | null = null;
let layer: HTMLCanvasElement | null = null;

/* ---------- the goo filter: blur, then a hard alpha threshold, so separate blobs read as one liquid ---------- */

let gooBlur: SVGFEGaussianBlurElement | null = null;
let gooSd = 0;
function goo(sd: number) {
  if (!gooBlur) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    const f = document.createElementNS(ns, 'filter');
    f.id = 'll-goo';
    f.setAttribute('color-interpolation-filters', 'sRGB');
    f.setAttribute('x', '-10%'); f.setAttribute('y', '-10%'); f.setAttribute('width', '120%'); f.setAttribute('height', '120%');
    const b = document.createElementNS(ns, 'feGaussianBlur');
    b.setAttribute('in', 'SourceGraphic'); b.setAttribute('result', 'b');
    const m = document.createElementNS(ns, 'feColorMatrix');
    m.setAttribute('in', 'b'); m.setAttribute('type', 'matrix');
    m.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11');
    f.append(b, m); svg.append(f); document.body.append(svg);
    gooBlur = b;
  }
  if (Math.abs(sd - gooSd) > 0.3) { gooSd = sd; gooBlur.setAttribute('stdDeviation', sd.toFixed(1)); }
}

/* ---------- columns ---------- */

function build(w: World, l: Letter): Melt {
  const gl = l.glyph!, fs = w.fs, lift = LIFT * fs, pad = fs * 0.06;
  const R = Math.min(2, window.devicePixelRatio || 1);
  const x0 = gl.box[0] * fs - l.adv / 2 - pad, y0 = gl.box[1] * fs + lift - pad;
  const W = Math.ceil(((gl.box[2] - gl.box[0]) * fs + pad * 2) * R);
  const H = Math.ceil(((gl.box[3] - gl.box[1]) * fs + pad * 2) * R);
  const bmp = document.createElement('canvas');
  bmp.width = W; bmp.height = H;
  const c = bmp.getContext('2d', { willReadFrequently: true })!;
  c.scale(R, R);
  c.font = fontOf(fs); c.textBaseline = 'alphabetic'; c.fillStyle = '#000';
  c.fillText(l.ch, -l.adv / 2 - x0, lift - y0);
  const cw = Math.max(2, Math.round(fs * 0.012 * R));
  const cols = Math.ceil(W / cw);
  const rate = new Float32Array(cols);
  const ph = Math.random() * 6.28;
  for (let i = 0; i < cols; i++) rate[i] = (0.55 + 0.7 * (0.5 + 0.5 * Math.sin(i * 0.38 + ph))) * (0.9 + Math.random() * 0.2);
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

/** Heats the columns of a letter around a stage point. Returns true if the point is over the letter. */
function heatAt(w: World, l: Letter, x: number, y: number, amount: number, reach: number): boolean {
  const gl = l.glyph!, fs = w.fs;
  const [lx, ly] = toLocal(l, x, y);
  const top = (gl.box[1] + LIFT) * fs, bottom = (gl.box[3] + LIFT) * fs;
  const left = gl.box[0] * fs - l.adv / 2, right = gl.box[2] * fs - l.adv / 2;
  if (lx < left - reach || lx > right + reach || ly < top - reach || ly > bottom + reach) return false;
  const m = state(w, l);
  const bx = (lx - m.x0) * m.R, by = (ly - m.y0) * m.R;
  for (let i = 0; i < m.cols; i++) {
    const f = Math.max(0, 1 - Math.abs((i + 0.5) * m.cw - bx) / (reach * m.R)) * (by >= 0 && by <= m.H ? 1 : 0.4);
    if (f > 0 && breakAt(m, i, by)) m.heat[i] = Math.max(m.heat[i], f * amount);
  }
  m.last = w.t;
  return true;
}

/* ---------- liquid ---------- */

function addDrop(x: number, y: number, vx: number, vy: number, r: number, stick: number, link: Drop | null) {
  if (drops.length >= MAX_DROPS) drops.shift();
  const d: Drop = { x, y, vx, vy, r, age: 0, stick, settled: false, link };
  drops.push(d);
  return d;
}

const dropSize = (w: World) => w.fs * (0.022 + Math.random() * 0.016) * (0.75 + 0.25 * w.inten) * tuneF(w.tune, 1.8);

export const melt: Material = {
  id: 'melt',
  accent: 'flower',
  spring: { k: 150, c: 20, rk: 150, rc: 20, sk: 200, sc: 20, limit: 0.2, lift: LIFT },

  ambient() { /* it only moves where it melts */ },

  enter() { melts.clear(); drops.length = 0; pouring = false; lastDrop = null; },

  reset(w) { melts.clear(); drops.length = 0; pouring = false; lastDrop = null; calm(w.letters); },

  update(w, dt) {
    const p = w.p, fs = w.fs;
    for (const k of melts.keys()) if (!w.letters.includes(k)) melts.delete(k);

    // pouring: the letter under the hand runs out into liquid; away from the letters the hand slowly runs dry
    if (pouring && p.down) {
      let over = false;
      for (const l of w.letters) if (l.glyph && heatAt(w, l, p.x, p.y, 0.55, fs * 0.16)) { over = true; l.heatT = 1; }
      supply = over ? Math.min(1, supply + dt * 2) : Math.max(0, supply - dt * 0.45);
      if (supply > 0.02) {
        // painting: drops laid along the path, close enough to make one continuous stroke
        const dist = Math.hypot(p.x - lastX, p.y - lastY);
        const step = fs * 0.022;
        if (dist > step) {
          const n = Math.min(40, Math.floor(dist / step));
          for (let k = 1; k <= n; k++) {
            const q = k / n;
            lastDrop = addDrop(lastX + (p.x - lastX) * q, lastY + (p.y - lastY) * q, p.vx * 0.05, p.vy * 0.05, dropSize(w) * (0.6 + 0.4 * supply), 0.25 + Math.random() * 0.35, lastDrop);
          }
          lastX = p.x; lastY = p.y;
        }
        // and a steady stream from wherever the hand is held
        emitAcc += dt * 38 * supply * tuneF(w.tune, 2.5); // Flow
        while (emitAcc >= 1) {
          emitAcc -= 1;
          addDrop(p.x + (Math.random() - 0.5) * fs * 0.02, p.y, (Math.random() - 0.5) * fs * 0.05, fs * 0.25, dropSize(w) * (0.7 + 0.3 * supply), 0, null);
        }
        lastPour = w.t;
        if (w.t - lastDrip > 0.32) { lastDrip = w.t; w.sound.play('drip', 0.35); }
      }
    }

    // the liquid itself: clings, runs down slowly (it is thick), and pools along the floor
    const floor = w.H - 2, G = fs * 2.4;
    const drying = w.t - lastPour > 1.6;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.age += dt;
      if (d.settled) {
        d.vx *= Math.exp(-dt * 3);
        d.x += d.vx * dt;
      } else if (d.age < d.stick) {
        d.vx *= Math.exp(-dt * 8); d.vy *= Math.exp(-dt * 8);
        d.x += d.vx * dt; d.y += d.vy * dt;
      } else {
        d.vy += G * dt;
        d.vx *= 1 - Math.min(1, dt * 3); d.vy *= 1 - Math.min(1, dt * 1.1);
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.y + d.r * 0.5 > floor) {
          d.y = floor - d.r * 0.5; d.vy = 0; d.settled = true;
          d.vx = (Math.random() - 0.5) * fs * 0.35; // it spreads a little as it lands
        }
      }
      if (drying) d.r -= dt * fs * (d.settled ? 0.006 : 0.012);
      if (d.r < 1 || d.x < -50 || d.x > w.W + 50) drops.splice(i, 1);
    }
    if (lastDrop && !drops.includes(lastDrop)) lastDrop = null;

    // hover: the letter drips where you touch it
    for (const l of w.letters) {
      const gl = l.glyph;
      if (!gl) continue;
      const near = p.active && !p.down && heatAt(w, l, p.x, p.y, 1, fs * 0.22);
      let m = melts.get(l);
      if (!m && !near) continue;
      m = state(w, l);
      const dMax = maxDrip(w, l, m);
      const grow = fs * m.R * (0.12 + 0.2 * w.inten) * tuneF(w.tune, 3);
      const cool = w.t - m.last > 0.9;
      let alive = false, hot = 0;
      for (let i = 0; i < m.cols; i++) {
        m.d[i] += m.heat[i] * grow * m.rate[i] * dt;
        m.heat[i] *= Math.exp(-dt * 2.5);
        if (cool) m.d[i] = Math.max(0, m.d[i] - dt * fs * m.R * (0.1 + (m.d[i] / (fs * m.R)) * 0.6));
        if (m.d[i] > dMax) m.d[i] = dMax;
        if (m.d[i] < 0.3 && m.heat[i] < 0.05) { m.d[i] = 0; m.ym[i] = m.H - 1; }
        else alive = true;
        hot = Math.max(hot, m.heat[i]);
      }
      // viscosity: each drip drags its neighbours along, so the edges come out rounded, not stepped
      const q = Math.min(1, dt * 4);
      for (let i = 1; i < m.cols - 1; i++) {
        if (m.d[i] < 0.3) continue;
        m.d[i] += ((m.d[i - 1] + m.d[i + 1]) / 2 - m.d[i]) * q;
      }
      l.heatT = Math.max(l.heatT, hot * 0.8);
      if (!alive && !near) melts.delete(l); // set again: back to the crisp glyph
    }
  },

  down(w, hit) {
    if (!hit || !hit.glyph) return;
    pouring = true; supply = 1; emitAcc = 0; lastDrop = null;
    lastX = w.p.x; lastY = w.p.y;
    w.sound.play('press');
  },

  up(w, _hit, click) {
    const p = w.p, fs = w.fs;
    pouring = false; lastDrop = null;
    if (!click) return;
    // a splash: liquid thrown up and out, which falls and joins the puddle, and the letters it hits start to run
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5, sp = fs * (0.8 + Math.random() * 1.8) * w.inten;
      addDrop(p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, dropSize(w) * (0.5 + Math.random() * 0.6), 0, null);
    }
    lastPour = w.t;
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
    let maxD = 0;
    for (let i = 0; i < m.cols; i++) if (m.d[i] > maxD) maxD = m.d[i];
    const Ht = Math.ceil(m.H + maxD + m.cw * 2 + 2);
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width < m.W || scratch.height < Ht) {
      scratch.width = Math.max(scratch.width, m.W); scratch.height = Math.max(scratch.height, Ht);
    }
    const s = scratch.getContext('2d')!;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, m.W, Ht);
    s.fillStyle = '#000';
    for (let i = 0; i < m.cols; i++) {
      const sx = i * m.cw, sw = Math.min(m.cw, m.W - sx);
      const d = m.d[i], ym = Math.round(m.ym[i]);
      if (d < 0.5) { s.drawImage(m.bmp, sx, 0, sw, m.H, sx, 0, sw, m.H); continue; }
      if (ym > 0) s.drawImage(m.bmp, sx, 0, sw, ym, sx, 0, sw, ym); // above the break: untouched
      s.drawImage(m.bmp, sx, ym, sw, 1, sx, ym, sw, d); // the break, smeared into a drip
      s.drawImage(m.bmp, sx, ym, sw, m.H - ym, sx, ym + d, sw, m.H - ym); // below it: slid down
      // a rounded drop where the drip has run furthest, so the ends read as liquid
      const dl = i > 0 ? m.d[i - 1] : 0, dr = i < m.cols - 1 ? m.d[i + 1] : 0;
      if (d > m.cw * 1.5 && d >= dl - m.cw && d >= dr - m.cw) {
        s.beginPath(); s.arc(sx + sw / 2, ym + d, sw * 0.95, 0, Math.PI * 2); s.fill();
      }
    }
    // the bitmap is only a shape; colour it with the letter's current fill
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = ctx.fillStyle;
    s.fillRect(0, 0, m.W, Ht);
    s.globalCompositeOperation = 'source-over';
    ctx.drawImage(scratch, 0, 0, m.W, Ht, m.x0, m.y0, m.W / m.R, Ht / m.R);
    return true;
  },

  /** The liquid, over the letters: drawn as blobs and strokes on a layer, then merged by the goo filter. */
  front(ctx, w, colors: Record<ColorKey, RGB>, scale) {
    if (!drops.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of drops) {
      if (d.x - d.r < x0) x0 = d.x - d.r; if (d.y - d.r < y0) y0 = d.y - d.r;
      if (d.x + d.r > x1) x1 = d.x + d.r; if (d.y + d.r > y1) y1 = d.y + d.r;
    }
    const pad = w.fs * 0.12;
    const cw = ctx.canvas.width, chh = ctx.canvas.height;
    const X0 = clamp(Math.floor((x0 - pad) * scale), 0, cw), Y0 = clamp(Math.floor((y0 - pad) * scale), 0, chh);
    const X1 = clamp(Math.ceil((x1 + pad) * scale), 0, cw), Y1 = clamp(Math.ceil((y1 + pad) * scale), 0, chh);
    const bw = X1 - X0, bh = Y1 - Y0;
    if (bw <= 0 || bh <= 0) return;
    if (!layer) layer = document.createElement('canvas');
    if (layer.width < bw || layer.height < bh) { layer.width = Math.max(layer.width, bw); layer.height = Math.max(layer.height, bh); }
    const g = layer.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, bw, bh);
    g.setTransform(scale, 0, 0, scale, -X0, -Y0);
    const color = css(mix(colors.ink, colors.flower, 0.75));
    g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'round';
    for (const d of drops) {
      g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill();
      const k = d.link;
      if (k && Math.hypot(k.x - d.x, k.y - d.y) < (k.r + d.r) * 3) {
        g.lineWidth = (k.r + d.r) * 0.9;
        g.beginPath(); g.moveTo(k.x, k.y); g.lineTo(d.x, d.y); g.stroke();
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (typeof ctx.filter === 'string') { goo(w.fs * scale * 0.018); ctx.filter = 'url(#ll-goo)'; }
    ctx.drawImage(layer, 0, 0, bw, bh, X0, Y0, bw, bh);
    ctx.restore();
  },
};

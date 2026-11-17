import type { Letter, Material, World } from '../types';
import { calm, clamp, toLocal } from '../simulation';
import { fontOf } from '../layout';

/**
 * Heat. A letter is cut into thin vertical columns. Where you hover, each column gives way at that height:
 * what is above stays, what is below slides down, and the row at the break smears into a drip.
 * Press on a letter and pull: it stretches out of the letter like caramel, thinning as you go, until it snaps.
 * Left alone, everything slowly draws back up and the letter sets again.
 */

const LIFT = 0.3;
const SNAP = 2.5; // em: how far caramel stretches before it breaks
const RETRACT = 0.38; // seconds for a broken strand to pull back in

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

/** A strand of caramel pulled out of a letter. Coordinates are the letter's local px. */
interface Taffy {
  l: Letter;
  ax: number; ay: number; // where it was grabbed
  tx: number; ty: number; // the end in your hand
  snap: number; // when it broke; -1 while held
  sx: number; sy: number; // where the end was when it broke
}

const melts = new Map<Letter, Melt>();
let taffy: Taffy | null = null;
let scratch: HTMLCanvasElement | null = null;

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

function snap(w: World, t: Taffy) {
  if (t.snap >= 0) return;
  t.snap = w.t; t.sx = t.tx; t.sy = t.ty;
  const m = t.l.m;
  // the end that broke off falls as a little splash
  w.fx.splash(m[0] * t.tx + m[2] * t.ty + m[4], m[1] * t.tx + m[3] * t.ty + m[5], w.fs * 0.18, 'ink');
  w.sound.play('drip', 0.8);
  t.l.vsy -= 1.2; t.l.vsx += 0.8; // the letter recoils
}

/** Where the strand's end is now: in your hand, or pulling back in after it broke. */
function tip(w: World, t: Taffy): [number, number, number] {
  if (t.snap < 0) return [t.tx, t.ty, 1];
  const q = clamp((w.t - t.snap) / RETRACT, 0, 1), e = 1 - Math.pow(1 - q, 3);
  return [t.sx + (t.ax - t.sx) * e, t.sy + (t.ay - t.sy) * e, 1 - q * 0.6];
}

/**
 * Draws the caramel strand in local px with the current fill: thick where it leaves the letter, necking
 * in the middle, sagging under its own weight, with a drop at the end and a soft highlight along it.
 */
function strand(ctx: CanvasRenderingContext2D, fs: number, ax: number, ay: number, tx: number, ty: number, body: number) {
  const dx = tx - ax, dy = ty - ay, len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const thin = clamp(1 - len / (fs * SNAP * 1.05), 0.12, 1);
  const wa = (fs * 0.1 * thin + fs * 0.012) * body; // half width at the letter
  const wt = wa * 0.42; // at the end
  const wm = (wa + wt) * 0.5 * (0.35 + 0.65 * thin); // the neck
  const cx = ax + dx * 0.5, cy = ay + dy * 0.5 + len * 0.16; // sags downward
  ctx.beginPath();
  ctx.moveTo(ax + nx * wa, ay + ny * wa);
  ctx.quadraticCurveTo(cx + nx * wm, cy + ny * wm, tx + nx * wt, ty + ny * wt);
  ctx.lineTo(tx - nx * wt, ty - ny * wt);
  ctx.quadraticCurveTo(cx - nx * wm, cy - ny * wm, ax - nx * wa, ay - ny * wa);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(ax, ay, wa * 1.15, 0, Math.PI * 2); ctx.fill(); // where it joins the letter
  ctx.beginPath(); ctx.arc(tx, ty + wt * 0.4, wt * 1.5 + fs * 0.01, 0, Math.PI * 2); ctx.fill(); // the drop
  // a glossy highlight running along the strand
  const fill = ctx.fillStyle;
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = Math.max(1, wm * 0.3);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax + nx * wa * 0.45, ay + ny * wa * 0.45);
  ctx.quadraticCurveTo(cx + nx * wm * 0.45, cy + ny * wm * 0.45, tx + nx * wt * 0.5, ty + ny * wt * 0.5);
  ctx.stroke();
  ctx.fillStyle = fill;
}

export const melt: Material = {
  id: 'melt',
  accent: 'flower',
  spring: { k: 150, c: 20, rk: 150, rc: 20, sk: 200, sc: 20, limit: 0.2, lift: LIFT },

  ambient() { /* it only moves where it melts */ },

  enter() { melts.clear(); taffy = null; },

  reset(w) { melts.clear(); taffy = null; calm(w.letters); },

  update(w, dt) {
    const p = w.p, fs = w.fs;
    for (const k of melts.keys()) if (!w.letters.includes(k)) melts.delete(k);
    if (taffy && !w.letters.includes(taffy.l)) taffy = null;

    // the caramel: its end follows the hand with a little drag; past its limit it breaks
    if (taffy) {
      const t = taffy, l = t.l;
      if (t.snap < 0) {
        const [px, py] = toLocal(l, p.x, p.y);
        const q = Math.min(1, dt * 16);
        t.tx += (px - t.tx) * q; t.ty += (py - t.ty) * q;
        const dx = t.tx - t.ax, dy = t.ty - t.ay, len = Math.hypot(dx, dy);
        // the letter leans and stretches toward the pull
        l.tx += clamp(dx * 0.06, -fs * 0.12, fs * 0.12);
        l.ty += clamp(dy * 0.06, -fs * 0.12, fs * 0.12);
        l.rT += clamp((dx / fs) * 0.08, -0.15, 0.15);
        l.syT += clamp((len / fs) * 0.06, 0, 0.12);
        l.heatT = 1;
        // and softens around where it is held
        const m = state(w, l);
        const bx = (t.ax - m.x0) * m.R;
        for (let i = 0; i < m.cols; i++) {
          const f = 1 - Math.abs((i + 0.5) * m.cw - bx) / (fs * 0.18 * m.R);
          if (f > 0 && breakAt(m, i, (t.ay - m.y0) * m.R)) m.heat[i] = Math.max(m.heat[i], f * 0.12);
        }
        m.last = w.t;
        if (len > fs * 0.3) w.sound.play('squeak', Math.min(1, len / (fs * SNAP)));
        if (len > fs * SNAP) snap(w, t);
      } else if (w.t - t.snap > RETRACT) taffy = null;
    }

    for (const l of w.letters) {
      const gl = l.glyph;
      if (!gl) continue;
      const [lx, ly] = toLocal(l, p.x, p.y);
      const top = gl.box[1] * fs + LIFT * fs, bottom = gl.box[3] * fs + LIFT * fs;
      const left = gl.box[0] * fs - l.adv / 2, right = gl.box[2] * fs - l.adv / 2;
      const near = p.active && !p.down && lx > left - fs * 0.2 && lx < right + fs * 0.2 && ly > top - fs * 0.2 && ly < bottom + fs * 0.3;
      let m = melts.get(l);
      if (!m && !near) continue;
      m = state(w, l);
      const bx = (lx - m.x0) * m.R, by = (ly - m.y0) * m.R;
      const dMax = maxDrip(w, l, m);
      const grow = fs * m.R * (0.12 + 0.2 * w.inten);
      const cool = w.t - m.last > 0.9;
      let alive = taffy?.l === l, hot = 0;

      for (let i = 0; i < m.cols; i++) {
        if (near) {
          const f = Math.max(0, 1 - Math.abs((i + 0.5) * m.cw - bx) / (fs * 0.22 * m.R)) * (by >= 0 && by <= m.H ? 1 : 0.4);
          if (f > 0 && breakAt(m, i, by)) { m.heat[i] = Math.max(m.heat[i], f); m.last = w.t; }
        }
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
    const fs = w.fs, gl = hit.glyph;
    const [lx, ly] = toLocal(hit, w.p.x, w.p.y);
    // hold it by the ink you pressed on
    const ax = clamp(lx, gl.box[0] * fs - hit.adv / 2, gl.box[2] * fs - hit.adv / 2);
    const ay = clamp(ly, (gl.box[1] + LIFT) * fs, (gl.box[3] + LIFT) * fs);
    state(w, hit);
    taffy = { l: hit, ax, ay, tx: ax, ty: ay, snap: -1, sx: ax, sy: ay };
    w.sound.play('press');
  },

  up(w, _hit, click) {
    const p = w.p, fs = w.fs;
    if (taffy && taffy.snap < 0) {
      if (!click) { snap(w, taffy); return; }
      taffy = null; // a tap on a letter is a splash, not a pull
    }
    if (!click) return;
    // a splash: drops fly from the click, and the letters it lands on start to run
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

    // a puddle gathers under a letter that has run a lot, with a soft shine on it
    const pud = sum / (m.cols * w.fs * 1.1 * m.R);
    if (pud > 0.05) {
      const cx = m.x0 + m.W / m.R / 2, cy = m.y0 + (m.H + maxD) / m.R - w.fs * 0.03;
      const rx = (m.W / m.R / 2) * (0.3 + pud * 0.7), ry = w.fs * 0.022 * (0.5 + pud * 1.5);
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      const fill = ctx.fillStyle;
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.ellipse(cx - rx * 0.3, cy - ry * 0.35, rx * 0.35, ry * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fill;
    }
    ctx.drawImage(scratch, 0, 0, m.W, Ht, m.x0, m.y0, m.W / m.R, Ht / m.R);

    if (taffy?.l === l) {
      const [tx, ty, body] = tip(w, taffy);
      strand(ctx, w.fs, taffy.ax, taffy.ay, tx, ty, body);
    }
    return true;
  },
};

import type { ColorKey, Letter, Material, World } from '../types';
import { calm, clamp, toLocal, tuneF } from '../simulation';
import { css, mix } from '../color';
import { blit, glyphLayer } from '../glyphLayer';

/**
 * A lava lamp. Each letter is a glass filled with slow, glowing blobs of colour that rise, sink and merge.
 * Near the pointer the blobs drift toward it and glow; a click heats the lamp — the blobs swell and race
 * upward, and the letter wobbles; holding stirs them round your hand until their colours run together.
 */

const LIFT = 0.3;
const COLS: ColorKey[] = ['flower', 'spark', 'stem'];

interface Blob { u: number; v: number; vu: number; vv: number; r: number; c: number; ph: number }
interface State { blobs: Blob[]; heat: number; fs: number }
const states = new Map<Letter, State>();
let stir = 0;
let clock = 0;

function state(w: World, l: Letter) {
  let s = states.get(l);
  if (!s || s.fs !== w.fs) {
    const blobs: Blob[] = [];
    for (let i = 0; i < 5; i++) blobs.push({ u: Math.random(), v: Math.random(), vu: 0, vv: (Math.random() < 0.5 ? -1 : 1) * 0.05, r: 0.22 + Math.random() * 0.2, c: i % 3, ph: Math.random() * 6.28 });
    s = { blobs, heat: 0, fs: w.fs };
    states.set(l, s);
  }
  return s;
}

export const lava: Material = {
  id: 'lava',
  accent: 'flower',
  spring: { k: 60, c: 6.5, rk: 55, rc: 6, sk: 110, sc: 7, limit: 0.45, lift: LIFT },

  ambient(l, w, out) {
    const b = Math.sin(w.t * 1.1 * w.speed + l.phase) * 0.012 * w.amb;
    out.sy += b; out.sx -= b * 0.6;
  },

  enter() { states.clear(); stir = 0; },
  reset(w) { states.clear(); stir = 0; calm(w.letters); },

  update(w: World, dt) {
    const p = w.p, fs = w.fs, flow = tuneF(w.tune, 2.5);
    clock = w.t;
    stir += ((p.down ? 1 : 0) - stir) * Math.min(1, dt * (p.down ? 2 : 3));
    for (const k of states.keys()) if (!w.letters.includes(k)) states.delete(k);
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const s = state(w, l);
      s.heat = Math.max(0, s.heat - dt * 0.5);
      const g = l.glyph.box;
      const bw = (g[2] - g[0]) * fs, bh = (g[3] - g[1]) * fs;
      const x0 = g[0] * fs - l.adv / 2, y0 = (g[1] + LIFT) * fs;
      const [px, py] = toLocal(l, p.x, p.y);
      const pu = (px - x0) / bw, pv = (py - y0) / bh;
      const near = p.active ? clamp(1 - Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) / (fs * 1.2), 0, 1) : 0;
      for (const b of s.blobs) {
        // warm blobs rise, cool ones sink, turning round at the ends of the glass
        const rise = 0.06 * flow * (1 + s.heat * 4);
        b.vv += ((b.vv < 0 ? -rise : rise) - b.vv) * Math.min(1, dt * 1.5);
        if (b.v < 0.05) b.vv = Math.abs(b.vv); else if (b.v > 0.95) b.vv = -Math.abs(b.vv);
        b.vu += Math.sin(clock * 0.7 + b.ph) * 0.02 * dt;
        if (near > 0) { // drawn toward the hand
          b.vu += (pu - b.u) * 0.9 * near * dt; b.vv += (pv - b.v) * 0.9 * near * dt;
        }
        if (stir > 0.02 && near > 0) { // stirred round the hand
          const du = b.u - pu, dv = b.v - pv;
          b.vu += -dv * 2.2 * stir * dt; b.vv += du * 2.2 * stir * dt;
        }
        b.vu *= 1 - Math.min(1, dt * 1.2);
        b.u = clamp(b.u + b.vu * dt, 0, 1); b.v = clamp(b.v + b.vv * dt, 0, 1);
      }
      l.heatT = Math.max(l.heatT, near * 0.25);
    }
  },

  down(w) { w.sound.play('press'); },

  up(w, _hit, click) {
    if (!click) return;
    // heat the lamp: blobs swell and race up, the glass wobbles
    const p = w.p, fs = w.fs;
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const f = clamp(1 - Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) / (fs * 1.8), 0, 1) * w.inten;
      if (f <= 0) continue;
      const s = state(w, l);
      s.heat = Math.min(1.5, s.heat + f);
      for (const b of s.blobs) b.vv = -Math.abs(b.vv) - 0.4 * f;
      l.vsy += 2 * f; l.vsx -= 1.2 * f;
    }
    w.fx.pulse(p.x, p.y, 'flower', fs * 0.45);
    w.sound.play('boing', w.inten);
  },

  drawLetter(ctx, l, w, colors, liftPx) {
    const s = states.get(l);
    if (!s) return false;
    const fs = w.fs, L = glyphLayer(ctx, l, liftPx, fs, 0.02);
    if (!L) return false;
    const g = L.g, bw = L.x1 - L.x0, bh = L.y1 - L.y0;
    g.globalCompositeOperation = 'source-atop';
    // the liquid in the glass: darker at the bottom, lighter at the top
    const base = g.createLinearGradient(0, L.y0, 0, L.y1);
    base.addColorStop(0, css(mix(colors.flower, colors.bg, 0.45)));
    base.addColorStop(1, css(mix(colors.flower, colors.bg, 0.72)));
    g.fillStyle = base; g.fillRect(L.x0, L.y0, bw, bh);
    // the blobs: rounded, glowing at the core, with soft but definite edges
    const swell = 1 + s.heat * 0.35 + stir * 0.15;
    for (const b of s.blobs) {
      const x = L.x0 + b.u * bw, y = L.y0 + b.v * bh;
      const r = b.r * 0.85 * Math.max(bw, bh) * swell * (1 + 0.08 * Math.sin(clock * 1.3 + b.ph));
      const col = stir > 0.3 ? mix(colors[COLS[b.c]], colors[COLS[(b.c + 1) % 3]], (Math.sin(clock * 2 + b.ph) * 0.5 + 0.5) * stir) : colors[COLS[b.c]];
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, css(mix(col, [255, 255, 255], 0.35), 0.95)); grad.addColorStop(0.5, css(col, 0.9)); grad.addColorStop(0.72, css(col, 0.75)); grad.addColorStop(0.86, css(col, 0));
      g.fillStyle = grad; g.beginPath(); g.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2); g.fill();
    }
    // a glassy highlight down one side
    g.globalCompositeOperation = 'source-atop';
    const gl = g.createLinearGradient(L.x0, 0, L.x1, 0);
    gl.addColorStop(0.08, 'rgba(255,255,255,0)'); gl.addColorStop(0.18, 'rgba(255,255,255,0.22)'); gl.addColorStop(0.3, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.fillRect(L.x0, L.y0, bw, bh);
    blit(ctx, L);
    return true;
  },
};

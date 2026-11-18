import type { Letter, Material, World } from '../types';
import { calm, clamp, tuneF } from '../simulation';
import { blit, glyphLayer, type Layer } from '../glyphLayer';

/**
 * A bad signal. Near the pointer, letters tear into bands that slip sideways, with their red and cyan
 * channels pulling apart. A click drops the letters into coarse pixels that resolve back, block by block.
 * Holding corrupts everything: the word jumps, flickers and breaks up until you let go.
 */

const LIFT = 0.3;
const RED = 'rgba(255,40,90,', CYAN = 'rgba(40,225,255,';

interface Band { y: number; h: number; dx: number }
interface State { amount: number; bands: Band[]; next: number; pixelAt: number }
const states = new Map<Letter, State>();
let hold = 0;
let tiny: HTMLCanvasElement | null = null;

const st = (l: Letter) => {
  let s = states.get(l);
  if (!s) { s = { amount: 0, bands: [], next: 0, pixelAt: -10 }; states.set(l, s); }
  return s;
};

/** Lays the layer down in horizontal bands, each slipped sideways by its own amount. */
function torn(ctx: CanvasRenderingContext2D, L: Layer, bands: Band[]) {
  const w = L.W / L.kx;
  let y = 0;
  const cuts = bands.map((b) => ({ y: Math.round(b.y * L.H), h: Math.max(2, Math.round(b.h * L.H)), dx: b.dx })).sort((a, b) => a.y - b.y);
  for (const c of cuts) {
    if (c.y > y) ctx.drawImage(L.c, 0, y, L.W, c.y - y, L.x0, L.y0 + y / L.ky, w, (c.y - y) / L.ky);
    const top = Math.max(c.y, y), h = Math.min(L.H - top, c.y + c.h - top);
    if (h > 0) ctx.drawImage(L.c, 0, top, L.W, h, L.x0 + c.dx, L.y0 + top / L.ky, w, h / L.ky);
    y = Math.max(y, c.y + c.h);
  }
  if (y < L.H) ctx.drawImage(L.c, 0, y, L.W, L.H - y, L.x0, L.y0 + y / L.ky, w, (L.H - y) / L.ky);
}

/** Lays the layer down as coarse pixels, `block` device pixels across. */
function pixelated(ctx: CanvasRenderingContext2D, L: Layer, block: number) {
  const tw = Math.max(1, Math.round(L.W / block)), th = Math.max(1, Math.round(L.H / block));
  if (!tiny) tiny = document.createElement('canvas');
  if (tiny.width < tw || tiny.height < th) { tiny.width = Math.max(tiny.width, tw); tiny.height = Math.max(tiny.height, th); }
  const t = tiny.getContext('2d')!;
  t.clearRect(0, 0, tw, th);
  t.drawImage(L.c, 0, 0, L.W, L.H, 0, 0, tw, th);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiny, 0, 0, tw, th, L.x0, L.y0, L.W / L.kx, L.H / L.ky);
  ctx.imageSmoothingEnabled = smooth;
}

export const glitch: Material = {
  id: 'glitch',
  accent: 'stem',
  spring: { k: 160, c: 14, rk: 140, rc: 13, sk: 200, sc: 15, limit: 0.4, lift: LIFT },

  ambient() { /* still, until something interferes */ },

  enter() { states.clear(); hold = 0; },
  reset(w) { states.clear(); hold = 0; calm(w.letters); },

  update(w: World, dt) {
    const p = w.p, fs = w.fs, chaos = w.inten * tuneF(w.tune, 2.5);
    hold += ((p.down ? 1 : 0) - hold) * Math.min(1, dt * (p.down ? 2.5 : 6));
    for (const k of states.keys()) if (!w.letters.includes(k)) states.delete(k);
    let loud = 0;
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const s = st(l);
      const d = p.active ? Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) : Infinity;
      const near = clamp(1 - d / (fs * 1.1), 0, 1);
      // a faint, rare flicker at rest, interference near the pointer, everything while holding
      const target = Math.max(near * 0.8, hold * clamp(1.2 - d / (fs * 4), 0.5, 1)) * chaos + (Math.random() < dt * 0.15 ? 0.6 : 0);
      s.amount += (target - s.amount) * Math.min(1, dt * (target > s.amount ? 12 : 5));
      // the tears change in bursts, faster the worse the signal
      if (w.t > s.next) {
        s.next = w.t + 0.04 + Math.random() * (0.25 - 0.2 * clamp(s.amount, 0, 1));
        s.bands = [];
        const n = s.amount > 0.05 ? 1 + Math.floor(Math.random() * (1 + s.amount * 4)) : 0;
        for (let i = 0; i < n; i++) s.bands.push({ y: Math.random(), h: 0.04 + Math.random() * 0.18, dx: (Math.random() - 0.5) * fs * 0.35 * s.amount });
        if (hold > 0.3 && near + hold > 0.5) { // corrupted: the letter itself jumps
          l.tx += (Math.random() - 0.5) * fs * 0.12 * hold; l.ty += (Math.random() - 0.5) * fs * 0.06 * hold;
        }
      }
      loud = Math.max(loud, s.amount);
    }
    if (loud > 0.3 && Math.random() < dt * (3 + loud * 6)) w.sound.play('glitch', loud);
  },

  down(w) { w.sound.play('glitch', 0.8); },

  up(w, _hit, click) {
    if (!click) return;
    // the letters near the click drop into coarse pixels, then resolve
    const p = w.p, fs = w.fs;
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const d = Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y);
      if (d < fs * 1.6) st(l).pixelAt = w.t + d / (fs * 8);
    }
    w.fx.burst(p.x, p.y, 'stem', fs * 0.3);
    w.sound.play('glitch', 1);
  },

  drawLetter(ctx, l, w, colors, liftPx) {
    const s = states.get(l);
    if (!s) return false;
    const fs = w.fs, age = w.t - s.pixelAt;
    const pixel = age >= 0 && age < 0.8 ? Math.round(Math.max(1, (1 - age / 0.8) ** 2 * fs * 0.14)) : 0;
    const a = clamp(s.amount, 0, 1.5);
    if (a < 0.03 && !pixel) return false;
    // the channels pull apart
    const split = fs * 0.03 * a + (pixel ? fs * 0.02 : 0);
    if (split > 0.3) {
      const a0 = ctx.globalAlpha, fill = ctx.fillStyle;
      ctx.globalAlpha = a0 * Math.min(1, 0.4 + a * 0.4);
      ctx.fillStyle = RED + '0.85)'; ctx.fillText(l.ch, -l.adv / 2 - split, liftPx);
      ctx.fillStyle = CYAN + '0.85)'; ctx.fillText(l.ch, -l.adv / 2 + split, liftPx);
      ctx.globalAlpha = a0; ctx.fillStyle = fill;
    }
    // corrupted: now and then the letter flashes in its inverse
    if (hold > 0.4 && Math.random() < 0.08 * hold) ctx.fillStyle = `rgb(${colors.bg.map((v) => v | 0).join(',')})`;
    const L = glyphLayer(ctx, l, liftPx, fs, 0.25);
    if (!L) return true;
    if (pixel > 1.5) pixelated(ctx, L, pixel * L.kx); // pixel is in stage px; blocks are device px
    else if (s.bands.length) torn(ctx, L, s.bands);
    else blit(ctx, L);
    return true;
  },
};

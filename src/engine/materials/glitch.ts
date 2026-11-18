import type { Letter, Material, World } from '../types';
import { calm, clamp, tuneF } from '../simulation';
import { css, mix, type RGB } from '../color';
import { blit, glyphLayer, type Layer } from '../glyphLayer';

/**
 * A bad signal. Near the pointer, letters tear into bands that slip sideways, with two of the palette's
 * colours pulling apart like split channels. A click sends a wave of interference rolling out along the
 * word: each letter breaks up hard as it passes, then settles. Holding corrupts everything: the word jumps,
 * flickers and breaks up until you let go.
 */

const LIFT = 0.3;
const WAVE_LIFE = 1.1; // seconds
const WAVE_SPEED = 3.2; // em per second

interface Band { y: number; h: number; dx: number }
interface State { amount: number; bands: Band[]; next: number; shift: number }
interface Wave { x: number; t0: number; power: number }
const states = new Map<Letter, State>();
const waves: Wave[] = [];
let hold = 0;

const st = (l: Letter) => {
  let s = states.get(l);
  if (!s) { s = { amount: 0, bands: [], next: 0, shift: 0 }; states.set(l, s); }
  return s;
};

/** How strongly a click's wave is passing over a point right now. */
function waveAt(w: World, x: number) {
  let a = 0;
  for (const v of waves) {
    const age = w.t - v.t0, d = Math.abs(x - v.x) - age * WAVE_SPEED * w.fs;
    a += v.power * Math.exp(-((d / (w.fs * 0.55)) ** 2)) * (1 - age / WAVE_LIFE);
  }
  return a;
}

/** Of the palette's three accents, the two most unlike each other: they make the clearest split. */
function channels(a: RGB, b: RGB, c: RGB): [RGB, RGB] {
  const d = (x: RGB, y: RGB) => (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2;
  const ab = d(a, b), ac = d(a, c), bc = d(b, c);
  return ab >= ac && ab >= bc ? [a, b] : ac >= bc ? [a, c] : [b, c];
}

/** Lays the layer down in horizontal bands, each slipped sideways by its own amount. */
function torn(ctx: CanvasRenderingContext2D, L: Layer, bands: Band[], shift: number) {
  const w = L.W / L.kx;
  const cuts = bands.map((b) => ({ y: Math.round(b.y * L.H), h: Math.max(1, Math.round(b.h * L.H)), dx: b.dx })).sort((a, b) => a.y - b.y);
  let y = 0;
  const strip = (from: number, h: number, dx: number) => {
    if (h > 0) ctx.drawImage(L.c, 0, from, L.W, h, L.x0 + shift + dx, L.y0 + from / L.ky, w, h / L.ky);
  };
  for (const c of cuts) {
    if (c.y > y) strip(y, c.y - y, 0);
    const top = Math.max(c.y, y);
    strip(top, Math.min(L.H - top, c.y + c.h - top), c.dx);
    y = Math.max(y, c.y + c.h);
  }
  if (y < L.H) strip(y, L.H - y, 0);
}

export const glitch: Material = {
  id: 'glitch',
  accent: 'stem',
  spring: { k: 160, c: 14, rk: 140, rc: 13, sk: 200, sc: 15, limit: 0.4, lift: LIFT },

  ambient() { /* still, until something interferes */ },

  enter() { states.clear(); waves.length = 0; hold = 0; },
  reset(w) { states.clear(); waves.length = 0; hold = 0; calm(w.letters); },

  update(w: World, dt) {
    const p = w.p, fs = w.fs, chaos = w.inten * tuneF(w.tune, 2.5);
    hold += ((p.down ? 1 : 0) - hold) * Math.min(1, dt * (p.down ? 2.5 : 6));
    for (let i = waves.length - 1; i >= 0; i--) if (w.t - waves[i].t0 > WAVE_LIFE) waves.splice(i, 1);
    for (const k of states.keys()) if (!w.letters.includes(k)) states.delete(k);
    let loud = 0;
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const s = st(l);
      const d = p.active ? Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) : Infinity;
      const near = clamp(1 - d / (fs * 1.1), 0, 1);
      const wave = waveAt(w, w.cx(l));
      // a faint, rare flicker at rest; interference near the pointer; the click's wave; everything while holding
      const target = Math.max(near * 0.8, hold * clamp(1.2 - d / (fs * 4), 0.5, 1), wave * 1.3) * chaos + (Math.random() < dt * 0.15 ? 0.6 : 0);
      s.amount += (target - s.amount) * Math.min(1, dt * (target > s.amount ? 14 : 5));
      // the tears change in bursts, faster the worse the signal
      if (w.t > s.next) {
        const a = clamp(s.amount, 0, 1.6);
        s.next = w.t + 0.035 + Math.random() * (0.22 - 0.18 * clamp(a, 0, 1));
        s.bands = [];
        if (a > 0.05) {
          const wide = 1 + Math.floor(Math.random() * (1 + a * 3)); // a few thick slips
          for (let i = 0; i < wide; i++) s.bands.push({ y: Math.random(), h: 0.05 + Math.random() * 0.2, dx: (Math.random() - 0.5) * fs * 0.6 * a });
          const fine = Math.floor(Math.random() * (2 + a * 6)); // and thin scan-line slips
          for (let i = 0; i < fine; i++) s.bands.push({ y: Math.random(), h: 0.008 + Math.random() * 0.025, dx: (Math.random() - 0.5) * fs * 0.9 * a });
        }
        // the whole letter jerks sideways now and then
        s.shift = Math.random() < 0.35 * a ? (Math.random() - 0.5) * fs * 0.12 * a : 0;
        if (hold > 0.3 && near + hold > 0.5) { // corrupted: the letter itself jumps
          l.tx += (Math.random() - 0.5) * fs * 0.12 * hold; l.ty += (Math.random() - 0.5) * fs * 0.06 * hold;
        }
        if (wave > 0.3) l.skT += (Math.random() - 0.5) * 0.3 * wave; // a shear as the wave goes through
      }
      loud = Math.max(loud, s.amount);
    }
    if (loud > 0.3 && Math.random() < dt * (3 + loud * 6)) w.sound.play('glitch', loud);
  },

  down(w) { w.sound.play('glitch', 0.8); },

  up(w, _hit, click) {
    if (!click) return;
    waves.push({ x: w.p.x, t0: w.t, power: 0.6 + 0.6 * w.inten });
    if (waves.length > 4) waves.shift();
    w.fx.burst(w.p.x, w.p.y, 'stem', w.fs * 0.3);
    w.sound.play('glitch', 1);
  },

  drawLetter(ctx, l, w, colors, liftPx) {
    const s = states.get(l);
    if (!s) return false;
    const fs = w.fs, a = clamp(s.amount, 0, 1.6);
    if (a < 0.03) return false;
    // two of the palette's colours pull apart like split channels, toned so they read on the background
    const split = fs * 0.035 * a;
    if (split > 0.3) {
      const a0 = ctx.globalAlpha, fill = ctx.fillStyle;
      const dark = colors.bg[0] * 0.3 + colors.bg[1] * 0.59 + colors.bg[2] * 0.11 < 110;
      const tone = (c: RGB) => css(mix(c, dark ? [255, 255, 255] : [0, 0, 0], 0.15), 0.85);
      ctx.globalAlpha = a0 * Math.min(1, 0.45 + a * 0.4);
      const [c1, c2] = channels(colors.flower, colors.stem, colors.spark);
      ctx.fillStyle = tone(c1); ctx.fillText(l.ch, -l.adv / 2 - split + s.shift, liftPx);
      ctx.fillStyle = tone(c2); ctx.fillText(l.ch, -l.adv / 2 + split + s.shift, liftPx);
      ctx.globalAlpha = a0; ctx.fillStyle = fill;
    }
    // corrupted: now and then the letter flashes in its inverse
    if (hold > 0.4 && Math.random() < 0.08 * hold) ctx.fillStyle = css(colors.bg);
    const L = glyphLayer(ctx, l, liftPx, fs, 0.35);
    if (!L) return true;
    if (s.bands.length || s.shift) torn(ctx, L, s.bands, s.shift);
    else blit(ctx, L);
    return true;
  },
};

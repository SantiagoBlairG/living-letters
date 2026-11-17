import type { Letter, SpringSpec } from './types';

/** Damped springs on every channel of every letter, integrated with a fixed-size substep. */

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function makeLetter(ch: string, index: number): Letter {
  return {
    ch, index, glyph: null, adv: 0, bx: 0,
    ox: 0, oy: 0, vx: 0, vy: 0, rot: 0, vr: 0,
    sx: 1, vsx: 0, sy: 1, vsy: 0, sk: 0, vsk: 0,
    fx: 0, fy: 0, tx: 0, ty: 0, rT: 0, sxT: 1, syT: 1, skT: 0, kMul: 1,
    heat: 0, heatT: 0, alpha: 1, delay: 0,
    phase: Math.random() * Math.PI * 2, phase2: Math.random() * Math.PI * 2,
    m: [1, 0, 0, 1, 0, 0],
  };
}

export function resetInputs(letters: Letter[]) {
  for (const l of letters) {
    l.fx = l.fy = 0; l.tx = l.ty = 0;
    l.rT = 0; l.sxT = 1; l.syT = 1; l.skT = 0;
    l.kMul = 1; l.heatT = 0;
  }
}

export function integrate(letters: Letter[], s: SpringSpec, dt: number, fs: number) {
  const steps = Math.max(1, Math.min(6, Math.ceil(dt * 120)));
  const h = dt / steps;
  const lim = s.limit * fs;
  const vmax = fs * 14;
  for (const l of letters) {
    if (l.delay > 0) { l.delay -= dt; continue; }
    const k = s.k * l.kMul;
    const c = s.c * Math.sqrt(l.kMul);
    for (let i = 0; i < steps; i++) {
      l.vx += (l.fx + k * (l.tx - l.ox) - c * l.vx) * h;
      l.vy += (l.fy + k * (l.ty - l.oy) - c * l.vy) * h;
      l.ox += l.vx * h; l.oy += l.vy * h;
      l.vr += (s.rk * (l.rT - l.rot) - s.rc * l.vr) * h; l.rot += l.vr * h;
      l.vsx += (s.sk * (l.sxT - l.sx) - s.sc * l.vsx) * h; l.sx += l.vsx * h;
      l.vsy += (s.sk * (l.syT - l.sy) - s.sc * l.vsy) * h; l.sy += l.vsy * h;
      l.vsk += (s.sk * (l.skT - l.sk) - s.sc * l.vsk) * h; l.sk += l.vsk * h;
    }
    // hard guarantees: nothing leaves the stage, nothing becomes unreadable
    const d = Math.hypot(l.ox, l.oy);
    if (d > lim) { const q = lim / d; l.ox *= q; l.oy *= q; l.vx *= 0.5; l.vy *= 0.5; }
    const v = Math.hypot(l.vx, l.vy);
    if (v > vmax) { l.vx *= vmax / v; l.vy *= vmax / v; }
    if (l.sx < 0.6 || l.sx > 1.6) { l.sx = clamp(l.sx, 0.6, 1.6); l.vsx *= 0.3; }
    if (l.sy < 0.6 || l.sy > 1.6) { l.sy = clamp(l.sy, 0.6, 1.6); l.vsy *= 0.3; }
    if (Math.abs(l.rot) > 0.5) { l.rot = clamp(l.rot, -0.5, 0.5); l.vr *= 0.3; }
    if (Math.abs(l.sk) > 0.5) { l.sk = clamp(l.sk, -0.5, 0.5); l.vsk *= 0.3; }
    l.heat += (l.heatT - l.heat) * (1 - Math.exp(-dt * 9));
    l.alpha += (1 - l.alpha) * (1 - Math.exp(-dt * 9));
  }
}

/** Kill momentum without snapping — used when the material changes. */
export function calm(letters: Letter[]) {
  for (const l of letters) {
    l.vx *= 0.25; l.vy *= 0.25; l.vr *= 0.25;
    l.vsx *= 0.25; l.vsy *= 0.25; l.vsk *= 0.25;
  }
}

export function rest(letters: Letter[]) {
  for (const l of letters) {
    l.ox = l.oy = l.vx = l.vy = 0; l.rot = l.vr = 0;
    l.sx = l.sy = 1; l.vsx = l.vsy = 0; l.sk = l.vsk = 0; l.heat = 0;
  }
}

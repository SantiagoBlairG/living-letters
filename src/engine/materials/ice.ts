import type { Letter, Material, World } from '../types';
import { calm, tuneF } from '../simulation';
import { css, mix, type RGB } from '../color';

/**
 * Cold. Near the pointer, frost grows out of the letters' edges in branching crystals. A click freezes the
 * letters it reaches solid — pale, stiff, rimed all over. Holding is warmth: the frost under the hand melts
 * and drips, and when you let go it freezes over again. Left alone, frost slowly sublimates away.
 */

const LIFT = 0.3;
const ICE: RGB = [206, 236, 255];

interface Crystal { x: number; y: number; nx: number; ny: number; len: number; branches: number[]; a: number }
interface State { crystals: Crystal[]; frozen: number; warm: number; refreeze: number; fs: number }
interface Drop { x: number; y: number; vy: number; age: number }

const states = new Map<Letter, State>();
const drops: Drop[] = [];

function build(w: World, l: Letter): State {
  const e = l.glyph!.edges, n = e.length / 4, fs = w.fs;
  const k = Math.min(30, n), step = n / k;
  const crystals: Crystal[] = [];
  for (let i = 0; i < k; i++) {
    const j = Math.floor(i * step + Math.random() * step * 0.5) * 4;
    const branches: number[] = [];
    const nb = 2 + Math.floor(Math.random() * 3);
    for (let b = 0; b < nb; b++) branches.push(0.25 + Math.random() * 0.6, (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.5));
    crystals.push({ x: e[j] * fs - l.adv / 2, y: (e[j + 1] + LIFT) * fs, nx: e[j + 2], ny: e[j + 3], len: fs * (0.05 + Math.random() * 0.08), branches, a: 0 });
  }
  return { crystals, frozen: 0, warm: 0, refreeze: 0, fs };
}

function state(w: World, l: Letter) {
  let s = states.get(l);
  if (!s || s.fs !== w.fs) { s = build(w, l); states.set(l, s); }
  return s;
}

/** A point on the letter, in stage px. */
const toStage = (l: Letter, x: number, y: number) => [l.m[0] * x + l.m[2] * y + l.m[4], l.m[1] * x + l.m[3] * y + l.m[5]];

export const ice: Material = {
  id: 'ice',
  accent: 'stem',
  spring: { k: 140, c: 16, rk: 130, rc: 15, sk: 200, sc: 18, limit: 0.35, lift: LIFT },

  ambient(l, w, out) {
    const s = states.get(l);
    const still = s ? 1 - s.frozen : 1; // frozen letters do not breathe
    out.y += Math.sin(w.t * 0.6 * w.speed + l.phase) * 0.006 * w.fs * w.amb * still;
  },

  enter() { states.clear(); drops.length = 0; },
  reset(w) { states.clear(); drops.length = 0; calm(w.letters); },

  update(w: World, dt) {
    const p = w.p, fs = w.fs;
    const grow = 1.4 * w.inten * tuneF(w.tune, 3);
    const R = fs * 0.7;
    for (const k of states.keys()) if (!w.letters.includes(k)) states.delete(k);
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const s = state(w, l);
      const near = p.active ? Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) < fs * 1.4 : false;
      const warming = p.down && near;
      s.warm += ((warming ? 1 : 0) - s.warm) * Math.min(1, dt * (warming ? 3 : 1.5));
      if (warming) s.refreeze = 1; // once warmed, it freezes over again when you let go
      for (const c of s.crystals) {
        const [cx, cy] = toStage(l, c.x, c.y);
        const d = p.active ? Math.hypot(cx - p.x, cy - p.y) : Infinity;
        if (warming && d < R * 1.3) c.a = Math.max(0, c.a - dt * 2.2); // melts under the hand
        else if (!p.down && d < R) c.a = Math.min(1, c.a + dt * grow * (1 - d / R)); // frost reaches for the hand
        else if (s.refreeze > 0 && !p.down) c.a = Math.min(1, c.a + dt * 0.9 * s.refreeze);
        else c.a = Math.max(s.frozen * 0.9, c.a - dt * 0.07); // sublimates, slowly
        // melting frost drips
        if (warming && c.a > 0.05 && Math.random() < dt * 4 && drops.length < 160) drops.push({ x: cx, y: cy, vy: fs * 0.2, age: 0 });
      }
      if (!p.down) s.refreeze = Math.max(0, s.refreeze - dt * 0.6);
      s.frozen = Math.max(0, s.frozen - dt * (warming ? 1.2 : 0.06));
      // a frozen letter is stiff and pale; a warm one sags a little
      l.kMul *= 1 + s.frozen * 2;
      l.syT -= s.warm * 0.05; l.ty += s.warm * fs * 0.03;
      if (s.warm > 0.3 && Math.random() < dt * 2) w.sound.play('drip', 0.2);
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.age += dt; d.vy += fs * 3 * dt; d.y += d.vy * dt;
      if (d.y > w.H + 10 || d.age > 2) drops.splice(i, 1);
    }
  },

  down(w) { w.sound.play('press'); },

  up(w, _hit, click) {
    if (!click) return;
    // a click freezes the letters it reaches solid
    const p = w.p, fs = w.fs, R = fs * 1.2;
    let any = false;
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const d = Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y);
      if (d > R) continue;
      const s = state(w, l);
      s.frozen = 1;
      for (const c of s.crystals) c.a = 1;
      l.vsx += 0.8; l.vsy -= 0.8; // a shiver as it seizes
      any = true;
    }
    w.fx.burst(p.x, p.y, 'stem', fs * 0.3);
    if (any) { w.sound.play('crack', 1); w.sound.play('flower', 0.6); }
  },

  drawLetter(ctx, l, w, colors, liftPx) {
    const s = states.get(l);
    if (!s) return false;
    const fs = w.fs;
    const icy = mix(colors.ink, ICE, 0.25 + 0.25 * colors.ink[0] / 255);
    if (s.frozen > 0.01) ctx.fillStyle = css(mix(colors.ink, icy, s.frozen * 0.8));
    ctx.fillText(l.ch, -l.adv / 2, liftPx);
    // the frost: a main needle along the edge's normal, with side branches, drawn as far as it has grown
    const frost = css(mix(icy, [255, 255, 255], 0.4), 0.85);
    ctx.strokeStyle = frost;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.8, fs * 0.006);
    const dy = liftPx - LIFT * fs;
    ctx.beginPath();
    for (const c of s.crystals) {
      if (c.a < 0.03) continue;
      const L = c.len * c.a, x = c.x, y = c.y + dy, nx = c.nx, ny = c.ny;
      ctx.moveTo(x, y); ctx.lineTo(x + nx * L, y + ny * L);
      for (let b = 0; b < c.branches.length; b += 2) {
        const at = c.branches[b] * L, side = c.branches[b + 1];
        const bx = x + nx * at, by = y + ny * at;
        const ang = Math.atan2(ny, nx) + side * 0.95, bl = (L - at) * 0.55;
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(ang) * bl, by + Math.sin(ang) * bl);
      }
    }
    ctx.stroke();
    if (s.frozen > 0.05) { // a glint of ice across a frozen letter
      const g = l.glyph!.box;
      const top = g[1] * fs + liftPx, bot = g[3] * fs + liftPx;
      const gl = ctx.createLinearGradient(-l.adv / 2, top, l.adv / 2, bot);
      gl.addColorStop(0.3, 'rgba(255,255,255,0)');
      gl.addColorStop(0.45, `rgba(255,255,255,${0.35 * s.frozen})`);
      gl.addColorStop(0.6, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl;
      ctx.fillText(l.ch, -l.adv / 2, liftPx);
    }
    return true;
  },

  /** Meltwater, over the letters. */
  front(ctx, w, colors) {
    if (!drops.length) return;
    ctx.fillStyle = css(mix(colors.stem, ICE, 0.5), 0.75);
    ctx.beginPath();
    for (const d of drops) {
      const r = Math.max(1.2, w.fs * 0.008);
      ctx.moveTo(d.x + r, d.y); ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  },
};


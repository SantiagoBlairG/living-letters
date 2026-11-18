import type { Letter, Material, World } from '../types';
import { calm, toLocal, tuneF } from '../simulation';
import { css, mix, type RGB } from '../color';
import { blit, glyphLayer } from '../glyphLayer';

/**
 * Cold. Near the pointer, frost creeps through the letter from the side you touch — a white, grainy rime
 * inside the ink. A click freezes the letters it reaches solid: icy white to pale blue, coated in a
 * translucent shell, with glints and fine cracks inside. Holding is warmth: the ice melts and drips, and
 * when you let go it freezes over again. Left alone, frost slowly fades.
 */

const LIFT = 0.3;
const ICE: RGB = [214, 238, 255];
const DEEP: RGB = [120, 175, 230];

interface State {
  cover: number; // how much of the letter the frost has reached, 0..1
  cx: number; cy: number; // where it spreads from, local px
  frozen: number; // solid ice, 0..1
  warm: number; refreeze: number;
  grain: Float32Array; cracks: number[][]; fs: number;
}
interface Drop { x: number; y: number; vy: number; age: number }

const states = new Map<Letter, State>();
const drops: Drop[] = [];

function build(w: World, l: Letter): State {
  const g = l.glyph!.box, fs = w.fs;
  const x0 = g[0] * fs - l.adv / 2, x1 = g[2] * fs - l.adv / 2, y0 = (g[1] + LIFT) * fs, y1 = (g[3] + LIFT) * fs;
  const grain = new Float32Array(220 * 3);
  for (let i = 0; i < 220; i++) { grain[i * 3] = x0 + Math.random() * (x1 - x0); grain[i * 3 + 1] = y0 + Math.random() * (y1 - y0); grain[i * 3 + 2] = Math.random(); }
  const cracks: number[][] = [];
  for (let i = 0; i < 4; i++) { // fine fractures running through the ice
    let x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0), a = Math.random() * Math.PI * 2;
    const pts = [x, y];
    for (let s = 0; s < 4; s++) { a += (Math.random() - 0.5) * 1.2; x += Math.cos(a) * fs * 0.08; y += Math.sin(a) * fs * 0.08; pts.push(x, y); }
    cracks.push(pts);
  }
  return { cover: 0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, frozen: 0, warm: 0, refreeze: 0, grain, cracks, fs };
}

function state(w: World, l: Letter) {
  let s = states.get(l);
  if (!s || s.fs !== w.fs) { s = build(w, l); states.set(l, s); }
  return s;
}

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
    const grow = 0.9 * w.inten * tuneF(w.tune, 3);
    for (const k of states.keys()) if (!w.letters.includes(k)) states.delete(k);
    for (const l of w.letters) {
      if (!l.glyph) continue;
      const s = state(w, l);
      const d = p.active ? Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) : Infinity;
      const near = d < fs * 0.8;
      const warming = p.down && d < fs * 1.2;
      s.warm += ((warming ? 1 : 0) - s.warm) * Math.min(1, dt * (warming ? 3 : 1.5));
      if (warming) {
        s.refreeze = 1;
        s.cover = Math.max(0, s.cover - dt * 1.4);
        s.frozen = Math.max(0, s.frozen - dt * 1.1);
        // meltwater runs off the bottom of the letter
        if ((s.cover > 0.05 || s.frozen > 0.05) && Math.random() < dt * 10 && drops.length < 160) {
          const e = l.glyph.edges, i = Math.floor(Math.random() * (e.length / 4)) * 4;
          if (e[i + 3] > 0.3) {
            const lx = e[i] * fs - l.adv / 2, ly = (e[i + 1] + LIFT) * fs;
            drops.push({ x: l.m[0] * lx + l.m[2] * ly + l.m[4], y: l.m[1] * lx + l.m[3] * ly + l.m[5], vy: fs * 0.1, age: 0 });
          }
        }
      } else if (near && !p.down) {
        // the frost creeps in from where the hand is
        if (s.cover < 0.05) { const [lx, ly] = toLocal(l, p.x, p.y); s.cx = lx; s.cy = ly; }
        s.cover = Math.min(1, s.cover + dt * grow * (1 - d / (fs * 0.8)));
      } else if (s.refreeze > 0 && !p.down) {
        s.cover = Math.min(1, s.cover + dt * 0.8 * s.refreeze);
        s.frozen = Math.min(1, s.frozen + dt * 0.5 * s.refreeze);
        s.refreeze = Math.max(0, s.refreeze - dt * 0.5);
      } else {
        s.cover = Math.max(s.frozen, s.cover - dt * 0.05); // frost fades slowly; ice stays a while
        s.frozen = Math.max(0, s.frozen - dt * 0.03);
      }
      l.kMul *= 1 + s.frozen * 2.5; // ice is stiff
      l.syT -= s.warm * 0.04; l.ty += s.warm * fs * 0.025;
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
    const p = w.p, fs = w.fs, R = fs * 1.2;
    let any = false;
    for (const l of w.letters) {
      if (!l.glyph) continue;
      if (Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) > R) continue;
      const s = state(w, l);
      s.frozen = 1; s.cover = 1;
      l.vsx += 0.8; l.vsy -= 0.8; // a shiver as it seizes
      any = true;
    }
    w.fx.burst(p.x, p.y, 'stem', fs * 0.3);
    if (any) { w.sound.play('crack', 1); w.sound.play('flower', 0.6); }
  },

  drawLetter(ctx, l, w, colors, liftPx) {
    const s = states.get(l);
    if (!s || (s.cover < 0.02 && s.frozen < 0.02)) return false;
    const fs = w.fs, f = s.frozen, dy = liftPx - LIFT * fs;
    // the ice coating: a translucent shell just outside the letter
    if (f > 0.03) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(mix(ICE, colors.bg, 0.15), 0.32 * f);
      ctx.lineWidth = fs * 0.045;
      ctx.strokeText(l.ch, -l.adv / 2, liftPx);
      ctx.strokeStyle = `rgba(255,255,255,${(0.35 * f).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, fs * 0.006);
      ctx.strokeText(l.ch, -l.adv / 2, liftPx);
      ctx.restore();
    }
    const L = glyphLayer(ctx, l, liftPx, fs);
    if (!L) return false;
    const g = L.g;
    g.globalCompositeOperation = 'source-atop';
    const y0 = L.y0, y1 = L.y1;
    if (f > 0.01) { // solid ice: icy white to a cold blue, deeper toward the bottom
      const body = g.createLinearGradient(0, y0, 0, y1);
      body.addColorStop(0, css(mix(colors.ink, [255, 255, 255], 0.6), f));
      body.addColorStop(0.55, css(ICE, f));
      body.addColorStop(1, css(DEEP, f * 0.95));
      g.fillStyle = body; g.fillRect(L.x0, y0, L.x1 - L.x0, y1 - y0);
    }
    // the rime: white and grainy, spreading from where the frost began
    const R = Math.hypot(L.x1 - L.x0, y1 - y0) * (0.15 + s.cover * 1.1);
    const rime = g.createRadialGradient(s.cx, s.cy + dy, 0, s.cx, s.cy + dy, R);
    rime.addColorStop(0, `rgba(240,250,255,${(0.75 * s.cover).toFixed(3)})`);
    rime.addColorStop(0.7, `rgba(225,242,255,${(0.45 * s.cover).toFixed(3)})`);
    rime.addColorStop(1, 'rgba(225,242,255,0)');
    g.fillStyle = rime; g.fillRect(L.x0, y0, L.x1 - L.x0, y1 - y0);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < s.grain.length; i += 3) {
      const gx = s.grain[i], gy = s.grain[i + 1] + dy;
      if (Math.hypot(gx - s.cx, gy - s.cy - dy) > R * 0.85 && f < 0.5) continue;
      const r = fs * (0.004 + 0.006 * s.grain[i + 2]);
      g.globalAlpha = Math.max(s.cover, f) * (0.3 + 0.5 * s.grain[i + 2]);
      g.fillRect(gx - r, gy - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    if (f > 0.05) { // glints across the surface and fine cracks inside
      const gl = g.createLinearGradient(L.x0, y0, L.x1, y1);
      gl.addColorStop(0.25, 'rgba(255,255,255,0)'); gl.addColorStop(0.36, `rgba(255,255,255,${(0.55 * f).toFixed(3)})`);
      gl.addColorStop(0.42, 'rgba(255,255,255,0)'); gl.addColorStop(0.6, 'rgba(255,255,255,0)');
      gl.addColorStop(0.64, `rgba(255,255,255,${(0.3 * f).toFixed(3)})`); gl.addColorStop(0.68, 'rgba(255,255,255,0)');
      g.fillStyle = gl; g.fillRect(L.x0, y0, L.x1 - L.x0, y1 - y0);
      g.strokeStyle = `rgba(255,255,255,${(0.5 * f).toFixed(3)})`;
      g.lineWidth = Math.max(0.6, fs * 0.004);
      g.beginPath();
      for (const c of s.cracks) { g.moveTo(c[0], c[1] + dy); for (let i = 2; i < c.length; i += 2) g.lineTo(c[i], c[i + 1] + dy); }
      g.stroke();
    }
    blit(ctx, L);
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


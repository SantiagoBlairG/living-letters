import type { Letter, Material, World } from '../types';
import { calm, clamp, toLocal, tuneF } from '../simulation';
import { css, mix, type RGB } from '../color';
import { ASC, MS, PAD_X } from '../layout';

/**
 * The four elements, one at a time (chosen in the panel, with ↑ ↓, or with the mouse wheel).
 *  Fire  — hover sets letters alight and flames rise from their tops; click throws a fireball; drag leaves fire behind.
 *  Air   — hover makes letters flutter like paper; click raises a tornado that lifts and spins them; drag is a gust.
 *  Earth — hover turns letters to stone and they tremble; click is an earthquake; drag cracks the stone.
 *  Water — a cloud follows the hand and rains on the letters; click is a downpour; drag moves the storm.
 */

const LIFT = 0.3;
const TAU = Math.PI * 2;
const FIRE: RGB[] = [[255, 214, 90], [255, 138, 31], [232, 56, 28]];
const STONE: RGB = [128, 118, 108];
const VORTEX = 2.6; // seconds a tornado lasts
const CRACK_LIFE = 6;

// particle kinds
const FLAME = 0, EMBER = 1, STREAK = 2, DUST = 3, ROCK = 4, RAIN = 5, SPLASH = 6;

interface Part { k: number; x: number; y: number; vx: number; vy: number; age: number; max: number; size: number; rot: number }
interface LetterState {
  fire: number; air: number; stone: number; wet: number;
  cracks: { pts: number[]; t: number }[];
  speck: Float32Array | null;
}

const parts: Part[] = [];
const states = new Map<Letter, LetterState>();
let vortex: { x: number; y: number; t0: number } | null = null;
let quake = 0, pourUntil = -1, cloudX = 0, cloudY = 0, cloudA = 0, rainAcc = 0;
let lastHit: Letter | null = null;

function emit(k: number, x: number, y: number, vx: number, vy: number, max: number, size: number) {
  if (parts.length > 1200) parts.splice(0, 150);
  parts.push({ k, x, y, vx, vy, age: 0, max, size, rot: Math.random() * TAU });
}

/** Emits `rate` per second on average, as a whole number per frame. */
const count = (rate: number, dt: number) => { const n = rate * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };

function state(l: Letter): LetterState {
  let s = states.get(l);
  if (!s) { s = { fire: 0, air: 0, stone: 0, wet: 0, cracks: [], speck: null }; states.set(l, s); }
  return s;
}

const worldOf = (l: Letter, lx: number, ly: number): [number, number] =>
  [l.m[0] * lx + l.m[2] * ly + l.m[4], l.m[1] * lx + l.m[3] * ly + l.m[5]];

/** A random point on the glyph's outline whose normal points up (ny < -0.25) or down (> 0.3). */
function edgePoint(w: World, l: Letter, up: boolean): [number, number] | null {
  const e = l.glyph!.edges, n = e.length / 4;
  for (let t = 0; t < 8 && n; t++) {
    const i = ((Math.random() * n) | 0) * 4;
    if (up ? e[i + 3] < -0.25 : e[i + 3] > 0.3) return worldOf(l, e[i] * w.fs - l.adv / 2, (e[i + 1] + LIFT) * w.fs);
  }
  return null;
}

/** Spots inside the ink, for the grain of stone. */
function speckles(w: World, l: Letter) {
  const g = l.glyph!, fs = w.fs, pts: number[] = [];
  for (let t = 0; t < 600 && pts.length < 120; t++) {
    const ex = g.box[0] + Math.random() * (g.box[2] - g.box[0]), ey = g.box[1] + Math.random() * (g.box[3] - g.box[1]);
    const mx = Math.round((ex + PAD_X) * MS), my = Math.round((ey + ASC) * MS);
    if (mx >= 0 && my >= 0 && mx < g.mw && my < g.mh && g.alpha[my * g.mw + mx] > 128) pts.push(ex * fs - l.adv / 2, (ey + LIFT) * fs);
  }
  return new Float32Array(pts);
}

function clear() {
  parts.length = 0; states.clear(); vortex = null;
  quake = 0; pourUntil = -1; cloudA = 0; rainAcc = 0; lastHit = null;
}

export const elements: Material = {
  id: 'elements',
  accent: 'flower',
  spring: { k: 90, c: 10, rk: 80, rc: 9, sk: 180, sc: 12, limit: 0.6, lift: LIFT },

  ambient(l, w, out) {
    if (quake > 0.01) { // the ground shakes
      out.x += (Math.random() - 0.5) * quake * w.fs * 0.05;
      out.y += (Math.random() - 0.5) * quake * w.fs * 0.05;
    }
    if (w.element === 'water') out.y += Math.sin(w.t * 1.1 + l.index * 0.8) * 0.008 * w.fs * w.amb;
  },

  enter() { clear(); },
  reset(w) { clear(); calm(w.letters); },

  update(w, dt) {
    const p = w.p, fs = w.fs, el = w.element;
    const power = tuneF(w.tune, 3) * w.inten;
    const dragging = p.down && p.travel > 6;
    for (const k of states.keys()) if (!w.letters.includes(k)) states.delete(k);
    quake = Math.max(0, quake - dt * 0.9);
    if (vortex && w.t - vortex.t0 > VORTEX) vortex = null;

    for (const l of w.letters) {
      if (!l.glyph) continue;
      const s = state(l);
      const near = p.active ? Math.hypot(w.cx(l) - p.x, w.cy(l) - p.y) : Infinity;
      s.fire = Math.max(0, s.fire - dt * 0.35);
      s.air = Math.max(0, s.air - dt * 0.8);
      s.stone = Math.max(0, s.stone - dt * 0.22);
      s.wet = Math.max(0, s.wet - dt * 0.1);
      if (s.cracks.length) s.cracks = s.cracks.filter((c) => w.t - c.t < CRACK_LIFE);

      if (el === 'fire') {
        const R = fs * 0.55;
        if (near < R) s.fire = Math.min(1, s.fire + dt * (dragging ? 4 : 1.3) * (1 - near / R) * power);
        if (s.fire > 0.02) {
          for (let n = count(s.fire * 150 * tuneF(w.tune, 2), dt); n > 0; n--) {
            const e = edgePoint(w, l, true);
            if (e) emit(FLAME, e[0], e[1], (Math.random() - 0.5) * fs * 0.12, -fs * (0.35 + Math.random() * 0.45), 0.35 + Math.random() * 0.4, fs * (0.022 + Math.random() * 0.026) * (0.5 + 0.5 * s.fire));
          }
          l.tx += (Math.random() - 0.5) * fs * 0.008 * s.fire;
          l.syT += Math.sin(w.t * 21 + l.phase) * 0.02 * s.fire;
          if (Math.random() < s.fire * dt * 3) w.sound.play('crack', 0.2);
        }
      } else if (el === 'air') {
        const R = fs * 0.75;
        const cap = fs * 6, pvx = clamp(p.vx, -cap, cap), pvy = clamp(p.vy, -cap, cap);
        if (near < R) {
          const f = 1 - near / R;
          s.air = Math.min(1, s.air + dt * 2.5 * f);
          l.fx += pvx * f * (dragging ? 7 : 2.5) * power; l.fy += pvy * f * (dragging ? 7 : 2.5) * power;
          if (dragging) s.air = 1;
        }
        if (s.air > 0.01) { // flutter like paper
          const a = s.air;
          l.rT += Math.sin(w.t * 14 + l.phase * 5) * 0.2 * a;
          l.ty += Math.sin(w.t * 11 + l.phase2 * 3) * fs * 0.035 * a;
          l.skT += Math.sin(w.t * 9 + l.phase) * 0.18 * a;
        }
        if (vortex) { // the tornado lifts and spins whatever it reaches
          const age = w.t - vortex.t0, R2 = fs * 1.15;
          const dv = Math.hypot(l.bx - vortex.x, w.baseline - LIFT * fs - vortex.y);
          if (dv < R2) {
            const f = (1 - dv / R2) * Math.min(1, (VORTEX - age) / 0.6, age / 0.25) * power;
            l.ty -= fs * 0.45 * f;
            l.tx += Math.sin(w.t * 7 + l.index * 1.3) * fs * 0.3 * f + (vortex.x - l.bx) * 0.25 * f;
            l.rT += Math.sin(w.t * 10 + l.index) * 0.6 * f;
            s.air = Math.max(s.air, f);
          }
        }
      } else if (el === 'earth') {
        const R = fs * 0.5;
        if (near < R && !p.down) s.stone = Math.min(1, s.stone + dt * 1.5 * (1 - near / R) * power);
        if (s.stone > 0.01) {
          if (!s.speck) s.speck = speckles(w, l);
          l.tx += (Math.random() - 0.5) * fs * 0.01 * s.stone;
          l.ty += (Math.random() - 0.5) * fs * 0.006 * s.stone;
        }
      } else if (el === 'water') {
        // wet letters drip from their undersides
        if (s.wet > 0.15) for (let n = count(s.wet * 4, dt); n > 0; n--) {
          const e = edgePoint(w, l, false);
          if (e) emit(RAIN, e[0], e[1], 0, fs * 0.15, 2, fs * 0.012);
        }
      }
    }

    // drag effects that are not tied to one letter
    if (el === 'fire' && dragging) {
      for (let n = count(90 * power, dt); n > 0; n--) {
        emit(FLAME, p.x + (Math.random() - 0.5) * fs * 0.06, p.y + (Math.random() - 0.5) * fs * 0.06, (Math.random() - 0.5) * fs * 0.2, -fs * (0.3 + Math.random() * 0.5), 0.4 + Math.random() * 0.4, fs * (0.03 + Math.random() * 0.04));
      }
    }
    if (el === 'air') {
      if (p.active && p.speed > fs * 1.2) for (let n = count(dragging ? 60 : 25, dt); n > 0; n--) {
        emit(STREAK, p.x + (Math.random() - 0.5) * fs * 0.4, p.y + (Math.random() - 0.5) * fs * 0.4, p.vx * 0.7, p.vy * 0.7, 0.5 + Math.random() * 0.3, fs * 0.15);
      }
      if (vortex) for (let n = count(45, dt); n > 0; n--) {
        const a = Math.random() * TAU, h = Math.random(), r = fs * (0.06 + h * 0.4);
        emit(STREAK, vortex.x + Math.cos(a) * r, vortex.y - h * fs * 0.8, -Math.sin(a) * fs * 2.4, -fs * 0.5, 0.35, fs * 0.12);
      }
    }
    if (el === 'earth' && dragging) {
      const l = w.hit(p.x, p.y);
      if (l && l.glyph) {
        const [lx, ly] = toLocal(l, p.x, p.y);
        const s = state(l);
        let c = s.cracks[s.cracks.length - 1];
        if (!c || lastHit !== l || w.t - c.t > 0.3) { c = { pts: [lx, ly], t: w.t }; s.cracks.push(c); }
        const n = c.pts.length;
        if (Math.hypot(lx - c.pts[n - 2], ly - c.pts[n - 1]) > fs * 0.03) {
          const j = fs * 0.025;
          c.pts.push(lx + (Math.random() - 0.5) * j, ly + (Math.random() - 0.5) * j);
          c.t = w.t;
          if (Math.random() < 0.3) s.cracks.push({ pts: [lx, ly, lx + (Math.random() - 0.5) * fs * 0.14, ly + (Math.random() - 0.5) * fs * 0.14], t: w.t });
          emit(ROCK, p.x, p.y, (Math.random() - 0.5) * fs * 0.6, -fs * 0.3 * Math.random(), 1.8, fs * (0.012 + Math.random() * 0.012));
          w.sound.play('crack', 0.4);
        }
        s.stone = Math.max(s.stone, 0.6);
        lastHit = l;
      } else lastHit = null;
    }
    if (el === 'water') {
      const pour = w.t < pourUntil;
      const raining = p.active || pour;
      if (raining && cloudA < 0.05) { cloudX = p.x; cloudY = p.y - fs * 0.05; }
      cloudA += ((raining ? 1 : 0) - cloudA) * Math.min(1, dt * 5);
      if (p.active) {
        const q = Math.min(1, dt * (dragging ? 14 : 8));
        cloudX += (p.x - cloudX) * q; cloudY += (p.y - fs * 0.05 - cloudY) * q;
      }
      const width = fs * (pour ? 0.5 : 0.28);
      rainAcc += (pour ? 150 : dragging ? 60 : 26) * tuneF(w.tune, 2) * cloudA * dt;
      while (rainAcc >= 1) {
        rainAcc -= 1;
        emit(RAIN, cloudX + (Math.random() - 0.5) * width * 1.6, cloudY + fs * 0.05, p.vx * 0.05, fs * (2.6 + Math.random() * 0.8), 2, fs * 0.012);
      }
    } else cloudA = Math.max(0, cloudA - dt * 4);

    // particles
    const floor = w.H - 3;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.age += dt;
      if (q.age > q.max) { parts.splice(i, 1); continue; }
      switch (q.k) {
        case FLAME: q.vy -= fs * 1.4 * dt; q.vx *= 1 - Math.min(1, dt * 2); break;
        case EMBER: q.vy += fs * 0.8 * dt; q.vx *= 1 - Math.min(1, dt * 1.5); break;
        case STREAK: q.vx *= 1 - Math.min(1, dt * 1.5); q.vy *= 1 - Math.min(1, dt * 1.5); break;
        case DUST: q.vy -= fs * 0.12 * dt; q.vx *= 1 - Math.min(1, dt * 2); q.size += dt * fs * 0.05; break;
        case ROCK: case SPLASH: q.vy += fs * 5 * dt; break;
        case RAIN: q.vy += fs * 4 * dt; break;
      }
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.k === ROCK && q.y > floor && q.vy > 0) { q.y = floor; q.vy *= -0.35; q.vx *= 0.6; }
      if (q.k === ROCK) q.rot += q.vx * 0.02 * dt;
      if (q.k === RAIN) {
        const hit = q.age > 0.25 ? w.hit(q.x, q.y) : null;
        if (hit || q.y > floor) {
          for (let k = 0; k < 3; k++) emit(SPLASH, q.x, q.y - 2, (Math.random() - 0.5) * fs * 0.6, -fs * (0.3 + Math.random() * 0.5), 0.35, fs * (0.006 + Math.random() * 0.006));
          if (hit) { const s = state(hit); s.wet = Math.min(1, s.wet + 0.06); hit.vy += fs * 0.12; w.sound.play('drip', 0.15); }
          parts.splice(i, 1);
        }
      }
    }
  },

  down() { lastHit = null; },

  up(w, _hit, click) {
    if (!click) return;
    const p = w.p, fs = w.fs, el = w.element, power = tuneF(w.tune, 3) * w.inten;
    if (el === 'fire') { // a fireball
      for (let i = 0; i < 80; i++) {
        const a = Math.random() * TAU, sp = fs * (0.6 + Math.random() * 2.2) * power;
        emit(FLAME, p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp - fs * 0.3, 0.45 + Math.random() * 0.45, fs * (0.028 + Math.random() * 0.03));
      }
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * TAU, sp = fs * (1 + Math.random() * 2.5) * power;
        emit(EMBER, p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp - fs, 0.8 + Math.random() * 0.8, fs * 0.012);
      }
      for (const l of w.letters) {
        const dx = w.cx(l) - p.x, dy = w.cy(l) - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > fs * 0.9) continue;
        state(l).fire = 1;
        const f = (1 - d / (fs * 0.9)) * power;
        l.vx += (dx / d) * fs * 2 * f; l.vy += (dy / d) * fs * 2 * f;
      }
      w.fx.burst(p.x, p.y, 'flower', fs * 0.3);
      w.sound.play('boom', 0.5 * power);
    } else if (el === 'air') {
      vortex = { x: p.x, y: p.y, t0: w.t };
      w.fx.gust(p.x, p.y, 'ink', fs * 0.5);
      w.sound.play('gust', power);
    } else if (el === 'earth') { // an earthquake
      quake = 1;
      for (const l of w.letters) {
        l.vy -= fs * (0.6 + Math.random() * 0.9) * power;
        l.vr += (Math.random() - 0.5) * 2 * power;
        if (!l.glyph) continue;
        for (let k = 0; k < 5; k++) {
          const e = edgePoint(w, l, false);
          if (e) emit(DUST, e[0], e[1], (Math.random() - 0.5) * fs * 0.5, -fs * Math.random() * 0.2, 1.2 + Math.random() * 0.6, fs * 0.03);
        }
      }
      w.fx.ring(p.x, p.y, 'ink', fs * 0.4);
      w.sound.play('boom', 0.6 * power);
      w.sound.play('thud', power);
    } else { // a downpour
      pourUntil = w.t + 1.6;
      if (cloudA < 0.05) { cloudX = p.x; cloudY = p.y - fs * 0.05; }
      w.sound.play('gust', 0.6 * power);
    }
  },

  drawLetter(ctx, l, w, colors, liftPx) {
    const s = states.get(l);
    if (!s) return false;
    // the element shows in the letter's colour: burning, stone, or soaked
    let col: RGB | null = null, amt = 0;
    if (s.fire > 0.01) { col = mix(FIRE[1], FIRE[2], 0.4); amt = s.fire * 0.75; }
    if (s.stone * 0.8 > amt) { col = mix(STONE, colors.ink, 0.25); amt = s.stone * 0.8; }
    if (s.wet * 0.7 > amt) { col = colors.stem; amt = s.wet * 0.7; }
    if (col) ctx.fillStyle = css(mix(colors.ink, col, amt));
    ctx.fillText(l.ch, -l.adv / 2, liftPx);
    const a0 = ctx.globalAlpha;
    if (s.stone > 0.05 && s.speck) { // the grain of the stone
      const n = Math.floor((s.speck.length / 2) * s.stone), r = Math.max(1.5, w.fs * 0.012);
      ctx.fillStyle = css(colors.bg, 0.35 * s.stone);
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.rect(s.speck[i * 2] - r / 2, s.speck[i * 2 + 1] - r / 2, r, r);
      ctx.fill();
    }
    if (s.cracks.length) { // cut in the background colour, kept inside this letter's box
      const g = l.glyph!.box, fs = w.fs;
      ctx.save();
      ctx.beginPath(); ctx.rect(g[0] * fs - l.adv / 2, (g[1] + LIFT) * fs, (g[2] - g[0]) * fs, (g[3] - g[1]) * fs); ctx.clip();
      ctx.strokeStyle = css(colors.bg);
      ctx.lineWidth = Math.max(1.2, fs * 0.011);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const c of s.cracks) {
        ctx.globalAlpha = a0 * clamp((CRACK_LIFE - (w.t - c.t)) / 1.5, 0, 1);
        ctx.beginPath(); ctx.moveTo(c.pts[0], c.pts[1]);
        for (let i = 2; i < c.pts.length; i += 2) ctx.lineTo(c.pts[i], c.pts[i + 1]);
        ctx.stroke();
      }
      ctx.restore();
    }
    return true;
  },

  front(ctx, w, colors) {
    const fs = w.fs;
    const water = css(mix(colors.stem, colors.ink, 0.2));
    const smoke: RGB = mix(colors.ink, colors.bg, 0.5);
    // flames glow (add up) on dark backgrounds; on light ones they are painted normally so they stay visible
    const dark = colors.bg[0] * 0.3 + colors.bg[1] * 0.59 + colors.bg[2] * 0.11 < 110;
    for (const q of parts) {
      if (q.k !== FLAME) continue;
      const r = q.age / q.max;
      if (r > 0.72) { // the tail end turns to smoke
        ctx.fillStyle = css(smoke, 0.18 * (1 - r));
        ctx.beginPath(); ctx.arc(q.x, q.y, q.size * 1.3, 0, TAU); ctx.fill();
      }
    }
    if (dark) ctx.globalCompositeOperation = 'lighter';
    for (const q of parts) {
      if (q.k !== FLAME) continue;
      const r = q.age / q.max;
      if (r > 0.72) continue;
      // a tongue of flame: tall, narrowing as it rises, yellow at the root and red at the tip
      const c = r < 0.25 ? FIRE[0] : r < 0.5 ? FIRE[1] : FIRE[2];
      const sz = q.size * (1 - r * 0.6);
      ctx.fillStyle = css(c, (dark ? 0.55 : 0.85) * (1 - r));
      ctx.beginPath(); ctx.ellipse(q.x, q.y, sz * 0.6, sz * 1.5, clamp(Math.atan2(q.vx, -q.vy), -0.8, 0.8), 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const q of parts) {
      const r = q.age / q.max;
      if (q.k === FLAME) continue;
      if (q.k === EMBER) {
        ctx.fillStyle = css(FIRE[0], (1 - r) * (0.6 + 0.4 * Math.sin(q.age * 30 + q.rot)));
        ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, TAU); ctx.fill();
      } else if (q.k === STREAK) {
        const v = Math.hypot(q.vx, q.vy) || 1, len = q.size * (1 - r);
        ctx.strokeStyle = css(colors.ink, 0.35 * (1 - r)); ctx.lineWidth = 1.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - (q.vx / v) * len, q.y - (q.vy / v) * len); ctx.stroke();
      } else if (q.k === DUST) {
        ctx.fillStyle = css(mix(STONE, colors.bg, 0.3), 0.3 * (1 - r));
        ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, TAU); ctx.fill();
      } else if (q.k === ROCK) {
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        ctx.fillStyle = css(mix(STONE, colors.ink, 0.2), 1 - r * r);
        ctx.fillRect(-q.size, -q.size * 0.7, q.size * 2, q.size * 1.4);
        ctx.restore();
      } else if (q.k === RAIN) {
        ctx.strokeStyle = water; ctx.lineWidth = Math.max(1, q.size * 0.6); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.015, q.y - Math.min(fs * 0.08, q.vy * 0.018)); ctx.stroke();
      } else {
        ctx.fillStyle = water;
        ctx.globalAlpha = 1 - r;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (vortex) { // the funnel: stacked rings that widen as they rise, turning
      const age = w.t - vortex.t0, a = Math.min(1, age / 0.25, (VORTEX - age) / 0.6);
      ctx.strokeStyle = css(colors.ink, 0.32 * a); ctx.lineWidth = 1.4;
      for (let k = 0; k < 10; k++) {
        const rx = fs * (0.05 + k * 0.04) * (1 + 0.1 * Math.sin(w.t * 3 + k)), ry = rx * 0.3;
        const x = vortex.x + Math.sin(w.t * 2 + k * 0.6) * fs * 0.03 * k, y = vortex.y - k * fs * 0.085;
        ctx.setLineDash([rx * 0.6, rx * 0.4]); ctx.lineDashOffset = -w.t * fs * 2 * (1 + k * 0.1);
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (cloudA > 0.02) { // the rain cloud, over the hand
      const pour = w.t < pourUntil, k = pour ? 1.45 : 1;
      ctx.fillStyle = css(mix(colors.ink, colors.bg, pour ? 0.55 : 0.35), 0.92 * cloudA);
      const puffs = [[-0.16, 0.02, 0.1], [-0.05, -0.05, 0.13], [0.08, -0.02, 0.11], [0.17, 0.03, 0.08], [0, 0.04, 0.1]];
      ctx.beginPath();
      for (const [ox, oy, r] of puffs) { ctx.moveTo(cloudX + ox * fs * k + r * fs * k, cloudY + oy * fs * k); ctx.arc(cloudX + ox * fs * k, cloudY + oy * fs * k, r * fs * k, 0, TAU); }
      ctx.fill();
    }
  },
};

import type { ColorKey } from './types';
import { css, type RGB } from './color';

/** Short-lived graphic marks: rings, pulses, gusts and bursts. */

interface Fx { kind: 'ring' | 'pulse' | 'gust' | 'burst' | 'confetti' | 'splash'; x: number; y: number; age: number; dur: number; r: number; color: ColorKey; seed: number }

const out3 = (p: number) => 1 - Math.pow(1 - p, 3);
/** Stable pseudo-random numbers, so a confetti burst needs no per-piece state. */
const rnd = (s: number, i: number) => { const v = Math.sin(s * 127.1 + i * 311.7) * 43758.5453; return v - Math.floor(v); };
const CONFETTI: ColorKey[] = ['flower', 'spark', 'stem', 'ink'];

export class Effects {
  list: Fx[] = [];
  private add(kind: Fx['kind'], x: number, y: number, r: number, dur: number, color: ColorKey) {
    if (this.list.length > 24) this.list.shift();
    this.list.push({ kind, x, y, age: 0, dur, r, color, seed: Math.random() * Math.PI * 2 });
  }
  ring(x: number, y: number, color: ColorKey, r = 46) { this.add('ring', x, y, r, 0.5, color); }
  pulse(x: number, y: number, color: ColorKey, r: number) { this.add('pulse', x, y, r, 0.75, color); }
  gust(x: number, y: number, color: ColorKey, r: number) { this.add('gust', x, y, r, 0.9, color); }
  burst(x: number, y: number, color: ColorKey, r = 30) { this.add('burst', x, y, r, 0.45, color); }
  splash(x: number, y: number, r: number, color: ColorKey) { this.add('splash', x, y, r, 1, color); }
  confetti(x: number, y: number, r: number) { this.add('confetti', x, y, r, 1.3, 'flower'); }

  update(dt: number) {
    for (const f of this.list) f.age += dt;
    this.list = this.list.filter((f) => f.age < f.dur);
  }
  clear() { this.list = []; }

  draw(ctx: CanvasRenderingContext2D, colors: Record<ColorKey, RGB>) {
    ctx.lineCap = 'round';
    for (const f of this.list) {
      const p = f.age / f.dur;
      const e = out3(p);
      const col = colors[f.color];
      if (f.kind === 'ring') {
        ctx.strokeStyle = css(col, (1 - p) * 0.9);
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(f.x, f.y, 12 + (f.r - 12) * e, 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'pulse') {
        for (let i = 0; i < 2; i++) {
          const q = Math.max(0, p - i * 0.14) / (1 - i * 0.14);
          if (q <= 0) continue;
          ctx.strokeStyle = css(col, (1 - q) * (i ? 0.45 : 0.9));
          ctx.lineWidth = i ? 1 : 2;
          ctx.beginPath(); ctx.arc(f.x, f.y, 10 + f.r * out3(q), 0, Math.PI * 2); ctx.stroke();
        }
      } else if (f.kind === 'gust') {
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const q = Math.min(1, Math.max(0, p * 1.25 - i * 0.12));
          if (q <= 0 || q >= 1) continue;
          const a0 = f.seed + i * 2.2 + q * 0.9;
          ctx.strokeStyle = css(col, Math.sin(q * Math.PI) * 0.8);
          ctx.beginPath(); ctx.arc(f.x, f.y, 14 + f.r * (0.35 + i * 0.22) * out3(q), a0, a0 + 0.9 + i * 0.25); ctx.stroke();
        }
      } else if (f.kind === 'splash') {
        // drops thrown mostly upward, falling back under their own weight
        const t = f.age, k = 2, drift = (1 - Math.exp(-k * t)) / k;
        ctx.fillStyle = css(col, 1 - p * p);
        for (let i = 0; i < 16; i++) {
          const a = -Math.PI / 2 + (rnd(f.seed, i) - 0.5) * Math.PI * 1.6, sp = f.r * (1.5 + rnd(f.seed, i + 40) * 3);
          const x = f.x + Math.cos(a) * sp * drift, y = f.y + Math.sin(a) * sp * drift + 0.5 * f.r * 7 * t * t;
          ctx.beginPath(); ctx.arc(x, y, f.r * 0.035 * (0.6 + rnd(f.seed, i + 80)), 0, Math.PI * 2); ctx.fill();
        }
      } else if (f.kind === 'confetti') {
        const t = f.age, k = 2.6, drift = (1 - Math.exp(-k * t)) / k;
        for (let i = 0; i < 24; i++) {
          const a = rnd(f.seed, i) * Math.PI * 2, sp = f.r * (2 + rnd(f.seed, i + 40) * 3.5);
          const x = f.x + Math.cos(a) * sp * drift;
          const y = f.y + Math.sin(a) * sp * drift + 0.5 * f.r * 4 * t * t;
          const sz = f.r * 0.05 * (0.7 + rnd(f.seed, i + 80));
          ctx.save();
          ctx.translate(x, y); ctx.rotate((rnd(f.seed, i + 120) - 0.5) * 16 * t + a);
          ctx.fillStyle = css(colors[CONFETTI[i % 4]], 1 - p * p * p);
          ctx.fillRect(-sz, -sz * 0.45, sz * 2, sz * 0.9);
          ctx.restore();
        }
      } else {
        ctx.strokeStyle = css(col, 1 - p);
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 7; i++) {
          const a = f.seed + (i / 7) * Math.PI * 2;
          const r0 = 8 + f.r * e * 0.7, r1 = r0 + 7 * (1 - p);
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0);
          ctx.lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
          ctx.stroke();
        }
      }
    }
  }
}

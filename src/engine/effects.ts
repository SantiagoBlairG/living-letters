import type { ColorKey } from './types';
import { css, type RGB } from './color';

/** Short-lived graphic marks: rings, pulses, gusts and bursts. */

interface Fx { kind: 'ring' | 'pulse' | 'gust' | 'burst'; x: number; y: number; age: number; dur: number; r: number; color: ColorKey; seed: number }

const out3 = (p: number) => 1 - Math.pow(1 - p, 3);

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

import type { ColorKey, ElementId, MaterialId, Pointer } from './types';
import { css, type RGB } from './color';

/**
 * The drawn cursor. It trails the pointer by a few milliseconds for feel only:
 * every interaction uses the true pointer position, never this one.
 */

const back = (p: number) => { const c = 1.9, q = Math.min(1, Math.max(0, p)) - 1; return 1 + (c + 1) * q * q * q + c * q * q; };

export class CursorView {
  x = 0; y = 0; vx = 0; vy = 0;
  press = 0; private pv = 0;
  near = 0; vis = 0; spin = 0;
  mat: MaterialId; private prev: MaterialId; private sw = 1;
  element: ElementId = 'fire';
  private trail: { x: number; y: number; age: number }[] = [];

  constructor(mat: MaterialId) { this.mat = mat; this.prev = mat; }

  setMaterial(m: MaterialId) {
    if (m === this.mat) return;
    this.prev = this.mat; this.mat = m; this.sw = 0;
  }

  update(dt: number, p: Pointer, show: boolean) {
    if (show && this.vis < 0.02) { this.x = p.x; this.y = p.y; this.vx = this.vy = 0; this.trail = []; }
    const q = 1 - Math.exp(-dt * 34);
    const nx = this.x + (p.x - this.x) * q, ny = this.y + (p.y - this.y) * q;
    const s = 1 - Math.exp(-dt * 14);
    this.vx += ((nx - this.x) / dt - this.vx) * s; this.vy += ((ny - this.y) / dt - this.vy) * s;
    this.x = nx; this.y = ny;
    this.pv += (460 * ((p.down ? 1 : 0) - this.press) - 24 * this.pv) * dt;
    this.press += this.pv * dt;
    this.near += (p.near - this.near) * (1 - Math.exp(-dt * 10));
    this.vis += ((show ? 1 : 0) - this.vis) * (1 - Math.exp(-dt * 16));
    this.sw = Math.min(1, this.sw + dt / 0.32);
    this.spin += dt * (1.3 + this.near * 5 + Math.max(0, this.press) * 6);
    for (const t of this.trail) t.age += dt;
    this.trail.push({ x: this.x, y: this.y, age: 0 });
    while (this.trail.length && this.trail[0].age > 0.26) this.trail.shift();
  }

  draw(ctx: CanvasRenderingContext2D, colors: Record<ColorKey, RGB>) {
    if (this.vis < 0.02) return;
    const half = this.sw < 0.5;
    const mat = half ? this.prev : this.mat;
    const scale = this.vis * (half ? 1 - this.sw * 2 : back(this.sw * 2 - 1));
    if (scale <= 0.01) return;
    const press = Math.max(-0.3, Math.min(1.2, this.press));
    const speed = Math.hypot(this.vx, this.vy);
    ctx.save();
    ctx.lineCap = 'round';
    if (mat === 'float') this.comet(ctx, colors, scale, press, speed);
    ctx.translate(this.x, this.y);
    ctx.scale(scale, scale);
    if (mat === 'jelly') {
      const c = colors.spark;
      const st = Math.min(speed / 1500, 0.5);
      ctx.save();
      ctx.rotate(Math.atan2(this.vy, this.vx));
      ctx.scale(1 + st + press * 0.28, 1 - st * 0.5 - press * 0.32);
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.2832);
      ctx.fillStyle = css(c, 0.14); ctx.fill();
      ctx.strokeStyle = css(c); ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
      // the core lags behind, like something suspended in gel
      const lag = Math.min(1, 5 / (speed * 0.006 + 0.0001));
      ctx.beginPath(); ctx.arc(-this.vx * 0.006 * lag, -this.vy * 0.006 * lag, 3.2 + press, 0, 6.2832);
      ctx.fillStyle = css(c); ctx.fill();
    } else if (mat === 'magnet') {
      const r = 15 - this.near * 4.5 - press * 5;
      const span = 1.05 + this.near * 0.8;
      ctx.strokeStyle = css(colors.stem); ctx.lineWidth = 1.8;
      for (let i = 0; i < 2; i++) {
        const a = this.spin + i * Math.PI;
        ctx.beginPath(); ctx.arc(0, 0, r, a, a + span); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, 4.2 * (1 - press * 0.5), 0, 6.2832);
      ctx.fillStyle = css(colors.ink); ctx.fill();
    } else if (mat === 'bloom') {
      const open = 0.3 + this.near * 0.85 + press * 0.3;
      ctx.rotate(Math.max(-0.4, Math.min(0.4, this.vx * 0.0006)));
      ctx.fillStyle = css(colors.stem);
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(0, 4); ctx.rotate(-Math.PI / 2 + s * open);
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(6, -5.5, 13, 0); ctx.quadraticCurveTo(6, 5.5, 0, 0);
        ctx.fill();
        ctx.restore();
      }
      const k = 1 - press * 0.22;
      ctx.fillStyle = css(colors.flower);
      ctx.beginPath(); ctx.moveTo(0, -8 * k);
      ctx.bezierCurveTo(6 * k, -3, 5 * k, 6, 0, 8 * k);
      ctx.bezierCurveTo(-5 * k, 6, -6 * k, -3, 0, -8 * k);
      ctx.fill();
    } else if (mat === 'balloon') {
      // a little balloon on a string that trails behind the hand
      ctx.rotate(Math.max(-0.5, Math.min(0.5, -this.vx * 0.0009)));
      const k = 1 + press * 0.25;
      ctx.strokeStyle = css(colors.ink, 0.6); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, 5 * k);
      ctx.quadraticCurveTo(3 + Math.sin(this.spin * 2) * 2, 11, 0, 17); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -3, 7 * k, 8.5 * k, 0, 0, 6.2832);
      ctx.fillStyle = css(colors.flower); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-2.4 * k, -6 * k, 1.6, 2.6, -0.5, 0, 6.2832);
      ctx.fillStyle = css(colors.bg, 0.3); ctx.fill();
    } else if (mat === 'wave') {
      // a falling drop; pressing shows the ring it is about to make
      if (press > 0.05) {
        ctx.strokeStyle = css(colors.stem, Math.min(1, press) * 0.7); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, 11 + press * 7, 0, 6.2832); ctx.stroke();
      }
      const k = 1 - press * 0.2;
      ctx.fillStyle = css(colors.stem);
      ctx.beginPath(); ctx.moveTo(0, -10 * k);
      ctx.bezierCurveTo(3 * k, -5 * k, 6 * k, -1 * k, 6 * k, 2 * k);
      ctx.arc(0, 2 * k, 6 * k, 0, Math.PI);
      ctx.bezierCurveTo(-6 * k, -1 * k, -3 * k, -5 * k, 0, -10 * k);
      ctx.fill();
    } else if (mat === 'blackhole') {
      // a tiny hole with its disk; it hides while a real one grows under the hand
      if (press < 0.6) {
        const k = 1 - Math.max(0, press);
        ctx.strokeStyle = css(colors.spark, 0.9 * k); ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 3]); ctx.lineDashOffset = -this.spin * 8;
        ctx.beginPath(); ctx.ellipse(0, 0, 13, 4.5, -0.25, 0, 6.2832); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 6.2832);
        ctx.fillStyle = css(colors.bg); ctx.fill();
        ctx.strokeStyle = css(colors.spark, k); ctx.lineWidth = 1.2; ctx.stroke();
      }
    } else if (mat === 'elements') {
      const el = this.element;
      if (el === 'fire') { // a flame
        ctx.fillStyle = '#ff8a1f';
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.bezierCurveTo(7, -4, 8, 3, 0, 8); ctx.bezierCurveTo(-8, 3, -6, -3, 0, -12); ctx.fill();
        ctx.fillStyle = '#ffd54a';
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.bezierCurveTo(3.5, 0, 4, 3, 0, 6); ctx.bezierCurveTo(-4, 3, -3, 0, 0, -4); ctx.fill();
      } else if (el === 'air') { // two turning wisps
        ctx.strokeStyle = css(colors.ink); ctx.lineWidth = 1.6;
        for (let i = 0; i < 2; i++) {
          const a = this.spin * 1.5 + i * Math.PI;
          ctx.beginPath(); ctx.arc(0, 0, 10 - i * 4, a, a + 2.4); ctx.stroke();
        }
      } else if (el === 'earth') { // a rock
        ctx.fillStyle = css(colors.ink, 0.75);
        ctx.beginPath(); ctx.moveTo(-8, 3); ctx.lineTo(-5, -5); ctx.lineTo(3, -7); ctx.lineTo(9, -1); ctx.lineTo(6, 6); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
      } else { // a drop under the cloud
        ctx.fillStyle = css(colors.stem);
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.bezierCurveTo(4, -2, 5, 1, 5, 3); ctx.arc(0, 3, 5, 0, Math.PI); ctx.bezierCurveTo(-5, 1, -4, -2, 0, -7); ctx.fill();
      }
    } else if (mat === 'sand') {
      // a few grains that spread apart as the hand speeds up
      const spread = 3.5 + Math.min(speed * 0.006, 7) + press * 3;
      ctx.fillStyle = css(colors.spark);
      for (let i = 0; i < 5; i++) {
        const a = this.spin * 0.6 + (i * Math.PI * 2) / 5;
        ctx.fillRect(Math.cos(a) * spread - 1.6, Math.sin(a) * spread - 1.6, 3.2, 3.2);
      }
      ctx.fillStyle = css(colors.ink);
      ctx.fillRect(-1.8, -1.8, 3.6, 3.6);
    } else if (mat === 'melt') {
      // a blob with a drop hanging off it, longer while pressing
      const drop = 8 + press * 6;
      ctx.fillStyle = css(colors.flower);
      ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2, 4); ctx.quadraticCurveTo(0, drop * 0.7, -1.2, drop); ctx.lineTo(1.2, drop); ctx.quadraticCurveTo(0, drop * 0.7, 2, 4); ctx.fill();
      ctx.beginPath(); ctx.arc(0, drop + 1.5, 2.6, 0, 6.2832); ctx.fill();
    } else if (mat === 'explode') {
      // a spark: eight rays that spin faster while you charge
      const r = 9 + press * 4;
      ctx.rotate(this.spin * 0.3);
      ctx.strokeStyle = css(colors.flower); ctx.lineWidth = 1.8;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4, r0 = i % 2 ? r * 0.45 : r * 0.35, r1 = i % 2 ? r * 0.75 : r;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 6.2832);
      ctx.fillStyle = css(colors.ink); ctx.fill();
    } else if (mat === 'gravity') {
      // a solid ball: the thing you shove letters with
      const r = 9 - press * 2.5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832);
      ctx.fillStyle = css(colors.spark); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.28, 0, 6.2832);
      ctx.fillStyle = css(colors.bg, 0.35); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, 3.8 + press * 1.6, 0, 6.2832);
      ctx.fillStyle = css(colors.ink); ctx.fill();
    }
    ctx.restore();
  }

  private comet(ctx: CanvasRenderingContext2D, colors: Record<ColorKey, RGB>, scale: number, press: number, speed: number) {
    const n = this.trail.length;
    const still = Math.max(0, 1 - speed / 120);
    ctx.strokeStyle = css(colors.stem);
    if (still > 0.05) { // at rest the comet keeps a short tail, so it still reads as a comet
      ctx.globalAlpha = still * scale;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(this.x - 5, this.y + 5);
      ctx.quadraticCurveTo(this.x - 12, this.y + 9, this.x - 15 - press * 4, this.y + 17 + press * 4); ctx.stroke();
    }
    for (let i = 1; i < n; i++) {
      const a = this.trail[i - 1], b = this.trail[i], q = i / n;
      ctx.globalAlpha = q * 0.85 * scale;
      ctx.lineWidth = 0.6 + q * 3.4;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

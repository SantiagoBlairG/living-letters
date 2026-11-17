import type { ColorKey, Letter } from './types';
import { css, type RGB } from './color';
import { clamp } from './simulation';

/**
 * Bloom's garden. Every plant is anchored to a point on a glyph's silhouette
 * (in em, glyph space) so it rides along with its letter.
 */

type Head = 'none' | 'bud' | 'daisy' | 'tulip' | 'pom';
interface Leaf { t: number; side: number; s: number }
export interface Plant {
  l: Letter;
  ax: number; ay: number;
  ang: number; len: number; bend: number; width: number;
  head: Head; hr: number; petals: number;
  leaves: Leaf[];
  g: number; dur: number; delay: number; die: number;
  front: boolean; phase: number; rate: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const out3 = (p: number) => 1 - Math.pow(1 - p, 3);
const sat = (p: number) => clamp(p, 0, 1);
const back = (p: number) => { const c = 1.9; const q = sat(p) - 1; return 1 + (c + 1) * q * q * q + c * q * q; };

export class Plants {
  list: Plant[] = [];
  max = 130;

  private make(l: Letter, ax: number, ay: number, nx: number, ny: number, lean: number, o: Partial<Plant>): Plant {
    // grow away from the glyph, but always reach for the light
    const dx = nx * 0.8 + lean * 0.55, dy = ny * 0.8 - 0.75;
    const p: Plant = {
      l, ax, ay, ang: Math.atan2(dx, -dy), len: 30, bend: rnd(-0.32, 0.32), width: 1.6,
      head: 'none', hr: 4, petals: 6, leaves: [],
      g: 0, dur: 0.8, delay: 0, die: 0,
      front: Math.random() < 0.62, phase: rnd(0, 6.28), rate: rnd(0.7, 1.3), ...o,
    };
    this.list.push(p);
    return p;
  }

  tooClose(l: Letter, ax: number, ay: number, minEm: number) {
    for (const p of this.list) if (p.l === l && !p.die && Math.hypot(p.ax - ax, p.ay - ay) < minEm) return true;
    return false;
  }

  /** Small growth left behind by the cursor. `sow` makes the richer version used while dragging. */
  sprout(l: Letter, ax: number, ay: number, nx: number, ny: number, lean: number, inten: number, sow: boolean) {
    const k = 0.75 + inten * 0.35;
    const r = Math.random();
    const head: Head = sow ? (r < 0.3 ? 'daisy' : r < 0.5 ? 'pom' : r < 0.75 ? 'bud' : 'none') : r < 0.22 ? 'bud' : 'none';
    const len = (sow ? rnd(30, 56) : rnd(16, 34)) * k;
    const leaves: Leaf[] = [{ t: rnd(0.35, 0.6), side: Math.random() < 0.5 ? -1 : 1, s: rnd(7, 11) * k }];
    if (head === 'none') leaves.push({ t: 0.97, side: -1, s: rnd(6, 9) * k }, { t: 0.97, side: 1, s: rnd(6, 9) * k });
    else if (sow) leaves.push({ t: rnd(0.65, 0.8), side: -leaves[0].side, s: rnd(6, 9) * k });
    this.make(l, ax, ay, nx, ny, lean, {
      len, leaves, head, width: sow ? 1.9 : 1.5,
      hr: (head === 'bud' ? rnd(3, 4.6) : rnd(7.5, 11)) * k,
      petals: 5 + ((Math.random() * 3) | 0), dur: sow ? 0.95 : 0.7,
    });
  }

  /** The click: one tall flower and a few companions, opening in sequence. */
  flower(l: Letter, ax: number, ay: number, nx: number, ny: number, inten: number) {
    const k = 0.8 + inten * 0.35;
    const heads: Head[] = ['daisy', 'tulip', 'pom', 'daisy'];
    const head = heads[(Math.random() * heads.length) | 0];
    const side = Math.random() < 0.5 ? -1 : 1;
    this.make(l, ax, ay, nx, ny, 0, {
      len: rnd(92, 132) * k, width: 2.6, head, hr: rnd(19, 26) * k, petals: 6 + ((Math.random() * 3) | 0),
      leaves: [
        { t: 0.3, side, s: rnd(17, 22) * k }, { t: 0.52, side: -side, s: rnd(14, 19) * k }, { t: 0.72, side, s: rnd(9, 12) * k },
      ],
      dur: 1.35, front: true, bend: rnd(-0.22, 0.22),
    });
    for (let i = 0; i < 2; i++) {
      const s = i ? -side : side;
      this.make(l, ax, ay, nx, ny, s * rnd(0.9, 1.5), {
        len: rnd(44, 72) * k, width: 1.8, head: i ? 'bud' : head === 'pom' ? 'daisy' : 'pom',
        hr: (i ? rnd(4, 5.5) : rnd(9, 12)) * k, petals: 5,
        leaves: [{ t: 0.45, side: s, s: rnd(9, 13) * k }, { t: 0.75, side: -s, s: rnd(7, 9) * k }],
        dur: 1.05, delay: 0.16 + i * 0.14, front: Math.random() < 0.5, bend: s * rnd(0.15, 0.4),
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (const p of this.list) {
      if (p.delay > 0) p.delay -= dt; else if (p.g < 1) p.g = Math.min(1, p.g + dt / p.dur);
      if (p.die > 0) p.die += dt / 0.55; else alive++;
    }
    // recycle the oldest, with a soft exit
    for (let i = 0; alive > this.max && i < this.list.length; i++) {
      if (!this.list[i].die) { this.list[i].die = 0.001; alive--; }
    }
    if (this.list.some((p) => p.die >= 1)) this.list = this.list.filter((p) => p.die < 1);
  }

  wither() { for (const p of this.list) if (!p.die) p.die = 0.001 + Math.random() * 0.0005; }
  keepOnly(letters: Set<Letter>) { this.list = this.list.filter((p) => letters.has(p.l)); }
  get count() { return this.list.length; }

  /** Draws one layer of one letter's plants. Expects ctx to already carry the letter's transform. */
  draw(
    ctx: CanvasRenderingContext2D, l: Letter, front: boolean, colors: Record<ColorKey, RGB>,
    fs: number, liftPx: number, t: number, amb: number, speed: number,
  ) {
    const u = clamp(fs / 380, 0.5, 1.2);
    const stem = css(colors.stem), petal = css(colors.flower), eye = css(colors.spark);
    for (const p of this.list) {
      if (p.l !== l || p.front !== front || p.delay > 0) continue;
      const life = 1 - out3(sat(p.die));
      const g = p.g;
      const sway = Math.sin(t * p.rate * speed + p.phase) * 0.075 * amb - clamp(l.vx * 0.0004, -0.3, 0.3) - l.vr * 0.05;
      ctx.save();
      ctx.translate(p.ax * fs - l.adv / 2, p.ay * fs + liftPx);
      ctx.rotate(p.ang + sway * (0.35 + 0.65 * g));
      ctx.scale(u * life, u * life);

      const L = p.len, sp = out3(sat(g / 0.55));
      const c1x = p.bend * L, c1y = -L * 0.5, ex = p.bend * L * 0.25, ey = -L;
      const at = (q: number): [number, number, number] => {
        const a = 1 - q;
        const x = 2 * a * q * c1x + q * q * ex, y = 2 * a * q * c1y + q * q * ey;
        const tx = 2 * a * c1x + 2 * q * (ex - c1x), ty = 2 * a * c1y + 2 * q * (ey - c1y);
        return [x, y, Math.atan2(ty, tx)];
      };
      const [tx, ty, ta] = at(sp);
      ctx.strokeStyle = stem; ctx.fillStyle = stem;
      ctx.lineWidth = p.width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(c1x * sp, c1y * sp, tx, ty); ctx.stroke();

      for (let i = 0; i < p.leaves.length; i++) {
        const lf = p.leaves[i];
        if (sp < lf.t * 0.98) continue;
        const lp = back((g - 0.12 - lf.t * 0.42) / 0.3);
        if (lp <= 0) continue;
        const [lx, ly, la] = at(lf.t);
        ctx.save();
        ctx.translate(lx, ly); ctx.rotate(la + lf.side * 0.95); ctx.scale(lp, lp);
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(lf.s * 0.45, -lf.s * 0.42, lf.s, 0);
        ctx.quadraticCurveTo(lf.s * 0.45, lf.s * 0.42, 0, 0);
        ctx.fill();
        ctx.restore();
      }

      const fp = sat((g - 0.55) / 0.45);
      if (p.head !== 'none' && fp > 0) {
        const r = p.hr;
        ctx.translate(tx, ty); ctx.rotate(ta + Math.PI / 2);
        ctx.fillStyle = petal;
        if (p.head === 'bud') {
          const s = back(fp);
          ctx.beginPath(); ctx.arc(0, -r * 0.6 * s, r * s, 0, 6.2832); ctx.fill();
        } else if (p.head === 'daisy') {
          ctx.translate(0, -r * 0.2);
          for (let i = 0; i < p.petals; i++) {
            const s = back(fp * 1.7 - (i / p.petals) * 0.7);
            if (s <= 0) continue;
            ctx.save(); ctx.rotate((i / p.petals) * 6.2832 + p.phase);
            ctx.beginPath(); ctx.ellipse(0, -r * 0.62 * s, r * 0.3 * s, r * 0.5 * s, 0, 0, 6.2832); ctx.fill();
            ctx.restore();
          }
          const cs = back(fp * 1.5 - 0.5);
          if (cs > 0) { ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(0, 0, r * 0.27 * cs, 0, 6.2832); ctx.fill(); }
        } else if (p.head === 'tulip') {
          const s = back(fp);
          const open = 0.75 + 0.25 * sat(fp * 1.4 - 0.4);
          ctx.scale(s * open, s);
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-0.95 * r, -0.1 * r, -0.85 * r, -0.9 * r, -0.62 * r, -1.3 * r);
          ctx.lineTo(-0.3 * r, -0.88 * r); ctx.lineTo(0, -1.42 * r); ctx.lineTo(0.3 * r, -0.88 * r); ctx.lineTo(0.62 * r, -1.3 * r);
          ctx.bezierCurveTo(0.85 * r, -0.9 * r, 0.95 * r, -0.1 * r, 0, 0);
          ctx.fill();
        } else {
          const s = back(fp);
          ctx.beginPath(); ctx.arc(0, -r * 0.55 * s, r * 0.72 * s, 0, 6.2832); ctx.fill();
          const cs = back(fp * 1.6 - 0.6);
          if (cs > 0) {
            ctx.fillStyle = eye;
            ctx.beginPath(); ctx.arc(r * 0.18, -r * 0.72, r * 0.2 * cs, 0, 6.2832); ctx.fill();
          }
        }
      }
      ctx.restore();
    }
  }
}

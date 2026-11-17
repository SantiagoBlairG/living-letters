import { SERIF } from './config';

/** Typographic layout: sizes the word to the stage and positions each glyph with real kerning. */

const REF = 200; // measuring size in px
let mctx: CanvasRenderingContext2D | null = null;
function measurer() {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d')!;
  return mctx;
}

export const fontOf = (px: number) => `400 ${px}px ${SERIF}`;

export interface Slot { ch: string; x: number; adv: number } // px, relative to the word's left edge
export interface WordLayout { fs: number; baseline: number; left: number; width: number; slots: Slot[] }

export function layoutWord(word: string, W: number, H: number, mobile: boolean): WordLayout {
  const ctx = measurer();
  ctx.font = fontOf(REF);
  const chars = Array.from(word);
  // Desktop: as wide as possible (50–66% of the stage) while staying clear of the 300px panel.
  const frac = mobile ? (W < 560 ? 0.84 : 0.72) : Math.min(0.66, Math.max(0.5, (W - 696) / W));
  const hFrac = mobile ? 0.3 : 0.47;
  const centerY = mobile ? H * 0.36 : H * 0.5;

  // Pen positions come from prefix widths, so pair kerning is preserved
  // even though every glyph is drawn on its own.
  const raw: Slot[] = [];
  let prefix = '';
  for (const ch of chars) {
    prefix += ch;
    const adv = ctx.measureText(ch).width;
    raw.push({ ch, x: ctx.measureText(prefix).width - adv, adv });
  }
  const total = chars.length ? ctx.measureText(word).width : 0;
  const byWidth = total > 0 ? (frac * W) / (total / REF) : Infinity;
  const byHeight = hFrac * H;
  const fs = Math.max(36, Math.min(byWidth, byHeight));
  const s = fs / REF;

  // Centre the ink of this particular word, not the font's line box.
  const m = ctx.measureText(word.trim() || 'x');
  const asc = m.actualBoundingBoxAscent * s;
  const desc = m.actualBoundingBoxDescent * s;
  const baseline = centerY + (asc - desc) / 2;

  return {
    fs,
    baseline,
    left: (W - total * s) / 2,
    width: total * s,
    slots: raw.map((r) => ({ ch: r.ch, x: r.x * s, adv: r.adv * s })),
  };
}

/* ---------- glyph masks: hit testing + plant anchors ---------- */

export const MS = 96; // mask pixels per em
export const PAD_X = 0.35;
export const ASC = 1.1;
const DESC = 0.45;

export interface Glyph {
  ch: string;
  mw: number; mh: number;
  alpha: Uint8Array;
  /** silhouette points as [x, y, nx, ny] in em, origin at the pen position on the baseline */
  edges: Float32Array;
  /** ink bounds [x0, y0, x1, y1] in em, same origin */
  box: [number, number, number, number];
}

const cache = new Map<string, Glyph | null>();
export function clearGlyphs() { cache.clear(); }

export function getGlyph(ch: string): Glyph | null {
  if (cache.has(ch)) return cache.get(ch)!;
  let g: Glyph | null = null;
  if (ch.trim() !== '') {
    const ctx = measurer();
    ctx.font = fontOf(MS);
    const adv = ctx.measureText(ch).width / MS;
    const mw = Math.ceil((adv + PAD_X * 2) * MS);
    const mh = Math.ceil((ASC + DESC) * MS);
    const c = document.createElement('canvas');
    c.width = mw; c.height = mh;
    const g2 = c.getContext('2d', { willReadFrequently: true })!;
    g2.font = fontOf(MS);
    g2.fillStyle = '#000';
    g2.fillText(ch, PAD_X * MS, ASC * MS);
    const data = g2.getImageData(0, 0, mw, mh).data;
    const alpha = new Uint8Array(mw * mh);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= mw || y >= mh ? 0 : alpha[y * mw + x]);
    const pts: number[] = [];
    for (let y = 1; y < mh - 1; y++) {
      for (let x = 1; x < mw - 1; x++) {
        if (((x + y) & 1) || at(x, y) < 128) continue;
        if (at(x - 1, y) >= 128 && at(x + 1, y) >= 128 && at(x, y - 1) >= 128 && at(x, y + 1) >= 128) continue;
        let gx = 0, gy = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const a = at(x + dx, y + dy);
          gx += a * dx; gy += a * dy;
        }
        const len = Math.hypot(gx, gy) || 1;
        pts.push((x - PAD_X * MS) / MS, (y - ASC * MS) / MS, -gx / len, -gy / len);
      }
    }
    let x0 = mw, y0 = mh, x1 = -1, y1 = -1;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      if (alpha[y * mw + x] < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const box: Glyph['box'] = x1 < 0
      ? [0, -0.5, adv, 0]
      : [(x0 - PAD_X * MS) / MS, (y0 - ASC * MS) / MS, (x1 + 1 - PAD_X * MS) / MS, (y1 + 1 - ASC * MS) / MS];
    g = { ch, mw, mh, alpha, edges: new Float32Array(pts), box };
  }
  cache.set(ch, g);
  return g;
}

/** Is the point (em, glyph space) inside the glyph's ink? */
export function inGlyph(g: Glyph, xe: number, ye: number): boolean {
  const x = Math.round((xe + PAD_X) * MS);
  const y = Math.round((ye + ASC) * MS);
  if (x < 0 || y < 0 || x >= g.mw || y >= g.mh) return false;
  return g.alpha[y * g.mw + x] > 60;
}

import type { Letter } from './types';

/**
 * A letter rendered on its own small canvas, at the resolution it has on screen, so a material can paint
 * textures that stay inside the ink (with 'source-atop') or cut the glyph into rows, then lay it back down.
 * One scratch canvas is shared: each layer is used and blitted before the next one is made.
 */

export interface Layer {
  c: HTMLCanvasElement; g: CanvasRenderingContext2D;
  x0: number; y0: number; x1: number; y1: number; // the box, in the letter's local px
  kx: number; ky: number; // device pixels per local px
  W: number; H: number; // the bitmap's used size
}

let scratch: HTMLCanvasElement | null = null;

/** Draws the glyph (with the context's current font and fill) onto the scratch canvas, ready to paint on. */
export function glyphLayer(ctx: CanvasRenderingContext2D, l: Letter, liftPx: number, fs: number, pad = 0.06): Layer | null {
  const T = ctx.getTransform();
  const kx = Math.hypot(T.a, T.b), ky = Math.hypot(T.c, T.d);
  if (kx < 1e-3 || ky < 1e-3) return null;
  const b = l.glyph!.box, p = fs * pad;
  const x0 = b[0] * fs - l.adv / 2 - p, x1 = b[2] * fs - l.adv / 2 + p, y0 = b[1] * fs + liftPx - p, y1 = b[3] * fs + liftPx + p;
  const W = Math.min(2048, Math.ceil((x1 - x0) * kx) + 2), H = Math.min(2048, Math.ceil((y1 - y0) * ky) + 2);
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width < W || scratch.height < H) { scratch.width = Math.max(scratch.width, W); scratch.height = Math.max(scratch.height, H); }
  const g = scratch.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, W, H);
  g.setTransform(kx, 0, 0, ky, -x0 * kx, -y0 * ky);
  g.font = ctx.font; g.textBaseline = ctx.textBaseline; g.fillStyle = ctx.fillStyle;
  g.fillText(l.ch, -l.adv / 2, liftPx);
  return { c: scratch, g, x0, y0, x1, y1, kx, ky, W, H };
}

/** Lays the layer back onto the letter. */
export function blit(ctx: CanvasRenderingContext2D, L: Layer) {
  L.g.globalCompositeOperation = 'source-over';
  L.g.globalAlpha = 1;
  ctx.drawImage(L.c, 0, 0, L.W, L.H, L.x0, L.y0, L.W / L.kx, L.H / L.ky);
}

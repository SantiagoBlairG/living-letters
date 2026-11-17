import type { Stage } from './stage';
import { css, mix } from './color';
import { fontOf } from './layout';
import { BEHAVIORS } from './materials';

/** Draws the scene — background, plants, letters, effects — at any pixel scale. Used for the screen and for export. */
export function renderScene(ctx: CanvasRenderingContext2D, st: Stage, scale: number) {
  const c = st.colors.now;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  const fade = Math.abs(c.bg[0] - c.bg2[0]) + Math.abs(c.bg[1] - c.bg2[1]) + Math.abs(c.bg[2] - c.bg2[2]) > 1.5;
  if (fade) {
    const g = ctx.createLinearGradient(0, 0, 0, st.H);
    g.addColorStop(0, css(c.bg)); g.addColorStop(1, css(c.bg2));
    ctx.fillStyle = g;
  } else ctx.fillStyle = css(c.bg);
  ctx.fillRect(0, 0, st.W, st.H);

  const mat = BEHAVIORS[st.material];
  if (mat.back) {
    mat.back(ctx, st, c);
    ctx.globalAlpha = 1;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  const accent = c[mat.accent];
  const liftPx = st.lift * st.fs;

  // Magnet: thin lines of tension while the field is held
  if (st.material === 'magnet' && st.p.down && st.p.active) {
    ctx.lineWidth = 1;
    for (const l of st.letters) {
      if (!l.glyph || l.heat < 0.04) continue;
      ctx.strokeStyle = css(c.stem, Math.min(0.55, l.heat * 0.6));
      ctx.beginPath(); ctx.moveTo(st.p.x, st.p.y); ctx.lineTo(st.cx(l), st.cy(l)); ctx.stroke();
    }
  }

  ctx.font = fontOf(st.fs);
  ctx.textBaseline = 'alphabetic';
  const hasPlants = st.plants.count > 0;
  for (const l of st.letters) {
    if (!l.glyph || l.alpha < 0.01) continue;
    const m = l.m;
    ctx.setTransform(m[0] * scale, m[1] * scale, m[2] * scale, m[3] * scale, m[4] * scale, m[5] * scale);
    ctx.globalAlpha = Math.min(1, l.alpha);
    if (hasPlants) st.plants.draw(ctx, l, false, c, st.fs, liftPx, st.t, st.amb, st.speed);
    ctx.fillStyle = css(l.heat > 0.01 ? mix(c.ink, accent, Math.min(1, l.heat) * 0.85) : c.ink);
    if (!mat.drawLetter?.(ctx, l, st, c, liftPx)) ctx.fillText(l.ch, -l.adv / 2, liftPx);
    if (hasPlants) st.plants.draw(ctx, l, true, c, st.fs, liftPx, st.t, st.amb, st.speed);
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (mat.front) {
    mat.front(ctx, st, c, scale);
    ctx.globalAlpha = 1;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  st.fx.draw(ctx, c);
}

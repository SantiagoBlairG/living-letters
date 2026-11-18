import type { Glyph } from './layout';
import type { Effects } from './effects';
import type { Plants } from './plants';
import type { Sound } from './audio';
import type { RGB } from './color';

export type MaterialId = 'jelly' | 'magnet' | 'bloom' | 'float' | 'gravity' | 'balloon' | 'wave' | 'explode' | 'sand' | 'melt' | 'blackhole' | 'elements' | 'focus' | 'echo' | 'ferro' | 'ice' | 'kaleido' | 'origami' | 'mirage' | 'bubble';
export type ElementId = 'fire' | 'air' | 'earth' | 'water';
export type ColorKey = 'bg' | 'bg2' | 'ink' | 'stem' | 'flower' | 'spark';

export interface Palette {
  id: string;
  name: string;
  bg: string;
  ink: string;
  stem: string;
  flower: string;
  spark: string;
  /** second background colour; the stage fades from bg (top) to bg2 (bottom) */
  bg2?: string;
  /** which row of the picker it sits in */
  group?: 'dark' | 'bright' | 'gradient';
}

export interface CustomColors {
  bg: string;
  ink: string;
  accent: string;
  gradient: boolean;
  bg2: string;
}

export interface Settings {
  word: string;
  material: MaterialId;
  intensity: number; // 0..1 slider
  motion: number; // 0..1 slider
  palette: string; // a preset id, or 'custom'
  custom: CustomColors;
  font: string;
  element: ElementId; // for the Elements material
  backdrop: boolean; // the faint background in the spirit of the material
  /** each material's own dial, 0..1; 0.5 is neutral */
  tune: Partial<Record<MaterialId, number>>;
}

/** One glyph of the word: a small rigid-ish body with springs on every channel. */
export interface Letter {
  ch: string;
  index: number;
  glyph: Glyph | null;
  adv: number; // advance in px
  bx: number; // pivot x at rest
  // spring state
  ox: number; oy: number; vx: number; vy: number;
  rot: number; vr: number;
  sx: number; vsx: number;
  sy: number; vsy: number;
  sk: number; vsk: number;
  // per-frame inputs written by the active material
  fx: number; fy: number;
  tx: number; ty: number;
  rT: number; sxT: number; syT: number; skT: number;
  kMul: number;
  heat: number; heatT: number;
  // presentation
  alpha: number;
  fade: number; // 0 visible … 1 hidden, set by a material (a black hole swallowing it)
  delay: number;
  phase: number; phase2: number;
  m: [number, number, number, number, number, number];
}

export interface Pointer {
  x: number; y: number;
  lx: number; ly: number;
  vx: number; vy: number; speed: number;
  inside: boolean;
  touch: boolean;
  down: boolean;
  held: number;
  downX: number; downY: number;
  travel: number;
  grab: Letter | null;
  near: number; // 0..1 proximity to the nearest glyph, drives cursors
  /** hovering with a mouse, or pressing with a finger */
  active: boolean;
}

export interface SpringSpec {
  k: number; c: number; // position
  rk: number; rc: number; // rotation
  sk: number; sc: number; // scale + skew
  limit: number; // max displacement, in em
  lift: number; // pivot height above the baseline, in em
  /** Letters are free bodies: the material moves and turns them itself, nothing pulls them home. */
  free?: boolean;
}

export interface EdgeHit {
  l: Letter;
  ex: number; ey: number; // em, glyph space (origin: pen position on the baseline)
  nx: number; ny: number; // outward normal
  dist: number; // px
  inside: boolean;
  ix: number; iy: number; // the queried point itself, in glyph space
}

export interface Ambient { x: number; y: number; r: number; sx: number; sy: number }

export interface World {
  letters: Letter[];
  fs: number;
  baseline: number;
  W: number; H: number;
  t: number;
  p: Pointer;
  inten: number; // interaction strength multiplier
  amb: number; // ambient amplitude multiplier
  speed: number; // ambient speed multiplier
  tune: number; // the active material's own dial, 0..1 (0.5 is neutral)
  element: ElementId;
  fx: Effects;
  plants: Plants;
  sound: Sound;
  later(ms: number, fn: () => void): void;
  /** A black hole at full size swallows the interface (a point), or gives it back (null). */
  devour(at: { x: number; y: number } | null): void;
  hit(x: number, y: number): Letter | null;
  nearestEdge(x: number, y: number, maxPx: number): EdgeHit | null;
  cx(l: Letter): number;
  cy(l: Letter): number;
}

export interface Material {
  id: MaterialId;
  accent: ColorKey;
  spring: SpringSpec;
  ambient(l: Letter, w: World, out: Ambient): void;
  update(w: World, dt: number): void;
  down(w: World, hit: Letter | null): void;
  up(w: World, hit: Letter | null, click: boolean): void;
  /** Called when this material becomes the active one. */
  enter?(w: World): void;
  /** Replaces the default "back to rest" when the scene is reset. */
  reset?(w: World): void;
  /** Draws under the letters, in stage pixels (strings, ripples…). Also part of exports. */
  back?(ctx: CanvasRenderingContext2D, w: World, colors: Record<ColorKey, RGB>): void;
  /** Draws one letter in its own transform, with its fill already set. Return true to replace the plain glyph. */
  /** Draws over the letters, before effects. `scale` is device pixels per stage pixel. */
  front?(ctx: CanvasRenderingContext2D, w: World, colors: Record<ColorKey, RGB>, scale: number): void;
  drawLetter?(ctx: CanvasRenderingContext2D, l: Letter, w: World, colors: Record<ColorKey, RGB>, liftPx: number): boolean;
}

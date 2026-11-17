import type { ColorKey, Palette } from './types';

export type RGB = [number, number, number];
export const KEYS: ColorKey[] = ['bg', 'ink', 'stem', 'flower', 'spark'];

export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const css = (c: RGB, a = 1) =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];

/** The palette as it is on screen right now — eases toward the selected one, so nothing flashes. */
export class LiveColors {
  now: Record<ColorKey, RGB>;
  private target: Record<ColorKey, RGB>;
  constructor(p: Palette) {
    this.now = this.read(p);
    this.target = this.read(p);
  }
  private read(p: Palette) {
    return { bg: hex(p.bg), ink: hex(p.ink), stem: hex(p.stem), flower: hex(p.flower), spark: hex(p.spark) };
  }
  set(p: Palette) { this.target = this.read(p); }
  update(dt: number) {
    const q = 1 - Math.exp(-dt * 7);
    for (const k of KEYS) this.now[k] = mix(this.now[k], this.target[k], q);
  }
}

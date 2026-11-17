import type { CustomColors, ElementId, MaterialId, Palette, Settings } from './types';
import { mixHex } from './color';

export const SERIF = '"Gloock", "Bodoni 72", "Didot", "Playfair Display", Georgia, "Times New Roman", serif';
export const MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const MAX_CHARS = 14;

/** Typefaces for the word. Each is bundled locally; see licenses/. */
export const FONTS = [
  { id: 'serif', label: 'Serif', family: SERIF, weight: 400 },
  { id: 'heavy', label: 'Heavy', family: '"Archivo Black", "Arial Black", Impact, sans-serif', weight: 400 },
  { id: 'round', label: 'Round', family: '"Fredoka", "Arial Rounded MT Bold", sans-serif', weight: 600 },
  { id: 'mono', label: 'Mono', family: '"Space Mono", ui-monospace, Menlo, monospace', weight: 700 },
  { id: 'hand', label: 'Hand', family: '"Caveat", "Segoe Print", cursive', weight: 700 },
];

export const DEFAULT_CUSTOM: CustomColors = { bg: '#15131f', ink: '#f6f1e7', accent: '#ff7a59', gradient: true, bg2: '#3a2560' };

/** The palette in use: a preset, or one built from the custom colours. */
export function resolvePalette(s: Pick<Settings, 'palette' | 'custom'>): Palette {
  if (s.palette === 'custom') {
    const c = s.custom;
    return {
      id: 'custom', name: 'Custom', bg: c.bg, ink: c.ink, flower: c.accent,
      spark: mixHex(c.accent, '#ffffff', 0.35), stem: mixHex(c.accent, c.ink, 0.45),
      bg2: c.gradient ? c.bg2 : c.bg,
    };
  }
  return PALETTES.find((p) => p.id === s.palette) ?? PALETTES[0];
}

export const PALETTES: Palette[] = [
  { id: 'night', name: 'Night', bg: '#080808', ink: '#F3F0E8', stem: '#4056FF', flower: '#FF452B', spark: '#DFFF70' },
  { id: 'paper', name: 'Paper', bg: '#F3F0E8', ink: '#080808', stem: '#4056FF', flower: '#FF452B', spark: '#8FAE00' },
  { id: 'cobalt', name: 'Cobalt', bg: '#4056FF', ink: '#F3F0E8', stem: '#080808', flower: '#FF452B', spark: '#DFFF70' },
  { id: 'ember', name: 'Ember', bg: '#FF452B', ink: '#080808', stem: '#F3F0E8', flower: '#4056FF', spark: '#DFFF70' },
  { id: 'acid', name: 'Acid', bg: '#DFFF70', ink: '#080808', stem: '#4056FF', flower: '#FF452B', spark: '#4056FF' },
];

export interface MaterialInfo {
  id: MaterialId;
  label: string;
  note: string;
  help: string;
  touchHelp: string;
}

export const MATERIALS: MaterialInfo[] = [
  {
    id: 'jelly', label: 'Jelly', note: 'Soft and elastic',
    help: 'Hover to push · Click to bounce · Drag to stretch',
    touchHelp: 'Swipe to push · Tap to bounce · Drag a letter to stretch',
  },
  {
    id: 'balloon', label: 'Balloon', note: 'Inflates until it pops',
    help: 'Hover to inflate · Click to pop · Drag to stretch the string',
    touchHelp: 'Hold a letter to inflate · Tap to pop · Drag to stretch',
  },
  {
    id: 'magnet', label: 'Magnet', note: 'Pulls and pulses',
    help: 'Hover to attract · Click to pulse · Hold to pull harder',
    touchHelp: 'Tap to pulse · Touch and hold to pull · Drag to move the field',
  },
  {
    id: 'bloom', label: 'Bloom', note: 'Grows a garden',
    help: 'Hover to sprout · Click to flower · Drag to sow',
    touchHelp: 'Tap a letter to flower · Drag across letters to sow',
  },
  {
    id: 'float', label: 'Float', note: 'Light as air',
    help: 'Move to make a current · Click for a gust · Drag to tow',
    touchHelp: 'Swipe to make a current · Tap for a gust · Drag a letter to tow',
  },
  {
    id: 'wave', label: 'Wave', note: 'Ripples like water',
    help: 'Hover to rock · Click to drop · Drag to leave a wake',
    touchHelp: 'Tap to drop · Drag to leave a wake',
  },
  {
    id: 'gravity', label: 'Gravity', note: 'Falls and piles up',
    help: 'Hover to shove · Click to flip gravity · Drag to throw',
    touchHelp: 'Swipe to shove · Tap to flip gravity · Drag a letter to throw',
  },
  {
    id: 'explode', label: 'Shatter', note: 'Cracks, breaks, explodes',
    help: 'Hover to crack · Click to shatter · Hold to charge a blast',
    touchHelp: 'Tap a letter to shatter · Hold to charge a blast',
  },
  {
    id: 'sand', label: 'Sand', note: 'Blows away in grains',
    help: 'Hover to erode · Click for a dust cloud · Drag to cut a furrow',
    touchHelp: 'Swipe to blow · Tap for a dust cloud · Drag to sweep',
  },
  {
    id: 'melt', label: 'Melt', note: 'Drips and puddles',
    help: 'Hover to melt · Click to splash · Hold a letter to pour it, drag to paint',
    touchHelp: 'Tap to splash · Hold a letter to pour it, drag to paint',
  },
  {
    id: 'blackhole', label: 'Black hole', note: 'Swallows letters, spits them back',
    help: 'Hover to bend · Click to leave a hole · Hold to grow one, let go to release',
    touchHelp: 'Tap to leave a hole · Hold to grow one, let go to release',
  },
  {
    id: 'elements', label: 'Elements', note: 'Fire, air, earth and water',
    help: '', touchHelp: '', // each element has its own; see ELEMENTS
  },
];

/** The four elements of the Elements material, each with its own gestures. */
export const ELEMENTS: { id: ElementId; label: string; help: string; touchHelp: string }[] = [
  { id: 'fire', label: 'Fire', help: 'Hover to set alight · Click for a fireball · Drag to leave fire behind', touchHelp: 'Touch to set alight · Tap for a fireball · Drag to leave fire behind' },
  { id: 'air', label: 'Air', help: 'Hover to make them flutter · Click for a tornado · Drag for a gust', touchHelp: 'Swipe to make them flutter · Tap for a tornado · Drag for a gust' },
  { id: 'earth', label: 'Earth', help: 'Hover to turn to stone · Click for an earthquake · Drag to crack', touchHelp: 'Touch to turn to stone · Tap for an earthquake · Drag to crack' },
  { id: 'water', label: 'Water', help: 'The cloud rains where you go · Click for a downpour · Drag to move the storm', touchHelp: 'Touch to rain · Tap for a downpour · Drag to move the storm' },
];

/** Each material's own dial, shown under Intensity and Motion. */
export const TUNES: Record<MaterialId, { label: string; hint: string }> = {
  jelly: { label: 'Softness', hint: 'How much the letters wobble' },
  balloon: { label: 'Air', hint: 'How fast the letters fill up' },
  magnet: { label: 'Reach', hint: 'How far the field pulls' },
  bloom: { label: 'Density', hint: 'How thick the garden grows' },
  float: { label: 'Lightness', hint: 'How easily the letters drift' },
  wave: { label: 'Ripple size', hint: 'How tall and wide the waves are' },
  gravity: { label: 'Weight', hint: 'How hard the letters fall' },
  explode: { label: 'Shards', hint: 'How many pieces a letter breaks into' },
  sand: { label: 'Grain size', hint: 'From fine dust to coarse sand' },
  melt: { label: 'Flow', hint: 'How runny the liquid is' },
  blackhole: { label: 'Mass', hint: 'How strongly the holes pull' },
  elements: { label: 'Strength', hint: 'How fierce the element is' },
};

export const SUGGESTIONS = ['hello', 'jelly', 'bloom', 'float', 'chaos'];

/** Hand-picked combinations for “Surprise me”. */
export const PRESETS: { word: string; material: MaterialId; palette: string }[] = [
  { word: 'jelly', material: 'jelly', palette: 'cobalt' },
  { word: 'bloom', material: 'bloom', palette: 'night' },
  { word: 'float', material: 'float', palette: 'paper' },
  { word: 'chaos', material: 'magnet', palette: 'ember' },
  { word: 'wobble', material: 'jelly', palette: 'acid' },
  { word: 'garden', material: 'bloom', palette: 'paper' },
  { word: 'drift', material: 'float', palette: 'night' },
  { word: 'pull', material: 'magnet', palette: 'night' },
  { word: 'jardín', material: 'bloom', palette: 'cobalt' },
  { word: 'breeze', material: 'float', palette: 'cobalt' },
  { word: 'squish', material: 'jelly', palette: 'night' },
  { word: 'orbit', material: 'magnet', palette: 'paper' },
  { word: 'tumble', material: 'gravity', palette: 'acid' },
  { word: 'heavy', material: 'gravity', palette: 'ember' },
  { word: 'oops', material: 'gravity', palette: 'cobalt' },
  { word: 'party', material: 'balloon', palette: 'paper' },
  { word: 'pop!', material: 'balloon', palette: 'acid' },
  { word: 'ocean', material: 'wave', palette: 'cobalt' },
  { word: 'ola', material: 'wave', palette: 'night' },
  { word: 'boom', material: 'explode', palette: 'ember' },
  { word: 'glass', material: 'explode', palette: 'paper' },
  { word: 'crash', material: 'explode', palette: 'night' },
  { word: 'dune', material: 'sand', palette: 'ember' },
  { word: 'desert', material: 'sand', palette: 'acid' },
  { word: 'arena', material: 'sand', palette: 'cobalt' },
  { word: 'melt', material: 'melt', palette: 'ember' },
  { word: 'honey', material: 'melt', palette: 'paper' },
  { word: 'drip', material: 'melt', palette: 'night' },
  { word: 'void', material: 'blackhole', palette: 'night' },
  { word: 'cosmos', material: 'blackhole', palette: 'cobalt' },
  { word: 'storm', material: 'elements', palette: 'night' },
  { word: 'fuego', material: 'elements', palette: 'ember' },
];

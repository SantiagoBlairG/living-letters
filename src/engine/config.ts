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

/** Colour palettes, in three rows: dark, bright, and gradients (the stage fades from bg at the top to bg2). */
export const PALETTES: Palette[] = [
  { id: 'night', name: 'Night', group: 'dark', bg: '#080808', ink: '#F3F0E8', stem: '#4056FF', flower: '#FF452B', spark: '#DFFF70' },
  { id: 'midnight', name: 'Midnight', group: 'dark', bg: '#0E1530', ink: '#E8ECFF', stem: '#5B7CFF', flower: '#FF6B8B', spark: '#9BE7FF' },
  { id: 'forest', name: 'Forest', group: 'dark', bg: '#0D1F17', ink: '#E9F2E4', stem: '#3FA36B', flower: '#F2A541', spark: '#C8F169' },
  { id: 'plum', name: 'Plum', group: 'dark', bg: '#1E0F24', ink: '#F4E8F7', stem: '#9B5DE5', flower: '#F15BB5', spark: '#FEE440' },
  { id: 'oxblood', name: 'Oxblood', group: 'dark', bg: '#2A0C0E', ink: '#F7E6DA', stem: '#E3A35C', flower: '#E5383B', spark: '#FFD6A5' },
  { id: 'slate', name: 'Slate', group: 'dark', bg: '#1B2128', ink: '#E6EDF3', stem: '#6CB4C9', flower: '#F28C61', spark: '#E9F28C' },
  { id: 'paper', name: 'Paper', group: 'bright', bg: '#F3F0E8', ink: '#080808', stem: '#4056FF', flower: '#FF452B', spark: '#8FAE00' },
  { id: 'cobalt', name: 'Cobalt', group: 'bright', bg: '#4056FF', ink: '#F3F0E8', stem: '#080808', flower: '#FF452B', spark: '#DFFF70' },
  { id: 'ember', name: 'Ember', group: 'bright', bg: '#FF452B', ink: '#080808', stem: '#F3F0E8', flower: '#4056FF', spark: '#DFFF70' },
  { id: 'acid', name: 'Acid', group: 'bright', bg: '#DFFF70', ink: '#080808', stem: '#4056FF', flower: '#FF452B', spark: '#4056FF' },
  { id: 'sky', name: 'Sky', group: 'bright', bg: '#BFE3FF', ink: '#0B1B3A', stem: '#2E5BFF', flower: '#FF5C8A', spark: '#0E8F6F' },
  { id: 'peach', name: 'Peach', group: 'bright', bg: '#FFD9C2', ink: '#2B1810', stem: '#1F7A6B', flower: '#E5383B', spark: '#2E5BFF' },
  { id: 'aurora', name: 'Aurora', group: 'gradient', bg: '#0B1E3B', bg2: '#1F6E6A', ink: '#EFFFF8', stem: '#46E0B4', flower: '#B48CFF', spark: '#E6FF7A' },
  { id: 'dusk', name: 'Dusk', group: 'gradient', bg: '#15131F', bg2: '#3A2560', ink: '#F6F1E7', stem: '#8E7CFF', flower: '#FF7A59', spark: '#FFD27A' },
  { id: 'sunset', name: 'Sunset', group: 'gradient', bg: '#2B0F3A', bg2: '#C9473F', ink: '#FFF3E6', stem: '#FFB347', flower: '#FFD166', spark: '#FF8FAB' },
  { id: 'ocean', name: 'Ocean', group: 'gradient', bg: '#031B2E', bg2: '#0F5E7A', ink: '#E6F7FF', stem: '#3DDCFF', flower: '#FF8A65', spark: '#B8FFF2' },
  { id: 'embers', name: 'Embers', group: 'gradient', bg: '#1A0A05', bg2: '#6B1F0E', ink: '#FFEBD6', stem: '#FF9F43', flower: '#FF4D2E', spark: '#FFD66B' },
  { id: 'candy', name: 'Candy', group: 'gradient', bg: '#FFD6E8', bg2: '#C9D7FF', ink: '#1E1640', stem: '#5B4BDB', flower: '#FF4F8B', spark: '#00A6A6' },
];

/** A palette for Surprise me: often a gradient, sometimes dark, sometimes bright — never the one in use. */
export function surprisePalette(current: string) {
  const r = Math.random();
  const group = r < 0.45 ? 'gradient' : r < 0.75 ? 'dark' : 'bright';
  const pool = PALETTES.filter((p) => p.group === group && p.id !== current);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

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
  {
    id: 'focus', label: 'Focus', note: 'A lens with depth of field',
    help: 'Hover to focus · Click to rack focus · Hold to zoom',
    touchHelp: 'Touch to focus · Tap to rack focus · Hold to zoom',
  },
  {
    id: 'echo', label: 'Echo', note: 'Ghosts of a long exposure',
    help: 'Hover to smear · Click to strobe · Hold to split into ghosts',
    touchHelp: 'Swipe to smear · Tap to strobe · Hold to split into ghosts',
  },
  {
    id: 'ferro', label: 'Ferrofluid', note: 'Magnetic liquid, spiking',
    help: 'Hover to raise spikes · Click to bristle · Hold to pull the liquid',
    touchHelp: 'Touch to raise spikes · Tap to bristle · Hold to pull',
  },
  {
    id: 'ice', label: 'Ice', note: 'Frost that grows and melts',
    help: 'Hover to grow frost · Click to freeze · Hold to melt',
    touchHelp: 'Touch to grow frost · Tap to freeze · Hold to melt',
  },
  {
    id: 'kaleido', label: 'Kaleido', note: 'Mirrors all around',
    help: 'Hover to move the mirrors · Click to add mirrors · Hold to turn',
    touchHelp: 'Touch to move the mirrors · Tap to add mirrors · Hold to turn',
  },
  {
    id: 'origami', label: 'Origami', note: 'Folds and crumples',
    help: 'Hover to fold · Click to flap · Hold to crumple',
    touchHelp: 'Touch to fold · Tap to flap · Hold to crumple',
  },
  {
    id: 'mirage', label: 'Mirage', note: 'Heat haze and reflection',
    help: 'Hover to heat · Click for a heat wave · Hold to blaze',
    touchHelp: 'Touch to heat · Tap for a heat wave · Hold to blaze',
  },
  {
    id: 'bubble', label: 'Bubble', note: 'Floating in soap bubbles',
    help: 'Hover to wobble · Click to pop · Hold to blow bubbles',
    touchHelp: 'Touch to wobble · Tap to pop · Hold to blow bubbles',
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
  focus: { label: 'Depth', hint: 'How shallow the focus is' },
  echo: { label: 'Trail', hint: 'How long the echoes last' },
  ferro: { label: 'Spikes', hint: 'How tall the spikes grow' },
  ice: { label: 'Cold', hint: 'How fast the frost grows' },
  kaleido: { label: 'Mirrors', hint: 'How many reflections' },
  origami: { label: 'Fold', hint: 'How far the paper folds' },
  mirage: { label: 'Heat', hint: 'How strongly the air shimmers' },
  bubble: { label: 'Size', hint: 'How big the bubbles are' },
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
  { word: 'blur', material: 'focus', palette: 'midnight' },
  { word: 'lens', material: 'focus', palette: 'dusk' },
  { word: 'ghost', material: 'echo', palette: 'plum' },
  { word: 'again', material: 'echo', palette: 'aurora' },
  { word: 'spike', material: 'ferro', palette: 'slate' },
  { word: 'metal', material: 'ferro', palette: 'night' },
  { word: 'frost', material: 'ice', palette: 'ocean' },
  { word: 'winter', material: 'ice', palette: 'midnight' },
  { word: 'mirror', material: 'kaleido', palette: 'plum' },
  { word: 'prism', material: 'kaleido', palette: 'aurora' },
  { word: 'paper', material: 'origami', palette: 'paper' },
  { word: 'fold', material: 'origami', palette: 'peach' },
  { word: 'desert', material: 'mirage', palette: 'sunset' },
  { word: 'heat', material: 'mirage', palette: 'embers' },
  { word: 'bubble', material: 'bubble', palette: 'candy' },
  { word: 'soap', material: 'bubble', palette: 'ocean' },
];

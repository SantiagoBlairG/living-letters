import type { MaterialId, Palette } from './types';

export const SERIF = '"Gloock", "Bodoni 72", "Didot", "Playfair Display", Georgia, "Times New Roman", serif';
export const MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const MAX_CHARS = 14;

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
    id: 'jelly', label: 'Jelly', note: 'Soft, elastic',
    help: 'Hover to push · Click to bounce · Drag to stretch',
    touchHelp: 'Swipe to push · Tap to bounce · Drag a letter to stretch',
  },
  {
    id: 'magnet', label: 'Magnet', note: 'Pull, pulse',
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
];

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
];

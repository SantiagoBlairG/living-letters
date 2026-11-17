# Living Letters

A playground for words. Type a word, pick a material, and touch the letters.

Four materials, each with its own physics, cursor and sound:

| Material | Hover | Click | Drag |
| --- | --- | --- | --- |
| Jelly | pushes letters, squash and stretch | bounce that ripples through the neighbours | grab a letter and stretch it |
| Magnet | letters lean and slide toward the pointer | repulsion pulse | hold for a stronger field that follows you |
| Bloom | stems and leaves sprout from the glyph outlines | a full flower opens, in stages | sow a trail of buds across the letters |
| Float | pointer movement becomes a current | radial gust | tow a letter on an elastic thread |

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # static site in dist/
npm run build:single   # one self-contained file: dist-single/index.html
```

Node 20+ is enough. There is no backend.

## Shortcuts

`H` hide/show the panel · `1`–`4` materials · `R` reset · double-click empty stage (panel hidden) to retype · `Esc` closes the editor.
Shortcuts are suspended while a text field has focus.

## How it is put together

```
src/
  App.tsx, ui/            interface and control state (React). Never updated per frame.
  engine/
    stage.ts              the single requestAnimationFrame loop, pointer input, the "world"
    layout.ts             word sizing, kerned glyph positions, glyph alpha masks + outline points
    simulation.ts         damped springs per letter (position, rotation, scale, skew), delta time
    materials/            jelly.ts, magnet.ts, bloom.ts, float.ts — one behaviour each
    plants.ts             Bloom's vector garden, anchored to glyph silhouettes
    effects.ts            rings, pulses, gusts, bursts
    cursor.ts             the four drawn cursors
    renderer.ts           draws the scene at any scale (screen and export share it)
    exporter.ts           PNG export at ~2x
    audio.ts              synthesized sounds, created only after the user turns sound on
```

Everything is drawn on one Canvas 2D. Each glyph is drawn on its own with its own transform, but
pen positions come from prefix measurements of the whole word, so kerning is preserved. Hit testing
and plant anchoring use a sampled alpha mask of each glyph, not its bounding box.

## Fonts

Bundled locally, both under the SIL Open Font License 1.1 (see `licenses/`):

- **Gloock** — the word. Copyright 2022 The Gloock Project Authors.
- **IBM Plex Mono** — the interface. Copyright © 2017 IBM Corp.

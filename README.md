# Living Letters

A playground for words. Type a word, pick a material, and touch the letters.

Twelve materials, each with its own physics, cursor and sound:

| Material | Hover | Click | Drag |
| --- | --- | --- | --- |
| Jelly | pushes letters, squash and stretch | bounce that ripples through the neighbours | grab a letter and stretch it |
| Magnet | letters lean and slide toward the pointer | repulsion pulse | hold for a stronger field that follows you |
| Bloom | stems and leaves sprout from the glyph outlines | a full flower opens, in stages | sow a trail of buds across the letters |
| Float | pointer movement becomes a current | radial gust | tow a letter on an elastic thread |
| Balloon | inflates the letters, which pop when full | pops a letter into confetti (on empty stage: a puff of air) | stretches a letter on its string |
| Wave | rocks the letters and presses the surface | drops a ripple that travels through the word | leaves a wake |
| Shatter | cracks spread from the pointer until the letter gives | breaks the letter into shards that fly back together | hold anywhere to charge a blast that shatters everything in reach |
| Sand | the letter fades into grains that loosen from the surface inward and blow away | a dust cloud | cuts a furrow through the grains |
| Melt | the letter drips from where you touch | a splash that sets the letters running | hold a letter and it pours into a puddle; drag to paint with it |
| Black hole | bends and stretches the letters toward the pointer | leaves a hole whose reach grows until every letter, nearest first, has orbited in, been stretched into a strand and swallowed; then it spits them back out as a white hole | hold to grow a hole under the hand; at full size it swallows the interface too; let go to release everything |
| Elements | fire sets letters alight · air makes them flutter · earth turns them to stone · water rains on them | fireball · tornado · earthquake · downpour | trail of fire · gust · cracks · moves the storm |
| Gravity | the pointer is a ball that shoves letters | flips gravity (on a letter: kicks it) | pick a letter up and throw it |

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # static site in dist/
npm run build:single   # one self-contained file: dist-single/index.html
```

Node 20+ is enough. There is no backend.

## Make it yours

- **Typeface** for the word: Serif, Heavy, Round, Mono or Hand.
- **Colour**: five presets, or **Custom** with your own background, letters and accent, and an optional gradient.
- **Fine-tune**: besides Intensity and Motion, each material has its own dial (Softness, Air, Reach, Density, Lightness, Ripple size, Weight, Shards, Grain size, Flow).

## Export

**Export** (bottom right) opens a small menu:

- **Canvas**: Screen, Square (1080 × 1080), Story (1080 × 1920) or Wide (1920 × 1080). A format other than Screen reshapes the stage itself into that frame, so what you play is what you save.
- **Save image**: a PNG of this moment, optionally with a **transparent background**.
- **Record video**: records what you do next, until you press Stop (up to 20 s), at the format's size — the letters only, without cursor or interface. MP4 where the browser can record it (Chrome, Safari), WebM otherwise.

## Typing and shortcuts

Just type: any key writes straight onto the stage, with a caret after the last letter, whether the panel is open or not.
On touch screens, double-tap empty stage to edit the word.

`Esc` hide/show the controls · `←` `→` switch material · `↑` `↓` or the mouse wheel switch element (Elements) · `Enter` reset the scene.
Text fields in the panel keep their own keys.

## How it is put together

```
src/
  App.tsx, ui/            interface and control state (React). Never updated per frame.
  engine/
    stage.ts              the single requestAnimationFrame loop, pointer input, the "world"
    layout.ts             word sizing, kerned glyph positions, glyph alpha masks + outline points
    simulation.ts         damped springs per letter (position, rotation, scale, skew), delta time
    materials/            jelly, balloon, magnet, bloom, float, wave, gravity, explode, sand, melt, blackhole, elements — one behaviour each (gravity runs its own rigid-body step)
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

Bundled locally, all under the SIL Open Font License 1.1 (see `licenses/`):

- **Gloock** — the word. Copyright 2022 The Gloock Project Authors.
- **Figtree** — the interface. Copyright 2022 The Figtree Project Authors.
- **Archivo Black**, **Fredoka**, **Space Mono**, **Caveat** — the other typefaces for the word.
- **IBM Plex Mono** — key caps. Copyright © 2017 IBM Corp.

# Ornament Atelier

Ornament Atelier is a browser app for designing radial and straight ornaments. Bring your own bitmap motifs, shapes, lines or text, arrange them around a ring or along a guide, and export the result as images, vectors or separate layers.

**Live:** <https://demifury.github.io/ornament-atelier/>

## Install as an app

Open the live link in Chrome or Edge and install it:

- **Chrome:** the **Install** icon at the right end of the address bar, or **More (⋮) › Cast, save, and share › Install page as app…**
- **Edge:** **Settings and more (…) › More tools › Apps › Install this site as an app**

It then opens in its own window from the Start menu and works offline after the first visit.

To run it from a copy of this repository, serve the folder with any static web server (for example `python -m http.server`) and open it at localhost.

## Two modes

- **Circle** – layers are arranged around a ring. Each layer has its own radius, origin, arc, gaps, mirroring and start angle, and can be moved and rotated with handles directly in the preview.
- **Straight** – the same layers laid out along a horizontal guide, with tiling and an animated preview.

Both modes share the layer list, roughness and mask controls.

## Layer types

- **Ring** – a circle or arc stroke, with gaps if you want them.
- **Asset** – an uploaded bitmap motif, repeated around the ring and optionally bent to follow it.
- **Shape** – built-in polygons and basic shapes with fill and stroke.
- **Line** – short strokes repeated around the ring, like the ticks of a dial.
- **Straight line** – a free line with its own angle, length and offset, solid, dashed or dotted; useful for axes and starbursts.
- **Text** – a word or phrase set letter by letter along the ring, with alignment, letter spacing and optional fit-to-arc. Load a font file or pick an installed font; fonts are saved with the project.

## Main tools

- **Groups** – nest layers, hide or rename them, and move, scale or rotate a whole group at once; **Scale line widths** decides whether strokes get thinner and thicker with the group.
- **Blend** (Circle mode) – pick two layers of the same type and generate smooth in-between steps, like a blend in a vector editor.
- **Repeat around a point** (Circle mode) – copy a group around a pivot you place yourself, for rosettes and flowers of flowers.
- **Roughness** – gives edges a hand-made, uneven look.
- **Mask** – an uploaded texture that erases parts of the whole artwork, for a worn or printed look.
- **Animation** – per-layer speed and an animated export.
- **Handles and badges** – drag a layer's origin, radius or rotation in the preview, and edit count or size from small badges next to it.
- **Camera** – zoom, pan, fit the design or the artboard.

## Export

- PNG
- SVG, as one file or as a layered file with named groups
- PNG ZIP, with one image per layer
- Animation as numbered PNG frames in a ZIP (Straight mode), ready for a video editor
- Project files, to save your work and reopen it later

## Shortcuts

| Keys | Action |
|------|--------|
| Ctrl + Z / Ctrl + Shift + Z | Undo / redo |
| Ctrl + S | Save project |
| Ctrl + F | Open project |
| Ctrl + E | Export PNG |
| Ctrl + G / Ctrl + Shift + G | Group / ungroup |
| Delete | Remove selected layers |
| Ctrl or Alt + scroll | Zoom |
| Space + drag | Pan |
| F / 0 / 1 | Fit design / fit artboard / 100% |

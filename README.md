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

- **Ring** – a circle or arc stroke, with gaps if you want them and an optional fill.
- **Asset** – an uploaded bitmap motif, repeated around the ring and optionally bent to follow it.
- **Shape** – built-in polygons and basic shapes with fill and stroke.
- **Line** – short strokes repeated around the ring, like the ticks of a dial.
- **Straight line** – a free line with its own angle, length and offset, solid, dashed or dotted; useful for axes and starbursts.
- **Text** – one or more lines set letter by letter along the ring or straight out from the centre like spokes, with alignment, fit-to-arc and character settings: leading, tracking, kerning, horizontal and vertical scale, baseline shift, letter rotation, all caps, small caps, underline and strikethrough. Pick a built-in font, load a font file or use an installed font (Chrome and Edge); fonts are saved with the project. Symbol fonts come with a glyph picker.

## Main tools

- **Groups** – nest layers, hide or rename them, and move, scale or rotate a whole group at once; **Scale line widths** decides whether strokes get thinner and thicker with the group.
- **Blend** (Circle mode) – pick two layers of the same type and generate smooth in-between steps, like a blend in a vector editor, either in a straight line or around a point, optionally closing the loop.
- **Repeat around a point** (Circle mode) – copy a group around a pivot you place yourself, for rosettes and flowers of flowers.
- **Roughness** – gives edges a hand-made, uneven look.
- **Mask layers** – turn any layer or group into a mask that cuts out everything below it in its group, for example letters cut out of a thick ring.
- **Texture mask** – an uploaded texture that erases parts of the whole artwork, for a worn or printed look.
- **Animation** – per-layer speed and an animated export.
- **Handles and badges** – drag a layer's origin, radius or rotation in the preview, and edit count or size from small badges next to it.
- **Layer list** – drag layers into and out of groups, select a single layer inside a group by its row or by double-clicking it, and deselect with Esc.
- **Camera** – the canvas has no edge; zoom, pan, fit the design or the centre.

## Export

- PNG, a square centred on the ring centre, up to 4096 px
- SVG, as one file or as a layered file with named groups
- PNG ZIP, with one image per layer
- Animation as numbered PNG frames in a ZIP (Straight mode), ready for a video editor
- Project files: each save is the full-size PNG export with the editable project inside, so you can see it in your file browser and open it again; drop a project file onto the page to open it (older .json saves still open)

## Shortcuts

| Keys | Action |
|------|--------|
| Ctrl + Z / Ctrl + Shift + Z | Undo / redo |
| Ctrl + S | Save project |
| Ctrl + F | Open project |
| Ctrl + E | Export PNG |
| Ctrl + G / Ctrl + Shift + G | Group / ungroup |
| Delete | Remove selected layers |
| Esc / Ctrl + Shift + A | Deselect |
| Ctrl or Alt + scroll | Zoom |
| Space + drag | Pan |
| F / 0 / 1 | Fit design / fit centre / 100% |

## Fonts

The built-in fonts are licensed under the SIL Open Font License 1.1; the licence texts are in `fonts/licenses/`.

- [Caudex](https://fonts.google.com/specimen/Caudex) by Hjort Nidudsson
- [Monoton](https://fonts.google.com/specimen/Monoton) by Vernon Adams
- [Cinzel Decorative](https://fonts.google.com/specimen/Cinzel+Decorative) by Natanael Gama
- [Macondo Swash Caps](https://fonts.google.com/specimen/Macondo+Swash+Caps) by John Vargas Beltrán
- [Kolker Brush](https://fonts.google.com/specimen/Kolker+Brush) by The Kolker Brush Project Authors
- [Pirata One](https://fonts.google.com/specimen/Pirata+One) by Rodrigo Fuenzalida, Nicolas Massi
- [Almendra](https://fonts.google.com/specimen/Almendra) by Ana Sanfelippo
- [Noto Sans Runic](https://fonts.google.com/noto/specimen/Noto+Sans+Runic) by The Noto Project Authors
- [Noto Sans Mayan Numerals](https://fonts.google.com/noto/specimen/Noto+Sans+Mayan+Numerals) by The Noto Project Authors
- [Noto Sans Egyptian Hieroglyphs](https://fonts.google.com/noto/specimen/Noto+Sans+Egyptian+Hieroglyphs) by The Noto Project Authors
- [Noto Sans Symbols 2](https://fonts.google.com/noto/specimen/Noto+Sans+Symbols+2) by The Noto Project Authors

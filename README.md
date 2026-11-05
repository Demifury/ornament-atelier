# Ornament Atelier

A browser-based ornament visualiser. Upload a bitmap motif and lay it out around a ring or
along a straight guide, then export the result as images, separate layers, or an animation.

Single-page app, no build step and no dependencies — plain HTML, CSS and one `app.js`.

## Running it

The app loads assets (`images/`, `fonts/`) over `fetch`/`<img>`, so it needs to be served
rather than opened from `file://`:

```bash
python -m http.server 8123
```

Then open <http://localhost:8123>.

## Layout

| Path | What it is |
|------|-----------|
| `index.html` | Markup and the whole sidebar UI |
| `app.js` | All application logic |
| `style.css` | All styling |
| `images/` | `banner.png` (sidebar ornament) and the divider graphics |
| `fonts/Caudex-Regular.ttf` | Title face |

`index.html` cache-busts with query strings (`app.js?v=66`, `style.css?v=42`); bump those
when changing either file.

## Two modes

**Circle** — motifs distributed around a ring, with panels for ring geometry, asset, text,
line, shape, placement, and export (images or separate layers).

**Straight** — the same motif work along a horizontal guide, with tiling and an animation
export.

Both modes share the layers, roughness and mask panels.

**Text layers** (both modes) turn a word or phrase into lettering. Type the text (multi-line, with
left/centre/right alignment), choose a colour and letter spacing, and place it like an asset —
count, rotation, flips and animation. **Letter size** is the size of the letters themselves, in
both modes: more text makes a longer line, never smaller letters.

- **Circle:** the text runs along the ring letter by letter, so a whole sentence wraps around
  the circle. Count repeats the phrase evenly. Alignment sets where it sits: centred on the
  start angle (the top, by default), starting at it, or ending at it; on an arc cut (see
  Placement) it starts at, is centred in, or ends at the arc. **Fit to arc** spreads the letters
  so the text fills the circle or arc end to end; with it off, text longer than the ring simply
  runs on and overlaps, and a hint in the Text panel shows the text length against the ring
  length so you can tune Letter size. Extra lines become concentric rows one line further in.
  Follow ring off keeps the letters upright; flip vertically mirrors them top to bottom.
- **Straight:** one flat line (or block) of text whose width grows with the text.

Pick a font with **Load font file…** (`.ttf`, `.otf`, `.woff`, `.woff2`) or, in Chrome and Edge,
**Installed fonts…** to choose from the fonts installed on your computer. Fonts are embedded in
saved projects, so they open anywhere. A text layer can be converted to an asset layer, which
keeps the lettering as a flat bitmap (very long text is scaled down to fit the Size range).

**Placement** (Circle mode, every layer): move a layer's centre with the origin fields or by
dragging its handle in the preview, cut the circle down to an arc, break it into pieces with
gaps, and mirror the layer about the canvas centre lines.

**Straight line** (Circle mode, **+ Straight**): a free line that belongs to no ring — a vertical axis
through a stack of circles, a long chord, or a starburst of lines through a centre. Set its **angle**
(0 = up, clockwise), **length** and **offset** (where the line's middle sits along its own direction,
measured from the origin: 0 centres the line on the origin, half the length makes a ray that starts
there), plus stroke width and colour and a **style** of solid, dashed or dotted (with dash length and
gap). **Count** turns copies about the origin, over 180° for a centred line and 360° otherwise.
Origin, mirror, animation speed, opacity and roughness work as for other layers; the arc and gap
fields do not apply, and the unrolled Straight preview leaves these lines out.

**Handles** (Circle mode): selected layers get handles in the preview, all editor-only and a constant
size at any zoom. One undo step per drag, and the sidebar fields follow live.

- **Origin** (crosshair): move the layer. <kbd>Shift</kbd> locks to one axis.
- **Radius** (on the ring, at the start of the visible arc): drag in or out. Every selected layer changes
  by the same amount. <kbd>Shift</kbd> snaps the radius to a multiple of 10.
- **Rotate** (just outside the ring, on a connector): drag around the origin. Rings turn their arc
  start, other layers their start angle, straight lines their angle; every selected layer turns by
  the same amount. <kbd>Shift</kbd> snaps to 15°.
- **Straight line ends** (squares): drag one end while the other stays put. <kbd>Alt</kbd> mirrors the
  move about the origin (a centred line); <kbd>Shift</kbd> snaps the angle to 15°.

**Camera** (both modes): the preview can show things outside the artboard, so there are controls
to move around it. Zoom at the pointer with <kbd>Ctrl</kbd> + scroll (also a trackpad pinch) or
<kbd>Alt</kbd> + scroll; pan with <kbd>Space</kbd> + drag or the middle mouse button, anywhere over
the preview. **Fit design** (<kbd>F</kbd>) frames all the visible artwork, including parts outside
the artboard and mirror twins; **Fit artboard** (<kbd>0</kbd>) frames the artboard; **100%**
(<kbd>1</kbd>) resets the zoom. In the Ring editor, artwork outside the artboard is shaded and the
artboard edge drawn: exports still cover only the artboard.

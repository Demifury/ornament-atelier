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

`index.html` cache-busts with query strings (`app.js?v=67`, `style.css?v=43`); bump those
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
  start, other layers their start angle, straight lines their angle. With several layers selected
  they turn as one rigid group about the centre of their origins: each origin swings round that
  point and each angle changes by the same amount (layers sharing one origin simply turn in place).
  <kbd>Shift</kbd> snaps to 15°.
- **Straight line ends** (squares): drag one end while the other stays put. <kbd>Alt</kbd> mirrors the
  move about the origin (a centred line); <kbd>Shift</kbd> snaps the angle to 15°.

**Camera** (both modes): the preview can show things outside the artboard, so there are controls
to move around it. Zoom at the pointer with <kbd>Ctrl</kbd> + scroll (also a trackpad pinch) or
<kbd>Alt</kbd> + scroll; pan with <kbd>Space</kbd> + drag or the middle mouse button, anywhere over
the preview. **Fit design** (<kbd>F</kbd>) frames all the visible artwork, including parts outside
the artboard and mirror twins; **Fit artboard** (<kbd>0</kbd>) frames the artboard; **100%**
(<kbd>1</kbd>) resets the zoom. In the Ring editor, artwork outside the artboard is shaded and the
artboard edge drawn: exports still cover only the artboard.

**Value badges** (Circle mode): next to the selected layer's origin handle sit two small round
badges, editor-only and a constant size at any zoom. The purple one is the number of clones; the
green one (marked with a width arrow) is the size of each clone: the Size slider for assets and
shapes, the letter size for text, the length for lines and straight lines. A ring has no clones, so it
shows only the green badge, which is its stroke width. Click a badge to type a value (<kbd>Enter</kbd>
or clicking away keeps it, <kbd>Esc</kbd> cancels), or scroll over it: 1 per notch, 10 with
<kbd>Shift</kbd>. The limits are the sidebar sliders' own. With several layers selected the value goes
to every one that has the field, and a badge shows a dash when they disagree. A scroll burst is one
undo step.

**Mixed selections** (both modes): <kbd>Ctrl</kbd>/<kbd>Shift</kbd>+click in the layer list selects any
layers together, of any types. The sidebar then shows only what all of them share (opacity, animation
speed and, in Circle mode, the Placement fields) and an edit never adds a field to a layer type that
lacks it. Duplicate, Remove, Move Up/Down and the eye act on the whole selection.

**Groups** (both modes): **Group** (<kbd>Ctrl</kbd>+<kbd>G</kbd>) puts the selected layers in one
folder; **Ungroup** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>) takes the selected layers out of
theirs (select the group's row to dissolve all of it). A group is a row in the layer list with a
collapse arrow, an eye that hides every member (their own eyes are untouched, so showing the group
again restores them), and an editable name (double-click, or Rename). Clicking the row selects all its
layers; clicking a member selects just that one. Members stay together in the stacking order, at the
position of the group's topmost layer when it is made; Move Up/Down on the row moves the whole
block, and a single member only moves within its group. Remove on the row removes the group and its
layers; Duplicate copies it as a new group. Groups are one level deep, are saved in project files
(older files open with none) and are covered by undo. A hidden group is left out of previews and
exports, and of the separate-layer export.

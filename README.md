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

**Groups** (both modes): groups nest. **Group** (<kbd>Ctrl</kbd>+<kbd>G</kbd>) puts the selection in a new
group: whole groups in the selection become its children, loose layers its direct members, and if everything
selected already shares one parent the new group stays in it (otherwise it is top level). **Ungroup**
(<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>) removes ONE level: a whole selected group is dissolved and its
children move to its parent; selected layers that are only part of a group step out of it into its parent. A
group is a row in the layer list, indented one step per level, with a collapse arrow, an eye that hides
everything under it (their own eyes are untouched) and an editable name (double-click, or Rename). Clicking a
row selects every layer in its subtree, so it counts as that whole group (one handle, anchor, scale, rotate,
badges); clicking a layer selects just it. Members stay together in the stacking order, a group sitting at the
position of its topmost layer; Move Up/Down moves rows among their siblings inside their parent. Remove on a row
removes the group with its whole subtree; Duplicate copies the subtree with every setting (blend, repeat, scale).
Data: each group has `parentId` (null = top level) and a layer's `groupId` is its direct parent; files without
`parentId` load as top-level groups. Groups are saved in project files and covered by undo. A hidden group is
left out of previews and exports, and of the separate-layer export. Exports follow the tree: the layered SVG
nests named `<g>` elements, the single SVG keeps nested groups, the PNG ZIP makes nested folders. A Blend group
stays exactly 2 layers (it can sit inside other groups). A Repeat group repeats everything under it, the
generated in-betweens and any nested Repeat included (innermost first, Blend before Repeat), so a Repeat inside
a Repeat gives a flower of flowers; the total of generated copies in one drawing is capped at 5000 and the
Repeat panel says so when the cap cuts copies off.

**Blend** (Ring mode): like Illustrator's blend. Select exactly 2 layers of the same type (list,
<kbd>Ctrl</kbd>/<kbd>Shift</kbd>+click or a marquee) and press the Blend button in the layer toolbar or
<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>B</kbd>. The two layers go into a group flagged as a blend (the first one
selected is the start), and 5 in-between layers appear. They are not stored: they are rebuilt from the
start layer, the end layer, the step count and the distribution every time the artwork is drawn or
exported, so editing the start or end (sidebar, handles, badges, group scale and rotate) moves them
live. Every number the two share is mixed (radius, origin, stroke width, size, count, angles by the
shortest way round, arc, gaps, opacity, letter spacing, ...) and colours mix in RGB; the image, shape
kind, text, font and flags come from the start layer. Two rings of different radius and origin give
eccentric nested rings, like a tunnel. The Blend panel (shown when a blend group or one of its layers
is selected) sets **Steps** (1-200; the purple badge on the canvas edits it too when the group is
selected), **Distribution** (Linear / Ease in / Ease out / Ease in-out), **Swap start/end**,
**Expand** (turns the in-betweens into real layers in the group and ends the blend) and **Release**
(ends the blend and keeps start and end). The group row shows a blend mark and "blend · N steps". A
hidden start or end layer still blends while the group is visible; hiding the group hides everything.
Deleting the start or end ends the blend. Duplicate copies the blend, and it is saved in project files
and covered by undo. PNG and SVG exports include the in-betweens; the layered SVG puts them in the
group as "Blend step 1", "Blend step 2", ...; the separate-layer PNG ZIP gives the start, end and every
in-between its own file. Straight mode has no blend.

**Repeat around a point** (Ring mode): select a group or several layers and press the Repeat button in the
layer toolbar (several loose layers are grouped first). The group gets `repeat = { pivotX, pivotY, copies,
totalAngle, startAngle, rotateCopies }`; the copies are never stored, they are built whenever the artwork is
drawn or exported, so editing a member, moving or turning the group, the origin anchor or a Blend updates
them live (a blend's in-betweens are generated first and the whole result is repeated). *Copies* counts the
original, which stays where it is; copy k is the group turned about the pivot by Start angle + k x step, with
step = Total angle / Copies for a full circle (360) and Total angle / (Copies - 1) for any other angle (a
copy at both ends of the arc). Each layer's origin moves along the circle; with **Rotate copies** on its own
orientation turns by the same angle (ring arc start, item start angle, straight-line angle, and the rotation
of items that do not follow the ring), off: only the position moves. Pivot X/Y are in origin space (0,0 =
artboard centre). The pivot is a pink crosshair, drawn on top of every other handle while the group is
selected: drag it (Shift = one axis, snaps to the centre lines, one undo step per drag). The Repeat panel has
Copies, Total angle, Start angle, Pivot X/Y, Centre, Rotate copies, **Expand** (each copy becomes a real
sibling group "Copy 2" ... "Copy N" above the original, which is copy 1) and **Release** (removes the
repeat, keeps the group). With the whole group selected the purple badge edits Copies (when the group also has
a blend, Steps stays in the Blend panel). Clicking or marqueeing a copy selects the group's members. The group
row shows "repeat · N" (or "blend · N steps · repeat · N"). Duplicate copies the settings; they are saved in
project files. Layered SVG: inside the group's `<g>`, sub-groups "Repeat copy 1" ... "Repeat copy N" (the
original is copy 1); the PNG ZIP gives every copy layer a file ("..._copy_k"). Group Scale and Group rotate never move
the pivot. When several layers and/or groups are selected and the selection contains a whole Repeat group, that
group counts as ONE point at its pivot for the blue origin anchor, the radius ball and the rotate pivot; dragging
the anchor then moves the loose layers, the repeat groups' members and their pivots by the same delta, and
rotating swings those pivots too. With a single whole Repeat group selected, the group's ball sits on the pink
pivot: dragging it moves the members and every pivot inside the group together, the rotate knob turns the group
about the pivot, and <kbd>Alt</kbd>+drag moves the pivot alone. Straight mode has no repeat.

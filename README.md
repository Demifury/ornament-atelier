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

`index.html` cache-busts with query strings (`app.js?v=64`, `style.css?v=40`); bump those
when changing either file.

## Two modes

**Circle** — motifs distributed around a ring, with panels for ring geometry, asset, text,
line, shape, placement, and export (images or separate layers).

**Straight** — the same motif work along a horizontal guide, with tiling and an animation
export.

Both modes share the layers, roughness and mask panels.

**Text layers** (both modes) turn a word or phrase into a motif: type the text (multi-line,
with left/centre/right alignment), choose a colour and letter spacing, and place it like an
asset — size, count, rotation, flips, animation and, in Circle mode, bend. One copy bent to the
ring makes coin-style lettering. Pick a font with **Load font file…** (`.ttf`, `.otf`, `.woff`,
`.woff2`) or, in Chrome and Edge, **Installed fonts…** to choose from the fonts installed on
your computer. Fonts are embedded in saved projects, so they open anywhere. A text layer can be
converted to an asset layer, which keeps the lettering as a plain bitmap.

**Placement** (Circle mode, every layer): move a layer's centre with the origin fields or by
dragging its handle in the preview, cut the circle down to an arc, break it into pieces with
gaps, and mirror the layer about the canvas centre lines.

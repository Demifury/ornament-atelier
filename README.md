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

`index.html` cache-busts with query strings (`app.js?v=62`, `style.css?v=38`); bump those
when changing either file.

## Two modes

**Circle** — motifs distributed around a ring, with panels for ring geometry, asset, line,
shape, and export (images or separate layers).

**Straight** — the same motif work along a horizontal guide, with tiling and an animation
export.

Both modes share the layers, roughness and mask panels.

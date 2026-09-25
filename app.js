const SVG_NS = "http://www.w3.org/2000/svg";
const CANVAS_SIZE = 4096;
const CENTER = CANVAS_SIZE / 2;

// One erase-style mask per mode, affecting the whole artboard rather than any single
// layer. Unlike a motif layer, rendering never touches this through a canvas — the SVG
// <image> inside the mask's <pattern> takes the data URL directly — so there's no
// parallel Image object to keep alive, and the whole thing survives a plain JSON clone
// (snapshotting for undo/redo, project save/load) with no special-casing.
function createDefaultMask() {
  return { enabled: false, imageDataUrl: null, imageName: null, size: 400, invert: false };
}

const state = {
  layers: [],
  activeLayerId: null,
  mask: createDefaultMask(),
  roughness: 50,
};
let nextLayerId = 1;

// Which editor is showing. Declared up here rather than beside setMode() at the bottom
// because the zoom controls read it during their own init, which runs first.
let currentMode = "circle";

function nextDefaultRadius() {
  return Math.max(200, 1600 - state.layers.length * 350);
}

function createRingLayer(name, radius) {
  return {
    id: nextLayerId++,
    type: "ring",
    name,
    radius,
    visible: true,
    strokeWidth: 10,
    strokeColor: "#e0e0e0",
  };
}

function createMotifLayer(name, radius) {
  return {
    id: nextLayerId++,
    type: "motif",
    name,
    radius,
    visible: true,
    imageDataUrl: null,
    imageName: null,
    naturalWidth: 0,
    naturalHeight: 0,
    size: 300,
    count: 12,
    startAngle: 0,
    followRing: true,
    rotation: 0,
    bend: 0,
    flip: false,
    flipHorizontal: false,
    alternateFlip: false,
    animSpeed: 0,
  };
}

function createLineLayer(name, radius) {
  return {
    id: nextLayerId++,
    type: "line",
    name,
    radius,
    visible: true,
    count: 24,
    startAngle: 0,
    followRing: true,
    rotation: 0,
    strokeWidth: 10,
    strokeColor: "#e0e0e0",
    length: 200,
    animSpeed: 0,
  };
}

function createShapeLayer(name, radius) {
  return {
    id: nextLayerId++,
    type: "shape",
    name,
    radius,
    visible: true,
    shapeKind: "circle",
    size: 200,
    sizeY: 200,
    lockRatio: true,
    fillColor: "#e0e0e0",
    fillOpacity: 0,
    strokeWidth: 10,
    strokeColor: "#e0e0e0",
    count: 12,
    startAngle: 0,
    followRing: true,
    rotation: 0,
    animSpeed: 0,
    bend: 0,
    flip: false,
    flipHorizontal: false,
    alternateFlip: false,
    flipOffset: 0,
  };
}

function getActiveLayer() {
  return state.layers.find((l) => l.id === state.activeLayerId) || null;
}

// Shown in a number box when the selected layers don't agree on that value. Deliberately
// an EN DASH, not an ASCII "-": the number inputs accept "-" as the start of a negative
// number and as a math operator, so a plain hyphen here could be read back as real input.
// An en dash matches neither the expression whitelist nor Number(), so it can only ever
// be replaced, never accidentally applied.
const MIXED_VALUE_TEXT = "–";

// Which layer property each control edits. Used ONLY to detect "the selected layers
// disagree here, show a dash" — the actual writing is still done by each control's own
// apply function. Kept as one table rather than threaded through ~70 bindControl calls so
// the whole mapping stays visible and greppable in one place.
const CONTROL_PROPERTY = {
  layerOpacity: "opacity", layerAnimSpeed: "animSpeed",
  ringRadius: "radius", ringStrokeWidth: "strokeWidth", ringStrokeColor: "strokeColor",
  motifRadius: "radius", motifSize: "size", motifCount: "count", motifStartAngle: "startAngle",
  motifRotation: "rotation", motifBend: "bend", motifFlip: "flip",
  motifFlipHorizontal: "flipHorizontal", motifAlternateFlip: "alternateFlip", motifFollowRing: "followRing",
  lineRadius: "radius", lineLength: "length", lineStrokeWidth: "strokeWidth", lineStrokeColor: "strokeColor",
  lineCount: "count", lineStartAngle: "startAngle", lineRotation: "rotation", lineFollowRing: "followRing",
  shapeKind: "shapeKind", shapeRadius: "radius", shapeSize: "size", shapeSizeY: "sizeY",
  shapeRotation: "rotation", shapeFollowRing: "followRing", shapeBend: "bend",
  shapeFillColor: "fillColor", shapeFillOpacity: "fillOpacity",
  shapeStrokeWidth: "strokeWidth", shapeStrokeColor: "strokeColor",
  shapeCount: "count", shapeStartAngle: "startAngle",
  shapeFlip: "flip", shapeFlipHorizontal: "flipHorizontal", shapeAlternateFlip: "alternateFlip", shapeFlipOffset: "flipOffset",

  smLayerOpacity: "opacity", smLayerAnimSpeed: "animSpeed",
  smGuidePosition: "position", smGuideStrokeWidth: "strokeWidth", smGuideStrokeColor: "strokeColor",
  smMotifPosition: "position", smMotifSize: "size", smMotifCount: "count", smMotifStartOffset: "startOffset",
  smMotifRotation: "rotation", smMotifFlip: "flip", smMotifFlipHorizontal: "flipHorizontal",
  smMotifAlternateFlip: "alternateFlip",
  smLinePosition: "position", smLineLength: "length", smLineStrokeWidth: "strokeWidth",
  smLineStrokeColor: "strokeColor", smLineCount: "count", smLineStartOffset: "startOffset",
  smLineRotation: "rotation",
  smShapeKind: "shapeKind", smShapePosition: "position", smShapeSize: "size", smShapeSizeY: "sizeY",
  smShapeRotation: "rotation", smShapeFillColor: "fillColor", smShapeFillOpacity: "fillOpacity",
  smShapeStrokeWidth: "strokeWidth", smShapeStrokeColor: "strokeColor",
  smShapeCount: "count", smShapeStartOffset: "startOffset",
  smShapeFlip: "flip", smShapeFlipHorizontal: "flipHorizontal", smShapeAlternateFlip: "alternateFlip", smShapeFlipOffset: "flipOffset",
};

// Every selected layer, self-healing: any code path that changed the active layer without
// touching the multi-selection (adding, removing, converting, undo, loading a project)
// collapses harmlessly back to a single selection here, so those call sites don't each
// need to remember to clear it.
function getSelectedLayersFrom(target) {
  if (target.activeLayerId == null) return [];
  const ids = Array.isArray(target.selectedLayerIds) ? target.selectedLayerIds : [];
  if (!ids.includes(target.activeLayerId)) target.selectedLayerIds = [target.activeLayerId];
  return target.selectedLayerIds.map((id) => target.layers.find((l) => l.id === id)).filter(Boolean);
}

// Resolves a click into a new selection. Multi-select is restricted to layers of the SAME
// type, because the whole point is editing shared parameters — a Ring and a Shape have
// almost no fields in common, so a mixed selection would leave the panel showing controls
// that only apply to some of it.
function resolveSelection(target, id, opts) {
  const layer = target.layers.find((l) => l.id === id);
  if (!layer) return;
  const current = getSelectedLayersFrom(target);
  const sameType = current.length > 0 && current[0].type === layer.type;

  if (opts.toggle && sameType) {
    const ids = new Set(target.selectedLayerIds);
    if (ids.has(id) && ids.size > 1) ids.delete(id);
    else ids.add(id);
    target.selectedLayerIds = [...ids];
    target.activeLayerId = ids.has(id) ? id : target.selectedLayerIds[target.selectedLayerIds.length - 1];
    return;
  }
  if (opts.range && sameType) {
    const a = target.layers.findIndex((l) => l.id === target.activeLayerId);
    const b = target.layers.findIndex((l) => l.id === id);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    target.selectedLayerIds = target.layers.slice(lo, hi + 1).filter((l) => l.type === layer.type).map((l) => l.id);
    target.activeLayerId = id;
    return;
  }
  target.selectedLayerIds = [id];
  target.activeLayerId = id;
}

// Writes a dash into any field whose value isn't shared across the whole selection, and
// puts checkboxes into the browser's native indeterminate state for the same reason.
// Runs after the normal refresh has already filled every field from the active layer.
function markMixedFields(layers) {
  const multiple = layers.length > 1;
  for (const [id, prop] of Object.entries(CONTROL_PROPERTY)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const mixed = multiple && layers.some((l) => l[prop] !== layers[0][prop]);
    if (el.type === "checkbox") {
      el.indeterminate = mixed;
      continue;
    }
    if (!mixed) continue;
    const numEl = document.getElementById(id + "Num");
    if (numEl && document.activeElement !== numEl) numEl.value = MIXED_VALUE_TEXT;
  }
}

// Any layer can turn into any other layer type — shared by both modes (a Straight-mode
// layer is never actually type "ring", so including it here is harmless there, and vice
// versa for "guide"). Ring/Guide have none of Motif/Line/Shape's "distributed copies"
// fields (count, start angle/offset, rotation, follow-ring) — converting into or out of
// them just carries over whatever the two types both have.
const CONVERTIBLE_TYPES = ["ring", "guide", "motif", "line", "shape"];

// Builds a fresh layer of newType (so every field the new type needs gets its normal
// default) and carries over only the fields the two types actually share — checking
// "does the fresh object even have this key" instead of a hardcoded field list is what
// lets Ring (missing count/startAngle/rotation/followRing) fall out of this for free,
// rather than needing its own special-cased branch.
function convertLayerType(layer, newType) {
  const factories = { ring: createRingLayer, motif: createMotifLayer, line: createLineLayer, shape: createShapeLayer };
  const fresh = factories[newType](layer.name, layer.radius);
  fresh.id = layer.id;
  for (const key of ["count", "startAngle", "rotation", "followRing", "animSpeed", "visible", "flip", "flipHorizontal", "alternateFlip", "flipOffset"]) {
    if (key in fresh && key in layer) fresh[key] = layer[key];
  }
  if (layer.opacity != null) fresh.opacity = layer.opacity;
  return fresh;
}

// --- History (undo) ---
// Snapshot-before-mutate: every layer-array/field mutation pushes the PRE-mutation
// state first. Continuous drags (sliders/color pickers) are debounced into a single
// checkpoint per gesture via the 'change' event (see bindControl), so undo reverts a
// whole drag, not every intermediate tick.

const HISTORY_LIMIT = 50;
const historyStack = [];
const redoStack = [];
let historyGestureOpen = false;

function snapshotLayers(layers) {
  return layers.map((l) => {
    const copy = JSON.parse(JSON.stringify(l));
    copy.imageEl = null; // can't survive JSON; reloaded from imageDataUrl on restore
    delete copy.bendCache; // derived cache, recomputed on demand
    delete copy.bendCacheFlipped;
    return copy;
  });
}

function pushHistory() {
  historyStack.push({
    layers: snapshotLayers(state.layers),
    activeLayerId: state.activeLayerId,
    mask: JSON.parse(JSON.stringify(state.mask)),
    roughness: state.roughness,
  });
  if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
  redoStack.length = 0; // a fresh change invalidates whatever redo branch existed
}

// After restoring a snapshot, motif layers need their Image element reloaded from
// imageDataUrl (the only part of an <img> that survives JSON cloning) before bend can
// re-render — flat rendering doesn't need it, so this is fire-and-forget.
function reloadMissingImages(layers, onLoaded) {
  for (const l of layers) {
    if (l.type === "motif" && l.imageDataUrl && !l.imageEl) {
      const img = new Image();
      img.onload = () => {
        l.imageEl = img;
        onLoaded();
      };
      img.src = l.imageDataUrl;
    }
  }
}

function undo() {
  if (historyStack.length === 0) return;
  redoStack.push({
    layers: snapshotLayers(state.layers),
    activeLayerId: state.activeLayerId,
    mask: JSON.parse(JSON.stringify(state.mask)),
    roughness: state.roughness,
  });
  const snap = historyStack.pop();
  state.layers = snap.layers;
  state.activeLayerId = snap.activeLayerId;
  state.mask = snap.mask;
  state.roughness = snap.roughness ?? state.roughness;
  setFieldValue("roughness", state.roughness);
  reloadMissingImages(state.layers, render);
  renderLayerList();
  refreshControls();
  refreshMaskControls();
  render();
  // A restored snapshot can bring animation speeds back with it (undoing a Zero Speeds,
  // say), and the loop will have stopped itself while they were all zero — so it needs
  // starting again here, exactly like the controls that set a speed directly do.
  ensureAnimationRunning();
}

function redo() {
  if (redoStack.length === 0) return;
  historyStack.push({
    layers: snapshotLayers(state.layers),
    activeLayerId: state.activeLayerId,
    mask: JSON.parse(JSON.stringify(state.mask)),
    roughness: state.roughness,
  });
  const snap = redoStack.pop();
  state.layers = snap.layers;
  state.activeLayerId = snap.activeLayerId;
  state.mask = snap.mask;
  state.roughness = snap.roughness ?? state.roughness;
  setFieldValue("roughness", state.roughness);
  reloadMissingImages(state.layers, render);
  renderLayerList();
  refreshControls();
  refreshMaskControls();
  render();
  ensureAnimationRunning(); // same reasoning as undo()
}

// --- Layer management ---

function addRingLayer() {
  pushHistory();
  const layer = createRingLayer(`Ring ${nextLayerId}`, nextDefaultRadius());
  state.layers.push(layer);
  state.activeLayerId = layer.id;
  renderLayerList();
  refreshControls();
  render();
}

function addMotifLayer() {
  pushHistory();
  const layer = createMotifLayer(`Asset ${nextLayerId}`, nextDefaultRadius());
  state.layers.push(layer);
  state.activeLayerId = layer.id;
  renderLayerList();
  refreshControls();
  render();
}

function addLineLayer() {
  pushHistory();
  const layer = createLineLayer(`Line ${nextLayerId}`, nextDefaultRadius());
  state.layers.push(layer);
  state.activeLayerId = layer.id;
  renderLayerList();
  refreshControls();
  render();
}

function addShapeLayer() {
  pushHistory();
  const layer = createShapeLayer(`Shape ${nextLayerId}`, nextDefaultRadius());
  state.layers.push(layer);
  state.activeLayerId = layer.id;
  renderLayerList();
  refreshControls();
  render();
}

function duplicateLayer() {
  const active = getActiveLayer();
  if (!active) return;
  pushHistory();
  const clone = JSON.parse(JSON.stringify(active));
  clone.id = nextLayerId++;
  clone.name = active.name + " copy";
  clone.imageEl = active.imageEl; // JSON clone can't carry the loaded Image object
  const idx = state.layers.findIndex((l) => l.id === active.id);
  state.layers.splice(idx + 1, 0, clone);
  state.activeLayerId = clone.id;
  renderLayerList();
  refreshControls();
  render();
}

function removeLayer() {
  const active = getActiveLayer();
  if (!active) return;
  pushHistory();
  const idx = state.layers.findIndex((l) => l.id === active.id);
  state.layers.splice(idx, 1);
  const next = state.layers[idx] || state.layers[idx - 1] || null;
  state.activeLayerId = next ? next.id : null;
  renderLayerList();
  refreshControls();
  render();
}

function clearLayers() {
  if (state.layers.length === 0) return;
  pushHistory();
  state.layers = [];
  state.activeLayerId = null;
  renderLayerList();
  refreshControls();
  render();
}

// Rolled within a tighter -1.5..1.5 than the slider's own -5..5 range — fast random
// spins tend to look chaotic, whereas the full range stays available for anyone who
// wants to dial in a faster speed by hand. Ring excluded (see layerAnimSpeedField),
// since spinning a plain circle wouldn't be visible anyway.
function randomizeAnimSpeeds() {
  const targets = state.layers.filter((l) => l.type !== "ring");
  if (targets.length === 0) return;
  pushHistory();
  for (const l of targets) l.animSpeed = Math.round((Math.random() * 3 - 1.5) * 100) / 100;
  refreshControls();
  render();
  ensureAnimationRunning();
}

// Same target set as randomizeAnimSpeeds — a quick "stop everything" next to the
// "randomize everything" button.
function zeroAnimSpeeds() {
  const targets = state.layers.filter((l) => l.type !== "ring");
  if (targets.length === 0) return;
  pushHistory();
  for (const l of targets) l.animSpeed = 0;
  refreshControls();
  render();
}

function moveLayer(direction) {
  const active = getActiveLayer();
  if (!active) return;
  const idx = state.layers.findIndex((l) => l.id === active.id);
  const targetIdx = direction === "up" ? idx + 1 : idx - 1;
  if (targetIdx < 0 || targetIdx >= state.layers.length) return;
  pushHistory();
  [state.layers[idx], state.layers[targetIdx]] = [state.layers[targetIdx], state.layers[idx]];
  renderLayerList();
  render();
}

function getSelectedLayers() {
  return getSelectedLayersFrom(state);
}

function selectLayer(id, opts = {}) {
  resolveSelection(state, id, opts);
  updateLayerListSelection();
  refreshControls();
  render();
}

let editingLayerId = null;

// Renaming is done with an inline <input> instead of window.prompt() — prompt()'s
// native dialog is unreliable inside embedded/automated browser panes (it can be
// auto-dismissed), so it silently "did nothing" there. An inline field has no such
// dependency and works the same everywhere.
function startRename(id) {
  editingLayerId = id;
  renderLayerList();
}

function commitRename(id, newName) {
  const layer = state.layers.find((l) => l.id === id);
  if (layer && newName && newName.trim() && newName.trim() !== layer.name) {
    pushHistory();
    layer.name = newName.trim();
  }
  editingLayerId = null;
  renderLayerList();
}

function renderLayerList() {
  const list = document.getElementById("layerList");
  list.innerHTML = "";
  // Top of the visible list = front of the stack (last in the array).
  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i];
    const item = document.createElement("div");
    item.className = "layer-item";
    item.dataset.layerId = layer.id;

    if (layer.id === editingLayerId) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "layer-name-input";
      input.value = layer.name;
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
        else if (e.key === "Escape") {
          editingLayerId = null;
          renderLayerList();
        }
      });
      input.addEventListener("blur", () => commitRename(layer.id, input.value));
      item.appendChild(input);
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    } else {
      const visible = layer.visible !== false;
      item.innerHTML = `<div class="layer-item-main"><button type="button" class="layer-visibility-btn" title="${visible ? "Hide layer" : "Show layer"}" aria-label="${visible ? "Hide layer" : "Show layer"}">${eyeIconSvg(visible)}</button><span>${escapeHtml(layerDisplayName(layer))}</span></div><span class="layer-meta">${layerMetaText(layer)}</span>`;
      item.querySelector(".layer-visibility-btn").classList.toggle("is-hidden", !visible);
      item.querySelector(".layer-visibility-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLayerVisible(layer);
      });
      // Selecting must NOT rebuild this list (updateLayerListSelection only toggles a
      // class) — a full rebuild here would destroy/replace this element mid-gesture and
      // break the native dblclick sequence (click, click, dblclick all target this node).
      item.addEventListener("click", (e) => selectLayer(layer.id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey }));
      item.addEventListener("dblclick", () => startRename(layer.id));
    }

    list.appendChild(item);
  }
  updateLayerListSelection();
}

function toggleLayerVisible(layer) {
  pushHistory();
  layer.visible = layer.visible === false ? true : false;
  renderLayerList();
  render();
}

function updateLayerListSelection() {
  const selected = new Set(getSelectedLayers().map((l) => l.id));
  document.querySelectorAll("#layerList .layer-item").forEach((el) => {
    const id = Number(el.dataset.layerId);
    el.classList.toggle("active", id === state.activeLayerId);
    el.classList.toggle("multi-selected", selected.has(id) && id !== state.activeLayerId);
  });
}

// Internal type keys stay as they are so existing saved projects keep loading; this only
// maps a key to what the user should SEE. "motif" is shown as "asset" — the rename was
// user-facing only, and changing the stored key would break every project file already
// out there.
const TYPE_DISPLAY_NAMES = { motif: "asset" };

function layerTypeLabel(layer) {
  const raw = layer.type === "shape" ? layer.shapeKind : layer.type;
  return (TYPE_DISPLAY_NAMES[raw] || raw).replace(/([A-Z])/g, " $1").toLowerCase();
}

function layerDisplayName(layer) {
  if (layer.type === "motif" && layer.imageName) {
    return `${layer.name} (${layer.imageName})`;
  }
  return layer.name;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Shared by both modes' layer lists — an open eye when visible, a slashed eye when
// hidden. `undefined` (older layers saved before per-layer visibility existed) counts
// as visible, same convention used everywhere else layer.visible is read.
function eyeIconSvg(visible) {
  return visible
    ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path></svg>`
    : `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
}

// Two overlapping rings when locked (width/height linked, like a closed chain), two
// separated rings when unlocked — shared by both modes' shape panels.
function lockRatioIconSvg(locked) {
  return locked
    ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="5"></circle><circle cx="15" cy="12" r="5"></circle></svg>`
    : `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="12" r="5"></circle><circle cx="18" cy="12" r="5"></circle></svg>`;
}

// Shared by the full list rebuild and the lighter-weight per-edit update below, so the
// two can't drift apart.
function layerMetaText(layer) {
  return layerTypeLabel(layer);
}

// Keeps the layer list's meta text in sync after a control edit, without rebuilding the
// list (a rebuild mid-edit is what broke double-click renaming before).
function updateLayerListMeta() {
  document.querySelectorAll("#layerList .layer-item").forEach((el) => {
    const layer = state.layers.find((l) => l.id === Number(el.dataset.layerId));
    const meta = el.querySelector(".layer-meta");
    if (layer && meta) meta.textContent = layerMetaText(layer);
  });
}

// --- Controls ---

// Sets both a range input and its paired "<id>Num" typed-value input (if one exists)
// to the same value, so the two stay in sync no matter which one refreshControls is
// called after.
// Skips the number box if it's the element currently being typed into — refreshControls
// runs after every single keystroke (see bindControl), and unconditionally overwriting
// it mid-edit is what made backspacing to/through 0 feel broken: the box would get
// stamped back to "0" by the very next refresh before the user could type past it.
function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
  const numEl = document.getElementById(id + "Num");
  if (numEl && document.activeElement !== numEl) numEl.value = value;
}

function refreshControls() {
  const active = getActiveLayer();
  const ringPanel = document.getElementById("ringPanel");
  const motifPanel = document.getElementById("motifPanel");
  const linePanel = document.getElementById("linePanel");

  const shapePanel = document.getElementById("shapePanel");

  // Opacity applies uniformly to every layer type, so it lives in the Layers panel
  // itself rather than any one type panel — handled before the early return below so
  // it still reflects "no active layer" (disabled) correctly.
  document.getElementById("layerOpacityField").classList.toggle("disabled", !active);
  setFieldValue("layerOpacity", active ? (active.opacity != null ? active.opacity : 100) : 100);

  // Layer type: only Motif/Line/Shape can change into one another (see
  // CONVERTIBLE_TYPES) — Ring has no equivalent among them, so it's excluded here too.
  const typeField = document.getElementById("layerTypeField");
  const typeSelect = document.getElementById("layerTypeSelect");
  const canChangeType = active && CONVERTIBLE_TYPES.includes(active.type);
  typeField.classList.toggle("disabled", !canChangeType);
  typeSelect.value = canChangeType ? active.type : "motif";

  // Animation speed: same "lives in the Layers panel" reasoning as opacity, but Ring
  // is excluded — a plain circle looks identical at every rotation, so animating it
  // would be invisible.
  const canAnimate = active && active.type !== "ring";
  document.getElementById("layerAnimSpeedField").classList.toggle("disabled", !canAnimate);
  setFieldValue("layerAnimSpeed", canAnimate ? active.animSpeed || 0 : 0);

  if (!active) {
    [ringPanel, motifPanel, linePanel, shapePanel].forEach((p) => p.classList.add("disabled", "hidden"));
    return;
  }

  [ringPanel, motifPanel, linePanel, shapePanel].forEach((p) => p.classList.remove("disabled"));
  ringPanel.classList.toggle("hidden", active.type !== "ring");
  motifPanel.classList.toggle("hidden", active.type !== "motif");
  linePanel.classList.toggle("hidden", active.type !== "line");
  shapePanel.classList.toggle("hidden", active.type !== "shape");

  if (active.type === "ring") {
    setFieldValue("ringRadius", active.radius);
    setFieldValue("ringStrokeWidth", active.strokeWidth);
    document.getElementById("ringStrokeColor").value = active.strokeColor;
  } else if (active.type === "motif") {
    const hasImage = !!active.imageDataUrl;
    document.getElementById("motifNoImageHint").style.display = hasImage ? "none" : "";
    document.getElementById("motifPreviewWrap").style.display = hasImage ? "" : "none";
    if (hasImage) {
      document.getElementById("motifPreviewImg").src = active.imageDataUrl;
      document.getElementById("motifFileName").textContent = active.imageName || "Image loaded";
    }
    setFieldValue("motifRadius", active.radius);
    setFieldValue("motifSize", active.size);
    setFieldValue("motifCount", active.count);
    setFieldValue("motifStartAngle", active.startAngle);
    setFieldValue("motifRotation", active.rotation);
    document.getElementById("motifFollowRing").checked = active.followRing;
    setFieldValue("motifBend", active.bend);
    document.getElementById("motifFlip").checked = active.flip;
    document.getElementById("motifFlipHorizontal").checked = active.flipHorizontal;
    document.getElementById("motifAlternateFlip").checked = active.alternateFlip;
  } else if (active.type === "line") {
    setFieldValue("lineRadius", active.radius);
    setFieldValue("lineLength", active.length);
    setFieldValue("lineStrokeWidth", active.strokeWidth);
    document.getElementById("lineStrokeColor").value = active.strokeColor;
    setFieldValue("lineCount", active.count);
    setFieldValue("lineStartAngle", active.startAngle);
    setFieldValue("lineRotation", active.rotation);
    document.getElementById("lineFollowRing").checked = active.followRing;
  } else if (active.type === "shape") {
    document.getElementById("shapeKind").value = active.shapeKind;
    setFieldValue("shapeRadius", active.radius);
    setFieldValue("shapeSize", active.size);
    setFieldValue("shapeSizeY", active.sizeY != null ? active.sizeY : active.size);
    {
      const locked = active.lockRatio !== false;
      const btn = document.getElementById("shapeLockRatio");
      btn.innerHTML = lockRatioIconSvg(locked);
      btn.classList.toggle("locked", locked);
      btn.setAttribute("aria-pressed", String(locked));
    }
    document.getElementById("shapeFillColor").value = active.fillColor;
    setFieldValue("shapeFillOpacity", active.fillOpacity);
    setFieldValue("shapeStrokeWidth", active.strokeWidth);
    document.getElementById("shapeStrokeColor").value = active.strokeColor;
    setFieldValue("shapeCount", active.count);
    setFieldValue("shapeStartAngle", active.startAngle);
    setFieldValue("shapeRotation", active.rotation);
    document.getElementById("shapeFollowRing").checked = active.followRing;
    setFieldValue("shapeBend", active.bend || 0);
    document.getElementById("shapeFlip").checked = !!active.flip;
    document.getElementById("shapeFlipHorizontal").checked = !!active.flipHorizontal;
    document.getElementById("shapeAlternateFlip").checked = !!active.alternateFlip;
    setFieldValue("shapeFlipOffset", active.flipOffset || 0);
  }

  // Every field above was filled from the ACTIVE layer; this overwrites any of them the
  // rest of the selection disagrees on with a dash.
  markMixedFields(getSelectedLayers());
  updateLayerListMeta();
}

// The width/height ratio a locked Shape should hold, captured ONCE at the start of a
// gesture (a slider drag, or a typing run up to blur) and cleared when it ends — see the
// endGesture handlers below. Re-deriving it from the CURRENT rounded integers on every
// input tick let rounding error compound instead: width/height can only be stored as
// whole numbers, so at width 11 a 0.5 ratio becomes 6/11 = 0.545, and dragging onward to
// width 300 in that same motion then applied the corrupted ratio — 200x100 came out
// 300x164 instead of 300x150. Capturing once keeps the intermediate rounding from feeding
// back in, so the shape ends the drag with the proportions it started with. Shared by
// both modes' shape panels.
let lockedRatioForGesture = null;

function shapeLockedRatio(layer) {
  if (lockedRatioForGesture === null) {
    const sizeY = layer.sizeY != null ? layer.sizeY : layer.size;
    lockedRatioForGesture = layer.size > 0 ? sizeY / layer.size : 1;
  }
  return lockedRatioForGesture;
}

function bindControl(id, apply) {
  const el = document.getElementById(id);
  const numEl = document.getElementById(id + "Num");

  const handle = (source) => {
    if (source === el && numEl) numEl.value = el.value;
    if (source === numEl) {
      // Mid-typed math expression (e.g. "40+") or an emptied box isn't a real value yet —
      // leave the slider/model alone until it either becomes a plain number or blur
      // evaluates it (see evaluateNumericExpression), instead of feeding NaN through.
      if (numEl.value.trim() === "" || !Number.isFinite(Number(numEl.value))) return;
      el.value = numEl.value;
    }
    const active = getActiveLayer();
    if (!active) return;
    // One history checkpoint per gesture (drag/pick), not per intermediate 'input'
    // tick — 'change' (fires once, on release/commit) closes the gesture again.
    if (!historyGestureOpen) {
      historyGestureOpen = true;
      pushHistory();
    }
    // Reads from `source`, not always `el` — typing an off-step value (e.g. 273 into a
    // step=5 rotation) into the num box gets silently rounded the moment it's mirrored
    // onto the range slider (browsers snap a range input's .value to the nearest step
    // even on a plain assignment), so applying from el would apply that rounded value
    // instead of what was actually typed.
    // Applies to the whole selection, not just the active layer — that IS multi-select.
    // Each layer is passed through the same apply function individually, so per-layer
    // logic (the shape lock-ratio maths, for instance) still works correctly on each one.
    for (const target of getSelectedLayers()) apply(target, source);
    refreshControls();
    render();
  };
  const endGesture = () => {
    historyGestureOpen = false;
    lockedRatioForGesture = null; // next gesture re-reads the ratio from the committed size
  };

  el.addEventListener("input", () => handle(el));
  el.addEventListener("change", endGesture);
  if (numEl) {
    numEl.addEventListener("input", () => handle(numEl));
    numEl.addEventListener("change", endGesture);
  }
}

// Opacity — unlike every other control here, applies to whichever layer is active
// regardless of its type, since it's rendered directly on the shared <g> wrapper.
bindControl("layerOpacity", (l, el) => (l.opacity = Number(el.value)));
bindControl("layerAnimSpeed", (l, el) => {
  l.animSpeed = Number(el.value);
  ensureAnimationRunning();
});

bindControl("ringRadius", (l, el) => (l.radius = Number(el.value)));
bindControl("ringStrokeWidth", (l, el) => (l.strokeWidth = Number(el.value)));
bindControl("ringStrokeColor", (l, el) => (l.strokeColor = el.value));

bindControl("motifRadius", (l, el) => (l.radius = Number(el.value)));
bindControl("motifSize", (l, el) => (l.size = Number(el.value)));
bindControl("motifCount", (l, el) => (l.count = Number(el.value)));
bindControl("motifStartAngle", (l, el) => (l.startAngle = Number(el.value)));
bindControl("motifRotation", (l, el) => (l.rotation = Number(el.value)));
bindControl("motifBend", (l, el) => (l.bend = Number(el.value)));
bindControl("motifFlip", (l, el) => (l.flip = el.checked));
bindControl("motifFlipHorizontal", (l, el) => (l.flipHorizontal = el.checked));
bindControl("motifAlternateFlip", (l, el) => (l.alternateFlip = el.checked));
bindControl("motifFollowRing", (l, el) => (l.followRing = el.checked));

bindControl("lineRadius", (l, el) => (l.radius = Number(el.value)));
bindControl("lineLength", (l, el) => (l.length = Number(el.value)));
bindControl("lineStrokeWidth", (l, el) => (l.strokeWidth = Number(el.value)));
bindControl("lineStrokeColor", (l, el) => (l.strokeColor = el.value));
bindControl("lineCount", (l, el) => (l.count = Number(el.value)));
bindControl("lineStartAngle", (l, el) => (l.startAngle = Number(el.value)));
bindControl("lineRotation", (l, el) => (l.rotation = Number(el.value)));
bindControl("lineFollowRing", (l, el) => (l.followRing = el.checked));

bindControl("shapeKind", (l, el) => {
  const kind = el.value;
  if (l.lockRatio !== false) {
    const curSizeY = l.sizeY != null ? l.sizeY : l.size;
    if (kind === "halfCircle" && l.shapeKind !== "halfCircle") {
      l.sizeY = Math.round(curSizeY / 2);
    } else if (kind !== "halfCircle" && l.shapeKind === "halfCircle") {
      l.sizeY = Math.round(curSizeY * 2);
    }
  }
  l.shapeKind = kind;
});
bindControl("shapeBend", (l, el) => (l.bend = Number(el.value)));
bindControl("shapeRadius", (l, el) => (l.radius = Number(el.value)));
bindControl("shapeSize", (l, el) => {
  const newSize = Number(el.value);
  if (l.lockRatio !== false) l.sizeY = Math.round(newSize * shapeLockedRatio(l));
  l.size = newSize;
});
bindControl("shapeSizeY", (l, el) => {
  const newSizeY = Number(el.value);
  if (l.lockRatio !== false) {
    const ratio = shapeLockedRatio(l);
    if (ratio > 0) l.size = Math.round(newSizeY / ratio);
  }
  l.sizeY = newSizeY;
});
document.getElementById("shapeLockRatio").addEventListener("click", () => {
  const active = getActiveLayer();
  if (!active) return;
  pushHistory();
  active.lockRatio = active.lockRatio === false; // toggle, defaulting undefined -> true -> false
  lockedRatioForGesture = null; // re-lock to whatever proportions it has right now
  refreshControls();
});
bindControl("shapeFillColor", (l, el) => (l.fillColor = el.value));
bindControl("shapeFillOpacity", (l, el) => (l.fillOpacity = Number(el.value)));
bindControl("shapeStrokeWidth", (l, el) => (l.strokeWidth = Number(el.value)));
bindControl("shapeStrokeColor", (l, el) => (l.strokeColor = el.value));
bindControl("shapeCount", (l, el) => (l.count = Number(el.value)));
bindControl("shapeStartAngle", (l, el) => (l.startAngle = Number(el.value)));
bindControl("shapeRotation", (l, el) => (l.rotation = Number(el.value)));
bindControl("shapeFollowRing", (l, el) => (l.followRing = el.checked));
bindControl("shapeFlip", (l, el) => (l.flip = el.checked));
bindControl("shapeFlipHorizontal", (l, el) => (l.flipHorizontal = el.checked));
bindControl("shapeAlternateFlip", (l, el) => (l.alternateFlip = el.checked));
bindControl("shapeFlipOffset", (l, el) => (l.flipOffset = Number(el.value)));

// Shared by file-upload and the asset-picker modal — both end up with a data URL and
// a display name, then need the identical "install it on this motif layer" steps.
function applyMotifImageToLayer(layer, dataUrl, filename, onDone) {
  const img = new Image();
  img.onload = () => {
    layer.imageDataUrl = dataUrl;
    layer.imageName = filename;
    layer.naturalWidth = img.naturalWidth;
    layer.naturalHeight = img.naturalHeight;
    layer.imageEl = img;
    layer.bendCache = null;
    layer.bendCacheFlipped = null;
    onDone();
  };
  img.src = dataUrl;
}

document.getElementById("motifUpload").addEventListener("change", (e) => {
  const active = getActiveLayer();
  const file = e.target.files[0];
  if (!active || active.type !== "motif" || !file) return;
  pushHistory();
  const reader = new FileReader();
  reader.onload = () => {
    applyMotifImageToLayer(active, reader.result, file.name, () => {
      renderLayerList();
      refreshControls();
      render();
    });
  };
  reader.readAsDataURL(file);
});

document.getElementById("addRingBtn").addEventListener("click", addRingLayer);
document.getElementById("addMotifBtn").addEventListener("click", addMotifLayer);
document.getElementById("addLineBtn").addEventListener("click", addLineLayer);
document.getElementById("addShapeBtn").addEventListener("click", addShapeLayer);
document.getElementById("duplicateLayerBtn").addEventListener("click", duplicateLayer);
document.getElementById("renameLayerBtn").addEventListener("click", () => {
  if (state.activeLayerId != null) startRename(state.activeLayerId);
});
document.getElementById("removeLayerBtn").addEventListener("click", removeLayer);
document.getElementById("clearLayersBtn").addEventListener("click", clearLayers);
document.getElementById("randomizeSpeedsBtn").addEventListener("click", randomizeAnimSpeeds);
document.getElementById("zeroSpeedsBtn").addEventListener("click", zeroAnimSpeeds);
document.getElementById("moveUpBtn").addEventListener("click", () => moveLayer("up"));
document.getElementById("moveDownBtn").addEventListener("click", () => moveLayer("down"));
document.getElementById("undoBtn").addEventListener("click", () => undo());
document.getElementById("redoBtn").addEventListener("click", () => redo());

document.getElementById("layerTypeSelect").addEventListener("change", (e) => {
  const active = getActiveLayer();
  if (!active || !CONVERTIBLE_TYPES.includes(active.type)) return;
  const newType = e.target.value;
  if (newType === active.type) return;
  pushHistory();
  const idx = state.layers.findIndex((l) => l.id === active.id);
  state.layers[idx] = convertLayerType(active, newType);
  renderLayerList();
  refreshControls();
  render();
});

// --- Global mask ---
// A global setting (state.mask), not a per-layer one — same gesture-guarded history/apply
// shape as bindControl above, just targeting state.mask unconditionally instead of
// getActiveLayer() (there's nothing to be "no active layer" about here).
function bindMaskControl(id, apply) {
  const el = document.getElementById(id);
  const numEl = document.getElementById(id + "Num");

  const handle = (source) => {
    if (source === el && numEl) numEl.value = el.value;
    if (source === numEl) {
      if (numEl.value.trim() === "" || !Number.isFinite(Number(numEl.value))) return;
      el.value = numEl.value;
    }
    if (!historyGestureOpen) {
      historyGestureOpen = true;
      pushHistory();
    }
    // Same reasoning as bindControl — read from `source`, not always `el`, so a typed
    // off-step value isn't silently rounded away by the slider's own step-snapping.
    apply(state.mask, source);
    refreshMaskControls();
    render();
  };
  const endGesture = () => (historyGestureOpen = false);

  el.addEventListener("input", () => handle(el));
  el.addEventListener("change", endGesture);
  if (numEl) {
    numEl.addEventListener("input", () => handle(numEl));
    numEl.addEventListener("change", endGesture);
  }
}

function refreshMaskControls() {
  const mask = state.mask;
  document.getElementById("maskEnabled").checked = mask.enabled;
  setFieldValue("maskSize", mask.size);
  document.getElementById("maskInvert").checked = mask.invert;
  const hasImage = !!mask.imageDataUrl;
  document.getElementById("maskNoImageHint").style.display = hasImage ? "none" : "";
  document.getElementById("maskPreviewWrap").style.display = hasImage ? "" : "none";
  if (hasImage) {
    document.getElementById("maskPreviewImg").src = mask.imageDataUrl;
    document.getElementById("maskFileName").textContent = mask.imageName || "Image loaded";
  }
}

bindMaskControl("maskEnabled", (mask, el) => (mask.enabled = el.checked));
bindMaskControl("maskSize", (mask, el) => (mask.size = Number(el.value)));
bindMaskControl("maskInvert", (mask, el) => (mask.invert = el.checked));

document.getElementById("maskUpload").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pushHistory();
  const reader = new FileReader();
  reader.onload = () => {
    state.mask.imageDataUrl = reader.result;
    state.mask.imageName = file.name;
    refreshMaskControls();
    render();
  };
  reader.readAsDataURL(file);
});

// --- Global roughness (rings, lines, shapes) ---
// A mode-wide setting like the mask above, not a per-layer field — one slider governs
// every Ring/Line/Shape's outline at once (see drawRing/drawLine/drawShape), so this
// binds directly to state.roughness instead of going through bindControl's
// getActiveLayer() gate.
function roughnessInput(e) {
  if (!historyGestureOpen) {
    historyGestureOpen = true;
    pushHistory();
  }
  state.roughness = Math.min(100, Math.max(0, Number(e.target.value)));
  setFieldValue("roughness", state.roughness);
  render();
}
document.getElementById("roughness").addEventListener("input", roughnessInput);
document.getElementById("roughness").addEventListener("change", () => (historyGestureOpen = false));
document.getElementById("roughnessNum").addEventListener("input", roughnessInput);
document.getElementById("roughnessNum").addEventListener("change", () => (historyGestureOpen = false));

// --- Animation clock ---
// One continuous clock shared by both modes' rotation/scroll math. `animTimeOverride`
// lets APNG export render a frame at an EXACT chosen instant instead of "whatever time
// it is right now": set it, re-render, read the SVG, then clear it back to null so the
// live preview keeps following the real clock afterward.
const animStartTime = performance.now();
let animTimeOverride = null;

function getAnimElapsedSeconds() {
  return animTimeOverride != null ? animTimeOverride : (performance.now() - animStartTime) / 1000;
}

// Pixels contributed by ONE tile-width shift per loop at the current instant — multiply
// by a layer's own animSpeed (a signed integer count of tile-widths per loop) to get its
// actual shift. Because that's always a whole multiple of the tile width right at the
// loop boundary, EVERY layer lands back on its exact starting position when the loop
// restarts, no matter what its own animSpeed is — that's what keeps independently-sped-up
// layers looping together seamlessly instead of drifting apart. Straight mode still
// exports animation, so it keeps this loop-seamless model; Circle mode dropped it for a
// plain continuous degrees/second speed (see distributeAngles) once it stopped exporting
// animation and became a live-preview-only visualizer.
function animPhasePx(loopDuration, tileWidth) {
  const t = getAnimElapsedSeconds() % loopDuration;
  return (t / loopDuration) * tileWidth;
}

let animationFrameActive = false;

// Only the mode actually on screen counts: the tick below renders exactly one mode, so
// letting the OTHER mode's speeds keep the loop alive just redraws the visible mode over
// and over with nothing in it changing (measured at 24 identical full rebuilds a second
// in Straight mode, caused purely by a Circle layer's speed). setMode restarts the loop
// when the visible mode changes, which is what this being mode-scoped relies on.
function currentModeAnimating() {
  const layers = currentMode === "circle" ? state.layers : smState.layers;
  return layers.some((l) => l.animSpeed);
}

// requestAnimationFrame fires at the DISPLAY's own refresh rate (60/120/144Hz...), not
// a fixed 60 — and every fire here means a full render() teardown-and-rebuild (see its
// own comment), so on a high-refresh monitor this was redoing that full-price work far
// more often than a slow ornament rotation could ever look different, for no visible
// benefit. previewFps (user-adjustable, see the preview-fps-control buttons) caps how
// often the expensive render actually happens; the rAF loop itself still runs every
// native frame regardless, since that check is cheap and it's what lets the very next
// frame past the interval render promptly instead of waiting for its own late timer.
let previewFps = 30;
let lastAnimRenderTime = 0;
let lastTickTime = 0;

function animationTick(now) {
  if (!currentModeAnimating()) {
    animationFrameActive = false;
    return;
  }
  // Half a frame of tolerance, rather than a bare ">= interval": rAF only ever fires on
  // the display's own frame grid, so a target landing a hair after a frame boundary gets
  // missed and waits a WHOLE extra frame — a 30fps cap on a 60Hz display then renders
  // every 3rd frame (~20fps) instead of every 2nd (~30fps), which measured 23.5fps
  // before this. Accepting anything within half a frame of the target snaps it to the
  // nearest frame the display can actually deliver. frameDelta is measured live, so this
  // self-calibrates to the real refresh rate instead of assuming 60Hz.
  const frameDelta = lastTickTime ? now - lastTickTime : 16.7;
  lastTickTime = now;
  if (now - lastAnimRenderTime >= 1000 / previewFps - frameDelta / 2) {
    lastAnimRenderTime = now;
    if (currentMode === "circle") render();
    else smRender();
  }
  requestAnimationFrame(animationTick);
}

// Starts the shared rAF loop only while something actually needs it, rather than
// redrawing 60x/second forever for the common case where nothing is animating. No-ops if
// the loop is already running, so callers can fire it unconditionally after anything
// that might have introduced a speed (a slider, an undo, a mode switch, a project load).
function ensureAnimationRunning() {
  if (!animationFrameActive && currentModeAnimating()) {
    animationFrameActive = true;
    lastTickTime = 0;
    requestAnimationFrame(animationTick);
  }
}

// A viewing preference, not a design setting — deliberately not saved with the project
// or tracked by undo, same reasoning as currentMode/animTimeOverride below.
document.querySelectorAll(".preview-fps-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    previewFps = Number(btn.dataset.fps);
    document.querySelectorAll(".preview-fps-btn").forEach((b) => b.classList.toggle("active", b === btn));
  });
});

// --- Distribution math ---
// Angle 0 = top of the circle, increasing clockwise (matches how people read a wreath).
// followRing rotation uses the same angle so the item's "up" direction faces outward;
// layer.rotation is then added on top as a fixed extra spin (e.g. to flip a motif to
// face inward, or angle a line's tick mark) — shared by both motif and line layers.

function layerAngles(layer) {
  const angles = [];
  const n = Math.floor(layer.count);
  if (n < 1) return angles;
  const angleStep = 360 / n;
  for (let i = 0; i < n; i++) angles.push(layer.startAngle + i * angleStep);
  return angles;
}

function distributeAngles(layer) {
  const items = [];
  const r = layer.radius;
  // Added to the POSITION angle, not straight onto rotation — that's what makes items
  // orbit around the shared center (like the ring physically turning) instead of each
  // one spinning in place on its own axis. When followRing is on, rotation is derived
  // from this same animated angle, so it still keeps facing outward as it orbits.
  // Circle mode is a live visualizer only (no export loop to keep seamless), so speed
  // is just plain degrees/second — continuous and free-running, not quantized to whole
  // turns per shared loop the way Straight mode's exported animation still needs.
  const spin = (layer.animSpeed || 0) * getAnimElapsedSeconds();

  layerAngles(layer).forEach((baseAngleDeg, index) => {
    const angleDeg = baseAngleDeg + spin;
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    const x = CENTER + r * Math.cos(angleRad);
    const y = CENTER + r * Math.sin(angleRad);
    const rotation = (layer.followRing ? angleDeg : 0) + layer.rotation;
    items.push({ x, y, rotation, index });
  });
  return items;
}

// --- Straight (unrolled) preview ---
// A read-only second view: one full lap around each layer's own circle, unrolled into
// a flat strip. Distance must match the circular view at the same 1:1 scale as the ring
// editor itself on BOTH axes — X is true arc length (angle_in_radians * that layer's own
// radius, not angle normalized to a shared width) and Y is true radius difference (not
// normalized/stretched to fill a fixed height). This is exact for two items on the SAME
// ring at any angle, and exact for two items on DIFFERENT rings only right at the seam
// angle (see below) — flattening several different-radius rings into one strip can't
// preserve every cross-ring distance everywhere at once (same reason a flat map of the
// globe can't be distance-accurate everywhere), so accuracy is concentrated where it's
// looked at most instead of at the edges.
//
// angle=0 is centered in the middle of the canvas (not pinned to the left edge), so the
// most visible/least-distorted part of the strip is whatever's at the "front" of the
// ring — the two edges represent the far side of the ring split in half and won't line
// up with each other, which is expected.
//
// There's no curvature once unrolled, so followRing/bend have no straight-view
// equivalent: items just use layer.rotation directly, and motifs always render flat
// (never bent). The canvas is sized to whatever the design actually spans — it can end
// up much bigger than the ring editor in either direction; that's expected.
const STRAIGHT_PAD = 60;
let straightExportWidth = CANVAS_SIZE;
let straightExportHeight = 1000;
// Sub-pixel scroll correction left over from the last syncStraightPreviewToRing() call.
let straightSyncScrollCarry = 0;

function radiusToStraightY(radius, maxR, padY) {
  return padY + (maxR - radius);
}

// How far a layer's own artwork can extend from its anchor point, so items sitting
// right at the angle=0 seam (or at the min/max radius) don't get clipped at the edge.
function layerHalfExtent(layer) {
  if (layer.type === "motif") return layer.size * 0.75;
  if (layer.type === "shape") {
    const sizeY = layer.sizeY != null ? layer.sizeY : layer.size;
    return Math.max(layer.size, sizeY) * 0.75;
  }
  if (layer.type === "line") return layer.length * 0.75;
  return 0;
}

function distributeStraight(layer, maxR, padY, centerX) {
  const y = radiusToStraightY(layer.radius, maxR, padY);
  // Same fix as distributeAngles: the animated term shifts POSITION (slides the item
  // along the strip, matching the item orbiting around the ring in the circular view),
  // not rotation — this view never rotated items by position anyway (no followRing
  // equivalent here), so rotation stays exactly layer.rotation, unanimated. Same
  // continuous degrees/second speed as distributeAngles, for the same reason.
  const spin = (layer.animSpeed || 0) * getAnimElapsedSeconds();
  return layerAngles(layer).map((baseAngleDeg, index) => {
    const angleDeg = baseAngleDeg + spin;
    let norm = ((angleDeg % 360) + 360) % 360; // [0, 360)
    if (norm > 180) norm -= 360; // (-180, 180], centered on the seam angle
    const x = centerX + ((norm * Math.PI) / 180) * layer.radius;
    return { x, y, rotation: layer.rotation, index };
  });
}

// --- Motif bend ---
// A circle's curvature is the same everywhere for a given radius, so the bent shape
// only needs to be rendered once per layer (as if for a single reference copy sitting
// at the top, angleDeg=0, rotation=0) and then every copy just reuses that same bitmap
// with the ordinary rigid translate+rotate placement — identical to the flat image path,
// and Follow ring / Rotation carry over the same way since both go through item.rotation.
//
// The warp itself is done on a <canvas> by inverse mapping: every destination pixel asks
// where it came from in the source and samples that point once. See renderBentFromSource
// for why that beats the forward-drawn overlapping-slices approach it replaced.
// `flip` defaults to the layer's own Flip toggle, but callers doing alternate-flip
// cloning pass the opposite value explicitly to get the mirrored variant — cached
// separately (keyed on the actual flip value used) so both variants can coexist.
function getBentImage(layer, flip = layer.flip) {
  const key = [layer.imageDataUrl, layer.size, layer.bend, layer.radius, layer.naturalWidth, layer.naturalHeight, flip, layer.flipHorizontal].join("|");
  const cacheProp = flip ? "bendCacheFlipped" : "bendCache";
  if (layer[cacheProp] && layer[cacheProp].key === key) return layer[cacheProp];
  const result = renderBentImage(layer, flip);
  layer[cacheProp] = { key, ...result };
  return layer[cacheProp];
}

// Generalized warp core shared by motif bend (source = the uploaded image) and shape
// bend (source = a small offscreen canvas the flat shape was just drawn onto) — anything
// `ctx.drawImage` accepts works as `source`, so the two callers only differ in what they
// hand in, not in how the warp itself works. `flip` is the vertical flip, applied here as
// a mirrored read. A horizontal flip stays the caller's job to bake into `source` first
// (see renderBentImage), since mirroring across the bend axis is a different operation
// from mirroring the artwork and the two would fight.
function renderBentFromSource(source, sourceW, sourceH, w, h, bend, radius, flip) {
  // INVERSE MAPPING. Every destination pixel works out where in the source it came from
  // and samples that one point — as opposed to the previous approach of slicing the source
  // into a few hundred thin vertical strips and drawing each one rotated into place.
  //
  // Forward-drawing strips has to overlap them, or the slight rotation between neighbours
  // leaves wedge-shaped gaps along every seam. But overlapping means pixels in the overlap
  // get composited twice, and compositing a half-transparent pixel onto itself does not
  // give back a half-transparent pixel (0.5 over 0.5 = 0.75). Since antialiased artwork is
  // ~9% partially-transparent edge pixels, every soft edge in the image quietly darkened
  // and thickened. Measured against the untouched source at bend=0, where the warp should
  // be a no-op, the strip version came out 13% heavier in total alpha with 22% more fully
  // opaque pixels: fine linework turned blunt, which is what "bend distorts the asset"
  // actually looked like. Inverse mapping writes each destination pixel exactly once, so
  // that entire class of artifact is gone — the same measurement now comes back at 0%.
  //
  // It also lets the bounds be derived from the real warped edges instead of padding by
  // half the image height to cover the rotated strips, which shrinks the bitmap ~45%.
  const t = Math.max(0, Math.min(1, bend / 100));

  // Rendered at a higher internal resolution than it is displayed at, then scaled back
  // down by the SVG placement, so a source that out-resolves its display size keeps that
  // detail instead of being resampled away before the warp (and can still supply it to a
  // 4096px export). The returned offsets/size are divided back out, so callers place the
  // bitmap in exactly the artboard units they always did.
  const MAX_BENT_CANVAS = 4096; // keeps a huge asset from allocating an absurd canvas
  const detailScale = w > 0 ? sourceW / w : 1; // >1 when the source out-resolves the display size
  let ss = Math.min(3, Math.max(1, detailScale));
  const projected = Math.max(w, h) * 2 * ss;
  if (projected > MAX_BENT_CANVAS) ss = Math.max(1, ss * (MAX_BENT_CANVAS / projected));

  const wS = w * ss;
  const hS = h * ss;

  // Bending "half way" is the same thing as bending fully around a circle twice the size,
  // so partial bends are handled by inflating the radius rather than by interpolating
  // between a flat and a fully-bent position. That matters: the old lerp moved points
  // towards the chord, quietly compressing the asset horizontally by up to ~4% at mid
  // bend. Wrapping onto a larger circle preserves arc length at every setting, so the
  // artwork keeps its proportions and only its curvature changes.
  const R = t > 0 ? (radius * ss) / t : Infinity;
  const flat = !isFinite(R) || R === 0;

  // Source (sx, sy), measured from the image's own centre, lands here. sy runs down the
  // image and towards the circle's centre, so the radius of a point is R - sy.
  const forward = (sx, sy) => {
    if (flat) return { x: sx, y: sy };
    const a = sx / R;
    const rho = R - sy;
    return { x: rho * Math.sin(a), y: R - rho * Math.cos(a) };
  };

  // The image maps to an annular sector, whose extent is entirely determined by its four
  // edges — so walking the top, middle and bottom edges finds the true bounds. (The old
  // code could only bound the centre line and then padded by hS/2 in every direction.)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const EDGE_SAMPLES = 128;
  for (let i = 0; i <= EDGE_SAMPLES; i++) {
    const sx = -wS / 2 + (wS * i) / EDGE_SAMPLES;
    for (const sy of [-hS / 2, 0, hS / 2]) {
      const p = forward(sx, sy);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const pad = 2 * ss; // room for the bilinear tap to reach past the edge
  // Snapped to whole pixels so the sampling grid keeps a fixed phase: an arbitrary
  // fractional offset would blur an unbent image that should pass through untouched.
  minX = Math.floor(minX - pad);
  minY = Math.floor(minY - pad);
  const canvasW = Math.max(1, Math.ceil(maxX + pad - minX));
  const canvasH = Math.max(1, Math.ceil(maxY + pad - minY));
  const offsetX = -minX;
  const offsetY = -minY;

  // Sampling needs the source as raw pixels. Drawing it into a scratch canvas first also
  // normalizes the two callers' inputs (an <img>, or an offscreen canvas of a flat shape).
  const scratch = document.createElement("canvas");
  scratch.width = sourceW;
  scratch.height = sourceH;
  const sctx = scratch.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(source, 0, 0, sourceW, sourceH);
  const S = sctx.getImageData(0, 0, sourceW, sourceH).data;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  const outImage = ctx.createImageData(canvasW, canvasH);
  const D = outImage.data;

  const halfW = wS / 2;
  const halfH = hS / 2;
  const uScale = sourceW / wS;
  const vScale = sourceH / hS;

  for (let py = 0; py < canvasH; py++) {
    const Y = py + 0.5 - offsetY;
    const dy = R - Y; // distance from this row up to the circle's centre
    for (let px = 0; px < canvasW; px++) {
      const X = px + 0.5 - offsetX;
      let sx, sy;
      if (flat) {
        sx = X;
        sy = Y;
      } else {
        sy = R - Math.sqrt(X * X + dy * dy);
        sx = R * Math.atan2(X, dy);
      }
      if (sx < -halfW || sx > halfW || sy < -halfH || sy > halfH) continue;

      const u = (sx + halfW) * uScale - 0.5;
      // Vertical flip is a mirrored read here, which is exact — unlike the strip version,
      // where the caller had to bake flips into the source beforehand.
      const v = (flip ? halfH - sy : sy + halfH) * vScale - 0.5;

      const u0 = Math.floor(u), v0 = Math.floor(v);
      const fu = u - u0, fv = v - v0;
      const cu0 = u0 < 0 ? 0 : u0 > sourceW - 1 ? sourceW - 1 : u0;
      const cv0 = v0 < 0 ? 0 : v0 > sourceH - 1 ? sourceH - 1 : v0;
      const cu1 = u0 + 1 > sourceW - 1 ? sourceW - 1 : u0 + 1 < 0 ? 0 : u0 + 1;
      const cv1 = v0 + 1 > sourceH - 1 ? sourceH - 1 : v0 + 1 < 0 ? 0 : v0 + 1;

      const i00 = (cv0 * sourceW + cu0) * 4;
      const i10 = (cv0 * sourceW + cu1) * 4;
      const i01 = (cv1 * sourceW + cu0) * 4;
      const i11 = (cv1 * sourceW + cu1) * 4;

      const w00 = (1 - fu) * (1 - fv);
      const w10 = fu * (1 - fv);
      const w01 = (1 - fu) * fv;
      const w11 = fu * fv;

      // Blended with alpha premultiplied in, then divided back out. Interpolating raw RGB
      // would pull in the colour stored under fully transparent pixels (usually black),
      // fringing every soft edge with a dark halo.
      const a00 = S[i00 + 3], a10 = S[i10 + 3], a01 = S[i01 + 3], a11 = S[i11 + 3];
      const pa00 = w00 * a00, pa10 = w10 * a10, pa01 = w01 * a01, pa11 = w11 * a11;
      const a = pa00 + pa10 + pa01 + pa11;
      const o = (py * canvasW + px) * 4;
      if (a > 0) {
        D[o] = (S[i00] * pa00 + S[i10] * pa10 + S[i01] * pa01 + S[i11] * pa11) / a;
        D[o + 1] = (S[i00 + 1] * pa00 + S[i10 + 1] * pa10 + S[i01 + 1] * pa01 + S[i11 + 1] * pa11) / a;
        D[o + 2] = (S[i00 + 2] * pa00 + S[i10 + 2] * pa10 + S[i01 + 2] * pa01 + S[i11 + 2] * pa11) / a;
        D[o + 3] = a;
      }
    }
  }
  ctx.putImageData(outImage, 0, 0);

  // Divided back out of the reported geometry: the bitmap has ss x the pixels, but it is
  // still placed at the same size in artboard units as before.
  return {
    url: canvas.toDataURL("image/png"),
    offsetX: offsetX / ss,
    offsetY: offsetY / ss,
    width: canvasW / ss,
    height: canvasH / ss,
  };
}

function renderBentImage(layer, flip) {
  const aspect = layer.naturalWidth && layer.naturalHeight ? layer.naturalHeight / layer.naturalWidth : 1;
  const w = layer.size;
  const h = layer.size * aspect;
  let source = layer.imageEl;
  if (layer.flipHorizontal) {
    const flipCanvas = document.createElement("canvas");
    flipCanvas.width = layer.naturalWidth;
    flipCanvas.height = layer.naturalHeight;
    const fctx = flipCanvas.getContext("2d");
    fctx.translate(layer.naturalWidth, 0);
    fctx.scale(-1, 1);
    fctx.drawImage(layer.imageEl, 0, 0);
    source = flipCanvas;
  }
  return renderBentFromSource(source, layer.naturalWidth, layer.naturalHeight, w, h, layer.bend, layer.radius, flip);
}

// --- Shape bend ---
// Shapes have no uploaded image to warp, so bending one means drawing it flat onto a
// small offscreen canvas first (exactly the same fill/stroke a flat <svg> shape would
// get, just rasterized) and then running that canvas through the same warp core motifs
// use — same cache-by-key pattern as getBentImage, reusing the same bendCache property
// name (a layer is never both types at once, so there's no collision).
// Vertices of a regular n-gon inscribed in the w x h box, first vertex pointing straight
// up — same "points up / faces outward by default" convention as the triangle and the
// half-circle's dome. Stretched by w/h independently rather than forced circular, so
// Width/Height behave the same here as for every other shape kind. Single source of
// truth for all three renderers below (SVG element, canvas bend path, rough outline).
const POLYGON_SIDES = { pentagon: 5, hexagon: 6, octagon: 8 };

function polygonPoints(sides, w, h) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides; // -90deg start = apex up
    pts.push([(w / 2) * Math.cos(a), (h / 2) * Math.sin(a)]);
  }
  return pts;
}

function traceShapePath(ctx, shapeKind, w, h) {
  ctx.beginPath();
  if (shapeKind === "circle") {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shapeKind === "square") {
    ctx.rect(-w / 2, -h / 2, w, h);
  } else if (shapeKind === "halfCircle") {
    ctx.ellipse(0, h / 2, w / 2, h, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
  } else if (POLYGON_SIDES[shapeKind]) {
    const pts = polygonPoints(POLYGON_SIDES[shapeKind], w, h);
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  } else {
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
  }
}

function renderFlatShapeCanvas(layer) {
  const w = layer.size;
  const h = layer.sizeY != null ? layer.sizeY : layer.size;
  const pad = layer.strokeWidth || 0; // half the stroke can extend past the path on each side
  const canvasW = Math.max(1, Math.ceil(w + pad));
  const canvasH = Math.max(1, Math.ceil(h + pad));
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  ctx.translate(canvasW / 2, canvasH / 2);
  traceShapePath(ctx, layer.shapeKind, w, h);
  ctx.fillStyle = layer.fillColor;
  ctx.globalAlpha = layer.fillOpacity / 100;
  ctx.fill();
  ctx.globalAlpha = 1;
  if (layer.strokeWidth > 0) {
    ctx.lineWidth = layer.strokeWidth;
    ctx.strokeStyle = layer.strokeColor;
    ctx.stroke();
  }
  return { canvas, width: canvasW, height: canvasH };
}

function getBentShapeImage(layer) {
  const key = [
    layer.shapeKind, layer.size, layer.sizeY, layer.fillColor, layer.fillOpacity,
    layer.strokeWidth, layer.strokeColor, layer.bend, layer.radius,
  ].join("|");
  if (layer.bendCache && layer.bendCache.key === key) return layer.bendCache;
  const flat = renderFlatShapeCanvas(layer);
  const result = renderBentFromSource(flat.canvas, flat.width, flat.height, flat.width, flat.height, layer.bend, layer.radius, false);
  layer.bendCache = { key, ...result };
  return layer.bendCache;
}

// --- Rendering ---
// Shared per-type drawers: each takes a target <g> and a precomputed items list
// ({x, y, rotation}), so both the circular view (distributeAngles) and the straight
// view (distributeStraight) can reuse the exact same element-building code.

function drawRing(g, layer, roughness) {
  if (roughness > 0) {
    const passes = getRoughOutlinePasses(
      layer, "ring", String(layer.radius),
      () => sampleArcPoints(CENTER, CENTER, layer.radius, layer.radius, 0, Math.PI * 2, ROUGH_SAMPLE_SPACING),
      true, roughness
    );
    const defId = `rough-ring-${layer.id}`;
    const defs = document.createElementNS(SVG_NS, "defs");
    appendRoughOutlineDef(defs, defId, passes, layer.strokeColor);
    g.appendChild(defs);
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `#${defId}`);
    g.appendChild(use);
    return;
  }
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", CENTER);
  circle.setAttribute("cy", CENTER);
  circle.setAttribute("r", layer.radius);
  circle.setAttribute("fill", "none");
  circle.setAttribute("stroke", layer.strokeColor);
  circle.setAttribute("stroke-width", layer.strokeWidth);
  g.appendChild(circle);
}

function drawMotifFlat(g, layer, items) {
  if (!layer.imageDataUrl) return;
  const aspect = layer.naturalWidth && layer.naturalHeight ? layer.naturalHeight / layer.naturalWidth : 1;
  const w = layer.size;
  const h = layer.size * aspect;

  // Every copy shares the exact same image bytes — defining the <image> once in <defs>
  // and referencing it per-copy via <use> keeps that (often large) base64 payload out
  // of the serialized SVG N times over. Skipping this made a many-copy motif's exported
  // SVG string balloon into the megabytes, which is what made rasterizing each frame of
  // an APNG export take several seconds — the browser has to re-decode all of it on
  // every single frame.
  const defId = `motif-src-${layer.id}`;
  const defs = document.createElementNS(SVG_NS, "defs");
  const img = document.createElementNS(SVG_NS, "image");
  img.setAttribute("id", defId);
  img.setAttribute("href", layer.imageDataUrl);
  img.setAttribute("x", -w / 2);
  img.setAttribute("y", -h / 2);
  img.setAttribute("width", w);
  img.setAttribute("height", h);
  defs.appendChild(img);
  g.appendChild(defs);

  for (const item of items) {
    const itemG = document.createElementNS(SVG_NS, "g");
    // Alternate flip: index 0 normal, 1 flipped, 2 normal, ... — XOR'd with the base
    // Flip toggle so the two settings compose instead of fighting each other. Flip
    // horizontal is independent of both — it applies uniformly to every copy — so it
    // just composes into the same scale() rather than affecting this alternation.
    const isFlippedV = layer.alternateFlip ? (item.index % 2 === 1) !== !!layer.flip : layer.flip;
    const scaleX = layer.flipHorizontal ? -1 : 1;
    const scaleY = isFlippedV ? -1 : 1;
    const scalePart = scaleX !== 1 || scaleY !== 1 ? ` scale(${scaleX},${scaleY})` : "";
    itemG.setAttribute("transform", `translate(${item.x} ${item.y}) rotate(${item.rotation})${scalePart}`);
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `#${defId}`);
    itemG.appendChild(use);
    g.appendChild(itemG);
  }
}

// Deterministic per-call PRNG (mulberry32) — used so a rough outline's texture is stable
// across re-renders/animation frames (seeded from the layer's own id, not Math.random()),
// instead of re-jittering into a shimmering mess 60 times a second.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Evenly-spaced points from (ax,ay) to (bx,by) inclusive of both ends, ~spacing apart —
// the straight-edge building block every outline sampler below is made of.
function sampleSegmentPoints(ax, ay, bx, by, spacing) {
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.round(len / spacing));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  return pts;
}

// Evenly-spaced points along an elliptical arc from startAngle to endAngle (radians) —
// a full circle is just this called with a 0..2π sweep.
function sampleArcPoints(cx, cy, rx, ry, startAngle, endAngle, spacing) {
  const avgR = Math.max(1, (rx + ry) / 2);
  const arcLen = Math.abs(endAngle - startAngle) * avgR;
  const n = Math.max(8, Math.round(arcLen / spacing));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / n);
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

// Local-coordinate outline points for a Shape layer's own kind, tracing exactly the
// same geometry its crisp path (drawShape) or traceShapePath uses, just densely sampled
// into a point chain instead of an SVG arc/polygon command — closed loop in every case.
function shapeOutlinePoints(shapeKind, w, h, spacing) {
  if (shapeKind === "circle") {
    return sampleArcPoints(0, 0, w / 2, h / 2, 0, Math.PI * 2, spacing);
  }
  if (shapeKind === "square") {
    const hw = w / 2, hh = h / 2;
    return [
      ...sampleSegmentPoints(-hw, -hh, hw, -hh, spacing),
      ...sampleSegmentPoints(hw, -hh, hw, hh, spacing),
      ...sampleSegmentPoints(hw, hh, -hw, hh, spacing),
      ...sampleSegmentPoints(-hw, hh, -hw, -hh, spacing),
    ];
  }
  if (shapeKind === "halfCircle") {
    // Matches traceShapePath's ellipse arc (PI to 2*PI, radii w/2 & h, center (0, h/2) —
    // the dome) plus a straight closing edge back along the flat base.
    return [
      ...sampleArcPoints(0, h / 2, w / 2, h, Math.PI, Math.PI * 2, spacing),
      ...sampleSegmentPoints(w / 2, h / 2, -w / 2, h / 2, spacing),
    ];
  }
  if (POLYGON_SIDES[shapeKind]) {
    const pts = polygonPoints(POLYGON_SIDES[shapeKind], w, h);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length]; // wraps the last edge back to the first
      out.push(...sampleSegmentPoints(ax, ay, bx, by, spacing));
    }
    return out;
  }
  // triangle — apex first, same winding as drawShape's <polygon points>.
  return [
    ...sampleSegmentPoints(0, -h / 2, -w / 2, h / 2, spacing),
    ...sampleSegmentPoints(-w / 2, h / 2, w / 2, h / 2, spacing),
    ...sampleSegmentPoints(w / 2, h / 2, 0, -h / 2, spacing),
  ];
}

// Walks any point chain (a straight line's two endpoints already subdivided, a circle,
// a polygon's edges — anything the samplers above produce) and roughens it: short,
// evenly-spaced steps each independently jittered perpendicular to their own local
// direction and randomly skipped (gap) to tear it into pieces with real gaps, instead of
// a smooth continuous stroke. `ticks` is a second, separate path of short strokes jutting
// off at random points, mimicking stray bristle hairs — jitter alone reads as wavy, not
// brush-like, without them. `closed` wraps the last point back to the first (rings and
// every Shape kind; a Line is the one open case). Geometry-agnostic on purpose, so one
// implementation covers a ring's circle, a line's straight run, and every shape outline.
function roughenPoints(points, closed, seed, opts) {
  const rng = mulberry32(seed);
  const pts = closed ? [...points, points[0]] : points;
  const core = [];
  const ticks = [];
  let drawing = false;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) continue;
    const nx = -dy / segLen, ny = dx / segLen; // unit normal
    if (rng() > opts.gap) {
      const j = (rng() - 0.5) * opts.jitter;
      const px = bx + nx * j, py = by + ny * j;
      if (!drawing) {
        core.push(`M ${ax.toFixed(1)} ${ay.toFixed(1)}`);
        drawing = true;
      }
      core.push(`L ${px.toFixed(1)} ${py.toFixed(1)}`);
      if (rng() < opts.tickChance) {
        const dir = rng() < 0.5 ? 1 : -1;
        const tx = px + nx * dir * opts.tickLen + (dx / segLen) * (rng() - 0.5) * opts.tickLen;
        const ty = py + ny * dir * opts.tickLen + (dy / segLen) * (rng() - 0.5) * opts.tickLen;
        ticks.push(`M ${px.toFixed(1)} ${py.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`);
      }
    } else {
      drawing = false;
    }
  }
  return { core: core.join(" "), ticks: ticks.join(" ") };
}

// Two overlapping passes (a fuller core stroke + a lighter, sparser "graze" pass at half
// width/opacity) read as an uneven, textured brush mark rather than one uniform scratchy
// line — real dry-brush strokes aren't a single consistent density along their length.
//
// Cached on the layer itself (layer.roughCache), same idea as getBentImage's cache: the
// walk is a deterministic function of dimensionKey/strokeWidth/strokeColor, so redoing
// it on every render — up to 60×/second while anything animates, even layers that never
// change — would just repeat the identical result. `samplePoints` is a thunk so a cache
// hit skips even building the point chain, not just the roughening.
// roughness is 0-100 (see the "Roughness" slider) — everything that defines HOW rough
// (jitter distance, gap chance, tick chance/length, the graze pass's opacity) scales
// linearly with it, so 0 is perfectly smooth and 100 is the fully torn look this was
// tuned at; spacing (sampling density) stays fixed since that's resolution, not intensity.
// cacheSlot keeps this layer's different rough uses from clobbering each other — a Ring
// layer gets roughened BOTH by drawRing (the main editor's circle) and, separately, by
// the unrolled Straight Preview's own flattened-to-a-line representation, both within
// the same render() call. Sharing one cache slot between them would mean whichever ran
// second always overwrote the first's cached path with its own differently-shaped one.
// Tuned in an isolated prototype at roughly 1 SVG unit per screen pixel — but the real
// canvases render thousands of units into a few hundred px (the Ring editor's 4096 units
// lands in ~866px, ~4.7 units/pixel). At the ORIGINAL jitter/spacing, both the sampling
// (ROUGH_SAMPLE_SPACING, in each samplePoints call below) and the jitter amplitude here
// were sub-pixel: the browser paid full cost to rasterize thousands of segments that all
// landed inside the same 1-2 screen pixels, which reads as noisy mush instead of a crisp
// torn edge — heavy AND messy for the same underlying reason. Scaling both by the same
// factor restores the look validated at prototype scale while cutting point count (and
// render cost) by the same factor.
//
// This is per-artboard, not one global number, because the three artboards show their
// coordinate spaces at very different magnifications: the Ring editor fits 4096 units into
// ~910px (4.5 units/px), while the Straight editor fits 1000 units into 640px (1.56) and is
// therefore ~3x more magnified. A brush tick is authored in SCREEN terms — a couple of
// pixels of bristle — so a single constant made the identical jitter and sampling spacing
// come out 3x longer and 3x coarser in Straight mode. That is the "very long dots" look:
// not a different texture, the same texture blown up.
const ROUGH_SCALE = 4.5; // Ring editor: 4096 units shown at ~910px. The tuned reference.
const ROUGH_SCALE_TILE = 1.5625; // Straight editor: SM_HEIGHT (1000) units shown at 640px.
const ROUGH_SAMPLE_SPACING = 2.75 * ROUGH_SCALE;
// Sampling density has to track the same factor as the jitter. Left fixed, Straight mode
// walked the outline in strides ~3x longer than the Ring editor, so each roughened segment
// covered ~24 screen px instead of ~2.6 — long straight dashes rather than a torn edge.
const roughSampleSpacing = (roughScale) => 2.75 * roughScale;

function getRoughOutlinePasses(layer, cacheSlot, dimensionKey, samplePoints, closed, roughness, roughScale = ROUGH_SCALE) {
  const key = [dimensionKey, layer.strokeWidth, layer.strokeColor, roughness, roughScale].join("|");
  if (!layer.roughCache) layer.roughCache = {};
  const cached = layer.roughCache[cacheSlot];
  if (cached && cached.key === key) return cached.passes;
  // Squaring (not a straight roughness/100 fraction) keeps the low-to-mid slider range
  // restrained — at the midpoint this lands close to what a linear mapping gave at ~20,
  // while 100 still reaches full strength (1^2 = 1). A straight linear fraction made the
  // default (50) look "very strong" well before the slider's actual midpoint.
  const f = Math.pow(roughness / 100, 2);
  const points = samplePoints();
  // tickLen is tied to jitter (not strokeWidth) — the earlier version scaled tick length
  // off strokeWidth * ROUGH_SCALE, which for a normal 10-unit stroke made ticks 4x LONGER
  // than the jitter itself: exactly what read as "hair" sticking out rather than bristle
  // texture. Must be computed before roughenPoints runs, since it reads opts.tickLen.
  const passes = [
    { seed: layer.id * 2 + 1, jitter: 2.5 * f * roughScale, gap: 0.16 * f, width: layer.strokeWidth, opacity: 1, tickChance: 0.15 * f },
    { seed: layer.id * 2 + 2, jitter: 3.5 * f * roughScale, gap: 0.4 * f, width: Math.max(1, layer.strokeWidth * 0.5), opacity: 0.4 * f, tickChance: 0.15 * f },
  ].map((p) => {
    const withTickLen = { ...p, tickLen: p.jitter * 1.5 };
    return { ...withTickLen, ...roughenPoints(points, closed, withTickLen.seed, withTickLen) };
  });
  layer.roughCache[cacheSlot] = { key, passes };
  return passes;
}

// Renders cached rough-outline passes into a <defs><g id> block, ready to be placed via
// <use> — once per layer, regardless of how many distributed copies (items) reuse it.
function appendRoughOutlineDef(defs, defId, passes, strokeColor) {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("id", defId);
  for (const p of passes) {
    const corePath = document.createElementNS(SVG_NS, "path");
    corePath.setAttribute("d", p.core);
    corePath.setAttribute("stroke", strokeColor);
    corePath.setAttribute("stroke-width", p.width);
    corePath.setAttribute("stroke-linecap", "round");
    corePath.setAttribute("fill", "none");
    corePath.setAttribute("opacity", p.opacity);
    group.appendChild(corePath);
    const tickPath = document.createElementNS(SVG_NS, "path");
    tickPath.setAttribute("d", p.ticks);
    tickPath.setAttribute("stroke", strokeColor);
    tickPath.setAttribute("stroke-width", Math.max(1, p.width * 0.5));
    tickPath.setAttribute("stroke-linecap", "round");
    tickPath.setAttribute("fill", "none");
    tickPath.setAttribute("opacity", p.opacity * 0.8);
    group.appendChild(tickPath);
  }
  defs.appendChild(group);
}

// `roughScale` is the artboard's units-per-screen-pixel — drawLine/drawShape are shared by
// the Ring editor and the Straight editor, which differ by ~3x, so the caller has to say
// which one it is drawing into (see ROUGH_SCALE).
function drawLine(g, layer, items, roughness, roughScale = ROUGH_SCALE) {
  let roughDefId = null;
  if (roughness > 0) {
    const passes = getRoughOutlinePasses(
      layer, "line", String(layer.length),
      () => sampleSegmentPoints(0, -layer.length / 2, 0, layer.length / 2, roughSampleSpacing(roughScale)),
      false, roughness, roughScale
    );
    roughDefId = `rough-line-${layer.id}`;
    const defs = document.createElementNS(SVG_NS, "defs");
    appendRoughOutlineDef(defs, roughDefId, passes, layer.strokeColor);
    g.appendChild(defs);
  }
  for (const item of items) {
    const itemG = document.createElementNS(SVG_NS, "g");
    itemG.setAttribute("transform", `translate(${item.x} ${item.y}) rotate(${item.rotation})`);
    if (roughDefId) {
      const use = document.createElementNS(SVG_NS, "use");
      use.setAttribute("href", `#${roughDefId}`);
      itemG.appendChild(use);
    } else {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", 0);
      line.setAttribute("y1", -layer.length / 2);
      line.setAttribute("x2", 0);
      line.setAttribute("y2", layer.length / 2);
      line.setAttribute("stroke", layer.strokeColor);
      line.setAttribute("stroke-width", layer.strokeWidth);
      line.setAttribute("stroke-linecap", "round");
      itemG.appendChild(line);
    }
    g.appendChild(itemG);
  }
}

// A vertical flip mirrors a shape about its OWN centre, so any shape that isn't
// symmetric top-to-bottom (a triangle, a half circle) lands somewhere different from its
// un-flipped neighbours — with Alternate flip on, every other copy looks out of line
// rather than reading as one continuous ornament. flipOffset shifts only the flipped
// copies back along their own axis to close that gap.
//
// Emitted between rotate() and scale() so it happens in the item's own rotated frame:
// the shift follows wherever that copy is pointing (outward around a ring, up/down on a
// straight tile) instead of always being screen-vertical. Positioned before scale() so
// the value isn't itself mirrored — otherwise the same number would push flipped copies
// the opposite way and the control would feel inverted.
function flipOffsetPart(layer, isFlippedV) {
  const offset = isFlippedV ? layer.flipOffset || 0 : 0;
  return offset ? ` translate(0 ${offset})` : "";
}

function drawShape(g, layer, items, roughness, roughScale = ROUGH_SCALE) {
  const w = layer.size;
  // Older/loaded layers may not have sizeY yet — fall back to size so they keep
  // rendering exactly as before (uniform) until Height is touched.
  const h = layer.sizeY != null ? layer.sizeY : layer.size;

  // Fill stays crisp either way — only the OUTLINE gets the rough treatment, drawn as a
  // separate stroke-only pass on top (stroke:none on the fill element itself avoids a
  // clean outline showing through underneath the rough one). Built once per layer, reused
  // by every distributed copy via <use>, same sharing as drawLine's rough def.
  let roughDefId = null;
  if (roughness > 0) {
    const passes = getRoughOutlinePasses(
      layer, "shape", `${layer.shapeKind}|${w}|${h}`,
      () => shapeOutlinePoints(layer.shapeKind, w, h, roughSampleSpacing(roughScale)),
      true, roughness, roughScale
    );
    roughDefId = `rough-shape-${layer.id}`;
    const defs = document.createElementNS(SVG_NS, "defs");
    appendRoughOutlineDef(defs, roughDefId, passes, layer.strokeColor);
    g.appendChild(defs);
  }

  for (const item of items) {
    const itemG = document.createElementNS(SVG_NS, "g");
    // Same flip composition as drawMotifFlat: alternate flip XORs with the base Flip
    // toggle so the two settings combine instead of fighting, and horizontal flip is
    // independent (applies to every copy). Folded into the same transform as the
    // rotation, so the rough outline <use> below inherits it automatically.
    const isFlippedV = layer.alternateFlip ? (item.index % 2 === 1) !== !!layer.flip : !!layer.flip;
    const scaleX = layer.flipHorizontal ? -1 : 1;
    const scaleY = isFlippedV ? -1 : 1;
    const scalePart = scaleX !== 1 || scaleY !== 1 ? ` scale(${scaleX},${scaleY})` : "";
    itemG.setAttribute("transform", `translate(${item.x} ${item.y}) rotate(${item.rotation})${flipOffsetPart(layer, isFlippedV)}${scalePart}`);

    let shapeEl;
    if (layer.shapeKind === "circle") {
      shapeEl = document.createElementNS(SVG_NS, "ellipse");
      shapeEl.setAttribute("cx", 0);
      shapeEl.setAttribute("cy", 0);
      shapeEl.setAttribute("rx", w / 2);
      shapeEl.setAttribute("ry", h / 2);
    } else if (layer.shapeKind === "square") {
      shapeEl = document.createElementNS(SVG_NS, "rect");
      shapeEl.setAttribute("x", -w / 2);
      shapeEl.setAttribute("y", -h / 2);
      shapeEl.setAttribute("width", w);
      shapeEl.setAttribute("height", h);
    } else if (layer.shapeKind === "halfCircle") {
      // Dome up, flat edge down — same "faces outward by default" convention as the
      // triangle. Height is the full bounding-box height (flat edge to dome top), so an
      // arc radius of h (not h/2) is what actually produces a box that tall.
      shapeEl = document.createElementNS(SVG_NS, "path");
      shapeEl.setAttribute("d", `M ${-w / 2} ${h / 2} A ${w / 2} ${h} 0 0 1 ${w / 2} ${h / 2} Z`);
    } else if (POLYGON_SIDES[layer.shapeKind]) {
      shapeEl = document.createElementNS(SVG_NS, "polygon");
      shapeEl.setAttribute("points", polygonPoints(POLYGON_SIDES[layer.shapeKind], w, h).map(([x, y]) => `${x},${y}`).join(" "));
    } else {
      // Triangle points "up" (apex first) so it faces outward by default, same
      // convention as the motif/line "up" direction under followRing.
      shapeEl = document.createElementNS(SVG_NS, "polygon");
      shapeEl.setAttribute("points", `0,${-h / 2} ${-w / 2},${h / 2} ${w / 2},${h / 2}`);
    }
    shapeEl.setAttribute("fill", layer.fillColor);
    shapeEl.setAttribute("fill-opacity", layer.fillOpacity / 100);
    if (roughDefId) {
      shapeEl.setAttribute("stroke", "none");
    } else {
      shapeEl.setAttribute("stroke", layer.strokeColor);
      shapeEl.setAttribute("stroke-width", layer.strokeWidth);
    }
    itemG.appendChild(shapeEl);
    if (roughDefId) {
      const use = document.createElementNS(SVG_NS, "use");
      use.setAttribute("href", `#${roughDefId}`);
      itemG.appendChild(use);
    }
    g.appendChild(itemG);
  }
}

// Shared by both modes: an SVG <mask> whose alpha comes from a tiled texture image
// (native luminance masking — white keeps, black erases, like Krita's erase mask) rather
// than anything specific to layer content, which is why it wraps the whole rendered
// composition once instead of being a per-layer option. idPrefix keeps circle/straight's
// def ids from colliding if either ever ends up sharing a document with the other.
// Invert has no direct SVG primitive, so it's done by literally inverting the texture's
// RGB (a standard feColorMatrix) before it hits the mask, rather than inverting alpha
// arithmetic after the fact — same visual result, simpler to express.
function buildMaskDefs(mask, viewW, viewH, idPrefix) {
  const defs = document.createElementNS(SVG_NS, "defs");
  const patId = `${idPrefix}MaskPattern`;
  const maskId = `${idPrefix}Mask`;

  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.setAttribute("id", patId);
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", mask.size);
  pattern.setAttribute("height", mask.size);
  const img = document.createElementNS(SVG_NS, "image");
  img.setAttribute("href", mask.imageDataUrl);
  img.setAttribute("width", mask.size);
  img.setAttribute("height", mask.size);
  img.setAttribute("preserveAspectRatio", "none");
  if (mask.invert) {
    const filterId = `${idPrefix}MaskInvert`;
    const filter = document.createElementNS(SVG_NS, "filter");
    filter.setAttribute("id", filterId);
    const cm = document.createElementNS(SVG_NS, "feColorMatrix");
    cm.setAttribute("type", "matrix");
    cm.setAttribute("values", "-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0");
    filter.appendChild(cm);
    defs.appendChild(filter);
    img.setAttribute("filter", `url(#${filterId})`);
  }
  pattern.appendChild(img);
  defs.appendChild(pattern);

  const maskEl = document.createElementNS(SVG_NS, "mask");
  maskEl.setAttribute("id", maskId);
  maskEl.setAttribute("maskUnits", "userSpaceOnUse");
  maskEl.setAttribute("x", 0);
  maskEl.setAttribute("y", 0);
  maskEl.setAttribute("width", viewW);
  maskEl.setAttribute("height", viewH);
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("width", viewW);
  rect.setAttribute("height", viewH);
  rect.setAttribute("fill", `url(#${patId})`);
  maskEl.appendChild(rect);
  defs.appendChild(maskEl);

  return { defs, maskId };
}

// Applies (or leaves untouched) the whole-artboard mask on `content`, the <g> a render()
// puts all of a mode's actual artwork into. Skipped whenever disabled/no texture so the
// unmasked, common case doesn't pay for a <defs> it doesn't need.
function applyGlobalMask(content, mask, viewW, viewH, idPrefix) {
  if (!mask.enabled || !mask.imageDataUrl) return;
  const { defs, maskId } = buildMaskDefs(mask, viewW, viewH, idPrefix);
  content.appendChild(defs);
  content.setAttribute("mask", `url(#${maskId})`);
}

function render() {
  const svg = document.getElementById("canvas");
  svg.innerHTML = "";

  // Everything actual-artwork goes into one wrapper so the global mask (if any) can
  // apply once to the whole composition, without touching the editor-only indicator/seam
  // guide appended after it below (masking those would just be confusing).
  const content = document.createElementNS(SVG_NS, "g");

  for (const layer of state.layers) {
    const g = document.createElementNS(SVG_NS, "g");
    g.dataset.layerId = layer.id;
    g.classList.add("layer-hit");
    g.setAttribute("opacity", (layer.opacity != null ? layer.opacity : 100) / 100);

    if (layer.visible === false) {
      // Nothing to draw, but keep the (empty) <g> so layer order/indexing stays
      // consistent with the layers array — same reasoning as every other layer type.
      content.appendChild(g);
      continue;
    }

    if (layer.type === "ring") {
      drawRing(g, layer, state.roughness);
    } else if (layer.type === "motif") {
      // imageEl can briefly be missing right after loading a saved project — it isn't
      // part of the file (see snapshotLayers) and gets reloaded from imageDataUrl
      // asynchronously, so bend falls back to flat for the instant before that finishes
      // rather than handing a not-yet-loaded image to canvas drawImage.
      if (!layer.bend || !layer.imageDataUrl || !layer.imageEl) {
        drawMotifFlat(g, layer, distributeAngles(layer));
      } else {
        // Bend is pre-rendered once per layer into a single seamless bitmap (see
        // getBentImage) and then every copy places that SAME bitmap rigidly, exactly
        // like the flat case above — the curve only needs computing once. Follow
        // ring / Rotation still apply on top via item.rotation, same as the flat case.
        // Alternate flip needs a SECOND bitmap (flip changes which pixels land where
        // during the bend warp itself, not just a wrapper transform), reused the same
        // rigid way for every odd-indexed copy.
        const bent = getBentImage(layer);
        const bentAlt = layer.alternateFlip ? getBentImage(layer, !layer.flip) : null;

        // Same <defs>/<use> sharing as drawMotifFlat — each bent bitmap is defined once
        // regardless of how many copies (count) reuse it.
        const defs = document.createElementNS(SVG_NS, "defs");
        const defineBent = (b, defId) => {
          const img = document.createElementNS(SVG_NS, "image");
          img.setAttribute("id", defId);
          img.setAttribute("href", b.url);
          img.setAttribute("x", -b.offsetX);
          img.setAttribute("y", -b.offsetY);
          img.setAttribute("width", b.width);
          img.setAttribute("height", b.height);
          defs.appendChild(img);
        };
        const bentDefId = `bent-src-${layer.id}`;
        const bentAltDefId = `bent-alt-src-${layer.id}`;
        defineBent(bent, bentDefId);
        if (bentAlt) defineBent(bentAlt, bentAltDefId);
        g.appendChild(defs);

        for (const item of distributeAngles(layer)) {
          const useAlt = bentAlt && item.index % 2 === 1;
          const itemG = document.createElementNS(SVG_NS, "g");
          itemG.setAttribute("transform", `translate(${item.x} ${item.y}) rotate(${item.rotation})`);
          const use = document.createElementNS(SVG_NS, "use");
          use.setAttribute("href", `#${useAlt ? bentAltDefId : bentDefId}`);
          itemG.appendChild(use);
          g.appendChild(itemG);
        }
      }
    } else if (layer.type === "line") {
      drawLine(g, layer, distributeAngles(layer), state.roughness);
    } else if (layer.type === "shape") {
      if (!layer.bend) {
        drawShape(g, layer, distributeAngles(layer), state.roughness);
      } else {
        // Same <defs>/<use> sharing as the bent-motif path above: the bent bitmap is
        // rendered once per layer and every copy just places that same image rigidly.
        const bent = getBentShapeImage(layer);
        const defs = document.createElementNS(SVG_NS, "defs");
        const img = document.createElementNS(SVG_NS, "image");
        const defId = `bent-shape-src-${layer.id}`;
        img.setAttribute("id", defId);
        img.setAttribute("href", bent.url);
        img.setAttribute("x", -bent.offsetX);
        img.setAttribute("y", -bent.offsetY);
        img.setAttribute("width", bent.width);
        img.setAttribute("height", bent.height);
        defs.appendChild(img);
        g.appendChild(defs);

        for (const item of distributeAngles(layer)) {
          const itemG = document.createElementNS(SVG_NS, "g");
          // Same flip composition as the flat path in drawShape — a bent shape is still
          // placed rigidly, so flipping is just a wrapper scale here too.
          const isFlippedV = layer.alternateFlip ? (item.index % 2 === 1) !== !!layer.flip : !!layer.flip;
          const sx = layer.flipHorizontal ? -1 : 1;
          const sy = isFlippedV ? -1 : 1;
          const scalePart = sx !== 1 || sy !== 1 ? ` scale(${sx},${sy})` : "";
          itemG.setAttribute("transform", `translate(${item.x} ${item.y}) rotate(${item.rotation})${flipOffsetPart(layer, isFlippedV)}${scalePart}`);
          const use = document.createElementNS(SVG_NS, "use");
          use.setAttribute("href", `#${defId}`);
          itemG.appendChild(use);
          g.appendChild(itemG);
        }
      }
    }

    content.appendChild(g);
  }

  applyGlobalMask(content, state.mask, CANVAS_SIZE, CANVAS_SIZE, "circle");
  svg.appendChild(content);

  renderStraight();

  const active = getActiveLayer();
  if (active) {
    const indicator = document.createElementNS(SVG_NS, "circle");
    indicator.setAttribute("cx", CENTER);
    indicator.setAttribute("cy", CENTER);
    indicator.setAttribute("r", active.radius);
    indicator.setAttribute("fill", "none");
    indicator.setAttribute("stroke", "#4f8cff");
    indicator.setAttribute("stroke-width", 4);
    indicator.setAttribute("stroke-dasharray", "24 16");
    indicator.setAttribute("class", "editor-only");
    indicator.setAttribute("pointer-events", "none");
    svg.appendChild(indicator);
  }

  // Seam guide: angle=0 (straight up from center) is the point distributeStraight()
  // centers the unrolled strip on, so this line marks, right on the ring editor, exactly
  // which point of the ring becomes the middle of the Straight preview. Deliberately
  // overshoots way past the top edge of this SVG's own viewBox — combined with the
  // `overflow: visible` on svg#canvas, and the fact this artboard is later in the DOM
  // than the Straight preview one above it (so it paints on top), the overshoot bleeds
  // up through the gap and visually through the Straight preview panel itself.
  const seam = document.createElementNS(SVG_NS, "line");
  seam.setAttribute("x1", CENTER);
  seam.setAttribute("y1", CENTER);
  seam.setAttribute("x2", CENTER);
  seam.setAttribute("y2", -3 * CANVAS_SIZE);
  seam.setAttribute("class", "editor-only");
  seam.setAttribute("stroke", "#8a8a92");
  seam.setAttribute("stroke-width", 3);
  seam.setAttribute("stroke-dasharray", "18 12");
  seam.setAttribute("pointer-events", "none");
  svg.appendChild(seam);

  const cross = document.createElementNS(SVG_NS, "g");
  cross.setAttribute("class", "editor-only");
  cross.setAttribute("stroke", "#bbb");
  cross.setAttribute("stroke-width", 4);
  cross.innerHTML = `<line x1="${CENTER - 32}" y1="${CENTER}" x2="${CENTER + 32}" y2="${CENTER}" />
    <line x1="${CENTER}" y1="${CENTER - 32}" x2="${CENTER}" y2="${CENTER + 32}" />`;
  svg.appendChild(cross);
}

// Click-to-select: delegated once (not re-added on every render, since render() only
// clears/rebuilds the SVG's children, not the SVG element itself) so clicking any
// rendered piece of a layer selects that layer in the sidebar, same as clicking its
// row in the layer list.
//
// Listens on pointerdown, not click: a "click" only fires if the element under the
// pointer at mousedown is still there (and still in roughly the same place) at mouseup,
// and while a layer is animating, render() replaces every element with a fresh one on
// every single frame — up to 60 times a second. That made real clicks intermittently
// get silently dropped by the browser (the original mousedown target had already been
// torn down and replaced by the time mouseup happened) purely depending on animation
// timing. pointerdown resolves its target immediately on press, in the same frame, so
// there's no gap for a re-render to land in — selection is instant either way, and this
// canvas has no drag gesture that would need to distinguish press-and-release from
// press-and-drag.
//
// When several layers overlap at the click point, a single hit-test only ever finds
// the topmost one (whatever e.target resolves to) — clicking again could never reach
// anything stacked underneath. elementsFromPoint returns EVERY element at that point,
// topmost first, so walking that whole list (not just e.target) recovers the full
// stack; each factory below then remembers which stack it last resolved (by the set of
// layer ids in it, not raw pixel position, since a real click never lands on the exact
// same pixel twice) and, on a repeat click into the same stack, steps to the next layer
// down instead of re-selecting the top one — wrapping back to the top once every layer
// in the stack has had a turn. A click into a DIFFERENT stack (or empty space) always
// starts fresh from the top. Circle and Straight mode each get their own independent
// cycler via this factory, purely so a coincidental id clash between the two modes'
// otherwise-independent id counters can never make one mode's click cycling jump
// because of something clicked in the other.
function makeLayerClickCycler() {
  let lastKey = "";
  let lastIndex = -1;
  return (clientX, clientY) => {
    const ids = [];
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const g = el.closest("g[data-layer-id]");
      if (!g) continue;
      const id = Number(g.dataset.layerId);
      if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length === 0) {
      lastKey = "";
      lastIndex = -1;
      return null;
    }
    const key = ids.join(",");
    lastIndex = key === lastKey ? (lastIndex + 1) % ids.length : 0;
    lastKey = key;
    return ids[lastIndex];
  };
}

const pickCircleClickLayer = makeLayerClickCycler();

document.getElementById("canvas").addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const id = pickCircleClickLayer(e.clientX, e.clientY);
  if (id != null) selectLayer(id);
});

// --- Artboard zoom (Alt + scroll) ---
// A pure viewing preference, like the preview-fps buttons: not saved with the project and
// not tracked by undo. Requires Alt so an ordinary scroll still scrolls the preview pane,
// which is the far more common thing to want. Each mode keeps its own factor, since the
// two artboards are different shapes and you rarely want them at the same magnification.
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;

let ringZoom = 1;
let tileZoom = 1;

// The one Zoom box in the corner drives whichever mode is on screen, rather than each
// mode carrying its own duplicate control.
function currentZoomTarget() {
  return currentMode === "circle"
    ? { get: () => ringZoom, set: (z) => (ringZoom = z), cssVar: "--ring-zoom", svgId: "canvas", readoutId: "ringOnScreenSize" }
    : { get: () => tileZoom, set: (z) => (tileZoom = z), cssVar: "--tile-zoom", svgId: "tileCanvas", readoutId: "tileOnScreenSize" };
}

// How large an artboard actually is on screen right now — the px figure in the title is
// what it EXPORTS at, which is a different (and much larger) number, so at a glance there
// was no way to tell what size you were really looking at. Read from the rendered box
// rather than computed from the zoom factor, so it stays honest whatever CSS is doing.
function updateOnScreenSizes() {
  for (const [svgId, readoutId] of [["canvas", "ringOnScreenSize"], ["tileCanvas", "tileOnScreenSize"]]) {
    const el = document.getElementById(readoutId);
    const svg = document.getElementById(svgId);
    if (!el || !svg) continue;
    const rect = svg.getBoundingClientRect();
    // A hidden mode measures 0 — leave its last real figure alone rather than showing 0.
    if (rect.width > 0) el.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)} px`;
  }
}

function applyZoom() {
  document.documentElement.style.setProperty("--ring-zoom", String(ringZoom));
  document.documentElement.style.setProperty("--tile-zoom", String(tileZoom));
  const box = document.getElementById("ringZoomNum");
  // Skipped while it's being typed into, same guard and same reason as setFieldValue:
  // stamping the value back on every change would fight the user mid-edit.
  if (box && document.activeElement !== box) box.value = Math.round(currentZoomTarget().get() * 100);
  // The unrolled preview is pinned to the ring's scale, so it has to be resized in the same
  // breath as the ring — otherwise zooming in leaves it behind at its old size.
  syncStraightPreviewToRing();
  updateOnScreenSizes();
}

function setCurrentZoom(percent) {
  const clamped = Math.min(ZOOM_MAX * 100, Math.max(ZOOM_MIN * 100, percent));
  const target = currentZoomTarget();
  // A typed zoom has no cursor to anchor on, so it anchors on the middle of the pane.
  // Unanchored, it used to grow/shrink from the artboard's top edge — harmless while the
  // pane couldn't scroll past the artwork, but with the pasteboard, zooming out from deep
  // inside a big artboard would leave the view staring at empty margin.
  const pane = document.querySelector(".preview").getBoundingClientRect();
  zoomAnchoredAt(document.getElementById(target.svgId), pane.left + pane.width / 2, pane.top + pane.height / 2, () => {
    target.set(clamped / 100);
    applyZoom();
  });
}

// Kept for the Ring editor specifically — some call sites and tests address it by name.
function setRingZoom(percent) {
  ringZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, percent / 100));
  applyZoom();
}

// Runs `apply` (a zoom change) while holding the artwork point under (clientX, clientY)
// still on screen. The point is captured as a fraction of the artboard's size BEFORE
// resizing, then nudged back under the same screen position — measured again afterwards
// rather than predicted, since .preview centres its children and its scroll extent is
// driven by whichever child is widest, not necessarily this one.
//
// Vertically this is exact for any point on the artboard: the pasteboard (see .preview in
// style.css) always leaves enough scroll room on both sides. Horizontally it's still
// best-effort — there's no side pasteboard, so hard against a left/right edge the zoom
// falls back to expanding about the centre.
function zoomAnchoredAt(svg, clientX, clientY, apply) {
  const preview = document.querySelector(".preview");
  const before = svg.getBoundingClientRect();
  // A hidden artboard measures 0: there is nothing on screen to hold still.
  if (!preview || !(before.width > 0)) {
    apply();
    return;
  }
  const relX = (clientX - before.left) / before.width;
  const relY = (clientY - before.top) / before.height;
  apply();
  const after = svg.getBoundingClientRect();
  preview.scrollLeft += after.left + relX * after.width - clientX;
  preview.scrollTop += after.top + relY * after.height - clientY;
}

// Scrolls the showing mode's first artboard to the top of the pane — where it sat before
// the pasteboard existed. Needed on load and on mode switch: scrollTop 0 is now a screen of
// empty margin, and the other mode's scroll offset means nothing for this one's artboards.
function homePreviewScroll() {
  const preview = document.querySelector(".preview");
  const offset = firstArtboardOffset();
  if (!preview || offset === null) return;
  const padTop = parseFloat(getComputedStyle(preview).paddingTop) || 0;
  preview.scrollTop += offset - padTop;
  lastArtboardOffset = firstArtboardOffset();
}

// How far the showing mode's first artboard sits below the top of the pane, or null when
// there's nothing to measure.
function firstArtboardOffset() {
  const preview = document.querySelector(".preview");
  const first = document.querySelector(
    currentMode === "circle" ? "#circleModePreview .artboard-block" : "#straightModePreview .artboard-block"
  );
  if (!preview || !first) return null;
  return first.getBoundingClientRect().top - preview.getBoundingClientRect().top;
}

// The pasteboard is 100vh tall, so resizing the window also resizes the margin ABOVE the
// artboards, which would slide them by the difference. Usually the browser's own scroll
// anchoring (overflow-anchor) already absorbs that, but it can be suppressed — so rather
// than blindly subtracting the size change (which double-corrects whenever anchoring DID
// kick in), remember where the artboards sat after every scroll and, on resize, put them
// back there. Measured, so it's a no-op when there's nothing left to correct. Also noted
// synchronously wherever this code moves the view itself, since scroll events only arrive
// on the next frame.
let lastArtboardOffset = null;
document.querySelector(".preview").addEventListener(
  "scroll",
  () => {
    lastArtboardOffset = firstArtboardOffset();
  },
  { passive: true }
);

function attachAltWheelZoom(svgId, getZoom, setZoom) {
  document.getElementById(svgId).addEventListener(
    "wheel",
    (e) => {
      if (!e.altKey) return;
      e.preventDefault(); // Alt+wheel otherwise triggers browser-level scroll/navigation

      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAnchoredAt(document.getElementById(svgId), e.clientX, e.clientY, () => {
        setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, getZoom() * factor)));
        applyZoom();
      });
    },
    { passive: false }
  );
}

attachAltWheelZoom("canvas", () => ringZoom, (z) => (ringZoom = z));
attachAltWheelZoom("tileCanvas", () => tileZoom, (z) => (tileZoom = z));

{
  const zoomBox = document.getElementById("ringZoomNum");
  // Committed on change/blur rather than on every keystroke: typing "150" would otherwise
  // momentarily apply 1% and then 15%, resizing the artboard twice on the way.
  const commitZoom = () => {
    const v = evaluateNumericExpression(zoomBox.value);
    if (v === null) applyZoom(); // garbage typed — put the real value back
    else setCurrentZoom(v);
  };
  zoomBox.addEventListener("change", commitZoom);
  zoomBox.addEventListener("blur", commitZoom);
  // The base sizes are vh/vw expressions, so the on-screen size changes with the window
  // even when the zoom factor hasn't — which also moves the scale the unrolled preview
  // has to match.
  window.addEventListener("resize", () => {
    const now = firstArtboardOffset();
    if (now !== null && lastArtboardOffset !== null) {
      document.querySelector(".preview").scrollTop += now - lastArtboardOffset;
    }
    // Then the ring itself has changed size (it's vh-based), which resizes the strip —
    // that sync holds the RING still, same as for any other strip resize.
    syncStraightPreviewToRing();
    lastArtboardOffset = firstArtboardOffset();
    updateOnScreenSizes();
  });
  applyZoom();
}

// The unrolled preview is sized to match the Ring editor's CURRENT on-screen scale, rather
// than being fitted to a CSS height of its own. Fitting meant the scale was whatever the
// project happened to need: rings spread over 2000 units got squeezed to nearly 6 units/px,
// a tight set barely 1.5, so identical artwork drew at completely different apparent sizes
// from one project to the next, and the rough brush texture came out a different size again
// from the ring it was unrolled FROM.
//
// Read from the ring's live measured width, not from a constant, because the ring is
// `min(70vh, 70vw) * var(--ring-zoom)` — it moves with both the window and the zoom. A
// constant matched it at 100% zoom only, and the preview visibly fell behind as you zoomed
// in. There is no feedback loop to worry about: the ring sizes off the viewport, never off
// this element, so resizing the preview can't move the thing it is measuring.
//
// Height follows the content at that scale, uncapped on purpose — clamping it would quietly
// reintroduce the fitting this replaced.
function syncStraightPreviewToRing() {
  const svg = document.getElementById("straightCanvas");
  const ring = document.getElementById("canvas");
  if (!svg || !ring) return;
  const ringPx = ring.getBoundingClientRect().width;
  // 0 while Straight mode is showing (Circle mode's preview is display:none, so it has no
  // box to measure). Leave the last good size alone — setMode calls applyZoom on the way
  // back into Circle mode, which re-syncs before anything is visible.
  if (!(ringPx > 0)) return;
  if (!isFinite(straightExportWidth) || !isFinite(straightExportHeight)) return;
  const unitsPerPx = CANVAS_SIZE / ringPx;
  // Sub-pixel, not rounded: at low zoom this strip is only ~50px tall, where losing half a
  // pixel to rounding is a visible ~1% mismatch against the ring it is supposed to match.
  const w = `${(straightExportWidth / unitsPerPx).toFixed(2)}px`;
  const h = `${(straightExportHeight / unitsPerPx).toFixed(2)}px`;
  if (svg.style.width === w && svg.style.height === h) return;

  // This strip sits ABOVE the Ring artboard in the scroll pane, and its size tracks the
  // design (a bigger radius spread makes it taller). So resizing it reflows everything
  // below and the ring slides up or down under the viewport — editing a layer's size or
  // radius appeared to move the camera, even though the scroll offset never changed.
  // Anchor on the ring: note where it sits, resize, then take the shift straight back out
  // of the scroll offset so it stays put on screen. A no-op when the size didn't change,
  // and harmless during zoom — zoomAnchoredAt() measures again afterwards and does its own
  // anchored correction on top. The pasteboard (see .preview in style.css) is what
  // guarantees there's always scroll room to take the shift, even when the whole
  // composition fits on screen.
  const preview = document.querySelector(".preview");
  const before = ring.getBoundingClientRect();
  svg.style.width = w;
  svg.style.height = h;
  if (!preview) return;
  const after = ring.getBoundingClientRect();
  preview.scrollLeft += after.left - before.left;
  // The browser snaps scrollTop to whole pixels, so each correction is off by up to half a
  // pixel — and those errors random-walk: a few dozen edits crept the ring ~1px. Carry the
  // part that didn't land into the next correction so it stays within half a pixel for
  // good. A residual of a pixel or more means the scroll hit an end and was clamped;
  // that isn't rounding, so don't carry it.
  const wanted = preview.scrollTop + (after.top - before.top) + straightSyncScrollCarry;
  preview.scrollTop = wanted;
  const residual = wanted - preview.scrollTop;
  straightSyncScrollCarry = Math.abs(residual) < 1 ? residual : 0;
}

function renderStraight() {
  const svg = document.getElementById("straightCanvas");
  svg.innerHTML = "";
  if (state.layers.length === 0) {
    straightExportWidth = CANVAS_SIZE;
    straightExportHeight = 400;
    svg.setAttribute("viewBox", `0 0 ${straightExportWidth} ${straightExportHeight}`);
    syncStraightPreviewToRing();
    document.getElementById("straightSizeLabel").textContent =
      `${straightExportWidth} × ${straightExportHeight} px`;
    return;
  }

  const radii = state.layers.map((l) => l.radius);
  const minR = Math.min(...radii);
  const maxR = Math.max(...radii);

  const pad = Math.max(50, ...state.layers.map(layerHalfExtent));
  const padX = pad;
  const padY = pad;
  const contentWidth = Math.max(1, Math.ceil(2 * Math.PI * maxR));
  const contentHeight = Math.max(1, Math.ceil(maxR - minR));
  straightExportWidth = contentWidth + padX * 2;
  straightExportHeight = contentHeight + padY * 2;
  svg.setAttribute("viewBox", `0 0 ${straightExportWidth} ${straightExportHeight}`);
  syncStraightPreviewToRing();
  document.getElementById("straightSizeLabel").textContent =
    `${Math.round(straightExportWidth)} × ${Math.round(straightExportHeight)} px`;
  const centerX = straightExportWidth / 2;

  for (const layer of state.layers) {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("opacity", (layer.opacity != null ? layer.opacity : 100) / 100);

    if (layer.visible === false) {
      svg.appendChild(g);
      continue;
    }

    if (layer.type === "ring") {
      const y = radiusToStraightY(layer.radius, maxR, padY);
      const half = Math.PI * layer.radius; // half this ring's own circumference
      if (state.roughness > 0) {
        // Own cache slot ("ringStraight") — drawRing above already roughens this SAME
        // layer for the Ring editor itself, keyed by radius; this is a differently-shaped
        // path (a flat segment, not a circle) for the same layer, so it can't share that
        // cache slot without one overwriting the other every render.
        const passes = getRoughOutlinePasses(
          layer, "ringStraight", `${half}|${y}`,
          () => sampleSegmentPoints(centerX - half, y, centerX + half, y, ROUGH_SAMPLE_SPACING),
          false, state.roughness
        );
        const defId = `rough-ringstraight-${layer.id}`;
        const defs = document.createElementNS(SVG_NS, "defs");
        appendRoughOutlineDef(defs, defId, passes, layer.strokeColor);
        g.appendChild(defs);
        const use = document.createElementNS(SVG_NS, "use");
        use.setAttribute("href", `#${defId}`);
        g.appendChild(use);
      } else {
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", centerX - half);
        line.setAttribute("y1", y);
        line.setAttribute("x2", centerX + half);
        line.setAttribute("y2", y);
        line.setAttribute("stroke", layer.strokeColor);
        line.setAttribute("stroke-width", layer.strokeWidth);
        g.appendChild(line);
      }
    } else if (layer.type === "motif") {
      // Bend has no meaning without curvature, so the straight view always shows the
      // flat artwork even for a bent layer.
      drawMotifFlat(g, layer, distributeStraight(layer, maxR, padY, centerX));
    } else if (layer.type === "line") {
      drawLine(g, layer, distributeStraight(layer, maxR, padY, centerX), state.roughness);
    } else if (layer.type === "shape") {
      drawShape(g, layer, distributeStraight(layer, maxR, padY, centerX), state.roughness);
    }

    svg.appendChild(g);
  }
}

// --- Export ---

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// A random 4-digit tag on every exported file's name — batch-exporting a lot of
// ornaments means a lot of "ornament.png"s otherwise, easy to overwrite or mix up.
function randomFileCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

function withFileCode(filename) {
  const dot = filename.lastIndexOf(".");
  const code = randomFileCode();
  return dot === -1 ? `${filename}_${code}` : `${filename.slice(0, dot)}_${code}${filename.slice(dot)}`;
}

function getExportSvgString(svgId) {
  const svg = document.getElementById(svgId);
  const clone = svg.cloneNode(true);
  clone.querySelectorAll(".editor-only").forEach((el) => el.remove());
  // tileExportCanvas is hidden off-screen via inline style (opacity:0 etc) so it
  // doesn't show in the UI — but that same style would come along on the clone and
  // render the exported file fully transparent, so strip it here.
  clone.removeAttribute("style");
  clone.setAttribute("xmlns", SVG_NS);
  return new XMLSerializer().serializeToString(clone);
}

// A still export must not depend on WHEN you happen to click it. The animation clock
// keeps running in the live preview, so without pinning it a PNG saved mid-animation
// captures wherever the layers had drifted to — two exports of the same design wouldn't
// match, and neither would match the design with animation switched off. Freezing the
// clock at t=0 for the capture makes every still reproducible. `renderFn` is only needed
// for exports that read the LIVE DOM (the ring/straight artboards); Straight mode's tile
// export builds its own detached SVG, so it just needs the clock frozen while it does.
function withFrozenAnimation(capture, renderFn) {
  const previous = animTimeOverride;
  animTimeOverride = 0;
  try {
    if (renderFn) renderFn();
    return capture();
  } finally {
    animTimeOverride = previous;
    if (renderFn) renderFn(); // restore the live, still-animating view
  }
}

function exportSvg(svgId, filename) {
  const svgString = withFrozenAnimation(() => getExportSvgString(svgId), render);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  downloadBlob(blob, withFileCode(filename));
}

function exportPng(svgId, filename, width, height) {
  const svgString = withFrozenAnimation(() => getExportSvgString(svgId), render);
  const svg64 = btoa(unescape(encodeURIComponent(svgString)));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => downloadBlob(blob, withFileCode(filename)), "image/png");
  };
  img.src = "data:image/svg+xml;base64," + svg64;
}

// Byte-level helpers shared by ZIP writing below (crc32/concatBytes) — PNG Sequence is
// the only animated export left, and it's just a zip of ordinary per-frame PNGs, no
// custom binary format of its own to build.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(arrays) {
  const out = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// One rasterized <canvas> per animation frame, from an SVG string snapshot.
function rasterizeSvgToCanvas(svgString, width, height) {
  return new Promise((resolve, reject) => {
    const svg64 = btoa(unescape(encodeURIComponent(svgString)));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Failed to rasterize a frame"));
    img.src = "data:image/svg+xml;base64," + svg64;
  });
}

function canvasToPngBuffer(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("canvas.toBlob returned null"));
      blob.arrayBuffer().then(resolve, reject);
    }, "image/png");
  });
}

// Steps animTimeOverride across exactly one loop, re-rendering and rasterizing a
// <canvas> at each instant. Hands each frame to onFrame as soon as it's ready instead
// of collecting them all first — at 4096px-wide frames, a full loop can be thousands of
// canvases, and holding every one in memory at once (rather than one at a time) was
// enough raw pixel data to exhaust a tab's memory on long/wide exports.
// `shouldContinue` is checked between frames so a long export can be abandoned partway
// (see exportPngSequence's run id). Returns false if it bailed out early, true if it
// rendered every frame.
async function collectAnimationFrames({ getSvgString, outWidth, outHeight, loopDuration, renderFn, frameCount, statusEl, statusPrefix, onFrame, shouldContinue }) {
  for (let i = 0; i < frameCount; i++) {
    if (shouldContinue && !shouldContinue()) return false;
    animTimeOverride = (i / frameCount) * loopDuration;
    renderFn();
    const canvas = await rasterizeSvgToCanvas(getSvgString(), outWidth, outHeight);
    await onFrame(canvas, i);
    if (statusEl) statusEl.textContent = `${statusPrefix} frame ${i + 1}/${frameCount}…`;
  }
  return true;
}

// --- PNG Sequence export (zipped) ---
// The bridge into professional video tools (DaVinci Resolve, Premiere, After Effects):
// they all import "an image sequence" as their native way to bring in a rendered
// animation, expecting one numbered, full-resolution PNG per frame. A browser can't
// write a folder to disk, so a .zip of that same sequence is the standard substitute —
// works identically once extracted.
function u16le(n) {
  return new Uint8Array([n & 255, (n >>> 8) & 255]);
}

function u32le(n) {
  return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
}

// STORE method only (no compression) — simplest to implement correctly, and PNG data
// is already compressed internally, so a second compression pass would barely help.
function buildZip(files) {
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() >> 1) & 0x1f);
  const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0xf) << 5) | (now.getDate() & 0x1f);

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const localHeader = concatBytes([
      u32le(0x04034b50),
      u16le(20), u16le(0), u16le(0),
      u16le(dosTime), u16le(dosDate),
      u32le(crc), u32le(size), u32le(size),
      u16le(nameBytes.length), u16le(0),
      nameBytes,
    ]);
    localParts.push(localHeader, file.data);

    centralParts.push(
      concatBytes([
        u32le(0x02014b50),
        u16le(20), u16le(20), u16le(0), u16le(0),
        u16le(dosTime), u16le(dosDate),
        u32le(crc), u32le(size), u32le(size),
        u16le(nameBytes.length), u16le(0), u16le(0),
        u16le(0), u16le(0), u32le(0),
        u32le(offset),
        nameBytes,
      ])
    );
    offset += localHeader.length + file.data.length;
  }

  const centralDirStart = offset;
  const centralDirBytes = concatBytes(centralParts);
  const eocd = concatBytes([
    u32le(0x06054b50),
    u16le(0), u16le(0),
    u16le(files.length), u16le(files.length),
    u32le(centralDirBytes.length), u32le(centralDirStart),
    u16le(0),
  ]);

  return concatBytes([...localParts, centralDirBytes, eocd]);
}

// Full resolution, no cap — this is the "willing to wait for maximum quality" export,
// so it stays uncapped unlike GIF/APNG. fps is user-adjustable (see smFps) rather than
// fixed, since video-editing timelines and quick web-facing formats want different rates.
// Only the most recent export run matters: starting a new one supersedes whatever was
// still going, so a mis-set duration or tile width doesn't mean waiting out a long render
// before trying again. Every superseded run then has to keep its hands off ALL shared
// state — the frame clock, the status line, the download — because it's still unwinding
// asynchronously WHILE the new run is using them. Getting that wrong would be worse than
// having no cancellation at all: the old run's cleanup would reset animTimeOverride
// mid-flight and silently corrupt the new export's frames.
let pngSequenceRunId = 0;

async function exportPngSequence({ getSvgString, width, height, loopDuration, fps, renderFn, filenamePrefix, statusElId }) {
  const runId = ++pngSequenceRunId;
  const isCurrent = () => runId === pngSequenceRunId;
  const statusEl = statusElId ? document.getElementById(statusElId) : null;
  const frameCount = Math.max(2, Math.round(loopDuration * fps));
  const digits = Math.max(4, String(frameCount).length);
  try {
    const files = [];
    // Each frame is PNG-encoded and its canvas dropped immediately (onFrame doesn't
    // keep a reference), so only one raw canvas is ever alive at a time — see
    // collectAnimationFrames' comment for why that matters at large sizes.
    const completed = await collectAnimationFrames({
      getSvgString, outWidth: width, outHeight: height, loopDuration, renderFn, frameCount, statusEl,
      statusPrefix: "Rendering",
      shouldContinue: isCurrent,
      onFrame: async (canvas, i) => {
        const buf = await canvasToPngBuffer(canvas);
        const num = String(i + 1).padStart(digits, "0");
        files.push({ name: `${filenamePrefix}_${num}.png`, data: new Uint8Array(buf) });
      },
    });
    if (!completed || !isCurrent()) return; // superseded — drop the partial frames silently
    const zipBytes = buildZip(files);
    const zipName = withFileCode(`${filenamePrefix}-frames.zip`);
    downloadBlob(new Blob([zipBytes], { type: "application/zip" }), zipName);
    if (statusEl) statusEl.textContent = `Saved ${zipName} — ${frameCount} frames at ${width}×${height}.`;
  } catch (err) {
    if (!isCurrent()) return; // a superseded run's failure is not worth reporting
    console.error(err);
    if (statusEl) statusEl.textContent = "PNG sequence export failed — see console for details.";
  } finally {
    // Only the run that still owns the clock may reset it; a superseded run doing this
    // would yank animTimeOverride out from under the export that replaced it.
    if (isCurrent()) {
      animTimeOverride = null;
      renderFn();
    }
  }
}

// --- Export layers as separate files (Ring editor only) ---
// No in-app animation export for Circle mode anymore — instead, this hands the artist
// the raw pieces to animate themselves in another program: every non-ring layer comes
// out as its own full-canvas PNG, frozen at its base rotation (animTimeOverride=0, so
// the live visualizer's current spin doesn't get baked in arbitrarily), and every ring
// is flattened into a single combined PNG since a plain circle has no visible rotation
// of its own. All files share the SAME 4096×4096 canvas, so stacking them in another
// program and rotating each around the canvas center reproduces the in-app orbit.
function sanitizeFilePart(str) {
  return str.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "layer";
}

async function exportLayersZip() {
  const statusEl = document.getElementById("layersExportStatus");
  const originalLayers = state.layers;
  const originalOverride = animTimeOverride;

  const ringLayers = originalLayers.filter((l) => l.type === "ring");
  const otherLayers = originalLayers.filter((l) => l.type !== "ring");
  const totalSteps = (ringLayers.length > 0 ? 1 : 0) + otherLayers.length;

  if (totalSteps === 0) {
    if (statusEl) statusEl.textContent = "No layers to export.";
    return;
  }

  animTimeOverride = 0;
  try {
    const files = [];
    const digits = Math.max(2, String(totalSteps).length);
    let step = 0;

    const captureCurrentLayers = async () => {
      render();
      const canvas = await rasterizeSvgToCanvas(getExportSvgString("canvas"), CANVAS_SIZE, CANVAS_SIZE);
      return canvasToPngBuffer(canvas);
    };

    if (ringLayers.length > 0) {
      step++;
      if (statusEl) statusEl.textContent = `Rendering layer ${step}/${totalSteps} (Rings)…`;
      state.layers = ringLayers;
      const buf = await captureCurrentLayers();
      files.push({ name: `${String(step).padStart(digits, "0")}_Rings.png`, data: new Uint8Array(buf) });
    }

    for (const layer of otherLayers) {
      step++;
      const label = layerDisplayName(layer);
      if (statusEl) statusEl.textContent = `Rendering layer ${step}/${totalSteps} (${label})…`;
      state.layers = [layer];
      const buf = await captureCurrentLayers();
      files.push({ name: `${String(step).padStart(digits, "0")}_${sanitizeFilePart(label)}.png`, data: new Uint8Array(buf) });
    }

    const zipBytes = buildZip(files);
    const zipName = withFileCode("ornament-layers.zip");
    downloadBlob(new Blob([zipBytes], { type: "application/zip" }), zipName);
    if (statusEl) {
      statusEl.textContent = `Saved ${zipName} — ${files.length} layer(s) at ${CANVAS_SIZE}×${CANVAS_SIZE}, ready to rotate individually.`;
    }
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = "Layer export failed — see console for details.";
  } finally {
    state.layers = originalLayers;
    animTimeOverride = originalOverride;
    render();
  }
}

// --- Estimated export size ---
// Resolution is fixed once you know the tile size (PNG Sequence stays full resolution),
// so what the loop-duration slider and layer count actually change is frame count and
// per-frame compressibility — that's what makes a size estimate worth calculating
// instead of just quoting a vague number.
//
// Per-frame KB = a per-frame floor (detail that doesn't scale with canvas area) plus a
// rate-per-megapixel, both growing with layer count, then scaled by roughness.
//
// Recalibrated after real exports came in up to 2.3x OVER the old model's stated maximum.
// Two compounding causes, both measured rather than guessed:
//   1. The old fit predated the roughness feature entirely. Roughness adds a great deal
//      of fine edge detail, which is exactly what PNG's DEFLATE pass struggles to
//      compress — measured 1.2-1.7x more bytes at roughness 50 than at 0.
//   2. It had almost no per-frame floor (5-15 KB), so it badly undershot smaller tiles,
//      where detail dominates and area doesn't. Measured KB-per-megapixel is far higher
//      at 800px wide (122-149) than at 4000px (53-89) for the very same design, because
//      widening a tile spreads the same content over more pixels rather than adding
//      proportionally more of it.
// Coefficients below are set so the HIGH track sits above every one of those real
// measurements with headroom, since an estimate a user can exceed is worse than a loose
// one. Still a ballpark — real designs vary continuously.
function estimatePngSequenceRangeMB(fullWidth, fullHeight, loopDuration, fps, layerCount, roughness = 0) {
  const megapixels = (fullWidth * fullHeight) / 1e6;
  const frames = Math.max(2, Math.round(loopDuration * fps));
  const roughFactor = 1 + roughness / 100; // 0 -> 1x, 50 -> 1.5x, 100 -> 2x
  const lowPerFrameKB = (3 + 1.5 * layerCount + (3 + 2 * layerCount) * megapixels) * roughFactor;
  const highPerFrameKB = (10 + 6 * layerCount + (10 + 7 * layerCount) * megapixels) * roughFactor;
  return { lowMB: (lowPerFrameKB * frames) / 1024, highMB: (highPerFrameKB * frames) / 1024 };
}

function formatMB(mb) {
  if (mb < 1) return `${Math.round(mb * 1000)} KB`;
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}

function renderSizeEstimate(elId, fullWidth, fullHeight, loopDuration, fps, layerCount, roughness) {
  const el = document.getElementById(elId);
  if (!el) return;
  const { lowMB, highMB } = estimatePngSequenceRangeMB(fullWidth, fullHeight, loopDuration, fps, layerCount, roughness);
  el.textContent = `≈ ${formatMB(lowMB)}–${formatMB(highMB)} (estimated)`;
}

function updateAllAnimSizeEstimates() {
  renderSizeEstimate("smAnimSizeEstimate", smState.tileWidth, SM_HEIGHT, smState.loopDuration, smState.fps, smState.layers.length, smState.roughness);
}

// Recalculated 1s after the user stops adjusting a loop-duration/fps control, rather
// than on every single tick of the slider — it's cheap arithmetic either way, but
// debouncing keeps it from visibly flickering mid-drag.
let animSizeEstimateTimer = null;
function scheduleAnimSizeEstimateUpdate() {
  clearTimeout(animSizeEstimateTimer);
  animSizeEstimateTimer = setTimeout(updateAllAnimSizeEstimates, 1000);
}

// smLoopDuration didn't have this wiring at all yet — the control existed but changing
// it never actually touched smState.loopDuration. Mirrors loopDurationInput above.
function smLoopDurationInput(e) {
  if (!smHistoryGestureOpen) {
    smHistoryGestureOpen = true;
    smPushHistory();
  }
  smState.loopDuration = Math.max(0.5, Number(e.target.value));
  smSetFieldValue("smLoopDuration", smState.loopDuration);
  smRender();
  scheduleAnimSizeEstimateUpdate();
}
document.getElementById("smLoopDuration").addEventListener("input", smLoopDurationInput);
document.getElementById("smLoopDuration").addEventListener("change", () => (smHistoryGestureOpen = false));
document.getElementById("smLoopDurationNum").addEventListener("input", smLoopDurationInput);
document.getElementById("smLoopDurationNum").addEventListener("change", () => (smHistoryGestureOpen = false));

// Mirrors smLoopDurationInput — fps doesn't affect the live preview (only export), so
// no smRender() call, just the size estimate (frame count scales directly with fps).
function smFpsInput(e) {
  if (!smHistoryGestureOpen) {
    smHistoryGestureOpen = true;
    smPushHistory();
  }
  smState.fps = Math.min(60, Math.max(1, Number(e.target.value)));
  smSetFieldValue("smFps", smState.fps);
  scheduleAnimSizeEstimateUpdate();
}
document.getElementById("smFps").addEventListener("input", smFpsInput);
document.getElementById("smFps").addEventListener("change", () => (smHistoryGestureOpen = false));
document.getElementById("smFpsNum").addEventListener("input", smFpsInput);
document.getElementById("smFpsNum").addEventListener("change", () => (smHistoryGestureOpen = false));

document.getElementById("exportSvgBtn").addEventListener("click", () => exportSvg("canvas", "ornament.svg"));
document.getElementById("exportPngBtn").addEventListener("click", () =>
  exportPng("canvas", "ornament.png", CANVAS_SIZE, CANVAS_SIZE)
);
document.getElementById("exportStraightSvgBtn").addEventListener("click", () =>
  exportSvg("straightCanvas", "ornament-straight.svg")
);
// A large ring's unrolled circumference can run into five figures of pixels wide —
// capped on the longer side so the PNG stays a sane file size. SVG stays uncapped since
// it's vector; there's no pixel count to cap.
const STRAIGHT_PREVIEW_MAX_DIMENSION = 12812;
document.getElementById("exportStraightPngBtn").addEventListener("click", () => {
  const scale = Math.min(1, STRAIGHT_PREVIEW_MAX_DIMENSION / Math.max(straightExportWidth, straightExportHeight));
  const width = Math.max(1, Math.round(straightExportWidth * scale));
  const height = Math.max(1, Math.round(straightExportHeight * scale));
  exportPng("straightCanvas", "ornament-straight.png", width, height);
});
document.getElementById("exportLayersBtn").addEventListener("click", exportLayersZip);

// ============================================================
// STRAIGHT MODE — a seamless repeating tile, independent of the circular ring editor
// above (different project, same workflow). Items repeat evenly across a straight,
// adjustable-width tile instead of around a circle. The preview always renders three
// copies of the tile side by side so seams are visible immediately; only the center
// copy is what actually exports. There's no analog of followRing/bend here (nothing
// curves), so items just use layer.rotation directly.
// ============================================================

const SM_HEIGHT = 1000;
const SM_CENTER_Y = SM_HEIGHT / 2;

const smState = {
  tileWidth: 800,
  layers: [],
  activeLayerId: null,
  loopDuration: 6,
  fps: 24,
  mask: createDefaultMask(),
  roughness: 50,
};
let smNextLayerId = 1;

function smCreateGuideLayer(name) {
  return { id: smNextLayerId++, type: "guide", name, position: 0, visible: true, strokeWidth: 5, strokeColor: "#e0e0e0" };
}

function smCreateMotifLayer(name) {
  return {
    id: smNextLayerId++,
    type: "motif",
    name,
    position: 0,
    visible: true,
    imageDataUrl: null,
    imageName: null,
    imageEl: null,
    naturalWidth: 0,
    naturalHeight: 0,
    size: 300,
    count: 4,
    startOffset: 0,
    rotation: 0,
    flip: false,
    flipHorizontal: false,
    alternateFlip: false,
    animSpeed: 0,
  };
}

function smCreateLineLayer(name) {
  return {
    id: smNextLayerId++,
    type: "line",
    name,
    position: 0,
    visible: true,
    count: 6,
    startOffset: 0,
    rotation: 0,
    strokeWidth: 5,
    strokeColor: "#e0e0e0",
    length: 200,
    animSpeed: 0,
  };
}

function smCreateShapeLayer(name) {
  return {
    id: smNextLayerId++,
    type: "shape",
    name,
    position: 0,
    visible: true,
    shapeKind: "circle",
    size: 50,
    sizeY: 50,
    lockRatio: true,
    fillColor: "#e0e0e0",
    fillOpacity: 0,
    strokeWidth: 5,
    strokeColor: "#e0e0e0",
    count: 4,
    startOffset: 0,
    rotation: 0,
    animSpeed: 0,
    flip: false,
    flipHorizontal: false,
    alternateFlip: false,
    flipOffset: 0,
  };
}

function smGetActiveLayer() {
  return smState.layers.find((l) => l.id === smState.activeLayerId) || null;
}

// Same reasoning as convertLayerType (circle mode) — Guide is missing
// count/startOffset/rotation, same as Ring there, and falls out of the loop the same way.
function smConvertLayerType(layer, newType) {
  const factories = { guide: smCreateGuideLayer, motif: smCreateMotifLayer, line: smCreateLineLayer, shape: smCreateShapeLayer };
  const fresh = factories[newType](layer.name);
  fresh.id = layer.id;
  for (const key of ["position", "count", "startOffset", "rotation", "animSpeed", "visible", "flip", "flipHorizontal", "alternateFlip", "flipOffset"]) {
    if (key in fresh && key in layer) fresh[key] = layer[key];
  }
  if (layer.opacity != null) fresh.opacity = layer.opacity;
  return fresh;
}

// --- History (undo) — mirrors the circular mode's, operating on smState ---

const smHistoryStack = [];
const smRedoStack = [];
let smHistoryGestureOpen = false;

function smPushHistory() {
  smHistoryStack.push({
    layers: snapshotLayers(smState.layers),
    activeLayerId: smState.activeLayerId,
    tileWidth: smState.tileWidth,
    loopDuration: smState.loopDuration,
    fps: smState.fps,
    mask: JSON.parse(JSON.stringify(smState.mask)),
    roughness: smState.roughness,
  });
  if (smHistoryStack.length > HISTORY_LIMIT) smHistoryStack.shift();
  smRedoStack.length = 0; // a fresh change invalidates whatever redo branch existed
}

function smUndo() {
  if (smHistoryStack.length === 0) return;
  smRedoStack.push({
    layers: snapshotLayers(smState.layers),
    activeLayerId: smState.activeLayerId,
    tileWidth: smState.tileWidth,
    loopDuration: smState.loopDuration,
    fps: smState.fps,
    mask: JSON.parse(JSON.stringify(smState.mask)),
    roughness: smState.roughness,
  });
  const snap = smHistoryStack.pop();
  smState.layers = snap.layers;
  smState.activeLayerId = snap.activeLayerId;
  smState.tileWidth = snap.tileWidth;
  smState.loopDuration = snap.loopDuration ?? smState.loopDuration;
  smState.fps = snap.fps ?? smState.fps;
  smState.mask = snap.mask;
  smState.roughness = snap.roughness ?? smState.roughness;
  smSetFieldValue("smTileWidth", smState.tileWidth);
  smSetFieldValue("smLoopDuration", smState.loopDuration);
  smSetFieldValue("smFps", smState.fps);
  smSetFieldValue("smRoughness", smState.roughness);
  reloadMissingImages(smState.layers, smRender);
  smRenderLayerList();
  smRefreshControls();
  smRefreshMaskControls();
  smRender();
  ensureAnimationRunning(); // same reasoning as undo() in circle mode
}

function smRedo() {
  if (smRedoStack.length === 0) return;
  smHistoryStack.push({
    layers: snapshotLayers(smState.layers),
    activeLayerId: smState.activeLayerId,
    tileWidth: smState.tileWidth,
    loopDuration: smState.loopDuration,
    fps: smState.fps,
    mask: JSON.parse(JSON.stringify(smState.mask)),
    roughness: smState.roughness,
  });
  const snap = smRedoStack.pop();
  smState.layers = snap.layers;
  smState.activeLayerId = snap.activeLayerId;
  smState.tileWidth = snap.tileWidth;
  smState.loopDuration = snap.loopDuration ?? smState.loopDuration;
  smState.fps = snap.fps ?? smState.fps;
  smState.mask = snap.mask;
  smState.roughness = snap.roughness ?? smState.roughness;
  smSetFieldValue("smTileWidth", smState.tileWidth);
  smSetFieldValue("smLoopDuration", smState.loopDuration);
  smSetFieldValue("smFps", smState.fps);
  smSetFieldValue("smRoughness", smState.roughness);
  reloadMissingImages(smState.layers, smRender);
  smRenderLayerList();
  smRefreshControls();
  smRefreshMaskControls();
  smRender();
  ensureAnimationRunning(); // same reasoning as undo() in circle mode
}

// --- Layer management (mirrors the circular mode's, operating on smState) ---

function smAddGuideLayer() {
  smPushHistory();
  const layer = smCreateGuideLayer(`Guide ${smNextLayerId}`);
  smState.layers.push(layer);
  smState.activeLayerId = layer.id;
  smRenderLayerList();
  smRefreshControls();
  smRender();
}

function smAddMotifLayer() {
  smPushHistory();
  const layer = smCreateMotifLayer(`Asset ${smNextLayerId}`);
  smState.layers.push(layer);
  smState.activeLayerId = layer.id;
  smRenderLayerList();
  smRefreshControls();
  smRender();
}

function smAddLineLayer() {
  smPushHistory();
  const layer = smCreateLineLayer(`Line ${smNextLayerId}`);
  smState.layers.push(layer);
  smState.activeLayerId = layer.id;
  smRenderLayerList();
  smRefreshControls();
  smRender();
}

function smAddShapeLayer() {
  smPushHistory();
  const layer = smCreateShapeLayer(`Shape ${smNextLayerId}`);
  smState.layers.push(layer);
  smState.activeLayerId = layer.id;
  smRenderLayerList();
  smRefreshControls();
  smRender();
}

function smDuplicateLayer() {
  const active = smGetActiveLayer();
  if (!active) return;
  smPushHistory();
  const clone = JSON.parse(JSON.stringify(active));
  clone.id = smNextLayerId++;
  clone.name = active.name + " copy";
  clone.imageEl = active.imageEl; // JSON clone can't carry the loaded Image object
  const idx = smState.layers.findIndex((l) => l.id === active.id);
  smState.layers.splice(idx + 1, 0, clone);
  smState.activeLayerId = clone.id;
  smRenderLayerList();
  smRefreshControls();
  smRender();
}

function smRemoveLayer() {
  const active = smGetActiveLayer();
  if (!active) return;
  smPushHistory();
  const idx = smState.layers.findIndex((l) => l.id === active.id);
  smState.layers.splice(idx, 1);
  const next = smState.layers[idx] || smState.layers[idx - 1] || null;
  smState.activeLayerId = next ? next.id : null;
  smRenderLayerList();
  smRefreshControls();
  smRender();
}

function smClearLayers() {
  if (smState.layers.length === 0) return;
  smPushHistory();
  smState.layers = [];
  smState.activeLayerId = null;
  smRenderLayerList();
  smRefreshControls();
  smRender();
}

// -4..4 tile-widths per loop — Guide excluded, same reasoning as Ring in Circle mode.
function smRandomizeAnimSpeeds() {
  const targets = smState.layers.filter((l) => l.type !== "guide");
  if (targets.length === 0) return;
  smPushHistory();
  for (const l of targets) l.animSpeed = Math.floor(Math.random() * 9) - 4;
  smRefreshControls();
  smRender();
  ensureAnimationRunning();
}

// Same reasoning as zeroAnimSpeeds (circle mode).
function smZeroAnimSpeeds() {
  const targets = smState.layers.filter((l) => l.type !== "guide");
  if (targets.length === 0) return;
  smPushHistory();
  for (const l of targets) l.animSpeed = 0;
  smRefreshControls();
  smRender();
}

function smMoveLayer(direction) {
  const active = smGetActiveLayer();
  if (!active) return;
  const idx = smState.layers.findIndex((l) => l.id === active.id);
  const targetIdx = direction === "up" ? idx + 1 : idx - 1;
  if (targetIdx < 0 || targetIdx >= smState.layers.length) return;
  smPushHistory();
  [smState.layers[idx], smState.layers[targetIdx]] = [smState.layers[targetIdx], smState.layers[idx]];
  smRenderLayerList();
  smRender();
}

function smGetSelectedLayers() {
  return getSelectedLayersFrom(smState);
}

function smSelectLayer(id, opts = {}) {
  resolveSelection(smState, id, opts);
  smUpdateLayerListSelection();
  smRefreshControls();
  smRender();
}

let smEditingLayerId = null;

function smStartRename(id) {
  smEditingLayerId = id;
  smRenderLayerList();
}

function smCommitRename(id, newName) {
  const layer = smState.layers.find((l) => l.id === id);
  if (layer && newName && newName.trim() && newName.trim() !== layer.name) {
    smPushHistory();
    layer.name = newName.trim();
  }
  smEditingLayerId = null;
  smRenderLayerList();
}

function smLayerTypeLabel(layer) {
  const raw = layer.type === "shape" ? layer.shapeKind : layer.type;
  return (TYPE_DISPLAY_NAMES[raw] || raw).replace(/([A-Z])/g, " $1").toLowerCase();
}

function smLayerDisplayName(layer) {
  if (layer.type === "motif" && layer.imageName) {
    return `${layer.name} (${layer.imageName})`;
  }
  return layer.name;
}

function smRenderLayerList() {
  const list = document.getElementById("smLayerList");
  list.innerHTML = "";
  for (let i = smState.layers.length - 1; i >= 0; i--) {
    const layer = smState.layers[i];
    const item = document.createElement("div");
    item.className = "layer-item";
    item.dataset.layerId = layer.id;

    if (layer.id === smEditingLayerId) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "layer-name-input";
      input.value = layer.name;
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
        else if (e.key === "Escape") {
          smEditingLayerId = null;
          smRenderLayerList();
        }
      });
      input.addEventListener("blur", () => smCommitRename(layer.id, input.value));
      item.appendChild(input);
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    } else {
      const visible = layer.visible !== false;
      item.innerHTML = `<div class="layer-item-main"><button type="button" class="layer-visibility-btn" title="${visible ? "Hide layer" : "Show layer"}" aria-label="${visible ? "Hide layer" : "Show layer"}">${eyeIconSvg(visible)}</button><span>${escapeHtml(smLayerDisplayName(layer))}</span></div><span class="layer-meta">${smLayerTypeLabel(layer)}</span>`;
      item.querySelector(".layer-visibility-btn").classList.toggle("is-hidden", !visible);
      item.querySelector(".layer-visibility-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        smToggleLayerVisible(layer);
      });
      item.addEventListener("click", (e) => smSelectLayer(layer.id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey }));
      item.addEventListener("dblclick", () => smStartRename(layer.id));
    }

    list.appendChild(item);
  }
  smUpdateLayerListSelection();
}

function smToggleLayerVisible(layer) {
  smPushHistory();
  layer.visible = layer.visible === false ? true : false;
  smRenderLayerList();
  smRender();
}

function smUpdateLayerListSelection() {
  const selected = new Set(smGetSelectedLayers().map((l) => l.id));
  document.querySelectorAll("#smLayerList .layer-item").forEach((el) => {
    const id = Number(el.dataset.layerId);
    el.classList.toggle("active", id === smState.activeLayerId);
    el.classList.toggle("multi-selected", selected.has(id) && id !== smState.activeLayerId);
  });
}

function smUpdateLayerListMeta() {
  document.querySelectorAll("#smLayerList .layer-item").forEach((el) => {
    const layer = smState.layers.find((l) => l.id === Number(el.dataset.layerId));
    const meta = el.querySelector(".layer-meta");
    if (layer && meta) meta.textContent = smLayerTypeLabel(layer);
  });
}

// --- Distribution ---

function smLayerOffsets(layer) {
  const offsets = [];
  const n = Math.floor(layer.count);
  if (n < 1) return offsets;
  const step = smState.tileWidth / n;
  const spinPx = (layer.animSpeed || 0) * animPhasePx(smState.loopDuration, smState.tileWidth);
  for (let i = 0; i < n; i++) {
    let x = (layer.startOffset + i * step + spinPx) % smState.tileWidth;
    if (x < 0) x += smState.tileWidth;
    offsets.push(x);
  }
  return offsets;
}

// Items across THREE tiles (left clone, center tile, right clone) so the preview
// always shows how the pattern connects to itself.
function smDistribute(layer) {
  const y = SM_CENTER_Y + layer.position;
  const items = [];
  smLayerOffsets(layer).forEach((localX, index) => {
    for (let tileIndex = 0; tileIndex < 3; tileIndex++) {
      items.push({ x: localX + tileIndex * smState.tileWidth, y, rotation: layer.rotation, index });
    }
  });
  return items;
}

// Same idea as smDistribute, but centered on ONE tile (copies at tileIndex -1/0/+1
// instead of 0/1/2) so it can be clipped to an exactly-tileWidth-wide canvas: an item
// straddling the right edge draws its wrapped copy one tile to the left too, and the
// sliver of THAT copy that falls inside [0, tileWidth) is exactly the piece that should
// reappear at the left edge when the tile repeats. This is what the export uses instead
// of smDistribute, so the file is truly tileWidth × SM_HEIGHT — not 3 tiles wide — while
// still showing edge-straddling shapes whole (split correctly across both edges).
function smDistributeWrapped(layer) {
  const y = SM_CENTER_Y + layer.position;
  const items = [];
  smLayerOffsets(layer).forEach((localX, index) => {
    for (const tileIndex of [-1, 0, 1]) {
      items.push({ x: localX + tileIndex * smState.tileWidth, y, rotation: layer.rotation, index });
    }
  });
  return items;
}

// --- Rendering ---

function smDrawGuide(g, layer, width, roughness, roughScale = ROUGH_SCALE_TILE) {
  const y = SM_CENTER_Y + layer.position;
  if (roughness > 0) {
    // width varies between the live preview (3 tiles wide) and single-tile export, so
    // it's part of the cache key — same reasoning as drawRing keying on radius.
    const passes = getRoughOutlinePasses(
      layer, "guide", `${width}|${y}`,
      () => sampleSegmentPoints(0, y, width, y, roughSampleSpacing(roughScale)),
      false, roughness, roughScale
    );
    const defId = `rough-guide-${layer.id}`;
    const defs = document.createElementNS(SVG_NS, "defs");
    appendRoughOutlineDef(defs, defId, passes, layer.strokeColor);
    g.appendChild(defs);
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `#${defId}`);
    g.appendChild(use);
    return;
  }
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", 0);
  line.setAttribute("y1", y);
  line.setAttribute("x2", width);
  line.setAttribute("y2", y);
  line.setAttribute("stroke", layer.strokeColor);
  line.setAttribute("stroke-width", layer.strokeWidth);
  g.appendChild(line);
}

function smRenderInto(svg, width, itemsFor) {
  svg.innerHTML = "";
  // Everything actual-artwork goes into one wrapper so the global mask (if any) can
  // apply once to the whole composition — callers (smRender's live preview, the
  // single-tile export path) both append their own editor-only extras (seam guides, the
  // position indicator) straight onto `svg` AFTER this call returns, so they naturally
  // land outside the masked content without this function knowing about them.
  const content = document.createElementNS(SVG_NS, "g");
  for (const layer of smState.layers) {
    const g = document.createElementNS(SVG_NS, "g");
    g.dataset.layerId = layer.id;
    g.classList.add("layer-hit");
    g.setAttribute("opacity", (layer.opacity != null ? layer.opacity : 100) / 100);
    if (layer.visible === false) {
      content.appendChild(g);
      continue;
    }
    // ROUGH_SCALE_TILE, not the Ring editor's default: the Straight artboard shows its
    // 1000 units in 640px, ~3x more magnified than the Ring editor, so the brush texture
    // has to be authored ~3x smaller in units to land at the same size on screen.
    if (layer.type === "guide") {
      smDrawGuide(g, layer, width, smState.roughness, ROUGH_SCALE_TILE);
    } else if (layer.type === "motif") {
      drawMotifFlat(g, layer, itemsFor(layer));
    } else if (layer.type === "line") {
      drawLine(g, layer, itemsFor(layer), smState.roughness, ROUGH_SCALE_TILE);
    } else if (layer.type === "shape") {
      drawShape(g, layer, itemsFor(layer), smState.roughness, ROUGH_SCALE_TILE);
    }
    content.appendChild(g);
  }
  applyGlobalMask(content, smState.mask, width, SM_HEIGHT, "straight");
  svg.appendChild(content);
}

function smRender() {
  const w = smState.tileWidth;

  const previewSvg = document.getElementById("tileCanvas");
  previewSvg.setAttribute("viewBox", `0 0 ${w * 3} ${SM_HEIGHT}`);
  smRenderInto(previewSvg, w * 3, (layer) => smDistribute(layer));
  document.getElementById("tileSizeLabel").textContent = `${w} × ${SM_HEIGHT} px`;

  // Seam markers at the tile boundaries, and a position indicator for the active
  // layer — both editor-only, stripped out on export.
  const addGuideLine = (x, dash) => {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", 0);
    line.setAttribute("x2", x);
    line.setAttribute("y2", SM_HEIGHT);
    line.setAttribute("class", "editor-only");
    line.setAttribute("stroke", "#4f8cff");
    line.setAttribute("stroke-width", 3);
    line.setAttribute("stroke-dasharray", dash);
    line.setAttribute("pointer-events", "none");
    previewSvg.appendChild(line);
  };
  addGuideLine(w, "18 12");
  addGuideLine(w * 2, "18 12");

  const active = smGetActiveLayer();
  if (active && active.position != null) {
    const y = SM_CENTER_Y + active.position;
    const indicator = document.createElementNS(SVG_NS, "line");
    indicator.setAttribute("x1", 0);
    indicator.setAttribute("y1", y);
    indicator.setAttribute("x2", w * 3);
    indicator.setAttribute("y2", y);
    indicator.setAttribute("class", "editor-only");
    indicator.setAttribute("stroke", "#4f8cff");
    indicator.setAttribute("stroke-width", 3);
    indicator.setAttribute("stroke-dasharray", "10 8");
    indicator.setAttribute("pointer-events", "none");
    previewSvg.appendChild(indicator);
  }
}

// Delegated once, same reasoning (pointerdown-not-click fix, and cycling through
// overlapping layers on repeat clicks) as the ring editor's canvas listener above —
// its own independent cycler, see makeLayerClickCycler.
const pickStraightClickLayer = makeLayerClickCycler();

document.getElementById("tileCanvas").addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const id = pickStraightClickLayer(e.clientX, e.clientY);
  if (id != null) smSelectLayer(id);
});

// --- Controls ---

// Same activeElement guard as setFieldValue above, and for the same reason.
function smSetFieldValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
  const numEl = document.getElementById(id + "Num");
  if (numEl && document.activeElement !== numEl) numEl.value = value;
}

function smRefreshControls() {
  const active = smGetActiveLayer();
  const guidePanel = document.getElementById("smGuidePanel");
  const motifPanel = document.getElementById("smMotifPanel");
  const linePanel = document.getElementById("smLinePanel");
  const shapePanel = document.getElementById("smShapePanel");
  const panels = [guidePanel, motifPanel, linePanel, shapePanel];

  document.getElementById("smLayerOpacityField").classList.toggle("disabled", !active);
  smSetFieldValue("smLayerOpacity", active ? (active.opacity != null ? active.opacity : 100) : 100);

  // Same reasoning as circle mode's layerTypeSelect.
  const typeField = document.getElementById("smLayerTypeField");
  const typeSelect = document.getElementById("smLayerTypeSelect");
  const canChangeType = active && CONVERTIBLE_TYPES.includes(active.type);
  typeField.classList.toggle("disabled", !canChangeType);
  typeSelect.value = canChangeType ? active.type : "motif";

  const canAnimate = active && active.type !== "guide";
  document.getElementById("smLayerAnimSpeedField").classList.toggle("disabled", !canAnimate);
  smSetFieldValue("smLayerAnimSpeed", canAnimate ? active.animSpeed || 0 : 0);

  if (!active) {
    panels.forEach((p) => p.classList.add("disabled", "hidden"));
    return;
  }

  panels.forEach((p) => p.classList.remove("disabled"));
  guidePanel.classList.toggle("hidden", active.type !== "guide");
  motifPanel.classList.toggle("hidden", active.type !== "motif");
  linePanel.classList.toggle("hidden", active.type !== "line");
  shapePanel.classList.toggle("hidden", active.type !== "shape");

  if (active.type === "guide") {
    smSetFieldValue("smGuidePosition", active.position);
    smSetFieldValue("smGuideStrokeWidth", active.strokeWidth);
    document.getElementById("smGuideStrokeColor").value = active.strokeColor;
  } else if (active.type === "motif") {
    const hasImage = !!active.imageDataUrl;
    document.getElementById("smMotifNoImageHint").style.display = hasImage ? "none" : "";
    document.getElementById("smMotifPreviewWrap").style.display = hasImage ? "" : "none";
    if (hasImage) {
      document.getElementById("smMotifPreviewImg").src = active.imageDataUrl;
      document.getElementById("smMotifFileName").textContent = active.imageName || "Image loaded";
    }
    smSetFieldValue("smMotifPosition", active.position);
    smSetFieldValue("smMotifSize", active.size);
    smSetFieldValue("smMotifCount", active.count);
    smSetFieldValue("smMotifStartOffset", active.startOffset);
    smSetFieldValue("smMotifRotation", active.rotation);
    document.getElementById("smMotifFlip").checked = active.flip;
    document.getElementById("smMotifFlipHorizontal").checked = active.flipHorizontal;
    document.getElementById("smMotifAlternateFlip").checked = active.alternateFlip;
  } else if (active.type === "line") {
    smSetFieldValue("smLinePosition", active.position);
    smSetFieldValue("smLineLength", active.length);
    smSetFieldValue("smLineStrokeWidth", active.strokeWidth);
    document.getElementById("smLineStrokeColor").value = active.strokeColor;
    smSetFieldValue("smLineCount", active.count);
    smSetFieldValue("smLineStartOffset", active.startOffset);
    smSetFieldValue("smLineRotation", active.rotation);
  } else if (active.type === "shape") {
    document.getElementById("smShapeKind").value = active.shapeKind;
    smSetFieldValue("smShapePosition", active.position);
    smSetFieldValue("smShapeSize", active.size);
    smSetFieldValue("smShapeSizeY", active.sizeY != null ? active.sizeY : active.size);
    {
      const locked = active.lockRatio !== false;
      const btn = document.getElementById("smShapeLockRatio");
      btn.innerHTML = lockRatioIconSvg(locked);
      btn.classList.toggle("locked", locked);
      btn.setAttribute("aria-pressed", String(locked));
    }
    document.getElementById("smShapeFillColor").value = active.fillColor;
    smSetFieldValue("smShapeFillOpacity", active.fillOpacity);
    smSetFieldValue("smShapeStrokeWidth", active.strokeWidth);
    document.getElementById("smShapeStrokeColor").value = active.strokeColor;
    smSetFieldValue("smShapeCount", active.count);
    smSetFieldValue("smShapeStartOffset", active.startOffset);
    smSetFieldValue("smShapeRotation", active.rotation);
    document.getElementById("smShapeFlip").checked = !!active.flip;
    document.getElementById("smShapeFlipHorizontal").checked = !!active.flipHorizontal;
    document.getElementById("smShapeAlternateFlip").checked = !!active.alternateFlip;
    smSetFieldValue("smShapeFlipOffset", active.flipOffset || 0);
  }

  markMixedFields(smGetSelectedLayers()); // same reasoning as circle mode's refreshControls
  smUpdateLayerListMeta();
}

function smBindControl(id, apply) {
  const el = document.getElementById(id);
  const numEl = document.getElementById(id + "Num");

  const handle = (source) => {
    if (source === el && numEl) numEl.value = el.value;
    if (source === numEl) {
      // Same guard as bindControl (circle mode) — a mid-typed expression or an emptied
      // box isn't a real value yet.
      if (numEl.value.trim() === "" || !Number.isFinite(Number(numEl.value))) return;
      el.value = numEl.value;
    }
    const active = smGetActiveLayer();
    if (!active) return;
    if (!smHistoryGestureOpen) {
      smHistoryGestureOpen = true;
      smPushHistory();
    }
    // Same reasoning as bindControl (circle mode) — read from `source`, not always
    // `el`, so a typed off-step value doesn't get silently rounded away by the range
    // slider's own step-snapping the moment it's mirrored there.
    for (const target of smGetSelectedLayers()) apply(target, source); // same reasoning as bindControl
    smRefreshControls();
    smRender();
  };
  const endGesture = () => {
    smHistoryGestureOpen = false;
    lockedRatioForGesture = null; // same reasoning as bindControl's endGesture
  };

  el.addEventListener("input", () => handle(el));
  el.addEventListener("change", endGesture);
  if (numEl) {
    numEl.addEventListener("input", () => handle(numEl));
    numEl.addEventListener("change", endGesture);
  }
}

smBindControl("smLayerOpacity", (l, el) => (l.opacity = Number(el.value)));
smBindControl("smLayerAnimSpeed", (l, el) => {
  l.animSpeed = Number(el.value);
  ensureAnimationRunning();
});

smBindControl("smGuidePosition", (l, el) => (l.position = Number(el.value)));
smBindControl("smGuideStrokeWidth", (l, el) => (l.strokeWidth = Number(el.value)));
smBindControl("smGuideStrokeColor", (l, el) => (l.strokeColor = el.value));

smBindControl("smMotifPosition", (l, el) => (l.position = Number(el.value)));
smBindControl("smMotifSize", (l, el) => (l.size = Number(el.value)));
smBindControl("smMotifCount", (l, el) => (l.count = Number(el.value)));
smBindControl("smMotifStartOffset", (l, el) => (l.startOffset = Number(el.value)));
smBindControl("smMotifRotation", (l, el) => (l.rotation = Number(el.value)));
smBindControl("smMotifFlip", (l, el) => (l.flip = el.checked));
smBindControl("smMotifFlipHorizontal", (l, el) => (l.flipHorizontal = el.checked));
smBindControl("smMotifAlternateFlip", (l, el) => (l.alternateFlip = el.checked));

smBindControl("smLinePosition", (l, el) => (l.position = Number(el.value)));
smBindControl("smLineLength", (l, el) => (l.length = Number(el.value)));
smBindControl("smLineStrokeWidth", (l, el) => (l.strokeWidth = Number(el.value)));
smBindControl("smLineStrokeColor", (l, el) => (l.strokeColor = el.value));
smBindControl("smLineCount", (l, el) => (l.count = Number(el.value)));
smBindControl("smLineStartOffset", (l, el) => (l.startOffset = Number(el.value)));
smBindControl("smLineRotation", (l, el) => (l.rotation = Number(el.value)));

smBindControl("smShapeKind", (l, el) => {
  const kind = el.value;
  if (l.lockRatio !== false) {
    const curSizeY = l.sizeY != null ? l.sizeY : l.size;
    if (kind === "halfCircle" && l.shapeKind !== "halfCircle") {
      l.sizeY = Math.round(curSizeY / 2);
    } else if (kind !== "halfCircle" && l.shapeKind === "halfCircle") {
      l.sizeY = Math.round(curSizeY * 2);
    }
  }
  l.shapeKind = kind;
});
smBindControl("smShapePosition", (l, el) => (l.position = Number(el.value)));
smBindControl("smShapeSize", (l, el) => {
  const newSize = Number(el.value);
  if (l.lockRatio !== false) l.sizeY = Math.round(newSize * shapeLockedRatio(l));
  l.size = newSize;
});
smBindControl("smShapeSizeY", (l, el) => {
  const newSizeY = Number(el.value);
  if (l.lockRatio !== false) {
    const ratio = shapeLockedRatio(l);
    if (ratio > 0) l.size = Math.round(newSizeY / ratio);
  }
  l.sizeY = newSizeY;
});
document.getElementById("smShapeLockRatio").addEventListener("click", () => {
  const active = smGetActiveLayer();
  if (!active) return;
  smPushHistory();
  active.lockRatio = active.lockRatio === false;
  lockedRatioForGesture = null; // re-lock to whatever proportions it has right now
  smRefreshControls();
});
smBindControl("smShapeFillColor", (l, el) => (l.fillColor = el.value));
smBindControl("smShapeFillOpacity", (l, el) => (l.fillOpacity = Number(el.value)));
smBindControl("smShapeStrokeWidth", (l, el) => (l.strokeWidth = Number(el.value)));
smBindControl("smShapeStrokeColor", (l, el) => (l.strokeColor = el.value));
smBindControl("smShapeCount", (l, el) => (l.count = Number(el.value)));
smBindControl("smShapeStartOffset", (l, el) => (l.startOffset = Number(el.value)));
smBindControl("smShapeRotation", (l, el) => (l.rotation = Number(el.value)));
smBindControl("smShapeFlip", (l, el) => (l.flip = el.checked));
smBindControl("smShapeFlipHorizontal", (l, el) => (l.flipHorizontal = el.checked));
smBindControl("smShapeAlternateFlip", (l, el) => (l.alternateFlip = el.checked));
smBindControl("smShapeFlipOffset", (l, el) => (l.flipOffset = Number(el.value)));

function smHandleTileWidthChange(value) {
  smState.tileWidth = Math.min(4096, Math.max(100, Number(value)));
  smSetFieldValue("smTileWidth", smState.tileWidth);
  smRender();
  scheduleAnimSizeEstimateUpdate();
}
function smTileWidthInput(e) {
  if (!smHistoryGestureOpen) {
    smHistoryGestureOpen = true;
    smPushHistory();
  }
  smHandleTileWidthChange(e.target.value);
}
document.getElementById("smTileWidth").addEventListener("input", smTileWidthInput);
document.getElementById("smTileWidth").addEventListener("change", () => (smHistoryGestureOpen = false));
document.getElementById("smTileWidthNum").addEventListener("input", smTileWidthInput);
document.getElementById("smTileWidthNum").addEventListener("change", () => (smHistoryGestureOpen = false));

document.getElementById("smMotifUpload").addEventListener("change", (e) => {
  const active = smGetActiveLayer();
  const file = e.target.files[0];
  if (!active || active.type !== "motif" || !file) return;
  smPushHistory();
  const reader = new FileReader();
  reader.onload = () => {
    applyMotifImageToLayer(active, reader.result, file.name, () => {
      smRenderLayerList();
      smRefreshControls();
      smRender();
    });
  };
  reader.readAsDataURL(file);
});

document.getElementById("smAddGuideBtn").addEventListener("click", smAddGuideLayer);
document.getElementById("smAddMotifBtn").addEventListener("click", smAddMotifLayer);
document.getElementById("smAddLineBtn").addEventListener("click", smAddLineLayer);
document.getElementById("smAddShapeBtn").addEventListener("click", smAddShapeLayer);
document.getElementById("smDuplicateLayerBtn").addEventListener("click", smDuplicateLayer);
document.getElementById("smRenameLayerBtn").addEventListener("click", () => {
  if (smState.activeLayerId != null) smStartRename(smState.activeLayerId);
});
document.getElementById("smRemoveLayerBtn").addEventListener("click", smRemoveLayer);
document.getElementById("smClearLayersBtn").addEventListener("click", smClearLayers);
document.getElementById("smRandomizeSpeedsBtn").addEventListener("click", smRandomizeAnimSpeeds);
document.getElementById("smZeroSpeedsBtn").addEventListener("click", smZeroAnimSpeeds);
document.getElementById("smMoveUpBtn").addEventListener("click", () => smMoveLayer("up"));
document.getElementById("smMoveDownBtn").addEventListener("click", () => smMoveLayer("down"));
document.getElementById("smUndoBtn").addEventListener("click", () => smUndo());
document.getElementById("smRedoBtn").addEventListener("click", () => smRedo());

document.getElementById("smLayerTypeSelect").addEventListener("change", (e) => {
  const active = smGetActiveLayer();
  if (!active || !CONVERTIBLE_TYPES.includes(active.type)) return;
  const newType = e.target.value;
  if (newType === active.type) return;
  smPushHistory();
  const idx = smState.layers.findIndex((l) => l.id === active.id);
  smState.layers[idx] = smConvertLayerType(active, newType);
  smRenderLayerList();
  smRefreshControls();
  smRender();
});

// --- Global mask --- (mirrors Circle mode's, targeting smState.mask)
function smBindMaskControl(id, apply) {
  const el = document.getElementById(id);
  const numEl = document.getElementById(id + "Num");

  const handle = (source) => {
    if (source === el && numEl) numEl.value = el.value;
    if (source === numEl) {
      if (numEl.value.trim() === "" || !Number.isFinite(Number(numEl.value))) return;
      el.value = numEl.value;
    }
    if (!smHistoryGestureOpen) {
      smHistoryGestureOpen = true;
      smPushHistory();
    }
    // Same reasoning as smBindControl — read from `source`, not always `el`.
    apply(smState.mask, source);
    smRefreshMaskControls();
    smRender();
  };
  const endGesture = () => (smHistoryGestureOpen = false);

  el.addEventListener("input", () => handle(el));
  el.addEventListener("change", endGesture);
  if (numEl) {
    numEl.addEventListener("input", () => handle(numEl));
    numEl.addEventListener("change", endGesture);
  }
}

function smRefreshMaskControls() {
  const mask = smState.mask;
  document.getElementById("smMaskEnabled").checked = mask.enabled;
  smSetFieldValue("smMaskSize", mask.size);
  document.getElementById("smMaskInvert").checked = mask.invert;
  const hasImage = !!mask.imageDataUrl;
  document.getElementById("smMaskNoImageHint").style.display = hasImage ? "none" : "";
  document.getElementById("smMaskPreviewWrap").style.display = hasImage ? "" : "none";
  if (hasImage) {
    document.getElementById("smMaskPreviewImg").src = mask.imageDataUrl;
    document.getElementById("smMaskFileName").textContent = mask.imageName || "Image loaded";
  }
}

smBindMaskControl("smMaskEnabled", (mask, el) => (mask.enabled = el.checked));
smBindMaskControl("smMaskSize", (mask, el) => (mask.size = Number(el.value)));
smBindMaskControl("smMaskInvert", (mask, el) => (mask.invert = el.checked));

document.getElementById("smMaskUpload").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  smPushHistory();
  const reader = new FileReader();
  reader.onload = () => {
    smState.mask.imageDataUrl = reader.result;
    smState.mask.imageName = file.name;
    smRefreshMaskControls();
    smRender();
  };
  reader.readAsDataURL(file);
});

// Same reasoning as roughnessInput (circle mode) — a mode-wide setting, not per-layer.
function smRoughnessInput(e) {
  if (!smHistoryGestureOpen) {
    smHistoryGestureOpen = true;
    smPushHistory();
  }
  smState.roughness = Math.min(100, Math.max(0, Number(e.target.value)));
  smSetFieldValue("smRoughness", smState.roughness);
  smRender();
  scheduleAnimSizeEstimateUpdate(); // roughness is a real driver of exported file size
}
document.getElementById("smRoughness").addEventListener("input", smRoughnessInput);
document.getElementById("smRoughness").addEventListener("change", () => (smHistoryGestureOpen = false));
document.getElementById("smRoughnessNum").addEventListener("input", smRoughnessInput);
document.getElementById("smRoughnessNum").addEventListener("change", () => (smHistoryGestureOpen = false));

// The export is built fresh (never attached to the visible DOM, so there's no hidden-
// element style to accidentally leak into it) using smDistributeWrapped, then clipped
// to exactly one tile width via the viewBox — see smDistributeWrapped for why that
// still shows edge-straddling shapes whole instead of cut off.
function smBuildExportSvgString() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${smState.tileWidth} ${SM_HEIGHT}`);
  svg.setAttribute("xmlns", SVG_NS);
  smRenderInto(svg, smState.tileWidth, (layer) => smDistributeWrapped(layer));
  return new XMLSerializer().serializeToString(svg);
}

document.getElementById("smExportSvgBtn").addEventListener("click", () => {
  const svgString = withFrozenAnimation(() => smBuildExportSvgString());
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  downloadBlob(blob, withFileCode("ornament-tile.svg"));
});

// Topmost/bottommost rows that contain any non-transparent pixel. Measured on the real
// rendered pixels rather than computed from layer geometry, because the true extent
// depends on stroke width, rough-outline jitter, rotation and asset aspect ratio all at
// once — measuring the result is exact where re-deriving it could only approximate.
function verticalContentBounds(ctx, width, height) {
  const data = ctx.getImageData(0, 0, width, height).data;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[rowStart + x * 4 + 3] !== 0) {
        if (top === -1) top = y;
        bottom = y;
        break;
      }
    }
  }
  return top === -1 ? null : { top, bottom };
}

document.getElementById("smExportPngSeqBtn").addEventListener("click", () =>
  exportPngSequence({
    getSvgString: smBuildExportSvgString,
    width: smState.tileWidth,
    height: SM_HEIGHT,
    loopDuration: smState.loopDuration,
    fps: smState.fps,
    renderFn: smRender,
    filenamePrefix: "ornament-tile",
    statusElId: "smAnimExportStatus",
  })
);

document.getElementById("smExportPngBtn").addEventListener("click", () => {
  const svgString = withFrozenAnimation(() => smBuildExportSvgString());
  const svg64 = btoa(unescape(encodeURIComponent(svgString)));
  const img = new Image();
  img.onload = () => {
    const full = document.createElement("canvas");
    full.width = smState.tileWidth;
    full.height = SM_HEIGHT;
    const ctx = full.getContext("2d");
    ctx.drawImage(img, 0, 0, smState.tileWidth, SM_HEIGHT);

    // The tile is always SM_HEIGHT tall internally, but a design usually occupies only a
    // band of that — the empty rows above and below are dead weight in the saved file, so
    // trim to the artwork. Width is untouched: cropping horizontally would break the
    // seamless left/right repeat, whereas vertical padding carries no such meaning.
    const bounds = verticalContentBounds(ctx, full.width, full.height);
    let out = full;
    if (bounds && (bounds.top > 0 || bounds.bottom < SM_HEIGHT - 1)) {
      const cropH = bounds.bottom - bounds.top + 1;
      out = document.createElement("canvas");
      out.width = full.width;
      out.height = cropH;
      out.getContext("2d").drawImage(full, 0, bounds.top, full.width, cropH, 0, 0, full.width, cropH);
    }
    out.toBlob((blob) => downloadBlob(blob, withFileCode("ornament-tile.png")), "image/png");
  };
  img.src = "data:image/svg+xml;base64," + svg64;
});

// --- Project save/load ---
// One JSON file per mode (see buildProjectData) — unlike the PNG/SVG exports, this
// captures the full EDITABLE state (every layer and its settings), so it's a project
// file to resume work from, not a picture. Reuses snapshotLayers/reloadMissingImages/
// pushHistory from the undo system: a project file is really just a history snapshot
// that round-trips through a file instead of an in-memory stack.

const PROJECT_FORMAT_VERSION = 2; // v2: single-mode save (see buildProjectData); v1 saved both modes together

// The design that loads on a fresh page load, so the app never opens on a blank
// canvas — embedded directly (rather than fetched from a separate file) so it still
// works when index.html is opened straight from disk (file://), with no server.
const DEFAULT_PROJECT = {
  "formatVersion": 1,
  "circle": {
    "layers": [
      {
        "id": 14,
        "type": "ring",
        "name": "Ring 14",
        "radius": 1900,
        "visible": true,
        "strokeWidth": 10,
        "strokeColor": "#e0e0e0",
        "imageEl": null
      },
      {
        "id": 15,
        "type": "motif",
        "name": "Asset 15",
        "radius": 1738.1,
        "imageDataUrl": "data:image/png;base64,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",
        "imageName": "mountain 1.png",
        "naturalWidth": 700,
        "naturalHeight": 700,
        "size": 363,
        "count": 40,
        "startAngle": 0,
        "followRing": true,
        "rotation": 0,
        "bend": 100,
        "flip": false,
        "alternateFlip": true,
        "imageEl": null
      },
      {
        "id": 16,
        "type": "ring",
        "name": "Ring 16",
        "radius": 1627.2,
        "visible": true,
        "strokeWidth": 10,
        "strokeColor": "#e0e0e0",
        "imageEl": null
      },
      {
        "id": 18,
        "type": "shape",
        "name": "Shape 18",
        "radius": 1567.9,
        "shapeKind": "triangle",
        "size": 89,
        "sizeY": 66,
        "fillColor": "#e0e0e0",
        "fillOpacity": 0,
        "strokeWidth": 10,
        "strokeColor": "#e0e0e0",
        "count": 94,
        "startAngle": 0,
        "followRing": true,
        "rotation": 180,
        "imageEl": null
      },
      {
        "id": 20,
        "type": "ring",
        "name": "Ring 20",
        "radius": 1852.6,
        "visible": true,
        "strokeWidth": 10,
        "strokeColor": "#e0e0e0",
        "imageEl": null
      },
      {
        "id": 21,
        "type": "ring",
        "name": "Ring 21",
        "radius": 1508.7,
        "visible": true,
        "strokeWidth": 10,
        "strokeColor": "#e0e0e0",
        "imageEl": null
      },
      {
        "id": 22,
        "type": "ring",
        "name": "Ring 22",
        "radius": 1461.2,
        "visible": true,
        "strokeWidth": 10,
        "strokeColor": "#e0e0e0",
        "imageEl": null
      }
    ],
    "activeLayerId": 22
  },
  "straight": {
      "layers":  [
                     {
                         "id":  29,
                         "type":  "motif",
                         "name":  "Asset 29",
                         "position":  6.4,
                         "visible":  true,
                         "imageDataUrl":  "data:image/png;base64,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",
                         "imageName":  "mountain 1.png",
                         "imageEl":  null,
                         "naturalWidth":  700,
                         "naturalHeight":  700,
                         "size":  308,
                         "count":  8,
                         "startOffset":  0,
                         "rotation":  0,
                         "flip":  false,
                         "flipHorizontal":  false,
                         "alternateFlip":  true,
                         "animSpeed":  0
                     },
                     {
                         "id":  31,
                         "type":  "guide",
                         "name":  "Guide 31",
                         "position":  96.2,
                         "visible":  true,
                         "strokeWidth":  5,
                         "strokeColor":  "#e0e0e0",
                         "opacity":  60,
                         "imageEl":  null
                     },
                     {
                         "id":  32,
                         "type":  "guide",
                         "name":  "Guide 32",
                         "position":  -115.4,
                         "visible":  true,
                         "strokeWidth":  5,
                         "strokeColor":  "#e0e0e0",
                         "opacity":  100,
                         "imageEl":  null
                     },
                     {
                         "id":  43,
                         "type":  "guide",
                         "name":  "Guide 32 copy",
                         "position":  -131.9,
                         "visible":  true,
                         "strokeWidth":  5,
                         "strokeColor":  "#e0e0e0",
                         "opacity":  70,
                         "imageEl":  null
                     },
                     {
                         "id":  33,
                         "type":  "shape",
                         "name":  "Shape 33",
                         "position":  131.4,
                         "visible":  true,
                         "shapeKind":  "triangle",
                         "size":  50,
                         "sizeY":  40,
                         "lockRatio":  true,
                         "fillColor":  "#e0e0e0",
                         "fillOpacity":  0,
                         "strokeWidth":  5,
                         "strokeColor":  "#e0e0e0",
                         "count":  23,
                         "startOffset":  0,
                         "rotation":  180,
                         "animSpeed":  0,
                         "opacity":  81,
                         "imageEl":  null
                     },
                     {
                         "id":  34,
                         "type":  "guide",
                         "name":  "Guide 34",
                         "position":  -83.3,
                         "visible":  true,
                         "strokeWidth":  5,
                         "strokeColor":  "#e0e0e0",
                         "opacity":  70,
                         "imageEl":  null
                     },
                     {
                         "id":  42,
                         "type":  "line",
                         "name":  "Line 42",
                         "position":  -101,
                         "visible":  true,
                         "count":  8,
                         "startOffset":  0,
                         "rotation":  0,
                         "strokeWidth":  5,
                         "strokeColor":  "#e0e0e0",
                         "length":  26,
                         "animSpeed":  0,
                         "imageEl":  null
                     },
                     {
                         "id":  44,
                         "type":  "line",
                         "name":  "Line 42 copy",
                         "position":  -100,
                         "visible":  true,
                         "count":  8,
                         "startOffset":  20,
                         "rotation":  0,
                         "strokeWidth":  5,
                         "strokeColor":  "#e0e0e0",
                         "length":  10,
                         "animSpeed":  0,
                         "imageEl":  null
                     },
                     {
                         "id":  45,
                         "type":  "line",
                         "name":  "Line 42 copy copy",
                         "position":  -100,
                         "visible":  true,
                         "count":  8,
                         "startOffset":  -20,
                         "rotation":  0,
                         "strokeWidth":  5,
                         "strokeColor":  "#e0e0e0",
                         "length":  10,
                         "animSpeed":  0,
                         "imageEl":  null
                     }
                 ],
      "activeLayerId":  29,
      "tileWidth":  2000,
      "loopDuration":  30,
      "fps":  24
  }
};

// Saves only whichever mode is currently showing — you save the Ring or the Straight
// tile, not both bundled together (that was the old v1 format; see applyProjectData's
// fallback for opening those files).
function buildProjectData() {
  if (currentMode === "circle") {
    return {
      formatVersion: PROJECT_FORMAT_VERSION,
      mode: "circle",
      layers: snapshotLayers(state.layers),
      activeLayerId: state.activeLayerId,
      mask: JSON.parse(JSON.stringify(state.mask)),
      roughness: state.roughness,
    };
  }
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    mode: "straight",
    layers: snapshotLayers(smState.layers),
    activeLayerId: smState.activeLayerId,
    tileWidth: smState.tileWidth,
    loopDuration: smState.loopDuration,
    fps: smState.fps,
    mask: JSON.parse(JSON.stringify(smState.mask)),
    roughness: smState.roughness,
  };
}

function setProjectStatus(message, isError) {
  const el = document.getElementById("projectStatus");
  el.textContent = message;
  el.style.color = isError ? "#ff8a8a" : "";
}

function maxLayerId(layers) {
  return layers.reduce((max, l) => Math.max(max, l.id), 0);
}

function saveProject() {
  const data = buildProjectData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  downloadBlob(blob, `ornament-${data.mode}.json`);
  setProjectStatus(`Saved (${data.mode === "circle" ? "Ring" : "Straight"}).`);
}

// Startup only — populates BOTH modes at once from one bundled preset, so switching
// modes right after loading the page still shows something. Clones via snapshotLayers
// rather than assigning DEFAULT_PROJECT's arrays directly, since it's a module-level
// constant reused as-is on every page load and shouldn't be mutable by later edits.
// The user-facing Open Project flow (applyProjectData, below) is single-mode instead —
// this function is deliberately not exposed to it.
function applyDefaultProject(data) {
  pushHistory();
  state.layers = snapshotLayers(data.circle.layers);
  state.activeLayerId = data.circle.activeLayerId ?? null;
  state.mask = data.circle.mask ? JSON.parse(JSON.stringify(data.circle.mask)) : createDefaultMask();
  state.roughness = data.circle.roughness ?? 50;
  setFieldValue("roughness", state.roughness);
  nextLayerId = maxLayerId(state.layers) + 1;
  reloadMissingImages(state.layers, render);
  renderLayerList();
  refreshControls();
  refreshMaskControls();
  render();

  smPushHistory();
  smState.layers = snapshotLayers(data.straight.layers);
  smState.activeLayerId = data.straight.activeLayerId ?? null;
  smState.tileWidth = data.straight.tileWidth || 800;
  smState.loopDuration = data.straight.loopDuration || 6;
  smState.fps = data.straight.fps || 24;
  smState.mask = data.straight.mask ? JSON.parse(JSON.stringify(data.straight.mask)) : createDefaultMask();
  smState.roughness = data.straight.roughness ?? 50;
  smSetFieldValue("smTileWidth", smState.tileWidth);
  smSetFieldValue("smLoopDuration", smState.loopDuration);
  smSetFieldValue("smFps", smState.fps);
  smSetFieldValue("smRoughness", smState.roughness);
  smNextLayerId = maxLayerId(smState.layers) + 1;
  reloadMissingImages(smState.layers, smRender);
  smRenderLayerList();
  smRefreshControls();
  smRefreshMaskControls();
  smRender();
  ensureAnimationRunning();
}

// User-facing Open Project — loads only the one mode the file represents (see
// buildProjectData) into that mode's state, leaving whatever's currently in the OTHER
// mode untouched, then switches to show it. Falls back to the old v1 format (which
// bundled both modes into one file) by loading its Ring side, for anyone opening a
// project saved before this change.
function applyProjectData(data) {
  if (!data.mode && data.circle) {
    applyDefaultProject(data);
    setMode("circle");
    setProjectStatus("Loaded (older project format, saved both at once — showing Ring).");
    return;
  }
  if (data.mode === "circle") {
    pushHistory();
    state.layers = snapshotLayers(data.layers);
    state.activeLayerId = data.activeLayerId ?? null;
    state.mask = data.mask ? JSON.parse(JSON.stringify(data.mask)) : createDefaultMask();
    state.roughness = data.roughness ?? 50;
    setFieldValue("roughness", state.roughness);
    nextLayerId = maxLayerId(state.layers) + 1;
    reloadMissingImages(state.layers, render);
    renderLayerList();
    refreshControls();
    refreshMaskControls();
    render();
  } else {
    smPushHistory();
    smState.layers = snapshotLayers(data.layers);
    smState.activeLayerId = data.activeLayerId ?? null;
    smState.tileWidth = data.tileWidth || 800;
    smState.loopDuration = data.loopDuration || 6;
    smState.fps = data.fps || 24;
    smState.mask = data.mask ? JSON.parse(JSON.stringify(data.mask)) : createDefaultMask();
    smState.roughness = data.roughness ?? 50;
    smSetFieldValue("smTileWidth", smState.tileWidth);
    smSetFieldValue("smLoopDuration", smState.loopDuration);
    smSetFieldValue("smFps", smState.fps);
    smSetFieldValue("smRoughness", smState.roughness);
    smNextLayerId = maxLayerId(smState.layers) + 1;
    reloadMissingImages(smState.layers, smRender);
    smRenderLayerList();
    smRefreshControls();
    smRefreshMaskControls();
    smRender();
  }
  setMode(data.mode);
  ensureAnimationRunning();
}

function loadProject(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (e) {
      setProjectStatus("Couldn't read that file — not valid JSON.", true);
      return;
    }
    const isCurrentFormat = data && (data.mode === "circle" || data.mode === "straight") && Array.isArray(data.layers);
    const isOldFormat = data && data.circle && data.straight && Array.isArray(data.circle.layers) && Array.isArray(data.straight.layers);
    if (!isCurrentFormat && !isOldFormat) {
      setProjectStatus("That file doesn't look like an Ornament Visualiser project.", true);
      return;
    }
    applyProjectData(data);
    setProjectStatus(`Loaded "${file.name}". (Ctrl+Z undoes the load.)`);
  };
  reader.onerror = () => setProjectStatus("Couldn't read that file.", true);
  reader.readAsText(file);
}

document.getElementById("saveProjectBtn").addEventListener("click", saveProject);
document.getElementById("openProjectBtn").addEventListener("click", () => {
  document.getElementById("openProjectInput").click();
});
document.getElementById("openProjectInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) loadProject(file);
  e.target.value = ""; // allow re-selecting the same file next time
});

// --- Reset buttons (Rotation / Start angle fields, both modes) ---
// Dispatching synthetic events on the target range input reuses its existing
// bindControl/smBindControl wiring, so state updates, num-input sync, and undo
// history all work exactly as if the user dragged the slider to 0.
document.querySelectorAll(".reset-btn").forEach((btn) => {
  if (!btn.dataset.resetTarget) return; // not one of these — e.g. a button only styled like one
  const el = document.getElementById(btn.dataset.resetTarget);
  btn.addEventListener("click", () => {
    el.value = 0;
    el.dispatchEvent(new Event("input"));
    el.dispatchEvent(new Event("change"));
  });
});

// --- Number input UX: select-on-focus, scroll-to-nudge, simple math (every .num-input) ---
// These are type="text" (not type="number") specifically so + - * / can be typed at all —
// a native number input silently swallows those keystrokes, which would make typing an
// expression impossible no matter what the blur handler below does with it.
//
// Evaluates a plain arithmetic expression typed into a number box — e.g. "200/2" or
// "40+15". The character whitelist is checked BEFORE handing anything to Function(), so
// there's no way to reach arbitrary code execution through it: only digits, "+-*/().",
// and spaces ever get that far, same trust boundary as a calculator.
function evaluateNumericExpression(text) {
  const trimmed = text.trim();
  if (trimmed === "" || !/^[-+*/(). \d]+$/.test(trimmed)) return null;
  try {
    const result = Function('"use strict"; return (' + trimmed + ")")();
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

document.querySelectorAll(".num-input").forEach((el) => {
  el.addEventListener("focus", () => el.select());
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") el.blur();
  });
  el.addEventListener("blur", () => {
    const evaluated = evaluateNumericExpression(el.value);
    if (evaluated === null) {
      // Left empty, or not a valid expression — the paired range input always holds
      // the last value that actually made it to the model (bindControl never lets
      // invalid/empty text through to it), so that's the real current value to show.
      const pairedRange = document.getElementById(el.id.replace(/Num$/, ""));
      if (pairedRange) el.value = pairedRange.value;
      return;
    }
    if (String(evaluated) === el.value) return;
    el.value = evaluated;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // Only while focused — otherwise scrolling the sidebar past a number box would hijack
  // the page scroll and nudge whatever field happened to be under the cursor. Reads
  // min/max/step via getAttribute rather than the .min/.max/.step properties since those
  // IDL properties aren't guaranteed to reflect on a type="text" input the way they do on
  // type="number"/"range".
  el.addEventListener(
    "wheel",
    (e) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      // data-wheel-step lets a field use a finer scroll-nudge than its slider/typed step
      // (e.g. Straight mode's start offset: slider moves by 5, wheel by 1).
      const step = Number(el.getAttribute("data-wheel-step") ?? el.getAttribute("step")) || 1;
      const minAttr = el.getAttribute("min");
      const maxAttr = el.getAttribute("max");
      const min = minAttr !== null ? Number(minAttr) : -Infinity;
      const max = maxAttr !== null ? Number(maxAttr) : Infinity;
      const base = evaluateNumericExpression(el.value) ?? 0;
      const decimals = (String(step).split(".")[1] || "").length;
      const next = Math.min(max, Math.max(min, base + (e.deltaY < 0 ? step : -step)));
      el.value = Number(next.toFixed(decimals));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { passive: false }
  );
});

// --- Mode switching ---
// `currentMode` is declared near the top of the file (the zoom init needs it early).

function setMode(mode) {
  currentMode = mode;
  document.getElementById("modeCircleBtn").classList.toggle("active", mode === "circle");
  document.getElementById("modeStraightBtn").classList.toggle("active", mode === "straight");
  document.getElementById("circleModeSidebar").style.display = mode === "circle" ? "" : "none";
  document.getElementById("straightModeSidebar").style.display = mode === "straight" ? "" : "none";
  document.getElementById("circleLayersPanel").style.display = mode === "circle" ? "" : "none";
  document.getElementById("straightLayersPanel").style.display = mode === "straight" ? "" : "none";
  document.getElementById("circleModePreview").style.display = mode === "circle" ? "contents" : "none";
  document.getElementById("straightModePreview").style.display = mode === "straight" ? "contents" : "none";
  if (mode === "straight") smRender();
  // The Zoom box follows whichever artboard is showing, and the on-screen readouts can
  // only be measured once the newly visible mode is laid out.
  applyZoom();
  homePreviewScroll();
  // The animation loop only tracks the VISIBLE mode (see currentModeAnimating), so
  // switching into a mode whose layers are animating is exactly when it may need
  // starting again — the loop will have shut itself down while that mode was hidden.
  ensureAnimationRunning();
}

document.getElementById("modeCircleBtn").addEventListener("click", () => setMode("circle"));
document.getElementById("modeStraightBtn").addEventListener("click", () => setMode("straight"));

// True only where a keystroke is genuinely editing TEXT — the one case where the
// browser's own undo/delete must win. A range slider, colour swatch, checkbox or file
// button is an <input> too, but keystrokes mean nothing in them, so app shortcuts should
// still fire. Testing `tagName === "INPUT"` instead is what made Ctrl+Z silently dead
// after any slider drag: the slider keeps focus, and dragging sliders is how nearly every
// edit in this app is made, so undo appeared completely broken.
const TEXT_INPUT_TYPES = new Set(["text", "number", "search", "email", "url", "tel", "password"]);

function isTextEditingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  return TEXT_INPUT_TYPES.has((el.type || "text").toLowerCase());
}

// Ctrl+Z (or Cmd+Z) undoes, Ctrl+Shift+Z (or Cmd+Shift+Z) redoes — whichever mode is
// currently showing. Skipped while focus is in a text-like field so native text-undo
// (e.g. while typing a layer rename) isn't hijacked.
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
  if (isTextEditingTarget(document.activeElement)) return;
  e.preventDefault();
  if (e.shiftKey) {
    if (currentMode === "circle") redo();
    else smRedo();
  } else {
    if (currentMode === "circle") undo();
    else smUndo();
  }
});

// Ctrl+S (or Cmd+S) saves the current project as a .json file, same as the "Save
// Project" button — intercepted globally, even while a text field has focus, matching
// the universal "Save" convention, and to stop the browser's native Save Page dialog.
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
  e.preventDefault();
  saveProject();
});

// Ctrl+F (or Cmd+F) opens a project file, same as the "Open Project" button. This
// intentionally overrides the browser's native Find-in-page while the app is focused
// (a deliberate choice, not an oversight — confirmed with the user).
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
  e.preventDefault();
  document.getElementById("openProjectInput").click();
});

// Ctrl+E (or Cmd+E) exports the current mode's main artboard as a PNG, same as the
// "Ring editor" / "Tile" PNG button — clicking the real button rather than calling an
// export function directly so this works unchanged regardless of which mode is active,
// without needing its own branch on currentMode beyond picking the button id.
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "e") return;
  e.preventDefault();
  const btnId = currentMode === "circle" ? "exportPngBtn" : "smExportPngBtn";
  document.getElementById(btnId).click();
});


// Delete removes the active layer, same as the "Remove" button — but only when focus
// isn't inside something text-editable (a number/text box, the layer-rename box, etc.),
// otherwise it would eat the layer out from under someone just trying to delete a
// character while typing.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Delete") return;
  if (isTextEditingTarget(document.activeElement)) return;
  e.preventDefault();
  if (currentMode === "circle") removeLayer();
  else smRemoveLayer();
});

// --- Init ---

applyDefaultProject(DEFAULT_PROJECT);
updateAllAnimSizeEstimates();
homePreviewScroll();

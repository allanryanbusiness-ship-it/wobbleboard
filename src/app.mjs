// Wobbleboard: a small hand-drawn whiteboard. The interface here is original;
// the drawing engine underneath (rough.mjs, freehand.mjs, shapes.mjs) is the
// part rebuilt from the excalidraw.com bundle.

import {
  DEFAULT_ELEMENT_PROPS, FREEDRAW_STROKE_WIDTH, STROKE_WIDTH,
  newElement, randomInteger, renderElement, roundnessFor, seedShowsIn,
} from "./shapes.mjs";
import { DEFAULT_FONT_SIZE, FONTS, FONT_FACES, FONT_SIZES, fontString, lineHeightPx, measureText } from "./text.mjs";

const STORAGE_KEY = "wobbleboard-scene";
const PAPER = "#fbfaf7";
const ACCENT = "#2f6f5e";
const HISTORY_LIMIT = 200;
const MIN_DRAG = 6;
const HIT_SLOP = 7;
const BOX_TYPES = new Set(["rectangle", "diamond", "ellipse"]);
const KNOWN_TYPES = new Set([...BOX_TYPES, "arrow", "line", "freedraw", "text"]);

/** Keep only saved elements the engine can paint, so one bad entry cannot blank the board. */
const isUsable = (e) => {
  if (!e || !KNOWN_TYPES.has(e.type)) return false;
  if (![e.x, e.y, e.width, e.height].every(Number.isFinite)) return false;
  if (e.type === "text") return typeof e.text === "string" && e.text.length > 0 && Number.isFinite(e.fontSize);
  if (![e.seed, e.strokeWidth].every(Number.isFinite)) return false;
  return BOX_TYPES.has(e.type) || (Array.isArray(e.points) && e.points.length > 0);
};

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);
const editor = $("editor");

// Each tool: id, label, shortcut key, icon (20 x 20, drawn with the text colour).
const TOOLS = [
  ["select", "Select", "1", '<path d="M5 3.5l10.5 6-4.7 1.2 2.5 5-2 1-2.5-5L5 15z"/>'],
  ["rectangle", "Rectangle", "2", '<rect x="3.5" y="5" width="13" height="10" rx="2"/>'],
  ["diamond", "Diamond", "3", '<path d="M10 3l7 7-7 7-7-7z"/>'],
  ["ellipse", "Ellipse", "4", '<ellipse cx="10" cy="10" rx="7" ry="5.5"/>'],
  ["arrow", "Arrow", "5", '<path d="M4 16L16 4M9.5 4H16v6.5"/>'],
  ["line", "Line", "6", '<path d="M4 16L16 4"/>'],
  ["freedraw", "Pen", "7", '<path d="M4 16l1-4 8.5-8.5 3 3L8 15zM11.5 5.5l3 3"/>'],
  ["text", "Text", "8", '<path d="M4.5 6.5V4.5h11v2M10 4.5v11M8 15.5h4"/>'],
];
const CHOICES = {
  strokeColor: [["#1e1e1e"], ["#e03131"], ["#2f9e44"], ["#1971c2"], ["#f08c00"]],
  backgroundColor: [["transparent"], ["#ffc9c9"], ["#b2f2bb"], ["#a5d8ff"], ["#ffec99"]],
  fontFamily: [["hand", "Hand"], ["script", "Script"], ["normal", "Normal"], ["serif", "Serif"], ["code", "Code"]],
  bold: [[false, "Regular"], [true, "Bold"]],
  fontSize: [[FONT_SIZES.sm, "S"], [FONT_SIZES.md, "M"], [FONT_SIZES.lg, "L"], [FONT_SIZES.xl, "XL"]],
  textAlign: [["left", "Left"], ["center", "Center"], ["right", "Right"]],
  fillStyle: [["hachure", "Hachure"], ["cross-hatch", "Cross-hatch"], ["solid", "Solid"], ["zigzag", "Zigzag"]],
  strokeWidth: [[1, "Thin"], [2, "Medium"], [4, "Bold"]],
  strokeStyle: [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]],
  roughness: [[0, "Architect"], [1, "Artist"], [2, "Cartoonist"]],
  round: [[false, "Sharp"], [true, "Round"]],
};
const ROUNDABLE = new Set(["rectangle", "diamond", "line", "arrow"]);

const state = {
  tool: "rectangle",
  elements: [],
  selected: new Set(),
  style: {
    ...DEFAULT_ELEMENT_PROPS, fillStyle: "hachure", round: true,
    fontFamily: "hand", fontSize: DEFAULT_FONT_SIZE, bold: false, textAlign: "left",
  },
  draft: null,
  drag: null,
  marquee: null,
  editing: null,
  undo: [],
  redo: [],
};

const selectedElements = () => state.elements.filter((e) => state.selected.has(e.id));

/** Text is always free-standing. Boards saved while labels were tied to shapes are loaded as plain text. */
const asFreeText = ({ containerId, ...element }) => element;

// --- storage and history -----------------------------------------------------

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved)) state.elements = saved.filter(isUsable).map(asFreeText);
  } catch {
    // A missing or unreadable scene just starts empty.
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.elements));
  } catch {
    // Storage can be unavailable; the board still works for this visit.
  }
}

/**
 * Every change swaps in a new elements array. Element objects are replaced,
 * never mutated, so old arrays double as undo snapshots and the shape cache
 * stays valid.
 */
function commit(elements, before = state.elements) {
  state.undo.push(before);
  if (state.undo.length > HISTORY_LIMIT) state.undo.shift();
  state.redo = [];
  state.elements = elements;
  save();
  refresh();
}

function travel(from, to) {
  if (!from.length) return;
  to.push(state.elements);
  state.elements = from.pop();
  // Drop selected ids that no longer exist in this version of the board.
  const present = new Set(state.elements.map((e) => e.id));
  state.selected = new Set([...state.selected].filter((id) => present.has(id)));
  save();
  syncStyleFromSelection();
  refresh();
}

// --- geometry ----------------------------------------------------------------

function bounds(element) {
  if (element.points) {
    const xs = element.points.map((p) => p[0]);
    const ys = element.points.map((p) => p[1]);
    return [
      element.x + Math.min(...xs), element.y + Math.min(...ys),
      element.x + Math.max(...xs), element.y + Math.max(...ys),
    ];
  }
  return [element.x, element.y, element.x + element.width, element.y + element.height];
}

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Does the segment a-b pass through the rectangle? (Liang-Barsky clipping test.) */
function segmentTouchesRect(ax, ay, bx, by, [x1, y1, x2, y2]) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [[-dx, ax - x1], [dx, x2 - ax], [-dy, ay - y1], [dy, y2 - ay]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

const segmentsOf = (element) => {
  const points = element.points.length > 1 ? element.points : [element.points[0], element.points[0]];
  return points.slice(0, -1).map((p, i) => [p, points[i + 1]]);
};

/** Boxes and text are hit anywhere inside; lines, arrows and pen strokes only near the ink. */
function isHit(element, x, y) {
  const [x1, y1, x2, y2] = bounds(element);
  if (x < x1 - HIT_SLOP || x > x2 + HIT_SLOP || y < y1 - HIT_SLOP || y > y2 + HIT_SLOP) return false;
  if (!element.points) return true;
  const reach = HIT_SLOP + element.strokeWidth * (element.type === "freedraw" ? 2.5 : 1);
  return segmentsOf(element).some(([a, b]) => distanceToSegment(x - element.x, y - element.y, a, b) <= reach);
}

/**
 * Is the point on something actually drawn? Text and filled shapes count
 * anywhere inside; an unfilled shape counts only along its outline, so a click
 * in its empty middle can reach whatever lies underneath.
 */
function isOnInk(element, x, y) {
  if (element.points) return isHit(element, x, y);
  const [x1, y1, x2, y2] = bounds(element);
  if (x < x1 - HIT_SLOP || x > x2 + HIT_SLOP || y < y1 - HIT_SLOP || y > y2 + HIT_SLOP) return false;
  if (element.type === "text") return true;
  const filled = element.backgroundColor && element.backgroundColor !== "transparent";
  const reach = HIT_SLOP + element.strokeWidth / 2;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.max((x2 - x1) / 2, 0.5);
  const ry = Math.max((y2 - y1) / 2, 0.5);
  if (element.type === "ellipse") {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    return filled ? d <= 1 : Math.abs(d - 1) * Math.min(rx, ry) <= reach;
  }
  if (element.type === "diamond") {
    if (filled) return Math.abs(x - cx) / rx + Math.abs(y - cy) / ry <= 1;
    const corners = [[cx, y1], [x2, cy], [cx, y2], [x1, cy]];
    return corners.some((corner, i) => distanceToSegment(x, y, corner, corners[(i + 1) % 4]) <= reach);
  }
  if (filled) return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  return x < x1 + reach || x > x2 - reach || y < y1 + reach || y > y2 - reach;
}

/** The topmost thing drawn under the point; failing that, the topmost shape whose box holds it. */
function hitTest(x, y) {
  const candidates = [...state.elements].reverse();
  return candidates.find((e) => isOnInk(e, x, y)) || candidates.find((e) => isHit(e, x, y)) || null;
}

/** A shape is picked up by the selection box as soon as the box touches it. */
function touchesRect(element, rect) {
  const [x1, y1, x2, y2] = bounds(element);
  if (x2 < rect[0] || x1 > rect[2] || y2 < rect[1] || y1 > rect[3]) return false;
  if (!element.points) return true;
  const local = [rect[0] - element.x, rect[1] - element.y, rect[2] - element.x, rect[3] - element.y];
  return segmentsOf(element).some(([a, b]) => segmentTouchesRect(a[0], a[1], b[0], b[1], local));
}

const marqueeRect = (m) => [Math.min(m.x1, m.x2), Math.min(m.y1, m.y2), Math.max(m.x1, m.x2), Math.max(m.y1, m.y2)];

/** Size of a points-based element, which the roughness adjustment reads. */
function withPointBounds(element) {
  const xs = element.points.map((p) => p[0]);
  const ys = element.points.map((p) => p[1]);
  return { ...element, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

// --- painting ----------------------------------------------------------------

function paint() {
  const ratio = window.devicePixelRatio || 1;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const editingId = state.editing ? state.editing.element.id : null;
  const all = state.draft ? [...state.elements, state.draft] : state.elements;
  // The text being edited is shown by the text box instead.
  for (const element of all) if (element.id !== editingId) renderElement(ctx, element);

  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  for (const element of selectedElements()) {
    const [x1, y1, x2, y2] = bounds(element);
    ctx.strokeRect(x1 - 7, y1 - 7, x2 - x1 + 14, y2 - y1 + 14);
  }
  if (state.marquee) {
    const [x1, y1, x2, y2] = marqueeRect(state.marquee);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgb(47 111 94 / 10%)";
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1, y2 - y1);
  }
  ctx.restore();
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  paint();
}

/** Repaint and bring every control in line with the current state. */
function refresh() {
  paint();
  const hasSelection = selectedElements().length > 0;
  const isEmpty = state.elements.length === 0;
  $("empty").hidden = !isEmpty || !!state.draft || !!state.editing;
  $("undo").disabled = state.undo.length === 0;
  $("redo").disabled = state.redo.length === 0;
  const canReseed = selectedElements().some(seedShowsIn);
  $("reseed").disabled = !canReseed;
  $("reseed").title =
    hasSelection && !canReseed
      ? "Pen strokes, text and Architect shapes have no wobble to change"
      : "Give the selected shapes a new random seed";
  $("duplicate").disabled = !hasSelection;
  $("delete").disabled = !hasSelection;
  $("export").disabled = isEmpty;
  $("clear").disabled = isEmpty;
  for (const button of $("tools").children) {
    button.setAttribute("aria-pressed", String(button.dataset.tool === state.tool));
  }

  // The panel shows text choices for text and shape choices for shapes.
  const targets = selectedElements();
  const textMode = state.tool === "text" || !!state.editing;
  const showText = textMode || targets.some((e) => e.type === "text");
  const showShape = !textMode && (targets.length === 0 || targets.some((e) => e.type !== "text"));
  for (const group of document.querySelectorAll("#style .group[data-group]")) {
    group.hidden = group.dataset.group === "text" ? !showText : !showShape;
  }
  $("colour-label").textContent = showShape ? "Stroke" : "Colour";
  for (const row of document.querySelectorAll("#style .row")) {
    const current = JSON.stringify(state.style[row.dataset.prop]);
    for (const button of row.children) button.setAttribute("aria-pressed", String(button.dataset.value === current));
  }
}

// --- style -------------------------------------------------------------------

const widthKeyOf = (scale, value) => Object.keys(scale).find((key) => scale[key] === value) || "medium";

/** Element properties for the current style. Text and the pen each use their own subset. */
function styleProps(type) {
  const { round, fontFamily, fontSize, bold, textAlign, ...props } = state.style;
  if (type === "text") return { strokeColor: props.strokeColor, opacity: props.opacity, fontFamily, fontSize, bold, textAlign };
  const strokeWidth =
    type === "freedraw" ? FREEDRAW_STROKE_WIDTH[widthKeyOf(STROKE_WIDTH, props.strokeWidth)] : props.strokeWidth;
  return { ...props, strokeWidth, roundness: round && ROUNDABLE.has(type) ? roundnessFor(type) : null };
}

/** Show the style of the selection (its topmost shape) in the panel. */
function syncStyleFromSelection() {
  const element = selectedElements().at(-1);
  if (!element) return;
  if (element.type === "text") {
    const { strokeColor, fontFamily, fontSize, textAlign } = element;
    state.style = { ...state.style, strokeColor, fontFamily, fontSize, bold: !!element.bold, textAlign };
    return;
  }
  const scale = element.type === "freedraw" ? FREEDRAW_STROKE_WIDTH : STROKE_WIDTH;
  state.style = {
    ...state.style,
    strokeColor: element.strokeColor,
    backgroundColor: element.backgroundColor,
    fillStyle: element.fillStyle,
    strokeWidth: STROKE_WIDTH[widthKeyOf(scale, element.strokeWidth)],
    strokeStyle: element.strokeStyle,
    roughness: element.roughness,
    opacity: element.opacity,
    round: ROUNDABLE.has(element.type) ? !!element.roundness : state.style.round,
  };
}

/** Where a block of text sits once its size is known. Its aligned edge (or centre) stays put. */
function placeText(element, text) {
  const size = measureText(text || " ", element);
  let { x } = element;
  if (element.textAlign === "center") x = element.x + (element.width - size.width) / 2;
  else if (element.textAlign === "right") x = element.x + element.width - size.width;
  return { x, y: element.y, width: size.width, height: size.height };
}

/** Apply one style choice to every selected shape, as a single undo step. */
function setStyle(prop, value) {
  state.style[prop] = value;
  const key = prop === "round" ? "roundness" : prop;
  let changed = false;
  const elements = state.elements.map((element) => {
    if (!state.selected.has(element.id)) return element;
    const props = styleProps(element.type);
    if (!(key in props)) return element;
    if (JSON.stringify(props[key]) === JSON.stringify(element[key])) return element;
    changed = true;
    const next = { ...element, [key]: props[key] };
    // A new font, size or weight changes how much room the text takes.
    return key === "fontFamily" || key === "fontSize" || key === "bold" ? { ...next, ...placeText(next, next.text) } : next;
  });
  if (changed) commit(elements);
  else refresh();
}

// --- text editing ------------------------------------------------------------

/** Lay the text box over the board where the text will be drawn. */
function layoutEditor() {
  const { element } = state.editing;
  const box = placeText(element, editor.value);
  Object.assign(editor.style, {
    font: fontString(element),
    lineHeight: "1.25",
    color: element.strokeColor,
    textAlign: element.textAlign,
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width + 4}px`,
    height: `${box.height}px`,
  });
}

function startEditing(element, isNew) {
  state.editing = { element, isNew };
  state.selected = new Set();
  editor.value = element.text;
  editor.hidden = false;
  layoutEditor();
  refresh();
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);
}

/** Close the text box and keep what was typed. Empty text removes the element. */
function finishEditing() {
  const editing = state.editing;
  if (!editing) return;
  state.editing = null;
  editor.hidden = true;
  state.tool = "select";
  canvas.style.cursor = "default";
  const { element, isNew } = editing;
  const text = editor.value.replace(/\s+$/, "");
  if (!text.trim()) {
    if (isNew) refresh();
    else commit(state.elements.filter((e) => e.id !== element.id));
    return;
  }
  const next = { ...element, text, ...placeText(element, text) };
  state.selected = new Set([element.id]);
  if (!isNew && text === element.text) {
    syncStyleFromSelection();
    refresh();
    return;
  }
  // New text goes on top of everything, including the shape it was typed over.
  const elements = isNew ? [...state.elements, next] : state.elements.map((e) => (e.id === element.id ? next : e));
  syncStyleFromSelection();
  commit(elements);
}

/** Type at a point: edit the text there, or start new text, whether or not a shape is underneath. */
function editTextAt(x, y) {
  const hit = hitTest(x, y);
  if (hit && hit.type === "text") {
    startEditing(hit, false);
    return;
  }
  const props = styleProps("text");
  // The click lands on the middle of the first line.
  startEditing(newElement("text", { ...props, text: "", x, y: y - lineHeightPx(props) / 2 }), true);
}

editor.addEventListener("input", layoutEditor);
editor.addEventListener("blur", finishEditing);
editor.addEventListener("keydown", (event) => {
  // Keys typed here are text, not shortcuts.
  event.stopPropagation();
  if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
    event.preventDefault();
    finishEditing();
  }
});

// --- pointer input -----------------------------------------------------------

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (state.editing) {
    // Clicking away from the text box just finishes the text.
    finishEditing();
    return;
  }
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // Capture only keeps a drag alive outside the window; drawing works without it.
  }
  const x = event.clientX;
  const y = event.clientY;
  if (state.tool === "text") return; // Text starts on the click, once focus has settled.
  if (state.tool === "select") {
    const hit = hitTest(x, y);
    if (!hit) {
      // Empty space: start a selection box. Shift keeps what is already selected.
      const base = event.shiftKey ? new Set(state.selected) : new Set();
      state.selected = new Set(base);
      state.marquee = { x1: x, y1: y, x2: x, y2: y, base };
    } else {
      const wasSelected = state.selected.has(hit.id);
      if (event.shiftKey) {
        if (wasSelected) state.selected.delete(hit.id);
        else state.selected.add(hit.id);
      } else if (!wasSelected) {
        state.selected = new Set([hit.id]);
      }
      if (state.selected.has(hit.id)) {
        // A plain click on one of several selected shapes narrows to it on release.
        const narrowTo = wasSelected && !event.shiftKey && state.selected.size > 1 ? hit.id : null;
        state.drag = { lastX: x, lastY: y, before: state.elements, moved: false, narrowTo };
      }
    }
    syncStyleFromSelection();
    refresh();
    return;
  }
  state.selected = new Set();
  const type = state.tool;
  const base = { ...styleProps(type), x, y };
  if (type === "freedraw") {
    const hasPressure = event.pointerType === "pen" && event.pressure > 0;
    state.draft = newElement(type, {
      ...base,
      points: [[0, 0]],
      pressures: hasPressure ? [event.pressure] : [],
      simulatePressure: !hasPressure,
    });
  } else if (type === "line" || type === "arrow") {
    state.draft = newElement(type, { ...base, points: [[0, 0], [0, 0]] });
  } else {
    state.draft = newElement(type, { ...base, originX: x, originY: y });
  }
  refresh();
});

canvas.addEventListener("pointermove", (event) => {
  const x = event.clientX;
  const y = event.clientY;
  if (state.marquee) {
    state.marquee = { ...state.marquee, x2: x, y2: y };
    const rect = marqueeRect(state.marquee);
    state.selected = new Set(state.marquee.base);
    for (const element of state.elements) if (touchesRect(element, rect)) state.selected.add(element.id);
    refresh();
    return;
  }
  if (state.drag) {
    const dx = x - state.drag.lastX;
    const dy = y - state.drag.lastY;
    if (dx || dy) {
      state.elements = state.elements.map((e) => (state.selected.has(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e));
      state.drag = { ...state.drag, lastX: x, lastY: y, moved: true };
      paint();
    }
    return;
  }
  const draft = state.draft;
  if (!draft) {
    if (state.tool === "select") canvas.style.cursor = hitTest(x, y) ? "move" : "default";
    return;
  }
  if (draft.type === "freedraw") {
    const points = [...draft.points, [x - draft.x, y - draft.y]];
    const pressures = draft.simulatePressure ? draft.pressures : [...draft.pressures, event.pressure];
    state.draft = withPointBounds({ ...draft, points, pressures });
  } else if (draft.points) {
    let dx = x - draft.x;
    let dy = y - draft.y;
    if (event.shiftKey) {
      // Snap to the nearest 15 degrees.
      const step = Math.PI / 12;
      const angle = Math.round(Math.atan2(dy, dx) / step) * step;
      const length = Math.hypot(dx, dy);
      dx = Math.cos(angle) * length;
      dy = Math.sin(angle) * length;
    }
    state.draft = withPointBounds({ ...draft, points: [[0, 0], [dx, dy]] });
  } else {
    let width = Math.abs(x - draft.originX);
    let height = Math.abs(y - draft.originY);
    if (event.shiftKey) width = height = Math.max(width, height);
    state.draft = {
      ...draft,
      x: x < draft.originX ? draft.originX - width : draft.originX,
      y: y < draft.originY ? draft.originY - height : draft.originY,
      width,
      height,
    };
  }
  paint();
});

function finishPointer() {
  if (state.marquee) {
    state.marquee = null;
    syncStyleFromSelection();
    refresh();
    return;
  }
  if (state.drag) {
    const { before, moved, narrowTo } = state.drag;
    state.drag = null;
    if (moved) {
      commit(state.elements, before);
    } else if (narrowTo) {
      state.selected = new Set([narrowTo]);
      syncStyleFromSelection();
      refresh();
    }
  }
  const draft = state.draft;
  if (!draft) return;
  state.draft = null;
  // A press that barely moves is a stray click, not a shape.
  const tooSmall = draft.points
    ? draft.type === "freedraw"
      ? draft.points.length < 2
      : Math.hypot(...draft.points[1]) < MIN_DRAG
    : draft.width < MIN_DRAG && draft.height < MIN_DRAG;
  if (tooSmall) {
    refresh();
    return;
  }
  const { originX, originY, ...element } = draft;
  // Pen strokes come many in a row, so one is not left selected: the next
  // style choice sets up the next stroke instead of restyling this one.
  state.selected = new Set(element.type === "freedraw" ? [] : [element.id]);
  commit([...state.elements, element]);
}
canvas.addEventListener("pointerup", finishPointer);
canvas.addEventListener("pointercancel", finishPointer);

// With the Text tool a single click types; with Select a double-click does.
canvas.addEventListener("click", (event) => {
  if (state.tool === "text" && !state.editing) editTextAt(event.clientX, event.clientY);
});
canvas.addEventListener("dblclick", (event) => {
  if (state.tool === "select" && !state.editing) editTextAt(event.clientX, event.clientY);
});

// --- actions -----------------------------------------------------------------

function setTool(id) {
  state.tool = id;
  // Picking a drawing tool lets go of the selection, so style choices set up
  // the next shape instead of restyling the last one.
  if (id !== "select") state.selected = new Set();
  canvas.style.cursor = id === "select" ? "default" : id === "text" ? "text" : "crosshair";
  refresh();
}

function selectAll() {
  if (!state.elements.length) return;
  state.selected = new Set(state.elements.map((e) => e.id));
  state.tool = "select";
  canvas.style.cursor = "default";
  syncStyleFromSelection();
  refresh();
}

function deleteSelected() {
  if (!selectedElements().length) return;
  const gone = state.selected;
  state.selected = new Set();
  commit(state.elements.filter((e) => !gone.has(e.id)));
}

function duplicateSelected() {
  const originals = selectedElements();
  if (!originals.length) return;
  // Each copy gets its own seed, so it is a sibling rather than a clone.
  const copies = originals.map(({ id, ...rest }) =>
    newElement(rest.type, { ...rest, x: rest.x + 18, y: rest.y + 18, seed: randomInteger() }),
  );
  state.selected = new Set(copies.map((e) => e.id));
  commit([...state.elements, ...copies]);
}

/** Reseed the selected shapes whose seed shows. The rest of the selection is left as it is. */
function reseedSelected() {
  const reseeds = (e) => state.selected.has(e.id) && seedShowsIn(e);
  if (!state.elements.some(reseeds)) return;
  commit(state.elements.map((e) => (reseeds(e) ? { ...e, seed: randomInteger() } : e)));
}

function clearBoard() {
  if (!state.elements.length) return;
  state.selected = new Set();
  commit([]);
}

/** Render the drawing, cropped to its content, into a PNG download. */
function exportPng() {
  if (!state.elements.length) return;
  const boxes = state.elements.map(bounds);
  const pad = 32;
  const x1 = Math.min(...boxes.map((b) => b[0])) - pad;
  const y1 = Math.min(...boxes.map((b) => b[1])) - pad;
  const x2 = Math.max(...boxes.map((b) => b[2])) + pad;
  const y2 = Math.max(...boxes.map((b) => b[3])) + pad;
  const scale = 2;
  const out = document.createElement("canvas");
  out.width = Math.ceil((x2 - x1) * scale);
  out.height = Math.ceil((y2 - y1) * scale);
  const octx = out.getContext("2d");
  octx.fillStyle = PAPER;
  octx.fillRect(0, 0, out.width, out.height);
  octx.setTransform(scale, 0, 0, scale, -x1 * scale, -y1 * scale);
  for (const element of state.elements) renderElement(octx, element);
  out.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "wobbleboard.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, "image/png");
}

// --- controls ----------------------------------------------------------------

for (const [id, label, key, icon] of TOOLS) {
  const button = document.createElement("button");
  button.dataset.tool = id;
  button.title = `${label} (${key})`;
  button.setAttribute("aria-label", label);
  button.innerHTML =
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>` +
    `<span class="label">${label}</span><kbd>${key}</kbd>`;
  button.addEventListener("click", () => setTool(id));
  $("tools").append(button);
}

for (const row of document.querySelectorAll("#style .row")) {
  const prop = row.dataset.prop;
  for (const [value, label] of CHOICES[prop]) {
    const button = document.createElement("button");
    button.dataset.value = JSON.stringify(value);
    if (label) {
      button.textContent = label;
      // Each font choice is shown in its own font, and Bold in bold.
      if (prop === "fontFamily") button.style.fontFamily = FONTS[value];
      if (prop === "bold" && value) button.style.fontWeight = "700";
    } else {
      button.className = value === "transparent" ? "swatch none" : "swatch";
      if (value !== "transparent") button.style.background = value;
      button.title = value === "transparent" ? "No background" : value;
      button.setAttribute("aria-label", button.title);
    }
    button.addEventListener("click", () => setStyle(prop, value));
    row.append(button);
  }
}

$("undo").addEventListener("click", () => travel(state.undo, state.redo));
$("redo").addEventListener("click", () => travel(state.redo, state.undo));
$("reseed").addEventListener("click", reseedSelected);
$("duplicate").addEventListener("click", duplicateSelected);
$("delete").addEventListener("click", deleteSelected);
$("export").addEventListener("click", exportPng);
$("clear").addEventListener("click", clearBoard);

window.addEventListener("keydown", (event) => {
  if (state.editing) return;
  const command = event.ctrlKey || event.metaKey;
  const key = (event.key || "").toLowerCase();
  if (command && key === "z") {
    event.preventDefault();
    if (event.shiftKey) travel(state.redo, state.undo);
    else travel(state.undo, state.redo);
  } else if (command && key === "y") {
    event.preventDefault();
    travel(state.redo, state.undo);
  } else if (command && key === "d") {
    event.preventDefault();
    duplicateSelected();
  } else if (command && key === "a") {
    event.preventDefault();
    selectAll();
  } else if (command) {
    return;
  } else if (key === "delete" || key === "backspace") {
    deleteSelected();
  } else if (key === "escape") {
    state.draft = null;
    state.marquee = null;
    state.selected = new Set();
    refresh();
  } else {
    const tool = TOOLS.find(([, , shortcut]) => shortcut === event.key);
    if (tool) setTool(tool[0]);
  }
});
window.addEventListener("resize", resize);

/**
 * Text is measured with whatever font is available at the time. Once the
 * bundled fonts have loaded, measure saved text again and repaint, so nothing
 * is left sized for a fallback font.
 */
function settleFonts() {
  if (!document.fonts) return;
  Promise.all(FONT_FACES.map((face) => document.fonts.load(face)))
    .catch(() => {
      // A font that fails to load just leaves its fallback in use.
    })
    .then(() => {
      let changed = false;
      state.elements = state.elements.map((element) => {
        if (element.type !== "text") return element;
        const box = placeText(element, element.text);
        if (box.width === element.width && box.height === element.height) return element;
        changed = true;
        return { ...element, ...box };
      });
      if (changed) save();
      if (state.editing) layoutEditor();
      refresh();
    });
}

load();
setTool(state.tool);
resize();
settleFonts();

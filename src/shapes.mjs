// The layer between a whiteboard element and the sketchy generator, rebuilt from
// the minified excalidraw.com bundle (assets/index-tsAfIkr7.js). It decides the
// generator options for each element and caches the generated shape.
// Bundle positions are "line:column"; see REPORT.md.

import { Random, RoughGenerator, drawShape } from "./rough.mjs";
import { getStroke, getStrokePoints, svgPathFromStroke } from "./freehand.mjs";
import { renderText } from "./text.mjs";

// Bundle 51:173 to 51:349 (`LE`, `Bee`, `Zt`, `F1`, `Lw`, `Fee`), 49:65584 (`aU`), 51:1338 (`f5`)
export const ROUGHNESS = { architect: 0, artist: 1, cartoonist: 2 };
export const STROKE_WIDTH = { thin: 1, medium: 2, bold: 4, extraBold: 8 };
// The pen uses its own, thinner scale. Bundle 51:349 (`Fee`, chosen by `fc`).
export const FREEDRAW_STROKE_WIDTH = { thin: 0.5, medium: 1, bold: 2, extraBold: 4 };
export const strokeWidthFor = (type, key) =>
  type === "freedraw" ? FREEDRAW_STROKE_WIDTH[key] : STROKE_WIDTH[key];
export const ROUNDNESS = { LEGACY: 1, PROPORTIONAL_RADIUS: 2, ADAPTIVE_RADIUS: 3 };
const DEFAULT_PROPORTIONAL_RADIUS = 0.25;
const DEFAULT_ADAPTIVE_RADIUS = 32;
const LINE_CONFIRM_THRESHOLD = 8;
const DEFAULT_STREAMLINE = 0.5;
// Bundle 87:2628 (`a1`)
const FREEDRAW = { SIZE_FACTOR: 4.25, THINNING: 0.6, SMOOTHING: 0.5 };

const isTransparent = (color) => !color || color === "transparent";
const isLinear = (type) => type === "arrow" || type === "line";
const canChangeRoundness = (type) =>
  type === "rectangle" || type === "line" || type === "diamond" || type === "image";

const dashedDashArray = (strokeWidth) => [8, 8 + strokeWidth];
const dottedDashArray = (strokeWidth) => [1.5, 6 + strokeWidth];

/** A line or pen stroke whose ends nearly meet counts as a closed, fillable loop. */
export function isPathALoop(points, zoom = 1) {
  if (points.length >= 3) {
    const [first, last] = [points[0], points[points.length - 1]];
    return Math.hypot(first[0] - last[0], first[1] - last[1]) <= LINE_CONFIRM_THRESHOLD / zoom;
  }
  return false;
}

/**
 * Does this element's seed change how it is drawn? Every wobble is scaled by
 * the roughness, so a roughness of 0 has none. Text has none either, and a pen
 * stroke only has it in the sketchy fill of a closed, filled loop.
 */
export function seedShowsIn(element) {
  if (element.type === "text" || element.roughness === 0) return false;
  if (element.type === "freedraw") return isPathALoop(element.points) && !isTransparent(element.backgroundColor);
  return true;
}

/** Small shapes are drawn less rough so they stay readable. Bundle 80:5707 (`ude`). */
export function adjustRoughness(element) {
  const roughness = element.roughness;
  const maxSize = Math.max(element.width, element.height);
  const minSize = Math.min(element.width, element.height);
  if (
    (minSize >= 20 && maxSize >= 50) ||
    (minSize >= 15 && !!element.roundness && canChangeRoundness(element.type)) ||
    (isLinear(element.type) && maxSize >= 50)
  ) {
    return roughness;
  }
  return Math.min(roughness / (maxSize < 10 ? 3 : 2), 2.5);
}

/** Generator options for one element. Bundle 80:5893 (`Ns`). */
export function generateRoughOptions(element, continuousPath = false) {
  const options = {
    seed: element.seed,
    strokeLineDash:
      element.strokeStyle === "dashed"
        ? dashedDashArray(element.strokeWidth)
        : element.strokeStyle === "dotted"
          ? dottedDashArray(element.strokeWidth)
          : undefined,
    // Dashed and dotted outlines are drawn once, slightly thicker, so the gaps stay clean.
    disableMultiStroke: element.strokeStyle !== "solid",
    strokeWidth: element.strokeStyle !== "solid" ? element.strokeWidth + 0.5 : element.strokeWidth,
    fillWeight: element.strokeWidth / 2,
    hachureGap: element.strokeWidth * 4,
    roughness: adjustRoughness(element),
    stroke: element.strokeColor,
    preserveVertices: continuousPath || element.roughness < ROUGHNESS.cartoonist,
  };
  switch (element.type) {
    case "rectangle":
    case "diamond":
    case "ellipse":
      options.fillStyle = element.fillStyle;
      options.fill = isTransparent(element.backgroundColor) ? undefined : element.backgroundColor;
      if (element.type === "ellipse") options.curveFitting = 1;
      return options;
    case "line":
    case "freedraw":
      if (isPathALoop(element.points)) {
        options.fillStyle = element.fillStyle;
        options.fill = element.backgroundColor === "transparent" ? undefined : element.backgroundColor;
      }
      return options;
    case "arrow":
      return options;
    default:
      throw new Error(`Unimplemented type ${element.type}`);
  }
}

/** Corner radius for a side of length x. Bundle 76:28578 (`sa`). */
export function cornerRadius(x, element) {
  const type = element.roundness && element.roundness.type;
  if (type === ROUNDNESS.PROPORTIONAL_RADIUS || type === ROUNDNESS.LEGACY) {
    return x * DEFAULT_PROPORTIONAL_RADIUS;
  }
  if (type === ROUNDNESS.ADAPTIVE_RADIUS) {
    const fixedRadius = element.roundness.value ?? DEFAULT_ADAPTIVE_RADIUS;
    const cutoff = fixedRadius / DEFAULT_PROPORTIONAL_RADIUS;
    return x <= cutoff ? x * DEFAULT_PROPORTIONAL_RADIUS : fixedRadius;
  }
  return 0;
}

/** Top, right, bottom and left corners of a diamond. Bundle 87:7371 (`j9`). */
export function diamondPoints(element) {
  const topX = Math.floor(element.width / 2) + 1;
  const topY = 0;
  const rightX = element.width;
  const rightY = Math.floor(element.height / 2) + 1;
  const bottomX = topX;
  const bottomY = element.height;
  const leftX = 0;
  const leftY = rightY;
  return [topX, topY, rightX, rightY, bottomX, bottomY, leftX, leftY];
}

/** Outline of a pen stroke, as an SVG path to fill. Bundle 87:2800 (`Ude`). */
export function freedrawOutlinePath(element) {
  const inputPoints = element.simulatePressure
    ? element.points
    : element.points.length
      ? element.points.map(([x, y], i) => [x, y, element.pressures[i]])
      : [[0, 0, 0.5]];
  const outline = getStroke(inputPoints, {
    simulatePressure: element.simulatePressure,
    size: element.strokeWidth * FREEDRAW.SIZE_FACTOR,
    thinning: FREEDRAW.THINNING,
    smoothing: FREEDRAW.SMOOTHING,
    streamline: DEFAULT_STREAMLINE,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    last: true,
  });
  return svgPathFromStroke(outline);
}

/**
 * Dashed or dotted pen stroke. This is a Wobbleboard addition, not from the
 * bundle: Excalidraw ignores the stroke style for pen strokes. The solid pen is
 * a filled outline, which cannot be dashed, so this strokes the smoothed centre
 * line with a dash pattern at about the width the solid stroke would have.
 */
export function freedrawDashedLine(element) {
  const size = element.strokeWidth * FREEDRAW.SIZE_FACTOR;
  const points = getStrokePoints(element.points, { size, streamline: DEFAULT_STREAMLINE, last: true }).map((p) => p.point);
  const lineWidth = size * 1.15;
  const dash = element.strokeStyle === "dashed" ? [lineWidth * 2.5, lineWidth * 2.2] : [0.01, lineWidth * 2];
  const fixed = ([x, y]) => +x.toFixed(2) + " " + +y.toFixed(2);
  let path = "M " + fixed(points[0]);
  for (let i = 1; i < points.length - 1; i++) {
    const mid = [(points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2];
    path += " Q " + fixed(points[i]) + ", " + fixed(mid);
  }
  if (points.length > 1) path += " L " + fixed(points[points.length - 1]);
  return { penLine: path, lineWidth, dash };
}

// Arrowhead geometry was not traced from the bundle; this is a plain two-line head.
function arrowheadLines(generator, element, options) {
  const points = element.points;
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  const length = Math.hypot(tip[0] - prev[0], tip[1] - prev[1]);
  if (!length) return [];
  const size = Math.min(30, length / 2);
  const angle = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
  const spread = (20 * Math.PI) / 180;
  // Bundle 80:7229 (`hd`): arrowheads are never dashed and at most roughness 1.
  const headOptions = { ...options, roughness: Math.min(1, options.roughness || 0) };
  delete headOptions.strokeLineDash;
  return [angle - spread, angle + spread].map((a) =>
    generator.line(tip[0] - size * Math.cos(a), tip[1] - size * Math.sin(a), tip[0], tip[1], headOptions),
  );
}

/** Build the drawable(s) for one element. Bundle 80:10779 (`gde`). */
function generateShape(element, generator) {
  switch (element.type) {
    case "rectangle": {
      if (element.roundness) {
        const w = element.width;
        const h = element.height;
        const r = cornerRadius(Math.min(w, h), element);
        return generator.path(
          `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h} L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0`,
          generateRoughOptions(element, true),
        );
      }
      return generator.rectangle(0, 0, element.width, element.height, generateRoughOptions(element, false));
    }
    case "diamond": {
      const [topX, topY, rightX, rightY, bottomX, bottomY, leftX, leftY] = diamondPoints(element);
      if (element.roundness) {
        const vr = cornerRadius(Math.abs(topX - leftX), element);
        const hr = cornerRadius(Math.abs(rightY - topY), element);
        return generator.path(
          `M ${topX + vr} ${topY + hr} L ${rightX - vr} ${rightY - hr} ` +
            `C ${rightX} ${rightY}, ${rightX} ${rightY}, ${rightX - vr} ${rightY + hr} ` +
            `L ${bottomX + vr} ${bottomY - hr} ` +
            `C ${bottomX} ${bottomY}, ${bottomX} ${bottomY}, ${bottomX - vr} ${bottomY - hr} ` +
            `L ${leftX + vr} ${leftY + hr} ` +
            `C ${leftX} ${leftY}, ${leftX} ${leftY}, ${leftX + vr} ${leftY - hr} ` +
            `L ${topX - vr} ${topY + hr} ` +
            `C ${topX} ${topY}, ${topX} ${topY}, ${topX + vr} ${topY + hr}`,
          generateRoughOptions(element, true),
        );
      }
      return generator.polygon(
        [[topX, topY], [rightX, rightY], [bottomX, bottomY], [leftX, leftY]],
        generateRoughOptions(element, false),
      );
    }
    case "ellipse":
      return generator.ellipse(
        element.width / 2, element.height / 2, element.width, element.height,
        generateRoughOptions(element, false),
      );
    case "line":
    case "arrow": {
      const options = generateRoughOptions(element, false);
      const points = element.points.length ? element.points : [[0, 0]];
      let shapes;
      if (element.roundness) shapes = [generator.curve(points, options)];
      else if (options.fill) shapes = [generator.polygon(points, options)];
      else shapes = [generator.linearPath(points, options)];
      if (element.type === "arrow" && points.length >= 2) {
        shapes.push(...arrowheadLines(generator, element, options));
      }
      return shapes;
    }
    case "freedraw": {
      const shapes = [];
      if (isPathALoop(element.points)) {
        // A closed pen loop gets a sketchy fill underneath the ink.
        shapes.push(generator.curve(element.points, { ...generateRoughOptions(element, false), stroke: "none" }));
      }
      shapes.push(element.strokeStyle === "solid" ? freedrawOutlinePath(element) : freedrawDashedLine(element));
      return shapes;
    }
    default:
      return null;
  }
}

/**
 * Shapes are generated once per element object and reused on every repaint.
 * Elements are replaced, not mutated, so a WeakMap keyed by the object is a
 * correct cache. Bundle 80:5088 (`ps`, the cache with `generateElementShape`).
 */
export class ShapeCache {
  static generator = new RoughGenerator();
  static cache = new WeakMap();

  static generateElementShape(element) {
    const cached = ShapeCache.cache.get(element);
    if (cached !== undefined) return cached;
    const shape = generateShape(element, ShapeCache.generator);
    ShapeCache.cache.set(element, shape);
    return shape;
  }
}

/** Paint one element at its position. Bundle 78:13205 (the per-type draw switch). */
export function renderElement(ctx, element) {
  ctx.save();
  ctx.translate(element.x, element.y);
  ctx.globalAlpha = element.opacity / 100;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (element.type === "text") {
    renderText(ctx, element);
    ctx.restore();
    return;
  }
  const shape = ShapeCache.generateElementShape(element);
  const shapes = Array.isArray(shape) ? shape : [shape];
  for (const item of shapes) {
    if (typeof item === "string") {
      ctx.fillStyle = element.strokeColor;
      ctx.fill(new Path2D(item));
    } else if (item && item.penLine) {
      ctx.strokeStyle = element.strokeColor;
      ctx.lineWidth = item.lineWidth;
      ctx.setLineDash(item.dash);
      ctx.stroke(new Path2D(item.penLine));
      ctx.setLineDash([]);
    } else if (item) {
      drawShape(ctx, item);
    }
  }
  ctx.restore();
}

export const DEFAULT_ELEMENT_PROPS = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: STROKE_WIDTH.medium,
  strokeStyle: "solid",
  roughness: ROUGHNESS.artist,
  opacity: 100,
};

// Bundle 52:678 (`Mte`, `io`): seeds come from the same generator class, seeded once with the clock.
const seedSource = new Random(Date.now());
export const randomInteger = () => Math.floor(seedSource.next() * 2 ** 31);

/** Every new element gets its own random seed, which fixes its wobble for good. */
export function newElement(type, props) {
  return {
    id: Math.random().toString(36).slice(2, 12),
    type,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    roundness: null,
    seed: randomInteger(),
    ...DEFAULT_ELEMENT_PROPS,
    ...props,
  };
}

/** Roundness type used when "round" edges are on. Bundle 154:253237 (`changeRoundness`). */
export const roundnessFor = (type) =>
  type === "rectangle" ? { type: ROUNDNESS.ADAPTIVE_RADIUS } : { type: ROUNDNESS.PROPORTIONAL_RADIUS };

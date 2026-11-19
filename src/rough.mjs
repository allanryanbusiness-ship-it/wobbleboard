// Sketchy shape generator, rebuilt from the minified excalidraw.com bundle
// (assets/index-tsAfIkr7.js, captured 2026-11-18 with REA). Bundle positions in
// the comments are "line:column" in that file; see REPORT.md for the evidence.
//
// The order of random draws matters: every wobble comes from one seeded
// generator per shape, so a shape with the same seed always looks the same.

const NONE = "none";

/** The generator library's own seed helper. Bundle 51:10799 (`dte`). */
export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Seeded generator. Bundle 51:10853 (`class $N`). A seed of 0 means "not seeded". */
export class Random {
  constructor(seed) {
    this.seed = seed;
  }
  next() {
    if (this.seed) {
      return ((2 ** 31 - 1) & (this.seed = Math.imul(48271, this.seed))) / 2 ** 31;
    }
    return Math.random();
  }
}

// --- randomness helpers. Bundle 67:42933 (`Qre`, `ZB`, `Ib`, `He`) ----------

function cloneOptionsAlterSeed(o) {
  const result = Object.assign({}, o);
  result.randomizer = undefined;
  if (o.seed) result.seed = o.seed + 1;
  return result;
}

function random(o) {
  if (!o.randomizer) o.randomizer = new Random(o.seed || 0);
  return o.randomizer.next();
}

function offset(min, max, o, roughnessGain = 1) {
  return o.roughness * roughnessGain * (random(o) * (max - min) + min);
}

function offsetOpt(x, o, roughnessGain = 1) {
  return offset(-x, x, o, roughnessGain);
}

// --- lines. Bundle 67:43222 (`Ul`), 67:43389 (`pC`) -------------------------------------

/** A line is drawn twice with different wobble unless multi-stroke is off. */
function doubleLine(x1, y1, x2, y2, o, filling = false) {
  const singleStroke = filling ? o.disableMultiStrokeFill : o.disableMultiStroke;
  const first = line(x1, y1, x2, y2, o, false);
  if (singleStroke) return first;
  return first.concat(line(x1, y1, x2, y2, o, true));
}

/** One wobbly stroke: a single cubic bezier bowed sideways, with jittered ends. */
function line(x1, y1, x2, y2, o, overlay) {
  const lengthSq = Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2);
  const length = Math.sqrt(lengthSq);
  // Long lines get proportionally less wobble.
  let roughnessGain = 1;
  if (length < 200) roughnessGain = 1;
  else if (length > 500) roughnessGain = 0.4;
  else roughnessGain = -0.0016668 * length + 1.233334;

  let maxOffset = o.maxRandomnessOffset || 0;
  if (maxOffset * maxOffset * 100 > lengthSq) maxOffset = length / 10;
  const halfOffset = maxOffset / 2;
  const divergePoint = 0.2 + random(o) * 0.2;
  let midDispX = (o.bowing * o.maxRandomnessOffset * (y2 - y1)) / 200;
  let midDispY = (o.bowing * o.maxRandomnessOffset * (x1 - x2)) / 200;
  midDispX = offsetOpt(midDispX, o, roughnessGain);
  midDispY = offsetOpt(midDispY, o, roughnessGain);

  const ops = [];
  const randomHalf = () => offsetOpt(halfOffset, o, roughnessGain);
  const randomFull = () => offsetOpt(maxOffset, o, roughnessGain);
  const preserveVertices = o.preserveVertices;
  const jitter = overlay ? randomHalf : randomFull;

  ops.push({
    op: "move",
    data: [x1 + (preserveVertices ? 0 : jitter()), y1 + (preserveVertices ? 0 : jitter())],
  });
  ops.push({
    op: "bcurveTo",
    data: [
      midDispX + x1 + (x2 - x1) * divergePoint + jitter(),
      midDispY + y1 + (y2 - y1) * divergePoint + jitter(),
      midDispX + x1 + 2 * (x2 - x1) * divergePoint + jitter(),
      midDispY + y1 + 2 * (y2 - y1) * divergePoint + jitter(),
      x2 + (preserveVertices ? 0 : jitter()),
      y2 + (preserveVertices ? 0 : jitter()),
    ],
  });
  return ops;
}

// Bundle 67:39874 (`jB`, `fU`, `Yre`)
function linearPath(points, close, o) {
  const len = (points || []).length;
  if (len > 2) {
    const ops = [];
    for (let i = 0; i < len - 1; i++) {
      ops.push(...doubleLine(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], o));
    }
    if (close) {
      ops.push(...doubleLine(points[len - 1][0], points[len - 1][1], points[0][0], points[0][1], o));
    }
    return { type: "path", ops };
  }
  if (len === 2) {
    return { type: "path", ops: doubleLine(points[0][0], points[0][1], points[1][0], points[1][1], o) };
  }
  return { type: "path", ops: [] };
}

function rectangleOutline(x, y, width, height, o) {
  return linearPath([[x, y], [x + width, y], [x + width, y + height], [x, y + height]], true, o);
}

// --- curves. Bundle line 67 (`hC`, `UC`, `Cb`, between `Yre` and `bC`) -------------------

function curve(points, o) {
  let ops = curveWithOffset(points, 1 * (1 + o.roughness * 0.2), o);
  if (!o.disableMultiStroke) {
    const second = curveWithOffset(points, 1.5 * (1 + o.roughness * 0.22), cloneOptionsAlterSeed(o));
    ops = ops.concat(second);
  }
  return { type: "path", ops };
}

function curveWithOffset(points, amount, o) {
  const jittered = [];
  jittered.push([points[0][0] + offsetOpt(amount, o), points[0][1] + offsetOpt(amount, o)]);
  jittered.push([points[0][0] + offsetOpt(amount, o), points[0][1] + offsetOpt(amount, o)]);
  for (let i = 1; i < points.length; i++) {
    jittered.push([points[i][0] + offsetOpt(amount, o), points[i][1] + offsetOpt(amount, o)]);
    if (i === points.length - 1) {
      jittered.push([points[i][0] + offsetOpt(amount, o), points[i][1] + offsetOpt(amount, o)]);
    }
  }
  return splineThrough(jittered, o);
}

/** Catmull-Rom style spline through the points, emitted as cubic beziers. */
function splineThrough(points, o) {
  const len = points.length;
  const ops = [];
  if (len > 3) {
    const s = 1 - o.curveTightness;
    ops.push({ op: "move", data: [points[1][0], points[1][1]] });
    for (let i = 1; i + 2 < len; i++) {
      const p = points[i];
      const c1 = [
        p[0] + (s * points[i + 1][0] - s * points[i - 1][0]) / 6,
        p[1] + (s * points[i + 1][1] - s * points[i - 1][1]) / 6,
      ];
      const c2 = [
        points[i + 1][0] + (s * points[i][0] - s * points[i + 2][0]) / 6,
        points[i + 1][1] + (s * points[i][1] - s * points[i + 2][1]) / 6,
      ];
      const end = [points[i + 1][0], points[i + 1][1]];
      ops.push({ op: "bcurveTo", data: [c1[0], c1[1], c2[0], c2[1], end[0], end[1]] });
    }
  } else if (len === 3) {
    ops.push({ op: "move", data: [points[1][0], points[1][1]] });
    ops.push({
      op: "bcurveTo",
      data: [points[1][0], points[1][1], points[2][0], points[2][1], points[2][0], points[2][1]],
    });
  } else if (len === 2) {
    ops.push(...doubleLine(points[0][0], points[0][1], points[1][0], points[1][1], o));
  }
  return ops;
}

// --- ellipses. Bundle 67:40588 (`KB`, `N7`), 67:45048 (`bC`) -----------------

function ellipseParams(width, height, o) {
  const psq = Math.sqrt(Math.PI * 2 * Math.sqrt((Math.pow(width / 2, 2) + Math.pow(height / 2, 2)) / 2));
  const stepCount = Math.ceil(Math.max(o.curveStepCount, (o.curveStepCount / Math.sqrt(200)) * psq));
  const increment = (Math.PI * 2) / stepCount;
  let rx = Math.abs(width / 2);
  let ry = Math.abs(height / 2);
  const curveFitRandomness = 1 - o.curveFitting;
  rx += offsetOpt(rx * curveFitRandomness, o);
  ry += offsetOpt(ry * curveFitRandomness, o);
  return { increment, rx, ry };
}

function ellipseWithParams(x, y, o, params) {
  const [allPoints, corePoints] = ellipsePoints(
    params.increment, x, y, params.rx, params.ry, 1,
    params.increment * offset(0.1, offset(0.4, 1, o), o), o,
  );
  let ops = splineThrough(allPoints, o);
  if (!o.disableMultiStroke && o.roughness !== 0) {
    const [second] = ellipsePoints(params.increment, x, y, params.rx, params.ry, 1.5, 0, o);
    ops = ops.concat(splineThrough(second, o));
  }
  return { estimatedPoints: corePoints, opset: { type: "path", ops } };
}

/**
 * Points around an ellipse. The rough version starts at a random angle, jitters
 * every point, and overshoots the start so the stroke overlaps itself.
 */
function ellipsePoints(increment, cx, cy, rx, ry, amount, overlap, o) {
  const corePoints = [];
  const allPoints = [];
  if (o.roughness === 0) {
    increment = increment / 4;
    allPoints.push([cx + rx * Math.cos(-increment), cy + ry * Math.sin(-increment)]);
    for (let angle = 0; angle <= Math.PI * 2; angle = angle + increment) {
      const p = [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
      corePoints.push(p);
      allPoints.push(p);
    }
    allPoints.push([cx + rx * Math.cos(0), cy + ry * Math.sin(0)]);
    allPoints.push([cx + rx * Math.cos(increment), cy + ry * Math.sin(increment)]);
  } else {
    const start = offsetOpt(0.5, o) - Math.PI / 2;
    allPoints.push([
      offsetOpt(amount, o) + cx + 0.9 * rx * Math.cos(start - increment),
      offsetOpt(amount, o) + cy + 0.9 * ry * Math.sin(start - increment),
    ]);
    const end = Math.PI * 2 + start - 0.01;
    for (let angle = start; angle < end; angle = angle + increment) {
      const p = [
        offsetOpt(amount, o) + cx + rx * Math.cos(angle),
        offsetOpt(amount, o) + cy + ry * Math.sin(angle),
      ];
      corePoints.push(p);
      allPoints.push(p);
    }
    allPoints.push([
      offsetOpt(amount, o) + cx + rx * Math.cos(start + Math.PI * 2 + overlap * 0.5),
      offsetOpt(amount, o) + cy + ry * Math.sin(start + Math.PI * 2 + overlap * 0.5),
    ]);
    allPoints.push([
      offsetOpt(amount, o) + cx + 0.98 * rx * Math.cos(start + overlap),
      offsetOpt(amount, o) + cy + 0.98 * ry * Math.sin(start + overlap),
    ]);
    allPoints.push([
      offsetOpt(amount, o) + cx + 0.9 * rx * Math.cos(start + overlap * 0.5),
      offsetOpt(amount, o) + cy + 0.9 * ry * Math.sin(start + overlap * 0.5),
    ]);
  }
  return [allPoints, corePoints];
}

// --- SVG path input. Bundle 67:37329 (`YB`), 67:41741 (`mC`), 67:46122 (`Jre`)
// Only the absolute commands Excalidraw itself emits are parsed: M L Q C Z.

const ARGS = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

function parseAbsolutePath(d) {
  const tokens = d.match(/[MLQCZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const segments = [];
  let i = 0;
  while (i < tokens.length) {
    const key = tokens[i++];
    const count = ARGS[key];
    if (count === undefined) throw new Error(`Unsupported path command near "${key}"`);
    const data = tokens.slice(i, i + count).map(Number);
    i += count;
    segments.push({ key, data });
  }
  return segments;
}

/** Turn quadratic segments into cubic ones, so only M, L, C and Z remain. */
function normalizePath(segments) {
  const out = [];
  let cx = 0, cy = 0, subx = 0, suby = 0;
  for (const { key, data } of segments) {
    switch (key) {
      case "M":
        out.push({ key: "M", data: [...data] });
        [cx, cy] = data;
        [subx, suby] = data;
        break;
      case "L":
        out.push({ key: "L", data: [...data] });
        [cx, cy] = data;
        break;
      case "C":
        out.push({ key: "C", data: [...data] });
        cx = data[4];
        cy = data[5];
        break;
      case "Q": {
        const [x1, y1, x, y] = data;
        const cx1 = cx + (2 * (x1 - cx)) / 3;
        const cy1 = cy + (2 * (y1 - cy)) / 3;
        const cx2 = x + (2 * (x1 - x)) / 3;
        const cy2 = y + (2 * (y1 - y)) / 3;
        out.push({ key: "C", data: [cx1, cy1, cx2, cy2, x, y] });
        cx = x;
        cy = y;
        break;
      }
      case "Z":
        out.push({ key: "Z", data: [] });
        cx = subx;
        cy = suby;
        break;
    }
  }
  return out;
}

function svgPath(d, o) {
  const segments = normalizePath(parseAbsolutePath(d));
  const ops = [];
  let first = [0, 0];
  let current = [0, 0];
  for (const { key, data } of segments) {
    switch (key) {
      case "M":
        current = [data[0], data[1]];
        first = [data[0], data[1]];
        break;
      case "L":
        ops.push(...doubleLine(current[0], current[1], data[0], data[1], o));
        current = [data[0], data[1]];
        break;
      case "C": {
        const [x1, y1, x2, y2, x, y] = data;
        ops.push(...bezierTo(x1, y1, x2, y2, x, y, current, o));
        current = [x, y];
        break;
      }
      case "Z":
        ops.push(...doubleLine(current[0], current[1], first[0], first[1], o));
        current = [first[0], first[1]];
        break;
    }
  }
  return { type: "path", ops };
}

function bezierTo(x1, y1, x2, y2, x, y, current, o) {
  const ops = [];
  const ros = [o.maxRandomnessOffset || 1, (o.maxRandomnessOffset || 1) + 0.3];
  let end = [0, 0];
  const iterations = o.disableMultiStroke ? 1 : 2;
  const preserveVertices = o.preserveVertices;
  for (let i = 0; i < iterations; i++) {
    if (i === 0) {
      ops.push({ op: "move", data: [current[0], current[1]] });
    } else {
      ops.push({
        op: "move",
        data: [
          current[0] + (preserveVertices ? 0 : offsetOpt(ros[0], o)),
          current[1] + (preserveVertices ? 0 : offsetOpt(ros[0], o)),
        ],
      });
    }
    end = preserveVertices ? [x, y] : [x + offsetOpt(ros[i], o), y + offsetOpt(ros[i], o)];
    ops.push({
      op: "bcurveTo",
      data: [
        x1 + offsetOpt(ros[i], o), y1 + offsetOpt(ros[i], o),
        x2 + offsetOpt(ros[i], o), y2 + offsetOpt(ros[i], o),
        end[0], end[1],
      ],
    });
  }
  return ops;
}

// --- flattening curves to points, for fills. Bundle 67:47512 (`nae`), 67:47725 (`B7`)

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const distanceSq = (a, b) => Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2);
const distance = (a, b) => Math.sqrt(distanceSq(a, b));

function distanceToSegmentSq(p, v, w) {
  const l2 = distanceSq(v, w);
  if (l2 === 0) return distanceSq(p, v);
  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  return distanceSq(p, lerp(v, w, t));
}

function flatness(points, offsetIndex) {
  const p1 = points[offsetIndex + 0];
  const p2 = points[offsetIndex + 1];
  const p3 = points[offsetIndex + 2];
  const p4 = points[offsetIndex + 3];
  let ux = 3 * p2[0] - 2 * p1[0] - p4[0];
  ux *= ux;
  let uy = 3 * p2[1] - 2 * p1[1] - p4[1];
  uy *= uy;
  let vx = 3 * p3[0] - 2 * p4[0] - p1[0];
  vx *= vx;
  let vy = 3 * p3[1] - 2 * p4[1] - p1[1];
  vy *= vy;
  if (ux < vx) ux = vx;
  if (uy < vy) uy = vy;
  return ux + uy;
}

function bezierPoints(points, offsetIndex, tolerance, out) {
  const result = out || [];
  if (flatness(points, offsetIndex) < tolerance) {
    const p0 = points[offsetIndex + 0];
    if (result.length) {
      if (distance(result[result.length - 1], p0) > 1) result.push(p0);
    } else {
      result.push(p0);
    }
    result.push(points[offsetIndex + 3]);
  } else {
    const p1 = points[offsetIndex + 0];
    const p2 = points[offsetIndex + 1];
    const p3 = points[offsetIndex + 2];
    const p4 = points[offsetIndex + 3];
    const q1 = lerp(p1, p2, 0.5);
    const q2 = lerp(p2, p3, 0.5);
    const q3 = lerp(p3, p4, 0.5);
    const r1 = lerp(q1, q2, 0.5);
    const r2 = lerp(q2, q3, 0.5);
    const red = lerp(r1, r2, 0.5);
    bezierPoints([p1, q1, r1, red], 0, tolerance, result);
    bezierPoints([red, r2, q3, p4], 0, tolerance, result);
  }
  return result;
}

/** Ramer-Douglas-Peucker simplification. */
function simplifyPoints(points, start, end, epsilon, out) {
  const result = out || [];
  const s = points[start];
  const e = points[end - 1];
  let maxDistSq = 0;
  let maxIndex = 1;
  for (let i = start + 1; i < end - 1; ++i) {
    const d = distanceToSegmentSq(points[i], s, e);
    if (d > maxDistSq) {
      maxDistSq = d;
      maxIndex = i;
    }
  }
  if (Math.sqrt(maxDistSq) > epsilon) {
    simplifyPoints(points, start, maxIndex + 1, epsilon, result);
    simplifyPoints(points, maxIndex, end, epsilon, result);
  } else {
    if (!result.length) result.push(s);
    result.push(e);
  }
  return result;
}

function pointsOnBezierCurves(points, tolerance = 0.15, epsilon) {
  const result = [];
  const numSegments = (points.length - 1) / 3;
  for (let i = 0; i < numSegments; i++) bezierPoints(points, i * 3, tolerance, result);
  if (epsilon && epsilon > 0) return simplifyPoints(result, 0, result.length, epsilon);
  return result;
}

function pointsOnPath(d, tolerance, epsilon) {
  const segments = normalizePath(parseAbsolutePath(d));
  const sets = [];
  let currentPoints = [];
  let start = [0, 0];
  let pendingCurve = [];
  const appendPendingCurve = () => {
    if (pendingCurve.length >= 4) currentPoints.push(...pointsOnBezierCurves(pendingCurve, tolerance));
    pendingCurve = [];
  };
  const appendPendingPoints = () => {
    appendPendingCurve();
    if (currentPoints.length) {
      sets.push(currentPoints);
      currentPoints = [];
    }
  };
  for (const { key, data } of segments) {
    switch (key) {
      case "M":
        appendPendingPoints();
        start = [data[0], data[1]];
        currentPoints.push(start);
        break;
      case "L":
        appendPendingCurve();
        currentPoints.push([data[0], data[1]]);
        break;
      case "C":
        if (!pendingCurve.length) {
          const last = currentPoints.length ? currentPoints[currentPoints.length - 1] : start;
          pendingCurve.push([last[0], last[1]]);
        }
        pendingCurve.push([data[0], data[1]]);
        pendingCurve.push([data[2], data[3]]);
        pendingCurve.push([data[4], data[5]]);
        break;
      case "Z":
        appendPendingCurve();
        currentPoints.push([start[0], start[1]]);
        break;
    }
  }
  appendPendingPoints();
  if (!epsilon) return sets;
  const out = [];
  for (const set of sets) {
    const simplified = simplifyPoints(set, 0, set.length, epsilon);
    if (simplified.length) out.push(simplified);
  }
  return out;
}

/** Control points of the spline that `curve` draws. Bundle 67:46590 (`qB`). */
function curveToBezier(points, curveTightness = 0) {
  const len = points.length;
  if (len < 3) throw new Error("A curve must have at least three points.");
  const out = [];
  const copy = (p) => [...p];
  if (len === 3) {
    out.push(copy(points[0]), copy(points[1]), copy(points[2]), copy(points[2]));
  } else {
    const padded = [];
    padded.push(points[0], points[0]);
    for (let i = 1; i < points.length; i++) {
      padded.push(points[i]);
      if (i === points.length - 1) padded.push(points[i]);
    }
    const s = 1 - curveTightness;
    out.push(copy(padded[0]));
    for (let i = 1; i + 2 < padded.length; i++) {
      const p = padded[i];
      const c1 = [
        p[0] + (s * padded[i + 1][0] - s * padded[i - 1][0]) / 6,
        p[1] + (s * padded[i + 1][1] - s * padded[i - 1][1]) / 6,
      ];
      const c2 = [
        padded[i + 1][0] + (s * padded[i][0] - s * padded[i + 2][0]) / 6,
        padded[i + 1][1] + (s * padded[i][1] - s * padded[i + 2][1]) / 6,
      ];
      const end = [padded[i + 1][0], padded[i + 1][1]];
      out.push(c1, c2, end);
    }
  }
  return out;
}

// --- fills. Bundle 67:30198 (`Dre`), 67:31263 (`op`), 67:31501 (`t9`), 67:34511 (`zre`)

function solidFillPolygon(polygons, o) {
  const ops = [];
  for (const points of polygons) {
    if (!points.length) continue;
    const amount = o.maxRandomnessOffset || 0;
    const len = points.length;
    if (len > 2) {
      ops.push({ op: "move", data: [points[0][0] + offsetOpt(amount, o), points[0][1] + offsetOpt(amount, o)] });
      for (let i = 1; i < len; i++) {
        ops.push({ op: "lineTo", data: [points[i][0] + offsetOpt(amount, o), points[i][1] + offsetOpt(amount, o)] });
      }
    }
  }
  return { type: "fillPath", ops };
}

function rotatePoints(points, center, degrees) {
  if (points && points.length) {
    const [cx, cy] = center;
    const angle = (Math.PI / 180) * degrees;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const p of points) {
      const [x, y] = p;
      p[0] = (x - cx) * cos - (y - cy) * sin + cx;
      p[1] = (x - cx) * sin + (y - cy) * cos + cy;
    }
  }
}

function rotateLines(lines, center, degrees) {
  const points = [];
  lines.forEach((l) => points.push(...l));
  rotatePoints(points, center, degrees);
}

const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

/**
 * Hachure lines for a polygon: rotate the polygon so the hatch direction is
 * horizontal, sweep scanlines across it, then rotate the lines back.
 */
function hachureLines(polygons, hachureGap, hachureAngle, hachureStepOffset = 1) {
  const angle = hachureAngle;
  const gap = Math.max(hachureGap, 0.1);
  const polygonList = polygons[0] && polygons[0][0] && typeof polygons[0][0] === "number" ? [polygons] : polygons;
  const rotationCenter = [0, 0];
  if (angle) for (const polygon of polygonList) rotatePoints(polygon, rotationCenter, angle);
  const lines = scanlines(polygonList, gap, hachureStepOffset);
  if (angle) {
    for (const polygon of polygonList) rotatePoints(polygon, rotationCenter, -angle);
    rotateLines(lines, rotationCenter, -angle);
  }
  return lines;
}

function scanlines(polygons, gap, hachureStepOffset) {
  const vertexArray = [];
  for (const polygon of polygons) {
    const vertices = [...polygon];
    if (!samePoint(vertices[0], vertices[vertices.length - 1])) vertices.push([vertices[0][0], vertices[0][1]]);
    if (vertices.length > 2) vertexArray.push(vertices);
  }
  const lines = [];
  gap = Math.max(gap, 0.1);

  const edges = [];
  for (const vertices of vertexArray) {
    for (let i = 0; i < vertices.length - 1; i++) {
      const p1 = vertices[i];
      const p2 = vertices[i + 1];
      if (p1[1] !== p2[1]) {
        const ymin = Math.min(p1[1], p2[1]);
        edges.push({
          ymin,
          ymax: Math.max(p1[1], p2[1]),
          x: ymin === p1[1] ? p1[0] : p2[0],
          islope: (p2[0] - p1[0]) / (p2[1] - p1[1]),
        });
      }
    }
  }
  edges.sort((e1, e2) => {
    if (e1.ymin < e2.ymin) return -1;
    if (e1.ymin > e2.ymin) return 1;
    if (e1.x < e2.x) return -1;
    if (e1.x > e2.x) return 1;
    if (e1.ymax === e2.ymax) return 0;
    return (e1.ymax - e2.ymax) / Math.abs(e1.ymax - e2.ymax);
  });
  if (!edges.length) return lines;

  let activeEdges = [];
  let y = edges[0].ymin;
  let iteration = 0;
  while (activeEdges.length || edges.length) {
    if (edges.length) {
      let ix = -1;
      for (let i = 0; i < edges.length; i++) {
        if (edges[i].ymin > y) break;
        ix = i;
      }
      edges.splice(0, ix + 1).forEach((edge) => activeEdges.push({ s: y, edge }));
    }
    activeEdges = activeEdges.filter((ae) => !(ae.edge.ymax <= y));
    activeEdges.sort((a, b) => (a.edge.x === b.edge.x ? 0 : (a.edge.x - b.edge.x) / Math.abs(a.edge.x - b.edge.x)));
    if ((hachureStepOffset !== 1 || iteration % gap === 0) && activeEdges.length > 1) {
      for (let i = 0; i < activeEdges.length; i = i + 2) {
        const next = i + 1;
        if (next >= activeEdges.length) break;
        const ce = activeEdges[i].edge;
        const ne = activeEdges[next].edge;
        lines.push([[Math.round(ce.x), y], [Math.round(ne.x), y]]);
      }
    }
    y += hachureStepOffset;
    activeEdges.forEach((ae) => {
      ae.edge.x = ae.edge.x + hachureStepOffset * ae.edge.islope;
    });
    iteration++;
  }
  return lines;
}

function polygonHachureLines(polygons, o) {
  const angle = o.hachureAngle + 90;
  let gap = o.hachureGap;
  if (gap < 0) gap = o.strokeWidth * 4;
  gap = Math.max(gap, 0.1);
  let skipOffset = 1;
  // About 30% of rough shapes sweep one scanline per gap instead of per pixel.
  if (o.roughness >= 1) {
    if (((o.randomizer ? o.randomizer.next() : undefined) || Math.random()) > 0.7) skipOffset = gap;
  }
  return hachureLines(polygons, gap, angle, skipOffset || 1);
}

const segmentLength = (l) => Math.sqrt(Math.pow(l[0][0] - l[1][0], 2) + Math.pow(l[0][1] - l[1][1], 2));

function renderLines(lines, o) {
  const ops = [];
  for (const l of lines) ops.push(...doubleLine(l[0][0], l[0][1], l[1][0], l[1][1], o, true));
  return ops;
}

const fillers = {
  hachure(polygons, o) {
    return { type: "fillSketch", ops: renderLines(polygonHachureLines(polygons, o), o) };
  },
  "cross-hatch"(polygons, o) {
    const first = fillers.hachure(polygons, o);
    const second = fillers.hachure(polygons, Object.assign({}, o, { hachureAngle: o.hachureAngle + 90 }));
    first.ops = first.ops.concat(second.ops);
    return first;
  },
  zigzag(polygons, o) {
    let gap = o.hachureGap;
    if (gap < 0) gap = o.strokeWidth * 4;
    gap = Math.max(gap, 0.1);
    const lines = polygonHachureLines(polygons, Object.assign({}, o, { hachureGap: gap }));
    const zigzagAngle = (Math.PI / 180) * o.hachureAngle;
    const zigzagLines = [];
    const dgx = gap * 0.5 * Math.cos(zigzagAngle);
    const dgy = gap * 0.5 * Math.sin(zigzagAngle);
    for (const [p1, p2] of lines) {
      if (segmentLength([p1, p2])) {
        zigzagLines.push([[p1[0] - dgx, p1[1] + dgy], [...p2]], [[p1[0] + dgx, p1[1] - dgy], [...p2]]);
      }
    }
    return { type: "fillSketch", ops: renderLines(zigzagLines, o) };
  },
};

function patternFillPolygons(polygons, o) {
  const filler = fillers[o.fillStyle] || fillers.hachure;
  return filler(polygons, o);
}

// --- generator. Bundle 67:48990 (`class fu`) ---------------------------------

const mergedShape = (ops) => ops.filter((op, i) => (i === 0 ? true : op.op !== "move"));

export class RoughGenerator {
  constructor() {
    this.defaultOptions = {
      maxRandomnessOffset: 2,
      roughness: 1,
      bowing: 1,
      stroke: "#000",
      strokeWidth: 1,
      curveTightness: 0,
      curveFitting: 0.95,
      curveStepCount: 9,
      fillStyle: "hachure",
      fillWeight: -1,
      hachureAngle: -41,
      hachureGap: -1,
      dashOffset: -1,
      dashGap: -1,
      zigzagOffset: -1,
      seed: 0,
      disableMultiStroke: false,
      disableMultiStrokeFill: false,
      preserveVertices: false,
      fillShapeRoughnessGain: 0.8,
    };
  }

  _o(options) {
    return options ? Object.assign({}, this.defaultOptions, options) : this.defaultOptions;
  }

  _d(shape, sets, options) {
    return { shape, sets: sets || [], options: options || this.defaultOptions };
  }

  line(x1, y1, x2, y2, options) {
    const o = this._o(options);
    return this._d("line", [{ type: "path", ops: doubleLine(x1, y1, x2, y2, o) }], o);
  }

  rectangle(x, y, width, height, options) {
    const o = this._o(options);
    const paths = [];
    // The outline is generated first, so it uses the first random numbers.
    const outline = rectangleOutline(x, y, width, height, o);
    if (o.fill) {
      const points = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
      if (o.fillStyle === "solid") paths.push(solidFillPolygon([points], o));
      else paths.push(patternFillPolygons([points], o));
    }
    if (o.stroke !== NONE) paths.push(outline);
    return this._d("rectangle", paths, o);
  }

  ellipse(x, y, width, height, options) {
    const o = this._o(options);
    const paths = [];
    const params = ellipseParams(width, height, o);
    const response = ellipseWithParams(x, y, o, params);
    if (o.fill) {
      if (o.fillStyle === "solid") {
        const shape = ellipseWithParams(x, y, o, params).opset;
        shape.type = "fillPath";
        paths.push(shape);
      } else {
        paths.push(patternFillPolygons([response.estimatedPoints], o));
      }
    }
    if (o.stroke !== NONE) paths.push(response.opset);
    return this._d("ellipse", paths, o);
  }

  linearPath(points, options) {
    const o = this._o(options);
    return this._d("linearPath", [linearPath(points, false, o)], o);
  }

  polygon(points, options) {
    const o = this._o(options);
    const paths = [];
    const outline = linearPath(points, true, o);
    if (o.fill) {
      if (o.fillStyle === "solid") paths.push(solidFillPolygon([points], o));
      else paths.push(patternFillPolygons([points], o));
    }
    if (o.stroke !== NONE) paths.push(outline);
    return this._d("polygon", paths, o);
  }

  curve(points, options) {
    const o = this._o(options);
    const paths = [];
    const outline = curve(points, o);
    if (o.fill && o.fill !== NONE && points.length >= 3) {
      if (o.fillStyle === "solid") {
        const fillShape = curve(
          points,
          Object.assign(Object.assign({}, o), {
            disableMultiStroke: true,
            roughness: o.roughness ? o.roughness + o.fillShapeRoughnessGain : 0,
          }),
        );
        paths.push({ type: "fillPath", ops: mergedShape(fillShape.ops) });
      } else {
        const bezier = curveToBezier(points);
        const polyPoints = pointsOnBezierCurves(bezier, 10, (1 + o.roughness) / 2);
        paths.push(patternFillPolygons([polyPoints], o));
      }
    }
    if (o.stroke !== NONE) paths.push(outline);
    return this._d("curve", paths, o);
  }

  path(d, options) {
    const o = this._o(options);
    const paths = [];
    if (!d) return this._d("path", paths, o);
    d = (d || "").replace(/\n/g, " ").replace(/(-\s)/g, "-");
    const hasFill = o.fill && o.fill !== "transparent" && o.fill !== NONE;
    const hasStroke = o.stroke !== NONE;
    const simplified = !!(o.simplification && o.simplification < 1);
    const epsilon = simplified ? 4 - 4 * (o.simplification || 1) : (1 + o.roughness) / 2;
    const sets = pointsOnPath(d, 1, epsilon);
    const shape = svgPath(d, o);
    if (hasFill) {
      if (o.fillStyle === "solid") {
        if (sets.length === 1) {
          const fillShape = svgPath(
            d,
            Object.assign(Object.assign({}, o), {
              disableMultiStroke: true,
              roughness: o.roughness ? o.roughness + o.fillShapeRoughnessGain : 0,
            }),
          );
          paths.push({ type: "fillPath", ops: mergedShape(fillShape.ops) });
        } else {
          paths.push(solidFillPolygon(sets, o));
        }
      } else {
        paths.push(patternFillPolygons(sets, o));
      }
    }
    if (hasStroke) {
      if (simplified) sets.forEach((set) => paths.push(linearPath(set, false, o)));
      else paths.push(shape);
    }
    return this._d("path", paths, o);
  }
}

// --- canvas drawing. Bundle 67:52775 (`class sae`) ---------------------------

function drawOps(ctx, set, rule = "nonzero") {
  ctx.beginPath();
  for (const item of set.ops) {
    const data = item.data;
    switch (item.op) {
      case "move":
        ctx.moveTo(data[0], data[1]);
        break;
      case "bcurveTo":
        ctx.bezierCurveTo(data[0], data[1], data[2], data[3], data[4], data[5]);
        break;
      case "lineTo":
        ctx.lineTo(data[0], data[1]);
        break;
    }
  }
  if (set.type === "fillPath") ctx.fill(rule);
  else ctx.stroke();
}

/** Paint a generated shape: solid fills, then hatch lines, then the outline. */
export function drawShape(ctx, drawable) {
  const sets = drawable.sets || [];
  const o = drawable.options;
  for (const set of sets) {
    switch (set.type) {
      case "path":
        ctx.save();
        ctx.strokeStyle = o.stroke === "none" ? "transparent" : o.stroke;
        ctx.lineWidth = o.strokeWidth;
        if (o.strokeLineDash) ctx.setLineDash(o.strokeLineDash);
        if (o.strokeLineDashOffset) ctx.lineDashOffset = o.strokeLineDashOffset;
        drawOps(ctx, set);
        ctx.restore();
        break;
      case "fillPath": {
        ctx.save();
        ctx.fillStyle = o.fill || "";
        const rule =
          drawable.shape === "curve" || drawable.shape === "polygon" || drawable.shape === "path"
            ? "evenodd"
            : "nonzero";
        drawOps(ctx, set, rule);
        ctx.restore();
        break;
      }
      case "fillSketch": {
        let fillWeight = o.fillWeight;
        if (fillWeight < 0) fillWeight = o.strokeWidth / 2;
        ctx.save();
        ctx.strokeStyle = o.fill || "";
        ctx.lineWidth = fillWeight;
        drawOps(ctx, set);
        ctx.restore();
        break;
      }
    }
  }
}

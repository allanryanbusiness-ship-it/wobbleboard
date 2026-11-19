// Pressure-shaped freehand stroke outline, rebuilt from the minified
// excalidraw.com bundle (assets/index-tsAfIkr7.js). A pen stroke is not stroked
// as a line: its outline polygon is computed and then filled.
// Bundle 67:59849 (`yae`), 67:61936 (`eF`, `Eae`); the vector helpers sit just before `yae`.

const neg = (a) => [-a[0], -a[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, n) => [a[0] * n, a[1] * n];
const div = (a, n) => [a[0] / n, a[1] / n];
const per = (a) => [a[1], -a[0]];
const dpr = (a, b) => a[0] * b[0] + a[1] * b[1];
const isEqual = (a, b) => a[0] === b[0] && a[1] === b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const len2 = (a) => a[0] * a[0] + a[1] * a[1];
const dist2 = (a, b) => len2(sub(a, b));
const uni = (a) => div(a, len(a));
const dist = (a, b) => Math.hypot(a[1] - b[1], a[0] - b[0]);
const lrp = (a, b, t) => add(a, mul(sub(b, a), t));
const prj = (a, b, c) => add(a, mul(b, c));

function rotAround(a, center, r) {
  const s = Math.sin(r);
  const c = Math.cos(r);
  const px = a[0] - center[0];
  const py = a[1] - center[1];
  return [px * c - py * s + center[0], px * s + py * c + center[1]];
}

const { min, PI } = Math;
const RATE_OF_PRESSURE_CHANGE = 0.275;
const FIXED_PI = PI + 0.0001;

const strokeRadius = (size, thinning, pressure, easing = (t) => t) =>
  size * easing(0.5 - thinning * (0.5 - pressure));

/**
 * Smooth the raw pointer samples: each point is pulled only part of the way
 * toward the next sample (`streamline`), and gets a direction and a running
 * length.
 */
export function getStrokePoints(points, options = {}) {
  const { streamline = 0.5, size = 16, last: isComplete = false } = options;
  if (points.length === 0) return [];
  const t = 0.15 + (1 - streamline) * 0.85;
  let pts = Array.isArray(points[0]) ? points : points.map(({ x, y, pressure = 0.5 }) => [x, y, pressure]);

  if (pts.length === 2) {
    const last = pts[1];
    pts = pts.slice(0, -1);
    for (let i = 1; i < 5; i++) pts.push(lrp(pts[0], last, i / 4));
  }
  if (pts.length === 1) pts = [...pts, [...add(pts[0], [1, 1]), ...pts[0].slice(2)]];

  const strokePoints = [
    {
      point: [pts[0][0], pts[0][1]],
      pressure: pts[0][2] >= 0 ? pts[0][2] : 0.25,
      vector: [1, 1],
      distance: 0,
      runningLength: 0,
    },
  ];
  let hasReachedMinimumLength = false;
  let runningLength = 0;
  let prev = strokePoints[0];
  const max = pts.length - 1;
  for (let i = 1; i < pts.length; i++) {
    const point = isComplete && i === max ? pts[i].slice(0, 2) : lrp(prev.point, pts[i], t);
    if (isEqual(prev.point, point)) continue;
    const distance = dist(point, prev.point);
    runningLength += distance;
    // Skip the noisy first few pixels of a stroke.
    if (i < max && !hasReachedMinimumLength) {
      if (runningLength < size) continue;
      hasReachedMinimumLength = true;
    }
    prev = {
      point,
      pressure: pts[i][2] >= 0 ? pts[i][2] : 0.5,
      vector: uni(sub(prev.point, point)),
      distance,
      runningLength,
    };
    strokePoints.push(prev);
  }
  strokePoints[0].vector = (strokePoints[1] && strokePoints[1].vector) || [0, 0];
  return strokePoints;
}

/** Walk the smoothed points and emit the left and right edges plus round caps. */
export function getStrokeOutlinePoints(points, options = {}) {
  const {
    size = 16,
    smoothing = 0.5,
    thinning = 0.5,
    simulatePressure = true,
    easing = (t) => t,
    start = {},
    end = {},
    last: isComplete = false,
  } = options;
  const { cap: capStart = true, easing: taperStartEase = (t) => t * (2 - t) } = start;
  const { cap: capEnd = true, easing: taperEndEase = (t) => --t * t * t + 1 } = end;
  if (points.length === 0 || size <= 0) return [];

  const totalLength = points[points.length - 1].runningLength;
  const taperStart = start.taper === false ? 0 : start.taper === true ? Math.max(size, totalLength) : start.taper;
  const taperEnd = end.taper === false ? 0 : end.taper === true ? Math.max(size, totalLength) : end.taper;
  const minDistance = Math.pow(size * smoothing, 2);
  const leftPts = [];
  const rightPts = [];

  // With no real pen pressure, pressure is simulated from speed: fast is thin.
  let prevPressure = points.slice(0, 10).reduce((acc, curr) => {
    let pressure = curr.pressure;
    if (simulatePressure) {
      const sp = min(1, curr.distance / size);
      const rp = min(1, 1 - sp);
      pressure = min(1, acc + (rp - acc) * (sp * RATE_OF_PRESSURE_CHANGE));
    }
    return (acc + pressure) / 2;
  }, points[0].pressure);

  let radius = strokeRadius(size, thinning, points[points.length - 1].pressure, easing);
  let firstRadius;
  let prevVector = points[0].vector;
  let pl = points[0].point;
  let pr = pl;
  let tl = pl;
  let tr = pr;
  let isPrevPointSharpCorner = false;

  for (let i = 0; i < points.length; i++) {
    let { pressure } = points[i];
    const { point, vector, distance, runningLength } = points[i];
    if (i < points.length - 1 && totalLength - runningLength < 3) continue;

    if (thinning) {
      if (simulatePressure) {
        const sp = min(1, distance / size);
        const rp = min(1, 1 - sp);
        pressure = min(1, prevPressure + (rp - prevPressure) * (sp * RATE_OF_PRESSURE_CHANGE));
      }
      radius = strokeRadius(size, thinning, pressure, easing);
    } else {
      radius = size / 2;
    }
    if (firstRadius === undefined) firstRadius = radius;

    const ts = runningLength < taperStart ? taperStartEase(runningLength / taperStart) : 1;
    const te = totalLength - runningLength < taperEnd ? taperEndEase((totalLength - runningLength) / taperEnd) : 1;
    radius = Math.max(0.01, radius * Math.min(ts, te));

    const nextVector = (i < points.length - 1 ? points[i + 1] : points[i]).vector;
    const nextDpr = i < points.length - 1 ? dpr(vector, nextVector) : 1;
    const isPointSharpCorner = dpr(vector, prevVector) < 0 && !isPrevPointSharpCorner;
    const isNextPointSharpCorner = nextDpr !== null && nextDpr < 0;

    if (isPointSharpCorner || isNextPointSharpCorner) {
      // Sharp corner: draw a half-circle cap around the point.
      const offset = mul(per(prevVector), radius);
      for (let step = 1 / 13, t = 0; t <= 1; t += step) {
        tl = rotAround(sub(point, offset), point, FIXED_PI * t);
        leftPts.push(tl);
        tr = rotAround(add(point, offset), point, FIXED_PI * -t);
        rightPts.push(tr);
      }
      pl = tl;
      pr = tr;
      if (isNextPointSharpCorner) isPrevPointSharpCorner = true;
      continue;
    }
    isPrevPointSharpCorner = false;

    if (i === points.length - 1) {
      const offset = mul(per(vector), radius);
      leftPts.push(sub(point, offset));
      rightPts.push(add(point, offset));
      continue;
    }

    const offset = mul(per(lrp(nextVector, vector, nextDpr)), radius);
    tl = sub(point, offset);
    if (i <= 1 || dist2(pl, tl) > minDistance) {
      leftPts.push(tl);
      pl = tl;
    }
    tr = add(point, offset);
    if (i <= 1 || dist2(pr, tr) > minDistance) {
      rightPts.push(tr);
      pr = tr;
    }
    prevPressure = pressure;
    prevVector = vector;
  }

  const firstPoint = points[0].point.slice(0, 2);
  const lastPoint =
    points.length > 1 ? points[points.length - 1].point.slice(0, 2) : add(points[0].point, [1, 1]);
  const startCap = [];
  const endCap = [];

  if (points.length === 1) {
    if (!(taperStart || taperEnd) || isComplete) {
      const startPoint = prj(firstPoint, uni(per(sub(firstPoint, lastPoint))), -(firstRadius || radius));
      const dotPts = [];
      for (let step = 1 / 13, t = step; t <= 1; t += step) {
        dotPts.push(rotAround(startPoint, firstPoint, FIXED_PI * 2 * t));
      }
      return dotPts;
    }
  } else {
    if (!(taperStart || (taperEnd && points.length === 1))) {
      if (capStart) {
        for (let step = 1 / 13, t = step; t <= 1; t += step) {
          startCap.push(rotAround(rightPts[0], firstPoint, FIXED_PI * t));
        }
      } else {
        const cornersVector = sub(leftPts[0], rightPts[0]);
        const offsetA = mul(cornersVector, 0.5);
        const offsetB = mul(cornersVector, 0.51);
        startCap.push(sub(firstPoint, offsetA), sub(firstPoint, offsetB), add(firstPoint, offsetB), add(firstPoint, offsetA));
      }
    }
    const direction = per(neg(points[points.length - 1].vector));
    if (taperEnd || (taperStart && points.length === 1)) {
      endCap.push(lastPoint);
    } else if (capEnd) {
      const startPoint = prj(lastPoint, direction, radius);
      for (let step = 1 / 29, t = step; t < 1; t += step) {
        endCap.push(rotAround(startPoint, lastPoint, FIXED_PI * 3 * t));
      }
    } else {
      endCap.push(
        add(lastPoint, mul(direction, radius)),
        add(lastPoint, mul(direction, radius * 0.99)),
        sub(lastPoint, mul(direction, radius * 0.99)),
        sub(lastPoint, mul(direction, radius)),
      );
    }
  }
  return leftPts.concat(endCap, rightPts.reverse(), startCap);
}

export function getStroke(points, options = {}) {
  return getStrokeOutlinePoints(getStrokePoints(points, options), options);
}

// --- outline to SVG path. Bundle 87:3769 (`_de`, with `nM` and `wde` just before it) ----------------

const med = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const TO_FIXED_PRECISION = /(\s?[A-Z]?,?-?[0-9]*\.[0-9]{0,2})(([0-9]|e|-)*)/g;

/** Join the outline with quadratic curves through the midpoints, to 2 decimals. */
export function svgPathFromStroke(points) {
  if (!points.length) return "";
  const max = points.length - 1;
  return points
    .reduce(
      (acc, point, i, arr) => {
        if (i === max) acc.push(point, med(point, arr[0]), "L", arr[0], "Z");
        else acc.push(point, med(point, arr[i + 1]));
        return acc;
      },
      ["M", points[0], "Q"],
    )
    .join(" ")
    .replace(TO_FIXED_PRECISION, "$1");
}

// Answer-key check: does the freehand outline rebuilt from the minified bundle
// match the open-source perfect-freehand package?
// Run from the grading folder: npm install && node grade-freehand.mjs
import { getStroke as referenceStroke } from "perfect-freehand";
import { getStroke as rebuiltStroke } from "../src/freehand.mjs";

let state = 987654321;
const rnd = () => (state = (Math.imul(1103515245, state) + 12345) & 0x7fffffff) / 0x7fffffff;

// A wandering pen path with occasional sharp turns, like real pointer input.
function scribble(count) {
  const points = [];
  let x = rnd() * 300, y = rnd() * 300, heading = rnd() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    heading += rnd() < 0.08 ? Math.PI * (0.6 + rnd() * 0.8) : (rnd() - 0.5) * 0.6;
    const step = rnd() * 9;
    x += Math.cos(heading) * step;
    y += Math.sin(heading) * step;
    points.push([x, y]);
  }
  return points;
}

const CASES = 600;
let passed = 0;
let firstFailure = null;
for (let i = 0; i < CASES; i++) {
  const strokeWidth = [1, 2, 4][Math.floor(rnd() * 3)];
  const simulatePressure = rnd() < 0.7;
  const raw = scribble(1 + Math.floor(rnd() * 120));
  const points = simulatePressure ? raw : raw.map(([x, y]) => [x, y, 0.2 + rnd() * 0.8]);
  // The exact options the bundle passes for a freedraw element.
  const options = {
    simulatePressure,
    size: strokeWidth * 4.25,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    last: true,
  };
  const expected = JSON.stringify(referenceStroke(structuredClone(points), options));
  const actual = JSON.stringify(rebuiltStroke(structuredClone(points), options));
  if (expected === actual) passed++;
  else if (!firstFailure) firstFailure = { points: points.length, strokeWidth, simulatePressure };
}
if (firstFailure) console.log("first mismatch:", firstFailure);
console.log(`perfect-freehand: ${passed}/${CASES} strokes byte-identical`);
process.exit(passed === CASES ? 0 : 1);

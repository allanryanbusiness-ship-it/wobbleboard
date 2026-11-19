// Answer-key check: does the generator rebuilt from the minified bundle produce
// exactly the same drawing operations as the open-source roughjs package?
// Run from the grading folder: npm install && node grade-rough.mjs
import { createRequire } from "node:module";
import { RoughGenerator } from "../src/rough.mjs";

const require = createRequire(import.meta.url);
const rough = require("roughjs");
const reference = rough.generator();
const rebuilt = new RoughGenerator();

// Deterministic test inputs, independent of the generators under test.
let state = 12345;
const rnd = () => (state = (Math.imul(1103515245, state) + 12345) & 0x7fffffff) / 0x7fffffff;
const between = (a, b) => a + rnd() * (b - a);
const pick = (list) => list[Math.floor(rnd() * list.length)];

const roundedRect = (w, h, r) =>
  `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h} L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0`;
const cubicBlob = (w, h) =>
  `M ${w / 2} 0 L ${w} ${h / 2} C ${w} ${h}, ${w} ${h}, ${w / 2} ${h} L 0 ${h / 2} C 0 0, 0 0, ${w / 2} 0`;

const shapes = {
  line: () => ["line", [between(-50, 50), between(-50, 50), between(0, 700), between(0, 700)]],
  rectangle: () => ["rectangle", [0, 0, between(2, 600), between(2, 600)]],
  ellipse: () => {
    const w = between(2, 600), h = between(2, 600);
    return ["ellipse", [w / 2, h / 2, w, h]];
  },
  polygon: () => {
    const w = between(5, 500), h = between(5, 500);
    return ["polygon", [[[Math.floor(w / 2) + 1, 0], [w, Math.floor(h / 2) + 1], [Math.floor(w / 2) + 1, h], [0, Math.floor(h / 2) + 1]]]];
  },
  linearPath: () => ["linearPath", [Array.from({ length: 2 + Math.floor(rnd() * 5) }, () => [between(0, 400), between(0, 400)])]],
  curve: () => ["curve", [Array.from({ length: 3 + Math.floor(rnd() * 5) }, () => [between(0, 400), between(0, 400)])]],
  roundedRectPath: () => {
    const w = between(20, 500), h = between(20, 500);
    return ["path", [roundedRect(w, h, Math.min(w, h) * 0.25)]];
  },
  cubicPath: () => ["path", [cubicBlob(between(20, 500), between(20, 500))]],
};

const optionSets = () => {
  const strokeWidth = pick([1, 2, 4]);
  const o = {
    seed: 1 + Math.floor(rnd() * 2 ** 31),
    roughness: pick([0, 0.5, 1, 1, 2, 2.5]),
    strokeWidth,
    stroke: pick(["#1e1e1e", "#e03131"]),
    disableMultiStroke: rnd() < 0.3,
    preserveVertices: rnd() < 0.4,
    fillWeight: strokeWidth / 2,
    hachureGap: strokeWidth * 4,
  };
  const fillStyle = pick([null, "hachure", "cross-hatch", "solid", "zigzag"]);
  if (fillStyle) {
    o.fillStyle = fillStyle;
    o.fill = "#a5d8ff";
  }
  return o;
};

const clean = (drawable) =>
  JSON.stringify(drawable.sets.map((set) => ({ type: set.type, ops: set.ops })));

const CASES_PER_SHAPE = 400;
let total = 0, passed = 0;
const rows = [];
for (const [name, make] of Object.entries(shapes)) {
  let ok = 0;
  let firstFailure = null;
  for (let i = 0; i < CASES_PER_SHAPE; i++) {
    const [method, args] = make();
    const options = optionSets();
    if (name === "ellipse") options.curveFitting = 1;
    // Each generator gets its own copies: both mutate options and polygons.
    const expected = clean(reference[method](...structuredClone(args), { ...options }));
    const actual = clean(rebuilt[method](...structuredClone(args), { ...options }));
    total++;
    if (expected === actual) {
      ok++;
      passed++;
    } else if (!firstFailure) {
      firstFailure = { args, options };
    }
  }
  rows.push({ shape: name, identical: `${ok}/${CASES_PER_SHAPE}` });
  if (firstFailure) console.log(`first ${name} mismatch:`, JSON.stringify(firstFailure).slice(0, 400));
}
console.table(rows);
console.log(`roughjs ${require("roughjs/package.json").version}: ${passed}/${total} cases byte-identical`);
process.exit(passed === total ? 0 : 1);

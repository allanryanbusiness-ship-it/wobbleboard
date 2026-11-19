// Answer-key check for the Excalidraw-specific layer: each claim recovered from
// the minified bundle is looked up in Excalidraw's public source on GitHub.
// This reads the master branch, which can drift from what excalidraw.com serves.
// Run: node grade-layer.mjs
const RAW = "https://raw.githubusercontent.com/excalidraw/excalidraw/master/";
const files = {
  shape: "packages/element/src/shape.ts",
  constants: "packages/common/src/constants.ts",
  random: "packages/common/src/random.ts",
  pkg: "packages/excalidraw/package.json",
};

const claims = [
  ["Sloppiness levels are 0, 1, 2", "constants", /architect:\s*0,\s*artist:\s*1,\s*cartoonist:\s*2/],
  ["Shape stroke widths are 1, 2, 4, 8", "constants", /thin:\s*1,\s*medium:\s*2,\s*bold:\s*4,\s*extraBold:\s*8/],
  ["Pen stroke widths are 0.5, 1, 2, 4", "constants", /thin:\s*0\.5,\s*medium:\s*1,\s*bold:\s*2,\s*extraBold:\s*4/],
  ["Proportional corner radius is 0.25", "constants", /DEFAULT_PROPORTIONAL_RADIUS\s*=\s*0\.25/],
  ["Adaptive corner radius is 32", "constants", /DEFAULT_ADAPTIVE_RADIUS\s*=\s*32/],
  ["Loop-closing threshold is 8 px", "constants", /LINE_CONFIRM_THRESHOLD\s*=\s*8/],
  ["Default sloppiness is artist", "constants", /roughness:\s*ROUGHNESS\.artist/],
  ["Dashed pattern is [8, 8 + width]", "shape", /getDashArrayDashed = \(strokeWidth: number\) => \[8, 8 \+ strokeWidth\]/],
  ["Dotted pattern is [1.5, 6 + width]", "shape", /getDashArrayDotted = \(strokeWidth: number\) => \[1\.5, 6 \+ strokeWidth\]/],
  ["Non-solid strokes disable the double stroke", "shape", /disableMultiStroke: element\.strokeStyle !== "solid"/],
  ["Non-solid strokes are 0.5 wider", "shape", /element\.strokeWidth \+ 0\.5/],
  ["Hatch line weight is width / 2", "shape", /fillWeight: element\.strokeWidth \/ 2/],
  ["Hatch gap is width * 4", "shape", /hachureGap: element\.strokeWidth \* 4/],
  ["Vertices are kept below cartoonist", "shape", /continuousPath \|\| element\.roughness < ROUGHNESS\.cartoonist/],
  ["Ellipses use curveFitting 1", "shape", /options\.curveFitting = 1/],
  ["Small shapes get roughness / 3 or / 2, capped at 2.5", "shape", /Math\.min\(roughness \/ \(maxSize < 10 \? 3 : 2\), 2\.5\)/],
  ["Roughness is kept when both sides are >= 20 and 50", "shape", /minSize >= 20 && maxSize >= 50/],
  ["Shapes are cached in a WeakMap per element", "shape", /ShapeCache\.cache = new WeakMap\(\)|cache = new WeakMap/],
  ["Pen size factor 4.25, thinning 0.6, smoothing 0.5", "shape", /SIZE_FACTOR:\s*4\.25,\s*THINNING:\s*0\.6,\s*SMOOTHING:\s*0\.5/],
  ["Pen easing is sin(t * PI / 2)", "shape", /Math\.sin\(\(t \* Math\.PI\) \/ 2\)/],
  ["Arrowheads are capped at roughness 1", "shape", /roughness = Math\.min\(1, \w+\.roughness \|\| 0\)|roughness: Math\.min\(1, \w+\.roughness \|\| 0\)/],
  ["Seeds come from a clock-seeded generator", "random", /new Random\(Date\.now\(\)\)[\s\S]*Math\.floor\(random\.next\(\) \* 2 \*\* 31\)/],
  ["Excalidraw pins roughjs 4.6.4", "pkg", /"roughjs":\s*"4\.6\.4"/],
  ["Excalidraw pins perfect-freehand 1.2.0", "pkg", /"perfect-freehand":\s*"1\.2\.0"/],
];

const text = {};
for (const [key, path] of Object.entries(files)) {
  const response = await fetch(RAW + path);
  if (!response.ok) throw new Error(`Could not fetch ${path}: ${response.status}`);
  text[key] = await response.text();
}

let confirmed = 0;
const rows = claims.map(([claim, file, pattern]) => {
  const ok = pattern.test(text[file]);
  if (ok) confirmed++;
  return { claim, source: files[file].split("/").pop(), confirmed: ok ? "yes" : "NO" };
});
console.table(rows);
console.log(`${confirmed}/${claims.length} claims confirmed in the public source`);
process.exit(confirmed === claims.length ? 0 : 1);

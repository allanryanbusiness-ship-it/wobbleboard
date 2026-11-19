// Automated checks for the drawing engine and the static server.
// Run from the project folder: node tests/run.mjs
import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The engine only needs Path2D to exist when it paints a pen stroke.
globalThis.Path2D = class {
  constructor(d) {
    this.d = d;
  }
};

const { ShapeCache, newElement, renderElement, roundnessFor } = await import("../src/shapes.mjs");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// --- a canvas stand-in that records every call and flags bad numbers ---------

function fakeContext() {
  const log = { calls: 0, bad: [] };
  const noteArgs = (method, args) => {
    log.calls++;
    for (const arg of args) {
      if (typeof arg === "number" && !Number.isFinite(arg)) log.bad.push(`${method}(${args.join(", ")})`);
      if (arg instanceof globalThis.Path2D && /NaN|Infinity|undefined/.test(arg.d)) log.bad.push(`fill(Path2D ${arg.d.slice(0, 60)})`);
    }
  };
  const target = {};
  const ctx = new Proxy(target, {
    get: (obj, prop) => (prop in obj ? obj[prop] : (...args) => noteArgs(String(prop), args)),
    set: (obj, prop, value) => {
      if (typeof value === "number" && !Number.isFinite(value)) log.bad.push(`${String(prop)} = ${value}`);
      obj[prop] = value;
      return true;
    },
  });
  return { ctx, log };
}

// --- 1. every combination of shape and style paints without bad output -------

const TYPES = ["rectangle", "diamond", "ellipse", "line", "arrow", "freedraw"];
const SIZES = [[0, 0], [1, 1], [3, 40], [40, 0], [200, 120], [900, 700]];
const ROUNDABLE = new Set(["rectangle", "diamond", "line", "arrow"]);

function penPath(w, h, closed) {
  const points = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    points.push([t * w, h / 2 + Math.sin(t * Math.PI * 4) * (h / 2)]);
  }
  if (closed) points.push([2, h / 2 + 1]);
  return points;
}

function makeElement(type, [w, h], style, variant) {
  const props = { ...style, x: 10, y: 10, width: w, height: h, seed: 1 + ((w * 31 + h * 17 + variant * 7919) % 2147483646) };
  props.roundness = style.round && ROUNDABLE.has(type) ? roundnessFor(type) : null;
  delete props.round;
  if (type === "line" || type === "arrow") {
    // variant 1 is a closed triangle, which takes the filled-polygon path.
    props.points = variant === 1 && type === "line" ? [[0, 0], [w, 0], [w / 2, h], [0, 0]] : [[0, 0], [w, h]];
  }
  if (type === "freedraw") {
    props.points = penPath(w, h, variant === 1);
    props.simulatePressure = variant !== 2;
    props.pressures = variant === 2 ? props.points.map((_, i) => 0.2 + (i % 5) * 0.15) : [];
    props.strokeWidth = style.strokeWidth / 2;
  }
  return newElement(type, props);
}

{
  let painted = 0;
  const failures = [];
  const started = Date.now();
  for (const type of TYPES)
    for (const size of SIZES)
      for (const fillStyle of ["hachure", "cross-hatch", "solid", "zigzag"])
        for (const backgroundColor of ["transparent", "#a5d8ff"])
          for (const strokeStyle of ["solid", "dashed", "dotted"])
            for (const roughness of [0, 1, 2])
              for (const round of [false, true])
                for (const strokeWidth of [1, 2, 4])
                  for (const variant of [0, 1, 2]) {
                    const style = { fillStyle, backgroundColor, strokeStyle, roughness, round, strokeWidth, strokeColor: "#1e1e1e", opacity: 100 };
                    const { ctx, log } = fakeContext();
                    const label = `${type} ${size.join("x")} ${fillStyle} ${backgroundColor} ${strokeStyle} r${roughness} round=${round} w${strokeWidth} v${variant}`;
                    try {
                      renderElement(ctx, makeElement(type, size, style, variant));
                      painted++;
                      if (log.bad.length) failures.push(`${label}: ${log.bad[0]}`);
                      else if (log.calls < 4) failures.push(`${label}: nothing was painted`);
                    } catch (error) {
                      failures.push(`${label}: threw ${error.message}`);
                    }
                  }
  check(
    "every shape and style combination paints cleanly",
    failures.length === 0,
    failures.length ? `${failures.length} failures, first: ${failures[0]}` : `${painted} combinations in ${Date.now() - started} ms`,
  );
}

// --- 2. the seed fixes the drawing -------------------------------------------

{
  const base = { x: 0, y: 0, width: 160, height: 90, backgroundColor: "#ffec99", fillStyle: "hachure", seed: 424242 };
  const shapeOf = (props) => JSON.stringify(ShapeCache.generateElementShape(newElement("rectangle", props)).sets);
  check("same seed gives the same drawing", shapeOf(base) === shapeOf({ ...base }));
  check("different seed gives a different drawing", shapeOf(base) !== shapeOf({ ...base, seed: 424243 }));

  const element = newElement("ellipse", base);
  check("an unchanged element is generated once", ShapeCache.generateElementShape(element) === ShapeCache.generateElementShape(element));

  // A filled shape must actually produce hatch lines, not just an outline.
  const count = (props) => {
    const { ctx, log } = fakeContext();
    renderElement(ctx, newElement("rectangle", props));
    return log.calls;
  };
  const outlineOnly = count({ ...base, backgroundColor: "transparent" });
  const hatched = count(base);
  check("a background colour adds hatch lines", hatched > outlineOnly + 20, `${outlineOnly} calls without, ${hatched} with`);

  // A dotted pen stroke is drawn as a dashed line, a solid one as a filled outline.
  const penCalls = (strokeStyle) => {
    const calls = [];
    const ctx = new Proxy({}, { get: (o, p) => (p in o ? o[p] : (...args) => calls.push([String(p), args])), set: (o, p, v) => ((o[p] = v), true) });
    renderElement(ctx, newElement("freedraw", { points: penPath(200, 40, false), pressures: [], simulatePressure: true, strokeWidth: 1, strokeStyle }));
    return calls;
  };
  const dashOf = (calls) => calls.filter(([name, args]) => name === "setLineDash" && args[0].length).map(([, args]) => args[0])[0];
  const solidPen = penCalls("solid");
  const dottedPen = penCalls("dotted");
  const dashedPen = penCalls("dashed");
  check("solid pen is a filled outline", solidPen.some(([name]) => name === "fill") && !dashOf(solidPen));
  check("dotted pen is stroked as dots", !!dashOf(dottedPen) && dashOf(dottedPen)[0] < 1 && dottedPen.some(([name]) => name === "stroke") && !dottedPen.some(([name]) => name === "fill"), "dash " + JSON.stringify(dashOf(dottedPen)));
  check("dashed pen is stroked as dashes", !!dashOf(dashedPen) && dashOf(dashedPen)[0] > 5, "dash " + JSON.stringify(dashOf(dashedPen)));

  const seeds = new Set(Array.from({ length: 500 }, () => newElement("rectangle", {}).seed));
  check("new elements get distinct non-zero seeds", seeds.size === 500 && !seeds.has(0), `${seeds.size} distinct of 500`);
}

// --- 2b. "New wobble" applies only where a new seed changes the drawing -------

{
  const { seedShowsIn } = await import("../src/shapes.mjs");
  // Without the rule, every selected shape is reseeded.
  const applies = typeof seedShowsIn === "function" ? seedShowsIn : () => true;
  // What ends up on the canvas, as geometry. A curve whose control points sit on
  // its own chord is a straight line wherever along the chord they sit, and a
  // seed moves them along it even at roughness 0, so such a curve is recorded
  // as that line.
  const drawn = (props) => {
    const calls = [];
    let at = [0, 0];
    const onChord = (px, py, [ax, ay], [bx, by]) =>
      Math.abs((bx - ax) * (py - ay) - (by - ay) * (px - ax)) <= 1e-6 * (1 + Math.hypot(bx - ax, by - ay));
    const record = (name) => (...args) => {
      if (name === "moveTo") at = [args[0], args[1]];
      if (name === "bezierCurveTo") {
        const end = [args[4], args[5]];
        const straight = onChord(args[0], args[1], at, end) && onChord(args[2], args[3], at, end);
        calls.push(straight ? ["line", at, end] : ["curve", at, args]);
        at = end;
        return;
      }
      if (name === "lineTo") at = [args[0], args[1]];
      calls.push([name, args.map((arg) => (arg instanceof globalThis.Path2D ? arg.d : arg))]);
    };
    const ctx = new Proxy({}, { get: (o, p) => (p in o ? o[p] : record(String(p))), set: (o, p, v) => ((o[p] = v), true) });
    renderElement(ctx, newElement(props.type, props));
    return JSON.stringify(calls);
  };
  const loop = [[0, 0], [80, 10], [90, 70], [10, 80], [2, 3]];
  const open = [[0, 0], [40, 30], [90, 20], [140, 60]];
  const cases = [{ type: "text", text: "words", fontFamily: "hand", fontSize: 20, textAlign: "left", width: 60, height: 25 }];
  for (const roughness of [0, 1, 2]) {
    for (const backgroundColor of ["transparent", "#a5d8ff"]) {
      const style = { roughness, backgroundColor, fillStyle: "hachure" };
      for (const type of ["rectangle", "diamond", "ellipse"]) {
        for (const round of [false, true]) {
          cases.push({ ...style, type, width: 160, height: 90, roundness: round && type !== "ellipse" ? roundnessFor(type) : null });
        }
      }
      for (const type of ["line", "arrow"]) cases.push({ ...style, type, points: [[0, 0], [150, 70]], width: 150, height: 70 });
      for (const points of [open, loop]) {
        for (const strokeStyle of ["solid", "dotted"]) {
          cases.push({ ...style, type: "freedraw", strokeStyle, points, pressures: [], simulatePressure: true, strokeWidth: 1, width: 140, height: 80 });
        }
      }
    }
  }
  const describe = (c) => `${c.type} roughness=${c.roughness ?? "-"} background=${c.backgroundColor ?? "-"}${c.points ? ` points=${c.points.length}` : ""}`;
  const wrong = cases.filter((c) => applies(newElement(c.type, c)) !== (drawn({ ...c, seed: 1111 }) !== drawn({ ...c, seed: 2222 })));
  check(
    "New wobble applies exactly where a new seed changes the drawing",
    wrong.length === 0,
    wrong.length ? `${wrong.length} of ${cases.length} kinds wrong, first: ${describe(wrong[0])}` : `${cases.length} kinds of shape`,
  );
}

// --- 3. text -----------------------------------------------------------------

{
  const { measureText, setMeasureContext, FONT_SIZES, LINE_HEIGHT } = await import("../src/text.mjs");
  // Stand-in measuring: every character is half the font size wide.
  const fake = { font: "", measureText(s) { return { width: s.length * parseFloat(this.font) * 0.5 }; } };
  setMeasureContext(fake);
  const style = { fontSize: FONT_SIZES.md, fontFamily: "hand" };
  const size = measureText("hello\nwobble board", style);
  check("text is as wide as its longest line", size.width === Math.ceil(12 * 10) + 1, "width " + size.width);
  check("text is one line height per line", size.height === 2 * FONT_SIZES.md * LINE_HEIGHT, "height " + size.height);

  const draw = (textAlign) => {
    const calls = [];
    const props = {};
    const ctx = new Proxy(props, { get: (o, p) => (p in o ? o[p] : (...args) => { calls.push([String(p), args]); }), set: (o, p, v) => ((o[p] = v), true) });
    renderElement(ctx, newElement("text", { text: "one\ntwo\nthree", ...style, textAlign, strokeColor: "#e03131", x: 40, y: 60, width: 200, height: 75 }));
    return { lines: calls.filter(([name]) => name === "fillText").map(([, args]) => args), props, calls };
  };
  const left = draw("left");
  check("each line of text is drawn once, in order", left.lines.map((l) => l[0]).join("|") === "one|two|three");
  check("lines are spaced by the line height", left.lines[1][2] - left.lines[0][2] === 25 && left.lines[2][2] - left.lines[1][2] === 25);
  check("text uses the element's colour and font", left.props.fillStyle === "#e03131" && left.props.font.startsWith("20px ") && left.props.font.includes("Kalam"));
  const { fontString, FONT_FACES } = await import("../src/text.mjs");
  check("bold text asks for the bold face", fontString({ ...style, bold: true }).startsWith("bold 20px ") && !fontString(style).startsWith("bold"));
  check("five fonts, each in regular and bold", FONT_FACES.length === 10 && FONT_FACES.filter((f) => f.startsWith("bold ")).length === 5);
  check("alignment moves the anchor", left.lines[0][1] === 0 && draw("center").lines[0][1] === 100 && draw("right").lines[0][1] === 200);
  check("text is placed at its position", left.calls.some(([name, args]) => name === "translate" && args[0] === 40 && args[1] === 60));
}

// --- 4. the static server ----------------------------------------------------

const PORT = 4199;
const rawGet = (path) =>
  new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port: PORT, path, method: "GET" }, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => resolve({ status: response.statusCode, type: response.headers["content-type"] || "", body }));
    });
    request.on("error", reject);
    request.end();
  });

{
  const server = spawn(process.execPath, [join(root, "tools", "serve.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once("data", resolve);
      server.once("exit", (code) => reject(new Error(`server exited early with code ${code}`)));
      setTimeout(() => reject(new Error("server did not start within 5 s")), 5000);
    });
    const home = await rawGet("/");
    check("server serves the page", home.status === 200 && home.type.startsWith("text/html") && home.body.includes("<title>Wobbleboard</title>"));
    const module = await rawGet("/src/app.mjs");
    check("server serves modules as JavaScript", module.status === 200 && module.type.startsWith("text/javascript"));
    const font = await rawGet("/fonts/kalam-latin-700-normal.woff2");
    check("server serves the bundled fonts", font.status === 200 && font.type === "font/woff2");
    const missing = await rawGet("/nope.txt");
    check("missing file gives 404", missing.status === 404);
    const folder = await rawGet("/src");
    check("folder request gives 404", folder.status === 404);
    const outside = await rawGet("/../rea-candidates.md");
    check("path outside the project is refused", outside.status === 403 || outside.status === 404, `status ${outside.status}`);
    const encoded = await rawGet("/..%2F..%2Frea-candidates.md");
    check("encoded path outside the project is refused", encoded.status === 403 || encoded.status === 404, `status ${encoded.status}`);
    const malformed = await rawGet("/%E0%A4%A").catch((error) => ({ status: 0, error: error.message }));
    const after = await rawGet("/").catch(() => ({ status: 0 }));
    check("malformed URL does not crash the server", malformed.status === 400 && after.status === 200, `status ${malformed.status}, then ${after.status}`);
  } catch (error) {
    check("server tests ran", false, error.message);
  } finally {
    server.kill();
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);

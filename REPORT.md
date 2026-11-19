# REA on Excalidraw: test report

Run on 2026-11-18, Windows 10, Node 22.23.4, REA 6.9.0 (`rea-agents` from npm), Chrome 157.

## Result

The hand-drawn rendering of excalidraw.com was recovered from its minified production bundle and rebuilt in this repo. Graded against the open-source originals, the rebuild is exact:

| Check | Answer key | Result |
|---|---|---|
| Sketchy shape generator | roughjs 4.6.4 | 3,200 of 3,200 shapes byte-identical |
| Pen stroke outline | perfect-freehand 1.2.0 | 600 of 600 strokes byte-identical |
| Excalidraw's own layer | `excalidraw/excalidraw` master | 24 of 24 claims confirmed |

REA itself did less of this than the result suggests. It captured the page and exported the scripts cleanly, but its static JavaScript analyzer could not process the main bundle. The tracing was done by reading the exported bundle directly.

## The question

How does Excalidraw make shapes look hand-drawn, and why does a shape keep the same wobble every time the board repaints?

The source maps the bundle declares were not fetched, and the public source was not opened until the rebuild was finished. It was then used only as the answer key.

## What REA did

| Step | REA command | Outcome | Raw output |
|---|---|---|---|
| Find the page | `list-browser-targets` | One page target on excalidraw.com | (not kept) |
| Capture the page | `inspect-web-page --include-script-sources --include-storage-keys` | 9 scripts, 385 DOM nodes, 2 canvases, storage key names | 2.1 MB JSON |
| Export scripts | `export-web-scripts` | 9 files, including the 1.9 MB main bundle | 9 script files, 1.9 MB |
| Static analysis | `analyze-javascript-application` | 8 small files parsed; main bundle skipped, worker out of memory at 1 GB | 7.9 MB JSON |
| Static analysis, retry | same, `--max-heap-mb 8192` | Main bundle skipped again, worker out of memory at 8 GB | 0.2 MB JSON |
| Canvas listeners | `inspect-web-event-listeners "canvas.interactive"` | 3 direct listeners; input goes through React's root listener | 2.0 MB JSON |

Two things did not work:

- **Building REA from the GitHub clone.** A Windows source checkout needs a native addon that can only be built on Linux, so `npm run build:cached` fails with "REA Windows native controls are unavailable: Missing packaged Windows native file native/windows/build/manifest.json". The official npm release of the same repo was used instead.
- **Static analysis of the main bundle.** The analyzer ran out of memory at both 1 GB and 8 GB, so REA produced no module graph, call relations or feature trace for the file that holds the whole application.

## Where the raw output is

The raw REA output (about 14 MB) is not published in this repository. It is a capture of a live browser session with local file paths in it, plus a copy of Excalidraw's deployed scripts, and neither belongs in a public repo.

Every position cited below can still be checked against the bundle itself, for as long as that build stays deployed:

| File | Size | SHA-256 |
|---|---|---|
| `https://excalidraw.com/assets/index-tsAfIkr7.js` | 1,925,726 bytes | `60cf9eb0e84dc4c64b09385a2463e29bdfd94229fedfc85ee98e4c99be4c6bbc` |

`tools/ctx.mjs` prints the text around a pattern in that file with the same `line:column` positions used here.

## How the hand-drawn look works

Positions are `line:column` in `assets/index-tsAfIkr7.js`. Names in backticks are the minified names in that file.

1. **Every element carries a seed.** New elements get a random 31-bit integer from a generator seeded once with the clock (`Mte`, `io`, 52:678). The seed is stored on the element.
2. **One seeded generator drives every wobble.** `class $N` (51:10853) is a multiplicative generator: `seed = imul(48271, seed)`, masked to 31 bits and divided by 2^31. Each shape starts a fresh generator from its seed, so the same seed always gives the same drawing. A seed of 0 falls back to `Math.random`.
3. **A line is one bowed curve, drawn twice.** `pC` (67:43389) turns a straight line into a single cubic bezier. Its control points sit 20–40% and 40–80% of the way along, pushed sideways by a "bowing" amount proportional to the line's length. The ends are jittered by up to 2 px times the roughness. Lines over 200 px get less wobble, falling to 40% at 500 px. `Ul` (67:43222) calls it twice, the second time with half the jitter, which gives the doubled pencil look.
4. **An ellipse is a jittered ring that overshoots.** `bC` (67:45048) starts at a random angle, jitters each point, and continues past the start so the stroke overlaps itself. `Cb` then runs a spline through the points.
5. **Hatching is a scanline fill, rotated.** `Dre` (67:30198) and `op` (67:31263) rotate the polygon so the hatch direction (−41°) is horizontal, sweep scanlines across it at a gap of 4× the stroke width, rotate the lines back, and draw each one as a wobbly line. Cross-hatch runs it again at +90°.
6. **Rounded shapes go through an SVG path.** Excalidraw builds a path string with `Q` or `C` corners (`gde`, 80:10779). `YB` (67:37329) converts quadratics to cubics and `Jre` (67:46122) jitters each curve.
7. **Excalidraw tunes the generator per element.** `Ns` (80:5893) sets hatch gap and weight from the stroke width, turns the double stroke off for dashed and dotted outlines and widens them by 0.5, and keeps corners exact unless sloppiness is at its highest. `ude` (80:5707) lowers the roughness of small shapes so they stay readable.
8. **Generated shapes are cached.** `ps` (80:5088) keeps a `WeakMap` from element object to generated shape. Elements are replaced on change, so an unchanged element is never regenerated. The seed makes regeneration stable; the cache makes it rare.
9. **The pen is a filled outline, not a stroke.** `eF` (67:61936) smooths the pointer samples and `yae` (67:59849) builds an outline whose width follows simulated pressure: fast movement is thin. Excalidraw passes size = 4.25× stroke width, thinning 0.6, smoothing 0.5 (`a1`, 87:2628), and fills the outline as a path (`_de`, 87:3769).

## How it was graded

The three graders are in `grading/`. They need the answer-key packages (`npm install` there).

- **`grade-rough.mjs`** generates 400 random cases for each of 8 shape kinds, with random seeds, roughness, stroke widths, fill styles and flags, and compares the drawing operations from `src/rough.mjs` and roughjs as JSON strings.
- **`grade-freehand.mjs`** does the same for 600 random pen paths, with and without real pressure values, using the options Excalidraw passes.
- **`grade-layer.mjs`** fetches Excalidraw's source from GitHub and checks 24 specific claims (constants, option formulas, cache, seed source).

The first run against the latest roughjs (4.6.6) gave 3,162 of 3,200. All 38 misses were three-point curves with a pattern fill, which 4.6.6 handles differently. Excalidraw pins 4.6.4, and against that version the result is 3,200 of 3,200. The bundle therefore really does contain 4.6.4, and the reading was precise enough to tell the two versions apart.

## What the blind pass got wrong or left out

- **Seed source.** The blind pass attributed element seeds to the library's `Math.random` helper (`dte`). Excalidraw uses its own clock-seeded generator (`io`). Found only after reading the answer key, then confirmed in the bundle and fixed.
- **Pen widths.** The pen uses a thinner width scale (0.5, 1, 2) than shapes (1, 2, 4). Also found only after the answer key, then confirmed at 51:349 and fixed.
- **Arrowheads.** The arrowhead geometry (`ms`) was not traced. The arrow in this repo uses a plain two-line head with guessed proportions.
- **Path parser.** `src/rough.mjs` parses only the absolute `M L Q C Z` commands Excalidraw emits. The bundle's full SVG path parser, arcs included, was not rebuilt.
- **Added, not recovered:** the pen draws dashed and dotted strokes in this repo (`freedrawDashedLine` in `src/shapes.mjs`). Excalidraw ignores stroke style for the pen, so this part is original and has no answer key.
- **Text, added later.** Read from the bundle: the four sizes (16, 20, 28, 36 at 49:67088), the 1.25 line height, and the draw routine at 80:161, which splits on newlines and calls `fillText` once per line with an offset for left, centre or right. Not recovered: Excalidraw's own typefaces (five other open-source fonts are bundled instead), its font-metric baseline table (the browser's measured ascent and descent are used), text wrapping, and its container binding (text here is deliberately always free-standing). The text code has no answer-key grading.
- **Not attempted:** dark-mode colour filtering, element rotation, images, elbow arrows, the constant-width pen mode, collaboration.

So 22 of the 24 layer claims were found blind, and 2 were found with the answer key's help.

## Verdict on REA for this target

| Part | Verdict |
|---|---|
| Browser capture and script export | Worked first time. Provenance, hashes and stated limits on every result. |
| Static analysis of small scripts | Worked, but those files held nothing of interest. |
| Static analysis of the real bundle | Failed on memory at 8 GB. This was the step that mattered. |
| Building from source on Windows | Not possible without a Linux-built addon. |

For a single large minified web bundle, REA was a reliable way to get the code onto disk with a record of where it came from. The understanding came from reading that code. A target split into many smaller modules, such as an Electron app, should suit its analyzer better; that is untested here.

// End-to-end check of the live board. It drives the page with pointer and key
// events and reads the result back from the saved scene, the controls and the
// canvas pixels.
//
// Run it on an EMPTY board in a window at least 1000 x 600, from the browser
// console of the running app:
//   (await import("./tests/browser.mjs")).run().then(console.table)
// It refuses to start if anything is drawn, because it deletes and clears.

import { seedShowsIn } from "../src/shapes.mjs";
import { DEFAULT_FONT_SIZE, FONT_SIZES, fontString, lineHeightPx, measureText } from "../src/text.mjs";

const KEY = "wobbleboard-scene";
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const editor = document.getElementById("editor");
const $ = (id) => document.getElementById(id);
const scene = () => JSON.parse(localStorage.getItem(KEY) || "[]");
const byId = (id) => scene().find((e) => e.id === id);
const last = () => scene().at(-1);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

function pointer(type, x, y, shift = false) {
  canvas.dispatchEvent(new PointerEvent(type, {
    clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1,
    pointerId: 1, pointerType: "mouse", bubbles: true, shiftKey: shift,
  }));
}
function drag(x1, y1, x2, y2, { shift = false, steps = 8 } = {}) {
  pointer("pointerdown", x1, y1, shift);
  for (let i = 1; i <= steps; i++) pointer("pointermove", x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, shift);
  pointer("pointerup", x2, y2, shift);
}
function click(x, y, shift = false) {
  pointer("pointerdown", x, y, shift);
  pointer("pointerup", x, y, shift);
  canvas.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, bubbles: true }));
}
function dblclick(x, y) {
  click(x, y);
  click(x, y);
  canvas.dispatchEvent(new MouseEvent("dblclick", { clientX: x, clientY: y, bubbles: true }));
}
const key = (k, { ctrl = false, shift = false } = {}) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: k, ctrlKey: ctrl, shiftKey: shift, bubbles: true }));
const editorKey = (k, ctrl = false) =>
  editor.dispatchEvent(new KeyboardEvent("keydown", { key: k, ctrlKey: ctrl, bubbles: true, cancelable: true }));
function type(text) {
  editor.value = text;
  editor.dispatchEvent(new Event("input"));
  editorKey("Enter", true);
}
const styleButton = (prop, value) =>
  [...document.querySelector(`#style .row[data-prop="${prop}"]`).children].find((b) => b.dataset.value === JSON.stringify(value));
const style = (prop, value) => styleButton(prop, value).click();
const tool = () => document.querySelector('#tools [aria-pressed="true"]')?.dataset.tool;
const groupHidden = (prop) => document.querySelector(`#style .row[data-prop="${prop}"]`).parentElement.hidden;
const hasSelection = () => !$("delete").disabled;
const undo = () => key("z", { ctrl: true });

function pixels(x1, y1, x2, y2, match) {
  const r = window.devicePixelRatio || 1;
  const d = ctx.getImageData(Math.round(x1 * r), Math.round(y1 * r), Math.round((x2 - x1) * r), Math.round((y2 - y1) * r)).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (match(d[i], d[i + 1], d[i + 2], d[i + 3])) n++;
  return n;
}
const anyInk = (r, g, b, a) => a > 40;
const like = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r, g, b, a) => a > 200 && Math.abs(r - c[0]) < 30 && Math.abs(g - c[1]) < 30 && Math.abs(b - c[2]) < 30;
};
/** Share of the columns between x = 270 and x = 490 that have ink near the row y. */
function coverage(y) {
  const r = window.devicePixelRatio || 1;
  const w = Math.round(220 * r);
  const h = Math.round(12 * r);
  const d = ctx.getImageData(Math.round(270 * r), Math.round((y - 6) * r), w, h).data;
  let columns = 0;
  for (let x = 0; x < w; x++) {
    for (let row = 0; row < h; row++) {
      if (d[(row * w + x) * 4 + 3] > 40) {
        columns++;
        break;
      }
    }
  }
  return columns / w;
}
const boundsOf = (e) => {
  if (!e.points) return [e.x, e.y, e.x + e.width, e.y + e.height];
  const xs = e.points.map((p) => p[0]);
  const ys = e.points.map((p) => p[1]);
  return [e.x + Math.min(...xs), e.y + Math.min(...ys), e.x + Math.max(...xs), e.y + Math.max(...ys)];
};

export async function run() {
  if (scene().length) return [{ name: "refused", ok: false, detail: "The board is not empty. Clear it first." }];
  if (window.innerWidth < 1000 || window.innerHeight < 600) {
    return [{ name: "refused", ok: false, detail: `Window is ${window.innerWidth} x ${window.innerHeight}; needs 1000 x 600.` }];
  }
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail) });
  const section = async (name, body) => {
    try {
      await body();
    } catch (error) {
      check(`${name}: ran to the end`, false, error && error.stack ? error.stack.split("\n").slice(0, 2).join(" | ") : error);
    }
  };

  await section("start", () => {
    check("empty board shows the starting hint", !$("empty").hidden);
    check(
      "empty board disables every action that needs a shape",
      ["undo", "redo", "reseed", "duplicate", "delete", "export", "clear"].every((id) => $(id).disabled),
    );
    const buttons = [...$("tools").children];
    check("eight tools, each with an icon and a key", buttons.length === 8 && buttons.every((b) => b.querySelector("svg")?.children.length && b.querySelector("kbd")?.textContent));
    const faces = [...document.fonts];
    check("all ten bundled font files loaded", faces.filter((f) => f.status === "loaded").length === 10, faces.map((f) => `${f.family} ${f.weight} ${f.status}`).join(", "));
  });

  const made = {};
  await section("drawing", () => {
    const specs = [
      ["rectangle", "2", 260, 100, 380, 180], ["diamond", "3", 420, 100, 540, 180], ["ellipse", "4", 580, 100, 700, 180],
      ["arrow", "5", 260, 220, 380, 280], ["line", "6", 420, 220, 540, 280], ["freedraw", "7", 580, 220, 700, 280],
    ];
    for (const [type, k, x1, y1, x2, y2] of specs) {
      key(k);
      const before = scene().length;
      drag(x1, y1, x2, y2, { steps: type === "freedraw" ? 20 : 8 });
      const e = last();
      const geometry = e.points
        ? e.x === x1 && e.y === y1 && e.points.length === (type === "freedraw" ? 21 : 2) && near(e.points.at(-1), [x2 - x1, y2 - y1])
        : e.x === x1 && e.y === y1 && e.width === x2 - x1 && e.height === y2 - y1;
      check(
        `${type}: key ${k} picks the tool and a drag draws one`,
        tool() === type && scene().length === before + 1 && e.type === type && geometry,
        JSON.stringify({ tool: tool(), type: e.type, x: e.x, y: e.y, w: e.width, h: e.height }),
      );
      made[type] = e.id;
      if (type === "freedraw") check("a finished pen stroke is not left selected", !hasSelection());
      else check(`${type}: stays selected once drawn, ready to restyle`, hasSelection());
    }
    key("Escape");
    for (const [type, , x1, y1, x2, y2] of specs) {
      const n = pixels(x1 - 6, y1 - 6, x2 + 6, y2 + 6, anyInk);
      check(`${type}: ink is on the canvas where it was drawn`, n > 100, `${n} inked pixels`);
    }
    key("2");
    const count = scene().length;
    drag(800, 120, 803, 122);
    check("a stray click with a drawing tool draws nothing", scene().length === count);
    drag(760, 100, 860, 140, { shift: true });
    check("Shift makes a rectangle square", last().width === 100 && last().height === 100, `${last().width} x ${last().height}`);
    key("6");
    drag(760, 240, 860, 250, { shift: true });
    const [dx, dy] = last().points[1];
    const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
    check("Shift snaps a line to 15 degree steps", Math.abs(degrees / 15 - Math.round(degrees / 15)) < 1e-6, `${degrees.toFixed(4)} degrees`);
    made.square = scene().at(-2).id;
    made.snapped = last().id;
  });

  await section("selecting and moving", () => {
    const R = made.rectangle;
    key("1");
    click(260, 140);
    check("a click on a shape selects it", tool() === "select" && hasSelection());
    click(900, 500);
    check("a click on empty space deselects", !hasSelection());
    drag(260, 140, 300, 175);
    check("dragging a shape moves it", byId(R).x === 300 && byId(R).y === 135, `${byId(R).x}, ${byId(R).y}`);
    undo();
    check("one undo puts the moved shape back", byId(R).x === 260 && byId(R).y === 100 && !$("redo").disabled);
    key("z", { ctrl: true, shift: true });
    check("redo moves it again", byId(R).x === 300 && byId(R).y === 135);
    undo();

    const count = scene().length;
    const marquee = () => drag(240, 88, 720, 300);
    marquee();
    key("d", { ctrl: true });
    check("drag on empty space selects every shape the box touches", scene().length === count + 6, `${scene().length - count} of 6 selected`);
    undo();
    marquee();
    const before = scene();
    drag(260, 140, 280, 150);
    const after = scene();
    const movedTogether = after.every((e, i) => {
      const inBox = !["square", "snapped"].some((name) => made[name] === e.id);
      return inBox ? e.x === before[i].x + 20 && e.y === before[i].y + 10 : e.x === before[i].x && e.y === before[i].y;
    });
    check("dragging one of several selected shapes moves them all, and only them", movedTogether);
    undo();
    marquee();
    click(260, 140);
    key("d", { ctrl: true });
    check("a plain click on one of several selected shapes narrows to it", scene().length === count + 1);
    undo();
    marquee();
    key("Delete");
    check("Delete removes the whole selection", scene().length === count - 6, `${scene().length} left`);
    undo();
    check("undo brings them all back", scene().length === count);
    click(260, 140);
    click(580, 140, true);
    key("d", { ctrl: true });
    check("Shift-click adds a shape to the selection", scene().length === count + 2);
    undo();
    click(260, 140);
    click(580, 140, true);
    click(580, 140, true);
    key("d", { ctrl: true });
    check("Shift-click on a selected shape takes it out", scene().length === count + 1);
    undo();
    click(260, 140);
    key("Escape");
    check("Escape drops the selection", !hasSelection());
  });

  await section("shape style", () => {
    const R = made.rectangle;
    key("1");
    click(260, 140);
    const choices = {
      strokeColor: ["#e03131", "#2f9e44", "#1971c2", "#f08c00", "#1e1e1e"],
      backgroundColor: ["#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99", "transparent"],
      fillStyle: ["cross-hatch", "solid", "zigzag", "hachure"],
      strokeWidth: [1, 4, 2],
      strokeStyle: ["dashed", "dotted", "solid"],
      roughness: [0, 2, 1],
    };
    for (const [prop, values] of Object.entries(choices)) {
      const wrong = values.filter((value) => {
        style(prop, value);
        return !same(byId(R)[prop], value) || styleButton(prop, value).getAttribute("aria-pressed") !== "true";
      });
      check(`${prop}: each of ${values.length} choices is applied and shown as chosen`, wrong.length === 0, wrong.join(", "));
    }
    style("round", false);
    const sharp = byId(R).roundness === null;
    style("round", true);
    check("Edges switches between sharp and round corners", sharp && byId(R).roundness !== null);

    style("strokeColor", "#e03131");
    style("backgroundColor", "#a5d8ff");
    style("fillStyle", "solid");
    style("strokeColor", "#1971c2");
    undo();
    check("one undo reverts one style choice", byId(R).strokeColor === "#e03131" && byId(R).backgroundColor === "#a5d8ff");
    key("Escape");
    const red = pixels(250, 90, 390, 190, like("#e03131"));
    const blue = pixels(250, 90, 390, 190, like("#a5d8ff"));
    check("the chosen stroke and background colours reach the canvas", red > 100 && blue > 2000, `${red} red, ${blue} blue pixels`);

    drag(240, 88, 720, 300);
    style("strokeColor", "#2f9e44");
    const inBox = ["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw"].map((name) => made[name]);
    check("a style choice applies to every selected shape", inBox.every((id) => byId(id).strokeColor === "#2f9e44"));
    undo();
    check("and is one undo step for all of them", byId(R).strokeColor === "#e03131" && byId(made.ellipse).strokeColor === "#1e1e1e");
    click(260, 140);
    key("2");
    style("strokeColor", "#f08c00");
    check("picking a drawing tool lets go of the selection, so a style choice does not restyle the last shape", !hasSelection() && byId(R).strokeColor === "#e03131");
  });

  await section("pen stroke styles", () => {
    key("7");
    style("strokeColor", "#1e1e1e");
    style("backgroundColor", "transparent");
    style("strokeWidth", 2);
    style("roughness", 1);
    const rows = { solid: 320, dotted: 350, dashed: 380 };
    for (const [name, y] of Object.entries(rows)) {
      style("strokeStyle", name);
      drag(260, y, 500, y, { steps: 30 });
      made[`pen-${name}`] = last().id;
    }
    const styles = Object.keys(rows).map((name) => byId(made[`pen-${name}`]).strokeStyle);
    check("a style picked after a pen stroke is for the next stroke, not the one just drawn", same(styles, Object.keys(rows)), `drawn as ${styles.join(", ")}`);
    const colour = byId(made["pen-dashed"]).strokeColor;
    style("strokeColor", "#e03131");
    const untouched = byId(made["pen-dashed"]).strokeColor === colour;
    style("strokeColor", "#1e1e1e");
    check("a colour picked after a pen stroke leaves that stroke alone", untouched);
    const count = scene().length;
    undo();
    const undone = scene().length === count - 1;
    key("z", { ctrl: true, shift: true });
    check("Ctrl+Z still removes the pen stroke just drawn", undone && scene().length === count);
    key("Escape");
    const share = Object.fromEntries(Object.entries(rows).map(([name, y]) => [name, coverage(y)]));
    const text = Object.entries(share).map(([name, v]) => `${name} ${(v * 100).toFixed(0)}%`).join(", ");
    check("a solid pen stroke is unbroken", share.solid > 0.97, text);
    check("a dotted pen stroke is drawn as dots with gaps", share.dotted > 0.1 && share.dotted < 0.75, text);
    check("a dashed pen stroke is drawn as dashes with gaps", share.dashed > 0.3 && share.dashed < 0.95 && share.dashed > share.dotted, text);
  });

  await section("text", () => {
    key("8");
    check("the Text tool shows font choices and hides shape choices", !groupHidden("fontFamily") && !groupHidden("bold") && groupHidden("backgroundColor") && $("colour-label").textContent === "Colour");
    style("fontFamily", "hand");
    style("fontSize", DEFAULT_FONT_SIZE);
    style("bold", false);
    style("textAlign", "left");
    style("strokeColor", "#1e1e1e");
    const count = scene().length;
    click(560, 330);
    check("a click with the Text tool opens a text box", !editor.hidden, document.activeElement === editor ? "focused" : "not focused (window may not have focus)");
    editorKey("2");
    editorKey("Delete");
    check("keys typed in the text box are not shortcuts", tool() === "text" && scene().length === count && !editor.hidden);
    type("Hello board");
    let e = last();
    const T = e.id;
    made.text = T;
    check(
      "typed text becomes a text element where it was clicked",
      scene().length === count + 1 && e.type === "text" && e.text === "Hello board" && e.x === 560 && e.y === 330 - lineHeightPx(e) / 2 && editor.hidden,
      JSON.stringify({ x: e.x, y: e.y, w: e.width, h: e.height }),
    );
    check("its box matches the measured text", e.width === measureText(e.text, e).width && e.height === lineHeightPx(e));
    check("finishing text returns to Select with the text selected", tool() === "select" && hasSelection());

    const widths = new Set();
    const families = ["hand", "script", "normal", "serif", "code"];
    const wrongFont = families.filter((family) => {
      style("fontFamily", family);
      e = byId(T);
      widths.add(e.width);
      return e.fontFamily !== family || e.width !== measureText(e.text, e).width || !document.fonts.check(fontString(e));
    });
    check("each of the five fonts is applied and re-measured", wrongFont.length === 0 && widths.size === 5, `widths ${[...widths].join(", ")}`);
    style("fontFamily", "hand");
    const regular = byId(T).width;
    style("bold", true);
    const bold = byId(T);
    style("bold", false);
    check("Bold switches to the bold face and back", bold.bold === true && bold.width !== regular && /bold|700/.test(fontString(bold)) && byId(T).width === regular, `${regular} regular, ${bold.width} bold`);
    const heights = Object.values(FONT_SIZES).sort((a, b) => a - b).map((size) => {
      style("fontSize", size);
      return byId(T).fontSize === size ? byId(T).height : NaN;
    });
    check("each size is applied", heights.every((h, i) => h > 0 && (i === 0 || h > heights[i - 1])), `heights ${heights.join(", ")}`);
    style("fontSize", DEFAULT_FONT_SIZE);
    const aligned = ["center", "right", "left"].every((value) => {
      style("textAlign", value);
      return byId(T).textAlign === value;
    });
    check("each alignment is applied", aligned);
    style("strokeColor", "#1971c2");
    key("Escape");
    const box = boundsOf(byId(T));
    const blue = pixels(box[0], box[1], box[2], box[3], like("#1971c2"));
    check("text is painted in its colour", byId(T).strokeColor === "#1971c2" && blue > 50, `${blue} blue pixels`);

    key("8");
    click(560, 400);
    type("one\ntwo\nthree");
    check("multi-line text is one line height per line", last().text === "one\ntwo\nthree" && last().height === 3 * lineHeightPx(last()), `height ${last().height}`);
    made.lines = last().id;

    const n = scene().length;
    key("8");
    click(900, 480);
    type("   ");
    check("an empty text box leaves nothing behind", scene().length === n && editor.hidden && tool() === "select");
    key("8");
    click(700, 480);
    editor.value = "esc";
    editor.dispatchEvent(new Event("input"));
    editorKey("Escape");
    const kept = last().text === "esc" && editor.hidden;
    key("Delete");
    check("Escape keeps what was typed", kept && scene().length === n);
    key("8");
    click(700, 480);
    editor.value = "away";
    editor.dispatchEvent(new Event("input"));
    pointer("pointerdown", 900, 520);
    pointer("pointerup", 900, 520);
    const keptOnClickAway = last().text === "away" && editor.hidden;
    key("Delete");
    check("clicking away keeps what was typed", keptOnClickAway && scene().length === n);

    key("1");
    dblclick(575, 330);
    check("double-click on text opens it for editing", !editor.hidden && editor.value === "Hello board");
    type("Hello again");
    check("edited text replaces the old text in place", byId(T).text === "Hello again" && scene().length === n);
    dblclick(575, 330);
    type("");
    check("clearing a text's words deletes it", !byId(T) && scene().length === n - 1);
    undo();
    check("undo brings the deleted text back", byId(T)?.text === "Hello again");
    dblclick(575, 330);
    type("Hello again");
    check("editing without a change adds no undo step", !$("redo").disabled);
  });

  await section("text over a shape", () => {
    key("2");
    style("strokeColor", "#1e1e1e");
    style("backgroundColor", "#ffec99");
    style("fillStyle", "solid");
    style("strokeStyle", "solid");
    drag(760, 300, 960, 400);
    const F = last().id;
    const shape = () => JSON.stringify(byId(F));
    const original = shape();
    key("1");
    dblclick(860, 350);
    check("double-click on a filled shape starts new text there", !editor.hidden && editor.value === "");
    type("label");
    const L = last().id;
    check("the text is its own element on top, and the shape is untouched", last().type === "text" && last().x === 860 && shape() === original && !("containerId" in last()));
    key("Escape");
    click(870, 350);
    check("a click on text over a shape selects the text, not the shape", hasSelection() && !groupHidden("fontFamily") && groupHidden("backgroundColor"));
    const y = byId(L).y;
    drag(870, 350, 870, 270);
    check("the text drags freely off the shape", byId(L).y === y - 80 && shape() === original);
    click(780, 390);
    check("a click on the shape beside the text selects the shape", hasSelection() && groupHidden("fontFamily") && !groupHidden("backgroundColor"));
    drag(780, 390, 780, 410);
    check("moving the shape leaves the text where it was", byId(F).y === 320 && byId(L).y === y - 80);
    undo();
    key("Escape");
    drag(870, 270, 870, 350);
    key("Delete");
    check("Delete removes the text over a shape and keeps the shape", !byId(L) && shape() === original);
    undo();
    check("undo restores that text", byId(L)?.text === "label");
    key("Escape");
  });

  await section("duplicate and New wobble", () => {
    const R = made.rectangle;
    const count = scene().length;
    key("1");
    click(300, 140);
    key("d", { ctrl: true });
    const { id, seed, x, y, ...copy } = last();
    const { id: id0, seed: seed0, x: x0, y: y0, ...source } = byId(R);
    check("Ctrl+D copies the shape 18 px away with its own seed", scene().length === count + 1 && id !== id0 && seed !== seed0 && x === x0 + 18 && y === y0 + 18 && same(copy, source));
    $("duplicate").click();
    check("the Duplicate button does the same to the copy", scene().length === count + 2 && last().x === x0 + 36);
    undo();
    undo();
    key("Escape");

    click(300, 140);
    const original = byId(R);
    const others = () => JSON.stringify(scene().filter((e) => e.id !== R));
    const rest = others();
    check("New wobble is offered for a sketchy shape", !$("reseed").disabled);
    $("reseed").click();
    const reseeded = byId(R);
    check("New wobble changes only that shape's seed", reseeded.seed !== seed0 && same({ ...reseeded, seed: seed0 }, original) && others() === rest);
    undo();
    check("undo restores the old seed", byId(R).seed === seed0);
    style("roughness", 0);
    const architect = $("reseed").disabled && /no wobble/.test($("reseed").title);
    style("roughness", 1);
    check("New wobble is greyed out for an Architect shape, with the reason", architect && !$("reseed").disabled);
    click(380, 320);
    check("New wobble is greyed out for a pen stroke", hasSelection() && $("reseed").disabled);
    click(575, 330);
    check("New wobble is greyed out for text", hasSelection() && $("reseed").disabled);
    key("a", { ctrl: true });
    const before = scene();
    $("reseed").click();
    const after = scene();
    const wrong = before.filter((e, i) => (after[i].seed !== e.seed) !== seedShowsIn(e));
    check("with everything selected, New wobble reseeds exactly the shapes whose seed shows", wrong.length === 0 && after.some((e, i) => e.seed !== before[i].seed), `${after.filter((e, i) => e.seed !== before[i].seed).length} of ${after.length} reseeded`);
    undo();
    check("and that is one undo step", same(scene(), before));
  });

  await section("select all, clear, undo and redo", () => {
    const full = JSON.stringify(scene());
    const count = scene().length;
    key("a", { ctrl: true });
    key("Delete");
    check("Ctrl+A then Delete empties the board", scene().length === 0 && !$("empty").hidden && $("export").disabled && $("clear").disabled);
    undo();
    check("Ctrl+Z restores every shape exactly", JSON.stringify(scene()) === full && $("empty").hidden);
    key("z", { ctrl: true, shift: true });
    const redone = scene().length === 0;
    undo();
    key("y", { ctrl: true });
    check("Ctrl+Shift+Z and Ctrl+Y both redo", redone && scene().length === 0);
    undo();
    $("clear").click();
    const cleared = scene().length === 0;
    $("undo").click();
    const back = JSON.stringify(scene()) === full;
    $("redo").click();
    const again = scene().length === 0;
    $("undo").click();
    check("the Clear, Undo and Redo buttons work", cleared && back && again && scene().length === count);
    const redoWaiting = !$("redo").disabled;
    key("1");
    key("Escape");
    click(300, 140);
    key("d", { ctrl: true });
    check("a new change discards the redo history", redoWaiting && $("redo").disabled);
    undo();
    key("Escape");
  });

  await section("save as PNG", async () => {
    const originalClick = HTMLAnchorElement.prototype.click;
    let link = null;
    HTMLAnchorElement.prototype.click = function captureInsteadOfDownloading() {
      link = { href: this.href, download: this.download };
    };
    try {
      $("export").click();
      for (let i = 0; i < 60 && !link; i++) await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
    }
    check("Save PNG hands the browser a file called wobbleboard.png", link?.download === "wobbleboard.png", link ? link.href.slice(0, 5) : "no link");
    const blob = await (await fetch(link.href)).blob();
    const head = [...new Uint8Array(await blob.slice(0, 8).arrayBuffer())];
    const bitmap = await createImageBitmap(blob);
    const boxes = scene().map(boundsOf);
    const width = Math.ceil((Math.max(...boxes.map((b) => b[2])) - Math.min(...boxes.map((b) => b[0])) + 64) * 2);
    const height = Math.ceil((Math.max(...boxes.map((b) => b[3])) - Math.min(...boxes.map((b) => b[1])) + 64) * 2);
    check("the file is a real PNG", blob.type === "image/png" && same(head, [137, 80, 78, 71, 13, 10, 26, 10]), `${blob.size} bytes`);
    check("the image is cropped to the drawing at double size", bitmap.width === width && bitmap.height === height, `${bitmap.width} x ${bitmap.height}`);
    const out = document.createElement("canvas");
    out.width = bitmap.width;
    out.height = bitmap.height;
    const octx = out.getContext("2d");
    octx.drawImage(bitmap, 0, 0);
    const d = octx.getImageData(0, 0, out.width, out.height).data;
    let drawn = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 0xfb) + Math.abs(d[i + 1] - 0xfa) + Math.abs(d[i + 2] - 0xf7) > 60) drawn++;
    check("the image has the paper background and the drawing on it", same([d[0], d[1], d[2], d[3]], [0xfb, 0xfa, 0xf7, 255]) && drawn > 5000, `${drawn} drawn pixels`);
  });

  return results;
}

// Text for the whiteboard. The structure follows the excalidraw.com bundle
// (assets/index-tsAfIkr7.js): one font string per element, lines split on
// newlines, each line drawn with fillText at a fixed line height.
// Bundle 80:161 (the text draw branch), 49:67088 (`jr` sizes), 49:67150 (`qe` font ids).
//
// The fonts are not Excalidraw's. They are five open-source faces (SIL Open
// Font License) bundled in ./fonts, each in regular and bold, with system
// fonts as fallbacks.

/** Excalidraw's four sizes: S, M, L, XL. Bundle `jr={sm:16,md:20,lg:28,xl:36}`. */
export const FONT_SIZES = { sm: 16, md: 20, lg: 28, xl: 36 };
export const DEFAULT_FONT_SIZE = FONT_SIZES.md;
/** Line height the bundle uses for its hand-drawn, normal and code fonts. */
export const LINE_HEIGHT = 1.25;

export const FONTS = {
  hand: '"Kalam", "Ink Free", "Segoe Print", "Comic Sans MS", cursive',
  script: '"Caveat", "Segoe Script", "Bradley Hand", cursive',
  normal: '"Nunito", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: '"Lora", Georgia, "Times New Roman", serif',
  code: '"JetBrains Mono", Consolas, "Cascadia Mono", Menlo, monospace',
};

export const fontString = ({ fontSize, fontFamily, bold }) =>
  `${bold ? "bold " : ""}${fontSize}px ${FONTS[fontFamily] || FONTS.normal}`;

/** Every bundled face, regular and bold, in the form document.fonts.load expects. */
export const FONT_FACES = Object.keys(FONTS).flatMap((fontFamily) =>
  [false, true].map((bold) => fontString({ fontSize: DEFAULT_FONT_SIZE, fontFamily, bold })),
);
export const lineHeightPx = ({ fontSize }) => fontSize * LINE_HEIGHT;
export const splitLines = (text) => text.replace(/\r\n?/g, "\n").split("\n");

let measurer = null;
/** Tests supply their own measuring context; the browser makes one on demand. */
export function setMeasureContext(context) {
  measurer = context;
}
function measureContext() {
  if (!measurer) {
    // A canvas that belongs to the page, so it measures with the page's loaded fonts.
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : new OffscreenCanvas(1, 1);
    measurer = canvas.getContext("2d");
  }
  return measurer;
}

/** Size of a block of text: the widest line, and one line height per line. */
export function measureText(text, style) {
  const context = measureContext();
  context.font = fontString(style);
  const lines = splitLines(text);
  const widest = Math.max(...lines.map((line) => context.measureText(line).width));
  return { width: Math.ceil(widest) + 1, height: lines.length * lineHeightPx(style) };
}

/** Draw a text element at the origin. The caller has already moved to its position. */
export function renderText(ctx, element) {
  ctx.font = fontString(element);
  ctx.fillStyle = element.strokeColor;
  ctx.textAlign = element.textAlign;
  ctx.textBaseline = "alphabetic";
  const lines = splitLines(element.text);
  const x = element.textAlign === "center" ? element.width / 2 : element.textAlign === "right" ? element.width : 0;
  const step = lineHeightPx(element);
  // Centre the font's own ascent and descent inside each line, as a text box does.
  const metrics = ctx.measureText("Mg") || {};
  const ascent = metrics.fontBoundingBoxAscent ?? element.fontSize * 0.8;
  const descent = metrics.fontBoundingBoxDescent ?? element.fontSize * 0.2;
  const baseline = (step - (ascent + descent)) / 2 + ascent;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, i * step + baseline);
}

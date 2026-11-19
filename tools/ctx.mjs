// Print bounded context around regex matches in a (minified) script, with
// 1-based line and 0-based column so every quote can be cited as evidence.
// usage: node tools/ctx.mjs <file> <regex> [before=200] [after=600] [max=3] [skip=0]
import { readFileSync } from "node:fs";

const [file, pattern, before = "200", after = "600", max = "3", skip = "0"] = process.argv.slice(2);
const text = readFileSync(file, "utf8");
const lineStarts = [0];
for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
const locate = (offset) => {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return `${lo + 1}:${offset - lineStarts[lo]}`;
};
const re = new RegExp(pattern, "g");
let m, n = 0, shown = 0;
while ((m = re.exec(text))) {
  if (n++ < Number(skip)) continue;
  if (shown++ >= Number(max)) break;
  const start = Math.max(0, m.index - Number(before));
  const end = Math.min(text.length, m.index + m[0].length + Number(after));
  console.log(`--- match ${n} @ ${locate(m.index)} (offset ${m.index})`);
  console.log(text.slice(start, end).replace(/\n/g, "⏎"));
  if (m[0].length === 0) re.lastIndex++;
}
console.log(`(${n} matches scanned)`);

# Third-party notices

## Code the drawing engine was rebuilt from

`src/rough.mjs`, `src/freehand.mjs`, `src/shapes.mjs` and parts of `src/text.mjs` reimplement behaviour read from the minified production bundle of excalidraw.com. That bundle contains the three MIT-licensed projects below. No file was copied from them, but the algorithms and constants are theirs, so their notices are kept here.

| Project | Used for | Copyright notice |
|---|---|---|
| [Excalidraw](https://github.com/excalidraw/excalidraw) | Per-element options, roughness adjustment, shape cache, text sizes | Copyright (c) 2020 Excalidraw |
| [roughjs](https://github.com/rough-stuff/rough) | Seeded sketchy lines, ellipses, curves and hatching | Copyright (c) 2019 Preet Shihn |
| [perfect-freehand](https://github.com/steveruizok/perfect-freehand) | Pressure-shaped pen stroke outline | Copyright (c) 2021 Stephen Ruiz Ltd |

All three are distributed under the MIT License:

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`grading/` installs roughjs 4.6.4 and perfect-freehand 1.2.0 from npm as answer keys. They are not bundled in this repository.

## Fonts

The files in `fonts/` are the Latin subsets of five typefaces, each under the SIL Open Font License 1.1. The full licence texts are in `fonts/licenses/`.

| Typeface | Shown in the app as | Licence text |
|---|---|---|
| Kalam | Hand | `fonts/licenses/kalam-OFL.txt` |
| Caveat | Script | `fonts/licenses/caveat-OFL.txt` |
| Nunito | Normal | `fonts/licenses/nunito-OFL.txt` |
| Lora | Serif | `fonts/licenses/lora-OFL.txt` |
| JetBrains Mono | Code | `fonts/licenses/jetbrains-mono-OFL.txt` |

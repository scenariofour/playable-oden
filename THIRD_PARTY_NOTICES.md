# Third-party software and assets

Playable Oden's own code is MIT-licensed (see [LICENSE](LICENSE)). This file lists everything else the project uses,
how it is used, and under which terms. The MIT License covers this project's code. It does not relicense anything listed below.

## Bundled in this repository

**No third-party files are bundled.** There are no image, model, texture, audio, video or font files in the runtime.
Everything you see is generated in code at runtime:

| What | How it is made |
|---|---|
| Oden warmer, bowl, tongs, tray, counter, condiments | Procedural Three.js geometry (`src/station/props.js`, `src/station/set.js`) |
| The six ingredients | Procedural geometry and GLSL shaders written for this project (`src/station/foods.js`) |
| Broth, steam, bubbles, drips | Shaders and small particle systems written for this project (`src/station/broth.js`, `src/station/fx.js`) |
| Reflections (environment map), wood grain, backdrop | Painted on `<canvas>` at runtime (`src/station/set.js`) |
| In-world price cards | Drawn on `<canvas>` at runtime (`src/station/tags.js`) |
| Receipt icons, cart and UI icons | Inline SVG written for this project (`src/shop/ui.js`, `src/shop/shop.js`) |
| `favicon.svg` | Drawn for this project |
| Screenshots in `docs/media/` | Captured from this project |

### Small code snippets

Two well-known, very small snippets appear in the code. Neither is a substantial portion of a third-party work, but
they are credited here:

- `mulberry32` seeded random number generator (`src/station/set.js`), by Tommy Ettinger, released into the public domain.
- A two-line `hash21` GLSL hash (`src/station/foods.js`) of the kind popularised by Martijn Steinrucken (The Art of Code) shader tutorials.

## Loaded at runtime from a CDN (not redistributed)

`index.html` loads these through an import map and a stylesheet link. They are not copied into this repository or into
`dist/`. If you self-host them, keep their license notices with the files.

### three.js r169

- Used for: all 3D rendering. `three.module.js` and three addons (`BufferGeometryUtils`, `RoundedBoxGeometry`).
- Source: <https://cdn.jsdelivr.net/npm/three@0.169.0/> (pinned version)
- License: MIT

```
The MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### Zen Maru Gothic (font)

- Used for: the order slip, cart, checkout and the in-world price cards. If it fails to load, the page falls back to
  system rounded fonts.
- Source: Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`)
- Designer: Yoshimichi Ohira
- License: SIL Open Font License 1.1 (<https://openfontlicense.org>)

Loading a font from Google Fonts sends visitors' IP addresses to Google. If that matters for your deployment, self-host
the font files under the OFL (keep its license file with them) and change the `<link>` in `index.html`.

## Development-only tools (optional, not installed by default)

- **Node.js** runs the dev server, build, tests and station sync scripts. They use only Node's built-in modules.
- **Playwright** (`playwright-core`, Apache-2.0) is used by the optional end-to-end check in `test/e2e/`. You install it
  yourself with `npm i --no-save playwright-core`. It is not a dependency of the project.

## Names and marks

"Oden", "konbini" and the ingredient names are generic food and shop terms. The demo store names, addresses, delivery
areas, rates and payment options in `src/shop/merchant.js` are made up for the demo. They don't refer to any real business,
carrier or payment provider. Postal-code prefixes are real Japanese prefixes, used only to show how an area check works.

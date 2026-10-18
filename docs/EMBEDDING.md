# Embedding the station

The 3D station (`src/station/`) can run without the shop. It is one Three.js group with no renderer, camera, lights,
DOM or loop of its own, so another Three.js app can place it in its own scene. [`examples/embed.html`](../examples/embed.html)
is a complete minimal host of about 70 lines. The standalone shop (`src/shop/main.js`) is a fuller one.

## Requirements

- Three.js **r169**. The station imports `three` and `three/addons/...` as bare specifiers, so the host page needs an import
  map (or a bundler) that resolves them. Other Three.js versions are untested.
- The eight files in `src/station/`, kept together in one folder.
- Optional: the Zen Maru Gothic font for the in-world cards. Without it they fall back to a system font.

## Minimal host

```js
import * as THREE from 'three';
import { createStation, createEnvironment } from './station/station.js';

const station = createStation({
  prices: false,                      // in-world cards show name and stock only (true adds the demo price)
  hooks: {                            // all optional
    change: (model) => {},            // bowl or warmer changed: { lines: [{ key, qty, adding, leaving, avail }], count, pending, full, canUndo, menu }
    landed: (piece, toBowl, pos) => {}, // a piece was set down in the bowl, or put back in the warmer
    toast: (text) => {},              // short notice: bowl full, sold out, restocking
    say: (text) => {},                // text for a screen-reader live region
    locked: () => {},                 // a pick arrived while the station is locked
  },
});
station.layout({ cols: 3, caseZ: -0.02, bowl: [0.31, 0.06], holder: 'case', housing: { h: 0.1, deck: 0.028 } });
scene.add(station.root);              // move, rotate or scale station.root freely
station.setCamera(camera, renderer.domElement.height);

// every frame
station.tick(dt);                     // seconds; clamp it (e.g. to 1/30) after a tab switch

// on a click or tap
raycaster.setFromCamera(ndc, camera);
const target = station.pick(raycaster.ray);
if (target) station.act(target);
```

## API

| Call | What it does |
|---|---|
| `createStation({ prices, hooks })` | Builds the station. Returns the API below. |
| `layout(L)` | Builds the warmer for a layout. `L = { cols, caseZ, caseY?, bowl: [x, z \| null], holder: 'bowl' \| 'case', housing? }`. With `housing: { h, deck, label? }` the warmer stands on the counter in its own stainless body. Without it the well is sunk into the host's counter, and the host cuts the opening (see `createCounter().userData.cutWell` in `set.js`). |
| `tick(dt)` | Advances simulation and animation. The host calls it from its loop. |
| `setCamera(camera, heightPx)` | The camera that looks at the station, and the drawing height in device pixels (for steam and drip sizing). |
| `setEnvironment(texture, k)` | Reflections for a host without `scene.environment`. `createEnvironment(renderer, { room, lights, glow })` paints one, and a host can pass its own `room` / `lights` painters to match its space. |
| `setDetail('near' \| 'rest')` | `'rest'` shares one material per kind, for when nobody is at the warmer (cheaper). `'near'` is full detail. |
| `pick(ray)` / `act(target)` | Hit-test a world-space ray, then run what the hit means: take a piece, put one back from the bowl, or press a price card. |
| `press(target, down)` / `hover(target)` | Optional press and hover feedback. |
| `addKind(key)` / `removeKind(key)` / `undo()` / `emptyBowl()` | The same actions from your own UI. |
| `model()` | What is in the bowl and what is available, derived from the pieces. |
| `lock(bool)` | Ignore picks (for example while the host is busy). |
| `takeBowl()` / `serveMotion(served, to, done)` / `fillBowl(lines)` | Used by the shop: the bowl leaves for the cart, a fresh bowl arrives, and a bowl comes back from the cart to be edited. |
| `root`, `bowl`, `holder`, `housing`, `oc`, `lamp`, `keyDir` | Objects and values a host may frame its camera on, or align its lights with. |
| `FOODS`, `ORDER` | The demo menu (see [ARCHITECTURE.md](ARCHITECTURE.md) on separating it). |

The station never imports from `src/shop/`, so a host that only wants the 3D interaction ships only these eight files.

## Vendoring the station into another project

This repository is meant to be the authoritative source for the station. A project that embeds it keeps a **vendored
copy**: the eight files copied into one folder of that project, at a known version. No package registry, submodule
or monorepo is needed.

```bash
# from a playable-oden checkout
node scripts/sync-station.mjs ../other-project/vendor/oden --check   # are the copies current? changes nothing
node scripts/sync-station.mjs ../other-project/vendor/oden           # copy, and write STATION_VERSION.json
```

`STATION_VERSION.json` records the source commit and a hash of each file, so the embedding project can always tell
which station it runs. Then test the embedding project and commit the update there, as you would for any dependency bump.

### Example: an existing 3D world that embeds the station

The station was first built inside a larger Three.js world (a convenience store you can walk through) and later
extracted here. That project vendors the same eight files at `lab/oden/`, loads `station.js` with a dynamic `import()`
once its store is showing, and keeps a simpler placeholder pot until the station's shaders have compiled. If the
import fails, the placeholder stays. It uses `prices: false`, the countertop `housing`, its own room painters for
reflections, adds no lights, and calls `setDetail('rest')` when the visitor walks away. Its build copies only the
station's import graph and fails if the station ever imports shop code. At extraction, `sync-station.mjs --check` reported
all eight files identical.

A few comments in the station source still mention that host by name ("RIRRI'S"). They describe the embedding case
(no prices, no environment of its own) and don't affect behaviour.

## Things to know

- The station allocates GPU resources (geometries, shader programs, canvas textures). It has no `dispose()` yet. If your
  host removes and re-adds it often, add one.
- Run `tick` only while the station is visible. The host above runs it every frame in focus, and otherwise only when it
  is near and in view.
- On the first frame, compile the station's materials against your lights (`renderer.compileAsync`) before you show it,
  to avoid a hitch.

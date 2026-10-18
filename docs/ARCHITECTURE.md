# Architecture

Playable Oden is a single static page made of plain ES modules. There is no framework, bundler or backend. Three.js
comes from a pinned CDN URL in the import map in `index.html`.

The code is split along five layers. Two of them are real module boundaries today (the station and the shop). The
others are seams that the code respects but hasn't pulled into separate modules yet. This page describes both, so you
can tell what is already separated and what is still mixed together.

## The five layers

| Layer | What belongs in it | Where it is today |
|---|---|---|
| **1. Station and interaction** (Three.js) | warmer, broth, food models, tongs, bowl, picking, transfers, undo, restock, steam, bubbles | `src/station/`: `station.js` (`createStation`), `props.js`, `foods.js` (shapes and shaders), `broth.js`, `fx.js`, `tags.js`, `motion.js`, `set.js` |
| **2. Product catalog** (data) | product id, names, price, selling unit, stock, which 3D look to use | `FOODS` and `ORDER` in `src/station/foods.js`, **mixed in with** geometry, colours and settle physics |
| **3. Order and cart state** (no Three.js) | bowl contents, totals, cart items, validation | Bowl contents: `model()` in `station.js`, derived from where the pieces are. Cart and totals: `src/shop/main.js` and `src/shop/checkout.js` |
| **4. Host and presentation** | renderer, camera, framing, lights, page UI | `src/shop/main.js` (renderer, lights, `frameCamera()`, layouts), `src/shop/ui.js` (order slip), `index.html` (styles) |
| **5. Merchant settings and checkout boundary** | fulfillment, stores, delivery zones, rates, payments; handing an order to a real system | `src/shop/merchant.js` (mock settings), `src/shop/checkout.js` (rules and `placeDemoOrder()`), `src/shop/shop.js` (cart and checkout UI) |

The rule that keeps layer 1 reusable: **nothing in `src/station/` imports from `src/shop/`.** The build and the tests
check it (`scripts/build.mjs`, `test/structure.test.mjs`).

## The station (`src/station/`)

`createStation({ prices, hooks })` returns one Three.js group and an API. The station has no renderer, camera, lights,
DOM or animation loop of its own. The host does all of that and calls `tick(dt)` from its loop. See
[EMBEDDING.md](EMBEDDING.md) for the API and a minimal host.

Inside the station, every piece of food is one object that lives in exactly one place. A tap reserves a piece and queues
it for the tongs. The piece joins the bowl when it touches the broth in the bowl, and leaves it when it is back in the
warmer. The bowl's contents (`model()`) are derived from where the pieces are, so the slip can't disagree with what you
see. Empty compartments are restocked from a tray. State changes as soon as you tap, and the motion only shows the
change. A tap during an animation finishes it immediately.

The station works in its own coordinate frame (metres, y = 0 on the counter, +z toward the customer). Shaders that
need positions (broth, waterlines on the food) work in that frame too, through the `uToS` / `uFromS` uniforms, so a
host may move, rotate or scale the whole group.

## The shop (`src/shop/`)

The station is the playful part. The shop around it is deliberately ordinary web-shop UI.

- **Order slip** (`ui.js`): the current bowl's lines with − / + steppers, the running total, Undo and **Add to cart**.
  On phones it becomes a bottom sheet with a strip of menu chips, because the in-world price cards would be too small
  to tap.
- **Add to cart** (`main.js` → `checkout.js#makeBowl`): freezes the bowl's lines (id, names, unit price, quantity,
  amount), its count, total and a `signature`, plus a picture of the real bowl cut from the frame. The pieces leave the
  station with the bowl, the bowl slides off toward the cart and a fresh one is set down.
- **Cart** (`shop.js`): any number of bowls. **Remove**, or **Edit**, which puts the bowl back on the counter (only into
  an empty bowl) and keeps its number.
- **Checkout** (`shop.js`, rules in `checkout.js`): one page. Contact, then how you'd like it (only the methods the
  merchant offers for this kind of product), then store and time, or address with a delivery-area check and a time
  window, or address with a shipping rate and arrival date. Then free extras, then payment method (no card fields),
  then place. The summary shows subtotal, the fee for the chosen method, the total and the tax included in it.
- **The checkout boundary**: `placeDemoOrder(cart, selection, catalog, merchant, { orderNo })` validates everything and
  returns a frozen order with `sent: false, charged: false`. **This is where a real merchant integration would go.**

`checkout.js` and `merchant.js` have no DOM or Three.js dependencies and are unit-tested in Node (`test/checkout.test.mjs`).

## Data flow

```
tap on a piece ──► station.pick(ray) ──► station.act(target)
                       │
                       ▼
         piece reserved, tongs queued ──► hooks.change(model) ──► slip.render(model)
                       │
                (motion plays; can be skipped)
                       ▼
         piece lands in the bowl ──► hooks.landed(piece) ──► "+¥110" pop, screen-reader line

Add to cart ──► makeBowl(lines, FOODS) ──► cart[] ──► shop.render(cart)
Checkout ──► validateCheckout(...) ──► placeDemoOrder(...) ──► demo confirmation (nothing sent or charged)
```

## Rules worth keeping

- **The order is the source of truth, and the bowl shows it.** A real order must never depend on mesh positions or an
  animation finishing. Today `model()` counts a piece once its `inBowl` flag flips mid-transfer, which is fine for a
  demo. In a real integration, a tap should add a line to the order immediately and the 3D transfer should only
  confirm a change that already happened.
- **Products shouldn't know about Three.js, and 3D looks shouldn't know about prices.** Today `FOODS` holds both. The
  first refactor for a real catalog is to split it into a catalog (id, names, price, unit, stock, `look`) and a table
  of looks (geometry, shader colours, grip, settle). Several products could then share one look.
- **Six is a demo, not a limit, but some code still assumes it.** The warmer is built as `cols × rows` cells from the
  menu (3 × 2 on wide screens, 2 × 3 on phones), and `ARRANGE` only chooses which kind sits where. But `HOMES` (how
  pieces lie in a compartment), the hand-drawn receipt `ICONS` in `ui.js` and the keyboard shortcuts 1–6 assume the six
  demo ingredients.
- **The host owns the room.** The station must work inside another 3D scene (with that scene's camera and lights) or
  on a plain page, without bringing an environment with it.

## Adapting it to another menu (not built yet)

There is no importer and no catalog API. Changing the menu today means editing code. In order:

1. Split `FOODS` into `catalog.js` (id, `en`, `jp`, price, unit, stock, `look`) and the looks in `foods.js`.
2. Add a look for each new product: geometry, colours and how the tongs hold it (`foods.js`), where it rests in a
   compartment (`HOMES` in `station.js`) and a receipt icon (`ICONS` in `ui.js`).
3. Move the bowl's contents and the order maths into a small `order.js` of plain functions (`add`, `remove`, `undo`,
   `lines`, `total`) that can be tested in Node; the station then plays motions in response.
4. Replace `merchant.js` with the merchant's real settings, and `placeDemoOrder()` with a handoff to their checkout
   (create a cart from the bowls' lines and the chosen fulfillment, then let their secure checkout take payment).

These steps are written down so the order of the work is clear. None of them is part of this release.

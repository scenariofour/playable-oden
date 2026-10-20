# Playable Oden

**English** | [简体中文](README.zh-CN.md)

**A 3D oden warmer you shop from.** Pick ingredients out of a simmering warmer with a pair of tongs, build your own
bowls, and turn them into a shopping cart, all in the browser.

![Tongs carrying a piece of daikon from the oden warmer to the bowl, with the order slip updating beside it](docs/media/hero.jpg)

> **[▶ Play the live demo](https://scenariofour.github.io/playable-oden/)** · works on desktop and phones · [`?merchant=chilled`](https://scenariofour.github.io/playable-oden/?merchant=chilled) adds shipping
>
> **The checkout is a simulation.** No real orders, payments, delivery services or merchant APIs are connected.
> Prices, stores and delivery areas are made up, and nothing you enter is sent anywhere.

## What is Playable Oden?

Most online food shops present a grid of product cards. Playable Oden replaces the grid with the counter itself. In a
Japanese convenience store, oden simmers in a divided warmer by the register, and you choose what you want piece by
piece. Here you do the same thing in 3D: tap a piece of daikon, and the tongs lift it out of the broth, carry it over
and set it down in your bowl. Tap it again in the bowl and it goes back. Every choice is an order line, so when the
bowl looks right you add it to the cart and check out like on any food website.

The project has two parts:

- **The station**: the warmer, broth, six ingredients, tongs, bowl, steam and restocking. It is a self-contained
  Three.js module that other 3D scenes can embed.
- **The shop**: an ordinary order slip, cart and one-page checkout around the station, with demo merchant settings
  for pickup, local delivery and shipping.

<p align="center"><img src="docs/media/demo.gif" width="600" alt="Animated: three ingredients are picked with the tongs and land in the bowl, then the bowl is added to the cart"></p>

## Key features

- **A playable warmer.** Six procedurally modelled ingredients (daikon, egg, mochi pouch, chikuwa, konnyaku, tsumire
  skewer) sit in a translucent broth that ripples, clings to lifted food and simmers. Steam rises from each compartment.
- **Tongs with weight.** Pieces are lifted, carried and set down along arcs, squeeze slightly under the tongs, drip, and
  settle into the bowl. Their neighbours jostle when they land. Several picks queue up. A tap during an animation
  finishes it immediately.
- **The order is the bowl.** The order slip is derived from where the pieces actually are, so the bowl and the order
  can't disagree. You can put pieces back, use the − / + steppers or Undo, and up to 8 pieces fit in one bowl.
- **Stock and restocking.** Compartments show how many are left. When one runs empty, the staff refill it from a tray.
- **Multiple bowls.** **Add to cart** saves a picture of the bowl you made, slides it off toward the cart, and sets
  down a fresh one. In the cart you can remove a bowl, or put it back on the counter to edit it.
- **A conventional checkout.** One page with contact details, fulfillment method, store and time or delivery address,
  free extras, payment method and an order summary with tax.
- **Demo merchant settings.** Hot bowls for pickup and local delivery, or chilled packs that can also be shipped,
  chosen with a URL parameter.
- **Desktop and phone layouts.** On wide screens the bowl sits beside the warmer and the slip is a ticket. On phones
  the warmer is rebuilt two columns wide above the bowl, and the slip becomes a bottom sheet with a menu strip.
- **No build step, no backend.** Plain ES modules and Three.js from a pinned CDN URL. Any static host works.

| Picking an ingredient | A customised bowl |
|---|---|
| ![The tongs lifting a piece of daikon out of the broth](docs/media/pick.jpg) | ![A bowl with daikon, eggs, konnyaku, chikuwa, a tsumire skewer and a mochi pouch](docs/media/bowl.jpg) |
| **The cart** | **On a phone** |
| ![The cart drawer with three bowls, each with a picture of the real bowl and its contents](docs/media/cart.jpg) | <img src="docs/media/phone.jpg" width="300" alt="Phone layout: the warmer above the bowl, the order slip as a bottom sheet with menu chips"> |

## Getting started

You need [Node.js](https://nodejs.org) 18 or newer. The project has **no dependencies to install**.

```bash
git clone https://github.com/scenariofour/playable-oden.git
cd playable-oden
npm run dev
```

Then open <http://127.0.0.1:8080/>. A WebGL2-capable browser and an internet connection (for Three.js and the font
from their CDNs) are required.

To try it on a phone on the same network: `HOST=0.0.0.0 npm run dev`, then open `http://<your-computer's-ip>:8080/`.

Any static file server works too, for example `python3 -m http.server 8080`. The page must be served over HTTP
because ES modules don't load from `file://`.

| Command | What it does |
|---|---|
| `npm run dev` | Serves the project root at port 8080 (`PORT` and `HOST` can be changed). |
| `npm test` | Unit tests for cart, checkout and merchant rules, plus structure checks (Node's built-in test runner). |
| `npm run build` | Copies the files the page loads into `dist/` and fails if any import is missing. |
| `npm run preview` | Serves `dist/`. |
| `npm run sync-station -- <dir> [--check]` | Copies the station into another project, or checks that its copy is current ([docs/EMBEDDING.md](docs/EMBEDDING.md)). |

An optional end-to-end check drives the whole flow with real clicks in Chrome. It runs 27 checks covering picking,
undo, several bowls, edit and remove, and pickup, delivery and shipping checkouts. See the header of
[`test/e2e/shop-flow.mjs`](test/e2e/shop-flow.mjs) for how to run it.

## How the 3D shopping works

1. **Choose.** Tap a piece in the warmer, its price card, or (on a phone) a menu chip. The piece is reserved right
   away and the tongs fetch it. The slip shows `+1 coming` until it lands.
2. **Change your mind.** Tap a piece in the bowl to put it back, use the − / + steppers or **Undo**. With a keyboard,
   `1`–`6` add an ingredient and `Z` or `Backspace` undoes.
3. **Add to cart.** The bowl's contents are frozen into a cart item (lines, quantities, prices, total) together with a
   picture of the bowl taken from the 3D view. A fresh bowl is set down.
4. **Cart.** Review the bowls, remove one, or choose **Edit** to put a bowl back on the counter and change it. It
   keeps its number.
5. **Checkout (simulated).** Choose pickup, local delivery or shipping (as the merchant allows), fill in the details
   or use **Fill in demo details**, and place the simulated order. The checkout is labelled as a simulation
   throughout, and the confirmation page says plainly that nothing was sent or charged.

![The one-page checkout with the order summary](docs/media/checkout.jpg)

## Deployment

The site is static. Deploy the repository root (or the output of `npm run build`) to any static host.

- **GitHub Pages** (how the [live demo](https://scenariofour.github.io/playable-oden/) is hosted): Settings → Pages →
  Deploy from a branch → `main` / root. No build is needed because `index.html` sits at the root and every path is
  relative, so it works under a project subpath such as `/playable-oden/`. The empty `.nojekyll` file skips Jekyll processing.
- **Netlify, Vercel, Cloudflare Pages and similar**: no framework preset, build command `npm run build`, output
  directory `dist`. Or skip the build and deploy the root.

The page loads Three.js r169 from jsDelivr and the Zen Maru Gothic font from Google Fonts. To avoid those requests,
download the files, serve them yourself, and point the import map and the font `<link>` in `index.html` at your copies
(see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

## Demo merchant configurations

Merchant settings are plain data in [`src/shop/merchant.js`](src/shop/merchant.js), selected with `?merchant=`. All
values are fictional and only serve to make the checkout realistic.

| | `?merchant=counter` (default) | `?merchant=chilled` |
|---|---|---|
| What is sold | Hot oden bowls, ready to eat | The same bowls as chilled packs to heat at home (keep 3 days) |
| Store pickup | 2 demo stores, ready in about 10 min, 15-min slots | Same stores, about 30 min, 30-min slots |
| Local delivery | 10:00–22:00, about 35–50 min, 30-min windows, ¥800 minimum, free over ¥2,000 | 10:00–20:00, 2-hour windows, ¥1,500 minimum, free over ¥4,000 |
| Delivery area | Postal codes starting 150, 151 (¥300) and 153 (¥400) | Same area, ¥400–¥500 |
| Shipping | Not offered (hot food isn't shipped) | Chilled standard ¥980 (2 days) or express ¥1,480 (1 day), 15:00 cut-off, 5 arrival dates, not to Okinawa |
| Payment | Card (no card fields: a real shop would use its payment provider's form) or pay at the store (pickup only) | Same |
| Free extras | Karashi mustard, extra broth, chopsticks | None |

All prices include tax. The order summary shows the tax inside the total, using Japan's rates (8% on take-away food,
10% on delivery and shipping fees). Menu prices are ¥80–¥150 per piece and live in `FOODS` in
[`src/station/foods.js`](src/station/foods.js).

## URL parameters

| Parameter | Effect |
|---|---|
| `?merchant=counter` / `chilled` | Demo merchant settings (see above). |
| `?layout=side` / `front` | Force the wide (bowl beside the warmer) or phone (bowl in front) arrangement. |
| `?frame=9x16` | Renders a centred 9:16 portrait frame with the phone layout, useful for vertical screen recording. |
| `?ui=0` | Hides the order slip, cart button and hints, leaving the scene alone. `H` toggles this at any time. |
| `?debug` | Shows a frame-rate counter. |

For 16:9 footage, size the browser viewport to 16:9 (for example 1920 × 1080). For frame-perfect captures,
`window.__oden.advance(seconds)` steps the simulation deterministically and renders one frame, so a capture script can
screenshot every step at any frame rate.

## Customisation today

What you can change by editing code (there is no configuration UI or importer):

- **Merchant settings**: stores, hours, delivery zones, fees, shipping rates, payment methods and extras in
  `src/shop/merchant.js`.
- **Names, prices, units and starting stock** of the six ingredients: `FOODS` in `src/station/foods.js`.
- **Shop UI copy and styles**: `src/shop/shop.js`, `src/shop/ui.js` and the `<style>` block in `index.html`.
- **Layouts and camera**: `LAYOUTS` and `frameCamera()` in `src/shop/main.js`.
- **Embedding the station elsewhere**: see [docs/EMBEDDING.md](docs/EMBEDDING.md) and the minimal host in
  [`examples/embed.html`](examples/embed.html).

Adding a new kind of food is real work today. It needs new geometry and shader colours, a resting arrangement in the
compartment and a receipt icon. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains which parts still assume the six demo ingredients.

## Project structure

```
index.html            the page: styles, import map (three.js r169), slip markup
src/
  station/            the 3D station: never imports the shop
    station.js          createStation(): picking, tongs, transfers, bowl, restock, undo
    foods.js            the six ingredients: geometry, shaders, and the demo menu (FOODS)
    broth.js, fx.js     broth surface, steam, drips, bubbles
    props.js, set.js    warmer, bowl, tongs, tray, counter, painted reflections
    tags.js, motion.js  in-world price cards, springs and tweens
  shop/               the standalone shop around the station
    main.js             host: renderer, lights, camera, input, cart state
    ui.js               order slip, price pops, toasts
    shop.js             cart button, cart drawer, checkout page
    checkout.js         cart and checkout rules, placeDemoOrder() (no DOM, unit-tested)
    merchant.js         demo merchant settings
examples/embed.html   the station on its own, in a minimal host
scripts/              dev server, build, station sync (Node built-ins only)
test/                 unit and structure tests; test/e2e/ optional browser check
docs/                 architecture, embedding guide, README images
```

The code is organised in five layers: the station and interaction, the product catalog, order and cart state, the
host and presentation, and the merchant settings and checkout boundary.
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes each one, where it lives today and which ones are still
mixed together.

## Integrating with a real merchant

**What exists:** a cart model where each bowl is a frozen list of lines (product id, names, unit price, quantity,
amount), cart validation that rejects unknown products and stale prices, fulfillment rules (methods by product
temperature, opening hours and time slots, delivery zones by postal code, minimums and free-delivery thresholds,
shipping rates, cut-offs and excluded regions), tax-inclusive quoting, and a single function,
`placeDemoOrder()`, where an order would be handed off.

**What doesn't exist:** a real product catalog or inventory connection, a backend, order submission, payment
processing, address verification, delivery rating, user accounts, order history, or email confirmations. Nothing is
stored or sent anywhere. The cart lives in memory and is gone when you reload the page.

A real integration would load the merchant's catalog and settings in place of `FOODS` and `merchant.js`, and replace
`placeDemoOrder()` with a handoff: create a cart or checkout session in the merchant's own system from the bowls'
lines and the chosen fulfillment, then let their secure, hosted checkout take payment.

## Known limitations

- **Demo only.** No orders are sent and no payments are taken. Prices, stores and areas are fictional.
- **Six ingredients.** The menu, compartment layout, receipt icons and keyboard shortcuts are built around the six demo
  ingredients. A different catalog needs code changes (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).
- **Japan-specific checkout.** Yen, Japanese postal codes, Japanese tax rates. The in-world price cards lead with the
  Japanese name and show the English name below it. The slip, cart and checkout are in English.
- **No persistence.** Reloading the page empties the bowl and the cart.
- **Needs WebGL2 and a reasonably modern GPU.** It runs on recent phones, but older devices may drop frames. There is
  no 2D fallback.
- **Network at runtime.** Three.js and the font load from CDNs unless you self-host them.
- **Accessibility is partial.** The slip, cart and checkout are keyboard- and screen-reader-friendly, with live
  announcements of every change. The 3D warmer itself is mouse- and touch-first. Keyboard users add items with the menu
  buttons or the `1`–`6` keys.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). In short: keep `src/station/` free of
shop code, run `npm test` (and the optional browser check for UI changes), and keep the experience fast on phones.

## License and acknowledgments

The code is released under the [MIT License](LICENSE).

The project bundles no third-party assets. Every model, texture and icon is generated in code. At runtime it loads
[three.js](https://threejs.org) (MIT) and the [Zen Maru Gothic](https://fonts.google.com/specimen/Zen+Maru+Gothic)
typeface by Yoshimichi Ohira (SIL Open Font License 1.1). Details and notices are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Inspired by the oden warmers by the register in Japanese convenience stores.

Made by [Iris](https://iris-li-homepage.vercel.app/). The rest of Iris's work is shelved in
[RIRRI'S](https://rirris-world.vercel.app/), a 3D convenience store portfolio.

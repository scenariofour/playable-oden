# Contributing to Playable Oden

Thanks for your interest. Bug reports, small fixes, performance work and documentation are all welcome. For bigger
changes (a new ingredient, a new checkout step, an integration), please open an issue first so we can agree on the
approach.

## Setup

```bash
npm run dev     # http://127.0.0.1:8080/
npm test        # unit and structure tests, no dependencies
```

For changes to the page or the 3D interaction, also run the browser check, which plays through the whole flow with real
clicks on desktop and phone viewports:

```bash
npm i --no-save playwright-core     # uses your installed Google Chrome
npm run dev                         # in another terminal
node test/e2e/shop-flow.mjs desktop
node test/e2e/shop-flow.mjs portrait
```

## Ground rules

- **The station stays independent.** Nothing in `src/station/` may import from `src/shop/`. The build and tests
  enforce this. Other projects embed the station on its own (see `docs/EMBEDDING.md`).
- **State first, motion second.** A tap changes the order immediately, and animations only show what already
  happened. They must be skippable and must never decide the outcome.
- **No new runtime dependencies or build step** without a strong reason. The project runs as plain ES modules.
- **No bundled third-party assets** unless their license allows redistribution and they are added to
  `THIRD_PARTY_NOTICES.md`. Procedural is preferred.
- **Keep it honest.** The checkout is a demo. Don't add copy or code that suggests real orders or payments.
- **Phones matter.** Check the portrait layout and keep the frame cost low (try `?debug` for the frame rate).
- **Match the surrounding code**: small modules, plain functions, comments that explain why.

## Pull requests

Describe what changed and why, how you tested it (desktop and phone), and include a screenshot or short clip for
visual changes. By contributing you agree that your contribution is licensed under the project's MIT License.

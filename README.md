# AVPN — Webflow Animation Scripts

Custom animation code for the AVPN site, built in Webflow by Weblikha. Webflow owns
layout, content, and CMS-free structure; this repo only owns the JS that Webflow's
native Designer/Interactions can't do.

## How it fits together

- Build the page and its native Interactions/styles in Webflow as normal.
- Tag elements that need custom behavior with namespaced `data-<component>-*`
  attributes in the Designer (Element Settings → custom attributes). No classes or
  IDs required.
- The bundled script in `dist/animations.min.js` reads those attributes and drives
  DOM/scroll animation with GSAP, and canvas/WebGL components with three.js.
- Paste the built script into Webflow's site-wide **Footer Code** (or a page's before
  `</body>` custom code) via a `<script>` tag pointing at the hosted file, or paste the
  contents directly if Webflow hosting isn't set up yet.

See `skills/webflow-animation-embed/SKILL.md` for the code convention every
component follows, and `skills/threejs-canvas/SKILL.md` for canvas-specific rules.

## Structure

```
index.html     local preview page (Vite dev only) — never shipped to Webflow
src/
  lib/         shared setup (gsap registration, helpers)
  animations/  DOM/scroll components (GSAP), one file per component
  canvas/      WebGL/canvas components (three.js), one file per component
  index.js     entry point — imports and initializes every component
docs/          per-component dev notes (setup, tuning, troubleshooting)
scripts/       build/serve helpers
dist/          bundled output pasted into Webflow custom code
```

## Component docs

- [`docs/tunnel.md`](docs/tunnel.md) — the hero tunnel canvas: Webflow setup,
  image requirements, tunables, troubleshooting.
- [`docs/tunnel2.md`](docs/tunnel2.md) — the solid-image tunnel variant: image
  proportions, alignment, sharpness, Webflow setup, tunables, troubleshooting.
- [`docs/locomotive.md`](docs/locomotive.md) — page-wide smooth scroll and
  `data-scroll-speed` parallax: Webflow setup, tuning, troubleshooting.
- [`docs/horizontal-scroller.md`](docs/horizontal-scroller.md) — a horizontal
  scroll band inside a vertical page, and the rotary card wheel that pins
  inside it: architecture, Webflow setup, required CSS, tunables.
- [`docs/signature-events.md`](docs/signature-events.md) — the Signature Events
  band: element tree, measurements, the parallax wordmark
  (`horizontalParallax.js`) and the per-card brand shape (`shapeSwap.js`).
- [`docs/image-breaker.md`](docs/image-breaker.md) — the image breaker that
  closes the CEO's Foreword: how the sticky clip-path reveal works, the Webflow
  contract, measurements, and troubleshooting.
- [`docs/programmes-overview.md`](docs/programmes-overview.md) — the Programmes
  Overview section: element tree, the three placements that are load-bearing
  (path, hover bar, row reveal), measurements, and the CSS embed.
- [`docs/webflow-programmes-highlights-build.md`](docs/webflow-programmes-highlights-build.md)
  — how the Programmes Highlights section was actually built in the Webflow
  Designer: element tree, Client-First class names, variable/color mapping,
  and MCP-tool gotchas (combo-class ordering, custom properties, text
  verification).

## Draw Path on Scroll

`src/animations/drawPathScroll.js` supports any number of independent wrappers
and any number of SVG shapes per wrapper. Mark every line you want drawn with
`data-draw-scroll-path`; the script uses all marked shapes in the active desktop
or mobile SVG, not just the first one. Shapes follow DOM order. With the default
one-unit tween duration, a stagger of `1.05` makes the next stroke begin just
after the previous one finishes, leaving a small pen-lift pause.

```html
<div data-draw-scroll-wrap data-draw-scroll-stagger="0.15">
  <svg data-draw-scroll-desktop viewBox="0 0 400 200" aria-hidden="true">
    <path data-draw-scroll-path d="M10 30 ..." />
    <path data-draw-scroll-path d="M10 80 ..." />
  </svg>
  <svg data-draw-scroll-mobile viewBox="0 0 320 160" aria-hidden="true">
    <path data-draw-scroll-path d="M10 30 ..." />
  </svg>
</div>
```

Use a separate `data-draw-scroll-wrap` for a separate scroll range. Optional
per-wrapper attributes are `data-draw-scroll-start`,
`data-draw-scroll-end`, and `data-draw-scroll-stagger`; the defaults are
`clamp(top center)`, `clamp(bottom center)`, and `0` seconds. A marked shape
must be a stroke (not a fill), and should contain one SVG subpath. For filled
artwork such as the signature, put the centerline stroke in an SVG mask and
the filled artwork in the masked group.

## Local development

`index.html` stands in for a Webflow page — it carries the same `data-*`
attributes you'd add in the Designer, so components render the same way locally
as they will in production. Add a block for any new component you're building so
it's visible during `npm run dev`.

## Adding a new component

1. Create a new file in `src/animations/` (GSAP) or `src/canvas/` (three.js),
   following the convention in the matching skill doc, keyed off a new
   `data-<component>-init` attribute.
2. Import and call its init function from `src/index.js`.
3. Add a matching block to `index.html` to preview it locally.
4. Run `npm run build` and commit the updated `dist/animations.min.js`.

## Commands

```
npm install
npm run dev     # Vite dev server with HMR at index.html — fast local preview
npm run build   # production build -> dist/animations.min.js
npm run webflow # rebuild on save + serve dist/ for the live Webflow site
npm run test:e2e # run Playwright animation smoke tests headlessly
npm run test:e2e:ui # inspect and replay tests in Playwright's UI mode
npm run test:e2e:headed # run tests in a visible Chromium window
npm run test:e2e:install # install the local Chromium browser once
```

## Browser testing

Playwright Test is configured in `playwright.config.js` and starts its own Vite
dev server for each run, on a port derived from the checkout's absolute path
(41000-42999). Each worktree therefore gets its own stable port, and a server
belonging to another checkout is never reused. Override with `PW_PORT` when a
port must be pinned; the run prints the URL it serves. The tests cover component boot, SplitText
initialization, scroll state changes, WebGL canvas pixels, and a 390px mobile
viewport. It also checks missing image manifests, resize reinitialization,
decorative canvas accessibility metadata, and reduced-motion usability.
Screenshots and traces are retained only when a test fails.

Install Chromium once with `npm run test:e2e:install`, then use
`npm run test:e2e`. Use `npm run test:e2e:ui` while tuning timing or easing;
use `npx playwright codegen <the URL the run printed>` to explore selectors for a
new interaction test. Keep assertions tied to the `data-*` contract, not
Webflow-generated classes.

`npm run webflow` is the Webflow loop: the published site pulls the bundle off
this machine, so a save is live on refresh with no republish. See
`skills/webflow-animation-embed/SKILL.md` for the script tag and its caveats.

### Port 4173 has exactly one owner

The Webflow project's footer requests `http://localhost:4173/animations.min.js`.
That port is fixed — the published site names it — and only one checkout may
hold it at a time.

Whoever runs `npm run webflow` owns it: the main checkout when working in Warp,
or the active Conductor workspace when working there. Never run the Webflow dev
server from the main checkout and a workspace at the same time; the published
page has no way to tell whose bundle it got, and the wrong one looks like a bug
in the code. Check the port is free before starting, and stop the server that
holds it rather than starting a second one:

```bash
lsof -nP -iTCP:4173 -sTCP:LISTEN
```

Never copy workspace files back into the main checkout just to test them — serve
the workspace's own bundle instead.

This applies to hand-driven development only. The automated `npm run test:e2e:live`
run never touches 4173: it builds in global setup and each spec fulfils the
bundle request from `dist/`. `npm run test:e2e` binds its own derived port.

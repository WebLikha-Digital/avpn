# Hero tunnel: retirement record and rollback

On 2026-09-15 the Home hero switched from the three.js solid-image tunnel
(`src/canvas/tunnel2.js`) to a native Webflow background video, and the preloader
was disabled at the same time. Nothing was deleted. This page records exactly
what was changed on each side so the tunnel can be brought back in one pass.

How the tunnel itself works — geometry, image pools, tunables, troubleshooting —
is unchanged and documented in [`tunnel2.md`](tunnel2.md). The preloader's
contract and timing are in [`preloader.md`](preloader.md). Read those to
understand the component; read this to switch it back on.

## State before retirement (what "rolled back" means)

Repository (`main` at `55eab19`, before PR #72):

- `src/index.js` imported `initTunnel2` from `./canvas/tunnel2.js` and
  `initPreloader` from `./animations/preloader.js`, and called both from
  `init()`: `initTunnel2()` immediately after `initListPreviewFollower()`, and
  `initPreloader()` last, after `watchDocumentHeight()`.
- `tests/animations.spec.js` had eight tunnel2-specific tests, listed below, and
  a `beforeEach` that waited for `page.locator("canvas")` to exist.
- `tests/preloader.spec.js` ran unconditionally.

Webflow Home page (`6a962b148007b0241d50a84c`, site `6a962b118007b0241d50a7a2`):

- `.section_hero` children in order: `.hero_bg` (six `.hero_bg-gradient` layers),
  `.hero_tunnel`, `.padding-global.is-hero-stack` (the copy), `.hero_arc-transition`.
- `.hero_tunnel` — `div`, class `hero_tunnel` (`position:absolute; inset:0;
  z-index:0; width/height:100%`), attributes `data-tunnel2-init="true"` and
  `data-preloader-media="true"`. No tunables set, so every value in
  [`tunnel2.md` → Tunable attributes](tunnel2.md#tunable-attributes) is at its
  default.
- Inside it, a `div` with `data-tunnel2-images="true"` holding 24 `<img>`
  elements, six per surface, each with `data-tunnel2-surface="left|right|top|bottom"`
  and alt text `Hero tunnel <left wall|right wall|ceiling|floor> image <1–6>`.
  Assets are the `tunnel-<surface>-<n>.webp` files uploaded 2026-09-12 (ids
  `6aa4a199…`–`6aa4a1a6…`); the element ids are unchanged and listed by
  `data_element_tool > query_elements` with `attribute_name: data-tunnel2-surface`.
- Page head custom code ran this before first paint:

  ```html
  <script>
  (function () {
    var html = document.documentElement;
    html.classList.add('is-preloading');
    setTimeout(function () { html.classList.remove('is-preloading'); }, 12000);
  })();
  </script>
  ```

- `.page-style` embed had no `[data-tunnel2-images]` rule; the script hid the
  manifest itself.
- The hero had no background video.

## What changed

### Repository — PR #72 (`f00f4ac`), PR #73 (`1563a6c`)

- `src/index.js`: the two imports and two calls removed. Nothing else.
- `src/canvas/tunnel2.js`, `src/animations/preloader.js`: untouched, still built
  into the bundle's module graph only if imported — currently tree-shaken out.
- `index.html`: added a CSS rule hiding `[data-tunnel2-images]` (the sandbox
  manifest was otherwise exposed as full-size images); PR #73 also added a
  hero-video fixture and `#hero-video-gate-unrelated`.
- `tests/animations.spec.js`: removed
  `uploads every tunnel2 texture before its first render`,
  `keeps pooled texture versions stable while tunnel2 recycles segments`,
  `confines tunnel2 images to surfaces and cycles each pool in order`,
  `lets unassigned tunnel2 images land on every surface`,
  `leaves a surface empty when it has no eligible images`,
  `WebGL previews allocate live render surfaces`,
  `tolerates missing image manifests`,
  `keeps one canvas per instance after a resize`; removed the canvas assertions
  from `boots every preview component`, `keeps decorative rendering out of the
  accessibility tree`, `remains usable with reduced motion enabled`, and
  `preview remains usable at a mobile viewport`; `beforeEach` now waits for
  `.mask-demo__inner .line` instead of `canvas`.
- `tests/preloader.spec.js`: whole file wrapped in
  `test.describe.skip("preloader", …)`.
- PR #73 added `src/animations/heroVideoGate.js` (+ `initHeroVideoGate()` in
  `init()`) and `tests/heroVideoGate.spec.js` for the background videos.

### Webflow

- Head script above wrapped in an HTML comment with a restore note. Not removed.
- `.page-style` embed gained:

  ```css
  [data-tunnel2-images] {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; opacity: 0; pointer-events: none;
  }
  ```

- `[data-tunnel2-images]` div set to hidden in the Designer (element
  visibility off, element id `8a1c6231-1a99-de06-356e-730ab44ccd6d`). Its 24
  images are still inside it.
- `.hero_tunnel` div left in place, empty, attributes intact.
- Two Background Video elements added inside `.hero_bg` after the gradient
  layers: `hero-bg_video is-desktop` (`Slow_Landscape`, 1280×720) and
  `hero-bg_video is-mobile` (`Slow_Mobile`, 406×720). Combo classes split at
  Webflow's Mobile Landscape breakpoint (`max-width: 767px`): `is-desktop`
  `display:block`, hidden ≤767; `is-mobile` inverse.
- Site footer script unchanged: `https://avpn-beta.vercel.app/animations.min.js`.

## Rollback

Do it as one mixed task: repo half through Codex, Webflow half by Claude, then
verify on staging with the local bundle. Note the stacking: `.hero_bg` is
`z-index:1` and `.hero_tunnel` is `z-index:0`, so while both exist the video and
gradient layers paint over the tunnel. Hide or delete the videos before judging
the tunnel; ship one or the other.

### Repository

1. `src/index.js`: restore

   ```js
   import { initTunnel2 } from "./canvas/tunnel2.js";
   import { initPreloader } from "./animations/preloader.js";
   ```

   and in `init()` put `initTunnel2();` back after `initListPreviewFollower();`
   and `initPreloader();` back as the last call. Order matters: the preloader
   counts `[data-tunnel2-images] img` loads and reveals `[data-preloader-media]`
   last, so the tunnel must be mounted before it starts.
2. `tests/preloader.spec.js`: delete the `test.describe.skip("preloader", () => {`
   line and its closing `});`.
3. `tests/animations.spec.js`: `git show 55eab19:tests/animations.spec.js` has
   every removed test verbatim. Restore the eight tests and the canvas
   assertions, and put `beforeEach` back to
   `expect.poll(() => page.locator("canvas").count()).toBeGreaterThan(0)`.
4. `index.html`: remove the `[data-tunnel2-images]` rule (the script hides the
   manifest; a CSS `display:none` there breaks `currentSrc` — see `tunnel2.md`).
   Leave the hero-video fixture; `heroVideoGate` is independent.
5. `npm run build`, `npm run test:e2e`. The restored tests need WebGL in
   Playwright's Chromium; they passed in CI on `55eab19`.

Decide whether `heroVideoGate` stays. If the videos are removed from Webflow it
finds no `.hero_bg .hero-bg_video` and exits early; leaving it wired is harmless.

### Webflow

1. `[data-tunnel2-images]` div: visibility back on.
2. `.page-style` embed: delete the `[data-tunnel2-images]` rule. It must not
   stay — `opacity:0` is fine for `currentSrc`, but the 1px box changes what the
   browser picks from `srcset`, and the script sets its own hiding anyway.
3. Head custom code: uncomment the `is-preloading` script.
4. Background videos: delete both `hero-bg_video` elements, or set both combo
   classes to `display:none` if keeping them around. Either way the hero must
   not fetch ~10 MB of video it does not show.
5. Publish to `avpn-25-26.webflow.io` with the footer script pointed at the
   local bundle (`http://localhost:4173/animations.min.js`, `npm run dev`), and
   check: `[data-tunnel2-init] canvas` count 1, `tunnel2:ready` fires with
   `uploaded === textureCount === 24` (one per manifest image), preloader counter reaches 100 and the class
   `is-preloading` is removed, no console errors, then swap the footer back.

### Verification checklist

- `git diff 55eab19 -- src/index.js` shows only the `heroVideoGate` lines (if kept).
- Published page: one `<canvas aria-hidden="true">` inside `.hero_tunnel`;
  `[data-tunnel2-images][aria-hidden="true"]` present; `body.scrollWidth` ≤
  viewport at 390.
- Hero copy reveals after the counter, media last.

## Why the record exists

Retiring the tunnel touched five files, three Webflow elements, one embed rule,
and the page head, across two PRs and several Designer sessions. None of that is
recoverable from `git log` alone, and the Webflow side is not in Git at all.

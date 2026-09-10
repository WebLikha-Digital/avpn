# Locomotive Scroll — dev notes

Page-wide smooth scroll, built on Lenis, with declarative parallax via
`data-scroll-speed`. Setup lives in `src/lib/locomotive.js`; it's not a
per-instance component like the others, it's global scroll infrastructure
initialized once from `src/index.js`.

Live on the Home page: `<body>` carries `data-smooth-scroll-init`, and the
`section_sticky-picture` section (the CEO's Foreword) uses the crop-box
parallax pattern documented below.

---

## Webflow setup

Nothing to add on the code side; the bundle already includes it. Three
attributes, all added via Element Settings → custom attributes in the
Designer:

```
body
data-smooth-scroll-init = ""      ← turns Locomotive on for the whole page

any element you want to drift
data-scroll = ""                  ← required for data-scroll-speed to do anything
data-scroll-speed = "0.3"         ← v5 scale: keep it small, 0.1–0.5 typical
```

No `data-smooth-scroll-init` on `<body>` → `initLocomotiveScroll()` early-returns
and the page scrolls natively, untouched. That's the supported "not opted in"
state, not a broken one — same idea as the tunnel's bare-wireframe fallback.

### The one layout trap

**Scope: this only affects individual `[data-scroll-speed]` elements, not the
page-wide smooth scroll.** By default (no custom `wrapper`/`content` in
`lenisOptions`, which we don't set), Lenis scrolls the real document via
`requestAnimationFrame` — it does not transform `<body>`/`<html>` or wrap the
page in a translated container. v5's own release notes call this out
explicitly: it "eliminates layout shifts caused by CSS transforms," which was
a v4 problem. So enabling smooth scroll never conflicts with anything else on
the page by itself.

The actual trap is narrower: Locomotive writes each `[data-scroll-speed]`
element's parallax offset as an inline `element.style.transform`. Anything
else that also sets `transform` on **that specific element** — a `transform`
set directly in the Style panel, a CSS class from another component, a GSAP
tween animating `transform`/`x`/`y`/`scale` on it — gets silently
overwritten, not merged. Position `[data-scroll-speed]` elements with
margin/padding/flex/grid instead of transform. (Found this the hard way
building the `index.html` demo: two boxes meant to sit side-by-side via
`transform: translate(...)` collapsed onto the same spot the moment
Locomotive's own transform took over.)

**When building any new animation in this repo, check: does the element I'm
about to tween also carry `data-scroll-speed`?** If yes, don't animate
`transform`/`x`/`y`/`scale`/`rotate` on it via GSAP — animate something else
(opacity, filter, a wrapper element instead) or drop the parallax attribute
from that element.

This project doesn't use Webflow's native IX2 interactions at all (this repo's
GSAP components replace that entirely), so IX2 isn't a source of this
conflict here — the risk is specifically GSAP tweens written in this repo.

### Pinning

v4's `data-scroll-sticky` attribute is gone in v5. For a pinned/sticky
element (e.g. an image column that stays put while text scrolls past beside
it — the pattern on svinogradov.art's second section), use native CSS
`position: sticky; top: 0` in the Designer. No script involvement needed.

---

## The crop-box parallax pattern

This is the effect on svinogradov.art's second section, and what
`section_sticky-picture` on the Home page uses. Getting it right hinges on one
idea: **the image pans inside a frame that does not move.** Everything meant
to stay still — the frame, a signature overlay, a caption — must live
*outside* the element carrying `data-scroll-speed`.

```
photo-group          static
  photo-holder       static, position:relative — anchors the overlay, NOT clipped
    image-inner      static CROP BOX: fixed aspect-ratio, overflow:hidden, radius
      img            [data-scroll][data-scroll-speed] ← the ONLY moving element
                     position:absolute, height:160%, top:-30%
    signature        position:absolute → anchored to photo-holder
  name-block         static
```

Why each piece:

- **The crop box** (`overflow: hidden` + a fixed `aspect-ratio`) is what makes
  it read as a parallax rather than a floating image. Without it the image
  just slides around and collides with its neighbours.
- **The image must be taller than its box** so there is something to pan into.
  `height: 160%; top: -30%` gives 30% of slack above and below.
- **Overlays anchor to the holder, not the crop box** — an element inside an
  `overflow: hidden` box gets clipped, so a signature that deliberately
  overhangs the photo edge has to be a sibling of the crop box.

### Speed must fit the slack

v5's translate is `progress × containerSize × speed`, where `containerSize` is
the viewport height. So the travel is roughly **`viewportHeight × speed`, in
each direction**, and the image needs at least that much slack or it pans past
its own edge and exposes a gap at the extremes.

| Viewport | speed | travel | slack needed | image height for a ~500px box |
|---|---|---|---|---|
| 1267px | 0.1 | ±127px | 127px each side | 160% (≈150px each side) ✅ |
| 1267px | 0.2 | ±253px | 253px each side | 160% is not enough ❌ |

**To make the drift more pronounced, raise the image height first, not just
the speed.** The current section runs `speed: 0.1` against a 160%-tall image.

### The mistake to avoid

Putting `data-scroll-speed` on a *group* (photo + caption + overlay together)
makes the whole card drift, which then slides over whatever sits below it — in
this section it dragged the photo down over the CEO's name and hid it. The
attribute belongs on the innermost image alone.

---

## Mask reveals (`initSplitReveal`)

> **Historical for the foreword wordmark.** This section describes how that
> wordmark *used* to animate. It was rebuilt as a plain opacity animation —
> see "Revealing and fading the wordmark" below — and no element on the Home
> page carries `data-split*` any more. The component below is still shipped
> and still works; it just has no live consumer right now. Everything about
> masking, `clamp()` starts and the IntersectionObserver dead end still
> applies if you reach for it again.

The big faint "Our CEO's Foreword" wordmark slides up from behind a mask, the
same way svinogradov.art reveals its year. That site does it in pure CSS — a
clipped wrapper plus an inner line transitioning from `translateY(150%)` to `0`
when a class flips:

```css
.year-period          { overflow: hidden; opacity: 0.1; }
.year-period__section span { transform: translateY(150%);
                             transition: transform .75s cubic-bezier(.33,1,.68,1); }
```

Ours gets the same result from `src/animations/splitReveal.js`, using GSAP
SplitText (which builds the per-line masks itself) driven by ScrollTrigger.
Nothing about the reveal lives in Webflow styles.

```html
<div data-split="heading" data-split-reveal="words" data-split-start="bottom 50%">
  Our CEO's Foreword
</div>
```

| Attribute | Default | Purpose |
|---|---|---|
| `data-split="heading"` | — | Marks the element (required) |
| `data-split-reveal` | `lines` | `lines` \| `words` \| `chars` |
| `data-split-start` | `clamp(top 80%)` | ScrollTrigger start, `"<triggerPoint> <viewportPoint>"` |
| `data-split-trigger` | the element | CSS selector to measure against instead |
| `data-split-opacity` | disabled | `"true"` scrubs split targets to opacity 0 before the section ends |
| `data-split-once` | `true` | `"false"` replays on re-entry |

`clamp()` on the default start stops it resolving above the top of the page,
which would otherwise let the tween render part-finished on load. A bare value
like `bottom 50%` opts out — fine below the fold, keep the clamp near the hero.

`data-split-trigger` exists for this section specifically: the wordmark sits in
a `position: sticky` wrapper, and a sticky element stops moving once pinned, so
its own position is a poor scroll reference. Point the trigger at a stable
ancestor (`.section_sticky-picture`) if a custom start behaves oddly.

### Revealing and fading the wordmark (`initForewordFade`)

**The wordmark no longer uses `initSplitReveal`.** It carries no `data-split*`
attributes — nothing on the Home page does as of this writing, so
`initSplitReveal` currently ships in the bundle without a live consumer. The
wordmark is now driven entirely by a plain opacity animation on the wrap
itself, in `src/animations/forewordAnim.js`. No SplitText, no masked lines.

```html
<div class="sticky-picture_bgtext-wrap"
     data-foreword-fade-init
     data-foreword-fade-cover=".sticky-picture_arc"
     data-foreword-fade-trigger=".sticky-picture_content">
  Our CEO's Foreword
</div>
```

| Attribute | Default | Purpose |
|---|---|---|
| `data-foreword-fade-init` | — | Marks the element (required) |
| `data-foreword-fade-cover` | none | CSS selector for the element painted **over** the wordmark. Held at opacity 0 until this element's bottom edge sweeps past it, then fades in over exactly that sweep. Omit to skip the reveal and start visible. |
| `data-foreword-fade-trigger` | the element | CSS selector the fade-out is measured against |
| `data-foreword-fade-end` | `bottom 80%` | ScrollTrigger end for the fade-out, `"<triggerPoint> <viewportPoint>"` |

Resolution for both selectors is nearest matching ancestor, else first match on
the page, else the fallback — so a typo degrades to default behaviour instead
of breaking. Note both current targets are *siblings*, not ancestors, so they
resolve via the page-wide lookup.

#### Why there are two stages

This is the important part, and it is not a matter of taste — it's a stacking
conflict. Inside `section_sticky-picture`:

| element | position | z-index |
|---|---|---|
| `.sticky-picture_arc` | `absolute; top:0; height:622px` | **1** |
| `.sticky-picture_bgtext-wrap` | `sticky; top:419px` | **0** |
| `.padding-global.z-index-2` (heading/photo) | — | 2 |

The arc's background is
`radial-gradient(92% 88% at 50% 100%, transparent 80%, #fff 100%)` — transparent
at its bottom-centre, **fully opaque white toward its outer edge** — and it
outranks the wordmark. The wordmark's natural slot is section-y 112→256 and it
pins at 419px from the viewport top; both sit inside the arc's 0→622px band.

So wherever the two overlap the arc wins and the wordmark renders as
washed-out ghost text. **There is no opacity value that looks right there.** It
has to stay hidden until it physically clears the arc, which is why timing
tweaks alone could never fix it.

#### How the two stages fit together

1. **Reveal** — triggered off the *cover*, from `bottom top+={pinnedTop +
   height}` to `bottom top+={pinnedTop}`. That's the exact stretch where the
   arc's bottom edge sweeps across the wordmark, from touching its bottom to
   clearing its top, so the reveal tracks the real occlusion instead of a
   guessed offset.
2. **Fade-out** — starts where the reveal finishes (same `bottom top+={pinnedTop}`
   point) and runs via `endTrigger` to the text column's `data-foreword-fade-end`.

Opacity is the **product** of the two (`reveal × (1 − fade)`), so the stages
can never fight over the same property, and scrolling back up retraces the
curve exactly — including re-hiding the wordmark as it slides back under the
arc, which is the whole point.

Both boundaries are **function-based** (`start: () => ...`), so every
ScrollTrigger refresh re-measures the sticky offset and height rather than
baking in whatever the layout happened to be at init.

Measured on the published page at a 997px viewport, for orientation:

| scroll | arc bottom | wordmark top | opacity |
|---|---|---|---|
| 1000 | 619 | 419 | `0` — still covered |
| 1056 | 563 | 419 | reveal starts |
| 1200 | 419 | 419 | `1` — exact handoff, fade begins |
| 2474 | — | — | `0` — column's bottom 20% up from viewport bottom |

#### A one-way fade was tried and removed

An earlier version clamped progress so opacity could only ever decrease,
to stop the text reappearing on the way back up. That was a workaround for the
arc overlap. Once the reveal is gated on the arc itself the clamp is
unnecessary *and* wrong: the correct behaviour on scroll-up is for the wordmark
to fade back out as it re-enters the arc band, which the plain bidirectional
product already does.

### Why ScrollTrigger and not an IntersectionObserver

This was built with a hand-rolled IntersectionObserver first, and it could not
work. **A masked element cannot observe itself.** IntersectionObserver clips the
intersection rect against ancestors' `overflow` *and* `clip-path`, so a line
parked outside its own mask reports `intersectionRatio: 0` despite having a
perfectly real on-screen rect. It never "enters view", the class never lands,
and it never reveals — a permanent deadlock that looks exactly like "the script
didn't run". Swapping `overflow: hidden` for `clip-path` does not dodge it;
Chrome's observer honours `clip-path` too.

ScrollTrigger works off scroll offsets and measured bounds, so clipping is
irrelevant to it. It is also already synced to Lenis in `lib/locomotive.js`,
which a separate observer would not have been.

### Why `gsap.from()` and no hidden CSS state

The resting CSS state is plain visible text; GSAP moves it to the hidden state
at init. If the bundle fails to load, the text sits there unanimated instead of
being stranded invisible behind its mask. That matters here — see the hosting
note in "Local development": the published site currently loads the bundle from
`localhost`, so a failed load is the normal case for anyone but the developer.

Never reintroduce a CSS-hidden start state for a reveal. It converts a missing
bundle from a cosmetic problem into missing content.

### Why not Locomotive's own `is-inview`

Locomotive v5 does add `is-inview`, but only to elements it tracks for an
effect — i.e. ones carrying `data-scroll-speed`. A plain `data-scroll` element
never got the class in testing. And giving a masked line a speed is not a way
out: Locomotive would write an inline `transform` that overwrites the very
transform the reveal depends on.

### Sizing the wordmark to the viewport

The wrapper sets `font-size` in `cqw` against a `container-type: inline-size`
section, so the line scales with the viewport instead of a breakpoint ladder.
`8.4cqw` fills ~96% of the width for this particular string. **That number is
string- and font-specific** — re-measure if the copy changes:

```js
const r = document.createRange();
r.selectNodeContents(document.querySelector('.sticky-picture_bgtext-inner'));
r.getBoundingClientRect().width / window.innerWidth;   // aim for ~0.96
```

---

## Init order and refresh (`src/index.js`)

Two constraints live in `index.js` that aren't obvious from reading it.

### `initDrawPathScroll()` must run before `initSplitReveal()`

`initDrawPathScroll()` calls `ScrollTrigger.refresh()` as part of the upstream
Osmo resource. A refresh *after* SplitText has initialized makes its `autoSplit`
re-split the heading, which drops the `gsap.from()` start state and leaves the
reveal sitting visible instead of hidden. Ordering the draw-path init first
keeps that refresh ahead of SplitText's setup.

Covered by the "initializes the scroll-linked reveal state" check in
`tests/animations.spec.js`.

### ScrollTrigger has to be refreshed as images load

Percentage-based ScrollTrigger start/end values (`"bottom 80%"`, `"80% top"`,
and the function-based bounds in `forewordAnim.js`) are measured against
element heights **at init time**, which is `DOMContentLoaded` — before images
below the fold have loaded. Webflow's images carry native lazy-loading, so they
don't finish loading, and their section stops growing, only once the user
scrolls near them: well after `window.load`.

A trigger measured against a too-short stub bakes in a wrong scroll distance
and never re-measures itself. This is not hypothetical — it's what made the
foreword fade finish at roughly half its intended distance:

| | at init | after images loaded |
|---|---|---|
| `[data-ceo-foreword-section]` height | 1465px | 2387px |
| computed `80% top` end | 2169 | 2906 (correct) |

The wordmark was therefore almost entirely faded by the time it should still
have been near full opacity. So `index.js` does two things:

- `ScrollTrigger.refresh()` once on `window.load`, for anything resolved by then.
- A debounced `refresh()` on each already-in-DOM `<img>`'s own `load` event
  (`watchImagesForRefresh()`), which is what actually catches the lazy ones.

**Any new percentage- or size-derived ScrollTrigger in this repo depends on
this.** If you see a scroll animation that finishes too early on a page with
lazy images, suspect a stale measurement before you suspect the timing values.

---

## Testing against the live Webflow site

There are two suites, and they answer different questions.

| | `npm run test:e2e` | `npm run test:e2e:live` |
|---|---|---|
| Config | `playwright.config.js` | `playwright.live.config.js` |
| Page under test | `index.html` (local preview) | `https://avpn-25-26.webflow.io` |
| Answers | "does our code initialize?" | "does it behave correctly against real Webflow DOM and CSS?" |
| Scrolls | never | yes |
| Speed | ~7s | ~40s |
| When | every commit | manually, when touching scroll behaviour |

The demo suite has no visibility into Webflow's markup, styles, or lazy images —
so none of the arc/stacking or stale-measurement bugs were catchable there. The
live suite exists for exactly that class of bug.

`testIgnore: "live/**"` keeps the live specs out of the default run.

### The bundle is injected, not fetched

The published page's footer requests `http://localhost:4173/animations.min.js`,
but **Playwright's Chromium refuses to load it**:

```
Access to script at 'http://localhost:4173/animations.min.js' from origin
'https://avpn-25-26.webflow.io' has been blocked by CORS policy:
Permission was denied for this request to access the `loopback` address space.
```

That's Chrome's Private Network Access enforcement. Your everyday Chrome allows
it; Playwright's does not, and
`--disable-features=BlockInsecurePrivateNetworkRequests` no longer switches it
off (the feature has been renamed upstream).

So the suite doesn't rely on the dev server being reachable *from the browser*
at all. It intercepts the request and serves `dist/animations.min.js` straight
off disk:

```js
await page.route("**/animations.min.js", (route) =>
  route.fulfill({ path: BUNDLE_PATH, contentType: "application/javascript" }));
```

This is more robust than fighting browser flags, and it pins each run to your
exact local build. The live config's `globalSetup` calls Vite's `build()` API
once before Playwright starts, so `dist/` is current without launching a server
or binding port 4173. Every live spec must keep its route fulfilment; nothing in
the automated live run fetches the bundle from localhost.

### Why image requests are deliberately delayed

`LAZY_IMAGE_DELAY` holds every image response for 1.2s. This is not padding —
**without it the suite cannot catch the stale-measurement bug.** Verified by
mutation: with the `ScrollTrigger.refresh()` wiring removed from `index.js`,

- undelayed, all four tests still **passed** — headless loads images fast enough
  that the section reaches full height before the measurement matters;
- delayed, the fade-bounds test **failed** with `expected 1403 to be within 2px
  of 2325`, a 922px error.

The delay reproduces the real-world timing of a lazy image resolving after
`load`. Don't remove it thinking it's a speed tax.

### Driving scroll under Lenis

`window.scrollBy()` does nothing — Lenis owns the wheel. Tests drive with
`page.mouse.wheel()` toward a target and poll `window.scrollY` until it stops
changing (`settledScrollY`), because smooth scroll is lerped and a value read
immediately after a scroll is a mid-animation frame. Assert on numbers
(`ScrollTrigger.progress`, computed `opacity`, `getBoundingClientRect()`), never
screenshots.

### What it costs you

Chromium only, not CI-able, and the DOM side isn't version-pinned — your JS is
whatever you just built, the markup is whatever is currently published. A
Designer edit can turn the suite red without any code change. That is an
acceptable trade *because the run is manual*; don't wire it into CI expecting
stability.

---

## Tuning

Only one option is currently passed at init, in `src/lib/locomotive.js`:

```js
new LocomotiveScroll({
  initCustomTicker: (render) => gsap.ticker.add(render),
  destroyCustomTicker: (render) => gsap.ticker.remove(render),
});
```

Locomotive forwards most config through `lenisOptions` (`lerp`, `duration`,
`easing`, `orientation`, a custom `wrapper`/`content` pair, etc. — see the
[v5 docs](https://scroll.locomotive.ca/docs/)). None of that is wired up yet;
add it inside that same `new LocomotiveScroll({...})` call if a page needs it.

Per-element parallax is entirely attribute-driven, no JS changes needed to
tune it:

| Attribute | Example | What it does |
|---|---|---|
| `data-scroll` | (empty) | Required — enables viewport detection/parallax on the element. |
| `data-scroll-speed` | `0.3` / `-0.3` | Parallax intensity. Positive lags behind scroll, negative leads it. v5 formula: `translateValue = progress × containerSize × speed × -1` — small numbers go a long way. |
| `data-scroll-enable-touch-speed` | (empty) | Parallax is off on touch devices by default in v5; add this to opt an element back in. |

---

## Local development

```
npm run dev
```

Serves `index.html`, which has `data-smooth-scroll-init` on `<body>` and a
`.parallax-demo` section with two boxes at `data-scroll-speed="0.3"` and
`"-0.3"` — scroll to see them drift apart. Same idea as the tunnel's preview
block: it carries the same `data-*` attributes a real Webflow page would.

```
npm run webflow
```

Same loop as every other component here: rebuilds `dist/` on save, serves it
at `http://localhost:4173/animations.min.js`, and the site's footer script
tag points there once it's added. Save → refresh the published page.

### Three traps

- **Safari won't load the dev bundle** — `https://` page, `http://localhost`
  script, blocked. Develop in Chrome.
- **Custom code doesn't run in the Designer canvas.** Test against
  `avpn-25-26.webflow.io`, not Designer preview.
- **Don't screenshot immediately after scrolling.** Smooth scroll is lerped,
  so a capture taken right after a scroll shows a mid-animation frame — the
  pinned element looks misplaced and overlays look detached, neither of which
  is real. Wait ~2s for it to settle, and prefer measuring
  `getBoundingClientRect()` offsets over eyeballing a screenshot.

---

## How it works

- **GSAP owns the render loop.** `initCustomTicker`/`destroyCustomTicker` hand
  Locomotive's per-frame render to `gsap.ticker` instead of its own
  `requestAnimationFrame`, and `gsap.ticker.lagSmoothing(0)` is set so GSAP
  never skips frames to "catch up" — that would desync the smoothed scroll
  position from ScrollTrigger-driven animations.
- **ScrollTrigger sync.** `locomotiveScroll.lenisInstance.on("scroll",
  ScrollTrigger.update)` — Locomotive v5 exposes the underlying Lenis
  instance as `.lenisInstance`; every Lenis scroll tick forces ScrollTrigger
  to recompute, so `reveal.js`'s scroll-triggered fades stay correctly
  positioned against the lerped (not raw) scroll value.
- **Singleton.** `initLocomotiveScroll()` returns the existing instance on a
  second call rather than creating another one — there's only ever one smooth
  scroll per page.
- **CSS is inlined, not imported as an asset.** Locomotive/Lenis ships one
  line of base CSS (`html.lenis` height/overflow rules). Rather than adding a
  second build output nobody wires into the Webflow embed, it's a string
  constant in `locomotive.js`, injected via a `<style>` tag at init.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Page scrolls natively, no smoothing | `data-smooth-scroll-init` missing from `<body>`. Supported default state, not a bug. |
| `data-scroll-speed` element doesn't move | Missing the sibling `data-scroll` attribute — speed alone does nothing without it. |
| Parallax element snapped into the wrong position, or another animation on it stopped working | Something else is also setting `transform` on that element — Locomotive's inline transform is winning. Reposition without `transform`. |
| Gap / empty edge appears at the extremes of the parallax | The image panned past its own edge: `viewportHeight × speed` exceeds the slack. Increase the image height (more slack) or lower the speed — see "Speed must fit the slack". |
| An overlay (signature, badge, caption) drifts away from the image | It's outside the moving element while the image moves, or vice versa. Only the innermost image should carry `data-scroll-speed`; overlays anchor to the static holder. |
| A caption below the image gets covered by it | `data-scroll-speed` is on a group rather than the image alone, so the whole card drifts downward over its neighbours. |
| Nothing loads on the live site | Dev server isn't running, you're in Safari, or the site was never published after the footer tag was added. |
| Scroll-triggered reveals fire at the wrong scroll position once Locomotive is on | Check the `ScrollTrigger.update` wiring in `locomotive.js` hasn't been removed or reordered relative to `initSplitReveal()` in `index.js`. |
| A scroll animation finishes far too early on a page with lazy images | Stale measurement: the trigger was sized before its images loaded. See "ScrollTrigger has to be refreshed as images load" — check `watchImagesForRefresh()` is still wired up in `index.js`. |
| The foreword wordmark shows as washed-out ghost text at the top of the section | It's rendering underneath `.sticky-picture_arc` (z-index 1 vs 0, opaque white outer edge). Check `data-foreword-fade-cover` is still set to `.sticky-picture_arc` on the wrap — without it the reveal is skipped and the wordmark starts visible while covered. |

---

## Cost

Measured by building with and without `locomotive-scroll` imported:

| | Minified | Gzipped |
|---|---|---|
| Without | 639.05 kB | 176.50 kB |
| With | 673.76 kB | 185.53 kB |
| **Delta** | **~34.7 kB** | **~9.0 kB** |

Consistent with Locomotive's own v5 release notes ("reduced to 9.4kB
gzipped" on top of Lenis) — v5 is a thin attribute/effects layer over Lenis,
not a reimplementation of smooth scroll, which is why the addition is small
even though three.js (from the tunnel) dominates the bundle either way.

# Signature Events — Webflow build guide

How the "Signature Events" section (a horizontal band of three event cards
behind a parallaxing wordmark, reverse-engineered from Figma node
`4067:19901`) is built in the Webflow Designer, and what the two new JS
components do.

Read `docs/horizontal-scroller.md` first — the band itself is
`horizontalScroller.js`, unchanged. This section adds two components on top of
it: `horizontalParallax.js` (the drifting wordmark) and `shapeSwap.js` (the
brand shape that changes per card).

Content is static — three hand-built cards, no Collection List.

---

## What the reference does, and what we do instead

The motion is modelled on the "Our Services" section of unitedcarriers.com,
which pins a stage, translates a wide flex row across it, and moves a giant
word behind it at a different rate. Their implementation translates the row
with `gsap.to(track, { x: -width })` and hangs every nested reveal off it with
`containerAnimation`.

We do not, because `containerAnimation` cannot pin, and its triggers cannot be
built until the container timeline has measured — their code works around that
with a `requestAnimationFrame` retry loop that gives up after two attempts.
`horizontalScroller.js` makes the band a real scroll container instead, so
nested components are ordinary ScrollTriggers with `scroller` + `horizontal`,
and `bandContext()` hands them the pair. Both components here use it.

The truck, crane, container-crane canvas and km/h readout in the reference are
theirs; nothing here reproduces them.

---

## Element tree

Client-First naming: one block prefix (`sig-events`) shared by every class,
state as a combo (`is-*`).

```
section.section_signature-events.sig-events_scroller       [data-hscroll-init]
└ div.sig-events_stage                                     sticky, 100vh, clipped
  ├ div.sig-events_bg.is-top                               cream band
  ├ div.sig-events_bg.is-bottom                            blue gradient
  ├ div.sig-events_word                                    [data-hparallax]
  │ │                                                      [data-hparallax-speed="0.35"]
  │ ├ div.sig-events_shape-stack                           [data-shape-swap]
  │ │ │                                        [data-shape-swap-panels=".sig-events_card"]
  │ │ ├ div.sig-events_shape.is-circle
  │ │ ├ div.sig-events_shape.is-half
  │ │ └ div.sig-events_shape.is-quarter
  │ └ div.sig-events_word-text                             "SIGNATURE EVENTS"
  └ div.sig-events_viewport                                [data-hscroll-viewport]
    └ div.sig-events_track                                 [data-hscroll-track]
    ├ div.sig-events_spacer.is-lead
    ├ div.sig-events_card                                  ×3
    │ └ div.sig-events_card-inner
    │   ├ div.sig-events_card-media
    │   ├ div.sig-events_card-title-col
    │   │ ├ div.sig-events_card-pill
    │   │ │ ├ div.sig-events_card-pill-icon
    │   │ │ └ div.sig-events_card-pill-label.text-size-small     "Hongkong"
    │   │ ├ h3.sig-events_card-heading.heading-style-h3   [data-split="heading"]
    │   │ └ div.sig-events_card-date                     [data-split="heading"]
    │   └ div.sig-events_card-body-col
    │     ├ p.sig-events_card-desc.text-size-regular     [data-split="heading"]
    │     └ a.sig-events_card-link
    │       ├ div.sig-events_card-link-icon
    │       └ div.sig-events_card-link-label.text-size-small     "Learn more"
    └ div.sig-events_spacer.is-tail
```

The stage is what stays on screen; the viewport inside it is only the scroll
container. Backgrounds and wordmark are children of the **stage**, beside the
viewport rather than inside it. That is load-bearing — see "Why the word sits
outside the scroller" below.

The reveals are the existing `splitReveal.js`; it is already band-aware and
swaps its own default start to `clamp(left 80%)` inside a band, so the cards
need no start authored.

---

## Measurements

From the Figma frame, which is 1440 wide. Widths are given as `vw` so the band
scales; the design pixels are kept alongside for reference.

| Element | Design px | vw |
| --- | --- | --- |
| `.sig-events_spacer` (each) | ~72 | 5 (matches `.padding-global`) |
| `.sig-events_card` | 1531 | 106.3 |
| track column gap | 150 | 10.4 |
| `.sig-events_card-media` | 385 | — (square) |
| `.sig-events_card-title-col` | 487 | 33.8 |
| `.sig-events_card-body-col` | 520 | 36.1 |
| `.sig-events_shape` | 100 | 5 |

Track width is measured live by `horizontalScroller.js` (it re-reads on
`invalidateOnRefresh`), so this is not baked into a hardcoded scroll distance.

Edge alignment (first/last card lining up with `.padding-global`'s 5%, the
alignment every other section on the page uses) is **not** just the spacer
width — the track's `column-gap: 10.4vw` inserts itself between every pair of
children, spacer-to-card included, and a flex item's own `margin` doesn't
remove that. The lead/tail spacers are zeroed out (`width: 0`, via a
`first-child`/`last-child` pseudo override — the docs' own `.is-lead`/
`.is-tail` combo classes are never actually applied to the elements, so a
pseudo override was used instead of relying on those) and the alignment now
comes from `.sig-events_track`'s own `padding-left`/`padding-right: 5vw`. The
`10.4vw` gap that would still land between that padding and the first/last
card is cancelled with a negative margin on the spacer itself
(`margin-right: -10.4vw` on the first spacer, `margin-left: -10.4vw` on the
last) — negative margin on a flex item does pull it across the gap, even
though zero/positive margin cannot remove the gap.

### The cream band is sized by the wordmark

`.sig-events_bg.is-top` is `25vh` and `.is-bottom` starts at the same `25vh`,
so the two are edited as one number. That number is not free: the wordmark has
to finish inside the cream, and its box runs from `.sig-events_word`'s `top`
(6vh) for the height of one `9.5vw` line at `line-height: 1`. Roughly

```
cream height ≥ word top + word font-size + a little clearance
25vh (235px) ≥ 6vh (56px) + 9.5vw (165px) + 14px      @ 1728×941
```

Shrink the band without shrinking the word and the last third of "SIGNATURE
EVENTS" spills onto the blue. The original `34vh` / `8vh` / `13vw` trio
satisfied the same inequality; these three values move together.

The card is deliberately **wider than the viewport** (106.3vw). Its inner
content is 1452 design px against a 1440 frame, so the body column's right edge
is clipped when a card first arrives and completes as the band scrolls. That
matches the Figma frame and is not a bug to correct.

In Figma each card's title column sits at a different `y` (90 / 64 / 38) purely
because the heading runs one, two or three lines. That is `align-items: center`
on `.sig-events_card-inner`, not three variants.

---

## The structural CSS

These are set as literal properties on the Webflow classes themselves, via the
style tool — not written into a `.page-style` embed. `sticky` and `max-content`
are beyond the Designer's *visual* style panel but are ordinary CSS underneath,
so they live on the class where the next person will find them. Same call as
`docs/webflow-programmes-highlights-build.md` made for the first band.

```css
/* The sticky box. Everything that must hold still while the band scrolls lives
   here, beside the viewport. */
.sig-events_stage { position: sticky; top: 0; width: 100%; height: 100vh;
                    overflow: hidden; }

/* The scroll container, filling the stage. */
.sig-events_viewport { position: relative; width: 100%; height: 100%;
                       overflow: hidden; }

.sig-events_track {
  display: flex;
  flex-wrap: nowrap;
  width: max-content;
  height: 100%;
  align-items: flex-end;
  column-gap: 10.4vw;
  padding-left: 5vw;
  padding-right: 5vw;
}

.sig-events_card   { flex-shrink: 0; width: 106.3vw; }
.sig-events_spacer { flex-shrink: 0; width: 5vw; }
.sig-events_spacer:first-child { width: 0vw; margin-right: -10.4vw; }
.sig-events_spacer:last-child  { width: 0vw; margin-left: -10.4vw; }

/* Drifts on its own; must not take part in the track's layout. */
.sig-events_word { position: absolute; top: 6vh; left: 5vw;
                   white-space: nowrap; will-change: transform; }
.sig-events_word-text { font-size: 9.5vw; line-height: 1; }

/* Every shape occupies the same box; only opacity separates them.
   In Webflow this is width + height, not aspect-ratio — change both together
   or the shapes go oval. */
.sig-events_shape-stack   { position: relative; width: 5vw; height: 5vw; }
.sig-events_shape-stack > * { position: absolute; inset: 0; }
```

`overflow: hidden` on the viewport rather than `auto` is the band's own rule
and is explained in `horizontal-scroller.md`: the element stays scrollable
programmatically, but a trackpad swipe can no longer desync it from the page
position that is supposed to be its only input.

---

## The brand shapes

The six AVPN marks are one `div` each, no SVG and no image — a square plus a
`border-radius` per corner. Only the first three are used by this section; the
rest are here so a fourth card can be added without inventing a new shape.

```css
.sig-events_shape             { width: 100%; height: 100%; }
.sig-events_shape.is-circle   { border-radius: 50%; }
.sig-events_shape.is-half     { border-radius: 0 50% 50% 0; }   /* flat left edge */
.sig-events_shape.is-quarter  { border-radius: 0 100% 0 0; }    /* arc top-right  */
.sig-events_shape.is-soft     { border-radius: 28%; }           /* all four       */
.sig-events_shape.is-leaf     { border-radius: 0 40% 0 0; }     /* one corner     */
.sig-events_shape.is-lens     { border-radius: 0 40% 0 40%; }   /* opposite pair  */
```

Colour is a separate combo per shape, bound to the site's Webflow colour
variables rather than hard-coded: `is-circle` is `Brand/Primary/aqua-main`,
`is-half` is `Brand/Primary/navy-main`, `is-quarter` is
`Brand/Primary/red-main`. The shapes are brand marks and share their palette
with the rest of the site.

---

## `horizontalParallax.js`

```
[data-hparallax]        the drifting element, a child of the band viewport
[data-hparallax-speed]  0–0.95, default 0.35. Lower drifts less.
```

The element is translated by `distance × speed` across the band's travel, where
`distance` is the track's own overflow. Speed 1 would move it exactly as far as
the track, which is what living inside the track already does, so values at or
above 1 are clamped to 0.95.

### Why the word sits outside the scroller

`scrollLeft` moves everything the scroll container holds — not just the track.
An element placed *beside* the track but still inside the viewport therefore
travels the full distance anyway, and this tween stacks on top of it: a
`speed` of 0.35 renders as 1.35× the track, the opposite of what it reads as.
`position: absolute` does not exempt it, because an absolutely positioned child
of a scroll container is positioned against the scrolled content.

This is exactly how the section was built first, and the bug is quiet: the
element's transform is correct, so a test that reads the transform passes while
the word visibly races the cards. The check that catches it measures
`getBoundingClientRect().left` instead, and `horizontalParallax.js` now refuses
to animate an element inside the viewport, warning to the console rather than
animating the wrong thing.

Put it in the stage instead. There it is stationary by default, so the
translation is measured against a still frame and the shortfall against the
track's full distance reads as parallax.

Both widths are read as functions with `invalidateOnRefresh`, so a webfont
landing late or an image settling re-measures the drift instead of baking in a
first-paint width.

Outside an active band the element is left alone. Below
`[data-hscroll-min-width]` there is no scroller to read, and drifting against
nothing would just push the wordmark off screen.

---

## `shapeSwap.js`

```
[data-shape-swap]         the stack; its children are the shapes, in panel order
[data-shape-swap-panels]  CSS selector for the panels that drive it, scoped to
                          the band. Defaults to the track's direct children.
```

**Set `[data-shape-swap-panels=".sig-events_card"]` on this section.** The
default — every direct child of the track — would count the two spacers as
panels and put the shape index one step out.

The active panel is whichever one's centre is nearest the middle of the band's
window, recomputed from `scrollLeft`. The first version gave each panel a
trigger spanning `left center` → `right center`, which leaves the run-up before
the first panel and the run-out after the last uncovered: scrolling back to the
top of the band left whichever shape was showing when you got there, rather
than resetting to the circle. Nearest-centre has no gaps and clamps at both
ends without special cases.

Three decisions worth keeping:

- **All shapes exist at once, stacked.** Rewriting a class on a single `div`
  means the outgoing and incoming shapes can never overlap, and the change
  lands as a hard cut mid-scroll.
- **An index, not a scrubbed value.** A fast flick past two cards lands on the
  correct shape rather than halfway between two, and scrolling back reverses
  for free.
- **Shape index is modulo shape count.** Three shapes across six panels cycle,
  so adding a card in the Designer needs no code change.

Below the band's min width the panels are stacked vertically and the swap would
fire on scroll position alone, which reads as noise — so the first shape is
shown and left alone.

---

## The "Learn more" button

A Webflow **component**, `Button Primary` (group `Buttons`), used by all three
cards. One exposed prop: **URL**, bound to the root link's `link` setting, so an
instance only needs its destination set. The design is button #15 of Pixeto's
CSS Hover Animation Library (`hover-animation-library.webflow.io`) in AVPN
brand colours; it replaced the Figma `Primary` component (node
`I1852:8549;1711:2322`) on 2026-09-16.

```
a.sig-events_card-link                          [data-button]  pill, 80px tall
├ div.sig-events_card-link-bg                   circle, absolute, z 0
├ div.sig-events_card-link-icon                 arrow slot, 46px, z 1
│ └ div.sig-events_card-link-icon-wrapper > svg 18px arrow
└ div.sig-events_card-link-label                z 1
```

At rest: pill with a 1px `red-main` border and `100px` radius, `padding: 1rem
2rem 1rem 1rem`, `gap: 2rem`. The circle (`.sig-events_card-link-bg`) is an
outlined `red-main` ring, `4.875rem` square at `top/left: 0` so it hugs the
pill's inner edge and spans its full height. The arrow slot sits inside the
pill's padding, which centres it in the circle (both are centred `2.4375rem`
from the left). Arrow and label are `navy-main`; the arrow's path uses
`stroke="currentColor"` so it follows the slot's colour.

On hover: the circle grows to `width: 100%` and fills `red-main`; arrow and
label turn `neutral-white`. Hover-out reverses it.

### Where the CSS lives, and why it is split

Geometry and colour are literal properties on the Webflow classes, as with the
rest of this section. The **hover** lives in its own `.button-style` embed on
the Home page, keyed on `[data-button]` — the transitions, the stacking order,
and the hover media query are all things the Designer cannot express.

The source drives its hover with Webflow IX2; here it is CSS only, no JS, with
two deliberate departures:

- **It grows to the border, not to a fixed width.** The source animates
  `width: 5.4rem → 21rem`. Here the circle goes `4.875rem → 100%`, so it fills
  the pill at whatever width the label makes it. Ease is
  `cubic-bezier(0.16, 1, 0.3, 1)` — the CSS equivalent of the source's
  `outExpo` — 1s in and 0.8s out, with the fill tinting in over 0.5s, matching
  the source's timings. Because the circle is absolutely positioned, the pill's
  own width never changes.
- **Confined.** The pill carries `overflow: hidden` so the circle's corners
  never escape the border. That is also why the focus ring is a `box-shadow` on
  the button rather than a `::after` — a pseudo-element child would be clipped
  away by that same `overflow`. An element's own box-shadow is not.

The arrow slot and the label carry `position: relative; z-index: 1` in the
embed so they stay above the circle; the circle is `z-index: 0` and
`pointer-events: none`.

Reduced motion is handled by the source's own gate: the entire hover block sits
inside `@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion:
no-preference)`, so on touch or with reduced motion the button simply rests
with the outlined circle on the left. `:focus-visible` triggers the same fill
as hover so keyboard users get the state too.

Before 2026-09-16 this button used the Figma design and a different hover —
Osmo Supply's Button 040, where a filled arrow circle scaled out on the left, a
duplicate scaled in on the right, and the label slid `-62px` into the gap. The
duplicate circle (`.sig-events_card-link-icon.is-duplicate`) was removed from
the component with that change; the `is-duplicate` combo class is unused and
can be deleted from the Style Manager.

---

## Webflow build notes

Built on the Home page, immediately after `section_stories-community`. That
position comes from the Figma page: `Block - Signature Events` sits at y 5134,
directly below `Block - Stories` (3781–5125).

Colours are the site's brand variables, not hexes: `aqua-main` (circle),
`navy-main` (half, and all card copy), `red-main` (quarter, link border and
icon), `emerald-main` (location pill), `navy-light` (media placeholder). The two
literals are the cream `#f7f1ea`, copied from `.section_stories-community` so the
two sections share a ground, and the wordmark's `#e8ded5` — a warm tint of that
cream, which the palette has no token for.

Mobile (`small`, ≤767px) is where the band switches itself off, so that
breakpoint carries the stacked layout: the viewport goes `static`, the track
becomes a column, cards go full width, the card's three columns stack, and the
spacers are hidden. Without those the track would keep its `max-content` width
and push the page into a horizontal scroll.

### Three MCP gotchas, if this is rebuilt through the tools

- **A combo class has to exist before it can be applied.** `set_style` with
  `["sig-events_card-heading", "heading-style-h3"]` fails with "styles not
  found" until `create_style` has made that exact pairing
  (`name: "heading-style-h3", parent_style_names: ["sig-events_card-heading"]`).
  The error names both classes even though both exist on their own.
- **A combo cannot be created against a name that exists only as a global.**
  `text-size-medium` had no combo anywhere on the site, so pairing it with
  `sig-events_card-date` returned "Cannot have duplicate style names". The date
  therefore carries its type size on its own class instead of a combo. Names
  that already appear in some combo (`text-size-small`, `text-size-regular`)
  pair fine.
- **`set_text` does not work on a Text Block created by the element builder.**
  It reports "This element doesn't support text". Write the `text` setting
  through `data_element_settings_tool > set_settings` instead. Headings and
  paragraphs take `set_text` normally, which is why only the pills, dates,
  link labels and the wordmark needed the workaround.

### The stage, and the bug that made it necessary

The section was first built with the backgrounds and wordmark inside
`[data-hscroll-viewport]`. Published, the blue band scrolled off to the left
with the cards and the wordmark travelled 1.35× the track. `sig-events_stage`
is the fix: the sticky, clipped box that holds still, with the viewport
demoted to a plain `position: relative` child filling it. See "Why the word
sits outside the scroller" above.

### Still to do in the Designer

- **Card images.** `.sig-events_card-media` is an empty div on `navy-light`.
  Drop an Image inside each and give it `.sig-events_card-image` (already
  created: `width/height 100%`, `object-fit: cover`).
- **Icons.** `.sig-events_card-pill-icon` (location pin) is still an empty box.
  The link arrow is done — see "The `Learn more` button" above.
- **Link targets.** All three cards point at `#`. These are now the `URL` prop
  on each `Button Primary` instance, not a link setting on the element.
- **Responsiveness — not yet done.** Everything here was built and checked at
  desktop width only. Deferred deliberately; these are the parts known to need
  a pass:
  - **The band/wordmark pair.** `.is-top` is `25vh` and the wordmark is
    `top: 6vh` + `9.5vw`. Those satisfy "wordmark fits inside the cream" at a
    desktop ratio only — a short, wide viewport or a tall, narrow one breaks the
    inequality in "The cream band is sized by the wordmark" and the word spills
    onto the blue again.
  - **Edge alignment.** `.sig-events_track`'s `padding: 0 5vw` and the
    `-10.4vw` gap-cancelling margins on the first/last spacer are all authored
    at the base breakpoint. `.padding-global` is `5%`, not `5vw`, so the two
    only agree while the track's width tracks the viewport's.
  - **Below `[data-hscroll-min-width]`.** The band switches itself off and the
    `small` breakpoint takes over with a stacked layout. That path has not been
    re-checked since the padding and negative margins went in — a negative
    margin left on a stacked column would pull cards into each other.
  - **The button.** `Button Primary` is 80px tall and sizes to its label.
    Untested where the card columns stack.

## Rebuilding or extending this

- **A fourth card**: duplicate `.sig-events_card`, add a fourth
  `.sig-events_shape` if you want a new mark (otherwise the three cycle). The
  band re-measures its own height; nothing else changes.
- **The word drifts too far or too little**: change
  `[data-hparallax-speed]` in the Designer. No rebuild.
- **The shape changes too early or too late**: the trigger range is
  `left center` → `right center` in `shapeSwap.js`. Moving both to `left 40%` /
  `right 40%` makes the swap happen earlier in a card's pass.
- Both components re-init on `HSCROLL_REBUILT` via `initBandAware()` in
  `src/index.js`, so a width change tears them down and rebuilds them with the
  band.
- **The button elsewhere on the site**: drop a `Button Primary` instance in and
  set its `URL` prop. The hover CSS is keyed on `[data-button]`, which the
  component's root carries, so it needs nothing else — but the `.button-style`
  embed holding that CSS currently sits on the Home page only. A second page
  needs its own copy, or the CSS moved somewhere site-wide.

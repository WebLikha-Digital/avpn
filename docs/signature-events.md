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
└ div.sig-events_viewport                                  [data-hscroll-viewport]
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
  └ div.sig-events_track                                   [data-hscroll-track]
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

`.sig-events_word` and `.sig-events_shape-stack` are children of the
**viewport**, not the track. That is load-bearing — see "Why the word sits
outside the track" below.

The reveals are the existing `splitReveal.js`; it is already band-aware and
swaps its own default start to `clamp(left 80%)` inside a band, so the cards
need no start authored.

---

## Measurements

From the Figma frame, which is 1440 wide. Widths are given as `vw` so the band
scales; the design pixels are kept alongside for reference.

| Element | Design px | vw |
| --- | --- | --- |
| `.sig-events_spacer` (each) | 250 | 17.4 |
| `.sig-events_card` | 1531 | 106.3 |
| track column gap | 150 | 10.4 |
| `.sig-events_card-media` | 385 | — (square) |
| `.sig-events_card-title-col` | 487 | 33.8 |
| `.sig-events_card-body-col` | 520 | 36.1 |
| `.sig-events_shape` | 100 | 6.9 |

Track total: `250 + 3×1531 + 2×150 + 250 = 5393`. Against a 1440 viewport the
band therefore owns `5393 − 1440 = 3953px` of vertical scroll, plus the one
viewport height its sticky child occupies. `horizontalScroller.js` writes that
height itself; there is no runway spacer to author.

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
.sig-events_viewport { position: sticky; top: 0; height: 100vh; overflow: hidden; }

.sig-events_track {
  display: flex;
  flex-wrap: nowrap;
  width: max-content;
  height: 100%;
  align-items: flex-end;
  column-gap: 10.4vw;
}

.sig-events_card   { flex-shrink: 0; width: 106.3vw; }
.sig-events_spacer { flex-shrink: 0; width: 17.4vw; }

/* Drifts on its own; must not take part in the track's layout. */
.sig-events_word { position: absolute; white-space: nowrap; will-change: transform; }

/* Every shape occupies the same box; only opacity separates them. */
.sig-events_shape-stack   { position: relative; width: 6.9vw; aspect-ratio: 1; }
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

### Why the word sits outside the track

The track moves because the viewport's `scrollLeft` changes — its own transform
is never touched. A sibling of the track is therefore stationary by default,
and a translation applied to it is measured against a still frame. Put the same
element *inside* the track and its translation stacks on top of the scroll, so
`speed: 0.35` would mean "1.35× the track", the opposite of what it reads as.

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

Each panel gets a trigger spanning `left center` → `right center`, so a panel
owns the marker from the moment its leading edge crosses the middle of the band
window until the next panel's does, and exactly one shape is ever active.

Three decisions worth keeping:

- **All shapes exist at once, stacked.** Rewriting a class on a single `div`
  means the outgoing and incoming shapes can never overlap, and the change
  lands as a hard cut mid-scroll.
- **`onToggle`, not `scrub`.** This is a state change, not a scrubbed value. A
  fast flick past two cards ends on the correct shape rather than halfway
  between two, and scrolling back up reverses for free.
- **Shape index is modulo shape count.** Three shapes across six panels cycle,
  so adding a card in the Designer needs no code change.

Below the band's min width the panels are stacked vertically and the swap would
fire on scroll position alone, which reads as noise — so the first shape is
shown and left alone.

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

### Still to do in the Designer

- **Card images.** `.sig-events_card-media` is an empty div on `navy-light`.
  Drop an Image inside each and give it `.sig-events_card-image` (already
  created: `width/height 100%`, `object-fit: cover`).
- **Icons.** `.sig-events_card-pill-icon` (location pin) and
  `.sig-events_card-link-icon` (arrow) are empty boxes.
- **Link targets.** All three cards point at `#`.

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

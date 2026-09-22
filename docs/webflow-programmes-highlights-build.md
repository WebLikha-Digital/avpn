# Programmes Highlights — Webflow build guide

How the "Programmes Highlights" section (the horizontal band + rotary card
wheels, reverse-engineered from Figma node `1897:29690`) is built in the
Webflow Designer. Read `docs/horizontal-scroller.md` first — it documents the
JS components (`horizontalScroller.js`, `rotaryWheel.js`) this build wires up
to. This doc is the Designer-side counterpart: element tree, Client-First
class names, and the Webflow-specific gotchas hit while building it.

Live on the Home page, immediately after `section_highlights` (Key
Highlights) and before the footer.

---

## Element tree

Client-First naming: BEM-ish, one block prefix (`prog-highlights`) shared by
every class in the component, state as a combo (`is-*`).

```
section.section_programmes-highlights.prog-highlights_scroller   [data-hscroll-init]
└ div.prog-highlights_viewport                                   [data-hscroll-viewport]
  └ div.prog-highlights_track                                    [data-hscroll-track]
    ├ div.prog-highlights_line.is-line-1                     [data-draw-scroll-wrap]
    ├ div.prog-highlights_line.is-line-2                     [data-draw-scroll-wrap]
    ├ div.prog-highlights_line.is-line-3                     [data-draw-scroll-wrap]
    ├ div.prog-highlights_panel.is-intro                              60vw
    │ └ div.prog-highlights_intro-content
    │   ├ h2.prog-highlights_title.heading-style-h2
    │   │ ├ span.prog-highlights-heading_line
    │   │ │ ├ div                                          "Programmes"   [data-split="heading"]
    │   │ │ └ span.prog-highlights-heading_shape
    │   │ └ span.prog-highlights-heading_line
    │   │   ├ img.prog-highlights-heading_image
    │   │   └ div                                          "Highlights"   [data-split="heading"]
    │   └ p.text-size-regular                                             [data-split="heading"]
    │
    ├ div.prog-highlights_panel.is-intro-media          calc(40vw + 15rem)
    │ └ div.prog-highlights_intro-media
    │   └ img.prog-highlights_intro-image
    │
    ├ div.prog-highlights_panel.is-title                             100vw
    │ └ div.prog-highlights_copy
    │   └ h3.prog-highlights_copy-heading.heading-style-h6
    │     ├ span.prog-highlights_copy-line × 3
    │     └ span.prog-highlights_copy-line_shapes    (on the last line only)
    │       └ span.prog-highlights_copy-line_shape.is-half-circle / .is-circle
    │
    ├ div.prog-highlights_panel.is-thematic.is-wheel                  [data-rotary-wheel-init]
    │ └ div.prog-highlights_stage                                     [data-rotary-wheel-stage]
    │   ├ div.prog-highlights_line.is-in-stage              [data-draw-scroll-wrap]
    │   │ └ svg > path                                      "Line 2 stub"
    │   ├ div.prog-highlights_disc.is-thematic              [aria-hidden="true"]
    │   ├ HtmlEmbed.prog-highlights_arc                     "Arc text — thematic"
    │   └ div.prog-highlights_hub                                     [data-rotary-wheel-hub]
    │     └ div.prog-highlights_item × 4                              [data-rotary-wheel-item]
    │       └ div.prog-highlights_card
    │         ├ div.prog-highlights_card-index                        "01"…"04"
    │         ├ h3.prog-highlights_card-heading.heading-style-h6
    │         └ p.prog-highlights_card-body.text-size-small
    │
    ├ div.prog-highlights_panel.is-title       (community heading)
    ├ div.prog-highlights_panel.is-community.is-wheel   (same shape, 4 cards)
    ├ div.prog-highlights_panel.is-title       (impact heading)
    └ div.prog-highlights_panel.is-impact.is-wheel      (same shape, 3 cards)
```

Eight panels, alternating: the intro splits into a title panel and an image
panel, and every wheel is preceded by its own title panel. A title panel holds
nothing but that section's `prog-highlights_copy` heading — the `is-title`
combo is shared by all three, so no per-section combo is needed.

`prog-highlights_intro-media` now holds a real `img.prog-highlights_intro-image`.

The intro heading is one `h2` holding two `prog-highlights-heading_line` spans,
not two sibling `h2`s, and each line carries a decoration in normal flow beside
its text — a shape span on the first, an image on the second. The eyebrow and
`prog-highlights_body` shown in earlier revisions of this doc are gone; the
intro's body copy is a plain `p.text-size-regular`.

The three `prog-highlights_copy-heading` elements are built the same way, out of
`prog-highlights_copy-line` spans, with two decorative shape spans riding the
last line of the first one. All three are `h3`.

Two things from the Figma were **not** built under this build's brief: the
intro's arrow button, and nothing else outstanding. The curved copy around each
wheel and the connector line threading the band *were* both built later — see
"The arc text" and "The connector lines" below.

---

## The structural CSS — set directly on Webflow classes, not a page embed

`docs/horizontal-scroller.md` says the sticky/`max-content` rules belong in
the `.page-style` embed because the Designer "can't express them cleanly."
That's true of the Designer's *visual* style panel, but the underlying
properties are still ordinary CSS — so this build set them as literal
properties on the Webflow classes themselves, via the style tool, instead of
writing an embed:

```
.prog-highlights_viewport { position: sticky; top: 0; height: 100vh; overflow: hidden; }
.prog-highlights_track    { display: flex; flex-wrap: nowrap; width: max-content; height: 100%; }
.prog-highlights_stage    { position: relative; overflow: hidden; width: 100vw; height: 100%; }
.prog-highlights_hub      { position: absolute; width: 0; height: 0; left: 50%; top: 50%; }
.prog-highlights_item     { position: absolute; left: 0; top: 0; }
```

Same outcome as the embed, discoverable in the Designer's Style panel like
any other class. If a future edit needs the embed instead (e.g. a property
the Style panel genuinely can't set), that's still the documented fallback.

**Panel width is the pin distance**, same rule as the generic component doc:
a wheel panel is `100vw` plus roughly one viewport-height of scroll per card
step. Built here as:

| Panel | Cards | Width |
|---|---|---|
| Intro title | — | `60vw` (`is-intro`) |
| Intro image | — | `calc(40vw + 15rem)` (`is-intro-media`) |
| Title × 3 | — | `100vw` (`is-title`, same as the panel default) |
| Thematic areas | 4 | `calc(100vw + 240vh)` |
| Community | 4 | `calc(100vw + 240vh)` |
| Impact | 3 | `calc(100vw + 160vh)` |

Each is set on that panel's own 3-way combo (`.prog-highlights_panel.is-*.is-wheel`),
not on `.prog-highlights_panel` itself — only wheel panels have a pin distance.

**The image panel's width is load-bearing.** `is-intro-media` is
`calc(40vw + 15rem)` and `.prog-highlights_intro-media` sits at `right: 0`, so
the image's centre lands exactly `60vw + 40vw` from the band's start — the fold
at rest. The result is an image cut precisely in half on screen, with the rest
revealed as the band scrolls.

The `15rem` is half the image's own `30rem` width, and it is what keeps the
image inside its own panel rather than overhanging the title panel that
follows. An earlier version used a plain `40vw` panel with `right: -15rem`,
`overflow: visible` and `z-index: 2`; that halved the image correctly but left
its right half sitting on top of the first title panel's copy as soon as the
band moved. Widening the panel to contain the overhang gives the identical
at-rest framing with no overlap and no stacking-context tricks.

If either intro width changes, the image is no longer halved: the invariant is
`is-intro width + is-intro-media width − 15rem = 100vw`.

## The wheel panels — centred, on a colored disc

Panels themselves are transparent: the section carries a gradient on
`.section_programmes-highlights.prog-highlights_scroller`, and every panel sits
on top of it. Color comes from the disc instead, one combo per section:

| Wheel | Disc combo | Variable |
|---|---|---|
| Thematic | `.prog-highlights_disc.is-thematic` | `Brand/Secondary/teal-main` |
| Community | `.prog-highlights_disc.is-community` | `Brand/Primary/red-light` |
| Impact | `.prog-highlights_disc.is-impact` | `Brand/Secondary/emerald-main` |

The disc is centred on the hub (`left/top: 50%`, `translate(-50%, -50%)`) at
`120vh` square and full opacity, so it bleeds off the top and bottom of the
stage and reads as a field rather than a shape — the pattern from
days.christou1910.com, where a card turns on a large flat circle. The hub sits
at `left: 50%` to match, rather than the `62%` it used when the section's copy
shared the stage with it.

Card colour is scoped the same way, but from the `.page-style` embed rather
than the style tool: `.prog-highlights_card` is one class shared by all eleven
cards, so the only thing that separates them is the panel's `is-*` state, and a
descendant selector is precisely what the Designer's Style panel cannot write.
Each panel sets `--card-surface` (the section's *lightest* tint, so the card
reads as a pale tile on the saturated disc) and `--card-accent` (the disc's own
colour); the card and its icon/index read those. Adding a fourth section means
one rule, not four.

The embed also repaints the card's text navy — the Webflow class sets it white,
which was survivable over a transparent card and unreadable on a light tint.
Same specificity, later in the cascade, so no `!important` is needed.

The thematic cards carry `prog-highlights_card-icon` (a 3.5rem circle, flat
`--card-accent` until real icon art lands, same placeholder pattern as
`prog-highlights_eyebrow-icon`) *instead of* `prog-highlights_card-index`.
Community and impact keep the numeric index. Both are painted `--card-accent`,
so whichever a card uses, its top line is the section's colour.

Note the disc's `is-*` names are the same three used by the panel combos, but
they are separate combos under a different base class
(`.prog-highlights_disc.is-thematic` vs `.prog-highlights_panel.is-thematic`).
Webflow accepted both, contrary to what gotcha #2 below would predict.

---

## The arc text

Each wheel's section copy is curved around the card in two mirrored arcs, one
reading up the left side and one down the right, with the cards painting over
them. Reference: the Figma mock, and the same device on
days.christou1910.com — though Christou's is a flat PNG
(`slider-comfy-1.png`, 350×1128), so none of its geometry is readable from
their DOM and none of it was copied.

One `HtmlEmbed.prog-highlights_arc` per wheel panel, inserted **between the
disc and the hub** — that DOM order is what puts the text behind the cards
without a `z-index`. The wrapper class centres it on the hub the way the disc
is centred, at `100vh` square with `pointer-events: none`:

```css
.prog-highlights_arc {
  position: absolute;
  left: 50%; top: 50%;
  width: 100vh; height: 100vh;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
```

The embed holds nothing but the SVG; the type lives once in `.page-style`
(section 5) rather than three times in the embeds:

```html
<svg class="prog-highlights_arc-svg" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <path id="arcThematicL" fill="none" d="M 50 95 A 45 45 0 0 1 50 5" />
    <path id="arcThematicR" fill="none" d="M 50 5 A 45 45 0 0 1 50 95" />
  </defs>
  <text><textPath href="#arcThematicL" startOffset="50%" text-anchor="middle">Strengthening engagements</textPath></text>
  <text><textPath href="#arcThematicR" startOffset="50%" text-anchor="middle">in thematic areas</textPath></text>
</svg>
```

| Panel | Left arc | Right arc | Path ids |
|---|---|---|---|
| Thematic | Strengthening engagements | in thematic areas | `arcThematicL` / `arcThematicR` |
| Community | Expanding our | Community | `arcCommunityL` / `arcCommunityR` |
| Impact | Deepening | our Impact | `arcImpactL` / `arcImpactR` |

Path ids must stay unique per embed — three copies of one id would send all
six runs to whichever path the document sees first.

### Why two paths rather than one

Both arcs run **clockwise** (sweep flag `1`) with opposite endpoints. That is
what makes the left read bottom-to-top and the right top-to-bottom while both
keep their letters facing outward; a single shared path can only do that on
one side. Reversing a side is a matter of swapping its endpoints, not its
sweep flag.

`startOffset="50%"` with `text-anchor="middle"` centres each run on its own
half, so the gaps at 12 and 6 o'clock open by themselves and resize with the
copy — no offsets to retune when the text changes.

### Where the numbers come from

Geometry is authored in viewBox units on a `0 0 100 100` box that the wrapper
maps to a `100vh` square, so **1 unit = 1% of the stage height** and every
value scales with the viewport — the same basis the disc, cards, and wheel
radius already use.

Both numbers were measured off the Figma mock by circle-fitting its arcs
pixel-wise (per-row ink centroid, Kåsa fit), not estimated by eye:

| | left arc | right arc |
|---|---|---|
| fitted radius | 409.8px | 401.4px |
| stage height in the mock | 895px | 895px |
| **radius / stage height** | **0.458** | **0.448** |
| arc covered by the text | 145.6° | 111.9° |

Hence `r = 45`. Type is `56px` against that 895px stage, which is the
`6.26` units in `.page-style`. Eyeballing the same screenshot had put the
radius at 0.73 — worth knowing before trusting a visual estimate here, because
a shallow arc and a deep one look similar once the text is short.

`letter-spacing: 0.34px` is the one *fitted* rather than measured number:
radius and size alone leave the left string about 20° short of the mock's
145.6°, and the tracking closes it.

### Gotchas

- **`overflow: visible` on the SVG is load-bearing.** A long string runs past
  the viewBox before the ends of its path do; clip it and the copy loses its
  first and last few characters.
- **Arc coverage varies with copy length.** At a shared font size "Deepening"
  covers roughly 40° against thematic's ~140°, so the impact panel reads
  sparser. Uniform type was the deliberate call; per-panel `letter-spacing` is
  the lever if that changes.
- **The text is `aria-hidden`.** Each wheel is already preceded by an
  `is-title` panel carrying the same sentence as a real heading, so exposing
  the arcs too would read it twice.
- **The CSS is page-scoped.** A wheel on another page needs section 5 copied
  or promoted — the same tradeoff as the card-colour block beside it.

---

## The connector lines

The line threading through the band, drawn on scroll by `drawPathScroll`. Three
lines plus one stub, all built as native Designer `DOM` elements (`svg` > `path`
with `set_dom_config`), matching how `.highlights_draw_sticky` and
`.explore-links_line` are already authored — not as HTML embeds.

Stroke params are copied from those two: `stroke="white"`, `stroke-width="5"`,
`fill="none"` on the SVG, `width="100%"`. The authored `stroke-dasharray="10 10"`
is **inert** — DrawSVG overwrites `stroke-dasharray` at runtime to do the
reveal, so these lines draw solid. A line can be dotted *or* drawn, not both;
dotted-and-drawn needs the `clipPath` route from `docs/horizontal-scroller.md`.

### A line spans panels, so it hangs off the track

A line covers one or more whole panels, and panels are flex siblings, so a line
cannot be a child of any of them. Each is an absolutely-positioned overlay on
`.prog-highlights_track` (which carries `position: relative` for this), sized
from the panel-width variables in `.page-style` section 6:

| Element | Anchored to | `left` | `width` |
|---|---|---|---|
| `is-line-1` | track | `0` | intro + intro-media + title |
| `is-in-stage` | **thematic stage** | `0` | `100%` |
| `is-line-2` | track | intro + intro-media + title + wheel-4 | title |
| `is-line-3` | track | + title + wheel-4 again | title |

`.prog-highlights_panel` gets `position: relative; z-index: 1` and the overlays
`z-index: 0`, so panel content — discs, cards, the intro photo — paints over the
lines. Do **not** reach for `z-index: -1` instead: that drops the line behind the
section's own gradient and it disappears entirely.

Offsets are built from the width variables rather than hard-coded, because a
line's `left` is the sum of every panel before it — copy those numbers and they
drift the first time a panel is resized. Verified live at 1728×997: track
`18358px`, `is-line-2` at `7682`, which is exactly
`60vw + (40vw + 15rem) + 100vw + (100vw + 240vh)`. Note `100vh` resolves to 941
there, not the 997 of `innerHeight`; the arithmetic still lands because the CSS
and the check use the same unit.

### Why `preserveAspectRatio="none"`, and why no `vector-effect`

Every other drawn SVG on the site sits in a fixed-aspect container, so the
default `meet` works and none of them set either attribute. The band is the
first case where the container's proportions move with the viewport — a panel is
`calc(100vw + 240vh)` — so `meet` would letterbox and the line would stop short
of the panel edges. Each line therefore stretches, with its `viewBox` authored
near its own overlay's aspect so the stretch factor stays near 1 and strokes
don't go anisotropic.

`vector-effect="non-scaling-stroke"` is the obvious-looking fix for the stroke
and is **actively wrong here**: DrawSVG measures with `getTotalLength()` in user
units and writes `stroke-dasharray` in them, while `non-scaling-stroke` makes
the browser resolve that dash pattern in screen units. The two disagree and the
reveal breaks — typically snapping to fully-drawn.

### Trigger ranges

Inside a band `drawPathScroll` swaps its defaults to the horizontal axis, and an
authored start/end has to be written in that axis too. All four lines use:

```
data-draw-scroll-start = "clamp(left right)"
data-draw-scroll-end   = "clamp(right center)"
```

**Keep the `clamp()`.** Without it the first line starts part-drawn: `left right`
means "the wrapper's left edge reaches the scroller's right edge", which for a
line at track `x: 0` is a moment ~one viewport *before* the band begins. That
start is out of range, so the timeline is already ~46% run at band entry —
measured, before the clamp was added. `clamp()` pulls it into the valid range,
and is a no-op for the middle lines.

`end` is `right center`, not `right left`: `right left` completes the draw only
once the line's end has crossed off the left of the screen, so the last stroke
is always drawn out of sight. `right center` finishes it mid-screen. On line 1
that moved completion from `scrollLeft 1968` to `1129`.

### The stub, and why a pinned wheel needs one

Line 2 is meant to emerge from behind the thematic disc. It cannot simply start
under the disc, because **while the wheel is pinned its stage is held still
while the track keeps scrolling** — the disc sweeps ~2258px (the pin distance)
relative to the track. A path start at a fixed track `x` is under the disc for
only one moment of the pin and pokes out either side of it.

So the emerging piece is a separate overlay *inside the pinned stage*
(`.prog-highlights_line.is-in-stage`), which makes it move with the disc instead
of with the track. It is prepended **before** the disc in the stage, so the disc
paints over it.

The two pieces meet without ever tearing apart, and the reason is worth keeping:

- while pinned, the stage's right edge is fixed at the viewport's right edge, and
  `is-line-2` — which starts at the *next* panel's left edge — is still off-screen
  to the right, so the join is never on screen;
- when the pin releases, the stage has travelled exactly its pin distance and its
  right edge now coincides with that panel boundary, so stub and line are
  contiguous and from then on both move with the track.

Measured live: the stub holds at screen `1049–1728` throughout the pin, then
tracks left with everything else.

`is-in-stage` (`left: 0; width: 100%`) is reusable — the community and impact
wheels need the same treatment if a line should emerge from either of them.

### The paths are traced, not exported

All four `d` values were authored by hand from the design mockups, not exported
from Figma, so the curvature is an approximation of the intended beziers. If
exact curves are wanted later, swap the `d` on each path — the structure,
offsets and triggers do not change. Each export needs to be drawn at that line's
own span: line 1 across three panels (~3.9:1), the others one panel each.

---

## The split reveal on the intro panel

The intro heading and its paragraph reveal per line, masked, using the shared
`splitReveal.js` component. Three elements carry `data-split="heading"`:

- the text `div` inside each of the heading's two `prog-highlights-heading_line`
  spans — "Programmes" and "Highlights"
- `p.text-size-regular`, the intro body copy

**The attribute goes on the inner text divs, not on the `h2`.** SplitText
rewraps everything inside its target into its own line elements, and both of
this heading's decorations — the shape span and the image — sit in normal flow
as siblings of the text. Splitting the `h2` would pull them into the generated
line wrappers and reflow them. Attributing the text divs leaves both where the
Designer put them; verified by measuring their offsets before and after, which
are identical.

No authored start is needed. The panel sits inside the band, so `bandContext()`
resolves the horizontal scroller and `splitReveal.js` defaults the start to
`clamp(left 80%)` on the band's axis rather than `clamp(top 80%)` on the page's.

The cards are deliberately excluded — `prog-highlights_card-heading` and
`prog-highlights_card-body` carry no split attribute.

The same reasoning applies to the three `prog-highlights_copy-heading` elements
if a reveal is ever wanted on them: attribute the text inside each
`prog-highlights_copy-line`, not the heading, or the shape spans on the last
line get rewrapped.

---

## Tablet (768–991px): heading size and inline decorations

The band still runs on tablet, but the four headings — `prog-highlights_title`
and the three `prog-highlights_copy-heading`s — did not fit their columns.
`.prog-highlights_intro-content` and `.prog-highlights_copy` (`max-width: 60vw`)
shrink to 595px at 991 and 461px at 768 while the H2 variable only scales to
75px / 65px, so "Programmes ▮" clipped inside its `line-mask` and
"engagements in / thematic areas" rewrapped, leaving an orphan "in" and the
shapes floating beside a two-line block. The inline shape and photo were fixed
`4.5rem` / `7rem` and made the second title worse the smaller the text got.

Set on the **Tablet** breakpoint only (2026-09-22), so desktop is byte-identical:

| Class | Tablet value |
|---|---|
| `.heading-style-h2.prog-highlights_title` | `font-size: calc(var(--_typography---font-size--h2) * 0.8)` |
| `.prog-highlights_copy-heading` | `font-size: calc(var(--_typography---font-size--h2) * 0.8)` |
| `.prog-highlights-heading_shape` | `width/height: 0.75em` |
| `.prog-highlights-heading_image` | `width/height: 1.1667em` |

`0.8` is the largest factor at which every authored line stays one rendered
line at both 991 and 768 (60px / 52px); `0.85` and `0.9` still rewrap
"engagements in / thematic areas" at 768. The `em` ratios are the desktop
ratios (`72px / 96px`, `112px / 96px`), so the decorations keep their
proportion to the text instead of a fixed size. Widening `.prog-highlights_copy`
to `75vw` was tried instead and rejected: the second and third title panels
place their copy to the right of the disc and overflow the viewport.

Measuring this needs a fresh page load per candidate size: SplitText splits
once on load, so a style injected afterwards keeps the old line breaks and
reads as a false wrap.

## Mobile (≤767px): the band stacks

Below 768 `horizontalScroller.js` never marks the band and `rotaryWheel.js`
returns without a scroller, so the JS is already out of the way; until
2026-09-22 the Webflow layout was not. The track stayed a flex row of `100vw`
panels, the section was one viewport tall, and everything after the intro sat
off-canvas to the right. The stacked layout below follows Figma node
`4036:38947` (375×4179) and is set on the **Mobile landscape** breakpoint,
which cascades to portrait.

| Class | Mobile value |
|---|---|
| `.prog-highlights_scroller` | `overflow-x: clip` (the disc bleeds both sides) |
| `.prog-highlights_viewport` | `position: static; height: auto; overflow: visible` |
| `.prog-highlights_track` | `flex-direction: column; width: 100%; height: auto; row-gap` + `padding-top` = `section-space/small`, `padding-bottom: 0` |
| `.prog-highlights_panel` | `width: 100%; height: auto; overflow: visible; padding-inline` = `space/4` |
| `.is-intro`, `.is-intro-media` | `width: 100%; display: block` (media also `overflow: visible` for the arrow) |
| `.is-*.is-wheel` × 3 | `width: 100%` |
| `.is-tail` | `display: block; height: 100vh` — the runway the section's arc cover rises over; without it the cover ate the last card |
| `.prog-highlights_line` | `display: none`; new combo `.is-mobile` is the one line shown (`display: block` here, `none` on desktop) |
| `.prog-highlights_intro-content` | `padding-left: 0; row-gap` = `space/4` |
| `.heading-style-h2.prog-highlights_title`, `.prog-highlights_copy-heading` | `font-size: calc(var(--_typography---font-size--h2) * 0.75)` |
| `.prog-highlights_copy-heading` | `width: 100%; align-items: stretch` |
| `.prog-highlights_copy-line` | `width: 100%; column-gap` = `space/3` |
| `.prog-highlights_copy` | `position: static; max-width: none; transform: none; row-gap` = `space/6` |
| `.prog-highlights_intro-media` | `position: relative; width: 100%; height: auto; aspect-ratio: 1/1`, offsets and transform cleared |
| `.prog-highlights_intro-icon` | `display: flex; top: 0; left: 50%; margin: -2.5rem 0 0 -2.5rem; transform: none` — straddles the image's top edge; centred with margins, not a transform, because the shape reveal owns the element's transform |
| `.prog-highlights_intro-icon-wrapper` | `transform: rotate(90deg)` — the arrow art points right; the inner wrapper turns it down |
| `.prog-highlights_stage` | `width: 100%; height: min(180vw, 140vh, 50rem); overflow: visible; display: flex; align-items: center` |
| `.prog-highlights_disc` | `width/height: min(180vw, 140vh, 50rem)` |
| `.prog-highlights_arc` | `width/height: calc(min(180vw, 140vh, 50rem) * 1.28); transform: translate(-50%, -50%) rotate(90deg)` |
| `.prog-highlights_hub` | `position: relative; width: calc(100% + 2 * space/4); margin-left: calc(-1 * space/4); padding-inline` = `space/4`; `display: flex; column-gap` = `space/3`; `overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-left` = `space/4`; `scrollbar-width: none` |
| `.prog-highlights_item` | `position: relative; flex: 0 0 100%; scroll-snap-align: start` |
| `.prog-highlights_card` | `transform: none; width: 100%; height: 100%; min-height: auto; padding` = `space/4` per side |

### Why those numbers

- **Heading at 0.75 × H2.** The H2 variable is 46.6px at 375, and the live
  font is wider than the Figma's: "thematic areas" plus its two shapes is
  ~292px at 40px, against a 335px column minus the 14px gap and 51px of
  shapes. 0.75 (35px at 375, 34px at 360) is the largest factor at which every
  authored line stays one rendered line from 360px up; 0.85 and 0.9 rewrap the
  third line. 320px still wraps it — accepted.
- **`width: 100%` on the heading and its lines.** Both are flex items under
  `align-items: flex-start`, so they shrink-to-fit; the row then squeezed its
  text `div` below the text's width and the browser wrapped inside the line
  *before* SplitText measured it, which turned "thematic areas" into two
  permanent line elements. Stretching both keeps the text `div` at its natural
  width.
- **Disc `min(180vw, 140vh, 50rem)`.** 180vw reproduces the Figma's 677px disc
  on a 375 screen and bleeds ~52px each side; the `50rem` cap stops it growing
  to 1380px on a 767 screen (measured before the cap), and `140vh` keeps a
  landscape phone from getting a disc taller than its screen.
- **Arc at 1.28 × disc, rotated 90°.** The Figma puts the arc text at 0.82 of
  the disc radius; the embed's paths sit at r = 32 on the 100-unit box, i.e.
  0.64 of the box, so the box has to be 1.28× the disc. Rotating the whole SVG
  90° moves the left run (centred at 9 o'clock) to the top and the right run to
  the bottom, keeping letters facing outward — upright on top, inverted along
  the bottom, exactly as the mock draws it. No second set of paths is needed.
- **Hub bleeds by `space/4` on both sides.** The hub is the scroll container,
  so it clips its own children; bleeding it to the panel edge is what lets the
  next card peek in from the viewport edge rather than from the content edge.
  Snap positions land at item start minus `scroll-padding-left` (measured
  0/329/657/986 for the four thematic cards).
- **No "Show more".** The longest card body is 463 characters, ~11 lines at
  the mobile size; the tallest card is 483px inside a 675px disc. The Figma's
  truncation was not needed.

### The mobile line

`.prog-highlights_line.is-mobile` is a fourth `[data-draw-scroll-wrap]`
overlay prepended to the track: `svg[data-draw-scroll-desktop]` with
`viewBox="0 0 375 4600"`, `preserveAspectRatio="none"`, one
`path[data-draw-scroll-path]` (`stroke="white"`, `stroke-width="5"`). It has
no authored start/end, so `drawPathScroll` uses its vertical defaults
(`clamp(top center)` → `clamp(bottom center)`). The path hugs the right margin
beside each title block and only crosses the column inside the three disc
areas, where the card paints over it; the first draft ran through the intro
copy and was rerouted. Like the desktop lines it is hand-traced, not exported.

### Authored band-axis positions off the band

The arc embeds carry `data-shape-start="clamp(left 80%)"` and the desktop
lines carry `clamp(left right)` / `clamp(right center)`. Those are band-axis
positions, and below 768 there is no band, so `horizontalScroller.js` now
exports `verticalScrollPosition()` — `left` → `top`, `right` → `bottom`,
wrapper and percentages untouched — and every band-aware component
(`shapeReveal`, `splitReveal`, `drawPathScroll`, `wipeReveal`,
`contentReveal`) maps an authored value through it when `bandContext()` is
null. With a band active nothing changes. `tests/live/programmesHighlightsMobile.spec.js`
covers the stacked layout at 375×812 on the published page.

---

## Rebuilding or extending this

- **Card count changes.** Add/remove a `.prog-highlights_item` under the
  panel's `.prog-highlights_hub`; the wheel component reads card count from
  the DOM. Re-check the panel's `width` (see the pin-distance table above) —
  it doesn't auto-adjust.
- **New panel.** Duplicate `is-thematic` (or `is-community`/`is-impact`) as a
  combo pattern: `create_style` a new `is-<name>` combo under
  `prog-highlights_panel`, then a second `is-<name>.is-wheel` 3-way combo for
  the width/pin-distance override. Copy the arc embed too, and give its two
  paths ids no other embed uses.
- **New line.** Add a `.prog-highlights_line.is-line-N` combo with `left` and
  `width` built from the panel-width variables, then a `div` > `svg` > `path`
  of `DOM` elements under the track. No `.page-style` edit is needed — section 6
  holds only the variables and the shared `svg` rule.
- **Verify after any bulk build.** Query for Webflow's default placeholder
  strings (`"This is some text inside of a div block."` for Text Blocks,
  `"Heading"` / `"Lorem ipsum"` for others) across the section before calling
  it done — see gotcha #4.

# Programmes Overview — Webflow build guide

How the "Programmes Overview" section is built on the Home page, and how the
four components that drive it are wired to it.

The section is a tall scroll track with a sticky child. An intro heading travels
up and out while a seven-row programme list rises into the space it leaves,
against a drifting blob background and a line that draws itself on. Hovering a
row fills it with an orange bar and floats a preview image beside the cursor.

Content is static — seven hand-built rows, no Collection List.

Four components run here, none of them section-specific:

| Component | Owns |
| --- | --- |
| `programmesOverview.js` | the one scrubbed timeline: intro out, list in, blobs and line drifting |
| `drawPathScroll.js` | the line drawing itself on |
| `listHoverReveal.js` | the row highlight — bar, label colour, dimming the others |
| `listPreviewFollower.js` | the preview image that tracks the cursor |

`splitReveal.js` also runs on the heading lines and the paragraph.

---

## Element tree

Client-First naming: one block prefix (`prog-overview`) shared by every class,
state as a combo (`is-*`).

```
section.section_programmes-overview                      [data-prog-overview-init]
├ div.prog-overview_path                                 [data-prog-overview-path]
│ │                                                      [data-draw-scroll-wrap]
│ │                                     [data-draw-scroll-start="top+=6.667% top"]
│ │                                     [data-draw-scroll-end="top+=24.85% top"]
│ └ svg                                                  [data-draw-scroll-desktop]
│   └ path                                               [data-draw-scroll-path]
└ div.prog-overview_sticky            [data-prog-overview-sticky] [data-follower-wrap]
  ├ div.prog-overview_bg                                 [data-prog-overview-bg]
  ├ div.prog-overview_intro                              [data-prog-overview-intro]
  │ ├ h2.prog-overview_heading
  │ │ ├ div.prog-overview_heading-line                   [data-prog-overview-line]
  │ │ │ ├ div.prog-overview_heading-text                 [data-split="heading"]
  │ │ │ │                                 [data-split-start="clamp(top 55%)"]
  │ │ │ │                     [data-split-trigger=".section_programmes-overview"]
  │ │ │ └ span.prog-overview_heading-shape.is-quarter-circle
  │ │ └ div.prog-overview_heading-line                   [data-prog-overview-line]
  │ │   ├ img.prog-overview_heading-_image
  │ │   └ div.prog-overview_heading-text                 [data-split="heading"]
  │ └ p.prog-overview_paragraph                          [data-split="heading"]
  │                                       [data-split-start="clamp(top 45%)"]
  │                           [data-split-trigger=".section_programmes-overview"]
  ├ div.prog-overview_bar                                [data-hover-bar]
  ├ div.prog-overview_list         [data-prog-overview-list] [data-hover-list-init]
  │ │                                                    [data-follower-collection]
  │ └ a.prog-overview_item  ×7        [data-hover-row] [data-follower-item]
  │   └ div.prog-overview_item-inner                     [data-prog-overview-row]
  │     ├ div.prog-overview_item-media.is-*              [data-follower-visual]
  │     ├ div.prog-overview_item-heading
  │     ├ div.prog-overview_item-icon-wrapper > div.prog-overview_item-icon > svg
  │     └ div.prog-overview_item-line
  └ div.prog-overview_follower                           [data-follower-cursor]
    └ div.prog-overview_follower-inner            [data-follower-cursor-inner]
```

Three placements in that tree are load-bearing, and each one is a bug that has
already been fixed once. They are the three sections below.

### The path is a sibling of the sticky child, not a child of it

`.prog-overview_path` is `position: absolute` with **percentage** geometry —
`top: -20%; left: 39%; width: 24%; height: 300%` — so it is sized and placed by
its containing block, which is the section (`position: relative`). It has to be
a direct child of the section for those percentages to mean anything.

It was first authored as markup inside the `programmes-overview-css` embed,
which lives in the page's `.style-embeds` block near the top of `<body>`. The
element still rendered, still had its class, and still carried its attributes —
but its percentages resolved against the wrong box, so it measured `0x0` at the
top of the document. `drawPathScroll` then built its trigger from
`top+=6.667%` and `top+=24.85%` of a zero-height element and got `start === end`.
The line never drew: `stroke-dasharray` read `0px, 999999px` at every scroll
position, at the top of the page and in the middle of the section alike.

Nothing about that failure looks like a placement problem from the Designer —
the section renders, the class panel shows the right numbers, and the SVG is in
the DOM. `tests/live/programmesOverview.spec.js` catches it ("draws the path as
the section scrubs") because it samples `stroke-dasharray` at three scroll
positions rather than checking that the element exists.

**Author the SVG as elements, not as embed markup.** The wrapper is a Div Block
carrying `.prog-overview_path`; the `<svg>` and `<path>` inside it are custom
elements (Webflow's "custom element", any tag name) with their attributes set in
the settings panel. Published output is ordinary `<svg>`/`<path>` tags, which the
HTML parser puts in the SVG namespace as usual. The embed keeps only its
`<style>` block.

### The bar is a sibling of the list, not a child of a row

`[data-hover-bar]` has to paint *under* the cursor follower while the row's label
paints *over* it. It cannot live inside the list: the scroll reveal puts a
transform on the list and on each row's inner wrapper, every transform opens a
stacking context, and everything inside one paints as a single layer. A fill
inside the row is therefore stuck on the same side of the follower as the label.
One bar beside the list is not.

`listHoverReveal.js` re-places the bar on the lit row every frame, not once per
`pointerenter`, because this section scrubs its own list: the row slides out from
under a stationary pointer as the page scrolls.

### The row reveal goes on the inner wrapper, not the row

`[data-prog-overview-row]` sits on `.prog-overview_item-inner`, while
`[data-hover-row]` sits on the `.prog-overview_item` link that contains it.

The staggered entrance writes an inline `opacity`, and an inline opacity beats
the stylesheet rule that dims the other rows. Put both hooks on one element and
the dimming quietly stops happening — everything else still works, which is what
makes it hard to spot.

---

## Measurements

The section's own height is the scrub distance; a `position: sticky` child does
the pinning. There is no ScrollTrigger pin, so there is no pin-spacer for
Locomotive to fight over.

```css
.section_programmes-overview { min-height: 220vh; position: relative;
                               overflow: clip; }
.prog-overview_sticky        { position: sticky; top: 0; height: 100vh;
                               overflow: hidden; }
```

`overflow: clip` on the section, `overflow: hidden` on the sticky child. That
split matters: `overflow: hidden` on the *section* would make it the sticky
element's nearest scroll container, and a container that never scrolls means the
child never sticks — the whole sequence then rides up the page and leaves an
empty gradient behind it. Everything here bleeds past the frame, so the
temptation to clip the section is real. `clip` does not create a scroll
container, which is why it is safe there.

Lengthen or shorten the sequence by changing `min-height` on the section. No
code change: `programmesOverview.js` reads the section's height as its scrub
distance. (Its doc comment describes a `--prog-overview-pin` variable; this
build sets the height directly instead.)

| Element | Geometry |
| --- | --- |
| `.prog-overview_bg` | `absolute; top: 0; left: -25%; width: 150%; height: 100%` |
| `.prog-overview_path` | `absolute; top: -20%; left: 39%; width: 24%; height: 300%` |
| `.prog-overview_intro` | `absolute; top: 26%; left: 0; right: 0` |
| `.prog-overview_list` | `absolute; top: 6%; left: 0; right: 0; z-index: 2` |
| `.prog-overview_bar` | `absolute; top: 0; left: 0; right: 0; height: 0; z-index: 0` |
| `.prog-overview_follower` | `fixed; 260 × 260; z-index: 1` |
| `.prog-overview_item` | `height: clamp(64px, 12vh, 106px)` |

Stacking inside the sticky child is bar `0`, follower `1`, list `2`.

The row height is capped against the viewport because seven 106px rows overflow
a short screen; 106px is the Figma value, measured on an 879-tall frame.

### Why the travels are viewport fractions

Every distance in `programmesOverview.js` is a fraction of the viewport height,
read off the two Figma states (a 1438×879 frame) and divided by 879:

```
intro   y  226 → -673.5  =  -899.5 / 879  =  1.023
path    y    0 → -916    =  -916   / 879  =  1.042
blobs  cy  540.3 → 137.4 =  -402.9 / 879  =  0.458
list    y  604 → 80      =  -524   / 879  =  0.596
```

Raw pixels would leave the intro halfway up a tall screen at the point the rows
are meant to own it. The row entrance offset (40px) is deliberately *not*
scaled — it is an entrance, not a layout distance.

### Why the path's start and end are offsets, not viewport defaults

`.prog-overview_path` is `height: 300%` of a `220vh` section — 6.6 viewport
heights. On `drawPathScroll`'s defaults (`clamp(top 90%)` to `clamp(bottom 10%)`)
the draw would spread across all 6.6 of them and be barely a fifth finished by
the time the list arrives; measured, it ran 0.21 to 0.39 across the whole
section.

Both offsets are therefore percentages of the element's own height, which keeps
them viewport-proportional:

```
data-draw-scroll-start="top+=6.667% top"   0.44vh of its 6.6vh
data-draw-scroll-end="top+=24.85% top"     1.64vh below that same point
```

---

## The CSS embed

`programmes-overview-css` holds the rules Webflow's style panel cannot express.
Everything else is a class.

- `.prog-overview_bar { transform: scaleY(0) }` — the resting state. It has to
  hold with no JS, or a failed bundle leaves every row wearing its own fill.
- The `[data-hover-state="active"]` rules: the sibling dimming (`opacity: 0.15`),
  the label going white, the white disc behind the navy arrow, and the row rule
  fading out. `listHoverReveal.js` only flips the attribute; colour and dimming
  are CSS transitions, which is cheaper than tweening every sibling on every
  pointer move and puts those values where the Designer can see them.
- `.prog-overview_item { height: clamp(64px, 12vh, 106px) }`.
- The follower's entrance — `opacity` and `scale` from 0, inside
  `@media (hover: hover) and (pointer: fine)`, driven by
  `body:has([data-follower-collection]:hover)`. JS owns the position and the
  image swap; this owns only the entrance, so the image does not pop into
  existence on the first row. A second query hides the follower entirely for
  `(hover: none), (pointer: coarse)`.
- `.prog-overview_item-media { display: none }` plus
  `[data-follower-cursor] [data-follower-visual] { display: block; inset: 0 }` —
  the row copy is the *source* the clone is taken from, never something the
  reader sees.
- `.prog-overview_path > svg { display: block; width: 100%; height: 100%;
  overflow: visible }` — `visible` so the round cap at each end is not clipped.

The embed holds no markup. See "The path is a sibling of the sticky child".

---

## The preview images

Each row's `.prog-overview_item-media` carries a combo (`is-ai-opportunity-fund`,
`is-climate-x-health`, `is-health-systems`, `is-capacity-building`,
`is-philanthropic-funds`, `is-avpn-academy`, `is-aspire`) whose only job is a
`background-image`.

**These are Unsplash placeholders.** They are hot-linked `images.unsplash.com`
URLs on the class, not site assets. Replace them with real programme imagery
before this section is considered done.

---

## Testing

`tests/live/programmesOverview.spec.js` runs against the published staging page
with `dist/animations.min.js` routed in from the local build:

```
npx playwright test -c playwright.live.config.js programmesOverview
```

The spec's `beforeEach` asserts one `[data-prog-overview-init]` and **seven**
`[data-hover-row]` before any test body runs, so a structural problem in Webflow
fails all eight tests at the same line rather than producing eight different
errors. Two Webflow-side faults have surfaced exactly that way:

- `.prog-overview_list` hidden via the Designer's Show/Hide element toggle. That
  strips the element from published output entirely, so the rows count as 0.
- The path authored inside the CSS embed (above), which fails only the draw test.

If the row count is 0, check the list's visibility toggle before reading any
JavaScript.

---

## Still to do in the Designer

- **Real imagery.** The seven `.prog-overview_item-media` combos are Unsplash
  placeholders.
- **Link targets.** All seven rows point at `#`.
- **Responsiveness.** Everything here was built and checked at desktop width.
  The heading is `6vw`, the intro sits at `top: 26%` and the list at `top: 6%` of
  a `100vh` sticky child — a short, wide viewport pushes them into each other.
  The follower is already switched off for coarse pointers, but the row layout
  below the `medium` breakpoint has not been checked.

## Rebuilding or extending this

- **An eighth row**: duplicate `.prog-overview_item`, keep both hooks in place
  (`[data-hover-row]` on the link, `[data-prog-overview-row]` on the inner
  wrapper), and add a combo for its image. The stagger and the hover both read
  the list live; nothing else changes.
- **A longer or shorter hold**: change `min-height` on the section.
- **The line drawing too early or too late**: change
  `data-draw-scroll-start` / `data-draw-scroll-end` on `.prog-overview_path`.
  They are offsets down that element, so they stay proportional as the section
  height changes.
- **A different line**: replace the `d` attribute on the custom `path` element
  and the `viewBox` on its parent `svg`. Keep it to a single subpath — SVG
  restarts `stroke-dasharray` at every `M`, so a two-subpath shape draws both
  halves from 0% at once.

# Horizontal scroller + rotary wheel — dev notes

A horizontal scroll band that lives inside an otherwise vertical page, and a
card wheel that turns while the band is parked. Two components:
`src/animations/horizontalScroller.js` and `src/animations/rotaryWheel.js`.

Reverse-engineered from [days.christou1910.com](https://days.christou1910.com/en/),
which runs the same architecture on GSAP 3.13.

---

## How it works

The band is a **real horizontal scroll container**, not a translated track:

1. JS gives the outer element a height equal to the track's horizontal
   overflow, plus one viewport height for the sticky child to sit in.
2. A `position: sticky` viewport holds a window over the track.
3. Every frame, `viewport.scrollLeft` is set to how far the page has scrolled
   into the band. Vertical distance in, horizontal distance out, 1:1.

Locomotive already eases `window.scrollY`, so the band reads an eased number and
passes it straight through. **Don't add a second lerp here** — it would make the
band visibly lag everything else on the page.

### Why not `containerAnimation`

The usual GSAP recipe is `gsap.to(track, { x: -distance })` plus
`containerAnimation` on nested triggers. That works for fades and moves, but
**`containerAnimation` cannot pin**. A real scroll container can: nested
components pass `scroller: <viewport>` and `horizontal: true` to an ordinary
`ScrollTrigger`, and `pin: true` behaves exactly as it does vertically. That is
the entire reason for this design — it's what lets the rotary wheel park the
band and run a nested sequence before horizontal motion resumes.

### Why not Locomotive's own horizontal mode

`lenisOptions.orientation: "horizontal"` makes the **whole document** scroll
sideways. It's the right answer for a fully horizontal page, but it can't hand
the axis back partway down, and every existing vertical component on the page
would need `horizontal: true`. This band is a section, so it stays out of it.

---

## Webflow setup

Structure, with custom attributes from Element Settings:

```
div                     data-hscroll-init = ""
  div                   data-hscroll-viewport = ""
    div                 data-hscroll-track = ""
      div  (panel 1)
      div  (panel 2)
      ...
```

Optional on the outer element:

```
data-hscroll-min-width = "768"   ← below this the band doesn't activate (default 768)
```

While active, the outer element carries `data-hscroll-active`, so CSS can key
the desktop-only layout off the same signal the script uses.

### Required CSS

These are structural, not styling — put them in the page's `.page-style` embed,
not Global Styles (the Designer can't express `sticky` + `max-content` cleanly):

```css
[data-hscroll-viewport] {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
}
[data-hscroll-track] {
  display: flex;
  flex-wrap: nowrap;
  width: max-content;
  height: 100%;
}
```

`overflow: hidden` rather than `auto` is deliberate. A hidden-overflow element is
still scrollable programmatically, so `scrollLeft` and ScrollTrigger both work —
but a trackpad swipe can no longer scroll it directly, which would desync it from
the page position that is supposed to be its only input.

Panels need an explicit width (`100vw`, `160vw`, whatever) and `flex: none`.

---

## The rotary wheel

Christou's "vertical slider" is a wheel: cards sit on the rim of a circle with a
radius a few times the viewport height, so the arc between neighbouring slots is
close to vertical, with a visible sideways swing as a card leaves the slot.
Measured on the live site: 4 cards, 14° apart, radius 3159px, wheel turning
0° → 44° across 5646px of pinned horizontal scroll.

Geometry here is two rotations sharing one origin. Every card is stacked at the
same point — the slot where the active card belongs — and rotated about a centre
`radius` to its right, which flings card *i* down along the rim. The hub then
rotates the whole set back the other way, lifting each card in turn through the
slot. Because cards and hub share that origin, `rotation` is the only property
written; no card needs its own offset.

```
div                data-rotary-wheel-init = ""     ← a panel in the track
  div              data-rotary-wheel-stage = ""    ← pinned, one viewport wide
    div            data-rotary-wheel-hub = ""      ← at the active card's slot
      div          data-rotary-wheel-item = ""     ← one per card
      div          data-rotary-wheel-item = ""
      ...
```

```css
[data-rotary-wheel-stage] { position: relative; overflow: hidden; }
[data-rotary-wheel-hub]   { position: absolute; left: 50%; top: 50%;
                            width: 0; height: 0; }
[data-rotary-wheel-item]  { position: absolute; left: 0; top: 0; }
[data-rotary-wheel-item] > * { transform: translate(-50%, -50%); }
```

The last rule centres each card on the hub point. GSAP writes its transforms on
the *item*, so the card's own translate is never clobbered — which beats
negative margins, since it doesn't hard-code the card's size.

The card nearest the slot carries `data-rotary-wheel-state="active"`, so CSS owns
how the focused card differs from the ones queued behind it.

### Tunables

Set them on the **panel** (`[data-rotary-wheel-init]`), not the stage — the
component reads them from the panel, and custom properties don't inherit upward.

| Property | Default | Effect |
| --- | --- | --- |
| `--rotary-wheel-step` | `14` (degrees) | Angle between cards. Larger = further apart on the rim = more travel between slots. |
| `--rotary-wheel-radius` | `3.2 × stage height` | Rim distance in px. Shrink it and cards visibly swing in from the side instead of rising. |
| `--rotary-wheel-scale` | `0.85` | Size a card keeps per step away from the slot. `1` disables the depth cue. |
| `--rotary-wheel-hold` | `0` (card steps) | Optional parked tail after the last card. `1` reserves one card-turn distance for the last card to remain active. |

An in-stage draw wrapper can use `data-draw-scroll-wheel-hold` to stay undrawn
through wheel arrival and all card turns, then scrub from 0% to 100% across the
hold. The attribute is ignored when the wheel has no positive hold, and on
mobile (where the horizontal band is inactive) the wrapper uses its normal
draw-path range. Its authored `data-draw-scroll-start` and
`data-draw-scroll-end` are not used while this opt-in is active; the wheel pin's
`left left` to `panel width - stage width` range is the source of truth.

### Where the defaults come from

The step and radius are read off the **live reference**, which is the better
source: the Figma file's own numbers matched its spacing but only half its
sideways swing.

Two quantities describe the path, and both are expressed as ratios of the stage
height so they survive a change of viewport:

```
chord = 2 · RADIUS_RATIO · sin(STEP / 2)   vertical distance between slots
drift =     RADIUS_RATIO · (1 − cos STEP)  sideways swing per step
```

- The reference runs 14° on a 3159px rim: a 770px chord and 93.8px of drift.
  Against its ~989px frame that is `0.78` and `0.095` of the stage height.
  `RADIUS_RATIO = 3.2` at 14° reproduces both at once.
- The earlier defaults (8.8° on a 5× rim, from the Figma file) gave the same
  0.77 chord but only 0.059 of drift — the cards travelled too straight, and the
  wheel read as a vertical slider rather than as a wheel.
- The queued card's bounding box is `428.247 × 497.838`. Solved as a rotation of
  the real 426 × 526 card, the implied scale factor is uniform at `0.85`
  (364/426 = 0.854, 447/526 = 0.850) — so a card is scaled as well as turned.

**The chord is also a ceiling on card height.** A card taller than
`0.78 × stage height` overlaps the one queued behind it. Card width therefore
needs a floor that does not depend on viewport *height* — otherwise a short
viewport narrows the text column, the copy grows taller, and the spacing shrinks
at the same time. `.prog-highlights_card` uses `max(41vh, 26rem)` for exactly
this reason.

**Scaling shifts a card sideways too.** Both the rotation and the scale share
the origin `radius` to the card's right, so scaling by `s` pulls the card
`(1 − s) · radius` toward that origin. At 900px stage the queued card measures
505px right and 592px below the slot, which is
`2880 − 0.85·2880·cos 14°` and `0.85·2880·sin 14°` — not the unscaled 86/697.
Worth knowing before concluding the geometry is wrong.

### Duration

The wheel's scrub distance is **the panel's width minus one stage width** — a
wider panel means a slower wheel. Authoring it that way is what keeps the
track's total width unchanged once ScrollTrigger's pin-spacer replaces the
panel's own contribution, so the band's height stays correct without knowing the
wheel exists.

The stage has to sit at the panel's **leading edge** — don't centre it. Once
pinned, the pin-spacer's padding is what supplies the panel's remaining width;
a centring flex panel will offset the stage by half the leftover.

---

## Using it for Programmes Highlights

The section is four panels: an intro, then three card stacks.

| Panel | Cards |
| --- | --- |
| Strengthening engagements in thematic areas | Climate Action, Health Impact, Gender Equality, Economic Inclusion |
| Expanding our community | West Asia Hub, Impact Investing, Learning Circles, Government and policymakers |
| Deepening our impact | Fund Plus, Tools and Resources, Fellowships |

**Figma's 7211px track is a layout mockup, not the scroll length.** It shows one
state per panel. The real panel width is `100vw + pin distance`, and the pin
distance is what the cards need to advance — budget roughly one viewport height
per card step, so a four-card panel is about `100vw + 3 × 100vh`. That makes the
real track substantially longer than the mockup; the mockup's panel widths are
the *layout* inside each stage, not the panel widths to author.

The 932px rim disc and its curved text are **static** — no rotation — so they're
plain CSS/SVG in Webflow, not a component. Likewise the intro's arrow button.
The curved text is built as one SVG `textPath` embed per wheel panel; see
"The arc text" in `docs/webflow-programmes-highlights-build.md`.

The connector curves (`Vector 98`) go through the existing `drawPathScroll`
component, which is now band-aware, and are built — see "The connector lines" in
`docs/webflow-programmes-highlights-build.md`. One caveat, confirmed in the
build: DrawSVG works by animating `stroke-dasharray`, so it owns that property —
a stroke can be drawn on scroll *or* dotted, not both. The shipped lines are
solid for exactly this reason. If a connector must stay dotted, draw it as a
dotted path inside a `clipPath` and animate the clip instead, or ship it as a
static dotted SVG.

Anything drawn across a **pinned** panel needs care: while the pin holds, the
stage stands still and the track keeps scrolling, so a track-anchored path
slides relative to the pinned content by the whole pin distance. Anchoring that
piece inside the stage instead is what keeps it registered to the disc — the
`is-in-stage` pattern in the build guide.

---

## Components inside a band

`drawPathScroll` and `splitReveal` call `bandContext(element)` and spread the
result into their `scrollTrigger` config. Outside a band it returns null and
contributes nothing, so behaviour on the rest of the site is unchanged; inside
one it supplies `scroller` + `horizontal: true` and the component swaps its
default start/end to the matching axis (`clamp(left center)` rather than
`clamp(top center)`). An authored `data-*-start` still wins — but it has to be
written in the band's axis when there is one.

`src/index.js` groups these as `initBandAware()`, called after
`initHorizontalScroller()` and again on the `hscroll:rebuilt` event, because a
band must exist before anything can look one up.

---

## Troubleshooting

**Band doesn't activate.** Check the viewport width against
`data-hscroll-min-width`, and that all three `data-hscroll-*` elements exist —
missing markup early-returns silently by design, so one broken band can't take
the page down.

**Track jumps or the page height is wrong.** The height is written on
ScrollTrigger's `refreshInit`, before any trigger measures. If something else
resizes the track after that (a late-loading font or image), call
`ScrollTrigger.refresh()` — `src/index.js` already does this for images.

**Wheel doesn't turn.** `horizontalScrollerFor()` returned null, meaning the
panel isn't inside an *active* band. Below the min-width that's intended: the
cards fall back to whatever the Designer's stacked mobile layout does.

**Nested animation doesn't fire.** Anything inside the band needs
`scroller: horizontalScrollerFor(el)` and `horizontal: true`, with start/end
written horizontally (`"left right"`, `"right left"`). A vertical trigger inside
the band will never see its own start.

**Resize.** A width change rebuilds every band, then fires `hscroll:rebuilt` on
window. Nested components listen for that and rebuild themselves — which keeps
the dependency one-way, since the band must not import its own children. Height
changes are ignored on purpose (mobile URL-bar jitter).

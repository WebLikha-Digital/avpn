# Image breaker (`clipReveal.js`)

The image that closes the CEO's Foreword. A full-width frame stays fixed in a
sticky, viewport-height wrapper while its clipped opening expands from a small,
rounded box to the complete square-cornered image.

## How it works

The section is `200vh` tall and contains a `position: sticky; top: 0` wrapper
that is `100vh` tall. Native CSS sticky holds the frame in place for the second
viewport of section travel; ScrollTrigger does not pin or move it.

At initialization, the script measures the optional sizing box relative to the
target frame. Those four differences become the starting top, right, bottom,
and left pixel insets. It also reads the sizing box's computed
`border-top-left-radius`. One scrubbed GSAP tween then animates explicitly from:

```css
inset(<top>px <right>px <bottom>px <left>px round <radius>px)
```

to:

```css
inset(0px 0px 0px 0px round 0px)
```

The script never reads `clip-path` back from the browser. Browsers canonicalize
inset values, which can make GSAP associate a rounded-corner value with the
wrong inset when the start state is inferred. Supplying both strings to
`fromTo()` avoids that ambiguity.

Only `clip-path` changes during the scrub. The script does not write transform,
width, height, positioning, or any other layout property. The timeline uses one
ScrollTrigger on the section with `start: "top top"`, `end: "bottom bottom"`,
and an `ease: "none"` tween.

Measurements are rebuilt after a debounced width change so breakpoint changes
to the frame or sizing box are reflected. Height-only viewport changes are
ignored. Under `prefers-reduced-motion: reduce`, no ScrollTrigger is created and
the frame is set directly to the fully revealed state.

## Webflow contract

| Attribute | Where it goes |
| --- | --- |
| `data-clip-reveal-init` | Scope root and ScrollTrigger range. Every root initializes independently. On Home: `.section_image-breaker`. |
| `data-clip-reveal-target` | The frame whose `clip-path` animates. One per root. |
| `data-clip-reveal-from` | Optional invisible sizing box. Its rect and computed top-left radius define the starting clip. |
| `data-clip-reveal-scrub` | Optional ScrollTrigger `scrub` value; defaults to `0.25`. |

A root with no target is skipped silently. If the sizing box is absent, the
component falls back to the pixel equivalent of `inset(25% 25% 25% 25% round
0px)`, calculated from the target's measured width and height.

## The Home page build

```text
section.section_image-breaker           [data-clip-reveal-init]
  .image-breaker_sticky
    .image-breaker_frame                [data-clip-reveal-target]
      img.image-breaker_image
    .image-breaker_start                [data-clip-reveal-from]
```

The sizing box is a sibling of the target and both are centred by the same
sticky wrapper. That shared coordinate space makes its bounding rect directly
usable as the target's initial visible area. `visibility: hidden` keeps the box
measurable without drawing it.

## Measurements

| Class | Desktop | <=767px |
| --- | --- | --- |
| `.section_image-breaker` | `position: relative`, `height: 200vh`, padding `0` | Same |
| `.image-breaker_sticky` | `position: sticky`, `top: 0`, `height: 100vh`, centred flex layout, `overflow: hidden` | Same |
| `.image-breaker_frame` | `width: 100%`, `aspect-ratio: 16 / 9`, `max-height: 85vh`, `overflow: hidden` | `aspect-ratio: 4 / 3` |
| `.image-breaker_start` | Absolute and centred, `width: 22rem`, `max-width: 100%`, `aspect-ratio: 4 / 3`, `border-radius: 1.5rem`, hidden and non-interactive | `width: 15rem` |
| `.image-breaker_image` | Block, `width: 100%`, `height: 100%`, `object-fit: cover` | Same |

The target can be shorter than the viewport because of its aspect ratio and
`max-height`; the flex wrapper centres it vertically. The sizing box must remain
a sibling in that same wrapper so the measured insets describe the intended
opening.

## Changing the picture

Replace `img.image-breaker_image` in the Designer. The code does not refer to
the asset or alter Webflow's `srcset`/`sizes`; responsive image selection remains
owned by the markup.

## Troubleshooting

**The image scrolls away instead of staying put.** Confirm
`.image-breaker_sticky` is `position: sticky; top: 0; height: 100vh`, the section
is `200vh`, and no ancestor prevents sticky positioning through incompatible
overflow or transform styles.

**The opening does not match the small box.** Confirm the sizing box and target
are siblings in the same centred sticky wrapper. The sizing box must remain
measurable (`visibility: hidden`, not `display: none`) and its radius must be on
`border-top-left-radius` through the shared `border-radius` declaration.

**The reveal starts or ends at the wrong scroll positions.** The trigger is the
`[data-clip-reveal-init]` section and runs from section top at viewport top to
section bottom at viewport bottom. Check that the attribute is on the `200vh`
section rather than the sticky wrapper.

**The reveal uses the wrong values after crossing a breakpoint.** Confirm the
viewport width actually changed. The component ignores height-only resize
events but rebuilds 150ms after the final width change.

**Nothing animates.** Check that the target is inside the same
`[data-clip-reveal-init]` root, reduced motion is not enabled, and the section
has enough height to create a non-zero `"top top"` to `"bottom bottom"` range.

**Old movement or inline sizing remains.** The current component writes only an
inline `clip-path`. Inline transform, width, or height indicates an outdated
bundle or another animation targeting the frame.

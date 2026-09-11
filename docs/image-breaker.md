# Image breaker (`flipScale.js`)

The image that closes the CEO's Foreword. It starts as a small framed picture at
the end of the letter and grows into a full-width band before the Explore links,
scrubbed to scroll position.

The section is a visual break after a long read, so the motion is the point: the
picture appears to travel up the page with the reader and open out.

## How it works

The script measures every waypoint, then gives the target one fixed base box: the
widest waypoint's width at the first waypoint's aspect ratio. During the scrub it
only changes a uniform `transform` (translation and scale) and a
`clip-path: inset(...)`. The transform places the target at each waypoint while
the inset reveals the waypoint's height from the vertical centre of the same
`object-fit: cover` crop. The photo is never stretched, and its layout width and
height do not change from frame to frame.

The target's CSS corner radius is read before setup. The CSS radius is then
disabled inline so it cannot double-clip: the clip path starts with the same
visual radius and reaches zero at the full-width waypoint.

The trick that makes it read as travel rather than a jump: each hop's tween
duration is the **pixel distance between the two waypoint centres**, the ease is
`none`, and the ScrollTrigger runs from the first waypoint's centre to the last
waypoint's centre. Scrolled distance and travelled distance are then the same
number, so the target tracks the page.

Because the durations are pixel measurements, the timeline is rebuilt on width
changes (debounced), not just refreshed.

If the target contains an image with `srcset`, the component also owns its
`sizes` value. It uses the last waypoint's measured width (`100vw` when that
waypoint spans the viewport), so the browser can select a source candidate for
the full-width frame rather than the small starting frame.

## Webflow contract

| Attribute | Where it goes |
| --- | --- |
| `data-flip-scale-init` | The scope root that contains every waypoint. On the Home page: `.section_wrapper.is-1`. |
| `data-flip-scale-wrapper` | A waypoint box. Two or more, used in document order. |
| `data-flip-scale-target` | The element that moves and scales. Must be inside the first waypoint. |
| `data-flip-scale-scrub` | Optional. ScrollTrigger `scrub` value; defaults to `0.25`. |

A root with fewer than two waypoints, or with no target, is skipped silently —
an unfinished section in the Designer does not throw.

Under `prefers-reduced-motion: reduce` there is no ScrollTrigger at all: the
target is placed in the last waypoint state directly, with square corners.

## The Home page build

Inside `.section_wrapper.is-1` (which carries `data-flip-scale-init`):

```
section.section_sticky-picture              the foreword; overflow: clip
section.section_image-breaker
  ├ .padding-global › .container-large
  │   └ .image-breaker_start                [data-flip-scale-wrapper]  ← start
  │       └ .image-breaker_target           [data-flip-scale-target]
  │           └ img.image-breaker_image
  └ .image-breaker_frame                    [data-flip-scale-wrapper]  ← end
section.section_explore-links
```

Both waypoints live in `.section_image-breaker`, and that placement is
load-bearing rather than tidy-minded. `.section_sticky-picture` is
`overflow: clip` — the arc above the foreword depends on it — so a target that
starts inside that section is clipped out of sight the moment it travels below
the section box. The geometry stays perfectly correct while nothing is drawn,
which is a hard failure to read from the numbers. Keep the whole animation in an
unclipped section.

The start box reads as "the picture at the end of the letter" because the
breaker section follows the foreword immediately and the box is centred in the
same `container-large` the letter uses.

Measurements:

| Class | Desktop | ≤767px |
| --- | --- | --- |
| `.image-breaker_start` | `22rem`, `aspect-ratio: 4 / 3`, `margin-bottom: 12rem` | `15rem`, `margin-bottom: 7rem` |
| `.image-breaker_frame` | `100%`, `aspect-ratio: 16 / 9`, `max-height: 85vh` | `aspect-ratio: 4 / 3` |
| `.section_image-breaker` | `6rem` padding top and bottom | `4rem` |

`.image-breaker_start`'s bottom margin is what sets the scrub length: the
timeline runs centre to centre, so a bigger gap means a longer, slower reveal.
At 1440 the current numbers give roughly 700px of scrub.

`.image-breaker_target` is `position: absolute; inset: 0` with `overflow: hidden`
and a `1.5rem` radius, so the transform has a box to clip to. The start box must
stay `position: relative` — the target is positioned against it.

## Changing the picture

Replace the image on `img.image-breaker_image` in the Designer. Nothing
in the code refers to the asset. Use something wide: the end waypoint is 16:9 on
desktop and the image is `object-fit: cover`. Keep Webflow's generated `srcset`;
the component overrides `sizes` at runtime with the measured final width.

## Troubleshooting

**The picture jumps instead of travelling.** The two waypoints are too close, or
something between them has an animation that changes page height mid-scrub.
Scrolled distance has to match centre-to-centre distance.

**Everything measures correctly but nothing is visible.** An ancestor is
clipping. Walk up from the target and look for a non-`visible` `overflow`:

```js
let el = document.querySelector("[data-flip-scale-target]").parentElement;
while (el) { const o = getComputedStyle(el).overflow;
  if (o !== "visible") console.log(el.className, o); el = el.parentElement; }
```

This is exactly what `.section_sticky-picture` did to the first build of this
section. Move the waypoints into an unclipped section rather than removing the
clip — the arc needs it.

**It lands off the frame.** Something re-laid-out after init without a resize —
a late-loading font or image inside the section. Force a `ScrollTrigger.refresh()`
once that content settles.

**The image shakes or shimmers while opening.** Inspect the target's inline
styles during continuous scroll. `width` and `height` should remain constant;
only `transform` and `clip-path` should change. If layout dimensions change, an
old bundle that still uses `Flip.fit()` is running.

**The full-width image looks soft.** Inspect the inner image's `sizes` and
`currentSrc`. `sizes` should be the measured last-waypoint width, or `100vw` for
a viewport-wide frame. If it still describes the small start box, confirm the
current bundle initialized this component after the `srcset` markup was present.

**Nothing moves.** Check the target is a descendant of the *first* waypoint in
document order, and that both waypoints are inside the same
`[data-flip-scale-init]` root.

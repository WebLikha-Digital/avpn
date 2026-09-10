# Image breaker (`flipScale.js`)

The image that closes the CEO's Foreword. It starts as a small framed picture at
the end of the letter and grows into a full-width band before the Explore links,
scrubbed to scroll position.

The section is a visual break after a long read, so the motion is the point: the
picture appears to travel up the page with the reader and open out.

## How it works

GSAP's Flip plugin, not a scale tween. `Flip.fit()` measures the *next* waypoint
box and writes the transform that lands the target exactly on it, so the end
state is the real layout box at every viewport instead of a scale factor that has
to be re-tuned per breakpoint.

The trick that makes it read as travel rather than a jump: each hop's tween
duration is the **pixel distance between the two waypoint centres**, the ease is
`none`, and the ScrollTrigger runs from the first waypoint's centre to the last
waypoint's centre. Scrolled distance and travelled distance are then the same
number, so the target tracks the page.

Because the durations are pixel measurements, the timeline is rebuilt on width
changes (debounced), not just refreshed.

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
target is fitted straight to the last waypoint and stays there.

## The Home page build

Inside `.section_wrapper.is-1` (which carries `data-flip-scale-init`):

```
section.section_sticky-picture
  └ .padding-global.z-index-2 › .container-large
      ├ .sticky-picture_component            the foreword itself
      └ .sticky-picture_breaker              [data-flip-scale-wrapper]  ← start
          └ .sticky-picture_breaker-target   [data-flip-scale-target]
              └ img.sticky-picture_breaker-image
section.section_image-breaker
  └ .image-breaker_frame                     [data-flip-scale-wrapper]  ← end
section.section_explore-links
```

`.image-breaker_frame` is empty by design. It is a measuring box, not a
container — the picture that lands in it lives in the start waypoint.

Measurements:

| Class | Desktop | ≤767px |
| --- | --- | --- |
| `.sticky-picture_breaker` | `22rem`, `aspect-ratio: 4 / 3` | `15rem` |
| `.image-breaker_frame` | `100%`, `aspect-ratio: 16 / 9`, `max-height: 85vh` | `aspect-ratio: 4 / 3` |

`.sticky-picture_breaker-target` is `position: absolute; inset: 0` with
`overflow: hidden` and a `1.5rem` radius, so the transform has a box to clip to.
The start waypoint must stay `position: relative` — the target is positioned
against it.

## Changing the picture

Replace the image on `img.sticky-picture_breaker-image` in the Designer. Nothing
in the code refers to the asset. Use something wide: the end waypoint is 16:9 on
desktop and the image is `object-fit: cover`.

## Troubleshooting

**The picture jumps instead of travelling.** The two waypoints are too close, or
something between them has an animation that changes page height mid-scrub.
Scrolled distance has to match centre-to-centre distance.

**It lands off the frame.** Something re-laid-out after init without a resize —
a late-loading font or image inside the section. Force a `ScrollTrigger.refresh()`
once that content settles.

**Nothing moves.** Check the target is a descendant of the *first* waypoint in
document order, and that both waypoints are inside the same
`[data-flip-scale-init]` root.

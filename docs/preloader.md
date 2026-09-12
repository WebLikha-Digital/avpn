# Home page preloader

The preloader is a repository-owned animation keyed entirely by the Webflow
attributes below. Webflow keeps the overlay as the first body child and places
the hero targets, reveal items, media mount, and tunnel image manifest in the
hero.

## Webflow contract

- `[data-preloader-init]` is the overlay container.
- `[data-preloader-bg]` and `[data-preloader-counter]` are its background and
  counter.
- Each `[data-preloader-year="2025|2026"]` has a matching
  `[data-preloader-target="2025|2026"]` in the hero.
- `[data-preloader-reveal]` marks hero content revealed in DOM order.
- `[data-preloader-media]` marks the hero media whose opacity is revealed last.
- `[data-tunnel2-images] img` are individual loading milestones.

For now, the preloader plays on every page load: the Webflow page head sets
`html.is-preloading` unconditionally before first paint (the `index.html`
sandbox only does so with `?preloader=1`, so other specs are unaffected). A
12-second head-script failsafe removes the class; the animation tolerates that
and never adds it back.

## Timing

The displayed counter is a plain integer from 0 through 100. It follows the
lesser of real progress and a 2-second time curve, smoothed each frame by
`shown += 0.09 * (target - shown)`. Real progress
consists of `document.fonts.ready`, `window.load`, and each tunnel image. It is
capped at 95% until all milestones finish. The loader waits for both those
milestones and two seconds, or eight seconds maximum, then eases the counter to
100 over one second.

Before that loop, the years and counter enter from `y: "60vh"` to `y: 0` over
1.2 seconds with `power1.out`; the tween is exposed as `instance.entrance` and
is complete before FLIP measurement. The exit timeline fades the counter (0.4s) and background (0.6s), moves each
year copy to its hero target over one second, starts hero reveals 0.15s before
the FLIP ends with 0.1s stagger, and fades media over 1.2s from that same point.
At the year swap frame, targets become visible and copies are hidden. Immediately
before playback, the component dispatches `preloader:exit` with the paused GSAP
timeline in `event.detail.timeline`; this provides a deterministic inspection
and synchronization point for integration tests.

The tunables are the timing constants at the top of `src/animations/preloader.js`
and the CSS custom properties `--preloader-year-width` and `--preloader-gap`.

## Completion and reduced motion

Completion removes `is-preloading`, hides the overlay, restarts Lenis, refreshes
ScrollTrigger, and dispatches `preloader:complete`. Reduced-motion users skip
all counter and tween work and go directly to that final state.

The component sets the overlay's inline `display` to `flex` as soon as valid
markup is found. This keeps it present if the head gate's 12-second failsafe
removes `is-preloading` while the bundle is initializing or the exit timeline
is running; completion changes the inline display to `none`.

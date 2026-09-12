# Home page preloader

The preloader is a repository-owned animation keyed entirely by the Webflow
attributes below. Webflow keeps the overlay as the first body child and places
the hero targets, reveal items, media mount, and tunnel image manifest in the
hero.

## Webflow contract

- `[data-preloader-init]` is the overlay container.
- `[data-preloader-bg]`, `[data-preloader-shape]`, and
  `[data-preloader-counter]` are its background, white disc, and counter. The
  counter keeps `aria-hidden="true"` and is built into three odometer masks at
  initialization.
- Each year declares `data-preloader-corner="tl|tr|br|bl"`. 2025 starts at
  `br` and 2026 starts at `tl`; each year moves clockwise at 70 and 85:

  | Step | 2025 | 2026 |
  | --- | --- | --- |
  | start | `br` | `tl` |
  | 70 | `bl` | `tr` |
  | 85 | `tl` | `br` |
  | 100 (beginExit) | force `tl`, then FLIP | force `br`, then FLIP |

  The 70 move is horizontal and the 85 move is vertical. Each move lasts 1s
  with `power3.inOut` easing and ends at identity transform. Each threshold is
  a nested timeline whose measurement callback sets the corner and initial
  transform before its year and shape tweens run. Moves are queued while
  progress advances but only play after the entrance completes.
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

The displayed counter runs from 0 through 100. It follows the
lesser of real progress and a 2-second time curve, smoothed each frame by
`shown += 0.09 * (target - shown)`. Each integer is rendered by three rolling
digit columns containing two cycles of 0–9. Digits always roll forward, with a
right-to-left 0.04s stagger and 0.35s `power3.out` motion. Leading tens and
hundreds columns grow from zero width at 10 and 100 respectively over 0.4s.
Real progress
consists of `document.fonts.ready`, `window.load`, and each tunnel image. It is
capped at 95% until all milestones finish. The loader waits for both those
milestones and two seconds, or eight seconds maximum, then eases the counter to
100 over one second.

The white disc starts square. Its morphs are synchronized with the year moves:
the 70 step morphs it to a circle and the 85 step morphs it to a leaf. Each
year move and synchronized morph lasts 1s with `power3.inOut` easing. At exit,
the disc morphs to a quarter (`100% 0% 0% 0%`) over 1s alongside the exit fade.
The step tweens are cleaned up on instance teardown. Reduced-motion users skip
all morph work.

The years and counter enter from `y: "60vh"` to `y: 0` over
1.2 seconds with `power1.out`; the tween is exposed as `instance.entrance` and
starts on the next animation frame after initialization has returned, so the
entrance cannot be stalled by the page's other startup work. It is complete
before FLIP measurement. The exit timeline fades the counter (0.4s) and background (0.6s), moves each
year copy to its hero target over one second, starts hero reveals 0.15s before
the FLIP ends with 0.1s stagger, and fades media over 1.2s from that same point.
At the year swap frame, targets become visible and copies are hidden. Immediately
before playback, the component dispatches `preloader:exit` with the paused GSAP
timeline in `event.detail.timeline`; this provides a deterministic inspection
and synchronization point for integration tests.

FLIP measures the inner SVG of each year copy and hero target, falling back to the
element when no SVG exists. Width synchronization also uses the target SVG width.
The resulting uniform scale is based on SVG widths, so the SVG viewBox preserves
the glyph height and the inline baseline space in the target wrapper does not
introduce a vertical stretch.

The tunables are the timing constants at the top of `src/animations/preloader.js`,
`STEP_THRESHOLDS = [70, 85]`, and the CSS custom properties
`--preloader-year-width`, `--preloader-inset`, `--preloader-shape-size`, and
`--preloader-bg`.

`--preloader-year-width` remains the no-JavaScript fallback. When the bundle runs,
each year copy's inline width is overridden with the measured width of its matching
hero target before entrance, and re-applied after width changes while the preloader
is active. A zero-width target is ignored and measured once again on the next frame,
so the fallback width is never replaced with zero.

## Completion and reduced motion

The white disc fades with the background over 0.6s. Completion removes
`is-preloading`, hides the overlay, restarts Lenis, refreshes
ScrollTrigger, and dispatches `preloader:complete`. Reduced-motion users skip
all counter and tween work and go directly to that final state.

The component sets the overlay's inline `display` to `flex` as soon as valid
markup is found. This keeps it present if the head gate's 12-second failsafe
removes `is-preloading` while the bundle is initializing or the exit timeline
is running; completion changes the inline display to `none`.

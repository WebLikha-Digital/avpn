# Home page hero entrance

The hero entrance reveals the Home page hero once on load without the retired
preloader overlay, counter, year FLIP, scroll lock, or loading gate. It reuses
only the preloader exit's hero-content and media reveal values.

## Webflow contract

- `[data-hero-entrance]` marks the hero root (`.section_hero`).
- `[data-preloader-target]` marks the two year SVG wrappers.
- `[data-preloader-reveal]` marks the tagline, shapes, and paragraph in DOM order.
- `[data-preloader-media]` marks the hero background (`.hero_bg`).

The component queries the targets, reveals, and media document-wide, while the
root is the per-instance lifecycle and idempotence boundary.

## Timing

| Element | Start | End | Duration | Easing |
| --- | ---: | ---: | ---: | --- |
| Year targets (`opacity: 0 → 1`, `y: 2em → 0`) | 0s | 1s | 1s | `power4.inOut` |
| Reveal items | 0.85s + index × 0.1s | start + 0.8s | 0.8s | `power4.inOut` |
| Hero media | 0.85s | 2.05s | 1.2s | `sine.out` |

Playback starts on the next animation frame after initialization returns. On
completion, all hooks are set to their final state, `is-hero-entering` is
removed from `<html>`, `ScrollTrigger.refresh()` runs, and the window receives
`hero-entrance:complete`.

## Head gate and reduced motion

Webflow's page head adds `is-hero-entering` before first paint and removes it
after six seconds as a failsafe. Its CSS hides the three hook groups while the
class is present. The component also writes inline starting opacity before
playback, so a failsafe removal cannot flash the elements and the animation
still works if the class is already absent.

Users with `prefers-reduced-motion: reduce` skip the tweens and receive the
completed state immediately, including the completion event.

## Relation to the preloader

`src/animations/preloader.js` is retired and remains untouched. The hero
entrance copies the reveal phase from its `beginExit` timeline, specifically the
`power4.inOut` content stagger and `sine.out` media fade, but does not import or
depend on the preloader.

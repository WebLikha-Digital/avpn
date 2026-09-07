import { gsap } from "../lib/gsap.js";
import { horizontalScrollerFor } from "./horizontalScroller.js";

// A speed of 1 would move the element exactly as far as the track, which is
// what sitting inside the track already does — so anything at or above 1 is a
// mistake in the Designer rather than a valid setting, and is clamped.
const DEFAULT_SPEED = 0.35;
const MAX_SPEED = 0.95;

/**
 * An element that drifts sideways as a horizontal band scrolls, at its own
 * fraction of the band's speed.
 *
 * The element must sit OUTSIDE [data-hscroll-viewport] — inside the band, but
 * not inside its scroll container. That is the whole trick, and the one thing
 * easy to get wrong: `scrollLeft` moves everything the scroller contains, not
 * just the track, so an element placed beside the track still travels the full
 * distance and this tween would stack on top of it — `speed: 0.35` would mean
 * 1.35× the track, the opposite of what it reads as. `position: absolute` does
 * not exempt it; an absolutely positioned child of a scroll container is
 * positioned against the scrolled content, so it scrolls too.
 *
 * Put it in the sticky stage that holds the viewport instead. Then it is
 * stationary by default, this translates it by `distance × speed`, and the
 * difference against the track's full `distance` reads as parallax.
 *
 * Webflow contract:
 *   [data-hparallax]         the drifting element; a sibling of the viewport,
 *                            inside the same [data-hscroll-init]
 *   [data-hparallax-speed]   0–0.95, default 0.35. Lower drifts less.
 *
 * Required CSS — the element must not take part in the stage's layout:
 *
 *   [data-hparallax] { position: absolute; white-space: nowrap; }
 *
 * Outside an active band the element is left alone: below
 * [data-hscroll-min-width] there is no scroller to read, and a drift with
 * nothing to drift against would just push the text off screen.
 */
export function initHorizontalParallax() {
  document.querySelectorAll("[data-hparallax]").forEach((el) => {
    // Idempotent re-init: a resize rebuilds the band under us, so the previous
    // tween is measuring against a scroller that no longer exists.
    teardown(el);

    const viewport = horizontalScrollerFor(el);
    if (!viewport) return;

    // Inside the scroller the element already moves with the track, so the
    // tween would compound rather than lag. Rather than animate the wrong
    // thing quietly, say so and leave it alone — the fix is a move in the
    // Designer, not a different speed.
    if (viewport.contains(el)) {
      console.warn(
        "[hparallax] element is inside [data-hscroll-viewport], so it already " +
          "scrolls with the track; move it beside the viewport.",
        el
      );
      return;
    }

    const track = viewport.querySelector("[data-hscroll-track]");
    if (!track) return;

    const speed = resolveSpeed(el);

    // Read as functions so a refresh re-measures instead of baking in widths
    // from before the fonts and images settled.
    const distance = () =>
      Math.max(0, track.scrollWidth - viewport.clientWidth) * speed;

    el._horizontalParallax = gsap.fromTo(
      el,
      { x: 0 },
      {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: track,
          scroller: viewport,
          horizontal: true,
          start: "left left",
          end: () => `+=${Math.max(1, track.scrollWidth - viewport.clientWidth)}`,
          scrub: true,
          invalidateOnRefresh: true,
        },
      }
    );
  });
}

function resolveSpeed(el) {
  const authored = Number.parseFloat(el.getAttribute("data-hparallax-speed"));
  if (!Number.isFinite(authored) || authored <= 0) return DEFAULT_SPEED;
  return Math.min(authored, MAX_SPEED);
}

function teardown(el) {
  const previous = el._horizontalParallax;
  if (!previous) return;

  previous.scrollTrigger?.kill();
  previous.kill();
  el._horizontalParallax = null;
  gsap.set(el, { clearProps: "x" });
}

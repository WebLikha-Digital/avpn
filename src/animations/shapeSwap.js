import { gsap, ScrollTrigger } from "../lib/gsap.js";
import { bandContext } from "./horizontalScroller.js";

const FADE_DURATION = 0.35;
// The incoming shape grows into place rather than only fading, so a swap
// between two shapes of similar weight still reads as a change.
const ENTER_SCALE = 0.8;

/**
 * One shape marker that changes as each panel of a horizontal band takes the
 * screen — a circle for the first card, a half-circle for the second, and so
 * on, in DOM order.
 *
 * Every shape exists in the DOM at once, stacked on the same point, and only
 * their opacity is animated. The alternative — rewriting a class on a single
 * div — would mean the outgoing and incoming shapes can never overlap, so the
 * change lands as a hard cut in the middle of a smooth scroll.
 *
 * The active panel is whichever one's centre is nearest the middle of the
 * band's window, recomputed from `scrollLeft` on every update. An earlier
 * version gave each panel its own trigger spanning `left center` to
 * `right center`; that leaves the gaps before the first panel and after the
 * last uncovered, so scrolling back to the top of the band left whichever
 * shape was last shown on screen. Nearest-centre has no gaps and clamps at
 * both ends for free.
 *
 * The value it produces is an index, not a scrubbed number: a fast flick past
 * two panels lands on the right shape rather than somewhere between two.
 *
 * Webflow contract:
 *   [data-shape-swap]          the stack; its children are the shapes, in the
 *                              same order as the panels
 *   [data-shape-swap-panels]   CSS selector for the panels that drive it,
 *                              resolved within the band. Defaults to
 *                              [data-hscroll-track] > *.
 *
 * Required CSS — the stacking is structural:
 *
 *   [data-shape-swap]   { position: relative; }
 *   [data-shape-swap] > * { position: absolute; inset: 0; }
 *
 * Shape count and panel count do not have to match. Shapes are indexed with a
 * modulo, so three shapes across six panels cycle, and a fourth card added in
 * the Designer needs no code change.
 */
export function initShapeSwap() {
  document.querySelectorAll("[data-shape-swap]").forEach((stack) => {
    // Idempotent re-init: a resize rebuilds the band, so the previous triggers
    // point at a scroller that has been torn down.
    teardown(stack);

    const shapes = Array.from(stack.children);
    if (shapes.length === 0) return;

    const band = bandContext(stack);
    const panels = resolvePanels(stack, band);
    if (panels.length === 0) return;

    // Below [data-hscroll-min-width] there is no band and the panels are
    // stacked vertically, so the swap would fire on scroll position alone and
    // read as noise. Show the first shape and leave it.
    if (!band) {
      shapes.forEach((shape, i) => gsap.set(shape, { autoAlpha: i === 0 ? 1 : 0 }));
      return;
    }

    let current = -1;
    const show = (index) => {
      if (index === current) return;
      current = index;

      shapes.forEach((shape, i) => {
        const isActive = i === index % shapes.length;
        gsap.to(shape, {
          autoAlpha: isActive ? 1 : 0,
          scale: isActive ? 1 : ENTER_SCALE,
          duration: FADE_DURATION,
          ease: "power2.out",
          overwrite: true,
        });
      });
    };

    const scroller = band.scroller;
    const track = scroller.querySelector("[data-hscroll-track]");

    // offsetLeft is relative to the track, which is the panels' offset parent,
    // so this stays right no matter how far the band has scrolled.
    const nearest = () => {
      const focus = scroller.scrollLeft + scroller.clientWidth / 2;
      let best = 0;
      let bestDistance = Infinity;

      panels.forEach((panel, i) => {
        const distance = Math.abs(panel.offsetLeft + panel.offsetWidth / 2 - focus);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      });

      return best;
    };

    gsap.set(shapes, { autoAlpha: 0, scale: ENTER_SCALE });

    stack._shapeSwapTriggers = [
      ScrollTrigger.create({
        trigger: track,
        start: "left left",
        end: "right right",
        ...band,
        onUpdate: () => show(nearest()),
        onRefresh: () => show(nearest()),
      }),
    ];

    show(nearest());
  });
}

/**
 * [data-shape-swap-panels] selector, scoped to the band the stack sits in so a
 * second instance elsewhere on the page can use the same selector. Falls back
 * to the track's direct children, which is what the panels are in every layout
 * the band supports.
 */
function resolvePanels(stack, band) {
  const scope = stack.closest("[data-hscroll-init]") || document;
  const selector = stack.getAttribute("data-shape-swap-panels");
  if (selector) return Array.from(scope.querySelectorAll(selector));

  const track = band?.scroller?.querySelector("[data-hscroll-track]");
  return track ? Array.from(track.children) : [];
}

function teardown(stack) {
  stack._shapeSwapTriggers?.forEach((trigger) => trigger.kill());
  stack._shapeSwapTriggers = null;
  gsap.set(stack.children, { clearProps: "opacity,visibility,scale" });
}

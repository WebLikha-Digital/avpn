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
 * Driven by onToggle rather than scrub, because this is a state change and not
 * a scrubbed value: a fast flick past two panels ends on the right shape
 * instead of somewhere between two of them, and scrolling back up reverses it
 * for free.
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

    gsap.set(shapes, { autoAlpha: 0, scale: ENTER_SCALE });

    stack._shapeSwapTriggers = panels.map((panel, i) =>
      ScrollTrigger.create({
        trigger: panel,
        // Measured against the middle of the band's window: a panel owns the
        // marker from the moment its leading edge passes the centre until the
        // next panel's does, so exactly one is ever active.
        start: "left center",
        end: "right center",
        ...band,
        onToggle: (self) => self.isActive && show(i),
      })
    );

    // Nothing has toggled yet on first paint, so seed from whichever panel is
    // already active rather than assuming the band starts at panel 0.
    const active = stack._shapeSwapTriggers.findIndex((t) => t.isActive);
    show(active === -1 ? 0 : active);
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

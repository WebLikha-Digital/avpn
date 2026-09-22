import { gsap } from "../lib/gsap.js";
import {
  bandContext,
  verticalScrollPosition,
} from "./horizontalScroller.js";

const START_CLIP = "inset(100% 0% 0% 0%)";

/**
 * Reveals images from their bottom edge upward as they scroll into view.
 *
 * Webflow contract:
 *   [data-wipe-reveal]       target image; clip-path is animated on the image
 *   [data-wipe-trigger]      optional CSS selector for the ScrollTrigger
 *                            trigger; resolves the nearest matching ancestor,
 *                            then the first match on the page, then the image
 *   [data-wipe-start]        optional ScrollTrigger start; defaults to
 *                            "clamp(top 80%)", or "clamp(left 80%)" inside
 *                            an active horizontal band
 *   [data-wipe-delay]        optional delay in seconds; defaults to 0
 *   [data-wipe-once="false"] replays the reveal on re-entry; defaults to once
 *
 * The start clip is only applied by JavaScript, so the image's resting CSS
 * state remains visible if the bundle fails to load. fromTo() supplies an
 * explicit inset() end value because an authored clip-path may otherwise be
 * "none", which is not interpolable with inset(). Inside an active horizontal
 * band, the reveal is driven by that band's scroller and horizontal axis;
 * inactive bands (such as the stacked mobile layout) keep the window-scroller
 * behaviour.
 */
export function initWipeReveal() {
  document.querySelectorAll("[data-wipe-reveal]").forEach((image) => {
    teardown(image);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const parsedDelay = Number.parseFloat(
      image.getAttribute("data-wipe-delay"),
    );
    const delay = Number.isFinite(parsedDelay) ? parsedDelay : 0;
    const trigger = resolveTrigger(image);
    // Inside a horizontal band the image never moves vertically, so the
    // default has to swap axis with it. An authored start still wins, and is
    // expected to use the band's axis when there is one.
    const band = bandContext(image);
    const authoredStart = image.getAttribute("data-wipe-start");
    const start = authoredStart
      ? band
        ? authoredStart
        : verticalScrollPosition(authoredStart)
      : band
        ? "clamp(left 80%)"
        : "clamp(top 80%)";
    const once = image.getAttribute("data-wipe-once") !== "false";

    image._wipeTween = gsap.fromTo(
      image,
      { clipPath: START_CLIP },
      {
        clipPath: "inset(0% 0% 0% 0%)",
        duration: 0.8,
        ease: "expo.out",
        delay,
        immediateRender: true,
        scrollTrigger: {
          trigger,
          start,
          once,
          ...band,
        },
      },
    );
  });
}

function resolveTrigger(image) {
  const selector = image.getAttribute("data-wipe-trigger");
  if (!selector) return image;

  return image.closest(selector) || document.querySelector(selector) || image;
}

function teardown(image) {
  const previous = image._wipeTween;
  previous?.scrollTrigger?.kill();
  previous?.kill();
  image._wipeTween = null;
  gsap.set(image, { clearProps: "clipPath" });
}

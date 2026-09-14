import { gsap } from "../lib/gsap.js";
import { bandContext } from "./horizontalScroller.js";

const DEFAULT_ORIGIN = "50% 50%";
const DEFAULT_DURATION = 0.65;

/**
 * Reveals inline brand shapes and circular photographs with the SplitText
 * heading in the same line, or with an explicitly authored trigger. The
 * authored state stays visible; gsap.from() supplies the hidden state only
 * after the bundle initializes.
 *
 * Webflow contract (all attributes live on the shape itself):
 *   [data-shape-reveal]  circle (default), quarter, half, photo, disc, or fade
 *   [data-shape-origin]  transform origin (default "50% 50%"; ignored by fade)
 *   [data-shape-pair]    left or right entry for a paired half
 *   [data-shape-trigger] optional CSS selector for the ScrollTrigger trigger;
 *                        resolves the nearest matching ancestor, then the first
 *                        page match, then the shape; bypasses heading lookup
 *   [data-shape-start]   optional ScrollTrigger start; overrides heading/default
 *   [data-shape-delay]   tween delay in seconds (default 0)
 *   [data-shape-once="false"] replays the reveal on re-entry; defaults to once
 */
export function initShapeReveal() {
  const shapes = document.querySelectorAll("[data-shape-reveal]");
  if (!shapes.length) return;

  shapes.forEach((shape) => {
    teardown(shape);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const shapeTriggerSelector = shape.getAttribute("data-shape-trigger");
    const hasExplicitTrigger = shapeTriggerSelector !== null;
    const heading = hasExplicitTrigger ? null : resolveHeading(shape);
    const band = bandContext(shape);
    const start =
      shape.getAttribute("data-shape-start") ||
      (heading && heading.getAttribute("data-split-start")) ||
      defaultStart(band);
    const once =
      shape.getAttribute("data-shape-once") !== null
        ? shape.getAttribute("data-shape-once") !== "false"
        : heading
          ? heading.getAttribute("data-split-once") !== "false"
          : true;
    const trigger = hasExplicitTrigger
      ? resolveShapeTrigger(shape)
      : heading
        ? resolveTrigger(heading)
        : shape;
    const delay = readNumber(shape, "data-shape-delay", 0);
    const preset = shape.getAttribute("data-shape-reveal");
    let originalTransformOrigin;

    if (preset !== "fade") {
      const origin = shape.getAttribute("data-shape-origin") || DEFAULT_ORIGIN;
      originalTransformOrigin = shape.style.transformOrigin;

      // Set once before gsap.from() records its destination so the chosen origin
      // remains fixed throughout the reveal instead of tweening back to 50% 50%.
      gsap.set(shape, { transformOrigin: origin });
    }

    const common = {
      delay,
      scrollTrigger: {
        trigger,
        start,
        once,
        ...band,
      },
    };

    let tween;
    if (preset === "disc") {
      tween = gsap.from(shape, {
        scale: 0.9,
        autoAlpha: 0,
        duration: 0.8,
        ease: "expo.out",
        ...common,
      });
    } else if (preset === "fade") {
      tween = gsap.from(shape, {
        autoAlpha: 0,
        duration: 0.6,
        ease: "expo.out",
        ...common,
      });
    } else if (preset === "quarter") {
      tween = gsap.from(shape, {
        scale: 0.65,
        rotation: -45,
        autoAlpha: 0,
        duration: DEFAULT_DURATION,
        ease: "expo.out",
        ...common,
      });
    } else if (preset === "half") {
      const pair = shape.getAttribute("data-shape-pair");
      const isPaired = pair === "left" || pair === "right";
      tween = gsap.from(shape, {
        xPercent: pair === "right" ? 60 : -60,
        autoAlpha: 0,
        duration: DEFAULT_DURATION,
        ease: isPaired ? "back.out(1.4)" : "expo.out",
        ...common,
      });
    } else if (preset === "photo") {
      tween = gsap.fromTo(
        shape,
        {
          clipPath: "circle(0% at 50% 50%)",
          scale: 1.1,
          autoAlpha: 0,
        },
        {
          clipPath: "circle(50% at 50% 50%)",
          scale: 1,
          autoAlpha: 1,
          duration: 0.8,
          ease: "expo.out",
          ...common,
        },
      );
    } else {
      tween = gsap.from(shape, {
        scale: 0.4,
        autoAlpha: 0,
        duration: DEFAULT_DURATION,
        ease: "expo.out",
        ...common,
      });
    }

    if (preset !== "fade") {
      tween._shapeRevealOriginalTransformOrigin = originalTransformOrigin;
    }
    shape._shapeRevealTween = tween;
  });
}

function defaultStart(band) {
  return band ? "clamp(left 80%)" : "clamp(top 80%)";
}

function readNumber(element, attribute, fallback) {
  const value = Number.parseFloat(element.getAttribute(attribute));
  return Number.isFinite(value) ? value : fallback;
}

// The first ancestor containing a split heading is the heading line. This
// deliberately works through shape wrappers without depending on their class.
function resolveHeading(shape) {
  let ancestor = shape.parentElement;
  while (ancestor) {
    const heading = ancestor.querySelector('[data-split="heading"]');
    if (heading) return heading;
    ancestor = ancestor.parentElement;
  }
  return null;
}

// Match splitReveal's nearest-ancestor-else-first-match trigger rule. Invalid
// authored selectors degrade to the heading so one instance cannot stop init.
function resolveTrigger(heading) {
  const selector = heading.getAttribute("data-split-trigger");
  if (!selector) return heading;

  try {
    return heading.closest(selector) || document.querySelector(selector) || heading;
  } catch {
    return heading;
  }
}

// Match wipeReveal's nearest-ancestor-else-first-match trigger rule. Invalid
// authored selectors degrade to the shape so one instance cannot stop init.
function resolveShapeTrigger(shape) {
  const selector = shape.getAttribute("data-shape-trigger");
  if (!selector) return shape;

  try {
    return shape.closest(selector) || document.querySelector(selector) || shape;
  } catch {
    return shape;
  }
}

function teardown(shape) {
  const tween = shape._shapeRevealTween;
  if (!tween) return;

  const originalTransformOrigin = tween._shapeRevealOriginalTransformOrigin;
  tween.scrollTrigger?.kill();
  tween.revert();
  tween.kill();
  if (originalTransformOrigin !== undefined) {
    shape.style.transformOrigin = originalTransformOrigin;
  }
  shape._shapeRevealTween = null;
}

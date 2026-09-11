import { gsap } from "../lib/gsap.js";
import { bandContext } from "./horizontalScroller.js";

const DEFAULT_ORIGIN = "50% 50%";
const DEFAULT_DURATION = 0.65;

/**
 * Reveals inline brand shapes and circular photographs with the SplitText
 * heading in the same line. The authored state stays visible; gsap.from()
 * supplies the hidden state only after the bundle initializes.
 *
 * Webflow contract (all attributes live on the shape itself):
 *   [data-shape-reveal]  circle (default), quarter, half, or photo
 *   [data-shape-origin]  transform origin (default "50% 50%")
 *   [data-shape-pair]    left or right entry for a paired half
 *   [data-shape-delay]   tween delay in seconds (default 0)
 */
export function initShapeReveal() {
  const shapes = document.querySelectorAll("[data-shape-reveal]");
  if (!shapes.length) return;

  shapes.forEach((shape) => {
    teardown(shape);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const heading = resolveHeading(shape);
    const band = bandContext(shape);
    const start = heading
      ? heading.getAttribute("data-split-start") || defaultStart(band)
      : defaultStart(band);
    const once = heading
      ? heading.getAttribute("data-split-once") !== "false"
      : true;
    const trigger = heading ? resolveTrigger(heading) : shape;
    const delay = readNumber(shape, "data-shape-delay", 0);
    const origin = shape.getAttribute("data-shape-origin") || DEFAULT_ORIGIN;
    const preset = shape.getAttribute("data-shape-reveal");
    const originalTransformOrigin = shape.style.transformOrigin;

    // Set once before gsap.from() records its destination so the chosen origin
    // remains fixed throughout the reveal instead of tweening back to 50% 50%.
    gsap.set(shape, { transformOrigin: origin });

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
    if (preset === "quarter") {
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

    tween._shapeRevealOriginalTransformOrigin = originalTransformOrigin;
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

function teardown(shape) {
  const tween = shape._shapeRevealTween;
  if (!tween) return;

  const originalTransformOrigin = tween._shapeRevealOriginalTransformOrigin;
  tween.scrollTrigger?.kill();
  tween.revert();
  tween.kill();
  shape.style.transformOrigin = originalTransformOrigin;
  shape._shapeRevealTween = null;
}

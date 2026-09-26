import { gsap } from "../lib/gsap.js";
import {
  bandContext,
  verticalScrollPosition,
} from "./horizontalScroller.js";

const DEFAULT_ORIGIN = "50% 50%";
const SWEEP_DURATION = 0.8;
const SWEEP_EASE = "power4.inOut";

/**
 * Reveals inline brand shapes and circular photographs with the SplitText
 * heading in the same line, or with an explicitly authored trigger. Sweep
 * shapes stay opaque while a conic mask supplies their hidden state.
 *
 * Webflow contract (all attributes live on the shape itself):
 *   [data-shape-reveal]  circle (default), quarter, half, photo, disc, or fade
 *   [data-shape-origin]  legacy transform origin (default "50% 50%"; ignored by fade)
 *   [data-shape-sweep]   optional conic-gradient origin, e.g. "from 0deg at 0% 100%";
 *                        paired with the preset's sweep arc
 *   [data-shape-pair]    left or right marker for a paired half (motion-neutral)
 *   [data-shape-trigger] optional CSS selector for the ScrollTrigger trigger;
 *                        resolves the nearest matching ancestor, then the first
 *                        page match, then the shape; bypasses heading lookup
 *   [data-shape-start]   optional ScrollTrigger start; overrides heading/default
 *   [data-shape-delay]   tween delay in seconds (default 0)
 *   [data-shape-once="false"] replays the reveal on re-entry; defaults to once
 *   [data-shape-scroller="window"] resolve the trigger against the window's
 *                         vertical scroll instead of an active horizontal band
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
    const band =
      shape.getAttribute("data-shape-scroller") === "window"
        ? null
        : bandContext(shape);
    const authoredStart =
      shape.getAttribute("data-shape-start") ||
      (heading && heading.getAttribute("data-split-start"));
    const start = authoredStart
      ? band
        ? authoredStart
        : verticalScrollPosition(authoredStart)
      : defaultStart(band);
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

    if (preset !== "fade" && !isSweepPreset(preset)) {
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
      tween = createSweep(shape, 90, common);
    } else if (preset === "half") {
      tween = createSweep(shape, 180, common);
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
      tween = createSweep(shape, 360, common);
    }

    if (preset !== "fade" && !isSweepPreset(preset)) {
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

function isSweepPreset(preset) {
  return !["disc", "fade", "photo"].includes(preset);
}

function createSweep(shape, arc, common) {
  const geometry = sweepGeometry(shape);
  const originalMaskImage = shape.style.maskImage;
  const originalWebkitMaskImage = shape.style.webkitMaskImage;
  const originalSweep = shape.style.getPropertyValue("--shape-sweep");
  const originalSweepPriority = shape.style.getPropertyPriority("--shape-sweep");
  const state = {
    originalMaskImage,
    originalWebkitMaskImage,
    originalSweep,
    originalSweepPriority,
  };

  shape._shapeRevealSweepState = state;
  shape.style.setProperty("--shape-sweep", "0deg");
  setSweepMask(shape, geometry.origin);

  return gsap.fromTo(
    shape,
    { "--shape-sweep": "0deg" },
    {
      "--shape-sweep": `${arc}deg`,
      duration: SWEEP_DURATION,
      ease: SWEEP_EASE,
      onStart: () => {
        setSweepMask(shape, geometry.origin);
      },
      onComplete: () => {
        shape.style.setProperty("--shape-sweep", `${arc}deg`);
        shape.style.removeProperty("mask-image");
        shape.style.removeProperty("-webkit-mask-image");
      },
      ...common,
    },
  );
}

function setSweepMask(shape, origin) {
  const value = `conic-gradient(${origin}, #000 0 var(--shape-sweep), transparent var(--shape-sweep))`;
  shape.style.setProperty("mask-image", value);
  shape.style.setProperty("-webkit-mask-image", value);
}

function sweepGeometry(shape) {
  const override = shape.getAttribute("data-shape-sweep");
  if (override) return { origin: override };

  if (shape.getAttribute("data-shape-reveal") === "quarter") {
    const corners = roundedCorners(shape);
    if (corners.topRight && !corners.topLeft && !corners.bottomRight && !corners.bottomLeft) {
      return { origin: "from 0deg at 0% 100%" };
    }
    if (corners.topLeft && !corners.topRight && !corners.bottomRight && !corners.bottomLeft) {
      return { origin: "from 270deg at 100% 100%" };
    }
    if (corners.bottomRight && !corners.topLeft && !corners.topRight && !corners.bottomLeft) {
      return { origin: "from 90deg at 0% 0%" };
    }
    if (corners.bottomLeft && !corners.topLeft && !corners.topRight && !corners.bottomRight) {
      return { origin: "from 180deg at 100% 0%" };
    }
  }

  if (shape.getAttribute("data-shape-reveal") === "half") {
    const corners = roundedCorners(shape);
    const right = corners.topRight || corners.bottomRight;
    const left = corners.topLeft || corners.bottomLeft;
    if (right && !left) return { origin: "from 0deg at 0% 50%" };
    if (left && !right) return { origin: "from 180deg at 100% 50%" };
  }

  return { origin: `from 0deg at 50% 50%` };
}

function roundedCorners(element) {
  const styles = getComputedStyle(element);
  return {
    topLeft: hasRadius(styles.borderTopLeftRadius),
    topRight: hasRadius(styles.borderTopRightRadius),
    bottomRight: hasRadius(styles.borderBottomRightRadius),
    bottomLeft: hasRadius(styles.borderBottomLeftRadius),
  };
}

function hasRadius(value) {
  return value.split(/\s+/).some((part) => {
    const number = Number.parseFloat(part);
    return Number.isFinite(number) && number !== 0;
  });
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
  if (tween) {
    const originalTransformOrigin = tween._shapeRevealOriginalTransformOrigin;
    tween.scrollTrigger?.kill();
    tween.revert();
    tween.kill();
    if (originalTransformOrigin !== undefined) {
      shape.style.transformOrigin = originalTransformOrigin;
    }
  }

  const state = shape._shapeRevealSweepState;
  if (state) {
    shape.style.maskImage = state.originalMaskImage;
    shape.style.webkitMaskImage = state.originalWebkitMaskImage;
    if (state.originalSweep) {
      shape.style.setProperty("--shape-sweep", state.originalSweep, state.originalSweepPriority);
    } else {
      shape.style.removeProperty("--shape-sweep");
    }
    shape._shapeRevealSweepState = null;
  }
  shape._shapeRevealTween = null;
}

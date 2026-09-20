import { gsap, ScrollTrigger } from "../lib/gsap.js";

gsap.registerPlugin(ScrollTrigger);

const DEFAULT_MODE = "cover";
const DEFAULT_CURVE = 12;
const DEFAULT_SCRUB = 0.3;
const DEFAULT_SCROLL_START = {
  cover: "bottom bottom",
  reveal: "top bottom",
};
const DEFAULT_SCROLL_END = {
  cover: "bottom top",
  reveal: "top top",
};
const VIEW_BOX = 100;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Draws a curved SVG edge over the end of a scrolling section.
 *
 * Webflow contract:
 *   [data-arc-scroll-transition] wrapper and init hook
 *   data-mode="cover|reveal" (default cover)
 *   data-curve percentage of wrapper width (default 12)
 *   data-scroll-start / data-scroll-end optional ScrollTrigger positions
 *   data-scrub optional scrub smoothing (default 0.3)
 *   data-arc-clip writes the arc as an inline clip-path: path() on the wrapper
 *     so its own background, such as a gradient, shows through instead of
 *     appending an SVG; the arc zone is the part above the closest section,
 *     falling back to the full wrapper height when it is not extended
 *   clip mode triggers that incoming section, defaulting to top bottom -> top top
 *   data-mode is ignored in clip mode (cover only)
 *   reduced motion keeps the static progress-0 clip
 *   page CSS should provide clip-path: inset(<zone> 0 0 0) as the pre-JS fallback
 */
export function initArcScrollTransition() {
  document.querySelectorAll("[data-arc-scroll-transition]").forEach((wrapper) => {
    teardown(wrapper);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clip = wrapper.hasAttribute("data-arc-clip");
    if (reducedMotion && !clip) {
      wrapper._arcScroll = { tween: null, shape: null, path: null };
      return;
    }

    const section = wrapper.closest("section") || wrapper.parentElement;
    if (!section) return;

    const mode = clip ? DEFAULT_MODE : getMode(wrapper);
    const { shape, path } = clip
      ? { shape: null, path: null }
      : buildShape(wrapper);
    const instance = {
      wrapper,
      section,
      mode,
      clip,
      shape,
      path,
      depth: 0,
      zone: 0,
      width: 0,
      height: 0,
      progress: 0,
      tween: null,
    };

    measureWrapper(instance);
    drawArc(instance, 0);

    if (reducedMotion) {
      wrapper._arcScroll = instance;
      return;
    }

    instance.tween = gsap.to(instance, {
      progress: 1,
      ease: "none",
      onUpdate: () => drawArc(instance, instance.progress),
      scrollTrigger: {
        trigger: section,
        start: getScrollStart(wrapper, mode, clip),
        end: getScrollEnd(wrapper, mode, clip),
        scrub: getScrub(wrapper),
        invalidateOnRefresh: true,
        onRefresh: () => {
          measureWrapper(instance);
          drawArc(instance, instance.progress);
        },
      },
    });

    wrapper._arcScroll = instance;
  });

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    ScrollTrigger.refresh();
  }
}

function getMode(wrapper) {
  return wrapper.getAttribute("data-mode") === "reveal" ? "reveal" : DEFAULT_MODE;
}

function getCurve(wrapper) {
  const value = Number.parseFloat(wrapper.getAttribute("data-curve"));
  return Number.isFinite(value) ? value : DEFAULT_CURVE;
}

function getScrollStart(wrapper, mode, clip) {
  if (clip) return wrapper.getAttribute("data-scroll-start") || "top bottom";
  return wrapper.getAttribute("data-scroll-start") || DEFAULT_SCROLL_START[mode];
}

function getScrollEnd(wrapper, mode, clip) {
  if (clip) return wrapper.getAttribute("data-scroll-end") || "top top";
  return wrapper.getAttribute("data-scroll-end") || DEFAULT_SCROLL_END[mode];
}

function getScrub(wrapper) {
  const value = Number.parseFloat(wrapper.getAttribute("data-scrub"));
  return Number.isFinite(value) ? value : DEFAULT_SCRUB;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function buildShape(wrapper) {
  const shape = document.createElementNS(SVG_NAMESPACE, "svg");
  shape.setAttribute("data-arc-scroll-shape", "");
  shape.setAttribute("viewBox", "0 0 100 100");
  shape.setAttribute("preserveAspectRatio", "none");
  shape.setAttribute("aria-hidden", "true");

  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("data-arc-scroll-path", "");
  shape.appendChild(path);
  wrapper.appendChild(shape);

  return { shape, path };
}

function measureWrapper(instance) {
  const rect = instance.wrapper.getBoundingClientRect();
  instance.width = rect.width;
  instance.height = rect.height;
  if (instance.clip) {
    const zone = Math.max(0, instance.section.getBoundingClientRect().top - rect.top);
    instance.zone = zone || rect.height;
  }
  instance.depth = rect.height
    ? instance.clip
      ? getCurve(instance.wrapper) * rect.width / 100
      : getCurve(instance.wrapper) * rect.width / rect.height
    : 0;
}

function drawArc(instance, progress) {
  if (instance.clip) {
    drawClip(instance, progress);
    return;
  }

  const fill = instance.mode === "cover" ? progress : 1 - progress;
  const curve = instance.depth * Math.sin(fill * Math.PI);

  if (instance.mode === "cover") {
    const edge = round(VIEW_BOX - VIEW_BOX * fill);
    const control = round(edge - curve * 2);
    instance.path.setAttribute(
      "d",
      `M0 100 L0 ${edge} Q50 ${control} 100 ${edge} L100 100 Z`,
    );
    return;
  }

  const edge = round(VIEW_BOX * fill);
  const control = round(edge + curve * 2);
  instance.path.setAttribute(
    "d",
    `M0 0 L0 ${edge} Q50 ${control} 100 ${edge} L100 0 Z`,
  );
}

function drawClip(instance, progress) {
  const edge = round(instance.zone * (1 - progress));
  const curve = instance.depth * Math.sin(progress * Math.PI);
  const control = round(edge - curve * 2);
  const path = `M0 ${round(instance.height)} L0 ${edge} Q${round(instance.width / 2)} ${control} ${round(instance.width)} ${edge} L${round(instance.width)} ${round(instance.height)} Z`;
  instance.wrapper.style.clipPath = `path("${path}")`;
}

function teardown(wrapper) {
  const previous = wrapper._arcScroll;
  previous?.tween?.scrollTrigger?.kill();
  previous?.tween?.kill();
  wrapper.style.removeProperty("clip-path");
  wrapper._arcScroll = null;
  wrapper.querySelectorAll("[data-arc-scroll-shape]").forEach((shape) => shape.remove());
}

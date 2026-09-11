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
 */
export function initArcScrollTransition() {
  document.querySelectorAll("[data-arc-scroll-transition]").forEach((wrapper) => {
    teardown(wrapper);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      wrapper._arcScroll = { tween: null, shape: null, path: null };
      return;
    }

    const section = wrapper.closest("section") || wrapper.parentElement;
    if (!section) return;

    const mode = getMode(wrapper);
    const { shape, path } = buildShape(wrapper);
    const instance = {
      wrapper,
      section,
      mode,
      shape,
      path,
      depth: 0,
      progress: 0,
      tween: null,
    };

    measureWrapper(instance);
    drawArc(instance, 0);

    instance.tween = gsap.to(instance, {
      progress: 1,
      ease: "none",
      onUpdate: () => drawArc(instance, instance.progress),
      scrollTrigger: {
        trigger: section,
        start: getScrollStart(wrapper, mode),
        end: getScrollEnd(wrapper, mode),
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

function getScrollStart(wrapper, mode) {
  return wrapper.getAttribute("data-scroll-start") || DEFAULT_SCROLL_START[mode];
}

function getScrollEnd(wrapper, mode) {
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
  instance.depth = rect.height
    ? getCurve(instance.wrapper) * rect.width / rect.height
    : 0;
}

function drawArc(instance, progress) {
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

function teardown(wrapper) {
  const previous = wrapper._arcScroll;
  previous?.tween?.scrollTrigger?.kill();
  previous?.tween?.kill();
  wrapper._arcScroll = null;
  wrapper.querySelectorAll("[data-arc-scroll-shape]").forEach((shape) => shape.remove());
}

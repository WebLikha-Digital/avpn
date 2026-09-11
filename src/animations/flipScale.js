import { gsap } from "../lib/gsap.js";

const DEFAULT_SCRUB = 0.25;
const RESIZE_DEBOUNCE = 150;
const VIEWPORT_EDGE_TOLERANCE = 1;

/**
 * Moves and uniformly scales one element through a series of waypoint boxes as
 * the page scrolls. Clip-path changes the visible aspect without changing the
 * target's layout dimensions or distorting its image.
 *
 * Webflow contract:
 *   [data-flip-scale-init]     scope root; every root initializes independently
 *   [data-flip-scale-wrapper]  waypoint box; two or more, in document order
 *   [data-flip-scale-target]   target; must be inside the first waypoint
 *   [data-flip-scale-scrub]    optional scrub smoothing; defaults to 0.25
 */
export function initFlipScale() {
  document.querySelectorAll("[data-flip-scale-init]").forEach((root) => {
    teardown(root);

    const wrappers = [...root.querySelectorAll("[data-flip-scale-wrapper]")];
    const firstWrapper = wrappers[0];
    const target = firstWrapper?.querySelector("[data-flip-scale-target]");

    if (wrappers.length < 2 || !target) return;

    const boxes = wrappers.map(measureBox);
    const firstBox = boxes[0];
    const lastBox = boxes.at(-1);
    const baseWidth = Math.max(...boxes.map(({ width }) => width));
    const baseHeight = baseWidth * (firstBox.height / firstBox.width);
    const startRadius = parseFloat(
      window.getComputedStyle(target).borderTopLeftRadius
    ) || 0;
    const states = boxes.map((box, index) => {
      const scale = box.width / baseWidth;
      const insetY = Math.max(0, (baseHeight - box.height / scale) / 2);
      const visualRadius = startRadius * (1 - index / (boxes.length - 1));

      return {
        x: box.left - firstBox.left,
        y: box.top - firstBox.top - insetY * scale,
        scale,
        clipPath: insetClip(insetY, visualRadius / scale),
      };
    });

    setResponsiveImageSize(root, target, lastBox);
    gsap.set(target, {
      position: "absolute",
      top: 0,
      left: 0,
      width: baseWidth,
      height: baseHeight,
      transformOrigin: "0 0",
      borderRadius: 0,
      ...states[0],
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root._flipScaleTimeline = gsap.set(target, states.at(-1));
      return;
    }

    const scrubValue = parseFloat(root.getAttribute("data-flip-scale-scrub"));
    const scrub = Number.isFinite(scrubValue) ? scrubValue : DEFAULT_SCRUB;
    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: firstWrapper,
        start: "center center",
        endTrigger: wrappers.at(-1),
        end: "center center",
        scrub,
      },
    });

    states.slice(1).forEach((state, index) => {
      const duration = Math.abs(boxes[index + 1].center - boxes[index].center);
      timeline.fromTo(target, states[index], {
        ...state,
        duration,
        ease: "none",
        immediateRender: false,
      });
    });

    root._flipScaleTimeline = timeline;
  });

  installResizeListener();
}

function measureBox(element) {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
    center: rect.top + window.pageYOffset + rect.height / 2,
  };
}

function insetClip(insetY, radius) {
  return `inset(${insetY}px 0px ${insetY}px 0px round ${radius}px)`;
}

function setResponsiveImageSize(root, target, lastBox) {
  const image = target.querySelector("img[srcset]");
  if (!image) return;

  root._flipScaleSizes = {
    image,
    value: image.getAttribute("sizes"),
  };

  const spansViewport =
    Math.abs(lastBox.left) <= VIEWPORT_EDGE_TOLERANCE &&
    Math.abs(lastBox.right - window.innerWidth) <= VIEWPORT_EDGE_TOLERANCE;
  image.sizes = spansViewport ? "100vw" : `${Math.round(lastBox.width)}px`;
}

function teardown(root) {
  const previous = root._flipScaleTimeline;
  previous?.scrollTrigger?.kill();
  previous?.kill();
  root._flipScaleTimeline = null;

  const target = root.querySelector("[data-flip-scale-target]");
  if (target) {
    gsap.set(target, {
      clearProps: "transform,width,height,clipPath,borderRadius",
    });
  }

  const sizes = root._flipScaleSizes;
  if (sizes) {
    if (sizes.value === null) sizes.image.removeAttribute("sizes");
    else sizes.image.setAttribute("sizes", sizes.value);
    root._flipScaleSizes = null;
  }
}

function installResizeListener() {
  window.removeEventListener("resize", initFlipScale._resize);
  clearTimeout(initFlipScale._resizeTimer);

  let width = window.innerWidth;
  initFlipScale._resize = () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;

    clearTimeout(initFlipScale._resizeTimer);
    initFlipScale._resizeTimer = setTimeout(initFlipScale, RESIZE_DEBOUNCE);
  };

  window.addEventListener("resize", initFlipScale._resize);
}

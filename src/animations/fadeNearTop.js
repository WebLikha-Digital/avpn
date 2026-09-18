import { gsap } from "../lib/gsap.js";

const DEFAULT_START = "top 35%";
const DEFAULT_END = "top 15%";
const DEFAULT_MIN_WIDTH = 992;

/**
 * Fades marked elements out as they travel toward the top of the viewport.
 *
 * Webflow contract:
 *   [data-fade-top]             element to fade; it is also the trigger by default
 *   [data-fade-top-trigger]     optional selector for a different ScrollTrigger trigger
 *   [data-fade-top-start]       optional ScrollTrigger start
 *   [data-fade-top-end]         optional ScrollTrigger end
 *   [data-fade-top-min-width]   minimum viewport width in px; default 992
 *
 * Only opacity is animated so this can coexist with split text transforms and
 * image wipe reveals on the same element.
 */
export function initFadeNearTop() {
  const elements = [...document.querySelectorAll("[data-fade-top]")];
  elements.forEach(teardown);

  elements.forEach((el) => {
    if (window.innerWidth < resolveMinWidth(el)) return;

    el._fadeNearTop = gsap.fromTo(
      el,
      { opacity: 1 },
      {
        opacity: 0,
        ease: "none",
        scrollTrigger: {
          trigger: resolveTrigger(el),
          start: el.getAttribute("data-fade-top-start") || DEFAULT_START,
          end: el.getAttribute("data-fade-top-end") || DEFAULT_END,
          scrub: true,
        },
      },
    );
  });

  installResizeListener();
}

function resolveTrigger(el) {
  const selector = el.getAttribute("data-fade-top-trigger");
  if (selector) {
    try {
      return el.closest(selector) || document.querySelector(selector) || el;
    } catch {
      return el;
    }
  }

  return el;
}

function resolveMinWidth(el) {
  const authored = Number.parseFloat(el.getAttribute("data-fade-top-min-width"));
  return Number.isFinite(authored) ? authored : DEFAULT_MIN_WIDTH;
}

function teardown(el) {
  const previous = el._fadeNearTop;
  previous?.scrollTrigger?.kill();
  previous?.kill();
  el._fadeNearTop = null;
  gsap.set(el, { clearProps: "opacity" });
}

function installResizeListener() {
  window.removeEventListener("resize", initFadeNearTop._resize);
  clearTimeout(initFadeNearTop._resizeTimer);

  let width = window.innerWidth;
  initFadeNearTop._resize = () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;

    clearTimeout(initFadeNearTop._resizeTimer);
    initFadeNearTop._resizeTimer = setTimeout(initFadeNearTop, 150);
  };

  window.addEventListener("resize", initFadeNearTop._resize);
}

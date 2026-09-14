import { gsap } from "../lib/gsap.js";

const DEFAULT_AMOUNT = 0.06;
const MAX_AMOUNT = 0.5;
const DEFAULT_MIN_WIDTH = 768;

/**
 * Drifts an element vertically inside an overflow-hidden frame while its
 * trigger travels through the viewport.
 *
 * Webflow contract:
 *   [data-parallax]             element to move
 *   [data-parallax-amount]      fraction of the element height; default 0.06
 *   [data-parallax-trigger]     optional trigger selector
 *   [data-parallax-min-width]   minimum viewport width in px; default 768
 */
export function initScrollParallax() {
  const elements = [...document.querySelectorAll("[data-parallax]")];
  elements.forEach(teardown);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    installResizeListener();
    return;
  }

  elements.forEach((el) => {
    if (window.innerWidth < resolveMinWidth(el)) return;

    const amount = resolveAmount(el);
    const trigger = resolveTrigger(el);

    gsap.set(el, {
      scale: 1 + 2 * amount,
      transformOrigin: "50% 50%",
    });

    el._scrollParallax = gsap.fromTo(
      el,
      { yPercent: -amount * 100 },
      {
        yPercent: amount * 100,
        ease: "none",
        scrollTrigger: {
          trigger,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      },
    );
  });

  installResizeListener();
}

function resolveAmount(el) {
  const authored = Number.parseFloat(el.getAttribute("data-parallax-amount"));
  if (!Number.isFinite(authored)) return DEFAULT_AMOUNT;
  return Math.min(MAX_AMOUNT, Math.max(0, authored));
}

function resolveMinWidth(el) {
  const authored = Number.parseFloat(
    el.getAttribute("data-parallax-min-width"),
  );
  return Number.isFinite(authored) ? authored : DEFAULT_MIN_WIDTH;
}

function resolveTrigger(el) {
  const selector = el.getAttribute("data-parallax-trigger");
  if (selector) {
    try {
      return el.closest(selector) || document.querySelector(selector) || fallbackTrigger(el);
    } catch {
      return fallbackTrigger(el);
    }
  }

  return fallbackTrigger(el);
}

function fallbackTrigger(el) {
  return el.closest("section") || el;
}

function teardown(el) {
  const previous = el._scrollParallax;
  previous?.scrollTrigger?.kill();
  previous?.kill();
  el._scrollParallax = null;
  gsap.set(el, { clearProps: "transform" });
}

function installResizeListener() {
  window.removeEventListener("resize", initScrollParallax._resize);
  clearTimeout(initScrollParallax._resizeTimer);

  let width = window.innerWidth;
  initScrollParallax._resize = () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;

    clearTimeout(initScrollParallax._resizeTimer);
    initScrollParallax._resizeTimer = setTimeout(initScrollParallax, 150);
  };

  window.addEventListener("resize", initScrollParallax._resize);
}

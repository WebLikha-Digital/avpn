import { Flip, gsap } from "../lib/gsap.js";

const DEFAULT_SCRUB = 0.25;
const RESIZE_DEBOUNCE = 150;

/**
 * Moves and scales one element through a series of waypoint boxes as the page
 * scrolls. Each root owns one independent target, timeline and ScrollTrigger.
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

    const lastWrapper = wrappers.at(-1);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root._flipScaleTimeline = Flip.fit(target, lastWrapper, {
        duration: 0,
        ease: "none",
      });
      return;
    }

    const scrubValue = parseFloat(root.getAttribute("data-flip-scale-scrub"));
    const scrub = Number.isFinite(scrubValue) ? scrubValue : DEFAULT_SCRUB;
    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: firstWrapper,
        start: "center center",
        endTrigger: lastWrapper,
        end: "center center",
        scrub,
      },
    });

    wrappers.slice(0, -1).forEach((wrapper, index) => {
      const nextWrapper = wrappers[index + 1];
      const duration = documentCenter(nextWrapper) - documentCenter(wrapper);

      timeline.add(
        Flip.fit(target, nextWrapper, {
          duration,
          ease: "none",
        })
      );
    });

    root._flipScaleTimeline = timeline;
  });

  installResizeListener();
}

function documentCenter(element) {
  const rect = element.getBoundingClientRect();
  return rect.top + window.pageYOffset + element.offsetHeight / 2;
}

function teardown(root) {
  const previous = root._flipScaleTimeline;
  previous?.scrollTrigger?.kill();
  previous?.kill();
  root._flipScaleTimeline = null;

  const target = root.querySelector("[data-flip-scale-target]");
  if (target) gsap.set(target, { clearProps: "transform,width,height" });
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

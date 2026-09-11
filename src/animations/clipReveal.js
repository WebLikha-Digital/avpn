import { gsap } from "../lib/gsap.js";

const DEFAULT_SCRUB = 0.25;
const DEFAULT_INSET_PERCENT = 25;
const RESIZE_DEBOUNCE = 150;
const FULL_REVEAL = "inset(0px 0px 0px 0px round 0px)";

/**
 * Reveals a sticky image frame by animating only its clip path.
 *
 * Webflow contract:
 *   [data-clip-reveal-init]   scope root; every root initializes independently
 *   [data-clip-reveal-target] element whose clip path is animated
 *   [data-clip-reveal-from]   optional box used to measure the starting inset
 *   [data-clip-reveal-scrub]  optional scrub smoothing; defaults to 0.25
 */
export function initClipReveal() {
  document.querySelectorAll("[data-clip-reveal-init]").forEach((root) => {
    teardown(root);

    const target = root.querySelector("[data-clip-reveal-target]");
    if (!target) return;

    const from = root.querySelector("[data-clip-reveal-from]");
    const startClip = from
      ? measureStartClip(target, from)
      : defaultStartClip(target);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root._clipRevealTimeline = gsap.set(target, { clipPath: FULL_REVEAL });
      return;
    }

    const scrubValue = parseFloat(root.getAttribute("data-clip-reveal-scrub"));
    const scrub = Number.isFinite(scrubValue) ? scrubValue : DEFAULT_SCRUB;
    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: root,
        start: "top top",
        end: "bottom bottom",
        scrub,
      },
    });

    timeline.fromTo(
      target,
      { clipPath: startClip },
      {
        clipPath: FULL_REVEAL,
        duration: 1,
        ease: "none",
        immediateRender: true,
      }
    );

    root._clipRevealTimeline = timeline;
  });

  installResizeListener();
}

function measureStartClip(target, from) {
  const targetRect = target.getBoundingClientRect();
  const fromRect = from.getBoundingClientRect();
  const radius = parseFloat(
    window.getComputedStyle(from).borderTopLeftRadius
  ) || 0;
  const top = Math.max(0, fromRect.top - targetRect.top);
  const right = Math.max(0, targetRect.right - fromRect.right);
  const bottom = Math.max(0, targetRect.bottom - fromRect.bottom);
  const left = Math.max(0, fromRect.left - targetRect.left);

  return insetClip(top, right, bottom, left, radius);
}

function defaultStartClip(target) {
  const rect = target.getBoundingClientRect();
  const fraction = DEFAULT_INSET_PERCENT / 100;
  return insetClip(
    rect.height * fraction,
    rect.width * fraction,
    rect.height * fraction,
    rect.width * fraction,
    0
  );
}

function insetClip(top, right, bottom, left, radius) {
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`;
}

function teardown(root) {
  const previous = root._clipRevealTimeline;
  previous?.scrollTrigger?.kill();
  previous?.kill();
  root._clipRevealTimeline = null;

  const target = root.querySelector("[data-clip-reveal-target]");
  if (target) gsap.set(target, { clearProps: "clipPath" });
}

function installResizeListener() {
  window.removeEventListener("resize", initClipReveal._resize);
  clearTimeout(initClipReveal._resizeTimer);

  let width = window.innerWidth;
  initClipReveal._resize = () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;

    clearTimeout(initClipReveal._resizeTimer);
    initClipReveal._resizeTimer = setTimeout(initClipReveal, RESIZE_DEBOUNCE);
  };

  window.addEventListener("resize", initClipReveal._resize);
}

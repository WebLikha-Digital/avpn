import { gsap } from "../lib/gsap.js";
import { bandContext } from "./horizontalScroller.js";

/**
 * Reveal the Markets Interest bars from the bottom as their left edge crosses
 * the horizontal viewport. Clipping preserves the bar labels at their natural
 * size while the CSS-owned bar height remains untouched.
 *
 * The bar height belongs to CSS. JavaScript only owns the clip path, so the
 * static chart remains usable if this bundle is absent.
 */
export function initMarketsChart() {
  document.querySelectorAll("[data-markets-init]").forEach((section) => {
    teardown(section);

    const bars = [...section.querySelectorAll("[data-markets-bar]")];
    if (bars.length === 0) return;

    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const instance = { tweens: [] };
    section._marketsChart = instance;

    if (reducedMotion) return;

    bars.forEach((bar) => {
      const band = bandContext(bar);
      const viewport = bar.closest("[data-markets-viewport]");
      const horizontal = band || (viewport
        ? { scroller: viewport, horizontal: true }
        : null);
      if (!horizontal) return;

      const tween = gsap.fromTo(
        bar,
        { clipPath: "inset(100% 0 0 0)" },
        {
          clipPath: "inset(0% 0 0 0)",
          ease: "none",
          scrollTrigger: {
            trigger: bar,
            start: "left right",
            end: "left 55%",
            scrub: true,
            ...horizontal,
          },
        },
      );
      instance.tweens.push(tween);
    });
  });
}

function teardown(section) {
  const previous = section._marketsChart;
  if (!previous) return;

  previous.tweens.forEach((tween) => {
    tween.scrollTrigger?.kill();
    tween.kill();
  });
  gsap.set(section.querySelectorAll("[data-markets-bar]"), {
    clearProps: "clipPath",
  });
  section._marketsChart = null;
}

import { DrawSVGPlugin, gsap, ScrollTrigger } from "../lib/gsap.js";
import { bandContext } from "./horizontalScroller.js";

const LINE_REVEAL_DURATION = 0.8;
const LINE_REVEAL_EASE = "power2.out";
const LINE_LOOKUP_STEPS = 200;

/**
 * Reveal the Markets Interest bars from the bottom as their left edge crosses
 * the horizontal viewport. Clipping preserves the bar labels at their natural
 * size while the CSS-owned bar height remains untouched.
 *
 * The bar height belongs to CSS. JavaScript only owns the clip path, so the
 * static chart remains usable if this bundle is absent. The companion line is
 * drawn separately from its lead and the band's horizontal scroll budget.
 */
export function initMarketsChart() {
  document.querySelectorAll("[data-markets-init]").forEach((section) => {
    teardown(section);

    const bars = [...section.querySelectorAll("[data-markets-bar]")];
    const viewport = section.querySelector("[data-markets-viewport]");
    const line = section.querySelector("[data-markets-line]");
    const path = section.querySelector("[data-markets-line-path]");
    if (bars.length === 0 && (!line || !path || !viewport)) return;

    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const instance = {
      tweens: [],
      viewport,
      line,
      path,
      lineTrigger: null,
      lineTween: null,
      lineRender: null,
      lineActive: false,
      lineMeasurements: null,
    };
    section._marketsChart = instance;

    if (!reducedMotion) {
      bars.forEach((bar) => {
        const band = bandContext(bar);
        const barViewport = bar.closest("[data-markets-viewport]");
        const horizontal = band || (barViewport
          ? { scroller: barViewport, horizontal: true }
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
    }

    initLine(instance, reducedMotion, section);
  });
}

function initLine(instance, reducedMotion, section) {
  const { line, path, viewport } = instance;
  if (!line || !path || !viewport || !bandContext(section)) return;
  if (getComputedStyle(line).display === "none") return;

  gsap.registerPlugin(DrawSVGPlugin);

  if (reducedMotion) {
    gsap.set(path, { drawSVG: "100%" });
    return;
  }

  measureLine(instance);
  gsap.set(path, { drawSVG: "0%" });

  instance.lineRender = () => renderLine(instance);
  gsap.ticker.add(instance.lineRender, false, true);
  instance.lineTrigger = ScrollTrigger.create({
    trigger: section,
    start: "top top",
    once: true,
    onEnter: () => {
      instance.lineActive = true;
      instance.lineTween = gsap.to(instance.lead, {
        value: 1,
        duration: LINE_REVEAL_DURATION,
        ease: LINE_REVEAL_EASE,
        onUpdate: instance.lineRender,
      });
    },
    onRefresh: () => measureLine(instance),
  });
}

function measureLine(instance) {
  const { line, path, viewport } = instance;
  const scale = Math.abs(path.getScreenCTM()?.a || 1);
  const localTotalLength = path.getTotalLength();
  const totalLength = localTotalLength * scale;
  const endX = path.getPointAtLength(localTotalLength).x * scale;
  const leadPx = (Number.parseFloat(line.dataset.marketsLineLead) || 900) * scale;
  const overflow = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const steps = LINE_LOOKUP_STEPS;
  const lookup = Array.from({ length: steps + 1 }, (_, index) => {
    const localLength = localTotalLength * index / steps;
    return {
      x: path.getPointAtLength(localLength).x * scale,
      length: totalLength * index / steps,
    };
  });

  instance.lead = instance.lead || { value: 0 };
  instance.lineMeasurements = {
    scale,
    totalLength,
    endX,
    leadPx,
    maxBudget: leadPx + overflow,
    lookup,
  };
}

function renderLine(instance) {
  if (!instance.lineActive || !instance.lineMeasurements) return;

  const { totalLength, endX, leadPx, maxBudget, lookup } = instance.lineMeasurements;
  const scrollLeft = Math.max(0, instance.viewport.scrollLeft);
  const scrollRange = Math.max(1, maxBudget - leadPx);
  const tipX = leadPx * instance.lead.value
    + scrollLeft * ((endX - leadPx) / scrollRange);
  const length = lengthAtX(lookup, tipX);
  const progress = totalLength ? clamp(length / totalLength, 0, 1) : 0;
  gsap.set(instance.path, { drawSVG: `${progress * 100}%` });
}

function lengthAtX(lookup, x) {
  if (x <= lookup[0].x) return 0;
  const last = lookup[lookup.length - 1];
  if (x >= last.x) return last.length;

  let low = 0;
  let high = lookup.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (lookup[middle].x <= x) low = middle;
    else high = middle;
  }
  const from = lookup[low];
  const to = lookup[high];
  const fraction = (x - from.x) / Math.max(1e-6, to.x - from.x);
  return from.length + (to.length - from.length) * fraction;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function teardown(section) {
  const previous = section._marketsChart;
  if (!previous) return;

  previous.tweens.forEach((tween) => {
    tween.scrollTrigger?.kill();
    tween.kill();
  });
  previous.lineTrigger?.kill();
  previous.lineTween?.kill();
  if (previous.lineRender) gsap.ticker.remove(previous.lineRender);
  if (previous.path) gsap.set(previous.path, { clearProps: "all" });
  gsap.set(section.querySelectorAll("[data-markets-bar]"), {
    clearProps: "clipPath",
  });
  section._marketsChart = null;
}

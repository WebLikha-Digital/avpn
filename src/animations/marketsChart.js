import { DrawSVGPlugin, gsap, ScrollTrigger } from "../lib/gsap.js";
import { bandContext } from "./horizontalScroller.js";
import {
  measureScreenPath,
  pathGeometry,
  pathGeometryChanged,
  pathScreenScale,
  restoreScreenPathVisibility,
  setScreenPathProgress,
  usesScreenPathLength,
} from "./screenPath.js";

const LINE_REVEAL_DURATION = 0.8;
const LINE_REVEAL_EASE = "power2.out";
const LINE_LOOKUP_STEPS = 200;

/**
 * Reveal the Markets Interest bars from the bottom as their left edge crosses
 * the horizontal viewport. Clipping preserves the bar labels at their natural
 * size while the CSS-owned bar height remains untouched.
 *
 * The bar height belongs to CSS. JavaScript only owns the clip path, so the
 * static chart remains usable if this bundle is absent. Bars already inside
 * the entry threshold use a one-shot reveal; later bars scrub independently.
 * The companion line is drawn separately from its lead and the band's
 * horizontal scroll budget.
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
      entryBars: [],
      entryTween: null,
      band: bandContext(section),
      section,
      bars,
    };
    section._marketsChart = instance;

    if (reducedMotion) {
      initLine(instance, true);
      return;
    }

    measureEntryBars(instance);
    initBarAnimations(instance);
    const hasLine = initLine(instance, false);
    if (hasLine || instance.entryBars.length > 0) {
      initSectionTrigger(instance);
    }
  });
}

function initBarAnimations(instance) {
  const entrySet = new Set(instance.entryBars);
  if (instance.entryBars.length) {
    gsap.set(instance.entryBars, { clipPath: "inset(100% 0 0 0)" });
  }

  instance.bars.forEach((bar) => {
    if (entrySet.has(bar)) return;

    const horizontal = instance.band || (instance.viewport
      ? { scroller: instance.viewport, horizontal: true }
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
          // clamp: the last bars never reach 55% of the viewport before the
          // band runs out of scroll, so their end is pulled back to the
          // scroller's max — every bar is complete at the band end.
          end: "clamp(left 55%)",
          scrub: true,
          ...horizontal,
        },
      },
    );
    instance.tweens.push(tween);
  });
}

function measureEntryBars(instance) {
  const { viewport, section } = instance;
  const track = section.querySelector("[data-hscroll-track]");
  if (!viewport || !track) {
    instance.entryBars = [];
    return;
  }

  // Every bar visible at scrollLeft 0 is an entry bar. A bar past the scrub
  // end (55%) but inside the viewport would otherwise sit partly revealed by
  // its scrub before the section has even entered, ahead of the entry rise.
  const trackLeft = track.getBoundingClientRect().left;
  const threshold = viewport.clientWidth;
  instance.entryBars = instance.bars.filter((bar) => (
    bar.getBoundingClientRect().left - trackLeft + viewport.scrollLeft <= threshold
  ));
}

function initLine(instance, reducedMotion) {
  const { line, path, viewport } = instance;
  if (!line || !path || !viewport || !instance.band) return false;
  if (getComputedStyle(line).display === "none") return false;

  gsap.registerPlugin(DrawSVGPlugin);

  if (reducedMotion) {
    measureLine(instance);
    setLineProgress(instance, 1);
    return true;
  }

  measureLine(instance);
  setLineProgress(instance, 0);

  instance.lineRender = () => renderLine(instance);
  gsap.ticker.add(instance.lineRender, false, true);
  return true;
}

function initSectionTrigger(instance) {
  instance.lineTrigger = ScrollTrigger.create({
    trigger: instance.section,
    start: instance.band ? "top top" : "top 80%",
    once: true,
    onEnter: () => {
      instance.lineActive = true;
      if (instance.lineRender) {
        instance.lineTween = gsap.to(instance.lead, {
          value: 1,
          duration: LINE_REVEAL_DURATION,
          ease: LINE_REVEAL_EASE,
          onUpdate: instance.lineRender,
        });
      }
      if (instance.entryBars.length) {
        instance.entryTween = gsap.to(instance.entryBars, {
          clipPath: "inset(0% 0 0 0)",
          duration: LINE_REVEAL_DURATION,
          ease: "expo.out",
          stagger: 0.08,
        });
      }
    },
    // Entry bars are classified once at init: their scrub triggers are
    // already built (or deliberately absent), so a refresh must not move a bar
    // between the two mechanisms. A width change rebuilds the whole component.
    onRefresh: () => {
      if (instance.lineRender) measureLine(instance);
    },
  });
}

function measureLine(instance) {
  const { line, path, viewport } = instance;
  const previous = instance.lineMeasurements;
  const geometry = pathGeometry(path);
  const screenPath = previous?.screenPath ?? usesScreenPathLength(path);
  const overflow = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  if (previous
    && !pathGeometryChanged(path, previous)
    && previous.screenPath === screenPath) {
    previous.maxBudget = previous.leadPx + overflow;
    return;
  }
  const scale = pathScreenScale(path);
  const localTotalLength = geometry.localLength;
  const screenMeasurement = screenPath ? measureScreenPath(path) : null;
  const totalLength = screenPath
    ? screenMeasurement.screenLength
    : localTotalLength * scale;
  const firstPoint = screenMeasurement?.points[0];
  const endPoint = screenMeasurement?.points.at(-1);
  const endX = screenPath
    ? endPoint.x - firstPoint.x
    : path.getPointAtLength(localTotalLength).x * scale;
  const leadPx = (Number.parseFloat(line.dataset.marketsLineLead) || 900) * scale;
  const steps = LINE_LOOKUP_STEPS;
  const lookup = Array.from({ length: steps + 1 }, (_, index) => {
    const localLength = localTotalLength * index / steps;
    if (!screenPath) {
      return {
        x: path.getPointAtLength(localLength).x * scale,
        length: totalLength * index / steps,
      };
    }
    const sample = screenMeasurement.points[
      Math.round(index * (screenMeasurement.points.length - 1) / steps)
    ];
    return { x: sample.x - firstPoint.x, length: sample.screenLength };
  });

  instance.lead = instance.lead || { value: 0 };
  instance.lineMeasurements = {
    scale,
    totalLength,
    endX,
    leadPx,
    maxBudget: leadPx + overflow,
    lookup,
    screenMeasurement,
    screenPath,
    localLength: geometry.localLength,
    scaleX: geometry.scaleX,
    scaleY: geometry.scaleY,
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
  setLineProgress(instance, progress);
}

function setLineProgress(instance, progress) {
  const visibility = progress <= 0 ? "hidden" : "visible";
  if (instance.path.style.visibility !== visibility) {
    instance.path.style.visibility = visibility;
  }
  if (instance.lineMeasurements?.screenPath) {
    setScreenPathProgress(instance.path, progress, instance.lineMeasurements?.screenMeasurement);
  } else {
    gsap.set(instance.path, { drawSVG: `${progress * 100}%` });
  }
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
  previous.entryTween?.kill();
  if (previous.lineRender) gsap.ticker.remove(previous.lineRender);
  if (previous.path) {
    restoreScreenPathVisibility(previous.path);
    gsap.set(previous.path, { clearProps: "all" });
  }
  gsap.set(section.querySelectorAll("[data-markets-bar]"), {
    clearProps: "clipPath",
  });
  section._marketsChart = null;
}

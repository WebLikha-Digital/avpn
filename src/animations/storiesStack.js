import { gsap } from "../lib/gsap.js";

// Where the reveal fires, in ScrollTrigger's "<triggerPoint> <viewportPoint>"
// syntax. Wrapped in clamp() so the start can't resolve above the top of the
// page — otherwise a row near the top would play part-finished on load.
// Overridable per instance with [data-stories-start].
const DEFAULT_START = "clamp(top 80%)";

// One row's three parts arrive in reading order, a tenth of a second apart.
// Small enough to read as one movement, large enough that the eye follows the
// heading down to the copy rather than taking the row in all at once.
const DURATION = 0.8;
const STAGGER = 0.1;
const RISE = 40;
const DEFAULT_PIN_OFFSET = 0;
const DEFAULT_HEADING_SCALE = 0.5;
const DEFAULT_SHAPE_SCALE = 0.5;
const DEFAULT_BODY_SCALE = 0.75;

/**
 * The Stories from AVPN Community list: each row's heading, shape and copy
 * fade up into place as that row scrolls into view. On desktop, each row also
 * pins while its bottom runway passes and its heading, decorative shape, and
 * copy recede in sync with the pin's scroll progress.
 *
 * Per row rather than one timeline for the whole list, so a row that is still
 * below the fold when the section enters keeps its own entrance instead of
 * having played it off-screen.
 *
 * gsap.from() is deliberate, matching splitReveal: the resting CSS state is
 * *visible*, and GSAP moves the parts to the hidden state at init. If the
 * bundle ever fails to load, the section renders as plain static content
 * instead of being stranded at opacity 0.
 *
 * Webflow contract:
 *   [data-stories-init]       the list wrapping every row
 *   [data-stories-item]       one row — the scroll trigger
 *   [data-stories-part]       optional: an explicit part to stagger
 *   [data-stories-start]      optional: override the trigger point
 *   [data-stories-pin]        optional: "off" disables desktop pins/scaling
 *   [data-stories-pin-offset] optional: top pin offset in pixels (default 0)
 *   [data-stories-pin-gap]    optional: release gap in pixels (default row padding-top)
 *   [data-stories-heading-scale] optional: heading scale at the end (default 0.5)
 *   [data-stories-shape-scale] optional: shape scale at the end (default 0.5)
 *   [data-stories-body-scale] optional: paragraph scale at the end (default 0.75)
 *
 * [data-stories-part] is optional because the row's own structure already says
 * what the parts are: the heading, the shape, and the paragraph. Tag them only
 * when a row's markup stops matching that.
 */
export function initStoriesStack() {
  initStoriesStack._mm?.revert();
  initStoriesStack._mm = null;

  const lists = [...document.querySelectorAll("[data-stories-init]")];
  lists.forEach((list) => {
    // Idempotent re-init: kill the previous tweens and clear the properties
    // they wrote, so a re-run starts from the CSS state rather than mid-fade.
    teardown(list);

    const start = list.getAttribute("data-stories-start") || DEFAULT_START;

    list._storiesTweens = [...list.querySelectorAll("[data-stories-item]")].map(
      (item) => {
        const parts = resolveParts(item);
        if (!parts.length) return null;

        return gsap.from(parts, {
          opacity: 0,
          y: RISE,
          duration: DURATION,
          stagger: STAGGER,
          ease: "power2.out",
          scrollTrigger: { trigger: item, start, once: true },
        });
      }
    ).filter(Boolean);
  });

  const mm = gsap.matchMedia();
  initStoriesStack._mm = mm;
  mm.add(
    {
      isDesktop: "(min-width: 992px)",
      reduceMotion: "(prefers-reduced-motion: reduce)",
    },
    (context) => {
      if (!context.conditions.isDesktop || context.conditions.reduceMotion) return;

      lists.forEach((list) => {
        if (list.getAttribute("data-stories-pin") === "off") return;

        const offset = readNumber(list, "data-stories-pin-offset", DEFAULT_PIN_OFFSET);
        const pinGap = readNumber(list, "data-stories-pin-gap", null);
        const scales = {
          heading: readNumber(list, "data-stories-heading-scale", DEFAULT_HEADING_SCALE),
          shape: readNumber(list, "data-stories-shape-scale", DEFAULT_SHAPE_SCALE),
          body: readNumber(list, "data-stories-body-scale", DEFAULT_BODY_SCALE),
        };
        const items = [...list.querySelectorAll("[data-stories-item]")];
        items.forEach((item, index) => {
          item.style.zIndex = String(index + 1);
        });

        list._storiesPinTweens = items.map((item, index) => {
          const parts = resolveScaleParts(item);
          const trigger = {
            trigger: item,
            start: `top ${offset}px`,
            end: () => `+=${getPinDistance(item, scales, pinGap, items[index + 1])}`,
            pin: true,
            pinSpacing: false,
            scrub: true,
            invalidateOnRefresh: true,
          };

          const timeline = gsap.timeline({ scrollTrigger: trigger });
          [
            [parts.heading, scales.heading],
            [parts.shape, scales.shape],
            [parts.body, scales.body],
          ].forEach(([part, scale]) => {
            if (!part) return;
            gsap.set(part, { transformOrigin: "left top" });
            timeline.fromTo(
              part,
              { scale: 1 },
              { scale, duration: 1, ease: "none", immediateRender: false },
              0,
            );
          });
          return timeline;
        });
      });

      return () => lists.forEach(teardownPins);
    },
  );
}

function readNumber(list, attribute, fallback) {
  const value = Number.parseFloat(list.getAttribute(attribute));
  return Number.isFinite(value) ? value : fallback;
}

// Pin until scaled content ends, leaving the configured gap below it; layout
// offsets ignore entrance/pin transforms.
function getPinDistance(item, scales, configuredGap, nextItem) {
  const content = item.querySelector(".stories-community_item-inner") || item.firstElementChild;
  if (!content || !item.offsetHeight) return 0;

  const scaleParts = resolveScaleParts(item);
  const scaled = Object.entries(scales)
    .map(([name, scale]) => [scaleParts[name], scale])
    .filter(([part]) => part);
  let contentBottom = 0;

  scaled.forEach(([part, scale]) => {
    contentBottom = Math.max(contentBottom, getLayoutTop(item, part) + part.offsetHeight * scale);
  });
  content.querySelectorAll("*").forEach((element) => {
    if (scaled.some(([part]) => part === element || part.contains(element))) return;
    if (scaled.some(([part]) => element.contains(part))) return;
    contentBottom = Math.max(contentBottom, getLayoutTop(item, element) + element.offsetHeight);
  });

  const gap = Number.isFinite(configuredGap)
    ? configuredGap
    : Number.parseFloat(getComputedStyle(nextItem || item).paddingTop) || 0;
  return Math.max(0, item.offsetHeight - contentBottom - gap);
}

function getLayoutTop(item, element) {
  const elementPath = getOffsetPath(element);
  const itemPath = getOffsetPath(item);
  const common = elementPath.find((ancestor) => itemPath.includes(ancestor));
  if (!common) return element.offsetTop - item.offsetTop;

  const sumBefore = (path) => path.slice(0, path.indexOf(common))
    .reduce((total, node) => total + node.offsetTop, 0);
  return sumBefore(elementPath) - sumBefore(itemPath);
}

function getOffsetPath(element) {
  const path = [];
  for (let node = element; node; node = node.offsetParent) path.push(node);
  return path;
}

// The tagged parts if the markup has them, else the row's own three pieces in
// reading order. Filters out anything missing so a row without a shape still
// animates its heading and copy.
function resolveParts(item) {
  const tagged = item.querySelectorAll("[data-stories-part]");
  if (tagged.length) return [...tagged];

  return [
    item.querySelector("h1, h2, h3, h4, h5, h6"),
    item.querySelector(".stories-community_shape"),
    item.querySelector("p"),
  ].filter(Boolean);
}

function teardown(list) {
  teardownPins(list);

  list._storiesTweens?.forEach((tween) => {
    tween.scrollTrigger?.kill();
    tween.kill();
  });
  list._storiesTweens = null;

  list.querySelectorAll("[data-stories-item]").forEach((item) => {
    gsap.set(resolveParts(item), { clearProps: "opacity,transform,transformOrigin,scale" });
    item.style.zIndex = "";
  });
}

function teardownPins(list) {
  list._storiesPinTweens?.forEach((tween) => {
    tween.scrollTrigger?.kill();
    tween.kill();
  });
  list._storiesPinTweens = null;

  list.querySelectorAll("[data-stories-item]").forEach((item) => {
    item.style.zIndex = "";
    gsap.set(resolveParts(item), { clearProps: "transform,transformOrigin,scale" });
  });
}

function resolveScaleParts(item) {
  const parts = resolveParts(item);
  const tagged = item.querySelectorAll("[data-stories-part]");
  if (tagged.length) {
    const [heading, shape, body] = parts;
    return { heading, shape, body };
  }

  return {
    heading: item.querySelector("h1, h2, h3, h4, h5, h6"),
    shape: item.querySelector(".stories-community_shape"),
    body: item.querySelector("p"),
  };
}

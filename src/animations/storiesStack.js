import { gsap } from "../lib/gsap.js";

// Where the reveal fires, in ScrollTrigger's "<triggerPoint> <viewportPoint>"
// syntax. Wrapped in clamp() so the start can't resolve above the top of the
// page — otherwise a row near the top would play part-finished on load.
// Overridable per instance with [data-stories-start].
const DEFAULT_START = "clamp(top 80%)";
const DEFAULT_SCALE_HEADING = 0.5;
const DEFAULT_SCALE_BODY = 0.75;

// One row's three parts arrive in reading order, a tenth of a second apart.
// Small enough to read as one movement, large enough that the eye follows the
// heading down to the copy rather than taking the row in all at once.
const DURATION = 0.8;
const STAGGER = 0.1;
const RISE = 40;

/**
 * The Stories from AVPN Community list: each row's heading, shape and copy
 * fade up into place as that row scrolls into view.
 *
 * Per row rather than one timeline for the whole list, so a row that is still
 * below the fold when the section enters keeps its own entrance instead of
 * having played it off-screen.
 *
 * The entrance uses gsap.from() on per-part state objects rather than DOM
 * elements. The resting CSS state remains visible, and if the bundle ever
 * fails to load the section renders as plain static content instead of being
 * stranded at opacity 0.
 *
 * Webflow contract:
 *   [data-stories-init]       the list wrapping every row
 *   [data-stories-item]       one row — the scroll trigger
 *   [data-stories-part]       optional: an explicit part to stagger
 *   [data-stories-start]      optional: override the trigger point
 *   [data-stories-scale]      optional: "off" disables the desktop recede
 *   [data-stories-scale-heading] optional: numeric heading/shape target scale
 *   [data-stories-scale-body] optional: numeric paragraph target scale
 *
 * [data-stories-part] is optional because the row's own structure already says
 * what the parts are: the heading, the shape, and the paragraph. Tag them only
 * when a row's markup stops matching that.
 */
export function initStoriesStack() {
  initStoriesStack._mm?.revert();

  const lists = [...document.querySelectorAll("[data-stories-init]")];
  lists.forEach((list) => {
    // Idempotent re-init: kill the previous tweens and clear the properties
    // they wrote, so a re-run starts from the CSS state rather than mid-fade.
    teardown(list);

    const start = list.getAttribute("data-stories-start") || DEFAULT_START;

    list._storiesTweens = [...list.querySelectorAll("[data-stories-item]")].map((item) => {
      const parts = resolveParts(item);
      if (!parts.length) return null;

      const states = parts.map((element) => ({
        element,
        opacity: 1,
        translate: 0,
        scale: 1,
      }));
      states.forEach((state) => {
        state.element._storiesPartState = state;
      });
      states.forEach(writePartState);

      // GSAP owns opacity only. Keeping translate and scale in state objects
      // means GSAP never parses a part's transform and cannot reset either
      // individual CSS transform property while the entrance is initializing.
      return gsap.from(states, {
        opacity: 0,
        duration: DURATION,
        stagger: STAGGER,
        ease: "power2.out",
        onUpdate: () => {
          states.forEach((state) => {
            state.translate = RISE * (1 - state.opacity);
            writePartState(state);
          });
        },
        scrollTrigger: { trigger: item, start, once: true },
      });
    }).filter(Boolean);
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
        if (list.getAttribute("data-stories-scale") === "off") return;

        const headingScale = readScale(list, "data-stories-scale-heading", DEFAULT_SCALE_HEADING);
        const bodyScale = readScale(list, "data-stories-scale-body", DEFAULT_SCALE_BODY);

        list._storiesScaleTweens = [...list.querySelectorAll("[data-stories-item]")]
          .map((item) => {
            const [heading, shape, paragraph] = resolveParts(item);
            const headingTargets = [heading, shape].filter(Boolean);
            const tweens = [];

            // The entrance starts at clamp(top 80%), while this range starts at
            // top top. A fast scroll can still have a part's staggered entrance
            // running after its recede begins, so both write the same per-part
            // state object and never a GSAP transform: GSAP's _parseTransform
            // folds the CSS `scale` property into `transform` and sets it to
            // "none" whenever it parses an element, which is what reset the
            // recede to 1 mid-scroll in the first version of this component.
            if (headingTargets.length) {
              tweens.push(createScaleTween(item, headingTargets, headingScale));
            }
            if (paragraph) {
              tweens.push(createScaleTween(item, [paragraph], bodyScale));
            }
            return tweens;
          })
          .flat();
      });

      return () => {
        lists.forEach((list) => teardownScale(list));
      };
    },
  );
}

function readScale(list, attribute, fallback) {
  const value = Number.parseFloat(list.getAttribute(attribute));
  return Number.isFinite(value) ? value : fallback;
}

function createScaleTween(item, targets, scale) {
  const proxy = { scale: 1 };
  const states = targets.map((element) => element._storiesPartState || {
    element,
    opacity: 1,
    translate: 0,
    scale: 1,
  });
  targets.forEach((target) => {
    target.style.transformOrigin = "left top";
  });

  return gsap.to(proxy, {
    scale,
    ease: "none",
    lazy: false,
    onUpdate: () => {
      states.forEach((state) => {
        state.scale = proxy.scale;
        writePartState(state);
      });
    },
    scrollTrigger: {
      trigger: item,
      start: "top top",
      end: "bottom top",
      scrub: true,
    },
  });
}

function writePartState(state) {
  state.element.style.opacity = String(state.opacity);
  state.element.style.translate = `${state.translate}px`;
  state.element.style.scale = String(state.scale);
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
  teardownScale(list);

  list._storiesTweens?.forEach((tween) => {
    tween.scrollTrigger?.kill();
    tween.kill();
  });
  list._storiesTweens = null;

  list.querySelectorAll("[data-stories-item]").forEach((item) => {
    resolveParts(item).forEach((target) => {
      target.style.opacity = "";
      target.style.translate = "";
      target.style.scale = "";
      target.style.transformOrigin = "";
      target.style.transform = "";
      delete target._storiesPartState;
    });
    // Left over from the previous pinned-stack version of this component; a
    // page cached mid-rollout can still have it on the row.
    item.style.zIndex = "";
  });
}

function teardownScale(list) {
  list._storiesScaleTweens?.forEach((tween) => {
    tween.scrollTrigger?.kill();
    tween.kill();
  });
  list._storiesScaleTweens = null;

  list.querySelectorAll("[data-stories-item]").forEach((item) => {
    const [heading, shape, paragraph] = resolveParts(item);
    [heading, shape, paragraph].filter(Boolean).forEach((target) => {
      // No GSAP transform tween touches these parts. Clear individual state
      // properties directly, plus any legacy combined transform from an older
      // bundle, so breakpoint teardown cannot leave a stale recede behind.
      target.style.translate = "";
      target.style.scale = "";
      target.style.transformOrigin = "";
      target.style.transform = "";
      target.style.opacity = "";
      delete target._storiesPartState;
    });
  });
}

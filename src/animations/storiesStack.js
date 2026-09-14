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

/**
 * The Stories from AVPN Community list: each row's heading, shape and copy
 * fade up into place as that row scrolls into view.
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
 *
 * [data-stories-part] is optional because the row's own structure already says
 * what the parts are: the heading, the shape, and the paragraph. Tag them only
 * when a row's markup stops matching that.
 */
export function initStoriesStack() {
  document.querySelectorAll("[data-stories-init]").forEach((list) => {
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
  list._storiesTweens?.forEach((tween) => {
    tween.scrollTrigger?.kill();
    tween.kill();
  });
  list._storiesTweens = null;

  list.querySelectorAll("[data-stories-item]").forEach((item) => {
    gsap.set(resolveParts(item), { clearProps: "opacity,transform" });
    // Left over from the previous pinned-stack version of this component; a
    // page cached mid-rollout can still have it on the row.
    item.style.zIndex = "";
  });
}

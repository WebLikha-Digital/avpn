import { gsap, SplitText } from "../lib/gsap.js";
import {
  bandContext,
  verticalScrollPosition,
} from "./horizontalScroller.js";

// Per split-type timing. Finer splits get shorter, tighter staggers so a long
// string doesn't take forever to finish arriving.
const SPLIT_CONFIG = {
  lines: { duration: 0.8, stagger: 0.08 },
  words: { duration: 0.6, stagger: 0.06 },
  chars: { duration: 0.4, stagger: 0.01 },
};

// Only split as far as the animation actually needs — every level adds DOM nodes.
const TYPES_TO_SPLIT = {
  lines: ["lines"],
  words: ["lines", "words"],
  chars: ["lines", "words", "chars"],
};

/**
 * Masked scroll reveal: splits [data-split="heading"] text and slides each
 * piece up from behind a per-line mask as it scrolls into view.
 *
 * [data-split-reveal] picks the granularity — "lines" (default), "words" or
 * "chars".
 *
 * [data-split-start] sets when it fires, in ScrollTrigger's
 * "<triggerPoint> <viewportPoint>" syntax — e.g. "bottom 50%" (trigger's
 * bottom edge reaches the middle of the viewport), "top 60%", "center center".
 * Defaults to "clamp(top 80%)". Wrapping in clamp() keeps the start from
 * resolving above the top of the page, which would otherwise let the tween
 * fire part-finished on load; pass a bare value to opt out of that.
 *
 * [data-split-trigger] takes a CSS selector for a different element to
 * measure against (the nearest matching ancestor, else the first match on the
 * page). Useful when the text itself sits in a sticky or transformed wrapper,
 * where its own position is a poor scroll reference.
 *
 * [data-split-once] — "false" replays the reveal every time it re-enters.
 *
 * [data-split-opacity] — "true" scrubs each split target from its normal
 * opacity to zero as the section leaves view. This is opt-in so instances that
 * only need the vertical reveal are unchanged.
 *
 * Uses ScrollTrigger rather than an IntersectionObserver on purpose. A masked
 * element cannot observe itself: IntersectionObserver clips its intersection
 * rect against ancestors' `overflow` AND `clip-path`, so a line parked outside
 * its own mask reports a ratio of 0 forever and never reveals. ScrollTrigger
 * works off scroll offsets and measured bounds, so masking is irrelevant to it.
 *
 * Animating with gsap.from() is also deliberate: the element's resting CSS
 * state is *visible*, and GSAP moves it to the hidden state at init. If the
 * bundle ever fails to load, the text simply sits there unanimated instead of
 * being stranded invisible behind its mask.
 */
export function initSplitReveal() {
  const headings = document.querySelectorAll('[data-split="heading"]');

  headings.forEach((heading) => {
    bindEcosystemTabReplay(heading);
    bindEcosystemFoldersReplay(heading);
    if (heading.closest("[data-tabs-panel]")?.hidden) {
      cleanupSplit(heading);
      return;
    }
    const deck = heading.closest("[data-deck-init]");
    if (deck && (deck.hidden || deck.dataset.deckState !== "stacked")) {
      cleanupSplit(heading);
      return;
    }

    setupSplit(heading);
  });
}

function setupSplit(heading, replay = false) {
  cleanupSplit(heading);
  // A replay can only be asked for by the folder decks, whose intros may still
  // be display:none; do not split a zero-size element. Initial setup keeps
  // splitting regardless so headings hidden at load reveal when they appear.
  if (replay && (heading.hidden || !heading.getClientRects().length)) return;

  const type = heading.getAttribute("data-split-reveal") || "lines";
  const typesToSplit = TYPES_TO_SPLIT[type] || TYPES_TO_SPLIT.lines;
  const config = SPLIT_CONFIG[type] || SPLIT_CONFIG.lines;
  // Inside a horizontal band the heading never moves vertically, so the
  // default has to swap axis with it. An authored start still wins, and has
  // to be written in the band's axis when there is one.
  const band = bandContext(heading);
  const authoredStart = heading.getAttribute("data-split-start");
  const start = authoredStart
    ? band
      ? authoredStart
      : verticalScrollPosition(authoredStart)
    : band
      ? "clamp(left 80%)"
      : "clamp(top 80%)";
  const once = heading.getAttribute("data-split-once") !== "false";
  const parsedDelay = Number.parseFloat(
    heading.getAttribute("data-split-delay"),
  );
  const delay = Number.isFinite(parsedDelay) ? parsedDelay : 0;
  const animateOpacity = heading.getAttribute("data-split-opacity") === "true";
  const trigger = resolveTrigger(heading);

  heading._splitInstance = SplitText.create(heading, {
    type: typesToSplit.join(", "),
    mask: "lines",
    autoSplit: true,
    linesClass: "line",
    wordsClass: "word",
    charsClass: "letter",
    onSplit(instance) {
      const targets = instance[type] || instance.lines;

      if (animateOpacity && !replay) {
        heading._splitOpacityTween = gsap.to(targets, {
          opacity: 0,
          ease: "none",
          scrollTrigger: {
            trigger,
            start: band ? "left 20%" : "top 20%",
            end: band ? "right 20%" : "bottom 20%",
            scrub: true,
            ...band,
          },
        });
      }

      heading._splitTween = gsap.from(targets, {
        yPercent: 120,
        duration: config.duration,
        stagger: config.stagger,
        delay,
        ease: "smooth",
        ...(replay ? {} : {
          scrollTrigger: {
            trigger,
            start,
            once,
            ...band,
          },
        }),
      });

      return heading._splitTween;
    },
  });
}

function cleanupSplit(heading) {
  heading._splitTween?.scrollTrigger?.kill();
  heading._splitTween?.kill();
  heading._splitTween = null;
  heading._splitOpacityTween?.scrollTrigger?.kill();
  heading._splitOpacityTween?.kill();
  heading._splitOpacityTween = null;
  heading._splitInstance?.revert();
  heading._splitInstance = null;
}

function bindEcosystemTabReplay(heading) {
  const panel = heading.closest("[data-tabs-panel]");
  const root = panel?.closest("[data-tabs-init]");
  if (!panel || !root || root._splitRevealTabListener) return;

  root._splitRevealTabListener = (event) => {
    const activePanel = [...root.querySelectorAll("[data-tabs-panel]")]
      .find((candidate) => candidate.dataset.tabsPanel === event.detail?.id);
    if (!activePanel || activePanel.hidden) return;

    activePanel.querySelectorAll('[data-split="heading"]').forEach((target) => {
      setupSplit(target, true);
    });
  };
  root.addEventListener("ecosystemtabs:change", root._splitRevealTabListener);
}

function bindEcosystemFoldersReplay(heading) {
  const group = heading.closest("[data-folders-init]");
  if (!group || group._splitRevealFoldersListener) return;

  group._splitRevealFoldersListener = () => {
    group.querySelectorAll('[data-split="heading"]').forEach((target) => {
      const deck = target.closest("[data-deck-init]");
      if (deck?.hidden) return;
      setupSplit(target, true);
    });
  };
  group.addEventListener("ecosystemfolders:collapsed", group._splitRevealFoldersListener);
}

/**
 * [data-split-trigger] selector → nearest matching ancestor, else the first
 * match on the page. Falls back to the heading itself when unset or unmatched,
 * so a typo degrades to the default rather than breaking the reveal.
 */
function resolveTrigger(heading) {
  const selector = heading.getAttribute("data-split-trigger");
  if (!selector) return heading;

  return heading.closest(selector) || document.querySelector(selector) || heading;
}
